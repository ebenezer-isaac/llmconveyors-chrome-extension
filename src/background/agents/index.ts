// SPDX-License-Identifier: MIT
/**
 * Barrel for the agent registry / preference / manifest surface.
 */

export {
  AGENT_REGISTRY,
  AGENT_IDS,
  DEFAULT_AGENT_ID,
  getAgentById,
  isAgentId,
  type AgentId,
  type AgentRegistryEntry,
} from './agent-registry';
export {
  createAgentPreference,
  AGENT_PREFERENCE_KEY,
  type AgentPreferenceEntry,
  type AgentPreferenceDeps,
  type ChromeStorageLocal,
} from './agent-preference';
export {
  createAgentManifestClient,
  AgentManifestSchema,
  type AgentManifest,
  type AgentManifestClientDeps,
  type AgentManifestOutcome,
} from './agent-manifest-client';
export {
  createAgentHandlers,
  type AgentHandlerDeps,
  type AgentPreferenceGetRequest,
  type AgentPreferenceGetResponse,
  type AgentPreferenceSetRequest,
  type AgentPreferenceSetResponse,
  type AgentRegistryListRequest,
  type AgentRegistryListResponse,
  type AgentManifestGetRequest,
  type AgentManifestGetResponse,
} from './agent-handlers';
