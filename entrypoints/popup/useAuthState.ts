// SPDX-License-Identifier: MIT
/**
 * React hook that subscribes the popup to the current auth state.
 *
 * On mount, sends an AUTH_STATUS message and stores the response. Also
 * registers a chrome.runtime.onMessage listener that reacts to
 * AUTH_STATE_CHANGED broadcasts fired by the background service worker
 * after sign-in or sign-out.
 *
 * The hook returns the current state plus imperative `signIn` / `signOut`
 * actions that the popup buttons can invoke. Both actions optimistically
 * update local state when the background resolves; failures are surfaced
 * as a human-readable error string.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthState,
  AuthSignInResponse,
  AuthSignOutResponse,
} from '@/src/background/messaging/protocol';

const UNAUTHED: AuthState = { signedIn: false };

type MessageEnvelope = {
  readonly key?: string;
  readonly data?: unknown;
};

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: (msg: unknown) => void): void;
    removeListener(listener: (msg: unknown) => void): void;
  };
};

/** Read `chrome.runtime` defensively; types vary across WXT / polyfill surfaces. */
function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function isAuthState(value: unknown): value is AuthState {
  if (value === null || typeof value !== 'object') return false;
  const v = value as { signedIn?: unknown; userId?: unknown };
  if (v.signedIn === true) return typeof v.userId === 'string';
  if (v.signedIn === false) return true;
  return false;
}

/** E2E-only test hook key. Never set in production. */
const E2E_TEST_COOKIE_JAR_KEY = 'llmc.e2e.test-cookie-jar';

async function readTestCookieJar(): Promise<string | null> {
  const g = globalThis as unknown as {
    chrome?: {
      storage?: {
        local?: { get: (key: string) => Promise<Record<string, unknown>> };
      };
    };
  };
  const localStorage = g.chrome?.storage?.local;
  if (!localStorage) return null;
  try {
    const raw = await localStorage.get(E2E_TEST_COOKIE_JAR_KEY);
    const value = raw[E2E_TEST_COOKIE_JAR_KEY];
    if (typeof value === 'string' && value.length > 0) return value;
    return null;
  } catch {
    return null;
  }
}

export interface UseAuthStateResult {
  readonly state: AuthState;
  readonly loading: boolean;
  readonly error: string | null;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export function useAuthState(): UseAuthStateResult {
  const [state, setState] = useState<AuthState>(UNAUTHED);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Initial status fetch + subscribe to broadcasts.
  useEffect(() => {
    mountedRef.current = true;
    const runtime = getRuntime();

    async function loadInitial(): Promise<void> {
      if (runtime === null) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      try {
        const response = await runtime.sendMessage({
          key: 'AUTH_STATUS',
          data: {},
        });
        if (!mountedRef.current) return;
        if (isAuthState(response)) setState(response);
      } catch {
        // Service worker may be spinning up; the broadcast listener will
        // still catch a subsequent sign-in.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    function onMessage(msg: unknown): void {
      if (msg === null || typeof msg !== 'object') return;
      const env = msg as MessageEnvelope;
      if (env.key !== 'AUTH_STATE_CHANGED') return;
      if (isAuthState(env.data)) {
        if (!mountedRef.current) return;
        setState(env.data);
      }
    }

    void loadInitial();
    runtime?.onMessage.addListener(onMessage);
    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(onMessage);
    };
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    const runtime = getRuntime();
    if (runtime === null) {
      setError('Extension runtime unavailable');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Read an optional test-mode cookie jar from chrome.storage.local.
      // Production builds never have this key set; the E2E harness seeds
      // it so Playwright can exercise the sign-in flow without driving
      // the real chrome.identity.launchWebAuthFlow popup window, which
      // is unreliable under headless Chromium.
      const testJar = await readTestCookieJar();
      const payload: { cookieJar?: string } = testJar ? { cookieJar: testJar } : {};
      const response = (await runtime.sendMessage({
        key: 'AUTH_SIGN_IN',
        data: payload,
      })) as AuthSignInResponse | undefined;
      if (!response) {
        setError('Sign-in returned no response');
        return;
      }
      if (response.ok) {
        setState({ signedIn: true, userId: response.userId });
      } else {
        setError(response.reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const runtime = getRuntime();
    if (runtime === null) {
      setError('Extension runtime unavailable');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = (await runtime.sendMessage({
        key: 'AUTH_SIGN_OUT',
        data: {},
      })) as AuthSignOutResponse | undefined;
      if (response && response.ok) {
        setState(UNAUTHED);
      } else {
        setError('Sign-out failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  return { state, loading, error, signIn, signOut };
}
