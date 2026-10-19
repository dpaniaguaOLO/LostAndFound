/**
 * Backfill de firmas visuales para objetos que ya tienen imagen pero no firma.
 * Uso: npx tsx scripts/backfill_signatures.ts
 */
import { PrismaClient } from '@prisma/client';
import { computeSignature, serializeSignature } from '../src/lib/visual.js';
import { config } from '../src/config.js';
import path from 'node:path';

const prisma = new PrismaClient();

function diskPath(imageUrl: string): string {
  // imageUrl es "/uploads/<archivo>"
  const filename = imageUrl.replace(/^\/uploads\//, '');
  return path.join(config.uploadDir, filename);
}

async function backfill(model: 'foundItem' | 'lostReport') {
  const rows = await (prisma[model] as any).findMany({
    where: { imageUrl: { not: null }, imageSignature: null },
    select: { id: true, imageUrl: true },
  });
  let ok = 0;
  for (const r of rows) {
    try {
      const sig = await computeSignature(diskPath(r.imageUrl));
      await (prisma[model] as any).update({
        where: { id: r.id },
        data: { imageSignature: serializeSignature(sig) },
      });
      ok++;
    } catch (e) {
      console.error(`  fallo ${model} ${r.id}:`, (e as Error).message);
    }
  }
  console.log(`${model}: ${ok}/${rows.length} firmas generadas`);
}

await backfill('foundItem');
await backfill('lostReport');
await prisma.$disconnect();
console.log('Backfill completado.');
