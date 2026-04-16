// SPDX-License-Identifier: MIT
// entrypoints/popup/App.tsx
/**
 * Popup root. Post commits 1-4.
 *
 * Layout:
 *   Header (agent switcher + user)
 *   StatusBadge (unified adapter + generic-JD / company-page detector)
 *   CreditsDisplay (signed in only)
 *   ActionArea (agent-aware; includes generic JD fallback for job-hunter
 *   and company-page heuristics for b2b-sales)
 *   SessionList (signed in only)
 *   Footer
 */

import React from 'react';
import { useAuthState } from './useAuthState';
import { useIntent } from './useIntent';
import { useCredits } from './useCredits';
import { useProfile } from './useProfile';
import { useAgentPreference } from './useAgentPreference';
import { useGenericIntent } from './useGenericIntent';
import { SignInButton } from './SignInButton';
import { ActionArea } from './ActionArea';
import { StatusBadge } from './StatusBadge';
import { SessionList } from './SessionList';
import { ErrorBoundary } from './ErrorBoundary';
import { ThemeRoot } from '@/entrypoints/shared/ThemeRoot';
import { SurfaceHeader } from '@/entrypoints/shared/SurfaceHeader';
import { SurfaceFooter } from '@/entrypoints/shared/SurfaceFooter';

import { useActiveTabUrl } from './useActiveTabUrl';

function PopupBody(): React.ReactElement {
  const { state: authState, loading: authLoading, error: authError, signIn, signOut } =
    useAuthState();
  const { intent, tabId, loading: intentLoading } = useIntent();
  const { credits, loading: creditsLoading, error: creditsError } = useCredits();
  const { profile } = useProfile();
  const {
    agents,
    activeAgentId,
    setActiveAgent,
    loading: agentsLoading,
  } = useAgentPreference();

  const signedIn = authState.signedIn;
  const userId = authState.signedIn ? authState.userId : null;
  const tabUrl = useActiveTabUrl(tabId);

  const genericIntent = useGenericIntent({
    enabled: signedIn && activeAgentId !== null,
    tabId,
    adapterIntent: intent,
    agentId: activeAgentId,
  });

  return (
    <div
      data-testid="popup-root"
      className="flex min-h-[480px] w-[360px] flex-col bg-white text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50"
    >
      <SurfaceHeader
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
        credits={credits}
        profile={profile}
      />

      <div className="flex flex-1 flex-col gap-3 p-3">
        <StatusBadge
          adapterIntent={intent}
          genericJd={{
            hasJd: genericIntent.hasJd,
            method: genericIntent.method,
            jobTitle: genericIntent.jobTitle,
            company: genericIntent.company,
          }}
          agentId={activeAgentId}
          loading={intentLoading && intent === null && !genericIntent.hasJd}
        />

        {signedIn ? (
          <ActionArea
            signedIn={signedIn}
            intent={intent}
            tabId={tabId}
            tabUrl={tabUrl}
            activeAgentId={activeAgentId}
            hasGenericJd={genericIntent.hasJd}
            genericJdText={genericIntent.jdText}
            credits={credits}
          />
        ) : (
          <section
            data-testid="signed-out-panel"
            className="rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {activeAgentId === 'b2b-sales'
                ? 'Sign in to research companies and run B2B sales outreach from llmconveyors.com.'
                : 'Sign in to auto-fill job applications and run agents from llmconveyors.com.'}
            </p>
            <SignInButton
              onClick={() => {
                void signIn();
              }}
              disabled={authLoading}
            />
          </section>
        )}

        {signedIn ? (
          <SessionList enabled={signedIn} activeAgentId={activeAgentId} />
        ) : null}

        {authError !== null ? (
          <p
            data-testid="auth-error"
            className="rounded-card bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900 dark:text-red-100"
          >
            {authError}
          </p>
        ) : null}
      </div>

      <SurfaceFooter
        credits={credits}
        loading={creditsLoading}
        error={creditsError}
        signedIn={signedIn}
      />
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <ThemeRoot>
        <PopupBody />
      </ThemeRoot>
    </ErrorBoundary>
  );
}
