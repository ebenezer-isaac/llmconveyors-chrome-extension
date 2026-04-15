// SPDX-License-Identifier: MIT
/**
 * Runtime Zod guards for messages arriving from the background. Per D21 the
 * IPC boundary is untrusted from the content script's perspective, so we
 * validate the shape before acting on it even though TypeScript already
 * types it.
 *
 * The schema mirrors `KeywordsExtractResponseSchema` from
 * `src/background/messaging/schemas/keywords.schema.ts`. Kept as a local
 * copy so the content-script bundle does not pull the full schemas tree.
 */

import { z } from 'zod';

const ExtractedSkillGuard = z
  .object({
    term: z.string().min(1).max(200),
    category: z.enum(['hard', 'soft', 'tool', 'domain']),
    score: z.number().min(0).max(1),
    occurrences: z.number().int().nonnegative(),
    canonicalForm: z.string().min(1).max(200),
  })
  .strict();

export const KeywordsExtractResponseGuard = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      keywords: z.array(ExtractedSkillGuard).max(500),
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
]);

export type GuardedKeywordsResponse = z.infer<typeof KeywordsExtractResponseGuard>;
