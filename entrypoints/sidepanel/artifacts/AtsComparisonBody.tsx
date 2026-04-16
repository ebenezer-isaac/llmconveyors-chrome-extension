// SPDX-License-Identifier: MIT
/**
 * AtsComparisonBody -- read-only ATS score before/after render.
 *
 * Mirrors the data shape from
 * e:/llmconveyors.com/src/components/chat/artifacts/AtsComparisonCard.tsx:
 * expects a payload with `before.score`, `after.score`, and optional
 * `priorities` array. Falls back to raw content preview when the shape
 * does not match.
 */

import React, { useMemo } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

export interface AtsComparisonBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

type AtsScore = { score?: number; matchedKeywords?: readonly string[] };
type AtsPayload = {
  before?: AtsScore;
  after?: AtsScore;
  priorities?: readonly { label?: string; status?: string }[];
};

function extractPayload(artifact: ArtifactPreview): AtsPayload | null {
  if (artifact.payload && typeof artifact.payload === 'object') {
    return artifact.payload as AtsPayload;
  }
  if (artifact.content !== null) {
    try {
      const parsed = JSON.parse(artifact.content);
      if (parsed && typeof parsed === 'object') return parsed as AtsPayload;
    } catch {
      // fall through
    }
  }
  return null;
}

function scoreDelta(before: number | undefined, after: number | undefined): string {
  if (typeof before !== 'number' || typeof after !== 'number') return '';
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  return ` (${sign}${delta})`;
}

export function AtsComparisonBody({
  artifact,
  open,
}: AtsComparisonBodyProps): React.ReactElement {
  const payload = useMemo(() => extractPayload(artifact), [artifact]);

  if (payload === null) {
    return (
      <p
        data-testid="artifact-body-ats-unparseable"
        className="text-xs italic text-zinc-500 dark:text-zinc-400"
      >
        ATS comparison payload missing. Download the artifact to inspect.
      </p>
    );
  }

  const beforeScore = payload.before?.score;
  const afterScore = payload.after?.score;
  const priorities = (payload.priorities ?? []).slice(0, open ? 6 : 3);

  return (
    <div data-testid="artifact-body-ats" className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card border border-zinc-200 p-2 dark:border-zinc-700">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Before
          </div>
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {typeof beforeScore === 'number' ? beforeScore : '-'}
          </div>
        </div>
        <div className="rounded-card border border-zinc-200 p-2 dark:border-zinc-700">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            After
          </div>
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {typeof afterScore === 'number' ? afterScore : '-'}
            <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {scoreDelta(beforeScore, afterScore)}
            </span>
          </div>
        </div>
      </div>

      {priorities.length > 0 ? (
        <section className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Priorities
          </span>
          <ul className="flex flex-col gap-1">
            {priorities.map((p, idx) => (
              <li
                key={`pri-${idx}`}
                className="flex items-center justify-between gap-2 rounded-card border border-zinc-200 px-2 py-1 dark:border-zinc-700"
              >
                <span className="truncate text-zinc-800 dark:text-zinc-100">
                  {p.label ?? 'Priority'}
                </span>
                {p.status ? (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {p.status}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
