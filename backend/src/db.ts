import { PrismaClient } from '@prisma/client';

// Instancia única de Prisma reutilizada en toda la aplicación.
export const prisma = new PrismaClient();
