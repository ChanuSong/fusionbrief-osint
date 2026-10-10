import type { AnalysisRun } from '../shared/types.ts';
import { AUTHORITY_LABEL, CONFIDENCE_LABEL, CRITERION_STATUS, DIMENSION_LABEL, OBSERVATION_LABEL, reportContent } from '../shared/report-content.ts';
import { buildAnalysisOntology } from '../shared/analysis-ontology.ts';

export function exportFramework(run: AnalysisRun): string {
  const framework = run.analysis!;
  const content = reportContent(run);
  const refs = (ids: string[]) => [...new Set(ids.flatMap(id => run.claims.find(c => c.id === id)?.evidenceIds ?? []))].map(id => `[^${id}]`).join(' ');
  const lines = ['# 공개정보 정보분석 보고서', '', `> ${run.question}`, '', `자료 기준 ${run.collectedAt.slice(0,10)} · 미 육군 ATP 2-33.4·ICD 203 원칙을 참고한 제품 양식 · ${run.approval?.decision==='approved' ? '분석가 승인' : '검토 전 분석 초안'}`, '', '## 핵심 판단', '', framework.judgment.text, '',
    `신뢰도 **${CONFIDENCE_LABEL[framework.judgment.confidence.level]}** · ${framework.judgment.confidence.reason}`, '', refs(framework.judgment.claimIds), '',
    `판단 축: ${DIMENSION_LABEL[framework.dimension]} · 기준 대조 ${framework.verification === 'verified' ? '검증 완료' : '재검증 대기'}`, '',
    ...framework.judgment.limitations.map(l => `- ${l}`), ''];
  if (framework.verification==='verified' && framework.keyJudgments?.length) {
    lines.push('## 주요 판단','');
    for (const item of framework.keyJudgments) lines.push(`### ${item.label}`,'',`${item.text} ${refs(item.claimIds)}`,'',`근거 신뢰도 ${CONFIDENCE_LABEL[item.confidence.level]} · ${item.confidence.reason}`,'');
  }
  if (content.criteria.length) {
    lines.push('## 판단 기준과 사건 대조', '');
    for (const c of content.criteria) {
      const a = content.assessments.find(a => a.criterionId === c.id);
      lines.push(`### ${c.label}`, '', `- 판단 축: ${DIMENSION_LABEL[c.dimension]} · ${c.perspective}`, `- 기준: ${c.definition}`,
        `- 성격: ${c.basisKind === 'analyst-derived' ? '분석가 구성 지표' : '공개 기준'} · 정의 검증 ${c.basisStatus === 'verified' ? '완료' : '미완료'}`, `- 적용: ${c.applicability.status} · ${c.applicability.reason}`, '');
      for (const b of c.basis.filter(b => b.verified)) {
        const s = run.sources.find(s => s.id === b.sourceId)!;
        lines.push(`- 기준 원문: [${s.title}](${s.url}) · ${b.locator} · ${AUTHORITY_LABEL[b.authority]} · 판본 ${b.version || '미확인'} (${b.versionStatus})`,
          `  > ${b.quote}`, ...(b.translation ? [`  > 한국어: ${b.translation}`] : []), '');
        if (s.knowledge) lines.push(`  - 기준 지식 보존: ${s.knowledge.editions.join(' · ') || '판본 미확인'} · 마지막 원문 확인 ${s.knowledge.lastCheckedAt} · ${s.knowledge.refreshState === 'fresh' ? '재확인 주기 내' : '원문 재확인 필요'}. 재확인 주기는 최신판·법적 효력의 보증이 아닙니다.`, '');
      }
      if (a) lines.push(`**${a.verification === 'pending' ? '재검증 대기' : CRITERION_STATUS[a.status]}** · ${a.reasoning} ${refs(a.claimIds)}`, '',
        ...a.limitations.map(l => `- 한계: ${l}`), ...(a.nextCheck ? [`- 다음 확인: ${a.nextCheck}`] : []), '');
    }
  }
  if (content.observations.length) {
    const n = framework.counts;
    lines.push('## 확인한 행위와 사건', '', `행위 기준 ${n.total}종 중 충족 ${n.met}종 · 부분 확인 ${n.partial}종. 시행 관측·보고 ${n.events}건, 발표·예정 ${n.announced}건.`,
      '기준 종류, 지지 사건 수, 기사 수는 다른 단위이며 반대 근거는 지지 사건으로 세지 않습니다. 이 비율은 발생·승계 확률이나 법적 성립 점수가 아닙니다.', '',
      ...content.observations.map(o => `- ${OBSERVATION_LABEL[o.kind]}: ${o.label} ${refs(o.claimIds)}`), '');
  }
  if (content.events.length > 1) lines.push('## 사건 순서', '', ...content.events.map(e => `- ${e.date}: ${e.label} ${e.evidenceIds.map(id => `[^${id}]`).join(' ')}`), '');
  if (run.imagery?.some(f=>f.verified)) {
    lines.push('## 공개 이미지 대조','');
    for(const finding of run.imagery.filter(f=>f.verified)) {
      const source=run.sources.find(s=>s.id===finding.sourceId);const media=source?.media?.find(m=>m.hash===finding.mediaHash);
      if(!source || !media)continue;
      lines.push(`### ${source.title}`,'',`![공개 이미지](${media.url})`,'',finding.description,'',finding.relevance,'',
        `- 원발신: ${source.attribution?.publisher ?? source.publisher} · ${media.credit}`,
        `- 원본 SHA-256: ${finding.mediaHash}`,...finding.limitations.map(l=>`- 한계: ${l}`),`- [배포 본문](${source.url})`,'');
    }
  }
  if (framework.perspectives.length) lines.push('## 당사자 기준과 입장', '', ...framework.perspectives.map(p => `- **${p.label}**: ${p.text} ${refs(p.claimIds)}`), '');
  if (framework.alternatives.length) lines.push('## 경쟁 설명과 다음 확인', '', ...framework.alternatives.flatMap(p => [`- **${p.label}**: ${p.text} ${refs(p.claimIds)}`, `  - 다음 확인: ${p.nextCheck}`]), '');
  if (framework.verification==='verified' && framework.outlook?.length) {
    lines.push('## 전망과 변화 징후','');
    for (const item of framework.outlook) lines.push(`### ${item.label}`,'',`전망 기간: ${item.horizon} · 가능성: ${{likely:'높음',plausible:'가능한 시나리오',unlikely:'낮음',unassessed:'미판정'}[item.likelihood]}`,'',
      `${item.text} ${refs(item.claimIds)}`,'',`근거 신뢰도 ${CONFIDENCE_LABEL[item.confidence.level]} · ${item.confidence.reason}`,'',...item.assumptions.map(a=>`- 전제: ${a}`),...item.indicators.map(i=>`- 판단 ${i.direction==='strengthens' ? '강화' : '약화'} 징후: ${i.signal}`),'');
  }
  if (run.claims.some(c=>c.quality)) lines.push('## 출처 기반과 신뢰도','', '신뢰도는 원문·주장 적합성, 기관 전문성, 확인된 독립 원출처와 반증·추론 한계를 함께 평가합니다. 가능성과 근거 신뢰도는 별개입니다. 기관 발표를 재인용한 기사와 같은 북한 배포 사진은 독립 관측으로 늘리지 않습니다.','',
    ...run.claims.filter(c=>c.quality).map(c=>`- ${c.label}: ${CONFIDENCE_LABEL[c.confidence?.level ?? 'undetermined']} · ${c.confidence?.reason}`),'');
  if(content.assessments.some(a=>a.nextCheck))lines.push('## 정보 공백과 후속 수집','',...content.assessments.filter(a=>a.nextCheck).map(a=>`- ${framework.criteria.find(c=>c.id===a.criterionId)?.label}: ${a.nextCheck}`),'');
  if (run.evidence.length) {
    lines.push('## 사건 근거 원문', '');
    for (const e of run.evidence) {
      const s = run.sources.find(s => s.id === e.sourceId)!;
      const claim = run.claims.find(c => c.id === e.claimId)!;
      lines.push(`[^${e.id}]: [${s.title}](${s.url}) · ${s.publishedAt || '발행일 미확인'} · ${s.language.toUpperCase()}. “${e.quote}”${s.language !== 'ko' ? ` 한국어: ${e.translation}` : ''} · ${claim.label} · 신뢰도 ${CONFIDENCE_LABEL[claim.confidence?.level ?? 'undetermined']}`, '');
    }
  }
  lines.push('## 조사·보존 기록', '', `- 보고서 ${run.id} · v${run.version} · ${run.createdAt}`, `- 사건 기간: ${run.dateRange.start || '제한 없음'} ~ ${run.dateRange.end || '제한 없음'}`,
    '- 기준 원문은 사건 기간과 무관하게 판본별로 보존하고 조항 단위로 재사용합니다. 재확인 주기에 따라 원문을 갱신하며 새 사건의 적용 시점·관할은 별도로 검증합니다.',
    `- 승인: ${run.approval?.decision ?? '검토 전 초안'}`, '');
  if (run.research?.queries.length) lines.push('### 조사 계획', '', ...run.research.queries.map(q => `- ${q.purpose === 'framework' ? '기준' : '사건'} · ${q.language.toUpperCase()} · ${q.query}`), '');
  if (run.research?.strategy) {
    const strategy = run.research.strategy;
    lines.push('### 질의 해석과 조사 전략', '', strategy.interpretation, '', `- 판단할 사항: ${strategy.decision}`,
      ...strategy.ambiguities.map(a => `- 해석의 모호성: ${a}`), '',
      ...strategy.stages.map((s, i) => `${i + 1}. ${s.goal} · 완료 조건: ${s.completion}`), '',
      ...strategy.evidenceRequirements.map(r => `- ${r.target}: ${r.required} · 우선 자료: ${r.preferredSources.join(' · ')} · 반증: ${r.disconfirmingEvidence}`), '',
      `조사 종료 기준: ${strategy.stoppingRule}`, '');
    if(strategy.sourcePlan?.length)lines.push('### 자료 유형별 조사 전략','',...strategy.sourcePlan.map(p=>`- ${p.module} · ${{use:'사용',conditional:'조건부',irrelevant:'관련 없음'}[p.decision]}: ${p.reason}`),'');
  }
  const ontology = buildAnalysisOntology(run);
  if (ontology.edges.length) lines.push('### 기준·사건·출처 관계', '', `- 관계 ${ontology.edges.length}개 · ${ontology.validation.conforms ? '무결성 확인' : '연결 검증 미완료'}`,
    '- 미확인을 불충족으로 추론하지 않으며, 근거 연결을 법적 성립이나 인과관계로 자동 해석하지 않습니다.', '');
  if (framework.sourcePolicies.length) lines.push('### 자료별 기간 정책', '', ...framework.sourcePolicies.map(p => `- ${run.sources.find(s => s.id === p.sourceId)?.title}: ${p.purpose} · ${p.reason}`), '');
  if (framework.rejected.length) lines.push('### 검증 제외 기록', '', ...framework.rejected.map(r => `- ${r}`), '');
  if (run.reviews.length) lines.push('### 분석가 검토 기록', '', ...run.reviews.map(r => `- v${r.version} · ${r.action}: ${r.reason}`), '');
  return lines.join('\n');
}
