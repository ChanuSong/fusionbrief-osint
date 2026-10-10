import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createCursorModel } from '../server/model.ts';

test('a malformed structured response receives one regeneration from the unchanged role/input, not invented JSON completion', async () => {
  const prompts: string[] = []; let repairs = 0;
  const output = ['{"claimId":"c1","supported":', JSON.stringify({ claimId: 'c1', supported: false, reason: '원문에 없는 사실' })];
  const model = createCursorModel(async prompt => { prompts.push(prompt); return JSON.stringify({ result: output.shift() }); }, () => repairs++);
  const schema = z.object({ claimId: z.string(), supported: z.boolean(), reason: z.string().max(100) });
  const data = { claimId: 'c1', quote: 'Only an announcement, no implemented act.' };
  const result = await model.generate(schema, 'Independently check the claim against the original quote.', data);
  assert.equal(repairs, 1); assert.equal(prompts.length, 2); assert.equal(result.supported, false);
  assert.ok(prompts.every(prompt => prompt.includes(JSON.stringify(data)) && prompt.includes('Independently check the claim')));
  assert.ok(prompts[1].includes('FORMAT CORRECTION')); assert.ok(!prompts[1].includes('"claimId":"c1","supported":\n'));
});
test('a structurally wrong verification cannot pass through repair; retries remain bounded and CLI failures are not automatically retried', async () => {
  let calls = 0;
  const wrong = createCursorModel(async () => { calls++; return JSON.stringify({ result: JSON.stringify({ supported: 'yes' }) }); });
  await assert.rejects(() => wrong.generate(z.object({ supported: z.boolean() }), 'Verify.', {}), /형식 검증 실패/);
  assert.equal(calls, 2);
  calls = 0;
  const unavailable = createCursorModel(async () => { calls++; throw new Error('offline'); });
  await assert.rejects(() => unavailable.generate(z.object({ supported: z.boolean() }), 'Verify.', {}), /모델 호출 실패/);
  assert.equal(calls, 1);
});

test('an input size failure explains the limit without retrying or exposing process data', async () => {
  let calls = 0;
  const model = createCursorModel(async () => { calls++; throw new Error('Cursor 입력 크기 제한 초과'); });
  await assert.rejects(() => model.generate(z.object({ supported: z.boolean() }), 'Verify.', {}), /분석 입력 크기가 모델 호출 한도를 넘었습니다/);
  assert.equal(calls, 1);
});
