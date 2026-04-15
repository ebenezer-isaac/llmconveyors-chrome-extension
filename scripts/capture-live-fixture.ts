// SPDX-License-Identifier: MIT
/**
 * capture-live-fixture.ts
 *
 * Capture a live ATS page to a committed HTML snapshot after PII scrubbing.
 * Used to seed `tests/e2e/captured/<vendor>/` fixtures so autofill tests
 * can exercise real-world DOMs without ever touching a live site in CI.
 *
 * Usage:
 *   pnpm exec tsx scripts/capture-live-fixture.ts <vendor> <url> <name>
 *
 * Example:
 *   pnpm exec tsx scripts/capture-live-fixture.ts \
 *     greenhouse https://boards.greenhouse.io/airbnb/jobs/12345 airbnb-ios
 *
 * Output:
 *   tests/e2e/captured/<vendor>/<name>.html
 *   tests/e2e/captured/<vendor>/<name>.meta.json
 *
 * PII Scrubbing Rules:
 *   - Email-shaped strings   -> scrubbed@example.com
 *   - Phone-shaped strings   -> +15555550000
 *   - SSN-shaped strings     -> 000-00-0000
 *   - DOB-shaped (MM/DD/YYYY, YYYY-MM-DD) -> 01/01/1990 / 1990-01-01
 *   - Form values for common HR name fields -> John / Doe
 *   - Street-address heuristics -> 123 Main St
 *
 * The scrubber is conservative. Review the output before committing.
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const CAPTURED_ROOT = join(REPO_ROOT, 'tests', 'e2e', 'captured');

const SUPPORTED_VENDORS = new Set(['greenhouse', 'lever', 'workday']);

interface Args {
  readonly vendor: string;
  readonly url: string;
  readonly name: string;
}

function parseArgs(argv: readonly string[]): Args {
  const [vendor, url, name] = argv;
  if (!vendor || !url || !name) {
    throw new Error(
      'usage: pnpm exec tsx scripts/capture-live-fixture.ts <vendor> <url> <name>',
    );
  }
  if (!SUPPORTED_VENDORS.has(vendor)) {
    throw new Error(
      `unsupported vendor '${vendor}'. expected one of: ${Array.from(SUPPORTED_VENDORS).join(', ')}`,
    );
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('url must be http(s)');
    }
  } catch (e) {
    throw new Error(`invalid url: ${url} (${(e as Error).message})`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    throw new Error(
      `invalid name '${name}'. use kebab-case letters/digits (e.g. airbnb-ios)`,
    );
  }
  return { vendor, url, name };
}

/** Replace email-shaped strings with a stable scrubbed value. */
function scrubEmails(html: string): string {
  return html.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g,
    'scrubbed@example.com',
  );
}

/** Replace phone-shaped strings with +15555550000. Conservative heuristic. */
function scrubPhones(html: string): string {
  // E.164-ish: +1 415 555 0101, (415) 555-0101, 415-555-0101, etc.
  const phoneRe =
    /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
  return html.replace(phoneRe, (match) => {
    // Avoid matching long digit strings (timestamps, IDs).
    const digits = match.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) return match;
    return '+15555550000';
  });
}

/** Replace SSN-shaped strings. */
function scrubSsns(html: string): string {
  return html.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '000-00-0000');
}

/** Replace date-of-birth shaped strings. */
function scrubDates(html: string): string {
  return html
    .replace(/\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/g, '01/01/1990')
    .replace(/\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, '1990-01-01');
}

/** Replace `value="..."` attributes for common PII-shaped name inputs. */
function scrubNameInputs(html: string): string {
  const patterns: Array<[RegExp, string]> = [
    // Match <input ... name="first_name" ... value="X"> regardless of attr order.
    [
      /(<input\b[^>]*\bname=(?:"|')[^"']*(?:first[_\s-]?name|firstName|givenName|fname)[^"']*(?:"|')[^>]*\bvalue=(?:"|'))[^"']*((?:"|')[^>]*>)/gi,
      '$1John$2',
    ],
    [
      /(<input\b[^>]*\bname=(?:"|')[^"']*(?:last[_\s-]?name|lastName|familyName|surname|lname)[^"']*(?:"|')[^>]*\bvalue=(?:"|'))[^"']*((?:"|')[^>]*>)/gi,
      '$1Doe$2',
    ],
    [
      /(<input\b[^>]*\bname=(?:"|')[^"']*(?:full[_\s-]?name|applicantName)[^"']*(?:"|')[^>]*\bvalue=(?:"|'))[^"']*((?:"|')[^>]*>)/gi,
      '$1John Doe$2',
    ],
    [
      /(<input\b[^>]*\bname=(?:"|')[^"']*(?:street|address[_\s-]?line|addressLine1)[^"']*(?:"|')[^>]*\bvalue=(?:"|'))[^"']*((?:"|')[^>]*>)/gi,
      '$1123 Main St$2',
    ],
  ];
  let out = html;
  for (const [re, repl] of patterns) out = out.replace(re, repl);
  return out;
}

/** Apply the full scrubber chain. */
function scrubHtml(html: string): string {
  let out = html;
  out = scrubEmails(out);
  out = scrubPhones(out);
  out = scrubSsns(out);
  out = scrubDates(out);
  out = scrubNameInputs(out);
  return out;
}

async function capture(args: Args): Promise<void> {
  const outDir = join(CAPTURED_ROOT, args.vendor);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const resp = await page.goto(args.url, {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    if (!resp) throw new Error('navigation returned no response');
    if (!resp.ok()) throw new Error(`HTTP ${resp.status()} ${resp.statusText()}`);
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => undefined);

    const outerHtml = await page.evaluate(
      () => document.documentElement.outerHTML,
    );
    const scrubbed = scrubHtml(outerHtml);

    const htmlPath = join(outDir, `${args.name}.html`);
    const metaPath = join(outDir, `${args.name}.meta.json`);
    writeFileSync(htmlPath, scrubbed, 'utf-8');
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          vendor: args.vendor,
          url: args.url,
          name: args.name,
          capturedAt: new Date().toISOString(),
          sizeBytes: scrubbed.length,
          scrubber: {
            version: 1,
            rules: ['email', 'phone', 'ssn', 'dob', 'nameInputs'],
          },
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    process.stdout.write(`captured ${htmlPath}\n`);
    process.stdout.write(`metadata ${metaPath}\n`);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await capture(args);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`capture-live-fixture failed: ${msg}\n`);
  process.exit(1);
});
