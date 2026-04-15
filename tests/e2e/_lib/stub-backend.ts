// SPDX-License-Identifier: MIT
import type { BrowserContext } from '@playwright/test';

/**
 * Stub out network calls to the LLMC backend at the Playwright routing layer.
 * The extension code does not know the backend is stubbed.
 */
export async function installBackendStubs(context: BrowserContext): Promise<void> {
  await context.route('https://api.llmconveyors.local/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'POST' && url.pathname === '/api/v1/auth/extension-token-exchange') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'at_e2e_001',
          refreshToken: 'rt_e2e_001',
          expiresAt: Date.now() + 60 * 60 * 1000,
          userId: 'user_e2e_001',
        }),
      });
      return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/ats/extract-skills') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taxonomyVersion: '2026.04.1',
          keywords: [
            { term: 'TypeScript', weight: 1.0, category: 'language' },
            { term: 'React', weight: 0.9, category: 'framework' },
            { term: 'distributed systems', weight: 0.8, category: 'concept' },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{}',
    });
  });
}
