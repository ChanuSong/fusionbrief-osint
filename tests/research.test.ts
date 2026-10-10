import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import type { Dataset, ResearchQuery, SourceDocument } from '../shared/types.ts';
import type { JsonModel } from '../server/model.ts';
import { parseJsonResponse } from '../server/model.ts';
import { research } from '../server/research.ts';
import { analyze, applyReview, approveReport, InputError, validEvidence } from '../server/analysis.ts';
import { detectLanguage, metadataDate, parseDuckDuckGoResults, publicationDate, publicAddress, publicURL } from '../server/public-sources.ts';

const dataset = JSON.parse(await readFile(new URL('../data/freedom-edge.json', import.meta.url), 'utf8')) as Dataset;
const body = 'The public announcement states that Japan, the Republic of Korea, and United States participated in the exercise.';
const source: SourceDocument = { id: 'fixture-source', title: 'Public announcement fixture', publisher: 'example.gov',
  type: 'official', language: 'en', url: 'https://example.gov/announcement', publishedAt: '2024-06-27',
  retrievedAt: '2024-06-28T00:00:00Z', body, hash: createHash('sha256').update(body).digest('hex'),
  format: 'html', snapshotKind: 'document', verificationMethod: 'http', links: [] };
const quote = 'Japan, the Republic of Korea, and United States participated in the exercise.';
const extracted = { claims: [{ id: 'participants', label: '참가국', target: '참가국', statement: '참가국은 일본, 한국, 미국입니다.', entityIds: ['japan'],
  evidence: [{ sourceId: source.id, quote, translation: '일본, 한국, 미국이 훈련에 참가했습니다.', stance: 'supports', value: '한국·미국·일본', originURL: '', originQuote: '' }] }],
  entities: [{ id: 'japan', label: '일본', type: 'country' }], assessments: [], gaps: [], events: [], locations: [], relations: [] };
const plan = { scope: { geography: '한미일', period: '2024년 6월', task: 'event', assumptions: [], hypotheses: [] }, topic: '프리덤 에지', targets:['참가국'], queries: ['ko','zh','ja','ru','en'].map((language, i) => ({ module: i % 2 ? 'news' : 'official', language, query: `${language} 프리덤 에지 2024` })) };
const coverage = { documents: [{ sourceId: source.id, role: 'direct', quote, reason: '질문의 참가국 명시' }],
  coverage: [{ target: '참가국', status: 'answered', sourceIds: [source.id], reason: '공식 원문 참가국 명시' }], nextQueries: [] };
function fixtureModel(outputs: unknown[]): JsonModel {
  return { async generate<T>(schema: z.ZodType<T>): Promise<T> {
    assert.ok(outputs.length, 'unexpected model call');
    const output = outputs.shift() as Record<string, unknown>;
    // Relevance and extraction now share one response. Keep the independent verifier separate.
    if ('documents' in output) {
      const draft = outputs[0] && 'claims' in (outputs[0] as object) ? outputs.shift() as object
        : { claims: [], entities: [], assessments: [], gaps: [], events: [], locations: [], relations: [] };
      return schema.parse({ ...draft, collectionAudit: output });
    }
    return schema.parse(output);
  } };
}
const verdict = { verdicts: [{ id: 'participants-e1', verdict: 'supports', translationAccurate: true, reason: '참가국이 명시됨' }],
  claimVerdicts:[{claimId:'participants',grounded:true,evidenceIds:['participants-e1'],reason:'모든 참가국 명시'}] };
async function fixtureResearch(output = structuredClone(extracted), verification = structuredClone(verdict)) {
  const queries: ResearchQuery[] = [];
  const run = await research({ question: '프리덤 에지 참가국', mode: 'live' }, () => undefined, {
    model: fixtureModel([plan, coverage, output, verification]),
    search: async query => { queries.push(query); return [{ url: source.url, title: source.title, module: query.module, language: query.language }]; },
    read: async () => structuredClone(source),
  });
  return { run, queries };
}

test('live orchestration executes requested languages, retains exact evidence and starts with unconfirmed independence', async () => {
  const { run, queries } = await fixtureResearch();
  assert.deepEqual(new Set(queries.map(q=>q.language)), new Set(['ko','zh','ja','ru','en']));
  assert.ok(queries.some(q=>q.module==='official') && queries.some(q=>q.module==='news'));
  assert.equal(run.mode, 'live'); assert.equal(run.claims.length, 1);
  assert.equal(run.claims[0].statement, '참가국은 일본, 한국, 미국입니다.');
  assert.equal(run.claims[0].confidence?.level, 'medium');
  assert.equal(run.claims[0].independentCount, 0);
  assert.ok(validEvidence(run.evidence[0], run.sources[0]));
  assert.equal(run.research?.trace.at(-1)?.stage, '보고서');
  assert.equal(run.research?.searches?.length, queries.length);
  assert.ok(run.research?.searches?.every(search => search.hits[0].url === source.url && !search.error));
});

test('search parser distinguishes a CAPTCHA page, genuine zero results and an unreadable response', () => {
  const query: ResearchQuery = { module: 'news', language: 'en', query: 'Freedom Edge' };
  assert.throws(() => parseDuckDuckGoResults('<form id="challenge-form" action="/anomaly.js">Human verification</form>', query), /DuckDuckGo.*CAPTCHA/);
  assert.deepEqual(parseDuckDuckGoResults('<div class="result--no-result">No results found</div>', query), []);
  assert.throws(() => parseDuckDuckGoResults('<html><body>Unknown response</body></html>', query), /응답 형식/);
  const results = parseDuckDuckGoResults('<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.gov%2Fannouncement">Announcement</a>', query);
  assert.equal(results[0]?.url, source.url);
});

test('search failure reasons reach both progress updates and the saved report without hiding usable URL evidence', async () => {
  const reason = 'DuckDuckGo · 자동 검색 차단: 사람 인증(CAPTCHA) 필요';
  const progress: string[] = [];
  const run = await research({ question: '프리덤 에지 참가국', mode: 'live', urls: [source.url] }, event => progress.push(event.message), {
    model: fixtureModel([plan, coverage, structuredClone(extracted), structuredClone(verdict)]),
    search: async () => { throw new Error(reason); }, read: async () => structuredClone(source),
  });
  const failures = run.research!.trace.filter(event => event.stage === '검색' && event.status === 'failed');
  assert.equal(failures.length, plan.queries.length);
  assert.ok(failures.every(event => event.message.includes(reason) && progress.includes(event.message)));
  assert.ok(run.research?.searches?.every(search => search.error === reason && search.hits.length === 0));
  assert.equal(run.claims.length, 1);
  assert.ok(run.gaps.some(gap => gap.includes('검색 또는 원문 접근이 실패')));
});

test('invented quotations are rejected before semantic verification', async () => {
  const output = structuredClone(extracted); output.claims[0].evidence[0].quote = 'No such passage exists in the public announcement.';
  const run = await research({ question:'프리덤 에지 참가국',mode:'live' },()=>undefined, {
    model:fixtureModel([plan,coverage,output]),search:async query=>[{url:source.url,title:source.title,module:query.module,language:query.language}],read:async()=>source,
  });
  assert.equal(run.claims.length, 0); assert.equal(run.evidence.length, 0);
  assert.deepEqual(run.citationCheck,{checked:1,passed:0,rejected:1});
  assert.ok(run.research?.rejectedCitations[0].includes('원문 인용 없음'));
});

test('literal quote match alone cannot substantiate an unrelated claim or inaccurate translation', async () => {
  for (const check of [{ verdict: 'unrelated', translationAccurate: true }, { verdict: 'supports', translationAccurate: false }]) {
    const { run } = await fixtureResearch(structuredClone(extracted), { ...verdict, verdicts:[{id:'participants-e1',...check,reason:'의미 또는 번역 불일치'}] } as typeof verdict);
    assert.equal(run.claims.length, 0); assert.equal(run.citationCheck.rejected, 1);
  }
});

test('incomplete multilingual plans fail clearly, without running collection', async () => {
  await assert.rejects(()=>research({question:'사건 분석',mode:'live'},()=>undefined, {
    model:fixtureModel([{scope:plan.scope,topic:'사건',targets:['사건'],queries:plan.queries.slice(0,2)}]),search:async()=>{throw new Error('must not search')},read:async()=>source,
  }), (e:unknown)=>e instanceof InputError && e.message.includes('누락'));
});

test('computed origin counts and information gaps answer their actual question', () => {
  const count = analyze(dataset,{question:'참가국을 확인하는 근거는 몇 묶음인가?',mode:'snapshot'});
  assert.match(count.answer!.paragraphs[0].text,/원출처 4묶음/);
  assert.match(count.answer!.paragraphs[0].text,/독립성이 확인된 묶음은 0개/);
  const gaps = analyze(dataset,{question:'수집한 자료만으로 확인하기 어려운 내용은 무엇인가?',mode:'snapshot'});
  assert.equal(gaps.answer?.intent,'gaps'); assert.ok(gaps.answer!.paragraphs.some(p=>p.text.includes('실제 훈련 성과')));
  const partial = analyze(dataset,{question:'프리덤 에지 참가국과 총 비용은?',mode:'snapshot'});
  assert.equal(partial.claims.length,1); assert.equal(partial.claims[0].id,'participants');
  assert.ok(partial.gaps.some(g=>g.includes('비용')));
});

test('analyst approval is versioned and an evidence review invalidates the current approval', () => {
  const original = analyze(dataset,{question:'참가국',mode:'snapshot'});
  const approved = approveReport(original,{reviewer:'홍길동',decision:'approved',reason:'검토용: 인용과 제한사항 확인',expectedVersion:1});
  assert.equal(approved.version,2); assert.equal(approved.approval?.decision,'approved');
  const edited = applyReview(approved,{claimId:'participants',action:'split',evidenceIds:['navy-participants'],reason:'검토용: 원출처 관계 분리',expectedVersion:2});
  assert.equal(edited.approval,undefined); assert.equal(edited.approvals?.length,1);
  assert.throws(()=>approveReport(approved,{reviewer:'홍길동',decision:'approved',reason:'검토용: 다시 승인',expectedVersion:1}),InputError);
});

test('model JSON and public reader reject malformed output, local URLs and private networks', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"ok":true}\n```'),{ok:true});
  assert.throws(()=>parseJsonResponse('not json'));
  for(const ip of ['127.0.0.1','10.0.0.2','192.168.1.1','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1']) assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const url of ['http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://user:pass@example.com']) assert.throws(()=>publicURL(url));
});

test('publication metadata keeps the original calendar day and language labels follow the body', () => {
  assert.equal(metadataDate('2026.09.30'), '2026-09-30');
  assert.equal(metadataDate('8 October 2026'), '2026-10-08');
  assert.equal(metadataDate('2026-10-08T01:00:00+09:00'), '2026-10-08');
  assert.equal(metadataDate('31 February 2026'), '');
  assert.equal(metadataDate('2026-02-31'), '');
  assert.equal(metadataDate('Exercises ended on 8 October 2026'), '');
  assert.equal(publicationDate('Jun 27, 2024 Joint Staff (Announcement)',true),'2024-06-27');
  assert.equal(publicationDate('등록일 : 2024.06.27 18:05'),'2024-06-27');
  assert.equal(publicationDate('We held the event Jun 27, 2024'), '');
  assert.equal(detectLanguage('한미일 삼국은 공개 원문을 발표했고 날짜와 참가국을 확인할 수 있습니다. 한국어 자료를 수집합니다.'),'ko');
  assert.equal(detectLanguage('日本と韓国及び米国はフリーダムエッジの訓練について発表しました。この訓練は公開情報から確認することができます。'),'ja');
  assert.equal(detectLanguage('中华人民共和国政府公开发布了相关资料可以通过原始文件核对各项事实以及来源独立性并验证信息。'),'zh');
  assert.equal(detectLanguage('Российская Федерация опубликовала официальный документ об учениях. Проверка открытых источников необходима для анализа.'),'ru');
});

test('compatible differences in detail do not count as verified contradiction in live analysis', async () => {
  const output=structuredClone(extracted);
  output.claims[0].evidence.push({...output.claims[0].evidence[0],value:'일본, 한국, 미국이 참여한 다영역 훈련'});
  const checks={...verdict, verdicts:[...verdict.verdicts,{...verdict.verdicts[0],id:'participants-e2'}]};
  const {run}=await fixtureResearch(output,checks);
  assert.notEqual(run.claims[0].status,'conflicting');
});

test('partial quotations cannot establish a complete claim when required coverage is absent', async () => {
  const check=structuredClone(verdict); check.claimVerdicts[0].grounded=false;
  const {run}=await fixtureResearch(structuredClone(extracted),check);
  assert.equal(run.claims.length,0);
  assert.ok(run.gaps.some(g=>g.startsWith('참가국:')));
});

test('blocked web searches and foreign abstracts cannot masquerade as a current local-opinion answer', async () => {
  const foreign = { ...source, id: 'foreign-paper', type: 'paper' as const, snapshotKind: 'abstract' as const,
    body: 'Five Slovak websites were studied for pro-Russian narratives in 2023.', publishedAt: '2025-01-09' };
  const localPlan = { ...plan, scope: { geography: '한국', period: '최근 30일', task: 'influence', assumptions: ['지역 미지정으로 한국을 가정'], hypotheses: ['실제 증가 여부 미확인'] },
    targets: ['국내 확산 경로'], queries: [...plan.queries, { module: 'papers', language: 'en', query: 'opinion research' }] };
  const audit = { documents: [{ sourceId: foreign.id, role: 'background', quote: foreign.body, reason: '다른 지역·시점의 연구' }],
    coverage: [{ target: '국내 확산 경로', status: 'missing', sourceIds: [], reason: '국내 최신 관측 자료 없음' }],
    nextQueries: [{ module: 'news', language: 'ko', query: '한국 최근 여론 계기' }] };
  const run = await research({ question: '최근 한국 친러 여론이 어디서 만들어지나?', mode: 'live' }, () => undefined, {
    model: fixtureModel([localPlan, audit]), search: async q => {
      if (q.module !== 'papers') throw new Error('DuckDuckGo · CAPTCHA 필요');
      return [{ url: source.url, title: 'Slovak research', module: q.module, language: q.language }];
    }, read: async () => foreign,
  });
  assert.equal(run.claims.length, 0); assert.equal(run.answer!.paragraphs.length, 0);
  assert.equal(run.scope, 'unsupported');
  assert.match(run.research!.stopReason!, /접근 차단/);
  assert.equal(run.sources.length, 1); // kept for audit, excluded from answer
  assert.equal(run.research!.coverage![0].status, 'missing');
  assert.equal(run.wisdom!.inferences.length, 0);
});

test('missing scope evidence triggers a new targeted search and uses only the relevant body', async () => {
  const foreign = { ...source, id: 'foreign', url: 'https://example.org/old', body: 'An old foreign case study cannot answer this local question.' };
  const retry = { module: 'news', language: 'ko', query: '확인한 사건의 공식 발표 원문' };
  const first = { documents: [{ sourceId: foreign.id, role: 'background', quote: foreign.body, reason: '범위 밖' }],
    coverage: [{ target: '참가국', status: 'missing', sourceIds: [], reason: '질문 대상 사건의 참가국 없음' }], nextQueries: [retry] };
  const second = { ...coverage, documents: [...first.documents, ...coverage.documents] };
  const queries: string[] = [];
  const run = await research({ question: '해당 사건의 참가국', mode: 'live' }, () => undefined, {
    model: fixtureModel([plan, first, second, extracted, verdict]),
    search: async q => { queries.push(q.query); const doc = q.query === retry.query ? source : foreign;
      return [{ url: doc.url, title: doc.title, module: q.module, language: q.language }]; },
    read: async hit => hit.url === source.url ? source : foreign,
  });
  assert.equal(run.research!.rounds!.length, 2); assert.ok(queries.includes(retry.query));
  assert.equal(run.claims.length, 1);
  assert.ok(run.evidence.every(e => e.sourceId === source.id));
});

test('coverage cannot use fabricated source IDs or quotes to mark targets answered', async () => {
  const audit = { documents: [{ sourceId: source.id, role: 'direct', quote: 'A fabricated relevance quotation.', reason: '무효 인용' }],
    coverage: [{ target: '참가국', status: 'answered', sourceIds: [source.id, 'invented'], reason: '무효 근거' }], nextQueries: [] };
  const run = await research({ question: '참가국', mode: 'live' }, () => undefined, {
    model: fixtureModel([plan, audit]), search: async q => [{ url: source.url, title: source.title, module: q.module, language: q.language }],
    read: async () => source,
  });
  assert.equal(run.claims.length, 0); assert.equal(run.research!.coverage![0].status, 'missing');
});

test('an all-failure collection preserves diagnostics instead of generating a substitute answer', async () => {
  const audit = { documents: [], coverage: [{ target: '참가국', status: 'missing', sourceIds: [], reason: '본문 없음' }], nextQueries: [] };
  const run = await research({ question: '참가국', mode: 'live' }, () => undefined, {
    model: fixtureModel([plan, audit]), search: async () => { throw new Error('CAPTCHA'); }, read: async () => { throw new Error('must not read'); },
  });
  assert.equal(run.sources.length, 0); assert.equal(run.claims.length, 0);
  assert.ok(run.research!.searches!.every(s => !!s.error));
});

test('search slots refill before a slow search ends and priority documents overlap searches', async () => {
  const events: import('../shared/types.ts').ResearchTrace[] = [];
  let releaseSlow!: () => void;
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  let firstDone = false;
  let priorityRead = false;
  let active = 0;
  let maxActive = 0;
  let fifthStartedBeforeSlow = false;
  const work = research({ question: '참가국', mode: 'live', urls: [source.url] }, event => events.push(event), {
    model: fixtureModel([plan, coverage, structuredClone(extracted), structuredClone(verdict)]),
    search: async query => {
      active++; maxActive = Math.max(maxActive, active);
      if (query.language === 'ko') { await slow; firstDone = true; }
      if (query.language === 'en') {
        fifthStartedBeforeSlow = !firstDone;
        assert.ok(priorityRead, 'known URL is read during searches');
        assert.ok(events.some(e => e.stage === '검색' && e.status === 'complete'), 'fast completion is visible before the slow query finishes');
        releaseSlow();
      }
      await new Promise(resolve => setTimeout(resolve, 3));
      active--; return [{ url: source.url, title: source.title, module: query.module, language: query.language }];
    },
    read: async () => { priorityRead = true; return structuredClone(source); },
  });
  const run = await work;
  assert.ok(fifthStartedBeforeSlow);
  assert.equal(maxActive, 4);
  assert.equal(run.sources.length, 1, 'same URL is never fetched twice');
  for (const event of events.filter(e => e.taskId && e.status === 'running'))
    assert.ok(events.some(e => e.taskId === event.taskId && e.status !== 'running'), `${event.taskId} resolves`);
  assert.ok(events.some(e => e.stage === '검색' && e.detail?.includes('프리덤')));
  assert.ok(events.some(e => e.stage === '수집' && e.url === source.url));
});

test('equivalent whitespace queries share one search budget slot without losing a requested language', async () => {
  const duplicatePlan = { ...plan, queries: [...plan.queries, { ...plan.queries[0], query: `  ${plan.queries[0].query.replaceAll(' ', '  ')}  ` }] };
  const calls: ResearchQuery[] = [];
  const result = await research({ question: '참가국', mode: 'live' }, () => undefined, {
    model: fixtureModel([duplicatePlan, coverage, structuredClone(extracted), structuredClone(verdict)]),
    search: async query => { calls.push(query); return [{ url: source.url, title: source.title, language: query.language, module: query.module }]; },
    read: async () => structuredClone(source),
  });
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls.map(q => q.language)).size, 5);
  assert.equal(result.research?.queries.length, 5);
});

test('the report preserves an independently verified composed answer instead of emitting claim rows', async () => {
  const draft = { ...structuredClone(extracted), answer: [
    { heading: '핵심 답변', text: '이 훈련에는 한국·미국·일본이 참가했습니다.', claimIds: ['participants'], kind: 'fact' },
    { heading: '확인 범위', text: '참가국은 공개 발표에 명시되어 있습니다.', claimIds: ['participants'], kind: 'assessment' },
  ] };
  const checked = { ...structuredClone(verdict), answerVerdicts: [
    { index: 0, supported: true, reason: '참가국 일치' }, { index: 1, supported: true, reason: '원문에 명시' },
  ] };
  const run = await research({question:'참가국을 설명해줘',mode:'live'},()=>undefined,{
    model:fixtureModel([plan,coverage,draft,checked]),search:async q=>[{url:source.url,title:source.title,module:q.module,language:q.language}],read:async()=>source,
  });
  assert.equal(run.answer?.composition,'synthesized');
  assert.deepEqual(run.answer?.paragraphs,draft.answer);
  assert.equal(run.answer?.paragraphs[0].heading,'핵심 답변');
});

test('a cited narrative cannot bypass grounding or retain a rejected claim', async () => {
  for (const claimIds of [['participants'], ['fabricated-claim']]) {
    const draft = { ...structuredClone(extracted), answer: [
      { heading: '핵심 답변', text: '참가국이 전쟁을 시작했습니다.', claimIds, kind: 'fact' },
    ] };
    const checked = { ...structuredClone(verdict), answerVerdicts: [{ index: 0, supported: claimIds[0] !== 'participants', reason: '검증 fixture' }] };
    const run = await research({question:'참가국',mode:'live'},()=>undefined,{
      model:fixtureModel([plan,coverage,draft,checked]),search:async q=>[{url:source.url,title:source.title,module:q.module,language:q.language}],read:async()=>source,
    });
    assert.equal(run.answer?.composition,'fallback');
    assert.ok(run.answer?.paragraphs.every(p=>!p.text.includes('전쟁')));
  }
});

test('discovered documents start loading while other language searches are still running', async () => {
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve});
  let slowDone=false, overlap=false;
  await research({question:'참가국',mode:'live'},()=>undefined,{
    model:fixtureModel([plan,coverage,structuredClone(extracted),structuredClone(verdict)]),
    search:async q=>{
      if(q.language==='ko'){await pending;slowDone=true;}
      return [{url:source.url,title:source.title,module:q.module,language:q.language}];
    },
    read:async()=>{overlap=!slowDone;release();return source;},
  });
  assert.equal(overlap,true);
});

test('partial source coverage is retained without repeating searches for unavailable originals', async () => {
  const audit = { ...coverage, coverage: [{ ...coverage.coverage[0], status: 'partial', reason: '발표 내용은 확인했지만 독립 원출처는 미확인' }],
    nextQueries: [{ module: 'news', language: 'ko', query: '같은 발표의 원문 재검색' }] };
  let calls=0;const base=fixtureModel([plan,audit,structuredClone(extracted),structuredClone(verdict)]);
  const run=await research({question:'참가국',mode:'live'},()=>undefined,{
    model:{generate:async(schema,instructions,data)=>{calls++;return base.generate(schema,instructions,data);}},
    search:async q=>[{url:source.url,title:source.title,module:q.module,language:q.language}],read:async()=>source,
  });
  assert.equal(calls,3,'plan, combined relevance/draft, independent verification');
  assert.equal(run.research?.rounds?.length,1);
  assert.equal(run.research?.coverage?.[0].status,'partial');
  assert.ok(run.gaps.some(g=>g.includes('독립 원출처')));
});

test('a request to trace re-citations retains the verified substantive answer, including after review', async () => {
  const draft = { ...structuredClone(extracted), answer: [{ heading: '참가국', text: '참가국은 일본, 한국, 미국입니다.', claimIds: ['participants'], kind: 'fact' }] };
  const checked = { ...structuredClone(verdict), answerVerdicts: [{ index: 0, supported: true, reason: '참가국 원문 확인' }] };
  const run = await research({ question: '참가국을 확인하고 재인용·원출처도 교차검증해줘.', mode: 'live' }, () => undefined, {
    model: fixtureModel([plan, coverage, draft, checked]),
    search: async query => [{ url: source.url, title: source.title, module: query.module, language: query.language }],
    read: async () => structuredClone(source),
  });
  assert.equal(run.answer?.composition, 'synthesized');
  assert.equal(run.answer.paragraphs[0].text, draft.answer[0].text);
  const reviewed = applyReview(run, { expectedVersion: 1, claimId: 'participants', action: 'independence', evidenceIds: ['participants-e1'], independent: false, reason: '추가 독립 원출처는 아직 확인하지 못했습니다.' });
  assert.equal(reviewed.answer?.paragraphs[0].text, draft.answer[0].text);
});
