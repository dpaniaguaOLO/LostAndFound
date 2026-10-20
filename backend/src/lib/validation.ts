import { z } from 'zod';
import { MAX_PASSWORD_BYTES } from './auth.js';
import { badRequest } from './http.js';

export const ITEM_CATEGORIES = [
  'ELECTRONICS',
  'CLOTHING',
  'ACCESSORIES',
  'DOCUMENTS',
  'KEYS',
  'BAGS',
  'WALLET',
  'JEWELRY',
  'OTHER',
] as const;

const categorySchema = z.enum(ITEM_CATEGORIES);

// bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda para que dos
// contraseñas distintas no resulten equivalentes.
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`,
  });

export const loginSchema = z.object({
  employeeId: z.string().trim().min(1, 'El número de colaborador es obligatorio').max(50),
  password: z.string().min(1, 'La contraseña es obligatoria').max(1024),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es demasiado corto').max(120),
  employeeId: z
    .string()
    .trim()
    .min(1, 'El número de colaborador es obligatorio')
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, 'Número de colaborador con caracteres no válidos'),
  password: passwordSchema,
  email: z.string().trim().email('Email inválido').max(254).optional(),
});

// Las fechas se aceptan entre 2000 y "mañana" (margen por zonas horarias).
const pastDate = (field: string) =>
  z
    .string()
    .datetime({ message: `${field} debe ser una fecha ISO 8601` })
    .refine((s) => {
      const t = Date.parse(s);
      return t >= Date.UTC(2000, 0, 1) && t <= Date.now() + 86_400_000;
    }, `${field} fuera de rango`);

export const createFoundItemSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().min(2).max(2000),
  category: categorySchema,
  location: z.string().trim().min(1).max(200),
  foundAt: pastDate('foundAt'),
});

export const createLostReportSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().min(2).max(2000),
  category: categorySchema,
  // Ubicación opcional: quien pierde algo a menudo no sabe dónde lo dejó.
  // Se normaliza a cadena vacía si no se envía.
  location: z.string().trim().max(200).optional().default(''),
  lostAt: pastDate('lostAt'),
});

export const createClaimSchema = z.object({
  foundItemId: z.string().min(1).max(64),
  message: z.string().trim().min(2).max(1000),
});

export const reviewClaimSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(1000).optional(),
});

export const semanticSearchSchema = z.object({
  query: z.string().trim().min(2, 'Escribe al menos 2 caracteres para buscar').max(300),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const assistantSchema = z.object({
  question: z.string().trim().min(2, 'Escribe una pregunta').max(300),
});

export const restoreSchema = z.object({
  kind: z.enum(['found', 'lost']),
  id: z.string().min(1).max(64),
});

export const setRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EMPLOYEE']),
});

export const resetPasswordSchema = z.object({
  employeeId: z.string().trim().min(1, 'El número de colaborador es obligatorio').max(50),
  newPassword: passwordSchema,
});

/** Valida `data` con `schema` o lanza un HttpError 400 con los detalles. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Datos inválidos', result.error.flatten());
  }
  return result.data;
}
