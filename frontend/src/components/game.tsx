import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BADGE_FRAMES,
  badgeCollection,
  badgeProgress,
  BADGES,
  POINT_RULES,
  ULTIMATE_BADGE,
  type BadgeDef,
  type BadgeProgress,
  type PlayerStats,
} from '@laf/shared';
import { useAuth } from '../context/AuthContext';
import { adminIds, legendIds, topPlayerIds } from '../services/game';
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

/** ¿Es administrador? (para el emblema junto al nombre). */
export function useIsAdmin(userId: string | undefined): boolean {
  const [admins, setAdmins] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void adminIds().then((ids) => active && setAdmins(ids));
    return () => {
      active = false;
    };
  }, []);
  return !!userId && admins.includes(userId);
}

/**
 * Emblema de administrador (como la insignia de creador de contenido de Clash
 * Royale): sello verde OLO con una estrella.
 */
export function AdminEmblem({ className = 'h-5 w-5' }: { className?: string }) {
  const gid = useId();
  const label = 'Administrador de Lost & Found';
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 drop-shadow-sm ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="0.5" stopColor="#00a785" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      {/* Sello de 8 puntas */}
      <path
        d="M12 1.5l2.6 2.1 3.3-.4.9 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-.9 3.2-3.3-.4L12 22.5l-2.6-2.1-3.3.4-.9-3.2-3-1.5 1.2-3.1-1.2-3.1 3-1.5.9-3.2 3.3.4L12 1.5Z"
        fill={`url(#${gid})`}
        stroke="#065f46"
        strokeWidth="0.8"
      />
      <path d="m12 6.8 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L12 6.8Z" fill="#fff" />
    </svg>
  );
}

/** ¿Tiene la insignia definitiva (Leyenda de OLO)? */
export function useIsLegend(userId: string | undefined): boolean {
  const [legends, setLegends] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void legendIds().then((ids) => active && setLegends(ids));
    return () => {
      active = false;
    };
  }, []);
  return !!userId && legends.includes(userId);
}

/** Emblema de Leyenda de OLO: hexágono arcoíris con corona. */
export function LegendEmblem({ className = 'h-5 w-5' }: { className?: string }) {
  const gid = useId();
  const label = 'Leyenda de OLO: todas las insignias al máximo';
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 drop-shadow-[0_0_3px_rgba(250,204,21,0.8)] ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="0.35" stopColor="#facc15" />
          <stop offset="0.65" stopColor="#34d399" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path d="M12 1.5 21.1 6.8v10.4L12 22.5l-9.1-5.3V6.8L12 1.5Z" fill={`url(#${gid})`} />
      <path d="M12 4.2 18.8 8.1v7.8L12 19.8l-6.8-3.9V8.1L12 4.2Z" fill="#1e1b4b" />
      <path d="M7.5 15.2h9l.8-6-3 2.2L12 7.5l-2.3 3.9-3-2.2.8 6Z" fill="#facc15" stroke="#fde68a" strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Emblemas junto a un nombre: administrador, Leyenda de OLO y puesto del top 3 (pueden salir todos). */
export function NameEmblems({ id, className = 'h-[1.1em] w-[1.1em]' }: { id: string | undefined; className?: string }) {
  const admin = useIsAdmin(id);
  const legend = useIsLegend(id);
  const rank = useTopRank(id);
  if (!admin && !legend && !rank) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {admin && <AdminEmblem className={className} />}
      {legend && <LegendEmblem className={className} />}
      <RankEmblem rank={rank} className={className} />
    </span>
  );
}

/**
 * Nombre de un colaborador enlazado a su perfil, con sus emblemas (admin, top 3).
 * No usar dentro de otro enlace (los <a> no se anidan).
 */
export function PlayerName({ id, name, className = '' }: { id: string | undefined; name: string; className?: string }) {
  const { user } = useAuth();
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      to={id === user?.id ? '/perfil' : `/perfil/${id}`}
      className={`inline-flex max-w-full items-center gap-1 font-semibold text-olo-700 underline-offset-2 hover:underline dark:text-olo-300 ${className}`}
    >
      <span className="truncate">{name}</span>
      <NameEmblems id={id} />
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
  if (badge === ULTIMATE_BADGE) return <UltimateEmblem level={level} size={size} />;
  const s = EMBLEM_SIZES[size];
  const locked = level <= 0;
  const milestone = isMilestone(badge);
  // Los hitos (un solo nivel) llevan siempre marco de oro y una estrella en vez del nivel.
  const frameIdx = milestone ? 2 : Math.min(level, FRAME_STYLES.length) - 1;
  const frame = FRAME_STYLES[frameIdx];
  const maxed = !milestone && level >= badge.levels.length;
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
          className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-br font-extrabold shadow ring-1 ring-black/10 ${frame} ${FRAME_TEXT[frameIdx] ?? ''} ${s.pill}`}
        >
          {milestone ? '★' : level}
        </span>
      )}
    </span>
  );
}

const RAINBOW = 'conic-gradient(from 0deg, #f472b6, #facc15, #34d399, #38bdf8, #a78bfa, #f472b6)';

/**
 * Insignia definitiva (todas las demás al máximo): marco arcoíris giratorio,
 * halo dorado, destellos y cinta "LEYENDA". Bloqueada, se ve como silueta.
 */
function UltimateEmblem({ level, size }: { level: number; size: keyof typeof EMBLEM_SIZES }) {
  const s = EMBLEM_SIZES[size];
  const locked = level <= 0;
  const big = size !== 'sm';
  return (
    <span className={`relative inline-flex shrink-0 ${s.box}`} aria-hidden>
      {!locked && big && (
        <>
          <span className="absolute -inset-3 animate-pulse rounded-full bg-gradient-to-r from-amber-300/50 via-fuchsia-400/40 to-sky-300/50 blur-xl motion-reduce:animate-none" />
          <span className="absolute -right-1 -top-1 animate-ping text-xs text-amber-300 motion-reduce:animate-none">✦</span>
          <span className="absolute -left-1.5 bottom-3 animate-ping text-[10px] text-sky-200 [animation-delay:600ms] motion-reduce:animate-none">✦</span>
        </>
      )}
      <span className="absolute inset-0 overflow-hidden" style={HEX}>
        {locked ? (
          <span className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-400 dark:from-olo-dark-700 dark:to-olo-dark-800" />
        ) : (
          <span className="absolute -inset-1/2 animate-[spin_4s_linear_infinite] motion-reduce:animate-none" style={{ background: RAINBOW }} />
        )}
      </span>
      <span
        className={`absolute ${s.inset} flex items-center justify-center bg-gradient-to-b ${locked ? 'from-slate-100 to-slate-200 dark:from-olo-dark-850 dark:to-olo-dark-900' : 'from-indigo-950 via-purple-950 to-slate-950'}`}
        style={HEX}
      >
        <span className={`${s.emoji} ${locked ? 'opacity-30 grayscale' : 'drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]'}`}>{ULTIMATE_BADGE.emoji}</span>
      </span>
      {big && !locked && (
        <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-400 font-black tracking-wider text-amber-950 shadow-lg ring-1 ring-amber-600/40 ${s.pill}`}>
          LEYENDA
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

/** Insignia de un solo nivel (hito): se consigue una vez y no sube de nivel. */
const isMilestone = (b: BadgeDef) => b.levels.length === 1 && b !== ULTIMATE_BADGE;

function levelLabel(p: BadgeProgress): string {
  if (p.badge === ULTIMATE_BADGE) return p.level ? 'Completada · La insignia definitiva' : `Bloqueada · ${p.value}/${p.next} insignias al máximo`;
  if (p.level === 0) return 'Bloqueada';
  if (isMilestone(p.badge)) return 'Hito conseguido';
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
                        {isMilestone(p.badge) ? 'Hito' : `${p.level}/${p.badge.levels.length}`}
                      </span>
                    </span>
                    <ProgressBar p={p} />
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      {isMilestone(p.badge)
                        ? p.level ? '¡Conseguida!' : p.badge.goal(1)
                        : p.maxed ? '¡Nivel máximo!' : `${p.value}/${p.next} · ${p.badge.goal(p.next!)}`}
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
            {isMilestone(p.badge)
              ? p.level ? `Hito: ${p.badge.goal(1).toLowerCase()}. ¡Conseguida!` : `Hito: ${p.badge.goal(1).toLowerCase()}.`
              : p.badge === ULTIMATE_BADGE
                ? p.level
                  ? `${ownerName ?? 'Tú'}: todas las insignias al nivel máximo. ¡Leyenda!`
                  : `${p.value}/${p.next} insignias al nivel máximo. ${p.badge.goal(p.next!)}.`
              : p.maxed
                ? ownerName ? `${ownerName} alcanzó el nivel máximo` : 'Has alcanzado el nivel máximo'
                : `${p.value}/${p.next} para el nivel ${p.level + 1}: ${p.badge.goal(p.next!).toLowerCase()}`}
          </p>
        </div>
      </div>
      <ol className={'mt-5 flex flex-col gap-1.5 ' + (p.badge.levels.length === 1 ? 'hidden' : '')}>
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
