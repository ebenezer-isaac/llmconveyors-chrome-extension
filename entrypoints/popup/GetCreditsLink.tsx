// SPDX-License-Identifier: MIT
/**
 * GetCreditsLink - small inline link shown below the action panel when
 * credits === 0. Routes to the active agent's dashboard (with a drawer
 * hint) rather than a hardcoded llmconveyors.com/settings URL, which
 * 404s after the app split into agent subdomains.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';
import { AGENT_REGISTRY, buildAgentUrl } from '@/src/background/agents/agent-registry';
import type { AgentId } from '@/src/background/agents';
import { clientEnv } from '@/src/shared/env';

const log = createLogger('popup:get-credits-link');

export interface GetCreditsLinkProps {
  readonly agentId: AgentId | null;
}

function resolveUrl(agentId: AgentId | null): string {
  const fallback = `${clientEnv.webBaseUrl}/${clientEnv.defaultLocale}`;
  if (agentId === null) return fallback;
  const agent = AGENT_REGISTRY[agentId];
  if (!agent) return fallback;
  return (
    buildAgentUrl(agent, 'settings', {
      rootDomain: clientEnv.rootDomain,
      locale: clientEnv.defaultLocale,
    }) ?? fallback
  );
}

export function GetCreditsLink({ agentId }: GetCreditsLinkProps): React.ReactElement {
  function openSettings(): void {
    const url = resolveUrl(agentId);
    const g = globalThis as unknown as {
      chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
    };
    try {
      if (g.chrome?.tabs?.create) {
        g.chrome.tabs.create({ url });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (err: unknown) {
      log.warn('failed to open settings', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <button
      type="button"
      data-testid="get-credits-link"
      onClick={openSettings}
      className="mt-1 inline-flex items-center gap-1 self-start rounded-pill border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      Get credits
      <span aria-hidden="true">&rarr;</span>
    </button>
  );
}
