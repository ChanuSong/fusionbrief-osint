import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CriterionBasis, SourceDocument } from '../shared/types.ts';
import { cjkSearchTokens, expandKnowledgeQueries } from '../shared/research-vocabulary.ts';

type Authority = CriterionBasis['authority'];
// Operational defaults, not legal validity periods. Originals have no deletion TTL.
export const KNOWLEDGE_POLICY: Record<Authority, number> = {
  treaty: 365, doctrine: 90, 'expert-manual': 180, 'official-policy': 14, research: 180, precedent: 90,
};
const stableAuthorities = new Set<Authority>(['treaty', 'doctrine', 'expert-manual', 'official-policy', 'research']);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (source: SourceDocument) => source.canonicalURL || source.url;
type Row = { id: string; source: string; archived_at: string; checked_at: string; authorities: string; editions: string };
export interface KnowledgeHit { source: SourceDocument; excerpts: { start: number; end: number; text: string; locator: string }[]; }
export interface CriterionKnowledge {
  search(queries: string[], urls?: string[], limit?: number): KnowledgeHit[];
  preserve(source: SourceDocument, basis: CriterionBasis[], tags: string[]): SourceDocument | undefined;
  catalog(): { policy: typeof KNOWLEDGE_POLICY; documents: Omit<SourceDocument, 'body' | 'links' | 'provenanceQuote'>[] };
  get(snapshotId: string): SourceDocument | undefined;
  has(snapshotId: string, hash: string): boolean;
  close(): void;
}

/** Immutable source snapshots + exact clause offsets + independently checked
 * authority/edition metadata. Retrieval never establishes current applicability. */
export async function openCriterionKnowledge(path: string, clock = () => new Date()): Promise<CriterionKnowledge> {
  if (path !== ':memory:') await mkdir(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL, hash TEXT NOT NULL, source TEXT NOT NULL,
      archived_at TEXT NOT NULL, checked_at TEXT NOT NULL, authorities TEXT NOT NULL, editions TEXT NOT NULL,
      UNIQUE(canonical_url, hash));
    CREATE TABLE IF NOT EXISTS clauses (
      id INTEGER PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(id), start INTEGER NOT NULL,
      end INTEGER NOT NULL, text TEXT NOT NULL, locator TEXT NOT NULL, tags TEXT NOT NULL,
      UNIQUE(snapshot_id, start, end));
    CREATE VIRTUAL TABLE IF NOT EXISTS clause_search USING fts5(text, locator, tags, snapshot_id UNINDEXED,
      content='clauses', content_rowid='id', tokenize='unicode61');
    CREATE TRIGGER IF NOT EXISTS clause_insert AFTER INSERT ON clauses BEGIN
      INSERT INTO clause_search(rowid,text,locator,tags,snapshot_id) VALUES(new.id,new.text,new.locator,new.tags,new.snapshot_id);
    END;
    CREATE TRIGGER IF NOT EXISTS clause_update AFTER UPDATE ON clauses BEGIN
      INSERT INTO clause_search(clause_search,rowid,text,locator,tags,snapshot_id) VALUES('delete',old.id,old.text,old.locator,old.tags,old.snapshot_id);
      INSERT INTO clause_search(rowid,text,locator,tags,snapshot_id) VALUES(new.id,new.text,new.locator,new.tags,new.snapshot_id);
    END;`);
  const select = db.prepare('SELECT * FROM snapshots WHERE id=?');
  const materialize = (row: Row): SourceDocument => {
    const source = JSON.parse(row.source) as SourceDocument;
    const authorities = JSON.parse(row.authorities) as Authority[];
    const days = Math.min(...authorities.map(a => KNOWLEDGE_POLICY[a]));
    const refreshDueAt = new Date(Date.parse(row.checked_at) + days * 86400000).toISOString();
    return { ...source, knowledge: { snapshotId: row.id, archivedAt: row.archived_at, lastCheckedAt: row.checked_at, refreshDueAt,
      refreshState: Date.parse(refreshDueAt) > clock().getTime() ? 'fresh' : 'stale', reuse: 'reused', authorities,
      editions: JSON.parse(row.editions) as string[] } };
  };
  const clausesFor = (id: string) => db.prepare('SELECT start,end,text,locator FROM clauses WHERE snapshot_id=? ORDER BY start LIMIT 12').all(id) as KnowledgeHit['excerpts'];
  return {
    preserve(source, basis, tags) {
      const usable = basis.filter(b => b.verified && stableAuthorities.has(b.authority) && b.sourceId === source.id
        && source.body.slice(b.start, b.end) === b.quote && b.quote.length >= 12);
      if (!usable.length || source.hash !== sha(source.body) || !Number.isFinite(Date.parse(source.retrievedAt))) return undefined;
      const id = `norm-${sha(`${canonical(source)}\n${source.hash}`).slice(0, 32)}`;
      const old = select.get(id) as Row | undefined;
      const checkedAt = source.knowledge?.lastCheckedAt ?? source.retrievedAt;
      const authorities = [...new Set([...(old ? JSON.parse(old.authorities) as Authority[] : []), ...usable.map(b => b.authority)])];
      const editions = [...new Set([...(old ? JSON.parse(old.editions) as string[] : []), ...usable.filter(b => b.versionStatus === 'verified' && b.version).map(b => b.version)])];
      const { knowledge: _knowledge, ...snapshot } = source;
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!old) db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?,?,?,?)').run(id, canonical(source), source.hash,
          JSON.stringify(snapshot), clock().toISOString(), checkedAt, JSON.stringify(authorities), JSON.stringify(editions));
        else db.prepare('UPDATE snapshots SET checked_at=?, authorities=?, editions=? WHERE id=?')
          .run(checkedAt > old.checked_at ? checkedAt : old.checked_at, JSON.stringify(authorities), JSON.stringify(editions), id);
        const insert = db.prepare(`INSERT INTO clauses(snapshot_id,start,end,text,locator,tags) VALUES(?,?,?,?,?,?)
          ON CONFLICT(snapshot_id,start,end) DO UPDATE SET tags=excluded.tags, locator=excluded.locator`);
        const catalogTags = [source.title, ...tags, ...usable.map(b => b.locator)].join(' ').slice(0, 6000);
        // Index the complete manual, retaining offsets, so clauses discovered in a
        // later question are searchable even when they were not previously cited.
        if (!old) for (let start = 0; start < source.body.length; start += 900) {
          const end = Math.min(start + 1100, source.body.length); const text = source.body.slice(start, end);
          if (/\.{5,}/.test(text)) continue;
          insert.run(id, start, end, text, '', [source.title, ...cjkSearchTokens(text)].join(' '));
        }
        for (const b of usable) insert.run(id, b.start, b.end, b.quote, b.locator, [catalogTags, ...cjkSearchTokens(b.quote)].join(' '));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      const archived = materialize(select.get(id) as Row);
      // This run keeps its own source ID/retrieval time; its citations remain bound
      // to its exact original. The archive's original snapshot never changes.
      return { ...source, knowledge: { ...archived.knowledge!, reuse: source.knowledge?.reuse ?? 'collected',
        refreshState: source.knowledge?.refreshState === 'refresh-failed' ? 'refresh-failed' : archived.knowledge!.refreshState } };
    },
    search(queries, urls = [], limit = 8) {
      const selected = new Map<string, KnowledgeHit>();
      const add = (row: Row, excerpt?: KnowledgeHit['excerpts'][number]) => {
        const existing = selected.get(row.id);
        if (existing) { if (excerpt && existing.excerpts.length < 8) existing.excerpts.push(excerpt); return; }
        if (selected.size >= limit) return;
        selected.set(row.id, { source: materialize(row), excerpts: excerpt ? [excerpt] : clausesFor(row.id) });
      };
      for (const url of urls) for (const row of db.prepare('SELECT * FROM snapshots WHERE canonical_url=? OR json_extract(source,\'$.url\')=? ORDER BY checked_at DESC,archived_at DESC LIMIT ?').all(url, url, limit) as Row[]) add(row);
      // Quote every token: neither user text nor planner output can become FTS SQL syntax.
      const expanded = expandKnowledgeQueries(queries);
      const terms = [...new Set([...(expanded.join(' ').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.\-]{1,50}/gu) ?? []),
        ...cjkSearchTokens(expanded.join(' '))])].slice(0, 72);
      if (terms.length) {
        const match = terms.map(t => `"${t.replaceAll('"', '""')}"`).join(' OR ');
        const hits = db.prepare(`SELECT c.snapshot_id,c.start,c.end,c.text,c.locator FROM clause_search f
          JOIN clauses c ON c.id=f.rowid JOIN snapshots s ON s.id=c.snapshot_id
          WHERE clause_search MATCH ? ORDER BY bm25(clause_search,1,6,0.3),s.checked_at DESC LIMIT 120`).all(match) as ({ snapshot_id: string } & KnowledgeHit['excerpts'][number])[];
        for (const hit of hits) {
          const excerpt = { start: hit.start, end: hit.end, text: hit.text, locator: hit.locator };
          const existing = selected.get(hit.snapshot_id);
          if (existing) { if (existing.excerpts.length < 8) existing.excerpts.push(excerpt); }
          else if (selected.size < limit) add(select.get(hit.snapshot_id) as Row, excerpt);
        }
      }
      return [...selected.values()];
    },
    catalog() {
      const documents = (db.prepare(`SELECT id,archived_at,checked_at,authorities,editions,
        json_remove(source,'$.body','$.links','$.provenanceQuote') AS source FROM snapshots ORDER BY archived_at DESC LIMIT 200`).all() as Row[]).map(row => {
        const { body: _body, links: _links, provenanceQuote: _provenance, ...document } = materialize(row); return document;
      });
      return { policy: { ...KNOWLEDGE_POLICY }, documents };
    },
    get(id) { const row = select.get(id) as Row | undefined; return row ? materialize(row) : undefined; },
    has(id, hash) { return !!db.prepare('SELECT id FROM snapshots WHERE id=? AND hash=?').get(id, hash); },
    close() { db.close(); },
  };
}
