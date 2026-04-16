// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '@/entrypoints/sidepanel/ThemeToggle';

// Stub chrome.storage.local so useTheme's read/write calls resolve
// deterministically in the test environment.
function mountChromeStorage(initial: string): () => { setCalls: Array<Record<string, unknown>> } {
  const setCalls: Array<Record<string, unknown>> = [];
  const store: Record<string, unknown> = { 'llmc.theme': initial };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          setCalls.push(items);
          Object.assign(store, items);
        },
      },
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
    runtime: {
      sendMessage: async () => undefined,
      onMessage: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
  };
  return () => ({ setCalls });
}

function unmountChrome(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('ThemeToggle', () => {
  afterEach(() => {
    cleanup();
    unmountChrome();
    vi.restoreAllMocks();
  });

  it('starts from the stored preference and cycles light -> dark -> system on click', async () => {
    const inspect = mountChromeStorage('light');
    render(<ThemeToggle />);
    // wait for initial readThemePreference() to resolve + state to flush
    await vi.waitFor(() => {
      expect(screen.getByTestId('sidepanel-theme-toggle').getAttribute('data-theme')).toBe(
        'light',
      );
    });

    fireEvent.click(screen.getByTestId('sidepanel-theme-toggle'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('sidepanel-theme-toggle').getAttribute('data-theme')).toBe(
        'dark',
      );
    });

    fireEvent.click(screen.getByTestId('sidepanel-theme-toggle'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('sidepanel-theme-toggle').getAttribute('data-theme')).toBe(
        'system',
      );
    });

    fireEvent.click(screen.getByTestId('sidepanel-theme-toggle'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('sidepanel-theme-toggle').getAttribute('data-theme')).toBe(
        'light',
      );
    });

    const { setCalls } = inspect();
    // At least one storage write happened per click.
    expect(setCalls.length).toBeGreaterThanOrEqual(3);
  });
});
