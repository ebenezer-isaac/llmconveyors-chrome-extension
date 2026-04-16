// SPDX-License-Identifier: MIT
/**
 * Spinner -- shared loading indicator used by popup and sidepanel.
 *
 * Zinc-on-zinc palette mirrors the web app's LoadingSpinner
 * (src/components/shared/LoadingSpinner.tsx). The animated top edge uses
 * zinc-900 in light mode and zinc-100 in dark mode so the spinner is
 * readable on both background and muted surfaces without pulling in a
 * brand accent that would clash with agent-level theming.
 */

import React from 'react';

export interface SpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly label?: string;
  /** Render inline with flowing text rather than as a centered block. */
  readonly inline?: boolean;
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-3 w-3 border',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-2',
};

export function Spinner({
  size = 'md',
  label,
  inline = false,
}: SpinnerProps): React.ReactElement {
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="spinner"
      className={
        inline
          ? 'inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400'
          : 'flex items-center justify-center gap-2 p-3 text-xs text-zinc-500 dark:text-zinc-400'
      }
    >
      <span
        aria-hidden="true"
        className={`${SIZE_CLASS[size]} inline-block animate-spin rounded-full border-zinc-200 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100`}
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading...</span>}
    </span>
  );
}
