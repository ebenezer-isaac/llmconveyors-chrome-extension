// SPDX-License-Identifier: MIT
/**
 * ColdEmailBody -- renders a cold-email artifact with optional subject
 * header above the body. Falls back to TextArtifactBody for the body
 * rendering so markdown + truncation behaviour stays consistent.
 *
 * Mirrors e:/llmconveyors.com/src/components/shared/artifacts/ColdEmailCard.tsx.
 */

import React, { useMemo } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { TextArtifactBody } from './TextArtifactBody';

export interface ColdEmailBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

function extractSubject(artifact: ArtifactPreview): string | null {
  if (artifact.payload && typeof artifact.payload === 'object') {
    const raw = (artifact.payload as Record<string, unknown>).subject;
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  }
  if (artifact.content !== null) {
    const match = artifact.content.match(/^Subject:\s*(.+)$/im);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function extractBody(artifact: ArtifactPreview): ArtifactPreview {
  if (artifact.payload && typeof artifact.payload === 'object') {
    const raw = (artifact.payload as Record<string, unknown>).body;
    if (typeof raw === 'string' && raw.length > 0) {
      return { ...artifact, content: raw };
    }
  }
  if (artifact.content !== null) {
    // Strip a leading `Subject: ...` line if present.
    const stripped = artifact.content.replace(/^Subject:\s*.+$\n?/im, '');
    if (stripped !== artifact.content) {
      return { ...artifact, content: stripped.trim() };
    }
  }
  return artifact;
}

export function ColdEmailBody({
  artifact,
  open,
}: ColdEmailBodyProps): React.ReactElement {
  const subject = useMemo(() => extractSubject(artifact), [artifact]);
  const bodyArtifact = useMemo(() => extractBody(artifact), [artifact]);

  return (
    <div data-testid="artifact-body-cold-email" className="flex flex-col gap-2">
      {subject !== null ? (
        <div className="flex flex-col gap-0.5 rounded-card border border-zinc-200 px-2 py-1 dark:border-zinc-700">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Subject
          </span>
          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
            {subject}
          </span>
        </div>
      ) : null}
      <TextArtifactBody artifact={bodyArtifact} open={open} />
    </div>
  );
}
