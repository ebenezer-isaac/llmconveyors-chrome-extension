// SPDX-License-Identifier: MIT
/**
 * React hook wrapping the GENERATION_* protocol.
 *
 * Exposes `start` (send GENERATION_START) as the primary action, plus
 * transient `busy` and `error` state for inline UI feedback. The hook is
 * framework-agnostic in the sense that it does not care which agent is
 * active - callers pass `agentId` and a pre-built payload.
 */

import { useCallback, useState } from 'react';
import { createLogger } from '@/src/background/log';
import type { AgentId } from '@/src/background/agents';

const log = createLogger('popup:use-generation');

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

export interface StartGenerationArgs {
  readonly agentId: AgentId;
  readonly payload: Record<string, unknown>;
}

export type StartGenerationOutcome =
  | { readonly ok: true; readonly generationId: string; readonly sessionId: string }
  | { readonly ok: false; readonly reason: string };

export interface UseGenerationResult {
  readonly busy: boolean;
  readonly error: string | null;
  readonly lastGenerationId: string | null;
  readonly start: (args: StartGenerationArgs) => Promise<StartGenerationOutcome>;
}

export function useGeneration(): UseGenerationResult {
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerationId, setLastGenerationId] = useState<string | null>(null);

  const start = useCallback(
    async (args: StartGenerationArgs): Promise<StartGenerationOutcome> => {
      setBusy(true);
      setError(null);
      const runtime = getRuntime();
      if (runtime === null) {
        setBusy(false);
        setError('Runtime unavailable');
        return { ok: false, reason: 'no-runtime' };
      }
      try {
        const raw = await runtime.sendMessage({
          key: 'GENERATION_START',
          data: { agent: args.agentId, payload: args.payload },
        });
        if (!raw || typeof raw !== 'object') {
          setError('Empty response');
          return { ok: false, reason: 'empty-response' };
        }
        const response = raw as Record<string, unknown>;
        if (response.ok === true) {
          const generationId = String(response.generationId ?? '');
          const sessionId = String(response.sessionId ?? '');
          setLastGenerationId(generationId);
          // Fire-and-forget subscribe. The side panel also subscribes so we
          // get at-most-one active stream per generationId.
          void runtime.sendMessage({
            key: 'GENERATION_SUBSCRIBE',
            data: { generationId },
          });
          return { ok: true, generationId, sessionId };
        }
        const reason = typeof response.reason === 'string' ? response.reason : 'unknown';
        setError(reason);
        return { ok: false, reason };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('GENERATION_START failed', { error: message });
        setError(message);
        return { ok: false, reason: message };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, error, lastGenerationId, start };
}
