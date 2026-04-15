// SPDX-License-Identifier: MIT
/**
 * React hook that exposes the DetectedIntent for the currently active tab.
 *
 * On mount the hook queries `chrome.tabs.query({ active: true, currentWindow: true })`
 * to obtain the active tab id, then dispatches an INTENT_GET runtime message to
 * the background. The background returns the DetectedIntent snapshot it has
 * recorded for that tab (populated by the A9 content script via INTENT_DETECTED),
 * or `null` if no intent is known.
 *
 * The hook also subscribes to DETECTED_JOB_BROADCAST and INTENT_DETECTED
 * messages so that when the content script re-detects intent on a SPA-style
 * navigation, the popup view refreshes without requiring a close-and-reopen.
 *
 * Defensive: missing chrome.tabs, missing runtime, and malformed responses
 * all collapse to `{ intent: null, tabId: null }` rather than throwing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

type MessageListener = (msg: unknown) => void;

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: MessageListener): void;
    removeListener(listener: MessageListener): void;
  };
};

type TabsApi = {
  query(
    queryInfo: { active?: boolean; currentWindow?: boolean },
  ): Promise<Array<{ id?: number; url?: string }>>;
  onActivated?: {
    addListener(listener: (info: { tabId: number }) => void): void;
    removeListener(listener: (info: { tabId: number }) => void): void;
  };
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function getTabs(): TabsApi | null {
  const g = globalThis as unknown as {
    chrome?: { tabs?: TabsApi };
    browser?: { tabs?: TabsApi };
  };
  return g.chrome?.tabs ?? g.browser?.tabs ?? null;
}

function isDetectedIntent(value: unknown): value is DetectedIntent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    kind?: unknown;
    pageKind?: unknown;
    url?: unknown;
  };
  const validKinds = ['greenhouse', 'lever', 'workday', 'unknown'];
  const validPageKinds = ['job-posting', 'application-form'];
  if (typeof v.kind !== 'string' || !validKinds.includes(v.kind)) return false;
  if (typeof v.pageKind !== 'string' || !validPageKinds.includes(v.pageKind)) return false;
  if (typeof v.url !== 'string') return false;
  return true;
}

export interface UseIntentResult {
  readonly intent: DetectedIntent | null;
  readonly tabId: number | null;
  readonly loading: boolean;
  readonly refresh: () => Promise<void>;
}

export function useIntent(): UseIntentResult {
  const [intent, setIntent] = useState<DetectedIntent | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);
  const currentTabIdRef = useRef<number | null>(null);

  const fetchFor = useCallback(async (id: number): Promise<void> => {
    const runtime = getRuntime();
    if (runtime === null) {
      if (mountedRef.current) {
        setIntent(null);
        setLoading(false);
      }
      return;
    }
    try {
      const response = await runtime.sendMessage({
        key: 'INTENT_GET',
        data: { tabId: id },
      });
      if (!mountedRef.current) return;
      if (response === null || response === undefined) {
        setIntent(null);
      } else if (isDetectedIntent(response)) {
        setIntent(response);
      } else {
        setIntent(null);
      }
    } catch {
      if (mountedRef.current) setIntent(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const resolveTargetTabId = useCallback(async (): Promise<number | null> => {
    // Honor an explicit tabId from the page URL query string first. The
    // sidepanel and E2E harnesses pass ?tabId=<n> to pin state to a
    // specific ATS tab even when a newly-opened extension page is the
    // currently-active tab in the window (which would otherwise win the
    // chrome.tabs.query({active:true}) race). Production popup opens
    // from a browser action and never carries this query, so the active
    // tab path remains the default.
    try {
      const loc = (globalThis as { location?: { search?: string } }).location;
      if (loc && typeof loc.search === 'string' && loc.search.length > 0) {
        const params = new URLSearchParams(loc.search);
        const raw = params.get('tabId');
        if (raw !== null) {
          const parsed = Number.parseInt(raw, 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
    } catch {
      // ignore malformed URL parse and fall through to active-tab query.
    }

    const tabs = getTabs();
    if (tabs === null) return null;
    try {
      const list = await tabs.query({ active: true, currentWindow: true });
      const active = list[0];
      if (!active || typeof active.id !== 'number') return null;
      return active.id;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const id = await resolveTargetTabId();
    if (id === null) {
      if (mountedRef.current) {
        setTabId(null);
        setIntent(null);
        setLoading(false);
      }
      return;
    }
    currentTabIdRef.current = id;
    if (mountedRef.current) setTabId(id);
    await fetchFor(id);
  }, [fetchFor, resolveTargetTabId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const runtime = getRuntime();
    const onMessage: MessageListener = (msg) => {
      if (msg === null || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: unknown };
      if (env.key !== 'DETECTED_JOB_BROADCAST' && env.key !== 'INTENT_DETECTED') return;
      const payload = env.data as { tabId?: unknown; intent?: unknown } | undefined;
      if (!payload || typeof payload !== 'object') return;
      const rawId = payload.tabId;
      if (typeof rawId !== 'number') return;
      if (rawId !== currentTabIdRef.current) return;
      if (isDetectedIntent(payload.intent)) {
        if (mountedRef.current) setIntent(payload.intent);
      } else {
        // INTENT_DETECTED shape has intent inline, not nested.
        void fetchFor(rawId);
      }
    };
    runtime?.onMessage.addListener(onMessage);

    const tabs = getTabs();
    const onActivated = (info: { tabId: number }): void => {
      currentTabIdRef.current = info.tabId;
      if (mountedRef.current) setTabId(info.tabId);
      void fetchFor(info.tabId);
    };
    tabs?.onActivated?.addListener(onActivated);

    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(onMessage);
      tabs?.onActivated?.removeListener(onActivated);
    };
  }, [refresh, fetchFor]);

  return { intent, tabId, loading, refresh };
}
