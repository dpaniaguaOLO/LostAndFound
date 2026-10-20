-- Storage para las fotografías de objetos (encontrados y perdidos).
-- Bucket PRIVADO: el acceso se hace con URLs firmadas desde la app.
-- Convención de rutas: "<user_id>/<uuid>.<ext>" para poder acotar permisos por dueño.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  false,                       -- privado (no público)
  5242880,                     -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Subir: el colaborador autenticado solo puede escribir en su propia carpeta
-- (primer segmento de la ruta = su user_id).
create policy item_photos_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leer: cualquier colaborador autenticado puede leer las fotos del bucket
-- (los objetos del muro son visibles para la organización). El bucket es privado,
-- así que el acceso real se concede vía URLs firmadas generadas por la app.
create policy item_photos_select_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'item-photos');

-- Borrar/actualizar: el dueño del archivo o un admin.
create policy item_photos_modify_owner_or_admin
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy item_photos_delete_owner_or_admin
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'item-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
