// SPDX-License-Identifier: MIT
/**
 * Hook that exposes per-tab autofill history. History is stored in
 * `chrome.storage.session` under `llmc.autofill-history.<tabId>` and
 * is appended to whenever FILL_REQUEST resolves with `ok: true`.
 *
 * Each entry records the timestamp, ATS kind, and the counts the
 * engine reports (fieldsFilled, fieldsSkipped). The list is capped
 * at 20 entries per tab; older ones are dropped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutofillHistoryEntry {
  readonly at: number;
  readonly atsKind: 'greenhouse' | 'lever' | 'workday' | 'unknown';
  readonly fieldsFilled: number;
  readonly fieldsSkipped: number;
  readonly stepLabel?: string;
}

const MAX_ENTRIES_PER_TAB = 20;

type SessionStorageApi = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type StorageChangeListener = (
  changes: Record<string, { readonly newValue?: unknown; readonly oldValue?: unknown }>,
  areaName: string,
) => void;

type StorageBus = {
  onChanged: {
    addListener(listener: StorageChangeListener): void;
    removeListener(listener: StorageChangeListener): void;
  };
};

function getSessionStorage(): SessionStorageApi | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { session?: SessionStorageApi } };
    browser?: { storage?: { session?: SessionStorageApi } };
  };
  return g.chrome?.storage?.session ?? g.browser?.storage?.session ?? null;
}

function getStorageBus(): StorageBus | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: StorageBus };
    browser?: { storage?: StorageBus };
  };
  return g.chrome?.storage ?? g.browser?.storage ?? null;
}

function historyKey(tabId: number): string {
  return `llmc.autofill-history.${tabId}`;
}

function parseHistory(value: unknown): readonly AutofillHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(['greenhouse', 'lever', 'workday', 'unknown']);
  const out: AutofillHistoryEntry[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const r = entry as {
      at?: unknown;
      atsKind?: unknown;
      fieldsFilled?: unknown;
      fieldsSkipped?: unknown;
      stepLabel?: unknown;
    };
    if (typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at < 0) continue;
    if (typeof r.atsKind !== 'string' || !kinds.has(r.atsKind)) continue;
    if (typeof r.fieldsFilled !== 'number' || !Number.isFinite(r.fieldsFilled) || r.fieldsFilled < 0) continue;
    if (typeof r.fieldsSkipped !== 'number' || !Number.isFinite(r.fieldsSkipped) || r.fieldsSkipped < 0) continue;
    out.push({
      at: r.at,
      atsKind: r.atsKind as AutofillHistoryEntry['atsKind'],
      fieldsFilled: Math.trunc(r.fieldsFilled),
      fieldsSkipped: Math.trunc(r.fieldsSkipped),
      stepLabel: typeof r.stepLabel === 'string' ? r.stepLabel : undefined,
    });
  }
  return out;
}

export interface UseAutofillHistoryResult {
  readonly history: readonly AutofillHistoryEntry[];
  readonly loading: boolean;
}

export function useAutofillHistory(tabId: number | null): UseAutofillHistoryResult {
  const [history, setHistory] = useState<readonly AutofillHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const load = useCallback(async (id: number): Promise<void> => {
    const session = getSessionStorage();
    if (session === null) {
      if (mountedRef.current) {
        setHistory([]);
        setLoading(false);
      }
      return;
    }
    try {
      const key = historyKey(id);
      const raw = await session.get(key);
      if (!mountedRef.current) return;
      setHistory(parseHistory(raw[key]));
    } catch {
      if (mountedRef.current) setHistory([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (tabId === null) {
      setHistory([]);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    setLoading(true);
    void load(tabId);

    const bus = getStorageBus();
    const key = historyKey(tabId);
    const listener: StorageChangeListener = (changes, areaName) => {
      if (areaName !== 'session') return;
      if (!(key in changes)) return;
      if (mountedRef.current) setHistory(parseHistory(changes[key]?.newValue));
    };
    bus?.onChanged.addListener(listener);

    return () => {
      mountedRef.current = false;
      bus?.onChanged.removeListener(listener);
    };
  }, [tabId, load]);

  return { history, loading };
}

export async function recordAutofillResult(
  tabId: number,
  entry: AutofillHistoryEntry,
): Promise<void> {
  const session = getSessionStorage();
  if (session === null) return;
  try {
    const key = historyKey(tabId);
    const raw = await session.get(key);
    const existing = parseHistory(raw[key]);
    const next = [entry, ...existing].slice(0, MAX_ENTRIES_PER_TAB);
    await session.set({ [key]: next });
  } catch {
    // ignore quota / runtime errors.
  }
}
