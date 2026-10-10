import { ArrowUpRight, CalendarRange } from 'lucide-react';
import type { AnalysisRun, AnalyzedClaim, Evidence } from '../../shared/types.ts';
import { dotDate, evidenceRows, SOURCE_TYPES } from '../lib.ts';

const DAY = 86_400_000;

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end) && days.length < 14; t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export function Timeline({ run, claim, colors, onEvidence }: {
  run: AnalysisRun; claim: AnalyzedClaim; colors: Map<string, string>; onEvidence: (evidence: Evidence) => void;
}) {
  const rows = evidenceRows(run, claim);
  const scheduleEvidence = run.evidence.find(e => e.claimId === 'schedule' && e.stance === 'supports');
  const period = scheduleEvidence ? /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/.exec(scheduleEvidence.value) : null;
  const scheduleSource = scheduleEvidence ? run.sources.find(s => s.id === scheduleEvidence.sourceId) : undefined;
  const dates = [...new Set([...rows.map(r => r.source.publishedAt).filter(Boolean), ...(period ? [period[1], period[2]] : [])])].sort();
  if (!rows.length) return <div className="empty-state compact"><h3>문서 없음</h3></div>;
  const continuous = daysBetween(dates[0], dates.at(-1)!);
  const days = dates.length && (Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / DAY < 14 ? continuous : dates;
  const bandStart = period ? days.indexOf(period[1]) : -1;
  const bandEnd = period ? days.indexOf(period[2]) : -1;
  return <section className="timeline-panel" aria-labelledby="timeline-title">
    <div className="panel-toolbar"><div><h3 id="timeline-title">사건과 발행 타임라인</h3>
      <p>위 목록은 사건·발표·예정일, 아래 문서 카드는 발행일입니다. 예정된 활동은 실제 이행 확인과 구분합니다.</p></div></div>
    {run.events?.length ? <ol className="event-list">{run.events.map((event, i) => {
      const evidence = run.evidence.find(e => event.evidenceIds.includes(e.id));
      return <li key={i}><time>{dotDate(event.date)}</time><span>{event.label}</span>{evidence ? <button className="text-button" onClick={() => onEvidence(evidence)}>원문</button> : null}</li>;
    })}</ol> : null}
    <div className="timeline" style={{ '--days': Math.max(1, days.length) } as React.CSSProperties}>
      {period && bandStart >= 0 && bandEnd >= 0 && scheduleEvidence ? <button className="event-band"
        style={{ gridColumn: `${bandStart + 1} / ${bandEnd + 2}` }} onClick={() => onEvidence(scheduleEvidence)}
        aria-label={`사건 기간 근거 보기: ${scheduleSource?.publisher ?? ''}`}>
        <CalendarRange size={15} /><span><b>훈련 기간</b> {dotDate(period[1])} – {period[2].slice(5).replace('-', '.')}</span>
        <small>근거: {scheduleSource?.publisher}<ArrowUpRight size={12} /></small>
      </button> : null}
      {days.map(day => {
        const docs = rows.filter(r => r.source.publishedAt === day);
        return <div className="timeline-day" key={day}>
          <header><strong>{dotDate(day)}</strong><span>{new Date(`${day}T00:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' })}</span>
            <em>{docs.length ? `발행 ${docs.length}건` : '발행 없음'}</em></header>
          <ul>{docs.map(doc => <li key={doc.evidence.id}>
            <button className="timeline-card" style={{ '--group': colors.get(doc.group.id) } as React.CSSProperties} onClick={() => onEvidence(doc.evidence)}
              aria-label={`${doc.source.publisher} ${day} 발행 원문 보기`}>
              <b>{doc.source.publisher}</b><span>{SOURCE_TYPES[doc.source.type]}</span>
              <small>{doc.group.label}</small>
            </button></li>)}</ul>
        </div>;
      })}
    </div>
    {rows.some(r => !r.source.publishedAt) ? <p className="timeline-unknown">발행일 미확인 {rows.filter(r => !r.source.publishedAt).length}건은 날짜 축에 배치하지 않았습니다.</p> : null}
  </section>;
}
