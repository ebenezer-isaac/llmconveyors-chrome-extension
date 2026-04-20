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
import { downloadBlob, downloadUrl, downloadBase64 } from '../lib/download';

type DownloadState = 'idle' | 'loading' | 'success' | 'error';

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

async function fetchArtifactBlob(
  sessionId: string,
  storageKey: string,
): Promise<{ ok: true; content: string; mimeType: string } | { ok: false; reason: string }> {
  const runtime = getRuntime();
  if (runtime === null) {
    return { ok: false, reason: 'runtime-unavailable' };
  }
  try {
    const raw = await runtime.sendMessage({
      key: 'ARTIFACT_FETCH_BLOB',
      data: { sessionId, storageKey },
    });
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'empty-response' };
    }
    const env = raw as {
      ok?: boolean;
      content?: string;
      mimeType?: string;
      reason?: string;
    };
    if (env.ok !== true || typeof env.content !== 'string') {
      return { ok: false, reason: typeof env.reason === 'string' ? env.reason : 'fetch-failed' };
    }
    return {
      ok: true,
      content: env.content,
      mimeType: typeof env.mimeType === 'string' ? env.mimeType : 'application/octet-stream',
    };
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
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
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const handleDownload = useCallback(async () => {
    if (downloadState === 'loading') return;
    setDownloadState('loading');

    try {
      // Priority 1: PDF artifacts with pdfStorageKey (Resume)
      if (artifact.pdfStorageKey !== null && artifact.sessionId !== null) {
        const result = await fetchArtifactBlob(artifact.sessionId, artifact.pdfStorageKey);
        if (result.ok) {
          const success = await downloadBase64(result.content, artifact.filename, result.mimeType);
          setDownloadState(success ? 'success' : 'error');
          if (success) setTimeout(() => setDownloadState('idle'), 1500);
          return;
        }
      }

      // Priority 2: Signed download URL
      if (artifact.downloadUrl !== null) {
        const success = await downloadUrl(artifact.downloadUrl, artifact.filename);
        setDownloadState(success ? 'success' : 'error');
        if (success) setTimeout(() => setDownloadState('idle'), 1500);
        return;
      }

      // Priority 3: Inline content (Company Research, Cover Letter)
      if (artifact.content !== null) {
        const mimeType = artifact.mimeType ?? 'text/plain';
        const success = await downloadBlob(artifact.content, artifact.filename, mimeType);
        setDownloadState(success ? 'success' : 'error');
        if (success) setTimeout(() => setDownloadState('idle'), 1500);
        return;
      }

      // Priority 4: Fetch via storageKey (fallback)
      if (artifact.storageKey !== null && artifact.sessionId !== null) {
        const result = await fetchArtifactBlob(artifact.sessionId, artifact.storageKey);
        if (result.ok) {
          const isBinary =
            result.mimeType.startsWith('application/') &&
            !result.mimeType.includes('json') &&
            !result.mimeType.includes('text');
          const success = isBinary
            ? await downloadBase64(result.content, artifact.filename, result.mimeType)
            : await downloadBlob(result.content, artifact.filename, result.mimeType);
          setDownloadState(success ? 'success' : 'error');
          if (success) setTimeout(() => setDownloadState('idle'), 1500);
          return;
        }
      }

      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch {
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2000);
    }
  }, [artifact, downloadState]);

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
  const canDownload =
    artifact.pdfStorageKey !== null ||
    artifact.downloadUrl !== null ||
    artifact.content !== null ||
    artifact.storageKey !== null;

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
              onClick={() => void handleDownload()}
              disabled={downloadState === 'loading'}
              data-testid="artifact-card-download"
              aria-label="Download artifact"
              className={`rounded-card border px-2 py-0.5 text-[10px] hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                downloadState === 'error'
                  ? 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
                  : downloadState === 'success'
                  ? 'border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400'
                  : 'border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
              } ${downloadState === 'loading' ? 'cursor-wait opacity-60' : ''}`}
            >
              {downloadState === 'loading'
                ? 'Downloading...'
                : downloadState === 'success'
                ? 'Downloaded'
                : downloadState === 'error'
                ? 'Failed'
                : 'Download'}
            </button>
          ) : null}
        </div>
      </header>
      {open ? (
        <div
          data-testid="artifact-card-body"
          data-scrollable={artifact.type === 'deep-research' ? 'true' : undefined}
          className={
            artifact.type === 'deep-research'
              ? 'max-h-[400px] overflow-y-auto rounded-card border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50'
              : undefined
          }
        >
          <Body artifact={artifact} open={open} />
        </div>
      ) : null}
    </section>
  );
}
