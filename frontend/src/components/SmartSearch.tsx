import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ScoredFoundItem, SemanticSearchResponse } from '@laf/shared';
import { api, ApiRequestError } from '../lib/api';
import { CATEGORY_LABELS } from '../lib/format';

/** Color del porcentaje de relevancia según qué tan alto sea. */
function scoreClass(score: number): string {
  if (score >= 60) return 'bg-olo-100 text-olo-800 dark:bg-olo-500/20 dark:text-olo-300';
  if (score >= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-olo-dark-800 dark:text-slate-300';
}

/**
 * Búsqueda inteligente (IA local): el usuario describe el objeto en lenguaje
 * natural y el backend devuelve los encontrados ordenados por relevancia.
 */
export function SmartSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoredFoundItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<SemanticSearchResponse>('/ai/search', {
        method: 'POST',
        body: { query: query.trim() },
      });
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo completar la búsqueda');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery('');
    setResults(null);
    setError(null);
  }

  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-olo-600 text-white dark:bg-olo-500 dark:text-slate-950">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="currentColor" />
            <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Búsqueda inteligente
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Describe el objeto con tus palabras, ej. “mi cartera café que perdí en la cafetería”.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Qué estás buscando?"
          aria-label="Búsqueda inteligente"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={loading}>
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
          {results !== null && (
            <button type="button" className="btn-secondary" onClick={clear}>
              Limpiar
            </button>
          )}
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {results !== null && !error && (
        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No se encontraron coincidencias. Prueba con otras palabras.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((r) => (
                <li key={r.item.id}>
                  <Link
                    to={`/objetos/${r.item.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 transition hover:border-olo-300 hover:bg-slate-50 dark:border-olo-dark-800 dark:hover:bg-olo-dark-800"
                  >
                    {r.item.imageUrl ? (
                      <img
                        src={r.item.imageUrl}
                        alt={r.item.title}
                        className="h-14 w-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-olo-dark-800 dark:text-slate-600">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 11 3.5-4 2.5 3 3-4L18 16H6Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {r.item.title}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {CATEGORY_LABELS[r.item.category]} · {r.item.location}
                      </p>
                    </div>
                    <span className={`badge shrink-0 ${scoreClass(r.score)}`}>{r.score}%</span>
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
