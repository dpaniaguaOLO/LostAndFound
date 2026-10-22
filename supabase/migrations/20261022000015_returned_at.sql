-- Fecha de devolución de los objetos encontrados (v0.29.0).
--
-- Hasta ahora no se guardaba CUÁNDO se entregó un objeto (solo updated_at, que
-- cambia con cualquier edición), así que Olivia no podía responder "¿qué se
-- devolvió esta semana?". La fija un trigger al pasar a RETURNED; el cliente no
-- puede escribirla (no está en los GRANT de update por columna de la mig. 007).

alter table public.found_items add column if not exists returned_at timestamptz;

-- Objetos ya devueltos: la mejor aproximación disponible es su última modificación.
update public.found_items
   set returned_at = updated_at
 where status = 'RETURNED' and returned_at is null;

create index if not exists found_items_returned_at_idx
  on public.found_items (returned_at)
  where returned_at is not null;

create or replace function public.found_items_set_returned_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'RETURNED' and old.status is distinct from 'RETURNED' then
    new.returned_at := now();
  elsif new.status is distinct from 'RETURNED' and old.status = 'RETURNED' then
    -- Solo un admin saca un objeto de RETURNED (p. ej. archivar): ya no cuenta como devuelto.
    new.returned_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.found_items_set_returned_at() from public, anon, authenticated;

drop trigger if exists found_items_set_returned_at_trg on public.found_items;
create trigger found_items_set_returned_at_trg
  before update of status on public.found_items
  for each row execute function public.found_items_set_returned_at();
