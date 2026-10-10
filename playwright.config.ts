import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 1100 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'npx tsx tests/browser-server.ts',
    url: 'http://127.0.0.1:5174/api/health', reuseExistingServer: false },
});
