-- Endurecimiento de seguridad (v0.17.0). Defensa en profundidad sobre RLS:
--
--  A) Mínimo privilegio por columna (anti mass-assignment). RLS decide QUÉ FILAS
--     puede tocar cada usuario; los GRANT por columna deciden QUÉ CAMPOS. Antes un
--     colaborador podía, p. ej., insertar un objeto ya en estado ARCHIVED/CLAIMED,
--     escribir image_signature, o editar title/body de sus notificaciones.
--  B) Datos mínimos: employee_id (identificador de login) y email de TODOS los
--     perfiles eran legibles por cualquier usuario autenticado. Ahora solo se
--     exponen id, name, role y created_at; el perfil propio completo se obtiene con
--     my_profile().
--  C) anon (clave pública del cliente) sin acceso a tablas: no hay ningún caso de
--     uso anónimo sobre datos; antes solo lo frenaba RLS.
--  D) Restricciones de integridad/validación en la BD: el modo Supabase inserta
--     directamente desde el cliente, así que la BD es la última línea de validación.
--  E) Rate limiting con almacenamiento compartido (tabla) para las Edge Functions.
--  F) revoke_user_sessions(): invalida las sesiones de un usuario (p. ej. tras un
--     reset de contraseña por un admin).
--
-- Reversible: los GRANT/REVOKE y constraints se deshacen con sus inversos; no se
-- borran datos. Verificado antes de aplicar que ningún registro existente viola
-- las nuevas restricciones.

-- ---------------------------------------------------------------------------
-- C) anon: sin acceso a tablas de la app
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.found_items, public.lost_reports, public.claims,
              public.notifications, public.audit_logs from anon;

-- ---------------------------------------------------------------------------
-- A + B) Privilegios por columna para authenticated
-- ---------------------------------------------------------------------------
-- profiles: lectura de columnas no sensibles; solo el nombre es editable.
revoke select, insert, update, delete on public.profiles from authenticated;
grant select (id, name, role, created_at) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- found_items: el cliente no puede fijar status al crear (siempre PUBLISHED por
-- defecto), ni tocar image_signature / reporter_id al editar.
revoke insert, update on public.found_items from authenticated;
grant insert (title, description, category, location, found_at, image_path, reporter_id)
  on public.found_items to authenticated;
grant update (title, description, category, location, found_at, image_path, status)
  on public.found_items to authenticated;

revoke insert, update on public.lost_reports from authenticated;
grant insert (title, description, category, location, lost_at, image_path, reporter_id)
  on public.lost_reports to authenticated;
grant update (title, description, category, location, lost_at, image_path, status)
  on public.lost_reports to authenticated;

-- notifications: solo marcar como leída.
revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

-- claims y audit_logs: escritura solo desde el servidor (service_role).
revoke insert, update, delete on public.claims from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

-- Perfil propio completo (incluye employee_id/email), sin abrir esas columnas a todos.
create or replace function public.my_profile()
returns table (id uuid, name text, employee_id text, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.employee_id, p.email, p.role, p.created_at
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- D) Validación en la base de datos
-- ---------------------------------------------------------------------------
alter table public.found_items
  add constraint found_items_category_chk check (category in
    ('ELECTRONICS','CLOTHING','ACCESSORIES','DOCUMENTS','KEYS','BAGS','WALLET','JEWELRY','OTHER')),
  add constraint found_items_location_len_chk check (char_length(location) <= 200),
  -- La foto debe estar en la carpeta del propio autor (no enlazar fotos ajenas).
  add constraint found_items_image_owner_chk check (
    image_path is null or split_part(image_path, '/', 1) = reporter_id::text);

alter table public.lost_reports
  add constraint lost_reports_category_chk check (category in
    ('ELECTRONICS','CLOTHING','ACCESSORIES','DOCUMENTS','KEYS','BAGS','WALLET','JEWELRY','OTHER')),
  add constraint lost_reports_location_len_chk check (char_length(location) <= 200),
  add constraint lost_reports_image_owner_chk check (
    image_path is null or split_part(image_path, '/', 1) = reporter_id::text);

alter table public.profiles
  add constraint profiles_name_len_chk check (char_length(name) between 1 and 120),
  add constraint profiles_employee_id_fmt_chk check (employee_id ~ '^[A-Za-z0-9._-]{1,50}$');

alter table public.claims
  add constraint claims_review_note_len_chk check (review_note is null or char_length(review_note) <= 1000);

-- Storage: WITH CHECK explícito en la política de UPDATE. (Sin él, Postgres ya
-- aplica el USING a la fila nueva; se hace explícito por claridad y para que un
-- cambio futuro del USING no abra mover archivos a la carpeta de otro usuario.)
drop policy if exists item_photos_modify_owner_or_admin on storage.objects;
create policy item_photos_modify_owner_or_admin
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'item-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- E) Rate limiting compartido (ventana fija) para las Edge Functions
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);
alter table public.rate_limits enable row level security; -- sin políticas: solo service_role
revoke all on public.rate_limits from anon, authenticated;

-- Registra un intento y devuelve los segundos de espera (0 = permitido).
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_row   public.rate_limits%rowtype;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_start = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now
                            then v_now else r.window_start end,
        hits = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now
                    then 1 else r.hits + 1 end
  returning * into v_row;

  -- Limpieza oportunista de ventanas caducadas (barata, indexada por PK no; acotada).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '1 day';
  end if;

  if v_row.hits > p_max then
    return greatest(1, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  end if;
  return 0;
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- F) Revocar sesiones de un usuario (refresh tokens). El access token vigente
--    caduca solo (JWT, 1 h por defecto en Supabase).
-- ---------------------------------------------------------------------------
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.refresh_tokens where user_id::text = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
