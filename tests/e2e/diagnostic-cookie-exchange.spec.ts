// SPDX-License-Identifier: MIT
/**
 * Live diagnostic: launches Chrome with the extension loaded, captures
 * service worker console output, opens the popup, and takes screenshots.
 *
 * Unlike smoke tests, this one does NOT stub the backend. It hits prod
 * (https://api.llmconveyors.com) so we can see the real cookie-exchange
 * flow fail or succeed.
 */
import { test, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '.output', 'chrome-mv3');
const OUTPUT_DIR = join(__dirname, '..', '..', '.test-results', 'diagnostic');

async function getExtensionId(context: BrowserContext): Promise<string> {
  // Wait for the service worker to attach
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  const url = sw.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match) throw new Error(`Could not derive extension id from ${url}`);
  return match[1]!;
}

test('diagnose cookie exchange on popup open (headful)', async () => {
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

  const extId = await getExtensionId(context);
  // eslint-disable-next-line no-console
  console.log(`Extension loaded at id=${extId}`);

  // Give the service worker a moment to fire boot-time cookie exchange
  await new Promise((r) => setTimeout(r, 3000));

  // Open the popup
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');
  await new Promise((r) => setTimeout(r, 2000));
  await popup.screenshot({ path: join(OUTPUT_DIR, 'popup-no-session.png'), fullPage: true });

  // Inspect storage
  const storage = await popup.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome?: { storage?: { local?: { get: (keys: null | string[], cb: (items: Record<string, unknown>) => void) => void } } };
    };
    if (!g.chrome?.storage?.local) return { error: 'chrome.storage.local unavailable' };
    return new Promise<Record<string, unknown>>((resolve) => {
      g.chrome!.storage!.local!.get(null, (items) => resolve(items));
    });
  });
  writeFileSync(join(OUTPUT_DIR, 'storage.json'), JSON.stringify(storage, null, 2));

  // Inspect cookies on llmconveyors.com from the service-worker context
  const cookiesInspection = await popup.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome?: {
        cookies?: {
          getAll: (
            details: { url?: string; domain?: string },
            cb: (cookies: Array<{ name: string; domain: string; httpOnly: boolean; path: string }>) => void,
          ) => void;
        };
      };
    };
    if (!g.chrome?.cookies) return { error: 'chrome.cookies unavailable in popup context' };
    const run = (details: { url?: string; domain?: string }): Promise<Array<{ name: string; domain: string; httpOnly: boolean; path: string }>> =>
      new Promise((resolve) => g.chrome!.cookies!.getAll(details, (cookies) => resolve(cookies)));
    const forUrl = await run({ url: 'https://llmconveyors.com' });
    const forDomain = await run({ domain: 'llmconveyors.com' });
    return {
      forUrlCount: forUrl.length,
      forUrlNames: forUrl.map((c) => `${c.name}@${c.domain}${c.httpOnly ? ' [HttpOnly]' : ''}`),
      forDomainCount: forDomain.length,
      forDomainNames: forDomain.map((c) => `${c.name}@${c.domain}${c.httpOnly ? ' [HttpOnly]' : ''}`),
    };
  });
  writeFileSync(
    join(OUTPUT_DIR, 'cookies.json'),
    JSON.stringify(cookiesInspection, null, 2),
  );

  writeFileSync(join(OUTPUT_DIR, 'sw-logs.txt'), swLogs.join('\n'));

  await popup.close();
  await context.close();

  // eslint-disable-next-line no-console
  console.log('Diagnostic outputs written to', OUTPUT_DIR);
});
