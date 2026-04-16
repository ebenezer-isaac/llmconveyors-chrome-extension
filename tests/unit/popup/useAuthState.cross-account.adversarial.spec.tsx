// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for the cross-account auto-sync added to useAuthState.
 *
 * Sync contract (when extension is signed in on mount):
 *   - Always call AUTH_COOKIE_EXCHANGE.
 *   - If exchange returns signedIn + same userId -> state unchanged.
 *   - If exchange returns signedIn + DIFFERENT userId -> state swaps
 *     (user switched accounts on the web).
 *   - If exchange returns unauthed / throws / no cookie -> keep the
 *     signed-in state; cookie-watcher handles explicit sign-outs.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '@/entrypoints/popup/App';

interface FakeRuntime {
  sendMessage: (msg: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (fn: (msg: unknown) => void) => void;
    removeListener: (fn: (msg: unknown) => void) => void;
    listeners: ((msg: unknown) => void)[];
  };
  openOptionsPage?: () => void;
}

function installChrome(sendMessage: (msg: unknown) => Promise<unknown>): FakeRuntime {
  const listeners: ((msg: unknown) => void)[] = [];
  const runtime: FakeRuntime = {
    sendMessage,
    onMessage: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
      listeners,
    },
    openOptionsPage: vi.fn(),
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime,
    tabs: {
      query: async () => [{ id: 1, url: 'about:blank' }],
      onActivated: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined,
      },
    },
  };
  return runtime;
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

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

describe('useAuthState cross-account sync adversarial', () => {
  it('same userId from AUTH_STATUS and cookie exchange -> no user-visible change', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_same' };
      if (key === 'AUTH_COOKIE_EXCHANGE')
        return { signedIn: true, userId: 'u_same' };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_same');
  });

  it('different userId from cookie exchange -> state swaps to exchange userId', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_stored' };
      if (key === 'AUTH_COOKIE_EXCHANGE')
        return { signedIn: true, userId: 'u_website_current' };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 10, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_website_current');
    // The stored userId must not leak into the header after swap.
    expect(userId?.textContent).not.toBe('u_stored');
  });

  it('exchange returns unauthed (no cookie) -> signed-in state is preserved', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_stored' };
      if (key === 'AUTH_COOKIE_EXCHANGE') return { signedIn: false };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    // Sign-in button should NOT appear; user-menu should still render.
    expect(query('sign-in-button')).toBeNull();
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_stored');
  });

  it('exchange throws -> signed-in state is preserved', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_stored' };
      if (key === 'AUTH_COOKIE_EXCHANGE')
        throw new Error('runtime temporarily unavailable');
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    expect(query('sign-in-button')).toBeNull();
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_stored');
  });

  it('exchange returns malformed shape -> signed-in state is preserved', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_stored' };
      // Missing required userId when signedIn=true: not a valid AuthState.
      if (key === 'AUTH_COOKIE_EXCHANGE') return { signedIn: true };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_stored');
  });

  it('when starting signed OUT, exchange still promotes to signed-in', async () => {
    installChrome(async (msg) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: false };
      if (key === 'AUTH_SIGN_IN') return { ok: false, reason: 'no-cookie' };
      if (key === 'AUTH_COOKIE_EXCHANGE')
        return { signedIn: true, userId: 'u_exchange' };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    await mountApp();
    await flush();
    // The unauthed branch runs AUTH_COOKIE_EXCHANGE and promotes if it
    // returns signedIn. That predates this change but the adversarial
    // tests pin the existing invariant so a regression is caught.
    const userId = query('popup-user-id');
    expect(userId?.textContent).toBe('u_exchange');
  });

  it('exchange sendMessage is dispatched exactly once per mount when signed-in', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const key = (msg as { key?: string }).key;
      if (key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_same' };
      if (key === 'AUTH_COOKIE_EXCHANGE')
        return { signedIn: true, userId: 'u_same' };
      if (key === 'INTENT_GET') return null;
      if (key === 'CREDITS_GET')
        return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    });
    installChrome(sendMessage);
    await mountApp();
    await flush();
    const exchangeCalls = sendMessage.mock.calls.filter(
      (c) => (c[0] as { key?: string }).key === 'AUTH_COOKIE_EXCHANGE',
    );
    expect(exchangeCalls).toHaveLength(1);
  });
});
