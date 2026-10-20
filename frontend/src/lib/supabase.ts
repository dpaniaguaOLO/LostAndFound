/**
 * Inicialización centralizada del cliente de Supabase.
 *
 * Se crea una sola instancia (singleton) y solo si hay credenciales configuradas.
 * Si no las hay, `supabase` es null y la app sigue usando el backend REST actual.
 * La sesión se persiste de forma segura con el almacenamiento del navegador/WebView
 * (Capacitor usa el localStorage del WebView, adecuado para el token de Supabase).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let client: SupabaseClient | null = null;

if (config.supabase.configured) {
  client = createClient(config.supabase.url!, config.supabase.anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'laf.supabase.auth',
    },
  });
}

/** Instancia de Supabase o null si no está configurado. */
export const supabase = client;

/** Lanza si se intenta usar Supabase sin configurar (evita fallos silenciosos). */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}
