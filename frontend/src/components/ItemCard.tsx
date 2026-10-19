import { Link } from 'react-router-dom';
import type { FoundItem, LostReport } from '@laf/shared';
import {
  CATEGORY_LABELS,
  FOUND_STATUS_LABELS,
  LOST_STATUS_LABELS,
  formatDate,
} from '../lib/format';
import { ItemImage, StatusBadge } from './ui';

/** Tarjeta para un objeto encontrado (con enlace al detalle). */
export function FoundItemCard({ item }: { item: FoundItem }) {
  return (
    <Link
      to={`/objetos/${item.id}`}
      className="card group overflow-hidden transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-olo-500"
    >
      <ItemImage src={item.imageUrl} alt={item.title} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-800 group-hover:text-olo-700 dark:text-slate-100 dark:group-hover:text-olo-400">
            {item.title}
          </h3>
          <StatusBadge status={item.status} label={FOUND_STATUS_LABELS[item.status]} />
        </div>
        <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {CATEGORY_LABELS[item.category]}
          </span>
          <span>· {item.location}</span>
          <span>· {formatDate(item.foundAt)}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Tarjeta para un reporte de objeto perdido (sin enlace a detalle propio).
 * `embedded`: omite el contenedor `card` cuando se inserta dentro de otra tarjeta.
 */
export function LostReportCard({ item, embedded = false }: { item: LostReport; embedded?: boolean }) {
  return (
    <div className={embedded ? 'overflow-hidden' : 'card overflow-hidden'}>
      <ItemImage src={item.imageUrl} alt={item.title} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{item.title}</h3>
          <StatusBadge status={item.status} label={LOST_STATUS_LABELS[item.status]} />
        </div>
        <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {CATEGORY_LABELS[item.category]}
          </span>
          <span>· {item.location}</span>
          <span>· {formatDate(item.lostAt)}</span>
        </div>
      </div>
    </div>
  );
}
