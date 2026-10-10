import { createHash } from 'node:crypto';
import type { AnalysisRun, SourceDocument, Evidence, AnalyzedClaim } from '../../shared/types.ts';
import { createWisdomGraph } from '../../server/wisdom.ts';

/** Synthetic fixture, never served as a current event or installed in the user's report store. */
export function wisdomFixture(): AnalysisRun {
  const sources: SourceDocument[] = ['Channel Alpha explicitly cites Bulletin Beta.', 'Bulletin Beta explicitly cites Statement Gamma.'].map((body, i) => ({
    id: `source-${i}`, title: `검증용 가상 자료 ${i + 1}`, publisher: `fixture${i}.example`, type: 'news', language: 'en',
    url: `https://fixture${i}.example/article`, publishedAt: '2026-10-09', retrievedAt: '2026-10-10T00:00:00Z',
    body, hash: createHash('sha256').update(body).digest('hex'), format: 'html', snapshotKind: 'document', verificationMethod: 'http',
  }));
  const evidence: Evidence[] = sources.map((s, i) => ({ id: `e${i}`, sourceId: s.id, claimId: `c${i}`, quote: s.body,
    translation: s.body, start: 0, end: s.body.length, stance: 'supports', value: s.body,
    originId: `origin-${i}`, originLabel: s.publisher, originReason: '가상 검증 자료', originVerified: true, independence: 'unconfirmed' }));
  const claims: AnalyzedClaim[] = evidence.map((e, i) => ({ id: e.claimId, label: `인용 연결 ${i + 1}`, facet: 'analysis',
    entityIds: i === 0 ? ['a', 'b'] : ['b', 'c'], statement: e.quote, status: 'single-origin', reason: '가상 검증 자료',
    evidenceIds: [e.id], groups: [{ id: e.originId, label: e.originLabel, evidenceIds: [e.id], originVerified: true, independence: 'unconfirmed', reason: '검증용' }],
    documentCount: 1, independentCount: 0, confidence: { level: 'low', reason: '독립성 미확인' } }));
  const run: AnalysisRun = { id: '10000000-0000-0000-0000-000000000001', version: 1, question: '검증용 가상 자료의 인용 경로를 연결해줘.',
    mode: 'live', dateRange: { start: '', end: '' }, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    durationMs: 1, datasetVersion: 'test-only', collectedAt: '2026-10-10T00:00:00Z', coverage: '검증용 합성 자료', facets: ['analysis'],
    summary: { headline: '가상 자료', findings: [], assessment: '' }, citationCheck: { checked: 2, passed: 2, rejected: 0 },
    sources, evidence, claims, entities: [{ id: 'a', label: 'Channel Alpha', type: 'account' },
      { id: 'b', label: 'Bulletin Beta', type: 'website' }, { id: 'c', label: 'Statement Gamma', type: 'event' }],
    gaps: [], scope: 'supported', collections: [], reviews: [], stats: { documents: 2, claims: 2, groups: 2, independent: 0, citations: 2 }, stages: [],
    answer: { intent: 'brief', paragraphs: claims.map(c => ({ text: c.statement, claimIds: [c.id], kind: 'fact' })), unanswered: [] },
    relations: [{ from: 'a', to: 'b', label: '인용한다', predicate: 'cites', evidenceIds: ['e0'] },
      { from: 'b', to: 'c', label: '인용한다', predicate: 'cites', evidenceIds: ['e1'] }],
  };
  run.wisdom = createWisdomGraph(run);
  return run;
}
