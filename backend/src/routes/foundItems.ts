import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { serializeFoundItem } from '../lib/serialize.js';
import { createFoundItemSchema, parseOrThrow } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { diskPathFor, publicUrlFor, uploadImage } from '../middleware/upload.js';
import { computeSignature, serializeSignature } from '../lib/visual.js';
import { writeAudit } from '../lib/audit.js';

export const foundItemsRouter = Router();

const reporterSelect = { reporter: { select: { id: true, name: true } } };

// GET /api/found-items — muro con búsqueda, filtros y paginación.
foundItemsRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { search, category, status, location } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 12)));

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;
    else where.status = { in: ['PUBLISHED', 'CLAIMED'] }; // por defecto, ocultar archivados/devueltos
    if (location) where.location = { contains: location };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.foundItem.count({ where }),
      prisma.foundItem.findMany({
        where,
        include: reporterSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
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

// GET /api/found-items/:id — detalle.
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

// POST /api/found-items — publicar objeto encontrado (con imagen opcional).
foundItemsRouter.post(
  '/',
  authenticate,
  uploadImage,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createFoundItemSchema, req.body);
    const imageUrl = req.file ? publicUrlFor(req.file.filename) : null;

    // Firma visual para la búsqueda por imagen (no bloquea si falla el cómputo).
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

// PATCH /api/found-items/:id/return — marcar como devuelto.
// Permitido al autor del hallazgo o a un administrador.
foundItemsRouter.patch(
  '/:id/return',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Objeto no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('Solo el autor o un administrador puede marcar la devolución');
    if (item.status === 'RETURNED') throw badRequest('El objeto ya fue marcado como devuelto');

    const updated = await prisma.foundItem.update({
      where: { id: item.id },
      data: { status: 'RETURNED' },
      include: reporterSelect,
    });
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_RETURNED', 'FoundItem', item.id, item.title);
    res.json(serializeFoundItem(updated));
  }),
);

// PATCH /api/found-items/:id — editar (autor o admin). Moderación de contenido.
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

// PATCH /api/found-items/:id/archive — archivar (solo admin).
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

// DELETE /api/found-items/:id — eliminar (solo admin). Moderación destructiva.
foundItemsRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await prisma.foundItem.findUnique({
      where: { id: req.params.id },
      include: { claims: true },
    });
    if (!item) throw notFound('Objeto no encontrado');
    // Borra primero las reclamaciones asociadas para respetar la relación.
    await prisma.$transaction([
      prisma.claim.deleteMany({ where: { foundItemId: item.id } }),
      prisma.foundItem.delete({ where: { id: item.id } }),
    ]);
    await writeAudit(req.auth!.sub, 'FOUND_ITEM_DELETED', 'FoundItem', item.id, item.title);
    res.json({ ok: true });
  }),
);

// GET /api/found-items/mine/list — mis publicaciones.
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
