// SPDX-License-Identifier: MIT
/**
 * chrome.storage.local cache for the backend master-resume.
 *
 * Stores the raw backend response plus a fetch timestamp; entries older than
 * TTL_MS are ignored. The cache is only consulted as a speed / offline hint;
 * callers must always be able to operate if `read()` returns null.
 */

import type { Logger } from '../log';
import type { MasterResumeResponse } from './master-resume-schema';
import { MasterResumeResponseSchema } from './master-resume-schema';

export const MASTER_RESUME_CACHE_KEY = 'llmc.master-resume.v1';
// Resume changes are infrequent; keep it warm longer to avoid repeated
// background fetches every popup/sidepanel open.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MasterResumeCacheEntry {
  readonly response: MasterResumeResponse;
  readonly fetchedAt: number;
}

export interface ChromeStorageLocal {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface MasterResumeCacheDeps {
  readonly storage: ChromeStorageLocal;
  readonly logger: Logger;
  readonly now: () => number;
}

export function createMasterResumeCache(deps: MasterResumeCacheDeps): {
  read: () => Promise<MasterResumeCacheEntry | null>;
  write: (response: MasterResumeResponse) => Promise<void>;
  clear: () => Promise<void>;
  readStale: () => Promise<MasterResumeCacheEntry | null>;
} {
  async function readRaw(): Promise<MasterResumeCacheEntry | null> {
    let raw: Record<string, unknown>;
    try {
      raw = await deps.storage.get(MASTER_RESUME_CACHE_KEY);
    } catch (err: unknown) {
      deps.logger.warn('master-resume cache: storage.get threw', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    const value = raw[MASTER_RESUME_CACHE_KEY];
    if (value === undefined || value === null || typeof value !== 'object') {
      return null;
    }
    const entry = value as Record<string, unknown>;
    const fetchedAt = typeof entry.fetchedAt === 'number' ? entry.fetchedAt : 0;
    const parsed = MasterResumeResponseSchema.safeParse(entry.response);
    if (!parsed.success) {
      deps.logger.warn('master-resume cache: discarding malformed entry', {
        issues: parsed.error.issues.length,
      });
      return null;
    }
    return { response: parsed.data, fetchedAt };
  }

  return {
    async read(): Promise<MasterResumeCacheEntry | null> {
      const entry = await readRaw();
      if (entry === null) return null;
      const age = deps.now() - entry.fetchedAt;
      if (age < 0 || age > TTL_MS) return null;
      return entry;
    },
    async readStale(): Promise<MasterResumeCacheEntry | null> {
      return readRaw();
    },
    async write(response: MasterResumeResponse): Promise<void> {
      const entry: MasterResumeCacheEntry = { response, fetchedAt: deps.now() };
      try {
        await deps.storage.set({ [MASTER_RESUME_CACHE_KEY]: entry });
      } catch (err: unknown) {
        deps.logger.warn('master-resume cache: storage.set threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    async clear(): Promise<void> {
      try {
        await deps.storage.remove(MASTER_RESUME_CACHE_KEY);
      } catch (err: unknown) {
        deps.logger.warn('master-resume cache: storage.remove threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
