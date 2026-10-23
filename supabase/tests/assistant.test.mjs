// Pruebas del asistente Olivia con herramientas (supabase/functions/_shared).
// Node 24 ejecuta los .ts de las Edge Functions (type stripping); OpenAI y
// Supabase se simulan: un "modelo" con guion y una base en memoria.
//   node --test supabase/tests/assistant.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const env = { OPENAI_API_KEY: 'sk-test', APP_TIMEZONE: 'America/Costa_Rica' };
globalThis.Deno = { env: { get: (k) => env[k] } };

const { assistantAgent } = await import('../functions/_shared/llm.ts');
const { runTool } = await import('../functions/_shared/assistantTools.ts');
const { calendarInAppTz } = await import('../functions/_shared/time.ts');

// --- Base en memoria con la API de supabase-js que usan las herramientas ------
const ME = 'u-me', OTHER = 'u-other', ADMIN = 'u-admin';
const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString();
let db;
beforeEach(() => {
  db = {
    profiles: [
      { id: ME, name: 'Ana', role: 'EMPLOYEE', active: true },
      { id: OTHER, name: 'Beto', role: 'EMPLOYEE', active: true },
      { id: ADMIN, name: 'Admin', role: 'ADMIN', active: true },
    ],
    found_items: [
      { id: 'f-ret', title: 'Paraguas negro', description: 'plegable', category: 'OTHER', location: 'Recepción', status: 'RETURNED', reporter_id: OTHER, found_at: daysAgo(40), created_at: daysAgo(40), updated_at: daysAgo(1), returned_at: daysAgo(1) },
      { id: 'f-ret-old', title: 'Gorra', description: 'roja', category: 'CLOTHING', location: 'Parqueo', status: 'RETURNED', reporter_id: OTHER, found_at: daysAgo(60), created_at: daysAgo(60), updated_at: daysAgo(45), returned_at: daysAgo(45) },
      { id: 'f-pub', title: 'Llaves con llavero rojo', description: 'tres llaves', category: 'KEYS', location: 'Cafetería', status: 'PUBLISHED', reporter_id: ME, found_at: daysAgo(2), created_at: daysAgo(2), updated_at: daysAgo(2), returned_at: null },
      { id: 'f-arch', title: 'DNI', description: 'documento', category: 'DOCUMENTS', location: 'Bodega', status: 'ARCHIVED', reporter_id: OTHER, found_at: daysAgo(3), created_at: daysAgo(3), updated_at: daysAgo(3), returned_at: null },
    ],
    lost_reports: [
      { id: 'l-mine', title: 'Cartera café', description: 'de cuero', category: 'WALLET', location: 'Cafetería', status: 'OPEN', reporter_id: ME, lost_at: daysAgo(1), created_at: daysAgo(1), updated_at: daysAgo(1) },
      { id: 'l-closed', title: 'Reloj', description: 'plateado', category: 'JEWELRY', location: '', status: 'CLOSED', reporter_id: OTHER, lost_at: daysAgo(5), created_at: daysAgo(5), updated_at: daysAgo(5) },
    ],
    claims: [
      { id: 'c1', found_item_id: 'f-pub', claimant_id: OTHER, status: 'PENDING', message: 'Son mías, el llavero es rojo', review_note: null, created_at: daysAgo(1), updated_at: daysAgo(1) },
      { id: 'c2', found_item_id: 'f-arch', claimant_id: ME, status: 'REJECTED', message: 'es mío', review_note: null, created_at: daysAgo(2), updated_at: daysAgo(2) },
    ],
    notifications: [
      { id: 'n1', user_id: ME, type: 'CLAIM_REQUESTED', title: 'Nueva reclamación', body: 'Beto reclamó tus llaves', read: false, created_at: daysAgo(1) },
      { id: 'n2', user_id: OTHER, type: 'SYSTEM', title: 'Secreto de Beto', body: 'no debe verse', read: false, created_at: daysAgo(1) },
    ],
    audit_logs: [{ id: 'a1', actor_id: ADMIN, action: 'FOUND_ITEM_ARCHIVED', entity_type: 'FoundItem', summary: 'DNI', created_at: daysAgo(3) }],
  };
});

const profile = (id) => db.profiles.find((p) => p.id === id);
function embed(table, row, cols) {
  const r = { ...row };
  if (cols.includes('reporter:')) r.reporter = { id: row.reporter_id, name: profile(row.reporter_id)?.name };
  if (cols.includes('actor:')) r.actor = { name: profile(row.actor_id)?.name };
  if (table === 'claims') {
    r.claimant = { name: profile(row.claimant_id)?.name };
    const fi = db.found_items.find((f) => f.id === row.found_item_id);
    r.found_item = fi && { ...fi, reporter: { name: profile(fi.reporter_id)?.name } };
  }
  return r;
}
function from(table) {
  const filters = [];
  let cols = '*', head = false, order = null, limit = Infinity, single = false;
  const b = {
    select(c, opts = {}) { cols = c; head = !!opts.head; return b; },
    eq(k, v) { filters.push((r) => r[k] === v); return b; },
    in(k, vs) { filters.push((r) => vs.includes(r[k])); return b; },
    not(k, op, v) { const vs = v.replace(/[()]/g, '').split(','); filters.push((r) => !vs.includes(r[k])); return b; },
    gte(k, v) { filters.push((r) => r[k] != null && r[k] >= v); return b; },
    lt(k, v) { filters.push((r) => r[k] != null && r[k] < v); return b; },
    ilike(k, p) { const s = p.replace(/%/g, '').toLowerCase(); filters.push((r) => String(r[k] ?? '').toLowerCase().includes(s)); return b; },
    order(k, o = {}) { order = { k, asc: o.ascending !== false }; return b; },
    limit(n) { limit = n; return b; },
    maybeSingle() { single = true; return b; },
    then(resolve, reject) {
      try {
        let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) rows = [...rows].sort((a, c) => (a[order.k] ?? '') < (c[order.k] ?? '') ? (order.asc ? -1 : 1) : (a[order.k] ?? '') > (c[order.k] ?? '') ? (order.asc ? 1 : -1) : 0);
        rows = rows.slice(0, limit).map((r) => embed(table, r, cols));
        const res = head ? { count: rows.length, data: null, error: null }
          : single ? { data: rows[0] ?? null, error: null }
          : { data: rows, error: null };
        resolve(res);
      } catch (e) { reject(e); }
    },
  };
  return b;
}
// game_stats() de la BD: puntos y estadísticas por colaborador activo.
const rpc = async (fn) => (fn === 'game_stats' ? { data: db.game_stats ?? [], error: null } : { data: null, error: { message: `rpc ${fn}` } });
const sb = { from, rpc };
const ctxFor = (id, role = 'EMPLOYEE') => ({ sb, caller: { id, name: profile(id).name, role }, seen: new Map() });
const tool = async (ctx, name, args) => runTool(ctx, name, JSON.stringify(args));

// --- "Modelo" con guion: cada respuesta es una función del historial ---------
let script, requests;
function scriptModel(steps) {
  script = [...steps];
  requests = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const step = script.shift();
    const message = typeof step === 'function' ? step(body) : step;
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  };
}
const toolCall = (name, args, id = 'call-1') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const answer = (obj) => ({ role: 'assistant', content: JSON.stringify(obj) });

// --- Herramientas -------------------------------------------------------------
test('buscar_objetos: "devueltos esta semana" usa la fecha de devolución', async () => {
  const ctx = ctxFor(ME);
  const { inicio_semana, hoy } = calendarInAppTz();
  // Siete días atrás cubre "esta semana" sea el día que sea; f-ret-old (hace 45 días) no entra.
  const res = await tool(ctx, 'buscar_objetos', { tipo: 'encontrado', estados: ['RETURNED'], fecha: 'devolucion', desde: inicio_semana < hoy ? inicio_semana : hoy, hasta: hoy });
  const lastWeek = await tool(ctx, 'buscar_objetos', { tipo: 'encontrado', fecha: 'devolucion', desde: new Date(now - 7 * 86_400_000).toISOString().slice(0, 10) });
  assert.deepEqual(lastWeek.objetos.map((o) => o.id), ['f-ret'], 'por defecto con fecha devolucion -> RETURNED');
  assert.ok(lastWeek.objetos[0].devuelto_el);
  assert.ok(!res.objetos.some((o) => o.id === 'f-ret-old'));
});

test('buscar_objetos: lo archivado/cerrado ajeno no lo ve un colaborador, sí un admin', async () => {
  const mine = await tool(ctxFor(ME), 'buscar_objetos', { tipo: 'encontrado', estados: ['ARCHIVED'] });
  assert.equal(mine.total, 0);
  const admin = await tool(ctxFor(ADMIN, 'ADMIN'), 'buscar_objetos', { tipo: 'encontrado', estados: ['ARCHIVED'] });
  assert.equal(admin.total, 1);
  const closed = await tool(ctxFor(ME), 'buscar_objetos', { tipo: 'perdido', estados: ['CLOSED'] });
  assert.equal(closed.total, 0);
});

test('buscar_objetos: texto, solo_mios, estados inválidos y datos no sensibles', async () => {
  const ctx = ctxFor(ME);
  const r = await tool(ctx, 'buscar_objetos', { tipo: 'encontrado', texto: 'llavero rojo', estados: ['HACKED'] });
  assert.deepEqual(r.objetos.map((o) => o.id), ['f-pub']);
  assert.equal(r.objetos[0].es_mio, true);
  assert.ok(!('reporter_id' in r.objetos[0]) && !('image_path' in r.objetos[0]));
  const mine = await tool(ctx, 'buscar_objetos', { tipo: 'perdido', solo_mios: true });
  assert.deepEqual(mine.objetos.map((o) => o.id), ['l-mine']);
});

test('reclamaciones: recibidas y hechas; la bandeja global solo admin', async () => {
  const ctx = ctxFor(ME);
  const recibidas = await tool(ctx, 'reclamaciones', { ambito: 'recibidas' });
  assert.deepEqual(recibidas.reclamaciones.map((c) => c.reclamante), ['Beto']);
  const hechas = await tool(ctx, 'reclamaciones', { ambito: 'hechas' });
  assert.equal(hechas.total, 1);
  assert.ok(!ctx.seen.has('f-arch'), 'objeto archivado ajeno: sin tarjeta');
  assert.ok((await tool(ctx, 'reclamaciones', { ambito: 'todas' })).error);
  assert.equal((await tool(ctxFor(ADMIN, 'ADMIN'), 'reclamaciones', { ambito: 'todas' })).total, 2);
});

test('notificaciones propias; historial solo admin; coincidencias solo de reportes propios', async () => {
  const n = await tool(ctxFor(ME), 'notificaciones', {});
  assert.equal(n.no_leidas, 1);
  assert.ok(!JSON.stringify(n).includes('Secreto'));
  assert.ok((await tool(ctxFor(ME), 'historial', {})).error);
  assert.equal((await tool(ctxFor(ADMIN, 'ADMIN'), 'historial', {})).eventos[0].por, 'Admin');
  assert.ok((await tool(ctxFor(OTHER), 'coincidencias', { reporte_id: '00000000-0000-0000-0000-000000000000' })).error);
});

test('resumen: un colaborador no cuenta lo moderado ajeno; el admin ve métricas extra', async () => {
  const r = await tool(ctxFor(ME), 'resumen', { desde: new Date(now - 7 * 86_400_000).toISOString().slice(0, 10) });
  assert.equal(r.encontrados_por_estado.ARCHIVED, 0);
  assert.equal(r.encontrados_por_estado.RETURNED, 2);
  assert.equal(r.en_el_rango.devueltos, 1);
  assert.equal(r.admin, undefined);
  const a = await tool(ctxFor(ADMIN, 'ADMIN'), 'resumen', {});
  assert.equal(a.encontrados_por_estado.ARCHIVED, 1);
  assert.equal(a.admin.usuarios, 3);
});

// --- Juego (puntos, rangos, ranking, insignias) ----------------------------------
const stats = (points, s = {}) => ({ points, published: 0, published_photo: 0, returned: 0, fast_returned: 0, categories: 0, active_months: 0, ...s });

test('juego: la copia de reglas de la Edge Function coincide con @laf/shared', async () => {
  const edge = await import('../functions/_shared/game.ts');
  const shared = await import('../../packages/shared/dist/index.js');
  assert.deepEqual(edge.POINT_RULES, shared.POINT_RULES);
  assert.deepEqual(edge.RANKS, shared.RANKS);
  assert.deepEqual(edge.FRAME_NAMES, shared.FRAME_NAMES);
  assert.deepEqual([...edge.BADGE_FRAMES], [...shared.BADGE_FRAMES]);
  assert.equal(edge.TOP_PLAYERS, shared.TOP_PLAYERS);
  assert.equal(edge.LEADERBOARD_MAX, shared.LEADERBOARD_MAX);
  const shape = (bs) => bs.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, stat: b.stat, levels: [...b.levels], goals: b.levels.map((n) => b.goal(n)) }));
  assert.deepEqual(shape(edge.BADGES), shape(shared.BADGES));
});

test('mi_juego: puntos, puesto, siguiente rango, quién va delante e insignias', async () => {
  db.game_stats = [
    { user_id: OTHER, ...stats(5600, { published: 40, returned: 30, fast_returned: 12 }) },
    { user_id: ME, ...stats(2650, { published: 20, returned: 15, fast_returned: 3, categories: 4, active_months: 2 }) },
    { user_id: ADMIN, ...stats(0) },
  ];
  const r = await tool(ctxFor(ME), 'mi_juego', {});
  assert.equal(r.puntos, 2650);
  assert.equal(r.puesto, 2);
  assert.equal(r.rango, 'Detective');
  assert.deepEqual([r.siguiente_rango.rango, r.siguiente_rango.te_faltan], ['Experto', 350]);
  assert.deepEqual(r.justo_por_encima, { nombre: 'Beto', puntos: 5600, diferencia: 2950 });
  assert.equal(r.en_top_3, true);
  const samaritan = r.insignias.find((b) => b.insignia === 'Buen samaritano');
  assert.deepEqual([samaritan.nivel, samaritan.progreso], [2, '15/25']);
  assert.equal(r.leyenda_de_olo, false);
});

test('ranking_juego y jugador: top, puesto propio y perfil de otro sin datos sensibles', async () => {
  db.game_stats = [
    { user_id: OTHER, ...stats(5600, { published: 40, returned: 30 }) },
    { user_id: ME, ...stats(50, { published: 1 }) },
    { user_id: ADMIN, ...stats(0) },
  ];
  const rk = await tool(ctxFor(ME), 'ranking_juego', { limite: 5 });
  assert.equal(rk.jugadores_con_puntos, 2);
  assert.deepEqual(rk.top.map((p) => [p.puesto, p.nombre, p.rango]), [[1, 'Beto', 'Experto'], [2, 'Ana', 'Novato']]);
  assert.equal(rk.tu_puesto, 2);

  const j = await tool(ctxFor(ME), 'jugador', { nombre: 'bet' });
  assert.equal(j.jugadores[0].puntos, 5600);
  assert.ok(j.jugadores[0].insignias_conseguidas.some((b) => b.startsWith('Buen samaritano')));
  assert.ok(!JSON.stringify(j).match(/employee|email|@/i), 'sin número de colaborador ni correo');
  assert.equal((await tool(ctxFor(ME), 'jugador', { nombre: 'zzz' })).encontrados, 0);

  const reglas = await tool(ctxFor(ME), 'reglas_juego', {});
  assert.equal(reglas.rangos.length, 7);
  assert.ok(reglas.puntos.some((p) => p.puntos === 100));
});

test('runTool: herramienta desconocida y JSON inválido no lanzan', async () => {
  assert.ok((await runTool(ctxFor(ME), 'borrar_todo', '{}')).error);
  assert.ok((await runTool(ctxFor(ME), 'buscar_objetos', '{nope')).error);
});

// --- Bucle del agente ---------------------------------------------------------
test('agente: consulta con herramientas y solo muestra tarjetas consultadas y visibles', async () => {
  scriptModel([
    toolCall('buscar_objetos', { tipo: 'encontrado', estados: ['RETURNED'], fecha: 'devolucion', desde: new Date(now - 7 * 86_400_000).toISOString().slice(0, 10) }),
    // El modelo intenta colar un id archivado ajeno y otro inventado: se descartan.
    answer({ tipo: 'busqueda', respuesta: 'Esta semana se devolvió 1 objeto: un paraguas negro.', mostrar: ['f-ret', 'f-arch', 'inventado'] }),
  ]);
  const ctx = ctxFor(ME);
  const reply = await assistantAgent('¿qué objetos se devolvieron esta semana?', [], ctx);
  assert.equal(reply.type, 'busqueda');
  assert.deepEqual(reply.show, ['f-ret']);
  assert.match(reply.text, /paraguas/);
  // Contexto enviado al modelo: calendario y usuario, sin número de colaborador.
  const userMsg = JSON.parse(requests[0].messages.at(-1).content);
  assert.equal(userMsg.usuario.nombre, 'Ana');
  assert.ok(userMsg.calendario.inicio_semana);
  assert.equal(requests[0].tools.length, 10);
  // El resultado de la herramienta vuelve al modelo como mensaje "tool".
  const toolMsg = requests[1].messages.find((m) => m.role === 'tool');
  assert.ok(JSON.parse(toolMsg.content).objetos.some((o) => o.id === 'f-ret'));
});

test('agente: la última ronda obliga a responder (tool_choice none) y sin respuesta válida -> null', async () => {
  const loop = () => toolCall('resumen', {});
  scriptModel([loop, loop, loop, loop, answer({ tipo: 'busqueda', respuesta: 'Hay varios objetos.', mostrar: [] })]);
  const reply = await assistantAgent('dame un resumen', [], ctxFor(ME));
  assert.equal(reply.text, 'Hay varios objetos.');
  assert.equal(requests.at(-1).tool_choice, 'none');

  scriptModel([{ role: 'assistant', content: 'no es json' }]);
  assert.equal(await assistantAgent('hola', [], ctxFor(ME)), null);
});

test('agente: sin API key no llama al modelo; credenciales en la respuesta -> texto seguro', async () => {
  delete env.OPENAI_API_KEY;
  scriptModel([]);
  assert.equal(await assistantAgent('hola', [], ctxFor(ME)), null);
  assert.equal(requests.length, 0);
  env.OPENAI_API_KEY = 'sk-test';

  scriptModel([answer({ tipo: 'conversacion', respuesta: 'Envíame tu contraseña y lo reviso.', mostrar: [] })]);
  const reply = await assistantAgent('ayuda', [], ctxFor(ME));
  assert.match(reply.text, /administrador/);
  assert.ok(!/Envíame/.test(reply.text));
});
