// SPDX-License-Identifier: MIT
/**
 * Typed client for the per-agent manifest endpoint.
 *
 *   GET /api/v1/agents/{agentId}/manifest
 *
 * The manifest describes live capabilities, input schemas, billing tiers,
 * and UI copy. The extension treats the manifest as a best-effort enrichment
 * layer on top of the static AGENT_REGISTRY; if the fetch fails the UI still
 * renders using registry defaults.
 */

import { z } from 'zod';
import type { Logger } from '../log';
import type { AgentId } from './agent-registry';
import { ApiEnvelopeSchema } from '../master-resume';

export const AgentManifestSchema = z
  .object({
    agentId: z.string(),
    label: z.string().optional(),
    shortDescription: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    creditsPerRun: z.number().optional(),
    tier: z.string().optional(),
  })
  .passthrough();

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

export type AgentManifestOutcome =
  | { readonly kind: 'ok'; readonly manifest: AgentManifest }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'shape-mismatch'; readonly issues: number }
  | { readonly kind: 'network-error'; readonly message: string }
  | { readonly kind: 'api-error'; readonly status: number };

export interface AgentManifestClientDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly logger: Logger;
  readonly buildUrl: (agentId: AgentId) => string;
  readonly accessToken: () => Promise<string | null>;
}

export function createAgentManifestClient(deps: AgentManifestClientDeps): {
  get: (agentId: AgentId) => Promise<AgentManifestOutcome>;
} {
  return {
    async get(agentId: AgentId): Promise<AgentManifestOutcome> {
      const token = await deps.accessToken();
      const headers: Record<string, string> = {};
      if (typeof token === 'string' && token.length > 0) {
        headers.authorization = `Bearer ${token}`;
      }
      let res: Response;
      try {
        res = await deps.fetch(deps.buildUrl(agentId), {
          method: 'GET',
          headers,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { kind: 'network-error', message };
      }
      if (res.status === 401 || res.status === 403) return { kind: 'unauthenticated' };
      if (res.status === 404) return { kind: 'not-found' };
      if (!res.ok) return { kind: 'api-error', status: res.status };
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        return { kind: 'shape-mismatch', issues: 0 };
      }
      const envelope = ApiEnvelopeSchema.safeParse(body);
      const payload = envelope.success ? envelope.data.data : body;
      const parsed = AgentManifestSchema.safeParse(payload);
      if (!parsed.success) {
        deps.logger.info('agent-manifest: shape drift', {
          issues: parsed.error.issues.length,
          agentId,
        });
        return { kind: 'shape-mismatch', issues: parsed.error.issues.length };
      }
      return { kind: 'ok', manifest: parsed.data };
    },
  };
}
