// SPDX-License-Identifier: MIT
/**
 * Popup header: brand mark, signed-in email label, and sign-out affordance.
 * Rendered in both signed-out and signed-in states; when signed out the
 * sign-out slot collapses so the logo stays centered.
 */

import React from 'react';

export interface HeaderProps {
  readonly userId: string | null;
  readonly onSignOut?: () => void;
  readonly signOutDisabled?: boolean;
}

export function Header({
  userId,
  onSignOut,
  signOutDisabled = false,
}: HeaderProps): React.ReactElement {
  return (
    <header
      data-testid="popup-header"
      className="mb-3 flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-700"
    >
      <div className="flex items-center gap-2">
        <div
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-card bg-brand-500 text-xs font-bold text-white"
        >
          LC
        </div>
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          LLM Conveyors
        </h1>
      </div>

      {userId !== null && onSignOut !== undefined ? (
        <div className="flex items-center gap-2">
          <span
            data-testid="popup-user-id"
            title={userId}
            className="max-w-[140px] truncate text-xs text-zinc-500 dark:text-zinc-400"
          >
            {userId}
          </span>
          <button
            type="button"
            data-testid="sign-out-button"
            aria-label="Sign out"
            onClick={onSignOut}
            disabled={signOutDisabled}
            className="rounded-card border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}
