// SPDX-License-Identifier: MIT
/**
 * Popup header: LLMC brand mark with real logo, agent switcher dropdown,
 * and (when signed in) a UserMenu avatar that hosts account actions +
 * sign-out.
 */

import React from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';
import type { CreditsState } from '@/src/background/messaging/protocol';
import { AgentSwitcher } from './AgentSwitcher';
import { UserMenu } from './UserMenu';

export interface HeaderProps {
  readonly userId: string | null;
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly onAgentChange: (id: AgentId) => void;
  readonly agentsDisabled?: boolean;
  readonly onSignOut?: () => void;
  readonly signOutDisabled?: boolean;
  readonly credits?: CreditsState | null;
}

export function Header({
  userId,
  agents,
  activeAgentId,
  onAgentChange,
  agentsDisabled = false,
  onSignOut,
  signOutDisabled = false,
  credits = null,
}: HeaderProps): React.ReactElement {
  const activeAgent =
    agents.find((entry) => entry.id === activeAgentId) ?? null;

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
            className="sr-only"
          >
            {userId}
          </span>
          <UserMenu
            userId={userId}
            displayName={null}
            email={userId.includes('@') ? userId : null}
            credits={credits}
            activeAgent={activeAgent}
            onSignOut={onSignOut}
            signOutDisabled={signOutDisabled}
          />
        </div>
      ) : null}
    </header>
  );
}
