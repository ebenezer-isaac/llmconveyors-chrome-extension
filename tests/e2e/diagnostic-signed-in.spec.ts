// SPDX-License-Identifier: MIT
/**
 * Live diagnostic #2: sign into the web app in the same persistent Chromium
 * context, then verify the extension picks up the sAccessToken cookie and
 * exchanges it for a session.
 *
 * This needs real Google OAuth credentials which we don't have, so this
 * test instead uses a synthetic cookie to simulate the signed-in web state.
 * If the synthetic cookie is accepted by the backend (it won't be, because
 * it's not a real JWT), we'll at least see HOW the flow fails end-to-end
 * and confirm the cookie IS being read by the extension.
 *
 * The goal is not to pass; it's to see the flow execute and log every step.
 */
import { test, chromium, type BrowserContext, type Worker } from '@playwright/test';

test.setTimeout(90_000);
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const OUTPUT_DIR = join(__dirname, '..', '..', '.test-results', 'diagnostic-signed-in');

async function getExtensionId(context: BrowserContext): Promise<string> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  const match = sw.url().match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match) throw new Error(`Could not derive extension id`);
  return match[1]!;
}

test('diagnose cookie exchange with a seeded sAccessToken', async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-extensions-except=' + EXTENSION_PATH,
      '--load-extension=' + EXTENSION_PATH,
    ],
  });

  const swLogs: string[] = [];
  const attachWorker = (sw: Worker): void => {
    sw.on('console', (msg) => {
      const line = `[sw] ${msg.type()}: ${msg.text()}`;
      swLogs.push(line);
      // eslint-disable-next-line no-console
      console.log(line);
    });
  };
  for (const sw of context.serviceWorkers()) attachWorker(sw);
  context.on('serviceworker', attachWorker);

  // Seed a fake sAccessToken cookie on .llmconveyors.com. This simulates
  // what the web app would set after a real sign-in. The extension will
  // try to exchange it; the backend will reject (bad JWT); we want to see
  // the 401 round-trip.
  await context.addCookies([
    {
      name: 'sAccessToken',
      value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.FAKE_PAYLOAD.FAKE_SIG',
      domain: '.llmconveyors.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);

  const extId = await getExtensionId(context);
  // eslint-disable-next-line no-console
  console.log(`Extension loaded at id=${extId}`);

  // Give the SW time to boot and attempt cookie exchange
  await new Promise((r) => setTimeout(r, 4000));

  // Open popup
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');
  await new Promise((r) => setTimeout(r, 3000));
  await popup.screenshot({ path: join(OUTPUT_DIR, 'popup-seeded.png'), fullPage: true });

  // Verify the extension saw the cookie
  const cookieCheck = await popup.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome?: {
        cookies?: {
          get: (
            details: { url: string; name: string },
            cb: (cookie: { name: string; value: string; httpOnly: boolean; domain: string } | null) => void,
          ) => void;
        };
      };
    };
    if (!g.chrome?.cookies) return { error: 'chrome.cookies unavailable' };
    return new Promise<Record<string, unknown>>((resolve) => {
      g.chrome!.cookies!.get({ url: 'https://llmconveyors.com', name: 'sAccessToken' }, (cookie) => {
        if (!cookie) return resolve({ found: false });
        resolve({
          found: true,
          httpOnly: cookie.httpOnly,
          domain: cookie.domain,
          valuePreview: cookie.value.slice(0, 20) + '...',
        });
      });
    });
  });
  writeFileSync(join(OUTPUT_DIR, 'cookie-check.json'), JSON.stringify(cookieCheck, null, 2));

  // Sanity check: AUTH_STATUS should respond fast (no network involved).
  const statusResult = await popup.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendMessage: (msg: { key: string; data: unknown }) => Promise<unknown>;
        };
      };
    };
    if (!g.chrome?.runtime) return { error: 'chrome.runtime unavailable' };
    const startedAt = Date.now();
    try {
      const response = await Promise.race([
        g.chrome.runtime.sendMessage({ key: 'AUTH_STATUS', data: {} }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout after 5s')), 5000),
        ),
      ]);
      return { ok: true, response, durationMs: Date.now() - startedAt };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      };
    }
  });
  writeFileSync(join(OUTPUT_DIR, 'status-result.json'), JSON.stringify(statusResult, null, 2));

  // Try manually triggering the AUTH_COOKIE_EXCHANGE from the popup
  // with a hard timeout so we can see if it's hanging vs rejecting.
  const exchangeResult = await popup.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendMessage: (msg: { key: string; data: unknown }) => Promise<unknown>;
        };
      };
    };
    if (!g.chrome?.runtime) return { error: 'chrome.runtime unavailable' };

    const startedAt = Date.now();
    const timeoutMs = 20_000;
    try {
      const response = await Promise.race([
        g.chrome.runtime.sendMessage({ key: 'AUTH_COOKIE_EXCHANGE', data: {} }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout after 20s')), timeoutMs),
        ),
      ]);
      return { ok: true, response, durationMs: Date.now() - startedAt };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      };
    }
  });
  writeFileSync(join(OUTPUT_DIR, 'exchange-result.json'), JSON.stringify(exchangeResult, null, 2));

  // Give the SW a moment to log the exchange attempt
  await new Promise((r) => setTimeout(r, 2000));

  writeFileSync(join(OUTPUT_DIR, 'sw-logs.txt'), swLogs.join('\n'));

  await popup.close();
  await context.close();

  // eslint-disable-next-line no-console
  console.log('Outputs written to', OUTPUT_DIR);
});
