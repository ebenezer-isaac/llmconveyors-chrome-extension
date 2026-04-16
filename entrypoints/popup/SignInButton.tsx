// SPDX-License-Identifier: MIT
import React from 'react';
import { t } from '@/src/shared/i18n';

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
      className="mt-3 w-full rounded-card bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {t('signIn_buttonLabel')}
    </button>
  );
}
