// SPDX-License-Identifier: MIT
/**
 * GenerationView - live progress surface for the side panel.
 *
 * Listens for GENERATION_STARTED (sets the current generationId), then for
 * GENERATION_UPDATE events addressed to that id. Renders:
 *   - current phase + progress bar
 *   - phase history with done / running / pending dots
 *   - interaction prompt when the backend requests input
 *   - artifact downloads + "View in dashboard" on completion
 *
 * The view is framework-light: the existing iframe remains the primary
 * dashboard; this view is an overlay shown while a generation is active.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type {
  GenerationArtifact,
  GenerationUpdateBroadcast,
} from '@/src/background/messaging/protocol';
import { InteractionPrompt } from './InteractionPrompt';
import { useGenerationLock } from '../shared/useGenerationLock';

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
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

export interface GenerationViewProps {
  readonly activeAgentType: 'job-hunter' | 'b2b-sales';
  readonly tabUrl: string | null;
  /**
   * Controls what the view renders when no generation is in flight.
   *   'both' (default) - show the idle "Click a Generate button" message.
   *   'active-only'    - render null when idle. Use this when the caller
   *                      is already showing a prior-session panel above
   *                      and does not want the trailing idle copy.
   *   'idle-only'      - render idle copy only; never attach to a live
   *                      generation (used by documentation/story surfaces).
   */
  readonly mode?: 'both' | 'active-only' | 'idle-only';
}

interface PhaseEntry {
  readonly phase: string;
  readonly status: GenerationUpdateBroadcast['status'];
  readonly at: number;
}

function statusColor(status: GenerationUpdateBroadcast['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    case 'cancelled':
      return 'bg-zinc-400';
    case 'awaiting_input':
      return 'bg-amber-500';
    case 'running':
    default:
      return 'bg-blue-500';
  }
}

import { AGENT_REGISTRY, buildAgentUrl } from '@/src/background/agents/agent-registry';
import { downloadBlob } from './lib/download';
import { buildArtifactFilename, defaultFilenameForType } from './lib/filename';

function downloadArtifact(artifact: GenerationArtifact): void {
  if (typeof artifact.content !== 'string') return;
  const kind =
    typeof artifact.kind === 'string'
      ? artifact.kind
      : typeof artifact.type === 'string'
      ? artifact.type
      : 'other';
  const { suffix, ext } = defaultFilenameForType(kind, 'text/plain');
  const filename = buildArtifactFilename({}, suffix, ext);
  void downloadBlob(artifact.content, filename, 'application/octet-stream');
}

function artifactKindLabel(artifact: GenerationArtifact): string {
  if (typeof artifact.kind === 'string' && artifact.kind.length > 0) return artifact.kind;
  if (typeof artifact.type === 'string' && artifact.type.length > 0) return artifact.type;
  return 'artifact';
}
import type { AgentId } from '@/src/background/agents';
import { clientEnv } from '@/src/shared/env';

function agentDashboardUrl(agentId: AgentId): string {
  const agent = AGENT_REGISTRY[agentId];
  const fallback = `${clientEnv.webBaseUrl}/${clientEnv.defaultLocale}`;
  return (
    buildAgentUrl(agent, 'dashboard', {
      rootDomain: clientEnv.rootDomain,
      locale: clientEnv.defaultLocale,
    }) ?? fallback
  );
}

function openDashboard(_generationId: string, agentId: AgentId): void {
  // The web app has no per-session deep-link route; dropping the user on
  // the agent dashboard root lets them find the session in the sidebar.
  const url = agentDashboardUrl(agentId);
  const g = globalThis as unknown as {
    chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
  };
  if (g.chrome?.tabs?.create) {
    g.chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export function GenerationView({
  activeAgentType,
  tabUrl,
  mode = 'both',
}: GenerationViewProps): React.ReactElement | null {
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [latest, setLatest] = useState<GenerationUpdateBroadcast | null>(null);
  const [phases, setPhases] = useState<readonly PhaseEntry[]>([]);
  const generationLock = useGenerationLock({
    agentId: activeAgentType,
    tabUrl,
    enabled: mode !== 'idle-only',
  });

  useEffect(() => {
    if (mode === 'idle-only') return;
    if (generationId !== null) return;
    if (!generationLock.active || generationLock.generationId === null) return;
    const runtime = getRuntime();
    if (runtime === null) return;
    const id = generationLock.generationId;
    setGenerationId(id);
    setLatest(null);
    setPhases([]);
    void runtime.sendMessage({
      key: 'GENERATION_SUBSCRIBE',
      data: { generationId: id },
    });
  }, [generationId, generationLock.active, generationLock.generationId, mode]);

  useEffect(() => {
    if (mode === 'idle-only') return;
    const runtime = getRuntime();
    if (runtime === null) return;
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: unknown };
      if (env.key === 'GENERATION_STARTED') {
        const data = env.data as Record<string, unknown> | undefined;
        const id = typeof data?.generationId === 'string' ? data.generationId : null;
        if (id !== null) {
          setGenerationId(id);
          setLatest(null);
          setPhases([]);
          // Make sure the bg is streaming.
          void runtime.sendMessage({
            key: 'GENERATION_SUBSCRIBE',
            data: { generationId: id },
          });
        }
        return;
      }
      if (env.key !== 'GENERATION_UPDATE') return;
      const data = env.data as Record<string, unknown> | undefined;
      if (!data) return;
      const validated = data as unknown as GenerationUpdateBroadcast;
      setLatest((prev) => {
        if (prev !== null && prev.generationId !== validated.generationId) {
          // Ignore updates for old generations.
          return prev;
        }
        return validated;
      });
      if (!generationId || validated.generationId === generationId) {
        setPhases((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.phase === validated.phase) {
            const copy = prev.slice(0, -1);
            copy.push({
              phase: validated.phase,
              status: validated.status,
              at: Date.now(),
            });
            return copy;
          }
          return [
            ...prev,
            { phase: validated.phase, status: validated.status, at: Date.now() },
          ];
        });
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, [generationId, mode]);

  const progressPct = useMemo(() => {
    if (latest === null) return 0;
    if (typeof latest.progress === 'number') {
      return Math.round(Math.max(0, Math.min(1, latest.progress)) * 100);
    }
    return 0;
  }, [latest]);

  if (generationId === null) {
    if (mode === 'active-only') {
      // Caller (App.tsx) is showing a prior-session panel above and
      // does not want the idle hint appended. Collapse to nothing.
      return null;
    }
    return (
      <div
        data-testid="generation-view-idle"
        className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        No active generation. Click a Generate button in the popup to start.
      </div>
    );
  }

  const isInteraction = latest?.status === 'awaiting_input';
  const isTerminal =
    latest?.status === 'completed' ||
    latest?.status === 'failed' ||
    latest?.status === 'cancelled';

  return (
    <div
      data-testid="generation-view"
      data-generation-id={generationId}
      data-status={latest?.status ?? 'pending'}
      className="flex h-full w-full flex-col gap-3 p-4"
    >
      <header className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Generation</span>
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {latest?.phase ?? 'Preparing...'}
        </span>
      </header>

      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          data-testid="generation-progress-bar"
          className={`h-full transition-all ${statusColor(latest?.status ?? 'running')}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <section data-testid="generation-phases" className="flex flex-col gap-1">
        {phases.map((p, idx) => (
          <div
            key={`${p.phase}-${idx}`}
            data-testid={`phase-${p.phase}`}
            data-status={p.status}
            className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"
          >
            <span
              className={`inline-block h-2 w-2 rounded-pill ${statusColor(p.status)}`}
              aria-hidden="true"
            />
            <span className="truncate">{p.phase}</span>
          </div>
        ))}
      </section>

      {isInteraction && latest ? (
        <InteractionPrompt
          agentType={activeAgentType}
          generationId={generationId}
          interactionType={latest.interactionType ?? 'generic'}
        />
      ) : null}

      {isTerminal ? (
        <section data-testid="generation-complete" className="flex flex-col gap-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Generation {latest?.status}. Download artifacts below or open the full
            dashboard.
          </p>
          <div className="flex flex-col gap-1">
            {(latest?.artifacts ?? []).map((artifact, idx) => (
              <button
                key={`${artifactKindLabel(artifact)}-${idx}`}
                type="button"
                data-testid={`download-${artifactKindLabel(artifact)}`}
                onClick={() => downloadArtifact(artifact)}
                disabled={typeof artifact.content !== 'string'}
                className="rounded-card border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                Download {artifactKindLabel(artifact)}
              </button>
            ))}
            <button
              type="button"
              data-testid="open-in-dashboard"
              onClick={() => openDashboard(generationId, activeAgentType)}
              className="rounded-card bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              View in dashboard -&gt;
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
