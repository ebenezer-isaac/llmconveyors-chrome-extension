// SPDX-License-Identifier: MIT
/**
 * KeywordList: renders extracted keywords for the bound tab. Each row
 * shows the canonical term, a category badge, and the score rendered
 * as a 0-100 integer. When the caller supplies `onTermClick`, clicking
 * a row dispatches to the parent (typically to re-apply highlights for
 * that specific term, or to copy the term to the clipboard).
 *
 * Empty state differs from loading; the sidepanel distinguishes
 * "waiting for highlight" from "user has never highlighted on this
 * tab" so the copy is honest.
 */

import React from 'react';
import type { Keyword } from './useKeywords';

export interface KeywordListProps {
  readonly keywords: readonly Keyword[];
  readonly loading: boolean;
  readonly onTermClick?: (term: Keyword) => void;
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '0';
  const clamped = Math.max(0, Math.min(1, score));
  return Math.round(clamped * 100).toString();
}

export function KeywordList({
  keywords,
  loading,
  onTermClick,
}: KeywordListProps): React.ReactElement {
  if (loading) {
    return (
      <section
        data-testid="keyword-list"
        data-state="loading"
        aria-busy="true"
        className="mb-4 flex flex-col gap-1"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="llmc-shimmer h-7 rounded-card bg-zinc-100 dark:bg-zinc-800"
          />
        ))}
      </section>
    );
  }

  if (keywords.length === 0) {
    return (
      <section
        data-testid="keyword-list"
        data-state="empty"
        className="mb-4 rounded-card border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      >
        Highlight keywords from the popup to see matches here.
      </section>
    );
  }

  return (
    <section
      data-testid="keyword-list"
      data-state="populated"
      data-keyword-count={keywords.length}
      className="mb-4 flex flex-col gap-1"
    >
      <header className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Matched keywords
        </h3>
        <span
          data-testid="keyword-count"
          className="text-[11px] text-zinc-400 dark:text-zinc-500"
        >
          {keywords.length}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {keywords.map((kw) => {
          const row = (
            <div className="flex items-center justify-between gap-2 rounded-card bg-white px-2 py-1.5 dark:bg-zinc-800">
              <span
                data-testid="keyword-term"
                className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100"
                title={kw.term}
              >
                {kw.term}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  data-testid="keyword-category"
                  className="rounded-pill bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  {kw.category}
                </span>
                <span
                  data-testid="keyword-score"
                  className="w-8 text-right text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400"
                >
                  {formatScore(kw.score)}
                </span>
              </div>
            </div>
          );
          return (
            <li
              key={`${kw.canonicalForm}-${kw.term}`}
              data-testid="keyword-row"
              data-canonical={kw.canonicalForm}
            >
              {onTermClick !== undefined ? (
                <button
                  type="button"
                  onClick={() => onTermClick(kw)}
                  className="w-full cursor-pointer rounded-card text-left outline-none ring-brand-500 focus:ring-2"
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
