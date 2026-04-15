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
import { installBackendStubs } from './_lib/stub-backend';

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
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
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

test.skip('sign-in happy path stores session and shows signed-in popup state', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    const popup = await openPopup(context, extId);
    await popup.click('[data-testid="sign-in-button"]');
    // The sign-in flow opens a SuperTokens-bridge page; A6 stubs it with a
    // dev-only handshake that immediately returns the token.
    await popup.waitForSelector('[data-testid="signed-in-indicator"]', { timeout: 10_000 });
    await expect(popup.locator('[data-testid="signed-in-indicator"]')).toContainText(/user_e2e_001/);
    await popup.close();
  } finally {
    await context.close();
  }
});

test.skip('greenhouse autofill happy path fills all standard fields', async () => {
  const context = await launchExtensionContext();
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedProfile(context, extId);
    await seedAuthSession(context, extId);
    const page = await context.newPage();
    await page.goto('http://localhost:5174/greenhouse-airbnb-swe.html');
    await page.waitForLoadState('domcontentloaded');

    const popup = await openPopup(context, extId);
    await popup.click('[data-testid="fill-button"]');
    await popup.waitForSelector('[data-testid="fill-result-success"]', { timeout: 10_000 });

    // Switch back to the fixture page and assert field values.
    await page.bringToFront();
    await expect(page.locator('#first_name')).toHaveValue('Jane');
    await expect(page.locator('#last_name')).toHaveValue('Doe');
    await expect(page.locator('#email')).toHaveValue('jane.doe@example.com');
    await expect(page.locator('#phone')).toHaveValue('+1-415-555-0101');
    await expect(page.locator('#linkedin')).toHaveValue('https://linkedin.com/in/janedoe');
    await expect(page.locator('#website')).toHaveValue('https://janedoe.example.com');

    await popup.close();
    await page.close();
  } finally {
    await context.close();
  }
});
