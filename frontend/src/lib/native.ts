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

/** Colores de fondo de la app (deben coincidir con body en index.css). */
export const APP_BG = { light: '#f8fafc', dark: '#0b0e12' } as const;

/**
 * Iguala la barra de estado de Android al fondo de la app según el tema
 * (iconos oscuros en claro, claros en oscuro). En web no hace nada.
 */
export async function syncStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: APP_BG[theme] });
  } catch {
    // StatusBar puede no estar disponible en algunas superficies; ignorar.
  }
}

/**
 * Configura la barra de estado según el tema actual y arranca los listeners
 * nativos. Es idempotente y seguro de llamar siempre: en web no hace nada.
 */
export async function initNative(): Promise<void> {
  if (!isNative) return;

  await syncStatusBar(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  try {
    // No solapar la webview: el contenido empieza bajo la barra de estado.
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* noop */
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
