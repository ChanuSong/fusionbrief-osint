import type { AnalysisRun } from './types.ts';

export const TRACE_VOCABULARY = 'urn:trace:ontology:';
export type OntologyClass = 'DocumentSnapshot' | 'ImageSnapshot' | 'VisualObservation' | 'Forecast' | 'Provision' | 'Criterion' | 'Claim' | 'Quotation' | 'Observation' | 'Assessment' | 'Judgment' | 'Actor' | 'Entity' | 'Event' | 'ResearchPlan' | 'OriginGroup' | 'ValidationReport';
export type OntologyPredicate = 'hasBasis' | 'evaluates' | 'groundedIn' | 'wasDerivedFrom' | 'describes' | 'tests' | 'aboutActor' | 'hasOrigin';
export interface OntologyNode {
  id: string; type: OntologyClass; label: string; referenceId: string;
  properties: Record<string, string | number | boolean | string[]>;
}
export interface OntologyEdge { from: string; predicate: OntologyPredicate; to: string; }
export interface AnalysisOntology {
  version: 'trace-ontology-v1'; runId: string; runVersion: number;
  nodes: OntologyNode[]; edges: OntologyEdge[];
  validation: { conforms: boolean; violations: string[] };
}

/** Open-world model: unknown never entails negation. Edges record audited
 * evidence dependencies, not automatic legal, causal, or identity entailments. */
export function buildAnalysisOntology(run: AnalysisRun): AnalysisOntology {
  const nodes = new Map<string, OntologyNode>(); const edges: OntologyEdge[] = []; const violations: string[] = [];
  const key = (type: OntologyClass, id: string) => `urn:trace:run:${run.id}:${type}:${encodeURIComponent(id)}`;
  const add = (type: OntologyClass, id: string, label: string, properties: OntologyNode['properties'] = {}) => {
    const nodeId = key(type, id);
    nodes.set(nodeId, { id: nodeId, type, label, referenceId: id, properties }); return nodeId;
  };
  const link = (from: string, predicate: OntologyPredicate, to: string) => {
    if (!nodes.has(from) || !nodes.has(to)) { violations.push(`관계의 대상 누락: ${predicate}`); return; }
    if (!edges.some(e => e.from === from && e.to === to && e.predicate === predicate)) edges.push({ from, predicate, to });
  };
  for (const [label, items] of [['출처', run.sources], ['주장', run.claims], ['인용', run.evidence], ['기준', run.analysis?.criteria ?? []]] as const)
    if (new Set(items.map(item => item.id)).size !== items.length) violations.push(`${label} 식별자가 중복되었습니다.`);
  for (const s of run.sources) add('DocumentSnapshot', s.id, s.title, { url: s.url, hash: s.hash, publishedAt: s.publishedAt,
    retrievedAt: s.retrievedAt, ...(s.knowledge ? { snapshotId: s.knowledge.snapshotId, refreshState: s.knowledge.refreshState } : {}) });
  for (const finding of run.imagery ?? []) {
    const source=run.sources.find(s=>s.id===finding.sourceId);
    const media=source?.media?.find(m=>m.hash===finding.mediaHash);
    if (!finding.verified || !source || !media || media.analysis!=='visual-reviewed' || !/^[a-f0-9]{64}$/.test(finding.mediaHash)
      || finding.identityQuote && !source.body.includes(finding.identityQuote)) { violations.push('시각 관측의 원본·귀속 연결 미확인'); continue; }
    const image=add('ImageSnapshot',finding.mediaHash,media.caption,{hash:finding.mediaHash,url:media.url,credit:media.credit,analysis:media.analysis});
    const observation=add('VisualObservation',`${source.id}:${finding.mediaHash}`,finding.description,{relevance:finding.relevance,limitations:finding.limitations,identityQuote:finding.identityQuote});
    link(observation,'wasDerivedFrom',image);link(image,'wasDerivedFrom',key('DocumentSnapshot',source.id));
  }
  const entityClass = (id: string): OntologyClass => {
    const type = run.entities.find(e => e.id === id)?.type;
    return type === 'event' ? 'Event' : type === 'platform' || type === 'website' ? 'Entity' : 'Actor';
  };
  for (const entity of run.entities) add(entityClass(entity.id), entity.id, entity.label, { entityType: entity.type });
  for (const claim of run.claims) {
    const cid = add('Claim', claim.id, claim.statement, { status: claim.status, confidence: claim.confidence?.level ?? 'undetermined' });
    for (const entity of claim.entityIds) {
      const type = entityClass(entity);
      if (nodes.has(key(type, entity))) link(cid, type === 'Actor' ? 'aboutActor' : 'describes', key(type, entity));
    }
    for (const eid of claim.evidenceIds) {
      const e = run.evidence.find(e => e.id === eid); const source = run.sources.find(s => s.id === e?.sourceId);
      if (!e || e.claimId !== claim.id || !source || source.body.slice(e.start, e.end) !== e.quote) {
        violations.push(`${claim.label}: 원문에 연결되지 않는 인용 ${eid}`); continue;
      }
      const qid = add('Quotation', e.id, e.quote, { start: e.start, end: e.end, stance: e.stance });
      link(cid, 'groundedIn', qid); link(qid, 'wasDerivedFrom', key('DocumentSnapshot', source.id));
    }
    for (const group of claim.groups) {
      const gid = add('OriginGroup', `${claim.id}:${group.id}`, group.label, { originVerified: group.originVerified, independence: group.independence });
      link(cid, 'hasOrigin', gid);
      for (const eid of group.evidenceIds) if (nodes.has(key('Quotation', eid))) link(gid, 'wasDerivedFrom', key('Quotation', eid));
    }
  }
  const framework = run.analysis;
  if (framework) {
    const pending = framework.verification !== 'verified';
    for (const c of framework.criteria) {
      const cid = add('Criterion', c.id, c.label, { dimension: c.dimension, perspective: c.perspective, critical: c.critical,
        behavioral: c.behavioral, basisKind: c.basisKind, basisStatus: c.basisStatus, applicability: c.applicability.status });
      for (const b of c.basis.filter(b => b.verified)) {
        const source = run.sources.find(s => s.id === b.sourceId);
        if (!source || source.body.slice(b.start, b.end) !== b.quote) { violations.push(`${c.label}: 기준 조항의 인용 위치 불일치`); continue; }
        const bid = add('Provision', b.id, b.locator || b.quote, { quote: b.quote, start: b.start, end: b.end,
          authority: b.authority, edition: b.version, editionProof: b.versionStatus });
        link(cid, 'hasBasis', bid); link(bid, 'wasDerivedFrom', key('DocumentSnapshot', source.id));
      }
    }
    for (const a of framework.assessments) {
      const criterion = framework.criteria.find(c => c.id === a.criterionId);
      if (!criterion) { violations.push(`존재하지 않는 기준 대조: ${a.criterionId}`); continue; }
      if (framework.assessments.filter(other => other.criterionId === a.criterionId).length !== 1) violations.push(`${criterion.label}: 대조 결과 중복`);
      const substantive = a.verification === 'verified' && ['met', 'not-met', 'partial', 'not-applicable'].includes(a.status);
      if (substantive && !a.claimIds.length) violations.push(`${criterion.label}: 판단에 사건 근거가 없습니다.`);
      if (!pending && substantive && criterion.dimension === 'legality' && (criterion.basisStatus !== 'verified'
        || a.status !== 'not-applicable' && criterion.applicability.status !== 'confirmed')) violations.push(`${criterion.label}: 법적 판단의 기준·적용 조건 미확인`);
      if (!pending && a.verification === 'verified' && a.status === 'met' && criterion.behavioral && ['occurrence','forecast'].includes(criterion.dimension)
        && !framework.observations.some(o => o.criterionIds.includes(criterion.id) && ['observed', 'reported'].includes(o.kind)
          && (!o.criterionEffects || o.criterionEffects.some(e=>e.criterionId===criterion.id && e.direction==='supports' && e.concrete))))
        violations.push(`${criterion.label}: 실제 시행 없는 행위 충족 판정`);
      const aid = add('Assessment', a.criterionId, a.reasoning, { status: pending || a.verification !== 'verified' ? 'unknown' : a.status,
        verification: pending ? 'pending' : a.verification });
      link(aid, 'evaluates', key('Criterion', a.criterionId));
      for (const cid of a.claimIds) link(aid, 'groundedIn', key('Claim', cid));
    }
    if (!pending) for (const observation of framework.observations) {
      const oid = add('Observation', observation.id, observation.label, { kind: observation.kind, eventKey: observation.eventKey,
        ...(observation.sameEventAs ? { sameEventAs: observation.sameEventAs } : {}) });
      for (const cid of observation.claimIds) link(oid, 'wasDerivedFrom', key('Claim', cid));
      for (const cid of observation.criterionIds) link(oid, 'tests', key('Criterion', cid));
    }
    const judgment = framework.judgment;
    const jid = add('Judgment', 'main', judgment.text, { status: judgment.status, dimension: framework.dimension,
      confidence: judgment.confidence.level, verification: framework.verification });
    for (const cid of judgment.criterionIds) link(jid, 'wasDerivedFrom', key('Assessment', cid));
    for (const cid of judgment.claimIds) link(jid, 'groundedIn', key('Claim', cid));
    if (!pending) {
      for (const [index,item] of (framework.keyJudgments ?? []).entries()) {
        const id=add('Judgment',`key-${index}`,item.text,{confidence:item.confidence.level});
        if(!item.claimIds.length)violations.push('주요 판단에 근거 누락');
        for(const cid of item.claimIds)link(id,'groundedIn',key('Claim',cid));
        for(const cid of item.criterionIds)link(id,'wasDerivedFrom',key('Assessment',cid));
      }
      for (const [index,item] of (framework.outlook ?? []).entries()) {
        const id=add('Forecast',`outlook-${index}`,item.text,{horizon:item.horizon,likelihood:item.likelihood,confidence:item.confidence.level,
          assumptions:item.assumptions,futureIndicators:item.indicators.map(i=>`${i.direction}: ${i.signal}`)});
        if(!item.claimIds.length)violations.push('전망에 근거 누락');
        for(const cid of item.claimIds)link(id,'groundedIn',key('Claim',cid));
        for(const cid of item.criterionIds)link(id,'wasDerivedFrom',key('Assessment',cid));
      }
    }
    if (judgment.status !== 'undetermined') for (const criterion of framework.criteria.filter(c => c.critical && c.dimension === framework.dimension)) {
      const a = framework.assessments.find(a => a.criterionId === criterion.id);
      if (pending || !judgment.criterionIds.includes(criterion.id) || !a || a.verification !== 'verified' || ['unknown', 'partial'].includes(a.status))
        violations.push(`${criterion.label}: 미확인 핵심 전제에서 결론 확정`);
    }
  }
  if (run.research?.strategy) {
    const pid = add('ResearchPlan', 'plan', run.research.strategy.interpretation, {
    decision: run.research.strategy.decision, stoppingRule: run.research.strategy.stoppingRule,
      stages: run.research.strategy.stages.map(s => `${s.method}: ${s.goal}`) });
    for (const node of nodes.values()) if (node.type === 'Criterion' || node.type === 'Judgment') link(node.id, 'wasDerivedFrom', pid);
  }
  add('ValidationReport', 'constraints', '기준·사건·출처 관계 무결성 검증', { conforms: !violations.length, violations: [...new Set(violations)] });
  return { version: 'trace-ontology-v1', runId: run.id, runVersion: run.version, nodes: [...nodes.values()], edges,
    validation: { conforms: !violations.length, violations: [...new Set(violations)] } };
}

export function ontologyJSONLD(ontology: AnalysisOntology) {
  const context: Record<string, unknown> = { trace: TRACE_VOCABULARY, prov: 'http://www.w3.org/ns/prov#',
    label: 'http://www.w3.org/2000/01/rdf-schema#label' };
  for (const type of ['DocumentSnapshot', 'ImageSnapshot', 'VisualObservation', 'Forecast', 'Provision', 'Criterion', 'Claim', 'Quotation', 'Observation', 'Assessment', 'Judgment', 'Actor', 'Entity', 'Event', 'ResearchPlan', 'OriginGroup', 'ValidationReport']) context[type] = `trace:${type}`;
  for (const predicate of ['hasBasis', 'evaluates', 'groundedIn', 'describes', 'tests', 'aboutActor', 'hasOrigin']) context[predicate] = { '@id': `trace:${predicate}`, '@type': '@id' };
  context.wasDerivedFrom = { '@id': 'prov:wasDerivedFrom', '@type': '@id' };
  for (const property of new Set(ontology.nodes.flatMap(n => Object.keys(n.properties)))) context[property] = `trace:${property}`;
  return { '@context': context, '@id': `urn:trace:run:${ontology.runId}:v${ontology.runVersion}`,
    '@graph': ontology.nodes.map(node => ({ '@id': node.id, '@type': node.type, label: node.label, ...node.properties,
      ...Object.fromEntries([...new Set(ontology.edges.filter(e => e.from === node.id).map(e => e.predicate))]
        .map(predicate => [predicate, ontology.edges.filter(e => e.from === node.id && e.predicate === predicate).map(e => e.to)])) } as { '@id': string; '@type': OntologyClass; label: string } & Record<string, unknown>)) };
}

/** These are the same typed dependencies exported in JSON-LD, projected as
 * short paths for the report. No model invents graph links in this view. */
export function assessmentPaths(run: AnalysisRun, criterionId: string, graph = buildAnalysisOntology(run)) {
  const assessment = graph.nodes.find(n => n.type === 'Assessment' && n.referenceId === criterionId);
  if (!assessment) return [];
  const paths: { claimId: string; evidenceId: string; sourceId: string }[] = [];
  for (const edge of graph.edges.filter(e => e.from === assessment.id && e.predicate === 'groundedIn')) {
    const claim = graph.nodes.find(n => n.id === edge.to)!;
    for (const quoteEdge of graph.edges.filter(e => e.from === claim.id && e.predicate === 'groundedIn')) {
      const quote = graph.nodes.find(n => n.id === quoteEdge.to)!;
      const sourceEdge = graph.edges.find(e => e.from === quote.id && e.predicate === 'wasDerivedFrom');
      const source = graph.nodes.find(n => n.id === sourceEdge?.to);
      if (source) paths.push({ claimId: claim.referenceId, evidenceId: quote.referenceId, sourceId: source.referenceId });
    }
  }
  return paths;
}
