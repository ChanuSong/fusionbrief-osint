import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FeatureCollection, Geometry } from 'geojson';
import type { AnalysisRun, Evidence } from '../../shared/types.ts';
import { publicResource } from '../resources.ts';
import 'leaflet/dist/leaflet.css';
interface CountryProperties { ADMIN: string; ISO_A3: string; NAME_KO: string; NAME_ZH: string; LABEL_X: number; LABEL_Y: number; }
const ALIASES: Record<string, string[]> = {
  Taiwan: ['대만','타이완','臺灣','台湾','Taiwan'], China: ['중국','중화인민공화국','中国','China','PRC'],
  'South Korea': ['한국','대한민국','남한','South Korea','Republic of Korea','ROK'], 'North Korea': ['북한','North Korea','DPRK'],
  Japan: ['일본','日本','Japan'], 'United States of America': ['미국','United States','USA','US'],
  Russia: ['러시아','Russia'], Ukraine: ['우크라이나','Ukraine'], Philippines: ['필리핀','Philippines'],
};
export function LocationView({ run, onEvidence }: { run: AnalysisRun; onEvidence: (evidence: Evidence) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>();
  const [referenceCountries, setReferenceCountries] = useState<string[]>([]);
  const locations = run.locations ?? [];
  const entities = run.entities.filter(e => e.type === 'country');
  const dataKey = JSON.stringify({ entities, locations });
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const controller = new AbortController();
    const map = L.map(host.current, { attributionControl: true, scrollWheelZoom: false, minZoom: 1, maxZoom: 10 }).setView([25, 120], 3);
    map.attributionControl.addAttribution('국가 윤곽: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · Public Domain</a>');
    const data: { entities: AnalysisRun['entities']; locations: NonNullable<AnalysisRun['locations']> } = JSON.parse(dataKey);
    fetch(publicResource('maps/countries.geojson'), { signal: controller.signal }).then(response => { if (!response.ok) throw Error('지도 파일을 불러오지 못했습니다.'); return response.json(); }).then((geo: FeatureCollection<Geometry, CountryProperties>) => {
      if (disposed) return;
      const selectedCountries = new Set<string>();
      const matches = (props: CountryProperties) => data.entities.some(e => [props.ADMIN, props.NAME_KO, props.NAME_ZH, ...(ALIASES[props.ADMIN] ?? [])].some(alias => alias?.toLowerCase() === e.label.toLowerCase()));
      L.geoJSON(geo, { style: feature => {
        const active = matches(feature!.properties);
        return { color: active ? '#4d7891' : '#bdcbd3', weight: active ? 1.6 : .7, fillColor: active ? '#d7e3e7' : '#f7f8f6', fillOpacity: 1 };
      }, onEachFeature: (feature, layer) => {
        if (!matches(feature.properties)) return;
        selectedCountries.add(feature.properties.NAME_KO || feature.properties.ADMIN);
        const label = document.createElement('span'); label.textContent = `${feature.properties.NAME_KO || feature.properties.ADMIN} · 관련 국가/지역`;
        layer.bindTooltip(label, { sticky: true });
      } }).addTo(map);
      for (const feature of geo.features.filter(f => ALIASES[f.properties.ADMIN])) {
        const label = document.createElement('span'); label.textContent = feature.properties.NAME_KO || feature.properties.ADMIN;
        L.tooltip({ permanent: true, direction: 'center', className: 'map-country-label' }).setLatLng([feature.properties.LABEL_Y, feature.properties.LABEL_X]).setContent(label).addTo(map);
      }
      setReferenceCountries([...selectedCountries]);
      const markers = data.locations.map((location, index) => L.circleMarker([location.latitude, location.longitude], { radius: 7, color: '#9c602d', fillColor: '#cc9155', fillOpacity: .85, weight: 2 }).addTo(map).on('click', () => setSelected(String(index))));
      markers.forEach((marker, index) => { const label = document.createElement('span'); label.textContent = data.locations[index].name; marker.bindTooltip(label); });
      if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(.3), { maxZoom: 6 });
      else {
        const points = geo.features.filter(f => matches(f.properties)).map(f => L.latLng(f.properties.LABEL_Y, f.properties.LABEL_X));
        if (points.length) map.fitBounds(L.latLngBounds(points).pad(.45), { maxZoom: 5 });
      }
    }).catch(e => { if (!disposed && e.name !== 'AbortError') setError(e.message); });
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(host.current);
    return () => { disposed = true; controller.abort(); observer.disconnect(); map.remove(); };
  }, [dataKey]);
  const location = locations[Number(selected ?? 0)];
  if (!locations.length && !entities.length) return <div className="empty-state compact"><h3>지도에 연결할 지리 근거 없음</h3><p>수집한 자료에 좌표나 관련 국가가 확인되면 표시합니다.</p></div>;
  return <section className="location-panel"><h3>{locations.length ? '공개 원문 좌표와 관련 지역' : '관련 국가·지역'}</h3>
    <p className="map-scope">{locations.length ? '주황색 점: 원문에 기재된 좌표. 각 지점의 대상·시점은 원문에서 확인하세요.' : '색칠한 영역은 보고서의 관련 국가·지역입니다. 군사활동 위치나 봉쇄 구역을 뜻하지 않습니다.'}</p>
    <div ref={host} className="evidence-map" role="region" aria-label="공개 근거 지도" />
    {error ? <p role="status">{error}</p> : null}
    {locations.length ? <div className="map-locations">{locations.map((item, index) => <button key={`${item.name}-${index}`} aria-pressed={Number(selected ?? 0) === index} onClick={() => setSelected(String(index))}>{item.name}</button>)}</div> : <p className="map-reference-countries">{referenceCountries.join(' · ')}</p>}
    {location ? <article className="map-inspector"><b>{location.name}</b><span>{location.latitude}, {location.longitude}</span>{location.evidenceIds.map(id => {
      const evidence = run.evidence.find(e => e.id === id); return evidence ? <button className="text-button" key={id} onClick={() => onEvidence(evidence)}>좌표 원문 확인 [{run.evidence.indexOf(evidence) + 1}]</button> : null;
    })}</article> : null}
    <small>기본 지도는 앱에 저장되어 외부 지도 서버 연결 없이 표시됩니다. 국가 윤곽은 지리 참고용입니다.</small>
  </section>;
}
