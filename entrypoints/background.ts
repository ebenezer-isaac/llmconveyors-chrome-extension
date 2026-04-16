// SPDX-License-Identifier: MIT
/**
 * WXT background entry for the LLM Conveyors extension.
 *
 * MV3 service-worker lifecycle rules:
 *   1. Install `self.error` + `unhandledrejection` handlers at the TOP of
 *      main() so module-runtime failures are written to chrome.storage.local
 *      (WXT's prod build strips its own error logger; errors are otherwise
 *      silent).
 *   2. Initialise the SessionManager singleton synchronously BEFORE
 *      `registerHandlers()` runs, because `buildProductionDeps()` resolves the
 *      singleton eagerly. Both calls are synchronous, so MV3 still sees every
 *      runtime listener installed in the first event-loop turn.
 *   3. Register every chrome.runtime / chrome.alarms / browser.tabs listener
 *      SYNCHRONOUSLY in the first event-loop turn of main(). Chrome persists
 *      those as "lazy" listeners and wakes the SW to dispatch them.
 *   4. Fire-and-forget async work (cookie exchange) runs AFTER listeners are
 *      in place, so a slow network call cannot block event delivery.
 *   5. Static imports only. Dynamic import() is banned in SW and triggers
 *      Vite's `__vitePreload` helper which references `document`.
 */

import { createLogger } from '@/src/background/log';
import { LOG_SCOPES, AUTH_EXCHANGE_ENDPOINT } from '@/src/background/config';
import { registerHandlers } from '@/src/background/messaging/register-handlers';
import { clearTabState } from '@/src/background/storage/tab-state';
import { initSessionManager } from '@/src/background/session/session-manager';
import {
  readSession,
  writeSession,
  clearSession,
} from '@/src/background/storage/session-storage';
import {
  registerCookieWatcher,
  createCookieExchange,
} from '@/src/background/auth';

const logger = createLogger(LOG_SCOPES.background);
const REFRESH_ENDPOINT = AUTH_EXCHANGE_ENDPOINT.replace(
  '/extension-token-exchange',
  '/session/refresh',
);

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
        } catch {
          // nothing to do
        }
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
        } catch {
          // nothing to do
        }
      });
    } catch {
      // error-sink install failed; main() still proceeds
    }

    try {
      void swChrome.storage.local.set({
        'llmc.sw.main-entered': { at: Date.now() },
      });
    } catch {
      // nothing to do
    }

    initSessionManager({
      readSession,
      writeSession,
      clearSession,
      fetch: globalThis.fetch.bind(globalThis),
      now: () => Date.now(),
      logger: createLogger(LOG_SCOPES.session),
      refreshEndpoint: REFRESH_ENDPOINT,
    });

    registerHandlers();

    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === 'install') {
        logger.info('installed');
      } else if (reason === 'update') {
        logger.info('updated');
      }
    });

    browser.runtime.onStartup.addListener(() => {
      logger.info('browser startup');
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      clearTabState(tabId);
    });

    const cookieExchangeFn = createCookieExchange({
      logger: createLogger('bg.auth.cookie-exchange'),
      fetch: globalThis.fetch.bind(globalThis),
      exchangeEndpoint: AUTH_EXCHANGE_ENDPOINT,
      storage: { writeSession },
      broadcast: {
        sendRuntime: async (msg) => {
          try {
            await browser.runtime.sendMessage(msg);
          } catch {
            // no receiver listening
          }
        },
      },
    });

    registerCookieWatcher({
      logger: createLogger('bg.auth.cookie'),
      clearSession,
      readSession,
      broadcast: async (message) => {
        try {
          await browser.runtime.sendMessage(message);
        } catch (err) {
          logger.debug('cookie-watcher broadcast: no listener', {
            error: String(err),
          });
        }
      },
      attemptCookieExchange: async () => {
        await cookieExchangeFn();
      },
    });

    void (async () => {
      try {
        const existing = await readSession();
        if (existing !== null) return;
        const result = await cookieExchangeFn();
        logger.info('boot: cookie exchange', { kind: result.kind });
      } catch (err) {
        logger.debug('boot: cookie exchange failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    logger.info('service worker booted');
  },
});
