import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { leaderboard, LEADERBOARD_MAX, playerSummary } from '../lib/game.js';
import { badRequest, notFound } from '../lib/http.js';
import { queryInt } from '../lib/query.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';
import { serializeUser } from '../lib/serialize.js';
import { parseOrThrow } from '../lib/validation.js';
import { authenticate } from '../middleware/authenticate.js';
import { diskPathFor, publicUrlFor, removeUploadedImage, uploadImage } from '../middleware/upload.js';

// Juego: ranking, perfil público y foto de perfil (como las RPC de la migración 016
// de Supabase: leaderboard, player_profile y set_my_avatar).
export const gameRouter = Router();

const AVATAR_SIDE = 512;

// GET /api/game/leaderboard?offset=0&limit=30 — top 100 por puntos.
gameRouter.get(
  '/leaderboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const offset = queryInt(req.query.offset, 0, 0, LEADERBOARD_MAX);
    const limit = queryInt(req.query.limit, 30, 1, LEADERBOARD_MAX);
    res.json(await leaderboard(offset, limit));
  }),
);

// GET /api/game/players/:id — perfil público (nombre, foto, puntos, puesto, estadísticas).
// `me` = el usuario autenticado.
gameRouter.get(
  '/players/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const id = req.params.id === 'me' ? req.auth!.sub : req.params.id;
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true, createdAt: true } });
    const summary = user ? await playerSummary(id) : null;
    if (!user || !summary) throw notFound('Colaborador no encontrado');
    res.json({ ...summary, role: user.role, createdAt: user.createdAt.toISOString() });
  }),
);

// GET /api/game/admins — ids de los administradores (emblema junto al nombre). En
// Supabase se lee profiles.role directamente (columna legible por todos).
gameRouter.get(
  '/admins',
  authenticate,
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    res.json(admins.map((a) => a.id));
  }),
);

// PUT /api/game/cosmetics — { frame, title }: marco y título que lleva el usuario
// (como set_my_cosmetics en Supabase). Solo se valida el formato: si están
// desbloqueados lo decide la app al mostrarlos (displayedCosmetics de @laf/shared).
const cosmeticsSchema = z.object({
  frame: z.enum(['none', 'bronze', 'silver', 'gold', 'emerald', 'ruby', 'diamond']).nullable(),
  title: z.string().regex(/^(none|legend|(rank|badge):[a-z_]{1,40})$/).nullable(),
});
gameRouter.put(
  '/cosmetics',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(cosmeticsSchema, req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: { equippedFrame: body.frame, equippedTitle: body.title },
    });
    res.json({ frame: user.equippedFrame, title: user.equippedTitle });
  }),
);

// PUT /api/game/avatar — multipart `image`: recorta a cuadrado, guarda JPEG y
// sustituye la foto anterior. Devuelve el User actualizado.
gameRouter.put(
  '/avatar',
  authenticate,
  rateLimit({ name: 'avatar', max: 20, windowMs: 10 * 60_000, key: byUser }),
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Falta la imagen');
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.jpg`;
    const square = await sharp(await fs.promises.readFile(req.file.path))
      .resize(AVATAR_SIDE, AVATAR_SIDE, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    await fs.promises.writeFile(diskPathFor(filename), square);
    await fs.promises.unlink(req.file.path).catch(() => {});

    const before = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { avatarUrl: true } });
    const user = await prisma.user.update({ where: { id: req.auth!.sub }, data: { avatarUrl: publicUrlFor(filename) } });
    await removeUploadedImage(before?.avatarUrl);
    res.json(serializeUser(user));
  }),
);

// DELETE /api/game/avatar — quita la foto de perfil.
gameRouter.delete(
  '/avatar',
  authenticate,
  asyncHandler(async (req, res) => {
    const before = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { avatarUrl: true } });
    const user = await prisma.user.update({ where: { id: req.auth!.sub }, data: { avatarUrl: null } });
    await removeUploadedImage(before?.avatarUrl);
    res.json(serializeUser(user));
  }),
);
