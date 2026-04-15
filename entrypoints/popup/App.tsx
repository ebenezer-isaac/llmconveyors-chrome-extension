// SPDX-License-Identifier: MIT
// entrypoints/popup/App.tsx
/**
 * Popup root. Composes the header, intent badge, credits display, action
 * area (fill + highlight), and footer into the 360x480 popup surface. All
 * data comes from hooks (useAuthState, useIntent, useCredits); the App
 * component is responsible only for layout and for translating auth/intent
 * state into enable/disable props for the action buttons.
 *
 * A root ErrorBoundary wraps the tree so a render-time crash in any hook or
 * component collapses to a single inline banner rather than a blank popup.
 */

import React from 'react';
import { useAuthState } from './useAuthState';
import { useIntent } from './useIntent';
import { useCredits } from './useCredits';
import { SignInButton } from './SignInButton';
import { ActionArea } from './ActionArea';
import { Header } from './Header';
import { IntentBadge } from './IntentBadge';
import { CreditsDisplay } from './CreditsDisplay';
import { Footer } from './Footer';
import { ErrorBoundary } from './ErrorBoundary';

function PopupBody(): React.ReactElement {
  const { state: authState, loading: authLoading, error: authError, signIn, signOut } =
    useAuthState();
  const { intent, tabId, loading: intentLoading } = useIntent();
  const { credits, loading: creditsLoading, error: creditsError } = useCredits();

  const signedIn = authState.signedIn;
  const userId = authState.signedIn ? authState.userId : null;

  return (
    <div
      data-testid="popup-root"
      className="flex min-h-[480px] w-[360px] flex-col bg-white p-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50"
    >
      <Header
        userId={userId}
        onSignOut={
          signedIn
            ? () => {
                void signOut();
              }
            : undefined
        }
        signOutDisabled={authLoading}
      />

      <IntentBadge intent={intent} loading={intentLoading && intent === null} />

      {signedIn ? (
        <CreditsDisplay
          credits={credits}
          loading={creditsLoading}
          error={creditsError}
        />
      ) : null}

      {signedIn ? (
        <ActionArea signedIn={signedIn} intent={intent} tabId={tabId} />
      ) : (
        <section
          data-testid="signed-out-panel"
          className="rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Sign in to auto-fill job applications on Greenhouse, Lever, and Workday.
          </p>
          <SignInButton
            onClick={() => {
              void signIn();
            }}
            disabled={authLoading}
          />
        </section>
      )}

      {authError !== null ? (
        <p
          data-testid="auth-error"
          className="mt-3 rounded-card bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900 dark:text-red-100"
        >
          {authError}
        </p>
      ) : null}

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <PopupBody />
    </ErrorBoundary>
  );
}
