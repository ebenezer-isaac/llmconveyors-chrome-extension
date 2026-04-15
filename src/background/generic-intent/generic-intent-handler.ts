// SPDX-License-Identifier: MIT
/**
 * GENERIC_INTENT_DETECT handler. Uses chrome.scripting.executeScript to
 * inject `scanForGenericIntent` against the target tab and returns the
 * normalized JD / company result to the caller. Errors fall through as
 * typed reasons.
 */

import type { Logger } from '../log';
import {
  GenericIntentDetectRequestSchema,
  GenericIntentDetectResponseSchema,
  type GenericIntentDetectResponse,
} from '../messaging/schemas/generic-intent.schema';
import {
  scanForGenericIntent,
  type GenericScanAgent,
  type GenericScanResult,
} from '@/src/content/generic-scan';

export interface GenericIntentDeps {
  readonly logger: Logger;
  readonly scripting: {
    executeScript: (args: {
      target: { tabId: number };
      func: (agent: GenericScanAgent) => GenericScanResult;
      args: readonly [GenericScanAgent];
    }) => Promise<ReadonlyArray<{ result?: unknown }>>;
  };
}

export function createGenericIntentHandler(
  deps: GenericIntentDeps,
): (msg: { readonly data: unknown }) => Promise<GenericIntentDetectResponse> {
  return async function GENERIC_INTENT_DETECT(msg) {
    const parsed = GenericIntentDetectRequestSchema.safeParse(msg.data);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid-payload' };
    }
    const { tabId, agent } = parsed.data;
    let injection: ReadonlyArray<{ result?: unknown }>;
    try {
      injection = await deps.scripting.executeScript({
        target: { tabId },
        func: scanForGenericIntent,
        args: [agent],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.warn('generic-scan: inject failed', { error: message, tabId });
      if (/cannot access/i.test(message) || /permission/i.test(message)) {
        return { ok: false, reason: 'permission-denied' };
      }
      if (/no tab with id/i.test(message)) {
        return { ok: false, reason: 'no-tab' };
      }
      return { ok: false, reason: 'script-inject-failed' };
    }
    const first = injection[0]?.result;
    if (!first || typeof first !== 'object') {
      return { ok: false, reason: 'no-match' };
    }
    const raw = first as Record<string, unknown>;
    if (raw.ok !== true) {
      return { ok: false, reason: 'no-match' };
    }
    const candidate: GenericIntentDetectResponse = {
      ok: true,
      result: raw.result as never,
    };
    const validated = GenericIntentDetectResponseSchema.safeParse(candidate);
    if (!validated.success) {
      deps.logger.warn('generic-scan: result failed schema', {
        issues: validated.error.issues.length,
      });
      return { ok: false, reason: 'no-match' };
    }
    return validated.data;
  };
}
