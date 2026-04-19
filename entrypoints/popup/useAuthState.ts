// SPDX-License-Identifier: MIT
/**
 * React hook that subscribes the popup to the current auth state.
 *
 * On mount, sends AUTH_STATUS and stores the response. If unauthed, it
 * attempts AUTH_COOKIE_EXCHANGE for silent recovery from an existing web
 * cookie session. Explicit Sign In still uses AUTH_SIGN_IN and drives the
 * launchWebAuthFlow bridge handshake.
 *
 * Also registers a chrome.runtime.onMessage listener that reacts to
 * AUTH_STATE_CHANGED broadcasts fired by the background service worker
 * after sign-in, sign-out, or cookie-watcher detected changes.
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

const MANUAL_SIGN_IN_POLL_WINDOW_MS = 120_000;
const MANUAL_SIGN_IN_STATUS_POLL_INTERVAL_MS = 1_000;
const MANUAL_SIGN_IN_EXCHANGE_INTERVAL_MS = 30_000;

function shouldAutoSyncAfterSignInFailure(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized === 'sign-in-window-opened';
}

export interface UseAuthStateResult {
  readonly state: AuthState;
  readonly loading: boolean;
  readonly error: string | null;
  readonly signIn: () => Promise<void>;
  readonly silentSignIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export function useAuthState(): UseAuthStateResult {
  const [state, setState] = useState<AuthState>(UNAUTHED);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);
  const manualSyncInFlightRef = useRef<boolean>(false);

  const waitForManualSignInSync = useCallback(async (): Promise<void> => {
    if (manualSyncInFlightRef.current) return;
    const runtime = getRuntime();
    if (runtime === null) return;

    manualSyncInFlightRef.current = true;
    const deadline = Date.now() + MANUAL_SIGN_IN_POLL_WINDOW_MS;
    let lastExchangeAttemptAt = Date.now() - MANUAL_SIGN_IN_EXCHANGE_INTERVAL_MS;
    try {
      while (mountedRef.current && Date.now() < deadline) {
        try {
          const status = await runtime.sendMessage({
            key: 'AUTH_STATUS',
            data: {},
          });
          if (mountedRef.current && isAuthState(status) && status.signedIn) {
            setState(status);
            setError(null);
            return;
          }
        } catch {
          // Ignore transient runtime failures; continue probing.
        }

        const now = Date.now();
        if (now - lastExchangeAttemptAt >= MANUAL_SIGN_IN_EXCHANGE_INTERVAL_MS) {
          lastExchangeAttemptAt = now;
          try {
            const exchange = await runtime.sendMessage({
              key: 'AUTH_COOKIE_EXCHANGE',
              data: {},
            });
            if (mountedRef.current && isAuthState(exchange) && exchange.signedIn) {
              setState(exchange);
              setError(null);
              return;
            }
          } catch {
            // Ignore exchange failures; next probe may succeed.
          }
        }

        await new Promise((resolve) =>
          setTimeout(resolve, MANUAL_SIGN_IN_STATUS_POLL_INTERVAL_MS),
        );
      }
    } finally {
      manualSyncInFlightRef.current = false;
    }
  }, []);

  const runSignIn = useCallback(
    async (interactive: boolean): Promise<void> => {
      const runtime = getRuntime();
      if (runtime === null) {
        if (interactive) setError('Extension runtime unavailable');
        return;
      }
      if (interactive) setError(null);
      setLoading(true);
      try {
        const payload: {
          interactive?: boolean;
          agent?: 'job-hunter' | 'b2b-sales';
        } = { interactive, agent: 'job-hunter' };
        const response = (await runtime.sendMessage({
          key: 'AUTH_SIGN_IN',
          data: payload,
        })) as AuthSignInResponse | undefined;
        if (!mountedRef.current) return;
        if (!response) {
          if (interactive) setError('Sign-in returned no response');
          return;
        }
        if (response.ok) {
          setState({ signedIn: true, userId: response.userId });
          return;
        }
        if (interactive) {
          setError(response.reason);
          if (shouldAutoSyncAfterSignInFailure(response.reason)) {
            void waitForManualSignInSync();
          }
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (interactive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [waitForManualSignInSync],
  );

  // Initial status fetch + subscribe to broadcasts.
  useEffect(() => {
    mountedRef.current = true;
    const runtime = getRuntime();

    async function loadInitial(): Promise<void> {
      if (runtime === null) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      let currentState: AuthState = UNAUTHED;
      try {
        const response = await runtime.sendMessage({
          key: 'AUTH_STATUS',
          data: {},
        });
        if (!mountedRef.current) return;
        if (isAuthState(response)) {
          currentState = response;
          setState(response);
        }
      } catch {
        // Service worker may be spinning up; the broadcast listener will
        // still catch a subsequent sign-in.
      }
      // Attempt cookie-based exchange when unauthed. Reads the web's
      // sAccessToken cookie directly via chrome.cookies.get() and exchanges
      // it for a header-mode session. No bridge page, no JS execution in a
      // hidden window. Falls back gracefully if no cookie exists.
      if (currentState.signedIn === false) {
        try {
          const exchangeResult = await runtime.sendMessage({
            key: 'AUTH_COOKIE_EXCHANGE',
            data: {},
          });
          if (
            mountedRef.current &&
            isAuthState(exchangeResult) &&
            exchangeResult.signedIn
          ) {
            setState(exchangeResult);
            setLoading(false);
            return;
          }
        } catch {
          // Cookie exchange unavailable or failed; show signed-out panel
        }
        if (mountedRef.current) setLoading(false);
      } else {
        // Cross-account sync: extension is signed in, but the website may
        // have switched to a different account since the extension last
        // authenticated. Run cookie-exchange to check; it reads the web's
        // sAccessToken cookie and re-issues a header-mode session for
        // whoever the cookie's current owner is. If the returned userId
        // matches currentState.userId -> benign refresh (no state change).
        // If it differs -> the user switched accounts on the website, so
        // swap the extension's session to match. If no cookie (website
        // signed out) -> the extension keeps its valid stored session;
        // the cookie-watcher handles explicit sign-out separately.
        try {
          const exchangeResult = await runtime.sendMessage({
            key: 'AUTH_COOKIE_EXCHANGE',
            data: {},
          });
          if (
            mountedRef.current &&
            isAuthState(exchangeResult) &&
            exchangeResult.signedIn &&
            exchangeResult.userId !== currentState.userId
          ) {
            setState(exchangeResult);
          }
        } catch {
          // Exchange unavailable; keep the existing signed-in state.
        }
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
  }, [runSignIn]);

  const signIn = useCallback(async (): Promise<void> => {
    await runSignIn(true);
  }, [runSignIn]);

  const silentSignIn = useCallback(async (): Promise<void> => {
    await runSignIn(false);
  }, [runSignIn]);

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

  return { state, loading, error, signIn, silentSignIn, signOut };
}
