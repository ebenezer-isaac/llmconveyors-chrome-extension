// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  createSessionBindingStore,
  SESSION_BINDING_LRU_CAP,
  SESSION_BINDING_STORAGE_KEY,
  SESSION_BINDING_TTL_MS,
  type SessionBinding,
  type SessionBindingStorageFacade,
} from '@/src/background/sessions/session-binding-store';

function fakeStorage(initial: Record<string, unknown> = {}): {
  facade: SessionBindingStorageFacade;
  data: Record<string, unknown>;
  getSpy: ReturnType<typeof vi.fn>;
  setSpy: ReturnType<typeof vi.fn>;
} {
  const data = { ...initial };
  const getSpy = vi.fn(async (key: string) => {
    return { [key]: data[key] };
  });
  const setSpy = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(data, items);
  });
  return {
    facade: { get: getSpy, set: setSpy },
    data,
    getSpy,
    setSpy,
  };
}

function silentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeBinding(overrides: Partial<SessionBinding> = {}): SessionBinding {
  return {
    sessionId: 's1',
    generationId: 'g1',
    agentId: 'job-hunter',
    urlKey: 'https://example.com/jd',
    pageTitle: 'Senior Engineer',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('session-binding-store', () => {
  it('round-trips a binding through put -> get', async () => {
    const { facade } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 500,
    });
    const b = makeBinding();
    await store.put(b);
    const loaded = await store.get(b.urlKey, 'job-hunter');
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe('s1');
    expect(loaded?.agentId).toBe('job-hunter');
  });

  it('returns null when no binding exists', async () => {
    const { facade } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 500,
    });
    expect(await store.get('https://example.com/missing', 'job-hunter')).toBeNull();
  });

  it('keeps same-URL + different-agent bindings isolated', async () => {
    const { facade } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 100,
    });
    const url = 'https://example.com/page';
    await store.put(makeBinding({ urlKey: url, agentId: 'job-hunter', sessionId: 'jh' }));
    await store.put(makeBinding({ urlKey: url, agentId: 'b2b-sales', sessionId: 'b2b' }));
    const jh = await store.get(url, 'job-hunter');
    const b2b = await store.get(url, 'b2b-sales');
    expect(jh?.sessionId).toBe('jh');
    expect(b2b?.sessionId).toBe('b2b');
  });

  it('evicts stale entries on read when older than TTL', async () => {
    const olderThanTtl = 1000;
    const referenceNow = olderThanTtl + SESSION_BINDING_TTL_MS + 1;
    const { facade, data } = fakeStorage({
      [SESSION_BINDING_STORAGE_KEY]: {
        [`https://example.com/stale|job-hunter`]: {
          ...makeBinding(),
          urlKey: 'https://example.com/stale',
          updatedAt: olderThanTtl,
          createdAt: olderThanTtl,
        },
      },
    });
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => referenceNow,
    });
    const loaded = await store.get('https://example.com/stale', 'job-hunter');
    expect(loaded).toBeNull();
    // Pruned record was saved back.
    const record = data[SESSION_BINDING_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(record).length).toBe(0);
  });

  it('enforces LRU cap and evicts oldest by updatedAt', async () => {
    const { facade, data } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 1,
    });
    // Fill up to cap with ascending updatedAt so the first is oldest.
    for (let i = 0; i < SESSION_BINDING_LRU_CAP; i += 1) {
      await store.put(
        makeBinding({
          urlKey: `https://example.com/page-${i}`,
          sessionId: `s${i}`,
          updatedAt: 100 + i,
          createdAt: 100 + i,
        }),
      );
    }
    // The (cap+1)th entry should evict the oldest (updatedAt=100).
    await store.put(
      makeBinding({
        urlKey: `https://example.com/page-new`,
        sessionId: 'sNew',
        updatedAt: 999_999,
        createdAt: 999_999,
      }),
    );
    const record = data[SESSION_BINDING_STORAGE_KEY] as Record<string, SessionBinding>;
    expect(Object.keys(record).length).toBe(SESSION_BINDING_LRU_CAP);
    // Oldest is gone, newest is present.
    expect(record['https://example.com/page-0|job-hunter']).toBeUndefined();
    expect(record['https://example.com/page-new|job-hunter']).toBeDefined();
  });

  it('list returns only non-stale bindings', async () => {
    const olderThanTtl = 1000;
    const referenceNow = olderThanTtl + SESSION_BINDING_TTL_MS + 1;
    const { facade } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => olderThanTtl,
    });
    await store.put(makeBinding({ urlKey: 'https://a.com/', updatedAt: olderThanTtl, createdAt: olderThanTtl }));
    const store2 = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => referenceNow,
    });
    const list = await store2.list();
    expect(list).toHaveLength(0);
  });

  it('evict removes a single binding by urlKey + agentId', async () => {
    const { facade, data } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 1,
    });
    await store.put(makeBinding({ urlKey: 'https://a.com/1' }));
    await store.put(makeBinding({ urlKey: 'https://a.com/2' }));
    await store.evict('https://a.com/1', 'job-hunter');
    const record = data[SESSION_BINDING_STORAGE_KEY] as Record<string, unknown>;
    expect(record['https://a.com/1|job-hunter']).toBeUndefined();
    expect(record['https://a.com/2|job-hunter']).toBeDefined();
  });

  it('returns null when chrome.storage.local is missing', async () => {
    const store = createSessionBindingStore({
      storage: null,
      logger: silentLogger(),
      now: () => 1,
    });
    expect(await store.get('https://a.com/', 'job-hunter')).toBeNull();
    // Put is a no-op without storage; should not throw.
    await expect(store.put(makeBinding())).resolves.toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('silently drops records with invalid shape on read', async () => {
    const { facade } = fakeStorage({
      [SESSION_BINDING_STORAGE_KEY]: {
        'corrupt|job-hunter': { sessionId: 'x' }, // missing required fields
        'good|job-hunter': makeBinding({ urlKey: 'good' }),
      },
    });
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 1,
    });
    const good = await store.get('good', 'job-hunter');
    expect(good?.sessionId).toBe('s1');
    const list = await store.list();
    expect(list).toHaveLength(1);
  });

  it('rejects unknown agent ids', async () => {
    const { facade } = fakeStorage();
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => 1,
    });
    // @ts-expect-error deliberately invalid agent id
    await store.put({ ...makeBinding(), agentId: 'phantom' });
    const list = await store.list();
    expect(list).toHaveLength(0);
  });

  it('updates updatedAt on subsequent puts but preserves createdAt', async () => {
    const { facade } = fakeStorage();
    let t = 100;
    const store = createSessionBindingStore({
      storage: facade,
      logger: silentLogger(),
      now: () => t,
    });
    await store.put(makeBinding({ updatedAt: 100, createdAt: 100 }));
    t = 500;
    // Simulate bg handler-style update: preserves createdAt, bumps updatedAt.
    await store.put(
      makeBinding({ updatedAt: 500, createdAt: 100, generationId: 'g2' }),
    );
    const loaded = await store.get('https://example.com/jd', 'job-hunter');
    expect(loaded?.createdAt).toBe(100);
    expect(loaded?.updatedAt).toBe(500);
    expect(loaded?.generationId).toBe('g2');
  });
});
