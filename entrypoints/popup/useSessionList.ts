// SPDX-License-Identifier: MIT
/**
 * Popup hook that fetches the signed-in user's recent sessions via the
 * SESSION_LIST protocol key. The background serves from a 30s cache; this
 * hook subscribes to GENERATION_COMPLETE broadcasts so the list refreshes
 * immediately after a generation finishes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionListItem } from '@/src/background/messaging/schemas/session-list.schema';

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
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

export interface UseSessionListResult {
  readonly items: readonly SessionListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: (opts?: { readonly force?: boolean }) => Promise<void>;
}

function isListItem(value: unknown): value is SessionListItem {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.sessionId === 'string' && typeof obj.status === 'string';
}

export function useSessionList(
  enabled: boolean,
  limit: number = 5,
): UseSessionListResult {
  const [items, setItems] = useState<readonly SessionListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const refresh = useCallback(
    async (opts?: { readonly force?: boolean }): Promise<void> => {
      const runtime = getRuntime();
      if (runtime === null) {
        if (mountedRef.current) {
          setError('Runtime unavailable');
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const response = await runtime.sendMessage({
          key: 'SESSION_LIST',
          data: { limit, forceRefresh: opts?.force === true },
        });
        if (!mountedRef.current) return;
        if (!response || typeof response !== 'object') {
          setError('Empty response');
          return;
        }
        const env = response as Record<string, unknown>;
        if (env.ok === true) {
          const rawItems = Array.isArray(env.items) ? env.items : [];
          const filtered = rawItems.filter(isListItem) as SessionListItem[];
          setItems(filtered);
          setError(null);
          return;
        }
        const reason = typeof env.reason === 'string' ? env.reason : 'unknown';
        if (reason === 'signed-out') {
          setItems([]);
          setError(null);
          return;
        }
        setError(reason);
      } catch (err: unknown) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      setItems([]);
      return () => {
        mountedRef.current = false;
      };
    }
    void refresh();
    const runtime = getRuntime();
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string };
      if (env.key === 'GENERATION_COMPLETE' || env.key === 'GENERATION_STARTED') {
        void refresh({ force: true });
      }
    };
    runtime?.onMessage.addListener(listener);
    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(listener);
    };
  }, [enabled, refresh]);

  return { items, loading, error, refresh };
}
