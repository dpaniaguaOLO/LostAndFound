-- El autor puede eliminar sus propias publicaciones (v0.28.0).
--
-- Hasta ahora DELETE en found_items/lost_reports era solo de admin (moderación).
-- Ahora el autor también puede borrar lo suyo, con estas reglas:
--   - Objeto encontrado: solo si está PUBLISHED o RETURNED. Con una reclamación
--     aprobada (CLAIMED) hay una entrega en curso que no debe desaparecer, y lo
--     ARCHIVED es moderación (solo admin).
--   - Reporte de perdido: cualquier estado salvo CLOSED (moderación).
-- Los triggers de la migración 011 siguen aplicando: avisan a los reclamantes en
-- curso y registran la auditoría. El aviso indica ahora quién lo eliminó.

drop policy if exists found_items_delete_admin on public.found_items;
drop policy if exists found_items_delete_owner_or_admin on public.found_items;
create policy found_items_delete_owner_or_admin
  on public.found_items for delete
  to authenticated
  using (
    public.is_admin()
    or (reporter_id = auth.uid() and status in ('PUBLISHED', 'RETURNED'))
  );

drop policy if exists lost_reports_delete_admin on public.lost_reports;
drop policy if exists lost_reports_delete_owner_or_admin on public.lost_reports;
create policy lost_reports_delete_owner_or_admin
  on public.lost_reports for delete
  to authenticated
  using (
    public.is_admin()
    or (reporter_id = auth.uid() and status <> 'CLOSED')
  );

create or replace function public.found_items_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- BEFORE DELETE: las reclamaciones aún existen (se borran en cascada después).
  perform public.notify_claimants_item_removed(
    old.id, old.title,
    case when auth.uid() is not distinct from old.reporter_id
         then 'fue eliminado por quien lo publicó'
         else 'fue eliminado por un administrador' end
  );
  perform public.audit_as_current_user('FOUND_ITEM_DELETED', 'FoundItem', old.id, old.title);
  return old;
end;
$$;
revoke execute on function public.found_items_on_delete() from public, anon, authenticated;
