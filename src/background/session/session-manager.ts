// SPDX-License-Identifier: MIT
/**
 * SessionManager - single-flight refresh dedup with DI (D20).
 *
 * Production instantiates once via initSessionManager() with real deps.
 * Tests construct a fresh instance with fake deps per case; no module-level
 * state to reset, no timing races between tests.
 */

import type { StoredSession } from '../messaging/schemas/auth.schema';
import type { Logger } from '../log';
import {
  SessionExpiredError,
  SessionRefreshNetworkError,
} from '../messaging/errors';
import { PROACTIVE_REFRESH_WINDOW_MS } from '../config';

export interface SessionManagerDeps {
  readonly readSession: () => Promise<StoredSession | null>;
  readonly writeSession: (s: StoredSession) => Promise<void>;
  readonly clearSession: () => Promise<void>;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly logger: Logger;
  readonly refreshEndpoint: string;
  readonly refreshWindowMs?: number;
}

export class SessionManager {
  private inflight: Promise<StoredSession> | null = null;
  private readonly refreshWindowMs: number;

  constructor(private readonly deps: SessionManagerDeps) {
    this.refreshWindowMs = deps.refreshWindowMs ?? PROACTIVE_REFRESH_WINDOW_MS;
  }

  /** Return the current session, refreshing proactively if needed. */
  async getSession(): Promise<StoredSession | null> {
    const existing = await this.deps.readSession();
    if (existing === null) return null;
    const now = this.deps.now();
    if (existing.expiresAt - now < this.refreshWindowMs) {
      try {
        return await this.refreshOnce();
      } catch {
        return null;
      }
    }
    return existing;
  }

  /**
   * Single-flight refresh. Concurrent callers share the same in-flight
   * promise. Stored session is cleared ONLY when the failure is a server
   * rejection or a malformed body (the refresh token is no longer valid).
   * A transport-level failure (network blip, offline, TLS) leaves the
   * stored session intact so the next attempt can succeed without forcing
   * an interactive re-sign-in.
   */
  refreshOnce(): Promise<StoredSession> {
    if (this.inflight !== null) {
      this.deps.logger.debug('session: refresh dedup - joining in-flight');
      return this.inflight;
    }
    this.inflight = this.doRefresh()
      .catch(async (err: unknown) => {
        if (err instanceof SessionRefreshNetworkError) {
          this.deps.logger.warn('session: refresh network failure - keeping stored session', {
            error: err.message,
          });
          throw err;
        }
        try {
          await this.deps.clearSession();
        } catch (clearErr) {
          this.deps.logger.warn('session: clearSession after failure also failed', {
            error: String(clearErr),
          });
        }
        throw err;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async doRefresh(): Promise<StoredSession> {
    const existing = await this.deps.readSession();
    if (existing === null) {
      throw new SessionExpiredError('no session in storage', 'missing');
    }
    this.deps.logger.info('session: starting refresh', { userId: existing.userId });

    let res: Response;
    try {
      res = await this.deps.fetch(this.deps.refreshEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: existing.refreshToken }),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : 'unknown';
      this.deps.logger.error('session: refresh network error', networkErr);
      throw new SessionRefreshNetworkError(msg);
    }

    if (res.status === 401 || res.status === 403) {
      this.deps.logger.warn('session: refresh rejected', { status: res.status });
      throw new SessionExpiredError(`server rejected (${res.status})`, 'rejected');
    }
    if (!res.ok) {
      throw new SessionExpiredError(`refresh failed: ${res.status}`, 'rejected');
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SessionExpiredError('refresh response is not JSON', 'malformed');
    }

    if (typeof body !== 'object' || body === null) {
      throw new SessionExpiredError('refresh response is not an object', 'malformed');
    }
    const obj = body as Record<string, unknown>;
    // Backend's global ResponseTransformInterceptor wraps every response in
    // { success, data, requestId, timestamp }. Mirror the same envelope
    // tolerance the A4 bridge page uses (extractTokens helper) so the
    // extension reads the right shape whether the body is enveloped or raw.
    const source: Record<string, unknown> =
      obj.data !== null && typeof obj.data === 'object' && !Array.isArray(obj.data)
        ? (obj.data as Record<string, unknown>)
        : obj;

    const accessToken = typeof source.accessToken === 'string' ? source.accessToken : null;
    const refreshToken =
      typeof source.refreshToken === 'string' && source.refreshToken.length > 0
        ? source.refreshToken
        : existing.refreshToken;
    const expiresAt =
      typeof source.expiresAt === 'number' && Number.isFinite(source.expiresAt) && source.expiresAt > 0
        ? source.expiresAt
        : null;
    const userId =
      typeof source.userId === 'string' && source.userId.length > 0
        ? source.userId
        : existing.userId;

    if (accessToken === null || accessToken.length === 0) {
      throw new SessionExpiredError('refresh missing accessToken', 'malformed');
    }
    if (expiresAt === null) {
      throw new SessionExpiredError('refresh missing or invalid expiresAt', 'malformed');
    }

    const next: StoredSession = { accessToken, refreshToken, expiresAt, userId };
    await this.deps.writeSession(next);
    this.deps.logger.info('session: refresh ok', { expiresAt });
    return next;
  }
}

let singleton: SessionManager | null = null;

export function initSessionManager(deps: SessionManagerDeps): SessionManager {
  singleton = new SessionManager(deps);
  return singleton;
}

export function getSessionManager(): SessionManager | null {
  return singleton;
}

/** Test-only reset. */
export function __resetSessionManager(): void {
  singleton = null;
}
