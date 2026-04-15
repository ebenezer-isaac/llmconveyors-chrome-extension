// SPDX-License-Identifier: MIT
/**
 * Hook that exposes the keyword set for a tab. Keywords live in
 * `chrome.storage.session` under `llmc.keywords.<tabId>`; the A9
 * highlight flow populates this cache on every successful
 * HIGHLIGHT_APPLY. The sidepanel subscribes to a session-storage
 * change listener so the list updates when keywords are re-extracted.
 *
 * This hook is read-only. It never triggers extraction; the user
 * does that from the popup's HighlightToggle which sends
 * HIGHLIGHT_APPLY and whose background handler writes the session
 * cache on success.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Keyword {
  readonly term: string;
  readonly category: string;
  readonly score: number;
  readonly canonicalForm: string;
}

type SessionStorageApi = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type StorageChangeListener = (
  changes: Record<string, { readonly newValue?: unknown; readonly oldValue?: unknown }>,
  areaName: string,
) => void;

type StorageChangeBus = {
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

function getStorageBus(): StorageChangeBus | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: StorageChangeBus };
    browser?: { storage?: StorageChangeBus };
  };
  return g.chrome?.storage ?? g.browser?.storage ?? null;
}

function sessionKey(tabId: number): string {
  return `llmc.keywords.${tabId}`;
}

function parseKeywords(value: unknown): readonly Keyword[] {
  if (!Array.isArray(value)) return [];
  const out: Keyword[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const r = entry as {
      term?: unknown;
      category?: unknown;
      score?: unknown;
      canonicalForm?: unknown;
    };
    if (typeof r.term !== 'string' || r.term.length === 0) continue;
    out.push({
      term: r.term,
      category: typeof r.category === 'string' ? r.category : 'skill',
      score: typeof r.score === 'number' ? r.score : 0,
      canonicalForm:
        typeof r.canonicalForm === 'string' ? r.canonicalForm : r.term.toLowerCase(),
    });
  }
  return out;
}

export interface UseKeywordsResult {
  readonly keywords: readonly Keyword[];
  readonly loading: boolean;
}

export function useKeywords(tabId: number | null): UseKeywordsResult {
  const [keywords, setKeywords] = useState<readonly Keyword[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const load = useCallback(async (id: number): Promise<void> => {
    const session = getSessionStorage();
    if (session === null) {
      if (mountedRef.current) {
        setKeywords([]);
        setLoading(false);
      }
      return;
    }
    try {
      const key = sessionKey(id);
      const raw = await session.get(key);
      if (!mountedRef.current) return;
      setKeywords(parseKeywords(raw[key]));
    } catch {
      if (mountedRef.current) setKeywords([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (tabId === null) {
      setKeywords([]);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    setLoading(true);
    void load(tabId);

    const bus = getStorageBus();
    const key = sessionKey(tabId);
    const listener: StorageChangeListener = (changes, areaName) => {
      if (areaName !== 'session') return;
      if (!(key in changes)) return;
      if (mountedRef.current) setKeywords(parseKeywords(changes[key]?.newValue));
    };
    bus?.onChanged.addListener(listener);

    return () => {
      mountedRef.current = false;
      bus?.onChanged.removeListener(listener);
    };
  }, [tabId, load]);

  return { keywords, loading };
}

export async function persistKeywords(
  tabId: number,
  keywords: readonly Keyword[],
): Promise<void> {
  const session = getSessionStorage();
  if (session === null) return;
  try {
    await session.set({ [sessionKey(tabId)]: keywords });
  } catch {
    // storage.session may refuse oversized payloads; ignore.
  }
}
