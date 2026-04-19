// SPDX-License-Identifier: MIT
/**
 * Non-Playwright auth verification helper.
 *
 * This script validates the cross-repo auth surface with simple HTTP probes
 * and prints a manual verification checklist for browser-driven sign-in.
 */

type CliOptions = {
  readonly baseUrl: string;
  readonly timeoutMs: number;
};

type CheckResult = {
  readonly id: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly url: string;
  readonly notes?: string;
};

function parseArgs(): CliOptions {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=', 2);
    if (key && value !== undefined) {
      args.set(key, value);
    }
  }

  const baseUrl = (args.get('base-url') ?? 'http://localhost:3000').trim().replace(/\/+$/, '');
  const timeoutRaw = Number.parseInt(args.get('timeout-ms') ?? '10000', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000;

  return {
    baseUrl,
    timeoutMs,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

async function runCheck(
  id: string,
  request: () => Promise<Response>,
  isOk: (status: number) => boolean,
): Promise<CheckResult> {
  try {
    const response = await request();
    return {
      id,
      ok: isOk(response.status),
      status: response.status,
      url: response.url,
      notes: isOk(response.status)
        ? undefined
        : `unexpected status ${response.status}`,
    };
  } catch (error) {
    return {
      id,
      ok: false,
      status: null,
      url: 'n/a',
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

function manualChecklist(baseUrl: string): readonly string[] {
  const loginUrl = `${baseUrl}/login?redirect=%2F`;
  return [
    `Open extension popup and click Sign In.`,
    `Complete login in the opened tab (${loginUrl}).`,
    `Return to popup and trigger auth refresh (close and reopen popup).`,
    `Confirm popup shows signed-in state and credits/profile requests succeed.`,
    `In service-worker logs, confirm AUTH_SIGN_IN and AUTH_RECOVERY events show success path without Playwright automation.`,
    `Open ${baseUrl} and confirm website is also signed in (cookie sync parity).`,
  ];
}

async function main(): Promise<void> {
  const opts = parseArgs();

  const checks = await Promise.all([
    runCheck(
      'bridge-page-reachable',
      () => withTimeout(fetch(`${opts.baseUrl}/auth/extension-signin`, { redirect: 'manual' }), opts.timeoutMs),
      (status) => status >= 200 && status < 400,
    ),
    runCheck(
      'login-page-reachable',
      () => withTimeout(fetch(`${opts.baseUrl}/login`, { redirect: 'manual' }), opts.timeoutMs),
      (status) => status >= 200 && status < 400,
    ),
    runCheck(
      'token-exchange-rejects-dummy-bearer',
      () =>
        withTimeout(
          fetch(`${opts.baseUrl}/api/v1/auth/extension-token-exchange`, {
            method: 'POST',
            headers: {
              authorization: 'Bearer invalid-token',
              'st-auth-mode': 'header',
              'content-type': 'application/json',
            },
            body: JSON.stringify({}),
            redirect: 'manual',
          }),
          opts.timeoutMs,
        ),
      (status) => status === 401 || status === 403,
    ),
    runCheck(
      'cookie-sync-rejects-dummy-bearer',
      () =>
        withTimeout(
          fetch(`${opts.baseUrl}/api/v1/auth/extension-cookie-sync`, {
            method: 'POST',
            headers: {
              authorization: 'Bearer invalid-token',
              'st-auth-mode': 'cookie',
              'content-type': 'application/json',
            },
            body: JSON.stringify({}),
            redirect: 'manual',
          }),
          opts.timeoutMs,
        ),
      (status) => status === 401 || status === 403,
    ),
  ]);

  const passed = checks.filter((entry) => entry.ok).length;
  const failed = checks.length - passed;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    totals: {
      total: checks.length,
      passed,
      failed,
    },
    checks,
    manualChecklist: manualChecklist(opts.baseUrl),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`auth-manual-verify failed: ${message}\n`);
  process.exitCode = 1;
});
