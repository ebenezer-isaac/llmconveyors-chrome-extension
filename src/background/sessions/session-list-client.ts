// SPDX-License-Identifier: MIT
/**
 * Session list client. Wraps GET /api/v1/sessions (cursor-paginated) into a
 * bg-friendly discriminated union.
 *
 * Wire contract (see api/src/modules/sessions/sessions.controller.ts):
 *   GET /api/v1/sessions?limit=N&cursor=ISO-8601
 *   -> global envelope: { success, data: { sessions, pagination } }
 *
 * The bare `sessions[]` items carry `metadata.{agentType,companyName,jobTitle}`;
 * this client normalizes them via `normalizeBackendSession` into the flat
 * `SessionListItem` shape the popup consumes. Entries with unknown agent
 * types or invalid timestamps are dropped.
 *
 * Authentication, proactive refresh, and silent 401 retry are delegated to
 * the shared `fetchAuthed` helper. This client never touches access tokens
 * directly.
 */

import type { Logger } from '../log';
import type { FetchAuthed } from '../auth';
import {
  SessionListResponseSchema,
  normalizeBackendSession,
  type SessionListItem,
} from '../messaging/schemas/session-list.schema';

export type SessionListClientOutcome =
  | {
      readonly kind: 'ok';
      readonly items: readonly SessionListItem[];
      readonly hasMore: boolean;
      readonly nextCursor: string | null;
    }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'shape-mismatch' }
  | { readonly kind: 'api-error'; readonly status: number };

export interface SessionListClientDeps {
  readonly fetchAuthed: FetchAuthed;
  readonly logger: Logger;
  readonly baseUrl: string;
}

export interface SessionListQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

function buildQueryString(q: SessionListQuery): string {
  const params = new URLSearchParams();
  if (typeof q.limit === 'number') params.set('limit', String(q.limit));
  if (typeof q.cursor === 'string' && q.cursor.length > 0) {
    params.set('cursor', q.cursor);
  }
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}

export function createSessionListClient(
  deps: SessionListClientDeps,
): { list: (q: SessionListQuery) => Promise<SessionListClientOutcome> } {
  return {
    async list(q: SessionListQuery): Promise<SessionListClientOutcome> {
      const url = `${deps.baseUrl}${buildQueryString(q)}`;
      const result = await deps.fetchAuthed(url, { method: 'GET' });
      if (result.kind === 'unauthenticated') return { kind: 'unauthenticated' };
      if (result.kind === 'network-error') {
        deps.logger.warn('session-list: network', {
          error: result.error.message,
        });
        return { kind: 'network-error' };
      }
      const res = result.response;
      if (!res.ok) return { kind: 'api-error', status: res.status };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { kind: 'shape-mismatch' };
      }
      // Peel the global `{ success, data }` envelope if present; otherwise
      // accept the bare shape (test fixtures commonly skip the envelope).
      if (body === null || typeof body !== 'object') return { kind: 'shape-mismatch' };
      const asRecord = body as Record<string, unknown>;
      const payload = (asRecord.data as Record<string, unknown> | undefined) ?? asRecord;
      const parsed = SessionListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        deps.logger.warn('session-list: envelope drift', {
          issues: parsed.error.issues.length,
        });
        return { kind: 'shape-mismatch' };
      }
      const items: SessionListItem[] = [];
      for (const raw of parsed.data.sessions) {
        const item = normalizeBackendSession(raw);
        if (item !== null) items.push(item);
      }
      return {
        kind: 'ok',
        items,
        hasMore: parsed.data.pagination.hasMore,
        nextCursor: parsed.data.pagination.nextCursor,
      };
    },
  };
}
