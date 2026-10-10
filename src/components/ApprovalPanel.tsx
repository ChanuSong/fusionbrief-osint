import { useState } from 'react';
import type { AnalysisRun, ReportApproval } from '../../shared/types.ts';
import { dateTime } from '../lib.ts';

export function ApprovalPanel({ run, busy, onApprove, readOnly = false }: { run: AnalysisRun; busy: boolean; readOnly?: boolean;
  onApprove: (input: Omit<ReportApproval, 'createdAt' | 'version'>) => Promise<void>; }) {
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<ReportApproval['decision']>('approved');
  return <section className="approval-panel" aria-labelledby="approval-title">
    <div className="section-heading"><h2 id="approval-title">분석가 검토</h2>
      <span>{run.approval?.decision === 'approved' ? '승인됨' : run.approval?.decision === 'changes-requested' ? '보완 요청' : '검토 대기'}</span></div>
    {run.approval ? <p className="approval-record"><b>{run.approval.reviewer}</b> · {dateTime(run.approval.createdAt)} · {run.approval.reason}</p> : null}
    {readOnly ? <p>보존 보고서 탐색 모드입니다. 원출처 검토·판단 재검증·승인 기록은 로컬 앱에서 사용할 수 있습니다.</p> : <details><summary>검토 결정 기록</summary><form onSubmit={event => { event.preventDefault(); void onApprove({ reviewer, reason, decision }); }}>
      <label>검토자<input value={reviewer} onChange={event => setReviewer(event.target.value)} required minLength={2} maxLength={80} disabled={busy} /></label>
      <label>결정<select value={decision} onChange={event => setDecision(event.target.value as ReportApproval['decision'])} disabled={busy}>
        <option value="approved">승인</option><option value="changes-requested">보완 요청</option></select></label>
      <label className="approval-reason">검토 의견<textarea value={reason} onChange={event => setReason(event.target.value)} required minLength={5} maxLength={1000} rows={2} disabled={busy} /></label>
      {run.analysis && run.analysis.verification!=='verified' ? <p role="status">기준별 판단의 검증을 완료해야 승인할 수 있습니다. 보완 요청은 기록할 수 있습니다.</p> : null}
      <button className="primary-button" disabled={busy || decision === 'approved' && !!run.analysis && run.analysis.verification !== 'verified' || reviewer.trim().length < 2 || reason.trim().length < 5}>결정 저장</button>
    </form></details>}
    {(run.approvals?.length ?? 0) > 1 ? <details><summary>이전 결정 {run.approvals!.length - 1}건</summary><ol>
      {run.approvals!.slice(0, -1).reverse().map(a => <li key={a.version}>v{a.version} · {a.reviewer} · {a.decision === 'approved' ? '승인' : '보완 요청'} · {a.reason}</li>)}</ol></details> : null}
  </section>;
}
