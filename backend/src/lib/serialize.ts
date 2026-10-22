// Convierte registros de Prisma a la forma pública de la API (@laf/shared).
// Centraliza el formateo de fechas (ISO) y evita exponer campos sensibles como passwordHash.

import { signUploadUrl } from './fileUrls.js';

type AnyRecord = Record<string, unknown>;

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string));

export function serializeUser(u: AnyRecord) {
  return {
    id: u.id as string,
    name: u.name as string,
    employeeId: u.employeeId as string,
    email: (u.email as string | null) ?? null,
    role: u.role as 'EMPLOYEE' | 'ADMIN',
    // El backend REST (Prisma) no modela desactivación; sus usuarios son siempre activos.
    active: (u.active as boolean | undefined) ?? true,
    createdAt: iso(u.createdAt),
  };
}

export function serializeFoundItem(i: AnyRecord) {
  const reporter = i.reporter as AnyRecord | undefined;
  return {
    id: i.id as string,
    title: i.title as string,
    description: i.description as string,
    category: i.category as string,
    location: i.location as string,
    foundAt: iso(i.foundAt),
    imageUrl: signUploadUrl(i.imageUrl as string | null),
    status: i.status as string,
    returnedAt: i.returnedAt ? iso(i.returnedAt) : null,
    reporter: reporter
      ? { id: reporter.id as string, name: reporter.name as string }
      : { id: i.reporterId as string, name: '' },
    createdAt: iso(i.createdAt),
    updatedAt: iso(i.updatedAt),
  };
}

export function serializeLostReport(i: AnyRecord) {
  const reporter = i.reporter as AnyRecord | undefined;
  return {
    id: i.id as string,
    title: i.title as string,
    description: i.description as string,
    category: i.category as string,
    location: i.location as string,
    lostAt: iso(i.lostAt),
    imageUrl: signUploadUrl(i.imageUrl as string | null),
    status: i.status as string,
    reporter: reporter
      ? { id: reporter.id as string, name: reporter.name as string }
      : { id: i.reporterId as string, name: '' },
    createdAt: iso(i.createdAt),
    updatedAt: iso(i.updatedAt),
  };
}

export function serializeClaim(c: AnyRecord) {
  const claimant = c.claimant as AnyRecord | undefined;
  const foundItem = c.foundItem as AnyRecord | undefined;
  return {
    id: c.id as string,
    foundItemId: c.foundItemId as string,
    foundItem: foundItem
      ? {
          id: foundItem.id as string,
          title: foundItem.title as string,
          imageUrl: signUploadUrl(foundItem.imageUrl as string | null),
          status: foundItem.status as string,
        }
      : undefined,
    claimant: claimant
      ? { id: claimant.id as string, name: claimant.name as string }
      : { id: c.claimantId as string, name: '' },
    message: c.message as string,
    status: c.status as string,
    reviewerId: (c.reviewerId as string | null) ?? null,
    reviewNote: (c.reviewNote as string | null) ?? null,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function serializeNotification(n: AnyRecord) {
  return {
    id: n.id as string,
    type: n.type as string,
    title: n.title as string,
    body: n.body as string,
    read: n.read as boolean,
    relatedItemId: (n.relatedItemId as string | null) ?? null,
    createdAt: iso(n.createdAt),
  };
}
