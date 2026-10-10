import { load } from 'cheerio';
import type { Dataset, CollectionResult, SourceDocument, Evidence } from '../shared/types.ts';

async function verifySource(source: SourceDocument, evidence: Evidence[]): Promise<CollectionResult> {
  const checkedAt = new Date().toISOString();
  if (source.format === 'pdf') return { sourceId: source.id, state: 'snapshot-only', checkedAt,
    message: 'PDF는 저장 발췌로 분석합니다. 이번 실행에서 원문을 다시 확인하지 않았습니다.' };
  try {
    // Only registered corpus URLs reach this function. Never fetch user-supplied URLs.
    const response = await fetch(source.url, { signal: AbortSignal.timeout(12000), redirect: 'error',
      headers: { 'User-Agent': 'EvidenceOSINTCopilot/0.1 (public-source-verification)' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') ?? '0') > 4_000_000) throw new Error('원문 크기 제한 초과');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('원문 본문 없음');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4_000_000) { await reader.cancel(); throw new Error('원문 크기 제한 초과'); }
      chunks.push(value);
    }
    const $ = load(Buffer.concat(chunks).toString('utf8'));
    $('script,style,noscript').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    if (!evidence.every(e => text.includes(e.quote)) || (source.provenanceQuote && !text.includes(source.provenanceQuote)))
      throw new Error('저장한 근거 문장 또는 출처 귀속 문구를 현재 원문에서 찾지 못함');
    return { sourceId: source.id, state: 'verified', checkedAt, message: '등록 원문에서 근거 발췌를 다시 확인했습니다.' };
  } catch (error) {
    const detail = error instanceof Error && /^HTTP|저장한|원문/.test(error.message) ? error.message : '시간 초과 또는 원문 접근 실패';
    return { sourceId: source.id, state: 'failed', checkedAt, message: detail };
  }
}

export async function collect(dataset: Dataset, start: string, end: string): Promise<CollectionResult[]> {
  const sources = dataset.sources.filter(s => s.publishedAt >= start && s.publishedAt <= end);
  // Separate adapters for official announcements, news, and archive reposts.
  const adapters = ['official', 'news', 'archive'] as const;
  const results = await Promise.all(adapters.map(async type => Promise.all(
    sources.filter(s => s.type === type).map(s => verifySource(s, dataset.evidence.filter(e => e.sourceId === s.id))),
  )));
  return results.flat();
}
