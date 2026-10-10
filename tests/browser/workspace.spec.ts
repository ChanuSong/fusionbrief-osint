import { test, expect } from '@playwright/test';
import { wisdomFixture } from '../fixtures/wisdom.ts';
const DEFAULT_QUESTION = '김주애의 북한 후계자 계승 가능성은? 근거와 전망을 분석해줘.';

test('question → report → original quote → graph → timeline → review → persisted record → export', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto('/');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '공개정보 분석' })).toBeVisible();
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '판단별 근거', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '분석 질문' })).toHaveCount(0);
  await expect(page.locator('.question-bar')).toContainText('프리덤 에지');
  await expect(page.locator('.answer-footer')).toContainText('16/16');
  await expect(page.locator('.answer-list > li')).toHaveCount(3);
  await expect(page.locator('.answer-list')).toContainText('한국·미국·일본');
  await expect(page.locator('.funnel-step').nth(1)).toContainText('4');
  await expect(page.getByRole('heading', { name: '원출처와 독립성' })).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-overview.png', fullPage: true });

  await page.getByRole('tab', { name: /근거 그래프/ }).click();
  await expect(page.getByRole('heading', { name: '판단의 근거 경로' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /타임라인/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /타임라인/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.graph-panel .evidence-node')).toHaveCount(8);
  await page.getByRole('button', { name: '일본 방위성 원문 근거 보기', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('mark')).toBeVisible();
  await expect(page.getByRole('link', { name: '공개 원문 열기' })).toHaveAttribute('href', /mod\.go\.jp/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '일본 방위성 원문 근거 보기', exact: true })).toBeFocused();

  await page.getByRole('tab', { name: /타임라인/ }).click();
  await expect(page.locator('.event-band')).toContainText('2024.06.27 – 06.29');
  await expect(page.locator('.timeline-day')).toHaveCount(3);

  await page.getByRole('tab', { name: /^원출처$/ }).click();
  await page.getByRole('button', { name: 'US Navy 원문 보기', exact: true }).click();
  await expect(page.getByRole('dialog').locator('mark')).toHaveText('Japan, the Republic of Korea, and United States');
  await expect(page.getByRole('link', { name: '공개 원문 열기' })).toHaveAttribute('href', /navy\.mil/);
  await page.screenshot({ path: 'test-results/workspace-source.png' });
  await page.getByRole('button', { name: '원문 창 닫기' }).click();

  await page.getByRole('button', { name: '분석가 검토' }).click();
  await page.getByRole('checkbox', { name: 'US Navy 근거 선택', exact: true }).check();
  await page.getByLabel('검토 이유').fill('브라우저 검증: 원출처 관계를 재검토하기 위해 분리했습니다.');
  await page.getByRole('tab', { name: /근거 그래프/ }).click();
  await page.getByRole('tab', { name: /^원출처$/ }).click();
  await expect(page.getByRole('checkbox', { name: 'US Navy 근거 선택', exact: true })).toBeChecked();
  await expect(page.getByLabel('검토 이유')).toHaveValue('브라우저 검증: 원출처 관계를 재검토하기 위해 분리했습니다.');
  await expect(page.getByRole('button', { name: '검토 반영', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '근거 1개 분리' }).click();
  await page.getByRole('button', { name: '검토 반영', exact: true }).click();
  await expect(page.locator('.report-header')).toContainText('v2');
  await expect(page.locator('.funnel-step').nth(1)).toContainText('5');
  await expect(page.getByRole('status')).toContainText('검토 저장 완료');
  await expect(page.getByRole('alert')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Markdown 내려받기' }).click();
  expect((await download).suggestedFilename()).toMatch(/osint-report.*\.md$/);
  await page.reload();
  await page.locator('.recent-runs button').first().click();
  await expect(page.locator('.report-header')).toContainText('v2');
  await page.getByRole('button', { name: '검토 기록', exact: false }).click();
  await expect(page.locator('.audit-list')).toContainText('브라우저 검증: 원출처 관계를 재검토하기 위해 분리했습니다.');
  await page.getByRole('button', { name: '분석', exact: true }).click();
  await page.getByRole('button', { name: '참가국 판단 선택' }).click();
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('insufficient evidence is explicit, explains why, and never fabricates an answer', async ({ page }) => {
  await page.goto('/');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await page.getByRole('textbox', { name: '분석 질문' }).fill('프리덤 에지의 총 비용은 얼마인가?');
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '질문에 답할 원문 근거를 확보하지 못했습니다.', exact: true })).toBeVisible();
  await expect(page.locator('.gaps-card')).toContainText('비용·피해·인원');
  await expect(page.locator('.claim-card')).toHaveCount(0);
  await page.getByRole('button', { name: '질문 수정', exact: true }).click();
  await page.locator('.query-options > summary').click();
  await page.getByLabel('분석 질문').fill('2024년 6월 첫 프리덤 에지의 일정, 참가국, 발표 목적을 정리하고 원출처를 구분해줘.');
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.locator('.claim-card')).toHaveCount(3);
});

test('source library works and workspace fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await page.getByRole('button', { name: '공개 자료', exact: false }).click();
  await page.getByRole('button', { name: /^공식 발표/ }).click();
  await expect(page.locator('.source-row')).toHaveCount(2);
  await page.getByRole('button', { name: /^언론 보도/ }).click();
  await expect(page.locator('.source-row')).toHaveCount(5);
  await page.getByRole('textbox', { name: '출처 검색' }).fill('연합뉴스');
  await expect(page.locator('.source-row')).toHaveCount(1);
  await page.locator('.source-row').click();
  await expect(page.getByRole('dialog')).toContainText('한미일이');
  await page.getByRole('button', { name: '원문 창 닫기' }).click();
  await page.getByRole('button', { name: '분석', exact: true }).click();
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.locator('.report-header')).toContainText('분석 보고서');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  for (const tab of [/근거 그래프/, /타임라인/]) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await expect(page.getByRole('heading', { name: '판단의 근거 경로' })).toBeHidden();
  await page.getByRole('tab', { name: /^원출처$/ }).click();
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
});

test('question settings, keyboard submit, and edit cancellation preserve the report', async ({ page }) => {
  await page.goto('/');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await expect(page.getByLabel('발행 시작일')).toBeVisible();
  await page.getByText('시연 원문 재확인', { exact: true }).click();
  await expect(page.locator('p.query-mode-note')).toContainText('프리덤 에지 2024');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await page.getByLabel('분석 질문').focus();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.report-header')).toContainText('v1');
  await page.getByRole('button', { name: '질문 수정', exact: true }).click();
  await page.getByLabel('분석 질문').fill('프리덤 에지의 총 비용은 얼마인가?');
  await page.locator('.query-options > summary').click();
  await page.getByLabel('발행 시작일').fill('2024-06-28');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.question-bar')).toContainText('일정, 참가국, 발표 목적');
  await expect(page.locator('.claim-card')).toHaveCount(3);
  await page.getByRole('button', { name: '질문 수정', exact: true }).click();
  await page.locator('.query-options > summary').click();
  await expect(page.getByLabel('발행 시작일')).toHaveValue('2024-06-27');
  await page.getByRole('button', { name: '새 분석', exact: true }).click();
  await expect(page.locator('.report-header')).toHaveCount(0);
  await expect(page.getByLabel('분석 질문')).toHaveValue(DEFAULT_QUESTION);
  await expect(page.getByRole('button', { name: '5분 시연 시작' })).toHaveCount(0);
});

test('API rejects invalid dates, cross-site changes, unknown exports, and local private-file access', async ({ request }) => {
  const invalid = await request.post('/api/runs', { data: { question: '참가국', mode: 'snapshot', startDate: '2024-02-31' } });
  expect(invalid.status()).toBe(400);
  const crossSite = await request.post('/api/runs', { headers: { Origin: 'https://unrelated.example' }, data: { question: '참가국', mode: 'snapshot' } });
  expect(crossSite.status()).toBe(403);
  const missing = await request.get('/api/runs/00000000-0000-0000-0000-000000000000/export');
  expect(missing.status()).toBe(404);
  expect((await request.get('/onboarding-draft.json')).status()).toBe(404);
  expect((await request.get('/api/health')).status()).toBe(200);
});

test('analyst approval is persisted, exported, and invalidated by an evidence review', async ({ page }) => {
  await page.goto('/');
  await page.locator('.query-options > summary').waitFor();
  if (await page.locator('.query-options:not([open])').count()) await page.locator('.query-options > summary').click();
  await page.getByText('시연 자료', { exact: true }).click();
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await page.getByRole('heading', { name: '질문에 대한 답변', exact: true }).waitFor();
  await page.getByText('검토 결정 기록', { exact: true }).click();
  await page.getByLabel('검토자', { exact: true }).fill('브라우저 QA');
  await page.getByLabel('검토 의견', { exact: true }).fill('검증용 시연 자료의 인용과 표시 상태를 확인했습니다.');
  await page.getByRole('button', { name: '결정 저장', exact: true }).click();
  await expect(page.locator('.approval-panel')).toContainText('승인됨');
  await expect(page.locator('.report-header')).toContainText('v2');
  await page.reload();
  await page.locator('.recent-runs button').first().click();
  await expect(page.locator('.approval-record')).toContainText('브라우저 QA');
  await page.getByRole('button', { name: '분석가 검토', exact: true }).click();
  await page.getByRole('checkbox', { name: 'US Navy 근거 선택', exact: true }).check();
  await page.getByRole('button', { name: '근거 1개 분리', exact: true }).click();
  await page.getByLabel('검토 이유').fill('검증용: 승인 후 근거 관계를 수정했습니다.');
  await page.getByRole('button', { name: '검토 반영', exact: true }).click();
  await expect(page.locator('.report-header')).toContainText('v3');
  await expect(page.locator('.approval-panel .section-heading')).toContainText('검토 대기');
  await page.getByRole('button', { name: /^검토 기록/ }).click();
  await expect(page.locator('.approval-audit')).toContainText('이전 결정');
});

test('custom question and source URLs → graph inference → premise quotation', async ({ page }) => {
  const run = wisdomFixture();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(); const boot = await response.json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, model: 'test', message: '검증용 연결' } } });
  });
  let payload: { question: string; urls: string[] } | undefined;
  await page.route('**/api/analyses', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'test-job', state: 'complete', trace: [], run } });
  });
  await page.goto('/');
  await page.getByLabel('분석 질문').fill(run.question);
  await page.locator('.query-options > summary').click();
  await page.locator('.source-url-settings > summary').click();
  await page.getByLabel('한 줄에 하나 · 최대 5개').fill(run.sources.map(s => s.url).join('\n'));
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  expect(payload!.question).toBe(run.question);
  expect(payload!.urls).toEqual(run.sources.map(s => s.url));
  await expect(page.getByRole('heading', { name: '사건 관계', exact: true })).toBeVisible();
  await expect(page.locator('.cytoscape-viewport canvas').first()).toBeVisible();
  await expect(page.locator('.network-entities button')).toHaveCount(3);
  await expect(page.locator('.wisdom-node.inference')).toHaveCount(0);
  await page.getByRole('link', { name: /사건 관계/ }).click();
  await expect(page.getByRole('link', { name: /사건 관계/ })).toHaveAttribute('aria-current', 'location');
  const beforeZoom = Number((await page.locator('.wisdom-tools > span').innerText()).replace('%', ''));
  await page.getByRole('button', { name: '그래프 확대', exact: true }).click();
  await expect.poll(async () => Number((await page.locator('.wisdom-tools > span').innerText()).replace('%', ''))).toBeGreaterThan(beforeZoom);
  await page.getByRole('button', { name: '그래프 보기 초기화' }).click();
  await expect.poll(async () => Number((await page.locator('.wisdom-tools > span').innerText()).replace('%', ''))).toBeLessThanOrEqual(100);
  await page.locator('.network-list').evaluate(el => { el.setAttribute('open', ''); });
  await page.locator('.network-entities button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '관계 인용 1 원문 보기' })).toBeVisible();
  await page.getByRole('button', { name: '관계 인용 1 원문 보기' }).click();
  await expect(page.getByRole('dialog').locator('mark')).toHaveText(run.evidence[0].quote);
  await page.keyboard.press('Escape');
  await page.locator('.network-list li button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-inspector')).toContainText('인용한다');
  await page.locator('.network-list').evaluate(el => { el.setAttribute('open', ''); });
  await page.locator('.network-entities button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-inspector')).toContainText('Channel Alpha');
  await page.screenshot({ path: 'test-results/wisdom-graph.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: '새 분석', exact: true }).click();
  await expect(page.getByLabel('분석 질문')).toHaveValue(DEFAULT_QUESTION);
  await page.locator('.query-options > summary').click();
  await page.locator('.source-url-settings > summary').click();
  await expect(page.getByLabel('한 줄에 하나 · 최대 5개')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('home prefills the succession question and does not fetch or show demos and recommendations', async ({ page }) => {
  let removedRequests = 0;
  await page.route('**/api/bootstrap', async route => {
    const boot = await (await route.fetch()).json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, message: '검증용 연결' } } });
  });
  for (const endpoint of ['topics', 'demo']) await page.route('**/api/' + endpoint, route => {
    removedRequests++;
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.getByLabel('분석 질문')).toHaveValue(DEFAULT_QUESTION);
  await expect(page.getByRole('button', { name: '분석 실행', exact: true })).toBeEnabled();
  await expect(page.locator('.demo-launcher,.topic-section,.query-recommendation,.question-suggestions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '5분 시연 시작' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/analysis-home.png' });
  expect(removedRequests).toBe(0);
});

test('live analysis shows actual stages, counts, delay and then the report', async ({ page }) => {
  const run = wisdomFixture();
  await page.route('**/api/bootstrap', async route => {
    if (complete) return route.abort();
    const boot = await (await route.fetch()).json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, message: '검증용 연결' } } });
  });
  await page.route('**/api/topics', route => route.fulfill({ json: { state: 'disabled', topics: [], trace: [], message: '검증용' } }));
  const at = new Date(Date.now() - 95_000).toISOString();
  let trace: import('../../shared/types.ts').ResearchTrace[] = [{ stage: '계획', message: '검증용 질문 범위를 확인했습니다.', at, status: 'complete' }];
  let complete = false;
  let starts = 0;
  await page.route('**/api/analyses', route => { starts++; return route.fulfill({ json: { id: 'progress-test', state: 'running', trace } }); });
  await page.route('**/api/analyses/progress-test', route => route.fulfill({ json: { id: 'progress-test', state: complete ? 'complete' : 'running', trace, ...(complete ? { run } : {}) } }));
  await page.goto('/');
  await page.getByLabel('분석 질문').fill(run.question);
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '질문 해석 중입니다' })).toBeVisible();
  await expect(page.getByLabel('분석 질문')).toHaveCount(0);
  await expect(page.locator('.topic-section')).toHaveCount(0);
  await expect(page.locator('.progress-question')).toHaveText(run.question);
  trace = [...trace,
    { stage: '검색', message: '검증용 한국어 검색을 완료했습니다.', at, status: 'complete' },
    { stage: '수집', message: '검증용 원문 1개를 확보했습니다.', at, status: 'complete', url: 'https://example.gov/collected', detail: '日米韓3か国による初のマルチドメイン共同訓練の公開原文を確認しました。'.repeat(4), durationMs: 300 },
    { stage: '수집', message: '검증용 사이트 접근 제한', at, status: 'failed' },
    { stage: '수집', message: '나머지 공개 원문을 확인하고 있습니다.', at, status: 'running', taskId: 'read-a', url: 'https://example.gov/document', detail: '검증용 원문 제목' },
  ];
  await expect(page.getByRole('heading', { name: '수집·재탐색 중입니다' })).toBeVisible();
  await expect(page.getByLabel('현재 실행 중인 작업')).toContainText('검증용 원문 제목');
  await expect(page.getByRole('link', { name: 'https://example.gov/document', exact: true })).toBeVisible();
  await expect(page.locator('.connection-status')).toContainText('진행 상태 연결 정상');
  await expect(page.locator('.progress-results')).toContainText('검색 완료 1건');
  await expect(page.locator('.progress-results')).toContainText('원문 확보 1건');
  await expect(page.locator('.progress-source-list li')).toHaveCount(1);
  await expect(page.locator('.progress-source-list a')).toHaveAttribute('href', 'https://example.gov/collected');
  await expect(page.locator('.progress-results')).toContainText('접근·처리 제한 1건');
  await expect(page.locator('.progress-recent li')).toHaveCount(3);
  await expect(page.locator('.progress-wait')).toContainText('현재 단계의 응답이 늦어지고 있습니다');
  await expect(page.getByLabel('경과 시간')).not.toHaveText('0분 00초');
  await page.screenshot({ path: 'test-results/analysis-progress.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const activeTask = await page.locator('.active-tasks li').first().boundingBox();
  expect(activeTask!.x + activeTask!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/analysis-progress-mobile.png' });
  trace = [...trace, { stage: '검증', message: '검증용 인용 대조', at, status: 'running' }];
  await expect(page.getByRole('heading', { name: '근거 검증 중입니다' })).toBeVisible();
  trace = [...trace, { stage: '재탐색', message: '부족한 근거를 추가 수집합니다.', at, status: 'running' }];
  await expect(page.getByRole('heading', { name: '수집·재탐색 중입니다' })).toBeVisible();
  complete = true;
  await expect(page.locator('.report-header')).toContainText('분석 보고서');
  await expect(page.getByRole('heading', { name: '분석 보고서', exact: true })).toBeFocused();
  await expect(page.locator('.notice-banner')).toContainText('보고서는 완성됐지만');
  await expect(page.locator('.research-activity.is-running')).toHaveCount(0);
  expect(starts).toBe(1);
});

test('poll connection failure can resume the same job without creating another analysis', async ({ page }) => {
  const run = wisdomFixture();
  await page.route('**/api/bootstrap', async route => {
    const boot = await (await route.fetch()).json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, message: '검증용 연결' } } });
  });
  await page.route('**/api/topics', route => route.fulfill({ json: { state: 'disabled', topics: [], trace: [], message: '검증용' } }));
  let starts = 0;
  let connected = false;
  await page.route('**/api/analyses', route => { starts++; return route.fulfill({ json: { id: 'retry-test', state: 'running', trace: [] } }); });
  await page.route('**/api/analyses/retry-test', route => connected
    ? route.fulfill({ json: { id: 'retry-test', state: 'complete', trace: [], run } })
    : route.fulfill({ status: 503, json: { error: '검증용 연결 실패' } }));
  await page.goto('/');
  await page.getByLabel('분석 질문').fill(run.question);
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '진행 상태 연결을 확인해주세요' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('서버의 분석은 계속될 수 있습니다');
  await expect(page.getByRole('button', { name: '새 분석', exact: true })).toBeDisabled();
  connected = true;
  await page.getByRole('button', { name: '진행 상태 다시 확인' }).click();
  await expect(page.locator('.report-header')).toContainText('분석 보고서');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(starts).toBe(1);
});

test('a lost server job exits progress and allows the question to be submitted again', async ({ page }) => {
  await page.route('**/api/bootstrap', async route => {
    const boot = await (await route.fetch()).json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, message: '검증용 연결' } } });
  });
  await page.route('**/api/topics', route => route.fulfill({ json: { state: 'disabled', topics: [], trace: [], message: '검증용' } }));
  await page.route('**/api/analyses', route => route.fulfill({ json: { id: 'lost-test', state: 'running', trace: [] } }));
  await page.route('**/api/analyses/lost-test', route => route.fulfill({ status: 404,
    json: { error: '실행 기록이 없습니다. 서버가 재시작되었다면 분석을 다시 실행하세요.' } }));
  await page.goto('/');
  await page.getByLabel('분석 질문').fill('검증용 질문');
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('실행 기록이 없습니다');
  await expect(page.getByLabel('분석 질문')).toHaveValue('검증용 질문');
  await expect(page.getByRole('button', { name: '분석 실행', exact: true })).toBeEnabled();
  await expect(page.locator('.research-activity.is-running')).toHaveCount(0);
});
