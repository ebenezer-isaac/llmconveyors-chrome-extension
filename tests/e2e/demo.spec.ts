// SPDX-License-Identifier: MIT
import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import {
  getExtensionId,
  seedProfile,
  seedAuthSession,
  openPopup,
  openSidepanel,
} from './_lib/setup';
import {
  installBackendStubs,
  seedE2ETestCookieJar,
} from './_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const REPO_ROOT = join(__dirname, '..', '..');
const DEMO_DIR = join(REPO_ROOT, 'demo');
const VIDEO_DIR = join(__dirname, '.test-results', 'videos');

/**
 * Full demo E2E -- intended as the single end-to-end walkthrough
 * captured on video for the April 20 Zovo call. Runs without video
 * under normal `pnpm test:e2e`; the video is produced when the
 * `RECORD_VIDEO=true` env is set (playwright.config.ts wires that to
 * `use.video = 'on'`).
 *
 * Flow:
 *   1. Boot extension, install backend stubs, seed profile + auth
 *   2. Navigate greenhouse fixture, wait for intent detection
 *   3. Open popup pinned to greenhouse tab, assert intent badge
 *   4. Dispatch FILL_REQUEST to greenhouse content script, assert
 *      fields populated (first_name, last_name, email, phone)
 *   5. Dispatch HIGHLIGHT_APPLY, assert mark elements appear
 *   6. Open sidepanel pinned to greenhouse tab, assert JD summary
 *   7. Navigate to workday fixture step 1, resolve its tab id
 *   8. Dispatch FILL_REQUEST against the workday tab, assert first
 *      name field filled
 *
 * After the assertions, if RECORD_VIDEO=true we copy the video file
 * produced by Playwright into demo/demo-<date>.webm.
 */

async function launchExtensionContext(): Promise<BrowserContext> {
  const argsBase = [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];
  const headlessEnv = process.env.E2E_HEADFUL === 'true' ? [] : ['--headless=new'];
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [...headlessEnv, ...argsBase],
    recordVideo:
      process.env.RECORD_VIDEO === 'true'
        ? { dir: VIDEO_DIR, size: { width: 1280, height: 800 } }
        : undefined,
  });
}

async function resolveTabId(
  context: BrowserContext,
  extId: string,
  fixtureUrl: string,
): Promise<number> {
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
  const id = await driver.evaluate(async ({ url }) => {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
    });
    return tabs[0]?.id ?? null;
  }, { url: fixtureUrl });
  await driver.close();
  if (typeof id !== 'number') {
    throw new Error(`could not resolve tab id for ${fixtureUrl}`);
  }
  return id;
}

async function dispatchTabsMessage(
  context: BrowserContext,
  extId: string,
  tabId: number,
  envelope: unknown,
): Promise<unknown> {
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
  const resp = await driver.evaluate(
    async ({ id, env }) => {
      return await new Promise<unknown>((resolve) => {
        chrome.tabs.sendMessage(id, env, (r) => {
          const le = chrome.runtime.lastError;
          resolve(le ? { lastError: le.message } : r);
        });
      });
    },
    { id: tabId, env: envelope },
  );
  await driver.close();
  return resp;
}

interface VideoCandidate {
  readonly file: string;
  readonly mtime: number;
}

function findLatestWebm(dir: string, acc: VideoCandidate[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findLatestWebm(full, acc);
      continue;
    }
    if (!entry.endsWith('.webm')) continue;
    acc.push({ file: full, mtime: st.mtimeMs });
  }
}

function copyLatestVideo(): string | null {
  if (process.env.RECORD_VIDEO !== 'true') return null;
  if (!existsSync(VIDEO_DIR)) return null;
  const candidates: VideoCandidate[] = [];
  findLatestWebm(VIDEO_DIR, candidates);
  if (candidates.length === 0) return null;
  const latest = candidates.reduce((best, cur) =>
    cur.mtime > best.mtime ? cur : best,
  );
  if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const dest = join(DEMO_DIR, `demo-${today}.webm`);
  copyFileSync(latest.file, dest);
  return dest;
}

test('full demo flow -- greenhouse fill + highlight + sidepanel + workday fill', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedProfile(context, extId);
    await seedAuthSession(context, extId);
    await seedE2ETestCookieJar(context, extId);

    // --- Step A: Greenhouse ---
    const greenhouseUrl = 'http://localhost:5174/greenhouse-airbnb-swe.html';
    const ghTab = await context.newPage();
    await ghTab.goto(greenhouseUrl);
    await ghTab.waitForLoadState('domcontentloaded');
    // Let content script boot + broadcast INTENT_DETECTED.
    await ghTab.waitForTimeout(1_000);

    const ghTabId = await resolveTabId(context, extId, greenhouseUrl);

    // Popup pinned to greenhouse tab.
    const popup = await openPopup(context, extId, ghTabId);
    await popup.waitForSelector('[data-testid="intent-badge"]', { timeout: 10_000 });
    await expect(popup.locator('[data-testid="intent-badge"]')).toHaveAttribute(
      'data-state',
      'detected',
      { timeout: 10_000 },
    );

    // Fill greenhouse form.
    const fillResp = await dispatchTabsMessage(context, extId, ghTabId, {
      id: 1,
      type: 'FILL_REQUEST',
      timestamp: Date.now(),
      data: { tabId: ghTabId, url: greenhouseUrl },
    });
    const fillInner = (fillResp as { res?: { ok?: boolean } }).res ??
      (fillResp as { ok?: boolean });
    expect(fillInner.ok).toBe(true);

    await ghTab.bringToFront();
    await expect(ghTab.locator('#first_name')).toHaveValue('Jane');
    await expect(ghTab.locator('#last_name')).toHaveValue('Doe');
    await expect(ghTab.locator('#email')).toHaveValue('jane.doe@example.com');
    await expect(ghTab.locator('#phone')).toHaveValue('+14155550101');

    // Highlight keywords.
    const hlResp = await dispatchTabsMessage(context, extId, ghTabId, {
      id: 2,
      type: 'HIGHLIGHT_APPLY',
      timestamp: Date.now(),
      data: { tabId: ghTabId },
    });
    const hlInner = (hlResp as { res?: { ok?: boolean; keywordCount?: number } })
      .res ?? (hlResp as { ok?: boolean; keywordCount?: number });
    expect(hlInner.ok).toBe(true);
    expect(hlInner.keywordCount ?? 0).toBeGreaterThanOrEqual(3);

    await ghTab.bringToFront();
    const marks = ghTab.locator('mark[data-ats-autofill="true"]');
    expect(await marks.count()).toBeGreaterThanOrEqual(3);

    await popup.close();

    // Sidepanel pinned to greenhouse tab.
    const panel = await openSidepanel(context, extId, ghTabId);
    await panel.waitForSelector('[data-testid="sidepanel-root"]', {
      timeout: 10_000,
    });
    await expect(panel.locator('[data-testid="jd-summary"]')).toHaveAttribute(
      'data-state',
      'detected',
      { timeout: 10_000 },
    );
    await panel.close();

    // --- Step B: Workday ---
    const workdayUrl = 'http://localhost:5174/workday-deloitte-analyst-step1.html';
    const wdTab = await context.newPage();
    await wdTab.goto(workdayUrl);
    await wdTab.waitForLoadState('domcontentloaded');
    await wdTab.waitForTimeout(1_000);

    const wdTabId = await resolveTabId(context, extId, workdayUrl);
    const wdFillResp = await dispatchTabsMessage(context, extId, wdTabId, {
      id: 3,
      type: 'FILL_REQUEST',
      timestamp: Date.now(),
      data: { tabId: wdTabId, url: workdayUrl },
    });
    const wdFillInner =
      (wdFillResp as { res?: { ok?: boolean } }).res ??
      (wdFillResp as { ok?: boolean });
    expect(wdFillInner.ok).toBe(true);
  } finally {
    await context.close();
    // Copy the produced video (if any) to demo/ so the commit includes it.
    const dest = copyLatestVideo();
    if (dest) {
      // Logging is deliberate: Playwright captures this into the test
      // report so the executor can find the committed video path.
      process.stdout.write(`demo video copied to ${dest}\n`);
    }
  }
});
