// SPDX-License-Identifier: MIT
/**
 * Intent message schemas. Intent is the content-script's detection of what
 * kind of page the user is on (job posting vs application form).
 */

import { z } from 'zod';

export const AtsKindSchema = z.enum(['greenhouse', 'lever', 'workday', 'unknown']);

export const DetectedIntentSchema = z
  .object({
    kind: AtsKindSchema,
    pageKind: z.enum(['job-posting', 'application-form']),
    url: z.string().url().max(2048),
    jobTitle: z.string().max(500).optional(),
    company: z.string().max(500).optional(),
    detectedAt: z.number().int().nonnegative(),
  })
  .strict();

export const DetectedIntentPayloadSchema = z
  .object({
    tabId: z.number().int().refine((n) => n >= -1 && n < 2 ** 31, {
      message: 'tabId out of range',
    }),
    url: z.string().url().max(2048),
    kind: AtsKindSchema,
    pageKind: z.enum(['job-posting', 'application-form']),
    company: z.string().max(500).optional(),
    jobTitle: z.string().max(500).optional(),
    detectedAt: z.number().int().nonnegative(),
  })
  .strict();

export const IntentGetRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const IntentGetResponseSchema = z.union([DetectedIntentSchema, z.null()]);

export const DetectedJobBroadcastSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    intent: DetectedIntentSchema,
  })
  .strict();

export type DetectedIntent = z.infer<typeof DetectedIntentSchema>;
export type DetectedIntentPayload = z.infer<typeof DetectedIntentPayloadSchema>;
