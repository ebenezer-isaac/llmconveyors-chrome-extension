// SPDX-License-Identifier: MIT
/**
 * Profile storage adapter -- the single read/write surface for
 * `chrome.storage.local['llmc.profile.v1']`.
 *
 * D20 DI: the factory `createProfileStorage(deps)` takes every side-effect
 * (chrome storage calls, logger, clock) as an injected dependency so unit
 * tests can hand in fakes without module-level mock state. Production code
 * imports the module-level `profileStorage` singleton, which wires the real
 * `chrome.storage.local`, `createLogger`, and `Date.now`.
 *
 * D21: every read runs `ProfileSchema.safeParse` (corrupt storage returns
 * null rather than throwing -- the service worker must not crash on junk).
 * Every write runs `ProfileSchema.parse` as a last line of defence against
 * a buggy caller, then stamps `updatedAtMs: now()` so downstream consumers
 * (including the options-page React key) know the record was just written.
 *
 * The `update()` method takes a deep-partial patch; it reads the current
 * record (or creates an empty-profile fallback), deep-merges the patch via
 * `deepMergeProfile`, stamps `updatedAtMs`, and writes. Returns the merged
 * profile so React callers can optimistically update state without a
 * second read.
 */

import {
  ProfileSchema,
  type Profile,
  type DeepPartial,
} from '../messaging/schemas/profile.schema';
import type { Logger } from '../log';
import { deepMergeProfile, scanForbiddenKeys } from './profile-merge';
import { migrateProfile, CURRENT_PROFILE_VERSION } from './profile-migration';

export const PROFILE_STORAGE_KEY = 'llmc.profile.v1';

/**
 * Minimal `chrome.storage.local`-compatible surface. Accepts any object with
 * `get(key)`, `set(items)`, `remove(key)` returning Promises. Real chrome
 * APIs return Promises in MV3 Chrome 88+; older callback-style APIs are not
 * supported.
 */
export interface ChromeStorageLocal {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ProfileStorageDeps {
  readonly storage: ChromeStorageLocal;
  readonly logger: Logger;
  readonly now: () => number;
}

export interface ProfileStorage {
  read(): Promise<Profile | null>;
  write(profile: Profile): Promise<Profile>;
  update(patch: DeepPartial<Profile>): Promise<Profile>;
  clear(): Promise<void>;
}

/**
 * Compose an empty Profile. Lives in the adapter so the options page can
 * render a form against a known-valid shape before the user has uploaded
 * anything.
 */
export function createEmptyProfile(nowMs: number): Profile {
  return {
    profileVersion: CURRENT_PROFILE_VERSION,
    updatedAtMs: nowMs,
    basics: {
      firstName: '',
      lastName: '',
      email: 'unknown@example.com',
      phone: '',
      location: { city: '', region: '', countryCode: '', postalCode: '' },
      website: '',
      linkedin: '',
      github: '',
    },
    work: [],
    education: [],
    skills: [],
  };
}

export function createProfileStorage(deps: ProfileStorageDeps): ProfileStorage {
  const { storage, logger, now } = deps;

  async function read(): Promise<Profile | null> {
    let raw: unknown;
    try {
      const record = await storage.get(PROFILE_STORAGE_KEY);
      raw = record[PROFILE_STORAGE_KEY];
    } catch (err) {
      logger.error('profile read: storage.get threw', err, {
        key: PROFILE_STORAGE_KEY,
      });
      return null;
    }
    if (raw === undefined || raw === null) return null;
    const migrated = migrateProfile(raw, { logger });
    if (migrated === null) return null;
    const parsed = ProfileSchema.safeParse(migrated);
    if (!parsed.success) {
      logger.warn('profile read: schema rejected stored record', {
        issueCount: parsed.error.issues.length,
      });
      return null;
    }
    return parsed.data;
  }

  async function write(profile: Profile): Promise<Profile> {
    const forbidden = scanForbiddenKeys(profile as unknown);
    if (forbidden !== null) {
      throw new Error(`profile write rejected: ${forbidden}`);
    }
    const parsed = ProfileSchema.safeParse(profile);
    if (!parsed.success) {
      throw new Error(
        `profile write rejected by schema: ${parsed.error.issues.length} issue(s)`,
      );
    }
    const stamped: Profile = { ...parsed.data, updatedAtMs: now() };
    try {
      await storage.set({ [PROFILE_STORAGE_KEY]: stamped });
    } catch (err) {
      logger.error('profile write: storage.set threw', err, {
        key: PROFILE_STORAGE_KEY,
      });
      throw err;
    }
    logger.debug('profile persisted', {
      updatedAtMs: stamped.updatedAtMs,
      profileVersion: stamped.profileVersion,
    });
    return stamped;
  }

  async function update(patch: DeepPartial<Profile>): Promise<Profile> {
    const forbidden = scanForbiddenKeys(patch as unknown);
    if (forbidden !== null) {
      throw new Error(`profile update rejected: ${forbidden}`);
    }
    const existing = (await read()) ?? createEmptyProfile(now());
    const merged = deepMergeProfile<Profile>(existing, patch);
    return write(merged);
  }

  async function clear(): Promise<void> {
    try {
      await storage.remove(PROFILE_STORAGE_KEY);
      logger.info('profile cleared', { key: PROFILE_STORAGE_KEY });
    } catch (err) {
      logger.error('profile clear: storage.remove threw', err, {
        key: PROFILE_STORAGE_KEY,
      });
      throw err;
    }
  }

  return Object.freeze({ read, write, update, clear });
}
