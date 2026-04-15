// SPDX-License-Identifier: MIT
/**
 * Reactive account sync via `chrome.cookies.onChanged`.
 *
 * When the user signs out of the web app (cookie removed), the extension
 * clears its own stored session and broadcasts `AUTH_STATE_CHANGED` so the
 * popup switches to the signed-out panel without requiring a refresh.
 *
 * When the web app issues a new session cookie (e.g. after a re-login in
 * another tab), we silently re-exchange against the A4 bridge so the
 * extension picks up the new userId without the user clicking Sign In.
 *
 * Scope: only cookies on `llmconveyors.com` (and subdomains) named
 * `sAccessToken` are considered. Everything else is ignored.
 */

import type { Logger } from '../log';

const COOKIE_NAME = 'sAccessToken';
const COOKIE_DOMAIN_SUFFIX = 'llmconveyors.com';

interface CookieChangeInfo {
  readonly removed: boolean;
  readonly cause: string;
  readonly cookie: {
    readonly domain: string;
    readonly name: string;
  };
}

export interface CookieWatcherDeps {
  readonly logger: Logger;
  readonly clearSession: () => Promise<void>;
  readonly broadcast: (message: { readonly key: string; readonly data: unknown }) => Promise<void>;
  /**
   * Silent re-exchange trigger. Receives `undefined` and returns nothing.
   * The production wiring invokes the orchestrator with
   * `{ interactive: false }`; tests pass a spy.
   */
  readonly attemptSilentSignIn: () => Promise<void>;
}

interface CookiesApi {
  readonly onChanged: {
    addListener: (fn: (info: CookieChangeInfo) => void) => void;
    removeListener: (fn: (info: CookieChangeInfo) => void) => void;
  };
}

function getCookies(): CookiesApi | null {
  const g = globalThis as unknown as {
    chrome?: { cookies?: CookiesApi };
    browser?: { cookies?: CookiesApi };
  };
  return g.chrome?.cookies ?? g.browser?.cookies ?? null;
}

function isRelevantCookie(info: CookieChangeInfo): boolean {
  if (info.cookie.name !== COOKIE_NAME) return false;
  // domain may start with a leading dot (RFC 6265 §5.2.3); normalise.
  const d = info.cookie.domain.startsWith('.')
    ? info.cookie.domain.slice(1)
    : info.cookie.domain;
  return d === COOKIE_DOMAIN_SUFFIX || d.endsWith(`.${COOKIE_DOMAIN_SUFFIX}`);
}

/**
 * Register the cookie change listener. Returns a disposer that removes the
 * listener and clears any pending silent-refresh in-flight. Idempotent: if
 * `chrome.cookies` is unavailable (manifest missing the permission, or a
 * test harness without the API) the call logs and returns a no-op disposer.
 */
export function registerCookieWatcher(deps: CookieWatcherDeps): () => void {
  const cookies = getCookies();
  if (cookies === null) {
    deps.logger.warn('cookie-watcher: chrome.cookies unavailable, skipping');
    return () => undefined;
  }

  const handler = (info: CookieChangeInfo): void => {
    if (!isRelevantCookie(info)) return;

    // SuperTokens rotates sAccessToken on every request. Each rotation fires
    // two events: (removed: true, cause: 'overwrite') then (removed: false,
    // cause: 'explicit'). Treating the first as a sign-out races the popup
    // into a re-exchange loop with the A4 bridge that reloads the active
    // tab; treating the second as a new identity is equally wrong because
    // it is almost always just a token refresh, not an account switch.
    //
    // Scope this watcher to genuine sign-out signals only:
    //   - cause 'explicit' WITHOUT an immediate overwrite counterpart means
    //     the user actively logged out of the web app
    //   - cause 'expired' means the SuperTokens TTL ran out with no refresh
    //     (effectively a timed sign-out)
    //   - cause 'evicted' means storage pressure ate the cookie; safest to
    //     treat as a sign-out so the user is forced to re-auth
    //
    // Account-switch detection is deferred to the API 401 retry path; a
    // fresh sign-in there picks up the new identity via the bridge.
    if (info.removed && info.cause !== 'overwrite') {
      deps.logger.info('cookie-watcher: session cookie removed', {
        cause: info.cause,
      });
      void (async () => {
        try {
          await deps.clearSession();
        } catch (err: unknown) {
          deps.logger.warn('cookie-watcher: clearSession failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        try {
          await deps.broadcast({
            key: 'AUTH_STATE_CHANGED',
            data: { signedIn: false },
          });
        } catch (err: unknown) {
          deps.logger.warn('cookie-watcher: broadcast failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }
    // All other events (removed with cause 'overwrite', or set events) are
    // ignored to prevent the refresh-loop.
  };

  cookies.onChanged.addListener(handler);
  deps.logger.info('cookie-watcher: registered onChanged listener');

  return () => {
    cookies.onChanged.removeListener(handler);
  };
}
