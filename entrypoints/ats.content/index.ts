// SPDX-License-Identifier: MIT
// entrypoints/ats.content/index.ts
/**
 * LLM Conveyors Job Assistant - ATS content script.
 *
 * Phase A8: autofill execution + Workday wizard orchestration.
 * Phase A9: keyword highlight + page intent detection.
 */
import { browser } from 'wxt/browser';
import { detectPageIntent } from 'ats-autofill-engine/dom';
import { onMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import {
  AutofillController,
  createProductionDeps,
  registerFillListener,
} from '@/src/content/autofill';
import {
  handleAuthLost,
  registerHighlightHandlers,
} from '@/src/content/highlight';
import { initIntentDetection } from '@/src/content/intent';

const logger = createLogger('content:ats');

export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
    'http://localhost:5174/*',
  ],
  runAt: 'document_idle',
  world: 'ISOLATED',
  allFrames: false,
  cssInjectionMode: 'manual',
  async main(ctx) {
    logger.info('content script loaded', {
      host: window.location.hostname,
    });

    const autofillDeps = createProductionDeps();
    const controller = new AutofillController(autofillDeps);

    // Register the FILL_REQUEST listener BEFORE bootstrap so a fill
    // arriving during adapter load is served correctly.
    registerFillListener(controller);

    void controller.bootstrap().catch((err: unknown) => {
      logger.error('controller bootstrap threw', err);
    });

    const highlightDeps = {
      document,
      location: window.location,
      now: () => Date.now(),
    };

    // A9: intent detection at bootstrap.
    void initIntentDetection({
      logger: createLogger('content-intent'),
      location: window.location,
      document,
      now: () => Date.now(),
      detectPageIntent,
      sendIntentDetected: async (payload) => {
        // Bypass webext-core: the bg listener speaks {key, data}.
        await browser.runtime.sendMessage({
          key: 'INTENT_DETECTED',
          data: payload,
        });
      },
    }).catch((err: unknown) => {
      logger.warn('intent bootstrap rejected', {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    // A9: highlight handlers.
    const unregisterHighlight = registerHighlightHandlers(highlightDeps);

    // A9: auth-loss teardown. AUTH_STATE_CHANGED is a broadcast-only
    // message; A5 fans it out via chrome.runtime.sendMessage.
    const unregisterAuth = onMessage('AUTH_STATE_CHANGED', (message) => {
      if (message.data.signedIn === false) {
        handleAuthLost(highlightDeps);
      }
    });

    ctx.onInvalidated(() => {
      logger.info('content script invalidated; tearing down');
      controller.teardown();
      unregisterHighlight();
      unregisterAuth();
    });
  },
});
