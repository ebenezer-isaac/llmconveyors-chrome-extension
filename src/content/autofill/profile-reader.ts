// SPDX-License-Identifier: MIT
/**
 * Direct chrome.storage.local read of the user profile.
 *
 * Per D3 (2026-04-11), A8 consumes A7's FULL Profile shape (nested
 * basics.*, profileVersion, ...). A8 uses ProfileSchema.safeParse() from
 * ats-autofill-engine/profile to validate the stored record; a parse
 * failure yields `null`, which the controller treats as no-profile.
 */

import type { Profile } from 'ats-autofill-engine/profile';
import { ProfileSchema } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';

export interface ProfileReaderDeps {
  readonly logger: Logger;
  readonly storageGet: (key: string) => Promise<Record<string, unknown>>;
}

export const PROFILE_STORAGE_KEY = 'llmc.profile.v1';

/**
 * Read the profile. Returns null if no profile is stored, if the storage
 * read rejects, or if the stored record fails ProfileSchema validation.
 *
 * NEVER throws. All error paths log and return null.
 */
export async function readProfile(
  deps: ProfileReaderDeps,
): Promise<Profile | null> {
  let raw: Record<string, unknown>;
  try {
    raw = await deps.storageGet(PROFILE_STORAGE_KEY);
  } catch (err: unknown) {
    deps.logger.error('chrome.storage.local.get failed', err, {
      key: PROFILE_STORAGE_KEY,
    });
    return null;
  }

  const record = raw[PROFILE_STORAGE_KEY];
  if (record === undefined || record === null) {
    deps.logger.debug('no profile stored', { key: PROFILE_STORAGE_KEY });
    return null;
  }

  const parsed = ProfileSchema.safeParse(record);
  if (!parsed.success) {
    deps.logger.warn('stored profile failed ProfileSchema validation', {
      key: PROFILE_STORAGE_KEY,
      issueCount: parsed.error.issues.length,
      firstIssue: parsed.error.issues[0]?.path.join('.') ?? '<unknown>',
      firstMessage: parsed.error.issues[0]?.message ?? '<unknown>',
    });
    return null;
  }

  return parsed.data;
}

/**
 * Whether the profile has ENOUGH data to attempt a fill.
 *
 * Gate checks basics.firstName OR basics.email (after trim). If BOTH are
 * missing or whitespace only, the controller aborts with reason
 * 'profile-missing'.
 */
export function isEmptyProfile(p: Profile | null): boolean {
  if (!p) return true;
  const firstName = p.basics.firstName?.trim() ?? '';
  const email = p.basics.email?.trim() ?? '';
  return firstName.length === 0 && email.length === 0;
}
