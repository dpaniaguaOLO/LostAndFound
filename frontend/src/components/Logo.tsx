/**
 * Marca de la aplicación: logotipo oficial de OLO + nombre del producto.
 *
 * El SVG está incrustado (en vez de <img>) para poder adaptar el color del
 * texto al tema: en claro usa la tinta oficial #251e1f; en oscuro usa un gris
 * muy claro para que el wordmark siga siendo legible. El bloque verde de marca
 * (#00a785) se mantiene intacto en ambos temas.
 */
function OloMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 384.86 177.16"
      className={className}
      role="img"
      aria-label="OLO"
    >
      {/* Texto del wordmark: tinta de marca en claro, claro en oscuro */}
      <g className="fill-ink dark:fill-slate-100">
        <path d="M0,29.91Q0,12.74,6.51,6.37T30.79,0h90.59q17.77,0,24.29,6.37t6.5,23.54v66q0,17.17-6.5,23.39t-24.29,6.22H30.79q-18.06,0-24.42-6.07T0,95.92Zm23.69,77h104.8V18.66H23.69Z" />
        <polygon points="179.31 177.16 179.31 0.07 203 0.07 203 157.32 307.12 157.32 307.12 177.16 179.31 177.16" />
        <path d="M232.69,29.91q0-17.17,6.51-23.54T263.47,0h90.6q17.76,0,24.28,6.37t6.51,23.54v66q0,17.17-6.51,23.39t-24.28,6.22h-90.6q-18,0-24.42-6.07t-6.36-23.54Zm23.68,77H361.18V18.66H256.37Z" />
      </g>
      {/* Bloque verde corporativo (constante en ambos temas) */}
      <rect x="256.38" y="18.69" width="104.8" height="88.23" fill="#00a785" />
    </svg>
  );
}

export function Logo({
  showWordmark = true,
  className = '',
  markClassName = 'h-7 w-auto',
}: {
  showWordmark?: boolean;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <OloMark className={markClassName} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-olo-700 dark:text-olo-400">
            Lost &amp; Found
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            Overseas Logistics Operations
          </span>
        </span>
      )}
    </span>
  );
}
