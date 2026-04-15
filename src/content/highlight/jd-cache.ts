// SPDX-License-Identifier: MIT
/**
 * Per-URL in-memory cache of extracted JD text + method metadata. The cache
 * is module-scoped and therefore bounded by the content-script lifetime.
 * Cleared on hard navigation (fresh script instantiation) and on sign-out.
 */

import type { JobPostingData } from 'ats-autofill-engine';

export interface CachedJd {
  readonly text: string;
  readonly structured?: JobPostingData;
  readonly method: 'jsonld' | 'readability';
  readonly cachedAt: number;
}

const cache = new Map<string, CachedJd>();

export function getJdCache(url: string): CachedJd | null {
  return cache.get(url) ?? null;
}

export function setJdCache(url: string, jd: CachedJd): void {
  cache.set(url, Object.freeze({ ...jd }));
}

export function clearJdCache(): void {
  cache.clear();
}

/** Test-only reset. */
export function __resetJdCacheForTest(): void {
  cache.clear();
}
