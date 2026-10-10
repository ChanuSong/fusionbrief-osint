import { ArrowRight, ArrowUpRight, Check, X } from 'lucide-react';
import type { CollectionMode, Dataset, SourceDocument } from '../../shared/types.ts';
import { dotDate, hostname, SOURCE_TYPES } from '../lib.ts';
import { SOURCE_MODULES } from '../../shared/source-modules.ts';

export function SourceRow({ source, index, onOpen }: { source: SourceDocument; index: number; onOpen: () => void }) {
  return <button className="source-row" onClick={onOpen} aria-label={`${source.publisher} · ${source.title} 원문 보기`}>
    <span className="source-index">{String(index + 1).padStart(2, '0')}</span>
    <span className="source-info">
      <span className="source-publisher">{source.publisher}<span className={`type-chip type-${source.type}`}>{SOURCE_TYPES[source.type]}</span></span>
      <strong>{source.title}</strong>
      <span className="source-domain">{hostname(source.url)}</span>
    </span>
    <span className="source-date">{dotDate(source.publishedAt) || '발행일 미확인'}<small>{source.language.toUpperCase()} · {source.format.toUpperCase()}</small></span>
    <ArrowUpRight size={16} className="row-arrow" />
  </button>;
}

export function StartView({ dataset, mode, onSource, onAllSources }: {
  dataset: Dataset; mode: CollectionMode; onSource: (source: SourceDocument) => void; onAllSources: () => void;
}) {
  if (mode === 'live') return <details className="collection-brief"><summary id="collection-title">수집 범위와 근거 기준<span>정부·북한 매체 · SNS · 사진·위성 · 항적·선박 · 연구·특허</span></summary>
    <table><thead><tr><th>모듈</th><th>공개 자료</th><th>근거 기준</th></tr></thead><tbody>
      {Object.entries(SOURCE_MODULES).filter(([module])=>module!=='discussion').map(([module,item])=><tr key={module}><th>{item.label}</th><td>{item.capability}</td><td>{item.limits}</td></tr>)}
    </tbody></table>
    <p>플래너가 질문과 각 자료 유형의 관련성을 먼저 판단합니다. 원문 접근 실패와 관측 범위 제한은 조사 기록에 남기며, 확인되지 않은 정보와 관련 없는 시각화는 본문에서 생략합니다.</p>
  </details>;
  return <div className="start-view">
    <div className="start-grid">
      <section className="source-preview" aria-labelledby="preview-title">
        <div className="section-heading"><h2 id="preview-title">시연 자료 · 프리덤 에지 2024</h2>
          <button className="text-button" onClick={onAllSources}>전체 {dataset.sources.length}건 보기<ArrowRight size={14} /></button></div>
        <div className="source-list">{dataset.sources.slice(0, 5).map((source, index) =>
          <SourceRow key={source.id} source={source} index={index} onOpen={() => onSource(source)} />)}</div>
      </section>
      <aside className="scope-note" aria-labelledby="scope-title">
        <h2 id="scope-title">분석 범위</h2>
        <ul className="scope-list can">{['훈련 일정', '참가국', '발표 목적', '훈련 형식', '원출처·재인용 관계'].map(item => <li key={item}><Check size={14} />{item}</li>)}</ul>
        <ul className="scope-list cannot">{['비용·인원·피해 규모', '실제 작전 성과', '다른 훈련·최신 동향'].map(item => <li key={item}><X size={14} />{item}</li>)}</ul>
        <small>발행 {dotDate(dataset.sources.map(s => s.publishedAt).sort()[0])} – {dotDate(dataset.sources.map(s => s.publishedAt).sort().at(-1)!)}</small>
      </aside>
    </div>
  </div>;
}
