// SPDX-License-Identifier: MIT
/**
 * CvArtifactBody -- when the CV artifact carries a pre-rendered PDF
 * (`pdfStorageKey`), fetch the bytes via ARTIFACT_FETCH_BLOB and
 * display them in an iframe so the user sees the actual compiled CV
 * the backend produced. Falls back to a parsed JSON-Resume summary
 * when the PDF is absent.
 *
 * iframe uses a blob: URL so it inherits the extension origin (no
 * cross-origin cookie / bearer needed). The URL is revoked on unmount
 * and whenever the artifact id changes.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { Spinner } from '../Spinner';

export interface CvArtifactBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

type JsonResume = {
  basics?: {
    name?: string;
    label?: string;
    email?: string;
    phone?: string;
    summary?: string;
    location?: { city?: string; region?: string; country?: string };
  };
  work?: ReadonlyArray<{
    company?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    summary?: string;
  }>;
  education?: ReadonlyArray<{
    institution?: string;
    area?: string;
    studyType?: string;
    endDate?: string;
  }>;
  skills?: ReadonlyArray<{ name?: string; keywords?: readonly string[] }>;
};

function parseResume(raw: string | null): JsonResume | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') return parsed as JsonResume;
  } catch {
    // Not valid JSON; caller falls back to the pdf-only path.
  }
  return null;
}

function joinLocation(
  loc:
    | { city?: string; region?: string; country?: string }
    | undefined
    | null,
): string | null {
  if (!loc || typeof loc !== 'object') return null;
  const parts = [loc.city, loc.region, loc.country].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

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

type PdfState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; reason: string };

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function CvArtifactBody({
  artifact,
  open,
}: CvArtifactBodyProps): React.ReactElement {
  const hasPdf =
    typeof artifact.pdfStorageKey === 'string' &&
    artifact.pdfStorageKey.length > 0 &&
    typeof artifact.sessionId === 'string' &&
    artifact.sessionId.length > 0;

  const [pdfState, setPdfState] = useState<PdfState>({ kind: 'idle' });
  // Guard against re-fetching when the effect re-runs (e.g. because
  // parent re-renders and passes a new artifact object with the same
  // identity). Keyed by `${sessionId}|${pdfStorageKey}` so genuine
  // artifact switches invalidate the cache.
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasPdf || !open) return;
    const fetchKey = `${artifact.sessionId}|${artifact.pdfStorageKey}`;
    if (fetchedKeyRef.current === fetchKey) return;
    fetchedKeyRef.current = fetchKey;

    let cancelled = false;
    const runtime = getRuntime();
    if (runtime === null) {
      setPdfState({ kind: 'error', reason: 'runtime-unavailable' });
      return;
    }
    setPdfState({ kind: 'loading' });
    (async () => {
      try {
        const raw = await runtime.sendMessage({
          key: 'ARTIFACT_FETCH_BLOB',
          data: {
            sessionId: artifact.sessionId,
            storageKey: artifact.pdfStorageKey,
          },
        });
        if (cancelled) return;
        if (!raw || typeof raw !== 'object') {
          setPdfState({ kind: 'error', reason: 'empty-response' });
          return;
        }
        const env = raw as {
          ok?: boolean;
          content?: string;
          mimeType?: string;
          reason?: string;
        };
        if (env.ok !== true || typeof env.content !== 'string') {
          setPdfState({
            kind: 'error',
            reason: typeof env.reason === 'string' ? env.reason : 'fetch-failed',
          });
          return;
        }
        const url = base64ToBlobUrl(
          env.content,
          typeof env.mimeType === 'string' ? env.mimeType : 'application/pdf',
        );
        setPdfState({ kind: 'ready', url });
      } catch (err: unknown) {
        if (cancelled) return;
        setPdfState({
          kind: 'error',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPdf, open, artifact.sessionId, artifact.pdfStorageKey]);

  // Revoke blob URL on unmount / when source key changes.
  useEffect(() => {
    if (pdfState.kind !== 'ready') return;
    const url = pdfState.url;
    return () => URL.revokeObjectURL(url);
  }, [pdfState]);

  const resume = useMemo(() => parseResume(artifact.content), [artifact.content]);

  // ---- Render ----

  if (hasPdf) {
    if (pdfState.kind === 'ready') {
      return (
        <iframe
          data-testid="artifact-body-cv-pdf"
          src={pdfState.url}
          title={artifact.label}
          className="h-[540px] w-full rounded-card border border-zinc-200 dark:border-zinc-700"
        />
      );
    }
    if (pdfState.kind === 'loading') {
      return (
        <div data-testid="artifact-body-cv-loading" className="flex justify-start">
          <Spinner size="sm" inline label="Loading PDF preview..." />
        </div>
      );
    }
    if (pdfState.kind === 'error') {
      return (
        <p
          data-testid="artifact-body-cv-pdf-error"
          className="text-xs italic text-red-600 dark:text-red-400"
        >
          Could not load PDF preview ({pdfState.reason}). Use Download to save the file.
        </p>
      );
    }
    // idle: card not yet opened -- render nothing (body is hidden anyway)
    return <span data-testid="artifact-body-cv-idle" className="hidden" aria-hidden="true" />;
  }

  if (resume === null) {
    return (
      <p
        data-testid="artifact-body-cv-unparseable"
        className="text-xs italic text-zinc-500 dark:text-zinc-400"
      >
        Resume payload is not a recognised JSON Resume shape. Download to inspect.
      </p>
    );
  }

  const basics = resume.basics ?? {};
  const location = joinLocation(basics.location);
  const work = (resume.work ?? []).slice(0, open ? 5 : 2);
  const education = (resume.education ?? []).slice(0, open ? 3 : 1);
  const skills = (resume.skills ?? []).slice(0, open ? 10 : 5);

  return (
    <div data-testid="artifact-body-cv" className="flex flex-col gap-2 text-xs">
      <section className="flex flex-col gap-0.5">
        {basics.name ? (
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {basics.name}
          </span>
        ) : null}
        {basics.label ? (
          <span className="text-zinc-700 dark:text-zinc-200">{basics.label}</span>
        ) : null}
        <span className="text-zinc-500 dark:text-zinc-400">
          {[basics.email, basics.phone, location]
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
            .join(' • ')}
        </span>
      </section>

      {open && typeof basics.summary === 'string' && basics.summary.length > 0 ? (
        <p className="text-zinc-700 dark:text-zinc-200">{basics.summary}</p>
      ) : null}

      {work.length > 0 ? (
        <section className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Experience
          </span>
          <ul className="flex flex-col gap-1">
            {work.map((entry, idx) => (
              <li
                key={`work-${idx}`}
                className="rounded-card border border-zinc-200 px-2 py-1 dark:border-zinc-700"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">
                    {entry.position ?? 'Role'}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {[entry.startDate, entry.endDate].filter(Boolean).join(' - ')}
                  </span>
                </div>
                <span className="text-zinc-600 dark:text-zinc-300">
                  {entry.company ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {education.length > 0 ? (
        <section className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Education
          </span>
          <ul className="flex flex-col gap-1">
            {education.map((entry, idx) => (
              <li key={`edu-${idx}`} className="text-zinc-700 dark:text-zinc-200">
                {[entry.studyType, entry.area, entry.institution]
                  .filter((s): s is string => typeof s === 'string' && s.length > 0)
                  .join(' - ')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Skills
          </span>
          <ul className="flex flex-wrap gap-1">
            {skills.map((s, idx) => (
              <li
                key={`skill-${idx}`}
                className="rounded-pill border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                {s.name ?? 'Skill'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
