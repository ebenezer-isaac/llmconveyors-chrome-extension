// SPDX-License-Identifier: MIT
/**
 * Sidepanel root (post-101.5 pivot).
 *
 * Renders a single iframe pointing at the current agent's subdomain on
 * llmconveyors.com with `?embed=extension` so the web app hides its global
 * chrome and the panel shows the dashboard directly. The iframe reloads
 * when the active agent changes.
 *
 * Contextual tab URL is passed as `tabUrl` so the web app can detect pages
 * the user is currently viewing (e.g. a Greenhouse job posting) and adjust
 * its prompts.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { useAgentPreference } from '../popup/useAgentPreference';
import { useTargetTabId } from './useTargetTabId';
import type { AgentRegistryEntry } from '@/src/background/agents';

const ROOT_DOMAIN = 'llmconveyors.com';

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

function SidepanelBody(): React.ReactElement {
  const { agents, activeAgentId, loading, error } = useAgentPreference();
  const tabUrl = useActiveTabUrl();
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeError, setIframeError] = useState<string | null>(null);

  const agent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? agents[0] ?? null,
    [agents, activeAgentId],
  );

  useEffect(() => {
    setIframeError(null);
  }, [agent?.id, tabUrl]);

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

  return (
    <div
      data-testid="sidepanel-root"
      data-active-agent={agent.id}
      className="flex h-screen w-full flex-col bg-white dark:bg-zinc-900"
    >
      {iframeError ? (
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
