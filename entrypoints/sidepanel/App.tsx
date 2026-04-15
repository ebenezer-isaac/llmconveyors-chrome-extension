// SPDX-License-Identifier: MIT
/**
 * Sidepanel root (post commits 1-4).
 *
 * Adds a Generation tab (native live view) beside the existing Dashboard
 * iframe. The tab defaults to Generation when a GENERATION_STARTED broadcast
 * arrives so the user sees live progress without manual switching.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { useAgentPreference } from '../popup/useAgentPreference';
import { useTargetTabId } from './useTargetTabId';
import { GenerationView } from './GenerationView';
import type { AgentRegistryEntry } from '@/src/background/agents';

const ROOT_DOMAIN = 'llmconveyors.com';

type PanelTab = 'generation' | 'dashboard';

function buildIframeUrl(
  agent: AgentRegistryEntry,
  tabUrl: string | null,
  reloadKey: number,
): string {
  const origin = `https://${agent.subdomain}.${ROOT_DOMAIN}`;
  const params = new URLSearchParams();
  params.set('embed', 'extension');
  if (tabUrl) params.set('tabUrl', tabUrl);
  params.set('cb', String(reloadKey));
  return `${origin}?${params.toString()}`;
}

function useActiveTabUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const { tabId } = useTargetTabId();
  useEffect(() => {
    const g = globalThis as unknown as {
      chrome?: {
        tabs?: {
          get: (id: number, cb: (tab: { url?: string } | undefined) => void) => void;
        };
      };
    };
    const tabs = g.chrome?.tabs;
    if (!tabs || typeof tabId !== 'number') {
      setUrl(null);
      return;
    }
    try {
      tabs.get(tabId, (tab) => setUrl(tab?.url ?? null));
    } catch {
      setUrl(null);
    }
  }, [tabId]);
  return url;
}

type RuntimeMessenger = {
  onMessage: {
    addListener: (fn: (msg: unknown) => void) => void;
    removeListener: (fn: (msg: unknown) => void) => void;
  };
};
function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function SidepanelBody(): React.ReactElement {
  const { agents, activeAgentId, loading, error } = useAgentPreference();
  const tabUrl = useActiveTabUrl();
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('dashboard');

  const agent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? agents[0] ?? null,
    [agents, activeAgentId],
  );

  useEffect(() => {
    setIframeError(null);
  }, [agent?.id, tabUrl]);

  // Switch to the Generation tab automatically when a new generation kicks off.
  useEffect(() => {
    const runtime = getRuntime();
    if (runtime === null) return;
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string };
      if (env.key === 'GENERATION_STARTED') {
        setTab('generation');
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, []);

  if (loading) {
    return (
      <div
        data-testid="sidepanel-root"
        className="flex h-screen w-full items-center justify-center bg-white text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
      >
        Loading LLM Conveyors...
      </div>
    );
  }

  if (!agent || error) {
    return (
      <div
        data-testid="sidepanel-root"
        className="flex h-screen w-full items-center justify-center bg-white p-6 text-center dark:bg-zinc-900"
      >
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Unable to load the extension dashboard.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const src = buildIframeUrl(agent, tabUrl, reloadKey);
  const dashboardUrl = `https://${agent.subdomain}.${ROOT_DOMAIN}`;
  const agentType: 'job-hunter' | 'b2b-sales' =
    agent.id === 'b2b-sales' ? 'b2b-sales' : 'job-hunter';

  function openInTab(): void {
    const g = globalThis as unknown as {
      chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
    };
    if (g.chrome?.tabs?.create) {
      g.chrome.tabs.create({ url: dashboardUrl });
    } else {
      window.open(dashboardUrl, '_blank', 'noopener');
    }
  }

  return (
    <div
      data-testid="sidepanel-root"
      data-active-agent={agent.id}
      data-active-tab={tab}
      className="flex h-screen w-full flex-col bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="sidepanel-tab-generation"
            aria-pressed={tab === 'generation'}
            onClick={() => setTab('generation')}
            className={`rounded-md px-2 py-1 text-xs font-medium ${tab === 'generation' ? 'bg-brand-500 text-white' : 'border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200'}`}
          >
            Generation
          </button>
          <button
            type="button"
            data-testid="sidepanel-tab-dashboard"
            aria-pressed={tab === 'dashboard'}
            onClick={() => setTab('dashboard')}
            className={`rounded-md px-2 py-1 text-xs font-medium ${tab === 'dashboard' ? 'bg-brand-500 text-white' : 'border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200'}`}
          >
            Dashboard
          </button>
        </div>
        <button
          type="button"
          onClick={openInTab}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          data-testid="sidepanel-open-in-tab"
        >
          Open in tab
        </button>
      </div>
      {tab === 'generation' ? (
        <GenerationView activeAgentType={agentType} />
      ) : iframeError ? (
        <div
          data-testid="sidepanel-iframe-error"
          className="flex flex-1 items-center justify-center p-6 text-center"
        >
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{iframeError}</p>
            <button
              type="button"
              onClick={() => {
                setIframeError(null);
                setReloadKey((k) => k + 1);
              }}
              className="mt-4 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <iframe
          key={`${agent.id}:${reloadKey}`}
          data-testid="sidepanel-iframe"
          title={`LLM Conveyors ${agent.label}`}
          src={src}
          className="h-full w-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
          onError={() =>
            setIframeError('Cannot reach llmconveyors.com. Check your connection and retry.')
          }
        />
      )}
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <SidepanelBody />
    </ErrorBoundary>
  );
}
