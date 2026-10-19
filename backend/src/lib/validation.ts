import { z } from 'zod';
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

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'El nombre es demasiado corto').max(120),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
});

export const createFoundItemSchema = z.object({
  title: z.string().min(2).max(140),
  description: z.string().min(2).max(2000),
  category: categorySchema,
  location: z.string().min(1).max(200),
  foundAt: z.string().datetime({ message: 'foundAt debe ser una fecha ISO 8601' }),
});

export const createLostReportSchema = z.object({
  title: z.string().min(2).max(140),
  description: z.string().min(2).max(2000),
  category: categorySchema,
  location: z.string().min(1).max(200),
  lostAt: z.string().datetime({ message: 'lostAt debe ser una fecha ISO 8601' }),
});

export const createClaimSchema = z.object({
  foundItemId: z.string().min(1),
  message: z.string().min(2).max(1000),
});

export const reviewClaimSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(1000).optional(),
});

/** Valida `data` con `schema` o lanza un HttpError 400 con los detalles. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Datos inválidos', result.error.flatten());
  }
  return result.data;
}
