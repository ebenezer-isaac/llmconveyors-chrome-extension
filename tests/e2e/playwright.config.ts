// SPDX-License-Identifier: MIT
import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const FIXTURE_SERVER_URL = 'http://localhost:5174';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
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
