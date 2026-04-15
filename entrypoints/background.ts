// SPDX-License-Identifier: MIT
/**
 * WXT background entry for the LLM Conveyors Job Assistant.
 *
 * Delegates all logic to `src/background/messaging/register-handlers` so this
 * file stays small and most code lives in testable modules outside the WXT
 * entrypoint.
 */

import { createLogger } from '@/src/background/log';
import { LOG_SCOPES } from '@/src/background/config';
import { registerHandlers } from '@/src/background/messaging/register-handlers';
import { clearTabState } from '@/src/background/storage/tab-state';
import { initSessionManager } from '@/src/background/session/session-manager';
import {
  readSession,
  writeSession,
  clearSession,
} from '@/src/background/storage/session-storage';

const logger = createLogger(LOG_SCOPES.background);

export default defineBackground({
  type: 'module',
  main() {
    logger.info('service worker booted');

    // Session manager holds the single-flight refresh promise.
    initSessionManager({
      readSession,
      writeSession,
      clearSession,
      fetch: globalThis.fetch.bind(globalThis),
      now: () => Date.now(),
      logger: createLogger(LOG_SCOPES.session),
      refreshEndpoint:
        (() => {
          try {
            const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
            const base = typeof env?.VITE_LLMC_API_BASE_URL === 'string'
              ? env.VITE_LLMC_API_BASE_URL
              : 'https://api.llmconveyors.com';
            return `${base}/api/v1/auth/session/refresh`;
          } catch {
            return 'https://api.llmconveyors.com/api/v1/auth/session/refresh';
          }
        })(),
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
  },
});
