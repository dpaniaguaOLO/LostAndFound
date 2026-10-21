/**
 * Utilidades compartidas por las Edge Functions: CORS, respuestas JSON,
 * y clientes de Supabase (del llamador y con service_role).
 */
// Versión exacta (no rango) para que un despliegue no arrastre una versión nueva
// sin revisar (cadena de suministro).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.118.0';

// CORS abierto: la API se protege con el JWT del usuario (no con cookies), así
// que el origen no concede acceso por sí solo. La app Android (Capacitor) llama
// desde https://localhost, por eso no se restringe a un único dominio web.
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

// Cabeceras de seguridad para respuestas JSON de la API.
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...securityHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

/**
 * Rate limiting con almacenamiento compartido (tabla rate_limits, migración 007):
 * funciona aunque Supabase ejecute varias instancias de la función. Devuelve una
 * respuesta 429 si se superó el límite, o null si la petición puede continuar.
 * Si el limitador falla, no bloquea (falla abierto) y lo registra.
 */
export async function rateLimit(
  sb: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
  /** true para operaciones con coste (LLM): si el limitador falla, se rechaza. */
  failClosed = false,
): Promise<Response | null> {
  const { data, error } = await sb.rpc('rate_limit_hit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('[rate-limit]', error.message);
    return failClosed
      ? json({ error: 'UNAVAILABLE', message: 'Servicio no disponible en este momento. Inténtalo más tarde.' }, 503)
      : null;
  }
  const wait = Number(data) || 0;
  if (wait <= 0) return null;
  return json(
    { error: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
    429,
    { 'Retry-After': String(wait) },
  );
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

/** Cliente con el token del llamador (respeta RLS como ese usuario). */
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  });
}

/** Cliente con service_role (omite RLS). Solo para el servidor. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Caller {
  id: string;
  name: string;
  role: 'EMPLOYEE' | 'ADMIN';
}

/**
 * Identifica al llamador por su token y carga su perfil. Devuelve null si no
 * hay sesión válida o si la cuenta está DESACTIVADA: un JWT emitido antes de la
 * desactivación (o un login directo contra Auth) no debe servir para nada.
 * La columna `active` no es legible por `authenticated`, así que el perfil se lee
 * con service_role tras validar el token.
 */
export async function getCaller(authHeader: string | null): Promise<Caller | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const sb = callerClient(authHeader);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await adminClient()
    .from('profiles')
    .select('id, name, role, active')
    .eq('id', data.user.id)
    .single();
  if (!profile || profile.active === false) return null;
  return {
    id: profile.id as string,
    name: (profile.name as string) ?? '',
    role: (profile.role as 'EMPLOYEE' | 'ADMIN') ?? 'EMPLOYEE',
  };
}
