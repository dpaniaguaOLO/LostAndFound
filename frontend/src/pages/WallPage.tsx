import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoundItem, LostReport, Paginated } from '@laf/shared';
import { Filters, type FilterValues } from '../components/Filters';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { NameEmblems } from '../components/game';
import { CardGridSkeleton, EmptyState, ErrorState, ItemImage, Notice, PageHeader, TabPanel, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { cacheGet, cacheSet } from '../lib/cache';
import { getErrorMessage } from '../lib/errors';
import { formatDateTime, formatRelativeDay } from '../lib/format';
import { useDebounce } from '../lib/useDebounce';
import { services } from '../services';

type Tab = 'found' | 'lost';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/**
 * "Para ti": lo que requiere tu atención primero (personalización). Solo aparece
 * si hay algo: reportes de perdido tuyos aún en búsqueda y solicitudes de
 * reclamación pendientes de revisar sobre objetos que publicaste.
 */
function ForYou() {
  const [openLost, setOpenLost] = useState(0);
  const [pendingClaims, setPendingClaims] = useState(0);

  useEffect(() => {
    let active = true;
    services.lostReports
      .mine()
      .then((l) => active && setOpenLost(l.filter((r) => r.status === 'OPEN' || r.status === 'MATCHED').length))
      .catch(() => void 0);
    services.claims
      .incoming()
      .then((c) => active && setPendingClaims(c.filter((x) => x.status === 'PENDING').length))
      .catch(() => void 0);
    return () => {
      active = false;
    };
  }, []);

  if (!openLost && !pendingClaims) return null;
  return (
    <div className="mb-5 grid animate-fade-up gap-3 sm:grid-cols-2">
      {pendingClaims > 0 && (
        <ForYouCard
          to="/reclamaciones"
          tone="amber"
          title={pendingClaims === 1 ? '1 solicitud por revisar' : `${pendingClaims} solicitudes por revisar`}
          text="Alguien reclama un objeto que publicaste."
        />
      )}
      {openLost > 0 && (
        <ForYouCard
          to="/mis-objetos?tab=lost"
          tone="olo"
          title={openLost === 1 ? 'Buscando 1 objeto tuyo' : `Buscando ${openLost} objetos tuyos`}
          text="Revisa las posibles coincidencias."
        />
      )}
    </div>
  );
}

function ForYouCard({ to, tone, title, text }: { to: string; tone: 'amber' | 'olo'; title: string; text: string }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/20',
    olo: 'bg-olo-50 text-olo-900 ring-olo-200 dark:bg-olo-500/10 dark:text-olo-100 dark:ring-olo-500/20',
  };
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-2xl p-4 ring-1 transition hover:shadow-card-hover active:scale-[0.99] ${tones[tone]}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm opacity-80">{text}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition group-hover:translate-x-0.5">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

/**
 * "Devueltos recientemente": objetos que volvieron a su dueño en los últimos 7
 * días, en una tira horizontal. Muestra que la app funciona (y a quién se debe).
 * Si no hay ninguno o falla la carga, no se muestra nada.
 */
function RecentlyReturned({ reload }: { reload: number }) {
  const [items, setItems] = useState<FoundItem[]>([]);
  useEffect(() => {
    let active = true;
    services.foundItems
      .recentlyReturned()
      .then((r) => active && setItems(r))
      .catch(() => void 0);
    return () => {
      active = false;
    };
  }, [reload]);

  if (items.length === 0) return null;
  return (
    <section className="mb-6 animate-fade-up" aria-labelledby="recent-returned-title">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="recent-returned-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
          Devueltos recientemente
        </h2>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {/* El servicio devuelve como mucho 12: con 12 puede haber más. */}
          {items.length === 1 ? '1 objeto volvió' : `${items.length}${items.length >= 12 ? '+' : ''} objetos volvieron`} a su dueño en los últimos 7 días
        </p>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        {items.map((item) => (
          <li key={item.id} className="w-40 shrink-0 snap-start sm:w-44">
            <Link to={`/objetos/${item.id}`} className="card-interactive group flex h-full flex-col overflow-hidden">
              <div className="relative">
                <ItemImage src={item.imageUrl} alt="" />
                <span className="absolute left-2 top-2 rounded-full bg-green-600/95 px-2 py-0.5 text-[11px] font-bold text-white shadow-card">
                  ✓ Devuelto
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-300">
                  {item.title}
                </h3>
                <p className="flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">por {item.reporter.name}</span>
                  <NameEmblems id={item.reporter.id} className="h-3.5 w-3.5" />
                </p>
                {item.returnedAt && <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatRelativeDay(item.returnedAt)}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
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
  // Fecha de la copia local mostrada cuando no hay conexión (null = datos en vivo).
  const [offlineSince, setOfflineSince] = useState<string | null>(null);

  // Al recuperar la red, recargar en vivo.
  useEffect(() => {
    const onOnline = () => setReload((n) => n + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

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

    // Solo la vista por defecto (pág. 1 sin filtros) se guarda para verla sin conexión.
    const cacheable = page === 1 && !params.search && !params.category && !params.location;
    const cacheKey = `wall.${tab}`;

    const request =
      tab === 'found' ? services.foundItems.list(params) : services.lostReports.list(params);
    request
      .then((data) => {
        if (!active) return;
        if (tab === 'found') setFound(data as Paginated<FoundItem>);
        else setLost(data as Paginated<LostReport>);
        setOfflineSince(null);
        if (cacheable) cacheSet(cacheKey, data);
      })
      .catch((err) => {
        if (!active) return;
        // Sin red: mostrar lo último guardado en vez de una pantalla de error.
        const cached = cacheable && !navigator.onLine ? cacheGet<Paginated<FoundItem | LostReport>>(cacheKey) : null;
        if (cached) {
          if (tab === 'found') setFound(cached.data as Paginated<FoundItem>);
          else setLost(cached.data as Paginated<LostReport>);
          setOfflineSince(cached.savedAt);
          return;
        }
        setError(getErrorMessage(err, 'Error al cargar el muro'));
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [tab, debouncedSearch, filters.category, debouncedLocation, page, reload]);

  // Al volver a la app (o a la pestaña) tras un rato, recargar: puede haber
  // objetos nuevos. Como mucho una vez por minuto.
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
        last = Date.now();
        setReload((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  function goToPage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const result = tab === 'found' ? found : lost;
  const firstName = user?.name?.split(' ')[0];

  return (
    <div>
      {/* El h1 describe la página (WCAG 2.4.6); el saludo va en el subtítulo. */}
      <PageHeader
        title="Muro de objetos"
        subtitle={`${firstName ? `${greeting()}, ${firstName}. ` : ''}Objetos publicados por los colaboradores en las instalaciones.`}
        action={
          <Link to="/publicar" className="btn-primary hidden md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Publicar
          </Link>
        }
      />

      <ForYou />

      <Tabs<Tab>
        id="wall"
        label="Tipo de publicación"
        tabs={[
          { key: 'found', label: 'Encontrados', count: found?.total },
          { key: 'lost', label: 'Perdidos', count: lost?.total },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel id="wall" active={tab}>
      <Filters value={filters} onChange={setFilters} />

      {/* Solo en la vista principal de Encontrados (no al buscar ni en otras páginas). */}
      {tab === 'found' && page === 1 && !debouncedSearch && !filters.category && !debouncedLocation && !offlineSince && (
        <RecentlyReturned reload={reload} />
      )}

      {offlineSince && (
        <div className="mb-4">
          <Notice tone="warn">
            Sin conexión: mostrando lo último guardado ({formatDateTime(offlineSince)}). Se actualizará al volver la red.
          </Notice>
        </div>
      )}

      {/* Esqueleto solo en la primera carga; al refrescar se mantienen los
          resultados (atenuados) para no hacer "parpadear" la lista. */}
      {loading && !result ? (
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
            <Link to={tab === 'lost' ? '/publicar?tipo=perdido' : '/publicar'} className="btn-primary">
              {tab === 'lost' ? 'Reportar un perdido' : 'Publicar'}
            </Link>
          }
        />
      ) : (
        <>
          <div
            className={'grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 ' + (loading ? 'opacity-60' : '')}
            aria-busy={loading}
          >
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
      </TabPanel>
    </div>
  );
}
