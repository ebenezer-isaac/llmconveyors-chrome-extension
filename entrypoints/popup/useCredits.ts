// SPDX-License-Identifier: MIT
/**
 * React hook that exposes the current user's credit balance and tier in the
 * popup.
 *
 * On mount, dispatches a CREDITS_GET runtime message to the background worker,
 * which calls the backend /api/v1/settings/profile endpoint. A background
 * broadcast on the CREDITS_UPDATED / CREDITS_STATE key, if delivered, will
 * trigger a refresh; the hook also re-fetches on window focus so the popup
 * picks up post-fill debits the next time the user opens it.
 *
 * Defensive: the hook tolerates a missing chrome.runtime (non-extension test
 * pages), sendMessage rejections, and malformed responses by remaining in the
 * `loading === true, credits === null` state rather than crashing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { t } from '@/src/shared/i18n';

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

function isClientCreditsSnapshot(value: unknown): value is ClientCreditsSnapshot {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    credits?: unknown;
    tier?: unknown;
    byoKeyEnabled?: unknown;
  };
  if (typeof v.credits !== 'number' || !Number.isFinite(v.credits)) return false;
  if (v.tier !== 'free' && v.tier !== 'byo') return false;
  if (typeof v.byoKeyEnabled !== 'boolean') return false;
  return true;
}

export interface UseCreditsResult {
  readonly credits: ClientCreditsSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useCredits(): UseCreditsResult {
  const [credits, setCredits] = useState<ClientCreditsSnapshot | null>(null);
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
      if (isClientCreditsSnapshot(response)) {
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
      if (isClientCreditsSnapshot(env.data)) {
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

/**
 * Localised display label for the tier badge shown in the popup.
 *
 * Mirrors the web app helper in `src/hooks/useCredits.tsx` but returns an
 * i18n-backed string so the extension surface respects the user's UI locale.
 */
export function getTierLabel(
  tier: ClientCreditsSnapshot['tier'],
  byoKeyEnabled: boolean,
): string {
  if (tier === 'byo' && byoKeyEnabled) return t('userMenu_tierByoEnabled');
  if (tier === 'byo') return t('userMenu_tierByo');
  return t('userMenu_tierFree');
}

/**
 * Format a credit balance for display. Defensive against NaN / Infinity /
 * negative / fractional inputs; always returns a thousands-separated integer
 * string via the en-US locale so the rendered value matches the web app's
 * `formatCredits` helper byte-for-byte.
 */
export function formatCredits(credits: number): string {
  const safe =
    Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  return safe.toLocaleString('en-US');
}
