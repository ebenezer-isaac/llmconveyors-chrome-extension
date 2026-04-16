// SPDX-License-Identifier: MIT
/**
 * Central authenticated fetch helper.
 *
 * Every bearer-authenticated HTTP call in the extension goes through this
 * helper. It consolidates three concerns that were previously scattered
 * across call sites:
 *
 *   1. Proactive refresh. `SessionManager.getSession()` checks the stored
 *      session's expiry window and calls POST /api/v1/auth/session/refresh
 *      transparently before returning the access token. Single-flight dedup
 *      lives inside the SessionManager.
 *
 *   2. Silent 401 recovery. When the backend returns 401 or 403 despite a
 *      fresh token, we attempt one non-interactive sign-in via the A4 bridge
 *      (SuperTokens web cookie is still valid) and retry the original
 *      request exactly once with the newly stored token. A second 401 maps
 *      to `unauthenticated`.
 *
 *   3. Cooldown. A per-URL cooldown bounds silent-retry attempts so we do
 *      not starve the CPU if the backend persistently 401s (e.g. cookie was
 *      just invalidated but the refresh path landed first). Default 10s.
 *
 * The caller receives a discriminated union and never sees a raw 401.
 * Callers that need the raw Response for non-2xx handling inspect
 * `result.response` on `kind: 'ok'` (which covers both 2xx and 4xx/5xx that
 * are not 401/403).
 */

import type { SessionManager } from '../session/session-manager';
import type { Logger } from '../log';

export interface FetchAuthedDeps {
  readonly sessionManager: SessionManager;
  readonly fetch: typeof globalThis.fetch;
  /**
   * Attempt a silent (non-interactive) sign-in via the A4 bridge. Resolves
   * `true` when the sign-in stored a new session and `false` otherwise.
   * Must not throw; caller wraps any provider errors into `false`.
   */
  readonly silentSignIn: () => Promise<boolean>;
  readonly logger: Logger;
  readonly now: () => number;
  /**
   * Cooldown between silent-retry attempts per endpoint URL. Prevents a
   * tight loop if the bridge repeatedly hands back tokens the backend
   * rejects. Defaults to 10_000 ms.
   */
  readonly silentRetryCooldownMs?: number;
}

export type FetchAuthedResult =
  | { readonly kind: 'ok'; readonly response: Response }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error'; readonly error: Error };

export type FetchAuthed = (
  url: string,
  init?: RequestInit,
) => Promise<FetchAuthedResult>;

const DEFAULT_SILENT_RETRY_COOLDOWN_MS = 10_000;

function mergeAuthHeader(init: RequestInit | undefined, token: string): RequestInit {
  const existing = init?.headers;
  // Caller's headers win for everything except Authorization. Normalise all
  // three input shapes (undefined, Headers, plain object, readonly tuple
  // array) into a plain record, then write Authorization last.
  const record: Record<string, string> = {};
  if (existing !== undefined) {
    if (existing instanceof Headers) {
      existing.forEach((value, key) => {
        record[key] = value;
      });
    } else if (Array.isArray(existing)) {
      for (const entry of existing) {
        if (Array.isArray(entry) && entry.length === 2) {
          const [k, v] = entry;
          if (typeof k === 'string' && typeof v === 'string') {
            record[k] = v;
          }
        }
      }
    } else {
      for (const [k, v] of Object.entries(existing as Record<string, string>)) {
        if (typeof v === 'string') record[k] = v;
      }
    }
  }
  record.authorization = `Bearer ${token}`;
  return { ...(init ?? {}), headers: record };
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : 'unknown error');
}

export function createFetchAuthed(deps: FetchAuthedDeps): FetchAuthed {
  const cooldownMs = deps.silentRetryCooldownMs ?? DEFAULT_SILENT_RETRY_COOLDOWN_MS;
  const lastSilentAttempt = new Map<string, number>();

  async function attemptSilentRetry(url: string): Promise<boolean> {
    const now = deps.now();
    const last = lastSilentAttempt.get(url);
    if (last !== undefined && now - last < cooldownMs) {
      deps.logger.debug('fetchAuthed: silent-retry on cooldown', {
        url,
        sinceMs: now - last,
      });
      return false;
    }
    lastSilentAttempt.set(url, now);
    try {
      return await deps.silentSignIn();
    } catch (err: unknown) {
      deps.logger.debug('fetchAuthed: silent sign-in threw', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  return async function fetchAuthed(
    url: string,
    init?: RequestInit,
  ): Promise<FetchAuthedResult> {
    const session = await deps.sessionManager.getSession();
    if (session === null) {
      return { kind: 'unauthenticated' };
    }

    const mergedInit = mergeAuthHeader(init, session.accessToken);
    let response: Response;
    try {
      response = await deps.fetch(url, mergedInit);
    } catch (err: unknown) {
      return { kind: 'network-error', error: toError(err) };
    }

    if (response.status !== 401 && response.status !== 403) {
      return { kind: 'ok', response };
    }

    deps.logger.debug('fetchAuthed: 401/403, attempting silent retry', {
      url,
      status: response.status,
    });

    const recovered = await attemptSilentRetry(url);
    if (!recovered) {
      return { kind: 'unauthenticated' };
    }

    const refreshed = await deps.sessionManager.getSession();
    if (refreshed === null) {
      return { kind: 'unauthenticated' };
    }

    const retriedInit = mergeAuthHeader(init, refreshed.accessToken);
    let retryResponse: Response;
    try {
      retryResponse = await deps.fetch(url, retriedInit);
    } catch (err: unknown) {
      return { kind: 'network-error', error: toError(err) };
    }

    if (retryResponse.status === 401 || retryResponse.status === 403) {
      return { kind: 'unauthenticated' };
    }
    return { kind: 'ok', response: retryResponse };
  };
}
