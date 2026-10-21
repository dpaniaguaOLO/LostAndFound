import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { MatchSuggestions } from '../components/MatchSuggestions';
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader, Tabs } from '../components/ui';
import { getErrorMessage } from '../lib/errors';
import { services } from '../services';

type Tab = 'lost' | 'found';

export function MyThingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Pestaña inicial desde ?tab= (al publicar un perdido redirige aquí con tab=lost).
  const initialTab: Tab = searchParams.get('tab') === 'found' ? 'found' : 'lost';
  const [tab, setTab] = useState<Tab>(initialTab);

  const [found, setFound] = useState<FoundItem[]>([]);
  const [lost, setLost] = useState<LostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([services.foundItems.mine(), services.lostReports.mine()])
      .then(([f, l]) => {
        setFound(f);
        setLost(l);
      })
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar tus objetos')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function changeTab(next: Tab) {
    setTab(next);
    setSearchParams(next === 'lost' ? {} : { tab: 'found' }, { replace: true });
  }

  const items = tab === 'found' ? found : lost;

  return (
    <div>
      <PageHeader title="Mis objetos" subtitle="Los objetos que tú perdiste o encontraste." />

      <Tabs<Tab>
        tabs={[
          { key: 'lost', label: 'Perdidos', count: loading ? undefined : lost.length },
          { key: 'found', label: 'Encontrados', count: loading ? undefined : found.length },
        ]}
        value={tab}
        onChange={changeTab}
      />

      {loading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'found' ? 'No has publicado objetos encontrados' : 'No has reportado objetos perdidos'}
          description="Usa el botón para registrar uno."
          action={
            <Link to="/publicar" className="btn-primary">
              {tab === 'found' ? 'Publicar objeto encontrado' : 'Reportar objeto perdido'}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {tab === 'found'
            ? found.map((i, idx) => (
                <div key={i.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
                  <FoundItemCard item={i} />
                </div>
              ))
            : lost.map((i, idx) => (
                // Cada objeto perdido propio: tarjeta + acceso al detalle + coincidencias.
                <div key={i.id} className="card group animate-fade-up overflow-hidden transition duration-300 hover:shadow-card-hover" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
                  <Link to={`/perdidos/${i.id}`} className="block">
                    <LostReportCard item={i} embedded />
                  </Link>
                  <MatchSuggestions lostReportId={i.id} />
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
