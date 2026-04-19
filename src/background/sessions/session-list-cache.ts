// SPDX-License-Identifier: MIT
/**
 * Session list cache. Stores the latest successful list response under
 * `llmc.session-list-cache.v1` in chrome.storage.local and serves it for up
 * to SESSION_LIST_CACHE_TTL_MS.
 *
 * Invalidation: explicit `clear()` call from the GENERATION_COMPLETE broadcast
 * handler, or when the cache's writeAt falls outside the TTL window.
 *
 * The backend now returns cursor-based pagination; we persist `hasMore` and
 * `nextCursor` instead of the old `total` so the "View all" link can hide
 * when the list is exhausted.
 */

import type { Logger } from '../log';
import { SESSION_LIST_CACHE_TTL_MS, STORAGE_KEYS } from '../config';
import type { SessionListItem } from '../messaging/schemas/session-list.schema';

export interface CachedSessionList {
  readonly items: readonly SessionListItem[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly userId?: string | null;
  readonly fetchedAt: number;
}

export interface SessionListCacheDeps {
  readonly storage: {
    get: (key: string) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  readonly logger: Logger;
  readonly now: () => number;
}

export function createSessionListCache(deps: SessionListCacheDeps): {
  read: () => Promise<CachedSessionList | null>;
  write: (entry: {
    readonly items: readonly SessionListItem[];
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
    readonly userId?: string;
  }) => Promise<CachedSessionList>;
  clear: () => Promise<void>;
  isFresh: (entry: CachedSessionList) => boolean;
} {
  const KEY = STORAGE_KEYS.sessionListCache;
  return {
    async read(): Promise<CachedSessionList | null> {
      try {
        const raw = await deps.storage.get(KEY);
        const entry = raw[KEY];
        if (typeof entry !== 'object' || entry === null) return null;
        const obj = entry as Record<string, unknown>;
        const fetchedAt = typeof obj.fetchedAt === 'number' ? obj.fetchedAt : 0;
        const hasMore = obj.hasMore === true;
        const nextCursor =
          typeof obj.nextCursor === 'string' ? obj.nextCursor : null;
        const userId =
          typeof obj.userId === 'string' && obj.userId.length > 0
            ? obj.userId
            : null;
        const items = Array.isArray(obj.items) ? (obj.items as SessionListItem[]) : [];
        if (fetchedAt === 0) return null;
        return { items, hasMore, nextCursor, userId, fetchedAt };
      } catch (err: unknown) {
        deps.logger.warn('session-list-cache: read failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    async write(entry): Promise<CachedSessionList> {
      const userId =
        typeof entry.userId === 'string' && entry.userId.length > 0
          ? entry.userId
          : null;
      const payload: CachedSessionList = {
        items: entry.items,
        hasMore: entry.hasMore,
        nextCursor: entry.nextCursor,
        userId,
        fetchedAt: deps.now(),
      };
      try {
        await deps.storage.set({ [KEY]: payload });
      } catch (err: unknown) {
        deps.logger.warn('session-list-cache: write failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return payload;
    },
    async clear(): Promise<void> {
      try {
        await deps.storage.remove(KEY);
      } catch (err: unknown) {
        deps.logger.warn('session-list-cache: clear failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    isFresh(entry: CachedSessionList): boolean {
      return deps.now() - entry.fetchedAt < SESSION_LIST_CACHE_TTL_MS;
    },
  };
}
