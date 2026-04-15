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

export class SessionExpiredError extends Error {
  override readonly name = 'SessionExpiredError';
  constructor(reason: string) {
    super(`session expired: ${reason}`);
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
