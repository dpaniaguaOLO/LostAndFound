// Pruebas de seguridad de la base de datos de Supabase (RLS, privilegios, RPCs).
// Ejecuta TODAS las migraciones sobre Postgres real (PGlite, WASM) con los esquemas
// `auth` y `storage` de Supabase simulados. No necesita Docker ni red.
//   npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const db = new PGlite();

const A = '00000000-0000-0000-0000-00000000000a'; // admin
const B = '00000000-0000-0000-0000-00000000000b'; // autor de objetos
const C = '00000000-0000-0000-0000-00000000000c'; // reclamante
const D = '00000000-0000-0000-0000-00000000000d'; // otro colaborador

// --- helpers -----------------------------------------------------------------
async function asServer(sql, params) {
  await db.exec(`reset role; select set_config('test.uid', '', false);`);
  return db.query(sql, params);
}
async function asUser(uid, sql, params) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function asRole(role, sql, params) {
  await db.exec(`reset role; select set_config('test.uid', '', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function error(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}
const one = async (sql, p) => (await asServer(sql, p)).rows[0];
const newItem = async (reporter, extra = '') =>
  (await one(`insert into public.found_items (title, description, category, found_at, reporter_id ${extra ? ', status' : ''})
              values ('Paraguas', 'negro', 'OTHER', now(), $1 ${extra ? `, '${extra}'` : ''}) returning id`, [reporter])).id;
const newClaim = async (item, claimant) =>
  (await one(`insert into public.claims (found_item_id, claimant_id, message) values ($1, $2, 'es mío') returning id`, [item, claimant])).id;
const review = (claim, actor, status, note = null) =>
  asRole('service_role', `select public.review_claim($1, $2, $3, $4)`, [claim, actor, status, note]);

before(async () => {
  await db.exec(`
    create role authenticated nologin; create role anon nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
    create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), token text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema auth, storage to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    grant select, insert, update, delete on storage.objects to authenticated;
    -- Privilegios por defecto equivalentes a los de un proyecto Supabase.
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  // SKIP_MIGRATION=<prefijo> permite comprobar que las pruebas fallan sin una migración.
  const skip = process.env.SKIP_MIGRATION;
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !(skip && f.startsWith(skip))).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  for (const [id, emp] of [[A, '1001'], [B, '2002'], [C, '3003'], [D, '4004']]) {
    await asServer(`insert into auth.users values ($1, $2, $3)`, [id, `${emp}@x`, { name: `User ${emp}`, employee_id: emp }]);
  }
  await asServer(`update public.profiles set role = 'ADMIN' where id = $1`, [A]);
});

// --- Migración 005: RLS de reclamaciones/objetos/perfiles ---------------------
test('reclamante no puede autoaprobarse ni insertar reclamaciones directamente', async () => {
  const item = await newItem(B);
  const claim = await newClaim(item, C);
  await error(() => asUser(C, `update public.claims set status = 'APPROVED' where id = $1`, [claim]));
  assert.equal((await one(`select status from public.claims where id = $1`, [claim])).status, 'PENDING');
  assert.ok(await error(() => asUser(C, `insert into public.claims (found_item_id, claimant_id, message) values ($1, $2, 'x')`, [item, C])));
  assert.equal((await asUser(C, `select id from public.claims where id = $1`, [claim])).rows.length, 1, 'puede leer la suya');
  assert.equal((await asUser(D, `select id from public.claims where id = $1`, [claim])).rows.length, 0, 'un tercero no la ve (IDOR)');
});

test('transiciones de estado de objetos para no-admins', async () => {
  const item = await newItem(B);
  assert.ok(await error(() => asUser(B, `update public.found_items set status = 'CLAIMED' where id = $1`, [item])));
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [item]);
  // Archivado por un admin: el autor no puede reabrirlo (desde la migración 010 ni
  // siquiera puede editar la fila: el UPDATE no afecta a nada).
  await error(() => asUser(B, `update public.found_items set status = 'PUBLISHED' where id = $1`, [item]));
  assert.equal((await one(`select status from public.found_items where id = $1`, [item])).status, 'ARCHIVED');
  await asServer(`update public.found_items set status = 'PUBLISHED' where id = $1`, [item]);
  await asUser(B, `update public.found_items set status = 'RETURNED' where id = $1`, [item]);
  assert.equal((await one(`select status from public.found_items where id = $1`, [item])).status, 'RETURNED');
  // Un usuario no puede modificar objetos ajenos (RLS filtra la fila).
  const other = await newItem(B);
  await asUser(D, `update public.found_items set title = 'hackeado' where id = $1`, [other]);
  assert.equal((await one(`select title from public.found_items where id = $1`, [other])).title, 'Paraguas');
});

test('perfiles: sin autopromoción, sin cambiar identificadores, siempre queda un admin', async () => {
  assert.ok(await error(() => asUser(B, `update public.profiles set role = 'ADMIN' where id = $1`, [B])));
  assert.ok(await error(() => asUser(B, `update public.profiles set employee_id = '9999' where id = $1`, [B])));
  // Migración 010: el nombre tampoco es editable por el usuario (anti-suplantación).
  assert.ok(await error(() => asUser(B, `update public.profiles set name = 'Administrador OLO' where id = $1`, [B])));
  assert.notEqual((await one(`select name from public.profiles where id = $1`, [B])).name, 'Administrador OLO');
  assert.ok(await error(() => asServer(`update public.profiles set role = 'EMPLOYEE' where id = $1`, [A])), 'último admin');
});

// --- Migración 006: review_claim ---------------------------------------------
test('review_claim: solo service_role puede ejecutarla', async () => {
  const claim = await newClaim(await newItem(B), C);
  assert.match((await error(() => asRole('authenticated', `select public.review_claim($1, $2, 'APPROVED')`, [claim, B]))).message, /permission denied/);
  assert.ok(await error(() => asRole('anon', `select public.review_claim($1, $2, 'APPROVED')`, [claim, B])));
});

test('review_claim: aprobación atómica con cascada, notificaciones y auditoría', async () => {
  const item = await newItem(B);
  const c1 = await newClaim(item, C);
  const c2 = await newClaim(item, D);
  assert.equal((await error(() => review(c1, D, 'APPROVED'))).hint, '403', 'tercero');
  assert.equal((await error(() => review(c1, B, 'MAYBE'))).hint, '400');
  await review(c1, B, 'APPROVED', '  recoger en recepción ');
  assert.equal((await one(`select status from public.found_items where id = $1`, [item])).status, 'CLAIMED');
  const s2 = await one(`select status, reviewer_id from public.claims where id = $1`, [c2]);
  assert.deepEqual([s2.status, s2.reviewer_id], ['REJECTED', B]);
  const nD = (await asServer(`select type from public.notifications where user_id = $1 and related_item_id = $2`, [D, item])).rows;
  assert.ok(nD.some((n) => n.type === 'CLAIM_REJECTED'));
  assert.equal((await error(() => review(c1, B, 'REJECTED'))).hint, '400', 'ya procesada');
  const late = await newClaim(item, D);
  assert.equal((await error(() => review(late, B, 'APPROVED'))).hint, '400', 'objeto ya CLAIMED');
});

test('review_claim: nadie revisa su propia reclamación (ni un admin)', async () => {
  const claim = await newClaim(await newItem(B), A);
  assert.equal((await error(() => review(claim, A, 'APPROVED'))).hint, '403');
  assert.equal((await one(`select status from public.claims where id = $1`, [claim])).status, 'PENDING');
});

// --- Migración 007: privilegios por columna, datos mínimos, validación ----------
test('anon no accede a ninguna tabla', async () => {
  for (const t of ['profiles', 'found_items', 'lost_reports', 'claims', 'notifications', 'audit_logs']) {
    assert.match((await error(() => asRole('anon', `select 1 from public.${t} limit 1`))).message, /permission denied/, t);
  }
});

test('perfiles: employee_id/email no legibles por otros; my_profile() devuelve el propio', async () => {
  assert.match((await error(() => asUser(B, `select employee_id from public.profiles`))).message, /permission denied/);
  assert.match((await error(() => asUser(B, `select email from public.profiles`))).message, /permission denied/);
  const names = (await asUser(B, `select id, name, role from public.profiles`)).rows;
  assert.ok(names.length >= 4, 'sigue viendo nombres (muro)');
  const me = (await asUser(B, `select * from public.my_profile()`)).rows;
  assert.equal(me.length, 1);
  assert.equal(me[0].employee_id, '2002');
  assert.match((await error(() => asRole('anon', `select * from public.my_profile()`))).message, /permission denied/);
});

test('mass assignment: el cliente no puede fijar status ni campos internos', async () => {
  assert.match((await error(() => asUser(B,
    `insert into public.found_items (title, description, category, found_at, reporter_id, status)
     values ('x1', 'y1', 'OTHER', now(), $1, 'ARCHIVED')`, [B]))).message, /permission denied/);
  assert.match((await error(() => asUser(B,
    `insert into public.found_items (title, description, category, found_at, reporter_id, image_signature)
     values ('x1', 'y1', 'OTHER', now(), $1, '{}')`, [B]))).message, /permission denied/);
  const ok = (await asUser(B,
    `insert into public.found_items (title, description, category, found_at, reporter_id)
     values ('Llaves', 'rojas', 'KEYS', now(), $1) returning id, status`, [B])).rows[0];
  assert.equal(ok.status, 'PUBLISHED');
  assert.ok(await error(() => asUser(B, `insert into public.found_items (title, description, category, found_at, reporter_id)
     values ('Llaves', 'rojas', 'KEYS', now(), $1)`, [C])), 'no puede publicar a nombre de otro');
  assert.match((await error(() => asUser(B, `update public.found_items set reporter_id = $2 where id = $1`, [ok.id, C]))).message, /permission denied/);
});

test('notificaciones: solo se puede cambiar "read", y solo las propias', async () => {
  const n = (await one(`insert into public.notifications (user_id, type, title, body) values ($1, 'SYSTEM', 't', 'b') returning id`, [C])).id;
  assert.match((await error(() => asUser(C, `update public.notifications set title = 'x' where id = $1`, [n]))).message, /permission denied/);
  await asUser(D, `update public.notifications set read = true where id = $1`, [n]);
  assert.equal((await one(`select read from public.notifications where id = $1`, [n])).read, false, 'ajena: sin efecto');
  await asUser(C, `update public.notifications set read = true where id = $1`, [n]);
  assert.equal((await one(`select read from public.notifications where id = $1`, [n])).read, true);
  assert.equal((await asUser(D, `select id from public.notifications where id = $1`, [n])).rows.length, 0);
});

test('validación en BD: categoría, longitudes y foto de carpeta propia', async () => {
  const ins = (cat, loc, img) => asUser(B,
    `insert into public.found_items (title, description, category, location, found_at, reporter_id, image_path)
     values ('Bolso', 'azul', $1, $2, now(), $3, $4)`, [cat, loc, B, img]);
  assert.ok(await error(() => ins('HACK', '', null)), 'categoría inválida');
  assert.ok(await error(() => ins('BAGS', 'x'.repeat(201), null)), 'ubicación > 200');
  assert.ok(await error(() => ins('BAGS', '', `${C}/foto.jpg`)), 'foto de otro usuario');
  assert.equal(await error(() => ins('BAGS', 'Recepción', `${B}/foto.jpg`)), null, 'caso válido');
});

test('storage: no se puede mover un archivo a la carpeta de otro', async () => {
  const obj = (await one(`insert into storage.objects (bucket_id, name) values ('item-photos', $1) returning id`, [`${B}/a.jpg`])).id;
  assert.ok(await error(() => asUser(B, `update storage.objects set name = $2 where id = $1`, [obj, `${C}/a.jpg`])));
});

test('rate_limit_hit: bloquea al superar el máximo y solo la usa service_role', async () => {
  const hit = () => asRole('service_role', `select public.rate_limit_hit('t:k', 3, 60) as wait`);
  const waits = [];
  for (let i = 0; i < 4; i++) waits.push((await hit()).rows[0].wait);
  assert.deepEqual(waits.slice(0, 3), [0, 0, 0]);
  assert.ok(waits[3] > 0 && waits[3] <= 60);
  assert.ok(await error(() => asRole('authenticated', `select public.rate_limit_hit('x', 1, 60)`)));
  assert.ok(await error(() => asUser(B, `select * from public.rate_limits`)));
});

test('revoke_user_sessions: borra sesiones del usuario y solo la usa service_role', async () => {
  await asServer(`insert into auth.sessions (user_id) values ($1), ($2)`, [C, D]);
  await asServer(`insert into auth.refresh_tokens (user_id, token) values ($1, 't1'), ($2, 't2')`, [C, D]);
  assert.ok(await error(() => asRole('authenticated', `select public.revoke_user_sessions($1)`, [C])));
  await asRole('service_role', `select public.revoke_user_sessions($1)`, [C]);
  assert.equal((await one(`select count(*)::int n from auth.sessions where user_id = $1`, [C])).n, 0);
  assert.equal((await one(`select count(*)::int n from auth.refresh_tokens where user_id = $1`, [C])).n, 0);
  assert.equal((await one(`select count(*)::int n from auth.sessions where user_id = $1`, [D])).n, 1, 'otros intactos');
});


// --- Migración 009: flujo reclamación -> entrega -------------------------------
const newLost = async (reporter) =>
  (await one(`insert into public.lost_reports (title, description, category, lost_at, reporter_id)
              values ('Paraguas', 'negro', 'OTHER', now(), $1) returning id`, [reporter])).id;
const notifs = async (user, item, type) =>
  (await one(`select count(*)::int n from public.notifications where user_id = $1 and related_item_id = $2 and type = $3`, [user, item, type])).n;

test('entrega: aviso al dueño, reporte resuelto, pendientes cerradas y auditoría', async () => {
  const item = await newItem(B);
  const lost = await newLost(C);
  const claim = (await one(`insert into public.claims (found_item_id, claimant_id, message, lost_report_id)
                            values ($1, $2, 'es mío', $3) returning id`, [item, C, lost])).id;
  await review(claim, B, 'APPROVED');
  assert.equal((await one(`select status from public.lost_reports where id = $1`, [lost])).status, 'MATCHED');

  // Pendiente "colgada" de otro usuario (datos previos a la regla de solo PUBLISHED).
  const stale = await newClaim(item, D);

  // El autor marca la entrega desde la app (update directo, como hace el APK).
  await asUser(B, `update public.found_items set status = 'RETURNED' where id = $1`, [item]);

  assert.equal(await notifs(C, item, 'ITEM_RETURNED'), 1, 'el dueño recibe aviso de entrega');
  assert.equal((await one(`select status from public.lost_reports where id = $1`, [lost])).status, 'RESOLVED');
  const s = await one(`select status, reviewer_id from public.claims where id = $1`, [stale]);
  assert.equal(s.status, 'REJECTED', 'la pendiente se cierra');
  assert.equal(s.reviewer_id, B);
  assert.equal(await notifs(D, item, 'CLAIM_REJECTED'), 1, 'y se avisa a su reclamante');
  assert.equal((await one(`select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'FOUND_ITEM_RETURNED'`, [item])).n, 1);

  // Volver a guardar RETURNED no repite efectos.
  await asServer(`update public.found_items set title = 'Paraguas negro' where id = $1`, [item]);
  assert.equal(await notifs(C, item, 'ITEM_RETURNED'), 1);
});

test('entrega sin reclamación aprobada (devuelto en mano): sin errores ni avisos', async () => {
  const item = await newItem(B);
  await asUser(B, `update public.found_items set status = 'RETURNED' where id = $1`, [item]);
  assert.equal((await one(`select status from public.found_items where id = $1`, [item])).status, 'RETURNED');
  assert.equal((await one(`select count(*)::int n from public.notifications where related_item_id = $1`, [item])).n, 0);
});

test('reclamación: el reporte de perdido enlazado debe ser del reclamante', async () => {
  const item = await newItem(B);
  const lostOfD = await newLost(D);
  assert.ok(await error(() => asServer(
    `insert into public.claims (found_item_id, claimant_id, message, lost_report_id) values ($1, $2, 'x', $3)`,
    [item, C, lostOfD])));
});


// --- Migración 010: correcciones de la auditoría de seguridad -----------------
test('cuenta desactivada: sin acceso a datos y un admin desactivado deja de ser admin', async () => {
  const E = '00000000-0000-0000-0000-00000000000e';
  await asServer(`insert into auth.users values ($1, '5005@x', $2)`, [E, { name: 'User 5005', employee_id: '5005' }]);
  await asServer(`update public.profiles set role = 'ADMIN' where id = $1`, [E]);
  const item = await newItem(B);
  assert.equal((await asUser(E, `select public.is_admin() a`)).rows[0].a, true);
  await asServer(`update public.profiles set active = false where id = $1`, [E]);

  assert.equal((await asUser(E, `select public.is_admin() a`)).rows[0].a, false, 'ya no es admin');
  assert.equal((await asUser(E, `select id from public.found_items`)).rows.length, 0, 'no lee objetos');
  assert.ok(await error(() => asUser(E, `insert into public.found_items (title, description, category, found_at, reporter_id)
                                         values ('x', 'yy', 'OTHER', now(), $1)`, [E])), 'no publica');
  await asUser(E, `update public.found_items set status = 'ARCHIVED' where id = $1`, [item]);
  assert.equal((await one(`select status from public.found_items where id = $1`, [item])).status, 'PUBLISHED', 'no modera');
  assert.equal((await asUser(E, `select id from public.audit_logs`)).rows.length, 0);
  // Activo de nuevo: recupera el acceso.
  await asServer(`update public.profiles set active = true where id = $1`, [E]);
  assert.ok((await asUser(E, `select id from public.found_items`)).rows.length > 0);
  await asServer(`update public.profiles set role = 'EMPLOYEE' where id = $1`, [E]);
});

test('reportes de perdido: el autor solo puede marcarlos como resueltos', async () => {
  const lost = await newLost(C);
  assert.ok(await error(() => asUser(C, `update public.lost_reports set status = 'MATCHED' where id = $1`, [lost])));
  await asUser(A, `update public.lost_reports set status = 'CLOSED' where id = $1`, [lost]);
  // Cerrado por moderación: el autor no puede reabrirlo (ni lo ve como editable).
  await error(() => asUser(C, `update public.lost_reports set status = 'OPEN' where id = $1`, [lost]));
  assert.equal((await one(`select status from public.lost_reports where id = $1`, [lost])).status, 'CLOSED');
  await asServer(`update public.lost_reports set status = 'OPEN' where id = $1`, [lost]);
  await asUser(C, `update public.lost_reports set status = 'RESOLVED' where id = $1`, [lost]);
  assert.equal((await one(`select status from public.lost_reports where id = $1`, [lost])).status, 'RESOLVED');
});

test('lo archivado/cerrado solo lo ven su autor y los admins', async () => {
  const item = await newItem(B);
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [item]);
  assert.equal((await asUser(D, `select id from public.found_items where id = $1`, [item])).rows.length, 0);
  assert.equal((await asUser(B, `select id from public.found_items where id = $1`, [item])).rows.length, 1);
  assert.equal((await asUser(A, `select id from public.found_items where id = $1`, [item])).rows.length, 1);
  // El autor ya no edita lo archivado.
  await asUser(B, `update public.found_items set title = 'otro' where id = $1`, [item]);
  assert.equal((await one(`select title from public.found_items where id = $1`, [item])).title, 'Paraguas');
});

test('authenticated no puede TRUNCATE (RLS no lo cubre)', async () => {
  assert.ok(await error(() => asRole('authenticated', `truncate public.notifications`)));
});


// --- Migración 011: auditoría y avisos de moderación --------------------------
test('eliminar un objeto: avisa a los reclamantes y queda en la auditoría', async () => {
  const item = await newItem(B);
  await newClaim(item, C);
  await asUser(A, `delete from public.found_items where id = $1`, [item]);
  assert.equal((await one(`select count(*)::int n from public.found_items where id = $1`, [item])).n, 0);
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and type = 'SYSTEM' and title = 'Objeto retirado'`, [C])).n >= 1, true);
  assert.equal((await one(`select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'FOUND_ITEM_DELETED'`, [item])).n, 1);
});

test('archivar un objeto: cierra pendientes, avisa y audita; un no-admin no puede eliminar', async () => {
  const item = await newItem(B);
  const claim = await newClaim(item, D);
  await asUser(D, `delete from public.found_items where id = $1`, [item]);
  assert.equal((await one(`select count(*)::int n from public.found_items where id = $1`, [item])).n, 1, 'RLS: un tercero no elimina');
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [item]);
  assert.equal((await one(`select status from public.claims where id = $1`, [claim])).status, 'REJECTED');
  assert.equal((await one(`select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'FOUND_ITEM_ARCHIVED'`, [item])).n, 1);
});


// --- Migración 012: integridad de reclamaciones y administradores ------------
test('INT-01: un objeto no puede tener dos reclamaciones aprobadas', async () => {
  const item = await newItem(B);
  const c1 = await newClaim(item, C);
  await review(c1, B, 'APPROVED');
  // Simula el escenario de la restauración defectuosa: objeto otra vez PUBLISHED.
  await asServer(`update public.found_items set status = 'PUBLISHED' where id = $1`, [item]);
  const c2 = await newClaim(item, D);
  const err = await error(() => review(c2, B, 'APPROVED'));
  assert.ok(err, 'la segunda aprobación debe fallar');
  assert.equal((await one(`select count(*)::int n from public.claims where found_item_id = $1 and status = 'APPROVED'`, [item])).n, 1);
});

test('INT-06: siempre queda al menos un administrador ACTIVO', async () => {
  const F = '00000000-0000-0000-0000-0000000000f1';
  const G = '00000000-0000-0000-0000-0000000000f2';
  await asServer(`insert into auth.users values ($1, '6006@x', $2), ($3, '7007@x', $4)`,
    [F, { name: 'F', employee_id: '6006' }, G, { name: 'G', employee_id: '7007' }]);
  // Escenario aislado: F único admin activo; G admin desactivado; A temporalmente empleado.
  await asServer(`update public.profiles set role = 'ADMIN' where id in ($1, $2)`, [F, G]);
  await asServer(`update public.profiles set active = false where id = $1`, [G]);
  await asServer(`update public.profiles set role = 'EMPLOYEE' where id = $1`, [A]);

  assert.ok(await error(() => asServer(`update public.profiles set role = 'EMPLOYEE' where id = $1`, [F])),
    'no se puede degradar al último admin activo aunque exista uno inactivo');
  assert.ok(await error(() => asServer(`update public.profiles set active = false where id = $1`, [F])),
    'no se puede desactivar al último admin activo');
  // Con otro admin activo, sí se puede.
  await asServer(`update public.profiles set role = 'ADMIN' where id = $1`, [A]);
  await asServer(`update public.profiles set role = 'EMPLOYEE' where id = $1`, [F]);
  assert.equal((await one(`select role from public.profiles where id = $1`, [F])).role, 'EMPLOYEE');
});


// --- Migración 013: visibilidad de fotos ---------------------------------------
test('SEC-04: solo se leen las fotos propias, de publicaciones visibles, o siendo admin', async () => {
  const photo = (n) => `${B}/${n}.jpg`;
  for (const n of ['visible', 'archivada', 'huerfana']) {
    await asServer(`insert into storage.objects (bucket_id, name) values ('item-photos', $1)`, [photo(n)]);
  }
  const visible = (await one(`insert into public.found_items (title, description, category, found_at, reporter_id, image_path)
                              values ('Gorra', 'roja', 'CLOTHING', now(), $1, $2) returning id`, [B, photo('visible')])).id;
  const archived = (await one(`insert into public.found_items (title, description, category, found_at, reporter_id, image_path)
                               values ('DNI', 'documento', 'DOCUMENTS', now(), $1, $2) returning id`, [B, photo('archivada')])).id;
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [archived]);

  const canRead = async (user, n) =>
    (await asUser(user, `select 1 from storage.objects where bucket_id = 'item-photos' and name = $1`, [photo(n)])).rows.length === 1;
  assert.equal(await canRead(D, 'visible'), true, 'foto de una publicación visible');
  assert.equal(await canRead(D, 'archivada'), false, 'foto de algo archivado: oculta a terceros');
  assert.equal(await canRead(D, 'huerfana'), false, 'foto sin publicación: oculta a terceros');
  assert.equal(await canRead(B, 'huerfana'), true, 'el dueño ve sus fotos');
  assert.equal(await canRead(A, 'archivada'), true, 'el admin ve todo');
  // Listar el bucket ya no revela las carpetas (UUID) de otros usuarios.
  const listed = (await asUser(D, `select name from storage.objects where bucket_id = 'item-photos'`)).rows.map((r) => r.name);
  assert.ok(!listed.includes(photo('huerfana')) && !listed.includes(photo('archivada')));
  void visible;
});

test('FUN-02: un admin puede subir a la carpeta del autor; un empleado no', async () => {
  await asUser(A, `insert into storage.objects (bucket_id, name) values ('item-photos', $1)`, [`${B}/por-admin.jpg`]);
  assert.ok(await error(() => asUser(D, `insert into storage.objects (bucket_id, name) values ('item-photos', $1)`, [`${B}/intruso.jpg`])));
});


// --- Migración 014: el autor elimina sus publicaciones -----------------------
test('el autor elimina su objeto publicado o devuelto; no si está reclamado o archivado', async () => {
  const count = async (id) => (await one(`select count(*)::int n from public.found_items where id = $1`, [id])).n;
  const published = await newItem(B);
  await newClaim(published, C);
  await asUser(B, `delete from public.found_items where id = $1`, [published]);
  assert.equal(await count(published), 0);
  const notice = await one(`select body from public.notifications where user_id = $1 and title = 'Objeto retirado' order by created_at desc limit 1`, [C]);
  assert.match(notice.body, /quien lo publicó/);
  assert.equal((await one(`select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'FOUND_ITEM_DELETED'`, [published])).n, 1);

  const returned = await newItem(B, 'RETURNED');
  await asUser(B, `delete from public.found_items where id = $1`, [returned]);
  assert.equal(await count(returned), 0);

  for (const status of ['CLAIMED', 'ARCHIVED']) {
    const item = await newItem(B, status);
    await asUser(B, `delete from public.found_items where id = $1`, [item]);
    assert.equal(await count(item), 1, `${status}: el autor no lo elimina`);
  }
});

test('el autor elimina su reporte de perdido salvo si está cerrado; un tercero nunca', async () => {
  const count = async (id) => (await one(`select count(*)::int n from public.lost_reports where id = $1`, [id])).n;
  const lost = await newLost(C);
  await asUser(D, `delete from public.lost_reports where id = $1`, [lost]);
  assert.equal(await count(lost), 1, 'un tercero no lo elimina');
  await asUser(C, `delete from public.lost_reports where id = $1`, [lost]);
  assert.equal(await count(lost), 0);

  const closed = await newLost(C);
  await asUser(A, `update public.lost_reports set status = 'CLOSED' where id = $1`, [closed]);
  await asUser(C, `delete from public.lost_reports where id = $1`, [closed]);
  assert.equal(await count(closed), 1, 'cerrado por moderación: solo admin');
});


// --- Migración 015: fecha de devolución ---------------------------------------
test('returned_at: la fija el trigger al devolver y el cliente no puede escribirla', async () => {
  const item = await newItem(B);
  assert.equal((await one(`select returned_at from public.found_items where id = $1`, [item])).returned_at, null);
  assert.ok(await error(() => asUser(B, `update public.found_items set returned_at = now() where id = $1`, [item])));
  await asUser(B, `update public.found_items set status = 'RETURNED' where id = $1`, [item]);
  assert.ok((await one(`select returned_at from public.found_items where id = $1`, [item])).returned_at);
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [item]);
  assert.equal((await one(`select returned_at from public.found_items where id = $1`, [item])).returned_at, null);
});

// --- Migración 016: juego (foto de perfil, puntos, ranking) ---------------------
const E = '00000000-0000-0000-0000-0000000000a1'; // jugador (encuentra objetos)
const F = '00000000-0000-0000-0000-0000000000a2'; // dueño de los objetos
const G = '00000000-0000-0000-0000-0000000000a3'; // colaborador que se desactiva
const profileOf = async (viewer, uid) => (await asUser(viewer, `select * from public.player_profile($1)`, [uid])).rows[0];
/** Objeto de E reclamado por F, aprobado y devuelto. `hoursAgo`: antigüedad de la publicación. */
async function returnedItem(hoursAgo = 0) {
  const item = await newItem(E);
  await asServer(`update public.found_items set created_at = now() - make_interval(hours => $2) where id = $1`, [item, hoursAgo]);
  await review(await newClaim(item, F), E, 'APPROVED');
  await asUser(E, `update public.found_items set status = 'RETURNED' where id = $1`, [item]);
  return item;
}

test('juego: 50 por publicar, +100 por devolver con reclamación de otra persona, +50 si es rápida', async () => {
  for (const [id, emp] of [[E, 'game-1'], [F, 'game-2'], [G, 'game-3']]) {
    await asServer(`insert into auth.users values ($1, $2, $3)`, [id, `${emp}@x`, { name: `User ${emp}`, employee_id: emp }]);
  }
  assert.equal((await profileOf(F, E)).points, 0);
  assert.equal((await profileOf(F, E)).rank, null, 'sin puntos no tiene puesto');

  // Publicar da 50; "devolver" sin reclamación no suma más.
  const solo = await newItem(E);
  await asUser(E, `update public.found_items set status = 'RETURNED' where id = $1`, [solo]);
  let p = await profileOf(F, E);
  assert.deepEqual([p.points, p.published, p.returned], [50, 1, 0]);

  await returnedItem(0); // 50 + 100 + 50 (rápida)
  await returnedItem(48); // 50 + 100
  p = await profileOf(F, E);
  assert.deepEqual([p.points, p.returned, p.fast_returned], [400, 2, 1]);
  assert.deepEqual([p.published_photo, p.categories, p.active_months], [0, 1, 1]);
  assert.ok(p.rank >= 1);

  // Moderación: archivar quita todos los puntos de ese objeto.
  const archived = await returnedItem(0);
  assert.equal((await profileOf(F, E)).points, 600);
  await asUser(A, `update public.found_items set status = 'ARCHIVED' where id = $1`, [archived]);
  assert.equal((await profileOf(F, E)).points, 400);
});

test('juego: ranking ordenado, top 100 y solo para colaboradores activos', async () => {
  const board = (await asUser(F, `select * from public.leaderboard(0, 30)`)).rows;
  assert.ok(board.length >= 1 && board.every((r) => r.points > 0), 'solo quien tiene puntos');
  for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].points >= board[i].points, 'orden descendente');
  assert.equal(board.find((r) => r.id === E)?.rank, (await profileOf(F, E)).rank, 'mismo puesto en ranking y perfil');
  assert.deepEqual(Object.keys(board[0]).sort(), ['active_months', 'avatar_path', 'categories', 'fast_returned', 'id', 'name', 'points', 'published', 'published_photo', 'rank', 'returned']);
  assert.equal((await asUser(F, `select * from public.leaderboard(100, 30)`)).rows.length, 0, 'nada más allá del puesto 100');
  assert.equal((await asUser(F, `select * from public.leaderboard(0, 500)`)).rows.length, board.length, 'el límite se acota');

  assert.match((await error(() => asRole('anon', `select * from public.leaderboard(0, 30)`))).message, /permission denied/);
  assert.match((await error(() => asUser(F, `select * from public.game_stats()`))).message, /permission denied/);
  await asServer(`update public.profiles set active = false where id = $1`, [G]);
  assert.ok(await error(() => asUser(G, `select * from public.leaderboard(0, 30)`)), 'cuenta desactivada');
  assert.equal(await profileOf(F, G), undefined, 'el perfil de un desactivado no se muestra');
});

test('juego: foto de perfil solo en la carpeta propia y mediante set_my_avatar()', async () => {
  const mine = `${E}/11111111-1111-1111-1111-111111111111.jpg`;
  const foreign = `${F}/22222222-2222-2222-2222-222222222222.jpg`;
  assert.ok(await error(() => asUser(E, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [foreign])), 'carpeta ajena');
  await asUser(E, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [mine]);
  assert.ok(await error(() => asUser(E, `update public.profiles set avatar_path = $2 where id = $1`, [E, mine])), 'sin UPDATE directo');
  assert.ok(await error(() => asUser(E, `select public.set_my_avatar($1)`, [foreign])), 'ruta ajena');
  assert.ok(await error(() => asUser(E, `select public.set_my_avatar($1)`, [`${E}/33333333-3333-3333-3333-333333333333.jpg`])), 'archivo inexistente');
  assert.ok(await error(() => asUser(E, `select public.set_my_avatar($1)`, [`${E}/../x.jpg`])));

  // Antes de fijarla, un tercero no la ve; después, sí (y la ruta es legible).
  assert.equal((await asUser(F, `select 1 from storage.objects where name = $1`, [mine])).rows.length, 0);
  assert.equal((await asUser(E, `select public.set_my_avatar($1) as old`, [mine])).rows[0].old, null);
  assert.equal((await asUser(F, `select 1 from storage.objects where name = $1`, [mine])).rows.length, 1);
  assert.equal((await asUser(F, `select avatar_path from public.profiles where id = $1`, [E])).rows[0].avatar_path, mine);
  assert.equal((await profileOf(F, E)).avatar_path, mine);
  assert.equal((await asUser(E, `select public.set_my_avatar(null) as old`)).rows[0].old, mine, 'devuelve la anterior');
  assert.equal((await asUser(F, `delete from storage.objects where name = $1 returning 1`, [mine])).rows.length, 0, 'un tercero no la borra');
});
