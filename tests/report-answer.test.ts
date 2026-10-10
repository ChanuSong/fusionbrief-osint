import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { z } from 'zod';
import type { JsonModel } from '../server/model.ts';
import { repairAnswer } from '../server/report-answer.ts';
import { wisdomFixture } from './fixtures/wisdom.ts';
const brief={paragraphs:[{heading:'핵심 답변',text:'Alpha는 Beta를, Beta는 Gamma를 인용했습니다.',claimIds:['c0','c1'],kind:'fact'}]};
function model(outputs:unknown[]):JsonModel{return{generate:async<T>(schema:z.ZodType<T>)=>schema.parse(outputs.shift())};}
test('a repaired lead is published only after independent audit of all paragraphs',async()=>{
 const run=wisdomFixture();
 assert.equal(await repairAnswer(run,model([brief,{verdicts:[{index:0,supported:true,reason:'검증용 인용 관계 확인'}]}])),true);
 assert.equal(run.answer?.composition,'synthesized');assert.deepEqual(run.answer?.paragraphs,brief.paragraphs);
});
test('rejected or duplicate audit verdicts cannot replace the existing answer',async()=>{
 for(const verdicts of [[{index:0,supported:false,reason:'근거 불충분'}],[{index:0,supported:true,reason:''},{index:0,supported:false,reason:''}]]){
  const run=wisdomFixture();const original=structuredClone(run.answer);
  assert.equal(await repairAnswer(run,model([brief,{verdicts}])),false);assert.deepEqual(run.answer,original);
 }
});
test('a repair with invented claim references is rejected even if the model approves it',async()=>{
 const run=wisdomFixture();const invalid={paragraphs:[{...brief.paragraphs[0],claimIds:['unknown']}]};
 assert.equal(await repairAnswer(run,model([invalid,{verdicts:[{index:0,supported:true,reason:''}]}])),false);
});
