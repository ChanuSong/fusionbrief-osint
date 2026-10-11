import { useMemo, useState } from 'react';
import { Background, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { graphlib, layout } from '@dagrejs/dagre';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import '@xyflow/react/dist/style.css';

export interface CanvasNode { id: string; label: string; kind: string; kicker: string; category?: string; subline?: string; ariaLabel?: string; color?: string; }
export interface CanvasEdge { id: string; from: string; to: string; label: string; derived?: boolean; color?: string; }
type GraphNode = Node<{ item: CanvasNode }, 'trace'>;
interface Props { nodes: CanvasNode[]; edges: CanvasEdge[]; focusId?: string; onNode: (id: string) => void; onEdge?: (id: string) => void; label: string; legend?: string; }
function TraceNode({ data }: NodeProps<GraphNode>) {
  const item = data.item;
  return <div className={`trace-node ${item.kind}`} style={{ borderLeftColor: item.color }} title={item.label}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <span className="trace-node-kind">{item.kicker}</span><strong>{item.label}</strong>
    {item.subline ? <small>{item.subline}</small> : null}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
const nodeTypes = { trace: TraceNode };
function arrange(nodes: CanvasNode[], edges: CanvasEdge[]): GraphNode[] {
  const graph = new graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', ranksep: 60, nodesep: 30, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(node => graph.setNode(node.id, { width: 220, height: 100 }));
  edges.forEach(edge => graph.setEdge(edge.from, edge.to, { width: 62, height: 18 }, edge.id));
  layout(graph);
  return nodes.map(item => ({ id: item.id, type: 'trace', data: { item }, position: { x: graph.node(item.id).x - 110, y: graph.node(item.id).y - 50 },
    ariaRole: 'button', ariaLabel: item.ariaLabel ?? `${item.kicker}: ${item.label}`, className: `wisdom-node ${item.kind}${item.kind === 'evidence' ? ' evidence-node' : ''}`,
    style: { width: 220, height: 100 }, sourcePosition: Position.Right, targetPosition: Position.Left }));
}
function Canvas({ nodes: items, edges: links, focusId, onNode, onEdge, label, legend }: Props) {
  const initialNodes = useMemo(() => arrange(items, links), [items, links]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(initialNodes);
  const flow = useReactFlow();
  const [zoom, setZoom] = useState(100);
  const [expanded, setExpanded] = useState(false);
  const neighbors = focusId ? new Set([focusId, ...links.filter(e => e.from === focusId || e.to === focusId).flatMap(e => [e.from, e.to])]) : undefined;
  const edges = links.map(edge => ({ id: edge.id, source: edge.from, target: edge.to, label: edge.label, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.color ?? (edge.derived ? '#a67542' : '#6a8798') },
    style: { stroke: edge.color ?? (edge.derived ? '#a67542' : '#6a8798'), strokeWidth: 1.5, strokeDasharray: edge.derived ? '6 4' : undefined,
      opacity: focusId && edge.from !== focusId && edge.to !== focusId ? .14 : 1 },
    labelStyle: { fontSize: 11, fill: '#435c6d' }, labelBgStyle: { fill: '#fafcfd', fillOpacity: .95 },
    labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 3,
    ariaRole: 'button' as const, ariaLabel: `${items.find(n => n.id === edge.from)?.label} → ${edge.label} → ${items.find(n => n.id === edge.to)?.label}`,
  }));
  return <div className={`interactive-graph ${expanded ? 'expanded' : ''}`}>
    <div className="wisdom-toolbar"><span className="graph-count">노드 {items.length} · 관계 {links.length}<span>{legend ?? '실선: 원문 지지 · 점선: 반박'}</span></span>
      <div className="wisdom-tools">
        <button className="icon-button" aria-label="그래프 축소" onClick={() => void flow.zoomTo(Math.max(.15, flow.getZoom() - .15))}><ZoomOut size={16} /></button>
        <span>{zoom}%</span><button className="icon-button" aria-label="그래프 확대" onClick={() => void flow.zoomTo(Math.min(2, flow.getZoom() + .15))}><ZoomIn size={16} /></button>
        <button className="icon-button" aria-label="그래프 보기 초기화" onClick={() => { setNodes(arrange(items, links)); requestAnimationFrame(() => void flow.fitView({ padding: .15, maxZoom: 1 })); }}><RotateCcw size={15} /></button>
        <button className="icon-button" aria-label={expanded ? '그래프 크게 보기 닫기' : '그래프 크게 보기'} aria-pressed={expanded}
          onClick={() => { setExpanded(v => !v); requestAnimationFrame(() => void flow.fitView({ padding: .15, maxZoom: 1 })); }}><Maximize2 size={15} /></button>
      </div></div>
    <div className="graph-viewport" aria-label={label} onKeyDownCapture={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        const target = event.target as Element;
        const edge = target.closest('.react-flow__edge');
        if (edge?.getAttribute('data-id')) { event.preventDefault(); onEdge?.(edge.getAttribute('data-id')!); return; }
        const node = target.closest('.react-flow__node');
        if (node?.getAttribute('data-id')) { event.preventDefault(); onNode(node.getAttribute('data-id')!); }
      }
    }}>
      <ReactFlow nodes={nodes.map(node => ({ ...node, style: { ...node.style, opacity: neighbors && !neighbors.has(node.id) ? .22 : 1 }, selected: node.id === focusId }))}
        edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={(_event, node) => onNode(node.id)}
        onEdgeClick={(_event, edge) => onEdge?.(edge.id)} onMove={(_event, viewport) => setZoom(Math.round(viewport.zoom * 100))}
        fitView fitViewOptions={{ padding: .15, minZoom: .15, maxZoom: 1 }} minZoom={.15} maxZoom={2} nodesConnectable={false}
        deleteKeyCode={null} zoomOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false}
        ariaLabelConfig={{ 'node.a11yDescription.default': 'Enter 키로 상세 보기. 방향키로 노드 이동.', 'controls.fitView.ariaLabel': '전체 그래프 맞춤' }}>
        <Background color="#cad7df" gap={22} size={1} />
      </ReactFlow>
    </div><p className="graph-help">드래그로 이동 · 노드 선택으로 연결 강조 · 연결선 선택으로 근거 확인 · 확대 버튼 또는 핀치로 확대</p>
  </div>;
}
export function GraphCanvas(props: Props) {
  const signature = useMemo(() => JSON.stringify([props.nodes, props.edges]), [props.nodes, props.edges]);
  return <ReactFlowProvider key={signature}><Canvas {...props} /></ReactFlowProvider>;
}
