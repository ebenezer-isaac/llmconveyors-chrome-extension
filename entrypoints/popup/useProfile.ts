// SPDX-License-Identifier: MIT
/**
 * React hook that exposes the signed-in user's profile identity fields
 * (email, displayName, photoURL) in the popup. Fetches via the PROFILE_GET
 * runtime message which the background worker fulfils by calling the same
 * `/api/v1/settings/profile` endpoint as useCredits.
 *
 * The hook tolerates a missing chrome.runtime (non-extension test pages),
 * sendMessage rejections, and malformed responses by keeping the result
 * null rather than crashing. Re-fetches on window focus so the popup picks
 * up profile edits made elsewhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientProfileSnapshot } from '@/src/background/messaging/protocol-types';

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

function isClientProfileSnapshot(value: unknown): value is ClientProfileSnapshot {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    email?: unknown;
    displayName?: unknown;
    photoURL?: unknown;
  };
  const nullableString = (raw: unknown): boolean =>
    raw === null || typeof raw === 'string';
  return (
    nullableString(v.email) &&
    nullableString(v.displayName) &&
    nullableString(v.photoURL)
  );
}

export interface UseProfileResult {
  readonly profile: ClientProfileSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<ClientProfileSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const fetchProfile = useCallback(async (): Promise<void> => {
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
        key: 'PROFILE_GET',
        data: {},
      });
      if (!mountedRef.current) return;
      if (isClientProfileSnapshot(response)) {
        setProfile(response);
        setError(null);
      } else {
        setError('invalid profile response');
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
    void fetchProfile();

    const onFocus = (): void => {
      void fetchProfile();
    };
    globalThis.addEventListener?.('focus', onFocus);

    return () => {
      mountedRef.current = false;
      globalThis.removeEventListener?.('focus', onFocus);
    };
  }, [fetchProfile]);

  return { profile, loading, error, refresh: fetchProfile };
}
