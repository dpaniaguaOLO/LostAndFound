import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler } from './middleware/authenticate.js';
import { adminRouter } from './routes/admin.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { claimsRouter } from './routes/claims.js';
import { foundItemsRouter } from './routes/foundItems.js';
import { lostReportsRouter } from './routes/lostReports.js';
import { notificationsRouter } from './routes/notifications.js';

export function createApp() {
  const app = express();

  // Seguridad base. crossOriginResourcePolicy relajado para servir imágenes al frontend.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Archivos subidos (imágenes). En producción conviene usar almacenamiento privado + URLs firmadas.
  app.use('/uploads', express.static(path.resolve(config.uploadDir)));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '0.7.0' }));

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
