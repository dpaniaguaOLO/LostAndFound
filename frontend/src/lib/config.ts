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
    /**
     * Dominio del email sintético derivado del número de colaborador (opción 2).
     * El login es por employee_id; internamente Supabase Auth usa email, así que
     * se construye `${employeeId}@${authEmailDomain}`. DEBE coincidir con el
     * email usado al crear cada usuario en el panel de Supabase.
     * Configurable con VITE_SUPABASE_EMAIL_DOMAIN.
     */
    authEmailDomain: readEnv('VITE_SUPABASE_EMAIL_DOMAIN') ?? 'lostandfound.olo',
  },
};

/**
 * Construye el email sintético de un colaborador a partir de su número.
 * Ej.: syntheticEmail('1001') -> '1001@lostandfound.olo'
 */
export function syntheticEmail(employeeId: string): string {
  return `${employeeId.trim()}@${config.supabase.authEmailDomain}`;
}

/** ¿Debe la app usar Supabase como backend de datos? */
export const useSupabase = config.dataBackend === 'supabase' && config.supabase.configured;

/**
 * Error de configuración que impide arrancar con el backend correcto (FUN-04).
 * El build ya lo comprueba (vite.config.ts); esto cubre `vite dev`. Sin esta
 * comprobación, un valor inválido o Supabase incompleto caían a REST en silencio.
 */
export const configError: string | null = (() => {
  const raw = readEnv('VITE_DATA_BACKEND');
  if (raw && raw !== 'rest' && raw !== 'supabase') {
    return `VITE_DATA_BACKEND="${raw}" no es válido: usa "rest" o "supabase".`;
  }
  if (raw === 'supabase' && !config.supabase.configured) {
    return 'VITE_DATA_BACKEND="supabase" requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.';
  }
  return null;
})();

/**
 * ¿Se permite el auto-registro desde la pantalla de login?
 * En modo Supabase (app interna, opción 2 con email sintético) las altas las hace
 * un administrador, así que el auto-registro queda deshabilitado. En modo REST se
 * mantiene el comportamiento original.
 */
export const allowSelfRegister = !useSupabase;
