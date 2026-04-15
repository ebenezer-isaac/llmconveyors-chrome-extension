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
import { SessionExpiredError } from '../messaging/errors';
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

  /** Single-flight refresh. Concurrent callers share the same in-flight promise. */
  refreshOnce(): Promise<StoredSession> {
    if (this.inflight !== null) {
      this.deps.logger.debug('session: refresh dedup - joining in-flight');
      return this.inflight;
    }
    this.inflight = this.doRefresh()
      .catch(async (err) => {
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
      throw new SessionExpiredError('no session in storage');
    }
    this.deps.logger.info('session: starting refresh', { userId: existing.userId });

    let res: Response;
    try {
      res = await this.deps.fetch(this.deps.refreshEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${existing.refreshToken}`,
        },
        body: JSON.stringify({ refreshToken: existing.refreshToken }),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : 'unknown';
      this.deps.logger.error('session: refresh network error', networkErr);
      throw new SessionExpiredError(`network error: ${msg}`);
    }

    if (res.status === 401 || res.status === 403) {
      this.deps.logger.warn('session: refresh rejected', { status: res.status });
      throw new SessionExpiredError(`server rejected (${res.status})`);
    }
    if (!res.ok) {
      throw new SessionExpiredError(`refresh failed: ${res.status}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SessionExpiredError('refresh response is not JSON');
    }

    if (typeof body !== 'object' || body === null) {
      throw new SessionExpiredError('refresh response is not an object');
    }
    const obj = body as Record<string, unknown>;
    const accessToken = typeof obj.accessToken === 'string' ? obj.accessToken : null;
    const refreshToken =
      typeof obj.refreshToken === 'string' && obj.refreshToken.length > 0
        ? obj.refreshToken
        : existing.refreshToken;
    const expiresAt =
      typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt) && obj.expiresAt > 0
        ? obj.expiresAt
        : null;
    const userId =
      typeof obj.userId === 'string' && obj.userId.length > 0 ? obj.userId : existing.userId;

    if (accessToken === null || accessToken.length === 0) {
      throw new SessionExpiredError('refresh missing accessToken');
    }
    if (expiresAt === null) {
      throw new SessionExpiredError('refresh missing or invalid expiresAt');
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
