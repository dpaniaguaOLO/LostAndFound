// Lectura robusta de parámetros de query string. Express entrega string, array u
// objeto según cómo venga la URL (?a=1&a=2 -> array); aquí se normaliza.

/** Devuelve el valor como string no vacío, o undefined. Si viene repetido, toma el primero. */
export function queryString(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Texto de búsqueda para filtros `contains` (LIKE). Prisma no escapa los
 * comodines en SQLite, así que `%` y `_` del usuario actuarían como comodines
 * (un "%" devolvería todo). Se eliminan; devuelve null si no queda texto útil,
 * en cuyo caso no debe haber coincidencias.
 */
export function likeSafe(search: string): string | null {
  const cleaned = search.replace(/[%_\\]/g, '').trim().slice(0, 200);
  return cleaned === '' ? null : cleaned;
}

/** Entero acotado a [min, max]; usa `fallback` si no es un número válido. */
export function queryInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(queryString(value) ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Página y tamaño de página de un listado paginado. */
export function pagination(query: Record<string, unknown>) {
  const page = queryInt(query.page, 1, 1, 10_000);
  const pageSize = queryInt(query.pageSize, 12, 1, 50);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
