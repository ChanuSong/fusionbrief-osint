import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CriterionBasis } from '../shared/types.ts';
import { openCriterionKnowledge, KNOWLEDGE_POLICY } from '../server/criterion-knowledge.ts';
import { frameworkInput, frameworkOutputs, normative, researchedFramework } from './fixtures/framework.ts';
import { collectFramework } from '../server/framework-research.ts';
import { research } from '../server/research.ts';
import { finalizeFramework, frameworkDraftSchema, frameworkAuditSchema } from '../server/analysis-framework.ts';
import { openStore } from '../server/store.ts';

const basis = (quote = 'Effective prevention of access requires actual denial of passage to a port.'): CriterionBasis => ({
  id: 'stored-basis', sourceId: normative.id, quote, translation: '', start: normative.body.indexOf(quote),
  end: normative.body.indexOf(quote) + quote.length, locator: 'Section 4', authority: 'expert-manual',
  version: '1994', versionStatus: 'verified', verified: true,
});
const date = () => new Date('2026-10-10T00:00:00Z');
test('reports persist references to immutable knowledge bodies and hydrate exact citation offsets on reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trace-report-knowledge-')); const archive = await openCriterionKnowledge(join(dir, 'knowledge.sqlite'), date);
  try {
    const { run } = await researchedFramework({ actual: true });
    const source = run.sources.find(s => s.id === normative.id)!;
    const stored = archive.preserve(source, run.analysis!.criteria.flatMap(c => c.basis), ['blockade'])!;
    run.sources = run.sources.map(s => s.id === source.id ? stored : s);
    const path = join(dir, 'runs.json'); const store = await openStore(path, archive); await store.add(run);
    const persisted = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(persisted.runs[0].sources[0].body, '');
    assert.equal(persisted.runs[0].sources[0].bodyStorage, 'criterion-knowledge');
    const reopened = await openStore(path, archive); const restored = reopened.get(run.id);
    assert.equal(restored.sources[0].body, normative.body); assert.equal(restored.sources[0].bodyStorage, undefined);
    const b = restored.analysis!.criteria[0].basis[0];
    assert.equal(restored.sources[0].body.slice(b.start, b.end), b.quote);
    await assert.rejects(() => openStore(path), /기준 지식 저장소를 함께 복원/);
  } finally { archive.close(); await rm(dir, { recursive: true, force: true }); }
});
test('normative snapshots persist across reopen; fresh source checks do not overwrite originals; changed editions coexist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trace-knowledge-')); const path = join(dir, 'knowledge.sqlite');
  let archive = await openCriterionKnowledge(path, date);
  try {
    const first = archive.preserve(normative, [basis()], ['접근 차단 봉쇄']);
    assert.equal(first?.knowledge?.refreshState, 'fresh');
    const rechecked = archive.preserve({ ...normative, retrievedAt: '2026-10-11T00:00:00Z' }, [basis()], ['봉쇄']);
    assert.equal(rechecked!.knowledge!.snapshotId, first!.knowledge!.snapshotId);
    assert.equal(archive.get(first!.knowledge!.snapshotId)!.retrievedAt, normative.retrievedAt);
    assert.equal(archive.get(first!.knowledge!.snapshotId)!.knowledge!.lastCheckedAt, '2026-10-11T00:00:00Z');
    const revised = { ...normative, body: normative.body.replace('Edition 1994.', 'Edition 2026.'), retrievedAt: '2026-10-12T00:00:00Z' };
    revised.hash = createHash('sha256').update(revised.body).digest('hex');
    const b = basis(); b.start = revised.body.indexOf(b.quote); b.end = b.start + b.quote.length; b.version = '2026';
    const second = archive.preserve(revised, [b], ['봉쇄']);
    assert.notEqual(second!.knowledge!.snapshotId, first!.knowledge!.snapshotId);
    archive.close(); archive = await openCriterionKnowledge(path, date);
    assert.equal(archive.catalog().documents.length, 2);
    assert.ok(archive.get(first!.knowledge!.snapshotId)!.body.includes('Edition 1994.'));
    assert.ok(archive.get(second!.knowledge!.snapshotId)!.body.includes('Edition 2026.'));
  } finally { archive.close(); await rm(dir, { recursive: true, force: true }); }
});
test('only audited intact normative quotes enter the reusable store; unknown edition never becomes verified', async () => {
  const archive = await openCriterionKnowledge(':memory:', date);
  try {
    assert.equal(archive.preserve(normative, [{ ...basis(), verified: false }], []), undefined);
    assert.equal(archive.preserve({ ...normative, body: `${normative.body} altered` }, [basis()], []), undefined);
    assert.equal(archive.preserve(normative, [{ ...basis(), authority: 'precedent' }], []), undefined);
    assert.equal(archive.preserve(normative, [{ ...basis(), start: 0 }], []), undefined);
    assert.equal(archive.catalog().documents.length, 0);
    const stored = archive.preserve(normative, [{ ...basis(), versionStatus: 'unconfirmed' }], []);
    assert.deepEqual(stored!.knowledge!.editions, []);
  } finally { archive.close(); }
});
test('cross-language search aliases and unsegmented Chinese retrieve originals without altering or merging their definitions', async () => {
  const archive = await openCriterionKnowledge(':memory:', date);
  try {
    archive.preserve(normative, [basis()], ['blockade']);
    assert.equal(archive.search(['봉쇄 기준'])[0].source.hash, normative.hash);
    const quote = '公开材料仅用于检索海警的登临检查规定，不能自动判断本次事件已发生。';
    const body = `这是人工验证专用的虚构规范测试文本。${quote}`;
    const source = { ...normative, id: 'chinese-rule', url: 'https://rule.example.gov/law', language: 'zh' as const, body,
      hash: createHash('sha256').update(body).digest('hex') };
    const b = { ...basis(), sourceId: source.id, quote, start: body.indexOf(quote), end: body.indexOf(quote) + quote.length };
    archive.preserve(source, [b], []);
    const hits = archive.search(['海警']);
    assert.equal(hits.length, 1); assert.equal(hits[0].source.body, body);
    assert.ok(hits[0].excerpts.every(e => body.slice(e.start, e.end) === e.text));
    assert.ok(!hits[0].source.knowledge!.editions.includes('latest'));
  } finally { archive.close(); }
});
test('FTS retrieves deep substantive clauses with exact offsets; source retention has no TTL', async () => {
  const archive = await openCriterionKnowledge(':memory:', () => new Date('2030-01-01'));
  try {
    const quote = '7.7.2.5 Limitations. A blockade may not deny access to neutral ports.';
    const body = `Contents\n7.7.2.5 Limitations .................................... 7-11\n${'Unrelated historical text. '.repeat(20000)}\n${quote}\n`;
    const source = { ...normative, body, hash: createHash('sha256').update(body).digest('hex') };
    const b = { ...basis(), quote, start: body.indexOf(quote), end: body.indexOf(quote) + quote.length, locator: '7.7.2.5', authority: 'doctrine' as const };
    const stored = archive.preserve(source, [b], ['limitations neutral ports']);
    const hits = archive.search(['7.7.2.5 limitations neutral ports']);
    assert.equal(hits.length, 1);
    assert.ok(hits[0].excerpts.some(e => e.locator === '7.7.2.5' && e.start > 400000 && e.text === quote));
    assert.ok(hits[0].excerpts.every(e => hits[0].source.body.slice(e.start, e.end) === e.text));
    assert.equal(stored!.knowledge!.refreshState, 'stale');
    assert.equal(archive.catalog().documents.length, 1);
    assert.doesNotThrow(() => archive.search(['" OR NEAR(*); DROP TABLE snapshots; --']));
    assert.equal(KNOWLEDGE_POLICY.doctrine, 90);
  } finally { archive.close(); }
});
test('second investigation reuses a fresh manual without fetching it, but reruns definitions and applicability audit', async () => {
  const archive = await openCriterionKnowledge(':memory:', date);
  try {
    const investigate = async () => {
      const f = frameworkOutputs({ actual: true }); const calls: string[] = [];
      const plan = { ...f.plan, strategy: { ...f.plan.strategy, evidenceRequirements: f.plan.strategy.evidenceRequirements.map(r => ({ ...r, disconfirmingEvidence: [r.disconfirmingEvidence, '검증 가능한 취소 또는 정상 통항 관측'] })) } };
      const outputs = [plan, f.definitions, f.basisAudit, { queries: f.plan.queries.map(q => ({ ...q, purpose: 'event', criterionIds: ['access'] })) }, f.report, f.verification, f.frameworkAudit];
      const run = await research(frameworkInput, () => {}, { knowledge: archive, requireStrategy: true,
        model: { async generate(schema, instructions) { calls.push(instructions); return schema.parse(outputs.shift()); } },
        async search(query) { return (query.purpose === 'framework' ? [normative] : f.sources.slice(1)).map(s => ({ url: s.url, title: s.title, language: s.language, module: query.module })); },
        async read(hit) { calls.push(`read:${hit.url}`); return structuredClone(f.sources.find(s => s.url === hit.url)!); } });
      return { run, calls };
    };
    const first = await investigate(); const second = await investigate();
    assert.ok(first.calls.includes(`read:${normative.url}`));
    assert.ok(!second.calls.includes(`read:${normative.url}`));
    assert.ok(second.calls.some(c => c.includes('Independently audit every definition')));
    assert.equal(second.run.sources.find(s => s.id === normative.id)!.knowledge!.reuse, 'reused');
    assert.equal(second.run.analysis!.judgment.status, 'supported');
    assert.ok(second.run.research!.strategy!.evidenceRequirements[0].disconfirmingEvidence.includes(' · 검증 가능한 취소'));
    assert.equal(archive.catalog().documents.length, 1);
  } finally { archive.close(); }
});
test('due manual refresh failure is explicit and cannot support current legal applicability even if a model approves it', async () => {
  const archive = await openCriterionKnowledge(':memory:', () => new Date('2027-10-10'));
  try {
    archive.preserve(normative, [basis()], ['synthetic normative manual criteria original']);
    const f = frameworkOutputs({ actual: true }); const outputs = [f.definitions, f.basisAudit]; let reads = 0;
    const sources: typeof f.sources = []; const collections: Awaited<ReturnType<typeof researchedFramework>>['run']['collections'] = [];
    const result = await collectFramework(f.plan.analysis, { knowledge: archive,
      model: { async generate(schema) { return schema.parse(outputs.shift()); } },
      async search() { return []; }, async read() { reads++; throw new Error('HTTP 403'); } }, () => {}, sources, collections, [], frameworkInput);
    assert.equal(reads, 1);
    assert.equal(sources[0].knowledge!.refreshState, 'refresh-failed');
    assert.ok(collections.some(c => c.state === 'snapshot-only'));
    assert.equal(result.criteria[0].basisStatus, 'verified');
    assert.equal(archive.get(sources[0].knowledge!.snapshotId)!.knowledge!.lastCheckedAt, normative.retrievedAt);
    const { run } = await researchedFramework({ actual: true });
    run.sources = sources.concat(run.sources.filter(s => s.id !== normative.id));
    const draft = frameworkDraftSchema.parse(f.report.analysis!); draft.assessments[2].status = 'met'; draft.assessments[2].claimIds = ['access-claim']; draft.assessments[2].applicability.status = 'confirmed';
    const audit = frameworkAuditSchema.parse(f.frameworkAudit); audit.assessments[2].applicabilitySupported = true;
    const checked = finalizeFramework(f.plan.analysis, result.criteria, draft, audit, run, [], []);
    assert.equal(checked.assessments[2].status, 'unknown');
  } finally { archive.close(); }
});
