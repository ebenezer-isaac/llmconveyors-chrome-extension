// SPDX-License-Identifier: MIT
/**
 * Profile storage version migrator.
 *
 * Today only version 1.0 is supported. The function shape is in place so
 * when a breaking shape change lands we can add `case '2.0'` without
 * touching callers. Every migration is pure: takes a raw object, returns
 * a new object with `profileVersion` stamped forward.
 *
 * Behaviour:
 *   - if `raw` is not a plain object -> null
 *   - if `raw.profileVersion === '1.0'` -> returned unchanged
 *   - any other version -> null (unknown shape, caller treats as corrupt)
 */

import type { Logger } from '../log';

const SUPPORTED_VERSIONS: ReadonlySet<string> = new Set(['1.0']);
export const CURRENT_PROFILE_VERSION = '1.0';

export interface ProfileMigrationDeps {
  readonly logger: Logger;
}

/**
 * Inspect a raw storage record and coerce it to the current shape.
 * Returns `null` if the record is absent, non-object, or an unsupported
 * version. The caller is expected to run `ProfileSchema.safeParse` on the
 * result before persisting.
 */
export function migrateProfile(
  raw: unknown,
  deps: ProfileMigrationDeps,
): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    deps.logger.warn('migrateProfile: non-object raw record', {
      type: Array.isArray(raw) ? 'array' : typeof raw,
    });
    return null;
  }
  const record = raw as Record<string, unknown>;
  const version = record.profileVersion;
  if (typeof version !== 'string') {
    deps.logger.warn('migrateProfile: missing profileVersion, treating as corrupt');
    return null;
  }
  if (!SUPPORTED_VERSIONS.has(version)) {
    deps.logger.warn('migrateProfile: unsupported profile version', { version });
    return null;
  }
  // v1.0 is the current shape; nothing to migrate yet.
  return record;
}
