// SPDX-License-Identifier: MIT
import React from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import type { FillRequestResponse } from '@/src/background/messaging/protocol-types';

const log = createLogger('popup:fill-button');

type FillOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | {
      readonly kind: 'success';
      readonly filled: number;
      readonly skipped: number;
      readonly failed: number;
    }
  | { readonly kind: 'error'; readonly message: string };

/**
 * FillButton - visible when the user is signed in. Click triggers a
 * FILL_REQUEST to the background, which forwards to the active tab's
 * content script.
 */
export function FillButton(): React.ReactElement {
  const [outcome, setOutcome] = React.useState<FillOutcome>({ kind: 'idle' });

  async function handleClick(): Promise<void> {
    setOutcome({ kind: 'pending' });
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || typeof tab.id !== 'number' || !tab.url) {
        setOutcome({ kind: 'error', message: 'no active tab' });
        return;
      }
      const response: FillRequestResponse = await sendMessage('FILL_REQUEST', {
        tabId: tab.id,
        url: tab.url,
      });
      if (response.ok) {
        setOutcome({
          kind: 'success',
          filled: response.filled.length,
          skipped: response.skipped.length,
          failed: response.failed.length,
        });
      } else {
        setOutcome({ kind: 'error', message: response.abortReason });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('FILL_REQUEST send failed', err);
      setOutcome({ kind: 'error', message });
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="fill-button"
        onClick={() => {
          void handleClick();
        }}
        disabled={outcome.kind === 'pending'}
        className="w-full rounded-card bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {outcome.kind === 'pending' ? 'Filling...' : 'Fill application'}
      </button>

      {outcome.kind === 'success' ? (
        <p
          data-testid="fill-result-success"
          className="mt-2 rounded-card bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-900 dark:text-green-100"
        >
          Filled {outcome.filled} field{outcome.filled === 1 ? '' : 's'}
          {outcome.skipped > 0 ? `, skipped ${outcome.skipped}` : ''}
          {outcome.failed > 0 ? `, failed ${outcome.failed}` : ''}.
        </p>
      ) : null}

      {outcome.kind === 'error' ? (
        <p
          data-testid="fill-result-error"
          className="mt-2 rounded-card bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900 dark:text-red-100"
        >
          {outcome.message}
        </p>
      ) : null}
    </div>
  );
}
