import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';

// Asegura que la carpeta de subidas exista.
fs.mkdirSync(config.uploadDir, { recursive: true });

// MIME permitido -> extensión con la que se guarda. La extensión NUNCA se toma del
// nombre original: /uploads se sirve como estático y el Content-Type sale de ella
// (un "foto.html" declarado como image/png se serviría como HTML).
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
// Formatos reales (según sharp) aceptados tras inspeccionar el contenido.
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED[file.mimetype]}`;
    cb(null, name);
  },
});

const multerSingle = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in ALLOWED)) {
      return cb(badRequest('Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
}).single('image');

/**
 * Recibe el campo `image` (opcional) y comprueba que el contenido sea realmente
 * una imagen de un formato permitido (el MIME lo declara el cliente).
 */
export function uploadImage(req: Request, res: Response, next: NextFunction) {
  multerSingle(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.file) return next();
    sharp(req.file.path)
      .metadata()
      .then((meta) => {
        if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error(meta.format);
        next();
      })
      .catch(() => next(badRequest('El archivo no es una imagen válida.')));
  });
}

/** Devuelve la URL pública relativa de un archivo subido. */
export const publicUrlFor = (filename: string) => `/uploads/${filename}`;

/** Ruta absoluta en disco de un archivo subido (para procesarlo, p. ej. firma visual). */
export const diskPathFor = (filename: string) => path.join(config.uploadDir, filename);

/** Borra del disco la imagen asociada a una URL pública (best-effort). */
export async function removeUploadedImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl?.startsWith('/uploads/')) return;
  const filename = path.basename(imageUrl);
  await fs.promises.unlink(diskPathFor(filename)).catch(() => {});
}
