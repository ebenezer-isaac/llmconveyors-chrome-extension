// SPDX-License-Identifier: MIT
/**
 * SurfaceFooter -- compact bottom strip with a tier pill on the right
 * and a version / brand marker on the left. Used by both popup and
 * sidepanel so the surface fingerprint is identical.
 *
 * Credits count lives in the UserMenu dropdown now -- it was previously
 * duplicated here as "N credits remaining" AND in the dropdown under
 * Usage, which made the footer noisy and redundant. The footer pill
 * shows only the tier (Free / BYO Key) so users can tell at a glance
 * whether they're burning the free allotment or billing their own
 * provider key without having to open the dropdown.
 */

import React from 'react';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { getTierLabel } from '@/entrypoints/popup/useCredits';
import { Spinner } from './Spinner';

export interface SurfaceFooterProps {
  readonly credits: ClientCreditsSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  /**
   * Hides the tier pill when the user is signed out. Production gates
   * `useCredits` on auth so `credits` is already null in that case, but
   * the prop keeps the contract explicit for test stubs.
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

function TierPill({
  credits,
  loading,
  error,
}: {
  credits: ClientCreditsSnapshot | null;
  loading: boolean;
  error: string | null;
}): React.ReactElement | null {
  if (credits === null && !loading && error === null) return null;

  if (loading && credits === null) {
    return (
      <span
        data-testid="tier-pill"
        data-state="loading"
        aria-busy="true"
        className="inline-flex items-center"
      >
        <Spinner size="sm" inline />
      </span>
    );
  }

  if (error !== null && credits === null) {
    return (
      <span
        data-testid="tier-pill"
        data-state="error"
        className="inline-flex items-center rounded-pill border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      >
        Tier unavailable
      </span>
    );
  }

  const tier = credits?.tier ?? 'free';
  const byoKeyEnabled = credits?.byoKeyEnabled ?? false;
  const isByo = byoKeyEnabled || tier === 'byo';
  const label = getTierLabel(tier, byoKeyEnabled);
  const classes = isByo
    ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
    : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

  return (
    <span
      data-testid="tier-pill"
      data-state="ready"
      data-tier={isByo ? 'byo' : 'free'}
      className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}
      title={label}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-pill ${
          isByo
            ? 'bg-purple-500 dark:bg-purple-300'
            : 'bg-zinc-400 dark:bg-zinc-500'
        }`}
      />
      {label}
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
      className="mt-auto flex shrink-0 items-center justify-between border-t border-zinc-200 bg-white px-3 py-1.5 text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
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
              className="text-zinc-700 hover:underline dark:text-zinc-300"
            >
              Get credits
            </button>
          </>
        ) : null}
      </span>
      {signedIn ? (
        <TierPill credits={credits} loading={loading} error={error} />
      ) : null}
    </footer>
  );
}
