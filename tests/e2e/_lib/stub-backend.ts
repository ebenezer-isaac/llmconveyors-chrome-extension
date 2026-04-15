// SPDX-License-Identifier: MIT
import type { BrowserContext, Route } from '@playwright/test';

/**
 * Stub out network calls to the LLMC backend at the Playwright routing layer.
 * The extension code does not know the backend is stubbed. Both the test-only
 * `api.llmconveyors.local` host (used by vitest integration) and the real
 * production host (`api.llmconveyors.com`) baked into the built extension
 * are routed so the E2E build can run without touching the network.
 */
const BACKEND_HOSTS: readonly string[] = [
  'https://api.llmconveyors.local/**',
  'https://api.llmconveyors.com/**',
];

const BRIDGE_HOSTS: readonly string[] = [
  'https://llmconveyors.com/**',
  'https://llmconveyors.local/**',
];

async function backendHandler(route: Route): Promise<void> {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
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
}

/** Build a short base64url-encoded JWT payload carrying `{sub: userId}`. */
function buildTestJwt(userId: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: userId, iat: Math.floor(Date.now() / 1000) };
  const b64url = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj), 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const signature = 'e2e-unused-signature-segment-xxxxxxxxxxxxxxxx';
  return `${b64url(header)}.${b64url(payload)}.${signature}`;
}

async function bridgeHandler(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/auth/extension-signin')) {
    const redirect = url.searchParams.get('redirect') ?? '';
    const at = buildTestJwt('user_e2e_001');
    const rt = 'rt_e2e_001_longrefreshtokenvaluexxxxxxxxxx';
    const ft = 'ft_e2e_001_longfingerprinttokenxxxxxxxxxx';
    const exp = Date.now() + 60 * 60 * 1000;
    const frag = `at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}&ft=${encodeURIComponent(ft)}&exp=${exp}`;
    const target = redirect.includes('#')
      ? `${redirect}&${frag}`
      : `${redirect}#${frag}`;
    const body = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)});</script></head><body>ok</body></html>`;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
    return;
  }
  await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
}

export async function installBackendStubs(context: BrowserContext): Promise<void> {
  for (const pattern of BACKEND_HOSTS) {
    await context.route(pattern, backendHandler);
  }
  for (const pattern of BRIDGE_HOSTS) {
    await context.route(pattern, bridgeHandler);
  }
}

/**
 * Seed the E2E-only test cookie jar into chrome.storage.local so the popup's
 * sign-in click routes through the cookie-jar backend exchange path (which
 * is stubbed above) instead of the real interactive launchWebAuthFlow popup
 * window, which is not reliably driveable under headless Chromium.
 */
export const E2E_TEST_COOKIE_JAR_KEY = 'llmc.e2e.test-cookie-jar';

export async function seedE2ETestCookieJar(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/__e2e__/seed.html`);
  await page.evaluate(
    ({ key, jar }) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.set({ [key]: jar }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      }),
    { key: E2E_TEST_COOKIE_JAR_KEY, jar: 'st-auth-session=e2e-test-cookie' },
  );
  await page.close();
}
