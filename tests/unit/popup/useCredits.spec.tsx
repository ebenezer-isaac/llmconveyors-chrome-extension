// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCredits } from '@/entrypoints/popup/useCredits';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';

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
    const credits: ClientCreditsSnapshot = { credits: 100, tier: 'free', byoKeyEnabled: false };
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
    expect(capture.current?.credits?.credits).toBe(100);
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
    installFakeChrome(async () => ({ credits: 'not a number', tier: 42 }));
    await mount();
    await flush();
    expect(capture.current?.credits).toBeNull();
    expect(capture.current?.error).toMatch(/invalid/i);
  });

  it('rejects unknown tier values', async () => {
    installFakeChrome(async () => ({
      credits: 10,
      tier: 'enterprise',
      byoKeyEnabled: false,
    }));
    await mount();
    await flush();
    expect(capture.current?.credits).toBeNull();
    expect(capture.current?.error).toMatch(/invalid/i);
  });

  it('refreshes credits on window focus events', async () => {
    let n = 0;
    const sendMessage = vi.fn(async (): Promise<ClientCreditsSnapshot> => {
      n++;
      return { credits: n * 10, tier: 'free', byoKeyEnabled: false };
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(capture.current?.credits?.credits).toBe(10);
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(capture.current?.credits?.credits).toBe(20);
  });

  it('updates via CREDITS_UPDATED broadcast', async () => {
    const { listeners } = installFakeChrome(async () => ({
      credits: 5,
      tier: 'free',
      byoKeyEnabled: false,
    }));
    await mount();
    await flush();
    expect(capture.current?.credits?.credits).toBe(5);
    await act(async () => {
      for (const fn of listeners) {
        fn({
          key: 'CREDITS_UPDATED',
          data: { credits: 17, tier: 'byo', byoKeyEnabled: true } as ClientCreditsSnapshot,
        });
      }
      await Promise.resolve();
    });
    expect(capture.current?.credits?.credits).toBe(17);
    expect(capture.current?.credits?.tier).toBe('byo');
  });

  it('reports runtime unavailable error when chrome.runtime is missing', async () => {
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.error).toMatch(/runtime/i);
  });
});
