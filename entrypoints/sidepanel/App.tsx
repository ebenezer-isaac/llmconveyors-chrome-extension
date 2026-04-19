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

import React, { useEffect, useMemo, useState } from 'react';
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
import {
  SidepanelGenerationFormProvider,
  SidepanelGenerationFields,
  SidepanelGenerationSubmitBar,
} from './SidepanelGenerationForm';
import { Spinner } from './Spinner';
import { useIntent } from '../popup/useIntent';
import { useGenericIntent } from '../popup/useGenericIntent';
import { useActiveTabUrl } from '../popup/useActiveTabUrl';
import type { AgentId } from '@/src/background/agents';
import type { FillRequest } from '@/src/background/messaging/protocol-types';
import { ThemeRoot } from '@/entrypoints/shared/ThemeRoot';
import {
  getOrPreloadResumeAttachment,
  selectResumeArtifact,
} from './lib/autofill-resume-cache';

type RuntimeMessenger = {
  sendMessage?: (msg: unknown) => Promise<unknown>;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }
  return null;
}

function normalizeDateLikeValue(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const raw = value.trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return 0;
  const year = Number.parseInt(yearMatch[0], 10);
  if (!Number.isFinite(year)) return 0;
  return Date.UTC(year, 0, 1);
}

function looksCurrentRole(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /\b(present|current|now|ongoing|to date)\b/i.test(value);
}

function extractWorkItems(structuredData: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  const work = Array.isArray(structuredData.work) ? structuredData.work : [];
  for (const item of work) {
    const workItem = asRecord(item);
    if (workItem) out.push(workItem);
  }

  const sections = asRecord(structuredData.sections);
  const sectionWork = asRecord(sections?.work);
  const workItems = Array.isArray(sectionWork?.items) ? sectionWork.items : [];
  for (const item of workItems) {
    const workItem = asRecord(item);
    if (workItem) out.push(workItem);
  }

  return out;
}

function scoreWorkItem(workItem: Record<string, unknown>): number {
  const endRaw = firstNonEmptyString([workItem.endDate, workItem.end, workItem.to, workItem.period]);
  const startRaw = firstNonEmptyString([
    workItem.startDate,
    workItem.start,
    workItem.from,
    workItem.period,
  ]);
  if (endRaw === null || looksCurrentRole(endRaw)) {
    return Number.MAX_SAFE_INTEGER;
  }
  const endScore = normalizeDateLikeValue(endRaw);
  const startScore = normalizeDateLikeValue(startRaw);
  return endScore * 10 + startScore;
}

function extractResumeJobTitleFromStructuredData(
  structuredData: Record<string, unknown>,
): string | null {
  // Prefer most recent/current work role over static basics headline.
  const sortedWork = extractWorkItems(structuredData).sort(
    (a, b) => scoreWorkItem(b) - scoreWorkItem(a),
  );
  for (const workItem of sortedWork) {
    const title = firstNonEmptyString([
      workItem.position,
      workItem.title,
      workItem.jobTitle,
      workItem.role,
    ]);
    if (title) return title;
  }

  const basics = asRecord(structuredData.basics);
  const basicsTitle = firstNonEmptyString([
    basics?.headline,
    basics?.title,
    basics?.label,
    basics?.position,
  ]);
  if (basicsTitle) return basicsTitle;

  const sections = asRecord(structuredData.sections);
  const sectionBasics = asRecord(sections?.basics);
  const basicsItems = Array.isArray(sectionBasics?.items) ? sectionBasics?.items : [];
  if (basicsItems.length > 0) {
    const basicsFirst = asRecord(basicsItems[0]);
    const title = firstNonEmptyString([
      basicsFirst?.headline,
      basicsFirst?.title,
      basicsFirst?.label,
      basicsFirst?.position,
    ]);
    if (title) return title;
  }

  return null;
}

function extractResumeJobTitleFromMasterResumeResponse(response: unknown): string | null {
  const envelope = asRecord(response);
  if (!envelope || envelope.ok !== true) return null;
  const resume = asRecord(envelope.resume);
  if (!resume) return null;
  const structuredData = asRecord(resume.structuredData);
  if (!structuredData) return null;
  return extractResumeJobTitleFromStructuredData(structuredData);
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

async function runAutofill(
  resumeAttachment: NonNullable<FillRequest['resumeAttachment']> | null = null,
): Promise<AutofillOutcome> {
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
    const fillData: FillRequest = {
      tabId: tab.id,
      url: tab.url,
      ...(resumeAttachment !== null ? { resumeAttachment } : {}),
    };
    const raw = (await runtime.sendMessage({
      key: 'FILL_REQUEST',
      data: fillData,
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
  readonly agentId: AgentId;
}): React.ReactElement {
  const { session, logs, artifacts, urlBound, agentId } = props;
  const [autofill, setAutofill] = React.useState<AutofillOutcome>({ kind: 'idle' });
  const [resumeAttachment, setResumeAttachment] = React.useState<
    NonNullable<FillRequest['resumeAttachment']> | null
  >(null);
  const title =
    session.jobTitle ?? session.companyName ?? `Session ${session.sessionId.slice(0, 8)}`;
  const showAutofill = agentId === 'job-hunter';
  const resumeArtifact = React.useMemo(() => selectResumeArtifact(artifacts), [artifacts]);

  React.useEffect(() => {
    let cancelled = false;
    if (resumeArtifact === null) {
      setResumeAttachment(null);
      return;
    }
    void (async () => {
      const loaded = await getOrPreloadResumeAttachment(resumeArtifact);
      if (cancelled) return;
      setResumeAttachment(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeArtifact]);

  async function handleAutofill(): Promise<void> {
    setAutofill({ kind: 'pending' });
    let payload = resumeAttachment;
    if (payload === null && resumeArtifact !== null) {
      payload = await getOrPreloadResumeAttachment(resumeArtifact);
      setResumeAttachment(payload);
    }
    const result = await runAutofill(payload);
    setAutofill(result);
  }

  return (
    <section
      data-testid="bound-session-panel"
      data-session-id={session.sessionId}
      data-url-bound={urlBound ? 'true' : 'false'}
      className="flex flex-col gap-3 p-4"
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
  const {
    credits,
    loading: creditsLoading,
    error: creditsError,
    refresh: refreshCredits,
  } = useCredits();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const { tabId } = useTargetTabId();
  const { intent } = useIntent();
  const tabUrl = useActiveTabUrl(tabId);
  const [resumeJobTitle, setResumeJobTitle] = useState<string | null>(null);
  const signedInUserId = authState.signedIn ? authState.userId : null;
  const genericIntent = useGenericIntent({
    enabled: authState.signedIn && activeAgentId !== null,
    tabId,
    tabUrl,
    adapterIntent: intent,
    agentId: activeAgentId,
  });

  useEffect(() => {
    if (!authState.signedIn) return;
    void refreshCredits();
    void refreshProfile();
  }, [authState.signedIn, signedInUserId, refreshCredits, refreshProfile]);

  useEffect(() => {
    if (!authState.signedIn) {
      setResumeJobTitle(null);
      return;
    }
    const runtime = getRuntime();
    if (!runtime?.sendMessage) {
      setResumeJobTitle(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await runtime.sendMessage!({
          key: 'MASTER_RESUME_GET',
          data: {},
        });
        if (cancelled) return;
        setResumeJobTitle(extractResumeJobTitleFromMasterResumeResponse(raw));
      } catch {
        if (cancelled) return;
        setResumeJobTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.signedIn, signedInUserId]);

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
      {signedIn ? (
        <SidepanelGenerationFormProvider
          activeAgentId={agent.id}
          intent={intent}
          genericIntent={{
            hasJd: genericIntent.hasJd,
            jdText: genericIntent.jdText,
            jobTitle: genericIntent.jobTitle,
            company: genericIntent.company,
          }}
          tabUrl={tabUrl}
          resumeJobTitle={resumeJobTitle}
          boundSession={
            showBoundPanel && binding.session !== null
              ? {
                  companyName: binding.session.companyName,
                  jobTitle: binding.session.jobTitle,
                  urlKey:
                    binding.binding?.urlKey !== undefined && binding.binding.urlKey.length > 0
                      ? binding.binding.urlKey
                      : null,
                  title:
                    binding.session.jobTitle ??
                    binding.session.companyName ??
                    `Session ${binding.session.sessionId.slice(0, 8)}`,
                }
              : null
          }
        >
          <div className="flex flex-1 flex-col overflow-y-auto">
            {showBoundPanel && binding.session !== null ? (
                <BoundSessionPanel
                  session={binding.session}
                  logs={binding.logs}
                  artifacts={binding.artifacts}
                  urlBound={
                    binding.binding?.urlKey !== undefined && binding.binding.urlKey.length > 0
                  }
                  agentId={agent.id}
                />
            ) : null}
            <GenerationView
              activeAgentType={agentType}
              mode={showBoundPanel ? 'active-only' : 'both'}
            />
            {/*
              `mt-auto` pushes the form to the bottom of the scroll
              container. When content above (bound session + logs +
              artifacts + generation view) is shorter than the viewport
              the form settles at the bottom instead of sticking just
              under the last artifact. When content overflows, the user
              naturally scrolls past everything to reach the form --
              which is exactly the "only visible when scrolled to the
              bottom" UX the user asked for.
            */}
            <div className="mt-auto">
              <SidepanelGenerationFields />
            </div>
          </div>
          <SidepanelGenerationSubmitBar />
        </SidepanelGenerationFormProvider>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {showBoundPanel && binding.session !== null ? (
            <BoundSessionPanel
              session={binding.session}
              logs={binding.logs}
              artifacts={binding.artifacts}
              urlBound={
                binding.binding?.urlKey !== undefined && binding.binding.urlKey.length > 0
              }
              agentId={agent.id}
            />
          ) : null}
          <GenerationView
            activeAgentType={agentType}
            mode={showBoundPanel ? 'active-only' : 'both'}
          />
        </div>
      )}
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
