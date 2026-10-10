import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import type { ResearchQuery, SourceDocument, SourceLanguage } from '../shared/types.ts';
import { publicAddress, publicURL } from './public-url.ts';
import { searchCursor } from './cursor-search.ts';
import { DPRK_MEDIA, dprkAttribution, isDprkHost } from './dprk-media.ts';
import { readSatelliteRecord, searchSatellite } from './satellite-sources.ts';
import { preserveMedia } from './media-cache.ts';
export { publicAddress, publicURL } from './public-url.ts';

export interface SearchHit { url: string; title: string; module: ResearchQuery['module']; language: SourceLanguage; }
export interface PublicResponse { body: Buffer; url: string; contentType: string; }
const execute = promisify(execFile);
/** Parse a dedicated publication metadata element, never an arbitrary event date in prose. */
export function metadataDate(value: string): string {
  const text = value.normalize('NFKC').trim();
  const numeric = /^(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:$|[T\s.])/.exec(text);
  const english = /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})$/i.exec(text);
  let date = '';
  if (numeric) date = `${numeric[1]}-${numeric[2].padStart(2, '0')}-${numeric[3].padStart(2, '0')}`;
  if (english) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(english[2].toLowerCase()) + 1;
    date = `${english[3]}-${String(month).padStart(2, '0')}-${english[1].padStart(2, '0')}`;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  return date && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

export function publicationDate(text: string, announcementHeader = false): string {
  const normalized = text.normalize('NFKC');
  const era = announcementHeader ? /令和\s*(\d+)年\s*(\d+)月\s*(\d+)日/.exec(normalized) : null;
  if (era) return `${2018 + Number(era[1])}-${era[2].padStart(2, '0')}-${era[3].padStart(2, '0')}`;
  const numeric = /(?:등록일|发布(?:时间|日期)|发布时间|Published|Дата публикации)\s*[:：]?\s*(20\d{2})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/i.exec(normalized);
  if (numeric) {
    const date = `${numeric[1]}-${numeric[2].padStart(2, '0')}-${numeric[3].padStart(2, '0')}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date;
  }
  if (!announcementHeader) return '';
  const english = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})/i.exec(text);
  if (!english) return '';
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(english[1].toLowerCase());
  return new Date(Date.UTC(Number(english[3]), month, Number(english[2]))).toISOString().slice(0, 10);
}

export function detectLanguage(text: string): SourceLanguage {
  const count = (pattern: RegExp) => (text.match(pattern) ?? []).length;
  const ko = count(/[\uac00-\ud7af]/g), kana = count(/[\u3040-\u30ff]/g), han = count(/[\u4e00-\u9fff]/g);
  const ru = count(/[\u0400-\u04ff]/g), latin = count(/[a-zA-Z]/g);
  if (ko > 30 && ko > kana && ko > ru) return 'ko';
  if (kana > 15) return 'ja';
  if (han > 30 && han > latin / 3) return 'zh';
  if (ru > 30 && ru > latin / 2) return 'ru';
  return latin > 80 ? 'en' : 'other';
}

/** Resolve and pin the address for every redirect; model-supplied URLs cannot reach private services. */
export async function publicFetch(value: string, headers: Record<string, string> = {}, redirects = 0): Promise<PublicResponse> {
  const url = publicURL(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('공개 네트워크 주소가 아닙니다.');
  const target = addresses.find(a => a.family === 4) ?? addresses[0];
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      agent: false, family: target.family, signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'TRACE-OSINT/0.2 (public-source-reader)', ...headers },
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, response => {
      const code = response.statusCode ?? 500;
      if ([301, 302, 303, 307, 308].includes(code) && response.headers.location) {
        response.resume();
        if (redirects >= 3) { reject(new Error('리다이렉트 제한 초과')); return; }
        const next = new URL(response.headers.location, url);
        publicFetch(next.href, next.origin === url.origin ? headers : {}, redirects + 1).then(resolve, reject);
        return;
      }
      if (code < 200 || code >= 300) { response.resume(); reject(new Error(`HTTP ${code}`)); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8_000_000) { request.destroy(new Error('문서 크기 제한 초과')); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on('error', reject);
      response.on('end', () => resolve({ body: Buffer.concat(chunks), url: url.href,
        contentType: response.headers['content-type'] ?? '' }));
    });
    request.setTimeout(15000, () => request.destroy(new Error('공개 원문 응답 시간 초과')));
    request.on('error', reject);
    request.end();
  });
}

const OFFICIAL_DOMAINS = 'site:mod.go.jp OR site:mnd.go.kr OR site:navy.mil OR site:mil.cn OR site:gov.cn OR site:mid.ru OR site:go.kr OR site:gov.tw OR site:gov.ph';

async function searchResponse(url: string, provider: string, headers: Record<string, string> = {}): Promise<PublicResponse> {
  try { return await publicFetch(url, headers); }
  catch (error) {
    const message = error instanceof Error ? error.message : '검색 연결 오류';
    if (message === 'HTTP 429') throw new Error(`${provider} · 요청 제한(HTTP 429)`);
    if (message === 'HTTP 403') throw new Error(`${provider} · 접근 거부(HTTP 403)`);
    if (/초과|timeout|aborted/i.test(message)) throw new Error(`${provider} · 검색 응답 시간 초과`);
    throw new Error(`${provider} · ${message.slice(0, 200)}`);
  }
}

export function parseDuckDuckGoResults(html: string, query: ResearchQuery): SearchHit[] {
  const $ = load(html);
  if ($('#challenge-form, form[action*="anomaly.js"], .anomaly-modal').length)
    throw new Error('DuckDuckGo · 자동 검색 차단: 사람 인증(CAPTCHA) 필요');
  const hits: SearchHit[] = [];
  $('a.result__a').slice(0, 5).each((_index, node) => {
    try {
      const link = new URL($(node).attr('href') ?? '', 'https://html.duckduckgo.com/html/');
      const target = link.searchParams.get('uddg') ?? link.href;
      hits.push({ url: publicURL(target).href, title: $(node).text().trim(), module: query.module, language: query.language });
    } catch { /* skip unsafe or malformed links */ }
  });
  if (hits.length || $('.no-results, .result--no-result, .no-results__message').length) return hits;
  throw new Error('DuckDuckGo · 검색 결과를 읽지 못했습니다: 응답 형식 확인 필요');
}

export async function searchPublic(query: ResearchQuery): Promise<SearchHit[]> {
  publicSearchLabel(query);
  if (query.module === 'satellite') return searchSatellite(query);
  const scope = query.module === 'state-media' ? `(site:kcnawatch.org OR site:koreanewsservice.com OR site:regimewatch.com OR ${[...new Set(DPRK_MEDIA.flatMap(outlet=>outlet.domains))].map(domain=>`site:${domain}`).join(' OR ')})`
    : query.module === 'patents' ? '(site:patents.google.com OR site:patentscope.wipo.int OR site:worldwide.espacenet.com OR site:uspto.gov OR site:kipris.or.kr)'
      : query.module === 'aviation' ? '(ADS-B OR OpenSky OR FlightRadar24 OR flight track OR 항적)'
        : query.module === 'maritime' ? '(AIS OR IMO OR vessel track OR port OR 항적 OR 선박)'
          : query.module === 'social' ? '(site:x.com OR site:bsky.app OR site:reddit.com OR site:t.me OR site:youtube.com)' : '';
  const scoped = { ...query, query: scope ? `${query.query} ${scope}` : query.query };
  if (query.module !== 'papers' && (process.env.TRACE_SEARCH_PROVIDER ?? 'cursor') === 'cursor') return searchCursor(scoped);
  const officialDomains = query.purpose === 'framework' ? `${OFFICIAL_DOMAINS} OR site:un.org OR site:icj-cij.org OR site:icrc.org` : OFFICIAL_DOMAINS;
  const searchQuery = query.module === 'official' ? `${query.query} (${officialDomains})` : scoped.query;
  if (query.module === 'papers') {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query', query.query); url.searchParams.set('rows', '3');
    const data = JSON.parse((await searchResponse(url.href, 'Crossref')).body.toString()) as { message: { items: { DOI: string; title?: string[] }[] } };
    return data.message.items.map(item => ({ url: `https://api.crossref.org/works/${encodeURIComponent(item.DOI)}`,
      title: item.title?.[0] ?? item.DOI, module: query.module, language: query.language }));
  }
  if (process.env.TRACE_SEARCH_PROVIDER === 'brave') {
    if (!process.env.BRAVE_SEARCH_API_KEY) throw new Error('Brave Search · API 키 설정 없음');
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', searchQuery); url.searchParams.set('count', '5');
    const response = await searchResponse(url.href, 'Brave Search', { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY });
    const data = JSON.parse(response.body.toString()) as { web?: { results?: { url: string; title: string }[] } };
    return (data.web?.results ?? []).map(item => ({ ...item, module: query.module, language: query.language }));
  }
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', searchQuery);
  const response = await searchResponse(url.href, 'DuckDuckGo');
  return parseDuckDuckGoResults(response.body.toString(), query);
}

export function publicSearchLabel(query: ResearchQuery): string {
  if (query.module === 'satellite') return 'Earth Search · Sentinel-2 STAC';
  if (query.module === 'papers') return 'Crossref';
  const provider = process.env.TRACE_SEARCH_PROVIDER ?? 'cursor';
  if (provider === 'cursor') return 'Cursor WebSearch';
  if (provider === 'brave') return 'Brave Search';
  if (provider === 'duckduckgo') return 'DuckDuckGo';
  throw new Error('검색 제공자 설정은 cursor, brave, duckduckgo 중 하나여야 합니다.');
}

function officialHost(host: string): boolean {
  return /\.(?:gov|mil|go\.jp|go\.kr|gov\.cn|gov\.tw|gov\.ph|gov\.ru)$/.test(host)
    || /^(?:mod\.go\.jp|mnd\.go\.kr|mid\.ru)$/.test(host)
    || /(?:^|\.)(?:un\.org|icj-cij\.org|icrc\.org)$/.test(host);
}

function languageOf(value: string | undefined, fallback: SourceLanguage): SourceLanguage {
  const code = value?.toLowerCase().slice(0, 2);
  return code && ['ko', 'en', 'zh', 'ja', 'ru'].includes(code) ? code as SourceLanguage : fallback;
}

export async function readPublicDocument(hit: SearchHit): Promise<SourceDocument> {
  const response = await publicFetch(hit.url);
  if (new URL(response.url).hostname === 'earth-search.aws.element84.com' && response.contentType.includes('json')) {
    const source=readSatelliteRecord(response.body.toString(),response.url); await preserveMedia(source.media ?? []); return source;
  }
  const retrievedAt = new Date().toISOString();
  const url = new URL(response.url);
  let body: string;
  let title = hit.title;
  let publishedAt = '';
  let language = hit.language;
  let links: string[] = [];
  let canonicalURL: string | undefined;
  let attribution: SourceDocument['attribution'];
  let media: SourceDocument['media'];
  let format: SourceDocument['format'] = 'html';
  if (response.contentType.includes('pdf') || response.body.subarray(0, 5).toString() === '%PDF-') {
    const directory = await mkdtemp(join(tmpdir(), 'trace-pdf-'));
    try {
      const file = join(directory, 'document.pdf');
      await writeFile(file, response.body);
      const [textResult, metadataResult] = await Promise.allSettled([
        execute('pdftotext', [file, '-'], { timeout: 15000, maxBuffer: 2_000_000 }),
        execute('pdfinfo', [file], { timeout: 15000, maxBuffer: 20000 }),
      ]);
      if (textResult.status === 'rejected') throw textResult.reason;
      body = textResult.value.stdout; format = 'pdf';
      const firstLine=body.split('\n').map(line=>line.trim()).find(line=>line.length>=8 && line.length<150 && !/^(?:UNCLASSIFIED|[0-9 .|]+)$/.test(line));
      if (firstLine && title===hit.title) title=firstLine;
      if (metadataResult.status === 'fulfilled') {
        const originalTitle = /^Title:\s+(.+)$/m.exec(metadataResult.value.stdout)?.[1].trim();
        if (originalTitle) title = originalTitle;
      }
      // Only a date in the announcement header can be used as PDF publication metadata.
      publishedAt = publicationDate(body.slice(0, 250), true);
      const koreanHeaderDate=/\b(20\d{2}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s*\|/.exec(body.slice(0,350))?.[1];
      if (koreanHeaderDate) publishedAt ||= metadataDate(koreanHeaderDate);
    } finally { await rm(directory, { recursive: true, force: true }); }
  } else if (url.hostname === 'api.crossref.org') {
    const record = JSON.parse(response.body.toString()) as { message: { title?: string[]; abstract?: string; published?: { 'date-parts': number[][] } } };
    const item = record.message;
    title = item.title?.[0] ?? title;
    if (!item.abstract) throw new Error('논문 초록 공개 안 됨. 제목만으로 근거를 만들지 않았습니다.');
    body = load(item.abstract).text(); format = 'api';
    const date = item.published?.['date-parts']?.[0];
    if (date?.length === 3) publishedAt = date.map((n, i) => i ? String(n).padStart(2, '0') : String(n)).join('-');
  } else {
    if (!/html|text|xml/.test(response.contentType)) throw new Error('지원하지 않는 공개 문서 형식');
    const charset = /charset=([\w-]+)/i.exec(response.contentType)?.[1] ?? 'utf-8';
    const html = new TextDecoder(charset).decode(response.body);
    const $ = load(html);
    attribution = dprkAttribution(html,response.url);
    title = $('meta[property="og:title"]').attr('content') ?? $('title').first().text().trim() ?? title;
    language = languageOf($('html').attr('lang'), language);
    const date = $('meta[property="article:published_time"],meta[name="pubdate"],meta[name="date"],meta[name="DC.date.issued"]').first().attr('content');
    if (date) publishedAt = metadataDate(date);
    for (const node of $('script[type="application/ld+json"]').toArray()) try {
      const raw=JSON.parse($(node).text()); const entries=Array.isArray(raw) ? raw : Array.isArray(raw['@graph']) ? raw['@graph'] : [raw];
      const record=entries.find((item:Record<string,unknown>)=>['NewsArticle','Article','ScholarlyArticle'].includes(String(item['@type']))
        && typeof item.headline==='string' && title.includes(item.headline));
      if (record?.datePublished) publishedAt ||= metadataDate(String(record.datePublished));
    } catch { /* malformed structured metadata cannot establish a publication date */ }
    publishedAt ||= metadataDate($('h1').filter((_i,node)=>title.includes($(node).text().trim())).last().closest('article,.head,.article-head,.article-header').find('time[datetime]').first().attr('datetime') ?? '');
    if (url.hostname === 'kcnawatch.org') {
      const archiveDate = /Date:\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/.exec($('body').text());
      if (archiveDate) publishedAt ||= `${archiveDate[3]}-${archiveDate[2].padStart(2,'0')}-${archiveDate[1].padStart(2,'0')}`;
    }
    const dateText = $('.date,.published,.publish-date,[itemprop="datePublished"]').first().text().replace(/\s+/g, ' ');
    publishedAt ||= metadataDate(dateText) || publicationDate(dateText);
    if (url.hostname === 'www.korea.kr' || url.hostname === 'korea.kr')
      publishedAt ||= metadataDate($('.article_head .info > span').first().text());
    if (url.hostname === 'www.mindef.gov.sg' || url.hostname === 'mindef.gov.sg')
      publishedAt ||= metadataDate($('h1').first().parent().next('p').text());
    publishedAt ||= publicationDate($('body').text().replace(/\s+/g, ' ').slice(0, 2500));
    links = [...new Set($('a[href]').map((_i, a) => {
      try { return publicURL(new URL($(a).attr('href')!, url).href).href; } catch { return ''; }
    }).get().filter(Boolean))].slice(0, 100);
    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical) {
      try {
        const candidate = publicURL(new URL(canonical, url).href);
        if (candidate.hostname.replace(/^(www|m)\./, '') === url.hostname.replace(/^(www|m)\./, '')) canonicalURL = candidate.href;
      } catch { /* unsafe canonical metadata is ignored */ }
    }
    // KTV publishes desktop/mobile routes for the same indexed article.
    if (/(^|\.)ktv\.go\.kr$/.test(url.hostname) && /^\d+$/.test(url.searchParams.get('content_id') ?? ''))
      canonicalURL = `https://www.ktv.go.kr/content/view?content_id=${url.searchParams.get('content_id')}`;
    const articleMedia = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
    media = articleMedia.find('figure img, .article img, .entry-content img, .post_content img, .wp-block-image img, .contents img, img[itemprop="image"]').map((_i,img) => {
      const node = $(img); const raw = node.attr('data-src') ?? node.attr('src');
      try {
        if (!raw) return null;
        return { url: publicURL(new URL(raw,url).href).href, caption:node.closest('figure').find('figcaption').text().trim() || node.attr('alt')?.trim() || (url.hostname==='koreanewsservice.com' ? '조선중앙통신 기사 수록 사진 · 인물·행위·촬영 시점은 본문과 별도 대조 필요' : ''),
          credit:node.closest('figure').find('.credit,.caption-credit').text().trim() || attribution?.publisher || '', kind:'image' as const, analysis:'caption-only' as const };
      } catch { return null; }
    }).get().filter(item=>item && item.caption.length>10).slice(0,6);
    const leadImage = $('meta[property="og:image"]').attr('content');
    if (!media.length && leadImage) try { media.push({url:publicURL(new URL(leadImage,url).href).href,caption:'페이지 대표 이미지 · 본문과의 연관성 및 인물 신원은 추가 확인 필요',credit:attribution?.publisher ?? url.hostname,kind:'image',analysis:'caption-only'}); } catch { /* no unsafe image URLs */ }
    $('script,style,noscript,nav,footer,header,aside,form').remove();
    $('p,li,h1,h2,h3,br').append('\n');
    const candidates=$('article, .article, .entry-content, .field--name-body, .article-body, .story-body, .view_con, #articleBodyContents, #article-view-content-div').toArray()
      .map(node=>({node,length:$(node).text().trim().length})).sort((a,b)=>b.length-a.length);
    const content = candidates[0]?.length >= 1000 ? $(candidates[0].node) : $('main').first().text().trim().length >= 1000 ? $('main').first() : $('body');
    body = content.text();
  }
  // Treaties and manuals often place relevant provisions near the end. Preserve the
  // bounded full text; model contexts still receive selected exact excerpts.
  body = body.replace(/\s+/g, ' ').trim().slice(0, 2000000);
  if (/Проверяем браузер|Проверка защищает статьи|checking your browser|verify you are human|just a moment|checking if the site connection is secure/i.test(body.slice(0, 500)) && body.length < 2000)
    throw new Error('원문 접근 제한 · 브라우저 확인 페이지가 반환되었습니다.');
  if (body.length < 100) throw new Error('읽을 수 있는 원문 본문 부족');
  if (media?.length) await preserveMedia(media);
  language = detectLanguage(body) === 'other' ? language : detectLanguage(body);
  return { id: `source-${randomUUID()}`, title: (title || hit.title).slice(0,400), publisher: url.hostname.replace(/^www\./, ''),
    type: format === 'api' ? 'paper' : attribution?.archive ? 'archive' : /(^|\.)ktv\.go\.kr$/.test(url.hostname) ? 'news' : officialHost(url.hostname) || isDprkHost(url.hostname) ? 'official' : 'news',
    language, url: response.url, publishedAt, retrievedAt, body, links, canonicalURL,
    hash: createHash('sha256').update(body).digest('hex'), format,
    snapshotKind: format === 'api' ? 'abstract' : 'document', verificationMethod: format === 'api' ? 'api' : format === 'pdf' ? 'pdf-text' : 'http',
    attribution, media:media?.length ? media : undefined, medium:hit.module === 'patents' ? 'patent' : ['aviation','maritime'].includes(hit.module) ? 'track' : hit.module === 'social' ? 'social' : 'text' };
}
