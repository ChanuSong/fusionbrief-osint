import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { z } from 'zod';
import type { JsonModel } from '../server/model.ts';
import { createWisdomGraph, proposeGraphInferences, refreshWisdom, connectedPremises } from '../server/wisdom.ts';
import { applyReview, exportMarkdown } from '../server/analysis.ts';
import { wisdomFixture } from './fixtures/wisdom.ts';

test('two verified directed relations derive an indirect path with exact premise edges and leaf evidence', () => {
  const run = wisdomFixture();
  const graph = run.wisdom!;
  assert.equal(graph.inferences.length, 1);
  const inference = graph.inferences[0];
  assert.equal(inference.rule, 'citation-path');
  assert.deepEqual(inference.evidenceIds, ['e0', 'e1']);
  assert.equal(inference.premiseEdgeIds.length, 2);
  assert.match(inference.conclusion, /Channel Alpha → Bulletin Beta → Statement Gamma/);
  assert.equal(inference.confidence, 'low');
  assert.ok(inference.limitations.some(s => s.includes('동일 주장')));
  assert.ok(graph.edges.some(e => e.derived && e.to === inference.id));
  assert.equal(run.claims[0].independentCount, 0);
  assert.match(exportMarkdown(run), /인용·재게시 경로/);
  assert.match(exportMarkdown(run), /https:\/\/fixture0.example\/article/);
});

test('co-occurrence, chronology, reversed edges, cycles and contradictions never create citation/causal chains', () => {
  for (const mutate of [
    (r: ReturnType<typeof wisdomFixture>) => { r.relations![0].predicate = 'associated-with'; },
    (r: ReturnType<typeof wisdomFixture>) => { r.relations!.forEach(e => e.predicate = 'precedes'); },
    (r: ReturnType<typeof wisdomFixture>) => { r.relations![1].from = 'c'; r.relations![1].to = 'b'; },
    (r: ReturnType<typeof wisdomFixture>) => { r.relations![1].to = 'a'; },
    (r: ReturnType<typeof wisdomFixture>) => { r.evidence[1].stance = 'contradicts'; },
    (r: ReturnType<typeof wisdomFixture>) => { r.claims[1].status = 'conflicting'; },
  ]) {
    const run = wisdomFixture(); mutate(run);
    assert.equal(createWisdomGraph(run).inferences.length, 0);
  }
});

test('graph inference requires a connected path across at least two distinct claims', () => {
  const run = wisdomFixture();
  const edges = run.wisdom!.edges.filter(e => e.id === 'concerns:c0:b' || e.id === 'concerns:c1:b');
  assert.equal(connectedPremises(['c0', 'c1'], edges), true);
  assert.equal(connectedPremises(['c0', 'c1'], edges.slice(0, 1)), false);
  assert.equal(connectedPremises(['c0', 'c0'], edges), false);
});

const proposal = { conclusion: '가설: 두 매체가 연결된 출처를 사용해 같은 논의를 재유통했을 가능성이 있습니다.',
  premiseClaimIds: ['c0', 'c1'], premiseEdgeIds: ['concerns:c0:b', 'concerns:c1:b'],
  reasoning: '두 주장이 같은 중간 출처를 명시한다.', limitations: ['동일 내용 전달 여부 미확인'],
  alternatives: ['각 매체가 서로 다른 문맥을 인용했을 가능성'], nextCheck: '두 인용의 원문 문맥을 비교한다.' };
function model(outputs: unknown[]): JsonModel { return { async generate<T>(schema: z.ZodType<T>) {
  assert.ok(outputs.length); return schema.parse(outputs.shift());
} }; }

test('new graph hypotheses retain competitors, falsification checks and independently checked premises', async () => {
  const run = wisdomFixture();
  const checkedModel = model([{ proposals: [proposal] }, { verdicts: [{ index: 0, valid: true, reason: '연결과 한계 확인' }] }]);
  await proposeGraphInferences(run, { async generate<T>(schema: z.ZodType<T>, instructions: string, data: unknown) {
    const input = data as { evidence: { title: string; publishedAt: string; context: string }[] };
    assert.equal(input.evidence[0].publishedAt, run.sources[0].publishedAt);
    assert.equal(input.evidence[0].title, run.sources[0].title);
    assert.ok(input.evidence[0].context.includes(run.evidence[0].quote));
    return checkedModel.generate(schema, instructions, data);
  } });
  const inference = run.wisdom!.inferences.find(i => i.rule === 'competing-explanation')!;
  assert.ok(inference);
  assert.deepEqual(inference.claimIds, ['c0', 'c1']);
  assert.equal(inference.confidence, 'low');
  assert.deepEqual(inference.alternatives, proposal.alternatives);
  run.evidence.pop(); refreshWisdom(run);
  assert.equal(run.wisdom!.inferences.length, 0);
  assert.ok(run.wisdom!.rejected.some(s => s.includes('검토 후')));
});

test('fabricated graph edges and an independent rejection cannot become accepted hypotheses', async () => {
  for (const fake of [true, false]) {
    const run = wisdomFixture();
    await proposeGraphInferences(run, model([{ proposals: [{ ...proposal, premiseEdgeIds: fake ? ['invented-edge'] : proposal.premiseEdgeIds }] },
      ...(!fake ? [{ verdicts: [{ index: 0, valid: false, reason: '원문에 없는 인과관계' }] }] : [])]));
    assert.equal(run.wisdom!.inferences.filter(i => i.rule === 'competing-explanation').length, 0);
    assert.equal(run.wisdom!.rejected.length, 1);
  }
});

test('analyst evidence review recomputes graph confidence, and approval does not become a new premise', () => {
  const run = wisdomFixture();
  const next = applyReview(run, { claimId: 'c0', action: 'independence', evidenceIds: ['e0'], independent: true,
    expectedVersion: 1, reason: '검증용: 원출처 독립성 확인' });
  assert.equal(next.version, 2);
  assert.equal(next.wisdom!.inferences[0].confidence, 'low'); // the other premise is still low
  assert.deepEqual(next.wisdom!.inferences[0].evidenceIds, ['e0', 'e1']);
});

test('multiple claims from one document cannot raise inference confidence', () => {
  const run = wisdomFixture();
  run.claims.forEach(c => { c.confidence = { level: 'medium', reason: '검증용' }; });
  run.evidence[1].sourceId = run.evidence[0].sourceId;
  assert.equal(createWisdomGraph(run).inferences[0].confidence, 'low');
});

test('jointly audited hypotheses still require real relations and connected surviving claims', async () => {
  const { attachCheckedInference } = await import('../server/wisdom.ts');
  const input = { conclusion: proposal.conclusion, claimIds: ['c0','c1'], reasoning: proposal.reasoning,
    limitations: proposal.limitations, alternatives: proposal.alternatives, nextCheck: proposal.nextCheck };
  const run = wisdomFixture();
  assert.equal(attachCheckedInference(run,input,run.relations!),true);
  assert.equal(run.wisdom!.inferences.filter(i=>i.rule==='competing-explanation').length,1);
  assert.equal(attachCheckedInference(wisdomFixture(),input,[{from:'a',to:'missing',label:'invented'}]),false);
  assert.equal(attachCheckedInference(wisdomFixture(),{...input,claimIds:['c0','missing']},run.relations!),false);
  assert.equal(attachCheckedInference(wisdomFixture(),{...input,claimIds:['c0','c0']},run.relations!),false);
});


test('review refreshes graph when the last low-confidence premise is upgraded', () => {
  let run = wisdomFixture();
  run = applyReview(run, { claimId: 'c0', action: 'independence', evidenceIds: ['e0'], independent: true, expectedVersion: run.version, reason: '검증용 원출처 검토를 완료했습니다' });
  run = applyReview(run, { claimId: 'c1', action: 'independence', evidenceIds: ['e1'], independent: true, expectedVersion: run.version, reason: '검증용 다른 원출처 검토를 완료했습니다' });
  assert.equal(run.wisdom!.inferences[0].confidence, 'medium');
});
