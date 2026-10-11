import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenSky, parseAdsb, parseAis, parsePort, parseSocial, parseShipPosition, parseShipSummary, crossCheckAircraft, observationDocuments } from '../server/observation-feeds.ts';
import type { ObservationBundle, ObservationFeed } from '../shared/observation-feeds.ts';

test('aircraft collection preserves actual observation times and rejects absent or out-of-region coordinates',()=>{
  const rows=[['abcdef','TEST123 ','Japan',1791682680,null,129,37,1000,false,100],['null','NONE','',null,null,null,null],['foreign','OTHER','',1791682680,null,25,60]];
  const records=parseOpenSky({time:1791682680,states:rows});assert.equal(records.length,1);assert.equal(records[0].observedAt,'2026-10-11T01:38:00.000Z');
  assert.equal(records[0].altitudeM,1000);assert.equal(records[0].speedKnots,194);
  const adsb=parseAdsb({now:1791682680000,ac:[{hex:'ABCDEF',flight:'TEST123',lat:37,lon:129,seen_pos:2,alt_baro:10000,gs:300}]});
  assert.equal(adsb[0].id,'abcdef');assert.equal(adsb[0].observedAt,'2026-10-11T01:37:58.000Z');assert.equal(adsb[0].altitudeM,3048);
});
test('location comparisons distinguish different positions and noncontemporaneous observations',()=>{
  const base:Omit<ObservationFeed,'id'|'records'>={module:'aviation',kind:'ads-b',state:'collected',scope:'regional',provider:'Test',title:'Test',region:'Test',endpoint:'https://example.com',reference:'https://example.com',collectedAt:'2026-10-11T01:38:00Z',count:1,limitations:[]};
  const a:ObservationFeed={...base,id:'opensky',records:[{id:'abc',label:'Flight',latitude:37,longitude:129,observedAt:'2026-10-11T01:38:00Z'}]};
  const b:ObservationFeed={...base,id:'adsblol',records:[{id:'abc',label:'Flight',latitude:37,longitude:129.01,observedAt:'2026-10-11T01:38:02Z'}]};
  assert.equal(crossCheckAircraft([a,b])[0].status,'consistent');b.records[0].latitude=40;assert.equal(crossCheckAircraft([a,b])[0].status,'different');
  b.records[0].observedAt='2026-10-11T01:40:00Z';assert.equal(crossCheckAircraft([a,b])[0].status,'time-mismatch');
});
test('vessel port records retain declared times without inventing an AIS position',()=>{
  const cells=['1','Terminal','외항','CALL','Cargo','2026-1','Agency','VESSEL','KR','1000','2026-10-05 08:05','2026-10-05 21:50','CN-SHK','KR-PUS'];
  const html=`<table><caption>컨테이너터미널 입출항현황</caption><tbody><tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr></tbody></table>`;
  const r=parsePort(html)[0];assert.equal(r.label,'VESSEL');assert.equal(r.fields?.['입항일시 (원문)'],'2026-10-05 08:05');assert.equal(r.latitude,undefined);assert.equal(r.observedAt,undefined);
  const ais=parseAis({features:[{geometry:{coordinates:[25,60]},properties:{mmsi:230123456,timestampExternal:1791682680000,sog:5}}]});
  assert.equal(ais[0].latitude,60);assert.equal(ais[0].id,'230123456');
});
test('social collection retains the exact attributed post and filters unrelated material',()=>{
  const post={uri:'at://did:test/app.bsky.feed.post/abc',author:{handle:'38north.org'},record:{text:'North Korea satellite analysis',createdAt:'2026-09-30T10:00:00Z'}};
  const data={feed:[{post},{post},{post:{...post,uri:post.uri+'2',record:{...post.record,text:'Unrelated personal conversation'}}}]};
  const records=parseSocial(data);assert.equal(records.length,1);assert.equal(records[0].text,post.record.text);assert.equal(records[0].url,'https://bsky.app/profile/38north.org/post/abc');
});
test('out-of-region AIS never enters the Korean event source context',()=>{
  const feed:ObservationFeed={id:'digitraffic',module:'maritime',kind:'ais',state:'collected',scope:'outside-region',provider:'Fintraffic',title:'AIS',region:'Finland',endpoint:'https://meri.digitraffic.fi',reference:'https://www.digitraffic.fi',collectedAt:'2026-10-11T01:38:00Z',count:1,records:[{id:'123',label:'Vessel'}],limitations:[]};
  const bundle:ObservationBundle={collectedAt:feed.collectedAt,feeds:[feed],crossChecks:[],method:'Test',includedInReportAssessment:false};
  assert.deepEqual(observationDocuments(bundle),[]);
});
test('public vessel AIS retains the provider timestamp without inventing a timezone or a current position',()=>{
  const html='<p>The current position of TEST SHIP is in Yellow Sea with coordinates 37.33850° / 126.42593° as reported on 2026-10-06 21:47 by AIS. The vessel TEST SHIP (IMO: 9792498, MMSI: 538007311)</p>';
  const r=parseShipPosition(html,'https://example.com/vessel');assert.equal(r.id,'538007311');assert.equal(r.latitude,37.33850);assert.equal(r.observedAt,undefined);assert.equal(r.fields?.['수신 시각 (원문)'],'2026-10-06 21:47');
  const summary=parseShipSummary('<p>The current position of TEST SHIP is at East Asia reported 6 min ago by AIS. TEST SHIP (IMO 9792498, MMSI 538007311)</p>','https://example.com/summary');
  assert.equal(summary.latitude,undefined);assert.equal(summary.fields?.['수신 시각 (원문)'],'6 min ago (수집 당시 표기)');
});
