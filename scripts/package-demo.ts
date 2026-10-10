import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateDemo} from '../server/demo.ts';
import type {AnalysisRun} from '../shared/types.ts';
import type {DemoPackage} from '../shared/demo.ts';
import {readMedia} from '../server/media-cache.ts';
const [input,id,title,subtitle]=process.argv.slice(2).filter(arg=>arg!=='--main');
if(!input || !id || !title || !subtitle || !/^[a-z0-9-]+$/.test(id)) throw Error('Usage: npm run demo:package -- run.json scenario-id title subtitle [--main]');
const raw=JSON.parse(await readFile(resolve(input),'utf8'));
const run:AnalysisRun=structuredClone(raw.run ?? raw);
if(run.answer?.composition!=='synthesized') throw Error('검증된 통합 답변이 있는 보고서만 시연 패키지로 만들 수 있습니다.');
if(run.reviews.length || run.approval || run.approvals?.length) throw Error('검토 이력이 있는 보고서를 검토 전 원본으로 바꿀 수 없습니다. 검토 전 실행을 사용하세요.');
run.approval=undefined;run.approvals=[];run.reviews=[];run.demo=undefined;run.version=1;
const pack:DemoPackage={schema:1,id,title,subtitle,main:process.argv.includes('--main'),preparedAt:new Date().toISOString(),run};
validateDemo(pack);
await mkdir(resolve('data/demo'),{recursive:true});
await mkdir(resolve('data/demo/media'),{recursive:true});
for(const hash of new Set(run.sources.flatMap(s=>s.media?.flatMap(m=>m.hash ? [m.hash] : []) ?? []))) {
  const asset=await readMedia(hash);if(!asset)throw Error(`시연 이미지 원본 누락: ${hash}`);
  await writeFile(resolve('data/demo/media',hash),asset.body);
}
await writeFile(resolve('data/demo',`${id}.json`),JSON.stringify(pack,null,2));
console.log(JSON.stringify({id,documents:run.sources.length,citations:run.evidence.length,languages:[...new Set(run.evidence.map(e=>run.sources.find(s=>s.id===e.sourceId)?.language))]}));
