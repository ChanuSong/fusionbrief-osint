import type { RiskAudit, RiskDraft } from '../../server/risk-analysis.ts';
import { finalizeRisk } from '../../server/risk-analysis.ts';
import { researchedFramework } from './framework.ts';

// Fictional harbor evidence used only to verify grounding and review invalidation.
export const riskDraft: RiskDraft = {
  scope: '자동 검증 전용 가상 항만의 추가 접근 거부 위험', horizon: '2026-10-11~2026-10-17',
  overall: { id: 'overall', label: '추가 접근 거부', summary: '한 차례의 접근 거부 보고는 있지만 지속 여부는 확인되지 않았습니다.', likelihood: 'plausible', impact: 'serious', claimIds: ['access-claim'], criterionIds: ['access'], confidence: { level: 'high', reason: '현재 보고를 전제로 한 조건부 평가' }, limitations: ['후속 관측은 미확인입니다.'] },
  items: [{ id: 'access-risk', label: '항만 접근 제한', summary: '통항 거부가 반복되면 해당 항만 운항에 영향을 줄 수 있습니다.', likelihood: 'plausible', impact: 'limited', claimIds: ['access-claim'], criterionIds: ['access'], confidence: { level: 'high', reason: '가상 관측의 독립성 한계가 있습니다.' }, limitations: ['반복 관측 미확인'] }],
  actions: [{ id: 'check-port', title: '항만 공지의 후속 접근 거부를 대조', purpose: '접근 거부의 지속 여부를 확인해 위험 평가를 갱신합니다.', priority: 'now', owner: '공개자료 분석 담당 제안', timing: '24시간 내', trigger: '항만 당국이 새 접근 거부 공지를 게시하면 재평가', completion: '새 공지 URL·발행일·선박 정보를 원문과 대조', claimIds: ['access-claim'], criterionIds: ['access'] }],
};
export const riskAudit: RiskAudit = { scopeSupported: true, horizonSupported: true, overall: { supported: true, reason: '가상 관측의 조건부 평가 범위 확인' }, items: [{ index: 0, supported: true, reason: '관측과 한계 확인' }], actions: [{ index: 0, supported: true, reason: '공개 공지를 확인하는 후속 분석 제안' }] };
export async function researchedRisk() {
  const { run } = await researchedFramework({ actual: true });
  run.risk = finalizeRisk(run, structuredClone(riskDraft), structuredClone(riskAudit));
  return run;
}
