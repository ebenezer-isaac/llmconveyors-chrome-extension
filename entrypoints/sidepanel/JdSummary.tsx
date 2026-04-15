// SPDX-License-Identifier: MIT
/**
 * JdSummary: renders the currently-detected job posting in the side
 * panel. Shows ATS vendor + page kind, the job title, the company,
 * and the canonical URL. Collapses to a "No JD detected" card when
 * no intent exists for the bound tab (mirrors the popup's intent
 * badge empty state).
 */

import React from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

function vendorLabel(kind: DetectedIntent['kind']): string {
  switch (kind) {
    case 'greenhouse':
      return 'Greenhouse';
    case 'lever':
      return 'Lever';
    case 'workday':
      return 'Workday';
    case 'unknown':
      return 'Unknown ATS';
    default:
      return 'Unknown';
  }
}

function pageKindLabel(pageKind: DetectedIntent['pageKind']): string {
  return pageKind === 'job-posting' ? 'Job posting' : 'Application form';
}

export interface JdSummaryProps {
  readonly intent: DetectedIntent | null;
  readonly loading: boolean;
}

export function JdSummary({ intent, loading }: JdSummaryProps): React.ReactElement {
  if (loading) {
    return (
      <section
        data-testid="jd-summary"
        data-state="loading"
        aria-busy="true"
        className="llmc-shimmer mb-4 h-24 rounded-card bg-zinc-100 dark:bg-zinc-800"
      />
    );
  }

  if (intent === null || intent.kind === 'unknown') {
    return (
      <section
        data-testid="jd-summary"
        data-state="none"
        className="mb-4 rounded-card border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        <p className="font-medium">No JD detected on this tab</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Open a Greenhouse, Lever, or Workday job posting to begin.
        </p>
      </section>
    );
  }

  const vendor = vendorLabel(intent.kind);
  const kind = pageKindLabel(intent.pageKind);
  const title = intent.jobTitle ?? 'Job posting';
  const company = intent.company ?? 'Unknown company';

  return (
    <section
      data-testid="jd-summary"
      data-state="detected"
      data-vendor={intent.kind}
      data-page-kind={intent.pageKind}
      className="mb-4 rounded-card border border-brand-500 bg-brand-50 p-4 dark:border-brand-500 dark:bg-brand-900"
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          data-testid="jd-vendor"
          className="rounded-pill bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-900 dark:bg-zinc-900 dark:text-brand-50"
        >
          {vendor}
        </span>
        <span
          data-testid="jd-page-kind"
          className="text-[11px] font-medium text-brand-900 dark:text-brand-50"
        >
          {kind}
        </span>
      </div>

      <h2
        data-testid="jd-title"
        className="text-base font-semibold text-brand-900 dark:text-brand-50"
      >
        {title}
      </h2>

      <p
        data-testid="jd-company"
        className="mt-1 text-sm text-brand-900/80 dark:text-brand-50/80"
      >
        {company}
      </p>

      <a
        data-testid="jd-url"
        href={intent.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-3 block truncate text-xs text-brand-900/70 underline underline-offset-2 hover:text-brand-900 dark:text-brand-50/70 dark:hover:text-brand-50"
        title={intent.url}
      >
        {intent.url}
      </a>
    </section>
  );
}
