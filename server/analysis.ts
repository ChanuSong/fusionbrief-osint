import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  AnalysisInput, AnalysisRun, AnalyzedClaim, Dataset, Evidence, EvidenceGroup,
  Review, ReviewInput, CollectionResult, Facet, SourceDocument, ReportAnswer, ReportApproval,
} from '../shared/types.ts';
import { STATUS_LABELS } from '../shared/types.ts';
import { refreshWisdom } from './wisdom.ts';
import { invalidateFramework } from './analysis-framework.ts';
import { exportFramework } from './framework-export.ts';
import { buildAnalysisOntology } from '../shared/analysis-ontology.ts';
import { applySourceQuality } from './source-quality.ts';

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateInput(value: unknown): AnalysisInput {
  if (!value || typeof value !== 'object') throw new InputError('질문을 입력해주세요.');
  const v = value as Record<string, unknown>;
  if (typeof v.question !== 'string' || !v.question.trim() || v.question.length > 1500)
    throw new InputError('질문은 1~1500자로 입력해주세요.');
  if (v.mode !== 'snapshot' && v.mode !== 'refresh' && v.mode !== 'live') throw new InputError('자료 모드를 확인해주세요.');
  if (v.sourcePolicy !== undefined && v.sourcePolicy !== 'all-public') throw new InputError('자료 조사 범위를 확인해주세요.');
  for (const key of ['startDate', 'endDate']) {
    if (v[key] !== undefined && (typeof v[key] !== 'string' || !validDate(v[key] as string)))
      throw new InputError('날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.');
  }
  const startDate = v.startDate as string | undefined;
  const endDate = v.endDate as string | undefined;
  if (startDate && endDate && startDate > endDate) throw new InputError('시작일은 종료일보다 늦을 수 없습니다.');
  if (v.languages !== undefined && (!Array.isArray(v.languages) || !v.languages.length || v.languages.length > 5
    || v.languages.some(l => !['ko', 'en', 'zh', 'ja', 'ru'].includes(String(l))))) throw new InputError('수집 언어를 확인해주세요.');
  if (v.urls !== undefined && (!Array.isArray(v.urls) || v.urls.length > 5 || v.urls.some(url => {
    try { const u = new URL(String(url)); return typeof url !== 'string' || u.protocol !== 'https:' || !!u.username || !!u.password; } catch { return true; }
  }))) throw new InputError('공개 HTTPS 원문 URL을 최대 5개 입력해주세요.');
  return { question: v.question.trim(), mode: v.mode, startDate, endDate,
    ...(v.languages ? { languages: v.languages as AnalysisInput['languages'] } : {}), ...(v.urls ? { urls: v.urls as string[] } : {}), ...(v.sourcePolicy ? { sourcePolicy: 'all-public' as const } : {}) };
}

export function validEvidence(e: Evidence, source: SourceDocument | undefined): boolean {
  if (!source || !e.quote || e.start < 0 || e.end <= e.start) return false;
  return source.body.slice(e.start, e.end) === e.quote
    && source.hash === createHash('sha256').update(source.body).digest('hex');
}

export function groupsForEvidence(evidence: Evidence[]): EvidenceGroup[] {
  const groups = new Map<string, EvidenceGroup>();
  for (const e of evidence) {
    // Unknown origin relationships stay separate, even when the proposed origin label matches.
    const key = e.originVerified ? e.originId : `unconfirmed-${e.id}`;
    const group = groups.get(key);
    if (group) {
      group.evidenceIds.push(e.id);
      if (e.independence !== 'verified') group.independence = 'unconfirmed';
    } else groups.set(key, { id: key, label: e.originLabel, evidenceIds: [e.id],
      originVerified: e.originVerified, independence: e.independence, reason: e.originReason });
  }
  return [...groups.values()];
}

export function evaluateClaim(claim: AnalyzedClaim, evidence: Evidence[], compareValues = true): AnalyzedClaim {
  const supporting = evidence.filter(e => e.stance === 'supports');
  const conflicting = evidence.some(e => e.stance === 'contradicts')
    || (compareValues && new Set(supporting.map(e => e.value)).size > 1);
  const supportedIds = new Set(supporting.map(e => e.id));
  const supportGroups = claim.groups.filter(g => g.evidenceIds.some(id => supportedIds.has(id)));
  const independentCount = supportGroups.filter(g => g.independence === 'verified').length;
  const documentCount = new Set(evidence.map(e => e.sourceId)).size;
  let status: AnalyzedClaim['status'] = 'insufficient';
  let reason = '이 질문을 뒷받침하는 원문 근거를 확보하지 못했습니다.';
  if (conflicting) {
    status = 'conflicting';
    reason = '같은 사건·조건의 근거가 일치하지 않습니다. 양쪽 원문을 검토해야 합니다.';
  } else if (independentCount >= 2) {
    status = 'corroborated';
    reason = `분석가가 독립성을 확인한 ${independentCount}개 근거 묶음이 일치합니다. 확보한 자료 범위의 판단입니다.`;
  } else if (supportGroups.length === 1 && supportGroups[0].originVerified) {
    status = 'single-origin';
    reason = `${documentCount}개 문서가 하나의 확인된 원출처에 의존합니다. 재인용은 독립 근거로 세지 않았습니다.`;
  } else if (supporting.length) {
    status = 'independence-pending';
    reason = `${documentCount}개 문서, ${supportGroups.length}개 근거 묶음을 확보했지만 묶음 간 독립성은 확인되지 않았습니다.`;
  }
  const statement = conflicting ? `자료 간 상충: ${[...new Set(evidence.map(e => e.value))].join(' / ')}`
    : supporting[0]?.value ?? '확보한 자료에서 확인할 수 없음';
  const hasOfficial = evidence.some(e => e.stance === 'supports' && e.originVerified);
  const level = status === 'corroborated' ? 'high' : status === 'conflicting' || status === 'insufficient' ? 'undetermined'
    : hasOfficial ? 'medium' : 'low';
  const confidence = { level, reason: level === 'high' ? '독립성이 확인된 복수 근거가 일치'
    : level === 'medium' ? '원문 기재는 확인되지만 독립 교차검증은 제한됨'
      : level === 'low' ? '원문은 있으나 출처 관계와 독립성 검토가 필요함' : '원문 부족 또는 상충으로 확정할 수 없음' } as const;
  return { ...claim, statement, status, reason, documentCount, independentCount, confidence };
}

const SCOPE_NOTICE = '시연 자료는 2024년 6월 첫 프리덤 에지의 일정·참가국·발표 목적·형식을 다룹니다.';
const INDEPENDENCE_GAP = '발표·보도 간 독립성은 미확인입니다. 문서 수만으로 교차 확인을 확정할 수 없습니다.';
const MISSING_GAP = '일부 판단은 선택한 기간·자료에서 원문 근거를 찾지 못했습니다.';

function queryFacets(question: string): { facets: Facet[]; supported: boolean; requestGaps: boolean; reason?: string } {
  const q = question.toLowerCase();
  const otherYear = [...q.matchAll(/(?:19|20)\d{2}/g)].some(match => match[0] !== '2024');
  const otherEvent = /림팩|rimpac|을지|프리덤\s*실드|freedom\s*shield|킨\s*에지|keen\s*edge|우크라이나|이스라엘|러시아|중국|대만/.test(q);
  const restricted = /최신|실시간|위치|좌표|사상자|전투력|승률|기밀|작전\s*계획|비용|피해|인원/.test(q);
  const recognized = /프리덤|freedom|참가|참여|일정|날짜|목적|원문|출처|근거|자료|훈련|인용|검증|participants|schedule|purpose|source|evidence|exercise/.test(q);
  const facets: Facet[] = [];
  if (/일정|날짜|언제|기간|schedule|date/.test(q)) facets.push('schedule');
  if (/참가|참여|국가|나라|participants|countries/.test(q)) facets.push('participants');
  if (/목적|이유|purpose|why/.test(q)) facets.push('purpose');
  if (/형식|영역|종류|format|domain/.test(q)) facets.push('format');
  const explicitFacets = facets.length > 0;
  if (!facets.length) facets.push('schedule', 'participants', 'purpose', 'format');
  const reason = otherYear ? '2024년 이외 시기의 훈련은 수집한 자료 범위 밖입니다.'
    : otherEvent ? '다른 훈련이나 지역은 수집한 자료 범위 밖입니다.'
    : restricted ? '비용·피해·인원·위치·최신 동향은 확보한 공개 원문 발췌에 없는 항목입니다.'
    : !recognized ? '질문에서 분석할 항목을 찾지 못했습니다. 일정·참가국·발표 목적·형식을 물어보세요.' : undefined;
  const partial = restricted && explicitFacets && !/최신|실시간/.test(q);
  return { facets, supported: !otherYear && !otherEvent && recognized && (!restricted || partial), reason,
    requestGaps: /어려|부족|공백|모르|불확실|missing|gap/.test(q) };
}

function refreshDerivedGaps(run: AnalysisRun): void {
  run.gaps = run.gaps.filter(g => g !== INDEPENDENCE_GAP && g !== MISSING_GAP);
  if (run.claims.some(c => c.status === 'independence-pending')) run.gaps.push(INDEPENDENCE_GAP);
  if (run.claims.some(c => !c.evidenceIds.length)) run.gaps.push(MISSING_GAP);
}

export function buildSummary(run: AnalysisRun): AnalysisRun['summary'] {
  const event = run.entities.find(e => e.type === 'event')?.label ?? '선택한 사건';
  const supported = run.claims.filter(c => c.evidenceIds.length);
  if (!supported.length) return {
    headline: '확보한 공개 자료로는 이 질문에 답할 근거가 없습니다.',
    findings: [],
    assessment: '근거가 없는 내용을 추정해 채우지 않았습니다. 정보 공백을 확인하고 질문 범위를 조정해주세요.',
  };
  const documents = new Set(supported.flatMap(c => c.evidenceIds.map(id => run.evidence.find(e => e.id === id)?.sourceId))).size;
  const origins = new Set(supported.flatMap(c => c.groups.map(g => g.id))).size;
  const verified = new Set(supported.flatMap(c => c.groups.filter(g => g.independence === 'verified').map(g => g.id))).size;
  const labels = supported.map(c => c.label).join('·');
  const conflicts = supported.filter(c => c.status === 'conflicting');
  const corroborated = supported.filter(c => c.status === 'corroborated');
  const headline = `공개 문서 ${documents}건에서 ${event}에 관한 ${labels} 근거를 확보했습니다. ${conflicts.length ? '일부 내용이 상충합니다. ' : ''}`
    + `이 문서들은 ${origins}개 원출처에 의존하며, 독립성이 확인된 원출처는 ${verified ? `${verified}개입니다` : '아직 없습니다'}.`;
  const assessment = conflicts.length
    ? `${conflicts.map(c => c.label).join('·')}은(는) 근거가 상충해 확정하지 않았습니다. 양쪽 원문을 비교해야 합니다.`
    : corroborated.length === supported.length
      ? '모든 판단이 독립성이 확인된 2개 이상의 원출처에서 일치합니다. 확보한 자료 범위 안의 평가입니다.'
      : corroborated.length
        ? `${corroborated.map(c => c.label).join('·')}만 독립 원출처로 교차 확인했습니다. 나머지는 원출처 관계 검토가 더 필요합니다.`
        : '독립성이 확인된 복수 원출처의 일치 여부는 추가 검토가 필요합니다.';
  return {
    headline, assessment,
    findings: supported.map(c => ({ claimId: c.id, label: c.label, statement: c.statement, status: c.status, evidenceIds: c.evidenceIds })),
  };
}

export function buildAnswer(run: AnalysisRun): ReportAnswer {
  const q = run.question.toLowerCase();
  const supported = run.claims.filter(c => c.evidenceIds.length);
  const gapQuestion = /공백|어려|부족|불확실|확인할\s*수\s*없|모르|missing|gap/.test(q);
  const originQuestion = /몇\s*(?:묶음|개|건)|묶음\s*수|원출처.*(?:수|개)|독립.*(?:몇|수)|출처.*독립|재인용|교차.?검증/.test(q);
  const paragraphs: ReportAnswer['paragraphs'] = gapQuestion
    ? run.gaps.map(text => ({ text, claimIds: [], kind: 'assessment' }))
    : originQuestion ? supported.map(c => ({ text: `${c.label}: 문서 ${c.documentCount}건은 원출처 ${c.groups.length}묶음으로 분류됩니다. 독립성이 확인된 묶음은 ${c.independentCount}개입니다.`, claimIds: [c.id], kind: 'fact' }))
      : supported.map(c => ({ text: c.status === 'conflicting' ? c.statement : `${c.label}: ${c.statement}. 공개 원문에 기재된 내용입니다.`, claimIds: [c.id], kind: 'fact' }));
  return { intent: gapQuestion ? 'gaps' : originQuestion ? 'origins' : supported.length > 1 ? 'brief' : 'facts', paragraphs, unanswered: run.gaps };
}

export function approveReport(stored: AnalysisRun, input: Omit<ReportApproval, 'createdAt' | 'version'> & { expectedVersion: number }): AnalysisRun {
  if (input.expectedVersion !== stored.version) throw new InputError('보고서 버전이 변경되었습니다. 다시 확인해주세요.', 409);
  if (!['approved', 'changes-requested'].includes(input.decision) || typeof input.reviewer !== 'string' || input.reviewer.trim().length < 2
    || input.reviewer.length > 80 || typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 1000)
    throw new InputError('검토자 이름과 검토 의견(5자 이상)을 입력해주세요.');
  if (input.decision === 'approved' && !stored.claims.some(c => c.evidenceIds.length)) throw new InputError('원문 근거가 없는 보고서는 승인할 수 없습니다.');
  if (input.decision === 'approved' && stored.analysis && stored.analysis.verification !== 'verified') throw new InputError('기준별 사건 대조를 재검증한 뒤 승인해주세요.');
  if (input.decision === 'approved' && stored.risk && stored.risk.verification !== 'verified') throw new InputError('위험 평가와 권장 액션을 재검증한 뒤 승인해주세요.');
  if (input.decision === 'approved' && stored.analysis && !buildAnalysisOntology(stored).validation.conforms)
    throw new InputError('기준·사건·출처 연결을 검증한 뒤 승인해주세요.');
  const run = structuredClone(stored);
  const approval: ReportApproval = { reviewer: input.reviewer.trim(), decision: input.decision, reason: input.reason.trim(),
    createdAt: new Date().toISOString(), version: run.version + 1 };
  run.version++; run.updatedAt = approval.createdAt;
  run.approval = approval; run.approvals = [...(run.approvals ?? []), approval];
  return run;
}

/** Fills fields added after a run was stored so older local records stay readable. */
export function upgradeRun(run: AnalysisRun): AnalysisRun {
  const r = run as AnalysisRun & Partial<Pick<AnalysisRun, 'facets' | 'summary' | 'citationCheck' | 'collectedAt'>>;
  r.facets ??= r.claims.map(c => c.facet);
  r.collectedAt ??= r.sources.map(s => s.retrievedAt).sort().at(-1) ?? r.createdAt;
  r.citationCheck ??= { checked: r.evidence.length, passed: r.evidence.length, rejected: 0 };
  r.summary ??= buildSummary(r as AnalysisRun);
  r.answer ??= buildAnswer(r);
  return r as AnalysisRun;
}

export function updateStats(run: AnalysisRun): void {
  run.stats = {
    documents: run.sources.length, claims: run.claims.length,
    groups: run.claims.reduce((n, c) => n + c.groups.length, 0),
    independent: run.claims.reduce((n, c) => n + c.independentCount, 0),
    citations: new Set(run.claims.flatMap(c => c.evidenceIds)).size,
  };
}

export function analyze(dataset: Dataset, input: AnalysisInput, collections?: CollectionResult[]): AnalysisRun {
  const started = performance.now();
  let mark = started;
  const stages: AnalysisRun['stages'] = [];
  const stage = (label: string) => {
    const now = performance.now();
    stages.push({ label, durationMs: Math.round((now - mark) * 100) / 100 });
    mark = now;
  };
  const now = new Date().toISOString();
  const intent = queryFacets(input.question);
  const range = { start: input.startDate ?? dataset.eventDate.start, end: input.endDate ?? dataset.eventDate.end };
  // Period means publication date, not the event date. The UI labels this explicitly.
  const sources = dataset.sources.filter(s => s.publishedAt >= range.start && s.publishedAt <= range.end);
  const failedSources = new Set(collections?.filter(c => c.state === 'failed').map(c => c.sourceId));
  const usable = sources.filter(s => !failedSources.has(s.id));
  const byId = new Map(usable.map(s => [s.id, s]));
  stage('질의 범위 결정');
  const candidates = intent.supported
    ? dataset.evidence.filter(e => byId.has(e.sourceId) && intent.facets.includes(e.claimId as Facet)) : [];
  const evidence = candidates.filter(e => validEvidence(e, byId.get(e.sourceId)));
  const rejectedCount = candidates.length - evidence.length;
  stage('원문 위치·인용 검증');
  const claims = intent.supported ? dataset.claims.filter(c => intent.facets.includes(c.facet)).map(def => {
    const related = evidence.filter(e => e.claimId === def.id);
    return { ...def, statement: '', status: 'insufficient' as const, reason: '',
      evidenceIds: related.map(e => e.id), groups: groupsForEvidence(related), documentCount: 0, independentCount: 0 };
  }) : [];
  stage('KG 및 원출처 묶음 구성');
  const evaluated = claims.map(c => evaluateClaim(c, evidence.filter(e => e.claimId === c.id)));
  const gaps: string[] = [];
  if (!intent.supported) gaps.push(`${SCOPE_NOTICE} ${intent.reason} 질문에 필요한 근거를 확보하지 못했습니다.`);
  else if (intent.reason) gaps.push(intent.reason);
  if (!usable.length) gaps.push('선택한 발행 기간 또는 자료 모드에서 사용할 수 있는 원문이 없습니다.');
  if (rejectedCount) gaps.push(`원문 위치 또는 스냅샷 검증에 실패한 근거 ${rejectedCount}개를 제외했습니다.`);
  if (failedSources.size) gaps.push(`원문 확인에 실패한 출처 ${failedSources.size}개를 분석에서 제외했습니다. 수집 결과를 확인해주세요.`);
  if (intent.requestGaps) gaps.push('확보한 원문 발췌만으로 실제 훈련 성과, 전체 참여 인원, 비공개 세부사항을 확인할 수 없습니다.');
  const usedSourceIds = new Set(evidence.map(e => e.sourceId));
  const run: AnalysisRun = {
    id: randomUUID(), version: 1, question: input.question, mode: input.mode, dateRange: range,
    createdAt: now, updatedAt: now, durationMs: 0, datasetVersion: dataset.version, collectedAt: dataset.collectedAt,
    coverage: dataset.coverage, facets: intent.supported ? intent.facets : [],
    summary: { headline: '', findings: [], assessment: '' },
    citationCheck: { checked: candidates.length, passed: evidence.length, rejected: rejectedCount },
    sources: usable.filter(s => usedSourceIds.has(s.id)), evidence,
    entities: dataset.entities, claims: evaluated, gaps, scope: intent.supported ? 'supported' : 'unsupported',
    collections: collections?.filter(c => sources.some(s => s.id === c.sourceId)) ?? sources.map(s => ({ sourceId: s.id, state: 'snapshot',
      message: '저장 원문 발췌와 사전 구조화한 근거 사용', checkedAt: s.retrievedAt })),
    reviews: [], stats: { documents: 0, claims: 0, groups: 0, independent: 0, citations: 0 }, stages,
  };
  refreshDerivedGaps(run);
  refreshWisdom(run);
  run.summary = buildSummary(run);
  run.answer = buildAnswer(run);
  updateStats(run);
  stage('검증 상태·보고서 생성');
  run.durationMs = Math.round((performance.now() - started) * 100) / 100;
  return run;
}

export function applyReview(stored: AnalysisRun, input: ReviewInput): AnalysisRun {
  const original = upgradeRun(structuredClone(stored));
  if (input.expectedVersion !== original.version) throw new InputError('다른 검토가 반영되었습니다. 보고서를 다시 불러온 뒤 수정해주세요.', 409);
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 1000)
    throw new InputError('검토 이유를 5~1000자로 남겨주세요.');
  if (!Array.isArray(input.evidenceIds) || !input.evidenceIds.length || input.evidenceIds.some(id => typeof id !== 'string'))
    throw new InputError('검토할 근거를 선택해주세요.');
  const run = structuredClone(original);
  const claim = run.claims.find(c => c.id === input.claimId);
  if (!claim) throw new InputError('보고서의 주장 ID를 확인해주세요.');
  const ids = new Set(input.evidenceIds);
  if ([...ids].some(id => !claim.evidenceIds.includes(id))) throw new InputError('선택한 주장의 근거만 수정할 수 있습니다.');
  const reviewId = randomUUID();
  const reason = input.reason.trim();
  let affectedIds = [...ids];
  if (input.action === 'merge') {
    const touched = claim.groups.filter(g => g.evidenceIds.some(id => ids.has(id)));
    if (touched.length < 2) throw new InputError('서로 다른 묶음의 근거를 2개 이상 선택해주세요.');
    affectedIds = [...new Set(touched.flatMap(g => g.evidenceIds))];
    const touchedIds = new Set(touched.map(g => g.id));
    claim.groups = claim.groups.filter(g => !touchedIds.has(g.id));
    claim.groups.push({ id: `review-${reviewId}`, label: '분석가가 확인한 공통 원출처', evidenceIds: affectedIds,
      originVerified: true, independence: 'unconfirmed', reason });
  } else if (input.action === 'split') {
    if (ids.size !== 1) throw new InputError('분리할 근거 1개를 선택해주세요.');
    const id = [...ids][0];
    const group = claim.groups.find(g => g.evidenceIds.includes(id));
    if (!group || group.evidenceIds.length < 2) throw new InputError('여러 근거가 들어 있는 묶음에서 선택해주세요.');
    group.evidenceIds = group.evidenceIds.filter(e => e !== id);
    group.independence = 'unconfirmed';
    const ev = run.evidence.find(e => e.id === id)!;
    const publisher = run.sources.find(s => s.id === ev.sourceId)?.publisher ?? '선택한 출처';
    claim.groups.push({ id: `split-${reviewId}`, label: `${publisher} · 원출처 재검토`, evidenceIds: [id],
      originVerified: false, independence: 'unconfirmed', reason });
  } else if (input.action === 'independence') {
    if (ids.size !== 1 || typeof input.independent !== 'boolean') throw new InputError('판정할 묶음의 근거 1개와 독립성 상태를 지정해주세요.');
    const group = claim.groups.find(g => g.evidenceIds.includes([...ids][0]))!;
    group.independence = input.independent ? 'verified' : 'unconfirmed';
    group.independenceReason = reason;
  } else throw new InputError('지원하지 않는 검토 작업입니다.');
  const related = run.evidence.filter(e => e.claimId === claim.id);
  run.claims = run.claims.map(c => {
    if (c.id !== claim.id) return c;
    const next = applySourceQuality(evaluateClaim(claim, related, !run.research), related, run.sources, claim.quality);
    return run.research && next.status !== 'conflicting' ? { ...next, statement: c.statement } : next;
  });
  run.version += 1;
  run.approval = undefined;
  run.updatedAt = new Date().toISOString();
  run.reviews.push({ id: reviewId, runId: run.id, claimId: claim.id, action: input.action,
    evidenceIds: affectedIds, reason, createdAt: run.updatedAt, version: run.version,
    ...(input.action === 'independence' ? { independent: input.independent } : {}) });
  refreshDerivedGaps(run);
  refreshWisdom(run);
  run.summary = buildSummary(run);
  if ((run.research || run.demo) && run.answer && !['origins', 'gaps'].includes(run.answer.intent)) run.answer.unanswered = run.gaps;
  else run.answer = buildAnswer(run);
  updateStats(run);
  invalidateFramework(run, claim.id);
  return run;
}

const REVIEW_LABELS: Record<Review['action'], string> = { merge: '같은 원출처로 병합', split: '근거 분리', independence: '독립성 판정' };

export function exportMarkdown(stored: AnalysisRun): string {
  const run = upgradeRun(structuredClone(stored));
  if (run.analysis) return exportFramework(run);
  const source = (id: string) => run.sources.find(s => s.id === id);
  const lines = ['# 공개정보 분석 보고서', '', `> 질문: ${run.question}`, '',
    '| 항목 | 내용 |', '| --- | --- |',
    `| 보고서 버전 | v${run.version} |`,
    `| 승인 상태 | ${run.approval?.decision === 'approved' ? `승인 · ${run.approval.reviewer}` : run.approval?.decision === 'changes-requested' ? '수정 요청' : '검토 대기 초안'} |`,
    `| 자료 버전 | ${run.datasetVersion} |`,
    `| 자료 기준 시각 | ${run.collectedAt} |`,
    `| 자료 모드 | ${run.demo ? '사전 수집·검증 결과 불러오기' : run.mode === 'live' ? '다국어 공개자료 수집 · Cursor 분석' : run.mode === 'snapshot' ? '시연 자료 · 규칙 기반' : '등록 원문 재확인'} |`,
    `| ${run.research?.datePolicy === 'event' ? '사건' : '발행'} 기간 | ${run.dateRange.start} ~ ${run.dateRange.end} |`,
    `| 인용 검증 | ${run.citationCheck.passed}/${run.citationCheck.checked}개 원문 위치·해시 일치 |`,
    `| 생성 · 최종 검토 | ${run.createdAt} · ${run.updatedAt} |`, '',
    '## 핵심 요약', '', `**시스템 요약:** ${run.summary.headline}`, '', `**시스템 해석:** ${run.summary.assessment}`, ''];
  if (run.demo) lines.push('## 시연 자료 출처', '', `- 시연: ${run.demo.title}`, `- 준비 시각: ${run.demo.preparedAt}`, `- 원래 분석 실행: ${run.demo.originalRunId}`, `- 원래 분석 소요 시간: ${run.demo.originalDurationMs}ms`, '- 이번 실행은 저장 결과를 불러왔으며 새 검색을 수행하지 않았습니다.', '');
  if (run.summary.findings.length) {
    lines.push('| 판단 | 원문 기재 내용 | 검증 상태 |', '| --- | --- | --- |',
      ...run.summary.findings.map(f => `| ${f.label} | ${f.statement} | ${STATUS_LABELS[f.status]} |`), '');
  }
  lines.push('## 질문에 대한 답변', '', ...(run.answer?.paragraphs.map(p => `- ${p.heading ? `**${p.heading}:** ` : p.kind === 'assessment' ? '**분석·한계:** ' : ''}${p.text} ${p.claimIds.length ? `(근거: ${p.claimIds.join(', ')})` : ''}`) ?? []), '');
  if (run.research?.scope) {
    lines.push('## 조사 범위와 답변 충족도', '', `- 지역: ${run.research.scope.geography}`, `- 기간: ${run.research.scope.period}`,
      ...run.research.scope.assumptions.map(s => `- 가정: ${s}`), `- 종료 사유: ${run.research.stopReason ?? ''}`,
      ...(run.research.coverage ?? []).map(c => `- ${c.target} · ${c.status}: ${c.reason}`), '');
  }
  if (run.wisdom?.inferences.length) {
    lines.push('## 사건 관계와 근거를 연결한 해석', '', '추론은 확인된 사실과 구분되며, 전제의 신뢰도를 상한으로 합니다.', '');
    for (const inference of run.wisdom.inferences) {
      lines.push(`### ${inference.conclusion}`, '', `- 규칙: ${inference.rule}`, `- 신뢰도: ${inference.confidence}`,
        `- 전제 노드: ${inference.premiseNodeIds.join(', ')}`,
        ...inference.premiseEdgeIds.map(id => { const e = run.wisdom!.edges.find(e => e.id === id)!;
          const label = (id: string) => run.wisdom!.nodes.find(n => n.id === id)?.label ?? id;
          return `- 전제 관계: ${label(e.from)} → ${e.label} → ${label(e.to)}`; }),
        ...inference.evidenceIds.map(id => { const ev = run.evidence.find(e => e.id === id)!; const doc = source(ev.sourceId)!;
          return `- 근거: [${doc.publisher}](${doc.url}) — “${ev.quote}”`; }),
        ...inference.limitations.map(s => `- 한계: ${s}`), ...inference.alternatives.map(s => `- 경쟁 설명: ${s}`),
        `- 다음 검증: ${inference.nextCheck}`, '');
    }
    if (!run.wisdom.inferences.length) lines.push('검증된 관계를 연결해 도출할 수 있는 추론이 아직 없습니다.', '');
    lines.push(...run.wisdom.rejected.map(s => `- 제외한 추론: ${s}`), '');
  }
  lines.push('## 주요 판단', '');
  for (const claim of run.claims) {
    lines.push(`### ${claim.label} — ${STATUS_LABELS[claim.status]}`, '', `- 원문 기재 내용: ${claim.statement}`,
      `- 판정 이유: ${claim.reason}`,
      `- 근거 신뢰도: ${claim.confidence?.level ?? 'undetermined'} · ${claim.confidence?.reason ?? claim.reason}`,
      `- 집계: 문서 ${claim.documentCount}개 → 원출처 ${claim.groups.length}묶음 → 독립성 확인 ${claim.independentCount}묶음`, '');
    claim.groups.forEach((group, index) => {
      lines.push(`#### 원출처 ${index + 1}. ${group.label} (${group.independence === 'verified' ? '독립성 확인' : '독립성 미확인'})`, '',
        `묶은 이유: ${group.reason}`, ...(group.independenceReason ? ['', `독립성 판정 이유: ${group.independenceReason}`] : []), '');
      for (const id of group.evidenceIds) {
        const ev = run.evidence.find(e => e.id === id)!;
        const doc = source(ev.sourceId)!;
        lines.push(`- [${doc.publisher}](${doc.url}) (${doc.publishedAt}, ${doc.language.toUpperCase()}) — 원문: “${ev.quote}” / 해석: ${ev.translation}`);
      }
      lines.push('');
    });
  }
  lines.push('## 정보 공백 및 추가 확인 사항', '', ...(run.gaps.length ? run.gaps.map(g => `- ${g}`) : ['- 없음']), '');
  lines.push('## 자료 확인 결과', '', ...run.collections.map(c => `- ${source(c.sourceId)?.publisher ?? c.sourceId}: ${c.message}`), '');
  lines.push('## 검토 기록', '', ...(run.reviews.length
    ? run.reviews.map(r => `- v${r.version} · ${r.createdAt} · ${REVIEW_LABELS[r.action]}${r.action === 'independence' ? (r.independent ? '(확인)' : '(미확인)') : ''}: ${r.reason}`)
    : ['- 없음']));
  lines.push('', '## 보고서 승인 이력', '', ...(run.approvals?.map(a => `- v${a.version} · ${a.createdAt} · ${a.reviewer} · ${a.decision}: ${a.reason}`) ?? ['- 검토 대기']));
  if (run.research) lines.push('', '## 수집·분석 기록', '', `모델 연결: ${run.research.engine} · ${run.research.model}`, '',
    ...run.research.trace.map(t => `- ${t.at} · ${t.stage} · ${t.status}: ${t.message}`), '',
    '### 제외된 인용', '', ...run.research.rejectedCitations.map(text => `- ${text}`));
  lines.push('', '---', '', `자료 범위: ${run.coverage}`, '',
    '검증 상태는 확보한 자료에 대한 평가이며 사실의 정답 확률이 아닙니다. 원문 기재 내용은 인용 원문을 한국어로 정규화한 것이고, 요약과 해석은 시스템이 생성했습니다.', '');
  return lines.join('\n');
}
