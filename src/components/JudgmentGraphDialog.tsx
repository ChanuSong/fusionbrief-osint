import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {AnalysisRun,Evidence} from '../../shared/types.ts';
const KnowledgeGraph=lazy(()=>import('./KnowledgeGraph.tsx').then(m=>({default:m.KnowledgeGraph})));
export function JudgmentGraphDialog({run,claimIds,sentence,colors,onEvidence,onClose}:{run:AnalysisRun;claimIds:string[];sentence:string;colors:Map<string,string>;onEvidence:(e:Evidence)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const claims=run.claims.filter(c=>claimIds.includes(c.id));
  const [selected,setSelected]=useState(claims[0]?.id);
  const claim=claims.find(c=>c.id===selected)??claims[0];
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="judgment-graph-dialog" aria-labelledby="judgment-graph-title" onClose={onClose}>
    <div className="dialog-heading"><h2 id="judgment-graph-title">이 판단의 근거 연결</h2><button className="icon-button" aria-label="근거 연결 창 닫기" onClick={()=>ref.current?.close()}><X size={20}/></button></div>
    <div className="judgment-graph-body"><p className="judgment-graph-sentence">{sentence}</p>
      <div className="judgment-graph-claims" role="group" aria-label="판단에 연결된 주장">{claims.map(c=><button key={c.id} aria-pressed={claim?.id===c.id} onClick={()=>setSelected(c.id)}>{c.label}</button>)}</div>
      {claim?<Suspense fallback={<p className="graph-loading">근거 연결 준비 중…</p>}><KnowledgeGraph key={claim.id} run={run} claim={claim} colors={colors} onEvidence={e=>{onClose();onEvidence(e);}}/></Suspense>:null}
    </div>
  </dialog>;
}
