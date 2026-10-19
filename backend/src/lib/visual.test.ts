import assert from 'node:assert';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  computeSignature,
  parseSignature,
  serializeSignature,
  visualSimilarity,
} from './visual.js';

// Genera una imagen PNG sólida de un color dado.
function solid(r: number, g: number, b: number, size = 64) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

// Imagen con dos bandas de color (estructura distinta).
function bands(top: [number, number, number], bottom: [number, number, number], size = 64) {
  const half = size / 2;
  const topImg = {
    create: { width: size, height: half, channels: 3, background: { r: top[0], g: top[1], b: top[2] } },
  };
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: bottom[0], g: bottom[1], b: bottom[2] } },
  })
    .composite([{ input: { ...topImg } as never, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

test('firma: misma imagen -> similitud ~1', async () => {
  const buf = await solid(120, 80, 40); // café
  const a = await computeSignature(buf);
  const b = await computeSignature(buf);
  assert.ok(visualSimilarity(a, b) > 0.98, 'misma imagen casi idéntica');
});

test('firma: colores opuestos -> similitud baja', async () => {
  // Negro vs blanco: color opuesto. Aunque la estructura sólida coincide, el
  // color (ponderado 0.55) debe arrastrar la similitud por debajo de ~0.6.
  const negro = await computeSignature(await solid(10, 10, 10));
  const blanco = await computeSignature(await solid(245, 245, 245));
  assert.ok(visualSimilarity(negro, blanco) < 0.6, 'negro vs blanco deben diferir');
});

test('firma: café vs café ligeramente distinto -> alta similitud', async () => {
  const a = await computeSignature(await solid(120, 80, 40));
  const b = await computeSignature(await solid(128, 86, 44));
  assert.ok(visualSimilarity(a, b) > 0.9, 'tonos de café parecidos');
});

test('serialización ida y vuelta', async () => {
  const sig = await computeSignature(await solid(50, 150, 200));
  const round = parseSignature(serializeSignature(sig));
  assert.ok(round);
  assert.equal(round!.hash, sig.hash);
  assert.deepEqual(round!.color, sig.color);
});

test('parseSignature tolera valores inválidos', () => {
  assert.equal(parseSignature(null), null);
  assert.equal(parseSignature('no-json'), null);
  assert.equal(parseSignature('{"foo":1}'), null);
});

// Evita unused import warning y valida que bands produce estructura distinta.
test('estructura: bandas distintas vs sólido', async () => {
  const solidSig = await computeSignature(await solid(100, 100, 100));
  const bandSig = await computeSignature(await bands([250, 250, 250], [0, 0, 0]));
  assert.ok(visualSimilarity(solidSig, bandSig) < 0.9);
});
