import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/http.js';
import { serializeNotification } from '../lib/serialize.js';
import { authenticate } from '../middleware/authenticate.js';

export const notificationsRouter = Router();

// GET /api/notifications — notificaciones del usuario autenticado.
notificationsRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await prisma.notification.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(items.map(serializeNotification));
  }),
);

// PATCH /api/notifications/:id/read — marcar una como leída.
notificationsRouter.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.auth!.sub) throw notFound('Notificación no encontrada');
    const updated = await prisma.notification.update({
      where: { id: n.id },
      data: { read: true },
    });
    res.json(serializeNotification(updated));
  }),
);

// PATCH /api/notifications/read-all — marcar todas como leídas.
notificationsRouter.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.auth!.sub, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);
