// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  createHandlers,
  deepMerge,
  type HandlerDeps,
} from '../../../src/background/messaging/handlers';
import type { StoredSession } from '../../../src/background/messaging/schemas/auth.schema';

const senderStub = { tab: { id: 42 } } as chrome.runtime.MessageSender;

function buildDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const storage = {
    readSession: vi.fn(async (): Promise<StoredSession | null> => null),
    writeSession: vi.fn(async (_s: StoredSession) => {
      void _s;
    }),
    clearSession: vi.fn(async () => undefined),
  };
  const tabState = {
    getIntent: vi.fn(() => null),
    setIntent: vi.fn(),
    getHighlight: vi.fn(() => ({ on: false, keywordCount: 0, appliedAt: null })),
    clearAll: vi.fn(),
  };
  const broadcast = {
    sendRuntime: vi.fn(async () => undefined),
    sendToTab: vi.fn(async () => ({ ok: false })),
  };
  const masterResume = {
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
  };
  return {
    logger,
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    now: () => 1_713_000_000_000,
    storage,
    tabState,
    broadcast,
    endpoints: {
      authExchange: 'https://api.test/exchange',
      authSignOut: 'https://api.test/sign-out',
      extractSkills: 'https://api.test/extract',
      usageSummary: 'https://api.test/usage',
      generationStart: 'https://api.test/start',
      generationCancel: 'https://api.test/cancel',
    },
    masterResume,
    agents: {
      preference: {
        read: vi.fn(async () => ({ agentId: 'job-hunter' as const, selectedAt: 1 })),
        write: vi.fn(async (id) => ({ agentId: id, selectedAt: 2 })),
      },
      manifestClient: {
        get: vi.fn(async () => ({ kind: 'not-found' as const })),
      },
    },
    ...overrides,
  };
}

describe('HANDLERS record shape', () => {
  it('ships exactly the BG_HANDLED_KEYS post-101 (no PROFILE_* keys)', () => {
    const handlers = createHandlers(buildDeps());
    const keys = Object.keys(handlers).sort();
    expect(keys).toEqual(
      [
        'AUTH_SIGN_IN',
        'AUTH_SIGN_OUT',
        'AUTH_STATUS',
        'AUTH_STATE_CHANGED',
        'INTENT_DETECTED',
        'INTENT_GET',
        'FILL_REQUEST',
        'KEYWORDS_EXTRACT',
        'HIGHLIGHT_STATUS',
        'GENERATION_START',
        'GENERATION_UPDATE',
        'GENERATION_CANCEL',
        'DETECTED_JOB_BROADCAST',
        'CREDITS_GET',
        'MASTER_RESUME_GET',
        'MASTER_RESUME_PUT',
        'AGENT_PREFERENCE_GET',
        'AGENT_PREFERENCE_SET',
        'AGENT_REGISTRY_LIST',
        'AGENT_MANIFEST_GET',
      ].sort(),
    );
  });
  it('omits HIGHLIGHT_APPLY / HIGHLIGHT_CLEAR (content-script owned)', () => {
    const handlers = createHandlers(buildDeps());
    expect(handlers).not.toHaveProperty('HIGHLIGHT_APPLY');
    expect(handlers).not.toHaveProperty('HIGHLIGHT_CLEAR');
  });
  it('omits PROFILE_* keys (replaced by backend master-resume)', () => {
    const handlers = createHandlers(buildDeps());
    expect(handlers).not.toHaveProperty('PROFILE_GET');
    expect(handlers).not.toHaveProperty('PROFILE_UPDATE');
    expect(handlers).not.toHaveProperty('PROFILE_UPLOAD_JSON_RESUME');
  });
});

describe('AUTH_STATUS', () => {
  it('returns unauthed when no session', async () => {
    const handlers = createHandlers(buildDeps());
    const r = await handlers.AUTH_STATUS({ data: {}, sender: senderStub });
    expect(r).toEqual({ signedIn: false });
  });
  it('returns authed when session present', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => ({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: 999,
      userId: 'u1',
    }));
    const handlers = createHandlers(deps);
    const r = await handlers.AUTH_STATUS({ data: {}, sender: senderStub });
    expect(r).toEqual({ signedIn: true, userId: 'u1' });
  });
});

describe('AUTH_SIGN_OUT', () => {
  it('clears session and broadcasts even when remote call fails', async () => {
    const deps = buildDeps({
      fetch: vi.fn(async () => {
        throw new TypeError('ERR_NETWORK');
      }) as unknown as typeof fetch,
    });
    const handlers = createHandlers(deps);
    const r = await handlers.AUTH_SIGN_OUT({ data: {}, sender: senderStub });
    expect(r).toEqual({ ok: true });
    expect(deps.storage.clearSession).toHaveBeenCalled();
    expect(deps.broadcast.sendRuntime).toHaveBeenCalledWith({
      key: 'AUTH_STATE_CHANGED',
      data: { signedIn: false },
    });
    expect(deps.tabState.clearAll).toHaveBeenCalled();
  });
});

describe('KEYWORDS_EXTRACT', () => {
  it('returns signed-out when no session', async () => {
    const handlers = createHandlers(buildDeps());
    const r = await handlers.KEYWORDS_EXTRACT({
      data: { text: 'we use typescript', url: 'https://job.example/1', topK: 40 },
      sender: senderStub,
    });
    expect(r).toEqual({ ok: false, reason: 'signed-out' });
  });
  it('rejects empty text', async () => {
    const deps = buildDeps();
    deps.storage.readSession = vi.fn(async () => ({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: 999,
      userId: 'u',
    }));
    const handlers = createHandlers(deps);
    const r = await handlers.KEYWORDS_EXTRACT({
      data: { text: '', url: 'https://job.example/1' },
      sender: senderStub,
    });
    expect(r).toEqual({ ok: false, reason: 'empty-text' });
  });
  it('returns rate-limited on 429', async () => {
    const base = buildDeps();
    base.storage.readSession = vi.fn(async () => ({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: 999,
      userId: 'u',
    }));
    const deps: HandlerDeps = {
      ...base,
      fetch: vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch,
    };
    const handlers = createHandlers(deps);
    const r = await handlers.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://job.example/1' },
      sender: senderStub,
    });
    expect(r).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns api-error on backend shape drift', async () => {
    const base = buildDeps();
    base.storage.readSession = vi.fn(async () => ({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: 999,
      userId: 'u',
    }));
    const deps: HandlerDeps = {
      ...base,
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ wrong: 'shape' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as unknown as typeof fetch,
    };
    const handlers = createHandlers(deps);
    const r = await handlers.KEYWORDS_EXTRACT({
      data: { text: 'we use typescript', url: 'https://job.example/1' },
      sender: senderStub,
    });
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });
  it('returns ok on valid backend response', async () => {
    const base = buildDeps();
    base.storage.readSession = vi.fn(async () => ({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: 999,
      userId: 'u',
    }));
    const deps: HandlerDeps = {
      ...base,
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: {
                keywords: [
                  {
                    term: 'typescript',
                    category: 'hard',
                    score: 0.9,
                    occurrences: 3,
                    canonicalForm: 'typescript',
                  },
                ],
                tookMs: 12,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ) as unknown as typeof fetch,
    };
    const handlers = createHandlers(deps);
    const r = await handlers.KEYWORDS_EXTRACT({
      data: { text: 'we use typescript', url: 'https://job.example/1' },
      sender: senderStub,
    });
    expect(r).toMatchObject({ ok: true });
  });
});

describe('INTENT_DETECTED', () => {
  it('substitutes sender.tab.id for -1 sentinel', async () => {
    const deps = buildDeps();
    const handlers = createHandlers(deps);
    await handlers.INTENT_DETECTED({
      data: {
        tabId: -1,
        url: 'https://boards.greenhouse.io/foo/jobs/123',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: Date.now(),
      },
      sender: senderStub,
    });
    expect(deps.tabState.setIntent).toHaveBeenCalledWith(42, expect.any(Object));
  });
  it('drops message when tabId=-1 and no sender.tab.id', async () => {
    const deps = buildDeps();
    const handlers = createHandlers(deps);
    await handlers.INTENT_DETECTED({
      data: {
        tabId: -1,
        url: 'https://boards.greenhouse.io/foo/jobs/123',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: Date.now(),
      },
      sender: {} as chrome.runtime.MessageSender,
    });
    expect(deps.tabState.setIntent).not.toHaveBeenCalled();
  });
});

describe('FILL_REQUEST', () => {
  it('returns content-script-not-loaded when sendToTab yields non-object', async () => {
    const deps = buildDeps();
    deps.broadcast.sendToTab = vi.fn(async () => null);
    const handlers = createHandlers(deps);
    const r = await handlers.FILL_REQUEST({
      data: { tabId: 7, url: 'https://boards.greenhouse.io/x/jobs/1' },
      sender: senderStub,
    });
    expect(r).toMatchObject({ ok: false, aborted: true, abortReason: 'content-script-not-loaded' });
  });
  it('returns content-script-not-loaded when forward throws', async () => {
    const deps = buildDeps();
    deps.broadcast.sendToTab = vi.fn(async () => {
      throw new Error('no listener');
    });
    const handlers = createHandlers(deps);
    const r = await handlers.FILL_REQUEST({
      data: { tabId: 7, url: 'https://boards.greenhouse.io/x/jobs/1' },
      sender: senderStub,
    });
    expect(r).toMatchObject({ ok: false, aborted: true, abortReason: 'content-script-not-loaded' });
  });
  it('forwards resp from content script when shape matches', async () => {
    const deps = buildDeps();
    deps.broadcast.sendToTab = vi.fn(async () => ({
      ok: true,
      planId: 'p1',
      executedAt: new Date().toISOString(),
      filled: [],
      skipped: [],
      failed: [],
      aborted: false,
    }));
    const handlers = createHandlers(deps);
    const r = await handlers.FILL_REQUEST({
      data: { tabId: 7, url: 'https://boards.greenhouse.io/x/jobs/1' },
      sender: senderStub,
    });
    expect(r).toMatchObject({ ok: true });
  });
});

describe('deepMerge', () => {
  it('replaces scalar with patch value', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: 3 })).toEqual({ a: 3, b: 2 });
  });
  it('recurses into nested objects', () => {
    expect(deepMerge({ x: { a: 1, b: 2 } }, { x: { a: 9 } })).toEqual({
      x: { a: 9, b: 2 },
    });
  });
  it('replaces arrays wholesale', () => {
    expect(deepMerge({ arr: [1, 2, 3] }, { arr: [9] })).toEqual({ arr: [9] });
  });
  it('skips __proto__ at nested levels', () => {
    const patch = JSON.parse('{"basics":{"__proto__":{"polluted":true},"phone":"9"}}');
    const out = deepMerge<Record<string, unknown>>({ basics: { phone: '0' } }, patch) as {
      basics: { phone: string; polluted?: unknown };
    };
    expect(out.basics.phone).toBe('9');
    expect(out.basics.polluted).toBeUndefined();
  });
  it('returns base when patch is undefined', () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});
