// Pruebas de seguridad end-to-end del backend Express.
// Levanta la app real contra una base SQLite temporal (no toca dev.db).
//   npm test --workspace backend
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'laf-sec-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}`;
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.NODE_ENV = 'test';

let server: Server;
let base = '';
let prisma: typeof import('./db.js')['prisma'];
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

type Res = { status: number; data: any; headers: Headers };
async function call(method: string, p: string, opts: { token?: string; body?: unknown; form?: FormData; raw?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.raw !== undefined) { body = opts.raw; headers['Content-Type'] = 'application/json'; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(base + p, { method, headers, body });
  let data: any = null;
  try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
  return { status: res.status, data, headers: res.headers };
}
const login = async (employeeId: string, password = 'password123') =>
  (await call('POST', '/api/auth/login', { body: { employeeId, password } })).data?.token as string;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function itemForm(fields: Record<string, string> = {}, file?: { data: Buffer; type: string; name: string }) {
  const f = new FormData();
  const all = { title: 'Paraguas negro', description: 'Plegable', category: 'OTHER', location: 'Recepción', foundAt: new Date().toISOString(), ...fields };
  for (const [k, v] of Object.entries(all)) f.set(k, v);
  if (file) f.set('image', new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  return f;
}

before(async () => {
  execSync('npx prisma migrate deploy', { cwd: path.resolve(import.meta.dirname, '..'), env: process.env, stdio: 'ignore' });
  ({ prisma } = await import('./db.js'));
  const { hashPassword } = await import('./lib/auth.js');
  const hash = await hashPassword('password123');
  for (const [key, employeeId, role] of [['admin', '1001', 'ADMIN'], ['ana', '2001', 'EMPLOYEE'], ['beto', '2002', 'EMPLOYEE'], ['carla', '2003', 'EMPLOYEE']] as const) {
    const u = await prisma.user.create({ data: { name: key, employeeId, passwordHash: hash, role } });
    ids[key] = u.id;
  }
  const { createApp } = await import('./app.js');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const [k, e] of [['admin', '1001'], ['ana', '2001'], ['beto', '2002'], ['carla', '2003']]) tokens[k] = await login(e);
});

after(async () => {
  server?.close();
  await prisma?.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- 6. Autenticación obligatoria -----------------------------------------------
test('rutas privadas exigen autenticación; health es pública', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  const privateRoutes: [string, string][] = [
    ['GET', '/api/auth/me'], ['GET', '/api/found-items'], ['POST', '/api/found-items'], ['GET', '/api/lost-reports'],
    ['POST', '/api/claims'], ['GET', '/api/claims/mine'], ['GET', '/api/notifications'], ['GET', '/api/admin/stats'],
    ['POST', '/api/ai/search'], ['POST', '/api/auth/logout'],
  ];
  for (const [m, p] of privateRoutes) assert.equal((await call(m, p)).status, 401, `${m} ${p}`);
  assert.equal((await call('GET', '/api/found-items', { token: 'xxx.yyy.zzz' })).status, 401, 'token falso');
});

test('JWT firmado con otro algoritmo o secreto se rechaza', async () => {
  const [h, p] = tokens.ana.split('.');
  const noneAlg = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
  assert.equal((await call('GET', '/api/auth/me', { token: noneAlg })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: `${h}.${p}.firmafalsa` })).status, 401);
});

test('cerrar sesión revoca el token en el servidor', async () => {
  const t = await login('2003');
  assert.equal((await call('GET', '/api/auth/me', { token: t })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', { token: t })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { token: t })).status, 401, 'token revocado');
  assert.equal((await call('GET', '/api/auth/me', { token: tokens.carla })).status, 200, 'otras sesiones siguen');
});

test('restablecer la contraseña invalida las sesiones existentes', async () => {
  const old = await login('2003');
  const r = await call('POST', '/api/admin/users/reset-password', { token: tokens.admin, body: { employeeId: '2003', newPassword: 'otraClave123' } });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { token: old })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: tokens.carla })).status, 401, 'todas sus sesiones');
  tokens.carla = await login('2003', 'otraClave123');
  assert.ok(tokens.carla);
});

test('degradar a un admin le quita el acceso al instante', async () => {
  await call('PATCH', `/api/admin/users/${ids.beto}/role`, { token: tokens.admin, body: { role: 'ADMIN' } });
  assert.equal((await call('GET', '/api/admin/stats', { token: tokens.beto })).status, 200);
  await call('PATCH', `/api/admin/users/${ids.beto}/role`, { token: tokens.admin, body: { role: 'EMPLOYEE' } });
  assert.equal((await call('GET', '/api/admin/stats', { token: tokens.beto })).status, 403);
});

// --- 7. Acceso a registros (IDOR) y 8. mass assignment ----------------------------
test('IDOR: no se puede actuar sobre registros ajenos', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm() })).data;
  ids.anaItem = item.id;
  assert.equal((await call('PATCH', `/api/found-items/${item.id}`, { token: tokens.beto, body: { title: 'x', description: 'yy', category: 'OTHER', location: 'z', foundAt: new Date().toISOString() } })).status, 403);
  assert.equal((await call('PATCH', `/api/found-items/${item.id}/return`, { token: tokens.beto })).status, 403);
  assert.equal((await call('PATCH', `/api/found-items/${item.id}/archive`, { token: tokens.beto })).status, 403);
  assert.equal((await call('DELETE', `/api/found-items/${item.id}`, { token: tokens.beto })).status, 403);

  const claim = (await call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: item.id, message: 'Es mío' } })).data;
  assert.equal((await call('PATCH', `/api/claims/${claim.id}/review`, { token: tokens.carla, body: { status: 'APPROVED' } })).status, 403, 'tercero no aprueba');
  assert.equal((await call('PATCH', `/api/claims/${claim.id}/cancel`, { token: tokens.carla })).status, 404, 'tercero no cancela');
  const anaNotif = (await call('GET', '/api/notifications', { token: tokens.ana })).data[0];
  assert.equal((await call('PATCH', `/api/notifications/${anaNotif.id}/read`, { token: tokens.beto })).status, 404, 'notificación ajena');
  assert.ok(!(await call('GET', '/api/notifications', { token: tokens.beto })).data.some((n: any) => n.id === anaNotif.id));

  const lostForm = new FormData();
  for (const [k, v] of Object.entries({ title: 'Llaves', description: 'rojas', category: 'KEYS', lostAt: new Date().toISOString() })) lostForm.set(k, v);
  const lost = (await call('POST', '/api/lost-reports', { token: tokens.ana, form: lostForm })).data;
  assert.equal((await call('GET', `/api/ai/match/${lost.id}`, { token: tokens.beto })).status, 403, 'sugerencias ajenas');
  for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit', '/api/claims/all']) {
    assert.equal((await call('GET', p, { token: tokens.beto })).status, 403, p);
  }
});

test('mass assignment: el cliente no fija rol, estado ni propietario', async () => {
  const reg = await call('POST', '/api/auth/register', {
    body: { name: 'Intruso', employeeId: '9001', password: 'password123', role: 'ADMIN', sessionVersion: 99 },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.role, 'EMPLOYEE');
  const created = (await call('POST', '/api/found-items', {
    token: tokens.beto,
    form: itemForm({ status: 'ARCHIVED', reporterId: ids.ana, imageSignature: '{}' }),
  })).data;
  assert.equal(created.status, 'PUBLISHED');
  assert.equal(created.reporter.id, ids.beto);
  const self = await call('PATCH', `/api/admin/users/${ids.beto}/role`, { token: tokens.beto, body: { role: 'ADMIN' } });
  assert.equal(self.status, 403);
});

// --- 10. Contraseñas y 17. datos mínimos -----------------------------------------
test('contraseñas: >72 bytes rechazadas, nunca se devuelven hashes', async () => {
  const long = await call('POST', '/api/auth/register', { body: { name: 'Largo', employeeId: '9002', password: 'ñ'.repeat(40) } });
  assert.equal(long.status, 400);
  const stored = await prisma.user.findUnique({ where: { employeeId: '1001' } });
  assert.match(stored!.passwordHash, /^\$2[aby]\$12\$/, 'bcrypt coste 12');
  for (const [p, t] of [['/api/auth/me', tokens.ana], ['/api/admin/users', tokens.admin], ['/api/found-items', tokens.ana]] as const) {
    const text = JSON.stringify((await call('GET', p, { token: t })).data);
    assert.ok(!/passwordHash|sessionVersion|imageSignature|\$2[aby]\$/.test(text), p);
  }
  const wall = (await call('GET', '/api/found-items', { token: tokens.ana })).data.data[0];
  assert.deepEqual(Object.keys(wall.reporter).sort(), ['id', 'name'], 'el muro solo expone id y nombre del autor');
});

test('login: mensaje idéntico exista o no el usuario', async () => {
  const a = await call('POST', '/api/auth/login', { body: { employeeId: '1001', password: 'mala-clave' } });
  const b = await call('POST', '/api/auth/login', { body: { employeeId: 'no-existe', password: 'mala-clave' } });
  assert.deepEqual([a.status, a.data.message], [b.status, b.data.message]);
});

// --- 13/14. Inyección y validación -----------------------------------------------
test('entradas maliciosas o malformadas se rechazan con errores controlados', async () => {
  for (const q of ["' OR 1=1 --", '%', '_', '"; DROP TABLE User; --', '{"$gt": ""}']) {
    const r = await call('GET', `/api/found-items?search=${encodeURIComponent(q)}`, { token: tokens.ana });
    assert.equal(r.status, 200, q);
    assert.equal(r.data.data.length, 0, `sin resultados espurios para ${q}`);
  }
  assert.equal((await call('GET', '/api/found-items?page=abc&status[$ne]=x', { token: tokens.ana })).status, 200);
  assert.equal((await call('POST', '/api/claims', { token: tokens.ana, raw: '{malformed' })).status, 400);
  assert.equal((await call('POST', '/api/ai/search', { token: tokens.ana, body: { query: 'x'.repeat(301) } })).status, 400);
  assert.equal((await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ foundAt: '2999-01-01T00:00:00.000Z' }) })).status, 400, 'fecha futura');
  assert.equal((await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ category: 'HACK' }) })).status, 400);
  const big = await call('POST', '/api/claims', { token: tokens.ana, raw: JSON.stringify({ foundItemId: 'x', message: 'y'.repeat(200_000) }) });
  assert.equal(big.status, 413);
  const err = await call('POST', '/api/claims', { token: tokens.ana, raw: '{malformed' });
  assert.ok(!/at |\.ts|prisma|stack/i.test(JSON.stringify(err.data)), 'sin detalles internos');
});

// --- 16. Archivos ------------------------------------------------------------------
test('archivos: tipo real verificado, URL firmada obligatoria, sin EXIF', async () => {
  const html = await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({}, { data: Buffer.from('<script>alert(1)</script>'), type: 'image/png', name: 'x.html' }) });
  assert.equal(html.status, 400);

  // JPEG con EXIF (marca de cámara) subido con nombre engañoso.
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } })
    .jpeg().withMetadata({ exif: { IFD0: { Make: 'CamaraEspia', Model: 'GPS-Phone' } } }).toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif, 'precondición: el original tiene EXIF');
  const up = await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({}, { data: jpeg, type: 'image/jpeg', name: '../../evil.php' }) });
  assert.equal(up.status, 201);
  const url: string = up.data.imageUrl;
  assert.match(url, /^\/uploads\/[A-Za-z0-9_-]+\.jpg\?exp=\d+&sig=[A-Za-z0-9_-]+$/);

  const file = path.join(process.env.UPLOAD_DIR!, url.split('?')[0].split('/').pop()!);
  assert.equal((await sharp(file).metadata()).exif, undefined, 'EXIF eliminado en disco');

  const ok = await fetch(base + url);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal((await fetch(base + url.split('?')[0])).status, 403, 'sin firma');
  assert.equal((await fetch(base + url.replace(/sig=.{4}/, 'sig=AAAA'))).status, 403, 'firma alterada');
  const past = Math.floor(Date.now() / 1000) - 10;
  assert.equal((await fetch(base + url.replace(/exp=\d+/, `exp=${past}`))).status, 403, 'caducada');
  assert.equal((await fetch(`${base}/uploads/..%2f..%2fpackage.json?exp=9999999999&sig=x`)).status, 403, 'path traversal');
  // PNG declarado como JPEG: se guarda con la extensión real.
  const mislabeled = await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({}, { data: PNG, type: 'image/jpeg', name: 'foto.jpg' }) });
  assert.match(mislabeled.data.imageUrl, /\.png\?/);
});

// --- 18. Cabeceras -----------------------------------------------------------------
test('cabeceras de seguridad en las respuestas de la API', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('permissions-policy') ?? '', /geolocation=\(\)/);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('access-control-allow-credentials'), null, 'CORS sin credenciales');
});

// --- 11. Rate limiting ---------------------------------------------------------------
test('rate limiting: login por IP/usuario y endpoints de IA por usuario', async () => {
  let last: Res | undefined;
  for (let i = 0; i < 11; i++) last = await call('POST', '/api/auth/login', { body: { employeeId: 'brute', password: 'x' } });
  assert.equal(last!.status, 429);
  assert.ok(Number(last!.headers.get('retry-after')) > 0);
  const t = tokens.carla;
  let ai: Res | undefined;
  for (let i = 0; i < 31; i++) ai = await call('POST', '/api/ai/assistant', { token: t, body: { question: 'objetos encontrados' } });
  assert.equal(ai!.status, 429);
  assert.equal((await call('POST', '/api/ai/assistant', { token: tokens.ana, body: { question: 'objetos encontrados' } })).status, 200, 'otro usuario no se ve afectado');
});

// --- Auditoría 2026-10-22: INT-01 (restaurar) e INT-06 (último admin) -----------
test('restaurar: solo desde ARCHIVED y respetando la reclamación aprobada', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Termo azul' }) })).data;
  const claim = (await call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: item.id, message: 'Es mío' } })).data;
  assert.equal((await call('PATCH', `/api/claims/${claim.id}/review`, { token: tokens.ana, body: { status: 'APPROVED' } })).status, 200);
  assert.equal((await call('POST', '/api/admin/restore', { token: tokens.admin, body: { kind: 'found', id: item.id } })).status, 409, 'no archivado');
  assert.equal((await call('PATCH', `/api/found-items/${item.id}/archive`, { token: tokens.admin })).status, 200);
  assert.equal((await call('POST', '/api/admin/restore', { token: tokens.admin, body: { kind: 'found', id: item.id } })).status, 200);
  assert.equal((await call('GET', `/api/found-items/${item.id}`, { token: tokens.ana })).data.status, 'CLAIMED', 'vuelve a CLAIMED, no a PUBLISHED');
  const second = await call('POST', '/api/claims', { token: tokens.carla, body: { foundItemId: item.id, message: 'También mío' } });
  assert.equal(second.status, 400, 'no se puede abrir una segunda reclamación');
});

test('no se puede quitar el rol al último administrador', async () => {
  const r = await call('PATCH', `/api/admin/users/${ids.admin}/role`, { token: tokens.admin, body: { role: 'EMPLOYEE' } });
  assert.equal(r.status, 400);
  assert.equal((await call('GET', '/api/admin/stats', { token: tokens.admin })).status, 200, 'sigue siendo admin');
});

// --- Auditoría 2026-10-22: paridad del backend REST (FUN-01, INT-02/03/04) ------
test('FUN-01: editar con multipart funciona (sin reenviar la fecha)', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Bufanda' }) })).data;
  const f = new FormData();
  for (const [k, v] of Object.entries({ title: 'Bufanda gris', description: 'De lana', category: 'CLOTHING', location: 'Lobby' })) f.set(k, v);
  const r = await call('PATCH', `/api/found-items/${item.id}`, { token: tokens.ana, form: f });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.title, 'Bufanda gris');
  assert.equal(r.data.foundAt, item.foundAt, 'la fecha se conserva si no se envía');
});

test('INT-02: reclamaciones simultáneas del mismo usuario no se duplican', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Reloj' }) })).data;
  const res = await Promise.all([1, 2, 3].map(() =>
    call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: item.id, message: 'Es mío' } })));
  assert.equal(res.filter((r) => r.status === 201).length, 1, res.map((r) => r.status).join(','));
  const pending = await prisma.claim.count({ where: { foundItemId: item.id, status: 'PENDING' } });
  assert.equal(pending, 1);
});

test('INT-03/04: lo archivado se oculta, no lo reabre el autor y cierra las pendientes', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Mochila' }) })).data;
  const claim = (await call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: item.id, message: 'Es mía' } })).data;
  assert.equal((await call('PATCH', `/api/found-items/${item.id}/archive`, { token: tokens.admin })).status, 200);
  assert.equal((await prisma.claim.findUnique({ where: { id: claim.id } }))!.status, 'REJECTED', 'pendiente cerrada');
  assert.ok((await call('GET', '/api/notifications', { token: tokens.beto })).data.some((n: any) => n.title === 'Objeto retirado'));
  assert.equal((await call('GET', `/api/found-items/${item.id}`, { token: tokens.carla })).status, 404, 'tercero no lo ve');
  assert.equal((await call('GET', `/api/found-items/${item.id}`, { token: tokens.ana })).status, 200, 'el autor sí');
  assert.equal((await call('PATCH', `/api/found-items/${item.id}/return`, { token: tokens.ana })).status, 403, 'no lo reabre');
});

test('el autor elimina sus publicaciones, salvo con entrega en curso o moderadas', async () => {
  const item = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Termo' }) })).data;
  await call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: item.id, message: 'Es mío' } });
  assert.equal((await call('DELETE', `/api/found-items/${item.id}`, { token: tokens.carla })).status, 403, 'tercero no');
  assert.equal((await call('DELETE', `/api/found-items/${item.id}`, { token: tokens.ana })).status, 200);
  const notices = (await call('GET', '/api/notifications', { token: tokens.beto })).data;
  assert.ok(notices.some((n: any) => n.body.includes('"Termo"') && n.body.includes('quien lo publicó')), 'aviso al reclamante');

  const claimed = (await call('POST', '/api/found-items', { token: tokens.ana, form: itemForm({ title: 'Gafas' }) })).data;
  const claim = (await call('POST', '/api/claims', { token: tokens.beto, body: { foundItemId: claimed.id, message: 'Son mías' } })).data;
  await call('PATCH', `/api/claims/${claim.id}/review`, { token: tokens.ana, body: { status: 'APPROVED' } });
  assert.equal((await call('DELETE', `/api/found-items/${claimed.id}`, { token: tokens.ana })).status, 403, 'entrega en curso');
  assert.equal((await call('PATCH', `/api/found-items/${claimed.id}/return`, { token: tokens.ana })).status, 200);
  assert.equal((await call('DELETE', `/api/found-items/${claimed.id}`, { token: tokens.ana })).status, 200, 'ya devuelto');

  const lostForm = () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ title: 'Cartera', description: 'negra', category: 'WALLET', lostAt: new Date().toISOString() })) f.set(k, v);
    return f;
  };
  const lost = (await call('POST', '/api/lost-reports', { token: tokens.ana, form: lostForm() })).data;
  assert.equal((await call('DELETE', `/api/lost-reports/${lost.id}`, { token: tokens.beto })).status, 403, 'tercero no');
  assert.equal((await call('DELETE', `/api/lost-reports/${lost.id}`, { token: tokens.ana })).status, 200);
  const closed = (await call('POST', '/api/lost-reports', { token: tokens.ana, form: lostForm() })).data;
  await call('PATCH', `/api/lost-reports/${closed.id}/close`, { token: tokens.admin });
  assert.equal((await call('DELETE', `/api/lost-reports/${closed.id}`, { token: tokens.ana })).status, 403, 'cerrado: solo admin');
});

test('asistente: "¿qué se devolvió esta semana?" usa la fecha de devolución', async () => {
  // Encontrado hace un mes y devuelto hoy: cuenta como devuelto esta semana.
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const item = (await call('POST', '/api/found-items', { token: tokens.beto, form: itemForm({ title: 'Bufanda azul', foundAt: old }) })).data;
  const returned = await call('PATCH', `/api/found-items/${item.id}/return`, { token: tokens.beto });
  assert.equal(returned.status, 200);
  assert.ok(returned.data.returnedAt, 'returnedAt en la respuesta');

  const r = await call('POST', '/api/ai/assistant', { token: tokens.beto, body: { question: '¿Qué objetos se devolvieron esta semana?' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.foundItems.some((f: any) => f.id === item.id && f.status === 'RETURNED'));
  assert.match(r.data.answer, /devuelto/);
  // Sin "devuelto", el asistente sigue mostrando solo lo disponible del muro.
  const wall = await call('POST', '/api/ai/assistant', { token: tokens.beto, body: { question: 'bufanda' } });
  assert.ok(!wall.data.foundItems.some((f: any) => f.id === item.id));
});

// --- Juego: puntos, ranking y foto de perfil (paridad con la migración 016) --------
test('juego: 50 por publicar, +100 por devolver con reclamación, +50 si es rápida; ranking top 100', async () => {
  const points = async () => (await call('GET', `/api/game/players/${ids.carla}`, { token: tokens.ana })).data;
  const start = await points();
  // Publicar da 50; "devolver" sin reclamación no suma más.
  const solo = (await call('POST', '/api/found-items', { token: tokens.carla, form: itemForm({ title: 'Llavero' }) })).data;
  await call('PATCH', `/api/found-items/${solo.id}/return`, { token: tokens.carla });
  let p = await points();
  assert.equal(p.points, start.points + 50);
  assert.equal(p.stats.published, start.stats.published + 1);

  // Con reclamación aprobada de otra persona, el mismo día: 50 + 100 + 50.
  const item = (await call('POST', '/api/found-items', { token: tokens.carla, form: itemForm({ title: 'Cargador' }) })).data;
  const claim = (await call('POST', '/api/claims', { token: tokens.ana, body: { foundItemId: item.id, message: 'Es mío' } })).data;
  await call('PATCH', `/api/claims/${claim.id}/review`, { token: tokens.carla, body: { status: 'APPROVED' } });
  await call('PATCH', `/api/found-items/${item.id}/return`, { token: tokens.carla });
  p = await points();
  assert.equal(p.points, start.points + 250);
  assert.ok(p.stats.categories >= 1 && p.stats.activeMonths >= 1);
  assert.deepEqual([p.stats.returned, p.stats.fastReturned], [start.stats.returned + 1, start.stats.fastReturned + 1]);
  assert.ok(p.rank >= 1);
  assert.equal(p.role, 'EMPLOYEE');

  const board = (await call('GET', '/api/game/leaderboard?offset=0&limit=30', { token: tokens.beto })).data;
  assert.ok(board.entries.every((e: any) => e.points > 0));
  assert.equal(board.entries.find((e: any) => e.id === ids.carla)?.rank, p.rank);
  assert.equal(board.entries[0].passwordHash, undefined);
  assert.equal((await call('GET', '/api/game/leaderboard?offset=100', { token: tokens.beto })).data.entries.length, 0);
  assert.equal((await call('GET', '/api/game/leaderboard')).status, 401);
  assert.deepEqual((await call('GET', '/api/game/admins', { token: tokens.beto })).data, [ids.admin]);
  assert.equal((await call('GET', '/api/game/players/no-existe', { token: tokens.beto })).status, 404);

  // Archivar (moderación) quita todos los puntos de ese objeto.
  await call('PATCH', `/api/found-items/${item.id}/archive`, { token: tokens.admin });
  assert.equal((await points()).points, start.points + 50);
});

test('juego: los perdidos activos del top 3 salen primero en el muro, en orden de ranking', async () => {
  const board = (await call('GET', '/api/game/leaderboard?limit=3', { token: tokens.ana })).data.entries;
  const leader = board[0].id as string;
  const outsider = Object.values(ids).find((id) => !board.some((e: any) => e.id === id));
  const lost = (reporterId: string, title: string, createdAt: Date) =>
    prisma.lostReport.create({ data: { title, description: 'x', category: 'OTHER', location: '', lostAt: createdAt, createdAt, reporterId } });
  const mine = await lost(leader, 'Del líder', new Date(Date.now() - 86_400_000));
  if (outsider) await lost(outsider, 'Más reciente', new Date());
  const wall = (await call('GET', '/api/lost-reports', { token: tokens.ana })).data;
  assert.equal(wall.data[0].reporter.id, leader, 'los del nº 1 van primero aunque haya otros más recientes');
  assert.equal(wall.data[0].pinned, true);
  const ranks = wall.data.filter((r: any) => r.pinned).map((r: any) => board.findIndex((e: any) => e.id === r.reporter.id));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'destacados en orden de ranking');
  assert.equal(wall.data.find((r: any) => r.id === mine.id)?.pinned, true);
  assert.ok(wall.data.findIndex((r: any) => !r.pinned) > wall.data.findIndex((r: any) => r.id === mine.id));
  assert.equal(wall.data.filter((r: any) => r.id === mine.id).length, 1, 'sin duplicados');
  const page2 = (await call('GET', '/api/lost-reports?page=2', { token: tokens.ana })).data;
  assert.ok(!page2.data.some((r: any) => r.pinned));
  // Resuelto: deja de estar destacado.
  await prisma.lostReport.update({ where: { id: mine.id }, data: { status: 'RESOLVED' } });
  const after = (await call('GET', '/api/lost-reports', { token: tokens.ana })).data.data;
  assert.ok(!after.some((r: any) => r.id === mine.id && r.pinned));
});

test('juego: foto de perfil cuadrada, sin EXIF, con URL firmada y reemplazable', async () => {
  const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#3a3' } })
    .jpeg().withMetadata({ exif: { IFD0: { Make: 'CamaraEspia' } } }).toBuffer();
  const form = () => {
    const f = new FormData();
    f.set('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'yo.jpg');
    return f;
  };
  const html = new FormData();
  html.set('image', new Blob(['<script>x</script>'], { type: 'image/png' }), 'x.png');
  assert.equal((await call('PUT', '/api/game/avatar', { token: tokens.beto, form: html })).status, 400);

  const first = await call('PUT', '/api/game/avatar', { token: tokens.beto, form: form() });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.match(first.data.avatarUrl, /^\/uploads\/[A-Za-z0-9_-]+\.jpg\?exp=\d+&sig=/);
  const file1 = path.join(process.env.UPLOAD_DIR!, first.data.avatarUrl.split('?')[0].split('/').pop()!);
  const meta = await sharp(file1).metadata();
  assert.deepEqual([meta.width, meta.height, meta.exif], [512, 512, undefined]);
  assert.equal((await fetch(base + first.data.avatarUrl)).status, 200);
  assert.ok((await call('GET', '/api/auth/me', { token: tokens.beto })).data.avatarUrl);
  assert.ok((await call('GET', `/api/game/players/${ids.beto}`, { token: tokens.ana })).data.avatarUrl, 'visible para otros');

  const second = await call('PUT', '/api/game/avatar', { token: tokens.beto, form: form() });
  assert.equal(second.status, 200);
  assert.equal(fs.existsSync(file1), false, 'la foto anterior se borra');
  const removed = await call('DELETE', '/api/game/avatar', { token: tokens.beto });
  assert.equal(removed.data.avatarUrl, null);
});
