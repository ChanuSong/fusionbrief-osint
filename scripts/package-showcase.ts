import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { DemoPackage } from '../shared/demo.ts';
import { validateDemo } from '../server/demo.ts';
import { exportMarkdown, validEvidence } from '../server/analysis.ts';
import { buildAnalysisOntology, ontologyJSONLD } from '../shared/analysis-ontology.ts';
import type { AnalysisRun } from '../shared/types.ts';
const output = 'dist-showcase';
await mkdir(`${output}/reports`, { recursive: true });
await mkdir(`${output}/exports`, { recursive: true });
await rename(`${output}/showcase.html`, `${output}/index.html`);
const catalog: { id: string; title: string; subtitle: string; file: string; documents: number; citations: number }[] = [];
for (const id of ['nk-succession', 'taiwan-strait-2026', 'nk-pow-disclosure']) {
  const pack = JSON.parse(await readFile(`data/demo/${id}.json`, 'utf8')) as DemoPackage;
  validateDemo(pack);
  const run = structuredClone(pack.run);
  run.demo = { scenarioId: pack.id, title: pack.title, preparedAt: pack.preparedAt, originalRunId: run.id, originalDurationMs: run.durationMs, loadedAt: pack.preparedAt };
  await save(run, id, pack.title, pack.subtitle);
}
const live = JSON.parse(await readFile('data/showcase/latest-live.json', 'utf8')) as AnalysisRun;
if (!live.analysis || live.analysis.verification !== 'verified' || live.evidence.some(e => !validEvidence(e, live.sources.find(s => s.id === e.sourceId))) || !buildAnalysisOntology(live).validation.conforms) throw Error('실제 실행 보고서의 인용·근거 연결 검증 실패');
await save(live, 'latest-live', '김주애 승계 · 새 질문의 실제 실행 결과', '실제 수집 23건 · 유효 인용 19건 · 전체 실행 18분 43초. 이 웹에서는 완료한 결과를 탐색합니다.');
await writeFile(`${output}/reports/catalog.json`, JSON.stringify(catalog));
await cp('data/demo/media', `${output}/media`, { recursive: true });
await cp('output/submission/screenshots', `${output}/screenshots`, { recursive: true });
await cp('output/submission/trace-walkthrough.mp4', `${output}/trace-walkthrough.mp4`);
async function save(run: AnalysisRun, id: string, title: string, subtitle: string) {
  const file = `reports/${id}.json`;
  await writeFile(`${output}/${file}`, JSON.stringify(run));
  await writeFile(`${output}/exports/${run.id}.md`, exportMarkdown(run));
  await writeFile(`${output}/exports/${run.id}.jsonld`, JSON.stringify(ontologyJSONLD(buildAnalysisOntology(run))));
  catalog.push({ id, title, subtitle, file, documents: run.sources.length, citations: run.evidence.length });
}
