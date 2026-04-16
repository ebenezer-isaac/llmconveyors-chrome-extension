// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { parseSseFrames, createSseManager } from '../../../../src/background/generation/sse-manager';
import type { SessionManager } from '../../../../src/background/session/session-manager';
import type { StoredSession } from '../../../../src/background/messaging/schemas/auth.schema';

describe('parseSseFrames', () => {
  it('splits on blank lines and concatenates multi-line data frames', () => {
    const buf =
      'data: {"a":1}\n\ndata: {"b":\ndata: 2}\n\ndata: {"c":3}\npartial';
    const r = parseSseFrames(buf);
    expect(r.frames).toEqual(['{"a":1}', '{"b":\n2}']);
    expect(r.leftover).toBe('data: {"c":3}\npartial');
  });

  it('skips non-data prefixes (event:, id:, retry:)', () => {
    const buf = 'event: phase\nid: 1\ndata: {"x":1}\n\n';
    const r = parseSseFrames(buf);
    expect(r.frames).toEqual(['{"x":1}']);
  });

  it('handles an empty buffer without throwing', () => {
    const r = parseSseFrames('');
    expect(r.frames).toEqual([]);
    expect(r.leftover).toBe('');
  });
});

function makeSseResponseBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller): void {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]!));
        idx += 1;
      } else {
        controller.close();
      }
    },
  });
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function fakeSessionManager(session: StoredSession | null): SessionManager {
  return {
    getSession: vi.fn(async () => session),
  } as unknown as SessionManager;
}

const VALID_SESSION: StoredSession = {
  accessToken: 'tok',
  refreshToken: 'rt',
  expiresAt: Date.now() + 3_600_000,
  userId: 'u',
};

describe('createSseManager', () => {
  it('broadcasts a well-formed update frame', async () => {
    const seen: Array<{ key: string; data: unknown }> = [];
    const broadcast = async (msg: { key: string; data: unknown }): Promise<void> => {
      seen.push(msg);
    };
    const body = makeSseResponseBody([
      'data: {"generationId":"g1","sessionId":"s1","phase":"extract","status":"running","progress":0.5}\n\n',
    ]);
    const fetchFn = vi.fn(
      async () => ({ ok: true, status: 200, body }) as unknown as Response,
    );
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: fakeSessionManager(VALID_SESSION),
      broadcast,
    });
    const r = await m.subscribe({ generationId: 'g1' });
    expect(r).toEqual({ ok: true });
    // Drain microtasks so the stream pump runs.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]?.key).toBe('GENERATION_UPDATE');
  });

  it('emits GENERATION_COMPLETE on terminal status', async () => {
    const seen: Array<{ key: string; data: unknown }> = [];
    const broadcast = async (msg: { key: string; data: unknown }): Promise<void> => {
      seen.push(msg);
    };
    const body = makeSseResponseBody([
      'data: {"generationId":"g2","sessionId":"s2","phase":"final","status":"completed"}\n\n',
    ]);
    const fetchFn = vi.fn(
      async () => ({ ok: true, status: 200, body }) as unknown as Response,
    );
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: fakeSessionManager(VALID_SESSION),
      broadcast,
    });
    await m.subscribe({ generationId: 'g2' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const keys = seen.map((c) => c.key);
    expect(keys).toContain('GENERATION_UPDATE');
    expect(keys).toContain('GENERATION_COMPLETE');
  });

  it('refuses to open a second subscription for the same generationId', async () => {
    const broadcast = vi.fn(async () => undefined);
    const body = makeSseResponseBody([]);
    const fetchFn = vi.fn(
      async () => ({ ok: true, status: 200, body }) as unknown as Response,
    );
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: fakeSessionManager(VALID_SESSION),
      broadcast,
    });
    const a = await m.subscribe({ generationId: 'g3' });
    const b = await m.subscribe({ generationId: 'g3' });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('already-subscribed');
  });

  it('returns signed-out when the SessionManager reports no session', async () => {
    const m = createSseManager({
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: () => 'https://x',
      sessionManager: fakeSessionManager(null),
      broadcast: vi.fn(async () => undefined),
    });
    const r = await m.subscribe({ generationId: 'g4' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signed-out');
  });

  it('on 401 handshake -> silent signin success -> retry handshake -> active', async () => {
    const seen: Array<{ key: string; data: unknown }> = [];
    const broadcast = async (msg: { key: string; data: unknown }): Promise<void> => {
      seen.push(msg);
    };
    const body = makeSseResponseBody([
      'data: {"generationId":"g5","sessionId":"s5","phase":"x","status":"running"}\n\n',
    ]);
    let call = 0;
    const fetchFn = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 401, body: null } as unknown as Response;
      }
      return { ok: true, status: 200, body } as unknown as Response;
    });
    const NEW_SESSION = { ...VALID_SESSION, accessToken: 'tok-2' };
    let sessionIdx = 0;
    const sessions = [VALID_SESSION, NEW_SESSION];
    const sm = {
      getSession: vi.fn(async () => sessions[Math.min(sessionIdx++, 1)]!),
    } as unknown as SessionManager;
    const onAuthLost = vi.fn(async () => true);
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: sm,
      broadcast,
      onAuthLost,
    });
    const r = await m.subscribe({ generationId: 'g5' });
    expect(r).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // The retry handshake must use the refreshed token.
    const [, retryInit] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    const headers = retryInit.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-2');
    // No AUTH_STATE_CHANGED on success.
    expect(seen.find((s) => s.key === 'AUTH_STATE_CHANGED')).toBeUndefined();
    // GENERATION_UPDATE eventually broadcast.
    expect(seen.find((s) => s.key === 'GENERATION_UPDATE')).toBeDefined();
  });

  it('on 401 handshake -> silent signin failure -> AUTH_STATE_CHANGED { signedIn: false }', async () => {
    const seen: Array<{ key: string; data: unknown }> = [];
    const broadcast = async (msg: { key: string; data: unknown }): Promise<void> => {
      seen.push(msg);
    };
    const fetchFn = vi.fn(
      async () => ({ ok: false, status: 401, body: null }) as unknown as Response,
    );
    const onAuthLost = vi.fn(async () => false);
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: fakeSessionManager(VALID_SESSION),
      broadcast,
      onAuthLost,
    });
    await m.subscribe({ generationId: 'g6' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const auth = seen.find((s) => s.key === 'AUTH_STATE_CHANGED');
    expect(auth).toBeDefined();
    expect(auth?.data).toEqual({ signedIn: false });
    expect(m.isSubscribed('g6')).toBe(false);
  });

  it('on 401 handshake when no onAuthLost is configured -> AUTH_STATE_CHANGED', async () => {
    const seen: Array<{ key: string; data: unknown }> = [];
    const broadcast = async (msg: { key: string; data: unknown }): Promise<void> => {
      seen.push(msg);
    };
    const fetchFn = vi.fn(
      async () => ({ ok: false, status: 401, body: null }) as unknown as Response,
    );
    const m = createSseManager({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      logger: logger(),
      buildUrl: (id) => `https://x/${id}`,
      sessionManager: fakeSessionManager(VALID_SESSION),
      broadcast,
    });
    await m.subscribe({ generationId: 'g7' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen.find((s) => s.key === 'AUTH_STATE_CHANGED')?.data).toEqual({
      signedIn: false,
    });
  });
});
