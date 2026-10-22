import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashPassword } from '../lib/auth.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { queryInt } from '../lib/query.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';
import { serializeFoundItem, serializeLostReport, serializeUser } from '../lib/serialize.js';
import { parseOrThrow, resetPasswordSchema, restoreSchema, setRoleSchema } from '../lib/validation.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { writeAudit } from '../lib/audit.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);
// Límite holgado para el panel, y uno estricto para restablecer contraseñas.
adminRouter.use(rateLimit({ name: 'admin', max: 120, windowMs: 60_000, key: byUser }));
adminRouter.use(
  '/users/reset-password',
  rateLimit({ name: 'reset-password', max: 10, windowMs: 10 * 60_000, key: byUser }),
);

// GET /api/admin/stats — métricas para el panel administrativo.
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, found, lost, claimsPending, returned] = await Promise.all([
      prisma.user.count(),
      prisma.foundItem.count(),
      prisma.lostReport.count(),
      prisma.claim.count({ where: { status: 'PENDING' } }),
      prisma.foundItem.count({ where: { status: 'RETURNED' } }),
    ]);
    res.json({ users, foundItems: found, lostReports: lost, claimsPending, returned });
  }),
);

// GET /api/admin/users — lista de usuarios.
adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(users.map(serializeUser));
  }),
);

// PATCH /api/admin/users/:id/role — cambiar rol de un usuario.
adminRouter.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = parseOrThrow(setRoleSchema, req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound('Usuario no encontrado');
    // Nunca dejar el sistema sin administradores. Se comprueba DESPUÉS de escribir y
    // dentro de la transacción: SQLite serializa las escrituras, así que dos
    // degradaciones simultáneas no pueden ver ambas "otro admin" y dejar cero.
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { role } });
      if (user.role === 'ADMIN' && role !== 'ADMIN' && (await tx.user.count({ where: { role: 'ADMIN' } })) === 0) {
        throw badRequest('No se puede quitar el rol al último administrador');
      }
      return u;
    });
    await writeAudit(
      req.auth!.sub,
      'USER_ROLE_CHANGED',
      'User',
      user.id,
      `${user.name} ahora es ${role === 'ADMIN' ? 'administrador' : 'empleado'}`,
    );
    res.json(serializeUser(updated));
  }),
);

// POST /api/admin/users/reset-password — un admin fija una nueva contraseña a un
// colaborador (no hay recuperación por email). Equivale a la Edge Function
// admin-reset-password del modo Supabase.
adminRouter.post(
  '/users/reset-password',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(resetPasswordSchema, req.body);
    const user = await prisma.user.findUnique({ where: { employeeId: body.employeeId } });
    if (!user) throw notFound('Colaborador no encontrado');
    // Nueva contraseña + nueva versión de sesión: cualquier token emitido con la
    // contraseña anterior deja de ser válido de inmediato.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        sessionVersion: { increment: 1 },
      },
    });
    await writeAudit(
      req.auth!.sub,
      'USER_PASSWORD_RESET',
      'User',
      user.id,
      `Restableció la contraseña de ${user.name} (N° ${user.employeeId})`,
    );
    res.json({ ok: true });
  }),
);

// GET /api/admin/audit — historial de eventos (trazabilidad). Solo admin.
adminRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const limit = queryInt(req.query.limit, 100, 1, 200);
    const logs = await prisma.auditLog.findMany({
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(
      logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        summary: l.summary,
        actor: l.actor,
        createdAt: l.createdAt.toISOString(),
      })),
    );
  }),
);

// GET /api/admin/archived — objetos retirados de circulación (moderación).
// Encontrados en estado ARCHIVED + perdidos en estado CLOSED.
adminRouter.get(
  '/archived',
  asyncHandler(async (_req, res) => {
    const [found, lost] = await Promise.all([
      prisma.foundItem.findMany({
        where: { status: 'ARCHIVED' },
        include: { reporter: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.lostReport.findMany({
        where: { status: 'CLOSED' },
        include: { reporter: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    res.json({ found: found.map(serializeFoundItem), lost: lost.map(serializeLostReport) });
  }),
);

// POST /api/admin/restore — devuelve un objeto archivado a circulación.
// body: { kind: 'found'|'lost', id }. Solo desde ARCHIVED/CLOSED (antes reabría
// también objetos CLAIMED/RETURNED y permitía una segunda reclamación aprobada).
// Un encontrado con reclamación APPROVED vuelve a CLAIMED; si no, a PUBLISHED.
adminRouter.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const { kind, id } = parseOrThrow(restoreSchema, req.body);
    if (kind === 'found') {
      const item = await prisma.foundItem.findUnique({ where: { id } });
      if (!item) throw notFound('Objeto no encontrado');
      if (item.status !== 'ARCHIVED') throw conflict('Solo se pueden restaurar elementos archivados');
      const approved = await prisma.claim.count({ where: { foundItemId: id, status: 'APPROVED' } });
      // Condicionado al estado: si otro admin lo cambió entretanto, no se pisa.
      const { count } = await prisma.foundItem.updateMany({
        where: { id, status: 'ARCHIVED' },
        data: { status: approved ? 'CLAIMED' : 'PUBLISHED' },
      });
      if (count === 0) throw conflict('El elemento cambió mientras se restauraba');
      await writeAudit(req.auth!.sub, 'FOUND_ITEM_RESTORED', 'FoundItem', id, `Restauró "${item.title}"`);
    } else {
      const item = await prisma.lostReport.findUnique({ where: { id } });
      if (!item) throw notFound('Reporte no encontrado');
      if (item.status !== 'CLOSED') throw conflict('Solo se pueden restaurar elementos archivados');
      const { count } = await prisma.lostReport.updateMany({ where: { id, status: 'CLOSED' }, data: { status: 'OPEN' } });
      if (count === 0) throw conflict('El elemento cambió mientras se restauraba');
      await writeAudit(req.auth!.sub, 'LOST_REPORT_RESTORED', 'LostReport', id, `Restauró "${item.title}"`);
    }
    res.json({ ok: true });
  }),
);

// POST /api/admin/users — alta de colaborador por un admin (modo REST).
adminRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const employeeId = String(req.body?.employeeId ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(employeeId) || name.length < 2 || password.length < 8) {
      throw badRequest('Número, nombre (≥2) y contraseña (≥8) válidos requeridos');
    }
    const dup = await prisma.user.findUnique({ where: { employeeId } });
    if (dup) throw badRequest('Ese número de colaborador ya existe');
    const user = await prisma.user.create({
      data: { employeeId, name, role, passwordHash: await hashPassword(password) },
    });
    await writeAudit(
      req.auth!.sub,
      'USER_ROLE_CHANGED',
      'User',
      user.id,
      `Creó al colaborador ${name} (N° ${employeeId}) como ${role === 'ADMIN' ? 'administrador' : 'empleado'}`,
    );
    res.status(201).json(serializeUser(user));
  }),
);

// PATCH /api/admin/users/:id/active — activar/desactivar colaborador.
// El modelo REST (Prisma) no incluye el campo `active`; la desactivación solo
// está soportada en modo Supabase. Se responde explícitamente para no fingir éxito.
adminRouter.patch(
  '/users/:id/active',
  asyncHandler(async (_req, res) => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: 'La desactivación de colaboradores solo está disponible con Supabase.',
    });
  }),
);
