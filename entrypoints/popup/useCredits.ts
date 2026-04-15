// SPDX-License-Identifier: MIT
/**
 * React hook that exposes the current user's credit balance in the popup.
 *
 * On mount, dispatches a CREDITS_GET runtime message to the background worker,
 * which calls the backend /api/v1/settings/usage-summary endpoint (see the A5
 * handler in src/background/messaging/handlers.ts). A background broadcast on
 * the CREDITS_UPDATED key, if delivered, will trigger a refresh; the hook also
 * re-fetches on window focus so the popup picks up post-fill debits the next
 * time the user opens it.
 *
 * Defensive: the hook tolerates a missing chrome.runtime (non-extension test
 * pages), sendMessage rejections, and malformed responses by remaining in the
 * `loading === true, balance === null` state rather than crashing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditsState } from '@/src/background/messaging/protocol';

type MessageListener = (msg: unknown) => void;

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: MessageListener): void;
    removeListener(listener: MessageListener): void;
  };
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function isCreditsState(value: unknown): value is CreditsState {
  if (value === null || typeof value !== 'object') return false;
  const v = value as { balance?: unknown; plan?: unknown; resetAt?: unknown };
  if (typeof v.balance !== 'number' || !Number.isFinite(v.balance)) return false;
  if (typeof v.plan !== 'string') return false;
  if (v.resetAt !== null && typeof v.resetAt !== 'number') return false;
  return true;
}

export interface UseCreditsResult {
  readonly credits: CreditsState | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useCredits(): UseCreditsResult {
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const fetchCredits = useCallback(async (): Promise<void> => {
    const runtime = getRuntime();
    if (runtime === null) {
      if (mountedRef.current) {
        setLoading(false);
        setError('runtime unavailable');
      }
      return;
    }
    try {
      const response = await runtime.sendMessage({
        key: 'CREDITS_GET',
        data: {},
      });
      if (!mountedRef.current) return;
      if (isCreditsState(response)) {
        setCredits(response);
        setError(null);
      } else {
        setError('invalid credits response');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchCredits();

    const runtime = getRuntime();
    const onMessage: MessageListener = (msg) => {
      if (msg === null || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: unknown };
      if (env.key !== 'CREDITS_UPDATED' && env.key !== 'CREDITS_STATE') return;
      if (isCreditsState(env.data)) {
        if (mountedRef.current) setCredits(env.data);
      }
    };
    runtime?.onMessage.addListener(onMessage);

    const onFocus = (): void => {
      void fetchCredits();
    };
    globalThis.addEventListener?.('focus', onFocus);

    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(onMessage);
      globalThis.removeEventListener?.('focus', onFocus);
    };
  }, [fetchCredits]);

  return { credits, loading, error, refresh: fetchCredits };
}
