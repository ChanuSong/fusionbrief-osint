import type { AnalysisRun, SourceLanguage } from './types.ts';
export interface DemoScenario {
  id: string; title: string; subtitle: string; question: string; preparedAt: string;
  dateRange: AnalysisRun['dateRange']; documents: number; citations: number; claims: number;
  languages: SourceLanguage[]; originalDurationMs: number; main: boolean;
}
export interface DemoPackage { schema: 1; id: string; title: string; subtitle: string; preparedAt: string; main: boolean; run: AnalysisRun; }
export interface DemoPlayback { scenarioId: string; title: string; preparedAt: string; originalRunId: string; originalDurationMs: number; loadedAt: string; }
