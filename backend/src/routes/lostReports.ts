import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { serializeLostReport } from '../lib/serialize.js';
import { createLostReportSchema, parseOrThrow, updateLostReportSchema } from '../lib/validation.js';
import { notifyBestMatchForLost } from '../lib/matchNotify.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { diskPathFor, publicUrlFor, removeUploadedImage, uploadImage } from '../middleware/upload.js';
import { computeSignature, serializeSignature } from '../lib/visual.js';
import { writeAudit } from '../lib/audit.js';
import { topPlayerIds } from '../lib/game.js';
import { likeSafe, pagination, queryString } from '../lib/query.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';

export const lostReportsRouter = Router();

const reporterSelect = { reporter: { select: { id: true, name: true } } };
const LOST_STATUSES = new Set(['OPEN', 'MATCHED', 'RESOLVED', 'CLOSED']);

// GET /api/lost-reports â€” listado con bÃºsqueda y filtros.
lostReportsRouter.get(
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
    // CLOSED (moderado) solo lo lista un admin, como la RLS de Supabase.
    if (status && LOST_STATUSES.has(status) && (status !== 'CLOSED' || req.auth!.role === 'ADMIN')) {
      where.status = status;
    } else {
      where.status = { in: ['OPEN', 'MATCHED', 'RESOLVED'] }; // por defecto, ocultar cerrados
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

    // Ventaja del top 3 del ranking: sus perdidos aún en búsqueda van arriba del
    // muro (en el orden del ranking) y salen del listado normal.
    const top = status ? [] : await topPlayerIds();
    const pinned = top.length
      ? (
          await prisma.lostReport.findMany({
            where: { AND: [where, { reporterId: { in: top }, status: { in: ['OPEN', 'MATCHED'] } }] },
            include: reporterSelect,
            orderBy: { createdAt: 'desc' },
          })
        ).sort((a, b) => top.indexOf(a.reporterId) - top.indexOf(b.reporterId))
      : [];
    const rest = pinned.length ? { AND: [where, { id: { notIn: pinned.map((p) => p.id) } }] } : where;

    const [total, items] = await Promise.all([
      prisma.lostReport.count({ where: rest }),
      prisma.lostReport.findMany({
        where: rest,
        include: reporterSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      data: [
        ...(page === 1 ? pinned.map((p) => ({ ...serializeLostReport(p), pinned: true })) : []),
        ...items.map(serializeLostReport),
      ],
      page,
      pageSize,
      total: total + pinned.length,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

// GET /api/lost-reports/:id â€” detalle.
lostReportsRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({
      where: { id: req.params.id },
      include: reporterSelect,
    });
    if (!item) throw notFound('Reporte no encontrado');
    // Cerrado (moderado): solo lo ven su autor y los admins (como la RLS de Supabase).
    if (item.status === 'CLOSED' && item.reporterId !== req.auth!.sub && req.auth!.role !== 'ADMIN') {
      throw notFound('Reporte no encontrado');
    }
    res.json(serializeLostReport(item));
  }),
);

// POST /api/lost-reports â€” reportar objeto perdido (imagen opcional).
lostReportsRouter.post(
  '/',
  authenticate,
  rateLimit({ name: 'create-lost', max: 30, windowMs: 10 * 60_000, key: byUser }),
  uploadImage,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createLostReportSchema, req.body);
    const imageUrl = req.file ? publicUrlFor(req.file.filename) : null;

    let imageSignature: string | null = null;
    if (req.file) {
      try {
        imageSignature = serializeSignature(await computeSignature(diskPathFor(req.file.filename)));
      } catch (e) {
        console.error('[visual-signature]', e);
      }
    }

    const item = await prisma.lostReport.create({
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location ?? '',
        lostAt: new Date(body.lostAt),
        imageUrl,
        imageSignature,
        reporterId: req.auth!.sub,
      },
      include: reporterSelect,
    });

    // IA: busca una coincidencia entre los encontrados y avisa al dueÃ±o si la hay.
    // No bloquea la respuesta si algo falla en el emparejado.
    notifyBestMatchForLost({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      location: item.location,
      lostAt: item.lostAt,
      reporterId: item.reporterId,
      imageSignature: item.imageSignature,
    }).catch((e) => console.error('[match-notify]', e));

    res.status(201).json(serializeLostReport(item));
  }),
);

// PATCH /api/lost-reports/:id/resolve â€” marcar como resuelto (autor o admin).
lostReportsRouter.patch(
  '/:id/resolve',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Reporte no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw forbidden('Solo el autor o un administrador puede resolver el reporte');
    }
    // Como el trigger lost_reports_guard_status de Supabase: el autor solo resuelve
    // un reporte abierto (no reabre lo cerrado por moderación, INT-03).
    if (!isAdmin && item.status !== 'OPEN' && item.status !== 'MATCHED') {
      throw badRequest('Este reporte ya no está abierto');
    }
    const updated = await prisma.lostReport.update({
      where: { id: item.id },
      data: { status: 'RESOLVED' },
      include: reporterSelect,
    });
    await writeAudit(req.auth!.sub, 'LOST_REPORT_RESOLVED', 'LostReport', item.id, item.title);
    res.json(serializeLostReport(updated));
  }),
);

// PATCH /api/lost-reports/:id/close â€” cerrar/archivar (solo admin). Lo retira del
// listado pero lo conserva; se puede restaurar desde el panel (POST /admin/restore).
lostReportsRouter.patch(
  '/:id/close',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Reporte no encontrado');
    const updated = await prisma.lostReport.update({
      where: { id: item.id },
      data: { status: 'CLOSED' },
      include: reporterSelect,
    });
    await writeAudit(req.auth!.sub, 'LOST_REPORT_CLOSED', 'LostReport', item.id, item.title);
    res.json(serializeLostReport(updated));
  }),
);

// PATCH /api/lost-reports/:id â€” editar (autor o admin).
lostReportsRouter.patch(
  '/:id',
  authenticate,
  // multipart: sin este middleware req.body llegaba vacío y editar fallaba (FUN-01).
  uploadImage,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Reporte no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes editar este reporte');
    if (item.status === 'CLOSED' && !isAdmin) throw forbidden('No puedes editar un reporte cerrado');

    const body = parseOrThrow(updateLostReportSchema, req.body);
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
    const updated = await prisma.lostReport.update({
      where: { id: item.id },
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location ?? '',
        ...(body.lostAt ? { lostAt: new Date(body.lostAt) } : {}),
        imageUrl,
        imageSignature,
      },
      include: reporterSelect,
    });
    if (imageUrl !== item.imageUrl) await removeUploadedImage(item.imageUrl);
    await writeAudit(req.auth!.sub, 'LOST_REPORT_EDITED', 'LostReport', item.id, item.title);
    res.json(serializeLostReport(updated));
  }),
);

// DELETE /api/lost-reports/:id â€” eliminar (admin, o el autor salvo si estÃ¡ CLOSED).
lostReportsRouter.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Reporte no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes eliminar este reporte');
    if (item.status === 'CLOSED' && !isAdmin) throw forbidden('No puedes eliminar un reporte cerrado');
    await prisma.lostReport.delete({ where: { id: item.id } });
    await removeUploadedImage(item.imageUrl);
    await writeAudit(req.auth!.sub, 'LOST_REPORT_DELETED', 'LostReport', item.id, item.title);
    res.json({ ok: true });
  }),
);

// GET /api/lost-reports/mine/list â€” mis reportes.
lostReportsRouter.get(
  '/mine/list',
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await prisma.lostReport.findMany({
      where: { reporterId: req.auth!.sub },
      include: reporterSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items.map(serializeLostReport));
  }),
);
