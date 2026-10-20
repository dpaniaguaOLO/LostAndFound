/**
 * URLs firmadas para las imágenes de /uploads.
 *
 * Un <img> no puede enviar el header Authorization, así que en lugar de dejar
 * /uploads público, la API devuelve URLs con caducidad y firma HMAC:
 *   /uploads/<archivo>?exp=<unix>&sig=<hmac>
 * Solo quien recibió la URL de la API (usuario autenticado) puede verla, y deja
 * de funcionar al caducar. La clave se deriva de JWT_SECRET (no es reutilizable
 * para firmar tokens: HMAC con un contexto distinto).
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const key = crypto.createHmac('sha256', config.jwtSecret).update('laf:uploads:v1').digest();
const FILENAME_RE = /^[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/;
// Las caducidades se redondean a bloques de 10 min: la misma imagen tiene la misma
// URL durante ese bloque y el navegador la puede cachear.
const BUCKET_S = 600;

function sign(filename: string, exp: number): string {
  return crypto.createHmac('sha256', key).update(`${filename}:${exp}`).digest('base64url');
}

/** Firma una URL pública relativa de /uploads (otras URLs se devuelven igual). */
export function signUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('/uploads/')) return url;
  const filename = url.slice('/uploads/'.length);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.ceil((now + config.uploadUrlTtl) / BUCKET_S) * BUCKET_S;
  return `/uploads/${filename}?exp=${exp}&sig=${sign(filename, exp)}`;
}

/** Comprueba nombre, caducidad y firma (comparación en tiempo constante). */
export function verifyUploadRequest(filename: string, exp: unknown, sig: unknown): boolean {
  if (!FILENAME_RE.test(filename) || typeof exp !== 'string' || typeof sig !== 'string') return false;
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(filename, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
