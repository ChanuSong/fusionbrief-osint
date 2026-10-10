import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnalysisRun } from '../shared/types.ts';
import type { DemoPackage, DemoScenario } from '../shared/demo.ts';
import { InputError, validEvidence, upgradeRun } from './analysis.ts';
import {buildAnalysisOntology} from '../shared/analysis-ontology.ts';
import {sourceIntact} from './analysis-framework.ts';

export function validateDemo(pack: DemoPackage): void {
  if (pack.schema !== 1 || !/^[a-z0-9-]+$/.test(pack.id) || !pack.title || !pack.preparedAt) throw new Error('시연 패키지 메타데이터 오류');
  const run = pack.run;
  if (!run?.sources?.length || !run.claims?.length || !run.answer?.paragraphs?.length) throw new Error('시연 보고서가 비어 있습니다.');
  const sources = new Map(run.sources.map(source => [source.id, source]));
  const evidence = new Set(run.evidence.map(item => item.id));
  const claims = new Set(run.claims.map(item => item.id));
  if (sources.size !== run.sources.length || evidence.size !== run.evidence.length || claims.size !== run.claims.length) throw new Error('시연 데이터 ID 중복');
  if(run.sources.some(s=>!sourceIntact(s)))throw new Error('시연 인용 검증 실패: 원문 해시 불일치');
  if(run.analysis && (run.analysis.verification!=='verified' || !buildAnalysisOntology(run).validation.conforms))throw new Error('시연 기준·근거 연결 검증 미완료');
  for (const item of run.evidence) {
    if (!claims.has(item.claimId) || !validEvidence(item, sources.get(item.sourceId)) || !item.translation.trim()) throw new Error(`시연 인용 검증 실패: ${item.id}`);
  }
  for (const claim of run.claims) {
    if (!claim.evidenceIds.length || claim.evidenceIds.some(id => !evidence.has(id))) throw new Error(`시연 판단의 근거 누락: ${claim.id}`);
  }
  for (const paragraph of run.answer.paragraphs) {
    if (!paragraph.claimIds.length || paragraph.claimIds.some(id => !claims.has(id))) throw new Error('시연 답변의 근거 누락');
  }
  for (const item of [...(run.events ?? []), ...(run.locations ?? []), ...(run.relations ?? [])]) {
    if (!item.evidenceIds.length || item.evidenceIds.some(id => !evidence.has(id))) throw new Error('시각화 근거 누락');
  }
  if (run.approval || run.reviews.length || run.approvals?.length) throw new Error('시연 원본은 검토 대기 상태여야 합니다.');
}
export function instantiateDemo(pack: DemoPackage): AnalysisRun {
  validateDemo(pack);
  const run = upgradeRun(structuredClone(pack.run));
  const now = new Date().toISOString();
  run.demo = { scenarioId: pack.id, title: pack.title, preparedAt: pack.preparedAt,
    originalRunId: pack.run.id, originalDurationMs: pack.run.durationMs, loadedAt: now };
  run.id = randomUUID(); run.version = 1; run.createdAt = now; run.updatedAt = now;
  run.reviews = []; run.approvals = []; run.approval = undefined;
  return run;
}
export async function loadDemoCatalog(directory: string) {
  const packs = new Map<string, DemoPackage>();
  const errors: string[] = [];
  let files: string[] = [];
  try { files = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  for (const file of files.filter(name => name.endsWith('.json')).sort()) {
    try {
      const pack = JSON.parse(await readFile(join(directory, file), 'utf8')) as DemoPackage;
      validateDemo(pack);
      if (packs.has(pack.id)) throw new Error('중복 시연 ID');
      packs.set(pack.id, pack);
    } catch (error) { errors.push(`${file}: ${error instanceof Error ? error.message : '읽기 실패'}`); }
  }
  return {
    errors,
    list(): DemoScenario[] { return [...packs.values()].sort((a, b) => Number(b.main) - Number(a.main)).map(pack => ({
      id: pack.id, title: pack.title, subtitle: pack.subtitle, question: pack.run.question, preparedAt: pack.preparedAt,
      dateRange: pack.run.dateRange, documents: pack.run.sources.length, citations: pack.run.evidence.length, claims: pack.run.claims.length,
      languages: [...new Set(pack.run.evidence.map(item => pack.run.sources.find(source => source.id === item.sourceId)!.language))], originalDurationMs: pack.run.durationMs, main: pack.main,
    })); },
    start(id: string) { const pack = packs.get(id); if (!pack) throw new InputError('준비된 시연을 찾을 수 없습니다.', 404); return instantiateDemo(pack); },
  };
}
