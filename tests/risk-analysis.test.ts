import test from 'node:test';
import assert from 'node:assert/strict';
import { riskAudit, riskDraft, researchedRisk } from './fixtures/risk.ts';
import { finalizeRisk, requiresRisk } from '../server/risk-analysis.ts';
import { applyReview, approveReport, exportMarkdown } from '../server/analysis.ts';
import { buildAnalysisOntology, ontologyJSONLD } from '../shared/analysis-ontology.ts';

test('risk requested in natural Korean is recognized without affecting the succession-only question', () => {
  for (const q of ['한반도 긴장 고조 위험은?', '위험 수준과 추가 액션', 'DMZ 접경 위험도', 'Assess escalation risk']) assert.ok(requiresRisk(q));
  assert.ok(!requiresRisk('김주애의 북한 후계자 계승 가능성은?'));
});
test('a grounded risk remains separate from confidence, links to exact quotes, and exports as a recommendation', async () => {
  const run = await researchedRisk();
  assert.equal(run.risk!.overall.level, 'elevated');
  assert.equal(run.risk!.overall.confidence.level, 'medium');
  const graph = buildAnalysisOntology(run);
  assert.ok(graph.validation.conforms);
  const json = JSON.stringify(ontologyJSONLD(graph));
  assert.ok(json.includes('RiskAssessment') && json.includes('RecommendedAction'));
  assert.ok(json.includes('executed') && json.includes('false'));
  const md = exportMarkdown(run);
  assert.ok(md.includes('종합 위험도: 상승') && md.includes('권장 추가 액션') && md.includes('24시간 내'));
});
test('unsupported scopes and unknown or corrupted premises never become a green risk or an actionable suggestion', async () => {
  for (const failure of ['scope', 'claim', 'hash', 'criterion']) {
    const run = await researchedRisk(); const draft = structuredClone(riskDraft); const audit = structuredClone(riskAudit);
    if (failure === 'scope') audit.horizonSupported = false;
    if (failure === 'hash') run.sources.find(s => s.id === 'event')!.hash = 'corrupted';
    if (failure === 'claim') for (const item of [draft.overall, ...draft.items, ...draft.actions]) item.claimIds = ['absent-claim'];
    if (failure === 'criterion') for (const item of [draft.overall, ...draft.items, ...draft.actions]) item.criterionIds = ['absent-criterion'];
    const result = finalizeRisk(run, draft, audit);
    assert.equal(result.overall.level, 'unassessed');
    assert.equal(result.overall.confidence.level, 'undetermined');
    assert.equal(result.actions.length, 0);
    assert.equal(result.items.length, 0);
  }
});
test('duplicate verdicts and colliding risk IDs cannot certify items or advice', async () => {
  const run = await researchedRisk(); const draft = structuredClone(riskDraft); const audit = structuredClone(riskAudit);
  audit.actions.push({ ...audit.actions[0] });
  draft.items[0].id = draft.overall.id;
  const result = finalizeRisk(run, draft, audit);
  assert.equal(result.items.length, 0); assert.equal(result.actions.length, 0);
  run.risk!.items[0].id = run.risk!.overall.id;
  assert.ok(!buildAnalysisOntology(run).validation.conforms);
});
test('an original-source review holds risk, advice and approval until new evidence verification', async () => {
  const run = await researchedRisk();
  const changed = applyReview(run, { expectedVersion: run.version, claimId: 'access-claim', action: 'independence', evidenceIds: ['access-claim-e1'], independent: true, reason: '검증용 독립성 변경과 위험 판단 재평가' });
  assert.equal(changed.risk!.verification, 'pending');
  const md = exportMarkdown(changed);
  assert.ok(md.includes('위험도: **판단 유보**')); assert.ok(!md.includes('## 권장 추가 액션'));
  assert.throws(() => approveReport(changed, { expectedVersion: changed.version, decision: 'approved', reviewer: '검증자', reason: '검증 전 위험도 승인 차단' }), /재검증/);
});
