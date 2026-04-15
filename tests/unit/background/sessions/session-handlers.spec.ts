// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createSessionHandlers } from '../../../../src/background/sessions/session-handlers';
import type { SessionListItem } from '../../../../src/background/messaging/schemas/session-list.schema';

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function item(id: string, extra: Partial<SessionListItem> = {}): SessionListItem {
  return {
    sessionId: id,
    agentType: 'job-hunter',
    status: 'completed',
    createdAt: 100,
    updatedAt: 200,
    ...extra,
  };
}

describe('SESSION_LIST handler', () => {
  it('returns cached items when the cache is fresh', async () => {
    const cached = {
      items: [item('s1')],
      hasMore: false,
      nextCursor: null,
      fetchedAt: 100,
    };
    const cache = {
      read: vi.fn(async () => cached),
      write: vi.fn(async () => cached),
      clear: vi.fn(),
      isFresh: vi.fn(() => true),
    };
    const client = { list: vi.fn(async () => ({ kind: 'unauthenticated' as const })) };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 150,
      logger: logger(),
    });
    const r = await h.SESSION_LIST({ data: {} });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fromCache).toBe(true);
      expect(r.items).toHaveLength(1);
      expect(r.hasMore).toBe(false);
      expect(r.nextCursor).toBeNull();
    }
    expect(client.list).not.toHaveBeenCalled();
  });

  it('forces refresh when forceRefresh=true even with fresh cache', async () => {
    const cached = {
      items: [item('s1')],
      hasMore: false,
      nextCursor: null,
      fetchedAt: 100,
    };
    const fresh = [item('s2')];
    const cache = {
      read: vi.fn(async () => cached),
      write: vi.fn(async () => ({
        items: fresh,
        hasMore: true,
        nextCursor: '2026-04-15T00:00:00.000Z',
        fetchedAt: 200,
      })),
      clear: vi.fn(),
      isFresh: vi.fn(() => true),
    };
    const client = {
      list: vi.fn(async () => ({
        kind: 'ok' as const,
        items: fresh,
        hasMore: true,
        nextCursor: '2026-04-15T00:00:00.000Z',
      })),
    };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 200,
      logger: logger(),
    });
    const r = await h.SESSION_LIST({ data: { forceRefresh: true } });
    expect(client.list).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items[0]?.sessionId).toBe('s2');
      expect(r.fromCache).toBe(false);
      expect(r.hasMore).toBe(true);
      expect(r.nextCursor).toBe('2026-04-15T00:00:00.000Z');
    }
  });

  it('returns signed-out when backend says unauthenticated', async () => {
    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      clear: vi.fn(),
      isFresh: vi.fn(() => false),
    };
    const client = { list: vi.fn(async () => ({ kind: 'unauthenticated' as const })) };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 100,
      logger: logger(),
    });
    const r = await h.SESSION_LIST({ data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signed-out');
  });

  it('rejects payloads that violate the schema', async () => {
    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      clear: vi.fn(),
      isFresh: vi.fn(() => false),
    };
    const client = { list: vi.fn() };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 0,
      logger: logger(),
    });
    // negative limit rejected by schema
    const r = await h.SESSION_LIST({ data: { limit: -1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('shape-mismatch');
  });

  it('forwards cursor query parameter to the client', async () => {
    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(async (entry: {
        items: readonly SessionListItem[];
        hasMore: boolean;
        nextCursor: string | null;
      }) => ({ ...entry, fetchedAt: 0 })),
      clear: vi.fn(),
      isFresh: vi.fn(() => false),
    };
    const client = {
      list: vi.fn(async () => ({
        kind: 'ok' as const,
        items: [],
        hasMore: false,
        nextCursor: null,
      })),
    };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 0,
      logger: logger(),
    });
    await h.SESSION_LIST({
      data: { limit: 10, cursor: '2026-04-01T00:00:00.000Z' },
    });
    expect(client.list).toHaveBeenCalledWith({
      limit: 10,
      cursor: '2026-04-01T00:00:00.000Z',
    });
  });
});

describe('SESSION_GET handler', () => {
  it('returns from cache when sessionId matches', async () => {
    const cached = {
      items: [item('s1')],
      hasMore: false,
      nextCursor: null,
      fetchedAt: 0,
    };
    const cache = {
      read: vi.fn(async () => cached),
      write: vi.fn(),
      clear: vi.fn(),
      isFresh: vi.fn(() => true),
    };
    const client = { list: vi.fn() };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 0,
      logger: logger(),
    });
    const r = await h.SESSION_GET({ data: { sessionId: 's1' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.sessionId).toBe('s1');
    expect(client.list).not.toHaveBeenCalled();
  });

  it('falls back to list when cache missing, returns not-found when absent', async () => {
    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => ({
        items: [item('other')],
        hasMore: false,
        nextCursor: null,
        fetchedAt: 1,
      })),
      clear: vi.fn(),
      isFresh: vi.fn(() => false),
    };
    const client = {
      list: vi.fn(async () => ({
        kind: 'ok' as const,
        items: [item('other')],
        hasMore: false,
        nextCursor: null,
      })),
    };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 0,
      logger: logger(),
    });
    const r = await h.SESSION_GET({ data: { sessionId: 's1' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-found');
  });
});

describe('invalidateCache', () => {
  it('calls cache.clear', async () => {
    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      clear: vi.fn(async () => undefined),
      isFresh: vi.fn(() => false),
    };
    const client = { list: vi.fn() };
    const h = createSessionHandlers({
      client,
      cache,
      now: () => 0,
      logger: logger(),
    });
    await h.invalidateCache();
    expect(cache.clear).toHaveBeenCalledOnce();
  });
});
