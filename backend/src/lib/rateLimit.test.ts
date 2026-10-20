import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttemptLimiter } from './rateLimit.js';
import { pagination, queryInt, queryString } from './query.js';

test('AttemptLimiter bloquea tras N fallos y libera al expirar la ventana', () => {
  const l = new AttemptLimiter(3, 60_000);
  const t0 = 1_000_000;
  l.fail('k', t0);
  l.fail('k', t0);
  assert.equal(l.retryAfter('k', t0), 0);
  l.fail('k', t0);
  assert.equal(l.retryAfter('k', t0), 60);
  assert.equal(l.retryAfter('otra', t0), 0);
  assert.equal(l.retryAfter('k', t0 + 60_001), 0);
});

test('AttemptLimiter.reset olvida los fallos', () => {
  const l = new AttemptLimiter(1, 60_000);
  l.fail('k');
  assert.ok(l.retryAfter('k') > 0);
  l.reset('k');
  assert.equal(l.retryAfter('k'), 0);
});

test('queryString / queryInt toleran entradas raras', () => {
  assert.equal(queryString(['a', 'b']), 'a');
  assert.equal(queryString('  '), undefined);
  assert.equal(queryString({ x: 1 }), undefined);
  assert.equal(queryInt('abc', 7, 1, 10), 7);
  assert.equal(queryInt('999', 7, 1, 10), 10);
  assert.equal(queryInt('-5', 7, 1, 10), 1);
});

test('pagination: valores por defecto y skip', () => {
  assert.deepEqual(pagination({}), { page: 1, pageSize: 12, skip: 0 });
  assert.deepEqual(pagination({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, skip: 20 });
  assert.deepEqual(pagination({ page: 'NaN' }), { page: 1, pageSize: 12, skip: 0 });
});
