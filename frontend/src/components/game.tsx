import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BADGE_FRAMES,
  badgeCollection,
  badgeProgress,
  BADGES,
  POINT_RULES,
  type BadgeDef,
  type BadgeProgress,
  type PlayerStats,
} from '@laf/shared';
import { useAuth } from '../context/AuthContext';
import { topPlayerIds } from '../services/game';
import { Modal } from './ui';

// --- Avatar --------------------------------------------------------------------

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

// --- Top del ranking: emblema y nombre enlazado al perfil -----------------------

/** Puesto (1..TOP_PLAYERS) de un usuario en el top del ranking, o null. */
export function useTopRank(userId: string | undefined): number | null {
  const [top, setTop] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void topPlayerIds().then((ids) => active && setTop(ids));
    return () => {
      active = false;
    };
  }, []);
  const i = userId ? top.indexOf(userId) : -1;
  return i >= 0 ? i + 1 : null;
}

const RANK_EMBLEM = {
  1: { from: '#fde68a', to: '#d97706', text: '#78350f', label: 'Nº 1 del ranking' },
  2: { from: '#f1f5f9', to: '#94a3b8', text: '#1e293b', label: 'Nº 2 del ranking' },
  3: { from: '#fed7aa', to: '#c2410c', text: '#431407', label: 'Nº 3 del ranking' },
} as const;

/** Emblema del puesto (solo top 3): escudo con corona en oro, plata o bronce. */
export function RankEmblem({ rank, className = 'h-5 w-5' }: { rank: number | null; className?: string }) {
  const gid = useId();
  if (!rank || !(rank in RANK_EMBLEM)) return null;
  const e = RANK_EMBLEM[rank as 1 | 2 | 3];
  return (
    <svg viewBox="0 0 24 26" className={`inline-block shrink-0 drop-shadow-sm ${className}`} role="img" aria-label={e.label}>
      <title>{e.label}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={e.from} />
          <stop offset="1" stopColor={e.to} />
        </linearGradient>
      </defs>
      <path d="M12 3.5 20.5 7v6.5c0 5-3.6 9.2-8.5 10.9C7.1 22.7 3.5 18.5 3.5 13.5V7L12 3.5Z" fill={`url(#${gid})`} stroke={e.to} strokeWidth="1" />
      <path d="m7.5 4.2 1.6-2.7 2.9 2 2.9-2 1.6 2.7" fill="none" stroke={e.to} strokeWidth="1.3" strokeLinejoin="round" />
      <text x="12" y="17.6" textAnchor="middle" fontSize="10" fontWeight="800" fill={e.text}>
        {rank}
      </text>
    </svg>
  );
}

/**
 * Nombre de un colaborador enlazado a su perfil, con el emblema si está en el
 * top 3. No usar dentro de otro enlace (los <a> no se anidan).
 */
export function PlayerName({ id, name, className = '' }: { id: string | undefined; name: string; className?: string }) {
  const { user } = useAuth();
  const rank = useTopRank(id);
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      to={id === user?.id ? '/perfil' : `/perfil/${id}`}
      className={`inline-flex max-w-full items-center gap-1 font-semibold text-olo-700 underline-offset-2 hover:underline dark:text-olo-300 ${className}`}
    >
      <span className="truncate">{name}</span>
      <RankEmblem rank={rank} className="h-[1.1em] w-[1.1em]" />
    </Link>
  );
}

// --- Insignias por niveles (al estilo del perfil de Clash Royale) ----------------

/** Degradado del marco por nivel (índice = nivel - 1; ver BADGE_FRAMES). */
const FRAME_STYLES = [
  'from-amber-700 via-orange-300 to-amber-800', // Bronce
  'from-slate-400 via-white to-slate-500', // Plata
  'from-yellow-500 via-amber-100 to-yellow-600', // Oro
  'from-emerald-600 via-green-200 to-emerald-700', // Esmeralda
  'from-blue-600 via-sky-200 to-indigo-700', // Zafiro
  'from-red-700 via-rose-300 to-red-800', // Rubí
  'from-fuchsia-500 via-amber-200 to-cyan-400', // Leyenda
];
const FRAME_TEXT = [
  'text-amber-950', 'text-slate-900', 'text-yellow-950', 'text-emerald-950', 'text-indigo-950', 'text-red-950', 'text-fuchsia-950',
];
const HEX = { clipPath: 'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' };

const EMBLEM_SIZES = {
  sm: { box: 'h-8 w-7', inset: 'inset-[2px]', emoji: 'text-sm', pill: '' },
  md: { box: 'h-[4.5rem] w-16', inset: 'inset-[4px]', emoji: 'text-3xl', pill: 'text-[11px] px-2 -bottom-2' },
  lg: { box: 'h-28 w-24', inset: 'inset-[6px]', emoji: 'text-5xl', pill: 'text-sm px-3 -bottom-3' },
} as const;

/**
 * Insignia hexagonal: el marco mejora con cada nivel (bronce → … → leyenda) y
 * lleva el número de nivel debajo, como las insignias del perfil de Clash Royale.
 */
export function BadgeEmblem({ badge, level, size = 'md' }: { badge: BadgeDef; level: number; size?: keyof typeof EMBLEM_SIZES }) {
  const s = EMBLEM_SIZES[size];
  const locked = level <= 0;
  const frame = FRAME_STYLES[Math.min(level, FRAME_STYLES.length) - 1];
  const maxed = level >= badge.levels.length;
  return (
    <span className={`relative inline-flex shrink-0 ${s.box}`} aria-hidden>
      {maxed && !locked && size !== 'sm' && (
        <span className="absolute -inset-1.5 animate-pulse rounded-full bg-amber-300/30 blur-md dark:bg-amber-300/20" />
      )}
      <span
        className={`absolute inset-0 bg-gradient-to-br ${locked ? 'from-slate-300 to-slate-400 dark:from-olo-dark-700 dark:to-olo-dark-800' : frame}`}
        style={HEX}
      />
      <span
        className={`absolute ${s.inset} flex items-center justify-center bg-gradient-to-b ${locked ? 'from-slate-100 to-slate-200 dark:from-olo-dark-850 dark:to-olo-dark-900' : 'from-slate-700 to-slate-900'}`}
        style={HEX}
      >
        <span className={`${s.emoji} ${locked ? 'opacity-30 grayscale' : ''}`}>{badge.emoji}</span>
      </span>
      {size !== 'sm' && !locked && (
        <span
          className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-br font-extrabold shadow ring-1 ring-black/10 ${frame} ${FRAME_TEXT[level - 1] ?? ''} ${s.pill}`}
        >
          {level}
        </span>
      )}
    </span>
  );
}

/** Barra de progreso hacia el siguiente nivel. */
function ProgressBar({ p }: { p: BadgeProgress }) {
  const prev = p.level > 0 ? p.badge.levels[p.level - 1] : 0;
  const pct = p.maxed ? 100 : Math.round(((p.value - prev) / ((p.next ?? 1) - prev)) * 100);
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-olo-dark-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`h-full rounded-full ${p.maxed ? 'bg-gradient-to-r from-amber-400 to-fuchsia-500' : 'bg-olo-500'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
    </div>
  );
}

function levelLabel(p: BadgeProgress): string {
  if (p.level === 0) return 'Bloqueada';
  return `Nivel ${p.level} · ${BADGE_FRAMES[p.level - 1]}${p.maxed ? ' · Máximo' : ''}`;
}

/** Escaparate del perfil: hasta 8 insignias, las de mayor nivel primero. */
export function BadgeShowcase({ items, onSelect }: { items: BadgeProgress[]; onSelect: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-4 gap-x-2 gap-y-6 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 px-3 pb-7 pt-5 shadow-inner sm:gap-x-4 sm:px-5">
      {items.map((p) => (
        <li key={p.badge.id} className="flex justify-center">
          <button
            type="button"
            onClick={() => onSelect(p.badge.id)}
            className="flex flex-col items-center gap-3 rounded-xl p-1 transition hover:scale-105 active:scale-95"
            aria-label={`${p.badge.name}: ${levelLabel(p)}`}
          >
            <BadgeEmblem badge={p.badge} level={p.level} />
            <span className="line-clamp-2 max-w-[5.5rem] text-center text-[11px] font-semibold leading-tight text-slate-200">{p.badge.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Colección completa (todas las insignias con su progreso) y detalle de una
 * insignia con todos sus niveles. `focus` abre directamente el detalle.
 */
export function BadgeCollectionModal({
  open,
  onClose,
  stats,
  focus,
  ownerName,
}: {
  open: boolean;
  onClose: () => void;
  stats: PlayerStats;
  focus: string | null;
  /** Nombre del dueño del perfil, o null si es el propio. */
  ownerName: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(focus);
  useEffect(() => setSelected(focus), [focus, open]);
  const def = BADGES.find((b) => b.id === selected);

  return (
    <Modal open={open} label={def ? `Insignia ${def.name}` : 'Colección de insignias'} onClose={onClose}>
      {def ? <BadgeDetail p={badgeProgress(def, stats)} ownerName={ownerName} onBack={() => setSelected(null)} /> : (
        <>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Colección de insignias</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Cada insignia sube de nivel y mejora su marco: {BADGE_FRAMES.join(', ').toLowerCase()}.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {badgeCollection(stats).map((p) => (
              <li key={p.badge.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p.badge.id)}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-olo-dark-850"
                >
                  <BadgeEmblem badge={p.badge} level={p.level} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{p.badge.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.level}/{p.badge.levels.length}
                      </span>
                    </span>
                    <ProgressBar p={p} />
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      {p.maxed ? '¡Nivel máximo!' : `${p.value}/${p.next} · ${p.badge.goal(p.next!)}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn-secondary mt-5 w-full" onClick={onClose}>
            Cerrar
          </button>
        </>
      )}
    </Modal>
  );
}

function BadgeDetail({ p, ownerName, onBack }: { p: BadgeProgress; ownerName: string | null; onBack: () => void }) {
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 px-10 pb-8 pt-5">
          <BadgeEmblem badge={p.badge} level={p.level} size="lg" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-slate-50">{p.badge.name}</h2>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{levelLabel(p)}</p>
        <div className="mt-3 w-full max-w-xs">
          <ProgressBar p={p} />
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            {p.maxed
              ? ownerName ? `${ownerName} alcanzó el nivel máximo` : 'Has alcanzado el nivel máximo'
              : `${p.value}/${p.next} para el nivel ${p.level + 1}: ${p.badge.goal(p.next!).toLowerCase()}`}
          </p>
        </div>
      </div>
      <ol className="mt-5 flex flex-col gap-1.5">
        {p.badge.levels.map((t, i) => {
          const done = p.level > i;
          return (
            <li
              key={t}
              className={
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm ' +
                (done ? 'bg-olo-50 text-slate-800 dark:bg-olo-500/10 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400')
              }
            >
              <span className={`h-3 w-3 shrink-0 rounded-full bg-gradient-to-br ${FRAME_STYLES[i]} ${done ? '' : 'opacity-40'}`} aria-hidden />
              <span className="w-24 shrink-0 font-semibold">
                Nivel {i + 1} <span className="sr-only">({BADGE_FRAMES[i]})</span>
              </span>
              <span className="flex-1">{p.badge.goal(t)}</span>
              {done && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-olo-600 dark:text-olo-400" role="img" aria-label="conseguido">
                  <path d="m6 12.5 4 4L18 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
      <button className="btn-secondary mt-5 w-full" onClick={onBack}>
        Ver toda la colección
      </button>
    </div>
  );
}

// --- Ayuda de puntos -------------------------------------------------------------

/** Ventana "¿Cómo ganar puntos?" con las reglas vigentes (POINT_RULES) y las ventajas del top 3. */
export function PointsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} label="Cómo ganar puntos" onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">¿Cómo ganar puntos?</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Los puntos premian a quien encuentra objetos y los devuelve. Se calculan solos a partir de tus publicaciones.
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
      <div className="mt-4 rounded-2xl bg-amber-50 p-3.5 dark:bg-amber-500/10">
        <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
          <RankEmblem rank={1} /> Ventajas del top 3
        </p>
        <ul className="mt-1.5 list-disc pl-5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          <li>Tus objetos perdidos aparecen primero en el muro.</li>
          <li>Un emblema con tu puesto junto a tu nombre en toda la app.</li>
        </ul>
      </div>
      <button className="btn-primary mt-5 w-full" onClick={onClose}>
        Entendido
      </button>
    </Modal>
  );
}
