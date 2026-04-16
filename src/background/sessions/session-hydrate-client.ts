// SPDX-License-Identifier: MIT
/**
 * Session hydrate client. Wraps GET /api/v1/sessions/:id/hydrate.
 *
 * The sidepanel previously called this endpoint directly from a React
 * component, which bypassed the SessionManager's proactive refresh and
 * silent 401 retry. Routing the request through the background ensures
 * every bearer-authenticated call shares the same auth recovery logic.
 */

import type { Logger } from '../log';
import type { FetchAuthed } from '../auth';
import {
  HydratePayloadSchema,
  type HydratePayload,
} from '../messaging/schemas/session-list.schema';
import { z } from 'zod';

export type SessionHydrateClientOutcome =
  | { readonly kind: 'ok'; readonly payload: HydratePayload }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'api-error'; readonly status: number }
  | { readonly kind: 'shape-mismatch' };

export interface SessionHydrateClientDeps {
  readonly fetchAuthed: FetchAuthed;
  readonly logger: Logger;
  readonly buildUrl: (sessionId: string) => string;
}

const HydrateEnvelopeSchema = z
  .object({
    success: z.boolean().optional(),
    data: HydratePayloadSchema.optional(),
  })
  .passthrough();

export function createSessionHydrateClient(deps: SessionHydrateClientDeps): {
  hydrate: (sessionId: string) => Promise<SessionHydrateClientOutcome>;
} {
  return {
    async hydrate(sessionId: string): Promise<SessionHydrateClientOutcome> {
      const result = await deps.fetchAuthed(deps.buildUrl(sessionId), {
        method: 'GET',
      });
      if (result.kind === 'unauthenticated') return { kind: 'unauthenticated' };
      if (result.kind === 'network-error') {
        deps.logger.warn('session-hydrate: network', {
          error: result.error.message,
        });
        return { kind: 'network-error' };
      }
      const res = result.response;
      if (res.status === 404) return { kind: 'not-found' };
      if (!res.ok) return { kind: 'api-error', status: res.status };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { kind: 'shape-mismatch' };
      }
      const envelope = HydrateEnvelopeSchema.safeParse(body);
      const payload = envelope.success && envelope.data.data !== undefined
        ? envelope.data.data
        : body;
      const parsed = HydratePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        deps.logger.warn('session-hydrate: envelope drift', {
          issues: parsed.error.issues.length,
        });
        return { kind: 'shape-mismatch' };
      }
      return { kind: 'ok', payload: parsed.data };
    },
  };
}
