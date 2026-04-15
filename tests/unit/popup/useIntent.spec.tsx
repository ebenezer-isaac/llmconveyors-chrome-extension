// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIntent } from '@/entrypoints/popup/useIntent';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

type Listener = (msg: unknown) => void;
type TabsListener = (info: { tabId: number }) => void;

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (fn: Listener) => void;
      removeListener: (fn: Listener) => void;
    };
  };
  tabs: {
    query: (info: unknown) => Promise<Array<{ id?: number; url?: string }>>;
    onActivated: {
      addListener: (fn: TabsListener) => void;
      removeListener: (fn: TabsListener) => void;
    };
  };
}

function install(
  sendMessage: (msg: unknown) => Promise<unknown>,
  tabs: Array<{ id?: number; url?: string }>,
): { listeners: Listener[]; tabListeners: TabsListener[] } {
  const listeners: Listener[] = [];
  const tabListeners: TabsListener[] = [];
  const fake: FakeChrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
    },
    tabs: {
      query: async () => tabs,
      onActivated: {
        addListener: (fn) => tabListeners.push(fn),
        removeListener: (fn) => {
          const i = tabListeners.indexOf(fn);
          if (i !== -1) tabListeners.splice(i, 1);
        },
      },
    },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return { listeners, tabListeners };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useIntent> | null } = { current: null };

function Probe(): React.ReactElement {
  const value = useIntent();
  capture.current = value;
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
    await Promise.resolve();
  });
}

describe('useIntent', () => {
  it('resolves INTENT_GET with the detected intent for the active tab', async () => {
    const intent: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      detectedAt: 99,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string; data?: { tabId?: number } };
      if (env.key === 'INTENT_GET' && env.data?.tabId === 7) return intent;
      return null;
    });
    install(sendMessage, [{ id: 7, url: intent.url }]);
    await mount();
    await flush();
    expect(capture.current?.tabId).toBe(7);
    expect(capture.current?.intent?.kind).toBe('greenhouse');
    expect(capture.current?.loading).toBe(false);
  });

  it('returns null intent when the background has no snapshot', async () => {
    install(async () => null, [{ id: 3, url: 'about:blank' }]);
    await mount();
    await flush();
    expect(capture.current?.intent).toBeNull();
    expect(capture.current?.tabId).toBe(3);
  });

  it('returns null when tabs.query yields no active tab', async () => {
    install(async () => null, []);
    await mount();
    await flush();
    expect(capture.current?.tabId).toBeNull();
    expect(capture.current?.intent).toBeNull();
    expect(capture.current?.loading).toBe(false);
  });

  it('re-fetches intent when onActivated fires for a new tab id', async () => {
    const first: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://a.com',
      detectedAt: 1,
    };
    const second: DetectedIntent = {
      kind: 'lever',
      pageKind: 'application-form',
      url: 'https://b.com',
      detectedAt: 2,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string; data?: { tabId?: number } };
      if (env.key === 'INTENT_GET' && env.data?.tabId === 1) return first;
      if (env.key === 'INTENT_GET' && env.data?.tabId === 2) return second;
      return null;
    });
    const { tabListeners } = install(sendMessage, [{ id: 1, url: first.url }]);
    await mount();
    await flush();
    expect(capture.current?.intent?.kind).toBe('greenhouse');
    await act(async () => {
      for (const fn of tabListeners) fn({ tabId: 2 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(capture.current?.tabId).toBe(2);
    expect(capture.current?.intent?.kind).toBe('lever');
  });

  it('tolerates sendMessage rejection by collapsing to null intent', async () => {
    install(async () => {
      throw new Error('boom');
    }, [{ id: 10, url: 'https://x.com' }]);
    await mount();
    await flush();
    expect(capture.current?.intent).toBeNull();
  });

  it('updates intent when DETECTED_JOB_BROADCAST fires for the current tab', async () => {
    const next: DetectedIntent = {
      kind: 'workday',
      pageKind: 'application-form',
      url: 'https://c.com',
      detectedAt: 3,
    };
    const { listeners } = install(async () => null, [{ id: 5, url: 'https://c.com' }]);
    await mount();
    await flush();
    expect(capture.current?.intent).toBeNull();
    await act(async () => {
      for (const fn of listeners) {
        fn({ key: 'DETECTED_JOB_BROADCAST', data: { tabId: 5, intent: next } });
      }
      await Promise.resolve();
    });
    expect(capture.current?.intent?.kind).toBe('workday');
  });

  it('ignores broadcasts for other tab ids', async () => {
    const other: DetectedIntent = {
      kind: 'lever',
      pageKind: 'job-posting',
      url: 'https://y.com',
      detectedAt: 4,
    };
    const { listeners } = install(async () => null, [{ id: 5, url: 'https://x.com' }]);
    await mount();
    await flush();
    await act(async () => {
      for (const fn of listeners) {
        fn({ key: 'DETECTED_JOB_BROADCAST', data: { tabId: 999, intent: other } });
      }
      await Promise.resolve();
    });
    expect(capture.current?.intent).toBeNull();
  });
});
