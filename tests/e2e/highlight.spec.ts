// SPDX-License-Identifier: MIT
import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExtensionId, seedAuthSession } from './_lib/setup';
import { installBackendStubs } from './_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const FIXTURE_URL =
  'http://localhost:5174/greenhouse-airbnb-swe.html';

/**
 * Phase A9 E2E harness.
 *
 * Scenarios:
 *   1. highlight apply -> marks TypeScript / React / distributed systems on
 *      the Greenhouse fixture (JSON-LD JobPosting backing keyword source).
 *   2. highlight clear -> removes every mark[data-ats-autofill="true"].
 *   3. intent detection -> the background stores a DetectedIntent in per-tab
 *      state with { kind: 'greenhouse', pageKind: 'job-posting' }.
 *
 * Extension-origin sendMessage is dispatched from a helper page loaded at
 * chrome-extension://<id>/e2e/seed.html so runtime.sendMessage sees the
 * message as originating from an extension context; chrome.tabs.sendMessage
 * is used when the target is the content script in the fixture tab.
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
  });
}

test('highlight apply on greenhouse fixture marks expected keyword ranges', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForLoadState('domcontentloaded');
    // Give the content script time to boot and the intent broadcast to land.
    await page.waitForTimeout(1_000);

    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extId}/e2e/seed.html`);

    const applyResponse = await driver.evaluate(
      async ({ url }) => {
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
        });
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') return { err: 'no tab' };
        return await new Promise<unknown>((resolve) => {
          chrome.tabs.sendMessage(
            tab.id as number,
            {
              id: 1,
              type: 'HIGHLIGHT_APPLY',
              timestamp: Date.now(),
              data: { tabId: tab.id },
            },
            (r) => {
              const le = chrome.runtime.lastError;
              resolve(le ? { lastError: le.message } : r);
            },
          );
        });
      },
      { url: FIXTURE_URL },
    );
    await driver.close();

    expect(applyResponse).toBeTruthy();
    const wrapped = applyResponse as { res?: unknown; lastError?: string };
    expect(wrapped.lastError).toBeUndefined();
    const inner = (wrapped.res ?? applyResponse) as {
      ok?: boolean;
      keywordCount?: number;
      reason?: string;
    };
    expect(inner.reason).toBeUndefined();
    expect(inner.ok).toBe(true);
    expect(inner.keywordCount).toBeGreaterThanOrEqual(3);

    await page.bringToFront();
    const marks = page.locator('mark[data-ats-autofill="true"]');
    await expect(marks).toHaveCount(await marks.count());
    const markCount = await marks.count();
    expect(markCount).toBeGreaterThanOrEqual(3);

    const markTexts = await marks.allInnerTexts();
    const joined = markTexts.map((s) => s.toLowerCase()).join('|');
    expect(joined).toMatch(/typescript/);
    expect(joined).toMatch(/react/);
    expect(joined).toMatch(/distributed systems/);

    await page.close();
  } finally {
    await context.close();
  }
});

test('highlight clear removes all mark elements', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);

    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extId}/e2e/seed.html`);

    const applyResponse = await driver.evaluate(
      async ({ url }) => {
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
        });
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') return { err: 'no tab' };
        return await new Promise<unknown>((resolve) => {
          chrome.tabs.sendMessage(
            tab.id as number,
            {
              id: 1,
              type: 'HIGHLIGHT_APPLY',
              timestamp: Date.now(),
              data: { tabId: tab.id },
            },
            (r) => resolve(r),
          );
        });
      },
      { url: FIXTURE_URL },
    );
    const applyInner =
      (applyResponse as { res?: { ok?: boolean } }).res ??
      (applyResponse as { ok?: boolean });
    expect(applyInner.ok).toBe(true);

    await page.bringToFront();
    const marks = page.locator('mark[data-ats-autofill="true"]');
    expect(await marks.count()).toBeGreaterThanOrEqual(3);

    const clearResponse = await driver.evaluate(
      async ({ url }) => {
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
        });
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') return { err: 'no tab' };
        return await new Promise<unknown>((resolve) => {
          chrome.tabs.sendMessage(
            tab.id as number,
            {
              id: 2,
              type: 'HIGHLIGHT_CLEAR',
              timestamp: Date.now(),
              data: { tabId: tab.id },
            },
            (r) => resolve(r),
          );
        });
      },
      { url: FIXTURE_URL },
    );
    await driver.close();

    const clearInner =
      (clearResponse as { res?: { ok?: boolean } }).res ??
      (clearResponse as { ok?: boolean });
    expect(clearInner.ok).toBe(true);

    await page.bringToFront();
    await expect(marks).toHaveCount(0);

    await page.close();
  } finally {
    await context.close();
  }
});

test('intent detection dispatches INTENT_DETECTED on JSON-LD JobPosting page', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForLoadState('domcontentloaded');
    // Give the content script time to boot and broadcast INTENT_DETECTED.
    await page.waitForTimeout(2_000);

    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extId}/e2e/seed.html`);

    const intent = await driver.evaluate(
      async ({ url }) => {
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
        });
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') return { err: 'no tab' };
        return await new Promise<unknown>((resolve) => {
          chrome.runtime.sendMessage(
            {
              id: 10,
              type: 'INTENT_GET',
              timestamp: Date.now(),
              data: { tabId: tab.id },
            },
            (r) => resolve(r),
          );
        });
      },
      { url: FIXTURE_URL },
    );
    await driver.close();

    expect(intent).toBeTruthy();
    const typed = (intent as { res?: unknown }).res ?? intent;
    expect(typed).toMatchObject({
      kind: 'greenhouse',
      pageKind: 'job-posting',
    });

    await page.close();
  } finally {
    await context.close();
  }
});
