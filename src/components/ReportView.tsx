import { lazy, Suspense, useEffect, useState, type RefObject } from 'react';
import { CalendarRange, ChevronDown, Download, GitBranch, Layers, MapPin, Pencil, Printer, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { AnalysisRun, AnalyzedClaim, Evidence, CriterionBasis, ReportApproval, ReviewInput } from '../../shared/types.ts';
import { reportContent } from '../../shared/report-content.ts';
import { FrameworkAnalysis } from './FrameworkAnalysis.tsx';
import { ReportDocument } from './ReportDocument.tsx';
import { dateTime, dotDate, MODE_LABELS } from '../lib.ts';
import { reportExportURL } from '../resources.ts';
import { ApprovalPanel } from './ApprovalPanel.tsx';
const KnowledgeGraph = lazy(() => import('./KnowledgeGraph.tsx').then(module => ({ default: module.KnowledgeGraph })));
const LocationView = lazy(() => import('./LocationView.tsx').then(module => ({ default: module.LocationView })));
import { SourceComparison } from './SourceComparison.tsx';
import { DemoProvenance } from './DemoExperience.tsx';
import { BriefingVisuals } from './BriefingVisuals.tsx';
import { OriginFunnel } from './OriginFunnel.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Timeline } from './Timeline.tsx';
const WisdomGraph = lazy(() => import('./WisdomGraph.tsx').then(module => ({ default: module.WisdomGraph })));

export type EvidenceView = 'origins' | 'graph' | 'timeline' | 'map';
const CONFIDENCE = { high: '높음', medium: '중간', low: '낮음', undetermined: '판단 유보' };

export function QuestionBar({ run, locked, onEdit }: { run: AnalysisRun; locked: boolean; onEdit: () => void }) {
  return <div className="question-bar"><span className="question-label">분석 질문</span><p>{run.question}</p>
    <div className="question-chips"><span className="chip">{run.demo ? '사전 수집·검증 결과' : MODE_LABELS[run.mode]}</span>
      <span className="chip">{run.analysis || run.research?.datePolicy === 'event' ? '사건' : '발행'} {run.dateRange.start ? dotDate(run.dateRange.start) : '시작 제한 없음'} – {run.dateRange.end ? dotDate(run.dateRange.end) : '종료 제한 없음'}</span></div>
    <button className="ghost-button" onClick={onEdit} disabled={locked}><Pencil size={14} />질문 수정</button></div>;
}

function AnswerView({ run, onEvidence }: { run: AnalysisRun; onEvidence: (evidence: Evidence) => void }) {
  const coverage = run.research?.coverage ?? [];
  const partial = coverage.filter(c => c.status === 'partial').length;
  const missing = coverage.filter(c => c.status === 'missing').length;
  const incompleteBrief = run.answer?.composition === 'fallback' && run.claims.length > 1;
  return <section id="report-answer" tabIndex={-1} className="answer-section" aria-labelledby="answer-title">
    <div className="answer-heading"><h2 id="answer-title">질문에 대한 답변</h2><span>{run.approval?.decision === 'approved' ? '분석가 승인' : '검토 전 초안'}</span></div>
    {run.research?.scope ? <div className="research-coverage">
      <div className="coverage-overview"><span className={`coverage-dot ${run.research.coverage?.length && run.research.coverage.every(c => c.status === 'answered') ? 'complete' : ''}`} />
        <strong>{incompleteBrief ? '핵심 답변 검증 미완료' : run.research.coverage?.length && run.research.coverage.every(c => c.status === 'answered') ? '필수 항목의 원문 근거 확보'
          : run.claims.length ? '부분 답변 · 추가 조사 필요' : '판단 유보 · 질문에 맞는 근거 미확보'}</strong>
        <span>{[partial ? `${partial}개 부분 확보` : '', missing ? `${missing}개 미확보` : ''].filter(Boolean).join(' · ')}</span></div>
      <details className="coverage-details"><summary>조사 범위와 항목별 확보 현황<ChevronDown size={14} /></summary>
        <p><strong>조사 범위</strong> · {run.research.scope.geography} · {run.research.scope.period}</p>
        {run.research.scope.assumptions.map(text => <p className="scope-assumption" key={text}>가정: {text}</p>)}
        <ul>{run.research.coverage?.map(c => <li key={c.target}><span className={`coverage-tag ${c.status}`}>{c.status === 'answered' ? '확보' : c.status === 'partial' ? '부분 확보' : '미확보'}</span><div><strong>{c.target}</strong><p>{c.reason}</p></div></li>)}</ul>
        <p className="scope-assumption">{run.research.stopReason}</p>
      </details>
    </div> : null}
    {run.answer?.paragraphs.length ? <ol className={`answer-list ${run.answer.composition === 'synthesized' ? 'composed-answer' : ''}`}>{run.answer.paragraphs.map((paragraph, index) => {
      const claims = run.claims.filter(c => paragraph.claimIds.includes(c.id));
      const evidence = run.evidence.filter(e => claims.some(c => c.evidenceIds.includes(e.id)));
      const levels = [...new Set(claims.flatMap(c=>c.confidence ? [c.confidence.level] : []))];
      const reasons = [...new Set(claims.flatMap(c=>c.confidence ? [c.confidence.reason] : []))].join(' · ');
      const body = <p>
        {paragraph.kind === 'assessment' && !paragraph.heading ? <span className="answer-kind">분석 판단</span> : null}
        {paragraph.text}{' '}
        <span className="answer-citations">{evidence.map(e => <button key={e.id} onClick={() => onEvidence(e)}
          title={run.sources.find(s => s.id === e.sourceId)?.title} aria-label={`인용 ${run.evidence.indexOf(e) + 1} 원문 보기`}>[{run.evidence.indexOf(e) + 1}]</button>)}
          {(['undetermined', 'low', 'medium', 'high'] as const).filter(level => levels.includes(level)).slice(0, 1).map(level => <span className={`confidence confidence-${level}`} key={level} title={reasons}>
            신뢰도 {CONFIDENCE[level]}</span>)}</span>
      </p>;
      const compact = run.answer?.composition === 'synthesized' && index > 0;
      return <li key={index} className={`${paragraph.kind} ${index === 0 && run.answer?.composition === 'synthesized' ? 'brief-lead' : ''}`}>
        {compact ? <details className="brief-support"><summary><span>{paragraph.kind === 'assessment' ? '분석 판단' : '근거 설명'}</span><h3>{paragraph.heading ?? `근거 ${index}`}</h3><ChevronDown size={15} /></summary>{body}</details>
          : <>{paragraph.heading ? <h3>{paragraph.heading}</h3> : null}{body}</>}
      </li>;
    })}</ol> : <div className="no-answer"><TriangleAlert size={18} /><h3>질문에 답할 원문 근거를 확보하지 못했습니다.</h3></div>}
    <div className="answer-footer"><span>본문 확보 {run.sources.length}건 · 유효 인용 {run.citationCheck.passed}건</span>
      <span><ShieldCheck size={13} />원문 일치{run.mode === 'live' ? '·모델 내용 대조' : ' 확인'} {run.citationCheck.passed}/{run.citationCheck.checked}
        {run.citationCheck.rejected ? ` · ${run.citationCheck.rejected}건 제외` : ''}</span></div>
  </section>;
}

function ClaimCard({ claim, index, selected, disabled, onSelect }: {
  claim: AnalyzedClaim; index: number; selected: boolean; disabled: boolean; onSelect: () => void;
}) {
  return <button className={`claim-card ${selected ? 'selected' : ''}`} aria-label={`${claim.label} 판단 선택`} aria-pressed={selected} disabled={disabled} onClick={onSelect}>
    <span className="claim-header"><span className="claim-index">{String(index + 1).padStart(2, '0')}</span><strong>{claim.label}</strong></span>
    <StatusBadge status={claim.status} />
  </button>;
}

export function ReportView({ run, colors, claim, onSelectClaim, view, onView, onEvidence, onReview, reviewBusy, locked,
  headingRef, evidenceRef, onApprove, onBasis, onRevalidate, readOnly = false }: {
  run: AnalysisRun; colors: Map<string, string>; claim?: AnalyzedClaim; onSelectClaim: (id: string) => void;
  view: EvidenceView; onView: (view: EvidenceView) => void; onEvidence: (evidence: Evidence) => void;
  onReview: (input: ReviewInput) => Promise<void>; reviewBusy: boolean; locked: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>; evidenceRef: RefObject<HTMLElement | null>;
  onBasis: (basis: CriterionBasis) => void; onRevalidate: () => Promise<void>;
  onApprove: (input: Omit<ReportApproval, 'createdAt' | 'version'>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [activeSection, setActiveSection] = useState('report-answer');
  useEffect(() => {
    setActiveSection('report-answer');
    const ids = ['report-answer', 'report-criteria', 'report-behaviors', 'report-chronology', 'report-imagery', 'report-perspectives', 'report-alternatives', 'report-outlook', 'report-collection', 'report-sources', 'report-visuals', 'report-comparison', 'report-wisdom', 'report-evidence', 'report-review'];
    const update = () => {
      const sections = ids.map(id => document.getElementById(id)).filter((node): node is HTMLElement => !!node && node.offsetHeight > 0);
      const current = [...sections].reverse().find(node => node.getBoundingClientRect().top <= 180) ?? sections[0];
      if (current) setActiveSection(current.id);
    };
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [run.id]);
  const content = reportContent(run);
  const claimRelations = run.relations?.filter(r => r.evidenceIds.some(id => claim?.evidenceIds.includes(id))) ?? [];
  const tabs = [
    { id: 'origins' as const, label: '원출처', icon: Layers },
    { id: 'graph' as const, label: '근거 그래프', icon: GitBranch },
    { id: 'timeline' as const, label: '타임라인', icon: CalendarRange },
    { id: 'map' as const, label: '지도', icon: MapPin },
  ].filter(tab => tab.id === 'origins' || tab.id === 'graph' && (claimRelations.length > 0 || (claim?.documentCount ?? 0) > 1)
    || tab.id === 'timeline' && (content.events.some(e => e.evidenceIds.some(id => claim?.evidenceIds.includes(id)))
      || !run.analysis && run.evidence.some(e => e.claimId === 'schedule' && /\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/.test(e.value)))
    || tab.id === 'map' && content.locations.length > 0);
  const currentView = tabs.some(tab => tab.id === view) ? view : 'origins';
  return <div className={`report-view ${run.analysis ? 'document-layout' : ''}`}>
    <div className="report-header"><div><h2 ref={headingRef} tabIndex={-1}>분석 보고서</h2><span className="version-tag">v{run.version}</span>
      <span className="report-meta">{dateTime(run.createdAt)}</span></div>
      <div className="report-actions">{run.analysis ? <button className="secondary-button" onClick={() => window.print()}><Printer size={15} />인쇄 / PDF</button> : null}<a className="secondary-button export-button" href={reportExportURL(run.id, 'export')}><Download size={15} />Markdown 내려받기</a></div></div>
    <nav className="report-navigation" aria-label="보고서 섹션">
      <a href="#report-answer" aria-current={activeSection === 'report-answer' ? 'location' : undefined}><span>{run.analysis ? '핵심 판단' : '핵심 답변'}</span></a>
      {content.criteria.length ? <a href="#report-criteria" aria-current={activeSection === 'report-criteria' ? 'location' : undefined}><span>기준·사건 대조</span></a> : null}
      {content.observations.length ? <a href="#report-behaviors" aria-current={activeSection === 'report-behaviors' ? 'location' : undefined}><span>주요 관측</span></a> : null}
      {run.analysis?.verification === 'verified' && run.analysis.outlook?.length ? <a href="#report-outlook" aria-current={activeSection === 'report-outlook' ? 'location' : undefined}><span>전망</span></a> : null}
      {run.analysis && (run.evidence.length || content.criteria.some(c => c.basis.some(b => b.verified))) ? <a href="#report-sources" aria-current={activeSection === 'report-sources' ? 'location' : undefined}><span>주석·출처</span></a> : null}
      {content.visuals ? <a href="#report-visuals" aria-current={activeSection === 'report-visuals' ? 'location' : undefined}><span>시각 브리핑</span></a> : null}
      {content.comparison ? <a href="#report-comparison" aria-current={activeSection === 'report-comparison' ? 'location' : undefined}><span>다국어 대조</span></a> : null}
      {content.relationships ? <a href="#report-wisdom" aria-current={activeSection === 'report-wisdom' ? 'location' : undefined}><span>사건 관계</span></a> : null}
      {run.claims.length ? <a href="#report-evidence" aria-current={activeSection === 'report-evidence' ? 'location' : undefined}><span>판단별 근거</span></a> : null}
      <a href="#report-review" aria-current={activeSection === 'report-review' ? 'location' : undefined}><ShieldCheck size={14} /><span>검토·승인</span></a>
    </nav>
    {run.analysis ? <ReportDocument run={run} onEvidence={onEvidence} onBasis={onBasis}><FrameworkAnalysis run={run} onEvidence={onEvidence} onBasis={onBasis} onRevalidate={onRevalidate} busy={locked} /></ReportDocument>
      : <><DemoProvenance run={run} /><AnswerView run={run} onEvidence={onEvidence} /></>}
    <div className={run.analysis ? 'report-tools' : undefined}>
    {run.analysis ? <div className="report-tools-heading"><h2>근거 탐색·분석가 검토</h2><p>판단별 원출처를 비교하고 검토 결정을 기록합니다.</p></div> : null}
    {content.visuals ? <BriefingVisuals key={`visuals-${run.id}-${run.version}`} run={run} onEvidence={onEvidence} onSelectClaim={id => { onSelectClaim(id); onView('origins'); document.getElementById('report-evidence')?.scrollIntoView({ block: 'start' }); }} /> : null}
    {content.comparison ? <SourceComparison key={run.id} run={run} onEvidence={onEvidence} onSelectClaim={id => { onSelectClaim(id); document.getElementById("report-evidence")?.scrollIntoView({ behavior: "smooth" }); }} /> : null}
    {content.relationships ? <div id="report-wisdom" tabIndex={-1}><Suspense fallback={<p className="graph-loading">관계 그래프 준비 중…</p>}><WisdomGraph key={`${run.id}-${run.version}`} run={run} onEvidence={onEvidence} /></Suspense></div> : null}
    {run.claims.length ? <div id="report-evidence" tabIndex={-1} className="analysis-grid">
      <section className="claims-panel" aria-labelledby="claims-title"><div className="section-heading"><h2 id="claims-title">판단별 근거</h2><span>{run.claims.length}</span></div>
        <div className="claim-list">{run.claims.map((c, i) => <ClaimCard key={c.id} claim={c} index={i} selected={claim?.id === c.id}
          disabled={locked} onSelect={() => onSelectClaim(c.id)} />)}</div></section>
      <section className="evidence-workspace" aria-label="선택한 판단의 근거" ref={evidenceRef}>
        {claim ? <><div className="detail-heading"><div><span className="eyebrow">{claim.label}</span><h2>{claim.statement}</h2></div><StatusBadge status={claim.status} /></div>
          <p className="claim-reason">{claim.reason}</p>
          {claim.confidence ? <p className="confidence-reason">신뢰도 {CONFIDENCE[claim.confidence.level]} · {claim.confidence.reason}</p> : null}
          {claim.documentCount > 1 ? <OriginFunnel run={run} claim={claim} colors={colors} /> : null}
          <div className="detail-tabs" role="tablist" aria-label="근거 보기 방식">{tabs.map(tab =>
            <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={currentView === tab.id} aria-controls={`panel-${tab.id}`}
              tabIndex={currentView === tab.id ? 0 : -1} className={currentView === tab.id ? 'active' : ''} onClick={() => onView(tab.id)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index = tabs.findIndex(t => t.id === currentView);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                onView(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus();
              }}><tab.icon size={15} />{tab.label}</button>)}</div>
          <div role="tabpanel" id="panel-origins" aria-labelledby="tab-origins" hidden={currentView !== 'origins'}>
            <ReviewPanel key={`${run.id}-${claim.id}-${run.version}`} run={run} claim={claim} colors={colors} onEvidence={onEvidence} onReview={onReview} busy={reviewBusy || readOnly} /></div>
          <div role="tabpanel" id="panel-graph" aria-labelledby="tab-graph" hidden={currentView !== 'graph'}>
            {currentView === 'graph' ? <Suspense fallback={<p className="graph-loading">근거 그래프 준비 중…</p>}><KnowledgeGraph run={run} claim={claim} colors={colors} onEvidence={onEvidence} /></Suspense> : null}
            {claimRelations.length ? <table className="entity-relations"><thead><tr><th>대상</th><th>관계</th><th>대상</th><th>근거</th></tr></thead><tbody>{claimRelations.map((r, i) =>
              <tr key={i}><td>{run.entities.find(e => e.id === r.from)?.label ?? r.from}</td><td>{r.label}</td><td>{run.entities.find(e => e.id === r.to)?.label ?? r.to}</td>
                <td>{r.evidenceIds.map(id => { const e = run.evidence.find(ev => ev.id === id); return e ? <button className="text-button" key={id} onClick={() => onEvidence(e)}>[{run.evidence.indexOf(e) + 1}]</button> : null; })}</td></tr>)}</tbody></table> : null}</div>
          <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={currentView !== 'timeline'}><Timeline run={run} claim={claim} colors={colors} onEvidence={onEvidence} /></div>
          <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={currentView !== 'map'}>{currentView === 'map' ? <Suspense fallback={<p className="graph-loading">지도 준비 중…</p>}><LocationView run={run} onEvidence={onEvidence} /></Suspense> : null}</div>
        </> : null}</section></div> : null}
    {!run.analysis && run.gaps.length ? <details className="gaps-card"><summary><TriangleAlert size={16} /><h2 id="gaps-title">미확인 사항</h2><span>{run.gaps.length}건</span><ChevronDown size={15} /></summary><ul>{run.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></details> : null}
    <div id="report-review" tabIndex={-1}><ApprovalPanel key={run.id} run={run} busy={locked} onApprove={onApprove} readOnly={readOnly} /></div>
    {run.collections.length || run.research?.queries.length ? <details className="collection-log"><summary>{run.sources.length ? `수집 자료·검증 기록 · ${run.sources.length}건` : `조사·검증 기록 · ${run.research?.queries.length ?? 0}개 질의`}</summary>
      <p>{run.coverage}</p><table><thead><tr><th>출처</th><th>수집 결과</th><th>시각</th></tr></thead><tbody>{run.collections.map((item, i) =>
        <tr key={i}><td>{run.sources.find(s => s.id === item.sourceId)?.publisher ?? item.sourceId}</td><td>{item.message}</td><td>{dateTime(item.checkedAt)}</td></tr>)}</tbody></table>
      {run.research ? <><h3>검색 질의</h3><ol>{run.research.queries.map((q, i) => <li key={i}>{q.language.toUpperCase()} · {q.module} · {q.query}</li>)}</ol>
        <details><summary>수집 모듈 실행 기록 · {run.research.searches?.length ?? 0}건</summary><ol>{run.research.searches?.map((search, index) => <li key={index}>
          <b>{search.query.language.toUpperCase()} · {search.query.module} · {search.provider}</b><p>{search.query.query}</p><small>{dateTime(search.completedAt)} · {search.error ?? `${search.hits.length}개 검색 결과`}</small>
        </li>)}</ol></details>
        {run.research.rounds?.map(round => <details key={round.round}><summary>{round.round}차 자료 적합성 검사</summary><ul>{round.documents.map(doc => <li key={doc.sourceId}>
          {run.sources.find(s => s.id === doc.sourceId)?.title} · {doc.role === 'direct' ? '직접 근거' : doc.role === 'framework' ? '기준 자료' : doc.role === 'precedent' ? '선례' : doc.role === 'background' ? '배경 자료' : '질문 범위 밖'} · {doc.reason}</li>)}</ul></details>)}
        {run.research.rejectedCitations.length ? <><h3>제외한 인용</h3><ul>{run.research.rejectedCitations.map((reason, i) => <li key={i}>{reason}</li>)}</ul></> : null}</> : null}
      <small>보고서 {run.id} · {run.research ? `Cursor CLI / ${run.research.model}` : run.datasetVersion}</small>
    </details> : null}
    </div>
  </div>;
}
