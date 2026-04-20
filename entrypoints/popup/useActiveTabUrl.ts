// SPDX-License-Identifier: MIT
/**
 * useActiveTabUrl -- returns the URL of the tab with the given id.
 * Re-fetches on tabId change. Null when:
 *   - tabId is null (popup / sidepanel not pinned to a tab)
 *   - chrome.tabs is unavailable
 *   - tabs.get throws or the resolved tab has no url
 *
 * Extracted from popup/App.tsx so the sidepanel surface can reuse the
 * same hook when composing its generation form.
 */

import { useEffect, useState } from 'react';
import { createLogger } from '@/src/background/log';

const log = createLogger('shared.useActiveTabUrl');

export function useActiveTabUrl(tabId: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    log.debug('useActiveTabUrl: effect triggered', { tabId: tabId ?? undefined });
    if (tabId === null) {
      log.debug('useActiveTabUrl: tabId is null -- clearing url');
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
    log.debug('useActiveTabUrl: chrome.tabs availability', {
      hasChromeObject: Boolean(g.chrome),
      hasTabsApi: Boolean(tabs),
      hasGetFn: typeof tabs?.get === 'function',
    });
    if (!tabs || typeof tabs.get !== 'function') {
      log.warn('useActiveTabUrl: chrome.tabs.get unavailable -- url stays null', { tabId: tabId ?? undefined });
      setUrl(null);
      return;
    }
    log.debug('useActiveTabUrl: calling chrome.tabs.get', { tabId: tabId ?? undefined });
    try {
      tabs.get(tabId, (tab) => {
        log.info('useActiveTabUrl: chrome.tabs.get callback fired', {
          tabId,
          tabDefined: tab !== undefined,
          tabUrl: tab?.url ?? null,
          tabUrlPresent: 'url' in (tab ?? {}),
          tabKeys: tab ? Object.keys(tab as Record<string, unknown>).slice(0, 20) : [],
        });
        const resolved = tab?.url ?? null;
        log.info('useActiveTabUrl: setting url', { tabId, resolved });
        setUrl(resolved);
      });
    } catch (err: unknown) {
      log.warn('useActiveTabUrl: chrome.tabs.get threw', {
        tabId,
        error: err instanceof Error ? err.message : String(err),
      });
      setUrl(null);
    }
  }, [tabId]);
  log.debug('useActiveTabUrl: returning url', { tabId: tabId ?? undefined, url });
  return url;
}
