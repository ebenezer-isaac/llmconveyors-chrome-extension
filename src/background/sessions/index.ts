// SPDX-License-Identifier: MIT
/**
 * Barrel for the SESSION_* module (commit 4).
 */

export { createSessionListClient } from './session-list-client';
export type {
  SessionListClientDeps,
  SessionListClientOutcome,
  SessionListQuery,
} from './session-list-client';
export { createSessionHydrateClient } from './session-hydrate-client';
export type {
  SessionHydrateClientDeps,
  SessionHydrateClientOutcome,
} from './session-hydrate-client';
export { createSessionListCache } from './session-list-cache';
export type { CachedSessionList, SessionListCacheDeps } from './session-list-cache';
export { createSessionHandlers } from './session-handlers';
export type { SessionHandlerDeps } from './session-handlers';
export { canonicalizeUrl } from './url-canonicalizer';
export {
  createSessionBindingStore,
  SessionBindingSchema,
  SESSION_BINDING_STORAGE_KEY,
  SESSION_BINDING_LRU_CAP,
  SESSION_BINDING_TTL_MS,
} from './session-binding-store';
export type {
  SessionBinding,
  SessionBindingStore,
  SessionBindingStoreDeps,
  SessionBindingStorageFacade,
} from './session-binding-store';
