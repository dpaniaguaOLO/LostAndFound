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

// "Recordar este dispositivo": si se marca, la sesión va a localStorage (persiste
// al cerrar la app/navegador); si no, a sessionStorage (se pierde al cerrarla).
// Antes Supabase usaba siempre localStorage y la casilla no tenía efecto (UX-03).
const REMEMBER_KEY = 'laf.remember';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function sessionStore(): Storage {
  return safe(() => (localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage), localStorage);
}

/** Se llama antes de iniciar sesión, según la casilla "Recordar este dispositivo". */
export function setRememberDevice(remember: boolean): void {
  safe(() => {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    // Que no quede una copia de la sesión en el almacenamiento que ya no se usa.
    (remember ? sessionStorage : localStorage).removeItem(STORAGE_KEY);
  }, undefined);
}

const STORAGE_KEY = 'laf.supabase.auth';

if (config.supabase.configured) {
  client = createClient(config.supabase.url!, config.supabase.anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // false: la app no usa OAuth ni enlaces mágicos. Con true, un enlace con
      // #access_token=<token de otro> iniciaba sesión con la cuenta del atacante.
      detectSessionInUrl: false,
      storageKey: STORAGE_KEY,
      storage: {
        getItem: (k) => safe(() => sessionStore().getItem(k), null),
        setItem: (k, v) => safe(() => sessionStore().setItem(k, v), undefined),
        removeItem: (k) =>
          safe(() => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
          }, undefined),
      },
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
