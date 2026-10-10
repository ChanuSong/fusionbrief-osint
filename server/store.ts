import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AnalysisRun, ReviewInput } from '../shared/types.ts';
import { applyReview, approveReport, InputError, upgradeRun } from './analysis.ts';
import type { CriterionKnowledge } from './criterion-knowledge.ts';
import { sourceIntact } from './analysis-framework.ts';

interface StoreData { schema: 1; runs: AnalysisRun[]; }

export async function openStore(path: string, knowledge?: Pick<CriterionKnowledge, 'get' | 'has'>) {
  let state: StoreData;
  try {
    state = JSON.parse(await readFile(path, 'utf8')) as StoreData;
    if (state.schema !== 1 || !Array.isArray(state.runs)) throw new Error('저장 데이터 형식이 맞지 않습니다.');
    state.runs = state.runs.map(run => {
      run.sources = run.sources.map(source => {
        if (source.bodyStorage !== 'criterion-knowledge') return source;
        const original = source.knowledge && knowledge?.get(source.knowledge.snapshotId);
        if (!original || original.hash !== source.hash || !sourceIntact(original))
          throw new Error('보고서가 참조하는 보존 기준 원문을 확인할 수 없습니다. 기준 지식 저장소를 함께 복원해주세요.');
        const { bodyStorage: _storage, ...metadata } = source;
        return { ...metadata, body: original.body };
      });
      return upgradeRun(run);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = { schema: 1, runs: [] };
  }
  let pending = Promise.resolve();
  async function transaction(change: (next: StoreData) => AnalysisRun): Promise<AnalysisRun> {
    const result = pending.then(async () => {
      const next = structuredClone(state);
      const run = change(next);
      await mkdir(dirname(path), { recursive: true });
      const persisted = knowledge ? { ...next, runs: next.runs.map(run => ({ ...run, sources: run.sources.map(source =>
        source.knowledge && knowledge.has(source.knowledge.snapshotId, source.hash)
          ? { ...source, body: '', bodyStorage: 'criterion-knowledge' as const } : source) })) } : next;
      await writeFile(`${path}.tmp`, JSON.stringify(persisted, null, 2));
      await rename(`${path}.tmp`, path);
      state = next;
      return structuredClone(run);
    });
    pending = result.then(() => undefined, () => undefined);
    return result;
  }
  return {
    list: () => structuredClone(state.runs.slice(0, 10)),
    get: (id: string) => {
      const run = state.runs.find(r => r.id === id);
      if (!run) throw new InputError('분석 기록을 찾을 수 없습니다.', 404);
      return structuredClone(run);
    },
    add: (run: AnalysisRun) => transaction(next => { next.runs.unshift(run); return run; }),
    replace: (id: string, expectedVersion: number, run: AnalysisRun) => transaction(next => {
      const index = next.runs.findIndex(r => r.id === id);
      if (index < 0) throw new InputError('분석 기록을 찾을 수 없습니다.', 404);
      if (next.runs[index].version !== expectedVersion) throw new InputError('재검증 중 보고서가 변경되었습니다. 다시 검증해주세요.', 409);
      if (run.id !== id || run.version !== expectedVersion + 1) throw new InputError('재검증 보고서 버전이 맞지 않습니다.', 409);
      next.runs[index] = run; return run;
    }),
    review: (id: string, input: ReviewInput) => transaction(next => {
      const index = next.runs.findIndex(r => r.id === id);
      if (index < 0) throw new InputError('분석 기록을 찾을 수 없습니다.', 404);
      const updated = applyReview(next.runs[index], input);
      next.runs[index] = updated;
      return updated;
    }),
    approve: (id: string, input: Parameters<typeof approveReport>[1]) => transaction(next => {
      const index = next.runs.findIndex(r => r.id === id);
      if (index < 0) throw new InputError('분석 기록을 찾을 수 없습니다.', 404);
      const run = approveReport(next.runs[index], input);
      next.runs[index] = run; return run;
    }),
  };
}
