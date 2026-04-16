// SPDX-License-Identifier: MIT
/**
 * Spinner -- inline loading indicator used across the sidepanel for
 * session hydration, artifact body lazy-fetch, and PDF preview load.
 *
 * Tailwind's `animate-spin` utility drives the rotation. Size is
 * width-/height-agnostic (scales with font size) when `inline` is true.
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
        className={`${SIZE_CLASS[size]} inline-block animate-spin rounded-full border-zinc-300 border-t-brand-500 dark:border-zinc-700 dark:border-t-brand-400`}
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading...</span>}
    </span>
  );
}
