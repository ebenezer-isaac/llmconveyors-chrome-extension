// SPDX-License-Identifier: MIT
/**
 * Sidepanel smoke integration test.
 *
 * Renders the sidepanel App against a happy-dom environment with a
 * fake chrome surface that exposes:
 *   - chrome.tabs.query returning the bound tab
 *   - chrome.runtime.sendMessage returning a detected intent
 *   - chrome.storage.session seeded with keywords + autofill history
 *
 * Asserts every hook resolves without throwing, the three primary
 * sections render their populated data states, and unmount is clean.
 * This is a cross-module smoke test; the per-hook unit suites cover
 * branches exhaustively.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

type Listener = (msg: unknown) => void;
type TabsListener = (info: { tabId: number }) => void;
type ChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => void;

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (fn: Listener) => void;
      removeListener: (fn: Listener) => void;
    };
  };
  tabs: {
    query: (info: unknown) => Promise<Array<{ id?: number }>>;
    onActivated: {
      addListener: (fn: TabsListener) => void;
      removeListener: (fn: TabsListener) => void;
    };
  };
  storage: {
    session: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    onChanged: {
      addListener: (fn: ChangeListener) => void;
      removeListener: (fn: ChangeListener) => void;
    };
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Sidepanel smoke', () => {
  it('renders header, jd summary, keyword list, and history with live data', async () => {
    const TAB_ID = 55;
    const storageData: Record<string, unknown> = {
      [`llmc.keywords.${TAB_ID}`]: [
        { term: 'TypeScript', category: 'tool', score: 1.0, canonicalForm: 'typescript' },
        { term: 'React', category: 'tool', score: 0.9, canonicalForm: 'react' },
      ],
      [`llmc.autofill-history.${TAB_ID}`]: [
        {
          at: 1_700_000_000_000,
          atsKind: 'greenhouse',
          fieldsFilled: 4,
          fieldsSkipped: 1,
        },
      ],
      'llmc.session.v1': {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
        userId: 'user_smoke_001',
      },
    };

    const listeners: Listener[] = [];
    const tabListeners: TabsListener[] = [];
    const changeListeners: ChangeListener[] = [];
    const fake: FakeChrome = {
      runtime: {
        sendMessage: async (msg) => {
          const env = msg as { key?: string; data?: unknown };
          if (env.key === 'AUTH_STATUS') {
            return { signedIn: true, userId: 'user_smoke_001' };
          }
          if (env.key === 'INTENT_GET') {
            return {
              kind: 'greenhouse',
              pageKind: 'job-posting',
              url: 'https://boards.greenhouse.io/acme/jobs/1',
              jobTitle: 'Staff Engineer',
              company: 'Acme Co',
              detectedAt: 1_700_000_000_000,
            };
          }
          return null;
        },
        onMessage: {
          addListener: (fn) => listeners.push(fn),
          removeListener: (fn) => {
            const i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
          },
        },
      },
      tabs: {
        query: async () => [{ id: TAB_ID }],
        onActivated: {
          addListener: (fn) => tabListeners.push(fn),
          removeListener: (fn) => {
            const i = tabListeners.indexOf(fn);
            if (i !== -1) tabListeners.splice(i, 1);
          },
        },
      },
      storage: {
        session: {
          get: async (key) =>
            key in storageData ? { [key]: storageData[key] } : {},
          set: async (items) => {
            for (const [k, v] of Object.entries(items)) storageData[k] = v;
          },
        },
        onChanged: {
          addListener: (fn) => changeListeners.push(fn),
          removeListener: (fn) => {
            const i = changeListeners.indexOf(fn);
            if (i !== -1) changeListeners.splice(i, 1);
          },
        },
      },
    };
    (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;

    // Dynamically import after fake chrome is installed so hooks read
    // the fake on first evaluation.
    const { default: App } = (await import(
      '../../entrypoints/sidepanel/App'
    )) as { default: React.ComponentType };

    await act(async () => {
      root = createRoot(container!);
      root.render(<App />);
    });
    await flush();

    const rootEl = container?.querySelector('[data-testid="sidepanel-root"]');
    expect(rootEl).not.toBeNull();
    expect(rootEl?.getAttribute('data-tab-id')).toBe(String(TAB_ID));

    const jd = container?.querySelector('[data-testid="jd-summary"]');
    expect(jd?.getAttribute('data-state')).toBe('detected');
    expect(jd?.getAttribute('data-vendor')).toBe('greenhouse');

    const kwList = container?.querySelector('[data-testid="keyword-list"]');
    expect(kwList?.getAttribute('data-state')).toBe('populated');
    expect(kwList?.getAttribute('data-keyword-count')).toBe('2');

    const history = container?.querySelector('[data-testid="autofill-history"]');
    expect(history?.getAttribute('data-state')).toBe('populated');
    expect(history?.getAttribute('data-history-count')).toBe('1');

    expect(listeners.length).toBeGreaterThan(0);
    expect(changeListeners.length).toBeGreaterThan(0);
  });
});
