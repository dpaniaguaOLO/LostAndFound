import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound, forbidden } from '../lib/http.js';
import { composeAnswer, parseIntent } from '../lib/assistant.js';
import { signUploadUrl } from '../lib/fileUrls.js';
import { matchItems, semanticSearch, type MatchableItem } from '../lib/matching.js';
import { byUser, rateLimit } from '../lib/rateLimit.js';
import { parseSignature } from '../lib/visual.js';
import { serializeFoundItem, serializeLostReport } from '../lib/serialize.js';
import { assistantSchema, parseOrThrow, semanticSearchSchema } from '../lib/validation.js';
import { authenticate } from '../middleware/authenticate.js';

export const aiRouter = Router();

// Todas las rutas de IA requieren sesión y están limitadas por usuario: cada
// llamada recorre y vectoriza todos los objetos (operación costosa).
aiRouter.use(authenticate, rateLimit({ name: 'ai', max: 30, windowMs: 60_000, key: byUser }));

const reporterSelect = { reporter: { select: { id: true, name: true } } };

// Trae los objetos encontrados disponibles (no devueltos ni archivados) como candidatos.
async function availableFoundItems() {
  return prisma.foundItem.findMany({
    where: { status: { in: ['PUBLISHED', 'CLAIMED'] } },
    include: reporterSelect,
    orderBy: { createdAt: 'desc' },
  });
}

// Mapea un registro de Prisma al tipo que entiende el motor de coincidencia.
function toMatchable(r: {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  foundAt?: Date;
  lostAt?: Date;
  imageSignature?: string | null;
}): MatchableItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    location: r.location,
    date: (r.foundAt ?? r.lostAt) as Date,
    signature: parseSignature(r.imageSignature),
  };
}

// POST /api/ai/search — búsqueda semántica en lenguaje natural sobre encontrados.
aiRouter.post(
  '/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { query, limit } = parseOrThrow(semanticSearchSchema, req.body);

    const items = await availableFoundItems();
    const byId = new Map(items.map((i) => [i.id, i]));
    const ranked = semanticSearch(query, items.map(toMatchable), { limit });

    res.json({
      query,
      results: ranked.map((r) => ({
        item: serializeFoundItem(byId.get(r.item.id)!),
        score: r.score,
        reasons: r.reasons,
      })),
    });
  }),
);

// GET /api/ai/match/:lostReportId — sugiere objetos encontrados que podrían
// coincidir con un objeto perdido. Solo el autor del reporte o un admin.
aiRouter.get(
  '/match/:lostReportId',
  authenticate,
  asyncHandler(async (req, res) => {
    const lost = await prisma.lostReport.findUnique({ where: { id: req.params.lostReportId } });
    if (!lost) throw notFound('Reporte de objeto perdido no encontrado');
    if (lost.reporterId !== req.auth!.sub && req.auth!.role !== 'ADMIN') {
      throw forbidden('No puedes ver sugerencias de este reporte');
    }

    const items = await availableFoundItems();
    const byId = new Map(items.map((i) => [i.id, i]));
    const suggestions = matchItems(toMatchable(lost), items.map(toMatchable), {
      limit: 5,
      minScore: 15,
    });

    res.json({
      lostReportId: lost.id,
      reference: {
        id: lost.id,
        title: lost.title,
        category: lost.category,
        location: lost.location,
        imageUrl: signUploadUrl(lost.imageUrl),
      },
      suggestions: suggestions.map((r) => ({
        item: serializeFoundItem(byId.get(r.item.id)!),
        score: r.score,
        reasons: r.reasons,
        breakdown: r.breakdown,
      })),
    });
  }),
);

// POST /api/ai/assistant — asistente de búsqueda (sin LLM): interpreta la
// pregunta por intención y responde con datos reales de la base.
aiRouter.post(
  '/assistant',
  authenticate,
  asyncHandler(async (req, res) => {
    const { question } = parseOrThrow(assistantSchema, req.body);

    const intent = parseIntent(question);

    // Filtro base común (categoría, ubicación, fecha).
    const where: Record<string, unknown> = {};
    if (intent.categories.length) where.category = { in: intent.categories };
    if (intent.location) where.location = { contains: intent.location };

    let foundItems: ReturnType<typeof serializeFoundItem>[] = [];
    let lostReports: ReturnType<typeof serializeLostReport>[] = [];
    let count = 0;

    if (intent.kind === 'found') {
      const w = { ...where, status: { in: ['PUBLISHED', 'CLAIMED'] } };
      if (intent.since) (w as Record<string, unknown>).foundAt = { gte: intent.since };
      const rows = await prisma.foundItem.findMany({
        where: w,
        include: { reporter: { select: { id: true, name: true } } },
        orderBy: { foundAt: 'desc' },
        take: 10,
      });
      count = rows.length;
      foundItems = rows.map(serializeFoundItem);
    } else {
      const w = { ...where };
      if (intent.since) (w as Record<string, unknown>).lostAt = { gte: intent.since };
      const rows = await prisma.lostReport.findMany({
        where: w,
        include: { reporter: { select: { id: true, name: true } } },
        orderBy: { lostAt: 'desc' },
        take: 10,
      });
      count = rows.length;
      lostReports = rows.map(serializeLostReport);
    }

    res.json({
      answer: composeAnswer(intent, count),
      kind: intent.kind,
      foundItems,
      lostReports,
    });
  }),
);
