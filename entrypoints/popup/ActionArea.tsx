// SPDX-License-Identifier: MIT
/**
 * ActionArea: composes the primary autofill button with the highlight toggle
 * for the popup body. Both actions are gated by auth state and the detected
 * intent on the active tab; this component owns the enable/disable logic so
 * the individual buttons remain presentational.
 */

import React from 'react';
import { FillButton } from './FillButton';
import { HighlightToggle } from './HighlightToggle';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

export interface ActionAreaProps {
  readonly signedIn: boolean;
  readonly intent: DetectedIntent | null;
  readonly tabId: number | null;
}

export function ActionArea({ signedIn, intent, tabId }: ActionAreaProps): React.ReactElement {
  const isJobPosting = intent?.pageKind === 'job-posting' && intent.kind !== 'unknown';
  const isApplicationForm =
    intent?.pageKind === 'application-form' && intent.kind !== 'unknown';

  const canFill = signedIn && (isJobPosting || isApplicationForm);
  const canHighlight = signedIn && isJobPosting;

  let highlightDisabledReason: string | undefined;
  if (!signedIn) {
    highlightDisabledReason = 'Sign in for keyword highlighting';
  } else if (!isJobPosting) {
    highlightDisabledReason = 'Open a job posting to highlight keywords';
  }

  let fillDisabledReason: string | undefined;
  if (!signedIn) {
    fillDisabledReason = 'Sign in to fill applications';
  } else if (!isApplicationForm && !isJobPosting) {
    fillDisabledReason = 'Open a supported ATS page to autofill';
  }

  return (
    <section
      data-testid="action-area"
      className="flex flex-col gap-2 rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <FillButton disabled={!canFill} disabledReason={fillDisabledReason} />
      <HighlightToggle
        tabId={tabId}
        disabled={!canHighlight}
        disabledReason={highlightDisabledReason}
      />
    </section>
  );
}
