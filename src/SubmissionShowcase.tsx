import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, FileCheck, LoaderCircle, Play } from 'lucide-react';
import type { AnalysisRun, CriterionBasis, Evidence, SourceDocument } from '../shared/types.ts';
import { BrandMark } from './components/Sidebar.tsx';
import { EvidenceDialog } from './components/EvidenceDialog.tsx';
import { ReportView, type EvidenceView } from './components/ReportView.tsx';
import { originColors } from './lib.ts';
import { publicResource } from './resources.ts';

interface SavedCase { id: string; title: string; subtitle: string; file: string; documents: number; citations: number; }
export function SubmissionShowcase() {
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [run, setRun] = useState<AnalysisRun>();
  const [claimId, setClaimId] = useState('');
  const [view, setView] = useState<EvidenceView>('origins');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState<{ source: SourceDocument; evidence?: Evidence; basis?: CriterionBasis }>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const colors = useMemo(() => run ? originColors(run) : new Map<string, string>(), [run]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(publicResource('reports/catalog.json'), { signal: controller.signal }).then(r => { if (!r.ok) throw Error('보존 보고서 목록을 읽지 못했습니다.'); return r.json(); }).then(setCases).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (run) { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); } }, [run]);
  const open = async (item: SavedCase) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(publicResource(item.file), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('보존 보고서를 읽지 못했습니다.');
      const next = await response.json() as AnalysisRun;
      setRun(next); setClaimId(next.claims[0]?.id ?? ''); setView('origins');
    } catch (e) { setError(e instanceof Error ? e.message : '보고서를 읽지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const showEvidence = (evidence: Evidence) => { const source = run?.sources.find(s => s.id === evidence.sourceId); if (source) setDrawer({ source, evidence }); };
  const showBasis = (basis: CriterionBasis) => { const source = run?.sources.find(s => s.id === basis.sourceId); if (source) setDrawer({ source, basis }); };
  const unavailable = async () => {};
  return <div className="showcase-shell">
    <a className="skip-link" href="#showcase-main">본문으로 이동</a>
    <header className="showcase-header"><a className="brand" href={publicResource('')}><BrandMark /><span>TRACE</span></a><span>Fusion OSINT Copilot</span><a href="https://github.com/ChanuSong/trace-osint-copilot" target="_blank" rel="noreferrer">코드·실행 방법<ArrowUpRight size={14} /></a></header>
    <main id="showcase-main">
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      {!run ? <>
        <section className="showcase-hero"><p className="eyebrow">PUBLIC SOURCES · TRACEABLE JUDGMENTS</p><h1>판단을 읽고,<br />근거를 검증하세요.</h1><p>자연어 질문에서 판단 기준을 먼저 세우고,<br />여러 공개 출처를 대조해 출처와 신뢰도가 있는 정보분석 보고서를 만듭니다.</p>
          <div className="showcase-question"><span>대표 분석 질문</span><p>김주애의 북한 후계자 계승 가능성은? 근거와 전망을 분석해줘.</p>{cases[0] ? <button className="primary-button" disabled={busy} onClick={() => void open(cases[0])}>{busy ? <LoaderCircle className="spinning" size={16} /> : <FileCheck size={16} />}보존 보고서 열기</button> : <p role="status">보고서 목록 불러오는 중…</p>}</div>
          <p className="showcase-mode">실제 수집·검증한 결과를 탐색하는 웹 데모입니다. 새로운 질문의 실시간 수집과 검토 저장은 로컬 앱에서 실행합니다.</p>
        </section>
        <section className="showcase-proof" aria-label="대표 분석 검증 결과"><div><strong>6</strong><span>원문이 연결된 판단 기준</span></div><div><strong>19 / 15</strong><span>보존 원문 / 유효 사건 인용</span></div><div><strong>3</strong><span>조건부 전망과 변화 징후</span></div><div><strong>1</strong><span>검증을 통과한 이미지 관측</span></div></section>
        <section className="showcase-cases"><h2>실제 분석 결과</h2><p>기사 수, 독립 원출처 수, 판단 기준 충족 수를 구분합니다. 근거가 부족하면 판단을 유보합니다.</p><div>{cases.map(item => <button key={item.id} disabled={busy} onClick={() => void open(item)}><span className="eyebrow">{item.documents}개 원문 · {item.citations}개 사건 인용</span><strong>{item.title}</strong><span>{item.subtitle}</span><ArrowUpRight size={18} /></button>)}</div></section>
        <section className="showcase-video"><div><p className="eyebrow">PRODUCT WALKTHROUGH</p><h2>보고서에서 원문까지</h2><p>판단 기준과 사건 대조, 출처별 검증, 관계 시각화, 조건부 전망을 실제 화면으로 살펴봅니다.</p></div><video controls preload="metadata" poster={publicResource('screenshots/01-report.png')}><source src={publicResource('trace-walkthrough.mp4')} type="video/mp4" />브라우저에서 영상을 재생할 수 없습니다.</video><a className="secondary-button" href={publicResource('trace-walkthrough.mp4')}><Play size={15} />영상 열기</a></section>
      </> : <><div className="showcase-report-banner"><button className="ghost-button" onClick={() => setRun(undefined)}><ChevronLeft size={16} />사례 목록</button><span>보존한 실제 분석 결과 · 실시간 수집 아님 · 검토 전 초안</span></div><ReportView run={run} colors={colors} claim={run.claims.find(c => c.id === claimId)} onSelectClaim={setClaimId} view={view} onView={setView} onEvidence={showEvidence} onBasis={showBasis} onReview={unavailable} onApprove={unavailable} onRevalidate={unavailable} reviewBusy={false} locked={false} headingRef={headingRef} evidenceRef={evidenceRef} readOnly /></>}
    </main>
    <footer className="showcase-footer">TRACE · T2-1 Fusion OSINT Copilot · 공개 자료만 사용 · 가능성과 근거 신뢰도를 구분합니다.</footer>
    {drawer ? <EvidenceDialog {...drawer} onClose={() => setDrawer(undefined)} /> : null}
  </div>;
}
