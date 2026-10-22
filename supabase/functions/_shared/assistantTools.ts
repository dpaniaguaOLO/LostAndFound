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
 *   - Nunca se devuelven número de colaborador, correo, fotos ni firmas visuales.
 * Ninguna herramienta escribe nada.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.118.0';
import type { Caller } from './http.ts';
import { matchItems, type MatchableItem } from './matching.ts';
import { tokenize } from './nlp.ts';
import { parseSignature } from './visual.ts';
import { addDays, dateInAppTz, startOfDayInAppTz } from './time.ts';

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

const TOOLS: Record<string, (ctx: ToolContext, args: Row) => Promise<unknown>> = {
  buscar_objetos: buscarObjetos,
  resumen,
  reclamaciones,
  notificaciones,
  coincidencias,
  historial,
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
