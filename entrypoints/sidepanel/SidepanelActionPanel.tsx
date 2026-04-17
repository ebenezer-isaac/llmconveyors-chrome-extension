// SPDX-License-Identifier: MIT
/**
 * SidepanelActionPanel -- thin wrapper that hosts the same generation
 * form the popup uses. The popup's ActionArea already composes
 * JobHunterActions / B2bSalesActions based on the active agent; we
 * simply re-instantiate the popup's data hooks here so the sidepanel
 * can start a generation without the user opening the popup.
 *
 * The component shows itself in a collapsible "Start new generation"
 * section so it doesn't compete for attention with a rendered session.
 */

import React, { useMemo, useState } from 'react';
import { useIntent } from '../popup/useIntent';
import { useCredits } from '../popup/useCredits';
import { useGenericIntent } from '../popup/useGenericIntent';
import { useActiveTabUrl } from '../popup/useActiveTabUrl';
import { ActionArea } from '../popup/ActionArea';
import type { AgentId } from '@/src/background/agents';

export interface SidepanelActionPanelProps {
  readonly signedIn: boolean;
  readonly activeAgentId: AgentId | null;
  readonly defaultOpen?: boolean;
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M1 3 L5 7 L9 3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidepanelActionPanel({
  signedIn,
  activeAgentId,
  defaultOpen = true,
}: SidepanelActionPanelProps): React.ReactElement | null {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const { intent, tabId } = useIntent();
  const { credits } = useCredits();
  const tabUrl = useActiveTabUrl(tabId);
  const genericIntent = useGenericIntent({
    enabled: signedIn && activeAgentId !== null,
    tabId,
    tabUrl,
    adapterIntent: intent,
    agentId: activeAgentId,
  });

  // Hooks must run unconditionally for React's rules-of-hooks; bail
  // out here after the hooks have been instantiated.
  const resolvedAgentId = useMemo<AgentId | null>(() => activeAgentId, [activeAgentId]);
  if (!signedIn || resolvedAgentId === null) return null;

  return (
    <section
      data-testid="sidepanel-action-panel"
      data-open={open ? 'true' : 'false'}
      className="flex flex-col gap-2 p-4"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="sidepanel-action-panel-toggle"
        className="flex items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-200"
      >
        <ChevronIcon open={open} />
        <span>Start new generation</span>
      </button>
      {open ? (
        <ActionArea
          signedIn={signedIn}
          intent={intent}
          tabId={tabId}
          tabUrl={tabUrl}
          activeAgentId={resolvedAgentId}
          hasGenericJd={genericIntent.hasJd}
          genericJdText={genericIntent.jdText}
          genericCompany={genericIntent.company}
          genericJobTitle={genericIntent.jobTitle}
          credits={credits}
        />
      ) : null}
    </section>
  );
}
