import { createHash } from 'node:crypto';
import type { AnalysisInput, FrameworkPlan, SourceDocument } from '../../shared/types.ts';
import { research, type ResearchDependencies } from '../../server/research.ts';
import { MODULE_IDS } from '../../shared/source-modules.ts';

/** Synthetic normative and event texts used only by automated tests. */
export const frameworkPlan: FrameworkPlan = {
  proposition: '검증용 항만의 실제 접근 차단이 개시되었다', dimension: 'occurrence', criteria: [
    { id: 'access', label: '실효적 접근 차단', question: '선박의 항만 접근이 실제 차단되었는가?', dimension: 'occurrence', perspective: '관측 기준', critical: true, behavioral: true, observations: ['날짜·항만·선박이 특정된 실제 통항 거부'], counterEvidence: ['같은 기간 통항을 정상 허용한 관측'] },
    { id: 'deployment', label: '차단 전력의 실제 배치', question: '예고한 전력이 실제 배치되었는가?', dimension: 'occurrence', perspective: '관측 기준', critical: false, behavioral: true, observations: ['실제 배치 관측'], counterEvidence: ['미실시 또는 취소 확인'] },
    { id: 'civilian', label: '민간 보호 요건', question: '해당 무력충돌 규범이 적용되며 민간 보호를 충족하는가?', dimension: 'legality', perspective: '법적 요건', critical: true, behavioral: false, observations: ['적용 충돌 분류와 민간 피해 자료'], counterEvidence: ['적용 제외 근거 또는 위반 관측'] },
    { id: 'missing-rule', label: '공개되지 않은 대응 수칙', question: '공개 수칙이 존재하는가?', dimension: 'actor-position', perspective: '가상 국가', critical: false, behavioral: false, observations: ['공개 원본 수칙'], counterEvidence: ['공개 범위 제한 확인'] },
  ], queries: [{ module: 'official', language: 'en', query: 'synthetic normative manual criteria original' }],
};
function source(id: string, body: string, publishedAt: string): SourceDocument {
  return { id, body, hash: createHash('sha256').update(body).digest('hex'), publishedAt, title: `자동 검증 전용 가상 자료 ${id}`, publisher: `${id}.example.gov`,
    type: 'official', language: 'en', url: `https://${id}.example.gov/document`, retrievedAt: '2026-10-10T00:00:00Z', format: 'html', snapshotKind: 'document', verificationMethod: 'http' };
}
export const normative = source('manual', 'Synthetic Test Manual. Edition 1994. Section 4. Effective prevention of access requires actual denial of passage to a port. Section 5. An announcement of deployment does not demonstrate implemented deployment. Section 6. Civilian protection requirements are conditional on an applicable armed conflict regime.', '1994-01-01');
export const notice = source('notice', 'On 2026-09-30, Authority X announced a navigation warning for 2026-10-10. The notice describes planned exercise areas.', '2026-09-30');
export const interdiction = source('event', 'On 2026-10-10, port officials reported that Vessel V was turned away at Port P.', '2026-10-10');
export const historic = source('historic', 'On 2024-10-10, port officials reported that Vessel V was turned away at Port P.', '2024-10-10');
const basisQuotes = [
  'Effective prevention of access requires actual denial of passage to a port.',
  'An announcement of deployment does not demonstrate implemented deployment.',
  'Civilian protection requirements are conditional on an applicable armed conflict regime.',
];
export interface FixtureOptions { actual?: boolean; historical?: boolean; rejectBasis?: boolean; duplicateVerdict?: boolean; noDraft?: boolean; duplicateBasis?: boolean; announcedAsMet?: boolean; legalAsMet?: boolean; repairDefinition?: boolean; }
export function frameworkOutputs(options: FixtureOptions = {}) {
  const actual = !!options.actual;
  const eventSource = options.historical ? historic : interdiction;
  const sources = [normative, notice, ...(actual ? [eventSource] : [])];
  const plan = { topic: '검증용 봉쇄 질문', targets: ['접근 차단', '실시 예고'], scope: { geography: '가상 항만', period: '2026-10-10', task: 'event', assumptions: [], hypotheses: [] },
    strategy: { interpretation: '검증용 항만에서 실제 접근 거부가 시행되었는지, 예고와 구분하여 조사합니다.', decision: '실제 접근 차단 개시 여부', ambiguities: [],
      sourcePlan: MODULE_IDS.map(module=>({module,decision:['official','news'].includes(module) ? 'use' : 'irrelevant',reason:'이 가상 항만 검증에서는 공식 발표와 현장 보도의 대조가 필요합니다.'})),
      evidenceRequirements: [
        { target: '접근 차단', required: '날짜·선박·항만이 특정된 통항 거부', preferredSources: ['항만 당국의 관측', '현장 보도'], disconfirmingEvidence: '해당 기간 정상 통항의 관측' },
        { target: '실시 예고', required: '공개 예고의 원본과 실제 시행의 구별', preferredSources: ['항행 경고 원문'], disconfirmingEvidence: '취소 공지' },
      ], stages: [{ goal: '기준 원문 확보와 정의 검증', method: 'framework', completion: '정의와 적용 범위의 독립 대조' },
        { goal: '기준별 시행 사건 조사', method: 'event', completion: '날짜·행위의 원문 인용 확보' },
        { goal: '기준과 사건 교차 검증', method: 'cross-check', completion: '필수 전제의 충족 또는 정보 공백 확인' }],
      stoppingRule: '핵심 관측이 미확인이면 추가 조회 가능성을 확인하고 판단을 유보합니다.' },
    queries: [{ module: 'official', language: 'ko', query: '가상 항만 실제 차단' }, { module: 'news', language: 'en', query: 'synthetic port incident' }], analysis: frameworkPlan };
  const definitions = { criteria: frameworkPlan.criteria.slice(0, 3).map((c, i) => ({ criterionId: c.id, definition: basisQuotes[i], basisKind: 'published-rule',
    applicability: { status: i === 2 ? 'conditional' : 'unresolved', reason: '사건 근거로 적용 조건을 확인해야 합니다.' },
    basis: [{ sourceId: normative.id, quote: basisQuotes[i], translation: ['실제 통항 거부를 통해 접근 차단이 확인되어야 합니다.', '배치 예고는 실시를 입증하지 않습니다.', '민간 보호 규정은 적용 가능한 무력충돌 체계가 전제됩니다.'][i], locator: `Section ${i + 4}`, authority: 'expert-manual', version: '1994', versionQuote: 'Edition 1994.' }] })) };
  const basisAudit = { criteria: definitions.criteria.map(c => ({ criterionId: c.criterionId, definitionSupported: true, scopeAccurate: true, reason: '가상 기준의 원문 범위 확인' })),
    basis: definitions.criteria.map(c => ({ id: `${c.criterionId}-basis-1`, supportsDefinition: true, translationAccurate: true, authorityAccurate: !options.rejectBasis, locatorAccurate: true, versionAccurate: true, reason: '기준 원문 대조' })) };
  if (options.repairDefinition) basisAudit.criteria[0].definitionSupported = false;
  if (options.duplicateBasis) basisAudit.basis.push({ ...basisAudit.basis[0] });
  const rawClaims = [{ id: 'notice-claim', label: '훈련 구역 예고', target: '실시 예고', statement: '당국은 10월 10일의 훈련 구역을 예고했습니다.', entityIds: [], evidence: [{ sourceId: notice.id, quote: notice.body, translation: '당국 X는 2026년 9월 30일 10월 10일의 항행 경고를 발표했습니다. 이는 훈련 구역의 계획을 설명합니다.', stance: 'supports', value: '훈련 구역 예고', originURL: '', originQuote: '' }] },
    ...(actual ? [{ id: 'access-claim', label: '선박 접근 거부 보고', target: '접근 차단', statement: '항만 당국은 10월 10일 선박 V의 항만 P 접근을 거부했다고 보고했습니다.', entityIds: [], evidence: [{ sourceId: eventSource.id, quote: eventSource.body, translation: '2026년 10월 10일 항만 당국은 선박 V가 항만 P에서 접근을 거부당했다고 보고했습니다.', stance: 'supports', value: '접근 거부 보고', originURL: '', originQuote: '' }] }] : [])];
  const analysis = {
    assessments: frameworkPlan.criteria.map((c, i) => ({ criterionId: c.id, status: i === 0 && actual || i === 1 && options.announcedAsMet || i === 2 && options.legalAsMet ? 'met' : 'unknown',
      reasoning: i === 0 && actual ? '선박의 구체적인 접근 거부 보고가 있습니다.' : '실시 예고만으로 이 기준을 충족했는지 확인할 수 없습니다.',
      claimIds: i === 0 && actual ? ['access-claim'] : i === 1 || i === 2 && options.legalAsMet ? ['notice-claim'] : [], limitations: i === 0 && actual ? [] : ['추가 사건 근거가 필요합니다.'], nextCheck: c.observations[0],
      applicability: { status: i === 0 && actual ? 'confirmed' : 'conditional', reason: '사건 자료로 조건을 확인해야 합니다.' } })),
    observations: [{ id: 'announced', eventKey: 'X/exercise/port/2026-10-10/announcement', label: '당국의 훈련 구역 예고', criterionIds: ['deployment'], claimIds: ['notice-claim'], kind: 'announced' },
      ...(actual ? [{ id: 'denial', eventKey: 'V/denial/P/2026-10-10', label: '선박 V의 항만 P 접근 거부 보고', criterionIds: ['access'], claimIds: ['access-claim'], kind: 'reported' }] : [])],
    judgment: { text: '검증용 항만의 실제 접근 차단이 개시되었습니다.', status: 'supported', confidence: { level: 'high', reason: '가상 자료를 종합했습니다.' }, criterionIds: ['access'], claimIds: actual ? ['access-claim'] : ['notice-claim'], limitations: [] },
    perspectives: [], alternatives: [],
  };
  const coverage = { documents: sources.map(s => ({ sourceId: s.id, role: s.id === 'manual' ? 'framework' : 'direct', reason: '원문에서 관련 기간과 행위 확인', quote: s.body.slice(0, 180),
    ...(s.id !== 'manual' ? { eventPeriod: { start: s.id === 'historic' ? '2024-10-10' : '2026-10-10', end: s.id === 'historic' ? '2024-10-10' : '2026-10-10', quote: s.body, kind: s.id === 'notice' ? 'scheduled' : 'observed' } } : {}) })),
    coverage: [{ target: '접근 차단', status: actual ? 'answered' : 'partial', sourceIds: actual ? [eventSource.id] : [notice.id], reason: '현장 근거의 공개 범위에 따라 판단' }, { target: '실시 예고', status: 'answered', sourceIds: [notice.id], reason: '공개 예고 확인' }], nextQueries: [] };
  const report = { collectionAudit: coverage, analysis: options.noDraft ? undefined : analysis, claims: rawClaims, entities: [], assessments: [], gaps: [], events: [], locations: [], relations: [] };
  const verification = { documentVerdicts: sources.filter(s => s.id !== 'manual').map(s => ({ sourceId: s.id, temporalMatch: s.id !== 'historic', roleAccurate: true, reason: '원문의 사건 기간과 역할 확인' })), verdicts: rawClaims.map(c => ({ id: `${c.id}-e1`, verdict: 'supports', translationAccurate: !options.historical || c.id !== 'access-claim', reason: '가상 원문의 사건과 시점 확인' })),
    claimVerdicts: rawClaims.map(c => ({ claimId: c.id, grounded: true, evidenceIds: [`${c.id}-e1`], reason: '전체 사건 원문 대조' })) };
  if (options.duplicateVerdict) verification.verdicts.push({ ...verification.verdicts[0] });
  const frameworkAudit = { assessments: analysis.assessments.map(a => ({ criterionId: a.criterionId, supported: true, applicabilitySupported: a.criterionId !== 'civilian', reason: '가상 사건 대조' })),
    observations: analysis.observations.map(o => ({ id: o.id, supported: true, kindAccurate: true, eventIdentityAccurate: true, reason: '가상 행위 대조' })),
    judgment: { supported: true, reason: '통합 판단 대조' }, perspectives: [], alternatives: [] };
  return { plan, definitions, basisAudit, report, verification, frameworkAudit, sources };
}
export const frameworkInput: AnalysisInput = { question: '검증용 항만 봉쇄 개시 여부를 판단해줘.', mode: 'live', startDate: '2026-10-10', endDate: '2026-10-10', languages: ['ko', 'en'] };
export async function researchedFramework(options: FixtureOptions = {}) {
  const f = frameworkOutputs(options); const calls: string[] = []; const repairedAudit = structuredClone(f.basisAudit); repairedAudit.criteria[0].definitionSupported = true;
  const outputs = [f.plan, f.definitions, f.basisAudit, ...(options.repairDefinition ? [f.definitions, repairedAudit] : []), { queries: f.plan.queries.map(q => ({ ...q, purpose: 'event', criterionIds: ['access', 'deployment'] })) }, f.report, f.verification, f.frameworkAudit];
  const dependencies: ResearchDependencies = { model: { async generate(schema, instructions) { calls.push(instructions); return schema.parse(outputs.shift()); } },
    async search(q) { calls.push(`search:${q.purpose ?? 'event'}`); const docs = q.purpose === 'framework' ? [normative] : f.sources.filter(s => s.id !== 'manual');
      return docs.map(s => ({ url: s.url, title: s.title, language: s.language, module: q.module })); },
    async read(hit) { calls.push(`read:${hit.url}`); return structuredClone(f.sources.find(s => s.url === hit.url)!); } };
  const run = await research(frameworkInput, () => {}, dependencies);
  return { run, calls, f };
}
