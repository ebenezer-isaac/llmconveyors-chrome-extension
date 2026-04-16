// SPDX-License-Identifier: MIT
/**
 * Theme preference utilities for the LLM Conveyors extension.
 *
 * Stores the user's theme preference in chrome.storage.local under
 * THEME_STORAGE_KEY and applies it to document.documentElement by toggling
 * the 'dark' class that Tailwind's dark: variant reads.
 *
 * Invariants:
 *   - Only the three literal values 'light' | 'dark' | 'system' are valid.
 *   - Invalid values read from storage are treated as 'system' (safe default).
 *   - chrome.storage.local absence (test env) degrades gracefully.
 *   - Every applyTheme call returns a disposer. Callers MUST call it before
 *     re-applying to avoid orphaned matchMedia listeners.
 */

import { createLogger } from '@/src/background/log';

const logger = createLogger('shared.theme');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'llmc.theme';

const VALID_PREFS = new Set<ThemePreference>(['light', 'dark', 'system']);

function isValidPref(v: unknown): v is ThemePreference {
  return typeof v === 'string' && VALID_PREFS.has(v as ThemePreference);
}

// ---------------------------------------------------------------------------
// chrome.storage.local helpers
// ---------------------------------------------------------------------------

type StorageLocal = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function getStorageLocal(): StorageLocal | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLocal } };
  };
  return g.chrome?.storage?.local ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the stored theme preference. Returns 'system' when chrome.storage is
 * unavailable or the stored value is missing / invalid.
 */
export async function readThemePreference(): Promise<ThemePreference> {
  const storage = getStorageLocal();
  if (storage === null) {
    return 'system';
  }
  try {
    const result = await storage.get([THEME_STORAGE_KEY]);
    const raw = result[THEME_STORAGE_KEY];
    if (isValidPref(raw)) {
      return raw;
    }
    return 'system';
  } catch (err) {
    logger.warn('readThemePreference failed; defaulting to system', { err });
    return 'system';
  }
}

/**
 * Write the theme preference to chrome.storage.local.
 * Validates the value before writing; logs a warning and no-ops for invalid input.
 */
export async function writeThemePreference(pref: ThemePreference): Promise<void> {
  if (!isValidPref(pref)) {
    logger.warn('writeThemePreference received invalid pref; ignoring', {
      pref: String(pref),
    });
    return;
  }
  const storage = getStorageLocal();
  if (storage === null) {
    return;
  }
  try {
    await storage.set({ [THEME_STORAGE_KEY]: pref });
  } catch (err) {
    logger.warn('writeThemePreference failed', { err });
  }
}

/**
 * Resolve and apply the preferred theme to document.documentElement.
 *
 * Returns a disposer that removes any matchMedia listener when called.
 * When pref === 'system', subscribes to OS prefers-color-scheme changes.
 * For 'light' / 'dark', sets the class directly; the disposer is a no-op.
 *
 * Callers MUST call the previous disposer before calling applyTheme again
 * to avoid accumulating orphaned listeners.
 */
export function applyTheme(pref: ThemePreference): () => void {
  const root = document.documentElement;

  if (pref === 'dark') {
    root.classList.add('dark');
    return () => undefined;
  }

  if (pref === 'light') {
    root.classList.remove('dark');
    return () => undefined;
  }

  // pref === 'system'
  const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');

  function applyFromMq(matches: boolean): void {
    if (matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  applyFromMq(mq.matches);

  function onChange(e: MediaQueryListEvent): void {
    applyFromMq(e.matches);
  }

  mq.addEventListener('change', onChange);

  return () => {
    mq.removeEventListener('change', onChange);
  };
}
