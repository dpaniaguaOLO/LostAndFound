import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { conflict, forbidden, tooManyRequests, unauthorized } from '../lib/http.js';
import { AttemptLimiter, rateLimit } from '../lib/rateLimit.js';
import { serializeUser } from '../lib/serialize.js';
import { loginSchema, parseOrThrow, registerSchema } from '../lib/validation.js';
import { authenticate } from '../middleware/authenticate.js';

export const authRouter = Router();

// Hash bcrypt (mismo coste) de una contraseña aleatoria: se compara contra él
// cuando el usuario no existe, para que el tiempo de respuesta no revele qué
// números de colaborador existen.
const dummyHash = hashPassword(crypto.randomUUID());

const asRole = (role: string) => role as 'EMPLOYEE' | 'ADMIN';

// POST /api/auth/register — crea un usuario EMPLOYEE y devuelve token.
// Antiabuso: se puede desactivar (ALLOW_SELF_REGISTRATION=false) y está limitado
// a 5 registros por IP y hora.
authRouter.post(
  '/register',
  rateLimit({ name: 'register', max: 5, windowMs: 60 * 60_000, key: (req) => req.ip ?? '' }),
  asyncHandler(async (req, res) => {
    if (!config.allowSelfRegistration) {
      throw forbidden('El registro está deshabilitado. Pide el alta a un administrador.');
    }
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

    const token = signToken({ sub: user.id, role: asRole(user.role), sv: user.sessionVersion });
    res.status(201).json({ token, user: serializeUser(user) });
  }),
);

// Freno a la fuerza bruta: 10 fallos por IP + número de colaborador cada 15 min,
// y además 50 fallos por IP (aunque vaya rotando números de colaborador).
const loginLimiter = new AttemptLimiter(10, 15 * 60_000);
const loginIpLimiter = new AttemptLimiter(50, 15 * 60_000);

// POST /api/auth/login — autentica y devuelve token + usuario.
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(loginSchema, req.body);
    const limiterKey = `${req.ip}|${body.employeeId}`;
    const ipKey = req.ip ?? '';
    const wait = Math.max(loginLimiter.retryAfter(limiterKey), loginIpLimiter.retryAfter(ipKey));
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw tooManyRequests('Demasiados intentos fallidos. Inténtalo de nuevo en unos minutos.');
    }

    const user = await prisma.user.findUnique({ where: { employeeId: body.employeeId } });
    // Siempre se ejecuta bcrypt (también si el usuario no existe) y el mensaje es
    // genérico: ni el texto ni el tiempo revelan si el número existe.
    const valid = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) {
      loginLimiter.fail(limiterKey);
      loginIpLimiter.fail(ipKey);
      throw unauthorized('Credenciales incorrectas');
    }
    loginLimiter.reset(limiterKey);
    const token = signToken({ sub: user.id, role: asRole(user.role), sv: user.sessionVersion });
    res.json({ token, user: serializeUser(user) });
  }),
);

// POST /api/auth/logout — revoca el token actual en el servidor (no basta con
// borrarlo en el cliente: un JWT copiado seguiría siendo válido hasta caducar).
authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { jti, exp } = req.auth!;
    if (jti && exp) {
      const now = new Date();
      await prisma.$transaction([
        prisma.revokedToken.upsert({
          where: { jti },
          create: { jti, expiresAt: new Date(exp * 1000) },
          update: {},
        }),
        // Limpieza de revocaciones ya caducadas (el token expiró igualmente).
        prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);
    }
    res.json({ ok: true });
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
