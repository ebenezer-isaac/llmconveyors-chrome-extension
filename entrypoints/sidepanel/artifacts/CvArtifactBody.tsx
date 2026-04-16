// SPDX-License-Identifier: MIT
/**
 * CvArtifactBody -- parses a JSON-Resume-shaped payload and renders a
 * read-only summary (basics, top 3 work entries, top 3 education
 * entries, top skill list). Full editing lives in the dashboard
 * drawer; the sidepanel is preview-only.
 *
 * Mirrors the data shape rendered by
 * e:/llmconveyors.com/src/components/chat/artifacts/CVArtifactCard.tsx
 * without the edit / compile pipeline.
 */

import React, { useMemo } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

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
    // Not valid JSON; let the caller fall back to text body.
  }
  return null;
}

function joinLocation(loc: JsonResume['basics'] extends infer T ? (T extends { location?: infer L } ? L : undefined) : undefined): string | null {
  if (!loc || typeof loc !== 'object') return null;
  const parts = [loc.city, loc.region, loc.country].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

export function CvArtifactBody({
  artifact,
  open,
}: CvArtifactBodyProps): React.ReactElement {
  const resume = useMemo(() => parseResume(artifact.content), [artifact.content]);
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
