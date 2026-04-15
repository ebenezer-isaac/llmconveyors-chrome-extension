// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  SessionManager,
  type SessionManagerDeps,
} from '../../../src/background/session/session-manager';
import { SessionExpiredError } from '../../../src/background/messaging/errors';

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
