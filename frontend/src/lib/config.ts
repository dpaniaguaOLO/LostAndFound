/**
 * Configuración centralizada del frontend, leída de variables de entorno (Vite).
 *
 * Define qué backend de datos se usa y las credenciales públicas de Supabase.
 * Nunca pongas aquí secretos de servidor (service_role, etc.): en el cliente solo
 * va la clave "anon/publishable", que es segura siempre que la base esté protegida
 * con RLS (ver supabase/migrations y docs/SUPABASE_SETUP.md).
 */

/** Backend de datos activo. 'rest' = backend Express actual; 'supabase' = Supabase. */
export type DataBackend = 'rest' | 'supabase';

function readEnv(key: string): string | undefined {
  // import.meta.env es inyectado por Vite en build/dev.
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.length > 0 ? v : undefined;
}

export const config = {
  /**
   * Base URL del backend REST. En web/dev se deja vacío para usar el proxy de Vite
   * ("/api" -> localhost:4000). En Android (Capacitor) debe apuntar a la URL real
   * del backend, p. ej. https://api.olo-lostandfound.com
   */
  apiBaseUrl: readEnv('VITE_API_BASE_URL') ?? '',

  /** Proveedor de datos. Por defecto 'rest' para no alterar el comportamiento actual. */
  dataBackend: (readEnv('VITE_DATA_BACKEND') as DataBackend) ?? 'rest',

  supabase: {
    url: readEnv('VITE_SUPABASE_URL'),
    anonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
    /** true solo si hay URL y clave configuradas. */
    get configured() {
      return Boolean(this.url && this.anonKey);
    },
  },
};

/** ¿Debe la app usar Supabase como backend de datos? */
export const useSupabase = config.dataBackend === 'supabase' && config.supabase.configured;
