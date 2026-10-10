import { ChevronRight } from 'lucide-react';
import type { AnalysisRun, AnalyzedClaim } from '../../shared/types.ts';
import { evidenceRows } from '../lib.ts';

export function OriginFunnel({ run, claim, colors }: { run: AnalysisRun; claim: AnalyzedClaim; colors: Map<string, string> }) {
  const rows = evidenceRows(run, claim);
  const reposts = rows.length - claim.groups.length;
  return <figure className="origin-funnel">
    <div className="funnel-steps">
      <div className="funnel-step">
        <span className="funnel-label">수집 문서</span><strong>{claim.documentCount}</strong>
        <div className="tiles" aria-hidden="true">{rows.map(row => <i key={row.evidence.id} style={{ background: colors.get(row.group.id) }} title={row.source.publisher} />)}</div>
      </div>
      <ChevronRight className="funnel-arrow" size={20} aria-hidden="true" />
      <div className="funnel-step">
        <span className="funnel-label">원출처 묶음</span><strong>{claim.groups.length}</strong>
        <div className="tiles" aria-hidden="true">{claim.groups.map(group => <i key={group.id} style={{ background: colors.get(group.id) }} title={group.label} />)}</div>
      </div>
      <ChevronRight className="funnel-arrow" size={20} aria-hidden="true" />
      <div className={`funnel-step result ${claim.independentCount >= 2 ? 'ok' : ''}`}>
        <span className="funnel-label">독립성 확인</span><strong>{claim.independentCount}</strong>
        <div className="tiles" aria-hidden="true">{claim.groups.map(group => <i key={group.id} className={group.independence === 'verified' ? 'verified' : 'pending'}
          style={group.independence === 'verified' ? { background: colors.get(group.id) } : { borderColor: colors.get(group.id) }} />)}</div>
      </div>
    </div>
    <figcaption>{rows.length
      ? <>{reposts > 0 ? <>재인용 <b>{reposts}건</b>은 독립 근거에서 제외. </> : null}
        교차 확인: 독립성이 확인된 원출처 2곳 이상 일치.</>
      : '이 판단에 연결된 원문 근거가 없습니다.'}</figcaption>
  </figure>;
}
