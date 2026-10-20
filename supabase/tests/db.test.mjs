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
  assert.ok(await error(() => asUser(B, `update public.found_items set status = 'PUBLISHED' where id = $1`, [item])));
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
  await asUser(B, `update public.profiles set name = 'Nombre nuevo' where id = $1`, [B]);
  assert.equal((await one(`select name from public.profiles where id = $1`, [B])).name, 'Nombre nuevo');
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
