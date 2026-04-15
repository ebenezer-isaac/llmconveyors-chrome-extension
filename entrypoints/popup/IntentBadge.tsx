// SPDX-License-Identifier: MIT
/**
 * Intent badge: visual indicator of whether the active tab is a job posting
 * or application form, and which ATS vendor was matched. Renders two states:
 *   - detected: vendor label (greenhouse / lever / workday) + page kind pill
 *   - not detected: neutral "No JD detected" message
 *
 * Consumes a DetectedIntent from useIntent(); `null` or `unknown` kinds both
 * render the not-detected state so the caller never has to branch.
 */

import React from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

export interface IntentBadgeProps {
  readonly intent: DetectedIntent | null;
  readonly loading?: boolean;
}

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
  switch (pageKind) {
    case 'job-posting':
      return 'Job posting';
    case 'application-form':
      return 'Application form';
    default:
      return 'Unknown';
  }
}

export function IntentBadge({ intent, loading = false }: IntentBadgeProps): React.ReactElement {
  if (loading) {
    return (
      <div
        data-testid="intent-badge"
        data-state="loading"
        className="llmc-shimmer mb-3 h-10 rounded-card bg-zinc-100 dark:bg-zinc-800"
        aria-busy="true"
        aria-label="Detecting page intent"
      />
    );
  }

  if (intent === null || intent.kind === 'unknown') {
    return (
      <div
        data-testid="intent-badge"
        data-state="none"
        role="status"
        className="mb-3 rounded-card border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        No JD detected
      </div>
    );
  }

  const vendor = vendorLabel(intent.kind);
  const kind = pageKindLabel(intent.pageKind);

  return (
    <div
      data-testid="intent-badge"
      data-state="detected"
      data-vendor={intent.kind}
      data-page-kind={intent.pageKind}
      className="mb-3 flex items-center justify-between rounded-card border border-brand-500 bg-brand-50 px-3 py-2 dark:border-brand-500 dark:bg-brand-900"
    >
      <span
        data-testid="intent-vendor"
        className="text-xs font-semibold uppercase tracking-wide text-brand-900 dark:text-brand-50"
      >
        {vendor}
      </span>
      <span
        data-testid="intent-page-kind"
        className="rounded-pill bg-white px-2 py-0.5 text-xs font-medium text-brand-900 dark:bg-zinc-900 dark:text-brand-50"
      >
        {kind}
      </span>
    </div>
  );
}
