// SPDX-License-Identifier: MIT
/**
 * Sidepanel root -- native generation view only.
 *
 * The Dashboard iframe tab was removed because Chrome strips 3rd-party cookies
 * in cross-origin iframes, so the SuperTokens session was always lost and the
 * iframe showed the logged-out marketing page.
 *
 * Per-URL session binding:
 *   On mount (and whenever the active tab changes), the sidepanel looks up
 *   any persisted binding for `{ canonicalUrl(tabUrl), activeAgentId }`. If
 *   one exists, it auto-fetches the session via the backend hydrate endpoint
 *   and renders a "last session" panel with logs + artifacts above the live
 *   GenerationView. A "Start new generation" button dismisses the panel so
 *   the user can run Generate again.
 */

import React, { useEffect, useMemo } from 'react';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { useAgentPreference } from '../popup/useAgentPreference';
import { useAuthState } from '../popup/useAuthState';
import { GenerationView } from './GenerationView';
import { useTargetTabId } from './useTargetTabId';
import {
  useSessionForCurrentTab,
  type SessionArtifact,
  type SessionLogEntry,
  type SessionSummary,
} from './useSessionForCurrentTab';
import { buildAgentUrl } from '@/src/background/agents/agent-registry';
import { ArtifactsPanel } from './artifacts/ArtifactsPanel';
import { GenerationLogsPanel } from './logs/GenerationLogsPanel';
import { accentFor } from './lib/accent';
import { SidepanelActionPanel } from './SidepanelActionPanel';
import type { AgentId } from '@/src/background/agents';
import { clientEnv } from '@/src/shared/env';
import { ThemeRoot } from '@/entrypoints/shared/ThemeRoot';

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

function BoundSessionPanel(props: {
  readonly session: SessionSummary;
  readonly logs: readonly SessionLogEntry[];
  readonly artifacts: readonly SessionArtifact[];
  readonly onStartNew: () => void;
  /** False when this is the fallback "most recent" session (no URL binding). */
  readonly urlBound: boolean;
  readonly accentBorder: string;
}): React.ReactElement {
  const { session, logs, artifacts, onStartNew, urlBound, accentBorder } = props;
  const title =
    session.jobTitle ?? session.companyName ?? `Session ${session.sessionId.slice(0, 8)}`;
  return (
    <section
      data-testid="bound-session-panel"
      data-session-id={session.sessionId}
      data-url-bound={urlBound ? 'true' : 'false'}
      className={`flex flex-col gap-3 border-b p-4 ${accentBorder}`}
    >
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {urlBound ? 'Previous session for this page' : 'Most recent session'}
        </span>
        <span
          data-testid="bound-session-title"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {title}
        </span>
        {session.companyName !== null && session.jobTitle !== null ? (
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            {session.companyName}
          </span>
        ) : null}
        {session.status !== null ? (
          <span
            data-testid="bound-session-status"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            Status: {session.status}
          </span>
        ) : null}
      </header>

      <div data-testid="bound-session-logs">
        <GenerationLogsPanel logs={logs} sessionStatus={session.status} />
      </div>

      <div data-testid="bound-session-artifacts">
        <ArtifactsPanel artifacts={artifacts} defaultOpen={true} />
      </div>

      <button
        type="button"
        data-testid="bound-session-start-new"
        onClick={onStartNew}
        className="rounded-card border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      >
        Start new generation
      </button>
    </section>
  );
}

function SidepanelBody(): React.ReactElement {
  const { agents, activeAgentId, loading, error } = useAgentPreference();
  const { state: authState } = useAuthState();
  const { tabId } = useTargetTabId();

  const agent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? agents[0] ?? null,
    [agents, activeAgentId],
  );

  const resolvedAgentId: AgentId | null = agent?.id ?? null;

  const binding = useSessionForCurrentTab({
    tabId,
    agentId: resolvedAgentId,
    signedIn: authState.signedIn,
  });

  // Listen for GENERATION_STARTED broadcasts; when a new generation begins,
  // dismiss any rendered "prior session" panel so GenerationView takes over.
  useEffect(() => {
    const runtime = getRuntime();
    if (runtime === null) return;
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string };
      if (env.key === 'GENERATION_STARTED') {
        binding.dismiss();
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, [binding]);

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

  const showBoundPanel = binding.status === 'found' && binding.session !== null;
  const showLoading = binding.status === 'loading';
  const accent = accentFor(agent.id);

  return (
    <div
      data-testid="sidepanel-root"
      data-active-agent={agent.id}
      data-accent={agent.id === 'b2b-sales' ? 'purple' : 'emerald'}
      data-binding-status={binding.status}
      className="flex h-screen w-full flex-col bg-white dark:bg-zinc-900"
    >
      <div
        className={`flex items-center justify-between border-b px-3 py-2 ${accent.header}`}
      >
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100">
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
      {showLoading ? (
        <div
          data-testid="bound-session-loading"
          className="flex items-center justify-center border-b border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          Checking for prior session...
        </div>
      ) : null}
      {showBoundPanel && binding.session !== null ? (
        <BoundSessionPanel
          session={binding.session}
          logs={binding.logs}
          artifacts={binding.artifacts}
          onStartNew={binding.dismiss}
          urlBound={binding.binding?.urlKey !== undefined && binding.binding.urlKey.length > 0}
          accentBorder={accent.border}
        />
      ) : null}
      <div className="flex-1 overflow-y-auto">
        <GenerationView
          activeAgentType={agentType}
          mode={showBoundPanel ? 'active-only' : 'both'}
        />
        {authState.signedIn && !showBoundPanel ? (
          <SidepanelActionPanel
            signedIn={authState.signedIn}
            activeAgentId={agent.id}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <ThemeRoot>
        <SidepanelBody />
      </ThemeRoot>
    </ErrorBoundary>
  );
}
