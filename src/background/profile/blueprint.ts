// SPDX-License-Identifier: MIT
/**
 * Blueprint for the A7 profile module.
 *
 * The profile module owns the single read/write surface for
 * `chrome.storage.local['llmc.profile.v1']` plus the JSON Resume
 * conversion. A5's messaging handlers consume this module via DI;
 * the options page consumes it via its React hook.
 *
 * This blueprint is the source of truth for the module's public surface
 * and invariants. The validator (`scripts/validate-blueprints.ts`)
 * cross-checks every field against the actual source tree.
 */

import type { ModuleBlueprint } from '../../_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'background/profile',
  label: 'Profile Storage Adapter + JSON Resume',
  description:
    'Owns chrome.storage.local[llmc.profile.v1] reads/writes with Zod ' +
    'validation on both sides. Provides deep-merge patching, JSON Resume ' +
    'v1 ingestion, reverse export, and a version migrator for forward ' +
    'compatibility. Every side-effect flows through an injected dependency ' +
    '(D20). Every write stamps updatedAtMs so React consumers can key on ' +
    'storage changes (D10).',
  category: 'profile',
  publicExports: [
    'PROFILE_STORAGE_KEY',
    'createProfileStorage',
    'createEmptyProfile',
    'deepMergeProfile',
    'scanForbiddenKeys',
    'migrateProfile',
    'CURRENT_PROFILE_VERSION',
    'jsonResumeToProfile',
    'profileToJsonResume',
    'roundTripProfile',
    'blueprint',
    'PROFILE_MODULE_BLUEPRINT',
  ],
  forbiddenImports: [
    'entrypoints/popup',
    'entrypoints/sidepanel',
    'entrypoints/options',
    '@webext-core/messaging',
  ],
  messageHandlers: [],
  invariants: [
    {
      id: 'PROFILE-001',
      description:
        'Every write path runs ProfileSchema.parse (or safeParse ' +
        'equivalent) before chrome.storage.local.set. A buggy caller cannot ' +
        'poison storage with an off-schema record.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-storage.ts write() + unit tests',
      },
      sourceRef: { file: 'profile-storage.ts', line: 1 },
    },
    {
      id: 'PROFILE-002',
      description:
        'Every write path stamps updatedAtMs from the injected now(). ' +
        'The value is monotonically non-decreasing in production because ' +
        'Date.now() is; tests can control it via the deps object.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-storage.ts write() + unit tests',
      },
      sourceRef: { file: 'profile-storage.ts', line: 1 },
    },
    {
      id: 'PROFILE-003',
      description:
        'Forbidden keys (__proto__, constructor, prototype) are rejected ' +
        'at every depth on read, write, and update. Prototype pollution ' +
        'via a crafted PROFILE_UPDATE patch cannot reach storage.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-merge.ts scanForbiddenKeys + unit tests',
      },
      sourceRef: { file: 'profile-merge.ts', line: 1 },
    },
    {
      id: 'PROFILE-004',
      description:
        'Read path returns null (never throws) for absent, corrupt, or ' +
        'unsupported-version records. Downstream handlers surface this as ' +
        "{ ok: false, reason: 'not-found' } rather than crashing the " +
        'service worker.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-storage.ts read() + unit tests',
      },
      sourceRef: { file: 'profile-storage.ts', line: 1 },
    },
    {
      id: 'PROFILE-005',
      description:
        'migrateProfile only accepts supported versions (currently 1.0). ' +
        'Unknown versions return null so the caller treats the record as ' +
        'corrupt and the user is prompted to re-upload.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-migration.ts + unit tests',
      },
      sourceRef: { file: 'profile-migration.ts', line: 1 },
    },
  ],
  knownIssues: [],
};

/** Machine-readable alias for tooling that walks the blueprint array. */
export const PROFILE_MODULE_BLUEPRINT = blueprint;
