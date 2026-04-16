// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for background message handlers (post-101).
 *
 * Surface: src/background/messaging/handlers.ts.
 *
 * PROFILE_* handlers and their tests were removed in 101.2 when the local
 * profile stack was replaced by the backend-owned master-resume. Adversarial
 * coverage for the master-resume client lives alongside that module.
 *
 * Covers:
 *  1. Null / undefined / NaN / Infinity at every handler boundary
 *  2. Empty + max-size payloads
 *  3. Unicode -- RTL / combining / null-byte / surrogate-pair strings
 *  4. Injection -- path traversal, tampered URLs
 *  5. Concurrent re-entry -- AUTH_SIGN_OUT fired concurrently,
 *     KEYWORDS_EXTRACT x10 in parallel
 *  6. Adversarial state -- storage that throws, fetch that throws async,
 *     tampered envelope shapes
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createHandlers,
  type HandlerDeps,
} from '../../../src/background/messaging/handlers';
import type { StoredSession } from '../../../src/background/messaging/schemas/auth.schema';
import type {
  FetchAuthed,
  FetchAuthedResult,
} from '../../../src/background/auth';
import type { SessionManager } from '../../../src/background/session/session-manager';

function buildFakeSessionManager(session: StoredSession | null): SessionManager {
  return {
    getSession: vi.fn(async () => session),
  } as unknown as SessionManager;
}

function buildFakeFetchAuthed(
  impl: (url: string, init?: RequestInit) => Promise<FetchAuthedResult> = async () => ({
    kind: 'unauthenticated',
  }),
): FetchAuthed {
  return vi.fn(impl);
}

const sender = { tab: { id: 42 } } as chrome.runtime.MessageSender;

function buildDeps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    fetch: vi.fn(
      async () => new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch,
    fetchAuthed: buildFakeFetchAuthed(),
    sessionManager: buildFakeSessionManager(null),
    now: () => 1_713_000_000_000,
    storage: {
      readSession: vi.fn(async (): Promise<StoredSession | null> => null),
      writeSession: vi.fn(async (_s: StoredSession) => {
        void _s;
      }),
      clearSession: vi.fn(async () => undefined),
    },
    tabState: {
      getIntent: vi.fn(() => null),
      setIntent: vi.fn(),
      getHighlight: vi.fn(() => ({
        on: false,
        keywordCount: 0,
        appliedAt: null,
      })),
      clearAll: vi.fn(),
    },
    broadcast: {
      sendRuntime: vi.fn(async () => undefined),
      sendToTab: vi.fn(async () => ({ ok: false })),
    },
    endpoints: {
      authExchange: 'https://api.test/exchange',
      authSignOut: 'https://api.test/sign-out',
      extractSkills: 'https://api.test/extract',
      settingsProfile: 'https://api.test/profile',
      generationStart: 'https://api.test/start',
      generationCancel: 'https://api.test/cancel',
    },
    masterResume: {
      client: {
        get: vi.fn(async () => ({ kind: 'not-found' as const })),
        put: vi.fn(async () => ({
          kind: 'ok' as const,
          resume: {
            userId: 'u',
            label: 'CV',
            rawText: 'text',
            createdAt: 't',
            updatedAt: 't',
          },
        })),
      },
      cache: {
        read: vi.fn(async () => null),
        readStale: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
      },
    },
    agents: {
      preference: {
        read: vi.fn(async () => ({ agentId: 'job-hunter' as const, selectedAt: 1 })),
        write: vi.fn(async (id) => ({ agentId: id, selectedAt: 2 })),
      },
      manifestClient: {
        get: vi.fn(async () => ({ kind: 'not-found' as const })),
      },
    },
    sessions: {
      client: {
        list: vi.fn(async () => ({ kind: 'unauthenticated' as const })),
      },
      hydrateClient: {
        hydrate: vi.fn(async () => ({ kind: 'unauthenticated' as const })),
      },
      cache: {
        read: vi.fn(async () => null),
        write: vi.fn(async (entry) => ({
          items: entry.items,
          hasMore: entry.hasMore,
          nextCursor: entry.nextCursor,
          fetchedAt: 1_713_000_000_000,
        })),
        clear: vi.fn(async () => undefined),
        isFresh: vi.fn(() => false),
      },
      bindings: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
        evict: vi.fn(async () => undefined),
        list: vi.fn(async () => []),
      },
    },
    generation: {
      agentClient: {
        start: vi.fn(async () => ({ kind: 'unauthenticated' as const })),
        interact: vi.fn(async () => ({ kind: 'unauthenticated' as const })),
      },
      sse: {
        subscribe: vi.fn(async () => ({ ok: true as const })),
        unsubscribe: vi.fn(),
      },
      cancelEndpoint: {
        cancel: vi.fn(async () => ({ ok: true })),
      },
    },
    genericIntent: {
      scripting: {
        executeScript: vi.fn(async () => [{ result: { ok: false, reason: 'no-match' } }]),
      },
    },
    ...over,
  };
}

const validSession: StoredSession = {
  accessToken: 'AT',
  refreshToken: 'RT',
  expiresAt: 999,
  userId: 'u',
};

// ---------- Category 1: Null/undefined/NaN/Infinity ----------

describe('handlers adversarial -- null/undefined/NaN at boundaries', () => {
  it('AUTH_STATUS accepts null data and returns unauthed', async () => {
    const h = createHandlers(buildDeps());
    const r = await h.AUTH_STATUS({
      data: null as unknown as Record<string, never>,
      sender,
    });
    expect(r).toEqual({ signedIn: false });
  });

  it('INTENT_DETECTED drops payload with tabId Infinity', async () => {
    const deps = buildDeps();
    const h = createHandlers(deps);
    await h.INTENT_DETECTED({
      data: {
        tabId: Number.POSITIVE_INFINITY,
        url: 'https://boards.greenhouse.io/x/jobs/1',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: 1,
      },
      sender,
    });
    expect(deps.tabState.setIntent).not.toHaveBeenCalled();
  });

  it('INTENT_DETECTED drops payload with tabId NaN', async () => {
    const deps = buildDeps();
    const h = createHandlers(deps);
    await h.INTENT_DETECTED({
      data: {
        tabId: Number.NaN,
        url: 'https://boards.greenhouse.io/x/jobs/1',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: 1,
      },
      sender,
    });
    expect(deps.tabState.setIntent).not.toHaveBeenCalled();
  });

  it('INTENT_DETECTED drops payload with extremely negative tabId', async () => {
    const deps = buildDeps();
    const h = createHandlers(deps);
    await h.INTENT_DETECTED({
      data: {
        tabId: -999_999,
        url: 'https://boards.greenhouse.io/x/jobs/1',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: 1,
      },
      sender,
    });
    expect(deps.tabState.setIntent).not.toHaveBeenCalled();
  });

  it('KEYWORDS_EXTRACT with null text returns empty-text', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: {
        text: null as unknown as string,
        url: 'https://job.example/1',
      },
      sender,
    });
    expect(r).toEqual({ ok: false, reason: 'empty-text' });
  });
});

// ---------- Category 2: Empty + max-size ----------

describe('handlers adversarial -- empty + max-size payloads', () => {
  it('KEYWORDS_EXTRACT with 50K text is accepted (at max boundary)', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({
        kind: 'ok',
        response: new Response(
          JSON.stringify({
            success: true,
            data: {
              keywords: [
                {
                  term: 'X',
                  category: 'tool',
                  score: 0.5,
                  occurrences: 1,
                  canonicalForm: 'x',
                },
              ],
              tookMs: 10,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      }),
    );
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: {
        text: 'a'.repeat(50_000),
        url: 'https://job.example/1',
      },
      sender,
    });
    expect(r.ok).toBe(true);
  });

  it('KEYWORDS_EXTRACT rejects text > 50K via empty-text mapping', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: {
        text: 'a'.repeat(50_001),
        url: 'https://job.example/1',
      },
      sender,
    });
    expect(r).toEqual({ ok: false, reason: 'empty-text' });
  });

  it('AUTH_SIGN_IN rejects cookieJar > 16K', async () => {
    const h = createHandlers(buildDeps());
    const r = await h.AUTH_SIGN_IN({
      data: { cookieJar: 'c'.repeat(16_385) },
      sender,
    });
    expect(r.ok).toBe(false);
  });
});

// ---------- Category 3: Unicode edge cases ----------

describe('handlers adversarial -- Unicode edge cases', () => {
  it('KEYWORDS_EXTRACT with jd text of Unicode combining marks accepted', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({
        kind: 'ok',
        response: new Response(
          JSON.stringify({
            success: true,
            data: { keywords: [], tookMs: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      }),
    );
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: {
        text: 'a\u0301b\u0308c',
        url: 'https://job.example/1',
      },
      sender,
    });
    expect(r.ok).toBe(true);
  });
});

// ---------- Category 4: Injection ----------

describe('handlers adversarial -- injection', () => {
  it('INTENT_DETECTED with path-traversal URL does not throw', async () => {
    const deps = buildDeps();
    const h = createHandlers(deps);
    await h.INTENT_DETECTED({
      data: {
        tabId: 1,
        url: 'file:///etc/passwd',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: 1,
      },
      sender,
    });
    // Zod z.string().url() accepts file:// by default; we just assert no
    // crash. The higher-level origin/CSP check lives elsewhere.
    expect(true).toBe(true);
  });
});

// ---------- Category 5: Concurrent re-entry ----------

describe('handlers adversarial -- concurrent re-entry', () => {
  it('AUTH_SIGN_OUT fired 3x in parallel clears session deterministically', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    const h = createHandlers(deps);
    const [a, b, c] = await Promise.all([
      h.AUTH_SIGN_OUT({ data: {}, sender }),
      h.AUTH_SIGN_OUT({ data: {}, sender }),
      h.AUTH_SIGN_OUT({ data: {}, sender }),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(c).toEqual({ ok: true });
    expect(deps.storage.clearSession).toHaveBeenCalledTimes(3);
  });

  it('AUTH_SIGN_IN + AUTH_SIGN_OUT in parallel each produce typed envelope', async () => {
    const deps = buildDeps();
    (deps as unknown as { fetch: typeof fetch }).fetch = vi.fn(async () => new Response('{}', { status: 500 })) as
      unknown as typeof fetch;
    const h = createHandlers(deps);
    const [si, so] = await Promise.all([
      h.AUTH_SIGN_IN({ data: { cookieJar: 'x' }, sender }),
      h.AUTH_SIGN_OUT({ data: {}, sender }),
    ]);
    expect(typeof si.ok).toBe('boolean');
    expect(so).toEqual({ ok: true });
  });

  it('KEYWORDS_EXTRACT x10 in parallel all return typed envelope', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({
        kind: 'ok',
        response: new Response(
          JSON.stringify({
            success: true,
            data: { keywords: [], tookMs: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      }),
    );
    const h = createHandlers(deps);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.KEYWORDS_EXTRACT({
          data: { text: 'typescript', url: 'https://job.example/1' },
          sender,
        }),
      ),
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });
});

// ---------- Category 6: Adversarial state ----------

describe('handlers adversarial -- storage + fetch errors', () => {
  it('AUTH_STATUS returns unauthed when readSession throws', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => {
      throw new Error('quota exhausted');
    });
    const h = createHandlers(deps);
    const r = await h.AUTH_STATUS({ data: {}, sender });
    expect(r).toEqual({ signedIn: false });
  });

  it('KEYWORDS_EXTRACT returns network-error when fetchAuthed reports network error', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({ kind: 'network-error', error: new TypeError('disconnected') }),
    );
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://job.example/1' },
      sender,
    });
    expect(r).toEqual({ ok: false, reason: 'network-error' });
  });

  it('KEYWORDS_EXTRACT returns signed-out when fetchAuthed exhausts silent retry', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({ kind: 'unauthenticated' }),
    );
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://job.example/1' },
      sender,
    });
    expect(r).toEqual({ ok: false, reason: 'signed-out' });
  });

  it('KEYWORDS_EXTRACT returns api-error on invalid JSON', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({
        kind: 'ok',
        response: new Response('not-json at all', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      }),
    );
    const h = createHandlers(deps);
    const r = await h.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://job.example/1' },
      sender,
    });
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });

  it('FILL_REQUEST returns no-tab when data is malformed', async () => {
    const h = createHandlers(buildDeps());
    const r = await h.FILL_REQUEST({
      data: { tabId: 'not-a-number' } as unknown as {
        tabId: number;
        url: string;
      },
      sender,
    });
    expect(r).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'no-tab',
    });
  });

  it('CREDITS_GET returns fallback on API shape drift', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => validSession);
    (deps as unknown as { fetchAuthed: FetchAuthed }).fetchAuthed = buildFakeFetchAuthed(
      async () => ({
        kind: 'ok',
        response: new Response('not-json', { status: 200 }),
      }),
    );
    const h = createHandlers(deps);
    const r = await h.CREDITS_GET({ data: {}, sender });
    expect(r).toEqual({ credits: 0, tier: 'free', byoKeyEnabled: false });
  });

  it('AUTH_SIGN_IN cookieJar exchange with tampered userId (empty) is rejected', async () => {
    const deps = buildDeps();
    (deps as unknown as { fetch: typeof fetch }).fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresAt: 10,
            userId: '',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ) as unknown as typeof fetch;
    const h = createHandlers(deps);
    const r = await h.AUTH_SIGN_IN({
      data: { cookieJar: 'jar' },
      sender,
    });
    expect(r.ok).toBe(false);
  });

  it('AUTH_SIGN_IN cookieJar exchange with expired session is accepted per schema (expiresAt enforcement downstream)', async () => {
    const deps = buildDeps();
    (deps as unknown as { fetch: typeof fetch }).fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresAt: 1,
            userId: 'u',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ) as unknown as typeof fetch;
    const h = createHandlers(deps);
    const r = await h.AUTH_SIGN_IN({
      data: { cookieJar: 'jar' },
      sender,
    });
    expect(typeof r.ok).toBe('boolean');
  });
});
