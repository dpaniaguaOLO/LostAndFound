-- Funciones auxiliares para autorización y creación de perfil.

-- ---------------------------------------------------------------------------
-- is_admin(): ¿el usuario autenticado tiene rol ADMIN?
-- SECURITY DEFINER para poder leer profiles sin bloquearse con su propia RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- ---------------------------------------------------------------------------
-- current_role_is(target): comprobación genérica de rol del usuario actual.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user(): al registrarse en Supabase Auth, crea su profile.
-- Toma name/employee_id de los metadatos del registro (raw_user_meta_data).
-- El rol SIEMPRE arranca como EMPLOYEE; promover a ADMIN es una acción de
-- servidor/panel, nunca desde el cliente (ver RLS).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, employee_id, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Colaborador'),
    coalesce(new.raw_user_meta_data ->> 'employee_id', new.id::text),
    new.email,
    'EMPLOYEE'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Dispara la creación del perfil tras insertar en auth.users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
