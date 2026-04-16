// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createHandlers, type HandlerDeps } from '@/src/background/messaging/handlers';
import type { FetchAuthed } from '@/src/background/auth';
import type { SessionManager } from '@/src/background/session/session-manager';

function silentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function baseDeps(bindings: HandlerDeps['sessions']['bindings']): HandlerDeps {
  return {
    logger: silentLogger(),
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    fetchAuthed: vi.fn(async () => ({ kind: 'unauthenticated' as const })) as unknown as FetchAuthed,
    sessionManager: {
      getSession: vi.fn(async () => null),
    } as unknown as SessionManager,
    now: () => 1_000,
    storage: {
      readSession: vi.fn(async () => null),
      writeSession: vi.fn(async () => undefined),
      clearSession: vi.fn(async () => undefined),
    },
    tabState: {
      getIntent: vi.fn(() => null),
      setIntent: vi.fn(),
      getHighlight: vi.fn(() => ({ on: false, keywordCount: 0, appliedAt: null })),
      clearAll: vi.fn(),
    },
    broadcast: {
      sendRuntime: vi.fn(async () => undefined),
      sendToTab: vi.fn(async () => undefined),
    },
    endpoints: {
      authExchange: 'https://api.test/ex',
      authSignOut: 'https://api.test/out',
      extractSkills: 'https://api.test/sk',
      settingsProfile: 'https://api.test/p',
      generationStart: 'https://api.test/gs',
      generationCancel: 'https://api.test/gc',
    },
    masterResume: {
      client: {
        get: vi.fn(async () => ({ kind: 'not-found' as const })),
        put: vi.fn(async () => ({ kind: 'api-error' as const, status: 500 })),
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
          fetchedAt: 1,
        })),
        clear: vi.fn(async () => undefined),
        isFresh: vi.fn(() => false),
      },
      bindings,
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
        executeScript: vi.fn(async () => []),
      } as unknown as HandlerDeps['genericIntent']['scripting'],
    },
  };
}

function fakeBindingsStore() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (urlKey: string, agentId: string) => {
      const v = store.get(`${urlKey}|${agentId}`);
      return (v ?? null) as ReturnType<HandlerDeps['sessions']['bindings']['get']> extends Promise<infer R> ? R : never;
    }),
    put: vi.fn(async (b) => {
      store.set(`${b.urlKey}|${b.agentId}`, b);
    }),
    evict: vi.fn(async (urlKey: string, agentId: string) => {
      store.delete(`${urlKey}|${agentId}`);
    }),
    list: vi.fn(async () => Array.from(store.values()) as never),
  };
}

const sender = {} as chrome.runtime.MessageSender;

describe('SESSION_BINDING_PUT handler', () => {
  it('canonicalizes url and stores the binding', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_PUT({
      data: {
        url: 'https://example.com/jd?utm_source=li&jobId=77#top',
        agentId: 'job-hunter',
        sessionId: 's1',
        generationId: 'g1',
        pageTitle: 'Engineer',
      },
      sender,
    });
    expect(res).toEqual({ ok: true });
    expect(bindings.put).toHaveBeenCalledTimes(1);
    const stored = (bindings.put.mock.calls[0] as unknown as [{ urlKey: string; pageTitle: string | null }])[0];
    expect(stored.urlKey).toBe('https://example.com/jd?jobId=77');
    expect(stored.pageTitle).toBe('Engineer');
  });

  it('returns ok:false for non-http urls', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_PUT({
      data: {
        url: 'chrome://extensions',
        agentId: 'job-hunter',
        sessionId: 's1',
        generationId: 'g1',
      },
      sender,
    });
    expect(res).toEqual({ ok: false });
    expect(bindings.put).not.toHaveBeenCalled();
  });

  it('rejects shape-invalid payloads', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_PUT({
      data: { url: 'https://a.com/', agentId: 'job-hunter' } as never,
      sender,
    });
    expect(res).toEqual({ ok: false });
    expect(bindings.put).not.toHaveBeenCalled();
  });

  it('preserves existing createdAt across re-puts', async () => {
    let t = 100;
    const bindings = fakeBindingsStore();
    const deps = baseDeps(bindings as never);
    const h = createHandlers({ ...deps, now: () => t });
    await h.SESSION_BINDING_PUT({
      data: {
        url: 'https://example.com/jd',
        agentId: 'job-hunter',
        sessionId: 's1',
        generationId: 'g1',
      },
      sender,
    });
    t = 500;
    // Simulate subsequent put (regeneration): get returns the prior entry.
    bindings.get.mockImplementationOnce(async () => ({
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 100,
      updatedAt: 100,
    }));
    await h.SESSION_BINDING_PUT({
      data: {
        url: 'https://example.com/jd',
        agentId: 'job-hunter',
        sessionId: 's1',
        generationId: 'g2',
      },
      sender,
    });
    expect(bindings.put).toHaveBeenCalledTimes(2);
    const second = bindings.put.mock.calls[1] as unknown as [
      { createdAt: number; updatedAt: number; generationId: string },
    ];
    expect(second[0].createdAt).toBe(100);
    expect(second[0].updatedAt).toBe(500);
    expect(second[0].generationId).toBe('g2');
  });
});

describe('SESSION_BINDING_GET handler', () => {
  it('canonicalizes url and returns the stored binding', async () => {
    const bindings = fakeBindingsStore();
    bindings.get.mockImplementationOnce(async () => ({
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 1,
      updatedAt: 1,
    }));
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_GET({
      data: {
        url: 'https://example.com/jd?utm_source=x#frag',
        agentId: 'job-hunter',
      },
      sender,
    });
    expect(res).not.toBeNull();
    expect(res?.sessionId).toBe('s1');
    expect(bindings.get).toHaveBeenCalledWith(
      'https://example.com/jd',
      'job-hunter',
    );
  });

  it('returns null for non-http urls without hitting the store', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_GET({
      data: { url: 'file:///tmp', agentId: 'job-hunter' },
      sender,
    });
    expect(res).toBeNull();
    expect(bindings.get).not.toHaveBeenCalled();
  });

  it('returns null when the store has no binding', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_GET({
      data: { url: 'https://example.com/none', agentId: 'job-hunter' },
      sender,
    });
    expect(res).toBeNull();
  });

  it('returns null on invalid payload', async () => {
    const bindings = fakeBindingsStore();
    const h = createHandlers(baseDeps(bindings as never));
    const res = await h.SESSION_BINDING_GET({
      data: { url: '', agentId: 'job-hunter' } as never,
      sender,
    });
    expect(res).toBeNull();
  });
});
