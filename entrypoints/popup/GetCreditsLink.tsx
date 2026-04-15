// SPDX-License-Identifier: MIT
/**
 * GetCreditsLink - small inline link shown below the action panel when
 * credits === 0. Clicking opens the web settings page in a new tab.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';

const log = createLogger('popup:get-credits-link');
const SETTINGS_URL = 'https://llmconveyors.com/settings';

function openSettings(): void {
  const g = globalThis as unknown as {
    chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
  };
  try {
    if (g.chrome?.tabs?.create) {
      g.chrome.tabs.create({ url: SETTINGS_URL });
      return;
    }
    window.open(SETTINGS_URL, '_blank', 'noopener');
  } catch (err: unknown) {
    log.warn('failed to open settings', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function GetCreditsLink(): React.ReactElement {
  return (
    <button
      type="button"
      data-testid="get-credits-link"
      onClick={openSettings}
      className="mt-1 self-start text-xs font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-200"
    >
      Get credits -&gt;
    </button>
  );
}
