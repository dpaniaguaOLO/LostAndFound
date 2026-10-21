/**
 * Avatar de Olivia, la asistente de Lost & Found (OLO).
 * SVG propio (sin dependencias ni imágenes externas), en el verde de marca OLO.
 * Una carita amable y simple que la hace sentir como una persona del equipo.
 */
export function OliviaAvatar({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Olivia, asistente de OLO"
    >
      {/* Fondo circular */}
      <circle cx="24" cy="24" r="24" fill="#00a785" />
      {/* Cabello */}
      <path
        d="M11 25c0-8.3 6.3-14 13-14s13 5.7 13 14v2c0 1-1 1.6-1.9 1.2-.8-.4-.6-1.6-.6-2.6 0-1.4-.5-2.3-1.3-2.3-1.2 0-1.4 1.6-3 1.6-1.4 0-2-1-3.6-1-1.3 0-2 .8-3.6.8s-2.3-.8-3.6-.8c-1.6 0-2.2 1-3.6 1-1.6 0-1.8-1.6-3-1.6-.8 0-1.3.9-1.3 2.3 0 1 .2 2.2-.6 2.6C12 28.6 11 28 11 27Z"
        fill="#e8f7f2"
      />
      {/* Cara */}
      <path
        d="M14 24c0-6 4.5-10 10-10s10 4 10 10v2c0 5.5-4.5 9.5-10 9.5S14 31.5 14 26Z"
        fill="#fbe9d8"
      />
      {/* Flequillo */}
      <path
        d="M14 24c0-6 4.5-10 10-10s10 4 10 10c-2.2.2-4-1.3-5.3-1.3-1.5 0-2.4 1-4.7 1s-3.2-1-4.7-1C17.9 22.7 16.2 24.2 14 24Z"
        fill="#e8f7f2"
      />
      {/* Ojos */}
      <circle cx="20" cy="25" r="1.6" fill="#1f2a28" />
      <circle cx="28" cy="25" r="1.6" fill="#1f2a28" />
      {/* Mejillas */}
      <circle cx="18" cy="28.5" r="1.6" fill="#f6b8a0" opacity="0.7" />
      <circle cx="30" cy="28.5" r="1.6" fill="#f6b8a0" opacity="0.7" />
      {/* Sonrisa */}
      <path
        d="M20.5 29.5c1 1.3 5.9 1.3 7 0"
        stroke="#1f2a28"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
