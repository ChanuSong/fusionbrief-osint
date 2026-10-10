import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAuditedOrigins,type OriginAudit} from '../server/origin-audit.ts';
import {groupsForEvidence,evaluateClaim} from '../server/analysis.ts';
import {applySourceQuality} from '../server/source-quality.ts';
import type {Evidence} from '../shared/types.ts';
import {wisdomFixture} from './fixtures/wisdom.ts';
test('same briefing is one origin; reciprocal distinct audits raise confidence and controlled copies cannot do so',()=>{
  const fixture=wisdomFixture();const source=fixture.sources[0];source.body='기관 A의 자체 관측. 기관 B의 자체 관측.';source.type='official';
  const sources=[source,{...source,id:'other',url:'https://other.example.gov/report'}];
  const evidence:Evidence[]=[{...fixture.evidence[0],id:'a',claimId:'c',sourceId:source.id,stance:'supports' as const,independence:'unconfirmed' as const,originVerified:false},
    {...fixture.evidence[0],id:'b',claimId:'c',sourceId:'other',stance:'supports' as const,independence:'unconfirmed' as const,originVerified:false}];
  const audit:OriginAudit[]=[{evidenceId:'a',originKey:'same-briefing',label:'기관 A',attributionQuote:'기관 A의 자체 관측.',relation:'primary',independentOf:['b'],reason:'fixture audit'},
    {evidenceId:'b',originKey:'same-briefing',label:'기관 A 전재',attributionQuote:'기관 A의 자체 관측.',relation:'republication',independentOf:['a'],reason:'same statement'}];
  applyAuditedOrigins(evidence,sources,audit);assert.equal(groupsForEvidence(evidence).length,1);assert.ok(evidence.every(e=>e.independence==='unconfirmed'));
  audit[1]={...audit[1],originKey:'separate-observation',label:'기관 B',attributionQuote:'기관 B의 자체 관측.',relation:'primary'};
  applyAuditedOrigins(evidence,sources,audit);assert.ok(evidence.every(e=>e.independence==='verified'));
  const claim={...fixture.claims[0],id:'c',groups:groupsForEvidence(evidence),evidenceIds:['a','b']};
  const rated=applySourceQuality(evaluateClaim(claim,evidence,false),evidence,sources,{kind:'observation',fit:'direct',limitations:[]});
  assert.equal(rated.independentCount,2);assert.equal(rated.confidence?.level,'high');
  sources.forEach(s=>{s.attribution={publisher:'DPRK controlled fixture',archive:false,control:'dprk-state'};});
  applyAuditedOrigins(evidence,sources,audit);assert.ok(evidence.every(e=>e.independence==='unconfirmed'));
  sources.forEach(s=>{s.attribution=undefined;});audit[1].independentOf=[];
  applyAuditedOrigins(evidence,sources,audit);assert.ok(evidence.every(e=>e.independence==='unconfirmed'));
  audit[1].attributionQuote='invented original';applyAuditedOrigins(evidence,sources,audit);assert.equal(evidence[0].independence,'unconfirmed');
});
