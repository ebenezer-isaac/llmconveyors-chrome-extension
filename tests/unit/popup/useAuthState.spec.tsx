// SPDX-License-Identifier: MIT
// Tell React that it is running inside a testing harness (silences the
// "not configured to support act(...)" warning). Must be set BEFORE any
// react-dom import touches `globalThis`.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '@/entrypoints/popup/App';

type MessageListener = (msg: unknown) => void;

interface FakeRuntime {
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (fn: MessageListener) => void;
    removeListener: (fn: MessageListener) => void;
    listeners: MessageListener[];
  };
}

interface FakeChrome {
  runtime: FakeRuntime;
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (entries: Record<string, unknown>) => Promise<void>;
    };
  };
}

function installFakeChrome(
  sendMessageImpl: (msg: unknown) => Promise<unknown>,
  testJar?: string,
): FakeChrome {
  const listeners: MessageListener[] = [];
  const storeMap = new Map<string, unknown>();
  if (testJar) storeMap.set('llmc.e2e.test-cookie-jar', testJar);
  const fake: FakeChrome = {
    runtime: {
      sendMessage: sendMessageImpl,
      onMessage: {
        addListener: (fn) => {
          listeners.push(fn);
        },
        removeListener: (fn) => {
          const idx = listeners.indexOf(fn);
          if (idx !== -1) listeners.splice(idx, 1);
        },
        listeners,
      },
    },
    storage: {
      local: {
        get: async (key: string) => {
          const value = storeMap.get(key);
          return value === undefined ? {} : { [key]: value };
        },
        set: async (entries: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(entries)) storeMap.set(k, v);
        },
      },
    },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return fake;
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

async function mountApp(): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<App />);
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('popup App + useAuthState', () => {
  it('renders the sign-in button when AUTH_STATUS returns unauthenticated', async () => {
    installFakeChrome(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      return undefined;
    });
    await mountApp();
    await flushMicrotasks();
    expect(query('sign-in-button')).not.toBeNull();
    expect(query('signed-in-indicator')).toBeNull();
  });

  it('renders the signed-in indicator when AUTH_STATUS returns authenticated', async () => {
    installFakeChrome(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: true, userId: 'user_abc' };
      return undefined;
    });
    await mountApp();
    await flushMicrotasks();
    const indicator = query('signed-in-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain('user_abc');
    expect(query('sign-in-button')).toBeNull();
  });

  it('transitions to signed-in after clicking sign-in-button (cookieJar mode)', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as { key?: string; data?: { cookieJar?: string } };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      if (typed.key === 'AUTH_SIGN_IN') {
        expect(typed.data?.cookieJar).toBe('test-jar');
        return { ok: true, userId: 'user_signed_in' };
      }
      return undefined;
    });
    installFakeChrome(sendMessage, 'test-jar');
    await mountApp();
    await flushMicrotasks();
    const btn = query('sign-in-button');
    expect(btn).not.toBeNull();
    await click(btn!);
    await flushMicrotasks();
    const indicator = query('signed-in-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain('user_signed_in');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'AUTH_SIGN_IN' }),
    );
  });

  it('surfaces sign-in failure as a visible error', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      if (typed.key === 'AUTH_SIGN_IN') return { ok: false, reason: 'network error' };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mountApp();
    await flushMicrotasks();
    await click(query('sign-in-button')!);
    await flushMicrotasks();
    const errEl = query('auth-error');
    expect(errEl).not.toBeNull();
    expect(errEl?.textContent).toContain('network error');
  });

  it('signs out on sign-out-button click', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: true, userId: 'user_abc' };
      if (typed.key === 'AUTH_SIGN_OUT') return { ok: true };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mountApp();
    await flushMicrotasks();
    expect(query('signed-in-indicator')).not.toBeNull();
    await click(query('sign-out-button')!);
    await flushMicrotasks();
    expect(query('sign-in-button')).not.toBeNull();
    expect(query('signed-in-indicator')).toBeNull();
  });

  it('updates UI when AUTH_STATE_CHANGED is broadcast after mount', async () => {
    let broadcastListener: MessageListener | null = null;
    const fake = installFakeChrome(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      return undefined;
    });
    const origAdd = fake.runtime.onMessage.addListener;
    fake.runtime.onMessage.addListener = (fn) => {
      broadcastListener = fn;
      origAdd(fn);
    };
    await mountApp();
    await flushMicrotasks();
    expect(broadcastListener).not.toBeNull();
    await act(async () => {
      broadcastListener!({
        key: 'AUTH_STATE_CHANGED',
        data: { signedIn: true, userId: 'user_broadcast' },
      });
      await Promise.resolve();
    });
    const indicator = query('signed-in-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain('user_broadcast');
  });
});
