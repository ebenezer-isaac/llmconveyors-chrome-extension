// SPDX-License-Identifier: MIT
/**
 * SessionList - collapsible "Recent sessions" panel in the popup. Shows up
 * to `limit` sessions with status + completion time, and a "View all" link
 * into the web dashboard. Empty state renders a subdued message.
 */

import React, { useMemo, useState } from 'react';
import { useSessionList } from './useSessionList';
import type { SessionListItem } from '@/src/background/messaging/schemas/session-list.schema';
import { clientEnv } from '@/src/shared/env';
import { t } from '@/src/shared/i18n';
import { AGENT_REGISTRY, buildAgentUrl } from '@/src/background/agents/agent-registry';
import type { AgentId } from '@/src/background/agents';
import { writeSelectedSession } from '@/src/background/sessions/session-selection';

function dashboardUrl(agentId: AgentId | null): string {
  // Scope "View all" to the agent-specific dashboard so the link lands
  // on the right surface (job-hunt.llmconveyors.com / b2b-sales....)
  // instead of the legacy /dashboard route that 404s.
  const fallback = `${clientEnv.webBaseUrl}/${clientEnv.defaultLocale}`;
  if (agentId === null) return fallback;
  const agent = AGENT_REGISTRY[agentId];
  if (!agent) return fallback;
  return (
    buildAgentUrl(agent, 'dashboard', {
      rootDomain: clientEnv.rootDomain,
      locale: clientEnv.defaultLocale,
    }) ?? fallback
  );
}

function statusLabel(status: SessionListItem['status']): string {
  switch (status) {
    case 'active':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'awaiting_input':
      return 'Needs input';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function statusClasses(status: SessionListItem['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    case 'cancelled':
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    case 'awaiting_input':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100';
    case 'active':
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
  }
}

function titleFor(item: SessionListItem): string {
  if (item.jobTitle && item.jobTitle.length > 0) return item.jobTitle;
  if (item.companyName && item.companyName.length > 0) return item.companyName;
  return 'Untitled session';
}

function formatTime(ts: number | null | undefined): string {
  if (typeof ts !== 'number' || ts <= 0) return '';
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export interface SessionListProps {
  readonly enabled: boolean;
  /**
   * Scope the list to the currently-selected agent. Matches the web
   * dashboard's client-side filter on `metadata.agentType` so the popup
   * and the web never disagree about which sessions belong to the user's
   * current agent context.
   */
  readonly activeAgentId: SessionListItem['agentType'] | null;
}

async function selectSessionAndOpenSidepanel(
  item: SessionListItem,
): Promise<void> {
  const g = globalThis as unknown as {
    chrome?: {
      sidePanel?: { open: (opts: { tabId?: number }) => Promise<void> };
      tabs?: {
        query: (opts: { active: boolean; currentWindow: boolean }) => Promise<
          Array<{ id?: number; url?: string }>
        >;
        create?: (opts: { url: string }) => void;
      };
    };
  };

  const tabs = g.chrome?.tabs;
  let activeTabId: number | undefined;
  let activeTabUrl: string | undefined;
  if (tabs) {
    try {
      const list = await tabs.query({ active: true, currentWindow: true });
      const active = list[0];
      activeTabId = typeof active?.id === 'number' ? active.id : undefined;
      activeTabUrl = typeof active?.url === 'string' ? active.url : undefined;
    } catch {
      // ignore tab resolution failure; selection broadcast still works
    }
  }

  // Persist + broadcast so the sidepanel (opening now or already open)
  // picks up the chosen session.
  await writeSelectedSession({
    sessionId: item.sessionId,
    agentId: item.agentType,
    ...(activeTabUrl !== undefined ? { tabUrl: activeTabUrl } : {}),
  });

  const sp = g.chrome?.sidePanel;
  if (sp && activeTabId !== undefined) {
    try {
      await sp.open({ tabId: activeTabId });
      // Close the popup once the sidepanel is the active surface for
      // this session. Popup + sidepanel competing for focus is a
      // confusing UX -- they never need to be open together.
      try {
        (globalThis as { window?: Window }).window?.close();
      } catch {
        // window.close is a no-op in some test contexts; safe to ignore.
      }
    } catch {
      // User-gesture constraints can throw; the broadcast already fired.
    }
    return;
  }
  const fallbackUrl = dashboardUrl(item.agentType);
  if (tabs?.create) {
    tabs.create({ url: fallbackUrl });
  } else {
    window.open(fallbackUrl, '_blank', 'noopener');
  }
}

function openDashboard(agentId: AgentId | null): void {
  const url = dashboardUrl(agentId);
  const g = globalThis as unknown as {
    chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
  };
  if (g.chrome?.tabs?.create) {
    g.chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export function SessionList({
  enabled,
  activeAgentId,
}: SessionListProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState<boolean>(true);
  const { items, loading, error } = useSessionList(enabled, 20);
  const visible = useMemo(() => {
    const scoped =
      activeAgentId === null
        ? items
        : items.filter((item) => item.agentType === activeAgentId);
    return scoped.slice(0, 5);
  }, [items, activeAgentId]);

  if (!enabled) return null;

  return (
    <section
      data-testid="session-list"
      className="mt-3 rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="session-list-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200"
        >
          {t('sessionList_title')} {expanded ? '-' : '+'}
        </button>
        <button
          type="button"
          data-testid="session-list-dashboard-link"
          onClick={() => openDashboard(activeAgentId)}
          className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          {t('sessionList_viewAll')}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2">
          {loading && visible.length === 0 ? (
            <p data-testid="session-list-loading" className="text-xs text-zinc-500">
              {t('sessionList_loading')}
            </p>
          ) : null}
          {error !== null ? (
            <p
              data-testid="session-list-error"
              className="rounded-card bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100"
            >
              {error}
            </p>
          ) : null}
          {visible.length === 0 && !loading && error === null ? (
            <p data-testid="session-list-empty" className="text-xs text-zinc-500">
              {t('sessionList_empty')}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {visible.map((item) => (
              <li key={item.sessionId}>
                <button
                  type="button"
                  data-testid={`session-item-${item.sessionId}`}
                  data-status={item.status}
                  onClick={() => {
                    void selectSessionAndOpenSidepanel(item);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-card px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span className="flex flex-col">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {titleFor(item)}
                    </span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {formatTime(item.completedAt ?? item.updatedAt)}
                    </span>
                  </span>
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${statusClasses(item.status)}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
