// SPDX-License-Identifier: MIT
/**
 * Credits display: renders the user's remaining credit balance and tier
 * inline at the top of the popup, mirroring the web UserMenu's "X credits"
 * + tier label style.
 *
 * Visual states:
 *   - loading: shimmer placeholder
 *   - ready: "N credits" badge + tier label
 *   - error: compact inline error that does not block other popup UI
 *
 * The component is a presentational stub; the data comes from the useCredits
 * hook in the parent App tree.
 */

import React from 'react';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { t } from '@/src/shared/i18n';
import { getTierLabel, formatCredits } from './useCredits';

export interface CreditsDisplayProps {
  readonly credits: ClientCreditsSnapshot | null;
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
        aria-label={t('credits_loading')}
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
        {t('credits_unavailable')}
      </div>
    );
  }

  const rawCredits = credits?.credits ?? 0;
  const safeCredits =
    Number.isFinite(rawCredits) && rawCredits > 0 ? Math.floor(rawCredits) : 0;
  const displayCredits = formatCredits(safeCredits);
  const tier = credits?.tier ?? 'free';
  const byoKeyEnabled = credits?.byoKeyEnabled ?? false;
  const tierLabel = getTierLabel(tier, byoKeyEnabled);

  return (
    <div
      data-testid="credits-remaining"
      data-state="ready"
      data-balance={String(safeCredits)}
      data-tier={tier}
      className="mb-3 inline-flex items-center gap-2 rounded-pill bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-pill bg-brand-500"
      />
      <span>{t('credits_remaining', [displayCredits])}</span>
      <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
        {tierLabel}
      </span>
    </div>
  );
}
