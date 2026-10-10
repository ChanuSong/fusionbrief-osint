import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import type { AnalysisRun, Evidence } from '../../shared/types.ts';
import { RelationNetwork } from './RelationNetwork.tsx';

const TYPES: Record<string, string> = { person: '인물', organization: '기관', country: '국가', event: '사건', platform: '플랫폼', account: '계정', website: '매체' };
const LEVELS = { medium: '중간', low: '낮음', undetermined: '판단 유보' };

export function WisdomGraph({ run, onEvidence }: { run: AnalysisRun; onEvidence: (evidence: Evidence) => void }) {
  const [showClaims, setShowClaims] = useState(false);
  const [edgeId, setEdgeId] = useState<string>();
  const [focusedId, setFocusedId] = useState<string>();
  const [inferenceId, setInferenceId] = useState<string>();
  const graph = run.wisdom;
  if (!graph) return null;
  // A graph answers relationship questions. Full paragraphs and mechanical response paths
  // are not semantic entities and do not belong on its default canvas.
  const hypotheses = graph.inferences.filter(i => i.rule === 'competing-explanation');
  const hypothesis = hypotheses.find(i => i.id === inferenceId);
  const edges = graph.edges.filter(e => !e.derived && (e.id.startsWith('relation:') || (showClaims && e.predicate === 'concerns'))
    && (!hypothesis || hypothesis.premiseEdgeIds.includes(e.id)));
  const shown = new Set(edges.flatMap(e => [e.from, e.to]));
  const nodes = graph.nodes.filter(n => shown.has(n.id));
  const selectedEdge = edges.find(e => e.id === edgeId);
  const focused = nodes.find(n => n.id === focusedId);
  const relatedEdges = selectedEdge ? [selectedEdge] : focused ? edges.filter(e => e.from === focused.id || e.to === focused.id) : [];
  const relatedEvidence = [...new Set(relatedEdges.flatMap(e => e.evidenceIds))];
  const claims = run.claims.filter(c => c.evidenceIds.some(id => relatedEvidence.includes(id)));
  const label = (id: string) => graph.nodes.find(n => n.id === id)?.label ?? id;
  const reset = () => { setInferenceId(undefined); setFocusedId(undefined); setEdgeId(undefined); };
  const citations = (ids: string[]) => <div className="answer-citations">{ids.map(id => {
    const evidence = run.evidence.find(e => e.id === id);
    return evidence ? <button key={id} onClick={() => onEvidence(evidence)} aria-label={`관계 인용 ${run.evidence.indexOf(evidence) + 1} 원문 보기`}>
      [{run.evidence.indexOf(evidence) + 1}] {run.sources.find(s => s.id === evidence.sourceId)?.publisher}</button> : null;
  })}</div>;

  return <section className="wisdom-section" aria-labelledby="wisdom-title">
    <div className="answer-heading"><h2 id="wisdom-title"><GitBranch size={19} />사건 관계</h2><span>원문으로 확인한 관계 {graph.edges.filter(e => e.id.startsWith('relation:')).length}개</span></div>
    <p className="wisdom-intro">누가 어떤 사건에 관여하고, 누구의 주장에 반응했는지 살펴봅니다. 관계선을 선택하면 그 근거를 확인할 수 있습니다.</p>
    <div className="relation-controls">
      <div className="relation-legend"><span className="person">인물</span><span className="organization">기관·국가</span><span className="event">사건</span>{showClaims ? <span className="claim">주장</span> : null}</div>
      <label className="graph-detail-toggle"><input type="checkbox" checked={showClaims} onChange={event => { setShowClaims(event.target.checked); setFocusedId(undefined); setEdgeId(undefined); }} />주장 연결 표시</label>
      {hypothesis || focused || selectedEdge ? <button type="button" className="ghost-button" onClick={reset}>전체 관계 보기</button> : null}
    </div>
    {nodes.length ? <RelationNetwork selectedEdgeId={edgeId} label="인물·기관·사건 관계 그래프" focusId={focusedId}
      nodes={nodes.map(node => {
        const entity = run.entities.find(e => e.id === node.referenceId);
        const claim = run.claims.find(c => c.id === node.referenceId);
        return { id: node.id, label: node.kind === 'claim' ? claim?.label ?? node.label : node.label,
          kind: node.kind, category: entity?.type, kicker: entity ? TYPES[entity.type] : '주장',
          ariaLabel: `${entity ? TYPES[entity.type] : '주장'}: ${node.label}` };
      })}
      edges={edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label }))}
      onNode={id => { setFocusedId(id); setEdgeId(undefined); }}
      onEdge={id => { setEdgeId(id); setFocusedId(undefined); }} />
      : <p className="wisdom-empty">원문으로 확인한 대상 간 관계가 없습니다. 주장 목록은 아래 판단별 근거에서 확인할 수 있습니다.</p>}
    {selectedEdge || focused ? <div className="relation-inspector" aria-live="polite">
      <h3>{selectedEdge ? `${label(selectedEdge.from)} → ${label(selectedEdge.to)}` : focused!.label}</h3>
      {selectedEdge ? <p className="relation-predicate">{selectedEdge.label}</p> : <p className="relation-predicate">연결된 관계 {relatedEdges.length}개</p>}
      {claims.map(c => <p key={c.id}>{c.statement}</p>)}
      {citations(relatedEvidence)}
    </div> : null}
    {hypotheses.length ? <details className="relation-insights"><summary>근거를 연결한 해석 <span>{hypotheses.length}</span></summary>
      {hypotheses.map(item => <article key={item.id}>
        <span className="assessment-label">해석 · 신뢰도 {LEVELS[item.confidence]} · 검토 전</span><h3>{item.conclusion}</h3>
        <p>{item.limitations[0]}</p>
        <button className="ghost-button" type="button" onClick={() => { setInferenceId(item.id); setShowClaims(true); setFocusedId(undefined); setEdgeId(undefined); }}>이 해석의 근거 관계 보기</button>
        {citations(item.evidenceIds)}
        <dl><dt>해석의 한계</dt><dd>{item.limitations.slice(1).join(' ') || '확보한 공개자료 범위의 해석입니다.'}</dd>
          <dt>다른 설명</dt><dd>{item.alternatives.join(' ')}</dd><dt>추가로 확인할 것</dt><dd>{item.nextCheck}</dd></dl>
      </article>)}
    </details> : null}
  </section>;
}
