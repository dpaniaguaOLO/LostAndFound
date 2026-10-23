-- Juego: cosméticos equipados (marco de la foto y título bajo el nombre).
--
-- El colaborador elige qué marco y título desbloqueados lleva. Se guarda solo la
-- elección; si está desbloqueado (según puntos e insignias reales) lo decide la app
-- al mostrarlo (displayedCosmetics de @laf/shared), así que elegir algo no ganado
-- no tiene efecto visible. Aquí se valida el formato y que solo lo cambie su dueño.
--   equipped_frame: null (automático) | 'none' | bronze|silver|gold|emerald|ruby|diamond
--   equipped_title: null (automático) | 'none' | 'legend' | 'rank:<id>' | 'badge:<id>'
--
-- Reversión: drop function set_my_cosmetics; drop columns; recrear leaderboard()
-- y player_profile() como en la migración 017.

alter table public.profiles
  add column if not exists equipped_frame text,
  add column if not exists equipped_title text;

alter table public.profiles drop constraint if exists profiles_equipped_frame_chk;
alter table public.profiles
  add constraint profiles_equipped_frame_chk
  check (equipped_frame is null or equipped_frame in ('none', 'bronze', 'silver', 'gold', 'emerald', 'ruby', 'diamond'));

alter table public.profiles drop constraint if exists profiles_equipped_title_chk;
alter table public.profiles
  add constraint profiles_equipped_title_chk
  check (equipped_title is null or equipped_title ~ '^(none|legend|(rank|badge):[a-z_]{1,40})$');

-- Legibles por todos (se muestran en el ranking y los perfiles); no editables directamente.
grant select (equipped_frame, equipped_title) on public.profiles to authenticated;

create or replace function public.set_my_cosmetics(p_frame text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  -- Los CHECK de la tabla validan el formato.
  update public.profiles set equipped_frame = p_frame, equipped_title = p_title where id = auth.uid();
end;
$$;
revoke execute on function public.set_my_cosmetics(text, text) from public, anon;
grant execute on function public.set_my_cosmetics(text, text) to authenticated;

-- leaderboard() y player_profile() devuelven además lo equipado.
drop function if exists public.leaderboard(int, int);
drop function if exists public.player_profile(uuid);

create function public.leaderboard(p_offset int default 0, p_limit int default 30)
returns table (
  id uuid, name text, avatar_path text, points int, rank int,
  published int, published_photo int, returned int, fast_returned int,
  categories int, active_months int, equipped_frame text, equipped_title text
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
    select r.id, r.name, r.avatar_path, r.points, r.rank, r.published, r.published_photo,
           r.returned, r.fast_returned, r.categories, r.active_months, r.equipped_frame, r.equipped_title
      from (
        select p.id, p.name, p.avatar_path, s.points, s.published, s.published_photo,
               s.returned, s.fast_returned, s.categories, s.active_months,
               p.equipped_frame, p.equipped_title,
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

create function public.player_profile(p_user_id uuid)
returns table (
  id uuid, name text, avatar_path text, role text, created_at timestamptz,
  points int, rank int, published int, published_photo int, returned int,
  fast_returned int, categories int, active_months int, equipped_frame text, equipped_title text
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
           s.published, s.published_photo, s.returned, s.fast_returned, s.categories, s.active_months,
           p.equipped_frame, p.equipped_title
      from public.game_stats() s
      join public.profiles p on p.id = s.user_id
     where s.user_id = p_user_id;
end;
$$;
revoke execute on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;
