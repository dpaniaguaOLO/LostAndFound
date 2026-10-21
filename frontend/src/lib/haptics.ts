/**
 * Respuesta háptica (vibración breve) para confirmar acciones, como en una app
 * nativa. Usa la Vibration API, disponible en el WebView de Android (permiso
 * VIBRATE en el manifiesto); en escritorio/iOS no hace nada. Se respeta la
 * preferencia del sistema de reducir el movimiento.
 */
function vibrate(pattern: number | number[]): void {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* sin soporte: ignorar */
  }
}

export const haptics = {
  /** Toque ligero: selección, cambio de pestaña. */
  tap: () => vibrate(8),
  /** Acción completada (publicar, reclamar, aprobar…). */
  success: () => vibrate([12, 60, 18]),
  /** Algo salió mal. */
  error: () => vibrate([30, 50, 30]),
};
