// SPDX-License-Identifier: MIT
/**
 * SESSION_LIST / SESSION_GET handlers. The handlers wrap the
 * session-list-client + cache to serve the popup's "Recent sessions" section
 * with a 30s TTL and a forceRefresh escape hatch used by
 * GENERATION_COMPLETE-driven invalidations.
 */

import type { Logger } from '../log';
import {
  SessionListRequestSchema,
  SessionGetRequestSchema,
  type SessionListItem,
  type SessionListResult,
  type SessionGetResult,
} from '../messaging/schemas/session-list.schema';
import type { SessionListClientOutcome } from './session-list-client';
import type { CachedSessionList } from './session-list-cache';

export interface SessionHandlerDeps {
  readonly client: {
    list: (q: {
      limit?: number;
      offset?: number;
      status?: 'active' | 'completed' | 'failed' | 'awaiting_input' | 'cancelled';
    }) => Promise<SessionListClientOutcome>;
  };
  readonly cache: {
    read: () => Promise<CachedSessionList | null>;
    write: (entry: {
      items: readonly SessionListItem[];
      total: number;
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
  invalidateCache: () => Promise<void>;
} {
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

      if (!req.forceRefresh) {
        const cached = await deps.cache.read();
        if (cached !== null && deps.cache.isFresh(cached)) {
          return {
            ok: true,
            items: [...cached.items],
            total: cached.total,
            fetchedAt: cached.fetchedAt,
            fromCache: true,
          };
        }
      }

      const outcome = await deps.client.list({
        limit: req.limit ?? 5,
        offset: req.offset,
        status: req.status,
      });
      if (outcome.kind === 'ok') {
        const written = await deps.cache.write({
          items: outcome.items,
          total: outcome.total,
        });
        return {
          ok: true,
          items: [...written.items],
          total: written.total,
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
      // The popup-side session lookup reads from the cached list because the
      // bg does not yet own a single-session detail endpoint. If the entry is
      // absent we surface a not-found so the caller can open the web
      // dashboard.
      const cached = await deps.cache.read();
      if (cached !== null) {
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
          total: outcome.total,
        });
        if (match) return { ok: true, session: match };
        return { ok: false, reason: 'not-found' };
      }
      return { ok: false, ...outcomeToReason(outcome) };
    },
    async invalidateCache(): Promise<void> {
      await deps.cache.clear();
    },
  };
}
