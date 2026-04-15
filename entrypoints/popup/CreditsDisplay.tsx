// SPDX-License-Identifier: MIT
/**
 * Credits display: renders the user's remaining credit balance.
 *
 * Visual states:
 *   - loading: shimmer placeholder
 *   - ready: "N credits remaining" with the integer balance
 *   - error: compact inline error that does not block other popup UI
 *
 * The component is a presentational stub; the data comes from the useCredits
 * hook in the parent App tree.
 */

import React from 'react';
import type { CreditsState } from '@/src/background/messaging/protocol';

export interface CreditsDisplayProps {
  readonly credits: CreditsState | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function CreditsDisplay({
  credits,
  loading,
  error,
}: CreditsDisplayProps): React.ReactElement {
  if (loading && credits === null) {
    return (
      <div
        data-testid="credits-remaining"
        data-state="loading"
        aria-busy="true"
        aria-label="Loading credit balance"
        className="llmc-shimmer mb-3 h-8 w-32 rounded-card bg-zinc-100 dark:bg-zinc-800"
      />
    );
  }

  if (error !== null && credits === null) {
    return (
      <div
        data-testid="credits-remaining"
        data-state="error"
        role="status"
        className="mb-3 rounded-card bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100"
      >
        Credits unavailable
      </div>
    );
  }

  const balance = credits?.balance ?? 0;
  const displayBalance = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;

  return (
    <div
      data-testid="credits-remaining"
      data-state="ready"
      data-balance={String(displayBalance)}
      className="mb-3 inline-flex items-center gap-1.5 rounded-pill bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-pill bg-brand-500"
      />
      <span>{displayBalance} credits remaining</span>
    </div>
  );
}
