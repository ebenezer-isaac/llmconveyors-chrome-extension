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
    'Client-side auth handshake: launchWebAuthFlow -> chromiumapp.org ' +
    'redirect -> fragment parse -> JWT userId extract -> StoredSession ' +
    'persist -> AUTH_STATE_CHANGED broadcast. Owns zero ProtocolMap keys ' +
    "(A5 owns them) and is a client of A5's storage + broadcast surface. " +
    'Every external effect flows through an injected dependency (D20).',
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
    'parseAuthFragment',
    'MAX_FUTURE_EXPIRY_MS',
    'buildSignInUrl',
    'classifyLaunchError',
    'launchWebAuthFlow',
    'defaultWebAuthFlowDeps',
    'defaultParseAuthFragmentDeps',
    'DEFAULT_BRIDGE_URL',
    'buildDefaultSignInDeps',
    'buildStoredSession',
    'createSignInOrchestrator',
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
  invariants: [
    {
      id: 'AUTH-001',
      description:
        'Fragment parser rejects any redirect URL whose host is not ' +
        '<extensionId>.chromiumapp.org with a 32-char a-p extension id.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'parseAuthFragment host regex + unit tests',
      },
      sourceRef: { file: 'parse-auth-fragment.ts', line: 1 },
    },
    {
      id: 'AUTH-002',
      description:
        'JWT payload decoder must NOT verify the signature; that is the ' +
        "server bridge endpoint's responsibility. Attempting to verify " +
        'would require HMAC secrets that must not ship to the client.',
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
        'Sign-in orchestrator uses a module-level single-flight promise ' +
        'mutex so concurrent AUTH_SIGN_IN calls share one ' +
        'launchWebAuthFlow invocation.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'sign-in-orchestrator createSignInOrchestrator + tests',
      },
      sourceRef: { file: 'sign-in-orchestrator.ts', line: 1 },
    },
    {
      id: 'AUTH-004',
      description:
        'StoredSession expiresAt must be in the future and within 24h of ' +
        'now. Past or far-future values are treated as tampering.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'parseAuthFragment expiry clamp + unit tests',
      },
      sourceRef: { file: 'parse-auth-fragment.ts', line: 1 },
    },
    {
      id: 'AUTH-005',
      description:
        'Tokens must match /^[A-Za-z0-9._=+/-]+$/ and be between 20 and ' +
        '8192 chars. Any other character or length is rejected.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'parseAuthFragment token shape assertion + tests',
      },
      sourceRef: { file: 'parse-auth-fragment.ts', line: 1 },
    },
  ],
  knownIssues: [],
};

/** Machine-readable alias used by A6-specific consumers. */
export const AUTH_MODULE_BLUEPRINT = blueprint;
