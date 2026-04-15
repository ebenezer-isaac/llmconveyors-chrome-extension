// SPDX-License-Identifier: MIT
import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const FIXTURE_SERVER_URL = 'http://localhost:5174';

// Live / opt-in test directories. Ignored by default so `pnpm test:e2e`
// never navigates to real ATS pages. Each flag unlocks its own subtree:
//   LIVE_E2E=true          -> tests/e2e/live-readonly/ + tests/e2e/captured/
//   WORKDAY_DEMO_E2E=true  -> tests/e2e/workday-demo/
// The dedicated pnpm scripts (`test:e2e:live`, `test:e2e:captured`,
// `test:e2e:workday-demo`) set the flags and pass an explicit test path,
// so Playwright still globs `testMatch` within that subtree only.
const liveIgnore: RegExp[] = [];
if (process.env.LIVE_E2E !== 'true') {
  liveIgnore.push(/live-readonly\//);
}
// `captured/` fixtures run against static HTML, but we gate them behind
// the same flag as live-readonly so the default `test:e2e` run is lean
// and deterministic. The `test:e2e:captured` script sets LIVE_E2E=true.
if (process.env.LIVE_E2E !== 'true') {
  liveIgnore.push(/captured\//);
}
if (process.env.WORKDAY_DEMO_E2E !== 'true') {
  liveIgnore.push(/workday-demo\//);
}

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  testIgnore: liveIgnore,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '.test-results/html-report', open: 'never' }]],
  outputDir: '.test-results/artifacts',
  use: {
    baseURL: FIXTURE_SERVER_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.RECORD_VIDEO === 'true' ? 'on' : 'off',
  },
  projects: [
    {
      name: 'chromium-mv3',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          headless: false,
          args: [
            '--headless=new',
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config tests/e2e/fixture-server/vite.config.ts --port 5174 --strictPort',
    cwd: join(__dirname, '..', '..'),
    url: FIXTURE_SERVER_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  },
});
