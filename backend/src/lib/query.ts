// Lectura robusta de parámetros de query string. Express entrega string, array u
// objeto según cómo venga la URL (?a=1&a=2 -> array); aquí se normaliza.

/** Devuelve el valor como string no vacío, o undefined. Si viene repetido, toma el primero. */
export function queryString(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
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
