// SPDX-License-Identifier: MIT
/**
 * Typed errors used across background handlers.
 *
 * Handlers never leak raw stack traces to the messaging surface: they catch
 * these and return a typed response envelope.
 */

export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
  constructor(messageKey: string) {
    super(`handler not implemented: ${messageKey}`);
  }
}

export type SessionExpiredReason = 'rejected' | 'malformed' | 'missing';

export class SessionExpiredError extends Error {
  override readonly name = 'SessionExpiredError';
  readonly reason: SessionExpiredReason;
  constructor(reason: string, kind: SessionExpiredReason = 'rejected') {
    super(`session expired: ${reason}`);
    this.reason = kind;
  }
}

/**
 * Thrown when the refresh endpoint cannot be reached due to a transport
 * failure (DNS, offline, TLS, abort). NOT a subclass of SessionExpiredError
 * so callers can distinguish a recoverable blip from a server rejection and
 * keep the stored session alive across the next call.
 */
export class SessionRefreshNetworkError extends Error {
  override readonly name = 'SessionRefreshNetworkError';
  constructor(reason: string) {
    super(`refresh network error: ${reason}`);
  }
}

export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(
    message: string,
    readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>,
  ) {
    super(message);
  }
}

export class ProfileMissingError extends Error {
  override readonly name = 'ProfileMissingError';
  constructor() {
    super('profile is not present in chrome.storage.local');
  }
}
