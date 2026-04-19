// SPDX-License-Identifier: MIT
/**
 * WXT background entry for the LLM Conveyors extension.
 */

import { createLogger } from '@/src/background/log';
import { LOG_SCOPES } from '@/src/background/config';
import { registerHandlers } from '@/src/background/messaging/register-handlers';
import { clearTabState } from '@/src/background/storage/tab-state';
import { registerCookieWatcher } from '@/src/background/auth';
import { clientEnv } from '@/src/shared/env';

const logger = createLogger(LOG_SCOPES.background);

export default defineBackground({
  type: 'module',
  main() {
    const swGlobal = self as unknown as {
      addEventListener: (ev: string, fn: (e: Event) => void) => void;
    };
    const swChrome = (globalThis as unknown as {
      chrome: {
        storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
      };
    }).chrome;

    try {
      swGlobal.addEventListener('error', (raw: Event) => {
        const e = raw as ErrorEvent;
        try {
          void swChrome.storage.local.set({
            'llmc.sw.error': {
              at: Date.now(),
              message: e.message,
              filename: e.filename,
              line: e.lineno,
              col: e.colno,
              stack: e.error instanceof Error ? e.error.stack : null,
            },
          });
        } catch { /* ignore */ }
      });
      swGlobal.addEventListener('unhandledrejection', (raw: Event) => {
        const e = raw as PromiseRejectionEvent;
        try {
          const reason = e.reason;
          void swChrome.storage.local.set({
            'llmc.sw.rejection': {
              at: Date.now(),
              reason: reason instanceof Error ? reason.message : String(reason),
              stack: reason instanceof Error ? reason.stack : null,
            },
          });
        } catch { /* ignore */ }
      });
    } catch { /* error-sink install failed */ }

    try {
      void swChrome.storage.local.set({ 'llmc.sw.main-entered': { at: Date.now() } });
    } catch { /* ignore */ }

    // Handlers
    registerHandlers({ /* Native Google SignIn no longer tracks pending windows */ });

    // Startup log hooks
    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === 'install') logger.info('installed');
      else if (reason === 'update') logger.info('updated');
    });

    browser.runtime.onStartup.addListener(() => {
      logger.info('browser startup');
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      clearTabState(tabId);
    });

    // Native Cookie Watcher Broadcast Sync
    registerCookieWatcher({
      logger: createLogger('bg.auth.cookie'),
      cookieDomainSuffix: clientEnv.authCookieDomain,
      broadcast: async (message) => {
        try {
          await browser.runtime.sendMessage(message);
        } catch { /* no receiver */ }
      },
    });

    logger.info('service worker booted');
  },
});
