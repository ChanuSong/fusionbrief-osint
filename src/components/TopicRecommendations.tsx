import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import type { TopicFeed, TopicSuggestion } from '../../shared/types.ts';
import { dateTime, dotDate, request } from '../lib.ts';

export function TopicRecommendations({ onChoose, locked }: { onChoose: (topic: TopicSuggestion) => void; locked: boolean }) {
  const [feed, setFeed] = useState<TopicFeed>();
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const poll = async (first: boolean) => {
      try {
        const next = await request<TopicFeed>('/api/topics', { signal: controller.signal, method: first && refresh ? 'POST' : 'GET' });
        if (controller.signal.aborted) return;
        setFeed(next); setError('');
        if (next.state === 'running' || next.state === 'idle') timer = window.setTimeout(() => void poll(false), 2000);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '추천 자료를 불러오지 못했습니다.');
      }
    };
    void poll(true);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);
  const running = !error && (!feed || feed.state === 'running' || feed.state === 'idle');
  const stale = !!feed?.generatedAt && Date.now() - Date.parse(feed.generatedAt) > 6 * 3600000;
  return <section className="topic-section" aria-labelledby="topics-title">
    <div className="section-heading"><div><h2 id="topics-title">지금 조사해볼 국방 이슈</h2></div>
      <button className="secondary-button" disabled={locked || running || feed?.state === 'disabled'} onClick={() => setRefresh(n => n + 1)}>
        {running ? <LoaderCircle className="spinning" size={14} /> : <RefreshCw size={14} />}추천 갱신</button></div>
    
    <div className={`topic-status ${feed?.state === 'ready' ? 'visually-hidden' : ''}`} role="status">{error || (running ? feed?.message || '최근 공개자료를 탐색하고 있습니다…' : feed?.state === 'ready' ? `${feed.topics.length}개 조사 후보 · 원문 확인 완료 · 인기도 순위 아님` : feed?.message)}</div>
    {feed?.generatedAt ? <p className="topic-timestamp">{stale || feed.state === 'failed' ? '이전 수집 결과 · ' : ''}최근 14일 · 갱신 {dateTime(feed.generatedAt)}</p> : null}
    {running && !feed?.topics.length ? <div className="topic-skeletons" aria-hidden="true">{[1, 2, 3].map(n => <div key={n}><span /><span /><span /></div>)}</div> : null}
    <div className="topic-cards">{feed?.topics.map((topic, index) => <article className="topic-card" key={topic.id}>
      <details className="topic-expand"><summary><span className="topic-number">{String(index + 1).padStart(2, '0')}</span><h3>{topic.title}</h3><ChevronDown size={15} /></summary>
      <div className="topic-expanded-body"><p className="topic-context">{topic.whyNow}</p>
      <div className="topic-question"><span>추천 질문</span><p>{topic.question}</p></div>
      <details className="topic-sources"><summary><FileText size={13} />근거 원문 {topic.sources.length}건<ChevronDown size={13} /></summary><ul>{topic.sources.map((source, i) => <li key={`${source.url}-${i}`}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {dotDate(source.publishedAt)} ↗</a><p>{source.title}</p><blockquote>{source.quote}</blockquote>
      </li>)}</ul></details>
      <button className="text-button" disabled={locked} onClick={() => onChoose(topic)}>이 질문으로 조사 준비<ArrowRight size={14} /></button></div></details>
    </article>)}</div>
    {!running && !feed?.topics.length ? <p className="topic-empty">검증된 최신 추천이 아직 없습니다. 위 입력창에서 직접 질문하거나 공개 원문 URL을 추가할 수 있습니다.</p> : null}
    {feed?.trace.some(t => t.status === 'failed') ? <details className="topic-log"><summary>추천 수집의 제한사항</summary><ul>
      {feed.trace.filter(t => t.status === 'failed').map((t, i) => <li key={i}>{t.message}</li>)}</ul></details> : null}
  </section>;
}
