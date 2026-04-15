// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useKeywords,
  persistKeywords,
  type Keyword,
} from '@/entrypoints/sidepanel/useKeywords';

type ChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => void;

interface FakeSession {
  data: Record<string, unknown>;
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

interface FakeStorage {
  session: FakeSession;
  onChanged: {
    addListener: (fn: ChangeListener) => void;
    removeListener: (fn: ChangeListener) => void;
  };
}

function install(): {
  storage: FakeStorage;
  listeners: ChangeListener[];
} {
  const data: Record<string, unknown> = {};
  const listeners: ChangeListener[] = [];
  const storage: FakeStorage = {
    session: {
      data,
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) {
          data[k] = v;
        }
      },
    },
    onChanged: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  };
  (globalThis as unknown as { chrome: { storage: FakeStorage } }).chrome = {
    storage,
  };
  return { storage, listeners };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useKeywords> | null } = { current: null };

function Probe({ tabId }: { tabId: number | null }): React.ReactElement {
  capture.current = useKeywords(tabId);
  return <div />;
}

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
  capture = { current: null };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mount(tabId: number | null): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<Probe tabId={tabId} />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useKeywords', () => {
  it('returns empty list and loading=false when chrome.storage is unavailable', async () => {
    await mount(42);
    await flush();
    expect(capture.current?.keywords).toEqual([]);
    expect(capture.current?.loading).toBe(false);
  });

  it('loads keywords from session storage on mount', async () => {
    const { storage } = install();
    const seeded: Keyword[] = [
      { term: 'Go', category: 'language', score: 0.9, canonicalForm: 'go' },
    ];
    storage.session.data['llmc.keywords.7'] = seeded;
    await mount(7);
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.keywords).toEqual(seeded);
  });

  it('updates list when storage.onChanged fires for the bound tab', async () => {
    const { listeners } = install();
    await mount(3);
    await flush();
    expect(capture.current?.keywords).toEqual([]);
    const updated: Keyword[] = [
      { term: 'Rust', category: 'language', score: 1.0, canonicalForm: 'rust' },
    ];
    await act(async () => {
      for (const fn of listeners) {
        fn({ 'llmc.keywords.3': { newValue: updated } }, 'session');
      }
      await Promise.resolve();
    });
    expect(capture.current?.keywords).toEqual(updated);
  });

  it('ignores storage changes for other tab ids', async () => {
    const { listeners } = install();
    await mount(5);
    await flush();
    await act(async () => {
      for (const fn of listeners) {
        fn(
          {
            'llmc.keywords.999': {
              newValue: [{ term: 'Other', category: 't', score: 0.5, canonicalForm: 'other' }],
            },
          },
          'session',
        );
      }
      await Promise.resolve();
    });
    expect(capture.current?.keywords).toEqual([]);
  });

  it('ignores storage changes in non-session areas', async () => {
    const { storage, listeners } = install();
    storage.session.data['llmc.keywords.2'] = [
      { term: 'Seeded', category: 'tool', score: 0.5, canonicalForm: 'seeded' },
    ];
    await mount(2);
    await flush();
    expect(capture.current?.keywords.length).toBe(1);
    // A local-area change event for the same key must NOT clobber the
    // session-sourced state.
    await act(async () => {
      for (const fn of listeners) {
        fn({ 'llmc.keywords.2': { newValue: [] } }, 'local');
      }
      await Promise.resolve();
    });
    expect(capture.current?.keywords.length).toBe(1);
  });

  it('collapses malformed keyword entries without throwing', async () => {
    const { storage } = install();
    storage.session.data['llmc.keywords.8'] = [
      { term: 'Valid', category: 'x', score: 0.5, canonicalForm: 'valid' },
      { term: '' },
      null,
      'not-an-object',
      { term: 42 },
    ];
    await mount(8);
    await flush();
    expect(capture.current?.keywords.length).toBe(1);
    expect(capture.current?.keywords[0]?.term).toBe('Valid');
  });

  it('yields no keywords when bound to null tab', async () => {
    install();
    await mount(null);
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.keywords).toEqual([]);
  });

  it('persistKeywords writes to session storage', async () => {
    const { storage } = install();
    const kw: Keyword[] = [
      { term: 'Kafka', category: 'tool', score: 0.7, canonicalForm: 'kafka' },
    ];
    await persistKeywords(11, kw);
    expect(storage.session.data['llmc.keywords.11']).toEqual(kw);
  });

  it('persistKeywords silently tolerates missing chrome.storage', async () => {
    // No install; chrome.storage is undefined.
    await persistKeywords(11, []);
    // should not throw; nothing else to assert.
    expect(true).toBe(true);
  });
});
