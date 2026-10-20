-- Lost and Found — Esquema inicial para Supabase (PostgreSQL)
-- Equivalente al modelo actual de Prisma/SQLite, adaptado a Postgres.
-- Las políticas RLS y de Storage van en migraciones posteriores.
--
-- Decisiones:
--  * profiles.id referencia a auth.users(id): la identidad la gestiona Supabase Auth.
--  * Se usan CHECK para los estados (en vez de enums nativos) para facilitar cambios.
--  * updated_at se mantiene con un trigger común.
--  * El login por "número de colaborador" (employee_id) se conserva como dato único
--    del perfil; la relación con Supabase Auth se documenta en SUPABASE_SETUP.md.

-- ---------------------------------------------------------------------------
-- Utilidad: trigger para updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: perfil del colaborador, enlazado a la identidad de Supabase Auth
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null,
  employee_id  text not null unique,
  email        text unique,
  role         text not null default 'EMPLOYEE' check (role in ('EMPLOYEE', 'ADMIN')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- found_items: objetos encontrados
-- ---------------------------------------------------------------------------
create table if not exists public.found_items (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 2 and 140),
  description     text not null check (char_length(description) between 2 and 2000),
  category        text not null,
  location        text not null default '',
  found_at        timestamptz not null,
  image_path      text,              -- ruta en Supabase Storage (no URL pública)
  image_signature jsonb,             -- firma visual { hash, color } para búsqueda por imagen
  status          text not null default 'PUBLISHED'
                   check (status in ('PUBLISHED', 'CLAIMED', 'RETURNED', 'ARCHIVED')),
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists found_items_status_idx   on public.found_items (status);
create index if not exists found_items_category_idx on public.found_items (category);
create index if not exists found_items_reporter_idx on public.found_items (reporter_id);

create trigger found_items_set_updated_at
  before update on public.found_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lost_reports: objetos perdidos reportados por colaboradores
-- ---------------------------------------------------------------------------
create table if not exists public.lost_reports (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 2 and 140),
  description     text not null check (char_length(description) between 2 and 2000),
  category        text not null,
  location        text not null default '',  -- opcional: a veces no se sabe dónde
  lost_at         timestamptz not null,
  image_path      text,
  image_signature jsonb,
  status          text not null default 'OPEN'
                   check (status in ('OPEN', 'MATCHED', 'RESOLVED', 'CLOSED')),
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists lost_reports_status_idx   on public.lost_reports (status);
create index if not exists lost_reports_category_idx on public.lost_reports (category);
create index if not exists lost_reports_reporter_idx on public.lost_reports (reporter_id);

create trigger lost_reports_set_updated_at
  before update on public.lost_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- claims: solicitudes de recuperación sobre un objeto encontrado
-- ---------------------------------------------------------------------------
create table if not exists public.claims (
  id            uuid primary key default gen_random_uuid(),
  found_item_id uuid not null references public.found_items (id) on delete cascade,
  claimant_id   uuid not null references public.profiles (id) on delete cascade,
  message       text not null check (char_length(message) between 2 and 1000),
  status        text not null default 'PENDING'
                 check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewer_id   uuid references public.profiles (id) on delete set null,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists claims_status_idx    on public.claims (status);
create index if not exists claims_found_item_idx on public.claims (found_item_id);
create index if not exists claims_claimant_idx   on public.claims (claimant_id);

-- Evita que un mismo colaborador tenga dos reclamaciones PENDING del mismo objeto.
create unique index if not exists claims_unique_pending
  on public.claims (found_item_id, claimant_id)
  where status = 'PENDING';

create trigger claims_set_updated_at
  before update on public.claims
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications: avisos in-app por usuario
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  type            text not null
                   check (type in ('CLAIM_REQUESTED','CLAIM_APPROVED','CLAIM_REJECTED',
                                   'ITEM_RETURNED','MATCH_FOUND','SYSTEM')),
  title           text not null,
  body            text not null,
  read            boolean not null default false,
  related_item_id uuid,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_user_read_idx on public.notifications (user_id, read);

-- ---------------------------------------------------------------------------
-- audit_logs: trazabilidad de operaciones importantes
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references public.profiles (id) on delete cascade,
  action      text not null,
  entity_type text not null check (entity_type in ('FoundItem','LostReport','Claim','User')),
  entity_id   uuid not null,
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
