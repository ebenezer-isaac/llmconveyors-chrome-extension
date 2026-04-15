// SPDX-License-Identifier: MIT
/**
 * Resolves the tab id the side panel should render state for.
 *
 * Resolution order:
 *   1. `?tabId=<n>` in the panel URL (test harness override; the
 *      production panel never carries this query).
 *   2. `chrome.tabs.query({ active: true, currentWindow: true })` at
 *      mount, subscribing to `chrome.tabs.onActivated` so the panel
 *      refreshes its view when the user switches tabs.
 *
 * Collapses to `null` when neither resolution path yields a positive
 * integer tab id, matching the popup's `useIntent` shape.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type TabsApi = {
  query(
    queryInfo: { active?: boolean; currentWindow?: boolean },
  ): Promise<Array<{ id?: number }>>;
  onActivated?: {
    addListener(listener: (info: { tabId: number }) => void): void;
    removeListener(listener: (info: { tabId: number }) => void): void;
  };
};

function getTabs(): TabsApi | null {
  const g = globalThis as unknown as {
    chrome?: { tabs?: TabsApi };
    browser?: { tabs?: TabsApi };
  };
  return g.chrome?.tabs ?? g.browser?.tabs ?? null;
}

function readTabIdOverride(): number | null {
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (!loc || typeof loc.search !== 'string' || loc.search.length === 0) {
      return null;
    }
    const params = new URLSearchParams(loc.search);
    const raw = params.get('tabId');
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface UseTargetTabIdResult {
  readonly tabId: number | null;
  readonly loading: boolean;
}

export function useTargetTabId(): UseTargetTabIdResult {
  const [tabId, setTabId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);
  const overrideRef = useRef<number | null>(null);

  const resolve = useCallback(async (): Promise<number | null> => {
    if (overrideRef.current !== null) return overrideRef.current;
    const tabs = getTabs();
    if (tabs === null) return null;
    try {
      const list = await tabs.query({ active: true, currentWindow: true });
      const active = list[0];
      if (!active || typeof active.id !== 'number' || active.id <= 0) return null;
      return active.id;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    overrideRef.current = readTabIdOverride();

    (async () => {
      const id = await resolve();
      if (!mountedRef.current) return;
      setTabId(id);
      setLoading(false);
    })();

    if (overrideRef.current !== null) {
      // Pinned to a specific tab id; do not follow onActivated.
      return () => {
        mountedRef.current = false;
      };
    }

    const tabs = getTabs();
    const onActivated = (info: { tabId: number }): void => {
      if (mountedRef.current) setTabId(info.tabId);
    };
    tabs?.onActivated?.addListener(onActivated);
    return () => {
      mountedRef.current = false;
      tabs?.onActivated?.removeListener(onActivated);
    };
  }, [resolve]);

  return { tabId, loading };
}
