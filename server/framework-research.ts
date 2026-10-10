import { z } from 'zod';
import type { AnalysisCriterion, AnalysisInput, CollectionResult, FrameworkPlan, ResearchQuery, ResearchRound, ResearchSearch, ResearchTrace, SourceDocument, SourceTemporalPolicy } from '../shared/types.ts';
import type { JsonModel } from './model.ts';
import type { SearchHit } from './public-sources.ts';
import { mapConcurrent } from './concurrency.ts';
import { documentExcerpts } from './research-coverage.ts';
import { BASIS_INSTRUCTIONS, one, sourceIntact } from './analysis-framework.ts';
import type { CriterionKnowledge } from './criterion-knowledge.ts';

// Candidate primary repositories, not automatically applicable rules. The planner
// selects only provisions that discriminate the actual user proposition.
export const PRIMARY_FRAMEWORKS = [
  { title: 'KINU 북한의 4대세습과 김주애 (2023)', url: 'https://www.kinu.or.kr/main/module/report/download.do?id=21997', topics: 'succession institutional procedures, dynastic symbolism, competing interpretations; research indicators, not formal appointment or a deterministic checklist' },
  { title: '38 North succession scenarios (2025)', url: 'https://www.38north.org/2025/12/succession-at-the-crossroads-scenarios-for-north-koreas-future/', topics: 'elite loyalty, propaganda, military legitimacy, competing transition scenarios; historical comparisons are not proof of current transfer' },
  { title: 'ODNI ICD 203 Analytic Standards', url: 'https://www.dni.gov/files/documents/ICD/ICD-203.pdf', topics: 'analysis methodology only: all sources, alternatives, distinguish information/assumptions/judgments, likelihood vs confidence; not evidence about succession' },
  { title: 'UN Charter', url: 'https://www.icj-cij.org/charter-of-the-united-nations', topics: 'use of force, Article 2(4), 39–42, 51; authority, not occurrence' },
  { title: 'UNCLOS', url: 'https://www.un.org/Depts/los/convention_agreements/texts/unclos/unclos_e.pdf', topics: '17–19, 25(3), 36–44, 58, 87; determine maritime regime and Article 36 exceptions first' },
  { title: 'Geneva Conventions and IHL', url: 'https://ihl-databases.icrc.org/en/ihl-treaties', topics: 'Common Article 2/3, applicable conflict regime, Protocol I 54/70, customary IHL; treaty applicability and customary status separately' },
  { title: 'San Remo Manual', url: 'https://international-review.icrc.org/sites/default/files/S0020860400087258a.pdf', topics: '93–104; nonbinding expert restatement for naval armed conflict, declaration/effectiveness/impartiality/civilian safeguards' },
  { title: 'US NWP 1-14M (2022)', url: 'https://www.jag.navy.mil/documents/5771/NWP_1-14M.pdf',
    alternateURLs: ['https://stjececmsdusgva001.blob.core.usgovcloudapi.net/public/documents/NWP_1-14M.pdf'],
    topics: '7.7.1 definition, 7.7.2.1–5 published blockade checklist including limitations; US guidance, not universal onset threshold or Taiwan/China ROE' },
];
const extractedSchema = z.object({ criteria: z.array(z.object({ criterionId: z.string(), definition: z.string().min(1).max(600),
  basisKind: z.enum(['published-rule', 'analyst-derived']),
  applicability: z.object({ status: z.enum(['conditional', 'unresolved', 'not-applicable']), reason: z.string().max(500) }),
  basis: z.array(z.object({ sourceId: z.string(), quote: z.string().min(12).max(1800), translation: z.string().max(2500),
    locator: z.string().max(150), authority: z.enum(['treaty', 'doctrine', 'official-policy', 'expert-manual', 'research', 'precedent']),
    version: z.string().max(150), versionQuote: z.string().max(300) })).max(3) })).max(12) });
const basisAuditSchema = z.object({ criteria: z.array(z.object({ criterionId: z.string(), definitionSupported: z.boolean(),
  scopeAccurate: z.boolean(), reason: z.string().max(1600) })).max(12),
  basis: z.array(z.object({ id: z.string(), supportsDefinition: z.boolean(), translationAccurate: z.boolean(),
    authorityAccurate: z.boolean(), locatorAccurate: z.boolean(), versionAccurate: z.boolean(), reason: z.string().max(1600) })).max(36) });
interface Dependencies { model: JsonModel; search: (query: ResearchQuery) => Promise<SearchHit[]>; read: (hit: SearchHit) => Promise<SourceDocument>; searchLabel?: (query: ResearchQuery) => string; knowledge?: CriterionKnowledge; }
type Emit = (stage: string, message: string, status?: ResearchTrace['status'], extra?: Partial<ResearchTrace>) => void;

export async function collectFramework(plan: FrameworkPlan, dependencies: Dependencies, emit: Emit,
  sources: SourceDocument[], collections: CollectionResult[], searches: ResearchSearch[], input?: AnalysisInput): Promise<{ criteria: AnalysisCriterion[]; queries: ResearchQuery[]; rejected: string[] }> {
  const queries = plan.queries.map(q => ({ ...q, purpose: 'framework' as const }));
  const attempted = new Set<string>();
  let slots = 0;
  const reads: Promise<void>[] = [];
  const cached = (dependencies.knowledge?.search([plan.proposition, ...queries.map(q => q.query)], plan.resources?.map(r => r.url), 12) ?? [])
    .filter(hit => plan.dimension !== 'forecast' || plan.criteria.some(c=>c.dimension==='legality')
      || hit.source.knowledge?.authorities.some(authority=>['research','official-policy'].includes(authority))).slice(0,6);
  const indexed = new Map(cached.map(hit => [hit.source.id, hit.excerpts]));
  const cachedByURL = new Map<string, SourceDocument>();
  for (const hit of cached) if (!cachedByURL.has(hit.source.url)) cachedByURL.set(hit.source.url, hit.source);
  const read = async (hit: SearchHit) => {
    if (attempted.has(hit.url) || slots >= 10) return;
    attempted.add(hit.url); slots++;
    const info = { taskId: `basis-read-${slots}`, url: hit.url, language: hit.language, detail: hit.title };
    emit('기준 수집', '판단 기준의 원문을 확인하고 있습니다.', 'running', info);
    const saved = cachedByURL.get(hit.url);
    try {
      const source = saved?.knowledge?.refreshState === 'fresh' ? structuredClone(saved) : await dependencies.read(hit);
      if (saved && source !== saved && source.hash === saved.hash && saved.knowledge?.refreshState !== 'fresh')
        source.knowledge = { ...saved.knowledge!, reuse: 'refreshed', refreshState: 'fresh', lastCheckedAt: source.retrievedAt };
      if (!sources.some(s => s.url === source.url)) sources.push(source);
      collections.push({ sourceId: source.id, state: 'verified', checkedAt: source.knowledge?.lastCheckedAt ?? source.retrievedAt,
        message: saved?.knowledge?.refreshState === 'fresh' ? '보존한 기준 판본 재사용 · 정의와 이번 사건의 적용 조건은 새로 검증'
          : '기준 자료 원문 보존 · 사건 기간의 발행일 필터 적용 제외' });
      emit('기준 수집', `${source.publisher} · ${source.knowledge?.reuse === 'reused' ? '보존 판본 재사용' : '기준 원문 확보'}`, 'complete', info);
    } catch (error) {
      const message = error instanceof Error ? error.message : '기준 원문 접근 실패';
      collections.push({ sourceId: hit.url, state: 'failed', checkedAt: new Date().toISOString(), message });
      if (saved) {
        const fallback = structuredClone(saved); fallback.knowledge!.refreshState = 'refresh-failed';
        if (!sources.some(s => s.url === fallback.url)) sources.push(fallback);
        collections.push({ sourceId: fallback.id, state: 'snapshot-only', checkedAt: new Date().toISOString(),
          message: '기준 원문 재확인 실패 · 보존 판본으로 제한해 사용하며 현행성은 확인하지 못했습니다.' });
      }
      emit('기준 수집', message, 'failed', info);
    }
  };
  await mapConcurrent([...cachedByURL.values()], 3, source => read({ url: source.url, title: source.title, language: source.language, module: 'official' }));
  const directReads = mapConcurrent(plan.resources ?? [], 3, resource => read({ url: resource.url,
    title: '계획에서 선택한 기준 원문', language: 'other', module: 'official' }));
  const found = await mapConcurrent(queries, 3, async (query, index) => {
    const provider = dependencies.searchLabel?.(query) ?? '수집 모듈';
    const info = { taskId: `basis-search-${index}`, language: query.language, detail: query.query };
    emit('기준 검색', query.query, 'running', info);
    let hits: SearchHit[] = []; let error: string | undefined;
    try { hits = await dependencies.search(query); } catch (e) { error = e instanceof Error ? e.message : '검색 실패'; }
    searches.push({ query, provider, hits: hits.map(h => ({ url: h.url, title: h.title })), completedAt: new Date().toISOString(), error });
    emit('기준 검색', error ?? `기준 후보 ${hits.length}건`, error ? 'failed' : 'complete', info);
    if (hits[0]) reads.push(read(hits[0]));
    return hits;
  });
  await Promise.all(reads);
  await directReads;
  const remaining: SearchHit[] = [];
  for (let i = 1; i < 5; i++) for (const hits of found) if (hits[i]) remaining.push(hits[i]);
  await mapConcurrent(remaining, 3, read);
  const rejected: string[] = [];
  if (sources.length) emit('기준 정의', '확보한 원문에서 판단 기준과 적용 범위를 정리합니다.', 'running',
    { taskId: 'basis-define', detail: plan.criteria.map(c => c.label).join(' · ') });
  let proposals = sources.length ? await dependencies.model.generate(extractedSchema, BASIS_INSTRUCTIONS
    + 'Define each planned criterion BEFORE collecting current event evidence. Only supplied bodies establish published rules. '
    + 'For each rule preserve a sufficient exact quote, precise article/section locator, authority, version and an exact versionQuote. Prefer compact sufficient quotes under 600 characters; preserve essential conditions and exceptions. '
    + 'Use the exact supplied criterion IDs. Do not introduce new IDs or split an umbrella criterion into uncatalogued subcriteria. Use multiple basis quotes for its separate provisions. '
    + 'No version proof means empty version and versionQuote. A partial quote must not omit a material exception. '
    + 'Distinguish published-rule from an analyst-derived operational indicator. No basis means omit that criterion from this extraction. '
    + 'Applicability here is conditional/unresolved: current event evidence has not yet been collected. Do not conclude an event occurred. '
    + 'A quotation that merely names blockade or states a training objective cannot establish a definition, legal criterion or ROE. '
    + 'Never reclassify a nonbinding manual as a treaty. Definitions, reasons and translations in Korean.',
    { eventPeriod: { start: input?.startDate, end: input?.endDate }, plan, sources: sources.map(s => ({ id: s.id, url: s.url, publisher: s.publisher, title: s.title,
      publishedAt: s.publishedAt, knowledge: s.knowledge, indexedClauses: indexed.get(s.id),
      excerpts: documentExcerpts(s, [plan.proposition, ...queries.map(q => q.query), ...plan.criteria.flatMap(c => c.observations)].join(' '), 6) })) }) : { criteria: [] };
  if (sources.length) emit('기준 정의', `원문 기반 기준 정의 ${proposals.criteria.length}개 작성 · 독립 검증 전`, 'complete', { taskId: 'basis-define' });
  const normalize = (proposals: z.infer<typeof extractedSchema>) => plan.criteria.map(planned => {
    const proposal = one(proposals.criteria, c => c.criterionId === planned.id);
    const basis = (proposal?.basis ?? []).flatMap((b, index) => {
      const source = sources.find(s => s.id === b.sourceId);
      const start = source?.body.indexOf(b.quote) ?? -1;
      if (!source || !sourceIntact(source) || start < 0) { rejected.push(`${planned.label}: 기준 인용의 원문·해시 불일치`); return []; }
      return [{ id: `${planned.id}-basis-${index + 1}`, sourceId: b.sourceId, quote: b.quote, translation: source.language === 'ko' ? '' : b.translation,
        start, end: start + b.quote.length, locator: b.locator, authority: b.authority,
        version: b.versionQuote && source.body.includes(b.versionQuote) ? b.version : '',
        versionStatus: 'unconfirmed' as const, verified: false }];
    });
    return { ...planned, definition: proposal?.definition ?? planned.question, basisKind: proposal?.basisKind ?? 'analyst-derived',
      basisStatus: basis.length ? 'proposed' : 'unavailable',
      applicability: proposal?.applicability ?? { status: 'unresolved', reason: '적용 가능한 공개 기준 원문을 확보하지 못했습니다.' }, basis } as AnalysisCriterion;
  });
  const audit = async (candidates: AnalysisCriterion[], proposals: z.infer<typeof extractedSchema>) => candidates.some(c => c.basis.length) ? await dependencies.model.generate(basisAuditSchema, BASIS_INSTRUCTIONS
    + 'Independently audit every definition and cited basis. Check full scope and exceptions, accurate Korean translation, source authority and precise locator. '
    + 'Check whether the source actually establishes the proposed criterion rather than just naming a scenario or capability. '
    + 'Verify version only with the supplied exact version quote. Return exactly one verdict per criterion and basis ID. '
    + 'scopeAccurate asks whether the stated jurisdiction and conditional/unresolved bounds are accurate, NOT whether current-event applicability is confirmed. '
    + 'A correctly conditional scope can and should be scopeAccurate=true before event evidence exists. '
    + 'For analyst-derived indicators, validate the explicitly cited conceptual basis separately from the labeled operational proxies; do not require analyst indicators to be verbatim published rules. '
    + 'Do not approve confirmed current-event applicability before event collection. No background knowledge.',
    { candidates, sources: candidates.flatMap(c => c.basis.map(b => { const s = sources.find(s => s.id === b.sourceId)!;
      const p = one(proposals.criteria, p => p.criterionId === c.id)?.basis.find(p => p.sourceId === b.sourceId && p.quote === b.quote);
      return { id: b.id, title: s.title, publisher: s.publisher, url: s.url, quote: b.quote,
        context: s.body.slice(Math.max(0, b.start - 500), b.end + 500), versionQuote: p?.versionQuote ?? '' }; })) }) : { criteria: [], basis: [] };
  let candidates = normalize(proposals);
  if (candidates.some(c => c.basis.length)) emit('기준 검증', '기준 인용·번역·자료 성격·적용 범위를 독립적으로 대조합니다.', 'running',
    { taskId: 'basis-verify', detail: candidates.filter(c => c.basis.length).map(c => c.label).join(' · ') });
  let checked = await audit(candidates, proposals);
  const repairable = candidates.filter(c => {
    const v = one(checked.criteria, v => v.criterionId === c.id);
    const impreciseLocator = c.basis.some(b => { const check = one(checked.basis, v => v.id === b.id);
      return check?.supportsDefinition && check.translationAccurate && check.authorityAccurate && !check.locatorAccurate; });
    return v && (!v.definitionSupported || !v.scopeAccurate || impreciseLocator) && c.basis.some(b => {
      const check = one(checked.basis, v => v.id === b.id);
      return check?.supportsDefinition && check.translationAccurate && check.authorityAccurate;
    });
  });
  if (repairable.length) {
    emit('기준 보완', '확보한 원문과 검증 피드백으로 누락 조건·적용 범위를 보완합니다.', 'running', { taskId: 'basis-repair' });
    const feedback = checked.criteria.filter(v => repairable.some(c => c.id === v.criterionId)).map(v => ({ ...v,
      basisFeedback: checked.basis.filter(b => candidates.find(c => c.id === v.criterionId)?.basis.some(original => original.id === b.id)) }));
    rejected.push(...feedback.map(v => `기준 보완 전 · ${v.criterionId}: ${v.reason}`));
    try {
      const repaired = await dependencies.model.generate(extractedSchema, BASIS_INSTRUCTIONS
        + 'Repair ONLY the supplied criterion definitions using independent audit feedback and newly selected original excerpts. '
        + 'Preserve the exact criterion IDs, distinguish analyst-derived indicators from published rules, include omitted conditions/exceptions, '
        + 'Repair imprecise article/subsection locators from the ORIGINAL heading context. Preserve every protected object and material condition in a restriction; do not shrink an explicit list into a partial paraphrase. '
        + 'and bound applicability as conditional/unresolved. No current event findings. '
        + 'Use up to three contiguous exact quotes to cover an umbrella checklist; do not split into new IDs. '
        + 'Never assert full legal compliance from a partial manual checklist. Return only supported definitions, not an invented replacement rule.',
        { criteria: repairable, feedback, eventPeriod: { start: input?.startDate, end: input?.endDate },
          sources: sources.map(s => ({ id: s.id, title: s.title, url: s.url, excerpts: documentExcerpts(s,
            [plan.proposition, ...queries.map(q => q.query), ...feedback.flatMap(v => [v.reason, ...v.basisFeedback.map(b => b.reason)])].join(' '), 8) })) });
      const validRepairs = repaired.criteria.filter(c => repairable.some(p => p.id === c.criterionId)
        && one(repaired.criteria, p => p.criterionId === c.criterionId));
      const next = { criteria: [...proposals.criteria.filter(c => !validRepairs.some(r => r.criterionId === c.criterionId)), ...validRepairs] };
      const nextCandidates = normalize(next);
      const nextChecked = await audit(nextCandidates, next);
      proposals = next; candidates = nextCandidates; checked = nextChecked;
      emit('기준 보완', '보완한 정의와 적용 범위의 원문 대조를 완료했습니다.', 'complete', { taskId: 'basis-repair' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '기준 보완 검증 실패';
      rejected.push(message); emit('기준 보완', message, 'failed', { taskId: 'basis-repair' });
    }
  }
  const criteria = candidates.map(c => {
    const verdict = one(checked.criteria, v => v.criterionId === c.id);
    const basis = c.basis.filter(b => {
      const check = one(checked.basis, v => v.id === b.id);
      const valid = check?.supportsDefinition && check.translationAccurate && check.authorityAccurate && check.locatorAccurate;
      if (!valid) rejected.push(`${c.label}: ${check?.reason ?? '기준 인용 검증 결과 없음'}`);
      else { b.verified = true; b.versionStatus = b.version && check.versionAccurate ? 'verified' : 'unconfirmed'; }
      return valid;
    });
    if (!verdict?.definitionSupported || !verdict.scopeAccurate || !basis.length) {
      if (c.basis.length) rejected.push(`${c.label}: ${verdict?.reason ?? '정의 또는 적용 범위 검증 미완료'}`);
      return { ...c, definition: c.question, basis, basisStatus: basis.length ? 'proposed' as const : 'unavailable' as const,
        applicability: { status: 'unresolved' as const, reason: '기준 정의·출처·적용 범위를 검증하지 못했습니다.' } };
    }
    return { ...c, basis, basisStatus: 'verified' as const };
  });
  if (dependencies.knowledge) for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    const bases = criteria.flatMap(c => c.basis.filter(b => b.sourceId === source.id));
    if (!bases.length) continue;
    try {
      const preserved = dependencies.knowledge.preserve(source, bases,
        [plan.proposition, ...queries.map(q => q.query), ...criteria.filter(c => c.basis.some(b => b.sourceId === source.id)).map(c => c.label)]);
      if (preserved) sources[index] = preserved;
    } catch (error) {
      rejected.push(`기준 지식 보존 실패: ${error instanceof Error ? error.message : '저장소 접근 실패'}`);
      emit('기준 보존', '기준 지식 저장소에 보존하지 못했습니다. 이번 보고서의 원문은 유지합니다.', 'failed');
    }
  }
  emit('기준 검증', `기준 ${criteria.length}개 중 원문·정의 검증 ${criteria.filter(c => c.basisStatus === 'verified').length}개`, 'complete', { taskId: 'basis-verify' });
  return { criteria, queries, rejected };
}

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
/** Temporal policy: preserve normative originals without an event-window TTL;
 * event relevance is based on quoted occurrence dates, not publication dates.
 * Historical precedents stay searchable/auditable but cannot satisfy current facts. */
export function applyTemporalPolicy(audit: ResearchRound, sources: SourceDocument[], input: AnalysisInput, criteria: AnalysisCriterion[]): SourceTemporalPolicy[] {
  const policies: SourceTemporalPolicy[] = [];
  for (const doc of audit.documents) {
    const source = sources.find(s => s.id === doc.sourceId)!;
    const inRange = source.publishedAt ? (!input.startDate || source.publishedAt >= input.startDate) && (!input.endDate || source.publishedAt <= input.endDate) : null;
    const normative = criteria.some(c => c.basis.some(b => b.sourceId === source.id));
    if (doc.role === 'direct' && (input.startDate || input.endDate)) {
      const p = doc.eventPeriod;
      const datesGrounded = p && validDate(p.start) && validDate(p.end) && p.start <= p.end && p.quote.length >= 12 && source.body.includes(p.quote);
      const overlaps = datesGrounded && (!input.startDate || p!.end >= input.startDate) && (!input.endDate || p!.start <= input.endDate);
      if (!overlaps) {
        doc.role = normative ? 'framework' : 'precedent';
        doc.reason = '관측 기간에 대응하는 사건 날짜의 원문 근거를 확인하지 못해 현재 사건 근거에서 제외했습니다.';
      }
    }
    const purpose = doc.role === 'direct' ? 'event' : normative || doc.role === 'framework' ? 'framework' : 'precedent';
    policies.push({ sourceId: source.id, purpose, publicationInRange: inRange,
      reason: purpose === 'framework' ? '기준 원문은 발행일과 무관하게 보존합니다. 적용 시점·판본·관할은 별도로 검증하며 새 조사에서 다시 확인합니다.'
        : purpose === 'event' ? '발행일 대신 인용된 사건 기간으로 적합성을 검토합니다. 사전 공지는 실시 관측으로 간주하지 않습니다.'
          : '선례·배경 자료로 보존하며 현재 사건의 실행 증거로 계수하지 않습니다.' });
  }
  const direct = new Set(audit.documents.filter(d => d.role === 'direct').map(d => d.sourceId));
  audit.coverage = audit.coverage.map(c => {
    const sourceIds = c.sourceIds.filter(id => direct.has(id));
    return { ...c, sourceIds, status: sourceIds.length ? sourceIds.length === c.sourceIds.length ? c.status : 'partial' : 'missing' };
  });
  return policies;
}
