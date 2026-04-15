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
      return 'bg-brand-500';
  }
}

function downloadArtifact(artifact: GenerationArtifact): void {
  try {
    const blob = new Blob([artifact.content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.kind}.txt`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  } catch {
    // ignore - caller falls back to dashboard link
  }
}

function openDashboard(generationId: string): void {
  const url = `https://llmconveyors.com/session/${encodeURIComponent(generationId)}`;
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
}: GenerationViewProps): React.ReactElement | null {
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [latest, setLatest] = useState<GenerationUpdateBroadcast | null>(null);
  const [phases, setPhases] = useState<readonly PhaseEntry[]>([]);

  useEffect(() => {
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
  }, [generationId]);

  const progressPct = useMemo(() => {
    if (latest === null) return 0;
    if (typeof latest.progress === 'number') {
      return Math.round(Math.max(0, Math.min(1, latest.progress)) * 100);
    }
    return 0;
  }, [latest]);

  if (generationId === null) {
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
                key={`${artifact.kind}-${idx}`}
                type="button"
                data-testid={`download-${artifact.kind}`}
                onClick={() => downloadArtifact(artifact)}
                className="rounded-card border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                Download {artifact.kind}
              </button>
            ))}
            <button
              type="button"
              data-testid="open-in-dashboard"
              onClick={() => openDashboard(generationId)}
              className="rounded-card bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            >
              View in dashboard -&gt;
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
