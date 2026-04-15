// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '@/entrypoints/popup/App';
import { installI18n } from './_i18n-test-helper';

type Listener = (msg: unknown) => void;
type TabsListener = (info: { tabId: number }) => void;

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (fn: Listener) => void;
      removeListener: (fn: Listener) => void;
    };
    openOptionsPage?: () => void;
  };
  tabs: {
    query: (info: unknown) => Promise<Array<{ id?: number; url?: string }>>;
    onActivated: {
      addListener: (fn: TabsListener) => void;
      removeListener: (fn: TabsListener) => void;
    };
  };
}

function install(
  sendMessage: (msg: unknown) => Promise<unknown>,
  tabs: Array<{ id?: number; url?: string }>,
): FakeChrome {
  const listeners: Listener[] = [];
  const tabListeners: TabsListener[] = [];
  // Wrap sendMessage so the popup's new AGENT_* messages always get a typed
  // default response, keeping individual test cases focused on their own
  // concerns instead of enumerating every new envelope.
  const wrapped = async (msg: unknown): Promise<unknown> => {
    const env = msg as { key?: string };
    if (env.key === 'AGENT_REGISTRY_LIST') {
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
            shortDescription: 'Tailor CVs',
          },
        ],
        defaultAgentId: 'job-hunter',
      };
    }
    if (env.key === 'AGENT_PREFERENCE_GET') {
      return { agentId: 'job-hunter', selectedAt: 1 };
    }
    if (env.key === 'AGENT_PREFERENCE_SET') {
      const data = (msg as { data?: { agentId?: string } }).data ?? {};
      return { ok: true, agentId: data.agentId ?? 'job-hunter', selectedAt: 2 };
    }
    return sendMessage(msg);
  };
  const fake: FakeChrome = {
    runtime: {
      sendMessage: wrapped,
      onMessage: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
      openOptionsPage: vi.fn(),
    },
    tabs: {
      query: async () => tabs,
      onActivated: {
        addListener: (fn) => tabListeners.push(fn),
        removeListener: (fn) => {
          const i = tabListeners.indexOf(fn);
          if (i !== -1) tabListeners.splice(i, 1);
        },
      },
    },
  };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  installI18n();
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('Popup App integration', () => {
  it('shows signed-out panel with sign-in button and no action area when unauthenticated', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: false };
      if (env.key === 'INTENT_GET') return null;
      if (env.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      if (env.key === 'AGENT_REGISTRY_LIST') return { agents: [], defaultAgentId: 'job-hunter' };
      if (env.key === 'AGENT_PREFERENCE_GET') return { agentId: 'job-hunter', selectedAt: 1 };
      if (env.key === 'AUTH_SIGN_IN') return { ok: false, reason: 'silent sign-in not available' };
      return undefined;
    }, [{ id: 1, url: 'about:blank' }]);
    await mount();
    await flush();
    expect(query('sign-in-button')).not.toBeNull();
    expect(query('signed-out-panel')).not.toBeNull();
    expect(query('action-area')).toBeNull();
    expect(query('credits-remaining')).toBeNull();
  });

  it('shows credits + action area with disabled fill when signed in but no intent', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_1' };
      if (env.key === 'INTENT_GET') return null;
      if (env.key === 'CREDITS_GET') return { credits: 33, tier: 'byo', byoKeyEnabled: true };
      if (env.key === 'SESSION_LIST') return { ok: true, items: [], hasMore: false, nextCursor: null, fetchedAt: 0, fromCache: false };
      if (env.key === 'GENERIC_INTENT_DETECT') return { ok: false, reason: 'no-match' };
      return undefined;
    }, [{ id: 2, url: 'about:blank' }]);
    await mount();
    await flush();
    expect(query('signed-out-panel')).toBeNull();
    expect(query('action-area')).not.toBeNull();
    const credits = query('credits-remaining');
    expect(credits?.textContent).toMatch(/33 credits/);
    const fill = query('fill-button') as HTMLButtonElement | null;
    const highlight = query('highlight-button') as HTMLButtonElement | null;
    expect(fill?.disabled).toBe(true);
    expect(highlight?.disabled).toBe(true);
    expect(query('intent-badge')?.getAttribute('data-state')).toBe('none');
  });

  it('enables generate + highlight on a job-posting page; fill stays disabled (no form yet)', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_1' };
      if (env.key === 'INTENT_GET')
        return {
          kind: 'greenhouse',
          pageKind: 'job-posting',
          url: 'https://boards.greenhouse.io/acme/jobs/1',
          detectedAt: 1,
        };
      if (env.key === 'CREDITS_GET') return { credits: 5, tier: 'free', byoKeyEnabled: false };
      if (env.key === 'SESSION_LIST') return { ok: true, items: [], hasMore: false, nextCursor: null, fetchedAt: 0, fromCache: false };
      if (env.key === 'GENERIC_INTENT_DETECT') return { ok: false, reason: 'no-match' };
      return undefined;
    }, [{ id: 3, url: 'https://boards.greenhouse.io/acme/jobs/1' }]);
    await mount();
    await flush();
    const fill = query('fill-button') as HTMLButtonElement;
    const highlight = query('highlight-button') as HTMLButtonElement;
    const generate = query('generate-button') as HTMLButtonElement;
    expect(generate?.disabled).toBe(false);
    expect(fill.disabled).toBe(true);
    expect(highlight.disabled).toBe(false);
    expect(query('intent-badge')?.getAttribute('data-vendor')).toBe('greenhouse');
  });

  it('enables fill but disables highlight on application-form pages', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: true, userId: 'u_1' };
      if (env.key === 'INTENT_GET')
        return {
          kind: 'lever',
          pageKind: 'application-form',
          url: 'https://jobs.lever.co/acme/1/apply',
          detectedAt: 2,
        };
      if (env.key === 'CREDITS_GET') return { credits: 10, tier: 'free', byoKeyEnabled: false };
      if (env.key === 'SESSION_LIST') return { ok: true, items: [], hasMore: false, nextCursor: null, fetchedAt: 0, fromCache: false };
      if (env.key === 'GENERIC_INTENT_DETECT') return { ok: false, reason: 'no-match' };
      return undefined;
    }, [{ id: 4, url: 'https://jobs.lever.co/acme/1/apply' }]);
    await mount();
    await flush();
    const fill = query('fill-button') as HTMLButtonElement;
    const highlight = query('highlight-button') as HTMLButtonElement;
    expect(fill.disabled).toBe(false);
    expect(highlight.disabled).toBe(true);
  });

  it('always renders the header, footer, and intent badge surfaces', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: false };
      if (env.key === 'INTENT_GET') return null;
      if (env.key === 'CREDITS_GET') return { credits: 0, tier: 'free', byoKeyEnabled: false };
      return undefined;
    }, [{ id: 5, url: 'about:blank' }]);
    await mount();
    await flush();
    expect(query('popup-header')).not.toBeNull();
    expect(query('popup-footer')).not.toBeNull();
    expect(query('intent-badge')).not.toBeNull();
    expect(query('popup-version')?.textContent).toMatch(/v0\.1\.0/);
    // Dashboard and Settings moved from the footer into the user menu
    // dropdown (post-104). The footer now only carries the version number.
    expect(query('dashboard-link')).toBeNull();
    expect(query('settings-link')).toBeNull();
  });

  it('renders the user-menu avatar when signed in', async () => {
    install(async (msg) => {
      const env = msg as { key?: string };
      if (env.key === 'AUTH_STATUS') return { signedIn: true, userId: 'alice@example.com' };
      if (env.key === 'INTENT_GET') return null;
      if (env.key === 'CREDITS_GET') return { credits: 1, tier: 'free', byoKeyEnabled: false };
      if (env.key === 'SESSION_LIST') return { ok: true, items: [], hasMore: false, nextCursor: null, fetchedAt: 0, fromCache: false };
      if (env.key === 'GENERIC_INTENT_DETECT') return { ok: false, reason: 'no-match' };
      return undefined;
    }, [{ id: 6, url: 'about:blank' }]);
    await mount();
    await flush();
    expect(query('popup-user-id')?.textContent).toBe('alice@example.com');
    expect(query('user-menu-trigger')).not.toBeNull();
  });
});
