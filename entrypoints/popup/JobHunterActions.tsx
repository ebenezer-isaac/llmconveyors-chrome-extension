// SPDX-License-Identifier: MIT
/**
 * JobHunterActions - action panel rendered when the active agent is
 * 'job-hunter'. Shows three CTAs:
 *   1. Generate CV + Cover Letter (primary) - enabled when a JD is detected
 *      (either adapter-matched or via the generic scan fallback).
 *   2. Fill application - enabled only when intent.pageKind is
 *      'application-form' AND the ATS kind is a known adapter.
 *   3. Highlight keywords - enabled when a JD is visible on the page.
 *
 * All three disable when credits === 0; a "Get credits" link points the user
 * at the web settings page.
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
  readonly credits: ClientCreditsSnapshot | null;
}

export function JobHunterActions({
  intent,
  tabId,
  tabUrl = null,
  hasGenericJd,
  genericJdText,
  credits,
}: JobHunterActionsProps): React.ReactElement {
  const isJobPosting = intent?.pageKind === 'job-posting' && intent.kind !== 'unknown';
  const isApplicationForm =
    intent?.pageKind === 'application-form' && intent.kind !== 'unknown';
  const jdAvailable = isJobPosting || hasGenericJd;
  const outOfCredits = (credits?.credits ?? 0) <= 0;

  let generateDisabledReason: string | undefined;
  if (outOfCredits) {
    generateDisabledReason = 'You are out of credits';
  } else if (!jdAvailable) {
    generateDisabledReason = 'Open a job description to generate';
  }

  let fillDisabledReason: string | undefined;
  if (outOfCredits) {
    fillDisabledReason = 'You are out of credits';
  } else if (!isApplicationForm) {
    fillDisabledReason = 'Open a supported ATS application form';
  }

  let highlightDisabledReason: string | undefined;
  if (outOfCredits) {
    highlightDisabledReason = 'You are out of credits';
  } else if (!jdAvailable) {
    highlightDisabledReason = 'Open a job posting to highlight keywords';
  }

  const generateJdText =
    genericJdText ?? (isJobPosting ? (intent?.jobTitle ?? '') : '') ?? '';
  const generateCompany = intent?.company ?? undefined;
  const generateTitle = intent?.jobTitle ?? undefined;

  return (
    <section
      data-testid="action-area"
      data-agent="job-hunter"
      className="flex flex-col gap-2 rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <GenerateButton
        agentId="job-hunter"
        disabled={outOfCredits || !jdAvailable}
        disabledReason={generateDisabledReason}
        primaryLabel="Generate CV + Cover Letter"
        payload={{
          kind: 'job-hunter',
          jobDescription: generateJdText,
          companyName: generateCompany,
          jobTitle: generateTitle,
        }}
        tabUrl={tabUrl}
        pageTitle={generateTitle ?? generateCompany ?? null}
      />
      <FillButton
        disabled={outOfCredits || !isApplicationForm}
        disabledReason={fillDisabledReason}
      />
      <HighlightToggle
        tabId={tabId}
        disabled={outOfCredits || !jdAvailable}
        disabledReason={highlightDisabledReason}
      />
      {outOfCredits ? <GetCreditsLink agentId="job-hunter" /> : null}
    </section>
  );
}
