-- Integridad de reclamaciones y administradores (auditoría 2026-10-22, INT-01 / INT-06).
--
-- INT-01: restaurar un objeto archivado lo devolvía siempre a PUBLISHED aunque ya
--   tuviera una reclamación APPROVED, lo que permitía aprobar una SEGUNDA (dos
--   "dueños"). Además de corregir la ruta de restauración (Edge Function), la BD
--   garantiza ahora que un objeto tenga como mucho una reclamación aprobada.
-- INT-06: la regla "nunca dejar el sistema sin administradores" contaba también
--   a los admins DESACTIVADOS y no impedía desactivar al último activo. Ahora se
--   exige al menos un ADMIN activo, y la comprobación se serializa con un lock
--   consultivo para que dos cambios simultáneos no la burlen.
--
-- Requisito previo verificado (solo lectura, 2026-10-22): no hay objetos con más
-- de una reclamación APPROVED, así que el índice único se crea sin conflictos.
-- Reversión: drop index claims_one_approved_per_item; y restaurar la función de
-- la migración 005.

-- ---------------------------------------------------------------------------
-- INT-01: como mucho una reclamación aprobada por objeto
-- ---------------------------------------------------------------------------
create unique index if not exists claims_one_approved_per_item
  on public.claims (found_item_id)
  where status = 'APPROVED';

-- ---------------------------------------------------------------------------
-- INT-06: siempre al menos un ADMIN activo
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

  -- Para todos (incluida service_role): si este cambio retira a un admin activo
  -- (le quita el rol o lo desactiva), debe quedar al menos otro admin activo.
  if old.role = 'ADMIN' and old.active
     and (new.role is distinct from 'ADMIN' or not new.active) then
    -- Serializa los cambios de administradores: sin esto, dos degradaciones
    -- simultáneas podían ver cada una "otro admin" y dejar cero.
    perform pg_advisory_xact_lock(hashtext('laf.admins'));
    if not exists (
      select 1 from public.profiles
       where role = 'ADMIN' and active and id <> old.id
    ) then
      raise exception 'Debe quedar al menos un administrador activo' using hint = '400';
    end if;
  end if;
  return new;
end;
$$;
