// SPDX-License-Identifier: MIT
/**
 * Sidepanel root -- native generation view only.
 *
 * The Dashboard iframe tab was removed because Chrome strips 3rd-party cookies
 * in cross-origin iframes, so the SuperTokens session was always lost and the
 * iframe showed the logged-out marketing page.
 */

import React, { useEffect, useMemo } from 'react';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { useAgentPreference } from '../popup/useAgentPreference';
import { GenerationView } from './GenerationView';
import { buildAgentUrl } from '@/src/background/agents/agent-registry';
import { clientEnv } from '@/src/shared/env';

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

  const agent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? agents[0] ?? null,
    [agents, activeAgentId],
  );

  // Listen for GENERATION_STARTED broadcasts (no tab-switch needed; kept so
  // background scripts can signal the sidepanel is active).
  useEffect(() => {
    const runtime = getRuntime();
    if (runtime === null) return;
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      // No tab-switch action required -- GenerationView is always visible.
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
        </div>
      </div>
    );
  }

  const dashboardUrl =
    buildAgentUrl(agent, 'dashboard', {
      rootDomain: clientEnv.rootDomain,
      locale: clientEnv.defaultLocale,
    }) ?? `${clientEnv.webBaseUrl}/${clientEnv.defaultLocale}`;

  const agentType: 'job-hunter' | 'b2b-sales' =
    agent.id === 'b2b-sales' ? 'b2b-sales' : 'job-hunter';

  function openDashboard(): void {
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
      className="flex h-screen w-full flex-col bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          {agent.label}
        </span>
        <button
          type="button"
          onClick={openDashboard}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          data-testid="sidepanel-open-in-tab"
        >
          Open dashboard
        </button>
      </div>
      <GenerationView activeAgentType={agentType} />
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
