import type { NextFunction, Request, Response } from 'express';
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

/** Exige un token JWT válido en el header Authorization: Bearer <token>. */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return sendError(res, unauthorized('Falta el token de autenticación'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    sendError(res, unauthorized('Token inválido o expirado'));
  }
}

/** Exige que el usuario autenticado tenga rol ADMIN. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return sendError(res, unauthorized());
  if (req.auth.role !== 'ADMIN') {
    return sendError(res, forbidden('Se requiere rol de administrador'));
  }
  next();
}

/** Middleware de manejo centralizado de errores. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return sendError(res, err);
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'INTERNAL', message: 'Error interno del servidor' });
}
