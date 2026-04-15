// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  createMasterResumeCache,
  MASTER_RESUME_CACHE_KEY,
} from '@/src/background/master-resume';
import type { Logger } from '@/src/background/log';

function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const RESPONSE = {
  userId: 'u1',
  label: 'Master',
  rawText: 'text',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeStore(): {
  storage: {
    get: (k: string) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (k: string) => Promise<void>;
  };
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {};
  return {
    data,
    storage: {
      get: async (k: string) => (k in data ? { [k]: data[k] } : {}),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) data[k] = v;
      },
      remove: async (k: string) => {
        delete data[k];
      },
    },
  };
}

describe('master-resume cache', () => {
  it('round-trips a fresh response', async () => {
    const { storage, data } = makeStore();
    let t = 1_000;
    const cache = createMasterResumeCache({ storage, logger: makeLogger(), now: () => t });
    await cache.write(RESPONSE);
    expect(data[MASTER_RESUME_CACHE_KEY]).toBeDefined();
    const read = await cache.read();
    expect(read?.response).toEqual(RESPONSE);
  });

  it('returns null when entry exceeds TTL', async () => {
    const { storage } = makeStore();
    let t = 1_000;
    const cache = createMasterResumeCache({ storage, logger: makeLogger(), now: () => t });
    await cache.write(RESPONSE);
    t = 1_000 + 10 * 60 * 1000; // 10 minutes
    const read = await cache.read();
    expect(read).toBeNull();
  });

  it('readStale returns the entry even after TTL', async () => {
    const { storage } = makeStore();
    let t = 1_000;
    const cache = createMasterResumeCache({ storage, logger: makeLogger(), now: () => t });
    await cache.write(RESPONSE);
    t = 1_000 + 10 * 60 * 1000;
    const stale = await cache.readStale();
    expect(stale?.response).toEqual(RESPONSE);
  });

  it('clear removes the cache entry', async () => {
    const { storage, data } = makeStore();
    const cache = createMasterResumeCache({
      storage,
      logger: makeLogger(),
      now: () => 1,
    });
    await cache.write(RESPONSE);
    await cache.clear();
    expect(data[MASTER_RESUME_CACHE_KEY]).toBeUndefined();
  });

  it('discards malformed entries', async () => {
    const { storage, data } = makeStore();
    data[MASTER_RESUME_CACHE_KEY] = { fetchedAt: 1, response: { wrong: 'shape' } };
    const cache = createMasterResumeCache({
      storage,
      logger: makeLogger(),
      now: () => 1,
    });
    expect(await cache.read()).toBeNull();
  });
});
