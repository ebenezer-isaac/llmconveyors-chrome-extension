// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createMasterResumeHandlers } from '@/src/background/master-resume';
import type {
  MasterResumeGetOutcome,
  MasterResumePutOutcome,
  MasterResumeResponse,
} from '@/src/background/master-resume';
import type { Logger } from '@/src/background/log';

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeResponse(): MasterResumeResponse {
  return {
    userId: 'u1',
    label: 'Master',
    rawText: 'text',
    structuredData: { basics: { name: 'Ada', email: 'ada@example.com' } },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function buildDeps(overrides: {
  clientGet?: () => Promise<MasterResumeGetOutcome>;
  clientPut?: () => Promise<MasterResumePutOutcome>;
  cacheRead?: () => Promise<{ response: MasterResumeResponse; fetchedAt: number } | null>;
  cacheStale?: () => Promise<{ response: MasterResumeResponse; fetchedAt: number } | null>;
} = {}) {
  const broadcast = vi.fn(async () => undefined);
  const cacheWrite = vi.fn(async () => undefined);
  const cacheClear = vi.fn(async () => undefined);
  return {
    broadcast,
    cacheWrite,
    cacheClear,
    deps: {
      client: {
        get: overrides.clientGet ?? (async () => ({ kind: 'not-found' as const })),
        put: overrides.clientPut ?? (async () => ({ kind: 'ok' as const, resume: makeResponse() })),
      },
      cache: {
        read: overrides.cacheRead ?? (async () => null),
        readStale: overrides.cacheStale ?? (async () => null),
        write: cacheWrite,
        clear: cacheClear,
      },
      logger: makeLogger(),
      broadcastUnauthenticated: broadcast,
    },
  };
}

describe('MASTER_RESUME_GET', () => {
  it('serves from cache when fresh', async () => {
    const cached = { response: makeResponse(), fetchedAt: 1 };
    const ctx = buildDeps({ cacheRead: async () => cached });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: true, resume: cached.response });
  });

  it('returns resume: null on not-found and clears cache', async () => {
    const ctx = buildDeps({ clientGet: async () => ({ kind: 'not-found' as const }) });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: true, resume: null });
    expect(ctx.cacheClear).toHaveBeenCalled();
  });

  it('fetches from backend and writes cache on ok', async () => {
    const response = makeResponse();
    const ctx = buildDeps({ clientGet: async () => ({ kind: 'ok' as const, resume: response }) });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: true, resume: response });
    expect(ctx.cacheWrite).toHaveBeenCalledWith(response);
  });

  it('broadcasts sign-out on unauthenticated', async () => {
    const ctx = buildDeps({ clientGet: async () => ({ kind: 'unauthenticated' as const }) });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(ctx.broadcast).toHaveBeenCalled();
    expect(ctx.cacheClear).toHaveBeenCalled();
  });

  it('falls back to stale cache on network-error', async () => {
    const stale = { response: makeResponse(), fetchedAt: 1 };
    const ctx = buildDeps({
      clientGet: async () => ({ kind: 'network-error' as const, message: 'offline' }),
      cacheStale: async () => stale,
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: true, resume: stale.response });
  });

  it('returns network-error when no stale cache available', async () => {
    const ctx = buildDeps({
      clientGet: async () => ({ kind: 'network-error' as const, message: 'offline' }),
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: false, reason: 'network-error' });
  });

  it('returns api-error with status on 500', async () => {
    const ctx = buildDeps({
      clientGet: async () => ({ kind: 'api-error' as const, status: 500 }),
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: false, reason: 'api-error', status: 500 });
  });

  it('falls back to stale cache on shape-mismatch', async () => {
    const stale = { response: makeResponse(), fetchedAt: 1 };
    const ctx = buildDeps({
      clientGet: async () => ({ kind: 'shape-mismatch' as const, issues: 2 }),
      cacheStale: async () => stale,
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_GET({ data: {} });
    expect(r).toEqual({ ok: true, resume: stale.response });
  });
});

describe('MASTER_RESUME_PUT', () => {
  it('writes cache on ok', async () => {
    const ctx = buildDeps();
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_PUT({ data: { label: 'Master', rawText: 'text' } });
    expect(r.ok).toBe(true);
    expect(ctx.cacheWrite).toHaveBeenCalled();
  });

  it('returns validation-error with issues on 400', async () => {
    const ctx = buildDeps({
      clientPut: async () => ({ kind: 'validation-error' as const, issues: ['label: required'] }),
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_PUT({ data: { label: 'Master', rawText: 'text' } });
    expect(r).toEqual({
      ok: false,
      reason: 'validation-error',
      issues: ['label: required'],
    });
  });

  it('clears cache and broadcasts on unauthenticated', async () => {
    const ctx = buildDeps({
      clientPut: async () => ({ kind: 'unauthenticated' as const }),
    });
    const h = createMasterResumeHandlers(ctx.deps);
    const r = await h.MASTER_RESUME_PUT({ data: { label: 'Master', rawText: 'text' } });
    expect(r).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(ctx.broadcast).toHaveBeenCalled();
    expect(ctx.cacheClear).toHaveBeenCalled();
  });
});
