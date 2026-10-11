import { useMemo, useState } from 'react';
import { ArrowRight, CalendarRange, Layers } from 'lucide-react';
import type { AnalysisRun, Evidence } from '../../shared/types.ts';
const LEVELS = { high: '높음', medium: '중간', low: '낮음', undetermined: '판단 유보' };
export function BriefingVisuals({ run, onEvidence, onSelectClaim, onGraph }: { run: AnalysisRun; onEvidence: (evidence: Evidence) => void; onSelectClaim: (id: string) => void; onGraph:(ids:string[],sentence:string)=>void }) {
  const events = useMemo(() => [...(run.events ?? [])].sort((a,b) => a.date.localeCompare(b.date)), [run]);
  const dates = [...new Set(events.map(e => e.date))];
  const [view, setView] = useState<'timeline' | 'origins'>(dates.length ? 'timeline' : 'origins');
  const [selectedDate, setDate] = useState(dates.filter(date => !run.dateRange.end || date <= run.dateRange.end).at(-1) ?? dates[0]);
  const max = Math.max(1, ...run.claims.map(c => Math.max(c.documentCount, c.groups.length)));
  const citedSources = run.sources.filter(s => run.evidence.some(e => e.sourceId === s.id));
  const languages = [...new Set(citedSources.map(s => s.language))];
  const hypotheses = run.wisdom?.inferences.filter(i => i.rule === 'competing-explanation') ?? [];
  const evidenceButton = (id: string) => { const evidence = run.evidence.find(e => e.id === id); return evidence ? <button key={id} className="text-button" onClick={() => onEvidence(evidence)} aria-label={`브리핑 인용 ${run.evidence.indexOf(evidence) + 1} 원문 보기`}>[{run.evidence.indexOf(evidence) + 1}]</button> : null; };
  return <section id="report-visuals" tabIndex={-1} className="briefing-visuals" aria-labelledby="briefing-visuals-title">
    <div className="briefing-visuals-heading"><div><span className="eyebrow">EVIDENCE BRIEFING</span><h2 id="briefing-visuals-title">판단을 뒷받침하는 정보</h2></div><span>{citedSources.length}개 인용 문서 · {languages.map(l => l.toUpperCase()).join(' / ')}</span></div>
    <div className="briefing-visual-grid"><div className="briefing-chart"><div className="briefing-tabs" role="tablist" aria-label="브리핑 시각화">
      {(['timeline','origins'] as const).map((id, index) => <button key={id} id={`briefing-tab-${id}`} role="tab" aria-controls={`briefing-panel-${id}`} aria-selected={view === id} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)} onKeyDown={event => {
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'timeline' : event.key === 'End' ? 'origins' : index ? 'timeline' : 'origins'; setView(next); document.getElementById(`briefing-tab-${next}`)?.focus(); }
      }}>{id === 'timeline' ? <CalendarRange size={14} /> : <Layers size={14} />}{id === 'timeline' ? '사건 흐름' : '출처 의존도'}</button>)}
    </div>
      <div role="tabpanel" id="briefing-panel-timeline" aria-labelledby="briefing-tab-timeline" hidden={view !== 'timeline'}>
        {dates.length ? <><div className="briefing-time-track" aria-label="원문에 근거한 사건 순서">{dates.map((date, index) => <button key={date} aria-pressed={date === selectedDate} aria-label={`${date} 사건 보기`} onClick={() => setDate(date)}><time>{date.slice(5).replace('-','.')}</time><span className="briefing-time-dot">{index + 1}</span><small>{events.filter(e => e.date === date).length}개 사건</small></button>)}</div>
          <p className="briefing-chart-note">{dates[0]} — {dates.at(-1)} · 사건 순서이며 간격은 시간 축척이 아닙니다.</p>
          <div className="briefing-events">{events.filter(e => e.date === selectedDate).map((event, index) => {
            const claims = run.claims.filter(c => c.evidenceIds.some(id => event.evidenceIds.includes(id)));
            const level = (['undetermined','low','medium','high'] as const).find(l => claims.some(c => (c.confidence?.level ?? 'undetermined') === l)) ?? 'undetermined';
            return <article key={index}><span>{/예정/.test(event.label) ? '예정 일정' : '원문에 기록된 사건'}</span><h3>{event.label}</h3><div><time>{event.date}</time><small>근거 신뢰도 {LEVELS[level]}</small>{event.evidenceIds.map(evidenceButton)}</div></article>;
          })}</div></> : <p className="briefing-empty">시점을 검증한 사건이 없습니다. 출처 의존도에서 확보한 근거를 확인하세요.</p>}
      </div>
      <div role="tabpanel" id="briefing-panel-origins" aria-labelledby="briefing-tab-origins" hidden={view !== 'origins'}>
        <p className="briefing-chart-note"><i className="documents" />문서 <i className="origins" />원출처 묶음 · 막대 선택 시 근거 검토</p>
        <div className="briefing-origin-chart">{run.claims.map(c => <button key={c.id} onClick={() => onSelectClaim(c.id)} aria-label={`${c.label}: 문서 ${c.documentCount}, 원출처 ${c.groups.length}, 독립성 확인 ${c.independentCount}. 근거 검토`}><span>{c.label}</span><div className="briefing-bars"><i className="documents" style={{ width: `${c.documentCount / max * 100}%` }} /><i className="origins" style={{ width: `${c.groups.length / max * 100}%` }} /></div><strong>{c.documentCount} → {c.groups.length}</strong><small>독립 {c.independentCount} · 신뢰도 {LEVELS[c.confidence?.level ?? 'undetermined']}</small></button>)}</div>
        <p className="briefing-chart-note">원출처가 여러 개여도 독립 확인과는 다릅니다. 원출처 병합·독립성 검토를 반영해 다시 계산합니다.</p>
      </div>
    </div><aside className="briefing-next"><span className="eyebrow">분석적 판단 · 불확실성</span>
      {hypotheses[0] ? <><h3>근거를 연결한 해석</h3><p>{hypotheses[0].conclusion}</p><div className="briefing-inference-citations"><small>해석 · 신뢰도 {LEVELS[hypotheses[0].confidence]}</small>{hypotheses[0].evidenceIds.map(evidenceButton)}</div><details><summary>다음 확인과 경쟁 설명</summary><p>{hypotheses[0].nextCheck}</p><ul>{hypotheses[0].alternatives.map(item => <li key={item}>{item}</li>)}</ul></details></>
        : <><h3>{run.gaps.length ? '추가로 확보할 정보' : '출처 독립성을 확인하세요'}</h3><p>{run.gaps[0] ?? '독립적인 공개 원문이 같은 판단을 뒷받침하는지 검토해야 합니다.'}</p></>}
      {hypotheses[0] ? <button className="judgment-graph-trigger" onClick={()=>onGraph(hypotheses[0].claimIds,hypotheses[0].conclusion)}>이 해석의 관계와 원문 보기<ArrowRight size={14}/></button>:null}
    </aside></div>
  </section>;
}
