// SPDX-License-Identifier: MIT
/**
 * Compact agent switcher. Renders a `<select>` bound to the persisted
 * AGENT_PREFERENCE_* state so the user can flip between agents without
 * leaving the popup.
 */

import React from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';

export interface AgentSwitcherProps {
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly onChange: (id: AgentId) => void;
  readonly disabled?: boolean;
}

export function AgentSwitcher({
  agents,
  activeAgentId,
  onChange,
  disabled = false,
}: AgentSwitcherProps): React.ReactElement | null {
  if (agents.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="sr-only">Active agent</span>
      <select
        data-testid="agent-switcher"
        value={activeAgentId ?? agents[0]?.id ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AgentId)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.label}
          </option>
        ))}
      </select>
    </label>
  );
}
