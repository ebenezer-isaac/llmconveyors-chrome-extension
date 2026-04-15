// SPDX-License-Identifier: MIT
/**
 * Generation schemas. A5 stubs GENERATION_START / GENERATION_CANCEL; A11
 * ships real impls. GENERATION_UPDATE is broadcast-only (inert bg handler).
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';

export const GenerationStartRequestSchema = z
  .object({
    agent: z.enum(['job-hunter', 'b2b-sales']),
    payload: z.unknown(),
  })
  .strict();

export const GenerationStartResponseSchema = defineDiscriminatedUnion(
  'GenerationStartResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        generationId: z.string().min(1).max(128),
        sessionId: z.string().min(1).max(128),
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

export const GenerationArtifactSchema = z
  .object({
    kind: z.enum(['cv', 'cover-letter', 'email', 'other']),
    content: z.string().max(1_000_000),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const GenerationUpdateBroadcastSchema = z
  .object({
    generationId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128),
    phase: z.string().min(1).max(100),
    status: z.enum([
      'running',
      'completed',
      'failed',
      'awaiting_input',
      'cancelled',
    ]),
    progress: z.number().min(0).max(1).optional(),
    interactionType: z.string().max(100).optional(),
    artifacts: z.array(GenerationArtifactSchema).max(20).optional(),
  })
  .strict();

export const GenerationCancelRequestSchema = z
  .object({
    generationId: z.string().min(1).max(128),
  })
  .strict();

export const GenerationCancelResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export type GenerationStartResponse = z.infer<typeof GenerationStartResponseSchema>;
export type GenerationArtifact = z.infer<typeof GenerationArtifactSchema>;
export type GenerationUpdateBroadcast = z.infer<
  typeof GenerationUpdateBroadcastSchema
>;
