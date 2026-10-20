/**
 * Extracción de mensaje de error agnóstica del backend.
 *
 * La capa de datos puede lanzar errores de distintos orígenes:
 *  - REST: ApiRequestError (con .message).
 *  - Supabase: PostgrestError / AuthError / Error estándar (con .message).
 * Esta utilidad devuelve siempre un texto legible para mostrar en un toast,
 * con un respaldo cuando el error no trae mensaje.
 */
export function getErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}
