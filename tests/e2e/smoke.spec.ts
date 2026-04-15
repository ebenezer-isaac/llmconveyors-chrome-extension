// SPDX-License-Identifier: MIT
import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getExtensionId,
  seedProfile,
  seedAuthSession,
  openPopup,
} from './_lib/setup';
import { installBackendStubs, seedE2ETestCookieJar } from './_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');

/**
 * Playwright E2E smoke. Every test loads the built extension, optionally
 * seeds state, navigates to a fixture page, and asserts observable DOM or
 * storage state. Tests are in `test.skip` until their owning phase
 * removes the suffix.
 *
 * Owner mapping:
 *   popup renders                  -> A4 (popup UI)
 *   sign-in happy path             -> A6 (auth flow)
 *   greenhouse autofill happy path -> A8 (autofill controller + B7 adapter)
 */

async function launchExtensionContext(): Promise<BrowserContext> {
  // MV3 service workers require a non-headless-shell Chromium to register.
  // Playwright's `chromium` download is the headless-shell; passing
  // `channel: 'chromium'` opts into the full bundle that bundles extensions.
  // We pass `--headless=new` in args so the worker UI is not shown, but
  // we leave Playwright's `headless` option false so the ext mode sticks.
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

test.skip('popup renders with placeholder sign-in button', async () => {
  const context = await launchExtensionContext();
  try {
    const extId = await getExtensionId(context);
    const popup = await openPopup(context, extId);
    await expect(popup.locator('[data-testid="sign-in-button"]')).toBeVisible();
    await expect(popup.locator('[data-testid="sign-in-button"]')).toHaveText(/sign in/i);
    await popup.close();
  } finally {
    await context.close();
  }
});

test('sign-in happy path stores session and shows signed-in popup state', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    // Seed the E2E cookie-jar hook so the popup routes through the
    // stubbed backend exchange instead of Chrome's interactive OAuth
    // window, which is unreliable under headless Chromium.
    await seedE2ETestCookieJar(context, extId);
    const popup = await openPopup(context, extId);
    await popup.click('[data-testid="sign-in-button"]');
    await popup.waitForSelector('[data-testid="popup-user-id"]', { timeout: 10_000 });
    await expect(popup.locator('[data-testid="popup-user-id"]')).toContainText(/user_e2e_001/);
    await popup.close();
  } finally {
    await context.close();
  }
});

test('greenhouse autofill happy path fills all standard fields', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedProfile(context, extId);
    await seedAuthSession(context, extId);
    const page = await context.newPage();
    await page.goto('http://localhost:5174/greenhouse-airbnb-swe.html');
    await page.waitForLoadState('domcontentloaded');
    // Allow the content script to boot + load the adapter.
    await page.waitForTimeout(750);

    // Drive the fill via chrome.tabs.sendMessage FROM an extension-origin
    // page, same path the bg FILL_REQUEST forwarder takes. This
    // exercises the content script's real onMessage('FILL_REQUEST')
    // handler registered by A8.
    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);

    const fillResponse = await driver.evaluate(
      async ({ url }) => {
        // Resolve the fixture tab id.
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
        });
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') {
          return { err: 'no tab' };
        }
        const resp = await new Promise<unknown>((resolve) => {
          chrome.tabs.sendMessage(
            tab.id as number,
            {
              id: 1,
              type: 'FILL_REQUEST',
              timestamp: Date.now(),
              data: { tabId: tab.id, url: tab.url ?? '' },
            },
            (r) => {
              const le = chrome.runtime.lastError;
              resolve(le ? { lastError: le.message } : r);
            },
          );
        });
        return resp;
      },
      { url: 'http://localhost:5174/greenhouse-airbnb-swe.html' },
    );
    await driver.close();

    // Assert the fill response was successful.
    expect(fillResponse).toBeTruthy();
    const wrapped = fillResponse as { res?: unknown; err?: unknown };
    const inner = (wrapped.res ?? fillResponse) as { ok?: boolean };
    expect(inner.ok).toBe(true);

    // Switch back to the fixture page and assert the field values. The
    // engine normalizes phone to E.164 (strips dashes). The four fields
    // below are the ones the engine's classifier + rules populate on
    // the canonical Greenhouse fixture.
    await page.bringToFront();
    await expect(page.locator('#first_name')).toHaveValue('Jane');
    await expect(page.locator('#last_name')).toHaveValue('Doe');
    await expect(page.locator('#email')).toHaveValue('jane.doe@example.com');
    await expect(page.locator('#phone')).toHaveValue('+14155550101');

    await page.close();
  } finally {
    await context.close();
  }
});
