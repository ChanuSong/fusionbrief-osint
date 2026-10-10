import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { z } from 'zod';
import { createTopicService, discoverTopics } from '../server/topics.ts';
import type { ResearchDependencies } from '../server/research.ts';
import { wisdomFixture } from './fixtures/wisdom.ts';

const now = new Date('2026-10-10T00:00:00Z');
const source = wisdomFixture().sources[0];
const candidate = { title: '검증용 가상 국방 발표', whyNow: '최근 가상 발표의 재인용 경로를 조사합니다.',
  question: '2026년 10월 가상 발표를 어떤 매체가 인용했는지 비교해줘.', evidence: [{ sourceId: source.id, quote: source.body }] };
function dependencies(outputs: unknown[], doc = source): ResearchDependencies {
  return { model: { async generate<T>(schema: z.ZodType<T>) { assert.ok(outputs.length); return schema.parse(outputs.shift()); } },
    search: async q => [{ url: doc.url, title: doc.title, module: q.module, language: q.language }], read: async () => doc };
}

test('recent topics preserve exact sources and ready-to-use questions after semantic verification', async () => {
  const deps = dependencies([{ topics: [candidate] }, { verdicts: [{ index: 0, supported: true, reason: '검증용' }] }]);
  const checkedModel = deps.model;
  deps.model = { async generate<T>(schema: z.ZodType<T>, instructions: string, data: unknown) {
    const input = data as { candidates?: unknown[]; sources: { id: string; excerpts: string[] }[] };
    if (input.candidates) {
      assert.equal(input.sources.length, 1);
      assert.equal(input.sources[0].id, source.id);
      assert.ok(input.sources[0].excerpts.join(' ').includes(source.body));
    }
    return checkedModel.generate(schema, instructions, data);
  } };
  const result = await discoverTopics(deps, now);
  assert.equal(result.state, 'ready'); assert.equal(result.topics.length, 1);
  assert.equal(result.period.start, '2026-09-26');
  assert.equal(result.topics[0].sources[0].quote, source.body);
  assert.equal(result.topics[0].sources[0].url, source.url);
  assert.equal(result.topics[0].question, candidate.question);
});

test('undated, stale and future sources never become latest recommendations', async () => {
  for (const publishedAt of ['', '2025-01-01', '2026-10-11']) {
    const result = await discoverTopics(dependencies([], { ...source, publishedAt }), now);
    assert.equal(result.state, 'failed'); assert.equal(result.topics.length, 0);
  }
});

test('invented citations and unsupported recommendation premises are rejected', async () => {
  const fake = await discoverTopics(dependencies([{ topics: [{ ...candidate, evidence: [{ sourceId: source.id, quote: 'This quotation does not exist in the document.' }] }] }]), now);
  assert.equal(fake.topics.length, 0);
  const rejected = await discoverTopics(dependencies([{ topics: [candidate] }, { verdicts: [{ index: 0, supported: false, reason: '제목이 원문과 불일치' }] }]), now);
  assert.equal(rejected.topics.length, 0);
});

test('recommendation refresh is shared, cached and disabled in offline tests', async () => {
  let searches = 0;
  const deps = dependencies([{ topics: [candidate] }, { verdicts: [{ index: 0, supported: true, reason: '검증용' }] }]);
  const search = deps.search; deps.search = q => { searches++; return search(q); };
  const service = createTopicService(true, deps, () => now);
  service.refresh(); service.refresh(); service.refresh(true);
  await service.settled();
  assert.equal(searches, 5); assert.equal(service.get().state, 'ready');
  service.refresh(); await service.settled(); assert.equal(searches, 5);
  const disabled = createTopicService(false, deps, () => now);
  disabled.refresh(true); await disabled.settled();
  assert.equal(disabled.get().state, 'disabled'); assert.equal(searches, 5);
});

test('blocked recommendation discovery reports failures without a fabricated fallback topic', async () => {
  const deps = dependencies([]); deps.search = async () => { throw new Error('CAPTCHA'); };
  const result = await discoverTopics(deps, now);
  assert.equal(result.state, 'failed'); assert.equal(result.topics.length, 0);
  assert.equal(result.trace.filter(t => t.status === 'failed').length, 5);
});
