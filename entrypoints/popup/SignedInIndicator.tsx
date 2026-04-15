// SPDX-License-Identifier: MIT
import React from 'react';

export interface SignedInIndicatorProps {
  readonly userId: string;
  readonly onSignOut: () => void;
  readonly signOutDisabled?: boolean;
}

export function SignedInIndicator({
  userId,
  onSignOut,
  signOutDisabled = false,
}: SignedInIndicatorProps): React.ReactElement {
  return (
    <div className="mt-3 space-y-3">
      <div
        data-testid="signed-in-indicator"
        className="rounded-card border border-brand-500 bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:border-brand-500 dark:bg-brand-900 dark:text-brand-50"
      >
        Signed in as <span className="font-medium">{userId}</span>
      </div>
      <button
        type="button"
        data-testid="sign-out-button"
        onClick={onSignOut}
        disabled={signOutDisabled}
        className="w-full rounded-card border border-zinc-300 bg-white py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        Sign out
      </button>
    </div>
  );
}
