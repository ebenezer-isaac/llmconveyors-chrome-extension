// SPDX-License-Identifier: MIT
/**
 * Popup header: LLMC brand mark with real logo, agent switcher dropdown,
 * signed-in user id, and sign-out affordance.
 */

import React from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';
import { AgentSwitcher } from './AgentSwitcher';

export interface HeaderProps {
  readonly userId: string | null;
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly onAgentChange: (id: AgentId) => void;
  readonly agentsDisabled?: boolean;
  readonly onSignOut?: () => void;
  readonly signOutDisabled?: boolean;
}

export function Header({
  userId,
  agents,
  activeAgentId,
  onAgentChange,
  agentsDisabled = false,
  onSignOut,
  signOutDisabled = false,
}: HeaderProps): React.ReactElement {
  return (
    <header
      data-testid="popup-header"
      className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700"
    >
      <div className="flex items-center gap-2">
        <img
          src="/icon/llmc-logo.png"
          alt="LLM Conveyors"
          width={28}
          height={28}
          className="h-7 w-7 rounded-md"
        />
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          LLM Conveyors
        </h1>
      </div>

      <AgentSwitcher
        agents={agents}
        activeAgentId={activeAgentId}
        onChange={onAgentChange}
        disabled={agentsDisabled}
      />

      {userId !== null && onSignOut !== undefined ? (
        <div className="flex items-center gap-1">
          <span
            data-testid="popup-user-id"
            title={userId}
            className="hidden max-w-[100px] truncate text-xs text-zinc-500 dark:text-zinc-400 sm:inline"
          >
            {userId}
          </span>
          <button
            type="button"
            data-testid="sign-out-button"
            aria-label="Sign out"
            onClick={onSignOut}
            disabled={signOutDisabled}
            className="rounded-card border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}
