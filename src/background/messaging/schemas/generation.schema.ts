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
    kind: z.string().min(1).max(100).optional(),
    type: z.string().min(1).max(100).optional(),
    content: z.string().max(1_000_000).optional(),
    payload: z.record(z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    mimeType: z.string().max(200).optional(),
    storageKey: z.string().max(2_000).optional(),
    downloadUrl: z.string().max(4_000).optional(),
  })
  .passthrough()
  .refine(
    (value) => typeof value.kind === 'string' || typeof value.type === 'string',
    'artifact must include kind or type',
  );

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

/**
 * GENERATION_SUBSCRIBE - popup / sidepanel asks the background to open a live
 * SSE stream for the given generationId. Background manages the single active
 * connection and fans out GENERATION_UPDATE broadcasts.
 */
export const GenerationSubscribeRequestSchema = z
  .object({
    generationId: z.string().min(1).max(128),
  })
  .strict();

export const GenerationSubscribeResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['signed-out', 'network-error', 'already-subscribed']),
    })
    .strict(),
]);

/**
 * GENERATION_INTERACT - user response to an interaction-request event raised
 * by a running generation. Mirrors the backend POST /agents/:type/interact
 * shape, but carries agentType so the bg can route to the right endpoint.
 */
export const GenerationInteractRequestSchema = z
  .object({
    agentType: z.enum(['job-hunter', 'b2b-sales']),
    generationId: z.string().min(1).max(128),
    interactionId: z.string().min(1).max(128),
    interactionType: z.string().min(1).max(100),
    interactionData: z.unknown(),
  })
  .strict();

export const GenerationInteractResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum([
        'signed-out',
        'not-found',
        'network-error',
        'api-error',
        'invalid-payload',
      ]),
      status: z.number().int().optional(),
    })
    .strict(),
]);

export type GenerationStartResponse = z.infer<typeof GenerationStartResponseSchema>;
export type GenerationArtifact = z.infer<typeof GenerationArtifactSchema>;
export type GenerationUpdateBroadcast = z.infer<
  typeof GenerationUpdateBroadcastSchema
>;
export type GenerationSubscribeRequest = z.infer<
  typeof GenerationSubscribeRequestSchema
>;
export type GenerationSubscribeResponse = z.infer<
  typeof GenerationSubscribeResponseSchema
>;
export type GenerationInteractRequest = z.infer<
  typeof GenerationInteractRequestSchema
>;
export type GenerationInteractResponse = z.infer<
  typeof GenerationInteractResponseSchema
>;
