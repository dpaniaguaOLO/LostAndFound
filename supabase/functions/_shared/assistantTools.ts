/**
 * Herramientas de consulta de Olivia (function calling, SOLO LECTURA).
 *
 * El LLM decide qué consultar, pero quien ejecuta es el servidor: cada
 * herramienta valida sus argumentos (son datos no confiables que propone el
 * modelo) y aplica las MISMAS reglas de visibilidad que la RLS, porque aquí se
 * consulta con service_role:
 *   - Encontrados ARCHIVED y perdidos CLOSED: solo su autor o un admin.
 *   - Reclamaciones: las hechas por el usuario y las recibidas sobre sus objetos
 *     (la bandeja global, solo admin).
 *   - Notificaciones: solo las propias. Historial de auditoría: solo admin.
 *   - Juego (puntos, ranking, perfiles de otros): lo mismo que la app muestra a
 *     cualquier colaborador activo en el ranking y los perfiles.
 *   - Nunca se devuelven número de colaborador, correo, fotos ni firmas visuales.
 * Ninguna herramienta escribe nada.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.118.0';
import type { Caller } from './http.ts';
import { matchItems, type MatchableItem } from './matching.ts';
import { tokenize } from './nlp.ts';
import { parseSignature } from './visual.ts';
import { addDays, dateInAppTz, startOfDayInAppTz } from './time.ts';
import {
  BADGE_FRAMES,
  BADGES,
  badgeProgress,
  LEADERBOARD_MAX,
  nextRank,
  type PlayerStats,
  POINT_RULES,
  rankFor,
  RANKS,
  rankUnlocks,
  TOP_PLAYERS,
  ULTIMATE_BADGE,
} from './game.ts';

type Row = Record<string, unknown>;
export type ItemKind = 'found' | 'lost';

export interface ToolContext {
  sb: SupabaseClient;
  caller: Caller;
  /** Objetos que el usuario puede ver y que aparecieron en esta conversación (para las tarjetas). */
  seen: Map<string, ItemKind>;
}

const REPORTER_SELECT = '*, reporter:profiles!reporter_id (id, name)';
const CATEGORIES = ['ELECTRONICS', 'CLOTHING', 'ACCESSORIES', 'DOCUMENTS', 'KEYS', 'BAGS', 'WALLET', 'JEWELRY', 'OTHER'];
const FOUND_STATUSES = ['PUBLISHED', 'CLAIMED', 'RETURNED', 'ARCHIVED'];
const LOST_STATUSES = ['OPEN', 'MATCHED', 'RESOLVED', 'CLOSED'];
const CLAIM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
// Estados de moderación: solo los ven su autor y los admins.
const HIDDEN = new Set(['ARCHIVED', 'CLOSED']);
const MAX_CANDIDATES = 300;
const MAX_RESULTS = 20;
const MAX_TEXT = 160;

// Mismo saneado que en llm.ts: el texto de los usuarios no debe llevar enlaces ni correos al modelo.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
function clean(text: unknown, max = MAX_TEXT): string {
  return String(text ?? '').slice(0, max).replace(URL_RE, '[enlace]').replace(EMAIL_RE, '[correo]');
}

// --- Definiciones (formato OpenAI "tools") -----------------------------------

const DATE_PARAM = { type: 'string', description: 'Fecha YYYY-MM-DD (inclusive).' };

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'buscar_objetos',
      description:
        'Busca y cuenta objetos encontrados o reportes de objetos perdidos con filtros. Devuelve "total" (cuántos cumplen los filtros) y hasta "limite" objetos. ' +
        'Úsala para cualquier pregunta sobre objetos: qué hay, cuántos, cuáles se devolvieron, los míos, los de un lugar, fecha o categoría.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['encontrado', 'perdido'] },
          estados: {
            type: 'array',
            items: { type: 'string', enum: [...FOUND_STATUSES, ...LOST_STATUSES] },
            description:
              'Encontrados: PUBLISHED (disponible), CLAIMED (reclamación aprobada, pendiente de entrega), RETURNED (devuelto a su dueño), ARCHIVED (retirado por un admin). ' +
              'Perdidos: OPEN (buscándose), MATCHED (con reclamación aprobada), RESOLVED (recuperado), CLOSED (cerrado por un admin). ' +
              'Si se omite: encontrados PUBLISHED+CLAIMED, perdidos OPEN+MATCHED (lo que se ve en el muro).',
          },
          categorias: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
          ubicacion: { type: 'string', description: 'Texto contenido en la ubicación (p. ej. "cafetería").' },
          texto: { type: 'string', description: 'Palabras a buscar en título y descripción (p. ej. "llaves rojas").' },
          fecha: {
            type: 'string',
            enum: ['suceso', 'publicacion', 'devolucion'],
            description:
              'A qué fecha se aplican desde/hasta: suceso = cuándo se encontró/perdió (por defecto); publicacion = cuándo se publicó en la app; devolucion = cuándo se entregó (solo encontrados RETURNED).',
          },
          desde: DATE_PARAM,
          hasta: DATE_PARAM,
          solo_mios: { type: 'boolean', description: 'Solo publicaciones del usuario que pregunta.' },
          limite: { type: 'integer', minimum: 1, maximum: MAX_RESULTS },
        },
        required: ['tipo'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen',
      description:
        'Estadísticas generales: cuántos objetos encontrados y perdidos hay por estado y, si se da un rango, cuántos se publicaron, devolvieron y recuperaron en él. Para admins incluye usuarios y reclamaciones pendientes.',
      parameters: {
        type: 'object',
        properties: { desde: DATE_PARAM, hasta: DATE_PARAM },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reclamaciones',
      description:
        'Reclamaciones del usuario: "hechas" (las que él envió), "recibidas" (sobre objetos que él publicó) o "todas" (bandeja global, solo admin).',
      parameters: {
        type: 'object',
        properties: {
          ambito: { type: 'string', enum: ['hechas', 'recibidas', 'todas'] },
          estados: { type: 'array', items: { type: 'string', enum: CLAIM_STATUSES } },
        },
        required: ['ambito'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notificaciones',
      description: 'Últimas notificaciones del usuario (avisos de reclamaciones, coincidencias, entregas).',
      parameters: {
        type: 'object',
        properties: { solo_no_leidas: { type: 'boolean' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'coincidencias',
      description:
        'Objetos encontrados que podrían corresponder a un reporte de objeto perdido del usuario (por descripción, categoría, lugar, fecha y foto). Requiere el id del reporte, obtenido antes con buscar_objetos.',
      parameters: {
        type: 'object',
        properties: { reporte_id: { type: 'string' } },
        required: ['reporte_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mi_juego',
      description:
        'Puntos, rango y progreso del USUARIO que pregunta: puntos, puesto en el ranking, rango actual, siguiente rango y cuántos puntos le faltan, ' +
        'quién está justo por encima y la diferencia, si está en el top 3, si es Leyenda de OLO, estadísticas e insignias (nivel y lo que falta para el siguiente).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ranking_juego',
      description: 'Ranking global por puntos: los primeros puestos (nombre, puntos, rango) y la posición del usuario que pregunta.',
      parameters: {
        type: 'object',
        properties: { limite: { type: 'integer', minimum: 1, maximum: 30, description: 'Cuántos puestos (por defecto 10).' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jugador',
      description: 'Puntos, puesto, rango e insignias de otro colaborador, buscándolo por su nombre (es lo mismo que muestra su perfil en la app).',
      parameters: {
        type: 'object',
        properties: { nombre: { type: 'string', description: 'Nombre o parte del nombre.' } },
        required: ['nombre'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reglas_juego',
      description:
        'Reglas del sistema de puntos: cómo se ganan puntos, todos los rangos (puntos necesarios y qué desbloquean), el catálogo de insignias con sus niveles, ' +
        'la insignia Leyenda de OLO, las ventajas del top 3 y los emblemas junto al nombre.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'historial',
      description:
        'Solo administradores: historial de auditoría (quién publicó, editó, archivó, eliminó, devolvió o restauró algo y cuándo).',
      parameters: {
        type: 'object',
        properties: { desde: DATE_PARAM, hasta: DATE_PARAM, limite: { type: 'integer', minimum: 1, maximum: 30 } },
        additionalProperties: false,
      },
    },
  },
];

// --- Validación de argumentos -------------------------------------------------

function str(v: unknown, max = 80): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function strList(v: unknown, allowed: string[]): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))] : [];
}
function int(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.trunc(v) : def;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
/** Rango [desde, hasta] de días (YYYY-MM-DD) a instantes [gte, lt). */
function range(args: Row): { gte: string | null; lt: string | null } {
  const desde = str(args.desde, 10);
  const hasta = str(args.hasta, 10);
  const gte = desde ? startOfDayInAppTz(desde) : null;
  const lt = hasta ? startOfDayInAppTz(addDays(hasta, 1)) : null;
  return { gte: gte?.toISOString() ?? null, lt: lt?.toISOString() ?? null };
}
const day = (v: unknown) => (v ? dateInAppTz(String(v)) : null);
const isAdmin = (ctx: ToolContext) => ctx.caller.role === 'ADMIN';
/** ¿Puede el usuario ver esta fila? (mismas reglas que la RLS de lectura) */
export function canSee(ctx: ToolContext, r: Row): boolean {
  return !HIDDEN.has(r.status as string) || isAdmin(ctx) || r.reporter_id === ctx.caller.id;
}
/** Quita comodines de LIKE de un texto libre. */
const likeSafe = (s: string) => s.replace(/[%_\\]/g, ' ').trim();

// --- Herramientas -------------------------------------------------------------

async function buscarObjetos(ctx: ToolContext, args: Row) {
  const found = args.tipo !== 'perdido';
  const kind: ItemKind = found ? 'found' : 'lost';
  const table = found ? 'found_items' : 'lost_reports';
  const allowed = found ? FOUND_STATUSES : LOST_STATUSES;
  let statuses = strList(args.estados, allowed);
  if (!statuses.length) statuses = found ? ['PUBLISHED', 'CLAIMED'] : ['OPEN', 'MATCHED'];

  const field = args.fecha === 'publicacion' ? 'created_at'
    : args.fecha === 'devolucion' ? (found ? 'returned_at' : 'updated_at')
    : found ? 'found_at' : 'lost_at';
  // "Devueltos esta semana" implica estado devuelto/recuperado.
  if (args.fecha === 'devolucion' && !args.estados) statuses = [found ? 'RETURNED' : 'RESOLVED'];

  let q = ctx.sb.from(table).select(REPORTER_SELECT).in('status', statuses)
    .order(field, { ascending: false, nullsFirst: false })
    .limit(MAX_CANDIDATES);
  const categories = strList(args.categorias, CATEGORIES);
  if (categories.length) q = q.in('category', categories);
  const location = str(args.ubicacion);
  if (location && likeSafe(location)) q = q.ilike('location', `%${likeSafe(location)}%`);
  const { gte, lt } = range(args);
  if (gte) q = q.gte(field, gte);
  if (lt) q = q.lt(field, lt);
  if (args.solo_mios === true) q = q.eq('reporter_id', ctx.caller.id);
  const { data, error } = await q;
  if (error) throw error;

  let rows = ((data ?? []) as Row[]).filter((r) => canSee(ctx, r));
  const text = str(args.texto);
  if (text) rows = rankByText(rows, text);

  const limit = int(args.limite, 10, 1, MAX_RESULTS);
  const shown = rows.slice(0, limit);
  for (const r of shown) ctx.seen.set(r.id as string, kind);
  return {
    total: rows.length,
    total_es_minimo: (data ?? []).length >= MAX_CANDIDATES,
    objetos: shown.map((r) => ({
      id: r.id,
      tipo: found ? 'encontrado' : 'perdido',
      titulo: clean(r.title, 80),
      categoria: r.category,
      estado: r.status,
      ubicacion: clean(r.location, 80) || null,
      [found ? 'encontrado_el' : 'perdido_el']: day(found ? r.found_at : r.lost_at),
      publicado_el: day(r.created_at),
      ...(found && r.returned_at ? { devuelto_el: day(r.returned_at) } : {}),
      ...(!found && r.status === 'RESOLVED' ? { resuelto_el_aprox: day(r.updated_at) } : {}),
      publicado_por: (r.reporter as Row | null)?.name ?? null,
      es_mio: r.reporter_id === ctx.caller.id,
      descripcion: clean(r.description),
    })),
  };
}

/** Filtra por palabras del texto (título, descripción, ubicación) y ordena por coincidencias. */
function rankByText(rows: Row[], text: string): Row[] {
  const terms = new Set(tokenize(text));
  const needle = text.toLowerCase();
  return rows
    .map((r, i) => {
      const hay = `${r.title} ${r.description} ${r.location ?? ''}`;
      const words = new Set(tokenize(hay));
      let score = 0;
      for (const t of terms) if (words.has(t)) score++;
      if (hay.toLowerCase().includes(needle)) score += 2;
      return { r, i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.r);
}

async function count(ctx: ToolContext, table: string, apply: (q: any) => any): Promise<number> {
  const { count: n, error } = await apply(ctx.sb.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw error;
  return n ?? 0;
}

async function resumen(ctx: ToolContext, args: Row) {
  const admin = isAdmin(ctx);
  const byStatus = async (table: string, statuses: string[]) => {
    const out: Record<string, number> = {};
    await Promise.all(statuses.map(async (s) => {
      out[s] = await count(ctx, table, (q) => {
        q = q.eq('status', s);
        // Lo moderado: un no-admin solo cuenta lo suyo.
        return HIDDEN.has(s) && !admin ? q.eq('reporter_id', ctx.caller.id) : q;
      });
    }));
    return out;
  };
  const [encontrados, perdidos] = await Promise.all([
    byStatus('found_items', FOUND_STATUSES),
    byStatus('lost_reports', LOST_STATUSES),
  ]);
  const result: Row = {
    encontrados_por_estado: encontrados,
    perdidos_por_estado: perdidos,
    nota: admin ? undefined : 'ARCHIVED y CLOSED cuentan solo tus publicaciones (las ajenas no son visibles).',
  };

  const { gte, lt } = range(args);
  if (gte || lt) {
    const inRange = (col: string) => (q: any) => {
      if (gte) q = q.gte(col, gte);
      if (lt) q = q.lt(col, lt);
      return q;
    };
    const visible = (q: any) => (admin ? q : q.not('status', 'in', '(ARCHIVED,CLOSED)'));
    const [pubF, pubL, dev, rec] = await Promise.all([
      count(ctx, 'found_items', (q) => visible(inRange('created_at')(q))),
      count(ctx, 'lost_reports', (q) => visible(inRange('created_at')(q))),
      count(ctx, 'found_items', (q) => inRange('returned_at')(q.eq('status', 'RETURNED'))),
      count(ctx, 'lost_reports', (q) => inRange('updated_at')(q.eq('status', 'RESOLVED'))),
    ]);
    result.en_el_rango = {
      encontrados_publicados: pubF,
      perdidos_reportados: pubL,
      devueltos: dev,
      perdidos_recuperados_aprox: rec,
    };
  }

  if (admin) {
    const [usuarios, activos, pendientes] = await Promise.all([
      count(ctx, 'profiles', (q) => q),
      count(ctx, 'profiles', (q) => q.eq('active', true)),
      count(ctx, 'claims', (q) => q.eq('status', 'PENDING')),
    ]);
    result.admin = { usuarios, usuarios_activos: activos, reclamaciones_pendientes: pendientes };
  }
  return result;
}

const CLAIM_SELECT =
  'id, status, message, review_note, created_at, updated_at, claimant_id, ' +
  'claimant:profiles!claimant_id (name), ' +
  'found_item:found_items!found_item_id (id, title, status, reporter_id, reporter:profiles!reporter_id (name))';

async function reclamaciones(ctx: ToolContext, args: Row) {
  const ambito = args.ambito === 'recibidas' || args.ambito === 'todas' ? args.ambito : 'hechas';
  if (ambito === 'todas' && !isAdmin(ctx)) {
    return { error: 'Solo un administrador puede ver todas las reclamaciones. Puedes consultar las hechas o las recibidas.' };
  }
  let q = ctx.sb.from('claims').select(CLAIM_SELECT).order('updated_at', { ascending: false }).limit(25);
  if (ambito === 'hechas') q = q.eq('claimant_id', ctx.caller.id);
  if (ambito === 'recibidas') {
    const { data: mine, error } = await ctx.sb.from('found_items').select('id').eq('reporter_id', ctx.caller.id);
    if (error) throw error;
    const ids = (mine ?? []).map((r: Row) => r.id as string);
    if (!ids.length) return { total: 0, reclamaciones: [] };
    q = q.in('found_item_id', ids);
  }
  const statuses = strList(args.estados, CLAIM_STATUSES);
  if (statuses.length) q = q.in('status', statuses);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  return {
    total: rows.length,
    reclamaciones: rows.map((c) => {
      const item = (c.found_item ?? {}) as Row;
      // La tarjeta del objeto solo si el usuario puede verlo.
      if (item.id && canSee(ctx, item)) ctx.seen.set(item.id as string, 'found');
      return {
        objeto: clean(item.title, 80),
        objeto_id: item.id ?? null,
        estado_objeto: item.status ?? null,
        encontrado_por: (item.reporter as Row | null)?.name ?? null,
        reclamante: (c.claimant as Row | null)?.name ?? null,
        es_mia: c.claimant_id === ctx.caller.id,
        estado: c.status,
        mensaje: clean(c.message),
        nota_revision: c.review_note ? clean(c.review_note) : null,
        enviada_el: day(c.created_at),
        actualizada_el: day(c.updated_at),
      };
    }),
  };
}

async function notificaciones(ctx: ToolContext, args: Row) {
  let q = ctx.sb.from('notifications').select('type, title, body, read, created_at')
    .eq('user_id', ctx.caller.id).order('created_at', { ascending: false }).limit(15);
  if (args.solo_no_leidas === true) q = q.eq('read', false);
  const [{ data, error }, unread] = await Promise.all([
    q,
    count(ctx, 'notifications', (c) => c.eq('user_id', ctx.caller.id).eq('read', false)),
  ]);
  if (error) throw error;
  return {
    no_leidas: unread,
    notificaciones: ((data ?? []) as Row[]).map((n) => ({
      tipo: n.type,
      titulo: clean(n.title, 80),
      texto: clean(n.body, 240),
      leida: n.read,
      fecha: day(n.created_at),
    })),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMatchable(r: Row): MatchableItem {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as string,
    location: (r.location as string) ?? '',
    date: new Date((r.found_at ?? r.lost_at) as string),
    signature: parseSignature(r.image_signature),
  };
}

async function coincidencias(ctx: ToolContext, args: Row) {
  const id = str(args.reporte_id, 40);
  if (!id || !UUID_RE.test(id)) return { error: 'reporte_id no válido: búscalo antes con buscar_objetos (tipo perdido, solo_mios).' };
  const { data: lost } = await ctx.sb.from('lost_reports').select('*').eq('id', id).maybeSingle();
  if (!lost || (lost.reporter_id !== ctx.caller.id && !isAdmin(ctx))) {
    return { error: 'Solo puedes ver coincidencias de tus propios reportes de perdido.' };
  }
  const { data, error } = await ctx.sb.from('found_items').select('*').in('status', ['PUBLISHED', 'CLAIMED']);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const matches = matchItems(toMatchable(lost as Row), rows.map(toMatchable), { limit: 5, minScore: 15 });
  for (const m of matches) ctx.seen.set(m.item.id, 'found');
  return {
    reporte: clean(lost.title, 80),
    coincidencias: matches.map((m) => ({
      id: m.item.id,
      titulo: clean(m.item.title, 80),
      estado: byId.get(m.item.id)?.status,
      ubicacion: clean(m.item.location, 80),
      porcentaje: m.score,
      motivos: m.reasons,
    })),
  };
}

async function historial(ctx: ToolContext, args: Row) {
  if (!isAdmin(ctx)) return { error: 'El historial de auditoría solo lo pueden consultar los administradores.' };
  let q = ctx.sb.from('audit_logs').select('action, entity_type, summary, created_at, actor:profiles!actor_id (name)')
    .order('created_at', { ascending: false }).limit(int(args.limite, 15, 1, 30));
  const { gte, lt } = range(args);
  if (gte) q = q.gte('created_at', gte);
  if (lt) q = q.lt('created_at', lt);
  const { data, error } = await q;
  if (error) throw error;
  return {
    eventos: ((data ?? []) as unknown as Row[]).map((e) => ({
      accion: e.action,
      sobre: clean(e.summary, 100),
      por: (e.actor as Row | null)?.name ?? null,
      fecha: day(e.created_at),
    })),
  };
}

// --- Juego: puntos, rangos, ranking e insignias --------------------------------
// Lo mismo que cualquier colaborador ve en el ranking y los perfiles (top 100,
// perfiles de activos); game_stats() ya excluye cuentas desactivadas.

interface Player {
  id: string;
  name: string;
  role: string;
  points: number;
  stats: PlayerStats;
}

/** Todos los colaboradores activos con sus puntos, ordenados como el ranking. */
async function players(ctx: ToolContext): Promise<Player[]> {
  const { data, error } = await ctx.sb.rpc('game_stats');
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.user_id as string);
  const names = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ps, error: e } = await ctx.sb.from('profiles').select('id, name, role').in('id', ids.slice(i, i + 200));
    if (e) throw e;
    for (const p of (ps ?? []) as Row[]) names.set(p.id as string, p);
  }
  return rows
    .map((r) => ({
      id: r.user_id as string,
      name: String(names.get(r.user_id as string)?.name ?? ''),
      role: String(names.get(r.user_id as string)?.role ?? 'EMPLOYEE'),
      points: Number(r.points ?? 0),
      stats: {
        published: Number(r.published ?? 0),
        publishedWithPhoto: Number(r.published_photo ?? 0),
        returned: Number(r.returned ?? 0),
        fastReturned: Number(r.fast_returned ?? 0),
        categories: Number(r.categories ?? 0),
        activeMonths: Number(r.active_months ?? 0),
      },
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Puesto con empates (como el ranking de la app); null sin puntos. */
const positionOf = (all: Player[], points: number) => (points > 0 ? all.filter((p) => p.points > points).length + 1 : null);

function badgesOf(stats: PlayerStats) {
  return BADGES.map((b) => {
    const p = badgeProgress(b, stats);
    return {
      insignia: b.name,
      nivel: p.level,
      nivel_maximo: b.levels.length,
      conseguida: p.level > 0,
      al_maximo: p.maxed,
      siguiente_objetivo: p.next === null ? null : b.goal(p.next),
      progreso: p.next === null ? null : `${p.value}/${p.next}`,
    };
  });
}

function playerCard(all: Player[], p: Player) {
  const top = all.filter((x) => x.points > 0).slice(0, TOP_PLAYERS).map((x) => x.id);
  const rank = rankFor(p.points);
  return {
    nombre: p.name,
    administrador: p.role === 'ADMIN',
    puntos: p.points,
    puesto: positionOf(all, p.points),
    rango: rank.name,
    en_top_3: top.includes(p.id),
    leyenda_de_olo: badgeProgress(ULTIMATE_BADGE, p.stats).level > 0,
    estadisticas: {
      objetos_publicados: p.stats.published,
      publicados_con_foto: p.stats.publishedWithPhoto,
      devueltos: p.stats.returned,
      devueltos_en_menos_de_24h: p.stats.fastReturned,
      categorias_distintas_devueltas: p.stats.categories,
      meses_con_devoluciones: p.stats.activeMonths,
    },
  };
}

async function miJuego(ctx: ToolContext) {
  const all = await players(ctx);
  const me = all.find((p) => p.id === ctx.caller.id);
  if (!me) return { error: 'No encontré tu perfil de juego.' };
  const next = nextRank(me.points);
  const pos = positionOf(all, me.points);
  const above = pos && pos > 1 ? [...all].reverse().find((p) => p.points > me.points) : null;
  return {
    ...playerCard(all, me),
    jugadores_con_puntos: all.filter((p) => p.points > 0).length,
    siguiente_rango: next
      ? { rango: next.name, puntos_necesarios: next.min, te_faltan: next.min - me.points, desbloquea: rankUnlocks(next) }
      : null,
    justo_por_encima: above ? { nombre: above.name, puntos: above.points, diferencia: above.points - me.points } : null,
    insignias: badgesOf(me.stats),
  };
}

async function rankingJuego(ctx: ToolContext, args: Row) {
  const all = await players(ctx);
  const ranked = all.filter((p) => p.points > 0).slice(0, LEADERBOARD_MAX);
  const me = all.find((p) => p.id === ctx.caller.id);
  return {
    jugadores_con_puntos: all.filter((p) => p.points > 0).length,
    top: ranked.slice(0, int(args.limite, 10, 1, 30)).map((p) => ({
      puesto: positionOf(all, p.points),
      nombre: p.name,
      puntos: p.points,
      rango: rankFor(p.points).name,
      administrador: p.role === 'ADMIN',
    })),
    tu_puesto: me ? positionOf(all, me.points) : null,
    tus_puntos: me?.points ?? 0,
    nota: 'El ranking de la app muestra hasta el puesto 100. Los 3 primeros tienen ventajas.',
  };
}

async function jugador(ctx: ToolContext, args: Row) {
  const name = str(args.nombre, 60);
  if (!name || name.length < 2) return { error: 'Indica el nombre (al menos 2 letras).' };
  const all = await players(ctx);
  const needle = name.toLocaleLowerCase('es');
  const found = all.filter((p) => p.name.toLocaleLowerCase('es').includes(needle)).slice(0, 5);
  if (!found.length) return { encontrados: 0, nota: 'Ningún colaborador activo con ese nombre.' };
  return {
    encontrados: found.length,
    jugadores: found.map((p) => ({
      ...playerCard(all, p),
      insignias_conseguidas: badgesOf(p.stats)
        .filter((b) => b.conseguida)
        .map((b) => `${b.insignia}${b.nivel_maximo > 1 ? ` (nivel ${b.nivel}/${b.nivel_maximo})` : ''}`),
    })),
  };
}

async function reglasJuego() {
  return {
    puntos: POINT_RULES.map((r) => ({ regla: r.title, puntos: r.points, detalle: r.description })),
    notas_puntos: [
      'Quien pierde un objeto no gana puntos: solo quien lo encuentra y lo devuelve.',
      'Devolver sin una reclamación aprobada de otra persona no suma los 100 puntos.',
      'Archivar (un admin) o eliminar una publicación descuenta sus puntos.',
    ],
    rangos: RANKS.map((r) => ({ rango: r.name, desde_puntos: r.min, desbloquea: rankUnlocks(r) })),
    marcos:
      'El marco de la foto se elige en "Mi perfil" > "Personalizar marco" entre los desbloqueados por rango (o automático / sin marco).',
    insignias: BADGES.map((b) => ({
      insignia: b.name,
      como: b === ULTIMATE_BADGE
        ? b.goal(b.levels[0])
        : b.levels.length === 1
          ? `${b.goal(b.levels[0])} (insignia de una sola vez)`
          : `Sube de nivel: ${b.levels.map((n, i) => `nivel ${i + 1}: ${b.goal(n).toLowerCase()}`).join('; ')}`,
    })),
    marcos_de_insignia: `Cada nivel mejora el marco de la insignia: ${BADGE_FRAMES.join(', ')}.`,
    leyenda_de_olo:
      'Insignia definitiva: todas las demás al nivel máximo. Quien la tiene lleva el título LEYENDA en arcoíris bajo su nombre y un emblema de corona.',
    ventajas_top_3: [
      'Sus objetos perdidos aún en búsqueda salen primero en el muro (en orden de ranking).',
      'Un emblema con su puesto (oro, plata o bronce) junto a su nombre.',
    ],
    emblemas_junto_al_nombre: 'Administrador (sello verde con estrella), Leyenda de OLO (corona) y puesto del top 3. Pueden salir juntos.',
    donde_verlo: 'Mi perfil (puntos, rango, insignias, "¿Cómo ganar puntos?") y la sección Ranking.',
  };
}

const TOOLS: Record<string, (ctx: ToolContext, args: Row) => Promise<unknown>> = {
  buscar_objetos: buscarObjetos,
  resumen,
  reclamaciones,
  notificaciones,
  coincidencias,
  historial,
  mi_juego: miJuego,
  ranking_juego: rankingJuego,
  jugador,
  reglas_juego: reglasJuego,
};

/** Ejecuta una herramienta pedida por el modelo. Nunca lanza: los errores vuelven como datos. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<unknown> {
  const fn = TOOLS[name];
  if (!fn) return { error: `Herramienta desconocida: ${name}` };
  let args: Row = {};
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
  } catch {
    return { error: 'Argumentos no válidos (JSON).' };
  }
  try {
    return await fn(ctx, args);
  } catch (e) {
    console.error('[assistant-tool]', name, (e as Error).message);
    return { error: 'No se pudo consultar ahora mismo.' };
  }
}
