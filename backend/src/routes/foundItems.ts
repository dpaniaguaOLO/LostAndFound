import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { serializeFoundItem } from '../lib/serialize.js';
import { createFoundItemSchema, parseOrThrow, updateFoundItemSchema } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { diskPathFor, publicUrlFor, removeUploadedImage, uploadImage } from '../middleware/upload.js';
import { computeSignature, serializeSignature } from '../lib/visual.js';
import { writeAudit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

/** Aviso a un reclamante cuyo objeto se retira (archivado o eliminado). */
function removedNotice(userId: string, title: string, reason: string) {
  return {
    userId,
    type: 'SYSTEM',
    title: 'Objeto retirado',
    body: `"${title}" ${reason}, así que tu reclamación ya no sigue en curso.`,
    relatedItemId: null,
  };
}
import { likeSafe, pagination, queryString } from '../lib/query.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';

export const foundItemsRouter = Router();

const reporterSelect = { reporter: { select: { id: true, name: true } } };
const FOUND_STATUSES = new Set(['PUBLISHED', 'CLAIMED', 'RETURNED', 'ARCHIVED']);

// GET /api/found-items â€” muro con bÃºsqueda, filtros y paginaciÃ³n.
foundItemsRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const search = queryString(req.query.search);
    const category = queryString(req.query.category);
    const status = queryString(req.query.status);
    const location = queryString(req.query.location);
    const { page, pageSize, skip } = pagination(req.query);

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    // ARCHIVED (moderado) solo lo lista un admin, como la RLS de Supabase.
    if (status && FOUND_STATUSES.has(status) && (status !== 'ARCHIVED' || req.auth!.role === 'ADMIN')) {
      where.status = status;
    } else {
      where.status = { in: ['PUBLISHED', 'CLAIMED'] }; // por defecto, ocultar archivados/devueltos
    }
    if (location) {
      const term = likeSafe(location);
      where.location = term ? { contains: term } : { in: [] };
    }
    if (search) {
      const term = likeSafe(search);
      where.OR = term
        ? [{ title: { contains: term } }, { description: { contains: term } }]
        : [{ id: { in: [] } }];
    }

    const [total, items] = await Promise.all([
      prisma.foundItem.count({ where }),
      prisma.foundItem.findMany({
        where,
        include: reporterSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      data: items.map(serializeFoundItem),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

// GET /api/found-items/:id â€” detalle.
foundItemsRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({
      where: { id: req.params.id },
      include: reporterSelect,
    });
    if (!item) throw notFound('Objeto no encontrado');
    // Archivado (moderado): solo lo ven su autor y los admins (como la RLS de Supabase).
    if (item.status === 'ARCHIVED' && item.reporterId !== req.auth!.sub && req.auth!.role !== 'ADMIN') {
      throw notFound('Objeto no encontrado');
    }
    res.json(serializeFoundItem(item));
  }),
);

// POST /api/found-items â€” publicar objeto encontrado (con imagen opcional).
foundItemsRouter.post(
  '/',
  authenticate,
  rateLimit({ name: 'create-found', max: 30, windowMs: 10 * 60_000, key: byUser }),
  uploadImage,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createFoundItemSchema, req.body);
    const imageUrl = req.file ? publicUrlFor(req.file.filename) : null;

    // Firma visual para la bÃºsqueda por imagen (no bloquea si falla el cÃ³mputo).
    let imageSignature: string | null = null;
    if (req.file) {
      try {
        imageSignature = serializeSignature(await computeSignature(diskPathFor(req.file.filename)));
      } catch (e) {
        console.error('[visual-signature]', e);
      }
    }

    const item = await prisma.foundItem.create({
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        foundAt: new Date(body.foundAt),
        imageUrl,
        imageSignature,
        reporterId: req.auth!.sub,
      },
      include: reporterSelect,
    });
    res.status(201).json(serializeFoundItem(item));
  }),
);

// PATCH /api/found-items/:id/return â€” marcar como devuelto.
// Permitido al autor del hallazgo o a un administrador.
foundItemsRouter.patch(
  '/:id/return',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('Solo el autor o un administrador puede marcar la devoluciÃ³n');
    if (item.status === 'RETURNED') throw badRequest('El objeto ya fue marcado como devuelto');
    // Lo archivado por moderación no lo reabre su autor (como el trigger de Supabase).
    if (item.status === 'ARCHIVED' && !isAdmin) throw forbidden('El objeto está archivado');

    // Igual que el trigger found_items_on_returned de Supabase: avisar al reclamante
    // aprobado y cerrar (con aviso) las reclamaciones pendientes, que ya no pueden prosperar.
    const actorId = req.auth!.sub;
    const [updated, approved, pending] = await prisma.$transaction(async (tx) => {
      const u = await tx.foundItem.update({
        where: { id: item.id },
        data: { status: 'RETURNED', returnedAt: new Date() },
        include: reporterSelect,
      });
      const a = await tx.claim.findFirst({
        where: { foundItemId: item.id, status: 'APPROVED' },
        orderBy: { updatedAt: 'desc' },
      });
      const p = await tx.claim.findMany({ where: { foundItemId: item.id, status: 'PENDING' } });
      for (const c of p) {
        await tx.claim.update({
          where: { id: c.id },
          data: {
            status: 'REJECTED',
            reviewerId: c.claimantId === actorId ? null : actorId,
            reviewNote: 'El objeto ya fue entregado a su dueño',
          },
        });
      }
      return [u, a, p] as const;
    });
    if (approved) {
      await notify({
        userId: approved.claimantId,
        type: 'ITEM_RETURNED',
        title: 'Entrega registrada',
        body: `Se registró la entrega de "${item.title}". ¡Qué bueno que lo recuperaste!`,
        relatedItemId: item.id,
      });
    }
    for (const c of pending) {
      await notify({
        userId: c.claimantId,
        type: 'CLAIM_REJECTED',
        title: 'Reclamación cerrada',
        body: `Tu reclamación de "${item.title}" se cerró: el objeto ya fue entregado a su dueño.`,
        relatedItemId: item.id,
      });
    }
    await writeAudit(actorId, 'FOUND_ITEM_RETURNED', 'FoundItem', item.id, item.title);
    res.json(serializeFoundItem(updated));
  }),
);

// PATCH /api/found-items/:id â€” editar (autor o admin). ModeraciÃ³n de contenido.
foundItemsRouter.patch(
  '/:id',
  authenticate,
  // multipart: el frontend envía el mismo FormData que al publicar (antes sin este
  // middleware req.body llegaba vacío y la edición fallaba SIEMPRE con 400, FUN-01).
  uploadImage,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes editar este objeto');
    // Lo moderado (archivado) solo lo edita un admin, como la RLS de Supabase.
    if (item.status === 'ARCHIVED' && !isAdmin) throw forbidden('No puedes editar un objeto archivado');

    const body = parseOrThrow(updateFoundItemSchema, req.body);
    let imageUrl = item.imageUrl;
    let imageSignature = item.imageSignature;
    if (req.file) {
      imageUrl = publicUrlFor(req.file.filename);
      try {
        imageSignature = serializeSignature(await computeSignature(diskPathFor(req.file.filename)));
      } catch (e) {
        console.error('[visual-signature]', e);
        imageSignature = null;
      }
    } else if (body.removeImage) {
      imageUrl = null;
      imageSignature = null;
    }
    const updated = await prisma.foundItem.update({
      where: { id: item.id },
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        ...(body.foundAt ? { foundAt: new Date(body.foundAt) } : {}),
        imageUrl,
        imageSignature,
      },
      include: reporterSelect,
    });
    if (imageUrl !== item.imageUrl) await removeUploadedImage(item.imageUrl);
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_EDITED', 'FoundItem', item.id, item.title);
    res.json(serializeFoundItem(updated));
  }),
);

// PATCH /api/found-items/:id/archive â€” archivar (solo admin).
foundItemsRouter.patch(
  '/:id/archive',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    // Igual que el trigger found_items_on_archived de Supabase (INT-04): las
    // pendientes se cierran y se avisa a los reclamantes en curso.
    const actorId = req.auth!.sub;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.foundItem.update({ where: { id: item.id }, data: { status: 'ARCHIVED', returnedAt: null }, include: reporterSelect });
      const active = await tx.claim.findMany({ where: { foundItemId: item.id, status: { in: ['PENDING', 'APPROVED'] } } });
      await tx.claim.updateMany({
        where: { foundItemId: item.id, status: 'PENDING' },
        data: { status: 'REJECTED', reviewNote: 'El objeto fue retirado por un administrador' },
      });
      for (const c of active) {
        await tx.notification.create({ data: removedNotice(c.claimantId, item.title, 'fue retirado del muro por un administrador') });
      }
      return u;
    });
    await writeAudit(actorId, 'FOUND_ITEM_ARCHIVED', 'FoundItem', item.id, item.title);
    res.json(serializeFoundItem(updated));
  }),
);

// DELETE /api/found-items/:id â€” eliminar (admin, o el autor si estÃ¡ PUBLISHED/RETURNED).
foundItemsRouter.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes eliminar este objeto');
    // Como la RLS de Supabase (migración 014): con una entrega en curso (CLAIMED) o
    // moderado (ARCHIVED), solo un admin.
    if (!isAdmin && item.status !== 'PUBLISHED' && item.status !== 'RETURNED') {
      throw forbidden(
        item.status === 'CLAIMED'
          ? 'Tiene una reclamación aprobada: márcalo como devuelto antes de eliminarlo'
          : 'No puedes eliminar un objeto archivado',
      );
    }
    const reason = isOwner ? 'fue eliminado por quien lo publicó' : 'fue eliminado por un administrador';
    // Avisa a los reclamantes en curso y borra las reclamaciones asociadas
    // (como el trigger found_items_on_delete de Supabase, INT-04).
    await prisma.$transaction(async (tx) => {
      const active = await tx.claim.findMany({ where: { foundItemId: item.id, status: { in: ['PENDING', 'APPROVED'] } } });
      for (const c of active) {
        await tx.notification.create({ data: removedNotice(c.claimantId, item.title, reason) });
      }
      await tx.claim.deleteMany({ where: { foundItemId: item.id } });
      await tx.foundItem.delete({ where: { id: item.id } });
    });
    await removeUploadedImage(item.imageUrl);
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_DELETED', 'FoundItem', item.id, item.title);
    res.json({ ok: true });
  }),
);

// GET /api/found-items/mine/list â€” mis publicaciones.
// GET /api/found-items/returned/recent — devueltos en los últimos 7 días (sección
// "Devueltos recientemente" del muro), los más recientes primero.
const RECENT_RETURNED_DAYS = 7;
const RECENT_RETURNED_MAX = 12;
foundItemsRouter.get(
  '/returned/recent',
  authenticate,
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - RECENT_RETURNED_DAYS * 86_400_000);
    const items = await prisma.foundItem.findMany({
      where: { status: 'RETURNED', returnedAt: { gte: since } },
      include: reporterSelect,
      orderBy: { returnedAt: 'desc' },
      take: RECENT_RETURNED_MAX,
    });
    res.json(items.map(serializeFoundItem));
  }),
);

foundItemsRouter.get(
  '/mine/list',
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await prisma.foundItem.findMany({
      where: { reporterId: req.auth!.sub },
      include: reporterSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items.map(serializeFoundItem));
  }),
);
