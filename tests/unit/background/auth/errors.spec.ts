// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  AuthError,
  AuthCancelledError,
  AuthNetworkError,
  AuthProviderError,
  AuthMalformedResponseError,
  AuthStorageError,
} from '@/src/background/auth/errors';

describe('Auth error hierarchy', () => {
  it('all subclasses extend AuthError and set their own .name', () => {
    const cases: ReadonlyArray<[new (msg: string) => Error, string]> = [
      [AuthError, 'AuthError'],
      [AuthCancelledError, 'AuthCancelledError'],
      [AuthNetworkError, 'AuthNetworkError'],
      [AuthProviderError, 'AuthProviderError'],
      [AuthMalformedResponseError, 'AuthMalformedResponseError'],
      [AuthStorageError, 'AuthStorageError'],
    ];
    for (const [Ctor, expectedName] of cases) {
      const err = new Ctor('boom');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AuthError);
      expect(err.name).toBe(expectedName);
      expect(err.message).toBe('boom');
    }
  });

  it('preserves the cause field', () => {
    const original = new Error('original');
    const wrapped = new AuthNetworkError('wrapped', original);
    expect(wrapped.cause).toBe(original);
  });
});
