// SPDX-License-Identifier: MIT
/**
 * Cookie-based silent auth exchange.
 *
 * Reads the SuperTokens `sAccessToken` cookie from the web domain via
 * `chrome.cookies.get()` and exchanges it for a header-mode session by
 * calling the backend's extension-token-exchange endpoint with a Bearer
 * header.
 *
 * This replaces the `launchWebAuthFlow({ interactive: false })` silent
 * path which never worked because Chrome's non-interactive flow does not
 * execute JavaScript on the bridge page.
 */

import type { Logger } from '../log';
import type { StoredSession } from '../messaging/schemas/auth.schema';
import { StoredSessionSchema } from '../messaging/schemas/auth.schema';
import { extractUserIdFromJwt } from './jwt-decode';

const COOKIE_NAME = 'sAccessToken';
const COOKIE_URL = 'https://llmconveyors.com';

export interface CookieExchangeDeps {
  readonly logger: Logger;
  readonly fetch: typeof globalThis.fetch;
  readonly exchangeEndpoint: string;
  readonly storage: {
    readonly writeSession: (s: StoredSession) => Promise<void>;
  };
  readonly broadcast: {
    readonly sendRuntime: (msg: {
      readonly key: string;
      readonly data: unknown;
    }) => Promise<void>;
  };
}

export type CookieExchangeResult =
  | { readonly kind: 'ok'; readonly userId: string }
  | { readonly kind: 'no-cookie' }
  | { readonly kind: 'exchange-failed'; readonly reason: string }
  | { readonly kind: 'unavailable' };

interface CookiesGetApi {
  get: (
    details: { url: string; name: string },
    callback?: (cookie: { value: string } | null) => void,
  ) => Promise<{ value: string } | null> | void;
}

function getCookiesApi(): CookiesGetApi | null {
  const g = globalThis as unknown as {
    chrome?: { cookies?: CookiesGetApi };
    browser?: { cookies?: CookiesGetApi };
  };
  return g.chrome?.cookies ?? g.browser?.cookies ?? null;
}

/**
 * Read the sAccessToken cookie. Handles both promise-based (MV3) and
 * callback-based (MV2) chrome.cookies.get signatures.
 */
async function readCookie(api: CookiesGetApi): Promise<string | null> {
  const details = { url: COOKIE_URL, name: COOKIE_NAME };
  const result = api.get(details);
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    const cookie = await (result as Promise<{ value: string } | null>);
    return cookie?.value ?? null;
  }
  // Callback style
  return new Promise<string | null>((resolve) => {
    api.get(details, (cookie) => {
      resolve(cookie?.value ?? null);
    });
  });
}

/**
 * Unwrap the backend's `{ success, data: { ... } }` envelope. Returns
 * the inner data object, or null if the shape is unexpected.
 */
function unwrapEnvelope(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  // Direct shape: { accessToken, refreshToken, ... }
  if (typeof obj.accessToken === 'string') return obj;
  // Envelope shape: { success: true, data: { accessToken, ... } }
  if (obj.success === true && typeof obj.data === 'object' && obj.data !== null) {
    const inner = obj.data as Record<string, unknown>;
    if (typeof inner.accessToken === 'string') return inner;
  }
  return null;
}

export function createCookieExchange(
  deps: CookieExchangeDeps,
): () => Promise<CookieExchangeResult> {
  return async (): Promise<CookieExchangeResult> => {
    const cookiesApi = getCookiesApi();
    if (cookiesApi === null) {
      deps.logger.debug('cookie-exchange: chrome.cookies API unavailable');
      return { kind: 'unavailable' };
    }

    let cookieValue: string | null;
    try {
      cookieValue = await readCookie(cookiesApi);
    } catch (err) {
      deps.logger.debug('cookie-exchange: failed to read cookie', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { kind: 'no-cookie' };
    }

    if (cookieValue === null || cookieValue.length === 0) {
      deps.logger.debug('cookie-exchange: no sAccessToken cookie found');
      return { kind: 'no-cookie' };
    }

    // Call the exchange endpoint with Bearer auth
    let response: Response;
    try {
      response = await deps.fetch(deps.exchangeEndpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cookieValue}`,
          'st-auth-mode': 'header',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.warn('cookie-exchange: network error', { error: msg });
      return { kind: 'exchange-failed', reason: `network: ${msg}` };
    }

    if (!response.ok) {
      deps.logger.warn('cookie-exchange: exchange returned non-200', {
        status: response.status,
      });
      return {
        kind: 'exchange-failed',
        reason: `http ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      deps.logger.warn('cookie-exchange: response not JSON');
      return { kind: 'exchange-failed', reason: 'response not JSON' };
    }

    const data = unwrapEnvelope(body);
    if (data === null) {
      deps.logger.warn('cookie-exchange: unexpected response shape');
      return { kind: 'exchange-failed', reason: 'unexpected response shape' };
    }

    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';
    const refreshToken =
      typeof data.refreshToken === 'string' ? data.refreshToken : '';
    const accessTokenExpiry =
      typeof data.accessTokenExpiry === 'number' &&
      Number.isFinite(data.accessTokenExpiry) &&
      data.accessTokenExpiry > 0
        ? data.accessTokenExpiry
        : 0;

    // userId MUST come from JWT decode, not from the response
    let userId: string;
    try {
      userId = extractUserIdFromJwt(accessToken);
    } catch (err) {
      deps.logger.warn('cookie-exchange: JWT decode failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { kind: 'exchange-failed', reason: 'JWT decode failed' };
    }

    const candidate: StoredSession = {
      accessToken,
      refreshToken,
      expiresAt: accessTokenExpiry,
      userId,
    };

    const validated = StoredSessionSchema.safeParse(candidate);
    if (!validated.success) {
      deps.logger.warn('cookie-exchange: session shape invalid', {
        issues: validated.error.issues.length,
      });
      return { kind: 'exchange-failed', reason: 'session shape invalid' };
    }

    await deps.storage.writeSession(validated.data);
    await deps.broadcast.sendRuntime({
      key: 'AUTH_STATE_CHANGED',
      data: { signedIn: true, userId },
    });

    deps.logger.info('cookie-exchange: session established', {
      userId,
    });
    return { kind: 'ok', userId };
  };
}
