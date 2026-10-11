/** Editorial search aliases, never an equivalence between actors' legal definitions.
 * Retrieved documents still require fresh definition/scope/quotation audits. */
export const RESEARCH_CONCEPTS = [
  { id: 'urn:fusionbrief:concept:blockade', labels: ['봉쇄', 'blockade', '封锁', '封鎖'] },
  { id: 'urn:fusionbrief:concept:armed-conflict', labels: ['무력충돌', '무력 충돌', 'armed conflict', '武装冲突', '武裝衝突'] },
  { id: 'urn:fusionbrief:concept:transit-passage', labels: ['통과통항', '통과 통항', 'transit passage', '过境通行', '過境通行'] },
  { id: 'urn:fusionbrief:concept:visit-and-search', labels: ['임검', 'visit and search', '登临检查', '登臨檢查'] },
] as const;
export function expandKnowledgeQueries(queries: string[]): string[] {
  const text = queries.join(' ').normalize('NFKC').toLowerCase();
  return [...queries, ...RESEARCH_CONCEPTS.filter(c => c.labels.some(l => text.includes(l))).flatMap(c => [...c.labels])];
}
/** Preserve original text; add search tokens for scripts which have no reliable
 * whitespace boundaries, without changing quotes or assuming word meanings. */
export function cjkSearchTokens(text: string): string[] {
  const words = text.normalize('NFKC').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? [];
  return [...new Set(words.flatMap(word => { const characters = [...word];
    return characters.flatMap((_, i) => characters.length - i >= 2 ? [characters.slice(i, i + 2).join('')] : []);
  }))];
}
