// SPDX-License-Identifier: MIT
/**
 * TextArtifactBody -- renders plain-text / markdown artifact content
 * (cover letter, cold email body, deep-research memo, generic text).
 *
 * Mirrors e:/llmconveyors.com/src/components/chat/artifacts/TextArtifactCard.tsx
 * at the render layer: ReactMarkdown + remark-gfm + rehype-sanitize.
 * Truncates preview when the card is closed so the collapsed list stays
 * short; full text renders when the parent opens the card.
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

const PREVIEW_LIMIT = 400;

export interface TextArtifactBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

export function TextArtifactBody({
  artifact,
  open,
}: TextArtifactBodyProps): React.ReactElement {
  const content = artifact.content ?? '';
  const displayContent = useMemo(() => {
    if (open) return content;
    if (content.length <= PREVIEW_LIMIT) return content;
    return `${content.slice(0, PREVIEW_LIMIT)}...`;
  }, [open, content]);

  if (content.length === 0) {
    return (
      <p
        data-testid="artifact-body-empty"
        className="text-xs italic text-zinc-500 dark:text-zinc-400"
      >
        No preview content available. Download the artifact to view it.
      </p>
    );
  }

  return (
    <div
      data-testid="artifact-body-text"
      className="prose prose-sm max-w-none text-xs text-zinc-800 dark:prose-invert dark:text-zinc-100"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}
