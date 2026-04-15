// SPDX-License-Identifier: MIT
/**
 * Options page (post-pivot).
 *
 * We cannot iframe the web app's settings surface: the Comet / Chrome 3rd-party
 * cookie policy blocks the SuperTokens session cookie inside a cross-origin
 * iframe, so the page redirects to login and Google OAuth refuses to be
 * embedded (X-Frame-Options: DENY). Instead, we redirect the tab directly
 * to the web settings URL so cookies flow top-level and OAuth succeeds.
 */

import React, { useEffect, useMemo } from 'react';
import { useAgentPreference } from '../popup/useAgentPreference';

const ROOT_DOMAIN = 'llmconveyors.com';

function buildSettingsUrl(subdomain: string | null): string {
  return subdomain
    ? `https://${subdomain}.${ROOT_DOMAIN}/en/settings`
    : `https://${ROOT_DOMAIN}/en/settings`;
}

export default function App(): React.ReactElement {
  const { agents, activeAgentId, loading } = useAgentPreference();

  const settingsUrl = useMemo(() => {
    const active = agents.find((a) => a.id === activeAgentId) ?? agents[0];
    return buildSettingsUrl(active?.subdomain ?? null);
  }, [agents, activeAgentId]);

  useEffect(() => {
    if (loading) return;
    window.location.replace(settingsUrl);
  }, [loading, settingsUrl]);

  return (
    <div
      data-testid="options-root"
      className="flex min-h-screen w-full items-center justify-center bg-white text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
    >
      <div className="text-center">
        <p>Opening LLM Conveyors settings...</p>
        <p className="mt-2 text-xs">
          If the page does not load,{' '}
          <a
            href={settingsUrl}
            className="text-brand-500 underline"
            target="_top"
          >
            click here
          </a>
          .
        </p>
      </div>
    </div>
  );
}
