// SPDX-License-Identifier: MIT
/**
 * HIGHLIGHT_APPLY content-side handler.
 *
 * Flow per A9:
 *   1. detectPageIntent(location, document) (read-only guard)
 *   2. If the page is unknown or an application-form, short-circuit.
 *   3. extractJobDescription(document) cached per-URL; if empty/missing and
 *      raw DOM text is available, fall back to raw text for extraction.
 *   4. sendMessage('KEYWORDS_EXTRACT', { text, rawPageText, url, topK }) to
 *      bg (A5).
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
    readonly rawPageText?: string;
    readonly hostname?: string;
  }) => Promise<KeywordsExtractResponse>;
}

/**
 * Collect raw visible text from the live DOM for the LLM extraction path.
 * Clones the document so we can strip nav/aside/footer/script/style without
 * mutating the page. Returns '' on any failure.
 */
function captureRawPageText(doc: Document): string {
  const MAX = 100_000;
  try {
    const clone = doc.cloneNode(true) as Document;
    clone
      .querySelectorAll('script, style, noscript, nav, aside, footer, iframe')
      .forEach((el) => el.remove());
    const body = clone.body;
    if (!body) return '';
    const raw = body.innerText ?? body.textContent ?? '';
    return raw.replace(/\s+\n/g, '\n').trim().slice(0, MAX);
  } catch {
    return '';
  }
}

const TOP_K = 30;
const LEGACY_TEXT_MAX = 50_000;

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

    // Only short-circuit on application-form pages when we positively
    // identified them (known ATS). Unknown intent is expected for
    // non-ATS pages like metacareers.com / stripe.com/jobs and we let
    // extractJobDescription probe for JSON-LD / Readability content.
    if (intent.kind !== 'unknown' && intent.pageKind === 'application-form') {
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

    const rawPageText = captureRawPageText(deps.document);
    const hasRawFallback = rawPageText.length >= 200;
    log.info('HIGHLIGHT_APPLY: prepared page text', {
      url,
      rawPageTextLength: rawPageText.length,
      hasRawFallback,
      intentKind: intent.kind,
      intentPageKind:
        intent.kind === 'unknown' ? undefined : intent.pageKind,
    });

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
        if (!hasRawFallback) {
          return { ok: false, reason: 'no-jd-on-page' };
        }
        log.info('HIGHLIGHT_APPLY: extractor failed, using raw-page fallback');
      }
      if (result === null && !hasRawFallback) {
        log.info('HIGHLIGHT_APPLY: no JD on page');
        return { ok: false, reason: 'no-jd-on-page' };
      }
      if (result !== null) {
        cached = {
          text: result.text,
          structured: result.structured,
          method: result.method,
          cachedAt: deps.now(),
        };
        setJdCache(url, cached);
      }
    }

    const extractedText = cached?.text ?? '';
    const keywordText =
      extractedText.length > 0
        ? extractedText
        : rawPageText.slice(0, LEGACY_TEXT_MAX);
    log.info('HIGHLIGHT_APPLY: extraction summary', {
      extractedTextLength: extractedText.length,
      keywordTextLength: keywordText.length,
      usingRawFallback: extractedText.length === 0 && keywordText.length > 0,
    });

    if (keywordText.length === 0) {
      log.info('HIGHLIGHT_APPLY: empty JD text');
      return { ok: false, reason: 'no-jd-on-page' };
    }
    const hostname = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return undefined;
      }
    })();

    let bgResponseRaw: unknown;
    try {
      bgResponseRaw = await deps.sendKeywordsExtract({
        text: keywordText,
        url,
        topK: TOP_K,
        ...(hasRawFallback ? { rawPageText } : {}),
        ...(hostname ? { hostname } : {}),
      });
      log.info('HIGHLIGHT_APPLY: KEYWORDS_EXTRACT completed', {
        hostname,
        sentRawPageText: hasRawFallback,
        textLength: keywordText.length,
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
