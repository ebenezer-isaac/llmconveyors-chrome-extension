// SPDX-License-Identifier: MIT
/**
 * AutofillHistory: per-tab list of autofill events. Each entry shows
 * the time, the ATS vendor, and the filled/skipped counts. Multi-step
 * Workday wizards generate one entry per step; `stepLabel` (optional)
 * is rendered when present so the user can distinguish "step 1
 * myInformation" from "step 3 voluntaryDisclosures".
 */

import React from 'react';
import type { AutofillHistoryEntry } from './useAutofillHistory';

function vendorLabel(kind: AutofillHistoryEntry['atsKind']): string {
  switch (kind) {
    case 'greenhouse':
      return 'Greenhouse';
    case 'lever':
      return 'Lever';
    case 'workday':
      return 'Workday';
    default:
      return 'Unknown';
  }
}

function formatTime(at: number): string {
  try {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export interface AutofillHistoryProps {
  readonly history: readonly AutofillHistoryEntry[];
  readonly loading: boolean;
}

export function AutofillHistory({
  history,
  loading,
}: AutofillHistoryProps): React.ReactElement {
  if (loading) {
    return (
      <section
        data-testid="autofill-history"
        data-state="loading"
        aria-busy="true"
        className="mb-4"
      >
        <div className="llmc-shimmer h-16 rounded-card bg-zinc-100 dark:bg-zinc-800" />
      </section>
    );
  }

  if (history.length === 0) {
    return (
      <section
        data-testid="autofill-history"
        data-state="empty"
        className="mb-4 rounded-card border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      >
        Autofill runs will appear here once you click Fill on a supported page.
      </section>
    );
  }

  return (
    <section
      data-testid="autofill-history"
      data-state="populated"
      data-history-count={history.length}
      className="mb-4"
    >
      <header className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Autofill history
        </h3>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {history.length}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {history.map((entry, idx) => (
          <li
            key={`${entry.at}-${idx}`}
            data-testid="autofill-history-row"
            className="rounded-card bg-white p-2 text-xs dark:bg-zinc-800"
          >
            <div className="flex items-center justify-between">
              <span
                data-testid="autofill-history-vendor"
                className="font-semibold text-zinc-800 dark:text-zinc-100"
              >
                {vendorLabel(entry.atsKind)}
                {entry.stepLabel !== undefined ? ` - ${entry.stepLabel}` : null}
              </span>
              <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {formatTime(entry.at)}
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-[11px] text-zinc-600 dark:text-zinc-300">
              <span data-testid="autofill-history-filled">
                <strong className="text-brand-900 dark:text-brand-50">
                  {entry.fieldsFilled}
                </strong>{' '}
                filled
              </span>
              <span data-testid="autofill-history-skipped">
                <strong className="text-zinc-500 dark:text-zinc-400">
                  {entry.fieldsSkipped}
                </strong>{' '}
                skipped
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
