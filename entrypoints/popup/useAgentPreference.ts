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
  AgentRegistryListResponse,
} from '@/src/background/agents';

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

export function useAgentPreference(): UseAgentPreferenceResult {
  const [agents, setAgents] = useState<readonly AgentRegistryEntry[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<AgentId | null>(null);
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
        const [listResp, prefResp] = await Promise.all([
          runtime.sendMessage({ key: 'AGENT_REGISTRY_LIST', data: {} }) as Promise<AgentRegistryListResponse>,
          runtime.sendMessage({ key: 'AGENT_PREFERENCE_GET', data: {} }) as Promise<AgentPreferenceGetResponse>,
        ]);
        if (!mounted.current) return;
        setAgents(listResp?.agents ?? []);
        setActiveAgentId(prefResp?.agentId ?? null);
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
