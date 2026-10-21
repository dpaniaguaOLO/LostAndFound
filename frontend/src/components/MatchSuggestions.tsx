import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchBreakdown, MatchReference, ScoredFoundItem } from '@laf/shared';
import { getErrorMessage } from '../lib/errors';
import { CATEGORY_LABELS } from '../lib/format';
import { aiService } from '../services/ai';

function scoreClass(score: number): string {
  if (score >= 60) return 'bg-olo-100 text-olo-800 dark:bg-olo-500/20 dark:text-olo-300';
  if (score >= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300';
}

/** Miniatura de un objeto (imagen o marcador). */
function Thumb({ src, alt, label }: { src: string | null; alt: string; label: string }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1">
      {src ? (
        <img src={src} alt={alt} className="h-20 w-20 rounded-xl object-cover shadow-card" loading="lazy" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-olo-dark-800 dark:text-slate-600">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 11 3.5-4 2.5 3 3-4L18 16H6Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
  );
}

/** Barra de desglose de una señal. */
function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-olo-dark-800">
        <div className="h-full rounded-full bg-gradient-to-r from-olo-400 to-olo-600 transition-[width] duration-700 ease-out-expo" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {value}%
      </span>
    </div>
  );
}

function Breakdown({ b }: { b: MatchBreakdown }) {
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-slate-50 p-2 dark:bg-olo-dark-900">
      <SignalBar label="Descripción" value={b.text} />
      {b.image !== null && <SignalBar label="Imagen" value={b.image} />}
      <SignalBar label="Categoría" value={b.category} />
      <SignalBar label="Ubicación" value={b.location} />
      <SignalBar label="Fecha" value={b.date} />
    </div>
  );
}

/**
 * Sugerencias de coincidencia (IA local) para un objeto perdido. Muestra, para
 * cada candidato encontrado: comparación de imágenes lado a lado (perdido vs
 * encontrado), porcentaje total, motivos y desglose de señales.
 */
export function MatchSuggestions({
  lostReportId,
  defaultOpen = false,
}: {
  lostReportId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [reference, setReference] = useState<MatchReference | null>(null);
  const [data, setData] = useState<ScoredFoundItem[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null); // id con desglose abierto
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSuggestions() {
    if (data !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiService.match(lostReportId);
      setReference(res.reference);
      setData(res.suggestions);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar sugerencias'));
    } finally {
      setLoading(false);
    }
  }

  // Si arranca abierto (vista de detalle), carga de inmediato.
  useEffect(() => {
    if (defaultOpen) void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await fetchSuggestions();
  }

  return (
    <div className="border-t border-slate-100 p-3 dark:border-olo-dark-800 sm:p-4">
      <button
        onClick={toggle}
        className="flex min-h-10 w-full items-center justify-between rounded-xl px-2 text-sm font-semibold text-olo-700 transition hover:bg-olo-50 dark:text-olo-400 dark:hover:bg-olo-500/10"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="currentColor" />
          </svg>
          Ver posibles coincidencias
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={open ? 'rotate-180 transition' : 'transition'}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Analizando objetos">
              {[0, 1].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200/80 p-3 dark:border-olo-dark-800" aria-hidden>
                  <div className="skeleton h-4 w-1/2" />
                  <div className="flex gap-3">
                    <div className="skeleton h-20 w-20 rounded-xl" />
                    <div className="skeleton h-20 w-20 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay objetos encontrados que se parezcan a este.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.map((s, i) => (
                <li
                  key={s.item.id}
                  className="animate-fade-up rounded-xl border border-slate-200/80 bg-white p-3 transition hover:shadow-card dark:border-olo-dark-800 dark:bg-olo-dark-900"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Toda la cabecera de la coincidencia lleva al objeto encontrado; el
                      reporte viaja en ?perdido= para enlazarlo si se reclama. */}
                  <Link
                    to={`/objetos/${s.item.id}?perdido=${lostReportId}`}
                    className="group -m-1 block rounded-lg p-1 focus-visible:ring-2"
                    aria-label={`Ver ${s.item.title} (${s.score}% de coincidencia)`}
                  >
                    {/* Título a ancho completo: así el nombre no compite con las imágenes */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="block font-semibold leading-snug text-slate-800 group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-400">
                        {s.item.title}
                      </span>
                      <span className={`badge shrink-0 ${scoreClass(s.score)}`}>{s.score}%</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {CATEGORY_LABELS[s.item.category]}
                      {s.item.location ? ` · ${s.item.location}` : ''}
                    </p>

                    {/* Comparación de imágenes: perdido → encontrado */}
                    <div className="mt-2 flex items-center gap-3">
                      <Thumb src={reference?.imageUrl ?? null} alt="Tu objeto" label="Perdido" />
                      <span className="text-slate-300 dark:text-slate-600" aria-hidden>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M4 12h16M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <Thumb src={s.item.imageUrl} alt={s.item.title} label="Encontrado" />
                      <span className="ml-auto hidden items-center gap-1 text-xs font-semibold text-olo-700 group-hover:underline dark:text-olo-400 sm:inline-flex">
                        Ver y reclamar
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                      </span>
                    </div>
                  </Link>

                  {s.reasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="badge bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Desglose del % (expandible) */}
                  {s.breakdown && (
                    <>
                      <button
                        onClick={() => setExpanded(expanded === s.item.id ? null : s.item.id)}
                        className="mt-2 text-xs font-medium text-olo-700 hover:underline dark:text-olo-400"
                      >
                        {expanded === s.item.id ? 'Ocultar desglose' : 'Ver por qué coincide'}
                      </button>
                      {expanded === s.item.id && <Breakdown b={s.breakdown} />}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
