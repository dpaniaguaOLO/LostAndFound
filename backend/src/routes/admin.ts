import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/http.js';
import { serializeUser } from '../lib/serialize.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

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
    const role = req.body?.role;
    if (role !== 'ADMIN' && role !== 'EMPLOYEE') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Rol inválido' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound('Usuario no encontrado');
    const updated = await prisma.user.update({ where: { id: user.id }, data: { role } });
    res.json(serializeUser(updated));
  }),
);
