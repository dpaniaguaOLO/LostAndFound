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
 * El rol se relee de la base de datos en cada petición: así un cambio de rol
 * (o un usuario eliminado) surte efecto de inmediato y no al expirar el token.
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
  prisma.user
    .findUnique({ where: { id: payload.sub }, select: { id: true, role: true } })
    .then((user) => {
      if (!user) return sendError(res, unauthorized('Usuario no encontrado'));
      req.auth = { sub: user.id, role: user.role as JwtPayload['role'] };
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
  return null;
}

/** Middleware de manejo centralizado de errores. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Si la petición falló después de subir una imagen, no dejar el archivo huérfano.
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});

  const httpErr = toHttpError(err);
  if (httpErr) return sendError(res, httpErr);
  console.error('[error]', err);
  res.status(500).json({ error: 'INTERNAL', message: 'Error interno del servidor' });
}
