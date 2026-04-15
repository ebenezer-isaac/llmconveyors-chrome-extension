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
type TabsListener = (info: { tabId: number }) => void;

interface FakeRuntime {
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (fn: MessageListener) => void;
    removeListener: (fn: MessageListener) => void;
    listeners: MessageListener[];
  };
  openOptionsPage?: () => void;
}

interface FakeTabs {
  query: (info: unknown) => Promise<Array<{ id?: number; url?: string }>>;
  onActivated: {
    addListener: (fn: TabsListener) => void;
    removeListener: (fn: TabsListener) => void;
  };
}

interface FakeChrome {
  runtime: FakeRuntime;
  tabs: FakeTabs;
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
  const tabListeners: TabsListener[] = [];
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
      openOptionsPage: vi.fn(),
    },
    tabs: {
      query: async () => [{ id: 1, url: 'about:blank' }],
      onActivated: {
        addListener: (fn) => tabListeners.push(fn),
        removeListener: (fn) => {
          const i = tabListeners.indexOf(fn);
          if (i !== -1) tabListeners.splice(i, 1);
        },
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
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flushMicrotasks();
    expect(query('sign-in-button')).not.toBeNull();
    expect(query('user-menu-trigger')).toBeNull();
    expect(query('action-area')).toBeNull();
  });

  it('renders the user id in the header when AUTH_STATUS returns authenticated', async () => {
    installFakeChrome(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: true, userId: 'user_abc' };
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flushMicrotasks();
    const userId = query('popup-user-id');
    expect(userId).not.toBeNull();
    expect(userId?.textContent).toBe('user_abc');
    expect(query('sign-in-button')).toBeNull();
    expect(query('user-menu-trigger')).not.toBeNull();
  });

  it('transitions to signed-in after clicking sign-in-button (cookieJar mode)', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as {
        key?: string;
        data?: { cookieJar?: string; interactive?: boolean };
      };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      if (typed.key === 'AUTH_SIGN_IN') {
        // The on-mount silent attempt sends `{ interactive: false }` and
        // should quietly fail so the popup shows the Sign In button; the
        // explicit click sends the test cookie jar and succeeds.
        if (typed.data?.interactive === false) {
          return { ok: false, reason: 'silent sign-in not available' };
        }
        expect(typed.data?.cookieJar).toBe('test-jar');
        return { ok: true, userId: 'user_signed_in' };
      }
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    installFakeChrome(sendMessage, 'test-jar');
    await mountApp();
    await flushMicrotasks();
    const btn = query('sign-in-button');
    expect(btn).not.toBeNull();
    // Silent attempt should not render an error banner.
    expect(query('auth-error')).toBeNull();
    await click(btn!);
    await flushMicrotasks();
    const userId = query('popup-user-id');
    expect(userId).not.toBeNull();
    expect(userId?.textContent).toBe('user_signed_in');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'AUTH_SIGN_IN' }),
    );
  });

  it('surfaces sign-in failure as a visible error', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as { key?: string; data?: { interactive?: boolean } };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      if (typed.key === 'AUTH_SIGN_IN') {
        if (typed.data?.interactive === false) {
          return { ok: false, reason: 'silent sign-in not available' };
        }
        return { ok: false, reason: 'network error' };
      }
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mountApp();
    await flushMicrotasks();
    // Silent mount failure must NOT raise an error banner.
    expect(query('auth-error')).toBeNull();
    await click(query('sign-in-button')!);
    await flushMicrotasks();
    const errEl = query('auth-error');
    expect(errEl).not.toBeNull();
    expect(errEl?.textContent).toContain('network error');
  });

  it('signs out via the user-menu Logout item', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: true, userId: 'user_abc' };
      if (typed.key === 'AUTH_SIGN_OUT') return { ok: true };
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      if (typed.key === 'SESSION_LIST')
        return { ok: true, items: [], hasMore: false, nextCursor: null, fetchedAt: 0, fromCache: false };
      if (typed.key === 'GENERIC_INTENT_DETECT') return { ok: false, reason: 'no-match' };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mountApp();
    await flushMicrotasks();
    expect(query('popup-user-id')).not.toBeNull();
    await click(query('user-menu-trigger')!);
    await flushMicrotasks();
    await click(query('user-menu-logout')!);
    await flushMicrotasks();
    expect(query('sign-in-button')).not.toBeNull();
    expect(query('popup-user-id')).toBeNull();
  });

  it('updates UI when AUTH_STATE_CHANGED is broadcast after mount', async () => {
    let broadcastListener: MessageListener | null = null;
    const fake = installFakeChrome(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'AUTH_STATUS') return { signedIn: false };
      if (typed.key === 'INTENT_GET') return null;
      if (typed.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    const origAdd = fake.runtime.onMessage.addListener;
    fake.runtime.onMessage.addListener = (fn: MessageListener) => {
      // Capture only the useAuthState listener (the one looking at AUTH_STATE_CHANGED).
      if (broadcastListener === null) broadcastListener = fn;
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
    const userId = query('popup-user-id');
    expect(userId).not.toBeNull();
    expect(userId?.textContent).toBe('user_broadcast');
  });
});
