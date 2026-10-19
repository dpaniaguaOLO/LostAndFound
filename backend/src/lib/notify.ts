import { prisma } from '../db.js';

interface NotifyInput {
  userId: string;
  type:
    | 'CLAIM_REQUESTED'
    | 'CLAIM_APPROVED'
    | 'CLAIM_REJECTED'
    | 'ITEM_RETURNED'
    | 'MATCH_FOUND'
    | 'SYSTEM';
  title: string;
  body: string;
  relatedItemId?: string | null;
}

/** Crea una notificación en la base de datos para un usuario. */
export async function notify(input: NotifyInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedItemId: input.relatedItemId ?? null,
    },
  });
}
