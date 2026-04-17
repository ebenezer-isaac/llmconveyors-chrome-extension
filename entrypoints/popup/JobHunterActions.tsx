// SPDX-License-Identifier: MIT
/**
 * JobHunterActions - action panel rendered when the active agent is
 * 'job-hunter'. Shows up to three CTAs:
 *   1. Generate CV + Cover Letter (primary) - enabled when a JD is detected
 *      (either adapter-matched or via the generic scan fallback).
 *   2. Fill application - rendered only when intent.pageKind is
 *      'application-form' AND the ATS kind is a known adapter. Hidden on
 *      plain job pages because Fill depends on a prior generation session.
 *   3. Highlight keywords - enabled when a JD is visible on the page. No
 *      credit gate because highlighting runs entirely client-side.
 *
 * Credits are NOT used to disable Generate in the popup. The backend is the
 * authoritative gate and returns a credit error which is surfaced inline.
 * The popup only surfaces a "Get credits" chip when the balance is zero.
 */

import React from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { FillButton } from './FillButton';
import { HighlightToggle } from './HighlightToggle';
import { GenerateButton } from './GenerateButton';
import { GetCreditsLink } from './GetCreditsLink';

export interface JobHunterActionsProps {
  readonly intent: DetectedIntent | null;
  readonly tabId: number | null;
  readonly tabUrl?: string | null;
  readonly hasGenericJd: boolean;
  readonly genericJdText: string | null;
  readonly genericCompany: string | null;
  readonly genericJobTitle: string | null;
  readonly credits: ClientCreditsSnapshot | null;
}

export function JobHunterActions({
  intent,
  tabId,
  tabUrl = null,
  hasGenericJd,
  genericJdText,
  genericCompany,
  genericJobTitle,
  credits,
}: JobHunterActionsProps): React.ReactElement {
  const isJobPosting = intent?.pageKind === 'job-posting' && intent.kind !== 'unknown';
  const isApplicationForm =
    intent?.pageKind === 'application-form' && intent.kind !== 'unknown';
  const jdAvailable = isJobPosting || hasGenericJd;
  const outOfCredits = (credits?.credits ?? 0) <= 0;

  const generateDisabledReason: string | undefined = jdAvailable
    ? undefined
    : 'Open a job description to generate';
  const highlightDisabledReason: string | undefined = jdAvailable
    ? undefined
    : 'Open a job posting to highlight keywords';

  const generateJdText =
    genericJdText ?? (isJobPosting ? (intent?.jobTitle ?? '') : '') ?? '';
  // Prefer adapter-detected values, fall back to generic intent scan
  const generateCompany = intent?.company ?? genericCompany ?? undefined;
  const generateTitle = intent?.jobTitle ?? genericJobTitle ?? undefined;

  // Derive companyWebsite from the current tab URL (best-effort origin)
  let companyWebsite: string | undefined;
  if (typeof tabUrl === 'string' && tabUrl.length > 0) {
    try {
      const origin = new URL(tabUrl).origin;
      if (origin !== 'null') companyWebsite = origin;
    } catch {
      // invalid URL; leave undefined
    }
  }

  return (
    <section
      data-testid="action-area"
      data-agent="job-hunter"
      className="flex flex-col gap-2 rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <GenerateButton
        agentId="job-hunter"
        disabled={!jdAvailable}
        disabledReason={generateDisabledReason}
        primaryLabel="Generate CV + Cover Letter"
        payload={{
          kind: 'job-hunter',
          jobDescription: generateJdText,
          companyName: generateCompany,
          jobTitle: generateTitle,
          companyWebsite,
        }}
        tabUrl={tabUrl}
        pageTitle={generateTitle ?? generateCompany ?? null}
      />
      {isApplicationForm ? (
        <FillButton
          disabled={false}
          disabledReason={undefined}
        />
      ) : null}
      <HighlightToggle
        tabId={tabId}
        disabled={!jdAvailable}
        disabledReason={highlightDisabledReason}
      />
      {outOfCredits ? <GetCreditsLink agentId="job-hunter" /> : null}
    </section>
  );
}
