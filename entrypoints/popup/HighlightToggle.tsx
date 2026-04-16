// SPDX-License-Identifier: MIT
/**
 * HighlightToggle - two-state button that applies or clears keyword
 * highlighting on the active job-posting tab.
 *
 * Sends HIGHLIGHT_APPLY or HIGHLIGHT_CLEAR via chrome.runtime.sendMessage; the
 * background worker forwards to the A9 content-script handler. When the A9
 * content script is not yet registered, the message either rejects (captured
 * below) or returns an envelope with `ok: false`; both surface as a non-fatal
 * inline error so the button remains usable when highlighting becomes
 * available without a popup restart.
 *
 * Per D9 the toggle is always rendered - when the parent is in a signed-out
 * or not-job-posting state, `disabled === true` is passed and the button is
 * inert with a tooltip explaining the gate.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';
import type {
  HighlightApplyResponse,
  HighlightClearResponse,
} from '@/src/background/messaging/protocol';

const log = createLogger('popup:highlight-toggle');

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

type ToggleState =
  | { readonly kind: 'idle'; readonly on: boolean }
  | { readonly kind: 'pending'; readonly on: boolean }
  | { readonly kind: 'error'; readonly on: boolean; readonly message: string };

export interface HighlightToggleProps {
  readonly tabId: number | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'signed-out':
      return 'Sign in to use highlighting';
    case 'no-jd-on-page':
      return 'No job description found';
    case 'not-a-job-posting':
      return 'Highlighting only works on job postings';
    case 'rate-limited':
      return 'Try again in a moment';
    case 'network-error':
      return 'Network error';
    case 'api-error':
      return 'Highlighting unavailable';
    case 'no-tab':
      return 'No active tab';
    case 'render-error':
      return 'Failed to render highlights';
    default:
      return reason;
  }
}

export function HighlightToggle({
  tabId,
  disabled = false,
  disabledReason,
}: HighlightToggleProps): React.ReactElement {
  const [state, setState] = React.useState<ToggleState>({ kind: 'idle', on: false });

  const isDisabled = disabled || tabId === null || state.kind === 'pending';

  async function handleClick(): Promise<void> {
    if (tabId === null) return;
    const runtime = getRuntime();
    if (runtime === null) {
      setState({ kind: 'error', on: state.on, message: 'runtime unavailable' });
      return;
    }
    const wantOn = !state.on;
    setState({ kind: 'pending', on: state.on });
    try {
      if (wantOn) {
        const response = (await runtime.sendMessage({
          key: 'HIGHLIGHT_APPLY',
          data: { tabId },
        })) as HighlightApplyResponse | undefined;
        if (!response) {
          setState({ kind: 'error', on: state.on, message: 'no response' });
          return;
        }
        if (response.ok) {
          setState({ kind: 'idle', on: true });
        } else {
          setState({ kind: 'error', on: state.on, message: reasonLabel(response.reason) });
        }
      } else {
        const response = (await runtime.sendMessage({
          key: 'HIGHLIGHT_CLEAR',
          data: { tabId },
        })) as HighlightClearResponse | undefined;
        if (!response) {
          setState({ kind: 'error', on: state.on, message: 'no response' });
          return;
        }
        if (response.ok) {
          setState({ kind: 'idle', on: false });
        } else {
          setState({
            kind: 'error',
            on: state.on,
            message: reasonLabel(response.reason),
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('highlight message failed', { error: message });
      setState({ kind: 'error', on: state.on, message });
    }
  }

  const buttonLabel = state.on ? 'Clear highlights' : 'Highlight keywords';
  const tooltip = disabled ? disabledReason : undefined;

  return (
    <div className="w-full">
      <button
        type="button"
        data-testid="highlight-button"
        data-on={state.on ? 'true' : 'false'}
        data-state={state.kind}
        aria-pressed={state.on}
        aria-label={buttonLabel}
        title={tooltip}
        disabled={isDisabled}
        onClick={() => {
          void handleClick();
        }}
        className="w-full rounded-card border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {state.kind === 'pending'
          ? state.on
            ? 'Clearing...'
            : 'Highlighting...'
          : buttonLabel}
      </button>

      {state.kind === 'error' ? (
        <p
          data-testid="highlight-error"
          role="status"
          className="mt-2 rounded-card bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
