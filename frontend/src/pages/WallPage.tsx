import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport, Paginated } from '@laf/shared';
import { Filters, type FilterValues } from '../components/Filters';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { useDebounce } from '../lib/useDebounce';
import { services } from '../services';

type Tab = 'found' | 'lost';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function WallPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('found');
  const [filters, setFilters] = useState<FilterValues>({ search: '', category: '', location: '' });
  const debouncedSearch = useDebounce(filters.search);
  const debouncedLocation = useDebounce(filters.location);

  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0); // fuerza un nuevo intento tras un error
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
  }, [tab, debouncedSearch, filters.category, debouncedLocation, page, reload]);

  function goToPage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const result = tab === 'found' ? found : lost;
  const firstName = user?.name?.split(' ')[0];

  return (
    <div>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : 'Muro'}
        subtitle="Objetos publicados por los colaboradores en las instalaciones."
        action={
          <Link to="/publicar" className="btn-primary hidden md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Publicar
          </Link>
        }
      />

      <Tabs<Tab>
        tabs={[
          { key: 'found', label: 'Encontrados', count: found?.total },
          { key: 'lost', label: 'Perdidos', count: lost?.total },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Filters value={filters} onChange={setFilters} />

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          title={
            tab === 'found' ? 'No hay objetos encontrados' : 'No hay objetos perdidos reportados'
          }
          description="Ajusta la búsqueda o publica un objeto nuevo."
          action={
            <Link to="/publicar" className="btn-primary">
              Publicar
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {tab === 'found'
              ? (result.data as FoundItem[]).map((item, i) => (
                  <div key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <FoundItemCard item={item} />
                  </div>
                ))
              : (result.data as LostReport[]).map((item, i) => (
                  <div key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <LostReportCard item={item} />
                  </div>
                ))}
          </div>

          {result.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-between gap-3 sm:justify-center" aria-label="Paginación">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => goToPage(Math.max(1, page - 1))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Anterior
              </button>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {result.page} / {result.totalPages}
              </span>
              <button className="btn-secondary" disabled={page >= result.totalPages} onClick={() => goToPage(page + 1)}>
                Siguiente
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
