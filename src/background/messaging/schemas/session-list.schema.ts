// SPDX-License-Identifier: MIT
/**
 * Session list / detail schemas for the SESSION_* protocol keys.
 *
 * The backend exposes GET /api/v1/sessions?limit=N&cursor=ISO-8601 which
 * returns the global envelope:
 *   { success, data: {
 *       sessions: [{ id, userId, status, metadata, chatHistory,
 *                    createdAt: ISO-8601, updatedAt: ISO-8601 }],
 *       pagination: { nextCursor: string | null, hasMore: boolean, pageSize: N }
 *   } }
 *
 * (See api/src/modules/sessions/sessions-crud.service.ts::listSessionsPaginated.)
 *
 * The popup consumes a normalized `SessionListItem` that flattens the
 * metadata.{agentType,companyName,jobTitle} up to the top level and converts
 * ISO timestamps to milliseconds so the renderer can format with
 * `new Date(ms).toLocaleString(...)` directly.
 */

import { z } from 'zod';

/**
 * Raw session shape emitted by the backend list endpoint. Mongoose lean()
 * preserves Date objects in-process but JSON serialization produces ISO
 * strings, so we accept strings here and convert at the schema boundary.
 */
export const BackendListedSessionSchema = z
  .object({
    id: z.string().min(1).max(128),
    userId: z.string().min(1),
    status: z.string().min(1).max(64),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    metadata: z.record(z.unknown()).optional().default({}),
    chatHistory: z.array(z.unknown()).optional().default([]),
  })
  .passthrough();

/** Normalized envelope for popup consumers. */
export const SessionListItemSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    agentType: z.enum(['job-hunter', 'b2b-sales']),
    status: z.enum(['active', 'completed', 'failed', 'awaiting_input', 'cancelled']),
    companyName: z.string().max(500).nullable().optional(),
    jobTitle: z.string().max(500).nullable().optional(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

/**
 * Response schema mirrors the bare shape the NestJS service returns; the
 * global interceptor wraps it into `{ success, data }` which we peel off in
 * the session-list-client before handing the envelope to this schema.
 */
export const SessionListResponseSchema = z
  .object({
    sessions: z.array(BackendListedSessionSchema).max(200),
    pagination: z
      .object({
        nextCursor: z.string().nullable(),
        hasMore: z.boolean(),
        pageSize: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const SessionListRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().min(1).max(128).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const SessionListResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      items: z.array(SessionListItemSchema).max(200),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
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

export type BackendListedSession = z.infer<typeof BackendListedSessionSchema>;
export type SessionListItem = z.infer<typeof SessionListItemSchema>;
export type SessionListRequest = z.infer<typeof SessionListRequestSchema>;
export type SessionListResult = z.infer<typeof SessionListResultSchema>;
export type SessionGetRequest = z.infer<typeof SessionGetRequestSchema>;
export type SessionGetResult = z.infer<typeof SessionGetResultSchema>;

/**
 * SESSION_HYDRATE_GET: the sidepanel asks the background to fetch
 * `/api/v1/sessions/:id/hydrate` so the auth refresh / silent retry path
 * runs inside the background (where the SessionManager lives) rather than
 * in a popup/sidepanel React component. The response mirrors the backend
 * envelope closely; downstream normalization lives in the sidepanel hook.
 */
export const SessionHydrateGetRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
  })
  .strict();

export const HydrateArtifactSchema = z
  .object({
    type: z.string(),
    storageKey: z.string().optional(),
    label: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const HydrateSessionDocSchema = z
  .object({
    id: z.string().optional(),
    _id: z.string().optional(),
    status: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    updatedAt: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const HydratePayloadSchema = z
  .object({
    session: HydrateSessionDocSchema,
    artifacts: z.array(HydrateArtifactSchema).optional(),
    generationLogs: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const SessionHydrateGetResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      payload: HydratePayloadSchema,
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

export type SessionHydrateGetRequest = z.infer<typeof SessionHydrateGetRequestSchema>;
export type SessionHydrateGetResponse = z.infer<typeof SessionHydrateGetResponseSchema>;
export type HydrateArtifact = z.infer<typeof HydrateArtifactSchema>;
export type HydrateSessionDoc = z.infer<typeof HydrateSessionDocSchema>;
export type HydratePayload = z.infer<typeof HydratePayloadSchema>;

/**
 * Normalize a raw backend session document into a `SessionListItem`.
 * Strictly guards the agent-type enum so a backend drift that ships a new
 * agent id does not poison the extension's UI; unknown agents fall through
 * to `null` which the caller filters out.
 */
export function normalizeBackendSession(
  raw: BackendListedSession,
): SessionListItem | null {
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  const rawAgent = typeof metadata.agentType === 'string' ? metadata.agentType : null;
  if (rawAgent !== 'job-hunter' && rawAgent !== 'b2b-sales') return null;
  const status = raw.status;
  const allowedStatus = (
    ['active', 'completed', 'failed', 'awaiting_input', 'cancelled'] as const
  ).includes(status as 'active') ? (status as SessionListItem['status']) : null;
  if (allowedStatus === null) return null;
  const createdAt = Date.parse(raw.createdAt);
  const updatedAt = Date.parse(raw.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  const completedAtRaw = metadata.completedAt;
  const completedAt =
    typeof completedAtRaw === 'string' && Date.parse(completedAtRaw) > 0
      ? Date.parse(completedAtRaw)
      : null;
  const companyNameRaw = metadata.companyName;
  const jobTitleRaw = metadata.jobTitle;
  return {
    sessionId: raw.id,
    agentType: rawAgent,
    status: allowedStatus,
    companyName:
      typeof companyNameRaw === 'string' && companyNameRaw.length > 0
        ? companyNameRaw
        : null,
    jobTitle:
      typeof jobTitleRaw === 'string' && jobTitleRaw.length > 0 ? jobTitleRaw : null,
    createdAt,
    updatedAt,
    completedAt,
  };
}
