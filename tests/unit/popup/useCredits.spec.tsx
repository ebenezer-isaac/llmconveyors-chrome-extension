// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCredits } from '@/entrypoints/popup/useCredits';
import type { CreditsState } from '@/src/background/messaging/protocol';

type Listener = (msg: unknown) => void;

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (fn: Listener) => void;
      removeListener: (fn: Listener) => void;
    };
  };
}

function installFakeChrome(
  sendMessage: (msg: unknown) => Promise<unknown>,
): { listeners: Listener[]; fake: FakeChrome } {
  const listeners: Listener[] = [];
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
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return { listeners, fake };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useCredits> | null } = { current: null };

function Probe(): React.ReactElement {
  const value = useCredits();
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
  });
}

describe('useCredits', () => {
  it('fetches credits on mount and exposes the response', async () => {
    const credits: CreditsState = { balance: 100, plan: 'free', resetAt: null };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'CREDITS_GET') return credits;
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'CREDITS_GET' }),
    );
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.credits?.balance).toBe(100);
    expect(capture.current?.error).toBeNull();
  });

  it('surfaces an error when sendMessage rejects', async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error('network down');
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.credits).toBeNull();
    expect(capture.current?.error).toMatch(/network down/);
  });

  it('collapses to an error state when the response shape is invalid', async () => {
    installFakeChrome(async () => ({ balance: 'not a number', plan: 42 }));
    await mount();
    await flush();
    expect(capture.current?.credits).toBeNull();
    expect(capture.current?.error).toMatch(/invalid/i);
  });

  it('refreshes credits on window focus events', async () => {
    let n = 0;
    const sendMessage = vi.fn(async (): Promise<CreditsState> => {
      n++;
      return { balance: n * 10, plan: 'free', resetAt: null };
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(capture.current?.credits?.balance).toBe(10);
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(capture.current?.credits?.balance).toBe(20);
  });

  it('updates via CREDITS_UPDATED broadcast', async () => {
    const { listeners } = installFakeChrome(async () => ({
      balance: 5,
      plan: 'free',
      resetAt: null,
    }));
    await mount();
    await flush();
    expect(capture.current?.credits?.balance).toBe(5);
    await act(async () => {
      for (const fn of listeners) {
        fn({
          key: 'CREDITS_UPDATED',
          data: { balance: 17, plan: 'pro', resetAt: 99 } as CreditsState,
        });
      }
      await Promise.resolve();
    });
    expect(capture.current?.credits?.balance).toBe(17);
  });

  it('reports runtime unavailable error when chrome.runtime is missing', async () => {
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.error).toMatch(/runtime/i);
  });
});
