import type { AnalysisRun, AnalyzedClaim, Evidence, SourceDocument, VerificationStatus } from '../shared/types.ts';

export interface RecentRun {
  id: string; question: string; createdAt: string; version: number;
  mode?: AnalysisRun['mode']; statuses?: VerificationStatus[];
}

export const SOURCE_TYPES: Record<SourceDocument['type'], string> = { official: '공식 발표', news: '언론 보도', archive: '아카이브', paper: '논문' };
export const MODE_LABELS: Record<AnalysisRun['mode'], string> = { snapshot: '시연 자료', refresh: '시연 원문 재확인', live: '공개자료 수집' };
export const VERIFY_METHODS: Record<SourceDocument['verificationMethod'], string> = {
  http: 'HTTP 본문 수집', 'browser-read': '웹 읽기 도구 확인', 'pdf-text': 'PDF 텍스트 추출', api: '공개 API 수집',
};

const ORIGIN_PALETTE = ['#416783', '#927240', '#55786a', '#6c7287', '#80606b', '#697949', '#417b80', '#8b6450'];

/** Stable color per origin group across every claim in a run, so the same announcement keeps its color. */
export function originColors(run: AnalysisRun): Map<string, string> {
  const map = new Map<string, string>();
  for (const claim of run.claims) for (const group of claim.groups) {
    if (!map.has(group.id)) map.set(group.id, ORIGIN_PALETTE[map.size % ORIGIN_PALETTE.length]);
  }
  return map;
}

export function evidenceRows(run: AnalysisRun, claim: AnalyzedClaim) {
  return claim.groups.flatMap((group, groupIndex) => group.evidenceIds.map(id => {
    const evidence = run.evidence.find(e => e.id === id) as Evidence;
    const source = run.sources.find(s => s.id === evidence.sourceId) as SourceDocument;
    return { group, groupIndex, evidence, source };
  }));
}

export const dotDate = (value: string) => value.replaceAll('-', '.');
export const dateTime = (value: string) => new Date(value).toLocaleString('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
export const shortTime = (value: string) => new Date(value).toLocaleString('ko-KR', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
export const formatMs = (ms: number) => ms < 1 ? '<1ms' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
export const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
export const hostname = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '요청 처리에 실패했습니다.');
  return data as T;
}
