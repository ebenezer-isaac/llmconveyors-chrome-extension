// SPDX-License-Identifier: MIT
import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getExtensionId,
  seedAuthSession,
  openPopup,
} from './_lib/setup';
import { installBackendStubs } from './_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');

/**
 * Playwright E2E for the A10 popup UI.
 *
 * Scenario 1 -- popup shows credits remaining when signed in
 *   Seeds an auth session, installs a backend stub that returns 25 credits
 *   on the settings-profile endpoint, opens the popup, and asserts the
 *   [data-testid="credits-remaining"] element is visible with the expected
 *   balance text.
 *
 * Scenario 2 -- popup state updates when intent changes on active tab
 *   Seeds auth + seeds a per-tab intent snapshot for an active ATS fixture
 *   tab by driving INTENT_DETECTED via the background messaging bus from an
 *   extension-origin driver page. Opens the popup, asserts the intent badge
 *   shows greenhouse / job-posting, then switches the active tab to a blank
 *   page with no intent and asserts the badge falls back to "No JD detected".
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
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [...headlessEnv, ...argsBase],
  });
  return context;
}

/**
 * Install a backend stub that returns a fixed credit balance from the
 * settings-profile endpoint. The CREDITS_GET bg handler calls this URL and
 * reads `data.credits`, `data.tier`, and `data.byoKeyEnabled` from the
 * envelope.
 */
async function installCreditsBackendStub(
  context: BrowserContext,
  balance: number,
): Promise<void> {
  await context.route('http://localhost:4000/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/api/v1/settings/profile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { credits: balance, tier: 'free', byoKeyEnabled: false },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await context.route('https://api.llmconveyors.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/api/v1/settings/profile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { credits: balance, tier: 'free', byoKeyEnabled: false },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await context.route('https://api.llmconveyors.local/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/api/v1/settings/profile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { credits: balance, tier: 'free', byoKeyEnabled: false },
        }),
      });
      return;
    }
    await route.fallback();
  });
}

/**
 * Seed a detected intent for a specific tab id by sending INTENT_DETECTED
 * from an extension-origin driver page. The A5 handler stores the intent
 * in the per-tab map and the popup's INTENT_GET query returns it.
 */
async function seedIntentForTab(
  context: BrowserContext,
  extensionId: string,
  tabId: number,
  intent: {
    kind: 'greenhouse' | 'lever' | 'workday' | 'unknown';
    pageKind: 'job-posting' | 'application-form';
    url: string;
  },
): Promise<void> {
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extensionId}/e2e/seed.html`);
  await driver.evaluate(
    async ({ payload }) => {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { key: 'INTENT_DETECTED', data: payload },
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
        detectedAt: Date.now(),
      },
    },
  );
  await driver.close();
}

test('popup shows credits remaining when signed in', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    await installCreditsBackendStub(context, 25);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    const popup = await openPopup(context, extId);
    await expect(popup.locator('[data-testid="signed-out-panel"]')).toHaveCount(0, {
      timeout: 10_000,
    });
    const tierPill = popup.locator('[data-testid="tier-pill"]');
    await expect(tierPill).toHaveAttribute('data-state', 'ready', {
      timeout: 10_000,
    });
    await expect(tierPill).toHaveAttribute('data-balance', '25');
    await expect(tierPill).toContainText('25 credits');
    await popup.close();
  } finally {
    await context.close();
  }
});

test('popup state updates when intent changes on active tab', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    await installCreditsBackendStub(context, 5);
    const extId = await getExtensionId(context);
    await seedAuthSession(context, extId);

    // Open the ATS fixture as the active tab so chrome.tabs.query resolves
    // it when the popup asks.
    const fixtureUrl = 'http://localhost:5174/greenhouse-airbnb-swe.html';
    const atsTab = await context.newPage();
    await atsTab.goto(fixtureUrl);
    await atsTab.waitForLoadState('domcontentloaded');

    // Resolve the fixture tab id through the service worker.
    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extId}/e2e/seed.html`);
    const tabIdResult = await driver.evaluate(async ({ url }) => {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
      });
      return tabs[0]?.id ?? null;
    }, { url: fixtureUrl });
    await driver.close();

    if (typeof tabIdResult !== 'number') {
      throw new Error('could not resolve fixture tab id');
    }

    await seedIntentForTab(context, extId, tabIdResult, {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: fixtureUrl,
    });

    await atsTab.bringToFront();
    // Pin the popup to the fixture tab id. Under Playwright, opening a
    // new page for the popup makes that page the active tab in the
    // window; chrome.tabs.query({active:true,currentWindow:true}) then
    // returns the popup page itself. The ?tabId=<n> override makes
    // useIntent bypass the active-tab race and consult background state
    // for the caller-chosen ATS tab.
    const popup = await openPopup(context, extId, tabIdResult);
    await popup.waitForSelector('[data-testid="intent-badge"]', {
      timeout: 10_000,
    });

    const badge = popup.locator('[data-testid="intent-badge"]');
    await expect(badge).toHaveAttribute('data-state', 'detected', { timeout: 10_000 });
    await expect(badge).toHaveAttribute('data-vendor', 'greenhouse');
    await expect(badge).toHaveAttribute('data-page-kind', 'job-posting');
    await expect(popup.locator('[data-testid="intent-vendor"]')).toContainText(
      /Greenhouse/i,
    );
    await expect(popup.locator('[data-testid="intent-page-kind"]')).toContainText(
      /Job posting/i,
    );
    await popup.close();

    // Pin the popup to a tab id for which no intent was seeded. Any
    // id that is not the fixture tab id and is not currently in the
    // background's per-tab intent map suffices; `tabIdResult + 10_000`
    // is safely out-of-range for the ephemeral ids Chromium assigns.
    const unseededTabId = tabIdResult + 10_000;
    const popup2 = await openPopup(context, extId, unseededTabId);
    await popup2.waitForSelector('[data-testid="intent-badge"]', {
      timeout: 10_000,
    });
    const badge2 = popup2.locator('[data-testid="intent-badge"]');
    await expect(badge2).toHaveAttribute('data-state', 'none', { timeout: 10_000 });
    await expect(badge2).toContainText(/No JD detected/i);
    await popup2.close();
  } finally {
    await context.close();
  }
});
