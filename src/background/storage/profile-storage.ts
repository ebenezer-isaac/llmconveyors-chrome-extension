// SPDX-License-Identifier: MIT
/**
 * Profile storage adapter over chrome.storage.local['llmc.profile.v1'].
 *
 * Read path validates with ProfileSchema. Write path re-validates as
 * defense-in-depth so a buggy caller cannot poison storage.
 */

import {
  ProfileSchema,
  type Profile,
} from '../messaging/schemas/profile.schema';
import { STORAGE_KEYS, LOG_SCOPES } from '../config';
import { createLogger } from './../log';

const logger = createLogger(LOG_SCOPES.storage + '.profile');

export async function readProfile(): Promise<Profile | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.profile);
  const value = raw[STORAGE_KEYS.profile];
  if (value === undefined || value === null) return null;
  const parsed = ProfileSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('readProfile: invalid stored shape', {
      issueCount: parsed.error.issues.length,
    });
    return null;
  }
  return parsed.data;
}

export async function writeProfile(p: Profile): Promise<void> {
  const parsed = ProfileSchema.safeParse(p);
  if (!parsed.success) {
    throw new Error(`writeProfile: invalid Profile shape: ${parsed.error.message}`);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.profile]: parsed.data });
}

export async function clearProfile(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.profile);
}

/**
 * Deep merge a partial patch onto a base profile. Scalars in the patch
 * REPLACE the base; arrays REPLACE the base; nested objects are merged
 * recursively. __proto__ / constructor / prototype keys are skipped.
 */
export function deepMergeProfile<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (patch === null) return null as unknown as T;
  if (typeof patch !== 'object') return patch as T;
  if (Array.isArray(patch)) return patch as unknown as T;
  if (
    base === null ||
    base === undefined ||
    typeof base !== 'object' ||
    Array.isArray(base)
  ) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(patch as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = (patch as Record<string, unknown>)[key];
    }
    return out as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch as object)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const patchValue = (patch as Record<string, unknown>)[key];
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] = deepMergeProfile(baseValue, patchValue);
  }
  return result as T;
}
