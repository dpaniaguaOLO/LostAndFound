import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import {
  CATEGORY_LABELS,
  FOUND_STATUS_LABELS,
  LOST_STATUS_LABELS,
  formatDate,
} from '../lib/format';
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
        {date}
      </span>
    </div>
  );
}

/** Tarjeta para un objeto encontrado (con enlace al detalle). */
export function FoundItemCard({ item }: { item: FoundItem }) {
  return (
    <Link to={`/objetos/${item.id}`} className="card-interactive group flex flex-col overflow-hidden">
      <div className="relative">
        <ItemImage src={item.imageUrl} alt={item.title} />
        <div className="absolute left-3 top-3">
          <span className="rounded-full bg-white/90 shadow-card backdrop-blur dark:bg-olo-dark-900/90">
            <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900 transition-colors group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-300">
          {item.title}
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
        <CardMeta category={CATEGORY_LABELS[item.category]} location={item.location} date={formatDate(item.foundAt)} />
      </div>
    </Link>
  );
}

/**
 * Tarjeta para un reporte de objeto perdido (enlaza a su detalle).
 * `embedded`: sin contenedor `card` ni enlace propio, para insertarla dentro de
 * otra tarjeta que ya enlaza (p. ej. "Mis objetos").
 */
export function LostReportCard({ item, embedded = false }: { item: LostReport; embedded?: boolean }) {
  const body = <LostReportCardBody item={item} />;
  if (embedded) return <div className="group flex flex-col overflow-hidden">{body}</div>;
  return (
    <Link to={`/perdidos/${item.id}`} className="card-interactive group flex flex-col overflow-hidden">
      {body}
    </Link>
  );
}

function LostReportCardBody({ item }: { item: LostReport }) {
  return (
    <>
      <div className="relative">
        <ItemImage src={item.imageUrl} alt={item.title} />
        <div className="absolute left-3 top-3">
          <span className="rounded-full bg-white/90 shadow-card backdrop-blur dark:bg-olo-dark-900/90">
            <StatusBadge status={item.status} label={LOST_STATUS_LABELS[item.status]} />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900 transition-colors group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-300">
          {item.title}
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
        <CardMeta category={CATEGORY_LABELS[item.category]} location={item.location} date={formatDate(item.lostAt)} />
      </div>
    </>
  );
}
