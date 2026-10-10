import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisOntology, ontologyJSONLD, assessmentPaths } from '../shared/analysis-ontology.ts';
import { researchedFramework, frameworkInput, frameworkOutputs } from './fixtures/framework.ts';
import { research } from '../server/research.ts';

test('ontology records auditable judgment/criterion/provision and assessment/claim/quote/source dependencies', async () => {
  const { run } = await researchedFramework({ actual: true });
  const graph = buildAnalysisOntology(run);
  assert.equal(graph.validation.conforms, true);
  assert.ok(graph.nodes.some(n => n.type === 'Provision' && n.properties.authority === 'expert-manual'));
  assert.ok(graph.edges.some(e => e.predicate === 'hasBasis'));
  assert.ok(graph.edges.some(e => e.predicate === 'evaluates'));
  assert.deepEqual(assessmentPaths(run, 'access'), [{ claimId: 'access-claim', evidenceId: 'access-claim-e1', sourceId: 'event' }]);
  const ld = ontologyJSONLD(graph);
  assert.equal(ld['@context'].wasDerivedFrom && (ld['@context'].wasDerivedFrom as { '@id': string })['@id'], 'prov:wasDerivedFrom');
  assert.ok(ld['@graph'].every(n => n['@id'].startsWith(`urn:trace:run:${run.id}:`)));
  assert.ok(!graph.edges.some(e => /causes|sameAs/.test(e.predicate)));
});
test('unknown remains unknown; announcements cannot masquerade as performed acts and unsupported links are rejected', async () => {
  const { run } = await researchedFramework();
  const graph = buildAnalysisOntology(run);
  assert.equal(graph.nodes.find(n => n.type === 'Assessment' && n.referenceId === 'access')!.properties.status, 'unknown');
  run.analysis!.assessments[1].status = 'met';
  assert.ok(buildAnalysisOntology(run).validation.violations.some(v => v.includes('실제 시행 없는')));
  run.analysis!.assessments[1].claimIds = ['invented'];
  assert.ok(!buildAnalysisOntology(run).validation.conforms);
  assert.equal(ontologyJSONLD(buildAnalysisOntology(run))['@graph'].find(n => n['@type'] === 'ValidationReport')!.conforms, false);
  run.evidence[0].quote = 'fabricated quote';
  assert.ok(buildAnalysisOntology(run).validation.violations.some(v => v.includes('원문에 연결되지')));
});
test('pending reviewed assessments do not export met assertions or live observation nodes', async () => {
  const { run } = await researchedFramework({ actual: true });
  run.analysis!.verification = 'pending'; run.analysis!.judgment.status = 'undetermined';
  const graph = buildAnalysisOntology(run);
  assert.equal(graph.nodes.filter(n => n.type === 'Observation').length, 0);
  assert.ok(graph.nodes.filter(n => n.type === 'Assessment').every(n => n.properties.status === 'unknown' && n.properties.verification === 'pending'));
});
test('production requires a comprehensive planner strategy before searching, with one evidence requirement per target', async () => {
  const f = frameworkOutputs();
  const dependencies = { requireStrategy: true, model: { async generate<T>(schema: { parse(value: unknown): T }) { return schema.parse({ ...f.plan, strategy: undefined }); } },
    async search(): Promise<never> { throw new Error('must not search'); }, async read(): Promise<never> { throw new Error('must not read'); } };
  await assert.rejects(() => research(frameworkInput, () => {}, dependencies), /질의 해석·자료 전략/);
});
test('conditional forecasts remain separate from actual observations and preserve claim dependencies',async()=>{
  const {run}=await researchedFramework({actual:true});
  run.analysis!.outlook=[{label:'조건부 전망',text:'조건이 유지되면 접근 제한이 지속될 수 있다.',claimIds:['access-claim'],criterionIds:['access'],
    confidence:{level:'low',reason:'조건부 추정'},horizon:'향후 한 달',likelihood:'plausible',assumptions:['현 상황 유지'],indicators:[{signal:'새로운 실제 접근 거부',direction:'strengthens'}]}];
  const graph=buildAnalysisOntology(run);assert.equal(graph.validation.conforms,true);
  const node=graph.nodes.find(n=>n.type==='Forecast')!;assert.equal(node.properties.likelihood,'plausible');
  assert.ok(graph.edges.some(e=>e.from===node.id && e.predicate==='groundedIn'));
  assert.equal(graph.nodes.filter(n=>n.type==='Observation').length,run.analysis!.observations.length);
  run.analysis!.verification='pending';assert.equal(buildAnalysisOntology(run).nodes.filter(n=>n.type==='Forecast').length,0);
});
test('visual observations require a matching immutable image and literal identity quotation',async()=>{
  const {run}=await researchedFramework({actual:true});const source=run.sources[0];const hash='a'.repeat(64);
  source.media=[{url:'https://example.org/public.jpg',caption:'Test',credit:'Synthetic fixture',kind:'image',hash,analysis:'visual-reviewed'}];
  run.imagery=[{sourceId:source.id,mediaHash:hash,description:'Visible seats',relevance:'Layout only',identityQuote:'',limitations:['No authority inference'],verified:true}];
  assert.equal(buildAnalysisOntology(run).validation.conforms,true);
  assert.equal(buildAnalysisOntology(run).nodes.filter(n=>n.type==='VisualObservation').length,1);
  run.imagery[0].identityQuote='invented identity';assert.equal(buildAnalysisOntology(run).validation.conforms,false);
  run.imagery[0].identityQuote='';source.media[0].hash='b'.repeat(64);assert.equal(buildAnalysisOntology(run).validation.conforms,false);
});
