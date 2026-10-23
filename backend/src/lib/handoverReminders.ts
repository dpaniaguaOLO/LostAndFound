/**
 * Recordatorio de entregas atascadas (equivale a remind_my_pending_handovers() de la
 * migración 019 de Supabase). Un objeto CLAIMED cuya reclamación se aprobó hace más
 * de 3 días genera un aviso a quien lo encontró y a quien lo reclamó, como mucho uno
 * cada 3 días por objeto. Se ejecuta al pedir las notificaciones del usuario.
 */
import { prisma } from '../db.js';
import { notify } from './notify.js';

const STUCK_MS = 3 * 86_400_000;
const TITLE = 'Entrega pendiente';

/** Crea los recordatorios pendientes del usuario. Devuelve cuántos creó. */
export async function remindPendingHandovers(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const claims = await prisma.claim.findMany({
    where: {
      status: 'APPROVED',
      updatedAt: { lt: cutoff },
      foundItem: { status: 'CLAIMED' },
      OR: [{ claimantId: userId }, { foundItem: { reporterId: userId } }],
    },
    include: {
      claimant: { select: { name: true } },
      foundItem: { select: { id: true, title: true, reporterId: true, reporter: { select: { name: true } } } },
    },
  });
  let created = 0;
  for (const c of claims) {
    const recent = await prisma.notification.count({
      where: { userId, relatedItemId: c.foundItem.id, title: TITLE, createdAt: { gt: cutoff } },
    });
    if (recent) continue;
    const isFinder = c.foundItem.reporterId === userId;
    const days = Math.floor((Date.now() - c.updatedAt.getTime()) / 86_400_000);
    await notify({
      userId,
      type: 'SYSTEM',
      title: TITLE,
      body: isFinder
        ? `"${c.foundItem.title}" lleva ${days} días reclamado por ${c.claimant.name}. Cuando se lo entregues, márcalo como devuelto.`
        : `¿Ya recibiste "${c.foundItem.title}"? Coordina la entrega con ${c.foundItem.reporter.name} y pídele que lo marque como devuelto.`,
      relatedItemId: c.foundItem.id,
    });
    created++;
  }
  return created;
}
