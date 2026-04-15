// SPDX-License-Identifier: MIT
/**
 * Popup header: AgentSwitcher (brand-mark + active agent + caret) on the
 * left, UserMenu avatar on the right. The AgentSwitcher carries the LLMC
 * logo so we drop the redundant "LLM Conveyors" title text and the
 * standalone logo image that used to sit beside it.
 */

import React from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';
import type {
  ClientCreditsSnapshot,
  ClientProfileSnapshot,
} from '@/src/background/messaging/protocol-types';
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
  readonly credits?: ClientCreditsSnapshot | null;
  readonly profile?: ClientProfileSnapshot | null;
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
  profile = null,
}: HeaderProps): React.ReactElement {
  const activeAgent =
    agents.find((entry) => entry.id === activeAgentId) ?? null;

  return (
    <header
      data-testid="popup-header"
      className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700"
    >
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
            profile={profile}
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
