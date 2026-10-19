import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { serializeClaim } from '../lib/serialize.js';
import { createClaimSchema, parseOrThrow, reviewClaimSchema } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { writeAudit } from '../lib/audit.js';

export const claimsRouter = Router();

const claimInclude = {
  claimant: { select: { id: true, name: true } },
  foundItem: { select: { id: true, title: true, imageUrl: true, status: true } },
};

// POST /api/claims — solicitar reclamación de un objeto encontrado.
claimsRouter.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createClaimSchema, req.body);
    const item = await prisma.foundItem.findUnique({ where: { id: body.foundItemId } });
    if (!item) throw notFound('Objeto no encontrado');
    if (item.status === 'RETURNED' || item.status === 'ARCHIVED') {
      throw badRequest('Este objeto ya no está disponible para reclamar');
    }
    if (item.reporterId === req.auth!.sub) {
      throw badRequest('No puedes reclamar un objeto que tú publicaste');
    }
    // Evitar reclamaciones duplicadas pendientes del mismo usuario.
    const existing = await prisma.claim.findFirst({
      where: { foundItemId: item.id, claimantId: req.auth!.sub, status: 'PENDING' },
    });
    if (existing) throw badRequest('Ya tienes una reclamación pendiente para este objeto');

    const claim = await prisma.claim.create({
      data: {
        foundItemId: item.id,
        claimantId: req.auth!.sub,
        message: body.message,
      },
      include: claimInclude,
    });

    // Notifica a quien publicó el objeto.
    await notify({
      userId: item.reporterId,
      type: 'CLAIM_REQUESTED',
      title: 'Nueva solicitud de reclamación',
      body: `Alguien solicitó reclamar "${item.title}".`,
      relatedItemId: item.id,
    });

    res.status(201).json(serializeClaim(claim));
  }),
);

// GET /api/claims/mine — reclamaciones hechas por el usuario.
claimsRouter.get(
  '/mine',
  authenticate,
  asyncHandler(async (req, res) => {
    const claims = await prisma.claim.findMany({
      where: { claimantId: req.auth!.sub },
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(claims.map(serializeClaim));
  }),
);

// GET /api/claims/incoming — reclamaciones sobre objetos que yo publiqué.
claimsRouter.get(
  '/incoming',
  authenticate,
  asyncHandler(async (req, res) => {
    const claims = await prisma.claim.findMany({
      where: { foundItem: { reporterId: req.auth!.sub } },
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(claims.map(serializeClaim));
  }),
);

// PATCH /api/claims/:id/review — aprobar o rechazar (autor del hallazgo o admin).
claimsRouter.patch(
  '/:id/review',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(reviewClaimSchema, req.body);
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: { foundItem: true },
    });
    if (!claim) throw notFound('Reclamación no encontrada');

    const isOwner = claim.foundItem.reporterId === req.auth!.sub;
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw forbidden('No puedes revisar esta reclamación');
    if (claim.status !== 'PENDING') throw badRequest('La reclamación ya fue procesada');

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: body.status,
          reviewerId: req.auth!.sub,
          reviewNote: body.reviewNote ?? null,
        },
        include: claimInclude,
      });

      if (body.status === 'APPROVED') {
        await tx.foundItem.update({
          where: { id: claim.foundItemId },
          data: { status: 'CLAIMED' },
        });
        // Rechaza automáticamente otras reclamaciones pendientes del mismo objeto.
        await tx.claim.updateMany({
          where: { foundItemId: claim.foundItemId, status: 'PENDING', id: { not: claim.id } },
          data: { status: 'REJECTED', reviewNote: 'Otra reclamación fue aprobada' },
        });
      }
      return c;
    });

    await notify({
      userId: claim.claimantId,
      type: body.status === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED',
      title: body.status === 'APPROVED' ? 'Reclamación aprobada' : 'Reclamación rechazada',
      body:
        body.status === 'APPROVED'
          ? `Tu reclamación de "${claim.foundItem.title}" fue aprobada. Coordina la entrega.`
          : `Tu reclamación de "${claim.foundItem.title}" fue rechazada.`,
      relatedItemId: claim.foundItemId,
    });

    await writeAudit(
      req.auth!.sub,
      'CLAIM_REVIEWED',
      'Claim',
      claim.id,
      `Reclamación ${body.status === 'APPROVED' ? 'aprobada' : 'rechazada'} de "${claim.foundItem.title}"`,
    );

    res.json(serializeClaim(updated));
  }),
);

// GET /api/claims/all — todas las reclamaciones (solo admin). Bandeja global.
claimsRouter.get(
  '/all',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const claims = await prisma.claim.findMany({
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(claims.map(serializeClaim));
  }),
);

// PATCH /api/claims/:id/cancel — cancelar una reclamación propia pendiente.
claimsRouter.patch(
  '/:id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim || claim.claimantId !== req.auth!.sub) throw notFound('Reclamación no encontrada');
    if (claim.status !== 'PENDING') throw badRequest('Solo se pueden cancelar reclamaciones pendientes');
    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: { status: 'CANCELLED' },
      include: claimInclude,
    });
    res.json(serializeClaim(updated));
  }),
);
