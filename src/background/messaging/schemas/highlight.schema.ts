// SPDX-License-Identifier: MIT
/**
 * Highlight schemas. A9 content script registers APPLY and CLEAR handlers;
 * A5 bg declares the types and registers STATUS (read of per-tab map).
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';

export const HighlightApplyRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const HighlightApplyResponseSchema = defineDiscriminatedUnion(
  'HighlightApplyResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        keywordCount: z.number().int().nonnegative(),
        rangeCount: z.number().int().nonnegative(),
        tookMs: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        reason: z.enum([
          'signed-out',
          'no-jd-on-page',
          'not-a-job-posting',
          'api-error',
          'rate-limited',
          'network-error',
          'no-tab',
          'render-error',
        ]),
      })
      .strict(),
  ]),
);

export const HighlightClearRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const HighlightClearResponseSchema = defineDiscriminatedUnion(
  'HighlightClearResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        cleared: z.boolean(),
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

export const HighlightStatusRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const HighlightStatusSchema = z
  .object({
    on: z.boolean(),
    keywordCount: z.number().int().nonnegative(),
    appliedAt: z.number().int().nullable(),
  })
  .strict();

export type HighlightApplyResponse = z.infer<typeof HighlightApplyResponseSchema>;
export type HighlightClearResponse = z.infer<typeof HighlightClearResponseSchema>;
export type HighlightStatus = z.infer<typeof HighlightStatusSchema>;
