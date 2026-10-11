import { PRIMARY_QUESTION } from '../shared/primary-scenario.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import type { CriterionBasis, AnalysisRun, CollectionMode, Dataset, Evidence, ReportApproval, ResearchTrace, ReviewInput, SourceDocument, SourceLanguage } from '../shared/types.ts';
import { AuditLog, SourceLibrary } from './components/LibraryViews.tsx';
import { EvidenceDialog } from './components/EvidenceDialog.tsx';
import { QueryComposer } from './components/QueryComposer.tsx';
import { QuestionBar, ReportView, type EvidenceView } from './components/ReportView.tsx';
import { Sidebar, type Tab } from './components/Sidebar.tsx';
import { StartView } from './components/StartView.tsx';
import { ResearchProgress } from './components/ResearchProgress.tsx';
import { KnowledgeLibrary } from './components/KnowledgeLibrary.tsx';
import { originColors, request, type RecentRun } from './lib.ts';

interface Bootstrap { dataset: Dataset; questions: string[]; recentRuns: RecentRun[]; capabilities: { available: boolean; model: string; message: string }; }
interface Job { id: string; state: 'running' | 'complete' | 'failed'; trace: ResearchTrace[]; run?: AnalysisRun; error?: string; }

const DEFAULT_QUESTION = PRIMARY_QUESTION;
const SNAPSHOT_QUESTION = '2024년 6월 첫 프리덤 에지의 일정, 참가국, 발표 목적을 정리하고 원출처를 구분해줘.';
const preferredClaim = (run: AnalysisRun) => run.claims.find(c => c.id === 'participants')?.id ?? run.claims[0]?.id ?? '';

export default function App() {
  const [boot, setBoot] = useState<Bootstrap>();
  const [run, setRun] = useState<AnalysisRun>();
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [mode, setMode] = useState<CollectionMode>('live');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [languages, setLanguages] = useState<SourceLanguage[]>(['ko', 'zh', 'ja', 'ru', 'en']);
  const [urls, setURLs] = useState('');
  const [trace, setTrace] = useState<ResearchTrace[]>([]);
  const [selectedClaim, setSelectedClaim] = useState('participants');
  const [tab, setTab] = useState<Tab>('workspace');
  const [view, setView] = useState<EvidenceView>('origins');
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number>();
  const [lastCheckedAt, setLastCheckedAt] = useState<number>();
  const [pendingJob, setPendingJob] = useState<{ id: string; startedAt: number }>();
  const [reviewBusy, setReviewBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<{ source: SourceDocument; evidence?: Evidence; basis?: CriterionBasis }>();
  const [historyOpen, setHistoryOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const analyzing = !!pendingJob || (busy && analysisStartedAt !== undefined);
  const locked = busy || reviewBusy || !!pendingJob;
  const runId = run?.id;
  const colors = useMemo(() => run ? originColors(run) : new Map<string, string>(), [run]);

  const load = () => request<Bootstrap>('/api/bootstrap', { signal: AbortSignal.timeout(15000) }).then(setBoot);
  useEffect(() => {
    const controller = new AbortController();
    request<Bootstrap>('/api/bootstrap', { signal: controller.signal }).then(async data => {
      setBoot(data);
      const requestedRun=new URLSearchParams(window.location.search).get('run');
      if(requestedRun&&/^[a-f0-9-]{36}$/.test(requestedRun)){
        const next=await request<AnalysisRun>(`/api/runs/${requestedRun}`,{signal:controller.signal});
        setRun(next);setQuestion(next.question);setMode(next.mode);setStartDate(next.dateRange.start);setEndDate(next.dateRange.end);
        setSelectedClaim(preferredClaim(next));setEditing(false);setView('origins');
      }
    }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '자료를 불러오지 못했습니다.');
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (runId && !analyzing) {
      reportHeading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [runId, analyzing]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const acceptRun = (next: AnalysisRun) => {
    setRun(next); setSelectedClaim(preferredClaim(next));
    setTab('workspace'); setEditing(false); setView('origins');
    void load().catch(() => setNotice('보고서는 완성됐지만 최근 분석 목록을 갱신하지 못했습니다.'));
  };
  const followJob = async (initial: Job): Promise<AnalysisRun> => {
    let job = initial;
    while (job.state === 'running') {
      setTrace(job.trace);
      await new Promise(resolve => window.setTimeout(resolve, 1000));
      try {
        job = await request<Job>(`/api/analyses/${job.id}`, { signal: AbortSignal.timeout(15000) });
        setLastCheckedAt(Date.now());
      } catch (error) {
        if (error instanceof Error && error.message.includes('실행 기록이 없습니다')) {
          setPendingJob(undefined);
          throw error;
        }
        throw new Error('진행 상태 연결이 끊겼습니다. 서버의 분석은 계속될 수 있습니다. 같은 작업의 상태를 다시 확인하세요.');
      }
    }
    setTrace(job.trace); setPendingJob(undefined);
    if (job.state === 'failed' || !job.run) throw new Error(job.error || '분석 결과를 확보하지 못했습니다.');
    return job.run;
  };
  const resumeJob = async () => {
    if (!pendingJob || busy) return;
    setBusy(true); setError('');
    try { acceptRun(await followJob({ id: pendingJob.id, state: 'running', trace })); }
    catch (e) { setError(e instanceof Error ? e.message : '진행 상태를 확인하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const runAnalysis = async (text: string) => {
    if (locked) return;
    const began = Date.now(); setAnalysisStartedAt(began);
    setBusy(true); setError(''); setNotice(''); setTrace([]); setLastCheckedAt(undefined);
    requestAnimationFrame(() => document.getElementById('analysis-progress')?.focus());
    try {
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, mode, startDate: startDate || undefined, endDate: endDate || undefined,
          languages, urls: urls.split('\n').map(u => u.trim()).filter(Boolean) }) };
      let next: AnalysisRun;
      if (mode === 'live') {
        const job = await request<Job>('/api/analyses', { ...options, signal: AbortSignal.timeout(15000) });
        setLastCheckedAt(Date.now());
        setPendingJob({ id: job.id, startedAt: began });
        next = await followJob(job);
      } else next = await request<AnalysisRun>('/api/runs', options);
      acceptRun(next);
    } catch (e) { setError(e instanceof Error ? e.message : '분석을 완료하지 못했습니다.'); }
    finally { setBusy(false); setAnalysisStartedAt(undefined); }
  };
  const openRun = async (id: string) => {
    if (locked) return;
    setBusy(true); setError(''); setNotice(''); setTrace([]);
    try {
      const next = await request<AnalysisRun>(`/api/runs/${id}`);
      setTrace([]);
      setRun(next); setQuestion(next.question); setMode(next.mode); setStartDate(next.dateRange.start); setEndDate(next.dateRange.end);
      setSelectedClaim(preferredClaim(next)); setTab('workspace'); setEditing(false); setView('origins');
    } catch (e) { setError(e instanceof Error ? e.message : '기록을 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const review = async (input: ReviewInput) => {
    if (!run) return;
    setReviewBusy(true); setError(''); setNotice('');
    try {
      const next = await request<AnalysisRun>(`/api/runs/${run.id}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      setRun(next); setNotice(`검토 저장 완료 · v${next.version}`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '검토 내용을 저장하지 못했습니다.'); }
    finally { setReviewBusy(false); }
  };
  const approve = async (input: Omit<ReportApproval, 'createdAt' | 'version'>) => {
    if (!run) return;
    setReviewBusy(true); setError('');
    try {
      const next = await request<AnalysisRun>(`/api/runs/${run.id}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, expectedVersion: run.version }) });
      setRun(next); setNotice(`검토 결정 저장 · v${next.version}`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '검토 결정을 저장하지 못했습니다.'); }
    finally { setReviewBusy(false); }
  };
  const revalidate = async () => {
    if (!run) return;
    setReviewBusy(true); setError(''); setNotice('');
    try {
      const next = await request<AnalysisRun>(`/api/runs/${run.id}/revalidate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: run.version }) });
      setRun(next); setNotice(`기준별 판단 재검증 완료 · v${next.version}`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '재검증을 완료하지 못했습니다.'); }
    finally { setReviewBusy(false); }
  };
  const newAnalysis = () => {
    setRun(undefined); setTab('workspace'); setEditing(true); setNotice(''); setError(''); setTrace([]);
    setMode('live'); setQuestion(DEFAULT_QUESTION); setURLs(''); setStartDate(''); setEndDate('');
    if (window.matchMedia('(max-width: 900px)').matches) setHistoryOpen(false);
    requestAnimationFrame(() => document.getElementById('question')?.focus());
  };
  const cancelEdit = () => {
    if (!run) return;
    setEditing(false); setQuestion(run.question); setMode(run.mode); setStartDate(run.dateRange.start); setEndDate(run.dateRange.end);
  };
  const selectClaim = (id: string) => {
    setSelectedClaim(id); setNotice('');
    if (window.matchMedia('(max-width: 1000px)').matches) requestAnimationFrame(() => evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const showEvidence = (evidence: Evidence) => {
    const source = run?.sources.find(s => s.id === evidence.sourceId);
    if (source) setDrawer({ source, evidence });
  };
  const showBasis = (basis: CriterionBasis) => {
    const source = run?.sources.find(s => s.id === basis.sourceId);
    if (source) setDrawer({ source, basis });
  };
  const drawerColor = drawer?.evidence && run
    ? colors.get(run.claims.flatMap(c => c.groups).find(g => g.evidenceIds.includes(drawer.evidence!.id))?.id ?? '') : undefined;
  const claim = run?.claims.find(c => c.id === selectedClaim) ?? run?.claims[0];
  const heading = tab === 'sources' ? '공개 자료' : tab === 'reviews' ? '검토 기록' : analyzing || run ? undefined : '공개정보 분석';
  const libraryDataset = boot ? { ...boot.dataset, sources: run?.sources ?? (mode === 'live' ? [] : boot.dataset.sources) } : undefined;

  return <div className="app-shell">
    <a className="skip-link" href="#main">본문으로 이동</a>
    <Sidebar tab={tab} onTab={setTab} dataset={libraryDataset} recentRuns={boot?.recentRuns ?? []} activeRunId={run?.id}
      reviewCount={(run?.reviews.length ?? 0) + (run?.approvals?.length ?? 0)} locked={locked} onNew={newAnalysis} onOpenRun={id => void openRun(id)}
      historyOpen={historyOpen} onHistory={setHistoryOpen} />
    <main id="main" className="main-content">
      <header className="topbar">
        <nav aria-label="현재 위치" className="breadcrumb"><span>다중출처 수집·교차검증·인텔 리포트</span><span>/</span>
          <strong>{tab === 'sources' ? '공개 자료' : tab === 'reviews' ? '검토 기록' : analyzing ? '분석 진행' : run && !editing ? `보고서 v${run.version}` : '새 분석'}</strong></nav>
        <a className="scenario-entry" href="/?scenario=synthetic" target="_blank" rel="noreferrer">합성 시나리오 · 운항 영향 분석 ↗</a>
      </header>
      <div className={`page-content ${!run && !analyzing && tab === 'workspace' ? 'start-page' : ''}`}>
        {heading ? <div className="page-heading">
          <div><h1>{heading}</h1></div>
        </div> : null}
        <div className="toast-region" aria-live="polite">
          {error ? <div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 안내 닫기" onClick={() => setError('')}><X size={17} /></button></div> : null}
          {notice ? <div className="notice-banner" role="status"><Check size={16} />{notice}</div> : null}
        </div>
        {!boot && !error ? <div className="loading-state" role="status"><LoaderCircle className="spinning" size={18} />자료 불러오는 중…</div> : null}
        {!boot && error ? <button className="secondary-button" onClick={() => void load().then(() => setError('')).catch(e => setError(e.message))}>다시 시도</button> : null}
        {boot && tab === 'workspace' ? <>
          {analyzing ? <ResearchProgress busy={busy} trace={trace} lastCheckedAt={lastCheckedAt} startedAt={pendingJob?.startedAt ?? analysisStartedAt} question={question} onRetry={pendingJob && !busy ? () => void resumeJob() : undefined} /> : editing ? <QueryComposer question={question} onQuestion={setQuestion} mode={mode} onMode={next => {
            setMode(next);
            if (next !== 'live' && (!question.trim() || question === DEFAULT_QUESTION)) setQuestion(SNAPSHOT_QUESTION);
          }}
            startDate={startDate} onStartDate={setStartDate} endDate={endDate} onEndDate={setEndDate}
            languages={languages} onLanguages={setLanguages} urls={urls} onURLs={setURLs} capabilities={boot.capabilities}
            busy={busy} locked={locked} onSubmit={event => { event.preventDefault(); void runAnalysis(question); }}
            onCancel={run ? cancelEdit : undefined} />
            : run ? <QuestionBar run={run} locked={locked} onEdit={() => setEditing(true)} /> : null}
          {!analyzing && run ? <ReportView run={run} colors={colors} claim={claim} onSelectClaim={selectClaim}
            view={view} onView={setView} onEvidence={showEvidence} onBasis={showBasis} onRevalidate={revalidate} onReview={review} reviewBusy={reviewBusy} locked={locked}
            onApprove={approve}
            headingRef={reportHeading} evidenceRef={evidenceRef} />
            : !analyzing ? <StartView dataset={boot.dataset} mode={mode} onSource={source => setDrawer({ source })} onAllSources={() => setTab('sources')} /> : null}
          {!analyzing ? <ResearchProgress busy={false} trace={trace} /> : null}
        </> : null}
        {libraryDataset && tab === 'sources' ? <><KnowledgeLibrary onSource={source => setDrawer({ source })} /><SourceLibrary dataset={libraryDataset} onSource={source => setDrawer({ source })} /></> : null}
        {boot && tab === 'reviews' ? <AuditLog run={run} onWorkspace={() => setTab('workspace')} /> : null}
      </div>
    </main>
    {drawer ? <EvidenceDialog key={`${drawer.source.id}-${drawer.evidence?.id ?? drawer.basis?.id ?? 'source'}`} source={drawer.source} evidence={drawer.evidence} basis={drawer.basis}
      color={drawerColor} onClose={() => setDrawer(undefined)} /> : null}
  </div>;
}
