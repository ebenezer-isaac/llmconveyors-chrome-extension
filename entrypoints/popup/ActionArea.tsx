// SPDX-License-Identifier: MIT
/**
 * ActionArea - picks the agent-specific actions panel.
 *
 * Post commits 1-2: b2b-sales no longer renders Fill / Highlight. Each agent
 * gets its own dedicated sub-component so feature creep on one does not leak
 * into the other.
 */

import React from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import type { AgentId } from '@/src/background/agents';
import { JobHunterActions } from './JobHunterActions';
import { B2bSalesActions } from './B2bSalesActions';

export interface ActionAreaProps {
  readonly signedIn: boolean;
  readonly intent: DetectedIntent | null;
  readonly tabId: number | null;
  readonly tabUrl: string | null;
  readonly activeAgentId: AgentId | null;
  readonly hasGenericJd: boolean;
  readonly genericJdText: string | null;
  readonly credits: ClientCreditsSnapshot | null;
}

export function ActionArea({
  signedIn,
  intent,
  tabId,
  tabUrl,
  activeAgentId,
  hasGenericJd,
  genericJdText,
  credits,
}: ActionAreaProps): React.ReactElement | null {
  if (!signedIn) return null;
  if (activeAgentId === 'b2b-sales') {
    return <B2bSalesActions tabUrl={tabUrl} credits={credits} />;
  }
  // Default to job-hunter.
  return (
    <JobHunterActions
      intent={intent}
      tabId={tabId}
      tabUrl={tabUrl}
      hasGenericJd={hasGenericJd}
      genericJdText={genericJdText}
      credits={credits}
    />
  );
}
