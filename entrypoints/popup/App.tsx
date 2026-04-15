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

import React, { useEffect, useState } from 'react';
import { useAuthState } from './useAuthState';
import { useIntent } from './useIntent';
import { useCredits } from './useCredits';
import { useProfile } from './useProfile';
import { useAgentPreference } from './useAgentPreference';
import { useGenericIntent } from './useGenericIntent';
import { SignInButton } from './SignInButton';
import { ActionArea } from './ActionArea';
import { Header } from './Header';
import { StatusBadge } from './StatusBadge';
import { CreditsDisplay } from './CreditsDisplay';
import { SessionList } from './SessionList';
import { Footer } from './Footer';
import { ErrorBoundary } from './ErrorBoundary';

function useActiveTabUrl(tabId: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (tabId === null) {
      setUrl(null);
      return;
    }
    const g = globalThis as unknown as {
      chrome?: {
        tabs?: {
          get: (id: number, cb: (tab: { url?: string } | undefined) => void) => void;
        };
      };
    };
    const tabs = g.chrome?.tabs;
    if (!tabs || typeof tabs.get !== 'function') {
      setUrl(null);
      return;
    }
    try {
      tabs.get(tabId, (tab) => setUrl(tab?.url ?? null));
    } catch {
      setUrl(null);
    }
  }, [tabId]);
  return url;
}

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
        credits={credits}
        profile={profile}
      />

      <StatusBadge
        adapterIntent={intent}
        genericJd={{ hasJd: genericIntent.hasJd, method: genericIntent.method }}
        agentId={activeAgentId}
        loading={
          intentLoading && intent === null && !genericIntent.hasJd
        }
      />


      {signedIn ? (
        <CreditsDisplay
          credits={credits}
          loading={creditsLoading}
          error={creditsError}
        />
      ) : null}

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

      {signedIn ? <SessionList enabled={signedIn} /> : null}

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
