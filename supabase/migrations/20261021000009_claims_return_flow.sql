-- Flujo completo de reclamación -> entrega (v0.24.0).
--
-- Problemas que corrige:
--  1) Marcar un objeto como DEVUELTO no tenía efectos: el reclamante aprobado no
--     recibía aviso, las reclamaciones PENDING del objeto quedaban colgadas para
--     siempre (ya no se podían aprobar) y el reporte de perdido del reclamante
--     seguía "Abierto".
--  2) Se podían crear reclamaciones sobre objetos ya CLAIMED, que nunca podían
--     aprobarse (review_claim exige PUBLISHED). La Edge Function ahora lo impide.
--  3) No había relación entre una reclamación y el reporte de perdido del
--     reclamante, así que la app no podía cerrar ese reporte al recuperar el objeto.
--
-- Diseño: los efectos de la devolución viven en un TRIGGER (no en la Edge
-- Function) para que se apliquen siempre, venga el cambio de la app (también los
-- APK ya instalados, que actualizan el estado directamente), de la Edge Function
-- o de un admin desde SQL.

-- ---------------------------------------------------------------------------
-- 1) Reclamación <-> reporte de perdido del reclamante (opcional)
-- ---------------------------------------------------------------------------
alter table public.claims
  add column if not exists lost_report_id uuid references public.lost_reports (id) on delete set null;
create index if not exists claims_lost_report_idx on public.claims (lost_report_id);

-- Integridad: el reporte enlazado debe ser del propio reclamante.
create or replace function public.claims_lost_report_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lost_report_id is not null and not exists (
    select 1 from public.lost_reports lr
     where lr.id = new.lost_report_id and lr.reporter_id = new.claimant_id
  ) then
    raise exception 'El reporte de perdido debe ser del reclamante' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists claims_lost_report_owner_trg on public.claims;
create trigger claims_lost_report_owner_trg
  before insert or update of lost_report_id on public.claims
  for each row execute function public.claims_lost_report_owner();

-- ---------------------------------------------------------------------------
-- 2) Efectos de marcar un objeto como DEVUELTO
-- ---------------------------------------------------------------------------
create or replace function public.found_items_on_returned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_claim public.claims%rowtype;
begin
  -- Reclamación aprobada (como mucho una): avisar al dueño y cerrar su reporte.
  select * into v_claim
    from public.claims
   where found_item_id = new.id and status = 'APPROVED'
   order by updated_at desc
   limit 1;

  if found then
    insert into public.notifications (user_id, type, title, body, related_item_id)
    values (
      v_claim.claimant_id, 'ITEM_RETURNED', 'Entrega registrada',
      format('Se registró la entrega de "%s". ¡Qué bueno que lo recuperaste!', new.title),
      new.id
    );

    if v_claim.lost_report_id is not null then
      update public.lost_reports
         set status = 'RESOLVED'
       where id = v_claim.lost_report_id and status in ('OPEN', 'MATCHED');
    end if;
  end if;

  -- Las pendientes ya no pueden prosperar: rechazarlas y avisar a cada reclamante.
  with rejected as (
    update public.claims
       set status = 'REJECTED',
           reviewer_id = case when v_actor is distinct from claimant_id then v_actor end,
           review_note = 'El objeto ya fue entregado a su dueño'
     where found_item_id = new.id and status = 'PENDING'
    returning claimant_id
  )
  insert into public.notifications (user_id, type, title, body, related_item_id)
  select claimant_id, 'CLAIM_REJECTED', 'Reclamación cerrada',
         format('Tu reclamación de "%s" se cerró: el objeto ya fue entregado a su dueño.', new.title),
         new.id
    from rejected;

  -- Auditoría (solo si hay un usuario identificado; audit_logs.actor_id es obligatorio).
  if v_actor is not null and exists (select 1 from public.profiles where id = v_actor) then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (v_actor, 'FOUND_ITEM_RETURNED', 'FoundItem', new.id, new.title);
  end if;

  return new;
end;
$$;

drop trigger if exists found_items_on_returned_trg on public.found_items;
create trigger found_items_on_returned_trg
  after update of status on public.found_items
  for each row
  when (new.status = 'RETURNED' and old.status is distinct from 'RETURNED')
  execute function public.found_items_on_returned();

-- ---------------------------------------------------------------------------
-- 3) review_claim: al aprobar, marcar el reporte de perdido enlazado como MATCHED
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
  v_auto_note  constant text := 'Otra reclamación fue aprobada';
begin
  if p_status not in ('APPROVED', 'REJECTED') then
    raise exception 'status debe ser APPROVED o REJECTED' using hint = '400';
  end if;

  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Reclamación no encontrada' using hint = '404';
  end if;
  select * into v_item from public.found_items where id = v_claim.found_item_id for update;
  select role into v_actor_role from public.profiles where id = p_actor_id;

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

    -- Rechazo en cascada + aviso a cada reclamante afectado.
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

-- Las funciones de trigger no se invocan directamente.
revoke execute on function public.found_items_on_returned() from public, anon, authenticated;
revoke execute on function public.claims_lost_report_owner() from public, anon, authenticated;
