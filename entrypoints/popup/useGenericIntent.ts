// SPDX-License-Identifier: MIT
/**
 * useGenericIntent - runs the GENERIC_INTENT_DETECT round-trip when the
 * primary adapter intent lookup returned `null` / `unknown`.
 *
 * The hook is a no-op when:
 *   - the popup is not signed in
 *   - the adapter intent is already decided
 *   - the tabId is unknown
 *
 * It surfaces `{ jdText, method, jobTitle, company }` on success so the
 * Generate button can proceed without a matching adapter.
 */

import { useEffect, useRef, useState } from 'react';
import type { AgentId } from '@/src/background/agents';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';

type RuntimeMessenger = { sendMessage: (m: unknown) => Promise<unknown> };
function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

const log = createLogger('popup:generic-intent');

export interface UseGenericIntentResult {
  readonly hasJd: boolean;
  readonly hasCompany: boolean;
  readonly jdText: string | null;
  readonly method: 'jsonld' | 'readability' | null;
  readonly jobTitle: string | null;
  readonly company: string | null;
  readonly companySignals: readonly string[];
  readonly loading: boolean;
}

const EMPTY_RESULT: UseGenericIntentResult = {
  hasJd: false,
  hasCompany: false,
  jdText: null,
  method: null,
  jobTitle: null,
  company: null,
  companySignals: [],
  loading: false,
};

export function useGenericIntent(args: {
  readonly enabled: boolean;
  readonly tabId: number | null;
  readonly tabUrl?: string | null;
  readonly adapterIntent: DetectedIntent | null;
  readonly agentId: AgentId | null;
}): UseGenericIntentResult {
  const [state, setState] = useState<UseGenericIntentResult>(EMPTY_RESULT);
  const lastFetchedRef = useRef<string>('');

  useEffect(() => {
    if (!args.enabled || args.tabId === null || args.agentId === null) {
      lastFetchedRef.current = '';
      setState((prev) => (prev === EMPTY_RESULT ? prev : EMPTY_RESULT));
      return;
    }

    const resolvedUrl =
      (typeof args.tabUrl === 'string' && args.tabUrl.length > 0
        ? args.tabUrl
        : undefined) ??
      (typeof args.adapterIntent?.url === 'string' && args.adapterIntent.url.length > 0
        ? args.adapterIntent.url
        : '');

    const key = `${args.tabId}:${args.agentId}:${resolvedUrl}`;

    // If the adapter-based detector already found a match, don't bother.
    const adapterMatched =
      args.adapterIntent !== null && args.adapterIntent.kind !== 'unknown';
    if (adapterMatched) {
      lastFetchedRef.current = key;
      setState((prev) => (prev === EMPTY_RESULT ? prev : EMPTY_RESULT));
      return;
    }
    if (lastFetchedRef.current === key) return;
    lastFetchedRef.current = key;

    setState((prev) => ({ ...prev, loading: true }));
    const runtime = getRuntime();
    if (runtime === null) {
      log.warn('GENERIC_INTENT_DETECT: runtime unavailable');
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    let cancelled = false;
    const applyResult = (next: UseGenericIntentResult): void => {
      if (cancelled) return;
      if (lastFetchedRef.current !== key) return;
      setState(next);
    };
    const run = async (): Promise<void> => {
      try {
        log.info('GENERIC_INTENT_DETECT: requesting scan', {
          tabId: args.tabId ?? undefined,
          agentId: args.agentId,
          tabUrl: resolvedUrl || undefined,
        });
        const raw = await runtime.sendMessage({
          key: 'GENERIC_INTENT_DETECT',
          data: { tabId: args.tabId, agent: args.agentId },
        });
        if (!raw || typeof raw !== 'object') {
          log.warn('GENERIC_INTENT_DETECT: empty/non-object response');
          applyResult(EMPTY_RESULT);
          return;
        }
        const env = raw as Record<string, unknown>;
        if (env.ok !== true || !env.result || typeof env.result !== 'object') {
          log.info('GENERIC_INTENT_DETECT: no-match', {
            reason: typeof env.reason === 'string' ? env.reason : 'unknown',
          });
          applyResult(EMPTY_RESULT);
          return;
        }
        const result = env.result as Record<string, unknown>;
        if (result.kind === 'job-description') {
          const detectedText = typeof result.text === 'string' ? result.text : '';
          log.info('GENERIC_INTENT_DETECT: detected job description', {
            method:
              result.method === 'jsonld' || result.method === 'readability'
                ? result.method
                : 'unknown',
            textLength: detectedText.length,
          });
          applyResult({
            hasJd: true,
            hasCompany: false,
            jdText: typeof result.text === 'string' ? result.text : null,
            method:
              result.method === 'jsonld' || result.method === 'readability'
                ? result.method
                : null,
            jobTitle: typeof result.jobTitle === 'string' ? result.jobTitle : null,
            company: typeof result.company === 'string' ? result.company : null,
            companySignals: [],
            loading: false,
          });
          return;
        }
        if (result.kind === 'company-page') {
          log.info('GENERIC_INTENT_DETECT: detected company page', {
            signalCount: Array.isArray(result.signals) ? result.signals.length : 0,
          });
          applyResult({
            hasJd: false,
            hasCompany: true,
            jdText: null,
            method: null,
            jobTitle: null,
            company: typeof result.companyName === 'string' ? result.companyName : null,
            companySignals: Array.isArray(result.signals)
              ? (result.signals.filter((s) => typeof s === 'string') as string[])
              : [],
            loading: false,
          });
          return;
        }
        applyResult(EMPTY_RESULT);
      } catch {
        log.warn('GENERIC_INTENT_DETECT: request failed');
        applyResult(EMPTY_RESULT);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [args.enabled, args.tabId, args.tabUrl, args.agentId, args.adapterIntent]);

  return state;
}
