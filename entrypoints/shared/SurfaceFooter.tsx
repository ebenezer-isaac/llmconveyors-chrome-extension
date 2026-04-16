// SPDX-License-Identifier: MIT
/**
 * SurfaceFooter -- compact bottom strip with credits balance on the
 * right and a subtle version / brand marker on the left. Used by both
 * popup and sidepanel so the surface fingerprint is identical.
 *
 * Replaces the fat CreditsDisplay pill that used to occupy the top of
 * the popup. The badge here is intentionally small: credits are
 * important but we do not want them to steal attention from the
 * detection card and the Generate CTA.
 */

import React from 'react';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { getTierLabel, formatCredits } from '@/entrypoints/popup/useCredits';
import { t } from '@/src/shared/i18n';

export interface SurfaceFooterProps {
  readonly credits: ClientCreditsSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  /**
   * Hides the credits chip when the user is signed out. Production
   * gates `useCredits` on auth so `credits` is already null in that
   * case, but explicitly accepting the prop makes the contract
   * defensive against test stubs that always return a value.
   */
  readonly signedIn?: boolean;
  /**
   * Optional hook for "Get credits" / "Top up" callback. Rendered as a
   * subdued link on the left when a caller wires it. Absent by default
   * because the popup already surfaces a GetCreditsLink inline when
   * the balance drops to zero.
   */
  readonly onGetCredits?: () => void;
}

function CreditsChip({
  credits,
  loading,
  error,
}: {
  credits: ClientCreditsSnapshot | null;
  loading: boolean;
  error: string | null;
}): React.ReactElement | null {
  // Nothing to show when the user is signed out (credits fetch was
  // skipped). The footer still renders its version marker on the left.
  if (credits === null && !loading && error === null) {
    return null;
  }

  if (loading && credits === null) {
    return (
      <span
        data-testid="credits-remaining"
        data-state="loading"
        aria-busy="true"
        className="llmc-shimmer inline-block h-4 w-20 rounded-pill bg-zinc-100 dark:bg-zinc-800"
      />
    );
  }

  if (error !== null && credits === null) {
    return (
      <span
        data-testid="credits-remaining"
        data-state="error"
        className="text-[10px] text-amber-700 dark:text-amber-400"
      >
        {t('credits_unavailable')}
      </span>
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
    <span
      data-testid="credits-remaining"
      data-state="ready"
      data-balance={String(safeCredits)}
      data-tier={tier}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
      title={tierLabel}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-pill bg-brand-500"
      />
      <span>{t('credits_remaining', [displayCredits])}</span>
    </span>
  );
}

export interface SurfaceFooterPropsWithVersion extends SurfaceFooterProps {
  readonly version?: string;
}

export function SurfaceFooter({
  credits,
  loading,
  error,
  signedIn = true,
  onGetCredits,
  version = '0.1.0',
}: SurfaceFooterPropsWithVersion): React.ReactElement {
  return (
    <footer
      data-testid="popup-footer"
      data-surface="footer"
      className="mt-auto flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
    >
      <span className="inline-flex items-center gap-1">
        <span data-testid="popup-version">v{version}</span>
        {onGetCredits !== undefined ? (
          <>
            <span aria-hidden="true">&middot;</span>
            <button
              type="button"
              data-testid="surface-footer-get-credits"
              onClick={onGetCredits}
              className="text-brand-600 hover:underline dark:text-brand-400"
            >
              Get credits
            </button>
          </>
        ) : null}
      </span>
      {signedIn ? (
        <CreditsChip credits={credits} loading={loading} error={error} />
      ) : null}
    </footer>
  );
}
