import { useState } from 'react';
import type { AnalysisRun, AnalyzedClaim, Evidence } from '../../shared/types.ts';
import { evidenceRows } from '../lib.ts';
import { GraphCanvas, type CanvasEdge, type CanvasNode } from './GraphCanvas.tsx';

export function KnowledgeGraph({ run, claim, claims: linkedClaims, sentence, colors, onEvidence }: {
  run: AnalysisRun; claim: AnalyzedClaim; claims?:AnalyzedClaim[]; sentence?:string;
  colors: Map<string, string>; onEvidence: (evidence: Evidence) => void;
}) {
  const [focus, setFocus] = useState<string>();
  const claims=linkedClaims?.length?linkedClaims:[claim];
  const combined=claims.length>1;
  const originStatus=(id:string)=>{
    const groups=claims.flatMap(c=>c.groups).filter(g=>g.id===id);
    const states=new Set(groups.map(g=>g.independence));
    return states.size>1?'주장별 독립성 검증 상태 상이':groups[0]?.independence==='verified'?'독립성 확인':'독립성 미확인';
  };
  const rows=claims.flatMap(c=>evidenceRows(run,c).map(row=>({...row,claim:c})));
  if (!rows.length) return <div className="empty-state compact"><h3>원문 근거 없음</h3></div>;
  const nodes: CanvasNode[] = [...new Map([
    ...claims.map(c=>({ id: `claim:${c.id}`, label: combined?c.label:c.statement, kind: 'claim', kicker:combined?'확인한 사실·발언':c.label,subline:combined?c.statement:undefined })),
    ...claims.flatMap(c=>c.groups).map(group => ({ id: group.id, label: group.label, kind: 'origin', kicker: '원출처',
      subline: originStatus(group.id), color: colors.get(group.id) })),
    ...rows.map(row => ({ id: row.evidence.id, label: row.source.publisher, kind: 'evidence', kicker: '원문 근거', subline: row.evidence.quote,
      ariaLabel: `${row.source.publisher} 원문 근거 보기`, color: colors.get(row.group.id) })),
  ].map(node=>[node.id,node] as const)).values()];
  const edges: CanvasEdge[] = rows.flatMap(row => [
    { id: `origin-${row.evidence.id}`, from: row.group.id, to: row.evidence.id, label: '원출처 묶음', color: colors.get(row.group.id) },
    { id: `proof-${row.evidence.id}`, from: row.evidence.id, to: `claim:${row.claim.id}`, label: row.evidence.stance === 'contradicts' ? '반박' : '원문 확인',
      derived: row.evidence.stance === 'contradicts', color: row.evidence.stance === 'contradicts' ? '#a44e4e' : colors.get(row.group.id) },
  ]);
  if(combined&&sentence){
    nodes.push({id:'fusion:judgment',label:sentence,kind:'inference',kicker:'자료를 결합한 분석 판단',subline:'분석적 해석 · 원문에 직접 나온 사실과 구분',color:'#a1783e'});
    claims.forEach(c=>edges.push({id:`fusion:${c.id}`,from:`claim:${c.id}`,to:'fusion:judgment',label:'판단에 사용',derived:true,color:'#a1783e'}));
  }
  const focusedNode=nodes.find(n=>n.id===focus);
  return <section className="graph-panel" aria-labelledby="graph-title">
    <div className="panel-toolbar"><div><h3 id="graph-title">{combined?'자료를 결합해 이 판단에 이른 경로':'이 사실을 확인한 근거'}</h3><p>{combined?'왼쪽에서 오른쪽으로: 원출처 → 원문 인용 → 확인한 사실·발언 → 결합 판단':'원출처 → 원문 인용 → 확인한 주장'} · 문서를 누르면 정확한 인용을 엽니다.</p></div></div>
    <GraphCanvas nodes={nodes} edges={edges} label={combined?'여러 자료에서 결합 판단에 이르는 전체 근거 경로':`${claim.label}의 원출처와 원문 근거`} focusId={focus}
      legend={combined?'실선: 원문 확인 · 황색 점선: 분석 판단에 사용 · 붉은 점선: 반박':undefined}
      onNode={id => { setFocus(id); const evidence = run.evidence.find(e => e.id === id); if (evidence) onEvidence(evidence); }}
      onEdge={id => { const evidence = rows.find(row => id.endsWith(row.evidence.id))?.evidence; if (evidence) onEvidence(evidence); }} />
    {focusedNode&&!run.evidence.some(e=>e.id===focus)?<aside className="judgment-graph-selection" role="status"><strong>{focusedNode.label}</strong><p>{focusedNode.subline}</p></aside>:null}
  </section>;
}
