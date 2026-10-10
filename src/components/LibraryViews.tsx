import { useState } from 'react';
import { ArrowRight, BadgeCheck, CircleDashed, History, Layers, Search, Split } from 'lucide-react';
import type { AnalysisRun, Dataset, Review, SourceDocument } from '../../shared/types.ts';
import { dateTime, SOURCE_TYPES } from '../lib.ts';
import { SourceRow } from './StartView.tsx';

export function SourceLibrary({ dataset, onSource }: { dataset: Dataset; onSource: (source: SourceDocument) => void }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | SourceDocument['type']>('all');
  const shown = dataset.sources.filter(s => (type === 'all' || s.type === type)
    && `${s.title} ${s.publisher}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="source-library">
    <div className="library-toolbar">
      <div className="search-box"><Search size={16} /><input aria-label="출처 검색" placeholder="발행기관 또는 제목 검색" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="segmented" role="group" aria-label="자료 유형">{(['all', 'official', 'news', 'paper', 'archive'] as const).map(value =>
        <button key={value} aria-pressed={type === value} className={type === value ? 'active' : ''} onClick={() => setType(value)}>
          {value === 'all' ? '전체' : SOURCE_TYPES[value]}<span>{value === 'all' ? dataset.sources.length : dataset.sources.filter(s => s.type === value).length}</span></button>)}</div>
    </div>
    <div className="source-list card">{shown.map((source, index) => <SourceRow key={source.id} source={source} index={index} onOpen={() => onSource(source)} />)}</div>
    {!shown.length ? <div className="empty-state"><h3>검색 결과 없음</h3>
      <button className="text-button" onClick={() => { setSearch(''); setType('all'); }}>필터 초기화</button></div> : null}
  </section>;
}

const REVIEW_META = {
  merge: { icon: Layers, label: () => '같은 원출처로 병합' },
  split: { icon: Split, label: () => '근거 분리' },
  independence: { icon: BadgeCheck, label: (r: Review) => r.independent ? '독립성 확인' : '독립성 미확인으로 변경' },
};

export function AuditLog({ run, onWorkspace }: { run?: AnalysisRun; onWorkspace: () => void }) {
  const reviews = run?.reviews ?? [];
  return <section className="audit-panel">
    <div className="section-heading"><h2>변경 이력</h2><span>{run ? `v${run.version}` : '보고서 미선택'}</span></div>
    {run ? <p className="audit-question">{run.question}</p> : null}
    {run?.approvals?.length ? <ol className="audit-list approval-audit">{run.approvals.slice().reverse().map(a =>
      <li className="audit-item" key={a.version}><span className="audit-icon"><BadgeCheck size={15} /></span><div>
        <div className="audit-title"><strong>{a.decision === 'approved' ? '보고서 승인' : '보고서 보완 요청'}</strong><span className="version-tag">v{a.version}</span><span>{a.reviewer}</span></div>
        <p>{a.reason}</p><small>{dateTime(a.createdAt)}{run.approval?.version === a.version ? ' · 현재 결정' : ' · 이전 결정'}</small>
      </div></li>)}</ol> : null}
    {reviews.length ? <ol className="audit-list">{reviews.slice().reverse().map(r => {
      const meta = REVIEW_META[r.action];
      const evidence = r.evidenceIds.map(id => run!.evidence.find(e => e.id === id)).filter(Boolean);
      const publishers = [...new Set(evidence.map(e => run!.sources.find(s => s.id === e!.sourceId)?.publisher))];
      return <li className="audit-item" key={r.id}>
        <span className={`audit-icon audit-${r.action}`}><meta.icon size={15} /></span>
        <div>
          <div className="audit-title"><strong>{meta.label(r)}</strong><span className="version-tag">v{r.version}</span><span>{run?.claims.find(c => c.id === r.claimId)?.label}</span></div>
          <p>{r.reason}</p>
          <small>{dateTime(r.createdAt)} · {publishers.join(', ')}</small>
        </div>
      </li>;
    })}</ol> : !run?.approvals?.length ? <div className="empty-state">{run ? <CircleDashed size={22} /> : <History size={22} />}
      <h3>{run ? '검토 기록 없음' : '보고서 미선택'}</h3>
      <button className="text-button" onClick={onWorkspace}>분석으로 이동<ArrowRight size={14} /></button></div> : null}
  </section>;
}
