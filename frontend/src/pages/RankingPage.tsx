import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bestBadges, displayedFrame, LEADERBOARD_MAX, LEADERBOARD_PAGE, type PlayerProfile, type PlayerSummary } from '@laf/shared';
import { Avatar, BadgeEmblem, LegendTitle, NameEmblems, PointsHelpModal, rankNameClass } from '../components/game';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { gameService } from '../services/game';

const PODIUM: Record<number, { medal: string; row: string }> = {
  1: { medal: '🥇', row: 'border-amber-300 bg-gradient-to-r from-amber-50 to-white dark:border-amber-400/40 dark:from-amber-500/10 dark:to-olo-dark-900' },
  2: { medal: '🥈', row: 'border-slate-300 bg-gradient-to-r from-slate-100 to-white dark:border-slate-500/50 dark:from-slate-500/10 dark:to-olo-dark-900' },
  3: { medal: '🥉', row: 'border-orange-300 bg-gradient-to-r from-orange-50 to-white dark:border-orange-400/40 dark:from-orange-500/10 dark:to-olo-dark-900' },
};

/** Ranking global: top 100 por puntos, de LEADERBOARD_PAGE en LEADERBOARD_PAGE. */
export function RankingPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [entries, setEntries] = useState<PlayerSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<PlayerProfile | null>(null);
  const [help, setHelp] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    gameService
      .leaderboard(0, LEADERBOARD_PAGE)
      .then((page) => {
        setEntries(page.entries);
        setHasMore(page.hasMore);
      })
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar el ranking')))
      .finally(() => setLoading(false));
    // Tu posición (aunque no estés en el top 100). Si falla, simplemente no se muestra.
    if (user) gameService.profile(user.id).then(setMe).catch(() => setMe(null));
  }
  useEffect(load, [user?.id]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await gameService.leaderboard(entries.length, LEADERBOARD_PAGE);
      // Sin duplicados si el ranking cambió entre una página y otra.
      setEntries((prev) => [...prev, ...page.entries.filter((e) => !prev.some((p) => p.id === e.id))]);
      setHasMore(page.hasMore);
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudieron cargar más puestos'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  const canLoadMore = hasMore && entries.length < LEADERBOARD_MAX;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Ranking"
        subtitle={`Los ${LEADERBOARD_MAX} colaboradores que más objetos han devuelto a su dueño.`}
        action={
          <button type="button" onClick={() => setHelp(true)} className="text-sm font-semibold text-olo-700 underline-offset-2 hover:underline dark:text-olo-300">
            ¿Cómo ganar puntos?
          </button>
        }
      />

      {me && (
        <Link
          to="/perfil"
          className="card mb-4 flex items-center gap-3 border-olo-200 p-3.5 transition hover:shadow-elevated dark:border-olo-500/30 sm:p-4"
          aria-label={`Tu posición: ${me.rank ? `puesto ${me.rank}` : 'sin puesto'}, ${me.points} puntos. Ver tu perfil`}
        >
          <span className="w-10 text-center text-sm font-extrabold text-olo-700 dark:text-olo-300">{me.rank ? `#${me.rank}` : '—'}</span>
          <Avatar name={me.name} url={me.avatarUrl} size="md" frame={displayedFrame(me)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-olo-700 dark:text-olo-300">Tu posición</p>
            <p className={`truncate font-semibold ${rankNameClass(me.points)}`}>{me.name}</p>
            <LegendTitle id={me.id} />
          </div>
          <Points value={me.points} />
        </Link>
      )}

      {loading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="El ranking está vacío"
          description="Nadie tiene puntos todavía. ¡Devuelve un objeto encontrado a su dueño y sé el primero!"
          action={
            <Link to="/publicar" className="btn-primary">
              Publicar objeto encontrado
            </Link>
          }
        />
      ) : (
        <>
          <ol className="flex flex-col gap-2" aria-label="Ranking de colaboradores">
            {entries.map((e, idx) => (
              <li key={e.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx % LEADERBOARD_PAGE, 10) * 30}ms` }}>
                <RankingRow entry={e} isMe={e.id === user?.id} />
              </li>
            ))}
          </ol>
          {canLoadMore ? (
            <div className="mt-5 flex justify-center">
              <button type="button" className="btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          ) : (
            entries.length >= LEADERBOARD_MAX && (
              <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">El ranking muestra solo el top {LEADERBOARD_MAX}.</p>
            )
          )}
        </>
      )}

      <PointsHelpModal open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function Points({ value }: { value: number }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block text-lg font-extrabold leading-none tabular-nums text-slate-900 dark:text-slate-100">{value.toLocaleString('es')}</span>
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">puntos</span>
    </span>
  );
}

function RankingRow({ entry, isMe }: { entry: PlayerSummary; isMe: boolean }) {
  const podium = entry.rank ? PODIUM[entry.rank] : undefined;
  const badges = bestBadges(entry.stats, 3);
  return (
    <Link
      to={isMe ? '/perfil' : `/perfil/${entry.id}`}
      className={
        'flex items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.99] sm:p-3.5 ' +
        (podium?.row ?? 'border-slate-200/80 bg-white dark:border-olo-dark-800 dark:bg-olo-dark-900') +
        (isMe ? ' ring-2 ring-olo-500/60' : '')
      }
    >
      <span className="w-10 shrink-0 text-center font-extrabold tabular-nums text-slate-500 dark:text-slate-400">
        {podium ? <span className="text-2xl" role="img" aria-label={`Puesto ${entry.rank}`}>{podium.medal}</span> : `#${entry.rank}`}
      </span>
      <Avatar name={entry.name} url={entry.avatarUrl} size="md" frame={displayedFrame(entry)} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${rankNameClass(entry.points)}`}>
          {entry.name}
          <span className="ml-1 inline-flex align-middle">
            <NameEmblems id={entry.id} className="h-4 w-4" />
          </span>
          {isMe &&<span className="ml-1.5 rounded-full bg-olo-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-olo-700 dark:bg-olo-500/20 dark:text-olo-300">Tú</span>}
        </p>
        <LegendTitle id={entry.id} />
        {badges.length > 0 && (
          <div className="mt-1 flex gap-1">
            <span className="sr-only">Mejores insignias: {badges.map((p) => `${p.badge.name} nivel ${p.level}`).join(', ')}</span>
            {badges.map((p) => (
              <BadgeEmblem key={p.badge.id} badge={p.badge} level={p.level} size="sm" />
            ))}
          </div>
        )}
      </div>
      <Points value={entry.points} />
    </Link>
  );
}
