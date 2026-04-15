// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSidepanelIntent } from '@/entrypoints/sidepanel/useSidepanelIntent';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

type Listener = (msg: unknown) => void;

function install(
  sendMessage: (msg: unknown) => Promise<unknown>,
): { listeners: Listener[] } {
  const listeners: Listener[] = [];
  (globalThis as unknown as {
    chrome: {
      runtime: {
        sendMessage: typeof sendMessage;
        onMessage: {
          addListener: (fn: Listener) => void;
          removeListener: (fn: Listener) => void;
        };
      };
    };
  }).chrome = {
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
  };
  return { listeners };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useSidepanelIntent> | null } = {
  current: null,
};

function Probe({ tabId }: { tabId: number | null }): React.ReactElement {
  capture.current = useSidepanelIntent(tabId);
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

describe('useSidepanelIntent', () => {
  it('returns null intent when tabId is null', async () => {
    install(async () => null);
    await mount(null);
    await flush();
    expect(capture.current?.intent).toBeNull();
    expect(capture.current?.loading).toBe(false);
  });

  it('resolves INTENT_GET with the passed tabId', async () => {
    const intent: DetectedIntent = {
      kind: 'workday',
      pageKind: 'application-form',
      url: 'https://example.myworkdayjobs.com/job/123',
      detectedAt: 1,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string; data?: { tabId?: number } };
      if (env.key === 'INTENT_GET' && env.data?.tabId === 7) return intent;
      return null;
    });
    install(sendMessage);
    await mount(7);
    await flush();
    expect(capture.current?.intent?.kind).toBe('workday');
    expect(sendMessage).toHaveBeenCalledWith({
      key: 'INTENT_GET',
      data: { tabId: 7 },
    });
  });

  it('rejects malformed INTENT_GET responses', async () => {
    install(async () => ({ kind: 'bogus-ats' }));
    await mount(3);
    await flush();
    expect(capture.current?.intent).toBeNull();
  });

  it('applies DETECTED_JOB_BROADCAST intent when the tabId matches', async () => {
    const { listeners } = install(async () => null);
    await mount(9);
    await flush();
    expect(capture.current?.intent).toBeNull();
    const next: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/x',
      detectedAt: 3,
    };
    await act(async () => {
      for (const fn of listeners) {
        fn({
          key: 'DETECTED_JOB_BROADCAST',
          data: { tabId: 9, intent: next },
        });
      }
      await Promise.resolve();
    });
    expect(capture.current?.intent?.kind).toBe('greenhouse');
  });

  it('ignores broadcasts for other tab ids', async () => {
    const { listeners } = install(async () => null);
    await mount(9);
    await flush();
    const other: DetectedIntent = {
      kind: 'lever',
      pageKind: 'job-posting',
      url: 'https://jobs.lever.co/foo',
      detectedAt: 4,
    };
    await act(async () => {
      for (const fn of listeners) {
        fn({
          key: 'DETECTED_JOB_BROADCAST',
          data: { tabId: 42, intent: other },
        });
      }
      await Promise.resolve();
    });
    expect(capture.current?.intent).toBeNull();
  });

  it('tolerates sendMessage rejection', async () => {
    install(async () => {
      throw new Error('boom');
    });
    await mount(11);
    await flush();
    expect(capture.current?.intent).toBeNull();
    expect(capture.current?.loading).toBe(false);
  });
});
