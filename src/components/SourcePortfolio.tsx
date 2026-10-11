import { useState } from 'react';
import type { AnalysisRun, Evidence, SimulatedFeed } from '../../shared/types.ts';
import { sourcePortfolio } from '../../shared/source-portfolio.ts';
import { allSourcesRequested, SOURCE_MODULES } from '../../shared/source-modules.ts';
import { mediaURL } from '../resources.ts';
import '../source-portfolio.css';
import { ObservationFeeds } from './ObservationFeeds.tsx';
export function SourcePortfolio({ run, onEvidence }: { run: AnalysisRun; onEvidence: (e: Evidence) => void }) {
  const [selected, setSelected] = useState('');
  if (!allSourcesRequested(run.question) && !run.simulatedFeeds?.length) return null;
  const channels = sourcePortfolio(run), feeds = run.simulatedFeeds ?? [];
  const active = feeds.find(f => f.id === selected) ?? feeds[0];
  return <section id="report-collection" className="framework-section source-portfolio" aria-labelledby="portfolio-title" tabIndex={-1}>
    <div className="answer-heading"><h2 id="portfolio-title">다중출처 수집·대조</h2><span>실제 근거와 모의 피드 구분</span></div>
    <p className="portfolio-summary"><strong>{channels.filter(c => c.queries.length).length} / 11</strong> 유형 검색 · <strong>{channels.filter(c => c.documents.length).length}</strong> 유형의 실제 원문 확보{feeds.length ? <> · <strong>{feeds.length}</strong>개 모의 피드</> : null}</p>
    <p className="portfolio-explanation">사건 근거, 기술·방법론 배경, 재전파 경로를 구분합니다. 항적·선박의 관측 공백과 위성의 해상도 한계를 표시합니다.</p>
    <div className="portfolio-grid">{channels.map(channel => <details key={channel.module} className={`portfolio-channel ${channel.documents.length ? 'has-document' : 'has-gap'}`}>
      <summary><span>{SOURCE_MODULES[channel.module].label}</span><span>{channel.documents.length ? `원문 ${channel.documents.length}` : '실제 원문 미확보'}{channel.simulated.length ? ' · 모의 포함' : ''}</span></summary>
      <p>{channel.reason ?? SOURCE_MODULES[channel.module].capability}</p>
      <small>실제 검색 {channel.queries.length}회 · 보고서 근거 연결 {channel.used.length}건 · {SOURCE_MODULES[channel.module].limits}</small>
      {channel.documents.length ? <ul>{channel.documents.map(source => {
        const quote = run.evidence.find(e => e.sourceId === source.id), policy = run.analysis?.sourcePolicies.find(p => p.sourceId === source.id);
        const role = { event:'사건 근거', framework:'판단 기준', precedent:'과거 선례', background:'배경 자료', irrelevant:'판단 제외' };
        const image = source.media?.find(m => m.hash && (m.kind==='satellite' || m.kind==='image'));
        return <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.publisher} · {source.publishedAt || '발행일 미확인'} · {policy ? role[policy.purpose] : quote ? '사건 근거' : '수집 원문'}</small>{image && (channel.module==='satellite' || channel.module==='images') ? <figure className="portfolio-image"><img src={mediaURL(image.hash!)} alt={image.caption} loading="lazy" /><figcaption>{image.credit} · {image.capturedAt ?? source.publishedAt} · {image.analysis==='visual-reviewed' ? '검증된 관측은 별도 본문 참조' : '수집 미리보기 · 픽셀 판독 미검증'}</figcaption></figure> : null}{quote ? <button className="portfolio-quote" onClick={() => onEvidence(quote)}>연결된 인용 보기</button> : null}</li>;
      })}</ul> : <p className="portfolio-gap">실제 사건을 판단할 원문이 없습니다. 모의 데이터는 이 공백의 증거를 대신하지 않습니다.</p>}
    </details>)}</div>
    <ObservationFeeds />
    {active ? <div className="simulated-workspace">
      <div className="simulation-heading"><h3>모의 피드 대조 시연</h3><span>모의 데이터 · 실제 위험도에 미반영</span></div>
      <p>외부 피드가 확보되지 않은 경우의 기능을 보여주는 합성 자료입니다. 실제 항공기·선박·게시물·군사 활동을 의미하지 않습니다.</p>
      <div className="simulation-selector" role="group" aria-label="모의 피드 선택">{feeds.map(feed => <button key={feed.id} aria-pressed={active.id === feed.id} onClick={() => setSelected(feed.id)}>{SOURCE_MODULES[feed.module].label} · 모의</button>)}</div>
      <article><h4>{active.title}</h4><p>{active.description}</p><SimulationGraphic feed={active} /><p className="simulation-provenance">생성 기록 {active.createdAt} · {active.id} · 합성 자료의 반복·교차대조는 실제 신뢰도를 높이지 않습니다.</p></article>
    </div> : null}
  </section>;
}
function SimulationGraphic({ feed }: { feed: SimulatedFeed }) {
  if (feed.points?.length) {
    const x = (longitude: number) => 70+(longitude-127)/7*650, y = (latitude: number) => 290-(latitude-35)/9*240;
    return <><svg className="simulation-chart" viewBox="0 0 780 340" role="img" aria-label={`${feed.title}. 모의 위치 경로이며 실제 관측이 아닙니다.`}>
      <rect width="780" height="340" fill="#f3f7f8" />
      {[127,128,129,130,131,132,133,134].map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1="50" y2="290" stroke="#d9e3e7" /><text x={x(v)} y="310" textAnchor="middle">{v}° E</text></g>)}
      {[35,38,41,44].map(v => <g key={v}><line x1="70" x2="720" y1={y(v)} y2={y(v)} stroke="#d9e3e7" /><text x="60" y={y(v)+5} textAnchor="end">{v}° N</text></g>)}
      <polyline points={feed.points.map(p => `${x(p.longitude)},${y(p.latitude)}`).join(' ')} fill="none" stroke="#628a9d" strokeWidth="3" strokeDasharray="7 5" />
      {feed.points.map((p,i) => <circle key={p.at} cx={x(p.longitude)} cy={y(p.latitude)} r={i===feed.points!.length-1 ? 7 : 4} fill={p.state==='gap' ? '#aa7a35' : '#3e7188'} />)}
      <text x="28" y="28" className="simulation-watermark">모의 데이터 / SYNTHETIC · 실측 항적 아님</text><text x="28" y="333">점: 합성 위치 · 점선: 시연용 연결 · 황색: 모의 관측 공백</text>
    </svg><div className="simulation-points">{feed.points.map(p => <span key={p.at}>{p.at.slice(11,16)} · {p.latitude.toFixed(2)}, {p.longitude.toFixed(2)}{p.state==='gap' ? ' · 모의 공백' : ''}</span>)}</div></>;
  }
  if (feed.posts?.length) return <ul className="simulated-posts">{feed.posts.map(p => <li key={p.id}><strong>{p.id} · 모의 게시물</strong><p>{p.text}</p><small>{p.at} · 합성 재전파 {p.repeats}건 · 실제 플랫폼 게시 안 됨</small></li>)}</ul>;
  if (feed.cells?.length) return <svg className="simulation-chart" viewBox="0 0 780 340" role="img" aria-label="코드로 만든 모의 관측 프레임. 실제 위성영상이 아닙니다."><rect width="780" height="340" fill="#dbe5df" />{feed.cells.map(c => <g key={c.label}><rect x={c.x} y={c.y} width="70" height="45" fill="#92a49a" /><text x={c.x} y={c.y+62}>{c.label} · 합성</text></g>)}<text x="20" y="30" className="simulation-watermark">모의 데이터 / SYNTHETIC · 위성 실촬영 아님</text></svg>;
  return null;
}
