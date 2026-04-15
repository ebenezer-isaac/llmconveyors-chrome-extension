// SPDX-License-Identifier: MIT
/**
 * AGENT_* handlers: preference CRUD, static registry list, manifest fetch.
 */

import type { Logger } from '../log';
import {
  AGENT_IDS,
  AGENT_REGISTRY,
  type AgentId,
  type AgentRegistryEntry,
  isAgentId,
} from './agent-registry';
import type { AgentPreferenceEntry } from './agent-preference';
import type { AgentManifest, AgentManifestOutcome } from './agent-manifest-client';

export type AgentPreferenceGetRequest = Record<string, never>;
export interface AgentPreferenceGetResponse {
  readonly agentId: AgentId;
  readonly selectedAt: number;
}

export interface AgentPreferenceSetRequest {
  readonly agentId: AgentId;
}
export type AgentPreferenceSetResponse =
  | { readonly ok: true; readonly agentId: AgentId; readonly selectedAt: number }
  | { readonly ok: false; readonly reason: 'unknown-agent' | 'storage-error' };

export type AgentRegistryListRequest = Record<string, never>;
export interface AgentRegistryListResponse {
  readonly agents: readonly AgentRegistryEntry[];
  readonly defaultAgentId: AgentId;
}

export interface AgentManifestGetRequest {
  readonly agentId: AgentId;
}
export type AgentManifestGetResponse =
  | { readonly ok: true; readonly manifest: AgentManifest }
  | {
      readonly ok: false;
      readonly reason:
        | 'unauthenticated'
        | 'not-found'
        | 'network-error'
        | 'shape-mismatch'
        | 'api-error'
        | 'unknown-agent';
      readonly status?: number;
    };

export interface AgentHandlerDeps {
  readonly preference: {
    read: () => Promise<AgentPreferenceEntry>;
    write: (agentId: AgentId) => Promise<AgentPreferenceEntry>;
  };
  readonly manifestClient: {
    get: (agentId: AgentId) => Promise<AgentManifestOutcome>;
  };
  readonly logger: Logger;
}

export function createAgentHandlers(deps: AgentHandlerDeps): {
  AGENT_PREFERENCE_GET: (msg: { readonly data: AgentPreferenceGetRequest }) => Promise<AgentPreferenceGetResponse>;
  AGENT_PREFERENCE_SET: (msg: { readonly data: AgentPreferenceSetRequest }) => Promise<AgentPreferenceSetResponse>;
  AGENT_REGISTRY_LIST: (msg: { readonly data: AgentRegistryListRequest }) => Promise<AgentRegistryListResponse>;
  AGENT_MANIFEST_GET: (msg: { readonly data: AgentManifestGetRequest }) => Promise<AgentManifestGetResponse>;
} {
  return {
    async AGENT_PREFERENCE_GET(): Promise<AgentPreferenceGetResponse> {
      const entry = await deps.preference.read();
      return { agentId: entry.agentId, selectedAt: entry.selectedAt };
    },
    async AGENT_PREFERENCE_SET(msg: {
      readonly data: AgentPreferenceSetRequest;
    }): Promise<AgentPreferenceSetResponse> {
      const candidate = msg.data?.agentId ?? '';
      if (!isAgentId(candidate)) {
        return { ok: false, reason: 'unknown-agent' };
      }
      try {
        const entry = await deps.preference.write(candidate);
        return { ok: true, agentId: entry.agentId, selectedAt: entry.selectedAt };
      } catch (err: unknown) {
        deps.logger.warn('AGENT_PREFERENCE_SET: write threw', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { ok: false, reason: 'storage-error' };
      }
    },
    async AGENT_REGISTRY_LIST(): Promise<AgentRegistryListResponse> {
      return {
        agents: AGENT_IDS.map((id) => AGENT_REGISTRY[id]),
        defaultAgentId: AGENT_IDS[0] as AgentId,
      };
    },
    async AGENT_MANIFEST_GET(msg: {
      readonly data: AgentManifestGetRequest;
    }): Promise<AgentManifestGetResponse> {
      const candidate = msg.data?.agentId ?? '';
      if (!isAgentId(candidate)) return { ok: false, reason: 'unknown-agent' };
      const outcome = await deps.manifestClient.get(candidate);
      switch (outcome.kind) {
        case 'ok':
          return { ok: true, manifest: outcome.manifest };
        case 'not-found':
          return { ok: false, reason: 'not-found' };
        case 'unauthenticated':
          return { ok: false, reason: 'unauthenticated' };
        case 'network-error':
          return { ok: false, reason: 'network-error' };
        case 'shape-mismatch':
          return { ok: false, reason: 'shape-mismatch' };
        case 'api-error':
          return { ok: false, reason: 'api-error', status: outcome.status };
      }
    },
  };
}
