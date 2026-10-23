import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import { useAuth } from '../context/AuthContext';
import {
  CATEGORY_LABELS,
  FOUND_STATUS_LABELS,
  LOST_STATUS_LABELS,
  formatDate,
  formatRelativeDay,
} from '../lib/format';
import { Avatar, NameEmblems, RankEmblem, usePlayerFrame, useTopRank } from './game';
import { ItemImage, StatusBadge } from './ui';

/** Metadatos de la tarjeta: categoría, ubicación y fecha, con iconos. */
function CardMeta({ category, location, date }: { category: string; location: string; date: string }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">
      <span className="badge bg-olo-50 text-olo-700 dark:bg-olo-500/10 dark:text-olo-300">{category}</span>
      {location && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="truncate">{location}</span>
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <time dateTime={date} title={formatDate(date)}>
          {formatRelativeDay(date)}
        </time>
      </span>
    </div>
  );
}

/**
 * Quién lo publicó: foto (con su marco), nombre y emblemas, enlazado a su perfil.
 * Va POR ENCIMA del enlace de la tarjeta (relative z-10): son dos enlaces hermanos,
 * no anidados.
 */
function ReporterLine({ reporter, verb }: { reporter: FoundItem['reporter']; verb: string }) {
  const { user } = useAuth();
  const frame = usePlayerFrame(reporter.id);
  const isMe = reporter.id === user?.id;
  return (
    <div className="relative z-10 flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-olo-dark-800">
      <Link
        to={isMe ? '/perfil' : `/perfil/${reporter.id}`}
        className="flex min-w-0 items-center gap-2 rounded-full pr-2 transition hover:bg-slate-100 dark:hover:bg-olo-dark-850"
        aria-label={`${verb} ${isMe ? 'ti' : reporter.name}. Ver perfil`}
      >
        <Avatar name={reporter.name} url={reporter.avatarUrl} size="h-7 w-7 text-xs" frame={frame} />
        <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400" aria-hidden>
          {verb} <span className="font-semibold text-slate-700 dark:text-slate-200">{isMe ? 'ti' : reporter.name}</span>
        </span>
        <NameEmblems id={reporter.id} className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Contenedor de tarjeta: el título es el enlace al detalle y su ::after cubre toda la tarjeta. */
const CARD = 'card-interactive group relative flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-olo-500/50';
const TITLE_LINK = 'outline-none after:absolute after:inset-0 after:content-[""]';

/**
 * Tarjeta para un objeto encontrado (con enlace al detalle). `showReporter`: quién lo
 * publicó (no hace falta en "Mis objetos").
 */
export function FoundItemCard({ item, showReporter = true }: { item: FoundItem; showReporter?: boolean }) {
  return (
    <div className={CARD}>
      <div className="relative">
        <ItemImage src={item.imageUrl} alt="" />
        <div className="absolute left-3 top-3">
          <span className="flex rounded-full bg-white/90 shadow-card backdrop-blur dark:bg-olo-dark-900/90">
            <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h2 className="text-base line-clamp-1 font-semibold text-slate-900 transition-colors group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-300">
          <Link to={`/objetos/${item.id}`} className={TITLE_LINK}>
            {item.title}
          </Link>
        </h2>
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
        <CardMeta category={CATEGORY_LABELS[item.category]} location={item.location} date={item.foundAt} />
      </div>
      {showReporter && <ReporterLine reporter={item.reporter} verb="Encontrado por" />}
    </div>
  );
}

/**
 * Tarjeta para un reporte de objeto perdido (enlaza a su detalle).
 * `embedded`: sin contenedor `card`, enlace ni autor, para insertarla dentro de
 * otra tarjeta que ya enlaza (p. ej. "Mis objetos").
 */
export function LostReportCard({ item, embedded = false }: { item: LostReport; embedded?: boolean }) {
  if (embedded) {
    return (
      <div className="group flex flex-col overflow-hidden">
        <LostReportCardBody item={item} />
      </div>
    );
  }
  return (
    <div className={CARD + (item.pinned ? ' ring-2 ring-amber-400/80 dark:ring-amber-300/60' : '')}>
      <LostReportCardBody item={item} linkTo={`/perdidos/${item.id}`} />
      <ReporterLine reporter={item.reporter} verb="Lo busca" />
    </div>
  );
}

/** Distintivo de un perdido destacado (su autor está en el top 3 del ranking). */
function PinnedTag({ reporterId }: { reporterId: string }) {
  const rank = useTopRank(reporterId);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2 py-0.5 text-[11px] font-bold text-amber-900 shadow-card backdrop-blur dark:bg-amber-500/25 dark:text-amber-100">
      <RankEmblem rank={rank} className="h-4 w-4" />
      Destacado
    </span>
  );
}

function LostReportCardBody({ item, linkTo }: { item: LostReport; linkTo?: string }) {
  return (
    <>
      <div className="relative">
        <ItemImage src={item.imageUrl} alt="" />
        <div className="absolute left-3 top-3">
          <span className="flex rounded-full bg-white/90 shadow-card backdrop-blur dark:bg-olo-dark-900/90">
            <StatusBadge status={item.status} label={LOST_STATUS_LABELS[item.status]} />
          </span>
        </div>
        {item.pinned && (
          <div className="absolute right-3 top-3">
            <PinnedTag reporterId={item.reporter.id} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h2 className="text-base line-clamp-1 font-semibold text-slate-900 transition-colors group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-300">
          {linkTo ? (
            <Link to={linkTo} className={TITLE_LINK}>
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h2>
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
        <CardMeta category={CATEGORY_LABELS[item.category]} location={item.location} date={item.lostAt} />
      </div>
    </>
  );
}
