// SPDX-License-Identifier: MIT
/**
 * Typed HTTP client for the backend master-resume endpoints.
 *
 * GET /api/v1/resume/master -> 200 (resume) | 404 (not created yet)
 * PUT /api/v1/resume/master -> 200 | 400 (validation) | 401
 *
 * Responses are validated with MasterResumeResponseSchema; shape drift
 * surfaces as `'shape-mismatch'` so downstream consumers can log and fall
 * back without poisoning the autofill pipeline.
 *
 * Authentication and 401 recovery are delegated to the shared `fetchAuthed`
 * helper. This client never touches access tokens directly.
 */

import { z } from 'zod';
import type { Logger } from '../log';
import type { FetchAuthed } from '../auth';
import {
  ApiEnvelopeSchema,
  MasterResumeResponseSchema,
  MasterResumeUpsertSchema,
  type MasterResumeResponse,
  type MasterResumeUpsert,
} from './master-resume-schema';

export type MasterResumeGetOutcome =
  | { readonly kind: 'ok'; readonly resume: MasterResumeResponse }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'shape-mismatch'; readonly issues: number }
  | { readonly kind: 'network-error'; readonly message: string }
  | { readonly kind: 'api-error'; readonly status: number };

export type MasterResumePutOutcome =
  | { readonly kind: 'ok'; readonly resume: MasterResumeResponse }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'validation-error'; readonly issues: readonly string[] }
  | { readonly kind: 'shape-mismatch'; readonly issues: number }
  | { readonly kind: 'network-error'; readonly message: string }
  | { readonly kind: 'api-error'; readonly status: number };

export interface MasterResumeClientDeps {
  readonly fetchAuthed: FetchAuthed;
  readonly logger: Logger;
  readonly endpoint: string;
}

function unwrapEnvelope(body: unknown): unknown {
  const env = ApiEnvelopeSchema.safeParse(body);
  if (env.success) return env.data.data;
  return body;
}

export function createMasterResumeClient(deps: MasterResumeClientDeps): {
  get: () => Promise<MasterResumeGetOutcome>;
  put: (payload: MasterResumeUpsert) => Promise<MasterResumePutOutcome>;
} {
  async function parseJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    async get(): Promise<MasterResumeGetOutcome> {
      const result = await deps.fetchAuthed(deps.endpoint, { method: 'GET' });
      if (result.kind === 'unauthenticated') return { kind: 'unauthenticated' };
      if (result.kind === 'network-error') {
        return { kind: 'network-error', message: result.error.message };
      }
      const res = result.response;
      if (res.status === 404) return { kind: 'not-found' };
      if (!res.ok) return { kind: 'api-error', status: res.status };
      const body = await parseJson(res);
      const payload = unwrapEnvelope(body);
      const parsed = MasterResumeResponseSchema.safeParse(payload);
      if (!parsed.success) {
        deps.logger.warn('master-resume: shape drift on GET', {
          issues: parsed.error.issues.length,
        });
        return { kind: 'shape-mismatch', issues: parsed.error.issues.length };
      }
      return { kind: 'ok', resume: parsed.data };
    },

    async put(payload: MasterResumeUpsert): Promise<MasterResumePutOutcome> {
      const validated = MasterResumeUpsertSchema.safeParse(payload);
      if (!validated.success) {
        return {
          kind: 'validation-error',
          issues: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        };
      }
      const result = await deps.fetchAuthed(deps.endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validated.data),
      });
      if (result.kind === 'unauthenticated') return { kind: 'unauthenticated' };
      if (result.kind === 'network-error') {
        return { kind: 'network-error', message: result.error.message };
      }
      const res = result.response;
      if (res.status === 400) {
        const body = await parseJson(res);
        const issues = extractValidationIssues(body);
        return { kind: 'validation-error', issues };
      }
      if (!res.ok) return { kind: 'api-error', status: res.status };
      const body = await parseJson(res);
      const envPayload = unwrapEnvelope(body);
      const parsed = MasterResumeResponseSchema.safeParse(envPayload);
      if (!parsed.success) {
        return { kind: 'shape-mismatch', issues: parsed.error.issues.length };
      }
      return { kind: 'ok', resume: parsed.data };
    },
  };
}

const ValidationErrorBody = z.object({
  error: z.union([
    z.object({ message: z.string() }),
    z.object({ details: z.array(z.object({ path: z.string().optional(), message: z.string() })) }),
  ]).optional(),
  message: z.string().optional(),
});

function extractValidationIssues(body: unknown): readonly string[] {
  const parsed = ValidationErrorBody.safeParse(body);
  if (!parsed.success) return ['validation failed'];
  const err = parsed.data.error;
  if (err && 'details' in err && Array.isArray(err.details)) {
    return err.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message));
  }
  if (err && 'message' in err) return [err.message];
  if (parsed.data.message) return [parsed.data.message];
  return ['validation failed'];
}
