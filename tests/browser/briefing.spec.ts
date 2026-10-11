import { PRIMARY_QUESTION } from '../../shared/primary-scenario.ts';
import { test, expect } from '@playwright/test';
import { openSavedScenario } from './saved-report.ts';

test('briefing links verified dates and source counts to original evidence', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const original = await openSavedScenario(page, request, 'taiwan-strait-2026');
  await expect(page.locator('.brief-lead')).toContainText('봉쇄');
  await expect(page.locator('.brief-support')).toHaveCount(3);
  await page.locator('.brief-support > summary').first().click();
  await expect(page.locator('.brief-support[open]')).toContainText('21대');
  await page.locator('.brief-support > summary').first().click();
  const visuals = page.locator('#report-visuals');
  await visuals.getByRole('button', { name: '2026-11-02 사건 보기' }).click();
  await expect(visuals.locator('.briefing-events')).toContainText('예정 일정');
  await visuals.getByRole('button', { name: /^브리핑 인용/ }).first().click();
  await expect(page.getByRole('dialog').locator('mark')).toBeVisible(); await page.keyboard.press('Escape');
  await visuals.getByRole('tab', { name: '출처 의존도' }).click();
  await expect(visuals.locator('.briefing-origin-chart > button')).toHaveCount(12);
  await visuals.screenshot({ path: 'test-results/intelligence-visuals.png' });
  await visuals.getByRole('button', { name: /^10월 10일 국방부 일일 동태:/ }).click();
  await expect(page.getByRole('button', { name: '10월 10일 국방부 일일 동태 판단 선택' })).toHaveAttribute('aria-pressed', 'true');

  await expect(page.locator('#report-stress')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '취약 근거 시험하기' })).toHaveCount(0);
  await visuals.getByRole('button', { name: '이 해석의 관계와 원문 보기' }).click();
  await expect(page.getByRole('dialog').locator('.react-flow__node').first()).toBeVisible();
  await page.keyboard.press('Escape');
  const saved = await (await request.get(`/api/runs/${original.id}`)).json();
  expect(saved.version).toBe(original.version); expect(saved.claims).toEqual(original.claims); expect(saved.answer).toEqual(original.answer);
  await page.setViewportSize({ width: 390, height: 844 });
  await visuals.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await visuals.screenshot({ path: 'test-results/briefing-mobile.png' });
  expect(errors).toEqual([]);
});

test('analysis request starts progress immediately and recovers from a submission failure', async ({ page }) => {
  await page.route('**/api/bootstrap', async route => {
    const boot = await (await route.fetch()).json();
    await route.fulfill({ json: { ...boot, capabilities: { available: true, message: '검증용 연결' } } });
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/analyses', async route => { await pending; await route.fulfill({status:503,json:{error:'검증용 분석 연결 실패'}}); }, { times: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: '분석 실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '질문 해석 중입니다' })).toBeVisible();
  await expect(page.getByLabel('분석 질문')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '새 분석', exact:true })).toBeDisabled();
  await expect(page.locator('.report-header')).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('검증용 분석 연결 실패');
  await expect(page.getByLabel('분석 질문')).toHaveValue(PRIMARY_QUESTION);
  await expect(page.getByRole('button', { name: '분석 실행', exact: true })).toBeEnabled();
  await expect(page.locator('.research-activity.is-running')).toHaveCount(0);
});
