import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { AnalysisRun, Dataset, ResearchTrace, ReviewInput } from '../shared/types.ts';
import { EXAMPLE_QUESTIONS } from '../shared/types.ts';
import { analyze, approveReport, exportMarkdown, InputError, validateInput } from './analysis.ts';
import { collect } from './collector.ts';
import { openStore } from './store.ts';
import { modelStatus, createCursorModel } from './model.ts';
import { research } from './research.ts';
import { revalidateFramework } from './framework-revalidation.ts';
import { loadDemoCatalog } from './demo.ts';
import { createTopicService } from './topics.ts';
import { openCriterionKnowledge } from './criterion-knowledge.ts';
import { readPublicDocument, searchPublic, publicSearchLabel } from './public-sources.ts';
import { buildAnalysisOntology, ontologyJSONLD } from '../shared/analysis-ontology.ts';
import { readMedia } from './media-cache.ts';
import { DPRK_MEDIA, DPRK_ARCHIVE } from './dprk-media.ts';
import { SOURCE_MODULES } from '../shared/source-modules.ts';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
try { process.loadEnvFile(resolve(root, '.env')); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const production = process.argv.includes('--production');
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 5176;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('유효한 포트 번호를 지정해주세요.');
const dataset = JSON.parse(await readFile(resolve(root, 'data/freedom-edge.json'), 'utf8')) as Dataset;
const storeArg = process.argv.indexOf('--store');
const knowledgeArg = process.argv.indexOf('--knowledge');
const knowledge = await openCriterionKnowledge(resolve(root, knowledgeArg >= 0 ? process.argv[knowledgeArg + 1] : '.local/knowledge.sqlite'));
const store = await openStore(resolve(root, storeArg >= 0 ? process.argv[storeArg + 1] : '.local/store.json'), knowledge);
const capabilities = (process.env.FUSIONBRIEF_LIVE_ENABLED ?? process.env.TRACE_LIVE_ENABLED) === '0'
  ? { available: false, model: '', message: '이 실행에서는 실시간 모델 연결을 사용하지 않습니다.' }
  : await modelStatus();
type Job = { id: string; state: 'running' | 'complete' | 'failed'; trace: ResearchTrace[]; run?: AnalysisRun; error?: string };
const jobs = new Map<string, Job>();
const topics = createTopicService(capabilities.available);
const demos = await loadDemoCatalog(resolve(root, 'data/demo'));
if (demos.errors.length) console.error('[fusionbrief:demo]', demos.errors);
const vite = production ? undefined : await (await import('vite')).createServer({
  root, server: { middlewareMode: true, ws: { port: port <= 55535 ? port + 10000 : port - 10000 } }, appType: 'spa',
});

function json(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.includes('application/json')) throw new InputError('JSON 형식으로 요청해주세요.', 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16000) throw new InputError('요청 크기 제한을 초과했습니다.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new InputError('요청 JSON을 확인해주세요.'); }
}

async function api(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
  const method = request.method;
  if (method === 'GET' && path === '/api/source-modules') { json(response,200,{modules:SOURCE_MODULES,dprkMedia:DPRK_MEDIA,archive:DPRK_ARCHIVE}); return; }
  const mediaMatch=/^\/api\/media\/([a-f0-9]{64})$/.exec(path);
  if (method==='GET' && mediaMatch) {
    const item=await readMedia(mediaMatch[1]); if (!item) throw new InputError('보존한 이미지를 찾을 수 없습니다.',404);
    response.writeHead(200,{'Content-Type':item.contentType,'Content-Length':item.body.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}); response.end(item.body); return;
  }
  if (method === 'GET' && path === '/api/demo') { json(response, 200, { scenarios: demos.list(), unavailable: demos.errors.length }); return; }
  if (method === 'POST' && path === '/api/demo/start') {
    const input = await body(request) as { scenarioId?: unknown };
    if (!input || typeof input.scenarioId !== 'string') throw new InputError('시연 시나리오를 선택해주세요.');
    json(response, 201, await store.add(demos.start(input.scenarioId))); return;
  }
  if (method === 'GET' && path === '/api/health') { json(response, 200, { ok: true, datasetVersion: dataset.version }); return; }
  if (method === 'GET' && path === '/api/knowledge') { json(response, 200, knowledge.catalog()); return; }
  const knowledgeMatch = /^\/api\/knowledge\/(norm-[a-f0-9]{32})$/.exec(path);
  if (method === 'GET' && knowledgeMatch) {
    const document = knowledge.get(knowledgeMatch[1]);
    if (!document) throw new InputError('보존한 기준 판본을 찾을 수 없습니다.', 404);
    json(response, 200, document); return;
  }
  if (path === '/api/topics' && (method === 'GET' || method === 'POST')) {
    if (![...jobs.values()].some(job => job.state === 'running')) topics.refresh(method === 'POST');
    json(response, 200, topics.get()); return;
  }
  if (method === 'GET' && path === '/api/bootstrap') {
    json(response, 200, { dataset, questions: EXAMPLE_QUESTIONS, capabilities,
      recentRuns: store.list().map(r => ({ id: r.id, question: r.question, createdAt: r.createdAt, version: r.version,
        mode: r.mode, statuses: r.claims.map(c => c.status) })) }); return;
  }
  if (method === 'POST' && path === '/api/analyses') {
    const input = validateInput(await body(request));
    if (input.mode !== 'live') throw new InputError('공개자료 수집 모드로 요청해주세요.');
    if (!capabilities.available) throw new InputError(capabilities.message, 503);
    if ([...jobs.values()].some(job => job.state === 'running')) throw new InputError('진행 중인 수집이 있습니다. 완료 후 다시 실행하세요.', 409);
    const job: Job = { id: randomUUID(), state: 'running', trace: [] };
    for (const [id, old] of jobs) if (old.state !== 'running' && jobs.size >= 20) jobs.delete(id);
    jobs.set(job.id, job);
    const model = createCursorModel(undefined, () => job.trace.push({ stage: '응답 보완', status: 'running', at: new Date().toISOString(),
      message: '같은 원문으로 구조화 응답을 한 번 다시 생성합니다. 인용·의미 검증을 통과해야 사용합니다.' }));
    void research(input, event => job.trace.push(event), { model, search: searchPublic, read: readPublicDocument,
      searchLabel: publicSearchLabel, knowledge, requireStrategy: true }).then(run => store.add(run)).then(run => {
      job.run = run; job.state = 'complete';
    }).catch(error => {
      job.error = error instanceof Error ? error.message : '공개자료 분석을 완료하지 못했습니다.';
      job.state = 'failed';
    });
    json(response, 202, { id: job.id, state: job.state, trace: job.trace }); return;
  }
  const jobMatch = /^\/api\/analyses\/([a-f0-9-]{36})$/.exec(path);
  if (jobMatch && method === 'GET') {
    const job = jobs.get(jobMatch[1]);
    if (!job) throw new InputError('실행 기록이 없습니다. 서버가 재시작되었다면 분석을 다시 실행하세요.', 404);
    json(response, 200, job); return;
  }
  if (method === 'POST' && path === '/api/runs') {
    const input = validateInput(await body(request));
    if (input.mode === 'live') throw new InputError('공개자료 분석은 /api/analyses로 요청해주세요.');
    const started = performance.now();
    const collections = input.mode === 'refresh'
      ? await collect(dataset, input.startDate ?? dataset.eventDate.start, input.endDate ?? dataset.eventDate.end) : undefined;
    const collectMs = Math.round(performance.now() - started);
    const run = analyze(dataset, input, collections);
    if (collections) run.stages.unshift({ label: '등록 원문 재확인', durationMs: collectMs });
    run.durationMs = Math.round((performance.now() - started) * 100) / 100;
    json(response, 201, await store.add(run)); return;
  }
  const match = /^\/api\/runs\/([a-f0-9-]{36})(?:\/(reviews|export|approval|revalidate|ontology))?$/.exec(path);
  if (match && method === 'GET' && !match[2]) { json(response, 200, store.get(match[1])); return; }
  if (match && method === 'GET' && match[2] === 'ontology') {
    const graph = buildAnalysisOntology(store.get(match[1]));
    response.writeHead(200, { 'Content-Type': 'application/ld+json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="analysis-${match[1].slice(0, 8)}.jsonld"` });
    response.end(JSON.stringify(ontologyJSONLD(graph), null, 2)); return;
  }
  if (match && method === 'POST' && match[2] === 'reviews') {
    const input = await body(request);
    if (!input || typeof input !== 'object') throw new InputError('검토 내용을 확인해주세요.');
    json(response, 200, await store.review(match[1], input as ReviewInput)); return;
  }
  if (match && method === 'POST' && match[2] === 'revalidate') {
    const input = await body(request) as { expectedVersion?: number } | null;
    const stored = store.get(match[1]);
    if (!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion !== stored.version)
      throw new InputError('보고서 버전이 변경되었습니다. 다시 확인해주세요.', 409);
    if (!capabilities.available) throw new InputError(capabilities.message, 503);
    const run = await revalidateFramework(stored);
    json(response, 200, await store.replace(stored.id, stored.version, run)); return;
  }
  if (match && method === 'POST' && match[2] === 'approval') {
    const input = await body(request);
    if (!input || typeof input !== 'object') throw new InputError('승인 내용을 확인해주세요.');
    json(response, 200, await store.approve(match[1], input as Parameters<typeof approveReport>[1])); return;
  }
  if (match && method === 'GET' && match[2] === 'export') {
    const markdown = exportMarkdown(store.get(match[1]));
    response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="osint-report-${match[1].slice(0, 8)}.md"`, 'Cache-Control': 'no-store' });
    response.end(markdown); return;
  }
  throw new InputError('요청한 API를 찾을 수 없습니다.', 404);
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
};

const server = createServer(async (request, response) => {
  const began = performance.now();
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  try {
    const host = (request.headers.host ?? '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost') throw new InputError('로컬 호스트로 접속해주세요.', 403);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`)
        throw new InputError('다른 사이트에서 보낸 요청은 허용되지 않습니다.', 403);
    }
    if (url.pathname.startsWith('/api/')) { await api(request, response, url.pathname); return; }
    // Keep local project records out of the development file server.
    if (/onboarding-draft\.json|\/\.local\/|\/data\/|\/server\/|\/scripts\//.test(url.pathname)) {
      response.writeHead(404); response.end('Not found'); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new InputError('허용되지 않는 요청입니다.', 405);
    if (vite) { vite.middlewares(request, response); return; }
    const dist = resolve(root, 'dist');
    const file = url.pathname === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(dist + sep)) throw new InputError('파일을 찾을 수 없습니다.', 404);
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
    response.end(data);
  } catch (error) {
    const status = error instanceof InputError ? error.status : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    if (status === 500) console.error(error);
    json(response, status, { error: error instanceof InputError ? error.message : status === 404 ? '파일을 찾을 수 없습니다.' : '처리 중 오류가 발생했습니다. 다시 시도해주세요.' });
  } finally {
    if (url.pathname.startsWith('/api/')) console.log(`${request.method} ${url.pathname} ${response.statusCode} ${Math.round(performance.now() - began)}ms`);
  }
});
server.listen(port, '127.0.0.1', () => console.log(`FUSIONBRIEF local: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
  knowledge.close();
  await vite?.close();
  server.close(() => process.exit(0));
});
