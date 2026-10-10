import { load } from 'cheerio';
import type { SourceDocument } from '../shared/types.ts';
/** Discovery catalog, not a promise that a defunct or restricted outlet is reachable. */
export const DPRK_MEDIA = [
  { name: '로동신문', domains: ['rodong.rep.kp'], aliases: ['Rodong Sinmun'] },
  { name: '조선중앙통신', domains: ['kcna.kp', 'kcna.co.jp'], aliases: ['KCNA'] },
  { name: '조선중앙TV', domains: [], aliases: ['KCTV', 'Korea Central TV'] },
  { name: '민주조선', domains: [], aliases: ['Minju Choson'] },
  { name: '청년전위', domains: ['youth.rep.kp'], aliases: ['Chongnyon Chonwi'] },
  { name: '평양타임스', domains: ['pyongyangtimes.com.kp'], aliases: ['Pyongyang Times'] },
  { name: '조선의 소리', domains: ['vok.rep.kp'], aliases: ['Voice of Korea'] },
  { name: '내나라', domains: ['naenara.com.kp'], aliases: ['Naenara'] },
  { name: '북한 외무성', domains: ['mfa.gov.kp'], aliases: ['Ministry of Foreign Affairs'] },
  { name: '류경', domains: ['ryugyongclip.com'], aliases: ['Ryugyong'] },
  { name: '려명', domains: ['ryomyong.com'], aliases: ['Ryomyong'] },
  { name: '메아리', domains: ['arirangmeari.com'], aliases: ['Arirang Meari'] },
  { name: '조선의 오늘', domains: ['dprktoday.com'], aliases: ['DPRK Today'] },
  { name: '우리민족끼리', domains: ['uriminzokkiri.com'], aliases: ['Uriminzokkiri'] },
  { name: '통일신보', domains: [], aliases: ['Tongil Sinbo'] },
  { name: '통일의 메아리', domains: ['tongilvoice.com'], aliases: ['Tongil Voice'] },
  { name: '금수강산', domains: [], aliases: ['Kumsugangsan'] },
  { name: '조선', domains: [], aliases: ['DPR Korea'] },
  { name: '오늘의 조선', domains: [], aliases: ['Korea Today'] },
  { name: '조선의 무역', domains: [], aliases: ['Foreign Trade'] },
  { name: '김일성종합대학', domains: ['ryongnamsan.edu.kp'], aliases: ['Kim Il Sung University'] },
  { name: '조선사회과학자협회', domains: ['kass.org.kp'], aliases: ['KASS'] },
  { name: '서광', domains: ['sogwang.com'], aliases: ['Sogwang'] },
  { name: '조선체육', domains: ['sdprk.org.kp'], aliases: ['Sports DPRK'] },
];
export const DPRK_ARCHIVE = 'https://kcnawatch.org/';
export const isDprkHost = (host: string) => DPRK_MEDIA.some(outlet => outlet.domains.some(domain => host === domain || host.endsWith(`.${domain}`)));

export function dprkAttribution(html: string, url: string): SourceDocument['attribution'] {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'koreanewsservice.com' && /\(KCNA\)|조선중앙통신/.test(load(html)('body').text())) return {publisher:'조선중앙통신',archive:true,control:'dprk-state'};
  const direct = DPRK_MEDIA.find(outlet => outlet.domains.some(domain => host === domain || host.endsWith(`.${domain}`)));
  if (direct) return { publisher: direct.name, originalURL: url, archive: false, control: 'dprk-state' };
  if (host !== 'kcnawatch.org') return undefined;
  const $ = load(html);
  const sourceText = $('a').filter((_i, a) => /^(?:KCNA|Rodong|Minju|Chongnyon|Naenara|Pyongyang Times|Voice of Korea|Ryugyong|Ryomyong|DPRK Today|Uriminzokkiri|KASS|Tongil|Korea Today|DPR Korea|Kumsugangsan|Foreign Trade|Arirang|Sogwang|Sports DPRK|Ministry|Kim Il Sung)/i.test($(a).text().trim())).map((_i,a)=>$(a).text().trim()).get();
  // An archive's navigation lists all outlets. Attribute only metadata adjacent to Source, never that menu.
  const text = $('body').text().replace(/\s+/g, ' ');
  const named = /Source:\s*([^|]{2,65})(?:\s*\||\s*Read original)/i.exec(text)?.[1].trim();
  const outlet = named ? DPRK_MEDIA.find(o => [o.name, ...o.aliases].some(alias => named.toLowerCase().includes(alias.toLowerCase()))) : undefined;
  const original = $('a[href]').filter((_i,a)=> /Read original version at source/i.test($(a).text())).first().attr('href');
  let originalURL: string | undefined;
  try { if (original && /^https?:\/\//.test(original)) originalURL = new URL(original).href; } catch { /* no guessed origin */ }
  if (!outlet && !named) return undefined;
  return { publisher: outlet?.name ?? named ?? sourceText[0], originalURL, archive: true, control: 'dprk-state' };
}
