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
    // Estados activos: azul neutro (independiente del verde de marca OLO para evitar
    // que un estado se confunda con una acción/elemento corporativo).
    case 'PUBLISHED':
    case 'OPEN':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300';
    case 'CLAIMED':
    case 'MATCHED':
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
    case 'RETURNED':
    case 'RESOLVED':
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300';
    case 'REJECTED':
    case 'ARCHIVED':
    case 'CLOSED':
    case 'CANCELLED':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Fecha relativa corta para listas ("Hoy", "Ayer", "Hace 3 días"); a partir de
 * una semana, la fecha normal. Compara días de calendario locales, no horas.
 */
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return formatDate(iso);
}

/** Fecha local de hoy (o de `d`) como YYYY-MM-DD, para inputs type="date". */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
