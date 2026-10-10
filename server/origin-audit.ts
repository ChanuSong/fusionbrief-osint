import {createHash} from 'node:crypto';
import type {Evidence,SourceDocument} from '../shared/types.ts';
export interface OriginAudit {
  evidenceId:string;originKey:string;label:string;attributionQuote:string;
  relation:'primary'|'republication'|'analysis'|'unresolved';independentOf:string[];reason:string;
}
/** Apply only exact-body, uniquely audited attribution. Cross-claim and one-sided
 * independence links never establish independent corroboration. */
export function applyAuditedOrigins(related:Evidence[],sources:SourceDocument[],origins:OriginAudit[]):void {
  const one=(id:string)=>{const matches=origins.filter(v=>v.evidenceId===id);return matches.length===1 ? matches[0] : undefined;};
  for(const evidence of related){
    const verdict=one(evidence.id);const source=sources.find(s=>s.id===evidence.sourceId);
    if(!source || !verdict || verdict.relation==='unresolved' || !verdict.attributionQuote.trim() || !source.body.includes(verdict.attributionQuote))continue;
    evidence.originId=`origin-${createHash('sha256').update(verdict.originKey).digest('hex').slice(0,12)}`;
    evidence.originLabel=verdict.label;evidence.originVerified=true;
    evidence.originReason=`${verdict.reason} · 귀속 원문: “${verdict.attributionQuote}”`;
    const independent=verdict.independentOf.some(id=>{
      const other=related.find(e=>e.id===id && e.id!==evidence.id && e.claimId===evidence.claimId);const audit=one(id);
      const original=sources.find(s=>s.id===other?.sourceId);
      return other && audit && audit.relation!=='unresolved' && audit.originKey!==verdict.originKey && audit.independentOf.includes(evidence.id)
        && !!audit.attributionQuote.trim() && original?.body.includes(audit.attributionQuote)
        && !(source.attribution?.control==='dprk-state' && original.attribution?.control==='dprk-state');
    });
    evidence.independence=independent ? 'verified' : 'unconfirmed';
  }
}
