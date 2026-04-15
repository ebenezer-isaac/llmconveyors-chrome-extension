// SPDX-License-Identifier: MIT
/**
 * Profile message schemas for PROFILE_GET / PROFILE_UPDATE /
 * PROFILE_UPLOAD_JSON_RESUME.
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';
import { ProfileSchema } from './profile.schema';

export const ProfileGetRequestSchema = z.object({}).strict();

export const ProfileGetResponseSchema = defineDiscriminatedUnion(
  'ProfileGetResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        profile: ProfileSchema,
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        reason: z.enum(['not-found', 'corrupt']),
      })
      .strict(),
  ]),
);

export const ProfileUpdateRequestSchema = z
  .object({
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ProfileUpdateResponseSchema = defineDiscriminatedUnion(
  'ProfileUpdateResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        errors: z.array(
          z
            .object({
              path: z.string(),
              message: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
  ]),
);

export const ProfileUploadJsonResumeRequestSchema = z
  .object({
    jsonResume: z.unknown(),
  })
  .strict();

export const ProfileUploadJsonResumeResponseSchema = defineDiscriminatedUnion(
  'ProfileUploadJsonResumeResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        profile: ProfileSchema,
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        errors: z.array(
          z
            .object({
              path: z.string(),
              message: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
  ]),
);

export type ProfileGetResponse = z.infer<typeof ProfileGetResponseSchema>;
export type ProfileUpdateResponse = z.infer<typeof ProfileUpdateResponseSchema>;
export type ProfileUploadJsonResumeResponse = z.infer<
  typeof ProfileUploadJsonResumeResponseSchema
>;

/**
 * Reject __proto__ / constructor / prototype keys at any depth.
 * Defense-in-depth against prototype pollution via PROFILE_UPDATE patches.
 */
export function validatePatchSafety(
  patch: unknown,
): { readonly safe: true } | { readonly safe: false; readonly reason: string } {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { safe: false, reason: 'patch must be a non-null object' };
  }
  const seen = new WeakSet<object>();
  const queue: unknown[] = [patch];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node as object)) {
      return { safe: false, reason: 'circular reference detected' };
    }
    seen.add(node as object);
    for (const key of Object.keys(node as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return { safe: false, reason: `forbidden key: ${key}` };
      }
      const child = (node as Record<string, unknown>)[key];
      if (child !== null && typeof child === 'object') {
        queue.push(child);
      }
    }
  }
  return { safe: true };
}
