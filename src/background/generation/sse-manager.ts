// SPDX-License-Identifier: MIT
/**
 * SSE manager (fetch-based). Chrome MV3 service workers cannot use
 * EventSource with custom headers (no Authorization support), so we use a
 * fetch() + ReadableStream reader and parse the `data: {...}\n\n` frames
 * manually.
 *
 * The manager owns at most one active subscription per generationId. It
 * broadcasts every parsed frame as a GENERATION_UPDATE runtime message and,
 * when it observes a completion frame (status in
 * {'completed','failed','cancelled'}), emits a GENERATION_COMPLETE broadcast
 * so downstream caches (session list) can invalidate themselves.
 *
 * Authentication: SSE is a long-lived streaming connection so it does not
 * go through `fetchAuthed`'s 401-then-retry path. It consults the
 * SessionManager for a refreshed access token before opening the stream.
 * On a 401/403 during the initial handshake, the manager invokes the
 * injected `onAuthLost` callback exactly once, which is expected to attempt
 * a silent sign-in and return whether a fresh session is now available.
 * On success the handshake is re-pumped with the new token; on failure the
 * manager broadcasts AUTH_STATE_CHANGED so the UI flips to signed-out.
 */

import type { Logger } from '../log';
import type { SessionManager } from '../session/session-manager';
import {
  GenerationUpdateBroadcastSchema,
  type GenerationUpdateBroadcast,
} from '../messaging/schemas/generation.schema';

export type Broadcaster = (msg: {
  readonly key: string;
  readonly data: unknown;
}) => Promise<void>;

export interface SseSubscribeArgs {
  readonly generationId: string;
}

export interface SseManagerDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly logger: Logger;
  readonly buildUrl: (generationId: string) => string;
  readonly sessionManager: SessionManager;
  readonly broadcast: Broadcaster;
  /**
   * Optional auth-recovery hook. Invoked when the SSE handshake returns
   * 401/403. Implementations should attempt a silent sign-in and resolve
   * `true` if a new session is now stored, `false` otherwise. When omitted
   * (or when it returns false), the manager broadcasts
   * AUTH_STATE_CHANGED { signedIn: false } and abandons the subscription.
   */
  readonly onAuthLost?: () => Promise<boolean>;
}

interface ActiveSubscription {
  readonly generationId: string;
  readonly controller: AbortController;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Parse a raw SSE chunk into discrete `data: ...` payloads. SSE frames are
 * delimited by blank lines (`\n\n`); each frame may have multiple `data:`
 * lines concatenated with newlines. We strip `event:` / `id:` / `retry:`
 * headers because the consumer only needs the JSON payload.
 */
export function parseSseFrames(buffer: string): {
  readonly frames: readonly string[];
  readonly leftover: string;
} {
  const parts = buffer.split('\n\n');
  const leftover = parts.pop() ?? '';
  const frames: string[] = [];
  for (const raw of parts) {
    const lines = raw.split('\n');
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length > 0) {
      frames.push(dataLines.join('\n'));
    }
  }
  return { frames, leftover };
}

export function createSseManager(deps: SseManagerDeps): {
  subscribe: (args: SseSubscribeArgs) => Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: 'signed-out' | 'network-error' | 'already-subscribed' }
  >;
  unsubscribe: (generationId: string) => void;
  isSubscribed: (generationId: string) => boolean;
} {
  const active = new Map<string, ActiveSubscription>();

  async function notifyAuthLost(): Promise<void> {
    try {
      await deps.broadcast({
        key: 'AUTH_STATE_CHANGED',
        data: { signedIn: false },
      });
    } catch (err: unknown) {
      deps.logger.debug('sse: auth-lost broadcast failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function attemptHandshake(
    generationId: string,
    token: string,
    controller: AbortController,
  ): Promise<Response | null> {
    try {
      return await deps.fetch(deps.buildUrl(generationId), {
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      deps.logger.warn('sse: fetch failed', {
        error: err instanceof Error ? err.message : String(err),
        generationId,
      });
      return null;
    }
  }

  async function pump(
    generationId: string,
    initialToken: string,
    controller: AbortController,
  ): Promise<void> {
    let res = await attemptHandshake(generationId, initialToken, controller);
    if (res === null) {
      active.delete(generationId);
      return;
    }
    if (res.status === 401 || res.status === 403) {
      // Free the unread 401 body before issuing recovery work.
      try {
        void res.body?.cancel();
      } catch {
        // already cancelled
      }
      deps.logger.warn('sse: handshake auth rejected', {
        status: res.status,
        generationId,
      });
      const recovered = deps.onAuthLost !== undefined ? await deps.onAuthLost() : false;
      if (!recovered) {
        await notifyAuthLost();
        active.delete(generationId);
        return;
      }
      const refreshed = await deps.sessionManager.getSession();
      if (refreshed === null) {
        await notifyAuthLost();
        active.delete(generationId);
        return;
      }
      res = await attemptHandshake(generationId, refreshed.accessToken, controller);
      if (res === null) {
        active.delete(generationId);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        try {
          void res.body?.cancel();
        } catch {
          // already cancelled
        }
        deps.logger.warn('sse: handshake auth rejected after retry', {
          status: res.status,
          generationId,
        });
        await notifyAuthLost();
        active.delete(generationId);
        return;
      }
    }
    if (!res.ok || res.body === null) {
      deps.logger.warn('sse: non-ok response', {
        status: res.status,
        generationId,
      });
      active.delete(generationId);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!controller.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const { frames, leftover } = parseSseFrames(buffer);
        buffer = leftover;
        for (const frame of frames) {
          await handleFrame(generationId, frame);
        }
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        deps.logger.warn('sse: stream read failed', {
          error: err instanceof Error ? err.message : String(err),
          generationId,
        });
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
      active.delete(generationId);
    }
  }

  async function handleFrame(generationId: string, frame: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const envelope = parsed as Record<string, unknown>;
    // Accept both direct GenerationUpdateBroadcast shapes and backend SSE
    // envelopes that wrap the update in `{ type, payload }`. Normalize here.
    const payload =
      typeof envelope.payload === 'object' && envelope.payload !== null
        ? (envelope.payload as Record<string, unknown>)
        : envelope;
    const candidate: Record<string, unknown> = {
      generationId: typeof payload.generationId === 'string' ? payload.generationId : generationId,
      sessionId:
        typeof payload.sessionId === 'string' ? payload.sessionId : 'unknown',
      phase: typeof payload.phase === 'string' ? payload.phase : 'unknown',
      status:
        typeof payload.status === 'string' &&
        ['running', 'completed', 'failed', 'awaiting_input', 'cancelled'].includes(
          payload.status,
        )
          ? payload.status
          : 'running',
    };
    if (typeof payload.progress === 'number') candidate.progress = payload.progress;
    if (typeof payload.interactionType === 'string') {
      candidate.interactionType = payload.interactionType;
    }
    if (Array.isArray(payload.artifacts)) candidate.artifacts = payload.artifacts;

    const validated = GenerationUpdateBroadcastSchema.safeParse(candidate);
    if (!validated.success) {
      deps.logger.warn('sse: frame did not match broadcast shape', {
        issues: validated.error.issues.length,
      });
      return;
    }
    const update: GenerationUpdateBroadcast = validated.data;
    try {
      await deps.broadcast({ key: 'GENERATION_UPDATE', data: update });
    } catch (err: unknown) {
      deps.logger.debug('sse: broadcast failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (TERMINAL_STATUSES.has(update.status)) {
      try {
        await deps.broadcast({
          key: 'GENERATION_COMPLETE',
          data: {
            generationId: update.generationId,
            sessionId: update.sessionId,
          },
        });
      } catch (err: unknown) {
        deps.logger.debug('sse: complete broadcast failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      const sub = active.get(generationId);
      sub?.controller.abort();
      active.delete(generationId);
    }
  }

  return {
    async subscribe({ generationId }) {
      if (active.has(generationId)) {
        return { ok: false, reason: 'already-subscribed' };
      }
      const session = await deps.sessionManager.getSession();
      if (session === null) {
        return { ok: false, reason: 'signed-out' };
      }
      const controller = new AbortController();
      active.set(generationId, { generationId, controller });
      // Fire-and-forget; the pump lifetime is managed by the controller and
      // any terminal frame.
      void pump(generationId, session.accessToken, controller);
      return { ok: true };
    },
    unsubscribe(generationId: string): void {
      const sub = active.get(generationId);
      if (!sub) return;
      sub.controller.abort();
      active.delete(generationId);
    },
    isSubscribed(generationId: string): boolean {
      return active.has(generationId);
    },
  };
}
