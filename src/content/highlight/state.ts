// SPDX-License-Identifier: MIT
/**
 * Module-scoped highlight state + single-flight mutex. The state holds the
 * cleanup closure returned by the engine's `applyHighlights` plus metadata
 * used by the clear handler and the auth-lost handler.
 *
 * Single-flight mutex: `HIGHLIGHT_APPLY` and `HIGHLIGHT_CLEAR` share a
 * `pending` promise. A second invocation while a prior one is in flight is
 * rejected with `{ ok: false, reason: 'in-progress' }` semantically at the
 * handler layer.
 */

export interface HighlightState {
  readonly cleanup: (() => void) | null;
  readonly keywordCount: number;
  readonly rangeCount: number;
  readonly appliedAt: number | null;
  readonly url: string | null;
}

const INITIAL_STATE: HighlightState = {
  cleanup: null,
  keywordCount: 0,
  rangeCount: 0,
  appliedAt: null,
  url: null,
};

let state: HighlightState = INITIAL_STATE;

export function getHighlightState(): HighlightState {
  return state;
}

export function setHighlightState(next: Partial<HighlightState>): void {
  state = Object.freeze({ ...state, ...next });
}

export function resetHighlightState(): void {
  state = INITIAL_STATE;
}

let pending: Promise<unknown> | null = null;

export function isApplyInProgress(): boolean {
  return pending !== null;
}

export function beginApply<T>(work: () => Promise<T>): Promise<T> {
  if (pending !== null) {
    // Reject re-entrant callers by signalling via a dedicated error.
    return Promise.reject(new HighlightMutexError('in-progress'));
  }
  const task = work();
  pending = task.finally(() => {
    pending = null;
  });
  return task;
}

export class HighlightMutexError extends Error {
  public readonly reason: 'in-progress';
  constructor(reason: 'in-progress') {
    super(reason);
    this.name = 'HighlightMutexError';
    this.reason = reason;
  }
}

/** Test-only reset. */
export function __resetHighlightStateForTest(): void {
  state = INITIAL_STATE;
  pending = null;
}
