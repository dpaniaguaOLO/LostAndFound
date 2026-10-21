/**
 * Extracción de mensaje de error agnóstica del backend.
 *
 * La capa de datos puede lanzar errores de distintos orígenes:
 *  - REST: ApiRequestError (con .message).
 *  - Supabase: PostgrestError / AuthError / FunctionsError / Error estándar.
 * Esta utilidad devuelve siempre un texto legible para mostrar en un toast,
 * con un respaldo cuando el error no trae mensaje. Los errores técnicos
 * conocidos (sin red, sesión caducada…) se traducen a un mensaje útil.
 */
const FRIENDLY: [RegExp, string][] = [
  [
    /failed to fetch|networkerror|load failed|network request failed|failed to send a request|fetch failed|err_internet_disconnected/i,
    'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
  ],
  [/jwt expired|invalid jwt|refresh token|session.*(expired|not found)/i, 'Tu sesión caducó. Vuelve a iniciar sesión.'],
  [/too many requests|rate limit/i, 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.'],
  [/payload too large|entity too large|exceeded the maximum allowed size/i, 'La imagen es demasiado grande (máximo 5 MB).'],
  [/permission denied|row-level security|violates row-level/i, 'No tienes permiso para hacer esta acción.'],
];

export function getErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  const raw = rawMessage(err);
  if (!raw) return fallback;
  for (const [re, friendly] of FRIENDLY) if (re.test(raw)) return friendly;
  return raw;
}

function rawMessage(err: unknown): string | null {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return null;
}
