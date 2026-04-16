// SPDX-License-Identifier: MIT
/**
 * useTheme -- React hook for reading and writing the user's theme preference.
 *
 * On mount:
 *   1. Reads the stored preference from chrome.storage.local.
 *   2. Applies the resolved theme to document.documentElement immediately.
 *   3. Stores the disposer returned by applyTheme in a ref.
 *
 * On setTheme(pref):
 *   1. Disposes the current matchMedia listener (if any).
 *   2. Calls applyTheme with the new preference.
 *   3. Writes the new preference to storage.
 *   4. Updates component state so dependent UI re-renders.
 *
 * On unmount: disposes the current listener to prevent leaks.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type ThemePreference,
  readThemePreference,
  writeThemePreference,
  applyTheme,
} from '@/src/shared/theme';

export interface UseThemeResult {
  readonly theme: ThemePreference;
  readonly setTheme: (pref: ThemePreference) => Promise<void>;
  readonly loading: boolean;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [loading, setLoading] = useState<boolean>(true);
  const disposerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    void readThemePreference().then((pref) => {
      if (cancelled) return;
      disposerRef.current?.();
      disposerRef.current = applyTheme(pref);
      setThemeState(pref);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      disposerRef.current?.();
      disposerRef.current = null;
    };
  }, []);

  const setTheme = useCallback(async (pref: ThemePreference): Promise<void> => {
    disposerRef.current?.();
    disposerRef.current = applyTheme(pref);
    setThemeState(pref);
    await writeThemePreference(pref);

    // Broadcast to other open extension pages (sidepanel, options) so they
    // can pick up the change without a reload. Best-effort -- ignore failures.
    const g = globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendMessage?: (msg: unknown) => Promise<unknown>;
        };
      };
    };
    if (g.chrome?.runtime?.sendMessage) {
      void g.chrome.runtime
        .sendMessage({ key: 'THEME_CHANGED', data: { pref } })
        .catch(() => undefined);
    }
  }, []);

  return { theme, setTheme, loading };
}
