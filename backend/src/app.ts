import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { verifyUploadRequest } from './lib/fileUrls.js';
import { rateLimit } from './lib/rateLimit.js';
import { errorHandler } from './middleware/authenticate.js';
import { adminRouter } from './routes/admin.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { claimsRouter } from './routes/claims.js';
import { foundItemsRouter } from './routes/foundItems.js';
import { lostReportsRouter } from './routes/lostReports.js';
import { notificationsRouter } from './routes/notifications.js';

// Versión de la app desde el archivo VERSION de la raíz (válido desde src/ y dist/).
const APP_VERSION = (() => {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../VERSION');
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return 'unknown';
  }
})();

// CORS_ORIGIN admite varios orígenes separados por comas (p. ej. la web y la app
// Android de Capacitor, que llama desde https://localhost).
const corsOrigins = config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

export function createApp() {
  const app = express();

  // Solo se confía en X-Forwarded-* si TRUST_PROXY está configurado: si no, un
  // cliente podría falsificar su IP (rate limiting) o el protocolo (HTTPS).
  app.set('trust proxy', config.trustProxy);

  // HTTPS obligatorio en producción (redirección permanente). req.secure es fiable
  // solo con TRUST_PROXY correcto cuando TLS termina en un proxy/balanceador.
  if (config.forceHttps) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(403).json({ error: 'HTTPS_REQUIRED', message: 'Usa HTTPS' });
      }
      res.redirect(308, `https://${req.hostname}${req.originalUrl}`);
    });
  }

  // Cabeceras de seguridad. La API solo devuelve JSON e imágenes: CSP mínima.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          imgSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // Las imágenes las muestra el frontend, que puede estar en otro origen.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS solo en producción (en local se trabaja por HTTP).
      strictTransportSecurity: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  // La API usa tokens Bearer, no cookies: sin credenciales en CORS.
  app.use(cors({ origin: corsOrigins, credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  // Límite global por IP (holgado): frena inundaciones sin afectar al uso normal.
  app.use(rateLimit({ name: 'global', max: 600, windowMs: 60_000, key: (req) => req.ip ?? '' }));

  // Imágenes subidas: solo con URL firmada y vigente (la emite la API a usuarios
  // autenticados). Se sirven con nosniff y sandbox para que nunca se ejecuten.
  const uploadsDir = path.resolve(config.uploadDir);
  app.use(
    '/uploads',
    (req, res, next) => {
      const filename = decodeURIComponent(req.path.replace(/^\//, ''));
      if (!verifyUploadRequest(filename, req.query.exp, req.query.sig)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Enlace de imagen no válido o caducado' });
      }
      next();
    },
    express.static(uploadsDir, {
      dotfiles: 'deny',
      index: false,
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', `private, max-age=${Math.min(config.uploadUrlTtl, 3600)}`);
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));

  app.use('/api/auth', authRouter);
  app.use('/api/found-items', foundItemsRouter);
  app.use('/api/lost-reports', lostReportsRouter);
  app.use('/api/claims', claimsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/ai', aiRouter);

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Ruta no encontrada' }));
  app.use(errorHandler);

  return app;
}
