// SPDX-License-Identifier: MIT
/**
 * Session list client. Wraps GET /api/v1/sessions into a bg-friendly
 * discriminated union.
 *
 * The backend envelope is `{ success: true, data: { items, total, page?, limit? } }`;
 * this client normalizes the `data.*` fields and propagates auth / network
 * failures as typed outcomes so the handler can react without throwing.
 */

import type { Logger } from '../log';
import {
  SessionListResponseSchema,
  type SessionListItem,
} from '../messaging/schemas/session-list.schema';

export type SessionListClientOutcome =
  | {
      readonly kind: 'ok';
      readonly items: readonly SessionListItem[];
      readonly total: number;
    }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'shape-mismatch' }
  | { readonly kind: 'api-error'; readonly status: number };

export interface SessionListClientDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly logger: Logger;
  readonly baseUrl: string;
  readonly accessToken: () => Promise<string | null>;
}

export interface SessionListQuery {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: 'active' | 'completed' | 'failed' | 'awaiting_input' | 'cancelled';
}

function buildQueryString(q: SessionListQuery): string {
  const params = new URLSearchParams();
  if (typeof q.limit === 'number') params.set('limit', String(q.limit));
  if (typeof q.offset === 'number') params.set('offset', String(q.offset));
  if (typeof q.status === 'string') params.set('status', q.status);
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}

export function createSessionListClient(
  deps: SessionListClientDeps,
): { list: (q: SessionListQuery) => Promise<SessionListClientOutcome> } {
  return {
    async list(q: SessionListQuery): Promise<SessionListClientOutcome> {
      const token = await deps.accessToken();
      if (token === null || token.length === 0) return { kind: 'unauthenticated' };
      const url = `${deps.baseUrl}${buildQueryString(q)}`;
      let res: Response;
      try {
        res = await deps.fetch(url, {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
        });
      } catch (err: unknown) {
        deps.logger.warn('session-list: network', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { kind: 'network-error' };
      }
      if (res.status === 401 || res.status === 403) return { kind: 'unauthenticated' };
      if (!res.ok) return { kind: 'api-error', status: res.status };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { kind: 'shape-mismatch' };
      }
      const parsed = SessionListResponseSchema.safeParse(body);
      if (!parsed.success) {
        deps.logger.warn('session-list: envelope drift', {
          issues: parsed.error.issues.length,
        });
        return { kind: 'shape-mismatch' };
      }
      return {
        kind: 'ok',
        items: parsed.data.data.items,
        total: parsed.data.data.total,
      };
    },
  };
}
