import type { AnalysisRun } from './types.ts';
export const CRITERION_STATUS = { met: '충족', 'not-met': '불충족', partial: '부분 확인', unknown: '미확인', 'not-applicable': '적용 제외' };
export const DIMENSION_LABEL = { occurrence: '실제 발생', legality: '적법성', 'actor-position': '당사자 기준·입장', context: '맥락', forecast: '가능성·전망' };
export const AUTHORITY_LABEL = { treaty: '조약', doctrine: '교리·교범', 'official-policy': '공식 정책', 'expert-manual': '비구속적 전문가 매뉴얼', research: '분석 연구', precedent: '선례' };
export const OBSERVATION_LABEL = { observed: '시행 관측', reported: '시행 보도·보고', announced: '선포·발표', scheduled: '예정' };
export const CONFIDENCE_LABEL = { high: '높음', medium: '중간', low: '낮음', undetermined: '판단 유보' };
/** Shared presentation policy for HTML and exports. Material uncertainty stays in
 * the judgment; empty inventories are retained in the audit, not the main report. */
export function reportContent(run: AnalysisRun) {
  const framework = run.analysis;
  const criteria = framework?.criteria.filter(c => c.basis.some(b => b.verified)
    || framework.assessments.some(a => a.criterionId === c.id && a.verification === 'verified' && a.claimIds.some(id => run.claims.some(claim => claim.id === id)))) ?? [];
  const assessments = framework?.assessments.filter(a => criteria.some(c => c.id === a.criterionId)) ?? [];
  const observations = framework && framework.verification !== 'verified' ? [] : framework?.observations ?? [];
  const events = (run.events ?? []).filter(e => e.evidenceIds.some(id => run.evidence.some(ev => ev.id === id))
    && (!framework || observations.some(o => o.claimIds.some(id => run.claims.find(c => c.id === id)?.evidenceIds.some(eid => e.evidenceIds.includes(eid))))));
  const comparison = run.claims.some(c => new Set(run.evidence.filter(e => c.evidenceIds.includes(e.id)).map(e => e.sourceId)).size > 1);
  const relationships = !!run.wisdom?.edges.some(e => !e.derived && e.id.startsWith('relation:') && e.evidenceIds.some(id => run.evidence.some(ev => ev.id === id)));
  const locations = (run.locations ?? []).filter(l => l.evidenceIds.some(id => run.evidence.some(e => e.id === id)));
  const visuals = !framework && (events.length > 1 || run.claims.some(c => c.documentCount > 1));
  return { criteria, assessments, observations, events, comparison, relationships, locations, visuals };
}
