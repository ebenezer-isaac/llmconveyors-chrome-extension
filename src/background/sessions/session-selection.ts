// SPDX-License-Identifier: MIT
/**
 * Explicit session selection from a surface that owns the session list.
 *
 * When the popup's SessionList row is clicked, the sidepanel (often
 * closed or showing a different session) needs to swap to the chosen
 * session. Two-channel delivery:
 *
 *   1. Durable: write to chrome.storage.local under
 *      SELECTED_SESSION_STORAGE_KEY. Surfaces that mount AFTER the click
 *      (e.g. the sidepanel opened by the same click) read this on
 *      startup and skip the URL-binding / most-recent fallback.
 *
 *   2. Live: broadcast a SESSION_SELECTED runtime message so any surface
 *      already mounted reacts within the same event loop turn.
 *
 * Both paths carry {sessionId, agentId, tabUrl?} so the receiver can
 * re-hydrate without another round-trip.
 *
 * Storage TTL: the selection is treated as stale after 10 minutes to
 * avoid stale selections surviving across reboots. The sidepanel also
 * clears it when the user dismisses the bound panel or starts a new
 * generation so the URL-binding fallback takes over.
 */

import type { AgentId } from '../agents';

export const SELECTED_SESSION_STORAGE_KEY = 'llmc.selectedSession.v1';
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface SelectedSessionEntry {
  readonly sessionId: string;
  readonly agentId: AgentId;
  readonly tabUrl?: string;
  readonly selectedAt: number;
}

type StorageLocal = {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
};

type RuntimeBroadcaster = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

function getStorageLocal(): StorageLocal | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLocal } };
  };
  return g.chrome?.storage?.local ?? null;
}

function getRuntime(): RuntimeBroadcaster | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeBroadcaster };
  };
  return g.chrome?.runtime ?? null;
}

function isAgentId(v: unknown): v is AgentId {
  return v === 'job-hunter' || v === 'b2b-sales';
}

function normalize(raw: unknown): SelectedSessionEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionId !== 'string' || r.sessionId.length === 0) return null;
  if (!isAgentId(r.agentId)) return null;
  const selectedAt = typeof r.selectedAt === 'number' ? r.selectedAt : 0;
  if (selectedAt <= 0) return null;
  const tabUrl = typeof r.tabUrl === 'string' && r.tabUrl.length > 0 ? r.tabUrl : undefined;
  return {
    sessionId: r.sessionId,
    agentId: r.agentId,
    ...(tabUrl !== undefined ? { tabUrl } : {}),
    selectedAt,
  };
}

/**
 * Persist the selection and broadcast SESSION_SELECTED. Safe to call
 * from any extension surface (popup, sidepanel, options).
 */
export async function writeSelectedSession(
  entry: { sessionId: string; agentId: AgentId; tabUrl?: string },
  now: () => number = Date.now,
): Promise<void> {
  const payload: SelectedSessionEntry = {
    sessionId: entry.sessionId,
    agentId: entry.agentId,
    ...(entry.tabUrl !== undefined ? { tabUrl: entry.tabUrl } : {}),
    selectedAt: now(),
  };
  const storage = getStorageLocal();
  if (storage !== null) {
    try {
      await storage.set({ [SELECTED_SESSION_STORAGE_KEY]: payload });
    } catch {
      // storage write failed; the broadcast still reaches open surfaces.
    }
  }
  const runtime = getRuntime();
  if (runtime !== null) {
    try {
      await runtime.sendMessage({
        key: 'SESSION_SELECTED',
        data: {
          sessionId: payload.sessionId,
          agentId: payload.agentId,
          ...(payload.tabUrl !== undefined ? { tabUrl: payload.tabUrl } : {}),
        },
      });
    } catch {
      // no receivers listening yet; the storage write covers late mounts.
    }
  }
}

/**
 * Read the most recent selection. Returns null if:
 *   - storage is unavailable
 *   - no entry exists
 *   - the entry is older than MAX_AGE_MS
 *   - the entry fails shape validation (drift / corruption)
 */
export async function readSelectedSession(
  now: () => number = Date.now,
): Promise<SelectedSessionEntry | null> {
  const storage = getStorageLocal();
  if (storage === null) return null;
  let result: Record<string, unknown>;
  try {
    result = await storage.get([SELECTED_SESSION_STORAGE_KEY]);
  } catch {
    return null;
  }
  const entry = normalize(result[SELECTED_SESSION_STORAGE_KEY]);
  if (entry === null) return null;
  if (now() - entry.selectedAt > MAX_AGE_MS) {
    // stale; clean up so future reads short-circuit
    try {
      await storage.remove([SELECTED_SESSION_STORAGE_KEY]);
    } catch {
      // best-effort cleanup
    }
    return null;
  }
  return entry;
}

/**
 * Wipe the selection (e.g. user dismissed the bound panel).
 */
export async function clearSelectedSession(): Promise<void> {
  const storage = getStorageLocal();
  if (storage === null) return;
  try {
    await storage.remove([SELECTED_SESSION_STORAGE_KEY]);
  } catch {
    // nothing to do
  }
}
