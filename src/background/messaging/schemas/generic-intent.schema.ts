// SPDX-License-Identifier: MIT
/**
 * GENERIC_INTENT_DETECT schemas.
 *
 * When the popup opens on a URL that is NOT in the adapter host list
 * (Greenhouse / Lever / Workday), it asks the background to run a one-shot
 * scan against the active tab via chrome.scripting.executeScript. The scanner
 * delegates to the engine's `extractJobDescription(doc)` (JSON-LD first,
 * readability fallback) and surfaces the text + detection method back to the
 * popup so the Generate flow can proceed without a matching adapter.
 *
 * For B2B Sales, the same infrastructure is used to detect "this looks like a
 * company page". The generic scanner returns a `companySignal` block in that
 * case: presence of JSON-LD Organization, plausible about / contact links, or
 * corporate-looking domain.
 */

import { z } from 'zod';

export const GenericIntentDetectRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    agent: z.enum(['job-hunter', 'b2b-sales']),
  })
  .strict();

export const GenericJdResultSchema = z
  .object({
    kind: z.literal('job-description'),
    text: z.string().min(1).max(100_000),
    method: z.enum(['jsonld', 'readability']),
    jobTitle: z.string().max(500).optional(),
    company: z.string().max(500).optional(),
    url: z.string().url().max(2048),
  })
  .strict();

export const GenericCompanyResultSchema = z
  .object({
    kind: z.literal('company-page'),
    url: z.string().url().max(2048),
    signals: z.array(
      z.enum(['jsonld-organization', 'about-link', 'contact-link', 'corp-host']),
    ).max(8),
    companyName: z.string().max(500).optional(),
  })
  .strict();

export const GenericIntentDetectResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      result: z.union([GenericJdResultSchema, GenericCompanyResultSchema]),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum([
        'no-match',
        'no-tab',
        'script-inject-failed',
        'invalid-payload',
        'permission-denied',
      ]),
    })
    .strict(),
]);

export type GenericIntentDetectRequest = z.infer<typeof GenericIntentDetectRequestSchema>;
export type GenericIntentDetectResponse = z.infer<typeof GenericIntentDetectResponseSchema>;
export type GenericJdResult = z.infer<typeof GenericJdResultSchema>;
export type GenericCompanyResult = z.infer<typeof GenericCompanyResultSchema>;
