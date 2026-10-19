import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, Paginated } from '@laf/shared';
import { Filters, type FilterValues } from '../components/Filters';
import { FoundItemCard } from '../components/ItemCard';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { api, ApiRequestError } from '../lib/api';
import { useDebounce } from '../lib/useDebounce';

export function WallPage() {
  const [filters, setFilters] = useState<FilterValues>({ search: '', category: '', location: '' });
  const debouncedSearch = useDebounce(filters.search);
  const debouncedLocation = useDebounce(filters.location);

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<FoundItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vuelve a la página 1 cuando cambian los filtros.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.category, debouncedLocation]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.category) params.set('category', filters.category);
    if (debouncedLocation) params.set('location', debouncedLocation);
    params.set('page', String(page));

    api<Paginated<FoundItem>>(`/found-items?${params.toString()}`)
      .then((data) => active && setResult(data))
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar el muro');
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [debouncedSearch, filters.category, debouncedLocation, page]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">
            Objetos encontrados
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Consulta lo que se ha encontrado en las instalaciones.
          </p>
        </div>
        <Link to="/publicar" className="btn-primary w-full sm:w-auto">
          Publicar objeto
        </Link>
      </div>

      <Filters value={filters} onChange={setFilters} />

      {loading ? (
        <Spinner label="Cargando objetos…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setPage((p) => p)} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          title="No hay objetos que coincidan"
          description="Ajusta la búsqueda o publica un objeto que hayas encontrado."
          action={
            <Link to="/publicar" className="btn-primary">
              Publicar objeto
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map((item) => (
              <FoundItemCard key={item.id} item={item} />
            ))}
          </div>

          {result.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Página {result.page} de {result.totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= result.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
