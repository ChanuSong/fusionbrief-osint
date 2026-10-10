import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type StylesheetJson } from 'cytoscape';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { CanvasNode, CanvasEdge } from './GraphCanvas.tsx';

interface Props {
  nodes: CanvasNode[]; edges: CanvasEdge[]; focusId?: string; selectedEdgeId?: string;
  onNode: (id: string) => void; onEdge: (id: string) => void; label: string;
}
const styles: StylesheetJson = [
  { selector: 'node', style: { width: 38, height: 38, 'background-color': '#7394ac', 'border-width': 2,
    'border-color': '#fff', label: 'data(label)', color: '#203c50', 'font-size': 14, 'font-family': 'sans-serif',
    'text-valign': 'bottom', 'text-margin-y': 9, 'text-wrap': 'wrap', 'text-max-width': '125px',
    'text-background-color': '#fff', 'text-background-opacity': .9, 'text-background-padding': '3px' } },
  { selector: 'node[category = "person"]', style: { 'background-color': '#9579aa' } },
  { selector: 'node[category = "event"]', style: { shape: 'diamond', width: 46, height: 46, 'background-color': '#bb9b60' } },
  { selector: 'node[kind = "claim"]', style: { shape: 'round-rectangle', 'background-color': '#739b87' } },
  { selector: 'edge', style: { width: 1.6, 'line-color': '#a0b3bf', 'target-arrow-color': '#7894a6',
    'target-arrow-shape': 'triangle', 'arrow-scale': .9, 'curve-style': 'bezier', 'control-point-step-size': 65,
    label: 'data(label)', 'font-size': 12, color: '#50697b', 'text-wrap': 'wrap', 'text-max-width': '120px',
    'text-background-color': '#fff', 'text-background-opacity': .96, 'text-background-padding': '3px',
    'text-rotation': 'none', 'text-margin-y': -8, 'overlay-padding': 12 } },
  { selector: '.muted', style: { opacity: .13 } },
  { selector: 'node.focused', style: { 'border-color': '#234f6c', 'border-width': 3 } },
  { selector: 'edge.focused', style: { width: 2.8, 'line-color': '#315f7e', 'target-arrow-color': '#315f7e', color: '#183c56' } },
];
function fit(graph: Core, padding = 55) { graph.fit(undefined, padding); if (graph.zoom() > 1) graph.zoom({ level: 1, renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } }); }
function arrange(graph: Core) {
  graph.layout({ name: 'cose', animate: false, fit: false, randomize: false, nodeDimensionsIncludeLabels: true,
    nodeRepulsion: () => 7000, idealEdgeLength: () => 100, edgeElasticity: () => 100, gravity: 1, componentSpacing: 75, padding: 55,
    stop: () => {
      const bounds = graph.nodes().boundingBox();
      if (bounds.h > bounds.w) graph.nodes().positions(node => ({ x: node.position('y'), y: -node.position('x') }));
      fit(graph);
    } }).run();
}

export function RelationNetwork({ nodes, edges, focusId, selectedEdgeId, onNode, onEdge, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  const callbacks = useRef({ onNode, onEdge });
  useEffect(() => { callbacks.current = { onNode, onEdge }; }, [onNode, onEdge]);
  const [zoom, setZoom] = useState(100);
  const [expanded, setExpanded] = useState(false);
  // Selection must not rebuild the canvas or undo a user's node positions.
  const signature = JSON.stringify({ nodes, edges });
  useEffect(() => {
    if (!host.current) return;
    const data: { nodes: CanvasNode[]; edges: CanvasEdge[] } = JSON.parse(signature);
    const graph = cytoscape({ container: host.current, style: styles, layout: { name: 'preset' },
      minZoom: .2, maxZoom: 2.5, boxSelectionEnabled: false, autounselectify: true,
      elements: [
        ...data.nodes.map((node, i) => ({ data: { id: node.id, label: node.label, category: node.category ?? node.kind, kind: node.kind },
          position: { x: 300 + Math.cos(i * Math.PI * 2 / data.nodes.length) * 230, y: 230 + Math.sin(i * Math.PI * 2 / data.nodes.length) * 170 } })),
        ...data.edges.map(edge => ({ data: { id: edge.id, source: edge.from, target: edge.to, label: edge.label } })),
      ] });
    core.current = graph;
    graph.on('tap', 'node', event => callbacks.current.onNode(event.target.id()));
    graph.on('tap', 'edge', event => callbacks.current.onEdge(event.target.id()));
    graph.on('zoom', () => {
      const level = graph.zoom();
      // Preserve readable labels when fitting several disconnected source groups.
      graph.style().selector('node').style('font-size', Math.min(48, Math.max(14, 12 / level)))
        .selector('edge').style('font-size', Math.min(40, Math.max(12, 10 / level))).update();
      setZoom(Math.round(level * 100));
    });
    graph.on('mouseover', 'node, edge', () => { if (host.current) host.current.style.cursor = 'pointer'; });
    graph.on('mouseout', 'node, edge', () => { if (host.current) host.current.style.cursor = 'grab'; });
    arrange(graph);
    const observer = new ResizeObserver(() => { graph.resize(); fit(graph); });
    observer.observe(host.current);
    return () => { observer.disconnect(); graph.destroy(); core.current = null; };
  }, [signature]);
  useEffect(() => {
    const graph = core.current;
    if (!graph) return;
    graph.batch(() => {
      graph.elements().removeClass('muted focused');
      const chosen = graph.getElementById(selectedEdgeId ?? focusId ?? '');
      if (!chosen.length) return;
      const context = selectedEdgeId ? chosen.union(graph.edges().filter(edge => edge.id() === selectedEdgeId).connectedNodes()) : chosen.closedNeighborhood();
      graph.elements().difference(context).addClass('muted');
      chosen.addClass('focused');
    });
  }, [focusId, selectedEdgeId, signature]);
  const changeZoom = (amount: number) => {
    const graph = core.current;
    if (graph) graph.zoom({ level: Math.min(2.5, Math.max(.2, graph.zoom() + amount)), renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  };
  const name = (id: string) => nodes.find(node => node.id === id)?.label ?? id;
  return <div className={`interactive-graph network-graph ${expanded ? 'expanded' : ''}`}>
    <div className="wisdom-toolbar"><span className="graph-count">노드 {nodes.length} · 관계 {edges.length}<span>화살표를 선택해 원문 근거 확인</span></span>
      <div className="wisdom-tools">
        <button className="icon-button" aria-label="그래프 축소" onClick={() => changeZoom(-.15)}><ZoomOut size={16} /></button>
        <span>{zoom}%</span><button className="icon-button" aria-label="그래프 확대" onClick={() => changeZoom(.15)}><ZoomIn size={16} /></button>
        <button className="icon-button" aria-label="그래프 보기 초기화" onClick={() => { if (core.current) arrange(core.current); }}><RotateCcw size={15} /></button>
        <button className="icon-button" aria-label={expanded ? '그래프 크게 보기 닫기' : '그래프 크게 보기'} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}><Maximize2 size={15} /></button>
      </div>
    </div>
    <div ref={host} className="graph-viewport cytoscape-viewport" role="img" aria-label={`${label}. 노드 ${nodes.length}개, 관계 ${edges.length}개. 아래 관계 목록에서 키보드로 탐색할 수 있습니다.`} />
    <div className="network-footer"><p className="graph-help">노드 드래그 · 배경 드래그로 이동 · 스크롤·핀치로 확대</p>
      <details className="network-list"><summary>관계 목록으로 탐색</summary>
        <div className="network-entities">{nodes.map(node => <button type="button" key={node.id} aria-pressed={node.id === focusId} onClick={() => onNode(node.id)}>{node.label}</button>)}</div>
        <ul>{edges.map(edge => <li key={edge.id}><button type="button" aria-pressed={edge.id === selectedEdgeId} onClick={() => onEdge(edge.id)}>
          <span>{name(edge.from)}</span><span className="network-list-predicate"> → {edge.label} → </span><span>{name(edge.to)}</span>
        </button></li>)}</ul>
      </details>
    </div>
  </div>;
}
