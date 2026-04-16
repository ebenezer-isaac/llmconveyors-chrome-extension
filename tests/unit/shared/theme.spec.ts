// SPDX-License-Identifier: MIT
/**
 * Unit tests for src/shared/theme.ts
 *
 * Covers:
 *   - applyTheme('light') removes 'dark' class
 *   - applyTheme('dark') adds 'dark' class
 *   - applyTheme('system') reads matchMedia and syncs class
 *   - applyTheme('system') subscribes and reacts to OS change events
 *   - disposer removes the matchMedia listener (no double-call side effects)
 *   - readThemePreference returns 'system' when chrome.storage is absent
 *   - readThemePreference returns stored valid pref
 *   - readThemePreference returns 'system' for invalid stored value
 *   - writeThemePreference writes to chrome.storage.local
 *   - writeThemePreference is a no-op when storage is absent
 *   - round-trip: write then read returns the same value
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers -- chrome.storage.local mock
// ---------------------------------------------------------------------------

type StorageMock = {
  store: Record<string, unknown>;
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function installStorage(): StorageMock {
  const store: Record<string, unknown> = {};
  const mock: StorageMock = {
    store,
    get: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(store, key)) {
          result[key] = store[key];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
  };
  (globalThis as unknown as {
    chrome: { storage: { local: StorageMock } };
  }).chrome = { storage: { local: mock } };
  return mock;
}

function removeStorage(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

// ---------------------------------------------------------------------------
// Helpers -- matchMedia mock
// ---------------------------------------------------------------------------

type ChangeHandler = (e: { matches: boolean }) => void;

function installMatchMedia(initialMatches: boolean): {
  listeners: ChangeHandler[];
  fire: (matches: boolean) => void;
} {
  const listeners: ChangeHandler[] = [];
  const mq = {
    matches: initialMatches,
    addEventListener: vi.fn((_: string, fn: ChangeHandler) => {
      listeners.push(fn);
    }),
    removeEventListener: vi.fn((_: string, fn: ChangeHandler) => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
  };
  (globalThis as unknown as { matchMedia: (q: string) => typeof mq }).matchMedia =
    vi.fn(() => mq);
  return {
    listeners,
    fire: (matches: boolean) => {
      for (const fn of [...listeners]) {
        fn({ matches });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  removeStorage();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  it('adds dark class for dark preference', async () => {
    installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    dispose();
    // class should remain after dispose (light/dark are statically applied)
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class for light preference', async () => {
    installMatchMedia(false);
    document.documentElement.classList.add('dark');
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    dispose(); // no-op
  });

  it('applies dark class immediately for system when OS is dark', async () => {
    installMatchMedia(true);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    dispose();
  });

  it('removes dark class immediately for system when OS is light', async () => {
    document.documentElement.classList.add('dark');
    installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    dispose();
  });

  it('reacts to OS colour scheme changes when pref is system', async () => {
    const { listeners, fire } = installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fire(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fire(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    dispose();
    expect(listeners).toHaveLength(0);
  });

  it('disposer removes the matchMedia change listener', async () => {
    const { listeners, fire } = installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('system');
    expect(listeners).toHaveLength(1);
    dispose();
    expect(listeners).toHaveLength(0);
    // After dispose, OS changes no longer affect the class
    document.documentElement.classList.remove('dark');
    fire(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('light disposer is a no-op (does not throw)', async () => {
    installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('light');
    expect(() => dispose()).not.toThrow();
  });

  it('dark disposer is a no-op (does not throw)', async () => {
    installMatchMedia(false);
    const { applyTheme } = await import('@/src/shared/theme');
    const dispose = applyTheme('dark');
    expect(() => dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// readThemePreference
// ---------------------------------------------------------------------------

describe('readThemePreference', () => {
  it("returns 'system' when chrome.storage is absent", async () => {
    removeStorage();
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('system');
  });

  it("returns 'system' when key is not in storage", async () => {
    installStorage();
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('system');
  });

  it("returns 'system' when stored value is invalid", async () => {
    const mock = installStorage();
    mock.store['llmc.theme'] = 'invalid-value';
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('system');
  });

  it("returns 'dark' when 'dark' is stored", async () => {
    const mock = installStorage();
    mock.store['llmc.theme'] = 'dark';
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('dark');
  });

  it("returns 'light' when 'light' is stored", async () => {
    const mock = installStorage();
    mock.store['llmc.theme'] = 'light';
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('light');
  });

  it("returns 'system' when storage.get rejects", async () => {
    (globalThis as unknown as {
      chrome: { storage: { local: { get: () => Promise<never>; set: () => Promise<void> } } };
    }).chrome = {
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('storage error');
          }),
          set: vi.fn(async () => undefined),
        },
      },
    };
    const { readThemePreference } = await import('@/src/shared/theme');
    const result = await readThemePreference();
    expect(result).toBe('system');
  });
});

// ---------------------------------------------------------------------------
// writeThemePreference
// ---------------------------------------------------------------------------

describe('writeThemePreference', () => {
  it('writes the preference to chrome.storage.local', async () => {
    const mock = installStorage();
    const { writeThemePreference } = await import('@/src/shared/theme');
    await writeThemePreference('dark');
    expect(mock.store['llmc.theme']).toBe('dark');
  });

  it('is a no-op when chrome.storage is absent', async () => {
    removeStorage();
    const { writeThemePreference } = await import('@/src/shared/theme');
    await expect(writeThemePreference('light')).resolves.toBeUndefined();
  });

  it('round-trips: write dark then read returns dark', async () => {
    installStorage();
    const { writeThemePreference, readThemePreference } = await import(
      '@/src/shared/theme'
    );
    await writeThemePreference('dark');
    const result = await readThemePreference();
    expect(result).toBe('dark');
  });

  it('round-trips: write light then read returns light', async () => {
    installStorage();
    const { writeThemePreference, readThemePreference } = await import(
      '@/src/shared/theme'
    );
    await writeThemePreference('light');
    const result = await readThemePreference();
    expect(result).toBe('light');
  });

  it('round-trips: write system then read returns system', async () => {
    installStorage();
    const { writeThemePreference, readThemePreference } = await import(
      '@/src/shared/theme'
    );
    await writeThemePreference('system');
    const result = await readThemePreference();
    expect(result).toBe('system');
  });
});
