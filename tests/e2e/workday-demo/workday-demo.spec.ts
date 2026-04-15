// SPDX-License-Identifier: MIT
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExtensionId, seedAuthSession, seedProfile } from '../_lib/setup';
import { installBackendStubs } from '../_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '..', '.output', 'chrome-mv3');

/**
 * Workday public demo fill test.
 *
 * Exercises the one live-fill scenario that is SAFE: Workday's own
 * public demo sandbox (`workday.wd5.myworkdayjobs.com/External`) is
 * provisioned for anyone to submit dummy applicants. No real hiring
 * pipeline exists behind it.
 *
 * Gated behind WORKDAY_DEMO_E2E=true. The playwright config excludes
 * this directory by default, so the standard test:e2e run never reaches
 * a live site.
 *
 * SAFETY INVARIANT: this test completes two steps (My Information +
 * My Experience) and MUST terminate before the Review / Submit screen.
 * An explicit assertion verifies the submit button never appears on
 * screens we drive.
 */

const WORKDAY_DEMO_URL = 'https://workday.wd5.myworkdayjobs.com/External';
const WORKDAY_DEMO_ENABLED = process.env.WORKDAY_DEMO_E2E === 'true';

test.describe.configure({ mode: 'serial' });

test.skip(
  !WORKDAY_DEMO_ENABLED,
  'WORKDAY_DEMO_E2E=true not set; workday demo fill is opt-in',
);

test.setTimeout(180_000);

async function launchExtensionContext(): Promise<BrowserContext> {
  const argsBase = [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];
  const headlessEnv =
    process.env.E2E_HEADFUL === 'true' ? [] : ['--headless=new'];
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [...headlessEnv, ...argsBase],
  });
}

async function dispatchFill(
  context: BrowserContext,
  extId: string,
  tabId: number,
  url: string,
): Promise<unknown> {
  const driver = await context.newPage();
  try {
    await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
    const resp = await driver.evaluate(
      async ({ id, u }) => {
        return await new Promise<unknown>((resolve) => {
          chrome.tabs.sendMessage(
            id,
            {
              id: 1,
              type: 'FILL_REQUEST',
              timestamp: Date.now(),
              data: { tabId: id, url: u },
            },
            (r) => {
              const le = chrome.runtime.lastError;
              resolve(le ? { lastError: le.message } : r);
            },
          );
        });
      },
      { id: tabId, u: url },
    );
    return resp;
  } finally {
    await driver.close().catch(() => undefined);
  }
}

async function resolveTabId(
  context: BrowserContext,
  extId: string,
  urlPrefix: string,
): Promise<number | null> {
  const driver = await context.newPage();
  try {
    await driver.goto(`chrome-extension://${extId}/__e2e__/seed.html`);
    const id = await driver.evaluate(async ({ u }) => {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ url: `${u}*` }, (t) => resolve(t));
      });
      return tabs[0]?.id ?? null;
    }, { u: urlPrefix });
    return typeof id === 'number' ? id : null;
  } finally {
    await driver.close().catch(() => undefined);
  }
}

/** Hard safety: fail loudly if we ever render the Submit button. */
async function assertNotOnReviewStep(page: Page): Promise<void> {
  const submit = page.locator('[data-automation-id="submitButton"]');
  const count = await submit.count();
  if (count > 0) {
    throw new Error(
      'workday-demo safety violation: submit button reached. aborting.',
    );
  }
}

test('workday public demo: fill step 1 (My Information) and step 2 (My Experience)', async () => {
  const context = await launchExtensionContext();
  let page: Page | null = null;
  try {
    await installBackendStubs(context);
    const extId = await getExtensionId(context);
    await seedProfile(context, extId);
    await seedAuthSession(context, extId);

    page = await context.newPage();
    let landed = false;
    try {
      const resp = await page.goto(WORKDAY_DEMO_URL, {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      });
      landed = Boolean(resp && resp.ok());
    } catch {
      landed = false;
    }
    if (!landed) {
      test.skip(
        true,
        `workday demo unreachable at ${WORKDAY_DEMO_URL} -- transient outage`,
      );
      return;
    }
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => undefined);

    // Pick the first visible job listing. Workday renders listings as
    // anchor tags under [data-automation-id="jobTitle"].
    const firstJob = page.locator('[data-automation-id="jobTitle"] a').first();
    const jobExists = await firstJob
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!jobExists) {
      test.skip(true, 'workday demo returned 0 job listings today');
      return;
    }
    await firstJob.click();
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => undefined);

    // Click Apply. Workday exposes multiple apply-button patterns; try
    // the most common two. If neither is present the demo may have
    // gated the listing for sign-in, in which case we soft-skip.
    const applyPrimary = page.locator('[data-automation-id="adventureButton"]');
    const applyManual = page.locator('[data-automation-id="applyManually"]');
    let advanced = false;
    if ((await applyPrimary.count()) > 0) {
      await applyPrimary.first().click();
      advanced = true;
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => undefined);
    }
    if ((await applyManual.count()) > 0) {
      await applyManual.first().click();
      advanced = true;
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => undefined);
    }
    if (!advanced) {
      test.skip(
        true,
        'workday demo: no apply button found (listing may require sign-in)',
      );
      return;
    }

    // Allow content script to boot on the apply flow origin.
    await page.waitForTimeout(2_000);
    await assertNotOnReviewStep(page);

    const tabId = await resolveTabId(context, extId, 'https://workday.wd5.myworkdayjobs.com/');
    if (tabId === null) {
      throw new Error('could not resolve workday demo tab id');
    }

    // --- Step 1: My Information ---
    const step1Resp = await dispatchFill(context, extId, tabId, page.url());
    const step1Inner =
      (step1Resp as { res?: { ok?: boolean } }).res ??
      (step1Resp as { ok?: boolean });
    expect(step1Inner.ok).toBe(true);

    await page.bringToFront();
    // At least one legal-name or email field should have a value.
    const step1Fields = [
      '[data-automation-id="legalNameSection_firstName"]',
      '[data-automation-id="legalNameSection_lastName"]',
      '[data-automation-id="email"]',
      'input[name="firstName"]',
      'input[name="lastName"]',
    ];
    let step1Seen = 0;
    for (const sel of step1Fields) {
      const el = page.locator(sel).first();
      if ((await el.count()) === 0) continue;
      const v = await el.inputValue().catch(() => '');
      if (v && v.length > 0) step1Seen++;
    }
    expect(
      step1Seen,
      'workday step 1: expected at least one canonical field to be filled',
    ).toBeGreaterThanOrEqual(1);

    // Click Save and Continue. Workday uses data-automation-id="bottom-navigation-next-button".
    const next1 = page.locator('[data-automation-id="bottom-navigation-next-button"]');
    if ((await next1.count()) === 0) {
      test.skip(
        true,
        'workday demo: Save and Continue not found after step 1 fill -- demo flow changed',
      );
      return;
    }
    await next1.first().click();
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1_500);
    await assertNotOnReviewStep(page);

    // --- Step 2: My Experience ---
    const step2Resp = await dispatchFill(context, extId, tabId, page.url());
    const step2Inner =
      (step2Resp as { res?: { ok?: boolean } }).res ??
      (step2Resp as { ok?: boolean });
    expect(step2Inner.ok).toBe(true);

    // SAFETY: never click Next past step 2. We stop here. The presence
    // of the step 2 fill response with ok=true is the test's contract.
    await assertNotOnReviewStep(page);
  } finally {
    if (page) await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});
