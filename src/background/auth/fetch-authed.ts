// SPDX-License-Identifier: MIT

import type { Logger } from '../log';
import { clientEnv } from '../../shared/env';

export interface FetchAuthedDeps {
  readonly logger: Logger;
  readonly fetch: typeof globalThis.fetch;
  readonly onAuthFailed?: () => void;
}

export type FetchAuthedResult =
  | { readonly kind: 'ok'; readonly response: Response }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error'; readonly error: Error };

export type FetchAuthed = (
  url: string,
  init?: RequestInit,
) => Promise<FetchAuthedResult>;

function getCookiesApi() {
  const g = globalThis as unknown as { chrome?: { cookies?: typeof chrome.cookies } };
  return g.chrome?.cookies ?? null;
}

function getAuthCookieUrl() {
  return clientEnv.authCookieUrl;
}

async function getCookie(name: string, logger?: Logger): Promise<string | null> {
  const api = getCookiesApi();
  if (!api) {
    if (logger) logger.warn(`getCookie: FATAL HALT - cookies API missing while requesting ${name}`);
    return null;
  }
  const url = getAuthCookieUrl();
  if (logger) logger.debug(`getCookie: actively opening chrome.cookies pipe for ${name} at explicitly mapped url ${url}`);
  return new Promise((resolve) => {
    api.get({ url, name }, (cookie) => {
      if (chrome.runtime.lastError) {
         if (logger) logger.error(`getCookie: CHROME EXCEPTION - runtime.lastError threw during read of ${name}`, { url, error: chrome.runtime.lastError.message });
      } else {
         if (logger) logger.debug(`getCookie: Successfully evaluated native Chrome cookie resolution for ${name}`, { found: !!cookie, url });
      }
      resolve(cookie?.value ?? null);
    });
  });
}

function mergeAuthHeader(init: RequestInit | undefined, token: string): RequestInit {
  const record: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { record[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const entry of init.headers) {
        if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
          record[entry[0]] = entry[1];
        }
      }
    } else {
      for (const [k, v] of Object.entries(init.headers)) {
        if (typeof v === 'string') record[k] = v;
      }
    }
  }
  record.authorization = `Bearer ${token}`;
  record['st-auth-mode'] = 'header';
  return { ...(init ?? {}), headers: record };
}

export function createFetchAuthed(deps: FetchAuthedDeps): FetchAuthed {
  /**
   * Attempts to natively refresh the SuperTokens session.
   * If it succeeds, it writes the new cookies down to the `.llmconveyors.com` jar seamlessly.
   */
  async function attemptRefresh(): Promise<boolean> {
    deps.logger.info('fetchAuthed: attemptRefresh triggered, looking for active session to hydrate');
    const refreshToken = await getCookie('sRefreshToken', deps.logger);
    if (!refreshToken) {
      deps.logger.warn('fetchAuthed: cannot refresh, no sRefreshToken cookie exists right now');
      return false;
    }
    deps.logger.debug('fetchAuthed: initiating token renewal via backend endpoint...', { endpoint: `${clientEnv.apiBaseUrl}/auth/session/refresh` });

    try {
      const resp = await deps.fetch(`${clientEnv.apiBaseUrl}/auth/session/refresh`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${refreshToken}`,
          'st-auth-mode': 'header'
        }
      });
      if (!resp.ok) return false;

      // Unpack new headers
      const stAccessToken = resp.headers.get('st-access-token');
      const stRefreshToken = resp.headers.get('st-refresh-token');
      const frontToken = resp.headers.get('front-token');

      if (!stAccessToken || !stRefreshToken || !frontToken) return false;

      // Seed them back down to cookies jar natively
      const api = getCookiesApi();
      if (!api) return false;

      const rawDomain = clientEnv.authCookieDomain; 
      const isLocalhost = rawDomain === 'localhost';
      const targetDomain = isLocalhost ? undefined : (rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`);
      const targetUrl = clientEnv.authCookieUrl;
      const secure = !isLocalhost;

      deps.logger.debug('fetchAuthed: resolved explicitly formatted target payload configuration for cookie drop', { targetUrl, targetDomain, secure });

      const applyCookie = (name: string, value: string, httpOnly: boolean) => 
        new Promise<void>((resolve) => {
          deps.logger.debug(`fetchAuthed: dispatching write command for session artifact to chrome.cookies`, { name, targetUrl, domain: targetDomain });
          api.set({
            url: targetUrl,
            domain: targetDomain,
            name,
            value,
            path: '/',
            secure,
            httpOnly,
            sameSite: 'lax'
          }, () => {
            if (chrome.runtime.lastError) {
              deps.logger.error('applyCookie failed', { name, error: chrome.runtime.lastError.message });
            }
            resolve();
          });
        });

      await Promise.all([
        applyCookie('sAccessToken', stAccessToken, true),
        applyCookie('sRefreshToken', stRefreshToken, true),
        applyCookie('sFrontToken', frontToken, false),
        applyCookie('sIdRefreshToken', 'token', false)
      ]);

      return true;
    } catch {
      return false;
    }
  }

  return async function fetchAuthed(
    url: string,
    init?: RequestInit,
  ): Promise<FetchAuthedResult> {
    deps.logger.debug('fetchAuthed: invoked', { url });
    let accessToken = await getCookie('sAccessToken', deps.logger);
    if (!accessToken) {
      deps.logger.warn('fetchAuthed: blocked execution, missing primary access token cookie.');
      deps.onAuthFailed?.();
      return { kind: 'unauthenticated' };
    }
    deps.logger.debug('fetchAuthed: injecting access token to request headers.');

    const mergedInit = mergeAuthHeader(init, accessToken);
    let response: Response;
    try {
      response = await deps.fetch(url, mergedInit);
    } catch (err) {
      return { kind: 'network-error', error: err instanceof Error ? err : new Error(String(err)) };
    }

    if (response.status !== 401 && response.status !== 403) {
      return { kind: 'ok', response };
    }

    deps.logger.debug('fetchAuthed: 401/403, attempting native token refresh');
    const recovered = await attemptRefresh();
    if (!recovered) {
      deps.onAuthFailed?.();
      return { kind: 'unauthenticated' };
    }

    accessToken = await getCookie('sAccessToken');
    if (!accessToken) {
      deps.onAuthFailed?.();
      return { kind: 'unauthenticated' };
    }

    const retriedInit = mergeAuthHeader(init, accessToken);
    let retryResponse: Response;
    try {
      retryResponse = await deps.fetch(url, retriedInit);
    } catch (err) {
      return { kind: 'network-error', error: err instanceof Error ? err : new Error(String(err)) };
    }

    if (retryResponse.status === 401 || retryResponse.status === 403) {
      deps.onAuthFailed?.();
      return { kind: 'unauthenticated' };
    }
    return { kind: 'ok', response: retryResponse };
  };
}
