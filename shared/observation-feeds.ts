export type ObservationModule = 'aviation' | 'maritime' | 'social';
export interface ObservationRecord {
  id: string; label: string; observedAt?: string; latitude?: number; longitude?: number;
  altitudeM?: number; speedKnots?: number; text?: string; url?: string;
  fields?: Record<string, string>;
}
export interface ObservationFeed {
  id: string; module: ObservationModule; title: string; provider: string;
  kind: 'ads-b' | 'ais' | 'vessel-summary' | 'port-calls' | 'social-posts';
  state: 'collected' | 'empty' | 'failed'; region: string; scope: 'regional' | 'outside-region';
  endpoint: string; reference: string; collectedAt: string; dataAt?: string;
  snapshotHash?: string; count: number; records: ObservationRecord[]; limitations: string[]; error?: string;
}
export interface ObservationCrossCheck {
  id: string; label: string; feeds: string[]; distanceKm: number; timeDifferenceSec: number;
  status: 'consistent' | 'different' | 'time-mismatch';
}
export interface ObservationBundle {
  collectedAt: string; feeds: ObservationFeed[]; crossChecks: ObservationCrossCheck[];
  method: string; includedInReportAssessment: false;
}
