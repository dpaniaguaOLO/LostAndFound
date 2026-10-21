/**
 * Aviso interno para que el contador de notificaciones de la cabecera se
 * refresque al marcar avisos como leídos, sin esperar a cambiar de página.
 */
const EVENT = 'laf:unread-changed';

export function notifyUnreadChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onUnreadChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
