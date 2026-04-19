// SPDX-License-Identifier: MIT

import type { Logger } from '../log';
import { clientEnv } from '../../shared/env';

export interface GoogleAuthDeps {
  readonly logger: Logger;
  readonly fetch: typeof globalThis.fetch;
}

export type GoogleSignInResult =
  | { readonly kind: 'ok'; readonly userId: string }
  | { readonly kind: 'failed'; readonly reason: string };

function getChromeIdentity(): typeof chrome.identity | null {
  const g = globalThis as unknown as { chrome?: { identity?: typeof chrome.identity } };
  return g.chrome?.identity ?? null;
}

function getCookiesApi() {
  const g = globalThis as unknown as { chrome?: { cookies?: typeof chrome.cookies } };
  return g.chrome?.cookies ?? null;
}

/**
 * Executes a native Google sign in using `chrome.identity`,
 * passes the raw token to the generic LLMC extension endpoint,
 * and seamlessly synchronizes the resulting SuperTokens session into Chrome's native cookie jar
 * so that both the extension and Next.js web app share the exact identical session.
 */
export async function signInWithGoogle(deps: GoogleAuthDeps, interactive = true): Promise<GoogleSignInResult> {
  deps.logger.info('google-auth: === INITIATING NATIVE EXTENSION OAUTH FLOW ===', { interactive, method: 'signInWithGoogle' });

  const identity = getChromeIdentity();
  if (!identity) {
    deps.logger.error('google-auth: FATAL - chrome.identity namespace missing natively.');
    return { kind: 'failed', reason: 'ApiUnavailable' };
  }

  // 1. Get the native Google Auth Token from Chrome
  deps.logger.debug('google-auth: issuing identity.getAuthToken directly against Chrome backend...');
  let token: string | undefined;
  try {
    token = await new Promise<string | undefined>((resolve, reject) => {
      identity.getAuthToken({ interactive }, (t) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Unknown Chrome Auth Error'));
        } else {
          resolve(t);
        }
      });
    });
  } catch (error: unknown) {
    const errorMsg = (error as Error)?.message || String(error);
    deps.logger.warn('google-auth: getAuthToken REJECTED by native Chrome identity API!', { explicitError: errorMsg });
    return { kind: 'failed', reason: 'UserCancelledOrError' };
  }

  if (!token) {
    deps.logger.warn('google-auth: getAuthToken gracefully returned missing falsy token. Aborting.');
    return { kind: 'failed', reason: 'EmptyToken' };
  }
  
  deps.logger.info('google-auth: Token securely acquired. Validating exactly now.');

  // 2. Submit Token to Backend
  const endpoint = `${clientEnv.apiBaseUrl}/auth/extension-google-callback`;
  deps.logger.debug('google-auth: posting token to backend', { endpoint });

  let response: Response;
  try {
    response = await deps.fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch (error) {
    deps.logger.error('google-auth: network error during token submission', { error });
    return { kind: 'failed', reason: 'NetworkError' };
  }

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch { /* ignore */ }
    deps.logger.warn('google-auth: backend rejected token', { status: response.status, errBody });
    // Remove invalid token from cache so next attempt forces prompt
    identity.removeCachedAuthToken({ token }, () => {});
    return { kind: 'failed', reason: `BackendRejected:${response.status}` };
  }

  // 3. Extract Header-Mode SuperTokens out of response
  const stAccessToken = response.headers.get('st-access-token');
  const stRefreshToken = response.headers.get('st-refresh-token');
  const frontToken = response.headers.get('front-token');

  if (!stAccessToken || !stRefreshToken || !frontToken) {
    deps.logger.error('google-auth: backend response missing SuperTokens headers');
    return { kind: 'failed', reason: 'MissingSessionHeaders' };
  }

  // 4. Force inject into Chrome's cookie jar for the LLMC domains.
  const cookiesApi = getCookiesApi();
  if (!cookiesApi) {
    deps.logger.error('google-auth: chrome.cookies API missing, cannot sync web app');
    return { kind: 'failed', reason: 'CookiesApiUnavailable' };
  }

  // Target domain for cross-sync is .llmconveyors.com
  const rawDomain = clientEnv.authCookieDomain; 
  const isLocalhost = rawDomain === 'localhost';
  const targetDomain = isLocalhost ? undefined : (rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`);
  const targetUrl = clientEnv.authCookieUrl;

  deps.logger.info('google-auth: Configuration synthesized for chrome.cookies synchronization', { targetUrl, targetDomain, isLocalhost });

  // Helper to map headers to standard SuperTokens lax cookies
  const secure = !isLocalhost;
  const applyCookie = (name: string, value: string, httpOnly: boolean) => 
    new Promise<void>((resolve) => {
      deps.logger.debug(`google-auth: Committing cookie write block to Chrome native jar`, { name, targetUrl, targetDomain });
      cookiesApi.set({
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

  // Map to the canonical web-js cookie names
  await Promise.all([
    applyCookie('sAccessToken', stAccessToken, true),
    applyCookie('sRefreshToken', stRefreshToken, true),
    applyCookie('sFrontToken', frontToken, false),
    // SuperTokens requires sIdRefreshToken to exist for web-js to recognize standard HTTP-only session presence
    applyCookie('sIdRefreshToken', 'token', false)
  ]);

  let userId = 'unknown';
  try {
    const b64 = frontToken.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    const padded = pad ? b64 + '='.repeat(4 - pad) : b64;
    const jsonStr = globalThis.decodeURIComponent(globalThis.atob(padded).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const b = globalThis.JSON.parse(jsonStr);
    if (b && b.uid) userId = b.uid;
  } catch { /* ignore */ }

  deps.logger.info('google-auth: natively synced session to cookies, success', { userId, targetDomain });
  
  return { kind: 'ok', userId };
}
