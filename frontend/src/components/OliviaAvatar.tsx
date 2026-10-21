/**
 * Avatar de Olivia, la asistente de Lost & Found (OLO).
 * SVG propio (sin dependencias ni imágenes externas): un robot amable con el
 * verde de marca OLO. Pensado para sentirse como un asistente digital cercano.
 */
export function OliviaAvatar({
  className = 'h-9 w-9',
  decorative = false,
}: {
  className?: string;
  /** true cuando hay texto al lado que ya nombra a Olivia (evita repetirlo al lector de pantalla). */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Olivia, asistente de OLO' })}
    >
      {/* Fondo circular */}
      <circle cx="24" cy="24" r="24" fill="#00a785" />
      {/* Antena */}
      <line x1="24" y1="9" x2="24" y2="14" stroke="#e8f7f2" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="8" r="2.2" fill="#e8f7f2" />
      {/* Cabeza / carcasa */}
      <rect x="12" y="14" width="24" height="20" rx="7" fill="#eef4f3" stroke="#cfe6df" strokeWidth="1" />
      {/* Visor / pantalla */}
      <rect x="15.5" y="18" width="17" height="11" rx="5" fill="#15343b" />
      {/* Ojos (brillo verde menta) */}
      <circle cx="20.5" cy="23.5" r="2.1" fill="#39e6b0" />
      <circle cx="27.5" cy="23.5" r="2.1" fill="#39e6b0" />
      <circle cx="21.1" cy="22.9" r="0.6" fill="#eafff8" />
      <circle cx="28.1" cy="22.9" r="0.6" fill="#eafff8" />
      {/* Sonrisa digital */}
      <path
        d="M21 26.6c1.2 1 4.8 1 6 0"
        stroke="#39e6b0"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Receptores laterales */}
      <rect x="9.5" y="21" width="2.5" height="6" rx="1.25" fill="#e8f7f2" />
      <rect x="36" y="21" width="2.5" height="6" rx="1.25" fill="#e8f7f2" />
    </svg>
  );
}
