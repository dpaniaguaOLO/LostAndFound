-- Juego: foto de perfil, puntos y ranking (rama features/game).
--
--  1) Foto de perfil: columna profiles.avatar_path y bucket privado `avatars`
--     ("<user_id>/<uuid>.<ext>"). El cliente sube a su carpeta y la fija con
--     set_my_avatar(), que valida la ruta. No se concede UPDATE de la columna.
--  2) Puntos: game_stats() los calcula a partir de los datos reales; no hay
--     columna de puntos que nadie pueda escribir. Reglas (en sincronía con
--     POINT_RULES de @laf/shared y backend/src/lib/game.ts):
--       - 100 por objeto encontrado RETURNED con una reclamación APPROVED de otra
--         persona (sin reclamación no cuenta: evita publicar y "devolver" a uno mismo);
--       - +50 si se devolvió en ≤ 24 h desde que se publicó.
--     Los objetos ARCHIVED no cuentan (moderación quita los puntos).
--  3) leaderboard() (top 100 paginado) y player_profile(): SECURITY DEFINER, solo
--     para colaboradores activos; exponen únicamente nombre, foto y estadísticas.
--
-- Reversión: drop function leaderboard, player_profile, game_stats, set_my_avatar;
-- borrar las políticas avatars_* y el bucket; drop column profiles.avatar_path.

-- ---------------------------------------------------------------------------
-- 1) Foto de perfil
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_path_chk;
alter table public.profiles
  add constraint profiles_avatar_path_chk
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));

-- La ruta no es sensible (el bucket es privado): la necesitan el muro y el ranking.
grant select (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leer: la propia carpeta o la foto vigente de algún perfil (las antiguas no se listan).
drop policy if exists avatars_select on storage.objects;
create policy avatars_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.avatar_path = storage.objects.name)
    )
  );

drop policy if exists avatars_delete_own_or_admin on storage.objects;
create policy avatars_delete_own_or_admin
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists avatars_active_only on storage.objects;
create policy avatars_active_only
  on storage.objects as restrictive for all
  to authenticated
  using (bucket_id <> 'avatars' or public.is_active_user())
  with check (bucket_id <> 'avatars' or public.is_active_user());

create index if not exists profiles_avatar_path_idx on public.profiles (avatar_path) where avatar_path is not null;

-- Fija (o quita, con null) la foto del usuario actual. Devuelve la ruta anterior
-- para que el cliente borre el archivo viejo.
create or replace function public.set_my_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_path is not null then
    if p_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'Ruta de foto no válida' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path) then
      raise exception 'La foto no existe' using errcode = '22023';
    end if;
  end if;
  select avatar_path into v_old from public.profiles where id = v_uid;
  update public.profiles set avatar_path = p_path where id = v_uid;
  return v_old;
end;
$$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Puntos
-- ---------------------------------------------------------------------------
create or replace function public.game_stats()
returns table (user_id uuid, points int, published int, returned int, fast_returned int)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select fi.reporter_id,
           (fi.status = 'RETURNED' and exists (
              select 1 from public.claims c
               where c.found_item_id = fi.id and c.status = 'APPROVED' and c.claimant_id <> fi.reporter_id
           )) as ok,
           coalesce(fi.returned_at - fi.created_at <= interval '24 hours', false) as fast
      from public.found_items fi
     where fi.status <> 'ARCHIVED'
  )
  select p.id,
         (100 * count(*) filter (where f.ok) + 50 * count(*) filter (where f.ok and f.fast))::int,
         count(f.reporter_id)::int,
         count(*) filter (where f.ok)::int,
         count(*) filter (where f.ok and f.fast)::int
    from public.profiles p
    left join f on f.reporter_id = p.id
   where p.active
   group by p.id;
$$;
-- Interna: solo la usan leaderboard() y player_profile().
revoke execute on function public.game_stats() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Ranking y perfil público
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(p_offset int default 0, p_limit int default 30)
returns table (
  id uuid, name text, avatar_path text, points int, rank int,
  published int, returned int, fast_returned int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  -- Nunca más allá del puesto 100.
  v_limit int := greatest(least(coalesce(p_limit, 30), 100 - v_offset), 0);
begin
  if not public.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select r.id, r.name, r.avatar_path, r.points, r.rank, r.published, r.returned, r.fast_returned
      from (
        select p.id, p.name, p.avatar_path, s.points, s.published, s.returned, s.fast_returned,
               (rank() over (order by s.points desc))::int as rank
          from public.game_stats() s
          join public.profiles p on p.id = s.user_id
         where s.points > 0
      ) r
     order by r.rank, r.name, r.id
    offset v_offset
     limit v_limit;
end;
$$;
revoke execute on function public.leaderboard(int, int) from public, anon;
grant execute on function public.leaderboard(int, int) to authenticated;

create or replace function public.player_profile(p_user_id uuid)
returns table (
  id uuid, name text, avatar_path text, role text, created_at timestamptz,
  points int, rank int, published int, returned int, fast_returned int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.avatar_path, p.role, p.created_at, s.points,
           case when s.points > 0 then
             (select count(*)::int + 1 from public.game_stats() o where o.points > s.points)
           end,
           s.published, s.returned, s.fast_returned
      from public.game_stats() s
      join public.profiles p on p.id = s.user_id
     where s.user_id = p_user_id;
end;
$$;
revoke execute on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;
