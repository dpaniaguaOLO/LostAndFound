import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BADGES, badgeCollection, displayedFrame, rankFor, showcaseBadges, type PlayerProfile } from '@laf/shared';
import {
  Avatar,
  BadgeCollectionModal,
  BadgeShowcase,
  FrameModal,
  LegendTitle,
  NameEmblems,
  PointsHelpModal,
  RankProgress,
  RanksModal,
  rankNameClass,
} from '../components/game';
import { BackButton, ErrorState, Spinner, UnavailableState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage, isNotAvailable } from '../lib/errors';
import { formatDate } from '../lib/format';
import { haptics } from '../lib/haptics';
import { gameService, refreshMyPlayer } from '../services/game';

/** Fondo de la cabecera del perfil según el rango (Maestro y Gran Maestro, especiales). */
const BANNERS: Record<string, string> = {
  default: 'from-olo-500 via-olo-600 to-emerald-800',
  gran_maestro: 'from-cyan-400 via-violet-500 to-fuchsia-500',
  maestro: 'from-rose-500 via-red-600 to-amber-500',
};

/** Botones secundarios pequeños de la cabecera (personalizar marco, quitar foto). */
const PILL =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-olo-dark-700 dark:bg-olo-dark-850 dark:text-slate-200 dark:hover:bg-olo-dark-800';

/** Perfil de un colaborador: foto, puntos, puesto en el ranking e insignias. `/perfil` = el propio. */
export function ProfilePage() {
  const { id } = useParams();
  const { user, updateUser } = useAuth();
  const { notify } = useToast();
  const userId = id ?? user?.id ?? '';
  const isMe = userId === user?.id;

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [help, setHelp] = useState(false);
  // Colección de insignias: null = cerrada; '' = lista completa; id = detalle de una.
  const [badgeView, setBadgeView] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ranksOpen, setRanksOpen] = useState(false);
  const [framePicker, setFramePicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    setError(null);
    gameService
      .profile(userId)
      .then(setProfile)
      .catch(setError)
      .finally(() => setLoading(false));
  }
  useEffect(load, [userId]);

  async function changePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const avatarUrl = await gameService.setAvatar(file);
      updateUser({ avatarUrl });
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
      haptics.success();
      notify('Foto de perfil actualizada', 'success');
    } catch (err) {
      haptics.error();
      notify(getErrorMessage(err, 'No se pudo cambiar la foto'), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    setUploading(true);
    try {
      await gameService.removeAvatar();
      updateUser({ avatarUrl: null });
      setProfile((p) => (p ? { ...p, avatarUrl: null } : p));
      notify('Foto de perfil eliminada', 'success');
    } catch (err) {
      notify(getErrorMessage(err, 'No se pudo quitar la foto'), 'error');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <Spinner label="Cargando perfil…" />;
  if (error) {
    return isNotAvailable(error) ? (
      <UnavailableState message="Este perfil no está disponible: el colaborador no existe o su cuenta está desactivada." />
    ) : (
      <ErrorState message={getErrorMessage(error, 'Error al cargar el perfil')} onRetry={load} />
    );
  }
  if (!profile) return null;

  const showcase = showcaseBadges(profile.stats);
  const frame = displayedFrame(profile);
  const rank = rankFor(profile.points);
  const totalLevels = BADGES.reduce((n, b) => n + b.levels.length, 0);
  const levels = badgeCollection(profile.stats).reduce((n, p) => n + p.level, 0);

  return (
    <div className="mx-auto max-w-3xl">
      {!isMe && <BackButton />}

      {/* Cabecera: fondo (especial desde Maestro), foto con marco, nombre y puntos */}
      <section className="card overflow-hidden">
        <div className={`relative h-28 bg-gradient-to-br sm:h-32 ${BANNERS[rank.id] ?? BANNERS.default}`} aria-hidden>
          {/* Textura sutil de puntos sobre el degradado */}
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:14px_14px]" />
          <span className="absolute right-3 top-3 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">
            Rango {rank.name}
          </span>
        </div>

        <div className="px-5 pb-5 sm:px-7 sm:pb-6">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:gap-5 sm:text-left">
            {/* Foto (sube sobre el fondo) */}
            <div className="relative -mt-14 shrink-0 sm:-mt-16">
              <span className="block rounded-full bg-white p-1 shadow-elevated dark:bg-olo-dark-900">
                <Avatar name={profile.name} url={profile.avatarUrl} size="lg" frame={frame} />
              </span>
              {isMe && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-olo-600 text-white shadow-glow ring-4 ring-white transition hover:bg-olo-700 active:scale-90 disabled:opacity-60 dark:bg-olo-500 dark:text-slate-950 dark:ring-olo-dark-900"
                    aria-label={profile.avatarUrl ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
                  >
                    {uploading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                        <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => void changePhoto(e.target.files?.[0])}
                  />
                </>
              )}
            </div>

            {/* Nombre */}
            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className={`inline-flex max-w-full items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${rankNameClass(profile.points)}`}>
                <span className="break-words">{profile.name}</span>
                <NameEmblems id={profile.id} className="h-7 w-7" />
              </h1>
              <LegendTitle id={profile.id} className="text-sm" />
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {profile.role === 'ADMIN' ? 'Administrador' : 'Colaborador'} · En OLO desde {formatDate(profile.createdAt)}
              </p>
            </div>

            {/* Puntos */}
            <div className="flex shrink-0 flex-col items-center rounded-2xl bg-olo-50 px-5 py-3 dark:bg-olo-500/10 sm:mt-5 sm:items-end">
              <p className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold tabular-nums text-olo-700 dark:text-olo-300">{profile.points.toLocaleString('es')}</span>
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">puntos</span>
              </p>
              <Link to="/ranking" className="mt-0.5 text-xs font-bold text-amber-700 hover:underline dark:text-amber-300">
                {profile.rank ? `#${profile.rank} en el ranking` : 'Aún sin puesto en el ranking'}
              </Link>
            </div>
          </div>

          {/* Acciones (perfil propio) y ayuda */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 pt-4 dark:border-olo-dark-800 sm:justify-between">
            {isMe ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => setFramePicker(true)} className={PILL}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
                  </svg>
                  Personalizar marco
                </button>
                {profile.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => void removePhoto()}
                    disabled={uploading}
                    className={`${PILL} hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 7h14M10 11v6m4-6v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Quitar foto
                  </button>
                )}
              </div>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => setHelp(true)} className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-olo-700 hover:underline dark:text-slate-400 dark:hover:text-olo-300">
              ¿Cómo ganar puntos?
            </button>
          </div>
        </div>
      </section>

      <RankProgress points={profile.points} onShowRanks={() => setRanksOpen(true)} />

      {/* Estadísticas */}
      <dl className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          ['Devueltos', profile.stats.returned],
          ['Entregas rápidas', profile.stats.fastReturned],
          ['Publicados', profile.stats.published],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse rounded-2xl border border-slate-200/80 bg-white px-3 py-3 text-center dark:border-olo-dark-800 dark:bg-olo-dark-900">
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Insignias */}
      <section className="mt-6" aria-labelledby="badges-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="badges-title" className="flex items-baseline gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            Insignias
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400" title="Niveles conseguidos">
              {levels}/{totalLevels}
            </span>
          </h2>
          <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => setBadgeView('')}>
            Ver colección
          </button>
        </div>
        {showcase.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-olo-dark-800 dark:text-slate-400">
            {isMe ? 'Aún no tienes insignias. Publica o devuelve un objeto encontrado para conseguir la primera.' : 'Todavía no tiene insignias.'}
          </p>
        ) : (
          <BadgeShowcase items={showcase} onSelect={setBadgeView} />
        )}
      </section>

      <BadgeCollectionModal
        open={badgeView !== null}
        onClose={() => setBadgeView(null)}
        stats={profile.stats}
        focus={badgeView || null}
        ownerName={isMe ? null : profile.name}
      />

      <div className="mt-6 flex justify-center">
        <Link to="/ranking" className="btn-secondary">
          Ver ranking
        </Link>
      </div>

      <PointsHelpModal open={help} onClose={() => setHelp(false)} />
      <RanksModal open={ranksOpen} onClose={() => setRanksOpen(false)} points={profile.points} />
      {isMe && (
        <FrameModal
          open={framePicker}
          onClose={() => setFramePicker(false)}
          player={profile}
          onSaved={(equippedFrame) => {
            setProfile((p) => (p ? { ...p, equippedFrame } : p));
            notify('Marco actualizado', 'success');
            void refreshMyPlayer(); // la cabecera usa el perfil propio
          }}
        />
      )}
    </div>
  );
}
