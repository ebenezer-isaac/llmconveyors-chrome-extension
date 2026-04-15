// SPDX-License-Identifier: MIT
/**
 * Auth-loss cleanup. When the background broadcasts
 * AUTH_STATE_CHANGED with `{ signedIn: false }`, the content script tears
 * down any in-flight highlights and drops the JD cache. This is the
 * graceful-degradation primitive documented in D9: the extension never
 * shows stale highlights after a sign-out.
 */

import type { removeAllHighlights as RemoveAllT } from 'ats-autofill-engine/dom';
import type { Logger } from '@/src/background/log';
import { clearJdCache } from './jd-cache';
import { getHighlightState, resetHighlightState } from './state';

export interface AuthLostDeps {
  readonly logger: Logger;
  readonly document: Document;
  readonly removeAllHighlights: typeof RemoveAllT;
}

export function handleAuthLost(deps: AuthLostDeps): void {
  const state = getHighlightState();
  if (state.cleanup) {
    try {
      state.cleanup();
    } catch (err: unknown) {
      deps.logger.warn('auth-lost cleanup threw', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  try {
    deps.removeAllHighlights(deps.document.body);
  } catch (err: unknown) {
    deps.logger.warn('auth-lost removeAllHighlights threw', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  resetHighlightState();
  clearJdCache();
  deps.logger.info('auth lost: highlight state cleared');
}
