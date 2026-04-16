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

    // Listen for THEME_CHANGED broadcasts so other extension surfaces
    // (e.g. sidepanel) re-apply the theme when the popup flips it, and
    // vice-versa. Also listen for chrome.storage.local changes as a
    // fallback in case the sender cannot broadcast (e.g. popup already
    // closed before the runtime message fires).
    const g = globalThis as unknown as {
      chrome?: {
        runtime?: {
          onMessage?: {
            addListener: (fn: (msg: unknown) => void) => void;
            removeListener: (fn: (msg: unknown) => void) => void;
          };
        };
        storage?: {
          onChanged?: {
            addListener: (
              fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
            ) => void;
            removeListener: (
              fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
            ) => void;
          };
        };
      };
    };

    const applyIfValid = (raw: unknown): void => {
      if (raw !== 'light' && raw !== 'dark' && raw !== 'system') return;
      disposerRef.current?.();
      disposerRef.current = applyTheme(raw);
      setThemeState(raw);
    };

    const onMessage = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: { pref?: unknown } };
      if (env.key !== 'THEME_CHANGED') return;
      applyIfValid(env.data?.pref);
    };
    const onStorage = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area !== 'local') return;
      const change = changes['llmc.theme'];
      if (change === undefined) return;
      applyIfValid(change.newValue);
    };

    g.chrome?.runtime?.onMessage?.addListener(onMessage);
    g.chrome?.storage?.onChanged?.addListener(onStorage);

    return () => {
      cancelled = true;
      disposerRef.current?.();
      disposerRef.current = null;
      g.chrome?.runtime?.onMessage?.removeListener(onMessage);
      g.chrome?.storage?.onChanged?.removeListener(onStorage);
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
