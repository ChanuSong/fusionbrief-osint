import type { RiskImpact, RiskLevel, RiskLikelihood } from './types.ts';

export const RISK_LABELS: Record<RiskLevel, string> = { low: '낮음', guarded: '주의', elevated: '상승', high: '높음', critical: '매우 높음', unassessed: '판단 유보' };
export const LIKELIHOOD_LABELS: Record<RiskLikelihood, string> = { unlikely: '가능성이 낮음', plausible: '발생 가능', likely: '가능성이 높음', unassessed: '가능성 미판정' };
export const IMPACT_LABELS: Record<RiskImpact, string> = { limited: '제한적 영향', serious: '중대한 영향', severe: '심각한 영향', unassessed: '영향 미판정' };
export const RISK_LEVELS = ['low', 'guarded', 'elevated', 'high', 'critical'] as const;
export const RISK_MATRIX: Record<Exclude<RiskLikelihood, 'unassessed'>, Record<Exclude<RiskImpact, 'unassessed'>, RiskLevel>> = {
  unlikely: { limited: 'low', serious: 'guarded', severe: 'elevated' },
  plausible: { limited: 'guarded', serious: 'elevated', severe: 'high' },
  likely: { limited: 'elevated', serious: 'high', severe: 'critical' },
};
export function riskLevel(likelihood: RiskLikelihood, impact: RiskImpact): RiskLevel {
  return likelihood === 'unassessed' || impact === 'unassessed' ? 'unassessed' : RISK_MATRIX[likelihood][impact];
}
export const RISK_METHOD = '발생 가능성과 영향을 각각 3단계로 대조하는 제품의 정성적 판단 기준입니다. 위험도는 근거 신뢰도·발생 확률·공식 경보 단계와 다른 값입니다. 어느 한 축을 판단하지 못하면 위험도도 유보합니다.';
