// SPDX-License-Identifier: MIT
/**
 * Per-tab in-memory state: intent, highlight status, fill lock.
 *
 * Lives in a module-scoped Map. Cleared on chrome.tabs.onRemoved. Does NOT
 * persist across service-worker restarts; a fresh spin-up rebuilds from
 * INTENT_DETECTED broadcasts.
 */

import type { DetectedIntent } from '../messaging/schemas/intent.schema';
import type { HighlightStatus } from '../messaging/schemas/highlight.schema';

export interface TabState {
  readonly intent: DetectedIntent | null;
  readonly highlight: HighlightStatus;
  readonly fillLockedAt: number | null;
}

const EMPTY: TabState = Object.freeze({
  intent: null,
  highlight: Object.freeze({ on: false, keywordCount: 0, appliedAt: null }),
  fillLockedAt: null,
});

const state = new Map<number, TabState>();

export function getTabState(tabId: number): TabState {
  return state.get(tabId) ?? EMPTY;
}

export function setIntent(tabId: number, intent: DetectedIntent): void {
  const prev = state.get(tabId) ?? EMPTY;
  state.set(tabId, Object.freeze({ ...prev, intent }));
}

export function setHighlight(tabId: number, highlight: HighlightStatus): void {
  const prev = state.get(tabId) ?? EMPTY;
  state.set(tabId, Object.freeze({ ...prev, highlight }));
}

export function setFillLock(tabId: number, lockedAt: number | null): void {
  const prev = state.get(tabId) ?? EMPTY;
  state.set(tabId, Object.freeze({ ...prev, fillLockedAt: lockedAt }));
}

export function clearTabState(tabId: number): void {
  state.delete(tabId);
}

export function clearAllTabState(): void {
  state.clear();
}

export function __snapshotForTest(): ReadonlyMap<number, TabState> {
  return new Map(state);
}
