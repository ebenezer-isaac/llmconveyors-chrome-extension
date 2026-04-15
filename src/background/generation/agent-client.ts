// SPDX-License-Identifier: MIT
/**
 * Agent API client for the generation flow.
 *
 * Covers:
 *   POST /api/v1/agents/:agentType/generate
 *   POST /api/v1/agents/:agentType/interact
 *
 * Keeps the envelope handling in one place so handlers can focus on routing.
 */

import type { Logger } from '../log';

export type AgentType = 'job-hunter' | 'b2b-sales';

export interface AgentStartRequest {
  readonly agentType: AgentType;
  readonly inputs: unknown;
}

export interface AgentStartSuccess {
  readonly kind: 'ok';
  readonly generationId: string;
  readonly sessionId: string;
}

export type AgentStartOutcome =
  | AgentStartSuccess
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'api-error'; readonly status: number };

export interface AgentInteractRequest {
  readonly agentType: AgentType;
  readonly generationId: string;
  readonly interactionId: string;
  readonly interactionType: string;
  readonly interactionData: unknown;
}

export type AgentInteractOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'api-error'; readonly status: number };

export interface AgentClientDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly logger: Logger;
  readonly buildGenerateUrl: (agentType: AgentType) => string;
  readonly buildInteractUrl: (agentType: AgentType) => string;
  readonly accessToken: () => Promise<string | null>;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function createAgentClient(deps: AgentClientDeps): {
  start: (req: AgentStartRequest) => Promise<AgentStartOutcome>;
  interact: (req: AgentInteractRequest) => Promise<AgentInteractOutcome>;
} {
  return {
    async start(req: AgentStartRequest): Promise<AgentStartOutcome> {
      const token = await deps.accessToken();
      if (token === null || token.length === 0) return { kind: 'unauthenticated' };
      let res: Response;
      try {
        res = await deps.fetch(deps.buildGenerateUrl(req.agentType), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(req.inputs ?? {}),
        });
      } catch (err: unknown) {
        deps.logger.warn('agent-client.start: network', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { kind: 'network-error' };
      }
      if (res.status === 401 || res.status === 403) return { kind: 'unauthenticated' };
      if (res.status < 200 || res.status >= 300) {
        return { kind: 'api-error', status: res.status };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { kind: 'api-error', status: res.status };
      }
      if (typeof body !== 'object' || body === null) {
        return { kind: 'api-error', status: res.status };
      }
      const obj = body as Record<string, unknown>;
      const envelope = (obj.data as Record<string, unknown> | undefined) ?? obj;
      const generationId = pickString(envelope, 'generationId');
      const sessionId = pickString(envelope, 'sessionId');
      if (generationId === null || sessionId === null) {
        return { kind: 'api-error', status: res.status };
      }
      return { kind: 'ok', generationId, sessionId };
    },
    async interact(req: AgentInteractRequest): Promise<AgentInteractOutcome> {
      const token = await deps.accessToken();
      if (token === null || token.length === 0) return { kind: 'unauthenticated' };
      let res: Response;
      try {
        res = await deps.fetch(deps.buildInteractUrl(req.agentType), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            generationId: req.generationId,
            interactionId: req.interactionId,
            interactionType: req.interactionType,
            interactionData: req.interactionData ?? null,
          }),
        });
      } catch (err: unknown) {
        deps.logger.warn('agent-client.interact: network', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { kind: 'network-error' };
      }
      if (res.status === 401 || res.status === 403) return { kind: 'unauthenticated' };
      if (res.status === 404) return { kind: 'not-found' };
      if (res.status < 200 || res.status >= 300) {
        return { kind: 'api-error', status: res.status };
      }
      return { kind: 'ok' };
    },
  };
}
