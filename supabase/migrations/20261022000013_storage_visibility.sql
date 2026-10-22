-- Visibilidad de fotos alineada con la de las publicaciones (auditoría 2026-10-22,
-- SEC-04 / FUN-02).
--
-- SEC-04: cualquier colaborador activo podía leer y LISTAR todo el bucket
--   item-photos: fotos de objetos archivados o eliminados (pueden contener datos
--   personales, p. ej. un documento de identidad) y, al listar, los UUID de todos
--   los usuarios (nombres de carpeta). Ahora una foto solo es legible por:
--     - su dueño (su carpeta),
--     - un admin,
--     - quien pueda VER la publicación que la usa (la subconsulta sobre
--       found_items / lost_reports aplica la RLS de esas tablas, así que lo
--       archivado o cerrado sigue oculto a terceros).
--   Las fotos huérfanas (sin publicación) dejan de ser legibles para terceros.
-- FUN-02: un admin que editaba la foto de una publicación ajena subía el archivo a
--   SU carpeta y el CHECK found_items_image_owner_chk (la foto debe estar en la
--   carpeta del autor) lo rechazaba. Ahora un admin puede subir a cualquier carpeta;
--   la app sube a la carpeta del autor.
--
-- Reversión: restaurar la política item_photos_select_authenticated de la
-- migración 004 y borrar item_photos_insert_admin y los dos índices.

drop policy if exists item_photos_select_authenticated on storage.objects;
create policy item_photos_select_authenticated
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (select 1 from public.found_items f where f.image_path = storage.objects.name)
      or exists (select 1 from public.lost_reports l where l.image_path = storage.objects.name)
    )
  );

-- Admin: puede subir a la carpeta del autor al editar una publicación ajena.
drop policy if exists item_photos_insert_admin on storage.objects;
create policy item_photos_insert_admin
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos' and public.is_admin());

-- Las subconsultas de la política buscan por image_path.
create index if not exists found_items_image_path_idx on public.found_items (image_path) where image_path is not null;
create index if not exists lost_reports_image_path_idx on public.lost_reports (image_path) where image_path is not null;
