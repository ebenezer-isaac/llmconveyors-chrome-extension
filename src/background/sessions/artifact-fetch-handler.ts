// SPDX-License-Identifier: MIT
/**
 * ARTIFACT_FETCH_BLOB -- fetches a single session artifact via
 * fetchAuthed and returns the body content + mime type to the caller.
 *
 * The backend (GET /api/v1/sessions/:id/download?key=X) returns
 *   { success: true, data: { content, mimeType } }
 * where `content` is base64 for binary mime types (pdf/png/jpg/...)
 * and utf-8 for text. The bg here is a thin proxy: validate inputs,
 * normalise the response envelope, surface typed failures. The caller
 * (sidepanel CV card) decodes base64 -> Blob -> object URL so the
 * iframe load does not need the extension's Bearer token.
 */

import { z } from 'zod';
import type { FetchAuthed } from '../auth';
import type { Logger } from '../log';

const RequestSchema = z.object({
  sessionId: z.string().min(1).max(256),
  storageKey: z
    .string()
    .min(1)
    .max(512)
    .refine((v) => !v.includes('..') && !v.includes('\\') && !v.startsWith('/'), {
      message: 'forbidden characters',
    }),
});

type Request = z.infer<typeof RequestSchema>;

const EnvelopeSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .object({
        content: z.string(),
        mimeType: z.string(),
      })
      .optional(),
    content: z.string().optional(),
    mimeType: z.string().optional(),
  })
  .passthrough();

export type ArtifactFetchBlobResponse =
  | { readonly ok: true; readonly content: string; readonly mimeType: string }
  | { readonly ok: false; readonly reason: string };

export interface ArtifactFetchBlobDeps {
  readonly fetchAuthed: FetchAuthed;
  readonly baseUrl: string;
  readonly logger: Logger;
}

export function createArtifactFetchBlobHandler(
  deps: ArtifactFetchBlobDeps,
): (msg: { data: unknown }) => Promise<ArtifactFetchBlobResponse> {
  return async (msg) => {
    const parsed = RequestSchema.safeParse(msg.data);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid-payload' };
    }
    const { sessionId, storageKey }: Request = parsed.data;
    const url =
      `${deps.baseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}` +
      `/download?key=${encodeURIComponent(storageKey)}`;
    const result = await deps.fetchAuthed(url, { method: 'GET' });
    if (result.kind === 'unauthenticated') {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (result.kind === 'network-error') {
      deps.logger.warn('ARTIFACT_FETCH_BLOB: network error', {
        error: result.error.message,
      });
      return { ok: false, reason: 'network-error' };
    }
    const { response } = result;
    if (response.status === 404) {
      return { ok: false, reason: 'not-found' };
    }
    if (!response.ok) {
      return { ok: false, reason: `api-error-${response.status}` };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (err: unknown) {
      deps.logger.warn('ARTIFACT_FETCH_BLOB: invalid JSON', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: 'shape-mismatch' };
    }
    const env = EnvelopeSchema.safeParse(body);
    if (!env.success) {
      deps.logger.warn('ARTIFACT_FETCH_BLOB: envelope drift', {
        issues: env.error.issues.length,
      });
      return { ok: false, reason: 'shape-mismatch' };
    }
    const payload = env.data.data ?? {
      content: env.data.content ?? '',
      mimeType: env.data.mimeType ?? '',
    };
    if (
      typeof payload.content !== 'string' ||
      payload.content.length === 0 ||
      typeof payload.mimeType !== 'string' ||
      payload.mimeType.length === 0
    ) {
      return { ok: false, reason: 'shape-mismatch' };
    }
    return {
      ok: true,
      content: payload.content,
      mimeType: payload.mimeType,
    };
  };
}
