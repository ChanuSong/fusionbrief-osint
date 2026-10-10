import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { researchedFramework, frameworkOutputs, frameworkPlan } from './fixtures/framework.ts';
import { finalizeFramework, computeCounts, frameworkDraftSchema, frameworkAuditSchema } from '../server/analysis-framework.ts';
import { applyReview, approveReport, exportMarkdown } from '../server/analysis.ts';
import { revalidateFramework } from '../server/framework-revalidation.ts';
import { openStore } from '../server/store.ts';
import { reportContent } from '../shared/report-content.ts';
import { research } from '../server/research.ts';

const criterion = (run: Awaited<ReturnType<typeof researchedFramework>>['run'], id: string) => run.analysis!.assessments.find(a => a.criterionId === id)!;
test('a verified bounded inconclusive lead keeps its factual citations and material critical gaps', async () => {
  const { run, f } = await researchedFramework();
  const draft = frameworkDraftSchema.parse(f.report.analysis); draft.judgment.status = 'undetermined';
  draft.judgment.text = '훈련 구역 예고는 확인했지만 실제 접근 차단은 확인하지 못했습니다.';
  const result = finalizeFramework(frameworkPlan, run.analysis!.criteria, draft, frameworkAuditSchema.parse(f.frameworkAudit), run, [], []);
  assert.equal(result.judgment.text, draft.judgment.text);
  assert.deepEqual(result.judgment.claimIds, ['notice-claim']);
  assert.equal(result.judgment.confidence.level, 'undetermined');
  assert.ok(result.judgment.limitations.some(l => l.includes('실효적 접근 차단')));
});
test('forecast indicators cannot be met by an audited counter-observation alone',async()=>{
  const {run,f}=await researchedFramework({actual:true});
  const plan=structuredClone(frameworkPlan);plan.dimension='forecast';plan.criteria[0].dimension='forecast';
  const criteria=structuredClone(run.analysis!.criteria);criteria[0].dimension='forecast';
  const draft=frameworkDraftSchema.parse(f.report.analysis);
  draft.observations.filter(o=>o.criterionIds.includes('access')).forEach(o=>{o.criterionEffects=o.criterionIds.map(id=>({criterionId:id,direction:'contradicts',concrete:true}));});
  const audit=frameworkAuditSchema.parse(f.frameworkAudit);audit.observations.forEach(o=>{o.effectsAccurate=true;});
  const result=finalizeFramework(plan,criteria,draft,audit,run,[],[]);
  assert.equal(result.assessments.find(a=>a.criterionId==='access')!.status,'unknown');assert.equal(result.counts.events,0);
});
test('criteria are collected and independently verified before events; old manuals and advance notices survive the event window', async () => {
  const { run, calls } = await researchedFramework();
  assert.ok(calls.indexOf('search:framework') < calls.indexOf('search:event'));
  const basisCheck = calls.findIndex(c => c.includes('Independently audit every definition'));
  assert.ok(basisCheck >= 0 && basisCheck < calls.indexOf('search:event'));
  assert.ok(run.sources.some(s => s.id === 'manual' && s.publishedAt === '1994-01-01'));
  assert.ok(run.sources.some(s => s.id === 'notice' && s.publishedAt === '2026-09-30'));
  assert.equal(run.analysis!.sourcePolicies.find(p => p.sourceId === 'manual')?.purpose, 'framework');
  assert.equal(run.analysis!.sourcePolicies.find(p => p.sourceId === 'notice')?.purpose, 'event');
  assert.equal(run.analysis!.criteria.find(c => c.id === 'access')!.basis[0].versionStatus, 'verified');
  assert.equal(run.analysis!.judgment.status, 'undetermined');
  assert.equal(run.answer!.paragraphs[0].text, run.analysis!.judgment.text);
});
test('an announcement is not execution; a critical unknown holds an optimistic generated conclusion', async () => {
  const { run } = await researchedFramework({ announcedAsMet: true });
  assert.equal(criterion(run, 'deployment').status, 'unknown');
  assert.equal(run.analysis!.counts.events, 0);
  assert.equal(run.analysis!.counts.announced, 1);
  assert.equal(run.analysis!.counts.met, 0);
  assert.equal(run.analysis!.judgment.confidence.level, 'undetermined');
  assert.ok(run.analysis!.judgment.limitations.some(l => l.includes('실효적 접근 차단')));
});
test('actual occurrence can be supported without asserting legal compliance; confidence is capped by fact premises', async () => {
  const { run } = await researchedFramework({ actual: true, legalAsMet: true });
  assert.equal(criterion(run, 'access').status, 'met');
  assert.equal(criterion(run, 'civilian').status, 'unknown');
  assert.equal(run.analysis!.judgment.status, 'supported');
  assert.equal(run.analysis!.judgment.confidence.level, 'medium');
  assert.equal(run.analysis!.counts.events, 1);
  assert.equal(run.analysis!.counts.met, 1);
  assert.equal(run.analysis!.counts.announced, 1);
});
test('historical event evidence remains a precedent and cannot establish an in-window occurrence', async () => {
  const { run } = await researchedFramework({ actual: true, historical: true });
  assert.equal(run.analysis!.sourcePolicies.find(p => p.sourceId === 'historic')?.purpose, 'precedent');
  assert.ok(run.sources.some(s => s.id === 'historic'));
  assert.ok(!run.claims.some(c => c.id === 'access-claim'));
  assert.equal(run.analysis!.counts.events, 0);
  assert.equal(run.analysis!.judgment.status, 'undetermined');
});
test('authority misclassification and duplicate norm audit verdicts fail closed', async () => {
  for (const options of [{ rejectBasis: true }, { duplicateBasis: true }]) {
    const { run } = await researchedFramework({ actual: true, ...options });
    assert.equal(run.analysis!.criteria.find(c => c.id === 'access')!.basisStatus, 'unavailable');
    assert.equal(criterion(run, 'access').status, 'unknown');
    assert.equal(run.analysis!.judgment.status, 'undetermined');
  }
});
test('duplicate event audit verdicts cannot certify claims or observations', async () => {
  const { run } = await researchedFramework({ duplicateVerdict: true });
  assert.equal(run.claims.length, 0);
  assert.equal(run.analysis!.observations.length, 0);
});
test('normal operations and contextual allegations never count as performed supporting behaviors',async()=>{
  const {run}=await researchedFramework({actual:true});
  const f=run.analysis!;
  for(const o of f.observations) o.criterionEffects=o.criterionIds.map(criterionId=>({criterionId,direction:'contradicts',concrete:true}));
  assert.equal(computeCounts(f,run).events,0);
  for(const o of f.observations) o.criterionEffects=o.criterionIds.map(criterionId=>({criterionId,direction:'supports',concrete:false}));
  assert.equal(computeCounts(f,run).events,0);
});
test('an incomplete framework audit cannot be approved as verified',async()=>{
  const {run}=await researchedFramework({noDraft:true});
  assert.equal(run.analysis!.verification,'incomplete');
  assert.throws(()=>approveReport(run,{expectedVersion:run.version,reviewer:'검증자',decision:'approved',reason:'인용은 확인했지만 분석 검증은 누락'}),/재검증/);
});
test('missing structured analysis is a held judgment, never an article-summary fallback', async () => {
  const { run } = await researchedFramework({ noDraft: true });
  assert.equal(run.analysis!.judgment.status, 'undetermined');
  assert.ok(run.answer!.paragraphs[0].text.includes('확정할 수 없습니다'));
  assert.equal(run.analysis!.observations.length, 0);
});
test('duplicate criterion IDs, unknown claim references and positive rejection of a critical premise cannot produce a supported conclusion', async () => {
  const { run } = await researchedFramework({ actual: true });
  const f = frameworkOutputs({ actual: true });
  const draft = f.report.analysis!;
  draft.assessments.push({ ...draft.assessments[0] });
  let result = finalizeFramework(frameworkPlan, run.analysis!.criteria, draft as never, f.frameworkAudit, run, []);
  assert.equal(result.judgment.status, 'undetermined');
  draft.assessments.pop(); draft.judgment.claimIds.push('fabricated');
  result = finalizeFramework(frameworkPlan, run.analysis!.criteria, draft as never, f.frameworkAudit, run, []);
  assert.equal(result.judgment.status, 'undetermined');
  draft.judgment.claimIds.pop(); draft.assessments[0].status = 'not-met';
  result = finalizeFramework(frameworkPlan, run.analysis!.criteria, draft as never, f.frameworkAudit, run, []);
  assert.equal(result.judgment.status, 'undetermined');
});
test('audited equivalent event reports are one event; announcement and article counts remain separate units', async () => {
  const { run } = await researchedFramework({ actual: true });
  const f = run.analysis!;
  f.observations.push({ ...f.observations.find(o => o.id === 'denial')!, id: 'copy', eventKey: 'other publisher report', sameEventAs: 'denial' });
  const n = computeCounts(f, run);
  assert.equal(n.events, 1); assert.equal(n.reported, 1); assert.equal(n.announced, 1); assert.equal(n.total, 2);
});
test('reviews invalidate framework approval and main counts; fresh independent revalidation can restore a bounded judgment', async () => {
  const { run } = await researchedFramework({ actual: true });
  const reviewed = applyReview(run, { expectedVersion: run.version, claimId: 'access-claim', action: 'independence', evidenceIds: ['access-claim-e1'], independent: true, reason: '가상 항만 당국의 독립 관측 관계 확인' });
  assert.equal(reviewed.analysis!.verification, 'pending');
  assert.equal(reviewed.analysis!.counts.met, 0);
  assert.equal(reportContent(reviewed).observations.length, 0);
  assert.throws(() => approveReport(reviewed, { expectedVersion: reviewed.version, reviewer: '검증자', decision: 'approved', reason: '판단 기준 검토 완료' }), /재검증/);
  const f = frameworkOutputs({ actual: true }); const responses = [f.report.analysis, f.frameworkAudit];
  const rechecked = await revalidateFramework(reviewed, { async generate(schema) { return schema.parse(responses.shift()); } });
  assert.equal(rechecked.analysis!.verification, 'verified'); assert.equal(rechecked.analysis!.judgment.status, 'supported');
  assert.equal(rechecked.analysis!.counts.met, 1); assert.equal(rechecked.version, 3);
  assert.equal(approveReport(rechecked, { expectedVersion: 3, reviewer: '검증자', decision: 'approved', reason: '재검증한 기준 대조 확인' }).version, 4);
});
test('an origin review of a forecast-only premise also invalidates the report and removes its outlook',async()=>{
  const {run}=await researchedFramework({actual:true});
  run.analysis!.observations=run.analysis!.observations.filter(o=>!o.claimIds.includes('notice-claim'));
  run.analysis!.assessments.forEach(a=>{a.claimIds=a.claimIds.filter(id=>id!=='notice-claim');});
  run.analysis!.judgment.claimIds=run.analysis!.judgment.claimIds.filter(id=>id!=='notice-claim');
  run.analysis!.outlook=[{label:'조건부 전망',text:'예고가 시행될 수 있음',claimIds:['notice-claim'],criterionIds:[],confidence:{level:'low',reason:'조건부'},horizon:'다음 달',likelihood:'plausible',assumptions:[],indicators:[{direction:'strengthens',signal:'새 관측'}]}];
  const reviewed=applyReview(run,{expectedVersion:run.version,claimId:'notice-claim',action:'independence',evidenceIds:['notice-claim-e1'],independent:false,reason:'검증 전용 전망 전제 재검토'});
  assert.equal(reviewed.analysis!.verification,'pending');assert.deepEqual(reviewed.analysis!.outlook,[]);
});
test('framework reports persist exact normative quotes and stale revalidation cannot overwrite a review', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'trace-framework-'));
  try {
    const store = await openStore(join(folder, 'store.json')); const { run } = await researchedFramework({ actual: true }); await store.add(run);
    const reviewed = await store.review(run.id, { expectedVersion: 1, claimId: 'access-claim', action: 'independence', evidenceIds: ['access-claim-e1'], independent: true, reason: '가상 자료의 독립 관측 검토' });
    const stale = structuredClone(run); stale.version = 2;
    await assert.rejects(store.replace(run.id, 1, stale), /변경/);
    const reopened = await openStore(join(folder, 'store.json')); assert.deepEqual(reopened.get(run.id).analysis, reviewed.analysis);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test('HTML and Markdown omit empty inventories but preserve material unknowns and criterion citations', async () => {
  const { run } = await researchedFramework(); const content = reportContent(run);
  assert.equal(content.relationships, false); assert.equal(content.comparison, false); assert.equal(content.locations.length, 0);
  assert.ok(!content.criteria.some(c => c.id === 'missing-rule'));
  assert.ok(content.criteria.some(c => c.id === 'access'));
  const md = exportMarkdown(run);
  assert.ok(md.indexOf('## 핵심 판단') < md.indexOf('## 판단 기준과 사건 대조'));
  assert.ok(md.includes('Edition 1994') || md.includes('판본 1994'));
  assert.ok(md.includes('실효적 접근 차단'));
  assert.ok(!md.includes('## 사건 순서')); assert.ok(!md.includes('## 당사자 기준과 입장'));
  assert.ok(!md.includes('추론이 아직 없습니다'));
});
test('an evaluative question cannot silently run with a fact-only plan', async () => {
  const f = frameworkOutputs(); const { analysis: _unused, ...plan } = f.plan;
  await assert.rejects(research({ question: '봉쇄가 개시되었는가?', mode: 'live', languages: ['ko', 'en'] }, () => {}, {
    model: { async generate(schema) { return schema.parse(plan); } }, async search() { throw new Error('unexpected'); }, async read() { throw new Error('unexpected'); }
  }), /판단 기준/);
});

test('long manual retrieval selects the substantive numbered rule beyond 400,000 characters rather than its table of contents', async () => {
  const { documentExcerpts } = await import('../server/research-coverage.ts');
  const { normative } = await import('./fixtures/framework.ts');
  const rule = '7.7.2.3 Effectiveness. An effective blockade must actually prevent access to the port.';
  const body = 'Table of contents: 7.7.2.3 Effectiveness ............................................. 7-10. '
    + 'Other naval operations and general introductory context. '.repeat(11000) + rule;
  const excerpts = documentExcerpts({ ...normative, body }, 'NWP 7.7.2.3 effectiveness blockade', 6);
  assert.ok(body.indexOf(rule) > 400000);
  assert.ok(excerpts.some(e => e.includes(rule)));
  assert.ok(excerpts.every(e => body.includes(e)));
});

test('a definition with omitted conditions is repaired from original sources and must pass a second independent audit', async () => {
  const { run, calls } = await researchedFramework({ actual: true, repairDefinition: true });
  assert.equal(run.analysis!.criteria.find(c => c.id === 'access')!.basisStatus, 'verified');
  assert.equal(calls.filter(c => c.includes('Independently audit every definition')).length, 2);
  assert.ok(run.analysis!.rejected.some(r => r.includes('기준 보완 전')));
  assert.equal(run.analysis!.judgment.status, 'supported');
});
