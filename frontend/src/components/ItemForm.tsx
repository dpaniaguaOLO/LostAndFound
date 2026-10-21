import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ITEM_CATEGORIES, type ItemCategory } from '@laf/shared';
import { CATEGORY_LABELS, localDateString } from '../lib/format';

export interface ItemFormValues {
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  date: string; // yyyy-mm-dd (fecha local)
  image: File | null;
}

const MAX_DESCRIPTION = 2000;

/**
 * Formulario compartido para publicar objetos encontrados y reportar perdidos.
 * `dateLabel` distingue "Fecha en que se encontró" vs "Fecha en que se perdió".
 */
export function ItemForm({
  dateLabel,
  submitLabel,
  onSubmit,
  optionalLocation = false,
  allowCamera = true,
}: {
  dateLabel: string;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => Promise<void>;
  optionalLocation?: boolean;
  /** false al reportar un perdido: no tienes el objeto delante para fotografiarlo. */
  allowCamera?: boolean;
}) {
  // Fecha local (no UTC): con toISOString, en UTC-6 a partir de las 18:00 "hoy" sería mañana.
  const today = localDateString();
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

  // Libera la URL temporal de la vista previa al cambiarla o al desmontar.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File | null) {
    setValues((v) => ({ ...v, image: file }));
    setPreview(file ? URL.createObjectURL(file) : null);
    // Permite volver a elegir el mismo archivo tras quitarlo.
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5 p-4 sm:p-6">
      {/* Foto primero: en móvil es lo más rápido de capturar */}
      <div>
        <span className="label">Fotografía (opcional)</span>

        {/* Dos entradas ocultas: cámara (capture) y galería/archivo. */}
        {allowCamera && (
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {preview ? (
          <div className="relative animate-scale-in overflow-hidden rounded-2xl">
            <img src={preview} alt="Vista previa" className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-800 backdrop-blur transition hover:bg-white active:scale-95"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => handleFile(null)}
                className="rounded-full bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80 active:scale-95"
              >
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <div className={allowCamera ? 'grid grid-cols-2 gap-3' : 'grid gap-3'}>
            {allowCamera && (
              <PhotoButton label="Tomar foto" onClick={() => cameraInputRef.current?.click()}>
                <path
                  d="M4 8a2 2 0 0 1 2-2h1l1.2-1.6A1 1 0 0 1 9 4h6a1 1 0 0 1 .8.4L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              </PhotoButton>
            )}
            <PhotoButton
              label={allowCamera ? 'Elegir de galería' : 'Subir una foto del objeto (si tienes una)'}
              onClick={() => fileInputRef.current?.click()}
            >
              <path d="M4 5h16v14H4zM4 15l4-4 3 3 4-4 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </PhotoButton>
          </div>
        )}
      </div>

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
          autoComplete="off"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="description">
            Descripción
          </label>
          <span className="text-xs text-slate-400" aria-hidden>
            {values.description.length}/{MAX_DESCRIPTION}
          </span>
        </div>
        <textarea
          id="description"
          className="input min-h-28 resize-y"
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
          required
          minLength={2}
          maxLength={MAX_DESCRIPTION}
          placeholder="Color, marca, detalles que ayuden a identificarlo…"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
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

      <button className="btn-primary mt-1 w-full py-3 text-base sm:text-sm" type="submit" disabled={submitting}>
        {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {submitting ? 'Publicando…' : submitLabel}
      </button>
    </form>
  );
}

function PhotoButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-3 py-6 text-sm font-semibold text-slate-600 transition hover:border-olo-400 hover:bg-olo-50/60 hover:text-olo-700 active:scale-[0.98] dark:border-olo-dark-700 dark:bg-olo-dark-850/40 dark:text-slate-300 dark:hover:border-olo-500/60 dark:hover:bg-olo-500/5 dark:hover:text-olo-300"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-olo-600 shadow-card transition group-hover:scale-110 dark:bg-olo-dark-900 dark:text-olo-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          {children}
        </svg>
      </span>
      {label}
    </button>
  );
}
