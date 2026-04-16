// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSessionForCurrentTab } from '@/entrypoints/sidepanel/useSessionForCurrentTab';

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
  };
  tabs: {
    get: (id: number, cb: (tab: { url?: string } | undefined) => void) => void;
    query: (
      info: { active?: boolean; currentWindow?: boolean },
    ) => Promise<Array<{ id?: number; url?: string }>>;
  };
}

function installChrome(opts: {
  readonly sendMessage: (msg: unknown) => Promise<unknown>;
  readonly tabUrl: string | null;
}): FakeChrome {
  const fake: FakeChrome = {
    runtime: { sendMessage: opts.sendMessage },
    tabs: {
      get: (_id, cb) => cb(opts.tabUrl === null ? undefined : { url: opts.tabUrl }),
      query: async () => (opts.tabUrl === null ? [] : [{ id: 42, url: opts.tabUrl }]),
    },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return fake;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useSessionForCurrentTab> | null } = {
  current: null,
};

function Probe(props: {
  readonly tabId: number | null;
  readonly agentId: 'job-hunter' | 'b2b-sales' | null;
  readonly signedIn: boolean;
  readonly sendMessage?: (msg: unknown) => Promise<unknown>;
}): React.ReactElement {
  capture.current = useSessionForCurrentTab({
    tabId: props.tabId,
    agentId: props.agentId,
    signedIn: props.signedIn,
    sendMessage: props.sendMessage,
  });
  return <div />;
}

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
  capture = { current: null };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mount(props: {
  tabId: number | null;
  agentId: 'job-hunter' | 'b2b-sales' | null;
  signedIn: boolean;
  sendMessage?: (msg: unknown) => Promise<unknown>;
}): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<Probe {...props} />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

describe('useSessionForCurrentTab', () => {
  it('stays idle when signed-out', async () => {
    installChrome({
      sendMessage: vi.fn(),
      tabUrl: 'https://example.com/jd',
    });
    await mount({ tabId: 42, agentId: 'job-hunter', signedIn: false });
    await flush();
    expect(capture.current?.status).toBe('idle');
  });

  it('stays idle when no agent is resolved', async () => {
    installChrome({
      sendMessage: vi.fn(),
      tabUrl: 'https://example.com/jd',
    });
    await mount({ tabId: 42, agentId: null, signedIn: true });
    await flush();
    expect(capture.current?.status).toBe('idle');
  });

  it('reports not-found when the current tab has no URL', async () => {
    installChrome({
      sendMessage: vi.fn(),
      tabUrl: null,
    });
    await mount({ tabId: null, agentId: 'job-hunter', signedIn: true });
    await flush();
    expect(capture.current?.status).toBe('not-found');
  });

  it('reports not-found for non-http tab urls', async () => {
    installChrome({
      sendMessage: vi.fn(),
      tabUrl: 'chrome://extensions',
    });
    await mount({ tabId: 42, agentId: 'job-hunter', signedIn: true });
    await flush();
    expect(capture.current?.status).toBe('not-found');
  });

  it('reports not-found when the background returns no binding', async () => {
    installChrome({
      sendMessage: vi.fn(async (msg: unknown) => {
        const env = msg as { key?: string };
        if (env.key === 'SESSION_BINDING_GET') return null;
        return null;
      }),
      tabUrl: 'https://example.com/jd',
    });
    await mount({ tabId: 42, agentId: 'job-hunter', signedIn: true });
    await flush();
    expect(capture.current?.status).toBe('not-found');
  });

  it('hydrates the session when a binding is found', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 1,
      updatedAt: 2,
    };
    const hydratePayload = {
      session: {
        id: 's1',
        status: 'completed',
        metadata: {
          agentType: 'job-hunter',
          companyName: 'Acme',
          jobTitle: 'Engineer',
        },
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
      artifacts: [
        {
          type: 'resume',
          storageKey: 'users/u1/sessions/s1/resume.json',
          label: 'Resume',
        },
      ],
      generationLogs: [
        {
          phase: 'extract',
          message: 'Extracted JD',
          timestamp: '2026-04-15T00:00:00.000Z',
        },
      ],
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'SESSION_BINDING_GET') return binding;
      if (env.key === 'SESSION_HYDRATE_GET') {
        return { ok: true, payload: hydratePayload };
      }
      return null;
    });
    installChrome({
      sendMessage,
      tabUrl: 'https://example.com/jd',
    });
    await mount({
      tabId: 42,
      agentId: 'job-hunter',
      signedIn: true,
      sendMessage,
    });
    await flush();
    await flush();
    expect(capture.current?.status).toBe('found');
    expect(capture.current?.session?.sessionId).toBe('s1');
    expect(capture.current?.session?.companyName).toBe('Acme');
    expect(capture.current?.artifacts).toHaveLength(1);
    expect(capture.current?.artifacts[0]?.downloadUrl).toContain('download?key=');
    expect(capture.current?.logs.length).toBeGreaterThan(0);
  });

  it('falls back to not-found when the hydrate response is not-found (deleted session)', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 1,
      updatedAt: 2,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'SESSION_BINDING_GET') return binding;
      if (env.key === 'SESSION_HYDRATE_GET') {
        return { ok: false, reason: 'not-found' };
      }
      return null;
    });
    installChrome({
      sendMessage,
      tabUrl: 'https://example.com/jd',
    });
    await mount({
      tabId: 42,
      agentId: 'job-hunter',
      signedIn: true,
      sendMessage,
    });
    await flush();
    await flush();
    expect(capture.current?.status).toBe('not-found');
    expect(capture.current?.session).toBeNull();
  });

  it('surfaces an error status when hydrate sendMessage rejects', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 1,
      updatedAt: 2,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'SESSION_BINDING_GET') return binding;
      if (env.key === 'SESSION_HYDRATE_GET') {
        throw new Error('boom');
      }
      return null;
    });
    installChrome({
      sendMessage,
      tabUrl: 'https://example.com/jd',
    });
    await mount({
      tabId: 42,
      agentId: 'job-hunter',
      signedIn: true,
      sendMessage,
    });
    await flush();
    await flush();
    expect(capture.current?.status).toBe('error');
    expect(capture.current?.error).toContain('boom');
  });

  it('reverts to idle when hydrate reports signed-out', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 1,
      updatedAt: 2,
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'SESSION_BINDING_GET') return binding;
      if (env.key === 'SESSION_HYDRATE_GET') {
        return { ok: false, reason: 'signed-out' };
      }
      return null;
    });
    installChrome({
      sendMessage,
      tabUrl: 'https://example.com/jd',
    });
    await mount({
      tabId: 42,
      agentId: 'job-hunter',
      signedIn: true,
      sendMessage,
    });
    await flush();
    await flush();
    expect(capture.current?.status).toBe('idle');
    expect(capture.current?.session).toBeNull();
  });
});
