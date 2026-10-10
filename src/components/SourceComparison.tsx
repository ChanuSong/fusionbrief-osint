import { useState } from 'react';
import type { AnalysisRun, Evidence, SourceLanguage } from '../../shared/types.ts';
import { STATUS_LABELS } from '../../shared/types.ts';
const LANGUAGES: [SourceLanguage, string][] = [['ko','한국어'],['zh','중국어'],['ja','일본어'],['ru','러시아어'],['en','영어']];
export function SourceComparison({ run, onEvidence, onSelectClaim }: { run: AnalysisRun; onEvidence: (evidence: Evidence) => void; onSelectClaim: (id: string) => void }) {
  const [language, setLanguage] = useState<SourceLanguage | 'all'>('all');
  const [claimId, setClaimId] = useState('all');
  const rows = run.evidence.filter(e => (claimId === 'all' || e.claimId === claimId) && (language === 'all' || run.sources.find(s => s.id === e.sourceId)?.language === language));
  const usedLanguages = new Set(run.evidence.map(e => run.sources.find(s => s.id === e.sourceId)?.language));
  return <section id="report-comparison" className="source-comparison" tabIndex={-1} aria-labelledby="comparison-title">
    <div className="answer-heading"><h2 id="comparison-title">다국어 근거 대조</h2><span>원문 → 번역 → 판단</span></div>
    <p className="comparison-intro">같은 발표를 번역하거나 재인용한 보도는 독립된 확인으로 세지 않습니다. 지지·반박은 아래 각 판단을 기준으로 합니다.</p>
    <div className="comparison-filters"><div role="group" aria-label="원문 언어 필터">
      <button aria-pressed={language === 'all'} onClick={() => setLanguage('all')}>전체</button>
      {LANGUAGES.filter(([code]) => usedLanguages.has(code)).map(([code, label]) => <button key={code} aria-pressed={language === code} onClick={() => setLanguage(code)}>{label}<span>{run.sources.filter(s => s.language === code && run.evidence.some(e => e.sourceId === s.id)).length}</span></button>)}
    </div><label>판단<select value={claimId} onChange={event => setClaimId(event.target.value)}><option value="all">전체 판단</option>{run.claims.map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select></label></div>
    <div className="comparison-table-wrap"><table><thead><tr><th>판단·검증 상태</th><th>출처·원출처</th><th>원문과 한국어 해석</th></tr></thead><tbody>{rows.map(e => {
      const source = run.sources.find(s => s.id === e.sourceId)!;
      const claim = run.claims.find(c => c.id === e.claimId)!;
      const group = claim.groups.find(g => g.evidenceIds.includes(e.id));
      return <tr key={e.id}><td><button className="text-button" onClick={() => onSelectClaim(claim.id)}>{claim.label}</button><small>{STATUS_LABELS[claim.status]}</small><span className={`comparison-stance ${e.stance}`}>{e.stance === 'supports' ? '지지' : '반박'}</span></td>
        <td><b>{source.publisher}</b><small>{source.language.toUpperCase()} · {source.publishedAt || '발행일 미확인'}</small><small>원출처: {group?.label ?? e.originLabel}</small><small>{group?.independence === 'verified' ? '독립성 확인' : '독립성 미확인'}</small></td>
        <td><button className="comparison-quote" onClick={() => onEvidence(e)} aria-label={`${source.language.toUpperCase()} 인용 ${run.evidence.indexOf(e) + 1} 원문과 번역 보기`}><span lang={source.language}>{e.quote}</span>{source.language !== 'ko' ? <p>{e.translation}</p> : null}<small>원문에서 확인 ↗</small></button></td></tr>;
    })}</tbody></table></div>
    {!rows.length ? <p className="comparison-empty">이 언어·판단 조합에서 검증된 인용을 확보하지 못했습니다.</p> : null}
    <details className="confidence-rules"><summary>신뢰도 평가 기준과 수집 범위</summary><p>높음: 독립성을 확인한 복수 원출처가 일치. 중간: 원출처 관계는 확인했으나 독립 교차검증은 제한됨. 낮음: 원문은 있으나 원출처 관계 검토가 필요함. 판단 유보: 근거가 부족하거나 상충함.</p>
      <p>유효 인용 언어: {LANGUAGES.filter(([code]) => usedLanguages.has(code)).map(([, label]) => label).join(' · ')}. 자료를 읽었다는 사실과 해당 질문의 근거로 채택했다는 사실은 구분합니다.</p>
      <p>정부 발표도 해당 기관의 발표 내용을 입증하는 자료입니다. 당사자의 의도·현장 상황의 객관적 확인으로 자동 승격하지 않습니다.</p>
    </details>
  </section>;
}
