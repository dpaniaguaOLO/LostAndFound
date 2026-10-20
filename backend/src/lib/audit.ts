import { prisma } from '../db.js';

export type AuditAction =
  | 'FOUND_ITEM_EDITED'
  | 'FOUND_ITEM_ARCHIVED'
  | 'FOUND_ITEM_DELETED'
  | 'FOUND_ITEM_RETURNED'
  | 'FOUND_ITEM_RESTORED'
  | 'LOST_REPORT_EDITED'
  | 'LOST_REPORT_DELETED'
  | 'LOST_REPORT_RESOLVED'
  | 'LOST_REPORT_CLOSED'
  | 'LOST_REPORT_RESTORED'
  | 'CLAIM_REVIEWED'
  | 'USER_ROLE_CHANGED'
  | 'USER_PASSWORD_RESET';

/**
 * Registra un evento de auditoría. Nunca interrumpe el flujo principal: si el
 * registro falla, se loggea y se continúa.
 */
export async function writeAudit(
  actorId: string,
  action: AuditAction,
  entityType: 'FoundItem' | 'LostReport' | 'Claim' | 'User',
  entityId: string,
  summary: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, summary },
    });
  } catch (e) {
    console.error('[audit]', e);
  }
}
