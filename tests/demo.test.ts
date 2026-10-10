import {test} from 'node:test';
import assert from 'node:assert/strict';
import {instantiateDemo,validateDemo,loadDemoCatalog} from '../server/demo.ts';
import {wisdomFixture} from './fixtures/wisdom.ts';
import {approveReport,exportMarkdown} from '../server/analysis.ts';
import type {DemoPackage} from '../shared/demo.ts';
const fixture=():DemoPackage=>({schema:1,id:'test-case',title:'검증용',subtitle:'합성 테스트 자료',main:true,preparedAt:'2026-10-10T00:00:00Z',run:wisdomFixture()});
test('cached demo creates an isolated reviewable run and preserves preparation provenance',()=>{
 const pack=fixture();const a=instantiateDemo(pack),b=instantiateDemo(pack);assert.notEqual(a.id,b.id);assert.notEqual(a.id,pack.run.id);
 const approved=approveReport(a,{expectedVersion:1,reviewer:'테스트 분석가',decision:'approved',reason:'검증용 가상 자료만 확인'});
 assert.equal(approved.approval?.decision,'approved');assert.equal(pack.run.approval,undefined);assert.equal(b.approval,undefined);
 assert.equal(a.demo?.originalRunId,pack.run.id);assert.equal(a.demo?.originalDurationMs,pack.run.durationMs);
 assert.match(exportMarkdown(a),/새 검색을 수행하지 않았습니다/);
});
test('demo validation rejects corrupted quotations, unknown references and pre-approved originals',()=>{
 const a=fixture();a.run.sources[0].body+='altered';assert.throws(()=>validateDemo(a),/인용 검증 실패/);
 const b=fixture();b.run.answer!.paragraphs[0].claimIds=['invented'];assert.throws(()=>validateDemo(b),/근거 누락/);
 const c=fixture();c.run.approval={reviewer:'x',reason:'x',decision:'approved',version:1,createdAt:''};assert.throws(()=>validateDemo(c),/검토 대기/);
});
test('a missing demo directory is an empty catalog, never an invented scenario',async()=>{
 const catalog=await loadDemoCatalog('/nonexistent/trace/demo');assert.deepEqual(catalog.list(),[]);assert.throws(()=>catalog.start('../store'),/찾을 수 없습니다/);
});
