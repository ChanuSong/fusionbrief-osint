import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SYNTHETIC_SCENARIO as data, DEFAULT_SCENARIO_OPTIONS, analyzeSyntheticScenario } from '../shared/synthetic-scenario.ts';
import type { ScenarioOptions, SyntheticAssessment } from '../shared/synthetic-scenario.ts';
import { RISK_LABELS, RISK_LEVELS } from '../shared/risk-policy.ts';
import './risk-brief.css';
import './synthetic-scenario.css';
const ScenarioKG=lazy(()=>import('./components/ScenarioKnowledgeGraph.tsx'));

function ScenarioMap({period,result,options}:{period:'baseline'|'observed';result:SyntheticAssessment;options:ScenarioOptions}){
  const x=(lon:number)=>42+(lon-129)/6*560,y=(lat:number)=>270-(lat-37)/4*230;
  const zone=data.zone;
  return <svg viewBox="0 0 640 310" role="img" aria-label={`합성 ${period==='baseline'?'이전':'이후'} 항로 · 실제 위치 아님`}>
    <title>합성 전후 항로 · 실제 지도와 운항 정보가 아님</title><rect width="640" height="310" fill="#f5f9fb"/>
    {[129,130,131,132,133,134,135].map(lon=><g key={lon}><line x1={x(lon)} x2={x(lon)} y1="32" y2="272" stroke="#dce6eb"/><text x={x(lon)} y="293" textAnchor="middle">{lon}°E</text></g>)}
    {[37,38,39,40,41].map(lat=><g key={lat}><line x1="42" x2="602" y1={y(lat)} y2={y(lat)} stroke="#dce6eb"/><text x="32" y={y(lat)+4} textAnchor="end">{lat}°N</text></g>)}
    {options.notice?<><rect x={x(zone.west)} y={y(zone.north)} width={x(zone.east)-x(zone.west)} height={y(zone.south)-y(zone.north)} fill="#dca849" fillOpacity=".17" stroke="#b58836" strokeDasharray="6 4"/><text x={x(132)} y={y(39.85)} textAnchor="middle" fill="#876223">가상 제한구역</text></>:null}
    {options.tracks?data.tracks.filter(t=>result.tracks.find(a=>a.id===t.id)?.eligible).map(t=>{
      const assessment=result.tracks.find(a=>a.id===t.id)!;
      return <polyline key={t.id} points={t[period].map(p=>`${x(p.longitude)},${y(p.latitude)}`).join(' ')}
        fill="none" stroke={period==='baseline'?'#8b9ca8':t.kind==='aircraft'?'#356895':'#b16a30'} strokeWidth={assessment.rerouted?2.3:1.5} opacity=".68" strokeDasharray={period==='baseline'?'5 4':undefined}>
        <title>{t.id} · {assessment.rerouted?'우회':'기존 경로'} · 추가 거리 {Math.round(assessment.extraKm)}km</title></polyline>;
    }):null}<text x="48" y="22" fill="#647987">동해 가상 관측 구역 · 합성 좌표</text>
  </svg>;
}
function EvidencePanel({sourceId,onClose,result}:{sourceId:string;onClose:()=>void;result:SyntheticAssessment}){
  const ref=useRef<HTMLDialogElement>(null),[tab,setTab]=useState<'source'|'graph'>('source'),[focusedSourceId,setFocusedSourceId]=useState(sourceId);
  const source=data.sources.find(s=>s.id===focusedSourceId)!;
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className={`scenario-evidence${tab==='graph'?' scenario-evidence-graph':''}`} onCancel={onClose}>
    <header><div><span className="scenario-label">합성 시나리오 원문</span><h2>{source.title}</h2></div><button className="secondary-button" onClick={onClose}>닫기</button></header>
    <div className="scenario-evidence-tabs"><button aria-pressed={tab==='source'} onClick={()=>setTab('source')}>원문·관측 레코드</button><button aria-pressed={tab==='graph'} onClick={()=>setTab('graph')}>근거 그래프</button></div>
    {tab==='source'?<><p>{source.id} · {source.origin} · 시나리오 판본 {data.version}</p><blockquote>{source.body}</blockquote>
      {source.id==='SIM-N1'&&result.publications.some(p=>p.derivedFrom===source.id)?<details><summary>동일 경보의 합성 뉴스·SNS 재전파 {result.publications.filter(p=>p.derivedFrom===source.id).length}건 · 원출처 1개로 묶음</summary><ul>{result.publications.filter(p=>p.derivedFrom===source.id).map(p=><li key={p.id}>{p.id} · {p.title} → {p.derivedFrom} · {p.origin}</li>)}</ul></details>:null}
      {['SIM-A1','SIM-M1'].includes(source.id)?<><h3>검토 결과와 입력 레코드</h3><div className="scenario-table"><table><thead><tr><th>개체</th><th>최신성</th><th>우회</th><th>추가 거리</th><th>추가 시간 추정</th></tr></thead><tbody>{result.tracks.filter(t=>t.sourceId===source.id).map(t=><tr key={t.id}><td>{t.id}</td><td>{t.fresh?'통과':'오래된 수신 · 제외'}</td><td>{t.eligible?(t.rerouted?'확인':'미확인'):'대조 제외'}</td><td>{Math.round(t.extraKm)}km</td><td>{Math.round(t.extraMinutes)}분</td></tr>)}</tbody></table></div><details><summary>합성 입력 JSON · 좌표와 시각 확인</summary><pre>{JSON.stringify(data.tracks.filter(t=>t.sourceId===source.id),null,2)}</pre></details></>:null}</>:
      <div className="scenario-proof-graph"><Suspense fallback={<p>근거 그래프를 불러오고 있습니다.</p>}><ScenarioKG result={result} onSource={id=>{setFocusedSourceId(id);setTab('source');}}/></Suspense></div>}
    <p className="scenario-evidence-footer">모든 노드와 레코드는 합성입니다. 실제 북한 사건·공식 경보·실제 운항을 나타내지 않습니다.</p>
  </dialog>;
}
export default function SyntheticScenario(){
  const [options,setOptions]=useState<ScenarioOptions>({...DEFAULT_SCENARIO_OPTIONS}),[sourceId,setSourceId]=useState<string>();
  const result=useMemo(()=>analyzeSyntheticScenario(data,options),[options]);
  const toggle=(key:'tracks'|'notice'|'weather')=>setOptions(old=>({...old,[key]:!old[key]}));
  const cite=(id:string)=><button className="scenario-citation" onClick={()=>setSourceId(id)}>[{id}]</button>;
  const download=()=>{const raw=JSON.stringify({scenario:data,options,assessment:result},null,2),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fusionbrief-synthetic-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section id="report-synthetic" tabIndex={-1} className="scenario-shell scenario-embedded">
    <div className="scenario-provenance"><span className="scenario-label">합성 관측 · 조건부 분석</span><p>북한의 동해 시험경보와 운항 우회를 가정한 보강 분석입니다. 아래 합성 근거는 실제 사건의 사실 판단과 구분합니다.</p></div>
    <div className="scenario-document">
      <section id="scenario-conclusion"><p className="eyebrow">KEY JUDGMENTS</p><h2>동해 제한구역과 민간 운항 영향</h2>
      <div className={`scenario-main-conclusion risk-${result.risk}`}><div><strong>민간 운항 차질 위험 · {RISK_LABELS[result.risk]}</strong><span>근거 신뢰도: {result.confidence==='medium'?'중간':'낮음'} · 합성 시나리오 내</span></div><h3>{result.headline}</h3><p>{result.explanation} {result.activeSourceIds.filter(id=>id!=='SIM-W1').map(id=><span key={id}>{cite(id)}</span>)}</p></div>
      <div className="scenario-risk-scale" aria-label={`민간 운항 차질 위험 ${RISK_LABELS[result.risk]}`}>{RISK_LEVELS.map(level=><div key={level} className={`risk-${level} ${level===result.risk?'selected':''}`}><span>{RISK_LABELS[level]}</span>{level===result.risk?<b>현재 시나리오</b>:null}</div>)}</div>
      <div className="scenario-metrics"><div><strong>{result.air.rerouted}/{result.air.eligible}</strong><span>검토한 항공기 우회</span><small>추가 이동 약 {result.meanAirExtraMinutes}분 {cite('SIM-A1')}</small></div><div><strong>{result.sea.rerouted}/{result.sea.eligible}</strong><span>유효 선박 관측 우회</span><small>추가 이동 약 {result.meanSeaExtraMinutes}분 {cite('SIM-M1')}</small></div><div><strong>{result.excluded}</strong><span>오래된 수신 제외</span><small>과거 위치를 현재로 오인하지 않음</small></div></div>
      <p className="scenario-time-method">추가 시간은 전후 항적의 구면 거리 차이와 이전 평균 이동 속도로 계산한 추정입니다. 실제 도착 지연 측정값이 아닙니다. 표본 내 우회 비율이며 전체 교통량으로 일반화하지 않습니다.</p>
      <div className="scenario-separate-judgments"><div><strong>시험경보와의 연관성</strong><span>{result.attribution==='supported'?'공간·시각 정합 · 인과 미확정':'원인 귀속 유보'}</span><p>{options.weather?'동일 시각·해역의 강풍이라는 경쟁 설명이 있습니다.':options.notice?'경보 발효 구역과 이후 항로 변화가 맞물립니다.':'경보 원문을 검토에서 제외했습니다.'} {options.weather?cite('SIM-W1'):options.notice?cite('SIM-N1'):null}</p></div><div><strong>미사일 발사·군사 공격</strong><span>판단 유보</span><p>민간 우회나 시험경보는 발사 실행·무기 성능·공격 의도를 입증하지 않습니다.</p></div></div>
      <button className="scenario-graph-trigger" onClick={()=>setSourceId(options.notice?'SIM-N1':'SIM-A1')}>이 판단의 근거 경로 보기 →</button>
      </section>
      <section id="scenario-map"><p className="eyebrow">TEMPORAL & SPATIAL CROSS-CHECK</p><h3>경보 이전과 이후를 같은 구역에서 대조합니다</h3><p>최신성 검사를 통과한 관측만 표시합니다. 회색은 이전 경로, 파란색은 항공, 황색은 선박입니다.</p><div className="scenario-map-grid"><figure><figcaption>이전 · 제한구역 통과 항로</figcaption><ScenarioMap period="baseline" result={result} options={options}/></figure><figure><figcaption>이후 · 발효기간의 우회 항로</figcaption><ScenarioMap period="observed" result={result} options={options}/></figure></div>
      <ol className="scenario-timeline"><li><b>T+0</b><span>가상 제한 경보 발효</span></li><li><b>T+2.4h</b><span>선박 우회 구간 관측</span></li><li><b>T+12h</b><span>항공·해상 대조 및 평가</span></li><li><b>T+24h</b><span>경보 만료 · 연장 여부 재확인</span></li></ol></section>
      <section id="scenario-checks"><p className="eyebrow">CRITERIA & EVIDENCE</p><h3>기준 → 관측 → 판단</h3><div className="scenario-table"><table><thead><tr><th>판단 기준</th><th>대조 결과</th><th>해석·정보 공백</th><th>원문</th></tr></thead><tbody>{result.checklist.map(c=><tr key={c.label}><th>{c.label}</th><td><span className={`scenario-check-${c.state}`}>{c.state==='met'?'확인':c.state==='alternative'?'경쟁 설명':'미확인'}</span></td><td>{c.reason}</td><td>{c.sourceIds.map(id=><span key={id}>{cite(id)}</span>)}</td></tr>)}</tbody></table></div><p className="scenario-time-method">공식 교전수칙이나 법적 기준이 아닌, 이 합성 사례의 분석 지표입니다. 가상 원출처 간 독립성은 시나리오 설정이며 실제 기관 공신력을 뜻하지 않습니다.</p></section>
      <section id="scenario-conditions"><p className="eyebrow">REASSESSMENT</p><h3>근거가 달라지면 판단도 다시 계산합니다</h3><div className="scenario-condition-controls"><label><input type="checkbox" checked={options.tracks} onChange={()=>toggle('tracks')}/>항공·선박 항적 사용</label><label><input type="checkbox" checked={options.notice} onChange={()=>toggle('notice')}/>경보 원문 사용</label><label><input type="checkbox" checked={options.weather} onChange={()=>toggle('weather')}/>기상 반대 근거 포함</label><label>경보 재전파 기사 추가<select aria-label="경보 재전파 기사 추가" value={options.republications} onChange={e=>setOptions(old=>({...old,republications:Number(e.target.value)}))}><option value={0}>0건</option><option value={8}>8건</option><option value={20}>20건</option></select></label></div>
      <p className="scenario-origin-count"><b>문서 {result.documentCount}개 → 가상 원출처 {result.independentOrigins}개</b> · 같은 경보를 옮긴 기사가 늘어도 독립 원출처 수와 신뢰도는 자동으로 올라가지 않습니다.</p><p className="scenario-condition-result" role="status">{!options.tracks?'항적 제외 → 실제 차질 관측이 빠져 위험을 잠재 수준으로 제한합니다.':options.weather?'기상 반대 근거 추가 → 운항 차질 위험은 유지하지만, 시험경보로의 원인 귀속은 유보합니다.':!options.notice?'경보 원문 제외 → 발효기간과 구역의 원문 대조가 빠져 지속 위험의 판단을 낮춥니다.':'경보·항공·해상 대조 → 제한구역·기간과 우회 관측의 정합을 확인합니다.'}</p></section>
      <section id="scenario-actions"><p className="eyebrow">RECOMMENDED NEXT ACTIONS</p><h3>결론에서 다음 확인으로</h3><ol className="scenario-actions"><li><div><span>즉시 · 분석가</span><h4>항행 경보 원문과 유효기간 확인</h4><p>항공 FIR NOTAM·해상 NAVAREA의 시각·구역·발신 주체와 연장 여부를 원문으로 대조합니다.</p><small>완료 조건: 구역·발효·만료·변경 이력 일치 확인 / 불일치하면 지속 위험 재평가</small></div></li><li><div><span>30분 내 · 교통 분석 담당</span><h4>동일 표본의 우회 지속 여부 재관측</h4><p>신선한 항적만 비교하고, 이전 경로 복귀·우회 비율·추가 거리 추세를 확인합니다.</p><small>재평가 신호: 우회 감소 또는 제한 연장 / 현재 표본을 전체 항공·해상 운항으로 확대 해석하지 않음</small></div></li><li><div><span>병행 · 분석가</span><h4>기상·관제·통상 훈련이라는 경쟁 설명 대조</h4><p>{options.weather?'동시간 강풍을 포함해 우회 원인을 다시 검토합니다.':'기상 자료와 관제 공지를 확보해 시험경보 외의 설명을 검토합니다.'} 미사일 발사 실행은 별도 탐지·발표 자료로 확인합니다.</p><small>완료 조건: 경쟁 원인의 공간·시각 대조 / 공격 의도 판단에는 별도 근거 필요</small></div></li></ol>
      <div className="scenario-outlook"><strong>향후 24시간 전망 · 조건부</strong><p>{options.notice&&options.tracks?'경보가 유지되는 잔여 12시간에는 우회가 지속될 수 있습니다. T+24h 만료 후 항로가 복귀하면 운항 위험을 낮추고, 경보가 연장되면 영향 기간을 다시 평가합니다.':'경보 유효기간 또는 전후 관측이 빠져 영향 지속 시간을 판단하기 어렵습니다. 먼저 누락된 원문·항적을 확인합니다.'}</p></div></section>
      <section className="scenario-method"><details><summary>분석 방법·실행 기록·합성 입력</summary><p>미리 생성한 합성 입력에 좌표 교차·수신 최신성·구면 거리·원출처 중복·제품 위험 행렬을 실제로 계산합니다. 새로운 공개 수집이나 LLM 호출을 수행한 것으로 표시하지 않습니다.</p><p>운항 영향 지표: 양쪽 표본에서 절반 이상 우회가 관측되고 경보가 발효 중이면 가능성 ‘높음’ × 영향 ‘중대’로 분류합니다. 입력·기준은 이 시연을 위한 제품 정의이며 검증된 운항 예측 모델이나 공식 경보가 아닙니다.</p><ol>{result.trace.map(t=><li key={t.stage}><b>{t.stage}</b> · {t.result}</li>)}</ol><button className="secondary-button" onClick={download}>합성 입력·분석 결과 JSON 저장</button></details></section>
    </div>{sourceId?<EvidencePanel key={sourceId} sourceId={sourceId} result={result} onClose={()=>setSourceId(undefined)}/>:null}
  </section>;
}
