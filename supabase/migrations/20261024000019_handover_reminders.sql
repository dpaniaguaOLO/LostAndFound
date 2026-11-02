-- Recordatorio de entregas atascadas.
--
-- Un objeto "Reclamado" (CLAIMED: reclamación aprobada, entrega pendiente) que lleva
-- más de 3 días así genera un aviso a quien lo encontró ("márcalo como devuelto") y
-- a quien lo reclamó ("¿ya lo recibiste?"). Como mucho uno cada 3 días por objeto.
--
-- No hay tareas programadas: la app llama a remind_my_pending_handovers() al cargar
-- las notificaciones y la función crea solo los avisos DEL USUARIO que llama. Como
-- los avisos solo se ven dentro de la app, el efecto es el mismo que un cron.
-- Express hace lo mismo en GET /api/notifications (backend/src/lib/handoverReminders.ts).
--
-- Reversión: drop function public.remind_my_pending_handovers().

create or replace function public.remind_my_pending_handovers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
  r record;
begin
  if v_uid is null or not public.is_active_user() then
    return 0;
  end if;

  for r in
    select fi.id, fi.title, fi.reporter_id, c.claimant_id, c.updated_at as approved_at,
           finder.name as finder_name, claimant.name as claimant_name
      from public.found_items fi
      join public.claims c on c.found_item_id = fi.id and c.status = 'APPROVED'
      join public.profiles finder on finder.id = fi.reporter_id
      join public.profiles claimant on claimant.id = c.claimant_id
     where fi.status = 'CLAIMED'
       and c.updated_at < now() - interval '3 days'
       and (fi.reporter_id = v_uid or c.claimant_id = v_uid)
       -- Como mucho un recordatorio cada 3 días por objeto y usuario.
       and not exists (
         select 1 from public.notifications n
          where n.user_id = v_uid and n.related_item_id = fi.id
            and n.title = 'Entrega pendiente'
            and n.created_at > now() - interval '3 days')
  loop
    insert into public.notifications (user_id, type, title, body, related_item_id)
    values (
      v_uid, 'SYSTEM', 'Entrega pendiente',
      case when r.reporter_id = v_uid
        then format('"%s" lleva %s días reclamado por %s. Cuando se lo entregues, márcalo como devuelto.',
                    r.title, extract(day from now() - r.approved_at)::int, r.claimant_name)
        else format('¿Ya recibiste "%s"? Coordina la entrega con %s y pídele que lo marque como devuelto.',
                    r.title, r.finder_name)
      end,
      r.id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.remind_my_pending_handovers() from public, anon;
grant execute on function public.remind_my_pending_handovers() to authenticated;
