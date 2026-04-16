// SPDX-License-Identifier: MIT
/**
 * GenerationLogsPanel -- collapsible container that renders a session's
 * generation log stream in ASC time order above the artifacts section.
 *
 * Each entry surfaces (phase chip, level dot, timestamp, message). The
 * panel defaults open when the session is still running so the user
 * sees streaming progress, and defaults closed on completed sessions
 * to keep the "done" view compact (artifacts take the foreground).
 *
 * Mirrors the log rendering used in the web dashboard's agent session
 * surface (see e:/llmconveyors.com/src/components/chat/generation-logs
 * patterns) without the virtualized scroller (log counts in the sidepanel
 * rarely exceed a handful of entries).
 */

import React, { useMemo, useState } from 'react';
import type { SessionLogEntry } from '../useSessionForCurrentTab';

export interface GenerationLogsPanelProps {
  readonly logs: readonly SessionLogEntry[];
  /**
   * The current session status. 'active' / 'awaiting_input' imply the
   * generation is still in flight -- default the panel open so
   * streaming entries are visible. Otherwise default closed.
   */
  readonly sessionStatus?: string | null;
  /**
   * Explicit override for the initial open state. Wins over
   * sessionStatus. Useful for documentation / stories.
   */
  readonly defaultOpen?: boolean;
}

function levelColor(level: string | null): string {
  switch (level) {
    case 'error':
      return 'bg-red-500';
    case 'warn':
    case 'warning':
      return 'bg-amber-500';
    case 'debug':
      return 'bg-zinc-400';
    case 'info':
    default:
      return 'bg-blue-500';
  }
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    const d = new Date(ms);
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '';
  }
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M1 3 L5 7 L9 3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GenerationLogsPanel({
  logs,
  sessionStatus = null,
  defaultOpen,
}: GenerationLogsPanelProps): React.ReactElement {
  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => a.timestamp - b.timestamp),
    [logs],
  );
  const initialOpen = useMemo(() => {
    if (typeof defaultOpen === 'boolean') return defaultOpen;
    if (sessionStatus === 'active' || sessionStatus === 'awaiting_input') {
      return true;
    }
    return false;
  }, [defaultOpen, sessionStatus]);
  const [open, setOpen] = useState<boolean>(initialOpen);
  const count = sortedLogs.length;

  return (
    <section
      data-testid="generation-logs-panel"
      data-open={open ? 'true' : 'false'}
      data-log-count={count}
      className="flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="generation-logs-toggle"
        className="flex items-center justify-between gap-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <span>Generation log ({count})</span>
        </span>
      </button>
      {open ? (
        count === 0 ? (
          <p
            data-testid="generation-logs-empty"
            className="rounded-card border border-zinc-200 px-2 py-2 text-xs italic text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            No log entries yet.
          </p>
        ) : (
          <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-card border border-zinc-200 p-1 dark:border-zinc-700">
            {sortedLogs.map((entry, idx) => (
              <li
                key={idx}
                data-testid="generation-log-entry"
                className="flex items-start gap-2 px-1 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300"
              >
                <span
                  className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-pill ${levelColor(
                    entry.level,
                  )}`}
                  aria-hidden="true"
                />
                <span className="w-12 shrink-0 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  {formatTimestamp(entry.timestamp)}
                </span>
                {entry.phase !== null ? (
                  <span
                    data-testid="generation-log-phase"
                    className="shrink-0 rounded-pill bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {entry.phase}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 break-words">{entry.message}</span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}
