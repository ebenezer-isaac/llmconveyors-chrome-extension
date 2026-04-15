// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTargetTabId } from '@/entrypoints/sidepanel/useTargetTabId';

type TabsListener = (info: { tabId: number }) => void;

interface FakeTabs {
  query: (info: unknown) => Promise<Array<{ id?: number }>>;
  onActivated: {
    addListener: (fn: TabsListener) => void;
    removeListener: (fn: TabsListener) => void;
  };
}

function install(
  query: (info: unknown) => Promise<Array<{ id?: number }>>,
): {
  listeners: TabsListener[];
  queryFn: typeof query;
} {
  const listeners: TabsListener[] = [];
  const tabs: FakeTabs = {
    query,
    onActivated: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  };
  (globalThis as unknown as { chrome: { tabs: FakeTabs } }).chrome = { tabs };
  return { listeners, queryFn: query };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useTargetTabId> | null } = {
  current: null,
};

function Probe(): React.ReactElement {
  capture.current = useTargetTabId();
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
  window.history.pushState({}, '', '/');
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

describe('useTargetTabId', () => {
  it('returns the active tab id from chrome.tabs.query', async () => {
    install(async () => [{ id: 42 }]);
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(42);
    expect(capture.current?.loading).toBe(false);
  });

  it('returns null when no active tab', async () => {
    install(async () => []);
    await mount();
    await flush();
    expect(capture.current?.tabId).toBeNull();
    expect(capture.current?.loading).toBe(false);
  });

  it('returns null when chrome.tabs is unavailable', async () => {
    await mount();
    await flush();
    expect(capture.current?.tabId).toBeNull();
    expect(capture.current?.loading).toBe(false);
  });

  it('honors ?tabId=<n> URL override and skips active-tab query', async () => {
    const queryFn = vi.fn(async () => [{ id: 999 }]);
    install(queryFn);
    window.history.pushState({}, '', '/?tabId=123');
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(123);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('ignores non-numeric or non-positive ?tabId override', async () => {
    install(async () => [{ id: 77 }]);
    window.history.pushState({}, '', '/?tabId=-5');
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(77);
  });

  it('updates tabId when chrome.tabs.onActivated fires (no override)', async () => {
    const { listeners } = install(async () => [{ id: 10 }]);
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(10);
    await act(async () => {
      for (const fn of listeners) fn({ tabId: 42 });
      await Promise.resolve();
    });
    expect(capture.current?.tabId).toBe(42);
  });

  it('does NOT follow onActivated when pinned by URL override', async () => {
    const { listeners } = install(async () => [{ id: 1 }]);
    window.history.pushState({}, '', '/?tabId=500');
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(500);
    // No listener should have been registered.
    expect(listeners.length).toBe(0);
  });
});
