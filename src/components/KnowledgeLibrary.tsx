import { useEffect, useState } from 'react';
import type { KnowledgeCatalog, SourceDocument } from '../../shared/types.ts';
import { AUTHORITY_LABEL } from '../../shared/report-content.ts';
import { dateTime, request } from '../lib.ts';

export function KnowledgeLibrary({ onSource }: { onSource: (source: SourceDocument) => void }) {
  const [catalog, setCatalog] = useState<KnowledgeCatalog>();
  const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [opening, setOpening] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request<KnowledgeCatalog>('/api/knowledge', { signal: controller.signal }).then(setCatalog).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '기준 지식을 불러오지 못했습니다.');
    });
    return () => controller.abort();
  }, []);
  if (!catalog?.documents.length && !error) return null;
  const filtered = catalog?.documents.filter(s => [s.title, s.publisher, ...(s.knowledge?.editions ?? []),
    ...(s.knowledge?.authorities.map(a => AUTHORITY_LABEL[a]) ?? [])].join(' ').toLowerCase().includes(query.toLowerCase())) ?? [];
  const open = async (source: KnowledgeCatalog['documents'][number]) => {
    if (!source.knowledge || opening) return; setOpening(source.knowledge.snapshotId); setError('');
    try { onSource(await request<SourceDocument>(`/api/knowledge/${source.knowledge.snapshotId}`)); }
    catch (error) { setError(error instanceof Error ? error.message : '기준 원문을 불러오지 못했습니다.'); }
    finally { setOpening(''); }
  };
  return <section className="knowledge-library framework-section" aria-labelledby="knowledge-title"><div className="answer-heading"><h2 id="knowledge-title">보존한 기준 지식</h2><span>조약 · 교리 · 공개 수칙 · 교범</span></div><p>검증한 기준의 원문과 판본을 조사 간에 재사용합니다. 새 사건의 적용 조건은 매번 확인합니다.</p>
    {error ? <p role="alert">{error}</p> : null}
    {catalog?.documents.length ? <><label className="knowledge-filter">기준 자료 찾기<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="자료명, 기관, 판본" /></label><div className="knowledge-documents">{filtered.map(s => <article key={s.knowledge!.snapshotId}><h3>{s.title}</h3><p>{s.publisher} · {s.knowledge!.authorities.map(a => AUTHORITY_LABEL[a]).join(' · ')}</p><p>판본 {s.knowledge!.editions.join(' · ') || '미확인'} · {s.knowledge!.refreshState === 'fresh' ? '원문 재확인 주기 내' : '원문 재확인 필요'}</p><small>마지막 원문 확인 {dateTime(s.knowledge!.lastCheckedAt)}</small><button className="secondary-button" disabled={!!opening} onClick={() => void open(s)}>{opening === s.knowledge!.snapshotId ? '불러오는 중…' : '보존 원문 보기'}</button></article>)}</div>{!filtered.length ? <p>해당하는 기준 자료가 없습니다.</p> : null}<details><summary>보존·재확인 정책</summary><p>원문은 자동 삭제하지 않고 변경된 판본을 별도로 보존합니다. 다음은 원문 재확인의 기본 주기이며 법적 효력 기간이 아닙니다.</p><ul>{Object.entries(catalog.policy).filter(([a]) => a !== 'precedent').map(([a, days]) => <li key={a}>{AUTHORITY_LABEL[a as keyof typeof AUTHORITY_LABEL]}: {days}일</li>)}</ul></details></> : null}
  </section>;
}
