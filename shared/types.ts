export type Facet = 'schedule' | 'participants' | 'purpose' | 'format' | 'analysis';
export type VerificationStatus = 'corroborated' | 'single-origin' | 'conflicting' | 'insufficient' | 'independence-pending';
export type CollectionMode = 'snapshot' | 'refresh' | 'live';
export type SourceLanguage = 'ko' | 'en' | 'zh' | 'ja' | 'ru' | 'other';
export interface SimulatedFeed {
  id: string;
  module: 'aviation' | 'maritime' | 'social' | 'satellite';
  title: string;
  description: string;
  createdAt: string;
  excludedFromAssessment: true;
  points?: { at: string; longitude: number; latitude: number; state: 'received' | 'gap' }[];
  posts?: { id: string; text: string; at: string; repeats: number }[];
  cells?: { x: number; y: number; label: string }[];
}

export interface SourceDocument {
  id: string;
  title: string;
  publisher: string;
  type: 'official' | 'news' | 'archive' | 'paper';
  language: SourceLanguage;
  url: string;
  publishedAt: string;
  retrievedAt: string;
  body: string;
  hash: string;
  format: 'html' | 'pdf' | 'api';
  snapshotKind: 'excerpt' | 'document' | 'abstract';
  verificationMethod: 'http' | 'browser-read' | 'pdf-text' | 'api';
  provenanceQuote?: string;
  links?: string[];
  canonicalURL?: string;
  medium?: 'text' | 'image' | 'video' | 'satellite' | 'track' | 'patent' | 'social';
  collectedVia?: SourceModule[];
  attribution?: { publisher: string; originalURL?: string; archive: boolean; control: 'dprk-state' | 'other' };
  media?: { url: string; caption: string; credit: string; kind: 'image' | 'video' | 'satellite'; capturedAt?: string;
    resolutionM?: number; cloudCover?: number; bbox?: number[]; analysis: 'caption-only' | 'metadata-only' | 'visual-reviewed';
    hash?: string; contentType?: string; unavailable?: string }[];
  /** Internal persistence marker; the API always hydrates the frozen body. */
  bodyStorage?: 'criterion-knowledge';
  knowledge?: {
    snapshotId: string;
    archivedAt: string;
    lastCheckedAt: string;
    refreshDueAt: string;
    refreshState: 'fresh' | 'stale' | 'refresh-failed';
    reuse: 'collected' | 'reused' | 'refreshed';
    authorities: CriterionBasis['authority'][];
    editions: string[];
  };
}

export interface Evidence {
  id: string;
  sourceId: string;
  claimId: string;
  quote: string;
  translation: string;
  start: number;
  end: number;
  stance: 'supports' | 'contradicts';
  value: string;
  originId: string;
  originLabel: string;
  originReason: string;
  originVerified: boolean;
  independence: 'unconfirmed' | 'verified';
}

export interface ClaimDefinition {
  id: string;
  label: string;
  facet: Facet;
  entityIds: string[];
}

export interface Entity { id: string; label: string; type: 'event' | 'organization' | 'country' | 'person' | 'platform' | 'account' | 'website'; }

export interface Dataset {
  version: string;
  scenario: string;
  eventDate: { start: string; end: string };
  collectedAt: string;
  coverage: string;
  sources: SourceDocument[];
  evidence: Evidence[];
  claims: ClaimDefinition[];
  entities: Entity[];
}

export interface EvidenceGroup {
  id: string;
  label: string;
  evidenceIds: string[];
  originVerified: boolean;
  independence: 'unconfirmed' | 'verified';
  reason: string;
  independenceReason?: string;
}

export interface AnalyzedClaim extends ClaimDefinition {
  statement: string;
  status: VerificationStatus;
  reason: string;
  evidenceIds: string[];
  groups: EvidenceGroup[];
  documentCount: number;
  independentCount: number;
  confidence?: { level: 'high' | 'medium' | 'low' | 'undetermined'; reason: string };
  quality?: { kind: 'observation' | 'statement' | 'assessment' | 'forecast'; fit: 'direct' | 'attributed' | 'inferential';
    limitations: string[]; authority: 'institution' | 'editorial' | 'state-publication' | 'unrated'; independentSupport: number; policy: string };
}

export interface CollectionResult {
  sourceId: string;
  state: 'snapshot' | 'verified' | 'failed' | 'snapshot-only';
  message: string;
  checkedAt: string;
}

export interface Review {
  id: string;
  runId: string;
  claimId: string;
  action: 'merge' | 'split' | 'independence';
  evidenceIds: string[];
  reason: string;
  createdAt: string;
  version: number;
  independent?: boolean;
}

export interface RunSummary {
  headline: string;
  findings: { claimId: string; label: string; statement: string; status: VerificationStatus; evidenceIds: string[] }[];
  assessment: string;
}

export interface CitationCheck { checked: number; passed: number; rejected: number; }

export type SourceModule = 'official' | 'news' | 'state-media' | 'papers' | 'discussion' | 'social' | 'images' | 'satellite' | 'aviation' | 'maritime' | 'patents';
export interface ResearchQuery {
  module: SourceModule;
  language: SourceLanguage;
  query: string;
  purpose?: 'event' | 'framework' | 'precedent';
  criterionIds?: string[];
  bbox?: [number, number, number, number];
  datetime?: string;
}

export type CriterionDimension = 'occurrence' | 'legality' | 'actor-position' | 'context' | 'forecast';
export type CriterionStatus = 'met' | 'not-met' | 'partial' | 'unknown' | 'not-applicable';
export interface PlannedCriterion {
  id: string;
  label: string;
  question: string;
  dimension: CriterionDimension;
  perspective: string;
  critical: boolean;
  behavioral: boolean;
  basisRequirement?: 'published-rule' | 'analytic-indicator' | 'attributed-position';
  observations: string[];
  counterEvidence: string[];
}
export interface FrameworkPlan {
  proposition: string;
  dimension: CriterionDimension;
  criteria: PlannedCriterion[];
  queries: ResearchQuery[];
  resources?: { url: string; criterionIds: string[] }[];
}
export interface CriterionBasis {
  id: string;
  sourceId: string;
  quote: string;
  translation: string;
  start: number;
  end: number;
  locator: string;
  authority: 'treaty' | 'doctrine' | 'official-policy' | 'expert-manual' | 'research' | 'precedent';
  version: string;
  versionStatus: 'verified' | 'unconfirmed';
  verified: boolean;
}
export interface KnowledgeCatalog {
  policy: Record<CriterionBasis['authority'], number>;
  documents: Omit<SourceDocument, 'body' | 'links' | 'provenanceQuote'>[];
}
export interface AnalysisCriterion extends PlannedCriterion {
  definition: string;
  basisKind: 'published-rule' | 'analyst-derived';
  basisStatus: 'verified' | 'proposed' | 'unavailable';
  applicability: { status: 'confirmed' | 'conditional' | 'unresolved' | 'not-applicable'; reason: string };
  basis: CriterionBasis[];
}
export interface CriterionAssessment {
  criterionId: string;
  status: CriterionStatus;
  reasoning: string;
  claimIds: string[];
  limitations: string[];
  nextCheck: string;
  verification: 'verified' | 'pending' | 'rejected';
}
export interface BehaviorObservation {
  id: string;
  eventKey: string;
  label: string;
  criterionIds: string[];
  claimIds: string[];
  kind: 'observed' | 'reported' | 'announced' | 'scheduled';
  /** An independently audited equivalence link, not a link inferred from language or topic. */
  sameEventAs?: string;
  criterionEffects?: { criterionId: string; direction: 'supports' | 'contradicts' | 'context'; concrete: boolean }[];
}
export interface FrameworkJudgment {
  text: string;
  status: 'supported' | 'rejected' | 'undetermined';
  confidence: NonNullable<AnalyzedClaim['confidence']>;
  criterionIds: string[];
  claimIds: string[];
  limitations: string[];
}
export interface FrameworkPerspective {
  label: string;
  text: string;
  criterionIds: string[];
  claimIds: string[];
}
export interface FrameworkAlternative extends FrameworkPerspective { nextCheck: string; }
export interface IntelKeyJudgment extends FrameworkPerspective { confidence: NonNullable<AnalyzedClaim['confidence']>; }
export interface IntelOutlook extends IntelKeyJudgment {
  horizon: string;
  likelihood: 'likely' | 'plausible' | 'unlikely' | 'unassessed';
  assumptions: string[];
  indicators: { signal: string; direction: 'strengthens' | 'weakens'; }[];
}
export interface SourceTemporalPolicy {
  sourceId: string;
  purpose: 'event' | 'framework' | 'precedent' | 'background';
  publicationInRange: boolean | null;
  reason: string;
}
export interface AnalysisFramework {
  proposition: string;
  dimension: CriterionDimension;
  criteria: AnalysisCriterion[];
  assessments: CriterionAssessment[];
  observations: BehaviorObservation[];
  judgment: FrameworkJudgment;
  perspectives: FrameworkPerspective[];
  alternatives: FrameworkAlternative[];
  keyJudgments?: IntelKeyJudgment[];
  outlook?: IntelOutlook[];
  counts: { total: number; met: number; partial: number; reported: number; announced: number; unknown: number; notMet: number; notApplicable: number; events: number; independentOrigins: number };
  sourcePolicies: SourceTemporalPolicy[];
  rejected: string[];
  verification: 'verified' | 'pending' | 'incomplete';
  verifiedAt?: string;
}

export interface ResearchScope {
  geography: string;
  period: string;
  task: 'event' | 'influence' | 'general';
  assumptions: string[];
  hypotheses: string[];
}

export interface ResearchStrategy {
  interpretation: string;
  decision: string;
  ambiguities: string[];
  evidenceRequirements: { target: string; required: string; preferredSources: string[]; disconfirmingEvidence: string }[];
  stages: { goal: string; method: 'framework' | 'event' | 'cross-check'; completion: string }[];
  stoppingRule: string;
  sourcePlan?: { module: SourceModule; decision: 'use' | 'conditional' | 'irrelevant'; reason: string }[];
}

export interface ResearchCoverage {
  target: string;
  status: 'answered' | 'partial' | 'missing';
  sourceIds: string[];
  reason: string;
}

export interface ResearchRound {
  round: number;
  documents: { sourceId: string; role: 'direct' | 'framework' | 'precedent' | 'background' | 'irrelevant'; reason: string; quote: string;
    eventPeriod?: { start: string; end: string; quote: string; kind: 'observed' | 'announced' | 'scheduled' } }[];
  coverage: ResearchCoverage[];
  nextQueries: ResearchQuery[];
}

export interface TopicSuggestion {
  id: string;
  title: string;
  whyNow: string;
  question: string;
  sources: { url: string; title: string; publisher: string; publishedAt: string; quote: string }[];
}

export interface TopicFeed {
  state: 'idle' | 'running' | 'ready' | 'failed' | 'disabled';
  generatedAt?: string;
  attemptedAt?: string;
  period: { start: string; end: string };
  topics: TopicSuggestion[];
  message: string;
  trace: ResearchTrace[];
}

export interface ResearchTrace {
  stage: string;
  message: string;
  at: string;
  status: 'running' | 'complete' | 'failed';
  taskId?: string;
  detail?: string;
  url?: string;
  language?: SourceLanguage;
  durationMs?: number;
}

export interface ResearchSearch {
  query: ResearchQuery;
  provider: string;
  hits: { url: string; title: string }[];
  completedAt: string;
  error?: string;
}
export interface VisualFinding {
  sourceId: string; mediaHash: string; description: string; relevance: string;
  identityQuote: string; limitations: string[]; verified: boolean;
}

export interface ReportApproval {
  reviewer: string;
  decision: 'approved' | 'changes-requested';
  reason: string;
  createdAt: string;
  version: number;
}

export interface ReportAnswer {
  intent: 'brief' | 'facts' | 'origins' | 'gaps';
  paragraphs: { text: string; claimIds: string[]; kind: 'fact' | 'assessment'; heading?: string }[];
  composition?: 'synthesized' | 'fallback';
  unanswered: string[];
}

export interface ReportEvent { date: string; label: string; evidenceIds: string[]; }
export interface ReportLocation { name: string; latitude: number; longitude: number; evidenceIds: string[]; kind: 'reported-coordinates'; }

export type RelationPredicate = 'cites' | 'reposts' | 'publishes' | 'precedes' | 'responds-to' | 'supports' | 'opposes' | 'associated-with';
export interface WisdomNode {
  id: string;
  kind: 'entity' | 'claim' | 'evidence' | 'inference';
  label: string;
  referenceId?: string;
}
export interface WisdomEdge {
  id: string;
  from: string;
  to: string;
  predicate: RelationPredicate | 'substantiates' | 'contradicts' | 'concerns' | 'premise';
  label: string;
  evidenceIds: string[];
  derived: boolean;
}
export interface WisdomInference {
  id: string;
  rule: 'citation-path' | 'response-path' | 'competing-explanation';
  conclusion: string;
  premiseNodeIds: string[];
  premiseEdgeIds: string[];
  evidenceIds: string[];
  claimIds: string[];
  confidence: 'medium' | 'low' | 'undetermined';
  limitations: string[];
  alternatives: string[];
  nextCheck: string;
}
export interface WisdomGraph {
  nodes: WisdomNode[];
  edges: WisdomEdge[];
  inferences: WisdomInference[];
  rejected: string[];
}

export interface AnalysisRun {
  reportTitle?: string;
  risk?: IntelRiskBrief;
  simulatedFeeds?: SimulatedFeed[];
  imagery?: VisualFinding[];
  demo?: import('./demo.ts').DemoPlayback;
  id: string;
  version: number;
  question: string;
  mode: CollectionMode;
  dateRange: { start: string; end: string };
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  datasetVersion: string;
  collectedAt: string;
  coverage: string;
  facets: Facet[];
  summary: RunSummary;
  citationCheck: CitationCheck;
  sources: SourceDocument[];
  evidence: Evidence[];
  entities: Entity[];
  claims: AnalyzedClaim[];
  gaps: string[];
  scope: 'supported' | 'unsupported';
  collections: CollectionResult[];
  reviews: Review[];
  stats: { documents: number; claims: number; groups: number; independent: number; citations: number };
  stages: { label: string; durationMs: number }[];
  answer?: ReportAnswer;
  analysis?: AnalysisFramework;
  research?: { datePolicy?: 'event' | 'publication'; engine: 'cursor-cli'; model: string; queries: ResearchQuery[]; searches?: ResearchSearch[]; trace: ResearchTrace[]; rejectedCitations: string[];
    scope?: ResearchScope; strategy?: ResearchStrategy; rounds?: ResearchRound[]; coverage?: ResearchCoverage[]; stopReason?: string; };
  approval?: ReportApproval;
  approvals?: ReportApproval[];
  events?: ReportEvent[];
  locations?: ReportLocation[];
  relations?: { from: string; to: string; label: string; predicate?: RelationPredicate; evidenceIds: string[] }[];
  wisdom?: WisdomGraph;
}

export type RiskLevel = 'low' | 'guarded' | 'elevated' | 'high' | 'critical' | 'unassessed';
export type RiskLikelihood = 'unlikely' | 'plausible' | 'likely' | 'unassessed';
export type RiskImpact = 'limited' | 'serious' | 'severe' | 'unassessed';
export interface RiskEstimate {
  id: string;
  label: string;
  summary: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  level: RiskLevel;
  claimIds: string[];
  criterionIds: string[];
  confidence: FrameworkJudgment['confidence'];
  limitations: string[];
}
export interface RecommendedAction {
  id: string;
  title: string;
  purpose: string;
  priority: 'now' | 'next' | 'watch';
  owner: string;
  timing: string;
  trigger: string;
  completion: string;
  claimIds: string[];
  criterionIds: string[];
}
export interface IntelRiskBrief {
  scope: string;
  horizon: string;
  asOf: string;
  overall: RiskEstimate;
  items: RiskEstimate[];
  actions: RecommendedAction[];
  method: 'qualitative-risk-matrix-v1';
  verification: 'verified' | 'pending' | 'incomplete';
  verifiedAt?: string;
  rejected: string[];
}

export interface AnalysisInput {
  question: string;
  mode: CollectionMode;
  startDate?: string;
  endDate?: string;
  languages?: SourceLanguage[];
  urls?: string[];
  sourcePolicy?: 'all-public';
}

export interface ReviewInput {
  claimId: string;
  action: Review['action'];
  evidenceIds: string[];
  reason: string;
  independent?: boolean;
  expectedVersion: number;
}

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  corroborated: '교차 확인',
  'single-origin': '단일 원출처',
  conflicting: '근거 상충',
  insufficient: '근거 부족',
  'independence-pending': '독립성 미확인',
};

export const FACET_LABELS: Record<Facet, string> = {
  schedule: '일정', participants: '참가국', purpose: '발표 목적', format: '훈련 형식', analysis: '주요 판단',
};

export const EXAMPLE_QUESTIONS = [
  '2024년 6월 첫 프리덤 에지의 일정, 참가국, 발표 목적을 정리하고 원출처를 구분해줘.',
  '참가국을 확인하는 근거는 몇 묶음인가?',
  '수집한 자료만으로 확인하기 어려운 내용은 무엇인가?',
];
