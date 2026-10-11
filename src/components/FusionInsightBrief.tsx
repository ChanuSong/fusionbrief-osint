import type { ReactNode } from 'react';
import type { ScenarioOptions, SyntheticAssessment } from '../../shared/synthetic-scenario.ts';
import { SYNTHETIC_SCENARIO } from '../../shared/synthetic-scenario.ts';
import { scenarioInsights } from '../../shared/scenario-insights.ts';
import '../fusion-insights.css';

export const minutesLabel = (minutes: number) => minutes >= 60
  ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` : `${minutes}분`;

export function FusionInsightBrief({ result, options, citations, graphLink, onProof }: {
  result: SyntheticAssessment; options: ScenarioOptions;
  citations: (ids: string[]) => ReactNode; graphLink: (ids: string[], sentence: string) => ReactNode;
  onProof: (sourceId: string, view?: 'source' | 'graph') => void;
}) {
  const insight = scenarioInsights(SYNTHETIC_SCENARIO, result, options);
  const comparison = insight.comparison;
  const headline = comparison ? comparison.largerBurden === 'sea'
    ? '항공보다 해상 우회의 시간 부담이 큽니다. 선박의 항로 복귀를 우선 감시해야 합니다.'
    : '항공 우회의 시간 부담이 더 큽니다. 항공 경로 복귀를 우선 확인해야 합니다.'
    : '유효한 전후 항적이 없어 운항 수단별 영향과 대응 우선순위를 판단할 수 없습니다.';
  const actualHeadline = '추가 발사 가능성과 민간 운항 차질은 별도로 감시해야 합니다.';
  return <section id="report-insights" className="fusion-insight-brief" aria-labelledby="fusion-insights-title" tabIndex={-1}>
    <div className="fusion-insight-heading"><span>FUSION INSIGHTS</span><h3 id="fusion-insights-title">자료를 연결해 얻은 핵심 인사이트</h3></div>
    <article className="fusion-insight-actual">
      <div className="fusion-insight-tag">실제 자료 · 조건부 전망 · 신뢰도 낮음</div>
      <h4>{actualHeadline}</h4>
      <p>한국·일본의 발사 탐지와 북한의 과시 지속 표명을 함께 보면 향후 7일 추가 발사는 가능한 시나리오입니다. 일본의 항공·선박 정보 제공은 민간 영향의 확인 필요성을 보여줍니다. 현재 자료로 우회·지연 규모는 확인되지 않았습니다. {citations(['c1', 'c10', 'c12'])}</p>
      <div className="fusion-insight-followup"><strong>다음 판단을 바꿀 근거</strong><span>추가 탐지 발표 + 발효 중인 항행 경보 + 동일 구역의 전후 항적</span>{graphLink(['c1', 'c10', 'c12'], actualHeadline)}</div>
    </article>
    <article className="fusion-insight-scenario" aria-label="합성 자료 결합 인사이트">
      <div className="fusion-insight-tag">합성 관측 · 실제 계산 · 시나리오 내 신뢰도 {result.confidence === 'medium' ? '중간' : '낮음'}</div>
      <h4>{headline}</h4>
      <div className="fusion-input-chain" aria-label="결합한 자료">
        {options.notice ? <button onClick={() => onProof('SIM-N1')}><small>경보 원문</small><b>48시간 · 제한 구역</b></button> : null}
        {options.tracks ? <><button onClick={() => onProof('SIM-A1')}><small>ADS-B 전후 항적</small><b>항공 {result.air.rerouted}/{result.air.eligible}대 우회</b></button><button onClick={() => onProof('SIM-M1')}><small>AIS 전후 항적</small><b>선박 {result.sea.rerouted}/{result.sea.eligible}척 우회</b></button></> : <span>항적 검토 제외 · 영향 격차 산출 유보</span>}
      </div>
      {comparison ? <><div className="fusion-time-comparison" aria-label="우회 표본의 평균 추가 이동 시간 추정">
        <div><span>항공</span><i style={{ width: `${comparison.airMinutes / Math.max(comparison.airMinutes, comparison.seaMinutes) * 100}%` }} /><b>{minutesLabel(comparison.airMinutes)}</b></div>
        <div><span>해상</span><i style={{ width: `${comparison.seaMinutes / Math.max(comparison.airMinutes, comparison.seaMinutes) * 100}%` }} /><b>{minutesLabel(comparison.seaMinutes)}</b></div>
      </div><p className="fusion-derived-finding"><strong>결합 후 새로 얻은 판단</strong> 경보에는 없는 수단별 시간 부담을 항적 거리와 이동 속도로 산출했습니다. 선박의 평균 추가 이동은 항공의 약 <b>{comparison.seaToAirRatio.toFixed(1)}배</b>입니다. 우회 개체당 추정치이며 실제 도착 지연이나 전체 교통량을 뜻하지 않습니다.</p></> : null}
      <div className="fusion-insight-next"><div><strong>조건부 전망</strong><p>{insight.canForecast ? `경보 잔여 ${minutesLabel(insight.remainingMinutes!)} 동안 우회가 지속될 수 있습니다. 만료 후 항로 복귀와 경보 연장 여부가 다음 위험 평가의 분기점입니다.` : '경보의 유효기간과 유효한 전후 항적을 함께 확보해야 영향 지속 시간을 전망할 수 있습니다.'}</p></div><div><strong>권장 추가 액션</strong><p>{comparison ? `${comparison.largerBurden === 'sea' ? '해상' : '항공'} 우회 표본의 경로 복귀·추가 이동 부담을 먼저 재관측하고, 경보 만료·연장 원문과 대조합니다.` : '전후 항적을 복원해 수단별 영향을 다시 계산합니다.'}</p></div></div>
      <p className="fusion-insight-cause">{options.weather ? '기상 반대 근거가 추가되어 우회의 원인은 유보합니다. 관측된 시간 부담의 차이는 유지됩니다.' : '시간·구역의 정합은 연관성을 지지합니다. 우회 원인과 미사일 발사 실행은 별도 검증이 필요합니다.'}</p>
      <div className="fusion-insight-links"><button onClick={() => onProof(options.tracks ? 'SIM-M1' : 'SIM-N1', 'graph')}>이 인사이트의 근거 그래프 보기 →</button><a href="#scenario-conditions">근거를 바꿔 판단 비교</a><a href="#scenario-map">항로 변화 확인</a></div>
    </article>
  </section>;
}
