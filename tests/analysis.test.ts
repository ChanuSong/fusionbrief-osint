import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Dataset, Evidence, SourceDocument } from '../shared/types.ts';
import { analyze, applyReview, validEvidence, validateInput, InputError, exportMarkdown } from '../server/analysis.ts';
import { openStore } from '../server/store.ts';

const dataset = JSON.parse(await readFile(new URL('../data/freedom-edge.json', import.meta.url), 'utf8')) as Dataset;
const input = { question: '참가국을 확인하는 근거는 몇 묶음인가?', mode: 'snapshot' as const };

test('prepared public corpus has real URLs, valid offsets and content hashes', () => {
  assert.equal(dataset.sources.length, 8);
  assert.equal(dataset.evidence.length, 22);
  for (const ev of dataset.evidence) assert.ok(validEvidence(ev, dataset.sources.find(s => s.id === ev.sourceId)), ev.id);
  assert.ok(dataset.sources.some(s => s.language === 'ko'));
  assert.ok(dataset.sources.some(s => s.type === 'official'));
  assert.ok(dataset.sources.some(s => s.type === 'news'));
});

test('different publishers do not establish independent corroboration', () => {
  const run = analyze(dataset, input);
  assert.equal(run.claims.length, 1);
  const c = run.claims[0];
  assert.equal(c.documentCount, 8);
  assert.equal(c.groups.length, 4);
  assert.equal(c.independentCount, 0);
  assert.equal(c.status, 'independence-pending');
  assert.equal(c.groups.find(g => g.id === 'joint-june27')?.evidenceIds.length, 4);
});

test('adding another repost increases document count, not origin or independence count', () => {
  const next = structuredClone(dataset);
  const doc = next.sources.find(s => s.id === 'navy')!;
  next.sources.push({ ...doc, id: 'repost-fixture', publisher: '검증용 재게시 fixture' });
  const ev = next.evidence.find(e => e.id === 'navy-participants')!;
  next.evidence.push({ ...ev, id: 'repost-fixture-participants', sourceId: 'repost-fixture' });
  const c = analyze(next, input).claims[0];
  assert.equal(c.documentCount, 9);
  assert.equal(c.groups.length, 4);
  assert.equal(c.independentCount, 0);
});

test('invalid source offsets are excluded instead of becoming report citations', () => {
  const next = structuredClone(dataset);
  next.evidence.find(e => e.id === 'navy-participants')!.start += 1;
  const run = analyze(next, input);
  assert.ok(!run.evidence.some(e => e.id === 'navy-participants'));
  assert.ok(run.gaps.some(g => g.includes('검증에 실패')));
  assert.ok(!exportMarkdown(run).includes('[US Navy]'));
});

test('splitting a repost does not declare it independent', () => {
  const original = analyze(dataset, input);
  const run = applyReview(original, { claimId: 'participants', action: 'split', evidenceIds: ['navy-participants'],
    reason: '검증용: 별도 원출처 여부를 다시 확인해야 함', expectedVersion: 1 });
  assert.equal(run.claims[0].groups.length, 5);
  assert.equal(run.claims[0].independentCount, 0);
  assert.equal(run.claims[0].status, 'independence-pending');
  assert.equal(original.version, 1);
  assert.equal(original.claims[0].groups.length, 4);
  assert.equal(run.version, 2);
});

test('merging source origins changes only the reviewed claim and creates an audit event', () => {
  const original = analyze(dataset, { ...input, question: '프리덤 에지 일정과 참가국을 알려줘' });
  const run = applyReview(original, { claimId: 'participants', action: 'merge',
    evidenceIds: ['kbs-start-participants', 'stripes-participants'], reason: '검증용: 두 발표가 같은 원문에 의존함을 확인', expectedVersion: 1 });
  assert.equal(run.claims.find(c => c.id === 'participants')!.groups.length, 3);
  assert.deepEqual(run.claims.find(c => c.id === 'schedule'), original.claims.find(c => c.id === 'schedule'));
  assert.equal(run.reviews.length, 1);
  assert.equal(run.stats.groups, original.stats.groups - 1);
});

test('merging two groups containing reposts merges all members, never increases group count', () => {
  const original = analyze(dataset, input);
  const run = applyReview(original, { claimId: 'participants', action: 'merge',
    evidenceIds: ['navy-participants', 'kbs-end-participants'], reason: '검증용: 두 원출처 묶음 전체를 하나로 병합', expectedVersion: 1 });
  assert.equal(run.claims[0].groups.length, 3);
  assert.equal(run.reviews[0].evidenceIds.length, 6);
  assert.equal(run.claims[0].groups.flatMap(g => g.evidenceIds).length, 8);
});

test('two explicitly reviewed independent groups enable corroboration and remove resolved gaps', () => {
  let run = analyze(dataset, input);
  for (const id of ['navy-participants', 'kbs-start-participants']) {
    run = applyReview(run, { claimId: 'participants', action: 'independence', evidenceIds: [id],
      independent: true, reason: '검증용 fixture: 별개의 직접 근거 확인', expectedVersion: run.version });
  }
  assert.equal(run.claims[0].status, 'corroborated');
  assert.equal(run.claims[0].independentCount, 2);
  assert.ok(!run.gaps.some(g => g.startsWith('발표·보도 간 독립성')));
  assert.equal(run.reviews.length, 2);
});

test('conflicting values take precedence over support count', () => {
  const next = structuredClone(dataset);
  const quote = 'Synthetic test only: Canada took part.';
  const source: SourceDocument = { ...next.sources[0], id: 'conflict-fixture', body: quote,
    hash: createHash('sha256').update(quote).digest('hex') };
  const evidence: Evidence = { ...next.evidence.find(e => e.claimId === 'participants')!, id: 'conflict-evidence',
    sourceId: source.id, quote, start: 0, end: quote.length, value: '검증용: 캐나다', originId: 'conflict-origin', independence: 'verified' };
  next.sources.push(source); next.evidence.push(evidence);
  assert.equal(analyze(next, input).claims[0].status, 'conflicting');
});

test('unavailable questions and latest-event requests do not return historical factual answers', () => {
  for (const question of ['프리덤 에지의 총 비용은 얼마인가?', '2026년 최신 프리덤 에지 참가국', '서울에서 맛있는 식당 추천', '림팩 훈련의 참가국은?', '2023년 훈련 일정은?']) {
    const run = analyze(dataset, { ...input, question });
    assert.equal(run.scope, 'unsupported');
    assert.equal(run.claims.length, 0);
    assert.equal(run.evidence.length, 0);
    assert.ok(run.gaps.length);
  }
});

test('publication date filter removes out-of-period evidence', () => {
  const run = analyze(dataset, { ...input, startDate: '2024-06-29', endDate: '2024-06-29' });
  assert.equal(run.sources.length, 2);
  assert.equal(run.claims[0].groups.length, 1);
  assert.equal(run.claims[0].status, 'single-origin');
  const empty = analyze(dataset, { ...input, startDate: '2025-01-01', endDate: '2025-01-31' });
  assert.equal(empty.stats.citations, 0);
  assert.equal(empty.claims[0].status, 'insufficient');
});

test('malformed requests and stale review versions are rejected', () => {
  for (const value of [{ ...input, question: '' }, { ...input, mode: 'unknown' }, { ...input, startDate: '2024-02-31' },
    { ...input, startDate: '2024-07-01', endDate: '2024-06-01' }]) assert.throws(() => validateInput(value), InputError);
  assert.throws(() => applyReview(analyze(dataset, input), { action: 'split', claimId: 'participants',
    evidenceIds: ['navy-participants'], reason: '검증용으로 충분한 검토 이유', expectedVersion: 0 }), (e: unknown) => e instanceof InputError && e.status === 409);
});

test('report separates system summary from quoted findings and records citation checks', () => {
  const run = analyze(dataset, { ...input, question: '프리덤 에지의 일정, 참가국, 발표 목적을 정리해줘.' });
  assert.deepEqual(run.facets, ['schedule', 'participants', 'purpose']);
  assert.equal(run.collectedAt, dataset.collectedAt);
  assert.deepEqual(run.citationCheck, { checked: 16, passed: 16, rejected: 0 });
  assert.match(run.summary.headline, /공개 문서 8건/);
  assert.match(run.summary.headline, /독립성이 확인된 원출처는 아직 없습니다/);
  assert.equal(run.summary.findings.length, 3);
  assert.ok(run.stages.length >= 4 && run.stages.every(s => s.durationMs >= 0));
  const md = exportMarkdown(run);
  for (const text of ['## 핵심 요약', '시스템 해석', '독립성 미확인', '해석: 한국·미국·일본', '16/16']) assert.ok(md.includes(text), text);
});

test('independence review keeps the original grouping reason and refreshes the summary', () => {
  let run = analyze(dataset, input);
  const before = run.claims[0].groups.find(g => g.id === 'joint-june27')!.reason;
  for (const id of ['navy-participants', 'kbs-start-participants']) {
    run = applyReview(run, { claimId: 'participants', action: 'independence', evidenceIds: [id],
      independent: true, reason: '검증용 fixture: 별개의 직접 근거 확인', expectedVersion: run.version });
  }
  const group = run.claims[0].groups.find(g => g.id === 'joint-june27')!;
  assert.equal(group.reason, before);
  assert.equal(group.independenceReason, '검증용 fixture: 별개의 직접 근거 확인');
  assert.match(run.summary.assessment, /모든 판단이 독립성이 확인된/);
});

test('missing evidence is not reported as an independence problem, and unsupported questions explain why', () => {
  const empty = analyze(dataset, { ...input, startDate: '2025-01-01', endDate: '2025-01-31' });
  assert.ok(!empty.gaps.some(g => g.startsWith('발표·보도 간 독립성')));
  assert.ok(empty.gaps.some(g => g.includes('원문 근거를 찾지 못했습니다')));
  assert.equal(empty.summary.findings.length, 0);
  assert.ok(analyze(dataset, { ...input, question: '림팩 훈련의 참가국은?' }).gaps[0].includes('다른 훈련'));
  assert.ok(analyze(dataset, { ...input, question: '프리덤 에지의 총 비용은?' }).gaps[0].includes('비용'));
});

test('older stored runs without summary fields are upgraded on load', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-legacy-'));
  try {
    const path = join(directory, 'store.json');
    const legacy = analyze(dataset, input) as Partial<ReturnType<typeof analyze>>;
    delete legacy.summary; delete legacy.citationCheck; delete legacy.facets; delete legacy.collectedAt;
    await writeFile(path, JSON.stringify({ schema: 1, runs: [legacy] }));
    const store = await openStore(path);
    const run = store.get(legacy.id!);
    assert.deepEqual(run.facets, ['participants']);
    assert.ok(run.summary.headline.length > 0);
    assert.equal(run.citationCheck.passed, run.evidence.length);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('report and review survive store reopening, concurrent stale edits cannot overwrite them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-store-'));
  try {
    const path = join(directory, 'store.json');
    const store = await openStore(path);
    const run = await store.add(analyze(dataset, input));
    const edit = { claimId: 'participants', action: 'split' as const, evidenceIds: ['navy-participants'], reason: '검증용: 출처 관계를 재검토하기 위해 분리', expectedVersion: 1 };
    const results = await Promise.allSettled([store.review(run.id, edit), store.review(run.id, edit)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const reopened = await openStore(path);
    assert.equal(reopened.get(run.id).version, 2);
    assert.equal(reopened.get(run.id).reviews.length, 1);
    assert.equal(reopened.get(run.id).claims[0].groups.length, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
