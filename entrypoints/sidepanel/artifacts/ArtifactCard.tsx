// SPDX-License-Identifier: MIT
/**
 * ArtifactCard -- collapsible wrapper around a single artifact.
 *
 * Header row renders label + copy + download + chevron controls; body
 * delegates to a type-specific component (TextArtifactBody,
 * CvArtifactBody, AtsComparisonBody, ColdEmailBody). The card state
 * is local; parents stay dumb.
 *
 * Mirrors the interaction affordances of
 * e:/llmconveyors.com/src/components/chat/artifacts/TextArtifactCard.tsx
 * and the other web dashboard cards.
 */

import React, { useCallback, useState } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { downloadBlob, downloadUrl } from '../lib/download';
import { copyToClipboard } from '../lib/clipboard';
import { TextArtifactBody } from './TextArtifactBody';
import { CvArtifactBody } from './CvArtifactBody';
import { AtsComparisonBody } from './AtsComparisonBody';
import { ColdEmailBody } from './ColdEmailBody';

export interface ArtifactCardProps {
  readonly artifact: ArtifactPreview;
  readonly defaultOpen?: boolean;
}

function Body({
  artifact,
  open,
}: {
  artifact: ArtifactPreview;
  open: boolean;
}): React.ReactElement {
  switch (artifact.type) {
    case 'cv':
      return <CvArtifactBody artifact={artifact} open={open} />;
    case 'ats-comparison':
      return <AtsComparisonBody artifact={artifact} open={open} />;
    case 'cold-email':
      return <ColdEmailBody artifact={artifact} open={open} />;
    case 'cover-letter':
    case 'deep-research':
    case 'other':
    default:
      return <TextArtifactBody artifact={artifact} open={open} />;
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
      <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArtifactCard({
  artifact,
  defaultOpen = false,
}: ArtifactCardProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const handleDownload = useCallback(() => {
    if (artifact.downloadUrl !== null) {
      void downloadUrl(artifact.downloadUrl, artifact.filename);
      return;
    }
    if (artifact.content !== null) {
      void downloadBlob(
        artifact.content,
        artifact.filename,
        artifact.mimeType ?? 'application/octet-stream',
      );
    }
  }, [artifact]);

  const handleCopy = useCallback(async () => {
    const text = artifact.content;
    if (text === null) {
      setCopyState('failed');
      return;
    }
    const ok = await copyToClipboard(text);
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 1500);
  }, [artifact.content]);

  const canCopy = artifact.content !== null;
  const canDownload = artifact.downloadUrl !== null || artifact.content !== null;

  return (
    <section
      data-testid="artifact-card"
      data-artifact-type={artifact.type}
      data-open={open ? 'true' : 'false'}
      className="flex flex-col gap-2 rounded-card border border-zinc-200 p-2 dark:border-zinc-700"
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          data-testid="artifact-card-toggle"
          className="flex flex-1 items-center gap-2 text-left text-xs font-medium text-zinc-800 dark:text-zinc-100"
        >
          <ChevronIcon open={open} />
          <span className="truncate">{artifact.label}</span>
        </button>
        <div className="flex items-center gap-1">
          {canCopy ? (
            <button
              type="button"
              onClick={handleCopy}
              data-testid="artifact-card-copy"
              aria-label="Copy content"
              className="rounded-card border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                ? 'Failed'
                : 'Copy'}
            </button>
          ) : null}
          {canDownload ? (
            <button
              type="button"
              onClick={handleDownload}
              data-testid="artifact-card-download"
              aria-label="Download artifact"
              className="rounded-card border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Download
            </button>
          ) : null}
        </div>
      </header>
      {open ? (
        <div data-testid="artifact-card-body">
          <Body artifact={artifact} open={open} />
        </div>
      ) : null}
    </section>
  );
}
