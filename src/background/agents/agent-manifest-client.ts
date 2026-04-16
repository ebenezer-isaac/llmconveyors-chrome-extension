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
 *
 * Authentication and 401 recovery are delegated to the shared `fetchAuthed`
 * helper. This endpoint may be reachable without a session (public manifest
 * for marketing pages); `fetchAuthed` returns `unauthenticated` when the
 * caller has no session, which the client maps to `{ kind: 'unauthenticated' }`
 * for the popup to fall back to registry defaults.
 */

import { z } from 'zod';
import type { Logger } from '../log';
import type { FetchAuthed } from '../auth';
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
  readonly fetchAuthed: FetchAuthed;
  readonly logger: Logger;
  readonly buildUrl: (agentId: AgentId) => string;
}

export function createAgentManifestClient(deps: AgentManifestClientDeps): {
  get: (agentId: AgentId) => Promise<AgentManifestOutcome>;
} {
  return {
    async get(agentId: AgentId): Promise<AgentManifestOutcome> {
      const result = await deps.fetchAuthed(deps.buildUrl(agentId), {
        method: 'GET',
      });
      if (result.kind === 'unauthenticated') return { kind: 'unauthenticated' };
      if (result.kind === 'network-error') {
        return { kind: 'network-error', message: result.error.message };
      }
      const res = result.response;
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
