// SPDX-License-Identifier: MIT
/**
 * Public barrel for the A6 auth module.
 *
 * Downstream callers (popup A10, sidepanel A11) and A5's handlers.ts
 * import from this path only. Implementation files are not part of the
 * public contract.
 */

export {
  AuthError,
  AuthCancelledError,
  AuthNetworkError,
  AuthProviderError,
  AuthMalformedResponseError,
  AuthStorageError,
} from './errors';

export {
  decodeJwtPayload,
  extractUserIdFromJwt,
} from './jwt-decode';

export { AUTH_MODULE_BLUEPRINT, blueprint } from './blueprint';

export { registerCookieWatcher } from './cookie-watcher';
export type { CookieWatcherDeps } from './cookie-watcher';

export { createFetchAuthed } from './fetch-authed';
export type {
  FetchAuthed,
  FetchAuthedDeps,
  FetchAuthedResult,
} from './fetch-authed';
