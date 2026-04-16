// SPDX-License-Identifier: MIT
/**
 * ArtifactsPanel -- collapsible container that renders a list of
 * ArtifactCard instances. Mirrors the web dashboard's ArtifactsPanel
 * but without zustand / version navigation (sidepanel is preview
 * only).
 *
 * The first artifact defaults open; the rest stay collapsed. Empty
 * state surfaces a subdued placeholder so users know the session
 * completed without deliverables.
 */

import React, { useState } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { ArtifactCard } from './ArtifactCard';

export interface ArtifactsPanelProps {
  readonly artifacts: readonly ArtifactPreview[];
  /** Start the section collapsed when false. Defaults to true. */
  readonly defaultOpen?: boolean;
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

export function ArtifactsPanel({
  artifacts,
  defaultOpen = true,
}: ArtifactsPanelProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const count = artifacts.length;

  return (
    <section
      data-testid="artifacts-panel"
      data-open={open ? 'true' : 'false'}
      data-artifact-count={count}
      className="flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="artifacts-panel-toggle"
        className="flex items-center justify-between gap-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <span>Artifacts ({count})</span>
        </span>
      </button>
      {open ? (
        count === 0 ? (
          <p
            data-testid="artifacts-panel-empty"
            className="rounded-card border border-zinc-200 px-2 py-2 text-xs italic text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            No artifacts yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {artifacts.map((artifact, idx) => (
              <li key={`${artifact.type}-${idx}`}>
                <ArtifactCard artifact={artifact} defaultOpen={idx === 0} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
