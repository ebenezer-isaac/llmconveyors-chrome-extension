// SPDX-License-Identifier: MIT
/**
 * CREDITS_GET schemas. Mirrors the backend /api/v1/settings/profile
 * response shape (see api/src/modules/settings/settings.service.ts
 * getProfile: `{ credits, tier: 'free' | 'byo', byoKeyEnabled }`).
 *
 * Returns a safe fallback (credits: 0, tier: 'free', byoKeyEnabled: false)
 * when the backend is unreachable or returns an unexpected shape so the
 * popup never crashes on a cold network.
 */

import { z } from 'zod';

export const CreditsGetRequestSchema = z.object({}).strict();

export const ClientCreditsSnapshotSchema = z
  .object({
    credits: z.number().min(0).max(1_000_000_000),
    tier: z.enum(['free', 'byo']),
    byoKeyEnabled: z.boolean(),
  })
  .strict();

export type ClientCreditsSnapshot = z.infer<typeof ClientCreditsSnapshotSchema>;
