import { useRef, useState, type FormEvent } from 'react';
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
  optionalLocation = false,
}: {
  dateLabel: string;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => Promise<void>;
  optionalLocation?: boolean;
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          Ubicación{optionalLocation ? ' (opcional)' : ''}
        </label>
        <input
          id="location"
          className="input"
          value={values.location}
          onChange={(e) => setValues({ ...values, location: e.target.value })}
          required={!optionalLocation}
          placeholder={optionalLocation ? 'Si no sabes dónde, déjalo en blanco' : 'Ej. Recepción, piso 3'}
        />
      </div>

      <div>
        <span className="label">Fotografía (opcional)</span>

        {/* Dos entradas ocultas: cámara (capture) y galería/archivo. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => cameraInputRef.current?.click()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 8a2 2 0 0 1 2-2h1l1.2-1.6A1 1 0 0 1 9 4h6a1 1 0 0 1 .8.4L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Tomar foto
          </button>
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 5h16v14H4zM4 15l4-4 3 3 4-4 5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            Elegir archivo
          </button>
        </div>

        {preview && (
          <div className="relative mt-3">
            <img src={preview} alt="Vista previa" className="h-44 w-full rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => handleFile(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80"
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Publicando…' : submitLabel}
      </button>
    </form>
  );
}
