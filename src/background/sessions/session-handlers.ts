// SPDX-License-Identifier: MIT
/**
 * SESSION_LIST / SESSION_GET handlers. The handlers wrap the
 * session-list-client + cache to serve the popup's "Recent sessions" section
 * with a 30s TTL and a forceRefresh escape hatch used by
 * GENERATION_COMPLETE-driven invalidations.
 *
 * Post-104: cursor-based pagination; `hasMore` and `nextCursor` replace the
 * old `total` count which the cursor backend no longer emits.
 */

import type { Logger } from '../log';
import {
  SessionListRequestSchema,
  SessionGetRequestSchema,
  SessionHydrateGetRequestSchema,
  type SessionListItem,
  type SessionListResult,
  type SessionGetResult,
  type SessionHydrateGetResponse,
} from '../messaging/schemas/session-list.schema';
import type { SessionListClientOutcome } from './session-list-client';
import type { SessionHydrateClientOutcome } from './session-hydrate-client';
import type { CachedSessionList } from './session-list-cache';

export interface SessionHandlerDeps {
  readonly readSession: () => Promise<{ readonly userId: string } | null>;
  readonly client: {
    list: (q: {
      limit?: number;
      cursor?: string;
    }) => Promise<SessionListClientOutcome>;
  };
  readonly hydrateClient: {
    hydrate: (sessionId: string) => Promise<SessionHydrateClientOutcome>;
  };
  readonly cache: {
    read: () => Promise<CachedSessionList | null>;
    write: (entry: {
      items: readonly SessionListItem[];
      hasMore: boolean;
      nextCursor: string | null;
      userId?: string;
    }) => Promise<CachedSessionList>;
    clear: () => Promise<void>;
    isFresh: (entry: CachedSessionList) => boolean;
  };
  readonly now: () => number;
  readonly logger: Logger;
}

function outcomeToReason(
  outcome: Exclude<SessionListClientOutcome, { kind: 'ok' }>,
): { reason: 'signed-out' | 'network-error' | 'api-error' | 'shape-mismatch'; status?: number } {
  switch (outcome.kind) {
    case 'unauthenticated':
      return { reason: 'signed-out' };
    case 'network-error':
      return { reason: 'network-error' };
    case 'shape-mismatch':
      return { reason: 'shape-mismatch' };
    case 'api-error':
      return { reason: 'api-error', status: outcome.status };
  }
}

export function createSessionHandlers(deps: SessionHandlerDeps): {
  SESSION_LIST: (msg: { readonly data: unknown }) => Promise<SessionListResult>;
  SESSION_GET: (msg: { readonly data: unknown }) => Promise<SessionGetResult>;
  SESSION_HYDRATE_GET: (msg: {
    readonly data: unknown;
  }) => Promise<SessionHydrateGetResponse>;
  invalidateCache: () => Promise<void>;
} {
  async function resolveCurrentUserId(): Promise<string | null> {
    try {
      const session = await deps.readSession();
      if (session === null) return null;
      if (typeof session.userId !== 'string' || session.userId.length === 0) {
        return null;
      }
      return session.userId;
    } catch {
      return null;
    }
  }

  function isCacheForUser(entry: CachedSessionList, userId: string): boolean {
    return entry.userId === userId;
  }

  return {
    async SESSION_LIST(msg): Promise<SessionListResult> {
      const parsed = SessionListRequestSchema.safeParse(msg.data ?? {});
      if (!parsed.success) {
        return {
          ok: false,
          reason: 'shape-mismatch',
        };
      }
      const req = parsed.data;
      const currentUserId = await resolveCurrentUserId();
      if (currentUserId === null) {
        return { ok: false, reason: 'signed-out' };
      }

      if (!req.forceRefresh) {
        const cached = await deps.cache.read();
        if (
          cached !== null &&
          isCacheForUser(cached, currentUserId) &&
          deps.cache.isFresh(cached)
        ) {
          return {
            ok: true,
            items: [...cached.items],
            hasMore: cached.hasMore,
            nextCursor: cached.nextCursor,
            fetchedAt: cached.fetchedAt,
            fromCache: true,
          };
        }
      }

      const outcome = await deps.client.list({
        limit: req.limit ?? 5,
        cursor: req.cursor,
      });
      if (outcome.kind === 'ok') {
        const written = await deps.cache.write({
          items: outcome.items,
          hasMore: outcome.hasMore,
          nextCursor: outcome.nextCursor,
          userId: currentUserId,
        });
        return {
          ok: true,
          items: [...written.items],
          hasMore: written.hasMore,
          nextCursor: written.nextCursor,
          fetchedAt: written.fetchedAt,
          fromCache: false,
        };
      }
      return { ok: false, ...outcomeToReason(outcome) };
    },
    async SESSION_GET(msg): Promise<SessionGetResult> {
      const parsed = SessionGetRequestSchema.safeParse(msg.data);
      if (!parsed.success) {
        return { ok: false, reason: 'shape-mismatch' };
      }
      const currentUserId = await resolveCurrentUserId();
      if (currentUserId === null) {
        return { ok: false, reason: 'signed-out' };
      }
      // The popup-side session lookup reads from the cached list because the
      // bg does not yet own a single-session detail endpoint. If the entry is
      // absent we surface a not-found so the caller can open the web
      // dashboard.
      const cached = await deps.cache.read();
      if (cached !== null && isCacheForUser(cached, currentUserId)) {
        const match = cached.items.find((it) => it.sessionId === parsed.data.sessionId);
        if (match) {
          return { ok: true, session: match };
        }
      }
      // Fall back to a fresh list fetch (bounded to 20 items).
      const outcome = await deps.client.list({ limit: 20 });
      if (outcome.kind === 'ok') {
        const match = outcome.items.find((it) => it.sessionId === parsed.data.sessionId);
        await deps.cache.write({
          items: outcome.items,
          hasMore: outcome.hasMore,
          nextCursor: outcome.nextCursor,
          userId: currentUserId,
        });
        if (match) return { ok: true, session: match };
        return { ok: false, reason: 'not-found' };
      }
      return { ok: false, ...outcomeToReason(outcome) };
    },
    async SESSION_HYDRATE_GET(msg): Promise<SessionHydrateGetResponse> {
      const parsed = SessionHydrateGetRequestSchema.safeParse(msg.data);
      if (!parsed.success) {
        return { ok: false, reason: 'shape-mismatch' };
      }
      const outcome = await deps.hydrateClient.hydrate(parsed.data.sessionId);
      switch (outcome.kind) {
        case 'ok':
          return { ok: true, payload: outcome.payload };
        case 'unauthenticated':
          return { ok: false, reason: 'signed-out' };
        case 'not-found':
          return { ok: false, reason: 'not-found' };
        case 'network-error':
          return { ok: false, reason: 'network-error' };
        case 'shape-mismatch':
          return { ok: false, reason: 'shape-mismatch' };
        case 'api-error':
          return { ok: false, reason: 'api-error', status: outcome.status };
      }
    },
    async invalidateCache(): Promise<void> {
      await deps.cache.clear();
    },
  };
}
