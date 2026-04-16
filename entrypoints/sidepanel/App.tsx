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
import { useCredits } from '../popup/useCredits';
import { useProfile } from '../popup/useProfile';
import { SurfaceHeader } from '@/entrypoints/shared/SurfaceHeader';
import { SurfaceFooter } from '@/entrypoints/shared/SurfaceFooter';
import { GenerationView } from './GenerationView';
import { useTargetTabId } from './useTargetTabId';
import {
  useSessionForCurrentTab,
  type SessionArtifact,
  type SessionLogEntry,
  type SessionSummary,
} from './useSessionForCurrentTab';
import { ArtifactsPanel } from './artifacts/ArtifactsPanel';
import { GenerationLogsPanel } from './logs/GenerationLogsPanel';
import { accentFor } from './lib/accent';
import { SidepanelGenerationForm } from './SidepanelGenerationForm';
import { Spinner } from './Spinner';
import { useIntent } from '../popup/useIntent';
import { useGenericIntent } from '../popup/useGenericIntent';
import { useActiveTabUrl } from '../popup/useActiveTabUrl';
import type { AgentId } from '@/src/background/agents';
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

const STATUS_PILL_CLASSES: Record<string, string> = {
  completed:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  awaiting_input:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  awaiting_input: 'Needs input',
  active: 'Running',
};

function StatusPill({ status }: { status: string | null }): React.ReactElement | null {
  if (status === null) return null;
  const classes =
    STATUS_PILL_CLASSES[status] ??
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      data-testid="bound-session-status"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-current" />
      {label}
    </span>
  );
}

function BriefcaseIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
    >
      <rect x="2" y="5" width="12" height="8" rx="1.5" />
      <path d="M6 5V3.5h4V5M2 8.5h12" />
    </svg>
  );
}

function BuildingIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
    >
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M6 5h1M9 5h1M6 8h1M9 8h1M6 11h1M9 11h1" />
    </svg>
  );
}

function WandIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13 L10 6 M8 4 L12 8 M13 2 L13 4 M15 3 L13 3 M2 7 L4 7 M3 6 L3 8" />
    </svg>
  );
}

type AutofillOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'success'; readonly filled: number; readonly skipped: number; readonly failed: number }
  | { readonly kind: 'error'; readonly message: string };

async function runAutofill(): Promise<AutofillOutcome> {
  const g = globalThis as unknown as {
    chrome?: {
      tabs?: {
        query: (opts: { active: boolean; currentWindow: boolean }) => Promise<
          Array<{ id?: number; url?: string }>
        >;
      };
      runtime?: { sendMessage: (msg: unknown) => Promise<unknown> };
    };
  };
  const tabs = g.chrome?.tabs;
  const runtime = g.chrome?.runtime;
  if (!tabs || !runtime) return { kind: 'error', message: 'chrome runtime unavailable' };
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number' || !tab.url) {
      return { kind: 'error', message: 'no active tab' };
    }
    const raw = (await runtime.sendMessage({
      key: 'FILL_REQUEST',
      data: { tabId: tab.id, url: tab.url },
    })) as {
      ok?: boolean;
      filled?: unknown[];
      skipped?: unknown[];
      failed?: unknown[];
      abortReason?: string;
    } | undefined;
    if (!raw) return { kind: 'error', message: 'no response' };
    if (raw.ok === true) {
      return {
        kind: 'success',
        filled: Array.isArray(raw.filled) ? raw.filled.length : 0,
        skipped: Array.isArray(raw.skipped) ? raw.skipped.length : 0,
        failed: Array.isArray(raw.failed) ? raw.failed.length : 0,
      };
    }
    return { kind: 'error', message: raw.abortReason ?? 'fill failed' };
  } catch (err: unknown) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function BoundSessionPanel(props: {
  readonly session: SessionSummary;
  readonly logs: readonly SessionLogEntry[];
  readonly artifacts: readonly SessionArtifact[];
  /** False when this is the fallback "most recent" session (no URL binding). */
  readonly urlBound: boolean;
  readonly accentBorder: string;
  readonly agentId: AgentId;
}): React.ReactElement {
  const { session, logs, artifacts, urlBound, accentBorder, agentId } = props;
  const [autofill, setAutofill] = React.useState<AutofillOutcome>({ kind: 'idle' });
  const title =
    session.jobTitle ?? session.companyName ?? `Session ${session.sessionId.slice(0, 8)}`;
  const showAutofill = agentId === 'job-hunter';

  async function handleAutofill(): Promise<void> {
    setAutofill({ kind: 'pending' });
    const result = await runAutofill();
    setAutofill(result);
  }

  return (
    <section
      data-testid="bound-session-panel"
      data-session-id={session.sessionId}
      data-url-bound={urlBound ? 'true' : 'false'}
      className={`flex flex-col gap-3 border-b p-4 ${accentBorder}`}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {urlBound ? 'Previous session for this page' : 'Most recent session'}
          </span>
          <StatusPill status={session.status} />
        </div>
        <div className="flex items-start gap-2">
          <BriefcaseIcon />
          <div className="flex min-w-0 flex-col">
            <span
              data-testid="bound-session-title"
              className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {title}
            </span>
            {session.companyName !== null &&
            (session.jobTitle ?? null) !== null &&
            session.companyName !== session.jobTitle ? (
              <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                <BuildingIcon />
                <span className="truncate">{session.companyName}</span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {showAutofill ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid="bound-session-autofill"
            onClick={() => {
              void handleAutofill();
            }}
            disabled={autofill.kind === 'pending'}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-card bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {autofill.kind === 'pending' ? (
              <>
                <Spinner size="sm" inline />
                <span>Autofilling...</span>
              </>
            ) : (
              <>
                <WandIcon />
                <span>Autofill application</span>
              </>
            )}
          </button>
          {autofill.kind === 'success' ? (
            <p
              data-testid="bound-session-autofill-success"
              className="rounded-card bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
            >
              Filled {autofill.filled} field{autofill.filled === 1 ? '' : 's'}
              {autofill.skipped > 0 ? `, skipped ${autofill.skipped}` : ''}
              {autofill.failed > 0 ? `, failed ${autofill.failed}` : ''}.
            </p>
          ) : null}
          {autofill.kind === 'error' ? (
            <p
              data-testid="bound-session-autofill-error"
              className="rounded-card bg-red-50 px-2 py-1 text-[11px] text-red-800 dark:bg-red-900/40 dark:text-red-100"
            >
              {autofill.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div data-testid="bound-session-logs">
        <GenerationLogsPanel logs={logs} sessionStatus={session.status} />
      </div>

      <div data-testid="bound-session-artifacts">
        <ArtifactsPanel artifacts={artifacts} defaultOpen={true} />
      </div>
    </section>
  );
}

function SidepanelBody(): React.ReactElement {
  const { agents, activeAgentId, setActiveAgent, loading, error } = useAgentPreference();
  const { state: authState, signOut, loading: authLoading } = useAuthState();
  const { credits, loading: creditsLoading, error: creditsError } = useCredits();
  const { profile, loading: profileLoading } = useProfile();
  const { tabId } = useTargetTabId();
  const { intent } = useIntent();
  const tabUrl = useActiveTabUrl(tabId);
  const genericIntent = useGenericIntent({
    enabled: authState.signedIn && activeAgentId !== null,
    tabId,
    adapterIntent: intent,
    agentId: activeAgentId,
  });

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
        className="flex h-screen w-full items-center justify-center bg-white dark:bg-zinc-900"
      >
        <Spinner size="lg" label="Loading LLM Conveyors..." />
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

  const agentType: 'job-hunter' | 'b2b-sales' =
    agent.id === 'b2b-sales' ? 'b2b-sales' : 'job-hunter';

  const showBoundPanel = binding.status === 'found' && binding.session !== null;
  const showLoading = binding.status === 'loading';
  const accent = accentFor(agent.id);

  const signedIn = authState.signedIn;
  const userId = signedIn ? authState.userId : null;

  return (
    <div
      data-testid="sidepanel-root"
      data-active-agent={agent.id}
      data-accent={agent.id === 'b2b-sales' ? 'purple' : 'emerald'}
      data-binding-status={binding.status}
      className="flex h-screen w-full flex-col bg-white font-display dark:bg-zinc-900"
    >
      <SurfaceHeader
        userId={userId}
        agents={agents}
        activeAgentId={activeAgentId}
        onAgentChange={(id) => {
          void setActiveAgent(id);
        }}
        agentsDisabled={loading}
        onSignOut={
          signedIn
            ? () => {
                void signOut();
              }
            : undefined
        }
        signOutDisabled={authLoading}
        credits={credits}
        profile={profile}
        profileLoading={profileLoading}
        accentHeader={accent.header}
      />
      {showLoading ? (
        <div
          data-testid="bound-session-loading"
          className="flex items-center justify-center border-b border-zinc-200 p-4 dark:border-zinc-700"
        >
          <Spinner label="Checking for prior session..." />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {showBoundPanel && binding.session !== null ? (
          <BoundSessionPanel
            session={binding.session}
            logs={binding.logs}
            artifacts={binding.artifacts}
            urlBound={binding.binding?.urlKey !== undefined && binding.binding.urlKey.length > 0}
            accentBorder={accent.border}
            agentId={agent.id}
          />
        ) : null}
        <GenerationView
          activeAgentType={agentType}
          mode={showBoundPanel ? 'active-only' : 'both'}
        />
      </div>
      {signedIn ? (
        <SidepanelGenerationForm
          activeAgentId={agent.id}
          intent={intent}
          genericJdText={genericIntent.jdText}
          tabUrl={tabUrl}
          defaultOpen={!showBoundPanel}
        />
      ) : null}
      <SurfaceFooter
        credits={credits}
        loading={creditsLoading}
        error={creditsError}
        signedIn={signedIn}
      />
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
