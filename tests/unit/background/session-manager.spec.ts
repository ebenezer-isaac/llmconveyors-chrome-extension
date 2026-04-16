// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  SessionManager,
  type SessionManagerDeps,
} from '../../../src/background/session/session-manager';
import {
  SessionExpiredError,
  SessionRefreshNetworkError,
} from '../../../src/background/messaging/errors';

function buildDeps(overrides: Partial<SessionManagerDeps> = {}): SessionManagerDeps {
  return {
    readSession: vi.fn(async () => ({
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() + 3_600_000,
      userId: 'u1',
    })),
    writeSession: vi.fn(async () => undefined),
    clearSession: vi.fn(async () => undefined),
    fetch: vi.fn() as unknown as typeof fetch,
    now: () => Date.now(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    refreshEndpoint: 'https://api.test/refresh',
    ...overrides,
  };
}

function fetchReturning(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe('SessionManager.refreshOnce', () => {
  it('returns new session on 200', async () => {
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({
          accessToken: 'new-at',
          refreshToken: 'new-rt',
          expiresAt: Date.now() + 3_600_000,
          userId: 'u1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    const result = await sm.refreshOnce();
    expect(result.accessToken).toBe('new-at');
    expect(deps.writeSession).toHaveBeenCalledOnce();
  });

  it('dedupes 100 concurrent callers to a single fetch', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl: typeof globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof globalThis.fetch;
    const deps = buildDeps({ fetch: fetchImpl });
    const sm = new SessionManager(deps);
    const promises = Array.from({ length: 100 }, () => sm.refreshOnce());
    // Allow microtasks to run so readSession() resolves and fetch() gets called.
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(
      new Response(
        JSON.stringify({
          accessToken: 'n',
          refreshToken: 'n',
          expiresAt: Date.now() + 3_600_000,
          userId: 'u',
        }),
        { status: 200 },
      ),
    );
    const results = await Promise.all(promises);
    expect(new Set(results).size).toBe(1);
  });

  it('rejects on 401 with SessionExpiredError and clears session', async () => {
    const fetch = fetchReturning(new Response('', { status: 401 }));
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(deps.clearSession).toHaveBeenCalled();
  });

  it('rejects when readSession returns null', async () => {
    const deps = buildDeps({ readSession: vi.fn(async () => null) });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('rejects on malformed response (missing accessToken)', async () => {
    const fetch = fetchReturning(
      new Response(JSON.stringify({ refreshToken: 'r', expiresAt: 1 }), { status: 200 }),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('rejects on Infinity expiresAt', async () => {
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: Infinity }),
        { status: 200 },
      ),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('rejects on non-JSON body', async () => {
    const fetch = fetchReturning(new Response('<html>502</html>', { status: 200 }));
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('accepts a wrapped envelope { success, data: { ... }, requestId, timestamp }', async () => {
    const expiry = Date.now() + 3_600_000;
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            accessToken: 'wrapped-at',
            refreshToken: 'wrapped-rt',
            expiresAt: expiry,
            userId: 'u-wrap',
          },
          requestId: 'req-1',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    const result = await sm.refreshOnce();
    expect(result.accessToken).toBe('wrapped-at');
    expect(result.refreshToken).toBe('wrapped-rt');
    expect(result.expiresAt).toBe(expiry);
    expect(result.userId).toBe('u-wrap');
    expect(deps.writeSession).toHaveBeenCalledOnce();
  });

  it('still accepts the raw top-level shape (backward compatibility)', async () => {
    const expiry = Date.now() + 3_600_000;
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({
          accessToken: 'raw-at',
          refreshToken: 'raw-rt',
          expiresAt: expiry,
          userId: 'u-raw',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    const result = await sm.refreshOnce();
    expect(result.accessToken).toBe('raw-at');
    expect(result.refreshToken).toBe('raw-rt');
    expect(result.expiresAt).toBe(expiry);
    expect(result.userId).toBe('u-raw');
  });

  it('does not send Authorization header on refresh POST (body is enough)', async () => {
    const expiry = Date.now() + 3_600_000;
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'a', refreshToken: 'r', expiresAt: expiry, userId: 'u' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const deps = buildDeps({ fetch: fetchSpy as unknown as typeof fetch });
    const sm = new SessionManager(deps);
    await sm.refreshOnce();
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws SessionRefreshNetworkError (NOT SessionExpiredError) on transport failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    const deps = buildDeps({ fetch: fetchFn });
    const sm = new SessionManager(deps);
    await expect(sm.refreshOnce()).rejects.toBeInstanceOf(SessionRefreshNetworkError);
    // critical: stored session is preserved across a transient blip
    expect(deps.clearSession).not.toHaveBeenCalled();
  });

  it('clears session on rejected (401) and on malformed body, but not on network error', async () => {
    const rejectedDeps = buildDeps({
      fetch: fetchReturning(new Response('', { status: 401 })),
    });
    const smRejected = new SessionManager(rejectedDeps);
    await expect(smRejected.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(rejectedDeps.clearSession).toHaveBeenCalledTimes(1);

    const malformedDeps = buildDeps({
      fetch: fetchReturning(new Response('not-json', { status: 200 })),
    });
    const smMalformed = new SessionManager(malformedDeps);
    await expect(smMalformed.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(malformedDeps.clearSession).toHaveBeenCalledTimes(1);
  });

  it('SessionExpiredError carries a typed reason', async () => {
    const rejected = fetchReturning(new Response('', { status: 401 }));
    const smR = new SessionManager(buildDeps({ fetch: rejected }));
    try {
      await smR.refreshOnce();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionExpiredError);
      if (err instanceof SessionExpiredError) {
        expect(err.reason).toBe('rejected');
      }
    }
    const malformed = fetchReturning(new Response('not-json', { status: 200 }));
    const smM = new SessionManager(buildDeps({ fetch: malformed }));
    try {
      await smM.refreshOnce();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionExpiredError);
      if (err instanceof SessionExpiredError) {
        expect(err.reason).toBe('malformed');
      }
    }
  });

  it('treats an array `data` field as raw body (does not unwrap)', async () => {
    // Defence against accidental unwrap of unrelated `data: []` payloads.
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: Date.now() + 3_600_000,
          userId: 'u',
          data: ['unrelated'],
        }),
        { status: 200 },
      ),
    );
    const deps = buildDeps({ fetch });
    const sm = new SessionManager(deps);
    const result = await sm.refreshOnce();
    expect(result.accessToken).toBe('a');
  });
});

describe('SessionManager.getSession', () => {
  it('returns null when readSession is null', async () => {
    const sm = new SessionManager(buildDeps({ readSession: vi.fn(async () => null) }));
    expect(await sm.getSession()).toBeNull();
  });
  it('returns existing session when not near expiry', async () => {
    const sm = new SessionManager(buildDeps());
    const s = await sm.getSession();
    expect(s?.accessToken).toBe('old-at');
  });
  it('proactively refreshes when near expiry', async () => {
    const fetch = fetchReturning(
      new Response(
        JSON.stringify({
          accessToken: 'new-at',
          refreshToken: 'new-rt',
          expiresAt: Date.now() + 3_600_000,
          userId: 'u1',
        }),
        { status: 200 },
      ),
    );
    const deps = buildDeps({
      fetch,
      readSession: vi.fn(async () => ({
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        expiresAt: Date.now() + 10_000,
        userId: 'u1',
      })),
    });
    const sm = new SessionManager(deps);
    const s = await sm.getSession();
    expect(s?.accessToken).toBe('new-at');
  });
});
