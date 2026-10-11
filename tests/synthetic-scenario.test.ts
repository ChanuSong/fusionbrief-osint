import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_SCENARIO as data, DEFAULT_SCENARIO_OPTIONS as defaults, analyzeSyntheticScenario, crossesZone, distanceKm } from '../shared/synthetic-scenario.ts';

test('synthetic routing analysis derives paired aircraft and ship detours and excludes stale records',()=>{
  const r=analyzeSyntheticScenario(data,defaults);
  assert.deepEqual(r.air,{eligible:8,rerouted:6});assert.deepEqual(r.sea,{eligible:10,rerouted:9});
  assert.equal(r.excluded,2);assert.equal(r.risk,'high');assert.equal(r.attribution,'supported');
  assert(r.meanAirExtraMinutes>0&&r.meanSeaExtraMinutes>r.meanAirExtraMinutes);
});
test('crossing is detected even when segment endpoints lie outside the warning box',()=>{
  assert(crossesZone([{latitude:39,longitude:130,minute:0},{latitude:39,longitude:134,minute:10}],data.zone));
  assert(!crossesZone([{latitude:37,longitude:130,minute:0},{latitude:37,longitude:134,minute:10}],data.zone));
});
test('removing route observations limits the risk to a notice-only potential impact',()=>{
  const r=analyzeSyntheticScenario(data,{...defaults,tracks:false});
  assert.equal(r.risk,'guarded');assert.equal(r.confidence,'low');assert.equal(r.attribution,'unresolved');assert.equal(r.tracks.length,0);
});
test('weather counter-evidence removes causal attribution without hiding observed disruption',()=>{
  const r=analyzeSyntheticScenario(data,{...defaults,weather:true});assert.equal(r.risk,'high');assert.equal(r.attribution,'unresolved');
  assert.equal(r.air.rerouted,6);assert.equal(r.sea.rerouted,9);assert.equal(r.checklist.at(-1)?.state,'alternative');
});
test('twenty republications cannot inflate independent origins or confidence',()=>{
  const r=analyzeSyntheticScenario(data,{...defaults,republications:20}),before=analyzeSyntheticScenario(data,defaults);
  assert.equal(r.documentCount,before.documentCount+20);assert.equal(r.independentOrigins,before.independentOrigins);
  assert.equal(r.confidence,before.confidence);assert.equal(r.risk,before.risk);
});
test('no reviewed warning or tracks leaves the judgment unassessed',()=>{
  const r=analyzeSyntheticScenario(data,{...defaults,tracks:false,notice:false});assert.equal(r.risk,'unassessed');assert.equal(r.independentOrigins,0);
});
test('expired scenario evidence cannot support a current high-risk rating',()=>{
  const r=analyzeSyntheticScenario({...data,asOfMinute:3000},defaults);assert.equal(r.risk,'unassessed');assert.equal(r.air.eligible,0);assert.equal(r.sea.eligible,0);
});
test('untagged input is rejected and duplicated aircraft samples do not add independent entities',()=>{
  assert.throws(()=>analyzeSyntheticScenario({...data,synthetic:false} as never,defaults));
  const r=analyzeSyntheticScenario({...data,tracks:[...data.tracks,data.tracks[0]]},defaults);assert.equal(r.air.eligible,8);
});
test('synthetic telemetry has distinct routes, ordered samples and plausible aircraft and vessel speeds',()=>{
  assert.equal(new Set(data.tracks.map(t=>JSON.stringify(t.observed.map(p=>[p.latitude,p.longitude])))).size,data.tracks.length);
  assert(data.tracks.reduce((n,t)=>n+t.baseline.length+t.observed.length,0)>800);
  const assessment=analyzeSyntheticScenario(data,defaults);
  for(const t of data.tracks){
    for(const period of ['baseline','observed'] as const){
      assert(t[period].length>15);
      for(let i=1;i<t[period].length;i++){
        const before=t[period][i-1],after=t[period][i];assert(after.minute>before.minute);
        const knots=distanceKm(before,after)/(after.minute-before.minute)*60/1.852;
        assert(t.kind==='aircraft'?knots>=350&&knots<=500:knots>=12&&knots<=22);
      }
    }
    if(assessment.tracks.find(a=>a.id===t.id)?.eligible)assert(t.observed[0].minute>=data.zone.startMinute);
  }
});
