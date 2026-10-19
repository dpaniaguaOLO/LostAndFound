import { ITEM_CATEGORIES, type ItemCategory } from '@laf/shared';
import { CATEGORY_LABELS } from '../lib/format';

export interface FilterValues {
  search: string;
  category: ItemCategory | '';
  location: string;
}

/** Barra de búsqueda + filtros reutilizable para muro y perdidos. */
export function Filters({
  value,
  onChange,
}: {
  value: FilterValues;
  onChange: (next: FilterValues) => void;
}) {
  return (
    <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="search">
          Buscar
        </label>
        <input
          id="search"
          className="input"
          placeholder="Título o descripción…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </div>
      <div className="sm:w-48">
        <label className="label" htmlFor="category">
          Categoría
        </label>
        <select
          id="category"
          className="input"
          value={value.category}
          onChange={(e) => onChange({ ...value, category: e.target.value as ItemCategory | '' })}
        >
          <option value="">Todas</option>
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:w-48">
        <label className="label" htmlFor="location">
          Ubicación
        </label>
        <input
          id="location"
          className="input"
          placeholder="Ej. Cafetería"
          value={value.location}
          onChange={(e) => onChange({ ...value, location: e.target.value })}
        />
      </div>
    </div>
  );
}
