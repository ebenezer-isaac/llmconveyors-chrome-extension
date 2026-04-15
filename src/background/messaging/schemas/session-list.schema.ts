// SPDX-License-Identifier: MIT
/**
 * Session list / detail schemas for the SESSION_* protocol keys (commit 4).
 *
 * These mirror the backend envelope for GET /api/v1/sessions and
 * GET /api/v1/sessions/:id.  Only the fields the popup consumes are typed
 * strictly; the rest of the envelope is tolerated via `.passthrough()` so a
 * future backend addition does not break the client.
 */

import { z } from 'zod';

export const SessionListItemSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    agentType: z.enum(['job-hunter', 'b2b-sales']),
    title: z.string().max(500).nullable().optional(),
    status: z.enum(['active', 'completed', 'failed', 'awaiting_input', 'cancelled']),
    companyName: z.string().max(500).nullable().optional(),
    jobTitle: z.string().max(500).nullable().optional(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const SessionListResponseSchema = z
  .object({
    success: z.literal(true).optional(),
    data: z
      .object({
        items: z.array(SessionListItemSchema).max(100),
        total: z.number().int().nonnegative(),
        page: z.number().int().nonnegative().optional(),
        limit: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export const SessionListRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
    status: z.enum(['active', 'completed', 'failed', 'awaiting_input', 'cancelled']).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const SessionListResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      items: z.array(SessionListItemSchema).max(100),
      total: z.number().int().nonnegative(),
      fetchedAt: z.number().int().nonnegative(),
      fromCache: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['signed-out', 'network-error', 'api-error', 'shape-mismatch']),
      status: z.number().int().optional(),
    })
    .strict(),
]);

export const SessionGetRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
  })
  .strict();

export const SessionGetResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      session: SessionListItemSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum([
        'signed-out',
        'not-found',
        'network-error',
        'api-error',
        'shape-mismatch',
      ]),
      status: z.number().int().optional(),
    })
    .strict(),
]);

export type SessionListItem = z.infer<typeof SessionListItemSchema>;
export type SessionListRequest = z.infer<typeof SessionListRequestSchema>;
export type SessionListResult = z.infer<typeof SessionListResultSchema>;
export type SessionGetRequest = z.infer<typeof SessionGetRequestSchema>;
export type SessionGetResult = z.infer<typeof SessionGetResultSchema>;
