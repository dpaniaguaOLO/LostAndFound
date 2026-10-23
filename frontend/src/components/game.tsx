import { useEffect, useState } from 'react';
import { BADGE_TIER_LABEL, POINT_RULES, type Badge, type BadgeTier } from '@laf/shared';
import { Modal } from './ui';

const AVATAR_SIZES = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-lg',
  lg: 'h-24 w-24 text-4xl sm:h-28 sm:w-28',
} as const;

/** Foto de perfil, o la inicial del nombre si no hay foto (o no carga). */
export function Avatar({
  name,
  url,
  size = 'sm',
  className = '',
}: {
  name: string;
  url?: string | null;
  size?: keyof typeof AVATAR_SIZES | string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const box = AVATAR_SIZES[size as keyof typeof AVATAR_SIZES] ?? size;
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className={`shrink-0 rounded-full bg-slate-100 object-cover dark:bg-olo-dark-850 ${box} ${className}`}
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-olo-700 to-olo-800 font-bold text-white ${box} ${className}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

const TIER_STYLES: Record<BadgeTier, string> = {
  common: 'from-slate-50 to-slate-200 ring-slate-300 dark:from-slate-700 dark:to-slate-800 dark:ring-slate-500',
  rare: 'from-amber-50 to-orange-200 ring-orange-300 dark:from-orange-500/30 dark:to-orange-700/40 dark:ring-orange-400/70',
  epic: 'from-fuchsia-50 to-purple-200 ring-purple-400 dark:from-purple-500/30 dark:to-fuchsia-700/40 dark:ring-purple-400/80',
  legendary: 'from-cyan-100 via-amber-100 to-pink-200 ring-amber-400 dark:from-cyan-500/30 dark:via-amber-500/30 dark:to-pink-500/30 dark:ring-amber-300',
};

const TIER_TEXT: Record<BadgeTier, string> = {
  common: 'text-slate-500 dark:text-slate-400',
  rare: 'text-orange-700 dark:text-orange-300',
  epic: 'text-purple-700 dark:text-purple-300',
  legendary: 'text-amber-700 dark:text-amber-300',
};

const MEDAL_SIZES = { sm: 'h-7 w-7 text-sm ring-1', md: 'h-14 w-14 text-2xl ring-2' } as const;

/** Medalla de una insignia: emoji sobre un fondo con el color de su rareza. */
export function BadgeMedal({ badge, size = 'md', locked = false }: { badge: Badge; size?: keyof typeof MEDAL_SIZES; locked?: boolean }) {
  return (
    <span
      className={
        `flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ${MEDAL_SIZES[size]} ` +
        (locked ? 'from-slate-100 to-slate-100 ring-slate-200 grayscale opacity-40 dark:from-olo-dark-850 dark:to-olo-dark-850 dark:ring-olo-dark-700' : TIER_STYLES[badge.tier])
      }
      title={size === 'sm' ? badge.name : undefined}
      aria-hidden
    >
      {badge.emoji}
    </span>
  );
}

/** Tarjeta de insignia (perfil): medalla, nombre, rareza y cómo se consigue. */
export function BadgeCard({ badge, locked = false }: { badge: Badge; locked?: boolean }) {
  return (
    <li className={'card flex items-center gap-3 p-3 ' + (locked ? 'opacity-80' : '')}>
      <BadgeMedal badge={badge} locked={locked} />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
          {badge.name}
          {locked && <span className="sr-only"> (bloqueada)</span>}
        </p>
        <p className={`text-[11px] font-bold uppercase tracking-wide ${locked ? 'text-slate-400 dark:text-slate-500' : TIER_TEXT[badge.tier]}`}>
          {BADGE_TIER_LABEL[badge.tier]}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{badge.description}</p>
      </div>
    </li>
  );
}

/** Ventana "¿Cómo ganar puntos?" con las reglas vigentes (POINT_RULES). */
export function PointsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} label="Cómo ganar puntos" onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">¿Cómo ganar puntos?</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Los puntos premian que los objetos vuelvan a su dueño. Se calculan solos a partir de tus publicaciones.
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {POINT_RULES.map((r) => (
          <li key={r.key} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-olo-dark-850">
            <span className="shrink-0 rounded-xl bg-olo-100 px-2.5 py-1 text-sm font-extrabold text-olo-700 dark:bg-olo-500/15 dark:text-olo-300">
              +{r.points}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.title}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{r.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Publicar un objeto no da puntos por sí solo, y si un administrador archiva una publicación, sus puntos se descuentan.
      </p>
      <button className="btn-primary mt-5 w-full" onClick={onClose}>
        Entendido
      </button>
    </Modal>
  );
}
