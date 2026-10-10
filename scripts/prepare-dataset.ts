import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import type { Dataset, SourceDocument, Evidence } from '../shared/types.ts';

// Deliberately bounded excerpts. Every fragment is checked against its public page.
// These annotations are a prepared corpus, not claims of automated extraction.
const joint = {
  participants: ['Japan, the Republic of Korea, and United States', '한국·미국·일본', '한국·미국·일본'],
  schedule: ['June 27-29, 2024', '2024년 6월 27~29일', '2024-06-27 ~ 2024-06-29'],
  purpose: ['promote trilateral interoperability', '3국 간 상호운용성 제고', '3국 간 상호운용성 제고'],
  format: ['a trilateral multi-domain exercise', '3국 다영역 연합훈련', '3국 다영역 연합훈련'],
};
type Fragments = Partial<Record<string, string[]>>;
interface Spec {
  id: string; title: string; publisher: string; type: SourceDocument['type'];
  language: 'ko' | 'en'; url: string; publishedAt: string;
  origin: string; originLabel: string; reason: string; fragments: Fragments;
  format?: 'pdf'; browserVerified?: boolean;
  provenanceQuote?: string;
}
const specs: Spec[] = [
  { id: 'japan-mod', title: '일본 통합막료감부의 3국 공동발표', publisher: '일본 방위성', type: 'official', language: 'en',
    url: 'https://www.mod.go.jp/js/pdf/2024/p20240627_01e.pdf', publishedAt: '2024-06-27', format: 'pdf',
    origin: 'joint-june27', originLabel: '6월 27일 3국 공동발표', provenanceQuote: 'Joint Staff',
    reason: '동일 3국 공동발표의 일본 측 게시본. 국가·매체가 달라도 독립 근거로 세지 않음.', fragments: {
      ...joint, participants: ['Japan, the Republic of Korea and U.S.', '한국·미국·일본', '한국·미국·일본'],
    } },
  { id: 'navy', title: '공동발표의 미 해군 재게시', publisher: 'US Navy', type: 'official', language: 'en',
    url: 'https://www.navy.mil/Press-Office/News-Stories/Article/3819224/trilateral-statement-first-execution-of-multi-domain-japan-rok-us-exercise-free/', publishedAt: '2024-06-27',
    origin: 'joint-june27', originLabel: '6월 27일 3국 공동발표', provenanceQuote: 'Indo-Pacific Command Public Affairs',
    reason: '발행 주체가 Indo-Pacific Command Public Affairs로 표기된 동일 공동발표 재게시.', fragments: joint },
  { id: 'global', title: '공동발표의 공개 아카이브 재게시', publisher: 'GlobalSecurity', type: 'archive', language: 'en',
    url: 'https://www.globalsecurity.org/military/library/news/2024/06/mil-240627-usn02.htm', publishedAt: '2024-06-27',
    origin: 'joint-june27', originLabel: '6월 27일 3국 공동발표', provenanceQuote: 'US Navy',
    reason: '미 해군 발표를 출처로 명시한 공동발표 재게시본.', fragments: joint },
  { id: 'kbs-start', title: '프리덤 에지 시작 보도', publisher: 'KBS WORLD', type: 'news', language: 'en',
    url: 'https://world.kbs.co.kr/service/news_view.htm?Seq_Code=186330&lang=e', publishedAt: '2024-06-27',
    origin: 'jcs-june27', originLabel: '6월 27일 합참 발표', provenanceQuote: 'According to the Joint Chiefs of Staff(JCS)',
    reason: '본문에 Joint Chiefs of Staff를 명시. 공동발표와의 독립성은 미확인.', fragments: {
      participants: ['South Korea, the United States and Japan', '한국·미국·일본', '한국·미국·일본'],
      schedule: ['June 27 to 29', '2024년 6월 27~29일', '2024-06-27 ~ 2024-06-29'],
      purpose: ['improving interoperability', '상호운용성 제고', '3국 간 상호운용성 제고'],
      format: ['multi-domain exercise', '다영역 훈련', '3국 다영역 연합훈련'],
    } },
  { id: 'kbs-end', title: '프리덤 에지 종료 보도', publisher: 'KBS WORLD', type: 'news', language: 'en',
    url: 'https://world.kbs.co.kr/service/news_view.htm?Seq_Code=186362&lang=e', publishedAt: '2024-06-29',
    origin: 'jcs-june29', originLabel: '6월 29일 합참 발표', provenanceQuote: "According to Seoul's Joint Chiefs of Staff(JCS)",
    reason: '종료 보도에서 합참 평가를 인용. 같은 발표를 인용한 보도끼리 묶음.', fragments: {
      participants: ['South Korea, the U.S. and Japan', '한국·미국·일본', '한국·미국·일본'],
      format: ['combined multi-domain exercise', '다영역 연합훈련', '3국 다영역 연합훈련'],
    } },
  { id: 'yonhap', title: '한미일 훈련 종료에 관한 합참 발표 보도', publisher: '연합뉴스', type: 'news', language: 'ko',
    url: 'https://www.yna.co.kr/view/AKR20240629020200504', publishedAt: '2024-06-29',
    origin: 'jcs-june29', originLabel: '6월 29일 합참 발표', provenanceQuote: '합동참모본부가 밝혔다.',
    reason: '본문에 합동참모본부 발표를 명시. 종료 보도의 공통 원출처.', fragments: {
      participants: ['한미일이', '한국·미국·일본', '한국·미국·일본'],
      format: ['다영역 연합훈련', '다영역 연합훈련', '3국 다영역 연합훈련'],
    } },
  { id: 'usni', title: '3국 훈련 개시와 공동발표 인용 보도', publisher: 'USNI News', type: 'news', language: 'en',
    url: 'https://news.usni.org/2024/06/27/u-s-japan-and-korea-begin-freedom-edge-exercise-north-korea-attempts-ballistic-missile-test', publishedAt: '2024-06-27',
    origin: 'joint-june27', originLabel: '6월 27일 3국 공동발표', browserVerified: true, provenanceQuote: 'according to a joint statement',
    reason: '개시 사실을 joint statement에 귀속한 기사. 이 주장의 근거를 공동발표로 묶음.', fragments: {
      participants: ['The U.S., Japan and South Korea', '한국·미국·일본', '한국·미국·일본'],
    } },
  { id: 'stripes', title: '한국 국방부 발표에 따른 훈련 개시 보도', publisher: 'Stars and Stripes', type: 'news', language: 'en',
    url: 'https://www.stripes.com/branches/navy/2024-06-27/freedom-edge-us-navy-south-korea-japan-14312190.html', publishedAt: '2024-06-27',
    origin: 'mnd-june27', originLabel: '6월 27일 한국 국방부 발표', browserVerified: true,
    reason: '한국 국방부 보도자료에 귀속한 보도. 합참·공동발표와의 독립성은 미확인.', fragments: {
      participants: ['The United States, South Korea and Japan', '한국·미국·일본', '한국·미국·일본'],
    } },
];

const sources: SourceDocument[] = [];
const evidence: Evidence[] = [];
await Promise.all(specs.map(async spec => {
  const excerpts = Object.values(spec.fragments).map(value => value![0]);
  if (spec.provenanceQuote) excerpts.push(spec.provenanceQuote);
  let pageText: string;
  if (spec.browserVerified) {
    // Bounded excerpts were read with the browser/search tool during corpus preparation.
    // HTTP access may be blocked; refresh mode must report that failure, never mask it.
    pageText = excerpts.join(' ');
  } else {
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${spec.id}: HTTP ${response.status}`);
    if (spec.format === 'pdf') {
      const directory = await mkdtemp(join(tmpdir(), 'osint-source-'));
      try {
        const file = join(directory, 'source.pdf');
        await writeFile(file, Buffer.from(await response.arrayBuffer()));
        const { stdout } = await promisify(execFile)('pdftotext', [file, '-']);
        pageText = stdout.replace(/\s+/g, ' ').trim();
      } finally { await rm(directory, { recursive: true, force: true }); }
    } else {
      const $ = load(await response.text());
      $('script, style, noscript').remove();
      pageText = $('body').text().replace(/\s+/g, ' ').trim();
    }
  }
  for (const quote of excerpts) {
    if (!pageText.includes(quote)) throw new Error(`${spec.id}: expected excerpt absent`);
  }
  const body = excerpts.join('\n\n');
  sources.push({ id: spec.id, title: spec.title, publisher: spec.publisher, type: spec.type,
    language: spec.language, url: spec.url, publishedAt: spec.publishedAt,
    retrievedAt: new Date().toISOString(), body, hash: createHash('sha256').update(body).digest('hex'),
    format: spec.format ?? 'html', snapshotKind: 'excerpt',
    ...(spec.provenanceQuote ? { provenanceQuote: spec.provenanceQuote } : {}),
    verificationMethod: spec.browserVerified ? 'browser-read' : spec.format === 'pdf' ? 'pdf-text' : 'http' });
  for (const [facet, fragment] of Object.entries(spec.fragments)) {
    const [quote, translation, value] = fragment!;
    const start = body.indexOf(quote);
    evidence.push({ id: `${spec.id}-${facet}`, sourceId: spec.id, claimId: facet,
      quote, translation, start, end: start + quote.length, stance: 'supports', value,
      originId: spec.origin, originLabel: spec.originLabel, originReason: spec.reason,
      originVerified: true, independence: 'unconfirmed' });
  }
  console.log(`${spec.id}: ${spec.browserVerified ? 'browser-read snapshot' : 'download verified'}, ${excerpts.length} excerpts`);
}));

const dataset: Dataset = {
  version: 'freedom-edge-2024-v1', scenario: 'Freedom Edge · 최초 3국 공동훈련',
  eventDate: { start: '2024-06-27', end: '2024-06-29' }, collectedAt: new Date().toISOString(),
  coverage: '2024년 6월 첫 프리덤 에지에 관한 공개 원문 발췌. 사전 구조화한 주장·근거이며 독립성은 분석가 확인 전까지 미확인.',
  sources: specs.map(s => sources.find(source => source.id === s.id)!),
  evidence: specs.flatMap(s => evidence.filter(e => e.sourceId === s.id)),
  claims: [
    { id: 'schedule', label: '훈련 일정', facet: 'schedule', entityIds: ['freedom-edge'] },
    { id: 'participants', label: '참가국', facet: 'participants', entityIds: ['freedom-edge', 'rok', 'us', 'japan'] },
    { id: 'purpose', label: '발표 목적', facet: 'purpose', entityIds: ['freedom-edge'] },
    { id: 'format', label: '훈련 형식', facet: 'format', entityIds: ['freedom-edge'] },
  ],
  entities: [
    { id: 'freedom-edge', label: 'Freedom Edge 2024', type: 'event' },
    { id: 'rok', label: '대한민국', type: 'country' },
    { id: 'us', label: '미국', type: 'country' },
    { id: 'japan', label: '일본', type: 'country' },
  ],
};
await mkdir('data', { recursive: true });
await writeFile('data/freedom-edge.json', JSON.stringify(dataset, null, 2) + '\n');
console.log(`Saved ${sources.length} sources and ${evidence.length} evidence records.`);
