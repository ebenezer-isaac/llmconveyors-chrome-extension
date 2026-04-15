// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createMasterResumeClient } from '@/src/background/master-resume';
import type { Logger } from '@/src/background/log';

function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const GOOD_RESPONSE = {
  userId: 'u1',
  label: 'Master',
  rawText: 'text',
  structuredData: { basics: { name: 'Ada' } },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function deps(options: {
  fetchImpl: typeof globalThis.fetch;
  token?: string | null;
}) {
  return {
    fetch: options.fetchImpl,
    logger: makeLogger(),
    endpoint: 'https://api.test/api/v1/resume/master',
    accessToken: async () => (options.token === undefined ? 'AT' : options.token),
  };
}

describe('master-resume client.get', () => {
  it('returns ok with the wrapped envelope peeled', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: GOOD_RESPONSE }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns ok when the server omits the envelope wrapper', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(GOOD_RESPONSE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns not-found on 404', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('', { status: 404 }),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toEqual({ kind: 'not-found' });
  });

  it('returns unauthenticated when no token available', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl, token: null }));
    const r = await client.get();
    expect(r).toEqual({ kind: 'unauthenticated' });
  });

  it('returns unauthenticated on 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toEqual({ kind: 'unauthenticated' });
  });

  it('returns network-error when fetch rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toMatchObject({ kind: 'network-error' });
  });

  it('returns shape-mismatch when response body has wrong shape', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ wrong: 'shape' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.get();
    expect(r).toMatchObject({ kind: 'shape-mismatch' });
  });
});

describe('master-resume client.put', () => {
  it('rejects payload before dispatch on client-side validation failure', async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.put({ label: '', rawText: 'text' });
    expect(r).toMatchObject({ kind: 'validation-error' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns ok after successful PUT', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: GOOD_RESPONSE }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.put({ label: 'Master', rawText: 'text' });
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns validation-error on 400', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: { message: 'bad input' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;
    const client = createMasterResumeClient(deps({ fetchImpl }));
    const r = await client.put({ label: 'Master', rawText: 'text' });
    expect(r.kind).toBe('validation-error');
  });
});
