// SPDX-License-Identifier: MIT
import type { BrowserContext, Page } from '@playwright/test';
import {
  CANONICAL_PROFILE,
  PROFILE_STORAGE_KEY,
} from '../../integration/_lib/canonical-profile';

/**
 * Retrieve the extension id from the background service-worker URL. Playwright
 * does not expose this directly so we use the service-worker registration.
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  const workers = context.serviceWorkers();
  const firstWorker = workers[0];
  if (firstWorker) {
    const url = firstWorker.url();
    const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (match && match[1]) return match[1];
  }
  // Fallback: wait for the service worker to register.
  const worker = await context.waitForEvent('serviceworker');
  const url = worker.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match || !match[1]) throw new Error('could not determine extension id');
  return match[1];
}

/**
 * Seed the canonical profile into chrome.storage.local via an extension-page
 * helper. The helper page is shipped under public/__e2e__/seed.html by A1.
 */
export async function seedProfile(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/__e2e__/seed.html`);
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
  await page.goto(`chrome-extension://${extensionId}/__e2e__/seed.html`);
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
 */
export async function openPopup(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}
