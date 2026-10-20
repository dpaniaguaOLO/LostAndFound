/**
 * Puente nativo (Capacitor).
 *
 * Inicializa los plugins nativos solo cuando la app corre dentro del contenedor
 * Android. En el navegador `Capacitor.isNativePlatform()` es false y no se hace
 * nada, por lo que la web sigue funcionando igual.
 *
 * Mantener esta capa fina y aislada evita acoplar el resto de la UI a Capacitor.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';

/** ¿La app corre como app nativa (Android) y no en un navegador web? */
export const isNative = Capacitor.isNativePlatform();

/**
 * Configura la barra de estado para que use el verde de marca OLO con iconos
 * claros, y arranca los listeners nativos. Es idempotente y seguro de llamar
 * siempre: en web no hace nada.
 */
export async function initNative(): Promise<void> {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#00a785' });
    // No solapar la webview: el contenido empieza bajo la barra de estado.
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // StatusBar puede no estar disponible en algunas superficies; ignorar.
  }

  try {
    // Oculta la barra de accesorios del teclado en Android para ganar espacio.
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    /* noop */
  }

  // Botón atrás físico de Android: si no hay historial, minimiza en vez de salir.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.minimizeApp();
    }
  });
}
