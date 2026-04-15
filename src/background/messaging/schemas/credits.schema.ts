// SPDX-License-Identifier: MIT
/**
 * CREDITS_GET schemas. Stubbed until A6 enables the real backend route.
 * Returns a safe fallback on any error path.
 */

import { z } from 'zod';

export const CreditsGetRequestSchema = z.object({}).strict();

export const CreditsStateSchema = z
  .object({
    balance: z.number().min(0).max(1_000_000_000),
    plan: z.string().min(1).max(64),
    resetAt: z.number().int().nullable(),
  })
  .strict();

export type CreditsState = z.infer<typeof CreditsStateSchema>;
