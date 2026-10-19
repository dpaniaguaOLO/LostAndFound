import { useState, type FormEvent } from 'react';
import { ITEM_CATEGORIES, type ItemCategory } from '@laf/shared';
import { CATEGORY_LABELS } from '../lib/format';

export interface ItemFormValues {
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  date: string; // yyyy-mm-dd
  image: File | null;
}

/**
 * Formulario compartido para publicar objetos encontrados y reportar perdidos.
 * `dateLabel` distingue "Fecha en que se encontró" vs "Fecha en que se perdió".
 */
export function ItemForm({
  dateLabel,
  submitLabel,
  onSubmit,
}: {
  dateLabel: string;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<ItemFormValues>({
    title: '',
    description: '',
    category: 'OTHER',
    location: '',
    date: today,
    image: null,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFile(file: File | null) {
    setValues((v) => ({ ...v, image: file }));
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-6">
      <div>
        <label className="label" htmlFor="title">
          Título
        </label>
        <input
          id="title"
          className="input"
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
          required
          minLength={2}
          maxLength={140}
          placeholder="Ej. Cartera café de piel"
        />
      </div>

      <div>
        <label className="label" htmlFor="description">
          Descripción
        </label>
        <textarea
          id="description"
          className="input min-h-28"
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
          required
          minLength={2}
          maxLength={2000}
          placeholder="Detalles que ayuden a identificar el objeto…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Categoría
          </label>
          <select
            id="category"
            className="input"
            value={values.category}
            onChange={(e) => setValues({ ...values, category: e.target.value as ItemCategory })}
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">
            {dateLabel}
          </label>
          <input
            id="date"
            type="date"
            className="input"
            value={values.date}
            max={today}
            onChange={(e) => setValues({ ...values, date: e.target.value })}
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="location">
          Ubicación
        </label>
        <input
          id="location"
          className="input"
          value={values.location}
          onChange={(e) => setValues({ ...values, location: e.target.value })}
          required
          placeholder="Ej. Recepción, piso 3"
        />
      </div>

      <div>
        <label className="label" htmlFor="image">
          Fotografía (opcional)
        </label>
        <input
          id="image"
          type="file"
          accept="image/*"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-olo-50 file:px-4 file:py-2 file:text-olo-700 hover:file:bg-olo-100 dark:text-slate-400 dark:file:bg-olo-500/15 dark:file:text-olo-300"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {preview && (
          <img
            src={preview}
            alt="Vista previa"
            className="mt-3 h-40 w-full rounded-lg object-cover"
          />
        )}
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Publicando…' : submitLabel}
      </button>
    </form>
  );
}
