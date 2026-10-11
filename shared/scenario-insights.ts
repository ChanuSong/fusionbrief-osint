import type { ScenarioOptions, SyntheticAssessment, SyntheticScenario } from './synthetic-scenario.ts';

export function scenarioInsights(data: SyntheticScenario, result: SyntheticAssessment, options: ScenarioOptions) {
  const comparison = result.air.rerouted > 0 && result.sea.rerouted > 0 && result.meanAirExtraMinutes > 0 && result.meanSeaExtraMinutes > 0
    ? { airMinutes: result.meanAirExtraMinutes, seaMinutes: result.meanSeaExtraMinutes,
      seaToAirRatio: result.meanSeaExtraMinutes / result.meanAirExtraMinutes,
      largerBurden: result.meanSeaExtraMinutes > result.meanAirExtraMinutes ? 'sea' as const : 'air' as const }
    : undefined;
  const remainingMinutes = options.notice && data.asOfMinute >= data.zone.startMinute && data.asOfMinute < data.zone.endMinute
    ? data.zone.endMinute - data.asOfMinute : undefined;
  return { comparison, remainingMinutes, canForecast: !!comparison && remainingMinutes !== undefined,
    causeUnresolved: result.attribution !== 'supported' };
}
