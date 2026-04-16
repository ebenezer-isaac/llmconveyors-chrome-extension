// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createArtifactFetchBlobHandler } from '@/src/background/sessions/artifact-fetch-handler';

function silentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildHandler(override?: { fetchAuthed?: ReturnType<typeof vi.fn> }) {
  const fetchAuthed = override?.fetchAuthed ?? vi.fn();
  return {
    fetchAuthed,
    handler: createArtifactFetchBlobHandler({
      // Cast to bypass the FetchAuthed branded type in tests; the handler
      // only touches the outcome tags we stub below.
      fetchAuthed: fetchAuthed as never,
      baseUrl: 'https://api.example.com',
      logger: silentLogger(),
    }),
  };
}

describe('createArtifactFetchBlobHandler', () => {
  it('rejects payloads failing schema validation', async () => {
    const { handler } = buildHandler();
    const r = await handler({ data: { sessionId: '', storageKey: 'x' } });
    expect(r).toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it('rejects storage keys with path-traversal characters', async () => {
    const { handler } = buildHandler();
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'keys/../etc/passwd' },
    });
    expect(r).toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it('proxies a success response through unchanged', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'response',
      response: {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { content: 'YWJjZA==', mimeType: 'application/pdf' },
        }),
      },
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'users/u/sessions/s/cv.pdf' },
    });
    expect(r).toEqual({ ok: true, content: 'YWJjZA==', mimeType: 'application/pdf' });
    expect(fetchAuthed).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/sessions/sess-1/download?key=users%2Fu%2Fsessions%2Fs%2Fcv.pdf',
      { method: 'GET' },
    );
  });

  it('maps unauthenticated to reason unauthenticated', async () => {
    const fetchAuthed = vi.fn(async () => ({ kind: 'unauthenticated' }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.pdf' },
    });
    expect(r).toEqual({ ok: false, reason: 'unauthenticated' });
  });

  it('maps network errors to reason network-error', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'network-error',
      error: new Error('timeout'),
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.pdf' },
    });
    expect(r).toEqual({ ok: false, reason: 'network-error' });
  });

  it('maps 404 to reason not-found', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'response',
      response: { ok: false, status: 404, json: async () => ({}) },
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.pdf' },
    });
    expect(r).toEqual({ ok: false, reason: 'not-found' });
  });

  it('maps other api errors to api-error-<status>', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'response',
      response: { ok: false, status: 500, json: async () => ({}) },
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.pdf' },
    });
    expect(r).toEqual({ ok: false, reason: 'api-error-500' });
  });

  it('maps envelope drift to shape-mismatch', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'response',
      response: {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { content: '' } }),
      },
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.pdf' },
    });
    expect(r).toEqual({ ok: false, reason: 'shape-mismatch' });
  });

  it('accepts legacy bare envelope (no .data wrapper)', async () => {
    const fetchAuthed = vi.fn(async () => ({
      kind: 'response',
      response: {
        ok: true,
        status: 200,
        json: async () => ({ content: 'Zm9v', mimeType: 'text/plain' }),
      },
    }));
    const { handler } = buildHandler({ fetchAuthed });
    const r = await handler({
      data: { sessionId: 'sess-1', storageKey: 'x.txt' },
    });
    expect(r).toEqual({ ok: true, content: 'Zm9v', mimeType: 'text/plain' });
  });
});
