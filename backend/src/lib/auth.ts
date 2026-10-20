import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string; // id de usuario
  role: 'EMPLOYEE' | 'ADMIN';
  sv?: number; // versión de sesión del usuario (ver User.sessionVersion)
  jti?: string; // identificador único del token (permite revocarlo)
  exp?: number;
}

/** bcrypt solo considera los primeros 72 bytes de la contraseña. */
export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { sub: string; role: JwtPayload['role']; sv: number }): string {
  const options = {
    expiresIn: config.jwtExpiresIn,
    jwtid: crypto.randomUUID(),
    algorithm: 'HS256',
  } as SignOptions;
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload {
  // Algoritmo fijado: evita aceptar tokens firmados con otro algoritmo ("alg: none", etc.).
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
}
