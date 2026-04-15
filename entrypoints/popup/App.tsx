// SPDX-License-Identifier: MIT
// entrypoints/popup/App.tsx
/**
 * Popup root. Post 101.5 pivot.
 *
 * Composes: LLMC branded header + agent switcher, intent badge, credits
 * widget, agent-aware action area (fill + highlight), footer with links
 * into the side panel / settings. All data comes from hooks; the App is
 * responsible only for layout and wiring.
 */

import React from 'react';
import { useAuthState } from './useAuthState';
import { useIntent } from './useIntent';
import { useCredits } from './useCredits';
import { useAgentPreference } from './useAgentPreference';
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
  const {
    agents,
    activeAgentId,
    setActiveAgent,
    loading: agentsLoading,
  } = useAgentPreference();

  const signedIn = authState.signedIn;
  const userId = authState.signedIn ? authState.userId : null;

  return (
    <div
      data-testid="popup-root"
      className="flex min-h-[480px] w-[360px] flex-col bg-white p-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50"
    >
      <Header
        userId={userId}
        agents={agents}
        activeAgentId={activeAgentId}
        onAgentChange={(id) => {
          void setActiveAgent(id);
        }}
        agentsDisabled={agentsLoading}
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
            Sign in to auto-fill applications and run agents from llmconveyors.com.
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
