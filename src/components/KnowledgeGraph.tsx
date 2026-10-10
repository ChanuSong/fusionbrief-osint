import { useState } from 'react';
import type { AnalysisRun, AnalyzedClaim, Evidence } from '../../shared/types.ts';
import { evidenceRows } from '../lib.ts';
import { GraphCanvas, type CanvasEdge, type CanvasNode } from './GraphCanvas.tsx';

export function KnowledgeGraph({ run, claim, colors, onEvidence }: {
  run: AnalysisRun; claim: AnalyzedClaim; colors: Map<string, string>; onEvidence: (evidence: Evidence) => void;
}) {
  const [focus, setFocus] = useState<string>();
  const rows = evidenceRows(run, claim);
  if (!rows.length) return <div className="empty-state compact"><h3>원문 근거 없음</h3></div>;
  const nodes: CanvasNode[] = [
    { id: `claim:${claim.id}`, label: claim.statement, kind: 'claim', kicker: claim.label },
    ...claim.groups.map(group => ({ id: group.id, label: group.label, kind: 'origin', kicker: '원출처',
      subline: group.independence === 'verified' ? '독립성 확인' : '독립성 미확인', color: colors.get(group.id) })),
    ...rows.map(row => ({ id: row.evidence.id, label: row.source.publisher, kind: 'evidence', kicker: '원문 근거', subline: row.evidence.quote,
      ariaLabel: `${row.source.publisher} 원문 근거 보기`, color: colors.get(row.group.id) })),
  ];
  const edges: CanvasEdge[] = rows.flatMap(row => [
    { id: `origin-${row.evidence.id}`, from: row.group.id, to: row.evidence.id, label: '원출처 묶음', color: colors.get(row.group.id) },
    { id: `proof-${row.evidence.id}`, from: row.evidence.id, to: `claim:${claim.id}`, label: row.evidence.stance === 'contradicts' ? '반박' : '뒷받침',
      derived: row.evidence.stance === 'contradicts', color: row.evidence.stance === 'contradicts' ? '#a44e4e' : colors.get(row.group.id) },
  ]);
  return <section className="graph-panel" aria-labelledby="graph-title">
    <div className="panel-toolbar"><div><h3 id="graph-title">판단의 근거 경로</h3><p>원출처 → 원문 근거 → 판단 · 문서를 선택하면 정확한 인용을 엽니다.</p></div></div>
    <GraphCanvas nodes={nodes} edges={edges} label={`${claim.label}의 원출처와 원문 근거`} focusId={focus}
      onNode={id => { setFocus(id); const evidence = run.evidence.find(e => e.id === id); if (evidence) onEvidence(evidence); }}
      onEdge={id => { const evidence = rows.find(row => id.endsWith(row.evidence.id))?.evidence; if (evidence) onEvidence(evidence); }} />
  </section>;
}
