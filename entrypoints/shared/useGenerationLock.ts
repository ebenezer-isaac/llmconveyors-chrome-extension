// SPDX-License-Identifier: MIT
/**
 * Reads whether a generation is currently active for the given
 * { agentId + tabUrl } pair. The source of truth is SESSION_BINDING_GET
 * with `activeOnly: true`, backed by background in-memory generation locks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentId } from '@/src/background/agents';
import { SessionBindingEntrySchema } from '@/src/background/messaging/schemas/session-binding.schema';

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage?: {
    addListener: (fn: (msg: unknown) => void) => void;
    removeListener: (fn: (msg: unknown) => void) => void;
  };
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function isWebUrl(url: string | null): url is string {
  if (url === null) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export interface UseGenerationLockOptions {
  readonly agentId: AgentId | null;
  readonly tabUrl: string | null;
  readonly enabled?: boolean;
}

export interface UseGenerationLockResult {
  readonly active: boolean;
  readonly checking: boolean;
  readonly generationId: string | null;
  readonly sessionId: string | null;
  readonly refresh: () => Promise<void>;
}

export function useGenerationLock({
  agentId,
  tabUrl,
  enabled = true,
}: UseGenerationLockOptions): UseGenerationLockResult {
  const [active, setActive] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const refreshSeqRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    const sequence = refreshSeqRef.current + 1;
    refreshSeqRef.current = sequence;

    if (!enabled || agentId === null || !isWebUrl(tabUrl)) {
      if (!mountedRef.current || sequence !== refreshSeqRef.current) return;
      setChecking(false);
      setActive(false);
      setGenerationId(null);
      setSessionId(null);
      return;
    }

    const runtime = getRuntime();
    if (runtime === null) {
      if (!mountedRef.current || sequence !== refreshSeqRef.current) return;
      setChecking(false);
      setActive(false);
      setGenerationId(null);
      setSessionId(null);
      return;
    }

    setChecking(true);
    try {
      const raw = await runtime.sendMessage({
        key: 'SESSION_BINDING_GET',
        data: {
          url: tabUrl,
          agentId,
          activeOnly: true,
        },
      });
      if (!mountedRef.current || sequence !== refreshSeqRef.current) return;

      const parsed = SessionBindingEntrySchema.safeParse(raw);
      if (!parsed.success) {
        setActive(false);
        setGenerationId(null);
        setSessionId(null);
        return;
      }

      setActive(true);
      setGenerationId(parsed.data.generationId);
      setSessionId(parsed.data.sessionId);
    } catch {
      if (!mountedRef.current || sequence !== refreshSeqRef.current) return;
      setActive(false);
      setGenerationId(null);
      setSessionId(null);
    } finally {
      if (mountedRef.current && sequence === refreshSeqRef.current) {
        setChecking(false);
      }
    }
  }, [agentId, enabled, tabUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const runtime = getRuntime();
    const channel = runtime?.onMessage;
    if (!channel) return;

    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const key = (msg as { key?: unknown }).key;
      if (key !== 'GENERATION_STARTED' && key !== 'GENERATION_COMPLETE') return;
      void refresh();
    };

    channel.addListener(listener);
    return () => channel.removeListener(listener);
  }, [refresh]);

  return { active, checking, generationId, sessionId, refresh };
}
