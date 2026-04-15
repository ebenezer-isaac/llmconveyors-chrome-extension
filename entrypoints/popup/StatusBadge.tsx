// SPDX-License-Identifier: MIT
/**
 * StatusBadge -- unified detection indicator for the popup. Replaces the
 * previous pairing of adapter-level `IntentBadge` + the generic-JD fallback
 * pill rendered inline inside `App.tsx`, both of which could render side by
 * side and contradict each other ("No JD detected" next to "Job detected
 * (jsonld)").
 *
 * One element, four logical states, agent-aware copy:
 *   - loading  : shimmer while both the adapter and generic scans are in
 *                flight with no result yet.
 *   - detected : adapter matched a known ATS. Solid branded badge with
 *                vendor + page kind pill.
 *   - generic  : adapter missed but generic JSON-LD / readability found
 *                a job description (or a company page for b2b-sales).
 *                Same solid branded look, vendor="Generic".
 *   - none     : nothing detected. Dashed neutral badge with copy that
 *                matches the active agent (job page vs company page).
 *
 * `computeStatus()` is exported separately so tests can assert on the
 * selected status without rendering.
 */

import React from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import type { AgentId } from '@/src/background/agents';

export type StatusKind = 'loading' | 'detected' | 'generic' | 'none';

export interface StatusBadgeProps {
  readonly adapterIntent: DetectedIntent | null;
  readonly genericJd: {
    readonly hasJd: boolean;
    readonly method: string | null;
  };
  readonly agentId: AgentId | null;
  readonly loading: boolean;
}

export interface ComputedStatus {
  readonly kind: StatusKind;
  readonly vendor: string | null;
  readonly pageKind: string | null;
  readonly method: string | null;
}

function adapterMatched(intent: DetectedIntent | null): intent is DetectedIntent {
  return intent !== null && intent.kind !== 'unknown';
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

function pageKindLabel(
  pageKind: DetectedIntent['pageKind'],
  agentId: AgentId | null,
): string {
  if (agentId === 'b2b-sales') {
    return pageKind === 'application-form' ? 'Contact form' : 'Company page';
  }
  switch (pageKind) {
    case 'job-posting':
      return 'Job posting';
    case 'application-form':
      return 'Application form';
    default:
      return 'Unknown';
  }
}

function emptyLabel(agentId: AgentId | null): string {
  return agentId === 'b2b-sales'
    ? 'No company page detected'
    : 'No JD detected';
}

function genericPageKindLabel(
  method: string | null,
  agentId: AgentId | null,
): string {
  const suffix = method ?? 'unknown';
  return agentId === 'b2b-sales'
    ? `Company page detected (${suffix})`
    : `Job detected (${suffix})`;
}

export function computeStatus(
  adapterIntent: DetectedIntent | null,
  genericJd: { readonly hasJd: boolean; readonly method: string | null },
  agentId: AgentId | null,
  loading: boolean,
): ComputedStatus {
  if (adapterMatched(adapterIntent)) {
    return {
      kind: 'detected',
      vendor: vendorLabel(adapterIntent.kind),
      pageKind: pageKindLabel(adapterIntent.pageKind, agentId),
      method: null,
    };
  }
  if (genericJd.hasJd) {
    return {
      kind: 'generic',
      vendor: 'Generic',
      pageKind: genericPageKindLabel(genericJd.method, agentId),
      method: genericJd.method,
    };
  }
  if (loading) {
    return { kind: 'loading', vendor: null, pageKind: null, method: null };
  }
  return {
    kind: 'none',
    vendor: null,
    pageKind: emptyLabel(agentId),
    method: null,
  };
}

export function StatusBadge({
  adapterIntent,
  genericJd,
  agentId,
  loading,
}: StatusBadgeProps): React.ReactElement {
  const status = computeStatus(adapterIntent, genericJd, agentId, loading);

  if (status.kind === 'loading') {
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

  if (status.kind === 'none') {
    return (
      <div
        data-testid="intent-badge"
        data-state="none"
        role="status"
        className="mb-3 rounded-card border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {status.pageKind}
      </div>
    );
  }

  const vendorAttr =
    status.kind === 'detected' && adapterIntent !== null
      ? adapterIntent.kind
      : 'generic';
  const pageKindAttr =
    status.kind === 'detected' && adapterIntent !== null
      ? adapterIntent.pageKind
      : agentId === 'b2b-sales'
        ? 'company-page'
        : 'job-posting';

  return (
    <div
      data-testid="intent-badge"
      data-state="detected"
      data-vendor={vendorAttr}
      data-page-kind={pageKindAttr}
      data-method={status.method ?? ''}
      className="mb-3 flex items-center justify-between rounded-card border border-brand-500 bg-brand-50 px-3 py-2 dark:border-brand-500 dark:bg-brand-900"
    >
      <span
        data-testid="intent-vendor"
        className="text-xs font-semibold uppercase tracking-wide text-brand-900 dark:text-brand-50"
      >
        {status.vendor}
      </span>
      <span
        data-testid="intent-page-kind"
        className="rounded-pill bg-white px-2 py-0.5 text-xs font-medium text-brand-900 dark:bg-zinc-900 dark:text-brand-50"
      >
        {status.pageKind}
      </span>
    </div>
  );
}
