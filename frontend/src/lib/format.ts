import type {
  ClaimStatus,
  FoundItemStatus,
  ItemCategory,
  LostReportStatus,
} from '@laf/shared';

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  ELECTRONICS: 'Electrónica',
  CLOTHING: 'Ropa',
  ACCESSORIES: 'Accesorios',
  DOCUMENTS: 'Documentos',
  KEYS: 'Llaves',
  BAGS: 'Bolsos',
  WALLET: 'Cartera',
  JEWELRY: 'Joyería',
  OTHER: 'Otro',
};

export const FOUND_STATUS_LABELS: Record<FoundItemStatus, string> = {
  PUBLISHED: 'Publicado',
  CLAIMED: 'Reclamado',
  RETURNED: 'Devuelto',
  ARCHIVED: 'Archivado',
};

export const LOST_STATUS_LABELS: Record<LostReportStatus, string> = {
  OPEN: 'Abierto',
  MATCHED: 'Vinculado',
  RESOLVED: 'Resuelto',
  CLOSED: 'Cerrado',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PUBLISHED':
    case 'OPEN':
      return 'bg-brand-100 text-brand-800';
    case 'CLAIMED':
    case 'MATCHED':
    case 'PENDING':
      return 'bg-amber-100 text-amber-800';
    case 'RETURNED':
    case 'RESOLVED':
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'REJECTED':
    case 'ARCHIVED':
    case 'CLOSED':
    case 'CANCELLED':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
