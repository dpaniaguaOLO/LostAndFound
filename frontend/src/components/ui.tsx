import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { statusBadgeClass } from '../lib/format';
import { haptics } from '../lib/haptics';

/** Indicador de carga centrado. */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400" role="status">
      <div className="relative h-10 w-10" aria-hidden>
        <div className="absolute inset-0 rounded-full border-[3px] border-olo-100 dark:border-olo-dark-800" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-olo-500 dark:border-t-olo-400" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

/** Cabecera de página: título, subtítulo y acción opcional (alineada a la derecha en sm+). */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Botón "Volver": atrás en el historial o al muro si se entró por enlace directo. */
export function BackButton() {
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <button
      className="-ml-2 mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-300 dark:hover:bg-olo-dark-850 dark:hover:text-white"
      onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Volver
    </button>
  );
}

/** Rejilla de datos clave (etiqueta + valor) en tarjetas pequeñas. */
export function DetailGrid({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 dark:border-olo-dark-800 dark:bg-olo-dark-900">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Estado vacío con ilustración, mensaje y acción opcional. */
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
    <div className="flex animate-fade-up flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center dark:border-olo-dark-800 dark:bg-olo-dark-900/60">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-olo-50 to-olo-100 text-olo-600 shadow-inner-soft dark:from-olo-500/10 dark:to-olo-500/5 dark:text-olo-400">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Estado de error con reintento opcional. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-950/30" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </div>
      <p className="text-sm font-medium text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

const NOTICE_TONES = {
  info: 'bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200',
  success: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
} as const;

/** Aviso en línea (estado de una reclamación, entrega, etc.). */
export function Notice({ tone, children }: { tone: keyof typeof NOTICE_TONES; children: ReactNode }) {
  return (
    <p className={`flex animate-fade-in items-start gap-2.5 rounded-2xl p-4 text-sm font-medium ${NOTICE_TONES[tone]}`} role="status">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0">
        {tone === 'success' ? (
          <path d="m7 12.5 3.2 3.2L17 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 11v5m0-8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** Insignia de estado coloreada (con punto indicador). */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`badge ${statusBadgeClass(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

/** Barra de pestañas segmentada (ancho completo en móvil). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  // Teclado (patrón WAI-ARIA de pestañas): flechas/Inicio/Fin cambian de pestaña.
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.key === value);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].key);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className="mb-5 flex w-full max-w-full overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 no-scrollbar dark:border-olo-dark-800 dark:bg-olo-dark-900 sm:inline-flex sm:w-auto"
    >
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) haptics.tap();
              onChange(t.key);
            }}
            className={
              'flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition duration-200 sm:flex-none sm:px-4 ' +
              (active
                ? 'bg-white text-olo-700 shadow-card dark:bg-olo-dark-800 dark:text-olo-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')
            }
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={
                  'rounded-full px-1.5 text-[11px] font-bold ' +
                  (active ? 'bg-olo-100 text-olo-700 dark:bg-olo-500/20 dark:text-olo-300' : 'bg-slate-200 text-slate-500 dark:bg-olo-dark-800 dark:text-slate-400')
                }
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Imagen del objeto o un marcador de posición accesible. Hace zoom suave dentro de un `.group`. */
export function ItemImage({ src, alt, rounded = true }: { src: string | null; alt: string; rounded?: boolean }) {
  const radius = rounded ? 'rounded-t-2xl' : '';
  // Si la imagen no carga (sin red, o URL firmada caducada en la copia sin
  // conexión) se muestra el marcador en vez de un icono roto.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div
        className={`flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200/70 text-slate-300 dark:from-olo-dark-850 dark:to-olo-dark-800 dark:text-slate-600 ${radius}`}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <div className={`aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-olo-dark-850 ${radius}`}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover transition duration-500 ease-out-expo group-hover:scale-[1.04]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * Foto de detalle que se amplía a pantalla completa al tocarla (para identificar
 * el objeto hace falta ver detalles). Sin foto, muestra el marcador normal.
 */
export function ZoomableImage({ src, alt }: { src: string | null; alt: string }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open]);

  if (!src) return <ItemImage src={null} alt={alt} rounded={false} />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-zoom-in" aria-label={`Ampliar foto: ${alt}`}>
        <ItemImage src={src} alt={alt} rounded={false} />
        <span className="pointer-events-none absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition group-hover:scale-110" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/90 p-4 safe-top safe-bottom"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto: ${alt}`}
            onClick={() => setOpen(false)}
          >
            <img src={src} alt={alt} className="max-h-full max-w-full animate-scale-in rounded-lg object-contain" />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              aria-label="Cerrar foto"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Barra de acción principal fija sobre la navegación inferior (solo móvil): deja
 * la acción más importante de la pantalla al alcance del pulgar. En sm+ no se
 * muestra (la página mantiene sus botones en línea). Mientras está montada marca
 * <html data-actionbar> para que el botón de Olivia suba y no la tape.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.actionbar = '1';
    return () => {
      delete document.documentElement.dataset.actionbar;
    };
  }, []);
  return (
    <>
      {/* Hueco para que el final de la página no quede bajo la barra */}
      <div className="h-20 md:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-slide-up border-t border-slate-200/80 bg-white/90 px-4 py-3 shadow-nav backdrop-blur-xl dark:border-olo-dark-800 dark:bg-olo-dark-900/90 md:hidden">
        <div className="mx-auto flex max-w-md gap-2 [&>*]:flex-1">{children}</div>
      </div>
    </>
  );
}

/** Esqueleto de tarjeta de objeto (para listas mientras cargan). */
export function CardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <div className="skeleton aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex justify-between gap-3">
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-4/5" />
        <div className="flex gap-2 pt-1">
          <div className="skeleton h-5 w-20 rounded-full" />
          <div className="skeleton h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Rejilla de esqueletos con el mismo layout que las listas de tarjetas. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" role="status" aria-label="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Esqueleto para listas de filas (reclamaciones, notificaciones…). */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card flex flex-col gap-3 p-4 sm:p-5" aria-hidden>
          <div className="flex gap-2">
            <div className="skeleton h-5 w-1/3" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/**
 * Diálogo modal: hoja inferior en móvil, centrado en sm+. Cierra con Escape o
 * tocando el fondo, y bloquea el scroll de la página mientras está abierto.
 */
export function Modal({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose suele ser una función inline: se guarda en una ref para que el efecto
  // de abrir/cerrar no se re-ejecute (y no robe el foco) en cada render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial: el primer campo/botón del diálogo (o el propio panel). En
    // pantallas táctiles no se enfoca un campo de texto, que abriría el teclado.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    const isTextField = first?.matches('input, textarea, select');
    const touch = !window.matchMedia('(pointer: fine)').matches;
    (first && !(isTextField && touch) ? first : panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Trampa de foco: Tab no sale del diálogo mientras está abierto.
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.(); // devolver el foco a quien abrió el diálogo
    };
  }, [open]);

  if (!open) return null;
  // Portal al <body>: así ningún ancestro con transform/overflow recorta el modal.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-h-[90vh] animate-slide-up overflow-y-auto outline-none rounded-t-3xl border border-slate-200/80 bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-elevated dark:border-olo-dark-800 dark:bg-olo-dark-900 sm:max-w-md sm:animate-scale-in sm:rounded-2xl sm:pb-6">
        {/* Asa de la hoja inferior (solo móvil) */}
        <div className="mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-olo-dark-700 sm:hidden" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
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
  return (
    <Modal open={open} label={title} onClose={onCancel}>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
