// SPDX-License-Identifier: MIT
/**
 * Per-install persisted preference for the active agent.
 *
 * Stored under `llmc.agent-preference.v1` in chrome.storage.local as
 * `{ agentId, selectedAt }`. When the stored id no longer matches the
 * registry (e.g. an agent was removed), the reader falls back to
 * DEFAULT_AGENT_ID.
 */

import type { Logger } from '../log';
import { DEFAULT_AGENT_ID, isAgentId, type AgentId } from './agent-registry';

export const AGENT_PREFERENCE_KEY = 'llmc.agent-preference.v1';

export interface AgentPreferenceEntry {
  readonly agentId: AgentId;
  readonly selectedAt: number;
}

export interface ChromeStorageLocal {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface AgentPreferenceDeps {
  readonly storage: ChromeStorageLocal;
  readonly logger: Logger;
  readonly now: () => number;
}

export function createAgentPreference(deps: AgentPreferenceDeps): {
  read: () => Promise<AgentPreferenceEntry>;
  write: (agentId: AgentId) => Promise<AgentPreferenceEntry>;
  clear: () => Promise<void>;
} {
  return {
    async read(): Promise<AgentPreferenceEntry> {
      let raw: Record<string, unknown>;
      try {
        raw = await deps.storage.get(AGENT_PREFERENCE_KEY);
      } catch (err: unknown) {
        deps.logger.warn('agent-preference: storage.get threw', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { agentId: DEFAULT_AGENT_ID, selectedAt: deps.now() };
      }
      const value = raw[AGENT_PREFERENCE_KEY];
      if (!value || typeof value !== 'object') {
        return { agentId: DEFAULT_AGENT_ID, selectedAt: deps.now() };
      }
      const entry = value as Record<string, unknown>;
      const candidate = typeof entry.agentId === 'string' ? entry.agentId : '';
      if (!isAgentId(candidate)) {
        return { agentId: DEFAULT_AGENT_ID, selectedAt: deps.now() };
      }
      const selectedAt =
        typeof entry.selectedAt === 'number' && Number.isFinite(entry.selectedAt)
          ? entry.selectedAt
          : deps.now();
      return { agentId: candidate, selectedAt };
    },
    async write(agentId: AgentId): Promise<AgentPreferenceEntry> {
      if (!isAgentId(agentId)) {
        throw new Error(`unknown agentId: ${String(agentId)}`);
      }
      const entry: AgentPreferenceEntry = { agentId, selectedAt: deps.now() };
      await deps.storage.set({ [AGENT_PREFERENCE_KEY]: entry });
      return entry;
    },
    async clear(): Promise<void> {
      await deps.storage.remove(AGENT_PREFERENCE_KEY);
    },
  };
}
