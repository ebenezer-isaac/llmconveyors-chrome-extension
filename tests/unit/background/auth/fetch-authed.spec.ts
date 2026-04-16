// SPDX-License-Identifier: MIT
/**
 * Tests for `createFetchAuthed` - the central authenticated fetch helper.
 *
 * Coverage matrix:
 *   - happy path: SessionManager returns a session, fetch returns 2xx
 *   - unauthenticated: SessionManager returns null
 *   - silent-retry success: first call 401, silent sign-in succeeds, retry 2xx
 *   - silent-retry failure: first call 401, silent sign-in returns false
 *   - 401-then-401: silent sign-in succeeds but retry still 401
 *   - network-error: underlying fetch rejects
 *   - headers merge: caller headers preserved, Authorization overwritten
 *   - cooldown: a second silent retry within the cooldown window is skipped
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createFetchAuthed,
  type FetchAuthedDeps,
} from '../../../../src/background/auth/fetch-authed';
import type { SessionManager } from '../../../../src/background/session/session-manager';
import type { StoredSession } from '../../../../src/background/messaging/schemas/auth.schema';
import type { Logger } from '../../../../src/background/log';

function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeSessionManager(
  sessions: ReadonlyArray<StoredSession | null>,
): SessionManager {
  let i = 0;
  return {
    getSession: vi.fn(async () => {
      const next = sessions[Math.min(i, sessions.length - 1)];
      i += 1;
      return next ?? null;
    }),
  } as unknown as SessionManager;
}

const SESSION_A: StoredSession = {
  accessToken: 'AT_A',
  refreshToken: 'RT_A',
  expiresAt: Date.now() + 3_600_000,
  userId: 'u',
};
const SESSION_B: StoredSession = {
  accessToken: 'AT_B',
  refreshToken: 'RT_B',
  expiresAt: Date.now() + 3_600_000,
  userId: 'u',
};

function buildDeps(over: Partial<FetchAuthedDeps> = {}): FetchAuthedDeps {
  return {
    sessionManager: fakeSessionManager([SESSION_A]),
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    silentSignIn: vi.fn(async () => true),
    logger: makeLogger(),
    now: () => Date.now(),
    ...over,
  };
}

describe('createFetchAuthed - happy path', () => {
  it('returns { kind: "ok", response } when fetch succeeds with 2xx', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchFn = vi.fn(async () => response);
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'ok', response });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('sets Authorization: Bearer <accessToken> on the outgoing request', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    await fetchAuthed('https://api/test');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SESSION_A.accessToken}`);
  });
});

describe('createFetchAuthed - unauthenticated', () => {
  it('returns unauthenticated when SessionManager yields no session', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([null]),
        fetch: fetchFn as unknown as typeof fetch,
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'unauthenticated' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('createFetchAuthed - silent retry', () => {
  it('401 then silent sign-in then retry 200 returns ok', async () => {
    const response401 = new Response('', { status: 401 });
    const response200 = new Response('ok', { status: 200 });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response401)
      .mockResolvedValueOnce(response200);
    const silentSignIn = vi.fn(async () => true);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, SESSION_B]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.response).toBe(response200);
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Retried request must carry the refreshed token.
    const [, retryInit] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    const headers = retryInit.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SESSION_B.accessToken}`);
  });

  it('401 then silent sign-in fails returns unauthenticated', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const silentSignIn = vi.fn(async () => false);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'unauthenticated' });
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('401 then silent sign-in succeeds but SessionManager still null returns unauthenticated', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, null]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn: vi.fn(async () => true),
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'unauthenticated' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('401 then silent sign-in succeeds then retry 401 returns unauthenticated', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, SESSION_B]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn: vi.fn(async () => true),
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'unauthenticated' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('403 triggers the same silent-retry path as 401', async () => {
    const response403 = new Response('', { status: 403 });
    const response200 = new Response('ok', { status: 200 });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response403)
      .mockResolvedValueOnce(response200);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, SESSION_B]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn: vi.fn(async () => true),
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('ok');
  });
});

describe('createFetchAuthed - network errors', () => {
  it('returns network-error when underlying fetch throws', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('network-error');
    if (r.kind === 'network-error') {
      expect(r.error.message).toBe('offline');
    }
  });

  it('returns network-error when retry throws after silent sign-in', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response401)
      .mockRejectedValueOnce(new TypeError('boom'));
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, SESSION_B]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn: vi.fn(async () => true),
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('network-error');
  });
});

describe('createFetchAuthed - headers merge', () => {
  it('preserves caller headers and overrides Authorization', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    await fetchAuthed('https://api/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-custom': 'stay',
        authorization: 'Bearer IGNORED',
      },
      body: '{}',
    });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-custom']).toBe('stay');
    expect(headers.authorization).toBe(`Bearer ${SESSION_A.accessToken}`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('accepts a Headers instance as caller headers', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const callerHeaders = new Headers({ 'x-trace': 'abc' });
    await fetchAuthed('https://api/test', { headers: callerHeaders });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-trace']).toBe('abc');
    expect(headers.authorization).toBe(`Bearer ${SESSION_A.accessToken}`);
  });

  it('accepts an array-of-tuples header shape', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    await fetchAuthed('https://api/test', {
      headers: [
        ['x-one', '1'],
        ['x-two', '2'],
      ],
    });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-one']).toBe('1');
    expect(headers['x-two']).toBe('2');
    expect(headers.authorization).toBe(`Bearer ${SESSION_A.accessToken}`);
  });

  it('works with no init at all', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('ok');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SESSION_A.accessToken}`);
  });
});

describe('createFetchAuthed - silent retry cooldown', () => {
  it('second 401 within cooldown window does not call silentSignIn again (cooldown only after FAILURE)', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const silentSignIn = vi.fn(async () => false);
    let current = 1_000_000;
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
        now: () => current,
        silentRetryCooldownMs: 10_000,
      }),
    );
    await fetchAuthed('https://api/test');
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    current += 5_000;
    await fetchAuthed('https://api/test');
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    current += 6_000;
    await fetchAuthed('https://api/test');
    expect(silentSignIn).toHaveBeenCalledTimes(2);
  });

  it('successful silent-signin does NOT install a cooldown', async () => {
    // Before fix: success set lastSilentAttempt, blocking a legitimate
    // future retry. After fix: only failures install cooldown.
    // Sim: stored token becomes "stale" again between successive calls
    // (e.g. backend rotates secrets). Each call begins with SESSION_A
    // (stale -> 401), silent-signin resolves true, retry uses SESSION_B
    // (fresh -> 200). Then the next call begins with SESSION_A again to
    // simulate a fresh staleness event.
    let stale = true;
    const sm = {
      getSession: vi.fn(async () => (stale ? SESSION_A : SESSION_B)),
    } as unknown as SessionManager;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return headers.authorization === `Bearer ${SESSION_A.accessToken}`
        ? new Response('', { status: 401 })
        : new Response('ok', { status: 200 });
    });
    const silentSignIn = vi.fn(async () => {
      stale = false;
      return true;
    });
    let now = 1_000_000;
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: sm,
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
        now: () => now,
        silentRetryCooldownMs: 10_000,
      }),
    );
    const r1 = await fetchAuthed('https://api/test');
    expect(r1.kind).toBe('ok');
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    // Reset to "stale" to force a second silent-signin path.
    stale = true;
    now += 100;
    const r2 = await fetchAuthed('https://api/test');
    expect(r2.kind).toBe('ok');
    expect(silentSignIn).toHaveBeenCalledTimes(2);
  });

  it('silentSignIn throwing is treated as false and swallowed', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const silentSignIn = vi.fn(async () => {
      throw new Error('provider rejected');
    });
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r).toEqual({ kind: 'unauthenticated' });
  });

  it('cooldown is per-URL: a different URL triggers a fresh retry', async () => {
    const response401 = new Response('', { status: 401 });
    const fetchFn = vi.fn(async () => response401);
    const silentSignIn = vi.fn(async () => false);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
        now: () => 1_000_000,
      }),
    );
    await fetchAuthed('https://api/a');
    await fetchAuthed('https://api/b');
    expect(silentSignIn).toHaveBeenCalledTimes(2);
  });
});

describe('createFetchAuthed - concurrent silent-signin dedup', () => {
  it('three concurrent 401s on the same URL share one silent-signin invocation', async () => {
    // SessionManager that flips to SESSION_B only AFTER silent-signin resolves.
    let signedInB = false;
    const sm = {
      getSession: vi.fn(async () => (signedInB ? SESSION_B : SESSION_A)),
    } as unknown as SessionManager;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      // Stale token -> 401, fresh token -> 200.
      return headers.authorization === `Bearer ${SESSION_A.accessToken}`
        ? new Response('', { status: 401 })
        : new Response('ok', { status: 200 });
    });
    let resolveSignin: (v: boolean) => void = () => {};
    const silentSignIn = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSignin = resolve;
        }),
    );
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: sm,
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
      }),
    );
    const p1 = fetchAuthed('https://api/test');
    const p2 = fetchAuthed('https://api/test');
    const p3 = fetchAuthed('https://api/test');
    // Allow the three initial fetches and the silent-signin scheduling.
    await new Promise((r) => setTimeout(r, 0));
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    signedInB = true;
    resolveSignin(true);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.kind).toBe('ok');
    expect(r2.kind).toBe('ok');
    expect(r3.kind).toBe('ok');
    // Still only one silent-signin invocation total.
    expect(silentSignIn).toHaveBeenCalledTimes(1);
  });

  it('after a failed silent-signin, the cooldown blocks subsequent retries (same URL)', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
    const silentSignIn = vi.fn(async () => false);
    let now = 1_000;
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn,
        now: () => now,
        silentRetryCooldownMs: 10_000,
      }),
    );
    const r1 = await fetchAuthed('https://api/test');
    expect(r1.kind).toBe('unauthenticated');
    expect(silentSignIn).toHaveBeenCalledTimes(1);
    now += 1_000;
    const r2 = await fetchAuthed('https://api/test');
    expect(r2.kind).toBe('unauthenticated');
    // Still 1 - cooldown blocked the retry.
    expect(silentSignIn).toHaveBeenCalledTimes(1);
  });
});

describe('createFetchAuthed - body cancel on 401', () => {
  it('cancels the original 401 response body before retrying', async () => {
    const cancelSpy = vi.fn(async () => undefined);
    const body401 = new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
      cancel: cancelSpy,
    });
    const response401 = new Response(body401, { status: 401 });
    const response200 = new Response('ok', { status: 200 });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response401)
      .mockResolvedValueOnce(response200);
    const fetchAuthed = createFetchAuthed(
      buildDeps({
        sessionManager: fakeSessionManager([SESSION_A, SESSION_B]),
        fetch: fetchFn as unknown as typeof fetch,
        silentSignIn: vi.fn(async () => true),
      }),
    );
    const r = await fetchAuthed('https://api/test');
    expect(r.kind).toBe('ok');
    // Allow microtask queue to flush - cancel is fire-and-forget
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createFetchAuthed - body shape constraint', () => {
  it('throws synchronously when init.body is a ReadableStream', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const stream = new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.close();
      },
    });
    await expect(
      fetchAuthed('https://api/test', { method: 'POST', body: stream }),
    ).rejects.toThrow(/ReadableStream bodies are not supported/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('accepts a string body (happy path proves the throw is ReadableStream-specific)', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }));
    const fetchAuthed = createFetchAuthed(
      buildDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const r = await fetchAuthed('https://api/test', {
      method: 'POST',
      body: '{"k":"v"}',
    });
    expect(r.kind).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
