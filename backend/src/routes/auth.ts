import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { conflict, unauthorized } from '../lib/http.js';
import { serializeUser } from '../lib/serialize.js';
import { loginSchema, parseOrThrow, registerSchema } from '../lib/validation.js';
import { authenticate } from '../middleware/authenticate.js';

export const authRouter = Router();

// POST /api/auth/register — crea un usuario EMPLOYEE y devuelve token.
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(registerSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { employeeId: body.employeeId } });
    if (existing) throw conflict('Ya existe un usuario con ese número de colaborador');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        employeeId: body.employeeId,
        email: body.email ?? null,
        passwordHash: await hashPassword(body.password),
        role: 'EMPLOYEE',
      },
    });

    const token = signToken({ sub: user.id, role: user.role as 'EMPLOYEE' | 'ADMIN' });
    res.status(201).json({ token, user: serializeUser(user) });
  }),
);

// POST /api/auth/login — autentica y devuelve token + usuario.
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { employeeId: body.employeeId } });
    // Mensaje genérico para no revelar si el número de colaborador existe.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Credenciales incorrectas');
    }
    const token = signToken({ sub: user.id, role: user.role as 'EMPLOYEE' | 'ADMIN' });
    res.json({ token, user: serializeUser(user) });
  }),
);

// GET /api/auth/me — devuelve el usuario autenticado.
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw unauthorized();
    res.json(serializeUser(user));
  }),
);
