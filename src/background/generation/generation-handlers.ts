// SPDX-License-Identifier: MIT
/**
 * Generation handler factory (commit 3 - replaces the legacy inline
 * implementation in messaging/handlers.ts). Wraps the agent client + SSE
 * manager so the background can answer:
 *   - GENERATION_START  -> POST /agents/:type/generate, broadcast STARTED
 *   - GENERATION_SUBSCRIBE -> open SSE stream
 *   - GENERATION_INTERACT  -> POST /agents/:type/interact
 *   - GENERATION_CANCEL    -> abort SSE + best-effort cancel (caller passes
 *     a fetch wrapper that POSTs to the legacy generate-cancel endpoint if
 *     backend supports it; if not, we still tear down our local stream).
 */

import type { Logger } from '../log';
import {
  GenerationStartRequestSchema,
  GenerationSubscribeRequestSchema,
  GenerationInteractRequestSchema,
  GenerationCancelRequestSchema,
  type GenerationStartResponse,
  type GenerationSubscribeResponse,
  type GenerationInteractResponse,
} from '../messaging/schemas/generation.schema';
import type { AgentClient } from './types';

export interface GenerationHandlerDeps {
  readonly logger: Logger;
  readonly agentClient: AgentClient;
  readonly sse: {
    subscribe: (args: { generationId: string }) => Promise<
      | { readonly ok: true }
      | {
          readonly ok: false;
          readonly reason: 'signed-out' | 'network-error' | 'already-subscribed';
        }
    >;
    unsubscribe: (generationId: string) => void;
  };
  readonly broadcast: (msg: {
    readonly key: string;
    readonly data: unknown;
  }) => Promise<void>;
  readonly cancelEndpoint: {
    cancel: (generationId: string) => Promise<{ ok: boolean }>;
  };
}

export function createGenerationHandlers(deps: GenerationHandlerDeps): {
  GENERATION_START: (msg: { readonly data: unknown }) => Promise<GenerationStartResponse>;
  GENERATION_SUBSCRIBE: (msg: { readonly data: unknown }) => Promise<GenerationSubscribeResponse>;
  GENERATION_INTERACT: (msg: { readonly data: unknown }) => Promise<GenerationInteractResponse>;
  GENERATION_CANCEL: (msg: { readonly data: unknown }) => Promise<{ readonly ok: boolean }>;
} {
  return {
    async GENERATION_START(msg): Promise<GenerationStartResponse> {
      const parsed = GenerationStartRequestSchema.safeParse(msg.data);
      if (!parsed.success) {
        return { ok: false, reason: 'invalid payload' };
      }
      const outcome = await deps.agentClient.start({
        agentType: parsed.data.agent,
        inputs: parsed.data.payload,
      });
      switch (outcome.kind) {
        case 'ok':
          // Broadcast STARTED so the sidepanel can pick up the live stream.
          try {
            await deps.broadcast({
              key: 'GENERATION_STARTED',
              data: {
                generationId: outcome.generationId,
                sessionId: outcome.sessionId,
                agentType: parsed.data.agent,
              },
            });
          } catch (err: unknown) {
            deps.logger.debug('GENERATION_STARTED broadcast failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return {
            ok: true,
            generationId: outcome.generationId,
            sessionId: outcome.sessionId,
          };
        case 'unauthenticated':
          return { ok: false, reason: 'signed-out' };
        case 'network-error':
          return { ok: false, reason: 'network error' };
        case 'api-error':
          return { ok: false, reason: `generation start failed: ${outcome.status}` };
      }
    },
    async GENERATION_SUBSCRIBE(msg): Promise<GenerationSubscribeResponse> {
      const parsed = GenerationSubscribeRequestSchema.safeParse(msg.data);
      if (!parsed.success) {
        return { ok: false, reason: 'network-error' };
      }
      return deps.sse.subscribe({ generationId: parsed.data.generationId });
    },
    async GENERATION_INTERACT(msg): Promise<GenerationInteractResponse> {
      const parsed = GenerationInteractRequestSchema.safeParse(msg.data);
      if (!parsed.success) {
        return { ok: false, reason: 'invalid-payload' };
      }
      const outcome = await deps.agentClient.interact({
        agentType: parsed.data.agentType,
        generationId: parsed.data.generationId,
        interactionId: parsed.data.interactionId,
        interactionType: parsed.data.interactionType,
        interactionData: parsed.data.interactionData,
      });
      switch (outcome.kind) {
        case 'ok':
          return { ok: true };
        case 'unauthenticated':
          return { ok: false, reason: 'signed-out' };
        case 'not-found':
          return { ok: false, reason: 'not-found' };
        case 'network-error':
          return { ok: false, reason: 'network-error' };
        case 'api-error':
          return { ok: false, reason: 'api-error', status: outcome.status };
      }
    },
    async GENERATION_CANCEL(msg): Promise<{ readonly ok: boolean }> {
      const parsed = GenerationCancelRequestSchema.safeParse(msg.data);
      if (!parsed.success) return { ok: false };
      // Best-effort teardown even if backend cancel fails.
      deps.sse.unsubscribe(parsed.data.generationId);
      try {
        const r = await deps.cancelEndpoint.cancel(parsed.data.generationId);
        return { ok: r.ok };
      } catch (err: unknown) {
        deps.logger.warn('GENERATION_CANCEL: endpoint failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { ok: true };
      }
    },
  };
}
