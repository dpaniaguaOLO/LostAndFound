/**
 * Serialización de filas de Supabase (snake_case) a los tipos que espera el
 * frontend (camelCase), equivalente a backend/src/lib/serialize.ts.
 *
 * `imageUrl` se resuelve a una URL firmada a partir de `image_path` (Storage).
 * Nunca se exponen columnas sensibles (image_signature, etc.).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const PHOTO_BUCKET = 'item-photos';

function iso(d: unknown): string {
  if (typeof d === 'string') return d;
  if (d instanceof Date) return d.toISOString();
  return String(d ?? '');
}

type Row = Record<string, unknown>;

/** Genera una URL firmada (1h) para una ruta de Storage, o null. */
export async function signedUrl(sb: SupabaseClient, path: unknown): Promise<string | null> {
  if (!path || typeof path !== 'string') return null;
  const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function reporterOf(r: Row): { id: string; name: string } {
  const rep = r.reporter as Row | null | undefined;
  return rep
    ? { id: rep.id as string, name: (rep.name as string) ?? '' }
    : { id: (r.reporter_id as string) ?? '', name: '' };
}

export function serializeUser(u: Row) {
  return {
    id: u.id as string,
    name: u.name as string,
    employeeId: u.employee_id as string,
    email: (u.email as string | null) ?? null,
    role: u.role as 'EMPLOYEE' | 'ADMIN',
    createdAt: iso(u.created_at),
  };
}

export async function serializeFoundItem(sb: SupabaseClient, i: Row) {
  return {
    id: i.id as string,
    title: i.title as string,
    description: i.description as string,
    category: i.category as string,
    location: i.location as string,
    foundAt: iso(i.found_at),
    imageUrl: await signedUrl(sb, i.image_path),
    status: i.status as string,
    reporter: reporterOf(i),
    createdAt: iso(i.created_at),
    updatedAt: iso(i.updated_at),
  };
}

export async function serializeLostReport(sb: SupabaseClient, i: Row) {
  return {
    id: i.id as string,
    title: i.title as string,
    description: i.description as string,
    category: i.category as string,
    location: i.location as string,
    lostAt: iso(i.lost_at),
    imageUrl: await signedUrl(sb, i.image_path),
    status: i.status as string,
    reporter: reporterOf(i),
    createdAt: iso(i.created_at),
    updatedAt: iso(i.updated_at),
  };
}

export async function serializeClaim(sb: SupabaseClient, c: Row) {
  const claimant = c.claimant as Row | null | undefined;
  const foundItem = c.found_item as Row | null | undefined;
  return {
    id: c.id as string,
    foundItemId: c.found_item_id as string,
    foundItem: foundItem
      ? {
          id: foundItem.id as string,
          title: foundItem.title as string,
          imageUrl: await signedUrl(sb, foundItem.image_path),
          status: foundItem.status as string,
        }
      : undefined,
    claimant: claimant
      ? { id: claimant.id as string, name: (claimant.name as string) ?? '' }
      : { id: (c.claimant_id as string) ?? '', name: '' },
    message: c.message as string,
    status: c.status as string,
    reviewerId: (c.reviewer_id as string | null) ?? null,
    reviewNote: (c.review_note as string | null) ?? null,
    createdAt: iso(c.created_at),
    updatedAt: iso(c.updated_at),
  };
}
