import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObservationBundle, ObservationFeed } from '../../shared/observation-feeds.ts';
import { publicResource, showcase } from '../resources.ts';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../observation-feeds.css';

const time=(s?:string)=>s?new Date(s).toLocaleString('ko-KR',{hour12:false}):'원문 시각 참조';
function ObservationMap({feed}:{feed:ObservationFeed}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let map:LeafletMap|undefined,cancelled=false,frame=0;
    void import('leaflet').then(L=>{
      if(cancelled||!host.current)return;
      const points=feed.records.filter(r=>r.latitude!==undefined&&r.longitude!==undefined);if(!points.length)return;
      map=L.map(host.current,{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(feed.scope==='outside-region'?[61,25]:[37.8,129.5],6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(map);
      points.forEach(r=>{const box=document.createElement('div');box.textContent=`${r.label} · ${r.observedAt?time(r.observedAt):r.fields?.['수신 시각 (원문)']??'시각 미확인'}`;
        L.circleMarker([r.latitude!,r.longitude!],{radius:4,color:feed.kind==='ais'?'#237466':'#315e94',weight:1,fillOpacity:.75}).bindPopup(box).addTo(map!);});
      const bounds=L.latLngBounds(points.map(r=>[r.latitude!,r.longitude!] as [number,number]));map.fitBounds(bounds,{padding:[20,20],maxZoom:7,animate:false});
      frame=requestAnimationFrame(()=>{if(!cancelled)map?.invalidateSize({animate:false});});
    });
    return()=>{cancelled=true;cancelAnimationFrame(frame);map?.stop();map?.remove();map=undefined;};
  },[feed]);
  return <div ref={host} className="observation-map" role="img" aria-label={`${feed.provider} 실제 수신 위치 · ${feed.region}`}/>;
}
export function ObservationFeeds(){
  const [bundle,setBundle]=useState<ObservationBundle>(),[selected,setSelected]=useState('opensky'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const read=useCallback(async (refresh=false)=>{setBusy(true);setError('');try{
    const response=await fetch(showcase?publicResource('observation-feeds.json'):'/api/observations',{method:refresh&&!showcase?'POST':'GET'});
    if(!response.ok)throw new Error(`실제 관측 수집 응답 ${response.status}`);setBundle(await response.json() as ObservationBundle);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}},[]);
  useEffect(()=>{void read();},[read]);
  const active=bundle?.feeds.find(f=>f.id===selected)??bundle?.feeds[0];
  const orderedFeeds=bundle?.feeds.toSorted((a,b)=>Number(a.scope==='outside-region')-Number(b.scope==='outside-region'))??[];
  const vesselPositions=bundle?.feeds.find(f=>f.id==='eastasia-ais')?.records??[];
  const vesselSummaries=bundle?.feeds.find(f=>f.id==='taurus-ais-summary')?.records??[];
  const portRecords=bundle?.feeds.find(f=>f.id==='incheon-port')?.records??[];
  return <div id="report-observations" className="actual-observations" aria-labelledby="observations-title">
    <div className="observation-heading"><div><h3 id="observations-title">실제 공개 관측 피드</h3><p>수신 위치 · 항만 기록 · 공개 SNS 원문</p></div>{!showcase?<button className="secondary-button" onClick={()=>void read(true)} disabled={busy}>{busy?'실제 피드 수집 중…':'실제 피드 새로 수집'}</button>:null}</div>
    <p className="observation-scope-note">보고서 평가 이후 추가 확보한 관측입니다. 수집 시점과 지역을 확인한 뒤 재평가해야 하며, 기존 위험도에는 자동 반영하지 않습니다.</p>
    {error?<p role="alert">{error}</p>:null}
    {bundle?<><p className="observation-stats">수집 {time(bundle.collectedAt)} · 응답 확보 {bundle.feeds.filter(f=>f.state==='collected').length}/{bundle.feeds.length}개 피드 · 항공 식별자 대조 {bundle.crossChecks.length}건</p>
      <div className="observation-tabs" role="group" aria-label="실제 공개 피드 선택">{orderedFeeds.map(f=><button key={f.id} aria-pressed={active?.id===f.id} onClick={()=>setSelected(f.id)}>{f.provider}<span>{f.state==='collected'?`${f.count}건`:f.state==='empty'?'관측 없음':'수집 실패'}</span></button>)}</div>
      {active?<article className="actual-feed"><div className="observation-heading"><h4>{active.title}</h4><span className="actual-feed-badge">{active.state==='collected'?'실제 수집':active.state==='empty'?'실제 조회 · 결과 없음':'접근 실패'}</span></div>
        <p><strong>관측 범위</strong> · {active.region}</p><p className={active.scope==='outside-region'?'outside-scope':''}>{active.scope==='outside-region'?'한반도 사례의 사건 근거로 사용하지 않습니다. ':''}원문 수집 {time(active.collectedAt)} · 최근 관측/게시 {time(active.dataAt)}</p>
        {active.error?<p role="status">{active.error}</p>:null}
        {active.records.some(r=>r.latitude!==undefined)?<><p>지도 표시 {active.records.length}건 / 응답 내 유효 기록 {active.count}건</p><ObservationMap feed={active}/></>:null}
        {active.kind==='social-posts'?<ul className="actual-social-posts">{active.records.slice(0,5).map(r=><li key={r.id}><a href={r.url} target="_blank" rel="noreferrer">{r.label} · {time(r.observedAt)}</a><blockquote>{r.text}</blockquote></li>)}</ul>:
          active.records.length?<div className="observation-table"><table><caption>실제 원문에서 확보한 기록 · {Math.min(active.records.length,8)}건 표시</caption><thead><tr><th>식별</th><th>{active.kind==='port-calls'?'입항 / 출항 (원문)':'관측 시각'}</th><th>{active.kind==='port-calls'?'전출항지 → 차항지':'위도 / 경도 · 공개 위치'}</th><th>{active.kind==='port-calls'?'호출부호':'속도 (kt)'}</th></tr></thead><tbody>{active.records.slice(0,8).map(r=><tr key={r.id}><th>{r.url?<a href={r.url} target="_blank" rel="noreferrer">{r.label}</a>:r.label}{r.fields?.MMSI?<small> · MMSI {r.fields.MMSI}</small>:null}</th><td>{active.kind==='port-calls'?`${r.fields?.['입항일시 (원문)']} / ${r.fields?.['출항일시 (원문)']}`:r.observedAt?time(r.observedAt):r.fields?.['수신 시각 (원문)']??'원문 시각 참조'}</td><td>{active.kind==='port-calls'?`${r.fields?.['전출항지']} → ${r.fields?.['차항지']}`:r.latitude!==undefined?`${r.latitude.toFixed(4)} / ${r.longitude?.toFixed(4)}`:r.fields?.['공개 위치']??'정밀 위치 미공개'}</td><td>{active.kind==='port-calls'?r.fields?.['호출부호']:r.speedKnots??'미수신'}</td></tr>)}</tbody></table></div>:null}
        <ul className="observation-limits">{active.limitations.map(l=><li key={l}>{l}</li>)}</ul>
        <div className="observation-links"><a href={active.reference} target="_blank" rel="noreferrer">제공기관·API 원문 ↗</a>{active.snapshotHash?<a href={showcase?publicResource(`observations/${active.snapshotHash}.json`):`/api/observations/snapshots/${active.snapshotHash}`} target="_blank" rel="noreferrer">수집 원문·시각·해시 확인 ↗</a>:null}</div>
      </article>:null}
      {bundle.crossChecks.length?<details className="actual-crosschecks"><summary>항공 관측 두 피드 대조 · {bundle.crossChecks.filter(c=>c.status==='consistent').length}건 위치 정합</summary><p>{bundle.method}</p><table><thead><tr><th>호출부호</th><th>관측 시차</th><th>위치 차이</th><th>대조</th></tr></thead><tbody>{bundle.crossChecks.slice(0,8).map(c=><tr key={c.id}><td>{c.label} · {c.id}</td><td>{c.timeDifferenceSec}초</td><td>{c.distanceKm}km</td><td>{c.status==='consistent'?'표시 기준 이내':c.status==='time-mismatch'?'시각 차이 큼':'위치 차이 큼'}</td></tr>)}</tbody></table><p>두 피드가 같은 수신망을 공유할 수 있어 독립 사건 확인이나 신뢰도 상승으로 자동 계산하지 않습니다.</p></details>:null}
      {vesselPositions.length?<details className="actual-crosschecks vessel-crosschecks"><summary>선박 식별·마지막 수신 시각 대조</summary><table><thead><tr><th>선박 · MMSI</th><th>인천항 기록 대조</th><th>MyShipTracking 수신 시각</th><th>VesselFinder 수신 상태</th></tr></thead><tbody>{vesselPositions.map(r=>{const port=portRecords.find(p=>p.fields?.['호출부호']===r.fields?.['호출부호']),other=vesselSummaries.find(p=>p.id===r.id);return <tr key={r.id}><td>{r.label} · {r.id}</td><td>{port?`호출부호 ${r.fields?.['호출부호']} 일치`:'이번 항만 표에서 일치 미확인'}</td><td>{r.fields?.['수신 시각 (원문)']} · 시간대 미확인</td><td>{other?`${other.fields?.['수신 시각 (원문)']} · ${other.fields?.['공개 위치']}`:'별도 상태 미확보'}</td></tr>;})}</tbody></table><p>식별자 일치는 위치나 사건의 일치를 의미하지 않습니다. 마지막 수신 시각이 다른 위치·상태는 동일 시점의 충돌로 계산하지 않습니다.</p></details>:null}
    </>:!error?<p role="status">실제 공개 관측을 수집하고 있습니다.</p>:null}
  </div>;
}
