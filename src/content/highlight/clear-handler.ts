// SPDX-License-Identifier: MIT
/**
 * HIGHLIGHT_CLEAR content-side handler.
 *
 * Invokes the stored cleanup closure from the prior successful apply and
 * then runs `removeAllHighlights` as a belt-and-braces pass so the DOM is
 * scrubbed even if the cleanup threw or no cleanup was stored.
 */

import type { removeAllHighlights as RemoveAllT } from 'ats-autofill-engine/dom';
import type { HighlightClearResponse } from '@/src/background/messaging/protocol-types';
import type { Logger } from '@/src/background/log';
import {
  getHighlightState,
  resetHighlightState,
} from './state';

export interface ClearHandlerDeps {
  readonly logger: Logger;
  readonly document: Document;
  readonly removeAllHighlights: typeof RemoveAllT;
}

export function createClearHandler(
  deps: ClearHandlerDeps,
): () => Promise<HighlightClearResponse> {
  const log = deps.logger;

  return async function handle(): Promise<HighlightClearResponse> {
    const state = getHighlightState();
    const hadCleanup = state.cleanup !== null;

    if (state.cleanup) {
      try {
        state.cleanup();
        log.debug('stored cleanup invoked');
      } catch (err: unknown) {
        log.warn('stored cleanup threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      deps.removeAllHighlights(deps.document.body);
    } catch (err: unknown) {
      log.warn('removeAllHighlights threw', {
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        reason: `removeAllHighlights threw: ${
          err instanceof Error ? err.message : String(err)
        }`.slice(0, 500),
      };
    }

    resetHighlightState();
    log.info('HIGHLIGHT_CLEAR succeeded', { hadCleanup });
    return { ok: true, cleared: hadCleanup };
  };
}
