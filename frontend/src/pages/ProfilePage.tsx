import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BADGES, earnedBadges, type PlayerProfile } from '@laf/shared';
import { Avatar, BadgeCard, PointsHelpModal } from '../components/game';
import { BackButton, ErrorState, Spinner, UnavailableState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage, isNotAvailable } from '../lib/errors';
import { formatDate } from '../lib/format';
import { haptics } from '../lib/haptics';
import { gameService } from '../services/game';

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
  const [uploading, setUploading] = useState(false);
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

  const earned = earnedBadges(profile.stats);
  const earnedIds = new Set(earned.map((b) => b.id));
  const locked = BADGES.filter((b) => !earnedIds.has(b.id));

  return (
    <div className="mx-auto max-w-3xl">
      {!isMe && <BackButton />}

      {/* Cabecera: foto, nombre y puntos */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-olo-500/20 via-olo-400/10 to-transparent dark:from-olo-500/25" aria-hidden />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
          <div className="relative">
            <Avatar name={profile.name} url={profile.avatarUrl} size="lg" className="ring-4 ring-white shadow-elevated dark:ring-olo-dark-900" />
            {isMe && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-olo-600 text-white shadow-glow ring-4 ring-white transition hover:bg-olo-700 active:scale-90 disabled:opacity-60 dark:bg-olo-500 dark:text-slate-950 dark:ring-olo-dark-900"
                  aria-label={profile.avatarUrl ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
                >
                  {uploading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
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

          <div className="min-w-0 flex-1">
            <h1 className="page-title break-words">{profile.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {profile.role === 'ADMIN' ? 'Administrador' : 'Colaborador'} · En OLO desde {formatDate(profile.createdAt)}
            </p>
            {isMe && profile.avatarUrl && (
              <button type="button" onClick={() => void removePhoto()} disabled={uploading} className="mt-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-slate-400">
                Quitar foto
              </button>
            )}
          </div>

          <div className="flex flex-col items-center sm:items-end">
            <p className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums text-olo-700 dark:text-olo-300">{profile.points.toLocaleString('es')}</span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">puntos</span>
            </p>
            <Link to="/ranking" className="mt-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
              {profile.rank ? `#${profile.rank} en el ranking` : 'Aún sin puesto en el ranking'}
            </Link>
            <button type="button" onClick={() => setHelp(true)} className="mt-2 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-olo-700 dark:text-slate-400 dark:hover:text-olo-300">
              ¿Cómo ganar puntos?
            </button>
          </div>
        </div>
      </section>

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
        <h2 id="badges-title" className="mb-3 flex items-baseline gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
          Insignias
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {earned.length}/{BADGES.length}
          </span>
        </h2>
        {earned.length === 0 && !isMe ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-olo-dark-800 dark:text-slate-400">
            Todavía no tiene insignias.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {earned.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
            {/* En el perfil propio también se ven las que faltan, como objetivo. */}
            {isMe && locked.map((b) => <BadgeCard key={b.id} badge={b} locked />)}
          </ul>
        )}
      </section>

      <div className="mt-6 flex justify-center">
        <Link to="/ranking" className="btn-secondary">
          Ver ranking
        </Link>
      </div>

      <PointsHelpModal open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
