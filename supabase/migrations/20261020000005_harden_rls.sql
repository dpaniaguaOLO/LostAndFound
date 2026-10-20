-- Endurecimiento de RLS / integridad (v0.15.x).
--
-- 1) claims: el cliente ya no escribe directamente (crear/revisar/cancelar pasan por
--    la Edge Function `api`, que usa service_role y omite RLS). Con la política de
--    UPDATE anterior un reclamante podía hacer, vía PostgREST,
--      update claims set status = 'APPROVED' where id = <su reclamación>
--    y autoaprobarse. Se eliminan las políticas de escritura del cliente.
--    ORDEN DE DESPLIEGUE: desplegar antes la Edge Function `api` con las rutas
--    /claims, o el frontend no podrá crear/revisar reclamaciones.
--
-- 2) found_items: un no-admin (autor) solo puede cambiar el estado de su objeto a
--    RETURNED. Antes podía, p. ej., sacar de ARCHIVED un objeto moderado por un admin
--    o marcarlo CLAIMED sin reclamación aprobada.
--
-- 3) profiles: un no-admin no puede cambiar su employee_id ni su email (podía ocupar
--    el número de otro colaborador aún no registrado). Además, nunca se puede dejar
--    el sistema sin administradores.
--    Corrige también que el trigger anterior bloqueaba los cambios de rol hechos sin
--    usuario autenticado (service_role de la Edge Function, editor SQL del seed):
--    is_admin() es false cuando auth.uid() es null.

-- ---------------------------------------------------------------------------
-- 1) claims: sin escritura directa desde el cliente
-- ---------------------------------------------------------------------------
drop policy if exists claims_insert_own on public.claims;
drop policy if exists claims_update_involved on public.claims;

-- ---------------------------------------------------------------------------
-- 2) found_items: transiciones de estado permitidas a no-admins
-- ---------------------------------------------------------------------------
create or replace function public.found_items_guard_status()
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
     and not (new.status = 'RETURNED' and old.status in ('PUBLISHED', 'CLAIMED')) then
    raise exception 'Transición de estado no permitida (% -> %)', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists found_items_guard_status_trg on public.found_items;
create trigger found_items_guard_status_trg
  before update of status on public.found_items
  for each row execute function public.found_items_guard_status();

-- ---------------------------------------------------------------------------
-- 3) profiles: campos protegidos y último administrador
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Restricciones para colaboradores autenticados que no son admin.
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'No autorizado para cambiar el rol' using errcode = '42501';
    end if;
    if new.employee_id is distinct from old.employee_id or new.email is distinct from old.email then
      raise exception 'No autorizado para cambiar el número de colaborador o el correo'
        using errcode = '42501';
    end if;
  end if;

  -- Para todos (incluida service_role): nunca dejar el sistema sin administradores.
  if old.role = 'ADMIN' and new.role is distinct from 'ADMIN'
     and (select count(*) from public.profiles where role = 'ADMIN') <= 1 then
    raise exception 'No se puede quitar el rol al último administrador';
  end if;
  return new;
end;
$$;
-- El trigger profiles_no_role_escalation (migración 3) ya apunta a esta función.
