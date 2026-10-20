// Edge Function: api
//
// Reimplementa en Supabase la lógica de IA y administración que antes vivía en
// el backend Express. Un único endpoint con router interno para simplificar el
// despliegue. Rutas (bajo /functions/v1/api):
//
//   POST /ai/search            búsqueda semántica sobre objetos encontrados
//   GET  /ai/match/:lostId     coincidencias de un objeto perdido
//   POST /ai/assistant         asistente por intención (sin LLM)
//   GET  /admin/stats          métricas (solo ADMIN)
//   GET  /admin/users          lista de usuarios (solo ADMIN)
//   PATCH /admin/users/:id/role cambia rol (solo ADMIN)
//   GET  /admin/audit          historial de auditoría (solo ADMIN)
//   GET  /claims/all           bandeja global de reclamaciones (solo ADMIN)
//
// Seguridad: cada petición se identifica con el token del llamador. Las lecturas
// de datos usan la service_role (el motor necesita ver todos los candidatos),
// pero NUNCA se exponen columnas sensibles y las rutas admin exigen rol ADMIN.
// La service_role vive solo en los secrets del proyecto, jamás en el cliente.

import { adminClient, cors, getCaller, json, rateLimit } from '../_shared/http.ts';
import { matchItems, type MatchableItem, semanticSearch } from '../_shared/matching.ts';
import { parseSignature } from '../_shared/visual.ts';
import { composeAnswer, parseIntent } from '../_shared/assistant.ts';
import {
  primeSignedUrls,
  serializeClaim,
  serializeFoundItem,
  serializeLostReport,
  serializeUser,
} from '../_shared/serialize.ts';

const REPORTER_SELECT = '*, reporter:profiles!reporter_id (id, name)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Longitud máxima de consultas/preguntas en lenguaje natural (acota el coste del NLP).
const MAX_QUERY = 300;

type Row = Record<string, unknown>;

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

/** Objetos encontrados disponibles (no devueltos ni archivados). */
async function availableFoundItems(sb: ReturnType<typeof adminClient>): Promise<Row[]> {
  const { data, error } = await sb
    .from('found_items')
    .select(REPORTER_SELECT)
    .in('status', ['PUBLISHED', 'CLAIMED'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Inserta una notificación in-app para un usuario (best-effort). */
async function notify(
  sb: ReturnType<typeof adminClient>,
  n: { userId: string; type: string; title: string; body: string; relatedItemId?: string | null },
): Promise<void> {
  try {
    await sb.from('notifications').insert({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      related_item_id: n.relatedItemId ?? null,
    });
  } catch (e) {
    console.error('[notify]', e);
  }
}

/** Registra un evento de auditoría (best-effort, nunca interrumpe). */
async function writeAudit(
  sb: ReturnType<typeof adminClient>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
): Promise<void> {
  try {
    await sb.from('audit_logs').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
    });
  } catch (e) {
    console.error('[audit]', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // La ruta efectiva va después de "/api".
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/api/, '') || '/';
  const method = req.method;

  // Identificar al llamador (todas las rutas requieren sesión).
  const caller = await getCaller(req.headers.get('Authorization'));
  if (!caller) return json({ error: 'UNAUTHORIZED', message: 'Sesión requerida' }, 401);

  const sb = adminClient();

  // Rate limiting por usuario con almacén compartido (tabla rate_limits). La IA
  // recorre todos los objetos en cada llamada (coste alto); crear reclamaciones
  // genera notificaciones a otros usuarios (spam).
  if (path.startsWith('/ai/')) {
    const limited = await rateLimit(sb, `ai:${caller.id}`, 30, 60);
    if (limited) return limited;
  } else if (method === 'POST' && path === '/claims') {
    const limited = await rateLimit(sb, `claim:${caller.id}`, 10, 600);
    if (limited) return limited;
  }

  // Los identificadores de la ruta son UUID: rechazar cualquier otra cosa pronto.
  // (/ai/match/:id, /claims/:id/..., /admin/users/:id/role; /claims/all no es un id).
  const idInPath = path.match(/^\/(?:ai\/match|claims|admin\/users)\/([^/]+)/)?.[1];
  if (idInPath && idInPath !== 'all' && !UUID_RE.test(decodeURIComponent(idInPath))) {
    return json({ error: 'BAD_REQUEST', message: 'Identificador inválido' }, 400);
  }

  try {
    // ================= IA =================

    // POST /ai/search
    if (method === 'POST' && path === '/ai/search') {
      const body = await req.json().catch(() => ({}));
      const query = String(body.query ?? '').trim();
      const rawLimit = Number(body.limit ?? 20);
      const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.trunc(rawLimit))) : 20;
      if (query.length < 2 || query.length > MAX_QUERY) {
        return json({ error: 'BAD_REQUEST', message: `La búsqueda debe tener entre 2 y ${MAX_QUERY} caracteres` }, 400);
      }
      const items = await availableFoundItems(sb);
      const byId = new Map(items.map((i) => [i.id as string, i]));
      const ranked = semanticSearch(query, items.map(toMatchable), { limit });
      await primeSignedUrls(sb, ranked.map((r) => byId.get(r.item.id)?.image_path));
      const results = await Promise.all(
        ranked.map(async (r) => ({
          item: await serializeFoundItem(sb, byId.get(r.item.id)!),
          score: r.score,
          reasons: r.reasons,
        })),
      );
      return json({ query, results });
    }

    // GET /ai/match/:lostReportId
    if (method === 'GET' && path.startsWith('/ai/match/')) {
      const lostId = decodeURIComponent(path.slice('/ai/match/'.length));
      const { data: lost } = await sb.from('lost_reports').select('*').eq('id', lostId).single();
      if (!lost) return json({ error: 'NOT_FOUND', message: 'Reporte no encontrado' }, 404);
      if (lost.reporter_id !== caller.id && caller.role !== 'ADMIN') {
        return json({ error: 'FORBIDDEN', message: 'No puedes ver estas sugerencias' }, 403);
      }
      const items = await availableFoundItems(sb);
      const byId = new Map(items.map((i) => [i.id as string, i]));
      const suggestions = matchItems(toMatchable(lost as Row), items.map(toMatchable), {
        limit: 5,
        minScore: 15,
      });
      await primeSignedUrls(sb, suggestions.map((r) => byId.get(r.item.id)?.image_path));
      const serialized = await Promise.all(
        suggestions.map(async (r) => ({
          item: await serializeFoundItem(sb, byId.get(r.item.id)!),
          score: r.score,
          reasons: r.reasons,
          breakdown: r.breakdown,
        })),
      );
      return json({
        lostReportId: lost.id,
        reference: {
          id: lost.id,
          title: lost.title,
          category: lost.category,
          location: lost.location,
          imageUrl: null,
        },
        suggestions: serialized,
      });
    }

    // POST /ai/assistant
    if (method === 'POST' && path === '/ai/assistant') {
      const body = await req.json().catch(() => ({}));
      const question = String(body.question ?? '').trim();
      if (question.length < 2 || question.length > MAX_QUERY) {
        return json({ error: 'BAD_REQUEST', message: `La pregunta debe tener entre 2 y ${MAX_QUERY} caracteres` }, 400);
      }
      const intent = parseIntent(question);

      let foundItems: unknown[] = [];
      let lostReports: unknown[] = [];
      let count = 0;

      if (intent.kind === 'found') {
        let q = sb
          .from('found_items')
          .select(REPORTER_SELECT)
          .in('status', ['PUBLISHED', 'CLAIMED'])
          .order('found_at', { ascending: false })
          .limit(10);
        if (intent.categories.length) q = q.in('category', intent.categories);
        if (intent.location) q = q.ilike('location', `%${intent.location}%`);
        if (intent.since) q = q.gte('found_at', intent.since.toISOString());
        const { data } = await q;
        const rows = (data ?? []) as Row[];
        count = rows.length;
        await primeSignedUrls(sb, rows.map((r) => r.image_path));
        foundItems = await Promise.all(rows.map((r) => serializeFoundItem(sb, r)));
      } else {
        let q = sb
          .from('lost_reports')
          .select(REPORTER_SELECT)
          .order('lost_at', { ascending: false })
          .limit(10);
        if (intent.categories.length) q = q.in('category', intent.categories);
        if (intent.location) q = q.ilike('location', `%${intent.location}%`);
        if (intent.since) q = q.gte('lost_at', intent.since.toISOString());
        const { data } = await q;
        const rows = (data ?? []) as Row[];
        count = rows.length;
        await primeSignedUrls(sb, rows.map((r) => r.image_path));
        lostReports = await Promise.all(rows.map((r) => serializeLostReport(sb, r)));
      }

      return json({ answer: composeAnswer(intent, count), kind: intent.kind, foundItems, lostReports });
    }

    // ================= CLAIMS (flujo con notificaciones) =================
    const CLAIM_SELECT =
      '*, claimant:profiles!claimant_id (id, name), found_item:found_items!found_item_id (id, title, image_path, status, reporter_id)';

    // POST /claims — crear una reclamación.
    if (method === 'POST' && path === '/claims') {
      const body = await req.json().catch(() => ({}));
      const foundItemId = String(body.foundItemId ?? '');
      const message = String(body.message ?? '').trim();
      if (!UUID_RE.test(foundItemId) || message.length < 2 || message.length > 1000) {
        return json({ error: 'BAD_REQUEST', message: 'foundItemId y mensaje (2 a 1000 caracteres) requeridos' }, 400);
      }
      const { data: item } = await sb
        .from('found_items')
        .select('id, title, status, reporter_id')
        .eq('id', foundItemId)
        .single();
      if (!item) return json({ error: 'NOT_FOUND', message: 'Objeto no encontrado' }, 404);
      if (item.status === 'RETURNED' || item.status === 'ARCHIVED') {
        return json({ error: 'BAD_REQUEST', message: 'Este objeto ya no está disponible para reclamar' }, 400);
      }
      if (item.reporter_id === caller.id) {
        return json({ error: 'BAD_REQUEST', message: 'No puedes reclamar un objeto que tú publicaste' }, 400);
      }
      const { data: existing } = await sb
        .from('claims')
        .select('id')
        .eq('found_item_id', foundItemId)
        .eq('claimant_id', caller.id)
        .eq('status', 'PENDING')
        .maybeSingle();
      if (existing) {
        return json({ error: 'BAD_REQUEST', message: 'Ya tienes una reclamación pendiente para este objeto' }, 400);
      }
      const { data: created, error } = await sb
        .from('claims')
        .insert({ found_item_id: foundItemId, claimant_id: caller.id, message })
        .select(CLAIM_SELECT)
        .single();
      if (error) {
        // 23505 = índice único claims_unique_pending (petición duplicada concurrente).
        if (error.code === '23505') {
          return json({ error: 'BAD_REQUEST', message: 'Ya tienes una reclamación pendiente para este objeto' }, 400);
        }
        throw error;
      }
      await notify(sb, {
        userId: item.reporter_id,
        type: 'CLAIM_REQUESTED',
        title: 'Nueva solicitud de reclamación',
        body: `Alguien solicitó reclamar "${item.title}".`,
        relatedItemId: item.id,
      });
      return json(await serializeClaim(sb, created as Row), 201);
    }

    // PATCH /claims/:id/review — aprobar/rechazar (autor del objeto o admin).
    if (method === 'PATCH' && /^\/claims\/[^/]+\/review$/.test(path)) {
      const claimId = path.split('/')[2];
      const body = await req.json().catch(() => ({}));
      const status = body.status;
      const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.slice(0, 1000) : null;
      if (status !== 'APPROVED' && status !== 'REJECTED') {
        return json({ error: 'BAD_REQUEST', message: 'status debe ser APPROVED o REJECTED' }, 400);
      }
      // Todo el flujo (permisos, estado, cascada, notificaciones, auditoría) va en
      // una única transacción SQL con las filas bloqueadas: ver migración 006.
      const { error } = await sb.rpc('review_claim', {
        p_claim_id: claimId,
        p_actor_id: caller.id,
        p_status: status,
        p_note: reviewNote,
      });
      if (error) {
        const http = Number(error.hint);
        if (http >= 400 && http < 500) {
          const code = http === 403 ? 'FORBIDDEN' : http === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
          return json({ error: code, message: error.message }, http);
        }
        throw error;
      }
      const { data: fresh } = await sb.from('claims').select(CLAIM_SELECT).eq('id', claimId).single();
      return json(await serializeClaim(sb, fresh as Row));
    }

    // PATCH /claims/:id/cancel — cancelar la propia reclamación pendiente.
    if (method === 'PATCH' && /^\/claims\/[^/]+\/cancel$/.test(path)) {
      const claimId = path.split('/')[2];
      const { data: claim } = await sb.from('claims').select('*').eq('id', claimId).single();
      if (!claim || claim.claimant_id !== caller.id) {
        return json({ error: 'NOT_FOUND', message: 'Reclamación no encontrada' }, 404);
      }
      // Condicionado a PENDING para no pisar una revisión concurrente.
      const { data: cancelled, error } = await sb
        .from('claims')
        .update({ status: 'CANCELLED' })
        .eq('id', claimId)
        .eq('status', 'PENDING')
        .select('id');
      if (error) throw error;
      if (!cancelled?.length) {
        return json({ error: 'BAD_REQUEST', message: 'Solo se pueden cancelar reclamaciones pendientes' }, 400);
      }
      const { data: fresh } = await sb.from('claims').select(CLAIM_SELECT).eq('id', claimId).single();
      return json(await serializeClaim(sb, fresh as Row));
    }

    // ================= ADMIN =================
    // Todas las rutas admin requieren rol ADMIN.
    const isAdminRoute = path.startsWith('/admin/') || path === '/claims/all';
    if (isAdminRoute && caller.role !== 'ADMIN') {
      return json({ error: 'FORBIDDEN', message: 'Se requiere rol de administrador' }, 403);
    }

    // GET /admin/stats
    if (method === 'GET' && path === '/admin/stats') {
      const countOf = async (table: string, status?: string) => {
        let q = sb.from(table).select('id', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        const { count } = await q;
        return count ?? 0;
      };
      const [users, foundItems, lostReports, claimsPending, returned] = await Promise.all([
        countOf('profiles'),
        countOf('found_items'),
        countOf('lost_reports'),
        countOf('claims', 'PENDING'),
        countOf('found_items', 'RETURNED'),
      ]);
      return json({ users, foundItems, lostReports, claimsPending, returned });
    }

    // GET /admin/users
    if (method === 'GET' && path === '/admin/users') {
      const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      return json((data ?? []).map(serializeUser));
    }

    // POST /admin/users — alta de colaborador por un admin (opción 2: email sintético).
    if (method === 'POST' && path === '/admin/users') {
      const body = await req.json().catch(() => ({}));
      const employeeId = String(body.employeeId ?? '').trim();
      const name = String(body.name ?? '').trim();
      const password = String(body.password ?? '');
      const role = body.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
      if (!/^[A-Za-z0-9._-]{1,50}$/.test(employeeId) || name.length < 2 || password.length < 8) {
        return json(
          { error: 'BAD_REQUEST', message: 'Número, nombre (≥2) y contraseña (≥8) válidos requeridos' },
          400,
        );
      }
      // ¿Ya existe un colaborador con ese número?
      const { data: dup } = await sb
        .from('profiles')
        .select('id')
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (dup) return json({ error: 'CONFLICT', message: 'Ese número de colaborador ya existe' }, 409);

      const email = `${employeeId}@${Deno.env.get('AUTH_EMAIL_DOMAIN') ?? 'lostandfound.olo'}`;
      const { data: createdUser, error: createErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, employee_id: employeeId },
      });
      if (createErr || !createdUser?.user) {
        return json({ error: 'CREATE_FAILED', message: createErr?.message ?? 'No se pudo crear' }, 500);
      }
      // El trigger handle_new_user crea el perfil como EMPLOYEE; ajusta datos y rol.
      await sb
        .from('profiles')
        .update({ name, employee_id: employeeId, role })
        .eq('id', createdUser.user.id);
      await writeAudit(
        sb,
        caller.id,
        'USER_ROLE_CHANGED',
        'User',
        createdUser.user.id,
        `Creó al colaborador ${name} (N° ${employeeId}) como ${role === 'ADMIN' ? 'administrador' : 'empleado'}`,
      );
      const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('id', createdUser.user.id)
        .single();
      return json(serializeUser(profile as Row), 201);
    }

    // PATCH /admin/users/:id/role
    if (method === 'PATCH' && /^\/admin\/users\/[^/]+\/role$/.test(path)) {
      const id = path.split('/')[3];
      const body = await req.json().catch(() => ({}));
      const role = body.role;
      if (role !== 'ADMIN' && role !== 'EMPLOYEE') {
        return json({ error: 'BAD_REQUEST', message: 'Rol inválido' }, 400);
      }
      const { data: target } = await sb.from('profiles').select('*').eq('id', id).single();
      if (!target) return json({ error: 'NOT_FOUND', message: 'Usuario no encontrado' }, 404);
      // Nunca dejar el sistema sin administradores (también lo impone un trigger).
      if (target.role === 'ADMIN' && role !== 'ADMIN') {
        const { count } = await sb
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'ADMIN');
        if ((count ?? 0) <= 1) {
          return json({ error: 'BAD_REQUEST', message: 'No se puede quitar el rol al último administrador' }, 400);
        }
      }
      const { data: updated, error } = await sb
        .from('profiles')
        .update({ role })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAudit(
        sb,
        caller.id,
        'USER_ROLE_CHANGED',
        'User',
        id,
        `${target.name} ahora es ${role === 'ADMIN' ? 'administrador' : 'empleado'}`,
      );
      return json(serializeUser(updated as Row));
    }

    // PATCH /admin/users/:id/active — activa o desactiva un colaborador.
    // Desactivar conserva todos sus datos e historial; solo le impide iniciar sesión.
    if (method === 'PATCH' && /^\/admin\/users\/[^/]+\/active$/.test(path)) {
      const targetId = path.split('/')[3];
      const body = await req.json().catch(() => ({}));
      const active = body.active === true;
      if (targetId === caller.id) {
        return json({ error: 'BAD_REQUEST', message: 'No puedes desactivar tu propia cuenta' }, 400);
      }
      const { data: target } = await sb
        .from('profiles')
        .select('name, employee_id')
        .eq('id', targetId)
        .single();
      if (!target) return json({ error: 'NOT_FOUND', message: 'Colaborador no encontrado' }, 404);
      const { data: updated, error } = await sb
        .from('profiles')
        .update({ active })
        .eq('id', targetId)
        .select('*')
        .single();
      if (error) return json({ error: 'UPDATE_FAILED', message: error.message }, 500);
      // Si se desactiva, revoca sus sesiones activas para que el cierre sea inmediato.
      if (!active) {
        try {
          await sb.rpc('revoke_user_sessions', { p_user_id: targetId });
        } catch (_e) {
          /* best-effort: el token caduca solo en <=1h si la RPC no existe */
        }
      }
      await writeAudit(
        sb,
        caller.id,
        active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        'User',
        targetId,
        `${active ? 'Reactivó' : 'Desactivó'} al colaborador ${target.name} (N° ${target.employee_id})`,
      );
      return json(serializeUser(updated as Row));
    }

    // GET /admin/audit
    if (method === 'GET' && path === '/admin/audit') {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
      const { data } = await sb
        .from('audit_logs')
        .select('*, actor:profiles!actor_id (id, name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      return json(
        (data ?? []).map((l: Row) => ({
          id: l.id as string,
          action: l.action as string,
          entityType: l.entity_type as string,
          entityId: l.entity_id as string,
          summary: l.summary as string,
          actor: l.actor ?? { id: l.actor_id, name: '' },
          createdAt: l.created_at as string,
        })),
      );
    }

    // GET /admin/archived — objetos retirados de circulación (moderación).
    //   encontrados en estado ARCHIVED + perdidos en estado CLOSED.
    if (method === 'GET' && path === '/admin/archived') {
      const [{ data: fData }, { data: lData }] = await Promise.all([
        sb.from('found_items').select(REPORTER_SELECT).eq('status', 'ARCHIVED')
          .order('updated_at', { ascending: false }),
        sb.from('lost_reports').select(REPORTER_SELECT).eq('status', 'CLOSED')
          .order('updated_at', { ascending: false }),
      ]);
      await primeSignedUrls(sb, [...(fData ?? []), ...(lData ?? [])].map((r: Row) => r.image_path));
      const found = await Promise.all(((fData ?? []) as Row[]).map((r) => serializeFoundItem(sb, r)));
      const lost = await Promise.all(((lData ?? []) as Row[]).map((r) => serializeLostReport(sb, r)));
      return json({ found, lost });
    }

    // POST /admin/restore — devuelve un objeto archivado a circulación.
    //   { kind: 'found'|'lost', id } -> found=>PUBLISHED, lost=>OPEN.
    if (method === 'POST' && path === '/admin/restore') {
      const body = await req.json().catch(() => ({}));
      const kind = body.kind;
      const id = String(body.id ?? '');
      if ((kind !== 'found' && kind !== 'lost') || !UUID_RE.test(id)) {
        return json({ error: 'BAD_REQUEST', message: 'kind (found|lost) e id requeridos' }, 400);
      }
      const table = kind === 'found' ? 'found_items' : 'lost_reports';
      const newStatus = kind === 'found' ? 'PUBLISHED' : 'OPEN';
      const { data, error } = await sb
        .from(table)
        .update({ status: newStatus })
        .eq('id', id)
        .select('id, title')
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'NOT_FOUND', message: 'Objeto no encontrado' }, 404);
      await writeAudit(
        sb,
        caller.id,
        kind === 'found' ? 'FOUND_ITEM_RESTORED' : 'LOST_REPORT_RESTORED',
        kind === 'found' ? 'FoundItem' : 'LostReport',
        id,
        `Restauró "${(data as Row).title}"`,
      );
      return json({ ok: true });
    }

    // GET /claims/all
    if (method === 'GET' && path === '/claims/all') {
      const { data } = await sb
        .from('claims')
        .select(
          '*, claimant:profiles!claimant_id (id, name), found_item:found_items!found_item_id (id, title, image_path, status)',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      await primeSignedUrls(sb, ((data ?? []) as Row[]).map((c) => (c.found_item as Row | null)?.image_path));
      const claims = await Promise.all(((data ?? []) as Row[]).map((c) => serializeClaim(sb, c)));
      return json(claims);
    }

    return json({ error: 'NOT_FOUND', message: `Ruta no encontrada: ${method} ${path}` }, 404);
  } catch (e) {
    // El detalle va al log; al cliente no se le filtran mensajes internos de la BD.
    console.error('[api]', e);
    return json({ error: 'INTERNAL', message: 'Error interno del servidor' }, 500);
  }
});
