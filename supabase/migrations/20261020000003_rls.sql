-- Row Level Security para Lost and Found.
-- Modelo: app interna. Todo colaborador autenticado ve el muro; cada uno gestiona
-- lo suyo; los admin moderan. La promoción de rol NO es posible desde el cliente.

alter table public.profiles      enable row level security;
alter table public.found_items   enable row level security;
alter table public.lost_reports  enable row level security;
alter table public.claims        enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs    enable row level security;

-- ===========================================================================
-- profiles
-- ===========================================================================
-- Leer: cualquier colaborador autenticado puede ver perfiles (para mostrar nombres).
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

-- Actualizar: solo tu propio perfil. La columna role NO puede cambiarse aquí
-- (se protege con un trigger más abajo para impedir auto-promoción).
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin puede actualizar cualquier perfil (incluido el rol).
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Evita que un no-admin cambie su propio rol (auto-promoción a ADMIN).
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'No autorizado para cambiar el rol';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_no_role_escalation on public.profiles;
create trigger profiles_no_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ===========================================================================
-- found_items  (visibles para toda la organización autenticada)
-- ===========================================================================
create policy found_items_select_authenticated
  on public.found_items for select
  to authenticated
  using (true);

-- Crear: cualquier colaborador, pero solo a su propio nombre.
create policy found_items_insert_own
  on public.found_items for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Editar: el autor o un admin.
create policy found_items_update_owner_or_admin
  on public.found_items for update
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin())
  with check (reporter_id = auth.uid() or public.is_admin());

-- Eliminar: solo admin (moderación).
create policy found_items_delete_admin
  on public.found_items for delete
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- lost_reports
-- ===========================================================================
create policy lost_reports_select_authenticated
  on public.lost_reports for select
  to authenticated
  using (true);

create policy lost_reports_insert_own
  on public.lost_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy lost_reports_update_owner_or_admin
  on public.lost_reports for update
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin())
  with check (reporter_id = auth.uid() or public.is_admin());

create policy lost_reports_delete_admin
  on public.lost_reports for delete
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- claims
-- ===========================================================================
-- Ver: el reclamante, el autor del objeto reclamado, o un admin.
create policy claims_select_involved
  on public.claims for select
  to authenticated
  using (
    claimant_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.found_items fi
      where fi.id = claims.found_item_id and fi.reporter_id = auth.uid()
    )
  );

-- Crear: a tu propio nombre y nunca sobre un objeto que tú publicaste.
create policy claims_insert_own
  on public.claims for insert
  to authenticated
  with check (
    claimant_id = auth.uid()
    and not exists (
      select 1 from public.found_items fi
      where fi.id = found_item_id and fi.reporter_id = auth.uid()
    )
  );

-- Actualizar (revisar/cancelar): el reclamante (para cancelar la suya), el autor
-- del objeto, o un admin. La validación fina del flujo (no auto-aprobar, etc.)
-- la refuerza una Edge Function / servidor; aquí se acota el acceso base.
create policy claims_update_involved
  on public.claims for update
  to authenticated
  using (
    claimant_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.found_items fi
      where fi.id = claims.found_item_id and fi.reporter_id = auth.uid()
    )
  )
  with check (
    claimant_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.found_items fi
      where fi.id = claims.found_item_id and fi.reporter_id = auth.uid()
    )
  );

-- Regla de integridad: el reclamante no puede ser el revisor de su propia claim.
create or replace function public.claims_no_self_review()
returns trigger
language plpgsql
as $$
begin
  if new.reviewer_id is not null and new.reviewer_id = new.claimant_id then
    raise exception 'El reclamante no puede revisar su propia solicitud';
  end if;
  return new;
end;
$$;

drop trigger if exists claims_no_self_review_trg on public.claims;
create trigger claims_no_self_review_trg
  before insert or update on public.claims
  for each row execute function public.claims_no_self_review();

-- ===========================================================================
-- notifications  (privadas de cada usuario)
-- ===========================================================================
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Marcar leídas: solo las propias.
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La inserción de notificaciones la hace el servidor (Edge Function / service_role),
-- por eso no se expone una policy de insert a authenticated.

-- ===========================================================================
-- audit_logs  (solo lectura para admin; escritura desde servidor)
-- ===========================================================================
create policy audit_logs_select_admin
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());
