import { readFile } from 'node:fs/promises';
import type { Dataset } from '../shared/types.ts';
import { collect } from '../server/collector.ts';
import { validEvidence } from '../server/analysis.ts';

const dataset = JSON.parse(await readFile(new URL('../data/freedom-edge.json', import.meta.url), 'utf8')) as Dataset;
for (const evidence of dataset.evidence) {
  if (!validEvidence(evidence, dataset.sources.find(s => s.id === evidence.sourceId))) throw new Error(`Invalid citation: ${evidence.id}`);
}
console.log(`Snapshot: ${dataset.sources.length} documents, ${dataset.evidence.length} citations validated.`);
const results = await collect(dataset, dataset.eventDate.start, dataset.eventDate.end);
for (const r of results) console.log(`${r.sourceId}: ${r.state} — ${r.message}`);
console.log('Live failures are excluded in refresh mode; stored excerpts remain available in snapshot mode.');
