import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { serializeClaim } from '../lib/serialize.js';
import { createClaimSchema, parseOrThrow, reviewClaimSchema } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { writeAudit } from '../lib/audit.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';

export const claimsRouter = Router();

const claimInclude = {
  claimant: { select: { id: true, name: true } },
  foundItem: {
    select: { id: true, title: true, imageUrl: true, status: true, reporterId: true, reporter: { select: { name: true } } },
  },
};

// POST /api/claims — solicitar reclamación de un objeto encontrado.
claimsRouter.post(
  '/',
  authenticate,
  rateLimit({ name: 'create-claim', max: 30, windowMs: 10 * 60_000, key: byUser }),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createClaimSchema, req.body);
    const item = await prisma.foundItem.findUnique({ where: { id: body.foundItemId } });
    if (!item) throw notFound('Objeto no encontrado');
    // Solo PUBLISHED: sobre un objeto CLAIMED la reclamación nunca podría aprobarse.
    if (item.status === 'CLAIMED') {
      throw badRequest('Este objeto ya tiene una reclamación aprobada y está pendiente de entrega');
    }
    if (item.status !== 'PUBLISHED') {
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

    // El índice único parcial Claim_unique_pending (migración 20261022120000) cierra
    // la carrera entre la comprobación anterior y este INSERT (INT-02).
    const claim = await prisma.claim
      .create({
        data: {
          foundItemId: item.id,
          claimantId: req.auth!.sub,
          message: body.message,
        },
        include: claimInclude,
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw badRequest('Ya tienes una reclamación pendiente para este objeto');
        }
        throw e;
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
    if (claim.claimantId === req.auth!.sub) throw forbidden('No puedes revisar tu propia reclamación');
    if (claim.status !== 'PENDING') throw badRequest('La reclamación ya fue procesada');
    if (body.status === 'APPROVED' && claim.foundItem.status !== 'PUBLISHED') {
      throw badRequest('El objeto ya no está disponible para aprobar reclamaciones');
    }

    const AUTO_REJECT_NOTE = 'Otra reclamación fue aprobada';
    const { updated, autoRejected } = await prisma.$transaction(async (tx) => {
      // Actualizaciones condicionadas al estado leído: si otra petición concurrente
      // ya procesó la reclamación o el objeto, count = 0 y se aborta la transacción.
      const claimed = await tx.claim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: {
          status: body.status,
          reviewerId: req.auth!.sub,
          reviewNote: body.reviewNote ?? null,
        },
      });
      if (claimed.count === 0) throw badRequest('La reclamación ya fue procesada');

      let rejected: { id: string; claimantId: string }[] = [];
      if (body.status === 'APPROVED') {
        const item = await tx.foundItem.updateMany({
          where: { id: claim.foundItemId, status: 'PUBLISHED' },
          data: { status: 'CLAIMED' },
        });
        if (item.count === 0) {
          throw badRequest('El objeto ya no está disponible para aprobar reclamaciones');
        }
        // Rechaza automáticamente otras reclamaciones pendientes del mismo objeto.
        const others = { foundItemId: claim.foundItemId, status: 'PENDING', id: { not: claim.id } };
        rejected = await tx.claim.findMany({ where: others, select: { id: true, claimantId: true } });
        await tx.claim.updateMany({
          where: others,
          data: { status: 'REJECTED', reviewerId: req.auth!.sub, reviewNote: AUTO_REJECT_NOTE },
        });
      }
      const c = await tx.claim.findUniqueOrThrow({ where: { id: claim.id }, include: claimInclude });
      return { updated: c, autoRejected: rejected };
    });

    // Avisa a quienes perdieron la reclamación por aprobarse otra.
    for (const r of autoRejected) {
      await notify({
        userId: r.claimantId,
        type: 'CLAIM_REJECTED',
        title: 'Reclamación rechazada',
        body: `Tu reclamación de "${claim.foundItem.title}" fue rechazada: ${AUTO_REJECT_NOTE.toLowerCase()}.`,
        relatedItemId: claim.foundItemId,
      });
    }

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
    // Condicionado a PENDING para no pisar una revisión concurrente.
    const { count } = await prisma.claim.updateMany({
      where: { id: claim.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) throw badRequest('Solo se pueden cancelar reclamaciones pendientes');
    const updated = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id }, include: claimInclude });
    res.json(serializeClaim(updated));
  }),
);
