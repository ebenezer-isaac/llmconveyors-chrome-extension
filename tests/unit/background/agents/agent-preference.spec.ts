// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_PREFERENCE_KEY,
  createAgentPreference,
  DEFAULT_AGENT_ID,
} from '@/src/background/agents';
import type { Logger } from '@/src/background/log';

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function store() {
  const data: Record<string, unknown> = {};
  return {
    data,
    storage: {
      get: async (k: string) => (k in data ? { [k]: data[k] } : {}),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) data[k] = v;
      },
      remove: async (k: string) => {
        delete data[k];
      },
    },
  };
}

describe('agent-preference', () => {
  it('returns the default agent when storage empty', async () => {
    const { storage } = store();
    const pref = createAgentPreference({ storage, logger: logger(), now: () => 10 });
    const entry = await pref.read();
    expect(entry.agentId).toBe(DEFAULT_AGENT_ID);
  });

  it('persists a written preference', async () => {
    const { storage, data } = store();
    const pref = createAgentPreference({ storage, logger: logger(), now: () => 10 });
    const entry = await pref.write('b2b-sales');
    expect(entry.agentId).toBe('b2b-sales');
    expect(data[AGENT_PREFERENCE_KEY]).toBeDefined();
    const read = await pref.read();
    expect(read.agentId).toBe('b2b-sales');
  });

  it('falls back to default when stored id is unknown', async () => {
    const { storage, data } = store();
    data[AGENT_PREFERENCE_KEY] = { agentId: 'nonexistent', selectedAt: 1 };
    const pref = createAgentPreference({ storage, logger: logger(), now: () => 10 });
    const entry = await pref.read();
    expect(entry.agentId).toBe(DEFAULT_AGENT_ID);
  });

  it('throws on invalid write candidate', async () => {
    const { storage } = store();
    const pref = createAgentPreference({ storage, logger: logger(), now: () => 10 });
    await expect(pref.write('bogus' as unknown as 'job-hunter')).rejects.toThrow();
  });
});
