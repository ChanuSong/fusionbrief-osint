import { riskLevel } from './risk-policy.ts';
import type { RiskLevel } from './types.ts';

export interface ScenarioPoint { latitude:number; longitude:number; minute:number; altitudeFt?:number; }
export interface ScenarioTrack { id:string; kind:'aircraft'|'vessel'; sourceId:string; baseline:ScenarioPoint[]; observed:ScenarioPoint[]; }
export interface ScenarioSource { id:string; title:string; origin:string; synthetic:true; body:string; derivedFrom?:string; }
export interface SyntheticScenario {
  id:string; version:string; synthetic:true; question:string; asOfMinute:number;
  zone:{ west:number; east:number; south:number; north:number; startMinute:number; endMinute:number };
  tracks:ScenarioTrack[]; sources:ScenarioSource[];
}
export interface ScenarioOptions { tracks:boolean; notice:boolean; weather:boolean; republications:number; }
export const DEFAULT_SCENARIO_OPTIONS:ScenarioOptions={tracks:true,notice:true,weather:false,republications:0};
const radians=(n:number)=>n*Math.PI/180;
function randomFor(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function sampleRoute(waypoints:number[][],speedKmh:number,lastMinute:number,seed:number,aircraft:boolean):ScenarioPoint[]{
  const random=randomFor(seed),points:ScenarioPoint[]=[];
  for(let i=0;i<waypoints.length-1;i++){
    const a=waypoints[i],b=waypoints[i+1],steps=3+Math.floor(random()*4);
    for(let j=0;j<steps;j++){
      const t=j/steps,noise=Math.sin(Math.PI*t)*(random()-.5)*(aircraft?.018:.009);
      points.push({longitude:Number((a[0]+(b[0]-a[0])*t+noise).toFixed(5)),latitude:Number((a[1]+(b[1]-a[1])*t+noise*.7).toFixed(5)),minute:0,...(aircraft?{altitudeFt:31000+(seed%5)*1000}:{} )});
    }
  }
  const end=waypoints.at(-1)!;points.push({longitude:end[0],latitude:end[1],minute:0,...(aircraft?{altitudeFt:31000+(seed%5)*1000}:{})});
  const total=routeLength(points);let traveled=0;
  return points.map((p,i)=>{if(i)traveled+=distanceKm(points[i-1],p);return {...p,minute:Number((lastMinute-(total-traveled)/speedKmh*60).toFixed(2))};});
}
function track(kind:ScenarioTrack['kind'],n:number,rerouted:boolean,stale=false):ScenarioTrack{
  const aircraft=kind==='aircraft',random=randomFor(n*7919+(aircraft?47:181));
  const latitude=38.35+random()*1.22,destinationLatitude=37.9+random()*2.4;
  const west=129.32+random()*.5,east=134.1+random()*2.5;
  const baselineWaypoints=[[west,latitude],[130.48,latitude+.08],[131.38,latitude+.17],[132.42,latitude+.13],[133.48,destinationLatitude+.05],[east,destinationLatitude]];
  const detour=n%3===0?40.23+random()*.43:37.31+random()*.42;
  const observedWaypoints=rerouted?[[west,latitude],[130.25,latitude+(detour-latitude)*.28],[130.68,detour+.05],[131.55,detour+(random()-.5)*.12],[132.52,detour+(random()-.5)*.12],[133.34,detour+.03],[133.85,destinationLatitude+(detour-destinationLatitude)*.15],[east,destinationLatitude]]:
    baselineWaypoints.map(([lon,lat],i)=>[lon,lat+(i>0&&i<5?(random()-.5)*.035:0)]);
  const speedKmh=aircraft?720+random()*160:(13+random()*8)*1.852;
  const age=aircraft?2+Math.floor(random()*17):12+Math.floor(random()*75);
  const baseline=sampleRoute(baselineWaypoints,speedKmh,-45-n*3,n*131,aircraft);
  const observed=sampleRoute(observedWaypoints,speedKmh,2160-(stale?2880:age),n*271,aircraft);
  return {id:`SIM-${kind==='aircraft'?'AIR':'SEA'}-${String(n).padStart(2,'0')}`,kind,
    sourceId:kind==='aircraft'?'SIM-A1':'SIM-M1',baseline,observed};
}
export const SYNTHETIC_SCENARIO:SyntheticScenario={
  id:'east-sea-routing-exercise',version:'1.1',synthetic:true,asOfMinute:2160,
  question:'북한의 가상 동해 시험경보와 민간 항공·선박 우회를 대조해, 향후 24시간 운항 영향과 권장 추가 액션을 분석해줘.',
  zone:{west:131,east:133,south:38,north:40,startMinute:0,endMinute:2880},
  tracks:[...Array.from({length:8},(_,i)=>track('aircraft',i+1,i<6)),
    ...Array.from({length:12},(_,i)=>track('vessel',i+1,i<9,i>=10))],
  sources:[
    {id:'SIM-N1',title:'가상 항공·해상 공동 제한 경보',origin:'합성 경보 발신원',synthetic:true,
      body:'[합성 원문] 가상 D일 00:00부터 D+2일 00:00까지 북위 38–40도, 동경 131–133도 구역에서 시험 활동에 따른 항공·해상 운항 제한을 설정한다. 종료 후 연장 여부는 별도 공지한다. 이 경보는 실제 NOTAM 또는 NAVAREA 고시가 아니다.'},
    {id:'SIM-A1',title:'합성 ADS-B 전후 항적',origin:'합성 항공 관측원',synthetic:true,
      body:'[합성 원문] 항공기 SIM-AIR-01~08의 이전 항로와 경보 발효 후 항적을 보존한다. 위치와 시각은 아래 JSON 레코드가 원본이다. 선별된 관측군이며 전체 운항 모집단이나 실제 항공편을 나타내지 않는다.'},
    {id:'SIM-M1',title:'합성 AIS 전후 항적',origin:'합성 선박 관측원',synthetic:true,
      body:'[합성 원문] 선박 SIM-SEA-01~12의 이전 항로와 관측 항적을 보존한다. 일부 수신은 오래되어 최신성 검사에서 제외해야 한다. 위치와 시각은 아래 JSON 레코드가 원본이다. 실제 MMSI나 선박 이름을 사용하지 않는다.'},
    {id:'SIM-W1',title:'합성 기상 반대 근거',origin:'합성 기상 관측원',synthetic:true,
      body:'[합성 원문] 같은 시각·해역에 강풍과 높은 파고가 발생했다는 경쟁 설명을 가정한다. 이 조건을 채택하면 우회의 원인을 시험경보 하나에 귀속할 수 없다. 실제 기상 관측이 아니다.'},
  ],
};

export function distanceKm(a:ScenarioPoint,b:ScenarioPoint):number{
  const p=radians(b.latitude-a.latitude),q=radians(b.longitude-a.longitude);
  const h=Math.sin(p/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(q/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function routeLength(points:ScenarioPoint[]):number{return points.slice(1).reduce((sum,p,i)=>sum+distanceKm(points[i],p),0);}
export function crossesZone(points:ScenarioPoint[],zone:SyntheticScenario['zone']):boolean{
  return points.slice(1).some((b,i)=>{
    const a=points[i],dx=b.longitude-a.longitude,dy=b.latitude-a.latitude;
    let lo=0,hi=1;
    for(const [p,q] of [[-dx,a.longitude-zone.west],[dx,zone.east-a.longitude],[-dy,a.latitude-zone.south],[dy,zone.north-a.latitude]]){
      if(p===0){if(q<0)return false;continue;}
      const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return false;
    }
    return true;
  });
}
export interface TrackAssessment {
  id:string;kind:ScenarioTrack['kind'];sourceId:string;fresh:boolean;eligible:boolean;rerouted:boolean;
  baselineKm:number;observedKm:number;extraKm:number;extraMinutes:number;lastMinute:number;
}
export interface SyntheticAssessment {
  tracks:TrackAssessment[];air:{eligible:number;rerouted:number};sea:{eligible:number;rerouted:number};
  excluded:number;meanAirExtraMinutes:number;meanSeaExtraMinutes:number;independentOrigins:number;documentCount:number;
  risk:RiskLevel;confidence:'medium'|'low';attribution:'supported'|'unresolved';
  headline:string;explanation:string;checklist:{label:string;state:'met'|'missing'|'alternative';reason:string;sourceIds:string[]}[];
  activeSourceIds:string[];publications:ScenarioSource[];trace:{stage:string;result:string}[];
}
export function analyzeSyntheticScenario(data:SyntheticScenario,options:ScenarioOptions):SyntheticAssessment{
  if(data.synthetic!==true||data.sources.some(s=>s.synthetic!==true))throw new Error('합성 분석에는 합성으로 표기한 입력만 사용할 수 있습니다.');
  const seen=new Set<string>();
  const tracks=(options.tracks?data.tracks:[]).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;}).map(t=>{
    const last=t.observed.at(-1)!;
    const fresh=data.asOfMinute-last.minute<=(t.kind==='aircraft'?30:180)&&last.minute<=data.asOfMinute;
    const inTime=t.observed.some(p=>p.minute>=data.zone.startMinute&&p.minute<=data.zone.endMinute);
    const baselineKm=routeLength(t.baseline),observedKm=routeLength(t.observed),extraKm=Math.max(0,observedKm-baselineKm);
    const elapsed=t.baseline.at(-1)!.minute-t.baseline[0].minute;
    const eligible=fresh&&inTime&&crossesZone(t.baseline,data.zone);
    return {id:t.id,kind:t.kind,sourceId:t.sourceId,fresh,eligible,
      rerouted:eligible&&!crossesZone(t.observed,data.zone)&&extraKm>10,
      baselineKm,observedKm,extraKm,extraMinutes:baselineKm>0?extraKm/baselineKm*elapsed:0,lastMinute:last.minute};
  });
  const metric=(kind:ScenarioTrack['kind'])=>({eligible:tracks.filter(t=>t.kind===kind&&t.eligible).length,rerouted:tracks.filter(t=>t.kind===kind&&t.rerouted).length});
  const mean=(kind:ScenarioTrack['kind'])=>{const rows=tracks.filter(t=>t.kind===kind&&t.rerouted);return rows.length?Math.round(rows.reduce((s,t)=>s+t.extraMinutes,0)/rows.length):0;};
  const air=metric('aircraft'),sea=metric('vessel');
  const multiDomain=air.eligible>0&&sea.eligible>0&&air.rerouted/air.eligible>=.5&&sea.rerouted/sea.eligible>=.5;
  const activeSourceIds=[...(options.notice?['SIM-N1']:[]),...(options.tracks?['SIM-A1','SIM-M1']:[]),...(options.weather?['SIM-W1']:[])];
  const original=data.sources.find(s=>s.id==='SIM-N1')!;
  const copyCount=options.notice&&Number.isFinite(options.republications)?Math.min(100,Math.max(0,Math.floor(options.republications))):0;
  const publications=[...data.sources.filter(s=>activeSourceIds.includes(s.id)),...Array.from({length:copyCount},(_,i)=>({
    ...original,id:`SIM-R${i+1}`,title:`합성 뉴스·SNS 재전파 ${i+1}`,derivedFrom:original.id,
  }))];
  const origins=new Set(publications.map(s=>s.origin));
  const attribution=multiDomain&&options.notice&&!options.weather?'supported':'unresolved';
  const noticeActive=options.notice&&data.asOfMinute>=data.zone.startMinute&&data.asOfMinute<=data.zone.endMinute;
  const risk=multiDomain?riskLevel(noticeActive?'likely':'plausible','serious'):noticeActive?riskLevel('plausible','limited'):'unassessed';
  const headline=multiDomain?'항공·해상 우회가 함께 나타나 민간 운항 차질 위험이 높아졌습니다.':noticeActive?'운항 제한 경보만으로 실제 차질을 확인할 수 없습니다.':'판단에 필요한 유효한 관측·경보 근거가 부족합니다.';
  const explanation=multiDomain?`최신성 검사를 통과한 항공기 ${air.eligible}대 중 ${air.rerouted}대, 선박 ${sea.eligible}척 중 ${sea.rerouted}척이 이전 통과 구역을 우회합니다. ${options.notice?'경보 발효 구역·시간과 맞물립니다.':'경보 원문을 제외했으므로 제한의 발효 시각·구역 확인과 지속 시간 전망은 유보합니다.'} ${options.weather?'강풍이라는 경쟁 설명이 있어 시험경보가 우회의 원인인지 판단을 유보합니다.':'시간·공간 일치는 연관성을 뒷받침하지만 단독 인과관계나 미사일 발사를 입증하지는 않습니다.'}`:`${options.tracks?'유효한 전후 항적 비교가 부족합니다.':'항적을 검토에서 제외했습니다.'} 경보 발표는 제한 계획이며 실제 우회·지연 관측이 아닙니다. ${noticeActive?'운항 영향은 잠재 위험으로만 평가합니다.':'유효한 경보·관측 근거를 먼저 확보해야 합니다.'}`;
  return {tracks,air,sea,excluded:tracks.filter(t=>!t.fresh).length,meanAirExtraMinutes:mean('aircraft'),meanSeaExtraMinutes:mean('vessel'),
    independentOrigins:origins.size,documentCount:publications.length,
    risk,confidence:multiDomain&&options.notice?'medium':'low',attribution,headline,explanation,activeSourceIds,publications,
    checklist:[
      {label:'제한 구역·발효 시각',state:options.notice?'met':'missing',reason:options.notice?`경보 원문에서 가상 구역과 ${(data.zone.endMinute-data.zone.startMinute)/60}시간 발효기간 확인`:'경보 원문이 검토에서 제외됨',sourceIds:['SIM-N1']},
      {label:'항공 우회',state:air.rerouted?'met':'missing',reason:air.eligible?`${air.rerouted}/${air.eligible}대의 전후 항로·구역 교차 대조`:'사용 가능한 항적 미검토',sourceIds:['SIM-A1']},
      {label:'해상 우회',state:sea.rerouted?'met':'missing',reason:sea.eligible?`${sea.rerouted}/${sea.eligible}척 우회 · 오래된 수신 ${tracks.filter(t=>t.kind==='vessel'&&!t.fresh).length}척 제외`:'사용 가능한 AIS 미검토',sourceIds:['SIM-M1']},
      {label:'경쟁 설명 대조',state:options.weather?'alternative':'missing',reason:options.weather?'동시간·해역 강풍을 가정 → 원인 귀속 유보':'기상은 기본 시나리오에서 미제공 · 반대 근거 버튼으로 검토',sourceIds:['SIM-W1']},
    ],trace:[
      {stage:'입력 검증',result:`합성 원문 ${data.sources.length}개 · 합성 항공기/선박 ${data.tracks.length}개체`},
      {stage:'최신성·구역·시간 대조',result:`검토 ${tracks.length}개체 · 오래된 수신 ${tracks.filter(t=>!t.fresh).length}개체 제외`},
      {stage:'원출처 묶음',result:`문서 ${publications.length}개 → 가상 원출처 ${origins.size}개`},
      {stage:'위험·경쟁 설명',result:`민간 운항 위험 ${risk} · 원인 귀속 ${attribution} · 군사 공격 판단 유보`},
    ]};
}
