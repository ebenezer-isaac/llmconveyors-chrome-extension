// SPDX-License-Identifier: MIT
/**
 * Reactive account UI sync via `chrome.cookies.onChanged`.
 *
 * Emits AUTH_STATE_CHANGED to the popup when the SuperTokens session
 * appears or disappears. It does NOT exchange tokens or make requests,
 * because the fetch wrapper now natively proxies the cookie jar.
 */

import type { Logger } from '../log';
import { clientEnv } from '../../shared/env';

const COOKIE_NAME = 'sFrontToken';

export interface CookieWatcherDeps {
  readonly logger: Logger;
  readonly broadcast: (message: { readonly key: string; readonly data: unknown }) => Promise<void>;
  readonly cookieDomainSuffix?: string;
}

interface CookieChangeInfo {
  readonly removed: boolean;
  readonly cause: string;
  readonly cookie: {
    readonly domain: string;
    readonly name: string;
  };
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

function isRelevantCookie(info: CookieChangeInfo, cookieDomainSuffix: string): boolean {
  if (info.cookie.name !== COOKIE_NAME) return false;
  const d = info.cookie.domain.startsWith('.')
    ? info.cookie.domain.slice(1)
    : info.cookie.domain;
  return d === cookieDomainSuffix || d.endsWith(`.${cookieDomainSuffix}`);
}

export function registerCookieWatcher(deps: CookieWatcherDeps): () => void {
  const cookieDomainSuffix = (deps.cookieDomainSuffix ?? clientEnv.authCookieDomain)
    .replace(/^\.+/, '')
    .toLowerCase();

  deps.logger.info('cookie-watcher: init', { cookieDomainSuffix, watching: COOKIE_NAME });
  const cookies = getCookies();
  if (cookies === null) {
    deps.logger.warn('cookie-watcher: chrome.cookies unavailable, skipping');
    return () => undefined;
  }

  const handler = (info: CookieChangeInfo): void => {
    if (!isRelevantCookie(info, cookieDomainSuffix)) return;

    if (info.removed && info.cause === 'overwrite') {
      // Ignore routine token rotation overwrites
      return;
    }

    const signedIn = !info.removed;
    deps.logger.info('cookie-watcher: session state changed', { signedIn, cause: info.cause });

    void deps.broadcast({
      key: 'AUTH_STATE_CHANGED',
      data: { signedIn },
    }).catch(err => {
      deps.logger.warn('cookie-watcher: broadcast failed', { error: String(err) });
    });
  };

  cookies.onChanged.addListener(handler);
  return () => cookies.onChanged.removeListener(handler);
}
