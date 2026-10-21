/**
 * Caché local mínima para poder mostrar algo sin conexión (stale-while-offline).
 * Solo guarda la primera página del muro sin filtros. Se borra al cerrar sesión
 * para que otra persona que use el mismo dispositivo no vea datos ajenos.
 */
const PREFIX = 'laf.cache.';

export interface Cached<T> {
  savedAt: string;
  data: T;
}

export function cacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    /* almacenamiento lleno o bloqueado: no es crítico */
  }
}

export function cacheGet<T>(key: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

export function cacheClear(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignorar */
  }
}
