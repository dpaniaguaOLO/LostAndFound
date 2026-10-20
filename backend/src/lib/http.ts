import type { Response } from 'express';

/** Error de aplicación con código HTTP asociado. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'No autenticado') =>
  new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'No autorizado') =>
  new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Recurso no encontrado') =>
  new HttpError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new HttpError(409, 'CONFLICT', msg);
export const tooManyRequests = (msg: string) => new HttpError(429, 'TOO_MANY_REQUESTS', msg);

export function sendError(res: Response, err: HttpError) {
  res.status(err.status).json({
    error: err.code,
    message: err.message,
    details: err.details,
  });
}
