/**
 * Fotos de perfil en Supabase: bucket privado `avatars` ("<user_id>/<uuid>.<ext>",
 * migración 016). Se leen con URLs firmadas que se reutilizan durante 1 h, igual
 * que las fotos de los objetos (services/supabase.ts).
 */
import { requireSupabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
const SIGN_TTL_S = 7200;
const CACHE_TTL_MS = 3600_000;
const cache = new Map<string, { url: string; exp: number }>();

function cached(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.exp > Date.now() ? hit.url : null;
}

/** Firma en una sola petición las rutas que falten y devuelve un mapa ruta → URL. */
export async function signAvatars(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  const missing = wanted.filter((p) => !cached(p));
  if (missing.length) {
    const { data } = await requireSupabase().storage.from(AVATAR_BUCKET).createSignedUrls(missing, SIGN_TTL_S);
    const exp = Date.now() + CACHE_TTL_MS;
    for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) cache.set(r.path, { url: r.signedUrl, exp });
  }
  const out = new Map<string, string>();
  for (const p of wanted) {
    const url = cached(p);
    if (url) out.set(p, url);
  }
  return out;
}

export async function signAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return (await signAvatars([path])).get(path) ?? null;
}
