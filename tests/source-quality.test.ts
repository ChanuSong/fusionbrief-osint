import test from 'node:test';
import assert from 'node:assert/strict';
import { applySourceQuality } from '../server/source-quality.ts';
import { researchedFramework } from './fixtures/framework.ts';
test('institutional attribution increases evidence confidence while reposts and forecasts stay bounded',async()=>{
  const {run}=await researchedFramework({actual:true});const claim=run.claims.find(c=>c.id==='access-claim')!;
  const evidence=run.evidence.filter(e=>e.claimId===claim.id);
  const quality={kind:'observation' as const,fit:'direct' as const,limitations:[]};
  const rated=applySourceQuality(claim,evidence,run.sources,quality);
  assert.equal(rated.confidence!.level,'medium');
  const unknown=run.sources.map(s=>({...s,type:'news' as const,url:'https://unknown.example/post'}));
  assert.equal(applySourceQuality(claim,evidence,unknown,quality).confidence!.level,'low');
  assert.equal(applySourceQuality({...claim,status:'corroborated',independentCount:2},evidence,run.sources,quality).confidence!.level,'high');
  const forecast=applySourceQuality({...claim,status:'corroborated',independentCount:2},evidence,run.sources,{kind:'forecast',fit:'inferential',limitations:['내부 결정 비공개']});
  assert.equal(forecast.confidence!.level,'low');
  assert.equal(applySourceQuality({...claim,status:'conflicting',independentCount:8},evidence,run.sources,quality).confidence!.level,'undetermined');
});
