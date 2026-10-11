import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { SYNTHETIC_SCENARIO as data, distanceKm } from '../../shared/synthetic-scenario.ts';
import type { ScenarioOptions, SyntheticAssessment, ScenarioPoint } from '../../shared/synthetic-scenario.ts';
import { publicResource } from '../resources.ts';
import 'leaflet/dist/leaflet.css';

export function scenarioTime(minute:number){const day=Math.floor(minute/1440),within=((minute%1440)+1440)%1440;return `D${day<0?'': '+'}${day} ${String(Math.floor(within/60)).padStart(2,'0')}:${String(Math.floor(within%60)).padStart(2,'0')}`;}
function course(a:ScenarioPoint,b:ScenarioPoint){const rad=Math.PI/180,lon=(b.longitude-a.longitude)*rad;return (Math.atan2(Math.sin(lon)*Math.cos(b.latitude*rad),Math.cos(a.latitude*rad)*Math.sin(b.latitude*rad)-Math.sin(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.cos(lon))*180/Math.PI+360)%360;}
export default function ScenarioRouteMap({period,result,options}:{period:'baseline'|'observed';result:SyntheticAssessment;options:ScenarioOptions}){
  const host=useRef<HTMLDivElement>(null),[selected,setSelected]=useState<string>();
  const inspected=options.tracks&&result.tracks.some(t=>t.id===selected&&t.eligible)?data.tracks.find(t=>t.id===selected):undefined,assessment=result.tracks.find(t=>t.id===selected);
  const rows=options.tracks?data.tracks.filter(t=>result.tracks.some(a=>a.id===t.id&&a.eligible)):[];
  const samples=rows.reduce((n,t)=>n+t[period].length,0);
  useEffect(()=>{
    if(!host.current)return;
    const controller=new AbortController();let disposed=false;
    const map=L.map(host.current,{scrollWheelZoom:false,zoomAnimation:false,zoomSnap:.25,minZoom:4,maxZoom:10,attributionControl:true});
    map.fitBounds([[36.5,127.5],[41.4,139.8]],{padding:[10,10],animate:false});
    map.createPane('scenario-land').style.zIndex='250';
    map.attributionControl.addAttribution('배경: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a> · 항적/경보: 합성');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    fetch(publicResource('assets/scenario-countries.geojson'),{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Map geometry unavailable');return r.json();}).then((geo:FeatureCollection)=>{
      if(disposed)return;
      L.geoJSON(geo,{pane:'scenario-land',filter:f=>['South Korea','North Korea','Japan','Russia','China'].includes(f.properties.ADMIN),style:{color:'#a5b5b7',weight:.8,fillColor:'#edf0eb',fillOpacity:.55,interactive:false}}).addTo(map);
    }).catch(()=>{/* The geographic tile layer remains available independently. */});
    for(const [label,latitude,longitude] of [['대한민국',36.8,127.7],['북한',40.0,127.8],['일본',38.4,140.0],['동해 / East Sea',40.8,135.3]] as const){
      L.marker([latitude,longitude],{interactive:false,icon:L.divIcon({className:'scenario-country-label',html:label,iconSize:[110,18],iconAnchor:[55,9]})}).addTo(map);
    }
    if(options.notice){
      const z=data.zone;
      L.rectangle([[z.south,z.west],[z.north,z.east]],{color:'#b78130',weight:1.5,dashArray:'6 5',fillColor:'#e8bd60',fillOpacity:.18}).addTo(map);
      L.marker([z.north-.13,(z.east+z.west)/2],{interactive:false,icon:L.divIcon({className:'scenario-zone-label',html:'가상 시험경보 구역',iconSize:[134,22],iconAnchor:[67,0]})}).addTo(map);
    }
    for(const t of rows){
      const a=result.tracks.find(row=>row.id===t.id)!,points=t[period],last=points.at(-1)!,previous=points.at(-2)!;
      const color=period==='baseline'?'#7992a4':t.kind==='aircraft'?'#31769f':'#b77035';
      const line=L.polyline(points.map(p=>[p.latitude,p.longitude] as [number,number]),{color,weight:period==='baseline'?1.6:2.1,opacity:period==='baseline'?.65:.78,dashArray:period==='baseline'?'5 5':undefined}).addTo(map);
      line.bindTooltip(`${t.id} · ${period==='baseline'?'이전 항적':a.rerouted?'우회 관측':'통과 지속'}`,{sticky:true});
      line.on('click',()=>setSelected(t.id));
      for(let i=3;i<points.length-1;i+=5){const p=points[i];L.circleMarker([p.latitude,p.longitude],{radius:1.8,color,weight:.8,fillColor:'#fff',fillOpacity:.95,interactive:false}).addTo(map);}
      const bearing=course(previous,last),aircraft=t.kind==='aircraft';
      const shape=aircraft?'<path d="M12 2L14 10L22 15V18L14 15V20L16 22H8L10 20V15L2 18V15L10 10Z"/>':'<path d="M12 2L18 10L17 20L12 23L7 20L6 10Z"/>';
      const icon=L.divIcon({className:'scenario-track-marker',html:`<svg viewBox="0 0 24 24" style="transform:rotate(${bearing}deg);fill:${color};stroke:white;stroke-width:1.2" aria-hidden="true">${shape}</svg>`,iconSize:[19,19],iconAnchor:[9,9]});
      L.marker([last.latitude,last.longitude],{icon,title:`${t.id} 합성 ${aircraft?'항공기':'선박'} 관측 상세`,keyboard:true}).addTo(map).bindTooltip(`${t.id} · ${scenarioTime(last.minute)}`).on('click',()=>setSelected(t.id));
    }
    const observer=new ResizeObserver(()=>{if(!disposed)map.invalidateSize({animate:false});});observer.observe(host.current);
    return()=>{disposed=true;controller.abort();observer.disconnect();map.remove();};
  },[period,result,options]);
  const points=inspected?.[period],last=points?.at(-1),before=points?.at(-2);
  const speed=last&&before?distanceKm(before,last)/(last.minute-before.minute)*60/1.852:0;
  return <div className="scenario-route-map">
    <div className="scenario-map-telemetry"><span><i/>{period==='baseline'?'이전 관측 구간':'평가 시점 '+scenarioTime(data.asOfMinute)}</span><span>{rows.length}개체 · {samples}개 위치 표본</span></div>
    <div ref={host} className="scenario-geographic-map" role="region" aria-label={`${period==='baseline'?'이전':'이후'} 동해 지리 배경 지도 · 합성 항적`}/>
    <div className="scenario-map-legend"><span><i className="air"/>항공 {result.air.eligible}대</span><span><i className="sea"/>선박 {result.sea.eligible}척</span><span><i className="notice"/>가상 경보 구역</span><b>합성 항적</b></div>
    <label className="scenario-map-selector">관측 개체<select aria-label={`${period==='baseline'?'이전':'이후'} 관측 개체 선택`} value={inspected?selected:''} onChange={e=>setSelected(e.target.value)}><option value="">지도에서 선택하거나 목록으로 확인</option>{rows.map(t=><option key={t.id} value={t.id}>{t.id} · {t.kind==='aircraft'?'항공':'선박'}</option>)}</select></label>
    {inspected&&last&&before?<div className="scenario-track-inspector" role="status"><div><strong>{inspected.id}</strong><span>{assessment?.rerouted?'우회 관측':'통과 지속'} · 합성 {inspected.kind==='aircraft'?'ADS-B':'AIS'}</span></div><dl><div><dt>마지막 표본</dt><dd>{scenarioTime(last.minute)}</dd></div><div><dt>위치</dt><dd>{last.latitude.toFixed(4)}°N {last.longitude.toFixed(4)}°E</dd></div><div><dt>대지 속력 / 침로</dt><dd>{speed.toFixed(1)}kt / {Math.round(course(before,last))}°</dd></div><div><dt>{period==='observed'?'관측 최신성':'순항 고도 / 유형'}</dt><dd>{period==='observed'?`${Math.round(data.asOfMinute-last.minute)}분 전` :last.altitudeFt?`${last.altitudeFt.toLocaleString()}ft`:'해상 관측'}</dd></div></dl></div>:<p className="scenario-map-hint">항공기·선박 또는 항적을 누르면 관측 레코드를 확인할 수 있습니다.</p>}
  </div>;
}
