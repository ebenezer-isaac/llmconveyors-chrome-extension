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

import React, { useEffect, useRef, useState } from 'react';
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
import { createLogger } from '@/src/background/log';
import { ThemeRoot } from '@/entrypoints/shared/ThemeRoot';
import { SurfaceHeader } from '@/entrypoints/shared/SurfaceHeader';
import { SurfaceFooter } from '@/entrypoints/shared/SurfaceFooter';

import { useActiveTabUrl } from './useActiveTabUrl';

const log = createLogger('popup:app');

function PopupBody(): React.ReactElement {
  const { state: authState, loading: authLoading, error: authError, signIn, signOut } =
    useAuthState();
  const { intent, tabId, loading: intentLoading } = useIntent();
  const {
    credits,
    loading: creditsLoading,
    error: creditsError,
    refresh: refreshCredits,
  } = useCredits();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
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
    tabUrl,
    adapterIntent: intent,
    agentId: activeAgentId,
  });

  useEffect(() => {
    if (!signedIn) return;
    void refreshCredits();
    void refreshProfile();
  }, [signedIn, userId, refreshCredits, refreshProfile]);

  // Check if a URL-bound session exists for this page.
  const [boundSessionTitle, setBoundSessionTitle] = useState<string | null>(null);
  const lastBindingLookupRef = useRef<string>('');
  useEffect(() => {
    if (!signedIn || activeAgentId === null || tabUrl === null) {
      setBoundSessionTitle(null);
      if (!signedIn) {
        lastBindingLookupRef.current = '';
      }
      return;
    }
    if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) {
      setBoundSessionTitle(null);
      return;
    }
    const lookupKey = `${activeAgentId}:${tabUrl}:${userId ?? ''}`;
    if (lastBindingLookupRef.current === lookupKey) return;

    const runtime = (globalThis as unknown as {
      chrome?: { runtime?: { sendMessage: (m: unknown) => Promise<unknown> } };
    }).chrome?.runtime;
    if (!runtime) {
      setBoundSessionTitle(null);
      return;
    }
    lastBindingLookupRef.current = lookupKey;
    let cancelled = false;
    void (async () => {
      try {
        const binding = await runtime.sendMessage({
          key: 'SESSION_BINDING_GET',
          data: { url: tabUrl, agentId: activeAgentId },
        });
        if (cancelled) return;

        if (binding !== null && typeof binding === 'object') {
          const b = binding as { pageTitle?: string; sessionId?: string };
          const title = b.pageTitle ?? b.sessionId?.slice(0, 8) ?? 'Session';
          setBoundSessionTitle(title);
          log.info('SESSION_BINDING_GET: found bound session for tab', {
            tabUrl,
            agentId: activeAgentId,
            sessionId: b.sessionId,
          });
        } else {
          setBoundSessionTitle(null);
          log.info('SESSION_BINDING_GET: no bound session for tab', {
            tabUrl,
            agentId: activeAgentId,
          });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setBoundSessionTitle(null);
        log.warn('SESSION_BINDING_GET: lookup failed', {
          error: err instanceof Error ? err.message : String(err),
          tabUrl,
          agentId: activeAgentId,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId, activeAgentId, tabUrl]);

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
        profileLoading={profileLoading}
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
            genericCompany={genericIntent.company}
            genericJobTitle={genericIntent.jobTitle}
            credits={credits}
            boundSessionTitle={boundSessionTitle}
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
          <SessionList
            enabled={signedIn}
            userId={userId}
            activeAgentId={activeAgentId}
          />
        ) : null}

        {authError !== null ? (
          <div
            data-testid="auth-error"
            className="flex items-start gap-2 rounded-card bg-red-50 px-3 py-2 dark:bg-red-900"
          >
            <p className="flex-1 text-xs text-red-800 dark:text-red-100">
              {authError}
            </p>
            <button
              type="button"
              data-testid="auth-retry"
              onClick={() => {
                void signIn();
              }}
              disabled={authLoading}
              className="shrink-0 text-xs font-medium text-red-700 underline hover:text-red-900 disabled:opacity-50 dark:text-red-200 dark:hover:text-red-50"
            >
              Retry
            </button>
          </div>
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
