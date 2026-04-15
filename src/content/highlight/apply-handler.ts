// SPDX-License-Identifier: MIT
/**
 * HIGHLIGHT_APPLY content-side handler.
 *
 * Flow per A9:
 *   1. detectPageIntent(location, document) (read-only guard)
 *   2. If the page is unknown or an application-form, short-circuit.
 *   3. extractJobDescription(document) cached per-URL.
 *   4. sendMessage('KEYWORDS_EXTRACT', { text, url, topK }) to bg (A5).
 *   5. Zod-guard the response (D21).
 *   6. applyHighlights(document.body, terms) via the engine DOM adapter.
 *   7. Store cleanup + metadata for later HIGHLIGHT_CLEAR.
 *   8. Return the keystone `HighlightApplyResponse` envelope.
 *
 * Single-flight mutex: a concurrent apply rejects with `in-progress` so the
 * popup can disable the toggle while a request is in flight.
 *
 * Engine throws map to `render-error` (H3); `removeAllHighlights` is called
 * unconditionally before every apply as belt-and-braces cleanup.
 */

import type {
  applyHighlights as ApplyHighlightsT,
  detectPageIntent as DetectIntentT,
  extractJobDescription as ExtractJdT,
  removeAllHighlights as RemoveAllT,
} from 'ats-autofill-engine/dom';
import type {
  HighlightApplyResponse,
  KeywordsExtractResponse,
} from '@/src/background/messaging/protocol-types';
import type { Logger } from '@/src/background/log';
import { getJdCache, setJdCache } from './jd-cache';
import {
  beginApply,
  HighlightMutexError,
  resetHighlightState,
  setHighlightState,
} from './state';
import { KeywordsExtractResponseGuard } from './guards';
import { detectIntentWithFallback } from '../intent/detector';

export interface ApplyHandlerDeps {
  readonly logger: Logger;
  readonly document: Document;
  readonly location: Location;
  readonly now: () => number;
  readonly applyHighlights: typeof ApplyHighlightsT;
  readonly removeAllHighlights: typeof RemoveAllT;
  readonly extractJobDescription: typeof ExtractJdT;
  readonly detectPageIntent: typeof DetectIntentT;
  readonly sendKeywordsExtract: (args: {
    readonly text: string;
    readonly url: string;
    readonly topK: number;
  }) => Promise<KeywordsExtractResponse>;
}

const TOP_K = 30;

export function createApplyHandler(
  deps: ApplyHandlerDeps,
): () => Promise<HighlightApplyResponse> {
  const log = deps.logger;

  async function innerApply(): Promise<HighlightApplyResponse> {
    const startedAt = deps.now();
    const url = deps.location.href;

    const intent = detectIntentWithFallback({
      detectPageIntent: deps.detectPageIntent,
      location: deps.location,
      document: deps.document,
    });

    if (intent.kind === 'unknown') {
      log.info('HIGHLIGHT_APPLY: no intent');
      return { ok: false, reason: 'no-jd-on-page' };
    }
    if ('pageKind' in intent && intent.pageKind === 'application-form') {
      log.info('HIGHLIGHT_APPLY: application-form, not a job posting');
      return { ok: false, reason: 'not-a-job-posting' };
    }

    // Belt-and-braces: remove any orphan marks from a prior run before the
    // new extract. The engine's internal apply will also do this, but if an
    // earlier run threw mid-render we may still have partial marks.
    try {
      deps.removeAllHighlights(deps.document.body);
    } catch (err: unknown) {
      log.warn('removeAllHighlights threw during pre-apply cleanup', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    let cached = getJdCache(url);
    if (!cached) {
      log.debug('JD cache miss, extracting');
      let result: Awaited<ReturnType<typeof ExtractJdT>> = null;
      try {
        result = await deps.extractJobDescription(deps.document);
      } catch (err: unknown) {
        log.warn('extractJobDescription threw', {
          err: err instanceof Error ? err.message : String(err),
        });
        return { ok: false, reason: 'no-jd-on-page' };
      }
      if (result === null) {
        log.info('HIGHLIGHT_APPLY: no JD on page');
        return { ok: false, reason: 'no-jd-on-page' };
      }
      cached = {
        text: result.text,
        structured: result.structured,
        method: result.method,
        cachedAt: deps.now(),
      };
      setJdCache(url, cached);
    }

    if (cached.text.length === 0) {
      log.info('HIGHLIGHT_APPLY: empty JD text');
      return { ok: false, reason: 'no-jd-on-page' };
    }

    let bgResponseRaw: unknown;
    try {
      bgResponseRaw = await deps.sendKeywordsExtract({
        text: cached.text,
        url,
        topK: TOP_K,
      });
    } catch (err: unknown) {
      log.warn('KEYWORDS_EXTRACT rejected', {
        err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: 'network-error' };
    }

    const parsed = KeywordsExtractResponseGuard.safeParse(bgResponseRaw);
    if (!parsed.success) {
      log.warn('KEYWORDS_EXTRACT response failed Zod guard', {
        issues: parsed.error.issues.length,
      });
      return { ok: false, reason: 'api-error' };
    }

    const bgResponse = parsed.data;
    if (!bgResponse.ok) {
      log.info('KEYWORDS_EXTRACT returned failure', {
        reason: bgResponse.reason,
      });
      if (bgResponse.reason === 'empty-text') {
        return { ok: false, reason: 'no-jd-on-page' };
      }
      return { ok: false, reason: bgResponse.reason };
    }

    if (bgResponse.keywords.length === 0) {
      log.info('KEYWORDS_EXTRACT returned zero keywords');
      setHighlightState({
        cleanup: null,
        keywordCount: 0,
        rangeCount: 0,
        appliedAt: deps.now(),
        url,
      });
      return {
        ok: true,
        keywordCount: 0,
        rangeCount: 0,
        tookMs: deps.now() - startedAt,
      };
    }

    const terms: readonly string[] = bgResponse.keywords.map((k) => k.term);

    let cleanup: () => void;
    try {
      cleanup = deps.applyHighlights(deps.document.body, terms);
    } catch (err: unknown) {
      log.error('applyHighlights threw', err);
      return { ok: false, reason: 'render-error' };
    }

    const marks = deps.document.querySelectorAll(
      'mark[data-ats-autofill="true"]',
    );
    const rangeCount = marks.length;

    setHighlightState({
      cleanup,
      keywordCount: terms.length,
      rangeCount,
      appliedAt: deps.now(),
      url,
    });

    const tookMs = deps.now() - startedAt;
    log.info('HIGHLIGHT_APPLY succeeded', {
      keywordCount: terms.length,
      rangeCount,
      tookMs,
    });
    return { ok: true, keywordCount: terms.length, rangeCount, tookMs };
  }

  return async function handle(): Promise<HighlightApplyResponse> {
    try {
      return await beginApply(innerApply);
    } catch (err: unknown) {
      if (err instanceof HighlightMutexError) {
        log.info('HIGHLIGHT_APPLY rejected: apply already in progress');
        // The keystone union does not ship `in-progress`; map to api-error
        // so the popup's disabled-toggle guard is the primary gate and
        // the caller still sees a typed failure.
        return { ok: false, reason: 'api-error' };
      }
      log.error('HIGHLIGHT_APPLY unexpected error', err);
      resetHighlightState();
      return { ok: false, reason: 'render-error' };
    }
  };
}
