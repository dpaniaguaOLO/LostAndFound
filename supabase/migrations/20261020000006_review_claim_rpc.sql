-- review_claim(): aprobar/rechazar una reclamación de forma ATÓMICA.
--
-- La Edge Function `api` hacía la revisión con varias escrituras sueltas vía
-- PostgREST (sin transacción ni condición sobre el estado): dos aprobaciones
-- simultáneas del mismo objeto podían prosperar ambas, y un fallo a mitad dejaba
-- el estado incoherente. Esta función lo hace todo en una transacción, con las
-- filas bloqueadas (FOR UPDATE):
--   - valida permisos (autor del objeto o admin; nunca el propio reclamante),
--   - aprobar exige que el objeto siga PUBLISHED -> pasa a CLAIMED,
--   - rechaza en cascada las demás pendientes y notifica a esos reclamantes,
--   - notifica al reclamante y registra auditoría.
--
-- Errores: se lanzan con HINT = código HTTP ('400', '403', '404') para que la
-- Edge Function los traduzca. Solo la service_role puede ejecutarla (recibe el
-- actor como parámetro, así que nunca debe exponerse a clientes).
-- ORDEN DE DESPLIEGUE: aplicar esta migración antes de desplegar la Edge Function.

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
      then format('Tu reclamación de "%s" fue aprobada. Coordina la entrega.', v_item.title)
      else format('Tu reclamación de "%s" fue rechazada.', v_item.title)
    end,
    v_item.id
  );

  if p_status = 'APPROVED' then
    update public.found_items set status = 'CLAIMED' where id = v_item.id;

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

-- Solo el servidor (service_role). Supabase concede EXECUTE a anon/authenticated
-- por defecto en el esquema public: hay que revocarlo explícitamente.
revoke execute on function public.review_claim(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_claim(uuid, uuid, text, text) to service_role;
