import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchSuggestionsResponse, ScoredFoundItem } from '@laf/shared';
import { api, ApiRequestError } from '../lib/api';
import { CATEGORY_LABELS } from '../lib/format';

function scoreClass(score: number): string {
  if (score >= 60) return 'bg-olo-100 text-olo-800 dark:bg-olo-500/20 dark:text-olo-300';
  if (score >= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300';
}

/**
 * Sugerencias de coincidencia (IA local) para un objeto perdido: al expandir,
 * consulta /ai/match/:id y muestra los encontrados que podrían corresponder,
 * con su porcentaje y los motivos.
 */
export function MatchSuggestions({ lostReportId }: { lostReportId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ScoredFoundItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await api<MatchSuggestionsResponse>(`/ai/match/${lostReportId}`);
        setData(res.suggestions);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'No se pudieron cargar sugerencias');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border-t border-slate-200 p-3 dark:border-olo-dark-800">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-sm font-medium text-olo-700 dark:text-olo-400"
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
            <p className="text-sm text-slate-500 dark:text-slate-400">Analizando objetos…</p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay objetos encontrados que se parezcan a este.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.map((s) => (
                <li key={s.item.id}>
                  <Link
                    to={`/objetos/${s.item.id}`}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 p-2 transition hover:border-olo-300 hover:bg-slate-50 dark:border-olo-dark-800 dark:hover:bg-olo-dark-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {s.item.title}
                        </span>
                        <span className={`badge shrink-0 ${scoreClass(s.score)}`}>{s.score}%</span>
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {CATEGORY_LABELS[s.item.category]} · {s.item.location}
                      </p>
                      {s.reasons.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
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
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
