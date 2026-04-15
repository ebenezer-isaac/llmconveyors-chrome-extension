// SPDX-License-Identifier: MIT
/**
 * Auth message schemas.
 *
 * AuthState is a discriminated union on `signedIn`. Registered via
 * defineDiscriminatedUnion so the JSON Schema generator emits oneOf +
 * discriminator keyword.
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';

export const AuthSignInRequestSchema = z
  .object({
    cookieJar: z.string().max(16_384).optional(),
  })
  .strict();

export const AuthSignOutRequestSchema = z.object({}).strict();

export const AuthStatusRequestSchema = z.object({}).strict();

export const AuthStateSchema = defineDiscriminatedUnion(
  'AuthState',
  z.discriminatedUnion('signedIn', [
    z
      .object({
        signedIn: z.literal(true),
        userId: z.string().min(1).max(128),
      })
      .strict(),
    z
      .object({
        signedIn: z.literal(false),
      })
      .strict(),
  ]),
);

export const AuthSignInResponseSchema = defineDiscriminatedUnion(
  'AuthSignInResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        userId: z.string().min(1).max(128),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        reason: z.string().max(500),
      })
      .strict(),
  ]),
);

export const AuthSignOutResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export type AuthState = z.infer<typeof AuthStateSchema>;
export type AuthSignInResponse = z.infer<typeof AuthSignInResponseSchema>;
export type AuthSignOutResponse = z.infer<typeof AuthSignOutResponseSchema>;

/** Canonical unauthed constant for handler responses. */
export const UNAUTHED: AuthState = Object.freeze({ signedIn: false });

/** Session shape stored in chrome.storage.local['llmc.session.v1']. */
export const StoredSessionSchema = z
  .object({
    accessToken: z.string().min(1).max(16_384),
    refreshToken: z.string().min(1).max(16_384),
    expiresAt: z.number().int().nonnegative(),
    userId: z.string().min(1).max(128),
  })
  .strict();

export type StoredSession = z.infer<typeof StoredSessionSchema>;
