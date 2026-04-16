// SPDX-License-Identifier: MIT
/**
 * Schemas for SESSION_BINDING_PUT and SESSION_BINDING_GET.
 *
 * PUT accepts a raw url + agentId + sessionId + generationId; the
 * background canonicalizes the url before storing. GET returns the
 * stored binding or null.
 */

import { z } from 'zod';

const AgentIdSchema = z.enum(['job-hunter', 'b2b-sales']);

export const SessionBindingPutRequestSchema = z
  .object({
    url: z.string().min(1).max(2048),
    agentId: AgentIdSchema,
    sessionId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    pageTitle: z.string().max(500).optional(),
  })
  .strict();

export const SessionBindingPutResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export const SessionBindingGetRequestSchema = z
  .object({
    url: z.string().min(1).max(2048),
    agentId: AgentIdSchema,
  })
  .strict();

export const SessionBindingEntrySchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    agentId: AgentIdSchema,
    urlKey: z.string().min(1).max(2048),
    pageTitle: z.string().max(500).nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const SessionBindingGetResponseSchema = SessionBindingEntrySchema.nullable();

export type SessionBindingPutRequest = z.infer<typeof SessionBindingPutRequestSchema>;
export type SessionBindingPutResponse = z.infer<typeof SessionBindingPutResponseSchema>;
export type SessionBindingGetRequest = z.infer<typeof SessionBindingGetRequestSchema>;
export type SessionBindingGetResponse = z.infer<typeof SessionBindingGetResponseSchema>;
export type SessionBindingEntry = z.infer<typeof SessionBindingEntrySchema>;
