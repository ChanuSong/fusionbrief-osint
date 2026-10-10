import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetDocumentContext } from '../server/model-context.ts';

test('multilingual document contexts fit a total byte budget while preserving exact spans and metadata', () => {
  const input = { question: '후계 가능성', criteria: [{ id: 'formal', quote: '변경하지 않는 기준 원문' }], sources: [
    { id: 'small', title: '짧은 원문', excerpts: ['정확한 짧은 인용'] },
    { id: 'ko', title: '한국어 원문', excerpts: ['가나다😀 "인용"\n'.repeat(900), '중간의 관측 구간'.repeat(600)] },
    { id: 'en', title: 'English original', excerpts: ['Exact public text. '.repeat(1000)] },
  ] };
  const original = structuredClone(input);
  const result = budgetDocumentContext(input, 3_000);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 3_000);
  assert.deepEqual(input, original);
  assert.deepEqual(result.criteria, original.criteria);
  assert.deepEqual(result.sources[0], original.sources[0]);
  for (const [index, source] of result.sources.entries()) {
    assert.equal(source.id, original.sources[index].id);
    assert.equal(source.title, original.sources[index].title);
    assert.ok(source.excerpts.length);
    for (const excerpt of source.excerpts) {
      assert.ok(original.sources[index].excerpts.some(text => text.startsWith(excerpt)));
      assert.ok(!/[\uD800-\uDBFF]$/.test(excerpt));
    }
  }
});

test('small requests retain their complete context and oversized fixed metadata is rejected', () => {
  const input = { question: '질문', sources: [{ id: 'original', excerpts: ['보존한 정확한 원문'] }] };
  assert.equal(budgetDocumentContext(input), input);
  assert.throws(() => budgetDocumentContext(input, 5), /메타데이터가 분석 입력 한도를 넘었습니다/);
});
