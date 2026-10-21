import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { serializeFoundItem } from '../lib/serialize.js';
import { createFoundItemSchema, parseOrThrow } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { diskPathFor, publicUrlFor, removeUploadedImage, uploadImage } from '../middleware/upload.js';
import { computeSignature, serializeSignature } from '../lib/visual.js';
import { writeAudit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';
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

    // Igual que el trigger found_items_on_returned de Supabase: avisar al reclamante
    // aprobado y cerrar (con aviso) las reclamaciones pendientes, que ya no pueden prosperar.
    const actorId = req.auth!.sub;
    const [updated, approved, pending] = await prisma.$transaction(async (tx) => {
      const u = await tx.foundItem.update({
        where: { id: item.id },
        data: { status: 'RETURNED' },
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
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes editar este objeto');

    const body = parseOrThrow(createFoundItemSchema, req.body);
    const updated = await prisma.foundItem.update({
      where: { id: item.id },
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        foundAt: new Date(body.foundAt),
      },
      include: reporterSelect,
    });
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
    const updated = await prisma.foundItem.update({
      where: { id: item.id },
      data: { status: 'ARCHIVED' },
      include: reporterSelect,
    });
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_ARCHIVED', 'FoundItem', item.id, item.title);
    res.json(serializeFoundItem(updated));
  }),
);

// DELETE /api/found-items/:id â€” eliminar (solo admin). ModeraciÃ³n destructiva.
foundItemsRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    // Borra primero las reclamaciones asociadas para respetar la relaciÃ³n.
    await prisma.$transaction([
      prisma.claim.deleteMany({ where: { foundItemId: item.id } }),
      prisma.foundItem.delete({ where: { id: item.id } }),
    ]);
    await removeUploadedImage(item.imageUrl);
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_DELETED', 'FoundItem', item.id, item.title);
    res.json({ ok: true });
  }),
);

// GET /api/found-items/mine/list â€” mis publicaciones.
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
