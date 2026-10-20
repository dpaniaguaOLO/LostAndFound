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
