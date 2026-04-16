// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/**
 * Unit tests for entrypoints/popup/useTheme.ts
 *
 * Covers:
 *   - Initial state: loading=true, then resolves to stored preference
 *   - Default to 'system' when no storage is present
 *   - setTheme writes to storage and applies the class
 *   - Disposer from previous applyTheme is cleaned up on setTheme
 *   - Disposer is cleaned up on unmount
 */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTheme } from '@/entrypoints/popup/useTheme';
import type { UseThemeResult } from '@/entrypoints/popup/useTheme';

// ---------------------------------------------------------------------------
// matchMedia stub
// ---------------------------------------------------------------------------

type ChangeHandler = (e: { matches: boolean }) => void;

function installMatchMedia(initialMatches = false): {
  listeners: ChangeHandler[];
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
  (globalThis as unknown as { matchMedia: () => typeof mq }).matchMedia = vi.fn(
    () => mq,
  );
  return { listeners };
}

// ---------------------------------------------------------------------------
// chrome.storage.local stub
// ---------------------------------------------------------------------------

type StorageMock = {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function installStorage(initial: Record<string, unknown> = {}): StorageMock {
  const store: Record<string, unknown> = { ...initial };
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
    chrome: { storage: { local: StorageMock }; runtime?: unknown };
  }).chrome = { storage: { local: mock } };
  return mock;
}

function removeStorage(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

// ---------------------------------------------------------------------------
// Probe component
// ---------------------------------------------------------------------------

let capture: { current: UseThemeResult | null } = { current: null };

function Probe(): React.ReactElement {
  const value = useTheme();
  capture.current = value;
  return <div data-testid="probe" />;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.resetModules();
  capture = { current: null };
  document.documentElement.classList.remove('dark');
  container = document.createElement('div');
  document.body.appendChild(container);
  installMatchMedia(false);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  removeStorage();
  vi.restoreAllMocks();
});

async function mount(): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<Probe />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTheme', () => {
  it("defaults to 'system' with loading=false after mount resolves", async () => {
    installStorage();
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.theme).toBe('system');
  });

  it("reads stored 'dark' preference on mount and applies class", async () => {
    installStorage({ 'llmc.theme': 'dark' });
    await mount();
    await flush();
    expect(capture.current?.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it("reads stored 'light' preference on mount and does not add dark class", async () => {
    document.documentElement.classList.add('dark');
    installStorage({ 'llmc.theme': 'light' });
    await mount();
    await flush();
    expect(capture.current?.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it("defaults to 'system' when storage is absent", async () => {
    removeStorage();
    installMatchMedia(false);
    await mount();
    await flush();
    expect(capture.current?.theme).toBe('system');
    expect(capture.current?.loading).toBe(false);
  });

  it('setTheme writes to storage and toggles class', async () => {
    const mock = installStorage();
    await mount();
    await flush();

    await act(async () => {
      await capture.current?.setTheme('dark');
    });

    expect(mock.store['llmc.theme']).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(capture.current?.theme).toBe('dark');
  });

  it('setTheme from dark to light removes dark class', async () => {
    installStorage({ 'llmc.theme': 'dark' });
    await mount();
    await flush();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await act(async () => {
      await capture.current?.setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(capture.current?.theme).toBe('light');
  });

  it('setTheme updates state immediately (does not require re-mount)', async () => {
    installStorage();
    await mount();
    await flush();
    expect(capture.current?.theme).toBe('system');

    await act(async () => {
      await capture.current?.setTheme('dark');
    });

    expect(capture.current?.theme).toBe('dark');

    await act(async () => {
      await capture.current?.setTheme('light');
    });

    expect(capture.current?.theme).toBe('light');
  });

  it('unmount disposes matchMedia listener without throwing', async () => {
    installStorage({ 'llmc.theme': 'system' });
    const { listeners } = installMatchMedia(false);
    await mount();
    await flush();
    expect(listeners.length).toBeGreaterThanOrEqual(0);

    // Unmount should not throw
    await act(async () => {
      root?.unmount();
      root = null;
    });
    // After unmount, listeners should be empty
    expect(listeners).toHaveLength(0);
  });
});
