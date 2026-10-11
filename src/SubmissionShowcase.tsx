import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, FileCheck, LoaderCircle, Play } from 'lucide-react';
import type { AnalysisRun, CriterionBasis, Evidence, SourceDocument } from '../shared/types.ts';
import { BrandMark } from './components/Sidebar.tsx';
import { EvidenceDialog } from './components/EvidenceDialog.tsx';
import { ReportView, type EvidenceView } from './components/ReportView.tsx';
import { originColors } from './lib.ts';
import { publicResource } from './resources.ts';
import { PRIMARY_QUESTION, PRIMARY_SCENARIO_ID } from '../shared/primary-scenario.ts';

interface SavedCase { id: string; title: string; subtitle: string; file: string; documents: number; citations: number; criteria?: number; actions?: number; }
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
  const primary = cases.find(c => c.id === PRIMARY_SCENARIO_ID);
  return <div className="showcase-shell">
    <a className="skip-link" href="#showcase-main">본문으로 이동</a>
    <header className="showcase-header"><a className="brand" href={publicResource('')}><BrandMark /><span>FUSIONBRIEF</span></a><span>다중출처 수집·교차검증·인텔 리포트</span><a href="https://github.com/ChanuSong/fusionbrief-osint" target="_blank" rel="noreferrer">코드·실행 방법<ArrowUpRight size={14} /></a></header>
    <main id="showcase-main">
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      {!run ? <>
        <section className="showcase-hero"><p className="eyebrow">SOURCE FUSION · VERIFIED BRIEFINGS</p><h1>흩어진 정보에서,<br />결정에 필요한 인사이트로.</h1><p>북한 발표, 정부의 관측, 항행 경보와 공개 영상을 연결합니다.<br />위험 신호와 정보 공백을 대조해, 근거를 확인할 수 있는 판단과 다음 액션을 제시합니다.</p>
          <div className="showcase-question"><span>대표 분석 질문</span><p>{PRIMARY_QUESTION}</p>{primary ? <button className="primary-button" disabled={busy} onClick={() => void open(primary)}>{busy ? <LoaderCircle className="spinning" size={16} /> : <FileCheck size={16} />}보존 보고서 열기</button> : <p role="status">보고서 목록 불러오는 중…</p>}</div>
          <p className="showcase-mode"><a href="https://specifies-cheque-synthetic-injection.trycloudflare.com" target="_blank" rel="noreferrer">새 질문으로 실제 수집·분석 실행 ↗</a> · 아래에서는 완료한 보고서와 실제 공개 관측 스냅샷을 바로 검토할 수 있습니다.</p>
        </section>
        <section className="showcase-proof" aria-label="대표 분석 검증 결과"><div><strong>11</strong><span>조사 대상 공개 자료 유형</span></div><div><strong>{primary ? `${primary.documents} / ${primary.citations}` : '…'}</strong><span>실제 원문 / 유효 사건 인용</span></div><div><strong>{primary?.criteria ?? '…'}</strong><span>원문을 대조한 판단 기준</span></div><div><strong>{primary?.actions ?? '…'}</strong><span>근거가 연결된 권장 액션</span></div></section>
        <section className="showcase-value" aria-label="시스템의 효용"><article><span className="eyebrow">INSIGHT</span><h2>자료 사이에서 위험 신호를 찾습니다.</h2><p>발표와 관측의 충돌, 기존 제한과 새 사건의 차이를 대조합니다. 어떤 근거가 판단을 바꾸는지와 추가로 확인할 정보를 제시합니다.</p></article><article><span className="eyebrow">ANALYST TIME</span><h2>반복 조사를 자동화합니다.</h2><p>다국어 검색, 원문 확보, 인용·번역 대조와 보고서 작성을 연결합니다. 분석가는 출처를 오가는 반복 작업을 줄이고 핵심 판단과 검토에 집중합니다.</p></article><article><span className="eyebrow">EVIDENCE ONTOLOGY</span><h2>판단의 전제를 추적합니다.</h2><p>기준·사건·주장·원문을 근거 온톨로지로 연결합니다. 같은 발표의 중복을 확인하고, 근거 변경 시 판단과 위험도를 다시 검증합니다.</p></article></section>
        <section className="showcase-cases"><h2>실제 분석 결과</h2><p>기사 수, 독립 원출처 수, 판단 기준 충족 수를 구분합니다. 근거가 부족하면 판단을 유보합니다.</p><div>{cases.map(item => <button key={item.id} disabled={busy} onClick={() => void open(item)}><span className="eyebrow">{item.documents}개 원문 · {item.citations}개 사건 인용</span><strong>{item.title}</strong><span>{item.subtitle}</span><ArrowUpRight size={18} /></button>)}</div></section>
        <section className="showcase-video"><div><p className="eyebrow">PRODUCT WALKTHROUGH</p><h2>보고서에서 원문까지</h2><p>판단 기준과 사건 대조, 출처별 검증, 위험도 색상 그래프와 권장 추가 액션을 실제 화면으로 살펴봅니다.</p></div><video controls preload="metadata" poster={publicResource('screenshots/fusionbrief-01-report.png')}><source src={publicResource('fusionbrief-walkthrough.mp4')} type="video/mp4" />브라우저에서 영상을 재생할 수 없습니다.</video><a className="secondary-button" href={publicResource('fusionbrief-walkthrough.mp4')}><Play size={15} />영상 열기</a></section>
      </> : <><div className="showcase-report-banner"><button className="ghost-button" onClick={() => setRun(undefined)}><ChevronLeft size={16} />사례 목록</button><span>보존한 실제 분석 결과 · 실시간 수집 아님 · 검토 전 초안</span></div><ReportView run={run} colors={colors} claim={run.claims.find(c => c.id === claimId)} onSelectClaim={setClaimId} view={view} onView={setView} onEvidence={showEvidence} onBasis={showBasis} onReview={unavailable} onApprove={unavailable} onRevalidate={unavailable} reviewBusy={false} locked={false} headingRef={headingRef} evidenceRef={evidenceRef} readOnly /></>}
    </main>
    <footer className="showcase-footer">FUSIONBRIEF · T2-1 Fusion OSINT Copilot · 공개 자료만 사용 · 가능성과 근거 신뢰도를 구분합니다.</footer>
    {drawer ? <EvidenceDialog {...drawer} onClose={() => setDrawer(undefined)} /> : null}
  </div>;
}
