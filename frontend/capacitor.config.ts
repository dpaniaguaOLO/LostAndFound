import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Lost & Found OLO mobile app.
 *
 * The web build in `dist/` is wrapped by the native Android shell.
 * For live-reload development against a local Vite server you can set the
 * CAP_SERVER_URL env var (e.g. http://192.168.1.50:5173) when running
 * `npx cap sync`; by default the bundled assets in `dist/` are used.
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.olo.lostandfound',
  appName: 'Lost & Found OLO',
  webDir: 'dist',
  // Background behind the web view (matches the OLO dark neutral surface).
  backgroundColor: '#0b0e12',
  android: {
    // Never allow chrome://inspect on the WebView, even in debug-signed APKs
    // (it would expose the Supabase session token stored in localStorage).
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      // Let the app draw behind the status bar so safe-area insets apply.
      overlaysWebView: false,
      // Initial look; lib/native.ts then follows the app theme (light/dark).
      style: 'LIGHT',
      backgroundColor: '#f8fafc',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: true,
        },
      }
    : {}),
};

export default config;
