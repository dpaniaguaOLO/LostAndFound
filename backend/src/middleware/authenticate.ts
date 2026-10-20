import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import { forbidden, sendError, unauthorized, HttpError } from '../lib/http.js';

// Extiende Request con el usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/**
 * Exige un token JWT válido en el header Authorization: Bearer <token>.
 * Además del firmado y la caducidad, en cada petición se comprueba en la BD:
 *  - que el usuario exista y su rol actual (un cambio de rol surte efecto ya);
 *  - que la versión de sesión coincida (restablecer la contraseña la invalida);
 *  - que el token no se haya revocado (cierre de sesión).
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return sendError(res, unauthorized('Falta el token de autenticación'));
  }
  const token = header.slice('Bearer '.length).trim();
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return sendError(res, unauthorized('Token inválido o expirado'));
  }
  Promise.all([
    prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, sessionVersion: true },
    }),
    payload.jti ? prisma.revokedToken.findUnique({ where: { jti: payload.jti } }) : null,
  ])
    .then(([user, revoked]) => {
      if (!user || revoked || (payload.sv ?? 0) !== user.sessionVersion) {
        return sendError(res, unauthorized('Sesión no válida. Inicia sesión de nuevo.'));
      }
      req.auth = {
        sub: user.id,
        role: user.role as JwtPayload['role'],
        sv: user.sessionVersion,
        jti: payload.jti,
        exp: payload.exp,
      };
      next();
    })
    .catch(next);
}

/** Exige que el usuario autenticado tenga rol ADMIN. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return sendError(res, unauthorized());
  if (req.auth.role !== 'ADMIN') {
    return sendError(res, forbidden('Se requiere rol de administrador'));
  }
  next();
}

/** Traduce errores conocidos de librerías a HttpError (o null si no se reconoce). */
function toHttpError(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'La imagen supera el tamaño máximo permitido');
    }
    return new HttpError(400, 'BAD_REQUEST', `Error en la subida del archivo (${err.code})`);
  }
  // Errores de body-parser (JSON mal formado o cuerpo demasiado grande).
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') return new HttpError(400, 'BAD_REQUEST', 'JSON inválido');
  if (type === 'entity.too.large') {
    return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición es demasiado grande');
  }
  // Registro inexistente (p. ej. borrado concurrente entre lectura y escritura).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
  }
  // Violación de unicidad (p. ej. dos registros simultáneos con el mismo número).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new HttpError(409, 'CONFLICT', 'El registro ya existe');
  }
  // Errores HTTP de Express/serve-static (archivo inexistente, ruta no permitida).
  const status = (err as { status?: number; statusCode?: number } | null)?.status;
  if (status === 404) return new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
  if (status === 403) return new HttpError(403, 'FORBIDDEN', 'No autorizado');
  return null;
}

/** Middleware de manejo centralizado de errores. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Si la petición falló después de subir una imagen, no dejar el archivo huérfano.
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});

  const httpErr = toHttpError(err);
  if (httpErr) return sendError(res, httpErr);
  // Al log va el error, nunca el cuerpo de la petición (podría contener contraseñas).
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'INTERNAL', message: 'Error interno del servidor' });
}
