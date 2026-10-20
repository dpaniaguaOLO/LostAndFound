/**
 * Serialización de filas de Supabase (snake_case) a los tipos que espera el
 * frontend (camelCase), equivalente a backend/src/lib/serialize.ts.
 *
 * `imageUrl` se resuelve a una URL firmada a partir de `image_path` (Storage).
 * Nunca se exponen columnas sensibles (image_signature, etc.).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.118.0';

const PHOTO_BUCKET = 'item-photos';

function iso(d: unknown): string {
  if (typeof d === 'string') return d;
  if (d instanceof Date) return d.toISOString();
  return String(d ?? '');
}

type Row = Record<string, unknown>;

// URLs firmadas válidas 2 h y reutilizadas durante 1 h: así toda URL devuelta sigue
// siendo válida al menos 1 h. La caché vive mientras la instancia esté caliente y
// evita una petición a Storage por imagen en cada listado.
const SIGN_TTL_S = 7200;
const CACHE_TTL_MS = 3600_000;
const urlCache = new Map<string, { url: string; exp: number }>();

function cached(path: string): string | null {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  if (hit) urlCache.delete(path);
  return null;
}

/** Firma en UNA sola petición todas las rutas aún no cacheadas. */
export async function primeSignedUrls(sb: SupabaseClient, paths: unknown[]): Promise<void> {
  const missing = [...new Set(paths.filter((p): p is string => typeof p === 'string' && !!p))]
    .filter((p) => !cached(p));
  if (missing.length === 0) return;
  const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(missing, SIGN_TTL_S);
  const exp = Date.now() + CACHE_TTL_MS;
  for (const r of data ?? []) {
    if (r.path && r.signedUrl && !r.error) urlCache.set(r.path, { url: r.signedUrl, exp });
  }
  if (urlCache.size > 5000) urlCache.clear();
}

/** URL firmada para una ruta de Storage, o null. Usa la caché si está precargada. */
export async function signedUrl(sb: SupabaseClient, path: unknown): Promise<string | null> {
  if (!path || typeof path !== 'string') return null;
  const hit = cached(path);
  if (hit) return hit;
  await primeSignedUrls(sb, [path]);
  return cached(path);
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
    active: (u.active as boolean | null) ?? true,
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
