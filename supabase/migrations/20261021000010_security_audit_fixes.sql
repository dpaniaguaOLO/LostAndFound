-- Correcciones de la auditoría de seguridad (v0.25.0).
--
--  1) Cuentas desactivadas: `profiles.active = false` solo lo comprobaba el cliente.
--     Con un JWT previo (o pidiendo uno nuevo a Auth con su contraseña) el usuario
--     seguía usando PostgREST, y un ADMIN desactivado seguía siendo admin
--     (is_admin() no miraba `active`). Ahora la BD rechaza a los inactivos con
--     políticas RESTRICTIVE en todas las tablas y is_admin() exige estar activo.
--     (La Edge Function además los rechaza en getCaller y los banea en Auth.)
--  2) lost_reports: el autor podía cambiar el estado libremente (p. ej. reabrir
--     un reporte CLOSED por moderación, o marcarlo MATCHED sin reclamación).
--     Ahora un no-admin solo puede pasar su reporte de OPEN/MATCHED a RESOLVED.
--  3) Objetos ARCHIVED / reportes CLOSED (moderados) seguían legibles por todos
--     vía PostgREST. Ahora solo los ve su autor o un admin.
--  4) `name` editable por cualquiera permitía suplantar ("Administrador OLO", o el
--     nombre exacto de un colega) en el muro y en las notificaciones. La app no
--     ofrece cambiar el nombre: se retira el permiso (lo cambia un admin/servidor).
--  5) TRUNCATE/TRIGGER/REFERENCES heredados de los privilegios por defecto: RLS no
--     aplica a TRUNCATE. Se revocan a anon/authenticated.
--  6) review_claim: el actor debe estar activo.

-- ---------------------------------------------------------------------------
-- 1) Cuentas activas
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN' and active
  );
$$;

-- RESTRICTIVE: se combina con AND con las políticas existentes. Un usuario
-- desactivado no lee ni escribe nada aunque otra política se lo permita.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'found_items', 'lost_reports', 'claims', 'notifications', 'audit_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_active_only', t);
    -- (select ...) hace que Postgres la evalúe una vez por consulta, no por fila.
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.is_active_user())) with check ((select public.is_active_user()))',
      t || '_active_only', t);
  end loop;
end;
$$;

-- Storage: igual para las fotos (subir, leer, borrar).
drop policy if exists item_photos_active_only on storage.objects;
create policy item_photos_active_only
  on storage.objects as restrictive for all
  to authenticated
  using (bucket_id <> 'item-photos' or public.is_active_user())
  with check (bucket_id <> 'item-photos' or public.is_active_user());

-- ---------------------------------------------------------------------------
-- 2) lost_reports: transiciones de estado permitidas a no-admins
-- ---------------------------------------------------------------------------
create or replace function public.lost_reports_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario (service_role / SQL) o admin: sin restricciones.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
     and not (new.status = 'RESOLVED' and old.status in ('OPEN', 'MATCHED')) then
    raise exception 'Transición de estado no permitida (% -> %)', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.lost_reports_guard_status() from public, anon, authenticated;

drop trigger if exists lost_reports_guard_status_trg on public.lost_reports;
create trigger lost_reports_guard_status_trg
  before update of status on public.lost_reports
  for each row execute function public.lost_reports_guard_status();

-- ---------------------------------------------------------------------------
-- 3) Lo moderado solo lo ve su autor o un admin
-- ---------------------------------------------------------------------------
drop policy if exists found_items_select_authenticated on public.found_items;
create policy found_items_select_authenticated
  on public.found_items for select
  to authenticated
  using (status <> 'ARCHIVED' or reporter_id = auth.uid() or public.is_admin());

drop policy if exists lost_reports_select_authenticated on public.lost_reports;
create policy lost_reports_select_authenticated
  on public.lost_reports for select
  to authenticated
  using (status <> 'CLOSED' or reporter_id = auth.uid() or public.is_admin());

-- Lo archivado/cerrado ya no lo edita su autor (solo un admin, p. ej. al restaurar).
drop policy if exists found_items_update_owner_or_admin on public.found_items;
create policy found_items_update_owner_or_admin
  on public.found_items for update
  to authenticated
  using ((reporter_id = auth.uid() and status <> 'ARCHIVED') or public.is_admin())
  with check (reporter_id = auth.uid() or public.is_admin());

drop policy if exists lost_reports_update_owner_or_admin on public.lost_reports;
create policy lost_reports_update_owner_or_admin
  on public.lost_reports for update
  to authenticated
  using ((reporter_id = auth.uid() and status <> 'CLOSED') or public.is_admin())
  with check (reporter_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Nombre: no editable por el propio usuario (anti-suplantación)
-- ---------------------------------------------------------------------------
revoke update (name) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- 5) Privilegios que RLS no cubre
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) review_claim: el actor debe estar activo
-- ---------------------------------------------------------------------------
create or replace function public.review_claim(
  p_claim_id uuid,
  p_actor_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim      public.claims%rowtype;
  v_item       public.found_items%rowtype;
  v_actor_role text;
  v_actor_on   boolean;
  v_auto_note  constant text := 'Otra reclamación fue aprobada';
begin
  if p_status not in ('APPROVED', 'REJECTED') then
    raise exception 'status debe ser APPROVED o REJECTED' using hint = '400';
  end if;

  select role, active into v_actor_role, v_actor_on from public.profiles where id = p_actor_id;
  if not coalesce(v_actor_on, false) then
    raise exception 'Cuenta desactivada' using hint = '403';
  end if;

  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Reclamación no encontrada' using hint = '404';
  end if;
  select * into v_item from public.found_items where id = v_claim.found_item_id for update;

  if v_item.reporter_id is distinct from p_actor_id and v_actor_role is distinct from 'ADMIN' then
    raise exception 'No puedes revisar esta reclamación' using hint = '403';
  end if;
  if v_claim.claimant_id = p_actor_id then
    raise exception 'No puedes revisar tu propia reclamación' using hint = '403';
  end if;
  if v_claim.status <> 'PENDING' then
    raise exception 'La reclamación ya fue procesada' using hint = '400';
  end if;
  if p_status = 'APPROVED' and v_item.status <> 'PUBLISHED' then
    raise exception 'El objeto ya no está disponible para aprobar reclamaciones' using hint = '400';
  end if;

  update public.claims
     set status = p_status, reviewer_id = p_actor_id, review_note = nullif(btrim(p_note), '')
   where id = p_claim_id;

  insert into public.notifications (user_id, type, title, body, related_item_id)
  values (
    v_claim.claimant_id,
    case when p_status = 'APPROVED' then 'CLAIM_APPROVED' else 'CLAIM_REJECTED' end,
    case when p_status = 'APPROVED' then 'Reclamación aprobada' else 'Reclamación rechazada' end,
    case when p_status = 'APPROVED'
      then format('Tu reclamación de "%s" fue aprobada. Coordina la entrega con quien lo encontró.', v_item.title)
      else format('Tu reclamación de "%s" fue rechazada.', v_item.title)
    end,
    v_item.id
  );

  if p_status = 'APPROVED' then
    update public.found_items set status = 'CLAIMED' where id = v_item.id;

    if v_claim.lost_report_id is not null then
      update public.lost_reports set status = 'MATCHED'
       where id = v_claim.lost_report_id and status = 'OPEN';
    end if;

    with rejected as (
      update public.claims
         set status = 'REJECTED', reviewer_id = p_actor_id, review_note = v_auto_note
       where found_item_id = v_item.id and status = 'PENDING' and id <> p_claim_id
      returning claimant_id
    )
    insert into public.notifications (user_id, type, title, body, related_item_id)
    select claimant_id, 'CLAIM_REJECTED', 'Reclamación rechazada',
           format('Tu reclamación de "%s" fue rechazada: otra reclamación fue aprobada.', v_item.title),
           v_item.id
      from rejected;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    p_actor_id, 'CLAIM_REVIEWED', 'Claim', p_claim_id,
    format('Reclamación %s de "%s"',
           case when p_status = 'APPROVED' then 'aprobada' else 'rechazada' end, v_item.title)
  );
end;
$$;

revoke execute on function public.review_claim(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_claim(uuid, uuid, text, text) to service_role;
