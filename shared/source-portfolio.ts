import type { AnalysisRun, SourceDocument } from './types.ts';
import { MODULE_IDS } from './source-modules.ts';
export function sourcePortfolio(run: AnalysisRun) {
  return MODULE_IDS.map(module => {
    const queries = run.research?.searches?.filter(s => s.query.module === module) ?? [];
    const urls = new Set(queries.flatMap(q => q.hits.map(h => h.url)));
    const belongs = (s: SourceDocument) => s.collectedVia?.includes(module) || urls.has(s.url) || !!s.canonicalURL && urls.has(s.canonicalURL)
      || module === 'official' && s.type === 'official' || module === 'papers' && s.type === 'paper'
      || module === 'state-media' && s.attribution?.control === 'dprk-state'
      || module === 'images' && !!s.media?.some(m => m.kind === 'image' || m.kind === 'video')
      || module === 'satellite' && s.medium === 'satellite' || module === 'patents' && s.medium === 'patent'
      || module === 'social' && s.medium === 'social';
    const documents = run.sources.filter(belongs);
    const used = documents.filter(s => run.evidence.some(e => e.sourceId === s.id) || run.analysis?.criteria.some(c => c.basis.some(b => b.sourceId === s.id && b.verified)));
    const simulated = run.simulatedFeeds?.filter(f => f.module === module) ?? [];
    return { module, queries, documents, used, simulated, reason: run.research?.strategy?.sourcePlan?.find(p => p.module === module)?.reason };
  });
}
