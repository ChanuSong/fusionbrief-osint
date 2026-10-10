import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapConcurrent } from '../server/concurrency.ts';

test('bounded pool refills empty slots, preserves order and drains work before surfacing a failure', async () => {
  const completed: number[] = [];
  await assert.rejects(mapConcurrent([0, 1, 2, 3], 2, async item => {
    if (item === 0) throw new Error('fixture failure');
    await new Promise(resolve => setTimeout(resolve, 3)); completed.push(item); return item;
  }), /fixture failure/);
  assert.deepEqual(completed, [1, 2, 3]);
  assert.deepEqual(await mapConcurrent([3, 1, 2], 2, async item => {
    await new Promise(resolve => setTimeout(resolve, item)); return item;
  }), [3, 1, 2]);
});

test('controlled search-latency benchmark compares two-query batches against a four-slot pool', async t => {
  const delays = [100, 25, 100, 25, 100, 25, 100, 25];
  const work = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const before = performance.now();
  for (let i = 0; i < delays.length; i += 2) await Promise.all(delays.slice(i, i + 2).map(work));
  const batched = performance.now() - before;
  const after = performance.now();
  await mapConcurrent(delays, 4, work);
  const pooled = performance.now() - after;
  t.diagnostic(`Controlled fixture only: batches=${batched.toFixed(0)}ms pool=${pooled.toFixed(0)}ms`);
  assert.ok(pooled < batched * .8, 'independent requests avoid batch-barrier waiting');
});
