import type { ReactNode } from 'react';
import { statusBadgeClass } from '../lib/format';

/** Indicador de carga centrado. */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-olo-600 dark:border-slate-700 dark:border-t-olo-400"
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Estado vacío con mensaje y acción opcional. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-olo-dark-800 dark:bg-olo-dark-900">
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Estado de error con reintento opcional. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12 text-center dark:border-red-900/50 dark:bg-red-950/30">
      <p className="text-sm font-medium text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Insignia de estado coloreada. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{label}</span>;
}

/** Imagen del objeto o un marcador de posición accesible. */
export function ItemImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-t-xl bg-slate-100 text-slate-400 dark:bg-olo-dark-800 dark:text-slate-600">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 11 3.5-4 2.5 3 3-4L18 16H6Z"
            fill="currentColor"
          />
        </svg>
        <span className="sr-only">{alt} (sin imagen)</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="aspect-[4/3] w-full rounded-t-xl object-cover"
      loading="lazy"
    />
  );
}

/** Modal de confirmación sencillo. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
