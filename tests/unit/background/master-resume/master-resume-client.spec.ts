// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createMasterResumeClient } from '@/src/background/master-resume';
import type { Logger } from '@/src/background/log';
import type { FetchAuthed, FetchAuthedResult } from '@/src/background/auth';

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

function fetchAuthedReturning(
  outcomes: readonly FetchAuthedResult[],
): FetchAuthed {
  let i = 0;
  const fn: FetchAuthed = async (): Promise<FetchAuthedResult> => {
    const next = outcomes[Math.min(i, outcomes.length - 1)];
    i += 1;
    if (next === undefined) throw new Error('no outcomes left');
    return next;
  };
  return vi.fn(fn);
}

function deps(options: { fetchAuthed: FetchAuthed }) {
  return {
    fetchAuthed: options.fetchAuthed,
    logger: makeLogger(),
    endpoint: 'https://api.test/api/v1/resume/master',
  };
}

describe('master-resume client.get', () => {
  it('returns ok with the wrapped envelope peeled', async () => {
    const response = new Response(
      JSON.stringify({ success: true, data: GOOD_RESPONSE }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.get();
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns ok when the server omits the envelope wrapper', async () => {
    const response = new Response(JSON.stringify(GOOD_RESPONSE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.get();
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns not-found on 404', async () => {
    const response = new Response('', { status: 404 });
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.get();
    expect(r).toEqual({ kind: 'not-found' });
  });

  it('returns unauthenticated when fetchAuthed reports unauthenticated', async () => {
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'unauthenticated' }]) }),
    );
    const r = await client.get();
    expect(r).toEqual({ kind: 'unauthenticated' });
  });

  it('returns network-error when fetchAuthed reports network error', async () => {
    const client = createMasterResumeClient(
      deps({
        fetchAuthed: fetchAuthedReturning([
          { kind: 'network-error', error: new TypeError('offline') },
        ]),
      }),
    );
    const r = await client.get();
    expect(r).toMatchObject({ kind: 'network-error' });
  });

  it('returns shape-mismatch when response body has wrong shape', async () => {
    const response = new Response(JSON.stringify({ wrong: 'shape' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.get();
    expect(r).toMatchObject({ kind: 'shape-mismatch' });
  });
});

describe('master-resume client.put', () => {
  it('rejects payload before dispatch on client-side validation failure', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'ok' as const,
      response: new Response('', { status: 200 }),
    }));
    const client = createMasterResumeClient(deps({ fetchAuthed }));
    const r = await client.put({ label: '', rawText: 'text' });
    expect(r).toMatchObject({ kind: 'validation-error' });
    expect(fetchAuthed).not.toHaveBeenCalled();
  });

  it('returns ok after successful PUT', async () => {
    const response = new Response(
      JSON.stringify({ success: true, data: GOOD_RESPONSE }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.put({ label: 'Master', rawText: 'text' });
    expect(r).toEqual({ kind: 'ok', resume: GOOD_RESPONSE });
  });

  it('returns validation-error on 400', async () => {
    const response = new Response(
      JSON.stringify({
        success: false,
        data: null,
        error: { message: 'bad input' },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const client = createMasterResumeClient(
      deps({ fetchAuthed: fetchAuthedReturning([{ kind: 'ok', response }]) }),
    );
    const r = await client.put({ label: 'Master', rawText: 'text' });
    expect(r.kind).toBe('validation-error');
  });
});
