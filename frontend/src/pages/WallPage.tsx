import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport, Paginated } from '@laf/shared';
import { Filters, type FilterValues } from '../components/Filters';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { EmptyState, ErrorState, Spinner, Tabs } from '../components/ui';
import { getErrorMessage } from '../lib/errors';
import { useDebounce } from '../lib/useDebounce';
import { services } from '../services';

type Tab = 'found' | 'lost';

export function WallPage() {
  const [tab, setTab] = useState<Tab>('found');
  const [filters, setFilters] = useState<FilterValues>({ search: '', category: '', location: '' });
  const debouncedSearch = useDebounce(filters.search);
  const debouncedLocation = useDebounce(filters.location);

  const [page, setPage] = useState(1);
  const [found, setFound] = useState<Paginated<FoundItem> | null>(null);
  const [lost, setLost] = useState<Paginated<LostReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vuelve a la página 1 al cambiar pestaña o filtros.
  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, filters.category, debouncedLocation]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = {
      search: debouncedSearch || undefined,
      category: filters.category || undefined,
      location: debouncedLocation || undefined,
      page,
    };

    const request =
      tab === 'found' ? services.foundItems.list(params) : services.lostReports.list(params);
    request
      .then((data) => {
        if (!active) return;
        if (tab === 'found') setFound(data as Paginated<FoundItem>);
        else setLost(data as Paginated<LostReport>);
      })
      .catch((err) => {
        if (!active) return;
        setError(getErrorMessage(err, 'Error al cargar el muro'));
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [tab, debouncedSearch, filters.category, debouncedLocation, page]);

  const result = tab === 'found' ? found : lost;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">Muro</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Objetos publicados por los colaboradores en las instalaciones.
          </p>
        </div>
        <Link to="/publicar" className="btn-primary w-full sm:w-auto">
          Publicar
        </Link>
      </div>

      <Tabs<Tab>
        tabs={[
          { key: 'found', label: 'Encontrados' },
          { key: 'lost', label: 'Perdidos' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Filters value={filters} onChange={setFilters} />

      {loading ? (
        <Spinner label="Cargando objetos…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setPage((p) => p)} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          title={
            tab === 'found' ? 'No hay objetos encontrados' : 'No hay objetos perdidos reportados'
          }
          description="Ajusta la búsqueda o publica desde el botón Publicar."
          action={
            <Link to="/publicar" className="btn-primary">
              Publicar
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tab === 'found'
              ? (result.data as FoundItem[]).map((item) => (
                  <FoundItemCard key={item.id} item={item} />
                ))
              : (result.data as LostReport[]).map((item) => (
                  <LostReportCard key={item.id} item={item} />
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
