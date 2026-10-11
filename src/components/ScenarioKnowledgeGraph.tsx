import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SyntheticAssessment } from '../../shared/synthetic-scenario.ts';
import { SYNTHETIC_SCENARIO } from '../../shared/synthetic-scenario.ts';
import { RISK_LABELS } from '../../shared/risk-policy.ts';

export default function ScenarioKnowledgeGraph({result,onSource}:{result:SyntheticAssessment;onSource:(id:string)=>void}){
  const [selected,setSelected]=useState('insight');
  const graph=useMemo(()=>{
    const node=(id:string,label:string,x:number,y:number,color='#f3f8fb',border='#8eafc4'):Node=>({id,position:{x,y},data:{label},style:{width:215,padding:12,background:color,border:`1px solid ${border}`,borderRadius:5,fontSize:11,color:'#29485d',whiteSpace:'pre-line',lineHeight:1.7}});
    const nodes=result.activeSourceIds.map((id,i)=>node(id,`${id} · 합성 원문\n${SYNTHETIC_SCENARIO.sources.find(s=>s.id===id)?.title}\n클릭하여 원문 확인`,0,i*118));
    nodes.push(node('criteria','판단 기준\n최신성 → 시각·구역 → 전후 항로\n같은 원문 재전파는 1개 원출처',270,-32));
    nodes.push(node('observations',`시각·구역 교차검증\n항공 ${result.air.rerouted}/${result.air.eligible}대 · 선박 ${result.sea.rerouted}/${result.sea.eligible}척 우회\n오래된 수신 ${result.excluded}개체 제외`,270,126));
    nodes.push(node('risk',`민간 운항 차질 위험\n${RISK_LABELS[result.risk]} · 시나리오 내 신뢰도 ${result.confidence==='medium'?'중간':'낮음'}`,540,38,result.risk==='high'?'#fff0e3':'#edf3f6',result.risk==='high'?'#b77742':'#8eafc4'));
    nodes.push(node('cause',`시험경보와의 연관성\n${result.attribution==='supported'?'시각·구역 정합 / 인과 미확정':'원인 귀속 유보'}`,540,225,result.attribution==='supported'?'#f0f6f2':'#faf1df'));
    nodes.push(node('insight',`결합으로 얻은 시간 부담 격차\n항공 약 ${result.meanAirExtraMinutes}분 / 해상 약 ${result.meanSeaExtraMinutes}분\n${result.air.rerouted&&result.sea.rerouted?'수단별 후속 확인 우선순위':'유효 관측 부족 · 판단 유보'}`,540,405,'#fff9e9','#bb974f'));
    nodes.push(node('action',`권장 추가 액션\n${result.air.rerouted&&result.sea.rerouted&&result.meanSeaExtraMinutes>result.meanAirExtraMinutes?'해상 항로 복귀·우회 부담 우선 확인':'유효 항적·경보 원문 확보'}\n경보 만료·연장과 함께 재평가`,810,100));
    nodes.push(node('military','미사일 발사·군사 공격\n판단 유보\n별도 탐지·발표 근거 필요',810,280,'#f1f3f5'));
    const edge=(source:string,target:string,label:string,alternative=false):Edge=>({id:`${source}-${target}`,source,target,label,markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:alternative?'#a47735':'#6e91a8',strokeDasharray:alternative?'6 4':undefined},labelStyle:{fontSize:10,fill:'#5b7486'},labelBgPadding:[5,3]});
    const edges:Edge[]=[edge('criteria','observations','검사'),edge('observations','risk','운항 영향 평가'),edge('observations','cause','원인 별도 대조'),edge('observations','insight','거리·속도로 시간 추정'),edge('insight','action','영향 격차 → 우선순위'),edge('risk','action','재평가 신호'),edge('observations','military','발사 근거 부족',true)];
    result.activeSourceIds.forEach(id=>edges.push(id==='SIM-W1'?edge(id,'cause','기상 경쟁 설명',true):edge(id,'observations',id==='SIM-N1'?'발효 구역·시각':'전후 관측')));
    return {nodes,edges};
  },[result]);
  const [nodes,setNodes,onNodesChange]=useNodesState(graph.nodes),[edges,setEdges,onEdgesChange]=useEdgesState(graph.edges);
  useEffect(()=>{setNodes(graph.nodes);setEdges(graph.edges);},[graph,setNodes,setEdges]);
  const notes:Record<string,string>={
    criteria:'합성 사례의 분석 지표입니다. 관측 최신성을 먼저 검사하고 같은 구역·발효기간의 전후 경로를 대조합니다. 원문 재전파 수는 독립 근거 수에 더하지 않습니다.',
    observations:`${result.explanation} 우회·시간은 실제로 계산하며, 오래된 관측은 평가에서 제외합니다.`,
    risk:`민간 운항 차질 위험 ${RISK_LABELS[result.risk]}. 가능성×영향의 제품 행렬을 사용합니다. 실제 전쟁 확률이나 공식 경보가 아닙니다.`,
    cause:result.attribution==='supported'?'경보와 우회가 같은 시각·구역에 나타납니다. 연관성을 지지하지만 단독 인과관계까지 확정하지 않습니다.':'경보 원문이 빠졌거나 기상이라는 경쟁 설명이 들어왔습니다. 우회 원인을 시험경보 하나에 귀속하지 않습니다.',
    military:'우회나 운항 제한은 미사일 발사 실행과 공격 의도의 근거가 아닙니다. 별도 탐지·발표 원문이 없어 이 판단은 유보합니다.',
    insight:result.air.rerouted&&result.sea.rerouted?`우회 표본의 평균 추가 이동 시간은 항공 ${result.meanAirExtraMinutes}분, 해상 ${result.meanSeaExtraMinutes}분입니다. 경보에는 없던 수단별 영향 격차를 거리와 이전 속도로 계산해 후속 확인의 우선순위에 연결합니다. 합성 입력의 추정치이며 실제 도착 지연은 아닙니다.`:'유효한 전후 항적이 없어 수단별 영향 격차와 우선순위를 산출하지 않습니다.',
    action:'경보 원문과 유효기간을 확인하고 동일 표본의 항로 복귀·우회 지속을 재관측합니다. 기상·관제 등 경쟁 원인도 대조합니다.',
  };
  return <><div className="judgment-graph-reading"><strong>이 그림으로 설명할 핵심</strong><p>{result.air.rerouted&&result.sea.rerouted?`경보와 항공·해상 항적을 결합하니, 경보 원문에는 없던 시간 부담의 차이가 나옵니다. 추가 이동 추정은 항공 ${result.meanAirExtraMinutes}분, 해상 ${result.meanSeaExtraMinutes}분입니다. 이 차이를 경로 복귀와 경보 연장을 확인할 우선순위에 연결합니다.`:'항적이 빠지면 시간 부담의 차이를 계산할 수 없어, 자료 확보를 우선 권장합니다.'} {result.activeSourceIds.includes('SIM-W1')?'기상 반대 근거로 인해 우회의 원인은 별도 검증합니다.':''}</p></div><p className="scenario-kg-help">원문 노드를 누르면 해당 자료가 열립니다. 판단 노드는 아래에 해석을 표시합니다. 노드 이동·확대·전체 맞춤이 가능합니다.</p><div className="scenario-knowledge-graph"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_event,node)=>{if(node.id.startsWith('SIM-'))onSource(node.id);else setSelected(node.id);}} nodesConnectable={false} deleteKeyCode={null} fitView minZoom={.15} maxZoom={1.6}><Background gap={20} size={1}/><Controls showInteractive={false}/></ReactFlow></div><div className="scenario-kg-selection" role="status"><strong>{graph.nodes.find(n=>n.id===selected)?.data.label?.toString().split('\n')[0]}</strong><p>{notes[selected]}</p></div></>;
}
