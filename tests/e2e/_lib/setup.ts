// SPDX-License-Identifier: MIT
import type { BrowserContext, Page } from '@playwright/test';
import {
  CANONICAL_PROFILE,
  PROFILE_STORAGE_KEY,
} from '../../integration/_lib/canonical-profile';

/**
 * Retrieve the extension id from the background service-worker URL. Playwright
 * does not expose this directly so we use the service-worker registration.
 *
 * Under `--headless=new` with a persistent context, the MV3 service worker
 * sometimes does not register until something forces the extension to be
 * queried. We try several progressive nudges before giving up.
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  function match(url: string): string | null {
    const m = url.match(/chrome-extension:\/\/([a-z]+)\//);
    return m && m[1] ? m[1] : null;
  }

  const existing = context.serviceWorkers();
  if (existing[0]) {
    const id = match(existing[0].url());
    if (id) return id;
  }

  // Nudge 1: open chrome://extensions.
  {
    const page = await context.newPage();
    try {
      await page
        .goto('chrome://extensions/', { timeout: 5_000 })
        .catch(() => undefined);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // Poll for the service worker.
  for (let i = 0; i < 20; i++) {
    const list = context.serviceWorkers();
    if (list.length > 0) {
      const id = match(list[0]!.url());
      if (id) return id;
    }
    // Also scan background pages (MV2-ish fallback some builds expose).
    const pages = context.backgroundPages();
    for (const p of pages) {
      const id = match(p.url());
      if (id) return id;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Nudge 2: await the serviceworker event with a generous timeout.
  try {
    const worker = await context.waitForEvent('serviceworker', {
      timeout: 15_000,
    });
    const id = match(worker.url());
    if (id) return id;
  } catch {
    // fallthrough
  }

  // Final attempt: some builds expose the extension id via a background
  // page event instead of service worker.
  try {
    const bg = await context.waitForEvent('backgroundpage', {
      timeout: 5_000,
    });
    const id = match(bg.url());
    if (id) return id;
  } catch {
    // fallthrough
  }

  throw new Error(
    'could not determine extension id: no service-worker or background page registered',
  );
}

/**
 * Seed the canonical profile into chrome.storage.local via an extension-page
 * helper. The helper page is shipped under public/e2e/seed.html by A1.
 */
export async function seedProfile(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/e2e/seed.html`);
  await page.evaluate(
    ({ key, profile }) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.set({ [key]: profile }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      }),
    { key: PROFILE_STORAGE_KEY, profile: CANONICAL_PROFILE },
  );
  await page.close();
}

/**
 * Seed a fake auth session so sign-in is not required for tests focused on
 * post-auth flows (autofill, highlight).
 */
export async function seedAuthSession(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/e2e/seed.html`);
  await page.evaluate(
    ({ session }) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.set({ 'llmc.session.v1': session }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      }),
    {
      session: {
        accessToken: 'at_e2e_001',
        refreshToken: 'rt_e2e_001',
        expiresAt: Date.now() + 60 * 60 * 1000,
        userId: 'user_e2e_001',
      },
    },
  );
  await page.close();
}

/**
 * Open the extension popup in a new page. Returns the popup Page object.
 *
 * Optional `targetTabId` appends `?tabId=<n>` to the popup URL so the
 * useIntent hook pins to that tab rather than querying the currently-
 * active tab (which, under Playwright, is the just-opened popup page
 * itself). Production popup usage never needs this override; it is a
 * test-only ergonomic hook.
 */
export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  targetTabId?: number,
): Promise<Page> {
  const page = await context.newPage();
  const suffix =
    typeof targetTabId === 'number' ? `?tabId=${targetTabId}` : '';
  await page.goto(`chrome-extension://${extensionId}/popup.html${suffix}`);
  return page;
}

/**
 * Open the extension side panel as a standalone page for E2E purposes.
 * Chrome's side panel API is not drivable through Playwright, so tests
 * load `sidepanel.html` directly and pin it to a target tab via the
 * ?tabId=<n> query. The side panel's useIntent + useAutofillHistory
 * hooks both honor the override.
 */
export async function openSidepanel(
  context: BrowserContext,
  extensionId: string,
  targetTabId?: number,
): Promise<Page> {
  const page = await context.newPage();
  const suffix =
    typeof targetTabId === 'number' ? `?tabId=${targetTabId}` : '';
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html${suffix}`);
  return page;
}
