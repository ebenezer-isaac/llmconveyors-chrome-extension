// SPDX-License-Identifier: MIT
/**
 * KEYWORDS_EXTRACT schemas. A5 bg handler POSTs to
 * /api/v1/ats/extract-skills and validates the response envelope before
 * handing keywords back to the content script.
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';

export const ExtractedSkillSchema = z
  .object({
    term: z.string().min(1).max(200),
    category: z.enum(['hard', 'soft', 'tool', 'domain']),
    score: z.number().min(0).max(1),
    occurrences: z.number().int().nonnegative(),
    canonicalForm: z.string().min(1).max(200),
  })
  .strict();

export const KeywordsExtractRequestSchema = z
  .object({
    text: z.string().min(1).max(50_000),
    url: z.string().url().max(2048),
    topK: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const KeywordsExtractResponseSchema = defineDiscriminatedUnion(
  'KeywordsExtractResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        keywords: z.array(ExtractedSkillSchema).max(500),
        tookMs: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        reason: z.enum([
          'signed-out',
          'empty-text',
          'api-error',
          'rate-limited',
          'network-error',
        ]),
      })
      .strict(),
  ]),
);

export const ExtractSkillsBackendResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      keywords: z.array(ExtractedSkillSchema).max(500),
      missing: z.array(ExtractedSkillSchema).max(500).optional(),
      tookMs: z.number().int().nonnegative(),
    }),
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .strict();

export type ExtractedSkill = z.infer<typeof ExtractedSkillSchema>;
export type KeywordsExtractRequest = z.infer<typeof KeywordsExtractRequestSchema>;
export type KeywordsExtractResponse = z.infer<typeof KeywordsExtractResponseSchema>;
