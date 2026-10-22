import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Content-Security-Policy para el build de producción (web y Android).
 *
 * Se inserta como <meta> en index.html porque el hosting aún no está definido;
 * cuando lo esté, conviene enviarla también como cabecera HTTP (permite además
 * `frame-ancestors`, que en <meta> se ignora). Ver docs/SECURITY.md.
 *
 * - Scripts: solo los propios del bundle + los inline de index.html por su hash
 *   (el anti-parpadeo del tema). Sin 'unsafe-inline' ni 'unsafe-eval'.
 * - Conexiones/imágenes: el propio origen, Supabase (si está configurado) y la
 *   API REST externa (VITE_API_BASE_URL, usada por la app Android).
 * No se aplica en `vite dev` (el servidor de desarrollo inyecta scripts inline).
 */
function contentSecurityPolicy(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const origins: string[] = [];
  for (const raw of [env.VITE_SUPABASE_URL, env.VITE_API_BASE_URL]) {
    if (!raw) continue;
    try {
      origins.push(new URL(raw).origin);
    } catch {
      /* URL inválida: se ignora */
    }
  }
  const supabaseWs = env.VITE_SUPABASE_URL ? env.VITE_SUPABASE_URL.replace(/^http/, 'ws') : '';
  const allHttps = origins.every((o) => o.startsWith('https://'));

  return {
    name: 'laf-content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineHashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        );
        const directives = [
          "default-src 'self'",
          `script-src 'self' ${inlineHashes.join(' ')}`.trim(),
          // Google Fonts (Open Sans, importada en index.css).
          "style-src 'self' https://fonts.googleapis.com",
          `img-src 'self' data: blob: ${origins.join(' ')}`.trim(),
          "font-src 'self' data: https://fonts.gstatic.com",
          `connect-src 'self' ${origins.join(' ')} ${supabaseWs ? new URL(supabaseWs).origin : ''}`.trim(),
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          ...(allHttps ? ['upgrade-insecure-requests'] : []),
        ];
        const meta = `<meta http-equiv="Content-Security-Policy" content="${directives.join('; ')}" />`;
        const referrer = '<meta name="referrer" content="strict-origin-when-cross-origin" />';
        return html.replace('<head>', `<head>\n    ${meta}\n    ${referrer}`);
      },
    },
  };
}

/**
 * Valida la selección de backend al compilar (auditoría FUN-04): un valor
 * inválido o `supabase` sin URL/clave hacían que la app cayera EN SILENCIO al
 * backend REST (y en un APK, sin servidor alcanzable). Mejor fallar el build.
 */
function validateDataBackend(mode: string): Plugin {
  return {
    name: 'laf-validate-data-backend',
    apply: 'build',
    buildStart() {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const backend = env.VITE_DATA_BACKEND;
      if (backend && backend !== 'rest' && backend !== 'supabase') {
        this.error(`VITE_DATA_BACKEND="${backend}" no es válido: usa "rest" o "supabase".`);
      }
      if (backend === 'supabase' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
        this.error('VITE_DATA_BACKEND="supabase" requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), validateDataBackend(mode), contentSecurityPolicy(mode)],
  build: {
    // Sin source maps públicos en producción (no exponer el código fuente original).
    sourcemap: false,
    rollupOptions: {
      output: {
        // Dependencias en chunks propios: cambian poco, así el navegador/WebView las
        // mantiene en caché entre despliegues de la app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy de /api y /uploads al backend en desarrollo, evita problemas de CORS.
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
}));
