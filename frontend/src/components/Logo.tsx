import logoUrl from '../assets/logo-olo.svg';

/**
 * Marca de la aplicación: logotipo oficial de OLO + nombre del producto.
 * El logo es el recurso oficial (frontend/src/assets/logo-olo.svg).
 */
export function Logo({
  showWordmark = true,
  className = '',
}: {
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <img src={logoUrl} alt="OLO" className="h-7 w-auto" />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-olo-700">
            Lost &amp; Found
          </span>
          <span className="text-[10px] text-slate-400">Overseas Logistics Operations</span>
        </span>
      )}
    </span>
  );
}
