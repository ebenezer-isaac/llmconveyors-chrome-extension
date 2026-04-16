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

function dashboardUrl(): string {
  return `${clientEnv.webBaseUrl}/${clientEnv.defaultLocale}/dashboard`;
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
      return 'bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-50';
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

function openSessionInSidePanel(sessionId: string): void {
  const g = globalThis as unknown as {
    chrome?: {
      sidePanel?: { open: (opts: { tabId?: number }) => Promise<void> };
      tabs?: {
        query: (opts: { active: boolean; currentWindow: boolean }) => Promise<
          Array<{ id?: number }>
        >;
        create?: (opts: { url: string }) => void;
      };
    };
  };
  const url = `https://llmconveyors.com/session/${encodeURIComponent(sessionId)}`;
  const sp = g.chrome?.sidePanel;
  const tabs = g.chrome?.tabs;
  if (sp && tabs) {
    void tabs.query({ active: true, currentWindow: true }).then((list) => {
      const active = list[0];
      if (active && typeof active.id === 'number') {
        void sp.open({ tabId: active.id });
      }
    });
    return;
  }
  if (tabs?.create) {
    tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function openDashboard(): void {
  const url = dashboardUrl();
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
          onClick={openDashboard}
          className="text-xs font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
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
                  onClick={() => openSessionInSidePanel(item.sessionId)}
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
