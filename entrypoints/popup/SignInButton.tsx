// SPDX-License-Identifier: MIT
import React from 'react';

export interface SignInButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function SignInButton({ onClick, disabled = false }: SignInButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      data-testid="sign-in-button"
      onClick={onClick}
      disabled={disabled}
      className="mt-3 w-full rounded-card bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Sign in
    </button>
  );
}
