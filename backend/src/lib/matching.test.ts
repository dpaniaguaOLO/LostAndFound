import assert from 'node:assert';
import { test } from 'node:test';
import { cosineSimilarity, tokenize, TfIdfIndex } from './nlp.js';
import { matchItems, semanticSearch, type MatchableItem } from './matching.js';

test('tokenize normaliza acentos, sinónimos y stopwords', () => {
  const t = tokenize('Perdí mi billetera café cerca de la Cafetería');
  // "perdi", "mi", "de", "la", "cerca" son stopwords; "billetera" -> "cartera"
  assert.ok(t.includes('cartera'), `billetera debe mapear a cartera, got: ${t.join(',')}`);
  assert.ok(!t.includes('mi'), 'stopwords removidas');
  assert.ok(!t.includes('cafe') === false || t.includes('cafe'), 'cafe sin acento presente');
});

test('cosineSimilarity: textos iguales ~1, distintos ~0', () => {
  const idx = new TfIdfIndex(['cartera cafe de piel', 'telefono negro samsung']);
  const a = idx.vectorize('cartera cafe de piel');
  const b = idx.vectorize('cartera cafe de piel');
  const c = idx.vectorize('telefono negro samsung');
  assert.ok(cosineSimilarity(a, b) > 0.99, 'iguales ~1');
  assert.ok(cosineSimilarity(a, c) < 0.2, 'distintos ~0');
});

const found: MatchableItem[] = [
  {
    id: 'f1',
    title: 'Cartera de piel café',
    description: 'Billetera marrón con tarjetas',
    category: 'WALLET',
    location: 'Cafetería',
    date: new Date('2026-10-13'),
  },
  {
    id: 'f2',
    title: 'Teléfono negro',
    description: 'Celular Samsung con funda',
    category: 'ELECTRONICS',
    location: 'Estacionamiento',
    date: new Date('2026-10-01'),
  },
  {
    id: 'f3',
    title: 'Paraguas azul',
    description: 'Sombrilla plegable',
    category: 'OTHER',
    location: 'Entrada',
    date: new Date('2026-10-10'),
  },
];

test('matchItems: un perdido encuentra el encontrado correcto como primero', () => {
  const lost: MatchableItem = {
    id: 'l1',
    title: 'Billetera marrón',
    description: 'Perdí mi monedero de cuero con mis tarjetas',
    category: 'WALLET',
    location: 'cerca de la cafeteria',
    date: new Date('2026-10-14'),
  };
  const res = matchItems(lost, found, { limit: 3 });
  assert.equal(res[0].item.id, 'f1', 'la cartera debe ser la mejor coincidencia');
  assert.ok(res[0].score > 40, `score razonable, fue ${res[0].score}`);
  assert.ok(res[0].reasons.includes('Misma categoría'));
});

test('semanticSearch: consulta en lenguaje natural rankea por relevancia', () => {
  const res = semanticSearch('celular samsung que perdí en el parqueo', found, { limit: 3 });
  assert.equal(res[0].item.id, 'f2', 'el teléfono debe ser el más relevante');
});

test('semanticSearch: consulta vacía no rompe', () => {
  assert.deepEqual(semanticSearch('', found), []);
});
