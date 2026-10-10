import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { instantiateDemo, validateDemo } from '../server/demo.ts';
import type { DemoPackage } from '../shared/demo.ts';
import {readMedia} from '../server/media-cache.ts';
import {buildAnalysisOntology} from '../shared/analysis-ontology.ts';

const directory = resolve('data/demo');
const files = (await readdir(directory)).filter(file => file.endsWith('.json'));
assert.ok(files.length >= 2, '주 시연과 추가 사례가 필요합니다.');
let mains = 0;
for (const file of files) {
  const pack = JSON.parse(await readFile(resolve(directory, file), 'utf8')) as DemoPackage;
  validateDemo(pack);
  const run = pack.run;
  assert.equal(run.answer?.composition, 'synthesized', '검증된 종합 답변 필요');
  assert.ok(run.answer.paragraphs.length >= (run.analysis ? 1 : 3) && run.sources.length >= 8 && run.evidence.length >= 12);
  assert.ok((run.relations?.length ?? 0) >= 3 && (run.events?.length ?? 0) >= 3);
  const languages = new Set(run.evidence.map(e => run.sources.find(s => s.id === e.sourceId)!.language));
  if (pack.main) {
    mains++;
    assert.equal(run.analysis?.dimension,'forecast');
    assert.equal(run.analysis.verification,'verified');
    assert.ok(run.analysis.keyJudgments?.length && run.analysis.outlook?.length,'근거 연결된 주요 판단·조건부 전망 필요');
    assert.equal(buildAnalysisOntology(run).validation.conforms,true,'대표 사례의 근거 관계 무결성 필요');
    assert.ok(run.research?.strategy?.sourcePlan?.length===11,'모든 자료 유형의 관련성 검토 필요');
  }
  for(const media of run.sources.flatMap(s=>s.media ?? []).filter(m=>m.hash))assert.ok(await readMedia(media.hash!),'시연 이미지 원본 필요');
  const started = performance.now();
  const first = instantiateDemo(pack), second = instantiateDemo(pack);
  assert.notEqual(first.id, second.id);
  assert.equal(first.version, 1); assert.equal(first.approval, undefined);
  console.log(`${pack.title}: ${run.sources.length}문서 / ${run.evidence.length}인용 / ${[...languages].join(',')} / 복사·검증 ${(performance.now() - started).toFixed(1)}ms`);
}
assert.equal(mains, 1, '주 시연은 하나로 지정하세요.');
console.log('시연 패키지 준비 완료. 브라우저 흐름은 npm run test:e2e로 확인합니다.');
