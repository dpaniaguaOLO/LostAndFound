-- Desactivación de colaboradores.
-- Un admin puede desactivar a un colaborador: conserva todos sus datos e historial,
-- pero no podrá iniciar sesión. Reversible (reactivar).
--
-- El cliente solo puede cambiar su propio `name` (ver política de 20261020000007);
-- la columna `active` solo la modifica el servidor (Edge Function con service_role),
-- así que no se concede UPDATE de esta columna a `authenticated`.

alter table public.profiles
  add column if not exists active boolean not null default true;

-- Índice para filtrar activos/inactivos en el panel admin.
create index if not exists profiles_active_idx on public.profiles (active);

-- my_profile() debe exponer también `active` para que el cliente sepa si su
-- cuenta sigue habilitada. Cambia la firma (nueva columna), así que se recrea.
drop function if exists public.my_profile();
create function public.my_profile()
returns table (
  id uuid, name text, employee_id text, email text, role text,
  active boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.employee_id, p.email, p.role, p.active, p.created_at
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
