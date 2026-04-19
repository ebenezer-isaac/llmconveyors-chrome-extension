// SPDX-License-Identifier: MIT
/**
 * Blueprint for the extension auth module (A6).
 *
 * This blueprint is the source of truth for the module's public surface,
 * invariants, and known issues. The validator
 * (`scripts/validate-blueprints.ts`) cross-checks every field against the
 * actual source tree.
 */

import type { ModuleBlueprint } from '../../_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'background/auth',
  label: 'Extension Auth Flow',
  description:
    'Native Chrome OAuth leveraging chrome.identity.getAuthToken, ' +
    'exchanging with backend, and seamlessly synchronizing the resulting SuperTokens session ' +
    'into Chrome\'s native cookie jar. Also watches cookies to broadcast AUTH_STATE_CHANGED.',
  category: 'auth',
  publicExports: [
    'AuthError',
    'AuthCancelledError',
    'AuthNetworkError',
    'AuthProviderError',
    'AuthMalformedResponseError',
    'AuthStorageError',
    'decodeJwtPayload',
    'extractUserIdFromJwt',
    'registerCookieWatcher',
    'createFetchAuthed',
    'AUTH_MODULE_BLUEPRINT',
    'blueprint',
  ],
  forbiddenImports: [
    'entrypoints/popup',
    'entrypoints/sidepanel',
    'entrypoints/options',
    '@webext-core/messaging',
  ],
  messageHandlers: [],
    {
      id: 'AUTH-002',
      description:
        'JWT payload decoder must NOT verify signature client-side; userId is ' +
        'extracted from token claims only after exchange succeeds.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'jwt-decode.ts comments + tests',
      },
      sourceRef: { file: 'jwt-decode.ts', line: 1 },
    },
    {
      id: 'AUTH-003',
      description:
        'Cookie watcher only reacts to relevant auth cookie domain/name and ' +
        'suppresses overwrite rotation pairs to avoid false sign-out loops.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'cookie-watcher event filtering + overwrite suppression tests',
      },
      sourceRef: { file: 'cookie-watcher.ts', line: 1 },
    },
  ],
  knownIssues: [],
};

/** Machine-readable alias used by A6-specific consumers. */
export const AUTH_MODULE_BLUEPRINT = blueprint;
