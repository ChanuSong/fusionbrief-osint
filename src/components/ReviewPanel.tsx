import { useState } from 'react';
import { ArrowUpRight, BadgeCheck, CheckCheck, CircleDashed, Layers, PencilLine, Save, Split, X } from 'lucide-react';
import type { AnalysisRun, AnalyzedClaim, Evidence, ReviewInput } from '../../shared/types.ts';
import { clip, dotDate, SOURCE_TYPES } from '../lib.ts';

const ACTIONS = [
  ['merge', Layers, '같은 원출처로 병합', '선택한 묶음 전체를 병합합니다. 독립성은 미확인으로 변경됩니다.'],
  ['split', Split, '근거 1개 분리', '선택한 문서 1개를 분리합니다. 독립성은 별도 판정합니다.'],
  ['independence', CheckCheck, '독립성 판정', '다른 원출처와 별개인 근거인지 판정합니다.'],
] as const;

export function ReviewPanel({ run, claim, colors, onEvidence, onReview, busy }: {
  run: AnalysisRun; claim: AnalyzedClaim; colors: Map<string, string>; onEvidence: (evidence: Evidence) => void;
  onReview: (input: ReviewInput) => Promise<void>; busy: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<ReviewInput['action']>('merge');
  const [independent, setIndependent] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const selectedGroups = claim.groups.filter(group => group.evidenceIds.some(id => selected.includes(id)));
  const selectionValid = action === 'merge' ? selectedGroups.length >= 2
    : selected.length === 1 && (action === 'independence' || selectedGroups[0]?.evidenceIds.length > 1);
  const selectionMessage = action === 'merge' ? '서로 다른 원출처 묶음에서 근거를 하나씩 선택하세요.'
    : action === 'split' ? '문서가 2건 이상인 묶음에서 근거 1개를 선택하세요.' : '판정할 묶음에서 근거 1개를 선택하세요.';
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectionValid || reason.trim().length < 5 || busy) return;
    await onReview({ claimId: claim.id, action, evidenceIds: selected, reason,
      expectedVersion: run.version, ...(action === 'independence' ? { independent } : {}) });
  };
  if (!claim.evidenceIds.length) return <div className="empty-state compact"><CircleDashed size={22} /><h3>연결된 원문 근거가 없습니다.</h3>
    </div>;
  return <section className="origins-panel" aria-labelledby="origins-title">
    <div className="panel-toolbar">
      <div><h3 id="origins-title">원출처와 독립성</h3></div>
      <button className={`review-toggle ${reviewing ? 'active' : ''}`} aria-expanded={reviewing} aria-controls="review-form" disabled={busy}
        onClick={() => { setReviewing(previous => !previous); setSelected([]); }}>
        {reviewing ? <><X size={14} />검토 닫기</> : <><PencilLine size={14} />분석가 검토</>}</button>
    </div>
    {reviewing ? <p className="selection-guide" role="status">변경할 근거를 선택하세요.</p> : null}
    <div className="origin-groups">{claim.groups.map((group, index) => {
      const color = colors.get(group.id);
      return <article className={`origin-group ${selectedGroups.includes(group) ? 'has-selection' : ''}`} key={group.id} style={{ '--group': color } as React.CSSProperties}>
        <header className="group-title">
          <span className="group-swatch" aria-hidden="true" />
          <span className="group-number">원출처 {index + 1}</span>
          <strong>{group.label}</strong>
          <span className="group-docs">문서 {new Set(group.evidenceIds.map(id => run.evidence.find(e => e.id === id)?.sourceId)).size}건</span>
          <span className={`independence-tag ${group.independence === 'verified' ? 'verified' : ''}`}>
            {group.independence === 'verified' ? <><BadgeCheck size={13} />독립성 확인</> : <><CircleDashed size={13} />독립성 미확인</>}</span>
        </header>
        <ul className="evidence-rows">{group.evidenceIds.map(id => {
          const evidence = run.evidence.find(item => item.id === id)!;
          const source = run.sources.find(item => item.id === evidence.sourceId)!;
          const checked = selected.includes(id);
          return <li className={`evidence-row ${checked ? 'checked' : ''}`} key={id}>
            {reviewing ? <input type="checkbox" checked={checked} aria-label={`${source.publisher} 근거 선택`} onChange={() => toggle(id)} disabled={busy} /> : null}
            <button className="evidence-open" onClick={() => onEvidence(evidence)} aria-label={`${source.publisher} 원문 보기`}>
              <span className="evidence-source"><b>{source.publisher}</b><span>{SOURCE_TYPES[source.type]} · {dotDate(source.publishedAt)} · {source.language.toUpperCase()}</span></span>
              <span className="evidence-quote" lang={source.language}>“{clip(evidence.quote, 60)}”</span>
              <ArrowUpRight size={15} className="row-arrow" />
            </button>
          </li>;
        })}</ul>
        <div className="group-reason"><span>분류 근거</span><p>{group.reason}</p></div>
        {group.independenceReason ? <div className="group-reason verified"><span>독립성 판정</span><p>{group.independenceReason}</p></div> : null}
      </article>;
    })}</div>
    {reviewing ? <form id="review-form" className="review-form" onSubmit={save}>
      <h3>검토 작업</h3>
      <div className="review-options" role="group" aria-label="검토 작업">{ACTIONS.map(([value, Icon, label]) =>
        <button type="button" key={value} aria-pressed={action === value} className={action === value ? 'active' : ''}
          disabled={busy} onClick={() => setAction(value)}><Icon size={15} />{label}</button>)}</div>
      <p className="review-help">{ACTIONS.find(([value]) => value === action)![3]}</p>
      {action === 'independence' ? <label className="check-label"><input type="checkbox" checked={independent} disabled={busy}
        onChange={event => setIndependent(event.target.checked)} />이 묶음의 독립성을 확인했습니다</label> : null}
      <label className="field-label" htmlFor="review-reason">검토 이유</label>
      <textarea id="review-reason" placeholder="검토 근거 입력 (5자 이상)" value={reason} disabled={busy}
        onChange={event => setReason(event.target.value)} minLength={5} maxLength={1000} required rows={3} />
      <div className="review-submit">
        <div><strong>{selected.length}개 근거 선택</strong><p className={selectionValid ? '' : 'pending'}>{selectionValid ? `v${run.version + 1}로 저장` : selectionMessage}</p></div>
        <button className="primary-button" disabled={busy || !selectionValid || reason.trim().length < 5}><Save size={15} />{busy ? '저장 중…' : '검토 반영'}</button>
      </div>
    </form> : null}
  </section>;
}
