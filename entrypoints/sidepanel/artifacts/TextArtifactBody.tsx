// SPDX-License-Identifier: MIT
/**
 * TextArtifactBody -- renders plain-text / markdown artifact content
 * (cover letter, cold email body, deep-research memo, generic text).
 *
 * Two content paths:
 *   1. Inline -- artifact.content is already populated (either from
 *      the hydrate response's top-level `content` or the nested
 *      `payload.content`). Render immediately; truncate when the card
 *      is closed.
 *   2. Lazy -- artifact.content is null but storageKey + sessionId are
 *      present. On first open, dispatch ARTIFACT_FETCH_BLOB via the bg
 *      so the backend-signed download URL is fetchAuthed'd server-side
 *      and the utf-8 body returns to us; render into Markdown.
 *
 * Mirrors e:/llmconveyors.com/src/components/chat/artifacts/TextArtifactCard.tsx
 * at the render layer (ReactMarkdown + remark-gfm + rehype-sanitize).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { Spinner } from '../Spinner';

const PREVIEW_LIMIT = 400;

export interface TextArtifactBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; content: string }
  | { kind: 'error'; reason: string };

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function decodeUtf8Base64OrPassthrough(content: string, mimeType: string): string {
  // Binary mime types come back base64-encoded (see backend
  // session-artifacts.service.ts). Text mime types come back as
  // plain utf-8. Detect binary markers; otherwise trust the string.
  const lower = (mimeType || '').toLowerCase();
  const isBinary =
    lower.includes('pdf') ||
    lower.includes('png') ||
    lower.includes('jpeg') ||
    lower.includes('jpg') ||
    lower.includes('octet-stream');
  if (!isBinary) return content;
  try {
    const bin = atob(content);
    // UTF-8 decode the binary string. TextDecoder handles non-ASCII.
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return content;
  }
}

export function TextArtifactBody({
  artifact,
  open,
}: TextArtifactBodyProps): React.ReactElement {
  const canLazyFetch =
    artifact.content === null &&
    typeof artifact.sessionId === 'string' &&
    artifact.sessionId.length > 0 &&
    typeof artifact.storageKey === 'string' &&
    artifact.storageKey.length > 0;

  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  // Key the fetch by sessionId|storageKey so parent re-renders do not
  // re-fetch; only a genuine artifact switch does.
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canLazyFetch || !open) return;
    const key = `${artifact.sessionId}|${artifact.storageKey}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;

    const runtime = getRuntime();
    if (runtime === null) {
      setFetchState({ kind: 'error', reason: 'runtime-unavailable' });
      return;
    }
    let cancelled = false;
    setFetchState({ kind: 'loading' });
    (async () => {
      try {
        const raw = await runtime.sendMessage({
          key: 'ARTIFACT_FETCH_BLOB',
          data: {
            sessionId: artifact.sessionId,
            storageKey: artifact.storageKey,
          },
        });
        if (cancelled) return;
        if (!raw || typeof raw !== 'object') {
          setFetchState({ kind: 'error', reason: 'empty-response' });
          return;
        }
        const env = raw as {
          ok?: boolean;
          content?: string;
          mimeType?: string;
          reason?: string;
        };
        if (env.ok !== true || typeof env.content !== 'string') {
          setFetchState({
            kind: 'error',
            reason: typeof env.reason === 'string' ? env.reason : 'fetch-failed',
          });
          return;
        }
        const decoded = decodeUtf8Base64OrPassthrough(
          env.content,
          typeof env.mimeType === 'string' ? env.mimeType : '',
        );
        setFetchState({ kind: 'ready', content: decoded });
      } catch (err: unknown) {
        if (cancelled) return;
        setFetchState({
          kind: 'error',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLazyFetch, open, artifact.sessionId, artifact.storageKey]);

  const resolvedContent: string | null = useMemo(() => {
    if (typeof artifact.content === 'string' && artifact.content.length > 0) {
      return artifact.content;
    }
    if (fetchState.kind === 'ready') return fetchState.content;
    return null;
  }, [artifact.content, fetchState]);

  const displayContent = useMemo(() => {
    if (resolvedContent === null) return null;
    if (open) return resolvedContent;
    if (resolvedContent.length <= PREVIEW_LIMIT) return resolvedContent;
    return `${resolvedContent.slice(0, PREVIEW_LIMIT)}...`;
  }, [open, resolvedContent]);

  if (fetchState.kind === 'loading') {
    return (
      <div data-testid="artifact-body-loading" className="flex justify-start">
        <Spinner size="sm" inline label="Loading preview..." />
      </div>
    );
  }

  if (fetchState.kind === 'error' && resolvedContent === null) {
    return (
      <p
        data-testid="artifact-body-error"
        className="text-xs italic text-red-600 dark:text-red-400"
      >
        Could not load preview ({fetchState.reason}). Download the artifact to view it.
      </p>
    );
  }

  if (displayContent === null) {
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
