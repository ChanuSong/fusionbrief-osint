import { writeFile } from 'node:fs/promises';
import { searchCursor } from '../server/cursor-search.ts';
import { mapConcurrent } from '../server/concurrency.ts';
import type { ResearchQuery } from '../shared/types.ts';

const queries: ResearchQuery[] = [
  { module: 'official', language: 'en', query: 'site:mod.go.jp Freedom Edge June 2024' },
  { module: 'news', language: 'ko', query: '프리덤 에지 2024 6월 27일 참가국' },
];
const began = performance.now();
const results = await mapConcurrent(queries, 4, async query => {
  const start = performance.now();
  try { const hits = await searchCursor(query); return { language: query.language, durationMs: Math.round(performance.now() - start), hits }; }
  catch (error) { return { language: query.language, durationMs: Math.round(performance.now() - start), error: String(error) }; }
});
const result = { at: new Date().toISOString(), totalMs: Math.round(performance.now() - began), results };
await writeFile('.local/search-speed-live.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ totalMs: result.totalMs, results: results.map(r => ({ language: r.language, durationMs: r.durationMs, hits: r.hits?.length, error: r.error })) }));
