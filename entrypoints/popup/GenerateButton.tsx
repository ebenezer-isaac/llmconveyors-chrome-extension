// SPDX-License-Identifier: MIT
/**
 * GenerateButton - sends GENERATION_START for the given agent + payload.
 *
 * The payload shape is agent-specific (see `JobHunterActions` and
 * `B2bSalesActions`). On success, the button opens the extension side panel
 * on the active tab so the user sees live progress immediately. Multiple
 * variants of the button can coexist on the same popup (research vs outreach
 * for b2b-sales); `testIdSuffix` disambiguates them for test queries.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';
import { useGeneration } from './useGeneration';
import type { AgentId } from '@/src/background/agents';

const log = createLogger('popup:generate-button');

export interface GenerateButtonProps {
  readonly agentId: AgentId;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly primaryLabel: string;
  readonly payload: Record<string, unknown> & { readonly kind: string };
  readonly testIdSuffix?: string;
  readonly tabUrl?: string | null;
  readonly pageTitle?: string | null;
}

function requestPopupClose(): void {
  try {
    if (typeof globalThis.close === 'function') globalThis.close();
    (globalThis as { window?: Window }).window?.close();
  } catch {
    // window.close is a no-op in some evaluation harnesses
  }
}

async function openSidePanel(): Promise<boolean> {
  const g = globalThis as unknown as {
    chrome?: {
      sidePanel?: { open: (opts: { tabId?: number; windowId?: number }) => Promise<void> };
      tabs?: {
        query: (opts: { active: boolean; currentWindow: boolean }) => Promise<
          Array<{ id?: number; windowId?: number }>
        >;
      };
    };
  };
  const sp = g.chrome?.sidePanel;
  const tabs = g.chrome?.tabs;
  if (!sp || !tabs) return false;
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.id === 'number') {
      await sp.open({ tabId: tab.id });
      return true;
    }
    return false;
  } catch (err: unknown) {
    log.warn('failed to open side panel', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function GenerateButton({
  agentId,
  disabled = false,
  disabledReason,
  primaryLabel,
  payload,
  testIdSuffix,
  tabUrl,
  pageTitle,
}: GenerateButtonProps): React.ReactElement {
  const { start, busy, error } = useGeneration();
  const [handoverError, setHandoverError] = React.useState<string | null>(null);
  const [openingPanel, setOpeningPanel] = React.useState<boolean>(false);

  const isDisabled = disabled || busy || openingPanel;
  const testId =
    testIdSuffix && testIdSuffix.length > 0
      ? `generate-button-${testIdSuffix}`
      : 'generate-button';

  async function handleClick(): Promise<void> {
    setHandoverError(null);

    // Open the side panel first to preserve the user gesture.
    setOpeningPanel(true);
    const opened = await openSidePanel();
    setOpeningPanel(false);
    if (!opened) {
      setHandoverError('Unable to open side panel.');
      return;
    }
    
    // Start the generation which crosses the async message bus.
    const outcome = await start({ agentId, payload, tabUrl, pageTitle });
    
    if (outcome.ok || outcome.reason === 'already-generating') {
      requestPopupClose();
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        data-testid={testId}
        data-agent={agentId}
        title={disabled ? disabledReason : undefined}
        disabled={isDisabled}
        onClick={() => {
          void handleClick();
        }}
        className="w-full rounded-card bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {openingPanel ? 'Opening side panel...' : busy ? 'Starting...' : primaryLabel}
      </button>
      {handoverError !== null || error !== null ? (
        <p
          data-testid={`${testId}-error`}
          className="mt-1 rounded-card bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-900 dark:text-red-100"
        >
          {handoverError ?? error}
        </p>
      ) : null}
    </div>
  );
}
