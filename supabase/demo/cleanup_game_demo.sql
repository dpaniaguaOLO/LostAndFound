-- Borra los datos demo de seed_game_demo.sql (todo lo que tiene id 'dddddddd-…').
--   node supabase/demo/demo_photos.mjs --cleanup     # primero: las fotos de Storage
--   supabase db query --linked -f supabase/demo/cleanup_game_demo.sql
-- No toca nada creado por usuarios reales. El colaborador 777 se conserva (solo
-- se borran sus objetos demo).

begin;
-- Primero reclamaciones y avisos: así el trigger de borrado de objetos no avisa a nadie.
delete from public.notifications where id::text like 'dddddddd-%';
delete from public.claims        where id::text like 'dddddddd-%';
delete from public.lost_reports  where id::text like 'dddddddd-%';
delete from public.found_items   where id::text like 'dddddddd-%';
-- Colaboradores demo (sus perfiles y lo que quede de ellos se borran en cascada).
delete from public.profiles where id::text like 'dddddddd-0000-%';
delete from auth.users      where id::text like 'dddddddd-0000-%';
commit;

select count(*) as perfiles_demo_restantes from public.profiles where employee_id like 'demo-%';
