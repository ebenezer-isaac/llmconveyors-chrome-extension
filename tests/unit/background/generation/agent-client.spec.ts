// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createAgentClient } from '../../../../src/background/generation/agent-client';

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function client(fetchFn: typeof fetch, token: string | null = 'tok') {
  return createAgentClient({
    fetch: fetchFn,
    logger: logger(),
    buildGenerateUrl: (a) => `https://api/${a}/generate`,
    buildInteractUrl: (a) => `https://api/${a}/interact`,
    accessToken: async () => token,
  });
}

describe('agent-client.start', () => {
  it('returns unauthenticated when no token', async () => {
    const c = client(vi.fn() as unknown as typeof fetch, null);
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r.kind).toBe('unauthenticated');
  });

  it('returns ok with generationId / sessionId on 202', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ generationId: 'g', sessionId: 's' }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const c = client(f as unknown as typeof fetch);
    const r = await c.start({ agentType: 'job-hunter', inputs: { jobDescription: 'x' } });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.generationId).toBe('g');
      expect(r.sessionId).toBe('s');
    }
  });

  it('unwraps `{ data: {...} }` envelope', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { generationId: 'g2', sessionId: 's2' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const c = client(f as unknown as typeof fetch);
    const r = await c.start({ agentType: 'b2b-sales', inputs: { companyName: 'Acme', companyWebsite: 'https://acme' } });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.generationId).toBe('g2');
  });

  it('returns unauthenticated on 401/403', async () => {
    const f = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const c = client(f as unknown as typeof fetch);
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r.kind).toBe('unauthenticated');
  });

  it('returns network-error when fetch rejects', async () => {
    const f = vi.fn(async () => {
      throw new Error('ECONN');
    });
    const c = client(f as unknown as typeof fetch);
    const r = await c.start({ agentType: 'job-hunter', inputs: {} });
    expect(r.kind).toBe('network-error');
  });
});

describe('agent-client.interact', () => {
  it('returns ok on 204', async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const c = client(f as unknown as typeof fetch);
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
    const f = vi.fn(async () => new Response('nope', { status: 404 }));
    const c = client(f as unknown as typeof fetch);
    const r = await c.interact({
      agentType: 'job-hunter',
      generationId: 'g',
      interactionId: 'i',
      interactionType: 'gate',
      interactionData: {},
    });
    expect(r.kind).toBe('not-found');
  });
});
