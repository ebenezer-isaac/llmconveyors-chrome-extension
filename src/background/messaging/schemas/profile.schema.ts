// SPDX-License-Identifier: MIT
/**
 * PROFILE_GET schemas. Mirrors the optional identity fields exposed by the
 * backend /api/v1/settings/profile response after the concurrent web-app
 * commit that extends the profile with `{ email, displayName, photoURL }`.
 *
 * Every field is nullable so the extension keeps rendering gracefully until
 * the backend ships the new fields.
 */

import { z } from 'zod';

export const ProfileGetRequestSchema = z.object({}).strict();

export const ClientProfileSnapshotSchema = z
  .object({
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    photoURL: z.string().nullable(),
  })
  .strict();

export type ProfileGetRequest = z.infer<typeof ProfileGetRequestSchema>;
export type ClientProfileSnapshot = z.infer<typeof ClientProfileSnapshotSchema>;
