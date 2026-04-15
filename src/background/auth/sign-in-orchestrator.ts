// SPDX-License-Identifier: MIT
/**
 * Sign-in orchestrator: coordinates the full client-side auth handshake.
 *
 * Flow:
 *   1. Launch the web auth flow against the A4 bridge page
 *   2. Parse the chromiumapp.org fragment into typed tokens
 *   3. Decode the JWT payload to extract userId
 *   4. Persist a StoredSession (A5's canonical shape) to chrome.storage.local
 *   5. Read back to verify the write
 *   6. Broadcast AUTH_STATE_CHANGED via the runtime
 *   7. Return the resolved AuthState
 *
 * Single-flight mutex: two concurrent calls share one launchWebAuthFlow
 * invocation. Chrome only permits one identity flow per extension at a
 * time; without the mutex the second call rejects with a confusing
 * provider-error wording.
 *
 * Full dependency injection (D20) so tests can exercise every branch with
 * fakes instead of module-level mock state.
 */

import type { StoredSession } from '../messaging/schemas/auth.schema';
import type { AuthState } from '../messaging/schemas/auth.schema';
import { createLogger, type Logger } from '../log';
import {
  defaultWebAuthFlowDeps,
  launchWebAuthFlow as realLaunchWebAuthFlow,
  type WebAuthFlowDeps,
} from './web-auth-flow';
import {
  defaultParseAuthFragmentDeps,
  parseAuthFragment,
  type ParseAuthFragmentDeps,
  type ParsedAuthFragment,
} from './parse-auth-fragment';
import { extractUserIdFromJwt } from './jwt-decode';
import {
  AuthError,
  AuthMalformedResponseError,
  AuthStorageError,
} from './errors';

const log = createLogger('bg.auth.signin');

/**
 * Default production bridge URL. Overridable via `WXT_BRIDGE_URL` build-time
 * env or the `bridgeUrl` dep field for tests.
 */
export const DEFAULT_BRIDGE_URL = 'https://llmconveyors.com/en/auth/extension-signin';

/**
 * StorageFacade is the subset of chrome.storage.local the orchestrator
 * actually needs. A5's session-storage module satisfies it for production;
 * tests supply an in-memory fake.
 */
export interface StorageFacade {
  readonly writeSession: (s: StoredSession) => Promise<void>;
  readonly readSession: () => Promise<StoredSession | null>;
}

/**
 * Broadcast adapter: mirrors A5's `HandlerBroadcast.sendRuntime` so the
 * orchestrator can fire AUTH_STATE_CHANGED the same way A5 does.
 */
export interface AuthBroadcast {
  readonly sendRuntime: (message: {
    readonly key: string;
    readonly data: unknown;
  }) => Promise<void>;
}

export interface SignInOrchestratorDeps {
  readonly webAuthFlow: WebAuthFlowDeps;
  readonly storage: StorageFacade;
  readonly broadcast: AuthBroadcast;
  readonly parseDeps: ParseAuthFragmentDeps;
  readonly logger: Logger;
  readonly now: () => number;
  readonly bridgeUrl: string;
  /**
   * Swappable launch entrypoint. Defaults to our wrapper that calls
   * `webAuthFlow.launchWebAuthFlow`. Tests can replace the whole function.
   * The third argument is the `interactive` flag forwarded to Chrome.
   */
  readonly launch: (
    bridgeUrl: string,
    webAuthFlow: WebAuthFlowDeps,
    interactive: boolean,
  ) => Promise<string>;
}

/** Options for a single sign-in attempt. */
export interface SignInAttemptOptions {
  /**
   * Controls `chrome.identity.launchWebAuthFlow`'s `interactive` flag.
   * Defaults to true; the popup passes false on mount for silent token
   * refresh.
   */
  readonly interactive?: boolean;
}

// Module-level single-flight mutex. Two concurrent callers share the same
// promise; cleared in `.finally()` so retries after cancel work.
let inflight: Promise<AuthState> | null = null;

/** Test-only mutex reset. Not exported from the barrel to production callers. */
export function __resetSignInMutex(): void {
  inflight = null;
}

/** Test-only inspection. */
export function __getSignInInflight(): Promise<AuthState> | null {
  return inflight;
}

/**
 * Build the token envelope that will be written to storage. Extracted so
 * tests can exercise the JWT-decode error path independently of I/O.
 */
export function buildStoredSession(
  parsed: ParsedAuthFragment,
): StoredSession {
  const userId = extractUserIdFromJwt(parsed.accessToken);
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    userId,
  };
}

/**
 * Run the full sign-in transaction under the mutex. Always re-throws
 * AuthError subtypes unchanged; wraps unexpected throws in AuthProviderError.
 */
async function runSignIn(
  deps: SignInOrchestratorDeps,
  interactive: boolean,
): Promise<AuthState> {
  deps.logger.info('sign-in: start', { interactive });

  const responseUrl = await deps.launch(deps.bridgeUrl, deps.webAuthFlow, interactive);

  let parsed: ParsedAuthFragment;
  try {
    parsed = parseAuthFragment(responseUrl, deps.parseDeps);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthMalformedResponseError(
      'parseAuthFragment threw a non-AuthError',
      err,
    );
  }

  let candidate: StoredSession;
  try {
    candidate = buildStoredSession(parsed);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthMalformedResponseError(
      'buildStoredSession failed',
      err,
    );
  }

  try {
    await deps.storage.writeSession(candidate);
  } catch (err) {
    deps.logger.error('sign-in: writeSession failed', err);
    throw new AuthStorageError(
      'Failed to persist session to chrome.storage.local',
      err,
    );
  }

  // Defense-in-depth read-back: catch any silent data loss in the storage
  // layer before we broadcast a claim we cannot back up.
  const verify = await deps.storage.readSession();
  if (
    verify === null ||
    verify.accessToken !== candidate.accessToken ||
    verify.userId !== candidate.userId ||
    verify.expiresAt !== candidate.expiresAt
  ) {
    throw new AuthStorageError(
      'writeSession succeeded but readSession returned a mismatched record',
    );
  }

  const nextState: AuthState = { signedIn: true, userId: verify.userId };

  try {
    await deps.broadcast.sendRuntime({
      key: 'AUTH_STATE_CHANGED',
      data: nextState,
    });
  } catch (err) {
    // A broadcast failure must not roll back a successful sign-in; log and
    // continue. Consumers that mount later will resync via AUTH_STATUS.
    deps.logger.warn('sign-in: AUTH_STATE_CHANGED broadcast failed', {
      error: String(err),
    });
  }

  deps.logger.info('sign-in: success', { userId: verify.userId });
  return nextState;
}

/**
 * Factory. Returns a function bound to `deps` that accepts optional attempt
 * options (currently just the interactive flag). Used by tests to create a
 * controlled orchestrator with fakes.
 */
export function createSignInOrchestrator(
  deps: SignInOrchestratorDeps,
): (opts?: SignInAttemptOptions) => Promise<AuthState> {
  return async function boundSignIn(
    opts?: SignInAttemptOptions,
  ): Promise<AuthState> {
    if (inflight !== null) {
      deps.logger.debug('sign-in: mutex hit, awaiting existing flight');
      return inflight;
    }
    const interactive = opts?.interactive !== false;
    const promise = runSignIn(deps, interactive).finally(() => {
      inflight = null;
    });
    inflight = promise;
    return promise;
  };
}

/** Production deps: wires the real browser.identity + chrome.storage.local. */
export function buildDefaultSignInDeps(
  storage: StorageFacade,
  broadcast: AuthBroadcast,
  bridgeUrl: string = DEFAULT_BRIDGE_URL,
): SignInOrchestratorDeps {
  return {
    webAuthFlow: defaultWebAuthFlowDeps,
    storage,
    broadcast,
    parseDeps: defaultParseAuthFragmentDeps,
    logger: log,
    now: () => Date.now(),
    bridgeUrl,
    launch: realLaunchWebAuthFlow,
  };
}
