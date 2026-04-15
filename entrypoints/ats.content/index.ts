// entrypoints/content-scripts/ats.content/index.ts
/**
 * LLM Conveyors Job Assistant - ATS content script.
 *
 * Phase A1: load beacon only. A8 wires the real form scanner + filler;
 * A9 wires the keyword highlighter and intent detector.
 */
import { createLogger } from '@/src/background/log';

const logger = createLogger('content:ats');

export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
  ],
  runAt: 'document_idle',
  world: 'ISOLATED',
  allFrames: false,
  cssInjectionMode: 'manual',
  async main(ctx) {
    logger.info('content script loaded', { host: window.location.hostname });

    ctx.onInvalidated(() => {
      logger.info('content script invalidated');
    });
  },
});
