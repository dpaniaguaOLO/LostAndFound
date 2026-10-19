import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { forbidden, notFound } from '../lib/http.js';
import { serializeLostReport } from '../lib/serialize.js';
import { createLostReportSchema, parseOrThrow } from '../lib/validation.js';
import { notifyBestMatchForLost } from '../lib/matchNotify.js';
import { authenticate } from '../middleware/authenticate.js';
import { publicUrlFor, uploadImage } from '../middleware/upload.js';

export const lostReportsRouter = Router();

const reporterSelect = { reporter: { select: { id: true, name: true } } };

// GET /api/lost-reports — listado con búsqueda y filtros.
lostReportsRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { search, category, status, location } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 12)));

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;
    if (location) where.location = { contains: location };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.lostReport.count({ where }),
      prisma.lostReport.findMany({
        where,
        include: reporterSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      data: items.map(serializeLostReport),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

// GET /api/lost-reports/:id — detalle.
lostReportsRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({
      where: { id: req.params.id },
      include: reporterSelect,
    });
    if (!item) throw notFound('Reporte no encontrado');
    res.json(serializeLostReport(item));
  }),
);

// POST /api/lost-reports — reportar objeto perdido (imagen opcional).
lostReportsRouter.post(
  '/',
  authenticate,
  uploadImage,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createLostReportSchema, req.body);
    const imageUrl = req.file ? publicUrlFor(req.file.filename) : null;
    const item = await prisma.lostReport.create({
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        lostAt: new Date(body.lostAt),
        imageUrl,
        reporterId: req.auth!.sub,
      },
      include: reporterSelect,
    });

    // IA: busca una coincidencia entre los encontrados y avisa al dueño si la hay.
    // No bloquea la respuesta si algo falla en el emparejado.
    notifyBestMatchForLost({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      location: item.location,
      lostAt: item.lostAt,
      reporterId: item.reporterId,
    }).catch((e) => console.error('[match-notify]', e));

    res.status(201).json(serializeLostReport(item));
  }),
);

// PATCH /api/lost-reports/:id/resolve — marcar como resuelto (autor o admin).
lostReportsRouter.patch(
  '/:id/resolve',
  authenticate,
  asyncHandler(async (req, res) => {
    const item = await prisma.lostReport.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound('Reporte no encontrado');
    const isOwner = item.reporterId === req.auth!.sub;
    if (!isOwner && req.auth!.role !== 'ADMIN') {
      throw forbidden('Solo el autor o un administrador puede resolver el reporte');
    }
    const updated = await prisma.lostReport.update({
      where: { id: item.id },
      data: { status: 'RESOLVED' },
      include: reporterSelect,
    });
    res.json(serializeLostReport(updated));
  }),
);

// GET /api/lost-reports/mine/list — mis reportes.
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
