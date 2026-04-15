// SPDX-License-Identifier: MIT
/**
 * Options page root (post-101.5 pivot).
 *
 * The extension options page embeds the llmconveyors.com settings surface
 * directly inside an iframe so the UI is always in sync with the web app.
 * When no active agent has been chosen we fall back to the root settings
 * URL; otherwise we deep-link into the agent's settings.
 */

import React, { useMemo, useState } from 'react';
import { useAgentPreference } from '../popup/useAgentPreference';

const ROOT_DOMAIN = 'llmconveyors.com';

function buildSettingsUrl(
  subdomain: string | null,
  reloadKey: number,
): string {
  const base = subdomain
    ? `https://${subdomain}.${ROOT_DOMAIN}/en/settings`
    : `https://${ROOT_DOMAIN}/en/settings`;
  const params = new URLSearchParams();
  params.set('embed', 'extension');
  params.set('cb', String(reloadKey));
  return `${base}?${params.toString()}`;
}

export default function App(): React.ReactElement {
  const { agents, activeAgentId, loading, error } = useAgentPreference();
  const [reloadKey, setReloadKey] = useState(0);

  const subdomain = useMemo(() => {
    const active = agents.find((a) => a.id === activeAgentId) ?? agents[0];
    return active?.subdomain ?? null;
  }, [agents, activeAgentId]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        Loading settings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white p-6 text-center dark:bg-zinc-900">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Unable to open settings.
          </p>
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const src = buildSettingsUrl(subdomain, reloadKey);

  return (
    <div
      data-testid="options-root"
      className="flex h-screen w-full flex-col bg-white dark:bg-zinc-900"
    >
      <iframe
        key={`${subdomain ?? 'root'}:${reloadKey}`}
        data-testid="options-iframe"
        title="LLM Conveyors Settings"
        src={src}
        className="h-full w-full border-0"
        sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
    </div>
  );
}
