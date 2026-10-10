import { useEffect, useRef } from 'react';
import { ArrowUpRight, BadgeCheck, CircleDashed, Fingerprint, Languages, Layers, X } from 'lucide-react';
import type { CriterionBasis, Evidence, SourceDocument } from '../../shared/types.ts';
import { AUTHORITY_LABEL } from '../../shared/report-content.ts';
import { dateTime, dotDate, hostname, SOURCE_TYPES, VERIFY_METHODS } from '../lib.ts';
import { mediaURL } from '../resources.ts';

export function EvidenceDialog({ source, evidence, basis, color, onClose }: {
  source: SourceDocument; evidence?: Evidence; basis?: CriterionBasis; color?: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.showModal(); markRef.current?.scrollIntoView({ block: 'nearest' }); }, []);
  const citation = evidence ?? basis;
  const before = citation ? source.body.slice(Math.max(0, citation.start - 400), citation.start) : source.body.slice(0, 1800);
  const after = citation ? source.body.slice(citation.end, citation.end + 400) : '';
  return <dialog ref={ref} className="evidence-dialog" onClose={onClose}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ref.current?.close();
    }} aria-labelledby="evidence-heading">
    <div className="dialog-heading"><span>원문 확인</span>
      <button className="icon-button" aria-label="원문 창 닫기" onClick={() => ref.current?.close()}><X size={20} /></button></div>
    <div className="dialog-body">
      <div className="document-publisher">{source.publisher}<span className={`type-chip type-${source.type}`}>{SOURCE_TYPES[source.type]}</span></div>
      <h2 id="evidence-heading">{source.title}</h2>
      <dl className="source-meta">
        <div><dt>발행일</dt><dd>{dotDate(source.publishedAt) || '미확인'}</dd></div>
        <div><dt>언어 · 형식</dt><dd>{source.language.toUpperCase()} · {source.format.toUpperCase()}</dd></div>
        <div><dt>수집 시각</dt><dd>{dateTime(source.retrievedAt)}</dd></div>
        <div><dt>확인 방식</dt><dd>{VERIFY_METHODS[source.verificationMethod]}</dd></div>
      </dl>
      {source.attribution ? <p className="excerpt-note">발신 매체: {source.attribution.publisher}{source.attribution.archive ? ' · 공개 보존본으로 수집' : ' · 원매체에서 수집'}{source.attribution.control==='dprk-state' ? ' · 북한 측 발표·연출의 근거이며 독립 관측과 구분' : ''}</p> : null}
      {source.media?.length ? <section className="source-media"><h3>원문 사진·영상 자료</h3>{source.media.map((item,i)=><figure key={i}>{item.hash ? <a href={mediaURL(item.hash)} target="_blank" rel="noreferrer"><img src={mediaURL(item.hash)} alt={item.caption || '출처 제공 이미지'} loading="lazy" /></a> : null}<figcaption><p>{item.caption}</p><small>{item.credit}{item.capturedAt ? ` · 촬영 ${item.capturedAt}` : ''}{item.resolutionM ? ` · 해상도 ${item.resolutionM}m` : ''}{item.cloudCover !== undefined ? ` · 구름 ${item.cloudCover}%` : ''}</small><p>{item.analysis==='visual-reviewed' ? '직접 시각 판독 결과 포함' : item.analysis==='metadata-only' ? '관측 메타데이터 대조 · 이미지 픽셀의 자동 판독은 수행하지 않음' : '공개 캡션·본문 대조 · 사진 자체의 신원·권한·의도는 추가 확인 필요'}</p>{item.unavailable ? <small>이미지 확보 실패: {item.unavailable}</small> : null}<a href={item.url} target="_blank" rel="noreferrer">이미지 출처 열기 ↗</a></figcaption></figure>)}</section> : null}
      {source.knowledge ? <section className="dialog-card"><h3>보존한 기준 판본</h3><p>{source.knowledge.editions.length ? `판본 ${source.knowledge.editions.join(' · ')}` : '판본 표기 미확인'} · {source.knowledge.reuse === 'reused' ? '보존 원문 재사용' : source.knowledge.reuse === 'refreshed' ? '원문 재확인' : '원문 보존'}</p><p>마지막 원문 확인: {dateTime(source.knowledge.lastCheckedAt)}</p><p>다음 원문 확인: {dateTime(source.knowledge.refreshDueAt)}{source.knowledge.refreshState === 'refresh-failed' ? ' · 재확인 실패' : source.knowledge.refreshState === 'stale' ? ' · 재확인 주기 경과' : ''}</p><small>원문 확인 주기는 최신 판본이나 법적 효력의 보증이 아닙니다. 이번 사건의 적용 조건은 별도로 검증합니다.</small></section> : null}
      <div className="excerpt-heading"><h3>{citation ? '인용 주변 원문' : source.body.length > 1800 ? '보존한 본문 앞부분' : source.snapshotKind === 'excerpt' ? '원문 발췌' : source.snapshotKind === 'abstract' ? '공개 초록' : '수집한 본문'}</h3>{citation ? <span><i />인용 부분</span> : null}</div>
      <blockquote className="raw-excerpt" lang={source.language}>{before}{citation ? <mark ref={markRef}>{citation.quote}</mark> : null}{after}</blockquote>
      {citation ? source.body.length > citation.quote.length + 800 ? <details className="source-record"><summary>보존한 전체 본문 보기</summary><blockquote className="raw-excerpt" lang={source.language}>{source.body}</blockquote></details> : null
        : source.body.length > 1800 ? <details className="source-record"><summary>보존한 전체 본문 보기</summary><blockquote className="raw-excerpt" lang={source.language}>{source.body}</blockquote></details> : null}
      {basis ? <section className="dialog-card"><h3>판단 기준 · {basis.locator}</h3><p>{AUTHORITY_LABEL[basis.authority]} · 판본 {basis.version || '미확인'}{basis.versionStatus === 'unconfirmed' ? ' · 판본 검증 미완료' : ''}</p>{basis.translation ? <p>{basis.translation}</p> : null}<small>기준의 내용과 출처를 검증했습니다. 사건에 적용되는 조건은 보고서에서 별도로 확인합니다.</small></section> : null}
      {evidence ? <>
        <section className="dialog-card"><h3><Languages size={15} />한국어 해석</h3><p>{evidence.translation}</p>
          <small>{source.snapshotKind === 'excerpt' ? '사전 정리한 해석' : '모델 번역 · 원문 대조 후 분석가 검토 필요'}</small></section>
        <section className="dialog-card origin" style={{ '--group': color ?? '#64748b' } as React.CSSProperties}>
          <h3><Layers size={15} />원출처 관계</h3>
          <strong><i />{evidence.originLabel}</strong>
          <p>{evidence.originReason}</p>
          <span className={`independence-tag ${evidence.independence === 'verified' ? 'verified' : ''}`}>
            {evidence.independence === 'verified' ? <><BadgeCheck size={13} />독립성 확인</> : <><CircleDashed size={13} />독립성 미확인</>}</span>
        </section>
      </> : null}
      <details className="source-record"><summary><Fingerprint size={14} />검증 기록</summary><dl>
        {citation ? <div><dt>인용 위치</dt><dd>{citation.start}–{citation.end} (발췌 문자 위치)</dd></div> : null}
        <div><dt>SHA-256</dt><dd><code>{source.hash}</code></dd></div>
        {source.provenanceQuote ? <div><dt>출처 귀속</dt><dd>“{source.provenanceQuote}”</dd></div> : null}
      </dl></details>
      <p className="excerpt-note">{source.snapshotKind === 'excerpt' ? '사전 발췌본' : source.snapshotKind === 'abstract' ? '공개 초록만 수집' : '수집 시점의 텍스트 본문 · 최대 2,000,000자'} · 원본은 공개 링크에서 확인</p>
    </div>
    <footer className="dialog-footer"><span>{hostname(source.url)}</span>
      <a className="primary-button source-open" href={source.url} target="_blank" rel="noreferrer">공개 원문 열기<ArrowUpRight size={15} /></a></footer>
  </dialog>;
}
