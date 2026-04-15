// SPDX-License-Identifier: MIT
/**
 * Local mirror of the backend master-resume Zod schemas.
 *
 * authoritative source: e:/llmconveyors.com/libs/shared-types/src/schemas/master-resume.schema.ts
 *
 * The extension keeps a parallel Zod schema so the content-script pipeline
 * does not depend on the monorepo workspace at runtime. If the backend
 * schema changes, bump this file too.
 */

import { z } from 'zod';

export const MasterResumeUpsertSchema = z.object({
  label: z.string().trim().min(1).max(200),
  rawText: z.string().min(1).max(100_000),
  structuredData: z.record(z.unknown()).optional(),
});

export type MasterResumeUpsert = z.infer<typeof MasterResumeUpsertSchema>;

export const MasterResumeResponseSchema = z.object({
  userId: z.string(),
  label: z.string(),
  rawText: z.string(),
  structuredData: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MasterResumeResponse = z.infer<typeof MasterResumeResponseSchema>;

/**
 * Wrapping envelope emitted by the backend's global ResponseTransformInterceptor.
 * All /api/v1/* responses are wrapped as `{ success, data }`; the client peels
 * the outer envelope before validating the inner shape.
 */
export const ApiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.unknown().optional(),
});
