// SPDX-License-Identifier: MIT
/**
 * Side-panel variant of useIntent. Accepts a caller-chosen `tabId` so
 * the side panel can honor the useTargetTabId override without reading
 * the URL query twice, and because the side panel should re-query
 * intent whenever the bound tab changes.
 *
 * On mount (and whenever the bound tab id changes) sends INTENT_GET
 * and stores the result. Subscribes to DETECTED_JOB_BROADCAST +
 * INTENT_DETECTED so the tab's intent reflects SPA-style re-detection.
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

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function isDetectedIntent(value: unknown): value is DetectedIntent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    kind?: unknown;
    pageKind?: unknown;
    url?: unknown;
  };
  const kinds = ['greenhouse', 'lever', 'workday', 'unknown'];
  const pageKinds = ['job-posting', 'application-form'];
  if (typeof v.kind !== 'string' || !kinds.includes(v.kind)) return false;
  if (typeof v.pageKind !== 'string' || !pageKinds.includes(v.pageKind)) return false;
  if (typeof v.url !== 'string') return false;
  return true;
}

export interface UseSidepanelIntentResult {
  readonly intent: DetectedIntent | null;
  readonly loading: boolean;
}

export function useSidepanelIntent(tabId: number | null): UseSidepanelIntentResult {
  const [intent, setIntent] = useState<DetectedIntent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

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
      if (isDetectedIntent(response)) {
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

  useEffect(() => {
    mountedRef.current = true;
    if (tabId === null) {
      setLoading(false);
      setIntent(null);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(true);
    void fetchFor(tabId);

    const runtime = getRuntime();
    const listener: MessageListener = (msg) => {
      if (msg === null || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: unknown };
      if (env.key !== 'DETECTED_JOB_BROADCAST' && env.key !== 'INTENT_DETECTED') return;
      const payload = env.data as { tabId?: unknown; intent?: unknown } | undefined;
      if (!payload || typeof payload !== 'object') return;
      if (payload.tabId !== tabId) return;
      if (isDetectedIntent(payload.intent)) {
        if (mountedRef.current) setIntent(payload.intent);
      } else {
        void fetchFor(tabId);
      }
    };
    runtime?.onMessage.addListener(listener);

    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(listener);
    };
  }, [tabId, fetchFor]);

  return { intent, loading };
}
