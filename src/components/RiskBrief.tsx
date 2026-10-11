import type { AnalysisRun, Evidence, RiskEstimate } from '../../shared/types.ts';
import { CONFIDENCE_LABEL } from '../../shared/report-content.ts';
import { IMPACT_LABELS, LIKELIHOOD_LABELS, RISK_LABELS, RISK_LEVELS, RISK_MATRIX, RISK_METHOD } from '../../shared/risk-policy.ts';
import '../risk-brief.css';

function Citations({ run, ids, onEvidence }: { run: AnalysisRun; ids: string[]; onEvidence: (e: Evidence) => void }) {
  const linked = run.evidence.filter(e => ids.some(id => run.claims.find(c => c.id === id)?.evidenceIds.includes(e.id)));
  return <span className="answer-citations">{linked.map(e => <button key={e.id} onClick={() => onEvidence(e)} aria-label={`위험 평가 인용 ${run.evidence.indexOf(e) + 1} 원문 보기`}>[{run.evidence.indexOf(e) + 1}]</button>)}</span>;
}
function RiskScale({ item }: { item: RiskEstimate }) {
  return <div className="risk-scale" role="img" aria-label={`${item.label} 위험도 ${RISK_LABELS[item.level]}. 낮음, 주의, 상승, 높음, 매우 높음의 정성적 척도.`}>
    {RISK_LEVELS.map(level => <span key={level} className={`risk-scale-segment risk-${level} ${item.level === level ? 'is-selected' : ''}`}><span>{RISK_LABELS[level]}</span>{item.level === level ? <b aria-hidden="true">현재 평가</b> : null}</span>)}
  </div>;
}
export function RiskConclusion({ run }: { run: AnalysisRun }) {
  const risk = run.risk;
  if (!risk) return null;
  const ready = risk.verification === 'verified' && run.analysis?.verification === 'verified';
  const level = ready ? risk.overall.level : 'unassessed';
  return <aside className={`risk-conclusion risk-${level}`} aria-label="결론의 위험도">
    <div><span className="eyebrow">위험도 평가</span><strong>{RISK_LABELS[level]}</strong><span>{risk.horizon}</span></div>
    <p>{ready ? risk.overall.label : '근거가 변경되어 위험 평가의 재검증이 필요합니다.'}</p>
    {ready ? <small>발생 가능성: {LIKELIHOOD_LABELS[risk.overall.likelihood]} · 영향: {IMPACT_LABELS[risk.overall.impact]} · 근거 신뢰도: {CONFIDENCE_LABEL[risk.overall.confidence.level]}</small> : null}
  </aside>;
}
export function RiskChart({ run, onEvidence }: { run: AnalysisRun; onEvidence: (e: Evidence) => void }) {
  const risk = run.risk;
  if (!risk || risk.verification !== 'verified' || run.analysis?.verification !== 'verified') return null;
  const overall = risk.overall;
  return <section id="report-risk" className="framework-section risk-chart-section" aria-labelledby="risk-title" tabIndex={-1}>
    <div className="answer-heading"><h2 id="risk-title">위험도와 판단 근거</h2><span>가능성 × 영향 · 근거 신뢰도와 구분</span></div>
    <p className="risk-scope"><strong>평가 범위</strong> {risk.scope}<br /><strong>평가 기간</strong> {risk.horizon} · 자료 확인 {risk.asOf.slice(0, 10)}</p>
    <div className="risk-overall"><div><span className="eyebrow">종합 위험도</span><strong className={`risk-level-label risk-${overall.level}`}>{RISK_LABELS[overall.level]}</strong></div><p>{overall.summary} <Citations run={run} ids={overall.claimIds} onEvidence={onEvidence} /></p></div>
    <RiskScale item={overall} />
    <div className="risk-chart-grid"><table className="risk-matrix"><caption>표. 발생 가능성과 영향의 대조</caption><thead><tr><th scope="col">가능성 / 영향</th><th scope="col">제한적</th><th scope="col">중대</th><th scope="col">심각</th></tr></thead><tbody>{(['likely', 'plausible', 'unlikely'] as const).map(likelihood => <tr key={likelihood}><th scope="row">{LIKELIHOOD_LABELS[likelihood]}</th>{(['limited', 'serious', 'severe'] as const).map(impact => {
      const current = overall.likelihood === likelihood && overall.impact === impact;
      return <td key={impact} className={`risk-${RISK_MATRIX[likelihood][impact]} ${current ? 'risk-current-cell' : ''}`}>{RISK_LABELS[RISK_MATRIX[likelihood][impact]]}{current ? <strong>● 현재 평가</strong> : null}</td>;
    })}</tr>)}</tbody></table><div className="risk-interpretation"><h3>평가의 근거와 한계</h3><p>근거 신뢰도 <strong>{CONFIDENCE_LABEL[overall.confidence.level]}</strong> · {overall.confidence.reason}</p><ul>{overall.limitations.map(item => <li key={item}>{item}</li>)}</ul></div></div>
    {risk.items.length ? <div className="risk-items"><h3>위험 항목별 비교</h3>{risk.items.map(item => <article key={item.id}><div className="risk-item-heading"><h4>{item.label}</h4><strong className={`risk-level-label risk-${item.level}`}>{RISK_LABELS[item.level]}</strong></div><RiskScale item={item} /><p>{item.summary} <Citations run={run} ids={item.claimIds} onEvidence={onEvidence} /></p><small>{LIKELIHOOD_LABELS[item.likelihood]} · {IMPACT_LABELS[item.impact]} · 근거 신뢰도 {CONFIDENCE_LABEL[item.confidence.level]}</small></article>)}</div> : null}
    <p className="risk-method-note">{RISK_METHOD}</p>
  </section>;
}
export function RecommendedActions({ run, onEvidence }: { run: AnalysisRun; onEvidence: (e: Evidence) => void }) {
  const risk = run.risk;
  if (!risk?.actions.length || risk.verification !== 'verified' || run.analysis?.verification !== 'verified') return null;
  const priorities = { now: '우선 확인', next: '다음 확인', watch: '징후 감시' };
  const order = { now: 0, next: 1, watch: 2 };
  return <section id="report-actions" className="framework-section recommended-actions" aria-labelledby="actions-title" tabIndex={-1}>
    <div className="answer-heading"><h2 id="actions-title">권장 추가 액션</h2><span>분석가 검토를 위한 제안</span></div>
    <p className="risk-action-note">근거와 정보 공백에 따른 후속 확인입니다. 담당·기한은 제안이며 실행 여부는 기록하지 않았습니다.</p>
    <ol>{[...risk.actions].sort((a, b) => order[a.priority] - order[b.priority]).map((action, index) => <li key={action.id}><div className="action-number">{String(index + 1).padStart(2, '0')}</div><article><div className="action-heading"><h3>{action.title}</h3><span className={`action-priority ${action.priority}`}>{priorities[action.priority]}</span></div><p className="action-meta">{action.owner} · {action.timing}</p><p>{action.purpose} <Citations run={run} ids={action.claimIds} onEvidence={onEvidence} /></p><dl><div><dt>재평가 신호</dt><dd>{action.trigger}</dd></div><div><dt>완료 조건</dt><dd>{action.completion}</dd></div></dl></article></li>)}</ol>
  </section>;
}
