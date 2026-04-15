// SPDX-License-Identifier: MIT
// entrypoints/popup/App.tsx
import React from 'react';
import { useAuthState } from './useAuthState';
import { SignInButton } from './SignInButton';
import { SignedInIndicator } from './SignedInIndicator';

export default function App(): React.ReactElement {
  const { state, loading, error, signIn, signOut } = useAuthState();

  return (
    <div className="min-h-[480px] w-[360px] bg-white p-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-500">LLM Conveyors</h1>
        <span className="rounded-card bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          v0.1.0
        </span>
      </header>

      <section className="rounded-card border border-zinc-200 p-3 dark:border-zinc-700">
        {state.signedIn ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              You are ready to auto-fill job applications on Greenhouse, Lever, and Workday.
            </p>
            <SignedInIndicator
              userId={state.userId}
              onSignOut={() => {
                void signOut();
              }}
              signOutDisabled={loading}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Sign in to start auto-filling job applications on Greenhouse, Lever, and Workday.
            </p>
            <SignInButton
              onClick={() => {
                void signIn();
              }}
              disabled={loading}
            />
          </>
        )}

        {error !== null ? (
          <p
            data-testid="auth-error"
            className="mt-3 rounded-card bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900 dark:text-red-100"
          >
            {error}
          </p>
        ) : null}
      </section>

      <footer className="mt-4 text-center text-xs text-zinc-400">
        Powered by llmconveyors.com
      </footer>
    </div>
  );
}
