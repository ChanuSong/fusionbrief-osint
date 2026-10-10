import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { AnalysisRun } from '../../shared/types.ts';

/** Archive fixtures exercise report tools without adding a launcher to the home screen. */
export async function openSavedScenario(page: Page, request: APIRequestContext, scenarioId: string): Promise<AnalysisRun> {
  const response = await request.post('/api/demo/start', { data: { scenarioId } });
  expect(response.status()).toBe(201);
  const run = await response.json() as AnalysisRun;
  await page.goto('/');
  await page.locator('.recent-runs button').filter({ hasText: run.question }).first().click();
  await expect(page.locator('.report-header')).toContainText('분석 보고서');
  return run;
}
