/**
 * Utilidades compartidas por las Edge Functions: CORS, respuestas JSON,
 * y clientes de Supabase (del llamador y con service_role).
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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
 * hay sesión válida. Usa el cliente del llamador (sujeto a RLS de profiles).
 */
export async function getCaller(authHeader: string | null): Promise<Caller | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const sb = callerClient(authHeader);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await sb
    .from('profiles')
    .select('id, name, role')
    .eq('id', data.user.id)
    .single();
  if (!profile) return null;
  return {
    id: profile.id as string,
    name: (profile.name as string) ?? '',
    role: (profile.role as 'EMPLOYEE' | 'ADMIN') ?? 'EMPLOYEE',
  };
}
