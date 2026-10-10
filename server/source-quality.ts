import type { AnalyzedClaim, Evidence, SourceDocument } from '../shared/types.ts';
export const CONFIDENCE_POLICY = '공개정보 근거 신뢰도 v1: 원문·주장 적합성, 출처 전문성, 확인된 독립 원출처, 반증·추론 한계';
export function sourceAuthority(source: SourceDocument): NonNullable<AnalyzedClaim['quality']>['authority'] {
  if (source.attribution?.control === 'dprk-state') return 'state-publication';
  const host = new URL(source.url).hostname;
  if (source.type === 'official' || /(^|\.)(kinu\.or\.kr|repo\.kinu\.or\.kr|38north\.org|stimson\.org|asaninst\.org|lowyinstitute\.org|orfonline\.org|csis\.org|rand\.org|globalnk\.org|nia\.go\.kr)$/.test(host)) return 'institution';
  if (/(^|\.)(apnews\.com|reuters\.com|yna\.co\.kr|bbc\.(?:com|co\.uk)|rfa\.org|khan\.co\.kr|joongang\.co\.kr|donga\.com|hani\.co\.kr|seoul\.co\.kr|newsis\.com|ytn\.co\.kr|mk\.co\.kr)$/.test(host)) return 'editorial';
  return 'unrated';
}
export function applySourceQuality(claim: AnalyzedClaim, evidence: Evidence[], sources: SourceDocument[], assessed?: { kind: NonNullable<AnalyzedClaim['quality']>['kind']; fit: NonNullable<AnalyzedClaim['quality']>['fit']; limitations: string[] }): AnalyzedClaim {
  if (!assessed) return claim; // Older reports have no independent semantic-quality audit.
  const supporting = evidence.filter(e => e.stance === 'supports');
  const authorities = supporting.map(e => sources.find(s => s.id === e.sourceId)).filter((s): s is SourceDocument => !!s).map(sourceAuthority);
  const authority = (['institution', 'editorial', 'state-publication', 'unrated'] as const).find(a => authorities.includes(a)) ?? 'unrated';
  const institution = authorities.some(a => ['institution', 'editorial'].includes(a));
  const originConfirmed = supporting.some(e => e.originVerified);
  let level: NonNullable<AnalyzedClaim['confidence']>['level'] = 'low';
  if (claim.status === 'conflicting' || claim.status === 'insufficient') level = 'undetermined';
  else if (claim.independentCount >= 2 && institution && assessed.fit !== 'inferential' && assessed.kind !== 'forecast' && !assessed.limitations.length) level = 'high';
  else if (originConfirmed && institution || originConfirmed && authority === 'state-publication' && assessed.kind === 'statement' && assessed.fit === 'direct') level = 'medium';
  if (assessed.kind === 'forecast' && (assessed.fit === 'inferential' || assessed.limitations.length > 1)) level = level === 'undetermined' ? level : 'low';
  const reason = `${assessed.kind === 'statement' ? '발표 내용의 확인' : assessed.kind === 'forecast' ? '조건부 전망' : assessed.kind === 'assessment' ? '귀속된 분석 평가' : '관측 사실'} · ${authority === 'institution' ? '관련 기관·연구 원문' : authority === 'editorial' ? '편집 책임이 있는 보도' : authority === 'state-publication' ? '북한 발신 원문' : '출처 전문성 추가 검토'} · 독립 확인 ${claim.independentCount}묶음${assessed.fit === 'inferential' ? ' · 추론 포함' : ''}${assessed.limitations.length ? ` · ${assessed.limitations.join(' / ')}` : ''}`;
  return { ...claim, confidence: { level, reason }, quality: { ...assessed, authority, independentSupport: claim.independentCount, policy: CONFIDENCE_POLICY } };
}
