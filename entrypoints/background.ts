// entrypoints/background.ts
/**
 * LLM Conveyors Job Assistant - MV3 service worker.
 *
 * Phase A1: lifecycle listeners only. A5 wires the full `@webext-core/messaging`
 * ProtocolMap dispatch table, SDK client construction, and refresh manager.
 */
import { createLogger } from '@/src/background/log';

const logger = createLogger('background');

export default defineBackground({
  type: 'module',
  main() {
    // Hard rule: main() is NOT async. Async work lives inside listeners.
    logger.info('service worker booted');

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
  },
});
