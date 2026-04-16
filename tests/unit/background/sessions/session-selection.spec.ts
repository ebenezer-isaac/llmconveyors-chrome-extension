// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readSelectedSession,
  writeSelectedSession,
  clearSelectedSession,
  SELECTED_SESSION_STORAGE_KEY,
} from '@/src/background/sessions/session-selection';

type FakeStorage = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
type FakeRuntime = { sendMessage: ReturnType<typeof vi.fn> };

function mountChrome(initial: Record<string, unknown> = {}): {
  storage: FakeStorage;
  runtime: FakeRuntime;
  store: Record<string, unknown>;
} {
  const store: Record<string, unknown> = { ...initial };
  const storage: FakeStorage = {
    get: vi.fn(async (keys: string[]) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in store) out[k] = store[k];
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    }),
  };
  const runtime: FakeRuntime = { sendMessage: vi.fn(async () => undefined) };
  (globalThis as unknown as {
    chrome: { storage: { local: FakeStorage }; runtime: FakeRuntime };
  }).chrome = { storage: { local: storage }, runtime };
  return { storage, runtime, store };
}

function unmountChrome(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('session-selection', () => {
  beforeEach(unmountChrome);

  describe('writeSelectedSession', () => {
    it('persists entry under the storage key AND broadcasts SESSION_SELECTED', async () => {
      const { storage, runtime, store } = mountChrome();
      await writeSelectedSession(
        { sessionId: 'sess-1', agentId: 'job-hunter', tabUrl: 'https://metacareers.com/x' },
        () => 1_000,
      );
      expect(storage.set).toHaveBeenCalledTimes(1);
      expect(store[SELECTED_SESSION_STORAGE_KEY]).toEqual({
        sessionId: 'sess-1',
        agentId: 'job-hunter',
        tabUrl: 'https://metacareers.com/x',
        selectedAt: 1_000,
      });
      expect(runtime.sendMessage).toHaveBeenCalledWith({
        key: 'SESSION_SELECTED',
        data: {
          sessionId: 'sess-1',
          agentId: 'job-hunter',
          tabUrl: 'https://metacareers.com/x',
        },
      });
    });

    it('omits tabUrl from the broadcast when not supplied', async () => {
      const { runtime } = mountChrome();
      await writeSelectedSession({ sessionId: 's', agentId: 'b2b-sales' });
      const call = runtime.sendMessage.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ sessionId: 's', agentId: 'b2b-sales' });
    });

    it('still broadcasts when storage.set rejects', async () => {
      const { storage, runtime } = mountChrome();
      storage.set.mockRejectedValueOnce(new Error('disk full'));
      await writeSelectedSession({ sessionId: 's', agentId: 'job-hunter' });
      expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('readSelectedSession', () => {
    it('returns the entry when present and fresh', async () => {
      mountChrome({
        [SELECTED_SESSION_STORAGE_KEY]: {
          sessionId: 'sess-1',
          agentId: 'job-hunter',
          selectedAt: 5_000,
        },
      });
      const entry = await readSelectedSession(() => 10_000);
      expect(entry?.sessionId).toBe('sess-1');
      expect(entry?.agentId).toBe('job-hunter');
    });

    it('returns null when the entry is older than 10 minutes and removes it', async () => {
      const { store, storage } = mountChrome({
        [SELECTED_SESSION_STORAGE_KEY]: {
          sessionId: 'sess-1',
          agentId: 'job-hunter',
          selectedAt: 1_000,
        },
      });
      const entry = await readSelectedSession(() => 1_000 + 11 * 60 * 1000);
      expect(entry).toBeNull();
      expect(storage.remove).toHaveBeenCalledWith([SELECTED_SESSION_STORAGE_KEY]);
      expect(store[SELECTED_SESSION_STORAGE_KEY]).toBeUndefined();
    });

    it('returns null for missing storage', async () => {
      const entry = await readSelectedSession();
      expect(entry).toBeNull();
    });

    it('returns null for shape-invalid entries', async () => {
      mountChrome({
        [SELECTED_SESSION_STORAGE_KEY]: {
          sessionId: 'sess-1',
          agentId: 'not-an-agent',
          selectedAt: 1,
        },
      });
      const entry = await readSelectedSession(() => 2);
      expect(entry).toBeNull();
    });
  });

  describe('clearSelectedSession', () => {
    it('removes the entry from storage', async () => {
      const { storage, store } = mountChrome({
        [SELECTED_SESSION_STORAGE_KEY]: {
          sessionId: 'x',
          agentId: 'job-hunter',
          selectedAt: 1,
        },
      });
      await clearSelectedSession();
      expect(storage.remove).toHaveBeenCalledWith([SELECTED_SESSION_STORAGE_KEY]);
      expect(store[SELECTED_SESSION_STORAGE_KEY]).toBeUndefined();
    });

    it('is a no-op when storage is unavailable', async () => {
      await expect(clearSelectedSession()).resolves.toBeUndefined();
    });
  });
});
