import { SourcePortfolio } from './SourcePortfolio.tsx';
import type { AnalysisRun, CriterionBasis, Evidence } from '../../shared/types.ts';
import { lazy, Suspense, useMemo, useState } from 'react';
import {GitBranch} from 'lucide-react';
import { assessmentPaths, buildAnalysisOntology } from '../../shared/analysis-ontology.ts';
import { AUTHORITY_LABEL, CONFIDENCE_LABEL, CRITERION_STATUS, DIMENSION_LABEL, OBSERVATION_LABEL, reportContent } from '../../shared/report-content.ts';
import { SOURCE_MODULES } from '../../shared/source-modules.ts';
import { mediaURL, reportExportURL } from '../resources.ts';
import { RecommendedActions, RiskChart, RiskConclusion } from './RiskBrief.tsx';
import { FusionInsightBrief } from './FusionInsightBrief.tsx';
import { SYNTHETIC_SCENARIO, DEFAULT_SCENARIO_OPTIONS, analyzeSyntheticScenario } from '../../shared/synthetic-scenario.ts';
import type { ScenarioOptions } from '../../shared/synthetic-scenario.ts';
import type { ScenarioProof } from '../SyntheticScenario.tsx';

const SyntheticImpact=lazy(()=>import('../SyntheticScenario.tsx'));

export function FrameworkAnalysis({ run, onEvidence, onBasis, onRevalidate, busy, onGraph }: {
  run: AnalysisRun; onEvidence: (e: Evidence) => void; onBasis: (b: CriterionBasis) => void;
  onRevalidate: () => Promise<void>; busy: boolean;
  onGraph?: (ids:string[],sentence:string)=>void;
}) {
  const framework = run.analysis!;
  const ontology = useMemo(() => buildAnalysisOntology(run), [run]);
  const content = reportContent(run);
  const pending = framework.verification !== 'verified';
  const riskPending = !!run.risk && run.risk.verification !== 'verified';
  const fusionCase = run.id === '36c8ba1a-bf51-44d5-a240-d7c0e0f8afce';
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOptions>({ ...DEFAULT_SCENARIO_OPTIONS });
  const [scenarioProof, setScenarioProof] = useState<ScenarioProof>();
  const scenarioResult = useMemo(() => fusionCase ? analyzeSyntheticScenario(SYNTHETIC_SCENARIO, scenarioOptions) : undefined, [fusionCase, scenarioOptions]);
  const forecast = framework.dimension === 'forecast';
  const succession = /후계|승계|계승|succession/i.test(run.question);
  const riskLead = !pending && run.risk?.verification === 'verified' && run.risk.overall.level !== 'unassessed' ? run.risk.overall : undefined;
  const lead = riskLead ?? framework.judgment;
  const graphLink=(ids:string[],sentence:string)=>onGraph && ids.some(id=>run.claims.some(c=>c.id===id)) ? <button className="judgment-graph-trigger" onClick={()=>onGraph(ids,sentence)}><GitBranch size={14}/>근거 연결 보기</button> : null;
  const citations = (ids: string[]) => <span className="answer-citations">{[...new Set(ids.flatMap(id => run.claims.find(c => c.id === id)?.evidenceIds ?? []))].sort((a,b) => run.evidence.findIndex(e => e.id === a) - run.evidence.findIndex(e => e.id === b)).map(id => {
    const e = run.evidence.find(e => e.id === id);
    return e ? <button key={id} onClick={() => onEvidence(e)} aria-label={`사건 인용 ${run.evidence.indexOf(e) + 1} 원문 보기`}>[{run.evidence.indexOf(e) + 1}]</button> : null;
  })}</span>;
  const basisCitations = (ids: string[]) => <span className="answer-citations">{framework.criteria.filter(c => ids.includes(c.id)).flatMap(c => c.basis.filter(b => b.verified)).map(b =>
    <button key={b.id} onClick={() => onBasis(b)} aria-label={`기준 인용 ${b.locator} 원문 보기`}>기준 · {b.locator || run.sources.find(s => s.id === b.sourceId)?.publisher}</button>)}</span>;
  const n = framework.counts;
  const segments = [{ label: '충족', value: n.met, className: 'met' }, { label: '부분 확인', value: n.partial, className: 'partial' },
    { label: '미확인', value: n.unknown, className: 'unknown' }, { label: '불충족', value: n.notMet, className: 'not-met' }, { label: '적용 제외', value: n.notApplicable, className: 'not-applicable' }].filter(s => s.value > 0);
  const leadDetails = <>
      <p className="framework-lead">{riskLead ? riskLead.summary : framework.judgment.text} {citations(lead.claimIds)} {graphLink(lead.claimIds,riskLead ? riskLead.summary : framework.judgment.text)}</p>
      <p className={`confidence-reason confidence-${lead.confidence.level}`}><strong>신뢰도 {CONFIDENCE_LABEL[lead.confidence.level]}</strong> · {lead.confidence.reason}</p>
      {framework.judgment.limitations.length ? <div className="document-judgment-limits"><h3>판단의 한계</h3><ul className="framework-material-gaps">{framework.judgment.limitations.slice(0,3).map(l => <li key={l}>{l}</li>)}</ul>{framework.judgment.limitations.length>3 ? <details className="print-disclosure"><summary>추가 한계 {framework.judgment.limitations.length-3}건 확인</summary><ul className="framework-material-gaps">{framework.judgment.limitations.slice(3).map(l=><li key={l}>{l}</li>)}</ul></details> : null}</div> : null}
  </>;
  return <div className="framework-report">
    <section id="report-answer" tabIndex={-1} className="answer-section framework-conclusion" aria-labelledby="answer-title">
      <div className="answer-heading"><h2 id="answer-title">핵심 판단</h2></div>
      <p className="framework-dimension">{DIMENSION_LABEL[framework.dimension]}에 대한 판단</p>
      <RiskConclusion run={run} />
      {fusionCase && !pending && !riskPending && scenarioResult ? <FusionInsightBrief result={scenarioResult} options={scenarioOptions} citations={citations} graphLink={graphLink} onProof={(sourceId,view='source')=>setScenarioProof({sourceId,view})}/> : null}
      {fusionCase && !pending && !riskPending ? <details className="fusion-lead-details"><summary>종합 판단·신뢰도·자료 한계 확인</summary>{leadDetails}</details> : leadDetails}
      {pending || riskPending ? <div className="framework-revalidate" role="status"><p>{!pending ? '변경된 근거로 위험 평가와 권장 액션을 다시 검증해야 합니다.' : framework.verification === 'pending' ? '원출처 검토가 변경되었습니다. 변경된 근거로 기준과 결론을 다시 대조해야 합니다.' : '독립 검증을 완료하지 못했습니다. 기준과 근거를 다시 대조해야 합니다.'}</p><button className="primary-button" disabled={busy} onClick={() => void onRevalidate()}>{busy ? '재검증 중…' : '기준별 판단 재검증'}</button></div> : null}
    </section>
    {!pending && framework.keyJudgments?.length ? <section className="framework-section" aria-labelledby="key-judgments-title"><div className="answer-heading"><h2 id="key-judgments-title">주요 판단</h2><span>관측 · 해석 · 전망의 근거</span></div><ol className="intel-key-judgments">{framework.keyJudgments.map((item,i)=><li key={i}><span className="intel-judgment-number">({i+1})</span><div><h3>{item.label}</h3><p>{item.text} {citations(item.claimIds)} {graphLink(item.claimIds,item.text)}</p><small>근거 신뢰도 {CONFIDENCE_LABEL[item.confidence.level]} · {item.confidence.reason}</small></div></li>)}</ol></section> : null}
    <RiskChart run={run} onEvidence={onEvidence} />
    {fusionCase && scenarioResult ? <Suspense fallback={<p>운항 영향 보강 분석을 불러오고 있습니다.</p>}><SyntheticImpact result={scenarioResult} options={scenarioOptions} onOptionsChange={setScenarioOptions} proof={scenarioProof} onProofChange={setScenarioProof}/></Suspense>:null}
    <SourcePortfolio run={run} onEvidence={onEvidence} />
    {content.criteria.length ? <section id="report-criteria" tabIndex={-1} className="framework-section" aria-labelledby="criteria-title">
      <div className="answer-heading"><h2 id="criteria-title">{forecast ? '판단 지표와 근거 대조' : '판단 기준과 사건 대조'}</h2><span>{succession ? '후보 육성 · 공식 지명 · 실제 권한을 구분' : '기준의 출처 · 적용 조건 · 관측 근거'}</span></div>
      {forecast ? <div className="intel-indicator-comparison"><table><caption>표 1. 판단 지표별 확인 수준과 근거</caption><thead><tr><th scope="col">판단 지표</th><th scope="col">확인 수준</th><th scope="col">근거 대조</th></tr></thead><tbody>{content.criteria.map(c=>{
        const a=content.assessments.find(item=>item.criterionId===c.id);
        return <tr key={c.id}><th scope="row">{c.label}{c.critical ? <small>핵심 전제</small> : null}</th><td><span className={`criterion-status ${pending || a?.verification!=='verified' ? 'unknown' : a.status}`}>{pending ? '재검증 대기' : a ? CRITERION_STATUS[a.status] : '미확인'}</span></td><td>{pending ? '이전 대조 · 변경된 근거로 재검증이 필요합니다. ' : ''}{a?.reasoning ?? '대조 결과 없음'} {citations(a?.claimIds ?? [])}</td></tr>;
      })}</tbody></table><p>지표는 근거를 정리하는 분석 틀입니다. 충족 개수를 미래 사건의 발생 확률로 환산하지 않습니다.</p></div> : null}
      <details className="criterion-details" open={forecast ? undefined : true}><summary>{forecast ? '지표 정의·기준 원문·한계 확인' : '기준별 상세 대조'}</summary><div className="criterion-list">{content.criteria.map(c => {
        const a = content.assessments.find(a => a.criterionId === c.id);
        const paths = assessmentPaths(run, c.id, ontology);
        return <article className={`criterion-card ${a?.status ?? 'unknown'}`} key={c.id}>
          <div className="criterion-heading"><div><span className="eyebrow">{DIMENSION_LABEL[c.dimension]}{c.perspective ? ` · ${c.perspective}` : ''}{c.critical ? ' · 핵심 전제' : ''}</span><h3>{c.label}</h3></div>
            {a ? <span className={`criterion-status ${a.verification === 'pending' ? 'unknown' : a.status}`}>{a.verification === 'pending' ? '재검증 대기' : CRITERION_STATUS[a.status]}</span> : null}</div>
          <p className="criterion-definition">{c.definition}</p>
          <div className="criterion-basis">{c.basis.filter(b => b.verified).map(b => {
            const s = run.sources.find(s => s.id === b.sourceId);
            return <button className="basis-reference" key={b.id} onClick={() => onBasis(b)} aria-label={`${c.label} 기준 원문 보기`}><strong>{b.locator || s?.title}</strong><span>{s?.publisher} · {AUTHORITY_LABEL[b.authority]}{b.version ? ` · ${b.version}` : ''}{b.versionStatus === 'unconfirmed' ? ' · 판본 미확인' : ''}</span><small>{s?.knowledge ? `${s.knowledge.reuse === 'reused' ? '보존 판본 재사용' : '기준 원문 보존'}${s.knowledge.refreshState !== 'fresh' ? ' · 원문 재확인 필요' : ''} · ` : ''}인용 원문 확인 ↗</small></button>;
          })}</div>
          <p className="criterion-applicability">{c.basisStatus === 'proposed' ? '기준 정의 검증 미완료 · ' : ''}{c.basisKind === 'analyst-derived' ? '분석가 구성 지표 · ' : ''}적용 {c.applicability.status === 'confirmed' ? '확인' : c.applicability.status === 'conditional' ? '조건부' : c.applicability.status === 'not-applicable' ? '제외' : '미확인'} · {c.applicability.reason}</p>
          {a ? <div className="criterion-application"><strong>사건 대조</strong><p>{a.reasoning} {citations(a.claimIds)}</p>
            {paths.length ? <details className="reasoning-trace"><summary>판단의 근거 연결 · {paths.length}개 인용</summary><p>{c.label} → 기준 대조 → 사건 주장 → 원문 인용</p><ul>{paths.map(path => {
              const e = run.evidence.find(e => e.id === path.evidenceId)!;
              return <li key={path.evidenceId}><span>{run.claims.find(claim => claim.id === path.claimId)?.statement}</span><button className="basis-reference" onClick={() => onEvidence(e)}><strong>{run.sources.find(s => s.id === path.sourceId)?.title}</strong><small>{e.stance === 'contradicts' ? '반대 근거' : '지지 근거'} · 인용 원문 확인 ↗</small></button></li>;
            })}</ul></details> : null}
            {a.limitations.length || a.nextCheck ? <details><summary>한계와 다음 확인</summary>{a.limitations.map(l => <p key={l}>{l}</p>)}{a.nextCheck ? <p>다음 확인: {a.nextCheck}</p> : null}</details> : null}</div> : null}
        </article>;
      })}</div></details>
    </section> : null}
    {content.observations.length ? <section id="report-behaviors" tabIndex={-1} className="framework-section" aria-labelledby="behaviors-title">
      <div className="answer-heading"><h2 id="behaviors-title">{forecast ? '주요 관측과 반대 근거' : '확인한 행위와 사건'}</h2><span>기사 수와 사건 수를 구분합니다</span></div>
      {n.total ? <div className="behavior-summary"><p>{forecast ? '관측 지표' : '행위 기준'} <strong>{n.total}종 중 {n.met}종 충족</strong>{n.partial ? ` · ${n.partial}종 부분 확인` : ''}</p>
        <div className="behavior-bar" role="img" aria-label={segments.map(s => `${s.label} ${s.value}종`).join(', ')}>{segments.map(s => <span key={s.className} className={s.className} style={{ flex: s.value }} />)}</div>
        <div className="behavior-legend">{segments.map(s => <span key={s.className} className={s.className}><i />{s.label} {s.value}</span>)}</div>
        <small>분석 계획의 관측 지표 집계입니다. 이 비율은 {forecast ? '승계 가능성' : '봉쇄 확률'}이나 법적 성립 점수가 아닙니다.</small></div> : null}
      <p className="behavior-event-count">지지하는 구체적 관측·보고 <strong>{n.events}건</strong>{n.announced ? <> · 발표·예정 <strong>{n.announced}건</strong></> : null}{n.independentOrigins ? <> · 독립성 확인 원출처 {n.independentOrigins}묶음</> : null}</p>
      <ol className="behavior-observations">{content.observations.map(o => <li key={o.id}><span className={`observation-kind ${o.kind}`}>{OBSERVATION_LABEL[o.kind]}</span><div><p>{o.label} {citations(o.claimIds)}</p><small>{o.criterionIds.map(id => framework.criteria.find(c => c.id === id)?.label).filter(Boolean).join(' · ')}{o.criterionEffects?.some(e=>e.direction==='contradicts') ? ' · 반대 근거 포함' : o.criterionEffects?.every(e=>e.direction==='context') ? ' · 맥락 자료' : ''}{o.sameEventAs ? ' · 같은 사건으로 중복 제외' : ''}</small></div></li>)}</ol>
    </section> : null}
    {content.events.length > 1 ? <section id="report-chronology" tabIndex={-1} className="framework-section" aria-labelledby="chronology-title"><div className="answer-heading"><h2 id="chronology-title">사건 순서</h2><span>원문에서 확인한 시점</span></div><ol className="framework-chronology">{content.events.map((event, i) => <li key={i}><time>{event.date}</time><p>{event.label} {citations(run.claims.filter(c => c.evidenceIds.some(id => event.evidenceIds.includes(id))).map(c => c.id))}</p></li>)}</ol></section> : null}
    {run.imagery?.some(f=>f.verified) ? <section id="report-imagery" className="framework-section" aria-labelledby="imagery-title"><div className="answer-heading"><h2 id="imagery-title">공개 이미지 대조</h2><span>원본 픽셀 판독 · 별도 검증</span></div><div className="intel-imagery">{run.imagery.filter(f=>f.verified).map((f, i)=>{
      const source=run.sources.find(s=>s.id===f.sourceId);const media=source?.media?.find(m=>m.hash===f.mediaHash);
      if(!source || !media)return null;
      const evidence=run.evidence.find(e=>e.sourceId===source.id);
      return <figure key={f.mediaHash}><a href={mediaURL(f.mediaHash)} target="_blank" rel="noreferrer" aria-label="보존한 이미지 원본 보기"><img src={mediaURL(f.mediaHash)} alt={f.description} loading="lazy" /></a><figcaption><small><strong>그림 {i + 1}.</strong> {source.attribution?.publisher ?? source.publisher} · {source.publishedAt || '발행일 미확인'} · {media.credit}</small><p>{f.description}</p><p>{f.relevance}</p>{f.identityQuote ? <details className="print-disclosure"><summary>인물 귀속에 사용한 본문</summary><blockquote>{f.identityQuote}</blockquote></details> : null}<details className="print-disclosure"><summary>판독 한계와 원본 보존</summary><ul>{f.limitations.map(l=><li key={l}>{l}</li>)}</ul><small>SHA-256 {f.mediaHash}</small></details>{evidence ? <button className="text-button" onClick={()=>onEvidence(evidence)}>본문·출처 대조</button> : <a href={source.url} target="_blank" rel="noreferrer">배포 원문</a>}</figcaption></figure>;
    })}</div></section> : null}
    {framework.perspectives.length ? <section id="report-perspectives" tabIndex={-1} className="framework-section" aria-labelledby="perspectives-title"><div className="answer-heading"><h2 id="perspectives-title">당사자 기준과 입장</h2></div><div className="framework-perspectives">{framework.perspectives.map(p => <article key={p.label}><h3>{p.label}</h3><p>{p.text} {citations(p.claimIds)} {basisCitations(p.criterionIds)}</p></article>)}</div></section> : null}
    {framework.alternatives.length ? <section id="report-alternatives" tabIndex={-1} className="framework-section" aria-labelledby="alternatives-title"><div className="answer-heading"><h2 id="alternatives-title">경쟁 설명과 다음 확인</h2></div>{framework.alternatives.map(p => <article className="framework-alternative" key={p.label}><h3>{p.label}</h3><p>{p.text} {citations(p.claimIds)}</p><p className="criterion-applicability">다음 확인: {p.nextCheck}</p></article>)}</section> : null}
    {!pending && framework.outlook?.length ? <section id="report-outlook" className="framework-section" aria-labelledby="outlook-title"><div className="answer-heading"><h2 id="outlook-title">전망과 변화 징후</h2><span>조건부 분석 · 향후 확인할 신호</span></div><div className="intel-outlook">{framework.outlook.map((item,i)=><article key={i}><div className="criterion-heading"><h3>{item.label}</h3><span className="type-chip">{{likely:'가능성이 높음',plausible:'가능한 시나리오',unlikely:'가능성이 낮음',unassessed:'가능성 미판정'}[item.likelihood]}</span></div><small>전망 기간: {item.horizon}</small><p>{item.text} {citations(item.claimIds)}</p><p className="confidence-reason">근거 신뢰도 {CONFIDENCE_LABEL[item.confidence.level]} · {item.confidence.reason}</p>{item.assumptions.length ? <p>전제: {item.assumptions.join(' · ')}</p> : null}<ul>{item.indicators.map((indicator,j)=><li key={j}><strong>{indicator.direction==='strengthens' ? '판단 강화' : '판단 약화'}</strong><span>{indicator.signal}</span></li>)}</ul></article>)}</div></section> : null}
    <RecommendedActions run={run} onEvidence={onEvidence} />
    {content.assessments.some(a=>a.nextCheck) ? <section id="report-gaps" className="framework-section" aria-labelledby="collection-title"><div className="answer-heading"><h2 id="collection-title">정보 공백과 후속 수집</h2><span>판단을 바꿀 수 있는 자료</span></div><ol className="intel-collection-tasks">{content.assessments.filter(a=>a.nextCheck).map(a=><li key={a.criterionId}><strong>{framework.criteria.find(c=>c.id===a.criterionId)?.label}</strong><p>{a.nextCheck}</p></li>)}</ol></section> : null}
    <details className="collection-log framework-plan"><summary>조사 계획·기준 자료 보존 정책</summary>
      {run.research?.strategy?.sourcePlan?.length ? <><h3>자료 유형별 조사 전략</h3><table><thead><tr><th>자료</th><th>사용 판단</th><th>질문과의 관련성</th></tr></thead><tbody>{run.research.strategy.sourcePlan.map(item=><tr key={item.module}><th>{SOURCE_MODULES[item.module].label}</th><td>{{use:'사용',conditional:'조건부',irrelevant:'관련 없음'}[item.decision]}</td><td>{item.reason}</td></tr>)}</tbody></table></> : null}
      {run.research?.strategy ? <section className="research-strategy"><h3>질의 해석과 조사 전략</h3><p>{run.research.strategy.interpretation}</p><p>판단할 사항: {run.research.strategy.decision}</p>{run.research.strategy.ambiguities.length ? <ul>{run.research.strategy.ambiguities.map(a => <li key={a}>{a}</li>)}</ul> : null}<ol>{run.research.strategy.stages.map((s, i) => <li key={i}><strong>{s.goal}</strong><p>완료 조건: {s.completion}</p></li>)}</ol><dl>{run.research.strategy.evidenceRequirements.map(r => <div key={r.target}><dt>{r.target}</dt><dd>{r.required}<p>우선 자료: {r.preferredSources.join(' · ')}</p><p>반증: {r.disconfirmingEvidence}</p></dd></div>)}</dl><p>조사 종료 기준: {run.research.strategy.stoppingRule}</p></section> : null}
      <p>기준 원문은 사건 기간과 무관하게 판본별로 보존하고 조항 단위로 찾아 재사용합니다. 자료별 재확인 주기에 따라 원문을 갱신하며, 이번 사건의 적용 시점·관할은 별도로 검증합니다.</p><ol>{framework.criteria.map(c => <li key={c.id}><strong>{c.label}</strong> · {c.basisStatus === 'verified' ? '정의·출처 검증' : c.basisStatus === 'proposed' ? '정의 검증 미완료' : '기준 원문 미확보'}<p>{c.question}</p><p>필요한 관측: {c.observations.join(' · ')}</p><p>반증: {c.counterEvidence.join(' · ')}</p></li>)}</ol>
      {ontology.edges.length ? <details><summary>기준·사건·출처 관계 검증</summary><p>관계 {ontology.edges.length}개 · {ontology.validation.conforms ? '무결성 확인' : '연결 검증 미완료'}</p><p>미확인을 불충족으로 추론하지 않으며, 근거 연결을 법적 성립이나 인과관계로 자동 해석하지 않습니다.</p><a href={reportExportURL(run.id, 'ontology')} download>근거 관계 내려받기 (JSON-LD)</a>{ontology.validation.violations.map(v => <p key={v}>{v}</p>)}</details> : null}
      {framework.sourcePolicies.length ? <details><summary>자료별 기간 정책</summary><ul>{framework.sourcePolicies.map(p => <li key={p.sourceId}>{run.sources.find(s => s.id === p.sourceId)?.title} · {p.purpose}<p>{p.reason}</p></li>)}</ul></details> : null}
      {framework.rejected.length ? <details><summary>기준·판단 검증 제외 기록 · {framework.rejected.length}건</summary><ul>{framework.rejected.map(r => <li key={r}>{r}</li>)}</ul></details> : null}
    </details>
  </div>;
}
