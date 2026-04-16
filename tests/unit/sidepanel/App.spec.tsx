// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '@/entrypoints/sidepanel/App';

type RuntimeListener = (msg: unknown) => void;
type TabsListener = (info: { tabId: number }) => void;

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (fn: RuntimeListener) => void;
      removeListener: (fn: RuntimeListener) => void;
    };
  };
  tabs: {
    get: (id: number, cb: (tab: { url?: string } | undefined) => void) => void;
    query: (
      info: { active?: boolean; currentWindow?: boolean },
    ) => Promise<Array<{ id?: number; url?: string }>>;
    onActivated: {
      addListener: (fn: TabsListener) => void;
      removeListener: (fn: TabsListener) => void;
    };
    create?: (opts: { url: string }) => void;
  };
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (key: string) => Promise<void>;
    };
  };
  sidePanel?: unknown;
}

function install(opts: {
  readonly tabUrl: string | null;
  readonly signedIn: boolean;
  readonly binding: unknown;
  readonly accessToken?: string | null;
  readonly hydrateBody?: unknown;
  readonly hydrateStatus?: number;
}): FakeChrome {
  function hydrateReply(): unknown {
    if (opts.hydrateStatus === 404) {
      return { ok: false, reason: 'not-found' };
    }
    const body = opts.hydrateBody as { data?: unknown } | undefined;
    const payload =
      body && typeof body === 'object' && 'data' in body
        ? (body as { data: unknown }).data
        : body;
    return { ok: true, payload };
  }

  const sendMessage = vi.fn(async (msg: unknown) => {
    const env = msg as { key?: string };
    switch (env.key) {
      case 'AGENT_REGISTRY_LIST':
        return {
          agents: [
            {
              id: 'job-hunter',
              routePath: '/job-hunt',
              subdomain: 'job-hunt',
              apiEndpoint: '/api/agents/job-hunter/generate',
              hasSettings: true,
              isPublic: true,
              accentColor: 'emerald',
              iconSvg: '',
              label: 'Job Hunter',
              shortDescription: '',
              settingsPath: '/settings',
              dashboardPath: '',
              resumePath: null,
            },
          ],
          defaultAgentId: 'job-hunter',
        };
      case 'AGENT_PREFERENCE_GET':
        return { agentId: 'job-hunter', selectedAt: 1 };
      case 'AUTH_STATUS':
        return opts.signedIn ? { signedIn: true, userId: 'u1' } : { signedIn: false };
      case 'SESSION_BINDING_GET':
        return opts.binding;
      case 'SESSION_HYDRATE_GET':
        return hydrateReply();
      default:
        return undefined;
    }
  });

  const fake: FakeChrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
    tabs: {
      get: (_id, cb) => cb(opts.tabUrl === null ? undefined : { url: opts.tabUrl }),
      query: async () => (opts.tabUrl === null ? [] : [{ id: 7, url: opts.tabUrl }]),
      onActivated: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
      create: vi.fn(),
    },
    storage: {
      local: {
        get: async () => {
          if (opts.accessToken === undefined || opts.accessToken === null) return {};
          return {
            'llmc.session.v1': {
              accessToken: opts.accessToken,
              refreshToken: 'r',
              expiresAt: Date.now() + 60_000,
              userId: 'u1',
            },
          };
        },
        set: async () => undefined,
        remove: async () => undefined,
      },
    },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return fake;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mount(): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<App />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('Sidepanel App with session binding', () => {
  it('renders the GenerationView (no prior session panel) when no binding exists', async () => {
    install({
      tabUrl: 'https://example.com/jd',
      signedIn: true,
      binding: null,
    });
    await mount();
    await flush();
    expect(query('sidepanel-root')).not.toBeNull();
    expect(query('bound-session-panel')).toBeNull();
    expect(query('generation-view-idle')).not.toBeNull();
  });

  it('renders the bound session panel when a binding and hydrated session are returned', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 100,
      updatedAt: 200,
    };
    const hydrateBody = {
      success: true,
      data: {
        session: {
          id: 's1',
          status: 'completed',
          metadata: {
            agentType: 'job-hunter',
            companyName: 'Acme Inc',
            jobTitle: 'Senior Engineer',
          },
          updatedAt: '2026-04-15T00:00:00.000Z',
        },
        artifacts: [
          {
            type: 'cv',
            storageKey: 'users/u1/sessions/s1/cv.json',
            label: 'CV',
          },
        ],
        generationLogs: [
          {
            phase: 'extract',
            message: 'Extracted JD',
            timestamp: '2026-04-15T00:00:00.000Z',
          },
        ],
      },
    };
    install({
      tabUrl: 'https://example.com/jd',
      signedIn: true,
      binding,
      accessToken: 'tok',
      hydrateBody,
    });
    await mount();
    await flush();
    await flush();
    expect(query('bound-session-panel')).not.toBeNull();
    expect(query('bound-session-title')?.textContent).toContain('Senior Engineer');
    expect(query('bound-artifact-cv')).not.toBeNull();
    expect(query('bound-session-start-new')).not.toBeNull();
  });

  it('dismisses the bound panel when the user clicks Start new generation', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 100,
      updatedAt: 200,
    };
    const hydrateBody = {
      success: true,
      data: {
        session: {
          id: 's1',
          status: 'completed',
          metadata: { agentType: 'job-hunter' },
          updatedAt: '2026-04-15T00:00:00.000Z',
        },
        artifacts: [],
        generationLogs: [],
      },
    };
    install({
      tabUrl: 'https://example.com/jd',
      signedIn: true,
      binding,
      accessToken: 'tok',
      hydrateBody,
    });
    await mount();
    await flush();
    await flush();
    const btn = query('bound-session-start-new') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn!.click();
    });
    await flush();
    expect(query('bound-session-panel')).toBeNull();
    expect(query('generation-view-idle')).not.toBeNull();
  });

  it('treats a 404 from hydrate as not-found (binding points to deleted session)', async () => {
    const binding = {
      sessionId: 's1',
      generationId: 'g1',
      agentId: 'job-hunter',
      urlKey: 'https://example.com/jd',
      pageTitle: null,
      createdAt: 100,
      updatedAt: 200,
    };
    install({
      tabUrl: 'https://example.com/jd',
      signedIn: true,
      binding,
      accessToken: 'tok',
      hydrateStatus: 404,
    });
    await mount();
    await flush();
    await flush();
    expect(query('bound-session-panel')).toBeNull();
    expect(query('generation-view-idle')).not.toBeNull();
  });
});
