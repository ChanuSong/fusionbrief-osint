import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCursorVisionStream,createCursorModel} from '../server/model.ts';
import {z} from 'zod';
import {analyzeImagery} from '../server/imagery-analysis.ts';
import {wisdomFixture} from './fixtures/wisdom.ts';

const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,1,2]);
const image={body:bytes,contentType:'image/png'};
const completed=(changes={})=>({type:'tool_call',subtype:'completed',tool_call:{readToolCall:{args:{path:'/tmp/isolated/public-image-1.png'},result:{success:{fileSize:bytes.length,isEmpty:false,exceededLimit:false,dataBlobId:'native-image-content',...changes}}}}});
const stream=(events:unknown[])=>events.map(e=>JSON.stringify(e)).join('\n');
const result={type:'result',result:'{"visible":"seating"}'};
test('visual output requires native image content reads, never caption-only or incomplete reads',()=>{
  assert.throws(()=>parseCursorVisionStream(stream([result]),[image]),/픽셀/);
  for(const invalid of [{fileSize:1},{isEmpty:true},{exceededLimit:true},{dataBlobId:''}])
    assert.throws(()=>parseCursorVisionStream(stream([completed(invalid),result]),[image]),/픽셀/);
  assert.deepEqual(parseCursorVisionStream(stream([completed(),result]),[image]),{visible:'seating'});
  assert.throws(()=>parseCursorVisionStream(stream([completed(),result]),[image,image]),/픽셀/);
});
test('a visual format retry repeats the same actual image reads and preserves negative audit verdicts',async()=>{
  let calls=0;const prompts:string[]=[];
  const model=createCursorModel(undefined,undefined,async(prompt,images)=>{assert.deepEqual(images,[image]);prompts.push(prompt);calls++;
    return stream([completed(),{type:'result',result:JSON.stringify({supported:false,reason:calls===1 ? 'overlong' : 'no'})}]);});
  assert.deepEqual(await model.generateVision!(z.object({supported:z.boolean(),reason:z.string().max(3)}),'Independent audit',{sourceId:'s'},[image]),{supported:false,reason:'no'});
  assert.equal(calls,2);assert.ok(prompts.every(p=>p.includes('Independent audit') && p.includes('"sourceId":"s"')));
  calls=0;const captionOnly=createCursorModel(undefined,undefined,async()=>{calls++;return stream([result]);});
  await assert.rejects(()=>captionOnly.generateVision!(z.object({visible:z.string()}),'Inspect',{},[image]),/픽셀/);assert.equal(calls,1);
});
test('visual findings require immutable originals, independent audit and literal identity attribution',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'trace-image-test-'));const previous=process.env.TRACE_MEDIA_DIRECTORY;
  process.env.TRACE_MEDIA_DIRECTORY=directory;
  try {
    const hash=createHash('sha256').update(bytes).digest('hex');await writeFile(join(directory,hash),bytes);
    const source=wisdomFixture().sources[0];source.body='Kim Ju Ae daughter at an event.';
    source.media=[{url:'https://example.org/photo.png',caption:'Public photo',credit:'Synthetic fixture',kind:'image',analysis:'caption-only',hash}];
    let count=0;const events:string[]=[];
    const model={async generate<T>():Promise<T>{throw Error('text cannot substitute pixels');},async generateVision<T>(schema:{parse(v:unknown):T}){
      count++;return schema.parse(count===1 ? {findings:[{sourceId:source.id,mediaHash:hash,description:'앞줄 좌석 배치',relevant:true,relevance:'공개 의전의 관측',identityQuote:'Kim Ju Ae',limitations:['사진 한 장']}]}
        : {verdicts:[{mediaHash:hash,supported:true,relevanceBounded:true,identityGrounded:true,reason:'Visible arrangement only'}]});
    }};
    const findings=await analyzeImagery('김주애 승계',[source],model,(_stage,message)=>events.push(message));
    assert.equal(findings.length,1);assert.equal(count,2);assert.equal(source.media[0].analysis,'visual-reviewed');
    count=0;source.body='unnamed daughter at an event.';
    assert.equal((await analyzeImagery('김주애 승계',[source],model,()=>{})).length,0);
    await writeFile(join(directory,hash),Buffer.from('tampered'));
    assert.equal((await analyzeImagery('김주애 승계',[source],model,()=>{})).length,0);
  }finally{if(previous===undefined)delete process.env.TRACE_MEDIA_DIRECTORY;else process.env.TRACE_MEDIA_DIRECTORY=previous;await rm(directory,{recursive:true,force:true});}
});
