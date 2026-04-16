// SPDX-License-Identifier: MIT
/**
 * SurfaceHeader -- shared header bar for every extension surface
 * (popup, sidepanel, options). Houses the AgentSwitcher on the left,
 * the ThemeToggle + UserMenu (profile avatar) on the right.
 *
 * Both the popup and the sidepanel render this so brand, agent context,
 * theme toggle and sign-out / dashboard navigation live in exactly one
 * place. Absent props (e.g. `onSignOut = undefined` on the signed-out
 * popup) hide the corresponding controls.
 */

import React from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';
import type {
  ClientCreditsSnapshot,
  ClientProfileSnapshot,
} from '@/src/background/messaging/protocol-types';
import { AgentSwitcher } from '@/entrypoints/popup/AgentSwitcher';
import { UserMenu } from '@/entrypoints/popup/UserMenu';
import { ThemeToggle } from './ThemeToggle';

export interface SurfaceHeaderProps {
  readonly userId: string | null;
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly onAgentChange: (id: AgentId) => void;
  readonly agentsDisabled?: boolean;
  readonly onSignOut?: () => void;
  readonly signOutDisabled?: boolean;
  readonly credits?: ClientCreditsSnapshot | null;
  readonly profile?: ClientProfileSnapshot | null;
  /**
   * Accent classes pulled from lib/accent.ts (sidepanel) or the neutral
   * bundle (popup). Applied to the header background so the surface
   * picks up the active agent's colour.
   */
  readonly accentHeader?: string;
}

export function SurfaceHeader({
  userId,
  agents,
  activeAgentId,
  onAgentChange,
  agentsDisabled = false,
  onSignOut,
  signOutDisabled = false,
  credits = null,
  profile = null,
  accentHeader,
}: SurfaceHeaderProps): React.ReactElement {
  const activeAgent =
    agents.find((entry) => entry.id === activeAgentId) ?? null;

  const baseClass =
    'flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700';
  const className =
    accentHeader !== undefined && accentHeader.length > 0
      ? `${baseClass} ${accentHeader}`
      : baseClass;

  return (
    <header
      data-testid="popup-header"
      data-surface="header"
      className={className}
    >
      <AgentSwitcher
        agents={agents}
        activeAgentId={activeAgentId}
        onChange={onAgentChange}
        disabled={agentsDisabled}
      />

      <div className="flex items-center gap-1">
        <ThemeToggle />
        {userId !== null && onSignOut !== undefined ? (
          <>
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
          </>
        ) : null}
      </div>
    </header>
  );
}
