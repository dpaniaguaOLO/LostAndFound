import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { FoundItemCard, LostReportCard } from '../components/ItemCard';
import { MatchSuggestions } from '../components/MatchSuggestions';
import { EmptyState, ErrorState, Spinner, Tabs } from '../components/ui';
import { api, ApiRequestError } from '../lib/api';

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
    Promise.all([
      api<FoundItem[]>('/found-items/mine/list'),
      api<LostReport[]>('/lost-reports/mine/list'),
    ])
      .then(([f, l]) => {
        setFound(f);
        setLost(l);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Error al cargar tus objetos'),
      )
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
      <h1 className="mb-1 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">
        Mis objetos
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Los objetos que tú perdiste o encontraste.
      </p>

      <Tabs<Tab>
        tabs={[
          { key: 'lost', label: `Perdidos (${lost.length})` },
          { key: 'found', label: `Encontrados (${found.length})` },
        ]}
        value={tab}
        onChange={changeTab}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'found' ? 'No has publicado objetos encontrados' : 'No has reportado objetos perdidos'}
          description="Usa el botón para registrar uno."
          action={
            <Link to={tab === 'found' ? '/publicar' : '/publicar'} className="btn-primary">
              {tab === 'found' ? 'Publicar objeto encontrado' : 'Reportar objeto perdido'}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tab === 'found'
            ? found.map((i) => <FoundItemCard key={i.id} item={i} />)
            : lost.map((i) => (
                // Cada objeto perdido propio muestra sus posibles coincidencias (IA).
                <div key={i.id} className="card overflow-hidden">
                  <LostReportCard item={i} embedded />
                  <MatchSuggestions lostReportId={i.id} />
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
