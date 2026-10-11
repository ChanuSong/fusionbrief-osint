import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {AnalysisRun,Evidence} from '../../shared/types.ts';
const KnowledgeGraph=lazy(()=>import('./KnowledgeGraph.tsx').then(m=>({default:m.KnowledgeGraph})));
export function JudgmentGraphDialog({run,claimIds,sentence,colors,onEvidence,onClose}:{run:AnalysisRun;claimIds:string[];sentence:string;colors:Map<string,string>;onEvidence:(e:Evidence)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const claims=run.claims.filter(c=>claimIds.includes(c.id));
  const [selected,setSelected]=useState(claims.length>1?'all':claims[0]?.id);
  const claim=claims.find(c=>c.id===selected)??claims[0];
  const representativeFusion=claims.some(c=>c.id==='c1')&&claims.some(c=>c.id==='c10')&&claims.some(c=>c.id==='c12');
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="judgment-graph-dialog" aria-labelledby="judgment-graph-title" onClose={onClose}>
    <div className="dialog-heading"><h2 id="judgment-graph-title">이 판단의 근거 연결</h2><button className="icon-button" aria-label="근거 연결 창 닫기" onClick={()=>ref.current?.close()}><X size={20}/></button></div>
    <div className="judgment-graph-body"><p className="judgment-graph-sentence">{sentence}</p>
      {representativeFusion?<div className="judgment-graph-reading"><strong>이 그림으로 설명할 핵심</strong><p>한국·일본 발표로 발사를 확인했습니다. 북한의 과시 지속 발언은 추가 발사 감시로, 일본의 항공·선박 정보 제공은 민간 운항 영향 확인으로 이어집니다. 그래서 두 경로를 따로 감시합니다. 실제 우회·지연 규모는 아직 확인되지 않았습니다.</p></div>:claims.length>1?<p className="judgment-graph-reading">여러 원문의 인용으로 사실·발언을 확인한 뒤, 이들을 연결해 위의 분석 판단을 구성했습니다. 황색 점선은 분석에 사용한 관계입니다.</p>:null}
      <div className="judgment-graph-claims" role="group" aria-label="판단에 연결된 주장">{claims.length>1?<button aria-pressed={selected==='all'} onClick={()=>setSelected('all')}>전체 자료 → 결합 판단</button>:null}{claims.map(c=><button key={c.id} aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}>{c.label}</button>)}</div>
      {claim?<Suspense fallback={<p className="graph-loading">근거 연결 준비 중…</p>}><KnowledgeGraph key={selected} run={run} claim={claim} claims={selected==='all'?claims:undefined} sentence={selected==='all'?sentence:undefined} colors={colors} onEvidence={e=>{onClose();onEvidence(e);}}/></Suspense>:null}
    </div>
  </dialog>;
}
