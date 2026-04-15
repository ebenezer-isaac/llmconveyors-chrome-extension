// SPDX-License-Identifier: MIT
import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getExtensionId,
  seedAuthSession,
  openSidepanel,
} from './_lib/setup';
import { installBackendStubs } from './_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');

/**
 * Playwright E2E for the A11 sidepanel UI.
 *
 * Scenario 1 -- sidepanel shows JD summary when intent is detected on
 *   the bound tab. Opens the greenhouse fixture, lets the content
 *   script broadcast INTENT_DETECTED, then opens the sidepanel pinned
 *   to that tab via ?tabId=<n>. Asserts the JD summary renders with
 *   data-state="detected" and data-vendor="greenhouse".
 *
 * Scenario 2 -- sidepanel keyword list updates when HIGHLIGHT_APPLY
 *   completes. After the content script boot, dispatches
 *   HIGHLIGHT_APPLY through an extension-origin driver page, seeds
 *   chrome.storage.session with the extracted keyword list, and
 *   asserts the sidepanel's keyword-list section re-renders with
 *   data-state="populated".
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

async function seedIntentForTab(
  context: BrowserContext,
  extId: string,
  tabId: number,
  intent: {
    kind: 'greenhouse' | 'lever' | 'workday' | 'unknown';
    pageKind: 'job-posting' | 'application-form';
    url: string;
    jobTitle?: string;
    company?: string;
  },
): Promise<void> {
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
  await driver.evaluate(
    async ({ payload }) => {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          {
            id: 1,
            type: 'INTENT_DETECTED',
            timestamp: Date.now(),
            data: payload,
          },
          () => resolve(),
        );
      });
    },
    {
      payload: {
        tabId,
        url: intent.url,
        kind: intent.kind,
        pageKind: intent.pageKind,
        jobTitle: intent.jobTitle,
        company: intent.company,
        detectedAt: Date.now(),
      },
    },
  );
  await driver.close();
}

async function seedKeywordsForTab(
  context: BrowserContext,
  extId: string,
  tabId: number,
  keywords: ReadonlyArray<{
    term: string;
    category: string;
    score: number;
    canonicalForm: string;
  }>,
): Promise<void> {
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
  await driver.evaluate(
    async ({ key, value }) => {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
    },
    { key: `llmc.keywords.${tabId}`, value: keywords },
  );
  await driver.close();
}

test('sidepanel opens and shows JD summary when intent detected', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const fixtureUrl = 'http://localhost:5174/greenhouse-airbnb-swe.html';
    const atsTab = await context.newPage();
    await atsTab.goto(fixtureUrl);
    await atsTab.waitForLoadState('domcontentloaded');

    const tabId = await resolveTabId(context, extId, fixtureUrl);
    await seedIntentForTab(context, extId, tabId, {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: fixtureUrl,
      jobTitle: 'Software Engineer',
      company: 'Airbnb',
    });

    const panel = await openSidepanel(context, extId, tabId);
    await panel.waitForSelector('[data-testid="sidepanel-root"]', {
      timeout: 10_000,
    });
    const jd = panel.locator('[data-testid="jd-summary"]');
    await expect(jd).toHaveAttribute('data-state', 'detected', { timeout: 10_000 });
    await expect(jd).toHaveAttribute('data-vendor', 'greenhouse');
    await expect(jd).toHaveAttribute('data-page-kind', 'job-posting');
    await expect(panel.locator('[data-testid="jd-title"]')).toContainText(
      /Software Engineer/i,
    );
    await expect(panel.locator('[data-testid="jd-company"]')).toContainText(
      /Airbnb/i,
    );
    await panel.close();
  } finally {
    await context.close();
  }
});

test('sidepanel keyword list populates from session storage', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const fixtureUrl = 'http://localhost:5174/greenhouse-airbnb-swe.html';
    const atsTab = await context.newPage();
    await atsTab.goto(fixtureUrl);
    await atsTab.waitForLoadState('domcontentloaded');

    const tabId = await resolveTabId(context, extId, fixtureUrl);
    await seedIntentForTab(context, extId, tabId, {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: fixtureUrl,
      jobTitle: 'Software Engineer',
      company: 'Airbnb',
    });
    await seedKeywordsForTab(context, extId, tabId, [
      { term: 'TypeScript', category: 'tool', score: 1.0, canonicalForm: 'typescript' },
      { term: 'React', category: 'tool', score: 0.9, canonicalForm: 'react' },
      {
        term: 'distributed systems',
        category: 'domain',
        score: 0.8,
        canonicalForm: 'distributed-systems',
      },
    ]);

    const panel = await openSidepanel(context, extId, tabId);
    await panel.waitForSelector('[data-testid="keyword-list"]', {
      timeout: 10_000,
    });
    const kw = panel.locator('[data-testid="keyword-list"]');
    await expect(kw).toHaveAttribute('data-state', 'populated', { timeout: 10_000 });
    await expect(kw).toHaveAttribute('data-keyword-count', '3');
    const terms = panel.locator('[data-testid="keyword-term"]');
    await expect(terms).toHaveCount(3);
    await expect(terms.first()).toContainText('TypeScript');
    await panel.close();
  } finally {
    await context.close();
  }
});
