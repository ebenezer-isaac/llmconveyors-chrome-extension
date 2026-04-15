// SPDX-License-Identifier: MIT
/**
 * Typed error hierarchy for the extension auth module (A6).
 *
 * Every auth failure mode is a distinct class so callers (popup, sidepanel,
 * options) can branch on `err.name` without parsing `err.message`.
 *
 * Why `.name` and not `instanceof`: `@webext-core/messaging` transports
 * errors via `chrome.runtime.sendMessage`, which uses structured clone.
 * Structured clone preserves `.name` (an own property) but discards the
 * prototype chain, so `instanceof AuthCancelledError` on the receiver side
 * always returns false. Callers MUST branch on `err.name` instead.
 */

export class AuthError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.cause = cause;
  }
}

/**
 * User closed the launchWebAuthFlow popup or denied access. Recoverable:
 * the UI should show a retry affordance and leave all state unchanged.
 */
export class AuthCancelledError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthCancelledError';
  }
}

/**
 * launchWebAuthFlow could not load the bridge page at all (DNS failure,
 * TLS handshake error, offline). Recoverable on retry once online.
 */
export class AuthNetworkError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthNetworkError';
  }
}

/**
 * The provider (Chrome identity runtime or the bridge endpoint) returned
 * a non-recoverable error that is not malformation and not a cancellation.
 */
export class AuthProviderError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthProviderError';
  }
}

/**
 * The redirect URL came back but something about its shape was wrong:
 * missing fragment, missing field, invalid host, non-https protocol,
 * past-expiry, far-future expiry, disallowed character in token, or
 * the presence of `#error=` (tampering signal).
 */
export class AuthMalformedResponseError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthMalformedResponseError';
  }
}

/**
 * chrome.storage.local set/remove failed. Rare in practice; possible under
 * quota exhaustion, corrupt storage, or service-worker termination.
 */
export class AuthStorageError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthStorageError';
  }
}
