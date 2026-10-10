import { createHash, randomUUID } from 'node:crypto';
import type { ResearchQuery, SourceDocument } from '../shared/types.ts';
import { publicFetch, publicURL, type SearchHit } from './public-sources.ts';
const BASE = 'https://earth-search.aws.element84.com/v1';
export async function searchSatellite(query: ResearchQuery): Promise<SearchHit[]> {
  if (!query.bbox || !query.datetime) throw new Error('위성 관측 검색에는 확인된 bbox와 촬영 기간(datetime)이 필요합니다. 지명을 임의 좌표로 바꾸지 않았습니다.');
  const [west,south,east,north] = query.bbox;
  if (west >= east || south >= north || east-west > 10 || north-south > 10) throw new Error('위성 검색 영역은 올바른 순서의 10도 이내 범위여야 합니다.');
  if (!/^\d{4}-\d{2}-\d{2}(?:T[0-9:]+Z)?\/\d{4}-\d{2}-\d{2}(?:T[0-9:]+Z)?$/.test(query.datetime)) throw new Error('위성 촬영 기간 형식 오류');
  const url = new URL(`${BASE}/search`);
  url.searchParams.set('collections','sentinel-2-l2a'); url.searchParams.set('bbox',query.bbox.join(','));
  url.searchParams.set('datetime',query.datetime); url.searchParams.set('limit','5');
  const record = JSON.parse((await publicFetch(url.href)).body.toString()) as {features?: {id:string;properties:{datetime?:string;'eo:cloud_cover'?:number};links:{rel:string;href:string}[]}[]};
  return (record.features ?? []).sort((a,b)=>(a.properties['eo:cloud_cover'] ?? 100)-(b.properties['eo:cloud_cover'] ?? 100)).map(item=>({
    url: publicURL(item.links.find(link=>link.rel==='self')?.href ?? `${BASE}/collections/sentinel-2-l2a/items/${encodeURIComponent(item.id)}`).href,
    title:`Sentinel-2 ${item.id} · ${item.properties.datetime ?? '촬영 시점 미확인'}`, module:'satellite', language:'en',
  }));
}
export function readSatelliteRecord(raw: string, url: string): SourceDocument {
  const record = JSON.parse(raw) as {id:string;type:string;collection:string;bbox?:number[];properties:{datetime?:string;'eo:cloud_cover'?:number;'gsd'?:number}; assets?:Record<string,{href:string;type?:string;roles?:string[];title?:string}>};
  if (record.type !== 'Feature' || record.collection !== 'sentinel-2-l2a' || !record.id) throw new Error('지원하지 않는 위성 관측 메타데이터');
  const media: NonNullable<SourceDocument['media']> = Object.values(record.assets ?? {}).filter(asset => asset.roles?.includes('thumbnail') || asset.type?.startsWith('image/jpeg')).slice(0,2).map(asset=>({
    url:publicURL(asset.href).href, caption:asset.title ?? `Sentinel-2 ${record.id}`, credit:'Copernicus Sentinel data / Earth Search', kind:'satellite',
    capturedAt:record.properties.datetime, resolutionM:record.properties.gsd, cloudCover:record.properties['eo:cloud_cover'], bbox:record.bbox, analysis:'metadata-only',
  }));
  const body = JSON.stringify({ id:record.id, collection:record.collection, properties:record.properties, bbox:record.bbox, assets:record.assets });
  return { id:`source-${randomUUID()}`, title:`Sentinel-2 관측 ${record.id}`, publisher:'Copernicus / Earth Search', type:'archive', language:'en', url,
    publishedAt:record.properties.datetime?.slice(0,10) ?? '', retrievedAt:new Date().toISOString(), body, hash:createHash('sha256').update(body).digest('hex'),
    format:'api', snapshotKind:'document', verificationMethod:'api', medium:'satellite', media };
}
