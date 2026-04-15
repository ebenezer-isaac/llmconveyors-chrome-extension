// SPDX-License-Identifier: MIT
/**
 * FILL_REQUEST schemas. The background forwards the request to the content
 * script via chrome.tabs.sendMessage; the content script returns the result.
 */

import { z } from 'zod';
import { defineDiscriminatedUnion } from './define-discriminated-union';

export const FillRequestSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    url: z.string().url().max(2048),
  })
  .strict();

const FilledEntrySchema = z
  .object({
    ok: z.boolean(),
    selector: z.string().max(1000),
    value: z.string().max(10_000),
    fieldType: z.string().max(64),
  })
  .strict();

const FailedEntrySchema = z
  .object({
    selector: z.string().max(1000),
    reason: z.string().max(500),
  })
  .strict();

export const FillRequestResponseSchema = defineDiscriminatedUnion(
  'FillRequestResponse',
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        planId: z.string().min(1).max(128),
        executedAt: z.string().max(64),
        filled: z.array(FilledEntrySchema).max(500),
        skipped: z.array(FilledEntrySchema).max(500),
        failed: z.array(FailedEntrySchema).max(500),
        aborted: z.literal(false),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        aborted: z.literal(true),
        abortReason: z.enum([
          'profile-missing',
          'no-adapter',
          'no-form',
          'scan-failed',
          'plan-failed',
          'content-script-not-loaded',
          'no-tab',
        ]),
      })
      .strict(),
  ]),
);

export type FillRequestResponse = z.infer<typeof FillRequestResponseSchema>;
