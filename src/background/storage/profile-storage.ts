// SPDX-License-Identifier: MIT
/**
 * Legacy profile-storage surface.
 *
 * This file now delegates to the A7 `src/background/profile/` adapter, which
 * is the canonical read/write surface for `chrome.storage.local[llmc.profile.v1]`.
 * The wrapper is preserved so existing callers that imported `readProfile`,
 * `writeProfile`, `clearProfile`, or `deepMergeProfile` from this path
 * continue to work without a cascading rewrite.
 *
 * New code should import from `../profile` directly; a follow-up phase will
 * delete this wrapper when every consumer is migrated.
 */

import type { Profile } from '../messaging/schemas/profile.schema';
import { createLogger } from '../log';
import { LOG_SCOPES } from '../config';
import {
  createProfileStorage,
  type ProfileStorage,
  type ChromeStorageLocal,
} from '../profile/profile-storage';

export { deepMergeProfile } from '../profile/profile-merge';

const chromeStorageAdapter: ChromeStorageLocal = {
  get: async (key) => {
    const result = await chrome.storage.local.get(key);
    return result as Record<string, unknown>;
  },
  set: async (items) => {
    await chrome.storage.local.set(items);
  },
  remove: async (key) => {
    await chrome.storage.local.remove(key);
  },
};

const adapter: ProfileStorage = createProfileStorage({
  storage: chromeStorageAdapter,
  logger: createLogger(LOG_SCOPES.storage + '.profile'),
  now: () => Date.now(),
});

export async function readProfile(): Promise<Profile | null> {
  return adapter.read();
}

export async function writeProfile(p: Profile): Promise<void> {
  await adapter.write(p);
}

export async function clearProfile(): Promise<void> {
  await adapter.clear();
}
