// SPDX-License-Identifier: MIT
/**
 * Popup footer: version, dashboard link, and options shortcut. The options
 * link opens the extension options page in a new tab via
 * chrome.runtime.openOptionsPage so the experience matches the Chrome
 * convention for extension settings surfaces.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';

const log = createLogger('popup:footer');

type RuntimeApi = {
  openOptionsPage?: (callback?: () => void) => void;
};

function getRuntime(): RuntimeApi | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeApi };
    browser?: { runtime?: RuntimeApi };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

const DASHBOARD_URL = 'https://llmconveyors.com/app';

export interface FooterProps {
  readonly version?: string;
}

export function Footer({ version = '0.1.0' }: FooterProps): React.ReactElement {
  function openOptions(): void {
    const runtime = getRuntime();
    if (runtime?.openOptionsPage) {
      try {
        runtime.openOptionsPage();
      } catch (err) {
        log.warn('openOptionsPage threw', { error: String(err) });
      }
    }
  }

  return (
    <footer
      data-testid="popup-footer"
      className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
    >
      <span data-testid="popup-version">v{version}</span>
      <div className="flex items-center gap-3">
        <a
          data-testid="dashboard-link"
          href={DASHBOARD_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-brand-500 hover:underline"
        >
          Dashboard
        </a>
        <button
          type="button"
          data-testid="settings-link"
          aria-label="Open settings"
          onClick={openOptions}
          className="hover:text-brand-500 hover:underline"
        >
          Settings
        </button>
      </div>
    </footer>
  );
}
