// SPDX-License-Identifier: MIT
/**
 * Public barrel for the A7 profile module.
 *
 * Downstream callers (message handlers, the options page, future content
 * scripts) import from this path only. Implementation files are not part
 * of the public contract.
 */

export {
  PROFILE_STORAGE_KEY,
  createProfileStorage,
  createEmptyProfile,
} from './profile-storage';
export type {
  ChromeStorageLocal,
  ProfileStorage,
  ProfileStorageDeps,
} from './profile-storage';

export { deepMergeProfile, scanForbiddenKeys } from './profile-merge';

export {
  migrateProfile,
  CURRENT_PROFILE_VERSION,
} from './profile-migration';
export type { ProfileMigrationDeps } from './profile-migration';

export {
  jsonResumeToProfile,
  profileToJsonResume,
  roundTripProfile,
} from './json-resume-converter';
export type {
  ConvertOk,
  ConvertError,
  ConvertResult,
  JsonResumeExport,
} from './json-resume-converter';

export { blueprint, PROFILE_MODULE_BLUEPRINT } from './blueprint';
