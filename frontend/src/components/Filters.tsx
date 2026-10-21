import { ITEM_CATEGORIES, type ItemCategory } from '@laf/shared';
import { CATEGORY_LABELS } from '../lib/format';

export interface FilterValues {
  search: string;
  category: ItemCategory | '';
  location: string;
}

/**
 * Barra de búsqueda + filtros reutilizable para muro y perdidos.
 * Mobile first: buscador a lo ancho y categorías como chips deslizables.
 */
export function Filters({
  value,
  onChange,
}: {
  value: FilterValues;
  onChange: (next: FilterValues) => void;
}) {
  const hasFilters = !!(value.search || value.category || value.location);

  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor="search">
            Buscar
          </label>
          <SearchIcon />
          <input
            id="search"
            type="search"
            className="input pl-11"
            placeholder="Buscar por título o descripción…"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            enterKeyHint="search"
          />
        </div>
        <div className="relative sm:w-56">
          <label className="sr-only" htmlFor="location">
            Ubicación
          </label>
          <PinIcon />
          <input
            id="location"
            className="input pl-11"
            placeholder="Ubicación (ej. Cafetería)"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
          />
        </div>
      </div>

      {/* Categorías: chips con scroll horizontal (se extienden hasta el borde en móvil) */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Categoría">
        <button
          type="button"
          className={'chip ' + (value.category === '' ? 'chip-active' : '')}
          aria-pressed={value.category === ''}
          onClick={() => onChange({ ...value, category: '' })}
        >
          Todas
        </button>
        {ITEM_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={'chip ' + (value.category === c ? 'chip-active' : '')}
            aria-pressed={value.category === c}
            onClick={() => onChange({ ...value, category: value.category === c ? '' : c })}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        {hasFilters && (
          <button
            type="button"
            className="ml-auto shrink-0 whitespace-nowrap px-2 text-sm font-semibold text-olo-700 hover:underline dark:text-olo-400"
            onClick={() => onChange({ search: '', category: '', location: '' })}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
