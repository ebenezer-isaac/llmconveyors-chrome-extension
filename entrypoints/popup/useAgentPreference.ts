// SPDX-License-Identifier: MIT
/**
 * Popup-side hook for reading + writing the active agent preference through
 * the background AGENT_PREFERENCE_GET / AGENT_PREFERENCE_SET messages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentId,
  AgentRegistryEntry,
  AgentPreferenceGetResponse,
  AgentPreferenceSetResponse,
} from '@/src/background/agents';
import { AGENT_REGISTRY, AGENT_IDS, DEFAULT_AGENT_ID } from '@/src/background/agents';

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

export interface UseAgentPreferenceResult {
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly setActiveAgent: (id: AgentId) => Promise<void>;
  readonly loading: boolean;
  readonly error: string | null;
}

// Local agent registry -- frozen at module load, same on every surface.
// Exposing it synchronously avoids a flash of empty header while the
// popup is waiting for a background message round-trip.
const LOCAL_AGENTS: readonly AgentRegistryEntry[] = AGENT_IDS.map(
  (id) => AGENT_REGISTRY[id],
);

export function useAgentPreference(): UseAgentPreferenceResult {
  const [agents] = useState<readonly AgentRegistryEntry[]>(LOCAL_AGENTS);
  const [activeAgentId, setActiveAgentId] = useState<AgentId | null>(DEFAULT_AGENT_ID);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const runtime = getRuntime();
    async function load(): Promise<void> {
      if (runtime === null) {
        if (mounted.current) setLoading(false);
        return;
      }
      try {
        // Only fetch the user's active-agent preference; the registry is local.
        const prefResp = (await runtime.sendMessage({
          key: 'AGENT_PREFERENCE_GET',
          data: {},
        })) as AgentPreferenceGetResponse;
        if (!mounted.current) return;
        if (prefResp?.agentId) setActiveAgentId(prefResp.agentId);
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted.current) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted.current = false;
    };
  }, []);

  const setActiveAgent = useCallback(async (id: AgentId): Promise<void> => {
    const runtime = getRuntime();
    if (runtime === null) {
      setError('Extension runtime unavailable');
      return;
    }
    setError(null);
    try {
      const resp = (await runtime.sendMessage({
        key: 'AGENT_PREFERENCE_SET',
        data: { agentId: id },
      })) as AgentPreferenceSetResponse | undefined;
      if (resp && resp.ok) {
        setActiveAgentId(resp.agentId);
      } else {
        setError(resp?.reason ?? 'failed to set agent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return { agents, activeAgentId, setActiveAgent, loading, error };
}
