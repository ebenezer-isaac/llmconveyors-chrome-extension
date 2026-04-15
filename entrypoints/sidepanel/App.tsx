// SPDX-License-Identifier: MIT
/**
 * Sidepanel App: composes the header, JD summary, keyword list, and
 * autofill history into a single column layout that lives alongside
 * the browser tab. The side panel is the "always-on" view; it reacts
 * to tab switches so the user sees state for whatever ATS page is
 * currently active.
 *
 * Contrast with the popup (360x480, transient) which surfaces the
 * single Fill + Highlight affordances. The side panel is a passive
 * dashboard: no buttons that hit the backend, only reads of
 * per-tab state already captured by A8 and A9.
 */

import React from 'react';
import { useAuthState } from '../popup/useAuthState';
import { Header } from '../popup/Header';
import { ErrorBoundary } from '../popup/ErrorBoundary';
import { JdSummary } from './JdSummary';
import { KeywordList } from './KeywordList';
import { AutofillHistory } from './AutofillHistory';
import { useTargetTabId } from './useTargetTabId';
import { useSidepanelIntent } from './useSidepanelIntent';
import { useKeywords } from './useKeywords';
import { useAutofillHistory } from './useAutofillHistory';

function SidepanelBody(): React.ReactElement {
  const { state: authState, loading: authLoading, signOut } = useAuthState();
  const { tabId, loading: tabLoading } = useTargetTabId();
  const { intent, loading: intentLoading } = useSidepanelIntent(tabId);
  const { keywords, loading: keywordsLoading } = useKeywords(tabId);
  const { history, loading: historyLoading } = useAutofillHistory(tabId);

  const signedIn = authState.signedIn;
  const userId = signedIn ? authState.userId : null;

  return (
    <div
      data-testid="sidepanel-root"
      data-tab-id={tabId ?? ''}
      className="flex min-h-screen w-full flex-col bg-white px-4 py-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50"
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

      {!signedIn ? (
        <section
          data-testid="sidepanel-signed-out"
          className="mb-4 rounded-card border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Sign in from the popup to load keyword matches and autofill history.
        </section>
      ) : null}

      <JdSummary intent={intent} loading={intentLoading || tabLoading} />

      <KeywordList keywords={keywords} loading={keywordsLoading} />

      <AutofillHistory history={history} loading={historyLoading} />

      <footer className="mt-auto border-t border-zinc-200 pt-3 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        LLM Conveyors Job Assistant
      </footer>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <SidepanelBody />
    </ErrorBoundary>
  );
}
