// SPDX-License-Identifier: MIT
// entrypoints/ats.content/index.ts
/**
 * LLM Conveyors Job Assistant - ATS content script.
 *
 * Phase A8: autofill execution + Workday wizard orchestration. Phase
 * A9 will extend this entrypoint with highlight + intent detection.
 */
import { createLogger } from '@/src/background/log';
import {
  AutofillController,
  createProductionDeps,
  registerFillListener,
} from '@/src/content/autofill';

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

    const deps = createProductionDeps();
    const controller = new AutofillController(deps);

    // Register the FILL_REQUEST listener BEFORE bootstrap so a fill
    // arriving during adapter load is served correctly.
    registerFillListener(controller);

    void controller.bootstrap().catch((err: unknown) => {
      logger.error('controller bootstrap threw', err);
    });

    ctx.onInvalidated(() => {
      logger.info('content script invalidated; tearing down');
      controller.teardown();
    });
  },
});
