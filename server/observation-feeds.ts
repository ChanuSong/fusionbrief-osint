import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import type { ObservationBundle, ObservationCrossCheck, ObservationFeed, ObservationRecord } from '../shared/observation-feeds.ts';
import type { SourceDocument } from '../shared/types.ts';

const ROOT = resolve('.local/observation-feeds');
const USER_AGENT = 'FUSIONBRIEF/1.0 (https://github.com/ChanuSong/fusionbrief-osint; public research)';
const NOW_REGION = '한반도·일본 인접 공역 (34–43°N, 124–135°E)';
const config = [
  { id:'opensky',module:'aviation',kind:'ads-b',title:'한반도·일본 인접 공역 ADS-B',provider:'OpenSky Network',region:NOW_REGION,scope:'regional',endpoint:'https://opensky-network.org/api/states/all?lamin=34&lomin=124&lamax=43&lomax=135',reference:'https://openskynetwork.github.io/opensky-api/rest.html' },
  { id:'adsblol',module:'aviation',kind:'ads-b',title:'한반도 인접 공역 ADS-B 대조',provider:'adsb.lol',region:'37.5°N, 129°E 중심 250해리 · 표시 범위는 34–43°N, 124–135°E',scope:'regional',endpoint:'https://api.adsb.lol/v2/point/37.5/129/250',reference:'https://api.adsb.lol/docs' },
  { id:'digitraffic',module:'maritime',kind:'ais',title:'실제 AIS 위치 피드',provider:'Fintraffic Digitraffic',region:'핀란드 수역 · 한반도 관측 범위 밖',scope:'outside-region',endpoint:'https://meri.digitraffic.fi/api/ais/v1/locations',reference:'https://www.digitraffic.fi/en/marine-traffic/' },
  { id:'incheon-port',module:'maritime',kind:'port-calls',title:'인천항 선박 입출항 원문',provider:'인천항만공사 iCON',region:'인천항 · 서해',scope:'regional',endpoint:'https://scon.icpa.or.kr/harbor/shipnvg/eList.do',reference:'https://scon.icpa.or.kr/harbor/shipnvg/eList.do' },
  { id:'eastasia-ais',module:'maritime',kind:'ais',title:'동아시아 선박 AIS 공개 수신 위치',provider:'MyShipTracking',region:'서해·남중국해 · 인천항 기록 선박 2척 대조',scope:'regional',endpoint:'https://www.myshiptracking.com/vessels/sunny-lilac-mmsi-352002731-imo-9964742',reference:'https://www.myshiptracking.com/' },
  { id:'taurus-ais-summary',module:'maritime',kind:'vessel-summary',title:'STARSHIP TAURUS AIS 공개 상태 대조',provider:'VesselFinder',region:'동아시아·울산항 · 동일 MMSI 수신 시각 대조',scope:'regional',endpoint:'https://www.vesselfinder.com/vessels/details/9792498',reference:'https://www.vesselfinder.com/vessels/details/9792498' },
  { id:'38north-social',module:'social',kind:'social-posts',title:'38 North 공개 게시물',provider:'38 North / Bluesky',region:'북한 관련 공개 게시물',scope:'regional',endpoint:'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=38north.org&limit=30&filter=posts_no_replies',reference:'https://bsky.app/profile/38north.org' },
  { id:'martyn-social',module:'social',kind:'social-posts',title:'북한 연구자 공개 게시물',provider:'Martyn Williams / Bluesky',region:'북한 관련 공개 게시물',scope:'regional',endpoint:'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=martynw.bsky.social&limit=30&filter=posts_no_replies',reference:'https://bsky.app/profile/martynw.bsky.social' },
] as const;
type Spec = typeof config[number];
const inRegion=(lat:number,lon:number)=>lat>=34&&lat<=43&&lon>=124&&lon<=135;
const iso=(epoch:number)=>new Date(epoch).toISOString();
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

export function parseOpenSky(data: {time:number;states:unknown[][]|null}): ObservationRecord[] {
  if (!finite(data.time) || data.states !== null && !Array.isArray(data.states)) throw new Error('OpenSky 응답 형식 오류');
  return (data.states??[]).filter(row=>finite(row[6])&&finite(row[5])&&inRegion(row[6],row[5])&&finite(row[3]))
    .map(row=>({id:String(row[0]).toLowerCase(),label:String(row[1]??'').trim()||String(row[0]),
      longitude:row[5] as number,latitude:row[6] as number,observedAt:iso((row[3] as number)*1000),
      altitudeM:finite(row[7])?row[7]:undefined,speedKnots:finite(row[9])?Math.round(row[9]*1.943844):undefined,
      fields:{icao24:String(row[0]),'등록 추정 국가':String(row[2]??''),'지상 여부':row[8]===true?'지상':'공중'}}));
}
export function parseAdsb(data:{now:number;ac:Record<string,unknown>[]}):ObservationRecord[]{
  if(!finite(data.now)||!Array.isArray(data.ac))throw new Error('adsb.lol 응답 형식 오류');
  const now=data.now>1e12?data.now:data.now*1000;
  return data.ac.filter(a=>finite(a.lat)&&finite(a.lon)&&inRegion(a.lat,a.lon)&&finite(a.seen_pos))
    .map(a=>({id:String(a.hex).toLowerCase(),label:String(a.flight??a.r??a.hex).trim(),latitude:a.lat as number,longitude:a.lon as number,
      observedAt:iso(now-(a.seen_pos as number)*1000),altitudeM:finite(a.alt_baro)?Math.round(a.alt_baro*.3048):undefined,
      speedKnots:finite(a.gs)?a.gs:undefined,fields:{icao24:String(a.hex),'등록번호':String(a.r??''),'기종':String(a.t??'')}}));
}
export function parseAis(data:{features:{geometry:{coordinates:number[]};properties:Record<string,unknown>}[]}):ObservationRecord[]{
  if(!Array.isArray(data.features))throw new Error('AIS GeoJSON 응답 형식 오류');
  return data.features.filter(f=>finite(f.geometry?.coordinates?.[0])&&finite(f.geometry?.coordinates?.[1])&&finite(f.properties?.timestampExternal))
    .map(f=>({id:String(f.properties.mmsi),label:`MMSI ${f.properties.mmsi}`,longitude:f.geometry.coordinates[0],latitude:f.geometry.coordinates[1],
      observedAt:iso(f.properties.timestampExternal as number),speedKnots:finite(f.properties.sog)?f.properties.sog:undefined,
      fields:{MMSI:String(f.properties.mmsi),'대지 침로':String(f.properties.cog??''),'항해 상태 코드':String(f.properties.navStat??'')}}))
    .sort((a,b)=>Date.parse(b.observedAt!)-Date.parse(a.observedAt!));
}
export function parsePort(html:string):ObservationRecord[]{
  const $=load(html);const table=$('table').filter((_i,t)=>$(t).find('caption').text().includes('컨테이너터미널 입출항현황')).first();
  if(!table.length)throw new Error('인천항 공개 표의 형식 변경 또는 접근 실패');
  return table.find('tbody tr').toArray().flatMap(row=>{
    const c=$(row).find('td').toArray().map(td=>$(td).text().trim().replace(/\s+/g,' '));
    if(c.length<14||!c[7])return [];
    return [{id:`${c[3]}-${c[5]}`,label:c[7],url:config[3].endpoint,
      fields:{'호출부호':c[3],'국적 코드':c[8],'입항일시 (원문)':c[10],'출항일시 (원문)':c[11],'전출항지':c[12],'차항지':c[13],'터미널':c[1]}}];
  });
}
export function parseSocial(data:{feed:{post:{uri:string;author:{handle:string};record:{text:string;createdAt:string};indexedAt?:string}}[]}):ObservationRecord[]{
  if(!Array.isArray(data.feed))throw new Error('Bluesky 공개 게시물 응답 형식 오류');
  const seen=new Set<string>();
  return data.feed.flatMap(item=>{
    const p=item.post;if(!p?.uri||typeof p.record?.text!=='string'||!p.record.createdAt||seen.has(p.uri))return [];
    if(!/korea|dprk|pyongyang|kim jong|missile|panghyon|sin[uŭ]iju|北朝鮮|북한/i.test(p.record.text))return [];
    seen.add(p.uri);return [{id:p.uri,label:p.author.handle,observedAt:p.record.createdAt,text:p.record.text,
      url:`https://bsky.app/profile/${encodeURIComponent(p.author.handle)}/post/${p.uri.split('/').at(-1)}`,fields:{'게시자':p.author.handle,'AT URI':p.uri}}];
  });
}
export function parseShipPosition(html:string,url:string):ObservationRecord{
  const $=load(html);$('script,style').remove();const text=$('body').text().replace(/\s+/g,' ');
  const matched=text.match(/The current position of (.+?) is in (.+?) with coordinates (-?\d+\.\d+)°\s*\/\s*(-?\d+\.\d+)° as reported on (\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}) by AIS/);
  const ids=text.match(/IMO:\s*(\d{7}),\s*MMSI:\s*(\d{9})/);
  if(!matched||!ids)throw new Error('공개 AIS 위치·식별 원문을 확보하지 못했습니다.');
  const latitude=Number(matched[3]),longitude=Number(matched[4]);
  if(Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('AIS 공개 좌표 범위 오류');
  return {id:ids[2],label:matched[1],latitude,longitude,url,text:matched[0],
    speedKnots:Number(text.match(/current speed is ([\d.]+) Knots/)?.[1])||undefined,
    fields:{MMSI:ids[2],IMO:ids[1],'호출부호':text.match(/Call Sign\s*([A-Z0-9]+)/)?.[1]??'미확인','수신 시각 (원문)':matched[5],'해역':matched[2],'시각 주의':'제공자 원문 시각 · 시간대 미확인 · 현재 위치로 단정하지 않음'}};
}
export function parseShipSummary(html:string,url:string):ObservationRecord{
  const $=load(html);$('script,style').remove();const text=$('body').text().replace(/\s+/g,' ');
  const matched=text.match(/The current position of (.+?) is at (.+?) reported (.+?) by AIS\./);
  const ids=text.match(/IMO\s+(\d{7}),\s*MMSI\s+(\d{9})/);if(!matched||!ids)throw new Error('선박 공개 AIS 상태 원문을 확보하지 못했습니다.');
  const port=text.match(/en route to the port of (.+?),/),status=text.match(/Navigation Status\s*([^]*?)\s*Position Received/);
  return {id:ids[2],label:matched[1],url,text:matched[0],fields:{MMSI:ids[2],IMO:ids[1],'공개 위치':matched[2],
    '수신 시각 (원문)':`${matched[3]} (수집 당시 표기)`,'목적항':port?.[1]??'미확인','항해 상태':status?.[1]?.trim()??'미확인','시각 주의':'상대 수신 시각이며 정밀 위치와 절대 시각은 미공개'}};
}
function distance(a:ObservationRecord,b:ObservationRecord){
  const rad=(n:number)=>n*Math.PI/180;const dy=rad(b.latitude!-a.latitude!),dx=rad(b.longitude!-a.longitude!);
  const h=Math.sin(dy/2)**2+Math.cos(rad(a.latitude!))*Math.cos(rad(b.latitude!))*Math.sin(dx/2)**2;
  return Math.round(6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))*100)/100;
}
export function crossCheckAircraft(feeds:ObservationFeed[]):ObservationCrossCheck[]{
  const a=feeds.find(f=>f.id==='opensky'),b=feeds.find(f=>f.id==='adsblol');if(!a||!b)return [];
  const byId=new Map(b.records.map(r=>[r.id,r]));
  return a.records.flatMap(r=>{const s=byId.get(r.id);if(!s||!r.observedAt||!s.observedAt)return [];
    const timeDifferenceSec=Math.round(Math.abs(Date.parse(r.observedAt)-Date.parse(s.observedAt))/1000),distanceKm=distance(r,s);
    return [{id:r.id,label:r.label,feeds:[a.id,b.id],distanceKm,timeDifferenceSec,
      status:timeDifferenceSec>60?'time-mismatch' as const:distanceKm<=20?'consistent' as const:'different' as const}];
  });
}
async function collectOne(spec:Spec):Promise<ObservationFeed>{
  const collectedAt=new Date().toISOString();
  const limitations:string[]=spec.kind==='ads-b'?['수신된 위치의 스냅샷이며 전체 비행 경로나 항로 변경을 입증하지 않습니다.','수신국·수신망 공백이 있어 북한 내부 또는 모든 항공기를 포괄하지 않습니다.']:
    spec.id==='digitraffic'?['핀란드 수역의 실제 AIS입니다. 한반도·동해 사건 판단에는 적용하지 않습니다.','송신자 제공 정보이며 식별번호·위치는 별도 검증이 필요합니다.']:
    spec.id==='eastasia-ais'?['공개 페이지에서 제공한 실제 AIS 수신 위치입니다. 마지막 수신 날짜를 확인해야 하며 현재 위치로 단정하지 않습니다.','선박 2척의 공개 관측이며 한반도·동해 전체 선박을 포괄하지 않습니다. 원문 시각의 시간대는 미확인입니다.']:
    spec.kind==='vessel-summary'?['공개 AIS 요약과 상대 수신 시각만 확보했습니다. 정밀 좌표를 생성하지 않았습니다.','다른 제공자의 과거 수신 위치와 시각이 다르므로 같은 시점의 충돌로 해석하지 않습니다.']:
    spec.kind==='port-calls'?['항만 입출항 공개 기록이며 AIS 실측 위치나 현재 항로가 아닙니다.','원문 표기 일시를 보존하며 항로 변경이나 북한 사건과의 관련성을 자동 추론하지 않습니다.']:
    ['공개 게시물 원문이며 사건의 독립 관측으로 자동 인정하지 않습니다.','게시물 발행일과 소개한 사건의 발생일을 구분해야 합니다.'];
  try{
    const response=await fetch(spec.endpoint,{headers:{'User-Agent':USER_AGENT,'Digitraffic-User':USER_AGENT},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    let raw=await response.text();if(Buffer.byteLength(raw)>8000000)throw new Error('공개 피드 크기 제한 초과');
    let publicShips:ObservationRecord[]|undefined;
    if(spec.id==='eastasia-ais'){
      const secondURL='https://www.myshiptracking.com/vessels/starship-taurus-mmsi-538007311-imo-9792498';
      const second=await fetch(secondURL,{headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(10000)});
      if(!second.ok)throw new Error(`두 번째 공개 선박 원문 HTTP ${second.status}`);
      const html2=await second.text();publicShips=[parseShipPosition(raw,spec.endpoint),parseShipPosition(html2,secondURL)];
      raw=JSON.stringify({pages:[{url:spec.endpoint,html:raw},{url:secondURL,html:html2}]});
    }
    const hash=createHash('sha256').update(raw).digest('hex');await mkdir(ROOT,{recursive:true});
    await writeFile(resolve(ROOT,`${hash}.json`),JSON.stringify({provider:spec.provider,endpoint:spec.endpoint,collectedAt,contentType:publicShips?'application/json (composite public HTML snapshots)':response.headers.get('content-type'),raw}));
    const data=spec.kind==='port-calls'||spec.kind==='vessel-summary'||publicShips?undefined:JSON.parse(raw);
    const records=publicShips??(spec.id==='opensky'?parseOpenSky(data):spec.id==='adsblol'?parseAdsb(data):spec.kind==='ais'?parseAis(data):spec.kind==='vessel-summary'?[parseShipSummary(raw,spec.endpoint)]:spec.kind==='port-calls'?parsePort(raw):parseSocial(data));
    const times=records.map(r=>r.observedAt).filter((t):t is string=>!!t);
    return {...spec,collectedAt,snapshotHash:hash,count:records.length,records:records.slice(0,spec.kind==='ais'?300:150),
      dataAt:times.sort().at(-1),state:records.length?'collected':'empty',limitations};
  }catch(error){return {...spec,collectedAt,count:0,records:[],state:'failed',error:(error as Error).message,limitations};}
}
let pending:Promise<ObservationBundle>|undefined;
let cached:ObservationBundle|undefined;
export async function collectObservationFeeds(force=false):Promise<ObservationBundle>{
  if(!cached){try{cached=JSON.parse(await readFile(resolve(ROOT,'latest.json'),'utf8')) as ObservationBundle;}catch{/* First real collection. */}}
  if(cached&&!force&&Date.now()-Date.parse(cached.collectedAt)<60000)return structuredClone(cached);
  if(pending)return structuredClone(await pending);
  pending=(async()=>{
    const feeds=await Promise.all(config.map(collectOne));
    const bundle:ObservationBundle={collectedAt:new Date().toISOString(),feeds,crossChecks:crossCheckAircraft(feeds),includedInReportAssessment:false,
      method:'실제 공개 API·기관 표·SNS 원문 수집. 항공 위치 대조는 같은 ICAO24·60초 이내·20km 이내의 표시용 정합성 점검이며, 독립 센서 확인이나 사건 검증 등급이 아닙니다.'};
    await mkdir(ROOT,{recursive:true});await writeFile(resolve(ROOT,'latest.json.tmp'),JSON.stringify(bundle,null,2));
    await rename(resolve(ROOT,'latest.json.tmp'),resolve(ROOT,'latest.json'));cached=bundle;return bundle;
  })();
  try{return structuredClone(await pending);}finally{pending=undefined;}
}
export async function observationSnapshot(hash:string){
  if(!/^[a-f0-9]{64}$/.test(hash))return undefined;
  try{return JSON.parse(await readFile(resolve(ROOT,`${hash}.json`),'utf8')) as {provider:string;endpoint:string;collectedAt:string;raw:string};}catch{return undefined;}
}
export function observationDocuments(bundle:ObservationBundle):SourceDocument[]{
  return bundle.feeds.filter(f=>f.state==='collected'&&f.scope==='regional').map(f=>{
    const body=JSON.stringify({provider:f.provider,region:f.region,collectedAt:f.collectedAt,kind:f.kind,
      limitations:f.limitations,records:f.records.slice(0,8)},null,2);
    return {id:`observation-${f.id}-${f.snapshotHash?.slice(0,12)}`,title:f.title,publisher:f.provider,type:f.id==='incheon-port'?'official' as const:'archive' as const,
      language:f.id==='incheon-port'?'ko' as const:'en' as const,url:f.endpoint,publishedAt:f.kind==='social-posts'?'':f.collectedAt.slice(0,10),retrievedAt:f.collectedAt,
      body,hash:createHash('sha256').update(body).digest('hex'),format:'api' as const,snapshotKind:'document' as const,verificationMethod:'api' as const,
      medium:f.module==='social'?'social' as const:'track' as const,collectedVia:[f.module]};
  });
}
