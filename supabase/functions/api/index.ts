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

import { adminClient, cors, getCaller, json } from '../_shared/http.ts';
import { matchItems, type MatchableItem, semanticSearch } from '../_shared/matching.ts';
import { parseSignature } from '../_shared/visual.ts';
import { composeAnswer, parseIntent } from '../_shared/assistant.ts';
import {
  serializeClaim,
  serializeFoundItem,
  serializeLostReport,
  serializeUser,
} from '../_shared/serialize.ts';

const REPORTER_SELECT = '*, reporter:profiles!reporter_id (id, name)';

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

  try {
    // ================= IA =================

    // POST /ai/search
    if (method === 'POST' && path === '/ai/search') {
      const body = await req.json().catch(() => ({}));
      const query = String(body.query ?? '').trim();
      const limit = Math.min(50, Math.max(1, Number(body.limit ?? 20)));
      if (query.length < 2) {
        return json({ error: 'BAD_REQUEST', message: 'Escribe al menos 2 caracteres' }, 400);
      }
      const items = await availableFoundItems(sb);
      const byId = new Map(items.map((i) => [i.id as string, i]));
      const ranked = semanticSearch(query, items.map(toMatchable), { limit });
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
      if (question.length < 2) {
        return json({ error: 'BAD_REQUEST', message: 'Escribe una pregunta' }, 400);
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
        lostReports = await Promise.all(rows.map((r) => serializeLostReport(sb, r)));
      }

      return json({ answer: composeAnswer(intent, count), kind: intent.kind, foundItems, lostReports });
    }

    // ================= ADMIN =================
    // Todas las rutas admin requieren rol ADMIN.
    const isAdminRoute = path.startsWith('/admin/') || path === '/claims/all';
    if (isAdminRoute && caller.role !== 'ADMIN') {
      return json({ error: 'FORBIDDEN', message: 'Se requiere rol de administrador' }, 403);
    }

    // GET /admin/stats
    if (method === 'GET' && path === '/admin/stats') {
      const countOf = async (table: string, filter?: (q: any) => any) => {
        let q = sb.from(table).select('id', { count: 'exact', head: true });
        if (filter) q = filter(q);
        const { count } = await q;
        return count ?? 0;
      };
      const [users, foundItems, lostReports, claimsPending, returned] = await Promise.all([
        countOf('profiles'),
        countOf('found_items'),
        countOf('lost_reports'),
        countOf('claims', (q) => q.eq('status', 'PENDING')),
        countOf('found_items', (q) => q.eq('status', 'RETURNED')),
      ]);
      return json({ users, foundItems, lostReports, claimsPending, returned });
    }

    // GET /admin/users
    if (method === 'GET' && path === '/admin/users') {
      const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      return json((data ?? []).map(serializeUser));
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
      const { data: updated, error } = await sb
        .from('profiles')
        .update({ role })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return json({ error: 'UPDATE_FAILED', message: error.message }, 500);
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
      if ((kind !== 'found' && kind !== 'lost') || !id) {
        return json({ error: 'BAD_REQUEST', message: 'kind (found|lost) e id requeridos' }, 400);
      }
      const table = kind === 'found' ? 'found_items' : 'lost_reports';
      const newStatus = kind === 'found' ? 'PUBLISHED' : 'OPEN';
      const { data, error } = await sb
        .from(table)
        .update({ status: newStatus })
        .eq('id', id)
        .select('id, title')
        .single();
      if (error) return json({ error: 'UPDATE_FAILED', message: error.message }, 500);
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
      const claims = await Promise.all(((data ?? []) as Row[]).map((c) => serializeClaim(sb, c)));
      return json(claims);
    }

    return json({ error: 'NOT_FOUND', message: `Ruta no encontrada: ${method} ${path}` }, 404);
  } catch (e) {
    console.error('[api]', e);
    return json({ error: 'INTERNAL', message: (e as Error).message ?? 'Error interno' }, 500);
  }
});
