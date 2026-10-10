import type { AnalysisRun, FrameworkPlan } from '../shared/types.ts';
import type { JsonModel } from './model.ts';
import { cursorModel } from './model.ts';
import { InputError } from './analysis.ts';
import { auditFramework, finalizeFramework, FRAMEWORK_INSTRUCTIONS, frameworkDraftSchema, sourceIntact, syncFrameworkAnswer } from './analysis-framework.ts';

export async function revalidateFramework(stored: AnalysisRun, model: JsonModel = cursorModel): Promise<AnalysisRun> {
  if (!stored.analysis) throw new InputError('기준별 분석이 있는 보고서만 재검증할 수 있습니다.');
  const run = structuredClone(stored);
  const f = run.analysis!;
  if (run.sources.some(s => !sourceIntact(s)) || f.criteria.some(c => c.basis.some(b => {
    const s = run.sources.find(s => s.id === b.sourceId);
    return !s || s.body.slice(b.start, b.end) !== b.quote;
  }))) throw new InputError('저장된 원문의 해시 또는 인용 위치가 변경되었습니다. 새 조사가 필요합니다.', 422);
  const plan: FrameworkPlan = { proposition: f.proposition, dimension: f.dimension, criteria: f.criteria, queries: [] };
  const draft = await model.generate(frameworkDraftSchema, FRAMEWORK_INSTRUCTIONS
    + 'Reassess the same proposition after analyst origin/independence reviews. The updated groups and confidence are authoritative inputs. '
    + 'Do not reuse an earlier judgment or promote confidence from document/language counts. Preserve unresolved critical gaps. '
    + 'Only use supplied already-verified claims and normative exact quotes.',
    { question: run.question, proposition: f.proposition, dimension: f.dimension, criteria: f.criteria, previousObservations: f.observations,
      period: run.dateRange, claims: run.claims, evidence: run.evidence, reviews: run.reviews });
  const audit = await auditFramework(model, run, f.criteria, draft);
  run.analysis = finalizeFramework(plan, f.criteria, draft, audit, run, f.sourcePolicies, f.rejected);
  syncFrameworkAnswer(run);
  run.version++; run.updatedAt = new Date().toISOString(); run.approval = undefined;
  return run;
}
