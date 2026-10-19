import type { ApiError } from '@laf/shared';

const TOKEN_KEY = 'laf.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // Cuando se pasa FormData, no se fija Content-Type (el navegador lo gestiona).
  formData?: FormData;
  auth?: boolean;
}

/**
 * Cliente HTTP único para hablar con el backend.
 * Usa el proxy de Vite (/api -> http://localhost:4000) en desarrollo.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, auth = true } = options;

  const headers: Record<string, string> = {};
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    // Si el token expiró, limpiar sesión para forzar re-login.
    if (res.status === 401) tokenStore.clear();
    throw new ApiRequestError(
      res.status,
      err.error ?? 'ERROR',
      err.message ?? 'Ocurrió un error inesperado',
      err.details,
    );
  }

  return data as T;
}
