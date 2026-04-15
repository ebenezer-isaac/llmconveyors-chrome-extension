// SPDX-License-Identifier: MIT
/**
 * Barrel that wires the highlight handlers onto A5's shared onMessage
 * instance and exposes the auth-loss teardown primitive.
 *
 * Registration order matters: `HIGHLIGHT_APPLY` and `HIGHLIGHT_CLEAR` must
 * be listening before the popup can trigger them.
 */

import { browser } from 'wxt/browser';
import {
  applyHighlights,
  detectPageIntent,
  extractJobDescription,
  removeAllHighlights,
} from 'ats-autofill-engine/dom';
import { onMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import { createApplyHandler } from './apply-handler';
import { createClearHandler } from './clear-handler';
import { handleAuthLost as doAuthLost } from './auth-lost-handler';
import type {
  HighlightApplyResponse,
  HighlightClearResponse,
  KeywordsExtractResponse,
} from '@/src/background/messaging/protocol-types';

export interface HighlightRuntimeDeps {
  readonly document: Document;
  readonly location: Location;
  readonly now: () => number;
}

/**
 * Register HIGHLIGHT_APPLY + HIGHLIGHT_CLEAR listeners. Returns an
 * unregister function for tests / ctx.onInvalidated.
 */
export function registerHighlightHandlers(
  deps: HighlightRuntimeDeps,
): () => void {
  const applyLogger = createLogger('content-highlight-apply');
  const clearLogger = createLogger('content-highlight-clear');

  const apply = createApplyHandler({
    logger: applyLogger,
    document: deps.document,
    location: deps.location,
    now: deps.now,
    applyHighlights,
    removeAllHighlights,
    extractJobDescription,
    detectPageIntent,
    sendKeywordsExtract: async (args): Promise<KeywordsExtractResponse> => {
      // Bypass webext-core's sendMessage because A5's bg dispatcher returns
      // raw handler values, not {res, err} envelopes. We talk to the bg
      // listener directly with the {key, data} shape its dispatcher accepts.
      const response = (await browser.runtime.sendMessage({
        key: 'KEYWORDS_EXTRACT',
        data: {
          text: args.text,
          url: args.url,
          topK: args.topK,
        },
      })) as KeywordsExtractResponse;
      return response;
    },
  });

  const clear = createClearHandler({
    logger: clearLogger,
    document: deps.document,
    removeAllHighlights,
  });

  const unApply = onMessage(
    'HIGHLIGHT_APPLY',
    async (): Promise<HighlightApplyResponse> => apply(),
  );
  const unClear = onMessage(
    'HIGHLIGHT_CLEAR',
    async (): Promise<HighlightClearResponse> => clear(),
  );

  return () => {
    unApply();
    unClear();
  };
}

export function handleAuthLost(deps: HighlightRuntimeDeps): void {
  doAuthLost({
    logger: createLogger('content-highlight-auth'),
    document: deps.document,
    removeAllHighlights,
  });
}

export { createApplyHandler } from './apply-handler';
export { createClearHandler } from './clear-handler';
export { handleAuthLost as handleAuthLostInternal } from './auth-lost-handler';
export {
  clearJdCache,
  getJdCache,
  setJdCache,
  __resetJdCacheForTest,
} from './jd-cache';
export {
  beginApply,
  getHighlightState,
  HighlightMutexError,
  isApplyInProgress,
  resetHighlightState,
  setHighlightState,
  __resetHighlightStateForTest,
} from './state';
export { KeywordsExtractResponseGuard } from './guards';
export { blueprint, HIGHLIGHT_MODULE_BLUEPRINT } from './blueprint';
