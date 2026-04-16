// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createAgentClient } from '../../../../src/background/generation/agent-client';
import type { FetchAuthed, FetchAuthedResult } from '../../../../src/background/auth';

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

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

function client(fetchAuthed: FetchAuthed) {
  return createAgentClient({
    fetchAuthed,
    logger: logger(),
    buildGenerateUrl: (a) => `https://api/${a}/generate`,
    buildInteractUrl: (a) => `https://api/${a}/interact`,
  });
}

describe('agent-client.start', () => {
  it('returns unauthenticated when fetchAuthed yields unauthenticated', async () => {
    const c = client(fetchAuthedReturning([{ kind: 'unauthenticated' }]));
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r.kind).toBe('unauthenticated');
  });

  it('returns ok with generationId / sessionId on 202', async () => {
    const response = new Response(
      JSON.stringify({ generationId: 'g', sessionId: 's' }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    );
    const c = client(fetchAuthedReturning([{ kind: 'ok', response }]));
    const r = await c.start({ agentType: 'job-hunter', inputs: { jobDescription: 'x' } });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.generationId).toBe('g');
      expect(r.sessionId).toBe('s');
    }
  });

  it('unwraps `{ data: {...} }` envelope', async () => {
    const response = new Response(
      JSON.stringify({ data: { generationId: 'g2', sessionId: 's2' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    const c = client(fetchAuthedReturning([{ kind: 'ok', response }]));
    const r = await c.start({
      agentType: 'b2b-sales',
      inputs: { companyName: 'Acme', companyWebsite: 'https://acme' },
    });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.generationId).toBe('g2');
  });

  it('returns network-error when fetchAuthed reports network error', async () => {
    const c = client(
      fetchAuthedReturning([{ kind: 'network-error', error: new Error('ECONN') }]),
    );
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r.kind).toBe('network-error');
  });

  it('returns api-error when backend returns non-2xx', async () => {
    const response = new Response('oops', { status: 500 });
    const c = client(fetchAuthedReturning([{ kind: 'ok', response }]));
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r).toEqual({ kind: 'api-error', status: 500 });
  });
});

describe('agent-client.interact', () => {
  it('returns ok on 204', async () => {
    const response = new Response(null, { status: 204 });
    const c = client(fetchAuthedReturning([{ kind: 'ok', response }]));
    const r = await c.interact({
      agentType: 'job-hunter',
      generationId: 'g',
      interactionId: 'i',
      interactionType: 'gate',
      interactionData: { approved: true },
    });
    expect(r.kind).toBe('ok');
  });

  it('returns not-found on 404', async () => {
    const response = new Response('nope', { status: 404 });
    const c = client(fetchAuthedReturning([{ kind: 'ok', response }]));
    const r = await c.interact({
      agentType: 'job-hunter',
      generationId: 'g',
      interactionId: 'i',
      interactionType: 'gate',
      interactionData: {},
    });
    expect(r.kind).toBe('not-found');
  });

  it('returns unauthenticated when fetchAuthed yields unauthenticated', async () => {
    const c = client(fetchAuthedReturning([{ kind: 'unauthenticated' }]));
    const r = await c.interact({
      agentType: 'job-hunter',
      generationId: 'g',
      interactionId: 'i',
      interactionType: 'gate',
      interactionData: {},
    });
    expect(r.kind).toBe('unauthenticated');
  });

  it('returns network-error when fetchAuthed reports network error', async () => {
    const c = client(
      fetchAuthedReturning([{ kind: 'network-error', error: new Error('ECONN') }]),
    );
    const r = await c.interact({
      agentType: 'job-hunter',
      generationId: 'g',
      interactionId: 'i',
      interactionType: 'gate',
      interactionData: {},
    });
    expect(r.kind).toBe('network-error');
  });
});
