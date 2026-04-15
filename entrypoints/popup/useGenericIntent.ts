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

type RuntimeMessenger = { sendMessage: (m: unknown) => Promise<unknown> };
function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

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

export function useGenericIntent(args: {
  readonly enabled: boolean;
  readonly tabId: number | null;
  readonly adapterIntent: DetectedIntent | null;
  readonly agentId: AgentId | null;
}): UseGenericIntentResult {
  const [state, setState] = useState<UseGenericIntentResult>({
    hasJd: false,
    hasCompany: false,
    jdText: null,
    method: null,
    jobTitle: null,
    company: null,
    companySignals: [],
    loading: false,
  });
  const lastFetchedRef = useRef<string>('');

  useEffect(() => {
    if (!args.enabled || args.tabId === null || args.agentId === null) {
      return;
    }
    // If the adapter-based detector already found a match, don't bother.
    const adapterMatched =
      args.adapterIntent !== null && args.adapterIntent.kind !== 'unknown';
    if (adapterMatched) {
      return;
    }
    const key = `${args.tabId}:${args.agentId}`;
    if (lastFetchedRef.current === key) return;
    lastFetchedRef.current = key;

    setState((prev) => ({ ...prev, loading: true }));
    const runtime = getRuntime();
    if (runtime === null) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    const run = async (): Promise<void> => {
      try {
        const raw = await runtime.sendMessage({
          key: 'GENERIC_INTENT_DETECT',
          data: { tabId: args.tabId, agent: args.agentId },
        });
        if (!raw || typeof raw !== 'object') {
          setState({
            hasJd: false,
            hasCompany: false,
            jdText: null,
            method: null,
            jobTitle: null,
            company: null,
            companySignals: [],
            loading: false,
          });
          return;
        }
        const env = raw as Record<string, unknown>;
        if (env.ok !== true || !env.result || typeof env.result !== 'object') {
          setState({
            hasJd: false,
            hasCompany: false,
            jdText: null,
            method: null,
            jobTitle: null,
            company: null,
            companySignals: [],
            loading: false,
          });
          return;
        }
        const result = env.result as Record<string, unknown>;
        if (result.kind === 'job-description') {
          setState({
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
          setState({
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
        setState({
          hasJd: false,
          hasCompany: false,
          jdText: null,
          method: null,
          jobTitle: null,
          company: null,
          companySignals: [],
          loading: false,
        });
      } catch {
        setState({
          hasJd: false,
          hasCompany: false,
          jdText: null,
          method: null,
          jobTitle: null,
          company: null,
          companySignals: [],
          loading: false,
        });
      }
    };
    void run();
  }, [args.enabled, args.tabId, args.agentId, args.adapterIntent]);

  return state;
}
