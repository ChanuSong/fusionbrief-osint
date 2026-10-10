import { useEffect, useState } from 'react';
import { Check, Clock3, FileText, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import type { ResearchTrace } from '../../shared/types.ts';

const STEPS = ['질문 해석', '수집·재탐색', '근거 검증', '그래프 추론', '보고서'];
const EXPLANATIONS = [
  '질문의 범위와 확인할 항목을 정하고 있습니다.',
  '여러 언어로 검색하고 원문을 읽습니다. 근거가 부족한 항목은 다시 찾습니다.',
  '원문 인용이 주장과 번역을 뒷받침하는지 대조합니다.',
  '확인된 관계를 연결하고, 설명 가설의 전제와 한계를 검증합니다.',
  '검증된 판단과 인용을 보고서로 정리합니다.',
];
function phase(stage: string, criterionFlow = false) {
  if (/^계획$|^조사 전략$|^범위$/.test(stage)) return 0;
  if (criterionFlow) {
    if (/보고서/.test(stage)) return 5;
    if (/기준 대조|추론/.test(stage)) return 4;
    if (/기준/.test(stage)) return 1;
    if (/분석|검증/.test(stage)) return 3;
    if (/검색|수집|적합성|재탐색|사건 계획/.test(stage)) return 2;
    return undefined;
  }
  if (/보고서/.test(stage)) return 4;
  if (/추론/.test(stage)) return 3;
  if (/분석|검증/.test(stage)) return 2;
  if (/검색|수집|적합성|재탐색/.test(stage)) return 1;
  return undefined;
}
const elapsedLabel = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`;

export function ResearchProgress({ busy, trace, startedAt, question, onRetry, lastCheckedAt }: {
  busy: boolean; trace: ResearchTrace[]; startedAt?: number; question?: string; onRetry?: () => void; lastCheckedAt?: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!busy && !trace.length && startedAt === undefined) return null;
  const active = startedAt !== undefined;
  const last = trace.at(-1);
  const criterionFlow = trace.some(event => /기준/.test(event.stage));
  const steps = criterionFlow ? ['질문·기준 설계', '기준 자료 확보', '사건 수집·재탐색', '사건 분석·검증', '기준별 판단 검증', '보고서'] : STEPS;
  const explanations = criterionFlow ? ['판단할 명제와 관측 기준을 설계합니다.', '기준의 원문·판본·적용 범위를 확인합니다.', '기준에 대응하는 사건과 반증을 수집합니다.', '관측 사실의 인용과 의미를 검증합니다.', '기준별 사건 대조와 통합 판단을 검증합니다.', '검증된 판단과 출처를 정리합니다.'] : EXPLANATIONS;
  const current = trace.reduce((previous, event) => phase(event.stage, criterionFlow) ?? previous, 0);
  const tasks = new Map<string, { event: ResearchTrace; started: string }>();
  for (const event of trace) if (event.taskId) {
    tasks.set(event.taskId, { event, started: tasks.get(event.taskId)?.started ?? event.at });
  }
  const running = [...tasks.values()].filter(task => task.event.status === 'running');
  const finished = [...tasks.values()].filter(task => task.event.status !== 'running').length;
  const seconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
  const lastTime = last ? Date.parse(last.at) : startedAt ?? now;
  const idleSeconds = Math.max(0, Math.floor((now - (Number.isFinite(lastTime) ? lastTime : now)) / 1000));
  const completed = trace.filter(e => e.status === 'complete');
  const searches = completed.filter(e => /검색/.test(e.stage)).length;
  const documents = completed.filter(e => /수집/.test(e.stage)).length;
  const acquired = new Map<string, ResearchTrace>();
  for (const event of completed) if (/수집/.test(event.stage) && event.url) acquired.set(event.url, event);
  const sourceResults = [...acquired.values()].reverse();
  const failures = trace.filter(e => e.status === 'failed').length;
  const recent = trace.filter(e => e.status !== 'running').slice(-3).reverse();
  return <section id="analysis-progress" tabIndex={-1} className={`research-activity ${active ? 'is-running' : ''}`} aria-label="분석 진행 상황">
    {active ? <>
      <div className="progress-title"><span>공개정보 분석</span><span><Clock3 size={14} /><time aria-label="경과 시간">{elapsedLabel(seconds)}</time></span></div>
      <h1>{onRetry ? '진행 상태 연결을 확인해주세요' : `${steps[current]} 중입니다`}</h1>
      <p className="progress-question">{question}</p>
      <ol className="activity-steps">{steps.map((step, i) => <li key={step} className={i === current ? 'current' : i < current ? 'complete' : ''}
        aria-current={i === current ? 'step' : undefined}><span>{i < current ? <Check size={12} /> : i + 1}</span>{step}</li>)}</ol>
      <div className={`progress-workspace ${sourceResults.length ? 'has-sources' : ''}`}>
      <div className="progress-current">
        <div className="live-heading"><span className={`live-signal ${onRetry ? 'paused' : ''}`} aria-hidden="true"><i /><i /><i /></span>
          <strong>{onRetry ? '진행 상태 수신이 멈췄습니다' : running.length ? `지금 ${running.length}개 작업을 처리하고 있습니다` : explanations[current]}</strong>
          <span>{tasks.size ? `${finished}개 처리 완료` : '처리 기록 대기'}</span></div>
        {running.length ? <ul className="active-tasks" aria-label="현재 실행 중인 작업">{running.map(({ event, started }) => {
          const age = Math.max(0, Math.floor((now - Date.parse(started)) / 1000));
          return <li key={event.taskId} className={onRetry ? 'paused' : ''}>
            <span className="task-icon" aria-hidden="true">{event.stage === '검색' ? <Search size={16} /> : <FileText size={16} />}</span>
            <div className="task-content"><div className="task-label"><span>{event.language ? `${event.language.toUpperCase()} · ` : ''}{event.stage}</span>
              <time className={age >= 45 ? 'waiting' : ''}>{elapsedLabel(age)}{age >= 45 ? ' · 응답 대기' : ''}</time></div>
              <p title={event.detail ?? event.message}>{event.detail ?? event.message}</p>
              {event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.url}</a> : <small>{event.message}</small>}</div>
          </li>;
        })}</ul> : <p>{onRetry ? '같은 작업의 상태를 다시 확인할 수 있습니다.' : last?.message ?? '분석 요청을 전달하고 있습니다.'}</p>}
      </div>
      {sourceResults.length ? <aside className="progress-sources" aria-labelledby="progress-sources-title">
        <div className="progress-sources-heading"><h2 id="progress-sources-title">확보한 원문</h2><span>{sourceResults.length}건</span></div>
        <p>수집을 마친 자료입니다. 인용과 의미를 대조한 뒤 보고서의 근거로 사용합니다.</p>
        <ol className="progress-source-list">{sourceResults.map(event => <li key={event.url}>
          <div><Check size={13} aria-hidden="true" /><span>{event.language?.toUpperCase() ?? '원문'} · {event.stage === '기준 수집' ? '판단 기준' : '사건 자료'}</span><time>{new Date(event.at).toLocaleTimeString('ko-KR', { hour12: false })}</time></div>
          <a href={event.url} target="_blank" rel="noreferrer">{event.detail || event.url}</a>
          <small>{event.message}</small>
        </li>)}</ol>
      </aside> : null}
      </div>
      <div className="progress-results" aria-label="현재까지 처리 결과"><span>검색 완료 <b>{searches}건</b></span><span>원문 확보 <b>{documents}건</b></span>
        {failures ? <span>접근·처리 제한 <b>{failures}건</b></span> : null}</div>
      {recent.length ? <ul className="progress-recent" aria-label="최근 처리 결과">{recent.map((event, i) => <li key={`${event.at}-${i}`}>
        {event.status === 'failed' ? <TriangleAlert size={13} /> : <Check size={13} />}<div><span className="result-stage">{event.stage}</span><span>{event.message}</span>{event.detail ? <small>{event.detail}</small> : null}</div><time>{event.durationMs !== undefined ? `${(event.durationMs / 1000).toFixed(1)}초` : new Date(event.at).toLocaleTimeString('ko-KR', { hour12: false })}</time>
      </li>)}</ul> : null}
      <p className="connection-status" role="status">{onRetry ? '연결 재확인 필요' : lastCheckedAt ? '진행 상태 연결 정상' : '서버 연결 확인 중'}<span aria-hidden="true">{lastCheckedAt ? ` · ${Math.max(0, Math.floor((now - lastCheckedAt) / 1000))}초 전 확인` : ''}</span></p>
      <div className={`progress-wait ${idleSeconds >= 90 || onRetry ? 'delayed' : ''}`}>
        {onRetry ? <button className="secondary-button" onClick={onRetry}><RefreshCw size={14} />진행 상태 다시 확인</button>
          : <p>{idleSeconds >= 90 ? '현재 단계의 응답이 늦어지고 있습니다. 진행 상태를 계속 확인하고 있습니다.' : '새 처리 결과가 도착하면 자동으로 갱신됩니다.'}</p>}
        <span>{last ? `마지막 처리 기록 ${elapsedLabel(idleSeconds)} 전` : `첫 처리 기록 대기 · ${elapsedLabel(idleSeconds)}`}</span>
      </div>
    </> : null}
    {trace.length ? <details className="research-progress"><summary>수집·분석 실행 기록 · {trace.length}건</summary>
      <ol>{trace.map((event, i) => <li key={i} className={event.status}>
        <time>{new Date(event.at).toLocaleTimeString('ko-KR', { hour12: false })}</time><b>{event.stage}</b><span>{event.message}{event.detail ? <small className="trace-detail">{event.detail}</small> : null}</span>
      </li>)}</ol></details> : null}
  </section>;
}
