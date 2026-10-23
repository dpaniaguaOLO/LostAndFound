-- Juego: reglas definitivas de puntos y estadísticas para las insignias por niveles.
--
-- Puntos (en sincronía con POINT_RULES de @laf/shared y backend/src/lib/game.ts):
--   - 50 por objeto encontrado publicado (no archivado; si se elimina, desaparece);
--   - 100 más si se devuelve con una reclamación APPROVED de otra persona;
--   - 50 más si esa devolución fue en ≤ 24 h desde que se publicó.
-- Nuevas estadísticas: publicados con foto, categorías distintas devueltas y meses
-- distintos con devoluciones (insignias Fotógrafo, Todoterreno y Constante).
--
-- Cambia la forma de las tablas devueltas, así que se recrean las tres funciones
-- con los mismos permisos que en la migración 016.
-- Reversión: volver a ejecutar la sección 2-3 de la migración 016.

drop function if exists public.leaderboard(int, int);
drop function if exists public.player_profile(uuid);
drop function if exists public.game_stats();

create function public.game_stats()
returns table (
  user_id uuid, points int, published int, published_photo int,
  returned int, fast_returned int, categories int, active_months int
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select fi.reporter_id,
           fi.category,
           fi.image_path is not null as photo,
           fi.returned_at,
           (fi.status = 'RETURNED' and exists (
              select 1 from public.claims c
               where c.found_item_id = fi.id and c.status = 'APPROVED' and c.claimant_id <> fi.reporter_id
           )) as ok,
           coalesce(fi.returned_at - fi.created_at <= interval '24 hours', false) as fast
      from public.found_items fi
     where fi.status <> 'ARCHIVED'
  )
  select p.id,
         (50 * count(f.reporter_id)
          + 100 * count(*) filter (where f.ok)
          + 50 * count(*) filter (where f.ok and f.fast))::int,
         count(f.reporter_id)::int,
         count(*) filter (where f.photo)::int,
         count(*) filter (where f.ok)::int,
         count(*) filter (where f.ok and f.fast)::int,
         count(distinct f.category) filter (where f.ok)::int,
         count(distinct date_trunc('month', f.returned_at)) filter (where f.ok)::int
    from public.profiles p
    left join f on f.reporter_id = p.id
   where p.active
   group by p.id;
$$;
revoke execute on function public.game_stats() from public, anon, authenticated;

create function public.leaderboard(p_offset int default 0, p_limit int default 30)
returns table (
  id uuid, name text, avatar_path text, points int, rank int,
  published int, published_photo int, returned int, fast_returned int,
  categories int, active_months int
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
           r.returned, r.fast_returned, r.categories, r.active_months
      from (
        select p.id, p.name, p.avatar_path, s.points, s.published, s.published_photo,
               s.returned, s.fast_returned, s.categories, s.active_months,
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
  fast_returned int, categories int, active_months int
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
           s.published, s.published_photo, s.returned, s.fast_returned, s.categories, s.active_months
      from public.game_stats() s
      join public.profiles p on p.id = s.user_id
     where s.user_id = p_user_id;
end;
$$;
revoke execute on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;
