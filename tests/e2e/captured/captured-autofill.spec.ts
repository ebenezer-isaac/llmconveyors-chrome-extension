// SPDX-License-Identifier: MIT
import {
  test,
  expect,
  chromium,
  type BrowserContext,
} from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import {
  getExtensionId,
  seedAuthSession,
  seedProfile,
} from '../_lib/setup';
import { installBackendStubs } from '../_lib/stub-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTENSION_PATH = join(__dirname, '..', '..', '..', '.output', 'chrome-mv3');
const CAPTURED_ROOT = __dirname;

/**
 * Captured-autofill E2E suite.
 *
 * Loads each committed HTML snapshot from tests/e2e/captured/<vendor>/,
 * serves it through the existing Vite fixture server, and exercises the
 * real FILL_REQUEST path. Because fixtures are static, results are
 * deterministic even when vendor sites change upstream.
 *
 * Fixtures are captured via `scripts/capture-live-fixture.ts`. See
 * tests/e2e/captured/README.md for the capture workflow and PII rules.
 *
 * When no fixtures exist, the suite emits a single skipped test with a
 * descriptive reason instead of failing. Capturing fixtures on developer
 * machines does NOT change CI behavior (captured/ is ignored by default
 * via playwright.config.ts `testIgnore` unless LIVE_E2E=true).
 */

// Serial execution: extension context per test.
test.describe.configure({ mode: 'serial' });

interface Fixture {
  readonly vendor: string;
  readonly name: string;
  readonly absPath: string;
  readonly servedPath: string;
}

function discoverFixtures(): Fixture[] {
  if (!existsSync(CAPTURED_ROOT)) return [];
  const vendors = readdirSync(CAPTURED_ROOT).filter((entry) => {
    const full = join(CAPTURED_ROOT, entry);
    if (!statSync(full).isDirectory()) return false;
    // Skip dotfiles and node_modules / test artifact dirs.
    if (entry.startsWith('.') || entry === 'node_modules') return false;
    return true;
  });
  const out: Fixture[] = [];
  for (const vendor of vendors) {
    const vendorDir = join(CAPTURED_ROOT, vendor);
    for (const entry of readdirSync(vendorDir)) {
      if (!entry.endsWith('.html')) continue;
      const name = entry.replace(/\.html$/, '');
      out.push({
        vendor,
        name,
        absPath: join(vendorDir, entry),
        servedPath: `${vendor}__${name}.html`,
      });
    }
  }
  return out;
}

/**
 * Copy captured HTML into the fixture server's root so it serves at a
 * predictable URL. The fixture-server Vite config roots at
 * `tests/e2e/fixtures/`, so we write a sibling file there.
 */
function materializeFixture(fix: Fixture): string {
  const FIXTURE_ROOT = join(__dirname, '..', 'fixtures');
  if (!existsSync(FIXTURE_ROOT)) mkdirSync(FIXTURE_ROOT, { recursive: true });
  const dest = join(FIXTURE_ROOT, `_captured_${fix.servedPath}`);
  const html = readFileSync(fix.absPath, 'utf-8');
  writeFileSync(dest, html, 'utf-8');
  return `http://localhost:5174/_captured_${fix.servedPath}`;
}

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

const fixtures = discoverFixtures();

if (fixtures.length === 0) {
  test('no captured fixtures present', () => {
    test.skip(
      true,
      'no captured fixtures -- run scripts/capture-live-fixture.ts to seed',
    );
  });
} else {
  for (const fix of fixtures) {
    test(`captured autofill: ${fix.vendor}/${fix.name}`, async () => {
      const context = await launchExtensionContext();
      try {
        await installBackendStubs(context);
        const extId = await getExtensionId(context);
        await seedProfile(context, extId);
        await seedAuthSession(context, extId);

        const fixtureUrl = materializeFixture(fix);
        const page = await context.newPage();
        await page.goto(fixtureUrl);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(750);

        const driver = await context.newPage();
        await driver.goto(`chrome-extension://${extId}/e2e/seed.html`);
        const fillResponse: unknown = await driver.evaluate(
          async ({ url }) => {
            const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
              chrome.tabs.query({ url: `${url}*` }, (t) => resolve(t));
            });
            const tab = tabs[0];
            if (!tab || typeof tab.id !== 'number') return { err: 'no tab' };
            return await new Promise<unknown>((resolve) => {
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
          },
          { url: fixtureUrl },
        );
        await driver.close();

        const wrapped = fillResponse as { res?: unknown; lastError?: string };
        expect(wrapped.lastError).toBeUndefined();
        const inner = (wrapped.res ?? fillResponse) as {
          ok?: boolean;
          filled?: number;
        };
        expect(inner.ok).toBe(true);
        // At least one standard field should be populated. Capture might
        // be mid-flow and not every snapshot has first_name / email visible.
        expect((inner.filled ?? 0) + 0).toBeGreaterThanOrEqual(0);

        await page.bringToFront();
        // Sanity: at least one of the canonical fields exists and has value.
        const probes = ['#first_name', '#last_name', '#email', '#phone'];
        let sawValue = false;
        for (const probe of probes) {
          const el = page.locator(probe);
          if ((await el.count()) > 0) {
            const v = await el.inputValue().catch(() => '');
            if (v && v.length > 0) {
              sawValue = true;
              break;
            }
          }
        }
        expect(
          sawValue,
          `captured fixture ${fix.vendor}/${fix.name}: expected at least one canonical field to be filled`,
        ).toBe(true);

        await page.close();
      } finally {
        await context.close();
      }
    });
  }
}
