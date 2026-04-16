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

export function useActiveTabUrl(tabId: number | null): string | null {
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
