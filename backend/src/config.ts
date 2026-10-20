import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/**
 * TRUST_PROXY: cuántos proxies de confianza hay delante (p. ej. "1" detrás de un
 * balanceador) o una lista de IPs/subredes. Sin él, X-Forwarded-For se IGNORA
 * (no se puede falsificar la IP del cliente ni el protocolo).
 */
function trustProxy(): boolean | number | string {
  const v = process.env.TRUST_PROXY;
  if (!v) return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  return v;
}

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-secret');
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
  // Validez de las URLs firmadas de imágenes (segundos).
  uploadUrlTtl: Number(process.env.UPLOAD_URL_TTL_SECONDS ?? 3600),
  isProduction,
  trustProxy: trustProxy(),
  // Redirige HTTP -> HTTPS (requiere TRUST_PROXY si TLS termina en un proxy).
  forceHttps: bool('FORCE_HTTPS', false),
  // Registro abierto de cuentas. En una app interna conviene desactivarlo en
  // producción y dar de alta a los colaboradores de forma controlada.
  allowSelfRegistration: bool('ALLOW_SELF_REGISTRATION', true),
};
