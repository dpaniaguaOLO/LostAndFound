/**
 * Pila de capas cerrables (diálogos, chat de Olivia, foto ampliada).
 *
 * El botón atrás de Android debe cerrar primero la capa superior, como en una
 * app nativa; antes navegaba hacia atrás con el diálogo abierto (auditoría UX-05).
 */
const stack: Array<() => void> = [];

/** Registra una capa abierta; devuelve la función para quitarla al cerrarse. */
export function registerLayer(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Cierra la capa superior. Devuelve false si no había ninguna. */
export function closeTopLayer(): boolean {
  const close = stack[stack.length - 1];
  if (!close) return false;
  close();
  return true;
}
