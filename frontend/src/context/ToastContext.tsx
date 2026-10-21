import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastKind, { box: string; icon: string; path: string }> = {
  success: {
    box: 'border-green-200 dark:border-green-500/30',
    icon: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300',
    path: 'm7 12.5 3.2 3.2L17 9',
  },
  error: {
    box: 'border-red-200 dark:border-red-500/30',
    icon: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
    path: 'M12 7.5v5.5m0 3.5h.01',
  },
  info: {
    box: 'border-slate-200 dark:border-olo-dark-800',
    icon: 'bg-olo-100 text-olo-700 dark:bg-olo-500/15 dark:text-olo-300',
    path: 'M12 11v5.5m0-9h.01',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = Date.now() + Math.random();
      // Máximo 3 a la vista para no tapar la pantalla en móvil.
      setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {/* Móvil: arriba (no compite con la barra inferior ni el teclado). Escritorio: abajo a la derecha. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:items-end sm:px-0"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const s = STYLES[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-2xl border bg-white/95 p-3 pr-2 shadow-elevated backdrop-blur dark:bg-olo-dark-900/95 ${s.box}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.icon}`} aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d={s.path} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <p className="flex-1 pt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-olo-dark-850"
                aria-label="Cerrar aviso"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
