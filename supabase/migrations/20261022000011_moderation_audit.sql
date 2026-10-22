-- Auditoría y avisos de moderación en modo Supabase (v0.26.1).
--
-- Con Supabase, archivar/cerrar y ELIMINAR objetos o reportes los hace el cliente
-- directamente (RLS: solo admin), así que no quedaba nada en audit_logs (en Express
-- sí). Y al eliminar un objeto encontrado, sus reclamaciones se borraban en cascada
-- sin avisar a los reclamantes: su solicitud "desaparecía", y las notificaciones
-- previas apuntaban a un objeto inexistente.
--
-- Ahora, con triggers (aplican venga el cambio de donde venga, también desde APK
-- ya instalados):
--   - Eliminar objeto/reporte -> auditoría FOUND_ITEM_DELETED / LOST_REPORT_DELETED.
--   - Eliminar objeto -> aviso a quien tenía una reclamación PENDING o APPROVED.
--   - Archivar objeto / cerrar reporte -> auditoría FOUND_ITEM_ARCHIVED / LOST_REPORT_CLOSED,
--     y aviso a los reclamantes con solicitudes pendientes o aprobadas del objeto.

-- Escribe en audit_logs solo si hay un usuario identificado (actor_id es obligatorio).
create or replace function public.audit_as_current_user(
  p_action text, p_entity text, p_entity_id uuid, p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and exists (select 1 from public.profiles where id = v_actor) then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (v_actor, p_action, p_entity, p_entity_id, p_summary);
  end if;
end;
$$;
revoke execute on function public.audit_as_current_user(text, text, uuid, text) from public, anon, authenticated;

-- Aviso a los reclamantes activos (PENDING/APPROVED) de un objeto que se retira.
create or replace function public.notify_claimants_item_removed(p_item_id uuid, p_title text, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, related_item_id)
  select distinct c.claimant_id, 'SYSTEM', 'Objeto retirado',
         format('"%s" %s, así que tu reclamación ya no sigue en curso.', p_title, p_reason),
         null::uuid
    from public.claims c
   where c.found_item_id = p_item_id and c.status in ('PENDING', 'APPROVED');
$$;
revoke execute on function public.notify_claimants_item_removed(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- found_items
-- ---------------------------------------------------------------------------
create or replace function public.found_items_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- BEFORE DELETE: las reclamaciones aún existen (se borran en cascada después).
  perform public.notify_claimants_item_removed(old.id, old.title, 'fue eliminado por un administrador');
  perform public.audit_as_current_user('FOUND_ITEM_DELETED', 'FoundItem', old.id, old.title);
  return old;
end;
$$;
revoke execute on function public.found_items_on_delete() from public, anon, authenticated;

drop trigger if exists found_items_on_delete_trg on public.found_items;
create trigger found_items_on_delete_trg
  before delete on public.found_items
  for each row execute function public.found_items_on_delete();

create or replace function public.found_items_on_archived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.notify_claimants_item_removed(new.id, new.title, 'fue retirado del muro por un administrador');
  -- Las pendientes ya no pueden prosperar: se cierran (las aprobadas se conservan como historial).
  update public.claims
     set status = 'REJECTED',
         reviewer_id = case when v_actor is distinct from claimant_id then v_actor end,
         review_note = 'El objeto fue retirado por un administrador'
   where found_item_id = new.id and status = 'PENDING';
  perform public.audit_as_current_user('FOUND_ITEM_ARCHIVED', 'FoundItem', new.id, new.title);
  return new;
end;
$$;
revoke execute on function public.found_items_on_archived() from public, anon, authenticated;

drop trigger if exists found_items_on_archived_trg on public.found_items;
create trigger found_items_on_archived_trg
  after update of status on public.found_items
  for each row
  when (new.status = 'ARCHIVED' and old.status is distinct from 'ARCHIVED')
  execute function public.found_items_on_archived();

-- ---------------------------------------------------------------------------
-- lost_reports
-- ---------------------------------------------------------------------------
create or replace function public.lost_reports_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.audit_as_current_user('LOST_REPORT_DELETED', 'LostReport', old.id, old.title);
  return old;
end;
$$;
revoke execute on function public.lost_reports_on_delete() from public, anon, authenticated;

drop trigger if exists lost_reports_on_delete_trg on public.lost_reports;
create trigger lost_reports_on_delete_trg
  before delete on public.lost_reports
  for each row execute function public.lost_reports_on_delete();

create or replace function public.lost_reports_on_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.audit_as_current_user('LOST_REPORT_CLOSED', 'LostReport', new.id, new.title);
  return new;
end;
$$;
revoke execute on function public.lost_reports_on_closed() from public, anon, authenticated;

drop trigger if exists lost_reports_on_closed_trg on public.lost_reports;
create trigger lost_reports_on_closed_trg
  after update of status on public.lost_reports
  for each row
  when (new.status = 'CLOSED' and old.status is distinct from 'CLOSED')
  execute function public.lost_reports_on_closed();
