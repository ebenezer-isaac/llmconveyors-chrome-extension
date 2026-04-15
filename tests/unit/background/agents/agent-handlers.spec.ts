// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_IDS,
  AGENT_REGISTRY,
  createAgentHandlers,
} from '@/src/background/agents';
import type { AgentManifestOutcome } from '@/src/background/agents';
import type { Logger } from '@/src/background/log';

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function buildDeps(overrides: {
  read?: () => Promise<{ agentId: 'job-hunter' | 'b2b-sales'; selectedAt: number }>;
  write?: (id: 'job-hunter' | 'b2b-sales') => Promise<{ agentId: 'job-hunter' | 'b2b-sales'; selectedAt: number }>;
  manifest?: () => Promise<AgentManifestOutcome>;
} = {}) {
  return {
    preference: {
      read: overrides.read ?? (async () => ({ agentId: 'job-hunter' as const, selectedAt: 1 })),
      write:
        overrides.write ??
        (async (id) => ({ agentId: id, selectedAt: 2 })),
    },
    manifestClient: {
      get: overrides.manifest ?? (async () => ({ kind: 'not-found' as const })),
    },
    logger: logger(),
  };
}

describe('AGENT_PREFERENCE_GET', () => {
  it('returns the stored preference', async () => {
    const h = createAgentHandlers(buildDeps());
    const r = await h.AGENT_PREFERENCE_GET({ data: {} });
    expect(r).toEqual({ agentId: 'job-hunter', selectedAt: 1 });
  });
});

describe('AGENT_PREFERENCE_SET', () => {
  it('persists a valid id', async () => {
    const h = createAgentHandlers(buildDeps());
    const r = await h.AGENT_PREFERENCE_SET({ data: { agentId: 'b2b-sales' } });
    expect(r).toMatchObject({ ok: true, agentId: 'b2b-sales' });
  });
  it('rejects an unknown id', async () => {
    const h = createAgentHandlers(buildDeps());
    const r = await h.AGENT_PREFERENCE_SET({
      data: { agentId: 'nonexistent' as unknown as 'job-hunter' },
    });
    expect(r).toEqual({ ok: false, reason: 'unknown-agent' });
  });
  it('surfaces storage failure', async () => {
    const h = createAgentHandlers(
      buildDeps({
        write: async () => {
          throw new Error('quota');
        },
      }),
    );
    const r = await h.AGENT_PREFERENCE_SET({ data: { agentId: 'b2b-sales' } });
    expect(r).toEqual({ ok: false, reason: 'storage-error' });
  });
});

describe('AGENT_REGISTRY_LIST', () => {
  it('returns the static registry entries', async () => {
    const h = createAgentHandlers(buildDeps());
    const r = await h.AGENT_REGISTRY_LIST({ data: {} });
    expect(r.agents).toHaveLength(AGENT_IDS.length);
    expect(r.defaultAgentId).toBe(AGENT_IDS[0]);
    expect(r.agents.map((a) => a.id).sort()).toEqual([...AGENT_IDS].sort());
    const first = AGENT_IDS[0];
    if (first) {
      expect(r.agents[0]?.label).toBe(AGENT_REGISTRY[first].label);
    }
  });
});

describe('AGENT_MANIFEST_GET', () => {
  it('rejects unknown agent ids before dispatch', async () => {
    const h = createAgentHandlers(buildDeps());
    const r = await h.AGENT_MANIFEST_GET({
      data: { agentId: 'nonexistent' as unknown as 'job-hunter' },
    });
    expect(r).toEqual({ ok: false, reason: 'unknown-agent' });
  });
  it('maps backend ok', async () => {
    const h = createAgentHandlers(
      buildDeps({
        manifest: async () => ({
          kind: 'ok' as const,
          manifest: { agentId: 'job-hunter', label: 'Job Hunter' },
        }),
      }),
    );
    const r = await h.AGENT_MANIFEST_GET({ data: { agentId: 'job-hunter' } });
    expect(r).toMatchObject({ ok: true, manifest: { agentId: 'job-hunter' } });
  });
  it('maps backend unauthenticated', async () => {
    const h = createAgentHandlers(
      buildDeps({
        manifest: async () => ({ kind: 'unauthenticated' as const }),
      }),
    );
    const r = await h.AGENT_MANIFEST_GET({ data: { agentId: 'job-hunter' } });
    expect(r).toEqual({ ok: false, reason: 'unauthenticated' });
  });
  it('maps backend network-error', async () => {
    const h = createAgentHandlers(
      buildDeps({
        manifest: async () => ({ kind: 'network-error' as const, message: 'offline' }),
      }),
    );
    const r = await h.AGENT_MANIFEST_GET({ data: { agentId: 'job-hunter' } });
    expect(r).toEqual({ ok: false, reason: 'network-error' });
  });
});
