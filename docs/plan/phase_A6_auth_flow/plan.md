# Phase A6 - Extension Auth Flow (launchWebAuthFlow + fragment parsing + token storage)

**Plan**: 100-chrome-extension-mvp (v2.1)
**Phase code**: A6
**Track**: Extension (Track 3)
**Day**: 3 (2026-04-14)
**Executor context budget**: 64k
**Estimated effort**: 3-4 hours
**Confidence**: 9/10

**Supersedes**: the previous v1 A6 plan (graded C+ in `reviews/review-A6.md`).
**Authority**: `02-decisions-v2.1-final.md` + `03-keystone-contracts.md` (§1 AuthState + ProtocolMap, §1.4 RefreshManager deps, §10 imports table row for A6).
**Applies decisions**: D2 (A5 is sole ProtocolMap owner, A6 consumes), D4 (repo path `e:/llmconveyors-chrome-extension`), D11 (no `console.*`, use `createLogger`), D14 (anti-drift gates), D15 (no em-dashes), D19 (adversarial test categories), D20 (DI for every dependency), D22 (blueprint.contract.ts), D23 (rollback script).

---

## 0. Confidence + scope

**Confidence**: 9/10. Every contract A6 needs is locked: `AuthState` is a discriminated union in A5's `auth-state.ts` (keystone §1.2), A5 already ships `AUTH_SIGN_IN`/`AUTH_SIGN_OUT`/`AUTH_STATUS`/`AUTH_STATE_CHANGED` in the ProtocolMap (keystone §1.1), A5 exports `readTokens`/`writeTokens`/`clearTokens` as the only storage surface (A5 §6.6, keystone §1.4), and A5 provides `createLogger` (D11) and `clearAllTabState` (A5 §6.10). A6 is wiring a real `launchWebAuthFlow` driver + fragment parser + broadcast into A5's existing (stubbed) handler table. The only residual 1/10 is the edge-case around Chrome's `launchWebAuthFlow` rejecting concurrent invocations with provider-specific wording which we match via regex in §6.8.

**Files touched** (under `e:/llmconveyors-chrome-extension/`):
- 10 files created (8 production, 1 blueprint contract, 1 rollback script)
- 2 files modified (A5's `handlers.ts` to swap the `AUTH_SIGN_IN` stub + `background.ts` entrypoint to mount the auth broadcast emission on `AUTH_SIGN_OUT`)
- 6 test files created under `tests/background/auth/`

**Lines changed**: ~1,450 lines added (production + tests + blueprint + rollback). Zero lines added under `e:/llmconveyors.com/`.

---

## 1. Goal

Deliver the production sign-in, sign-out, and status-query flow inside the Chrome extension's background service worker, bound to A5's typed messaging protocol. After this phase:

1. A popup, options page, or sidepanel may call `sendMessage('AUTH_SIGN_IN')` (via A5's typed barrel) and receive the resolved `AuthState` on success, or a typed error (`AuthCancelledError`, `AuthNetworkError`, `AuthProviderError`, `AuthMalformedResponseError`, `AuthStorageError`) on failure.
2. `sendMessage('AUTH_SIGN_OUT')` clears tokens, clears all per-tab state via A5's `clearAllTabState`, broadcasts `AUTH_STATE_CHANGED { authed: false }`, and returns the `UNAUTHENTICATED` state.
3. `sendMessage('AUTH_STATUS')` reads the current stored tokens via A5's `readTokens` and returns an `AuthState` computed by the same derivation used post-sign-in (single code path for tokens->state).
4. `AUTH_STATE_CHANGED` broadcasts emit from a single choke-point helper (`broadcaster.ts`) that uses A5's `sendMessage` (NOT the bare `@webext-core/messaging` top-level helper). No-receiver errors are swallowed; other failures are logged via A5's `createLogger`.
5. Two concurrent `AUTH_SIGN_IN` calls share one single `launchWebAuthFlow` invocation via a module-level single-flight promise mutex.

What A6 does NOT do (explicit out-of-scope):

- No popup UI click handler. A10 owns the "Sign in" button.
- No refresh-on-401 retry, no refresh manager. A5 ships `RefreshManager` (keystone §1.4); A6 does not touch it.
- No profile fetch; first `/me` call is A7's problem.
- No side-panel subscription wiring. A11 wires the consumer to `AUTH_STATE_CHANGED`.
- No new `ProtocolMap` keys. Per D2, A5 is the sole owner. A6 imports and consumes.
- No new `AuthState` type. A5 ships it (keystone §1.2). A6 imports.
- No changes to A5's `readTokens`/`writeTokens`/`clearTokens`. A6 imports them.

---

## 2. Blocks / depends on

**Depends on** (hard blockers - all must have merged before A6 runs):

- **A1** (WXT scaffold at `e:/llmconveyors-chrome-extension`, `identity` + `storage` permissions in `wxt.config.ts`, vitest + `@vitest/coverage-v8`, `wxt/browser` shim, happy-dom dev-dep). Per D4, A1 already pins the directory name.
- **A5** (background skeleton + messaging). A6 imports:
  - `sendMessage`, `onMessage` from `@/background/messaging/protocol`
  - `AuthState`, `UNAUTHENTICATED` (if A5 ships a constant; else A6 defines its own) from `@/background/messaging/auth-state`
  - `readTokens`, `writeTokens`, `clearTokens`, `StoredTokens` from `@/background/storage/tokens`
  - `createLogger` from `@/background/log`
  - `clearAllTabState` from `@/background/storage/tab-state` (A5 §6.10)
  - The existing `HANDLERS.AUTH_SIGN_IN` stub (A6 replaces it)
  - The existing `HANDLERS.AUTH_SIGN_OUT` real impl (A6 wraps it with the broadcast; see §6.10)
- **A2** (backend bridge endpoint `POST /api/v1/auth/extension-token-exchange`). A6 does NOT call the endpoint directly; A4's page does. A6 consumes the endpoint's wire format through A4's fragment. A2's response body is `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` (A2 §7 line 103, A2 schema §8 lines 146-149).
- **A4** (Next.js extension-signin page at `https://llmconveyors.com/en/auth/extension-signin`). A4 emits `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` via `window.location.replace` (A4 §Step 5, §Step 9 line 239 + line 247). A6's parser is the byte-for-byte mirror of A4's builder.

**Blocks** (cannot ship until A6 lands):

- **A7** -- profile storage and options page; A7's first authenticated `/me` fetch relies on `readTokens` returning real tokens after A6 persists them.
- **A10** -- popup "Sign in" button; the click handler fires `sendMessage('AUTH_SIGN_IN')`.
- **A11** -- sidepanel subscribes to `AUTH_STATE_CHANGED` and re-renders on each broadcast.

---

## 3. Repo context (read first -- hard gate)

The executor MUST read each of these files before writing any code. Do not skim. If any document contradicts this plan, the keystone contracts win.

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md` -- the entire memo, particularly D2 (A5 owns ProtocolMap), D4 (repo path), D11 (no `console.*`), D14.1 (forbidden-token grep gates), D14.2 (protocol-contract type test), D15 (no em-dashes), D19 (adversarial tests), D20 (DI), D22 (blueprint.contract), D23 (rollback script).
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md` -- **verbatim source of truth**. Focus on §1 (ProtocolMap keys, `AuthState` in §1.2, bg handler requirements in §1.3, `RefreshManager` deps in §1.4), §10 (imports table row for A6).
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/plan.md` (the v2.1 rewrite; if the file still reads pre-v2.1 in your sandbox, follow keystone contracts §1 instead). A6 imports exact symbols from this phase; if a symbol is missing in A5, that is an A5 bug and blocks A6 until A5 is amended.
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A2_backend_bridge_endpoint/plan.md` -- §7 (handler body), §8 (Zod schema lines 144-154). A6's parser must accept the exact four fields: `accessToken`, `refreshToken`, `frontToken`, `accessTokenExpiry`.
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A4_frontend_extension_signin/plan.md` -- §Step 5 (`buildFragment` pure helper), §Step 9 (the `exchangeTokens` fragment construction + `window.location.replace` flow). The fragment is exactly `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` with each value encoded by `URLSearchParams`.
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/34-launch-web-auth-flow.md` -- (a) signature, (b) redirect URI format, (c) chromiumapp.org host encoding, (g) runnable TypeScript, (h) cancel/error behavior classification, (j) gotchas (only-one-flow-per-extension).
7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/36-mv3-permissions.md` -- §c (`identity` permission required), §i-j (rejected permissions).
8. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/53-supertokens-bridge-endpoint.md` -- backend contract. A6 never calls this endpoint; read it only to understand invariants (session-only, token rotation, independent sibling session).
9. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A6.md` -- the full review of the v1 A6 plan. Every C1-C6 finding and every F-category missing item is fixed here. The executor should be able to open review-A6.md and verify each fix is addressed in this plan.

**Do NOT read** `e:/llmconveyors.com/api/src/**`. Nothing in the backend monorepo crosses A6's boundary. If a file referenced outside A6's scope appears in a typecheck error, open an issue in the plan's investigation folder, do not patch it in A6.

---

## 4. Working directory

**Target directory**: `e:/llmconveyors-chrome-extension/` (per D4, pinned by `config.json` for plan 100).

All file paths in this plan are relative to `e:/llmconveyors-chrome-extension/` unless prefixed with `e:/llmconveyors.com/`.

The v1 A6 plan used the wrong directory name (inherited defect from v1 A5, see review-A6.md finding C2). Every path in v2.1 is `e:/llmconveyors-chrome-extension/`. If the executor sees the old v1 directory name used as a path prefix anywhere in `src/`, `tests/`, or `scripts/`, that is a bug introduced during execution; the acceptance grep in §8 catches it. References to the old directory name inside traceability text in this plan file (§15) are intentional documentation and must NOT be purged.

---

## 5. File inventory

### 5.1 New files (10)

| # | File | Purpose | Approx lines |
|---|------|---------|--------------|
| 1 | `src/background/auth/errors.ts` | Typed `AuthError` hierarchy: base + 5 subclasses (`AuthCancelledError`, `AuthNetworkError`, `AuthProviderError`, `AuthMalformedResponseError`, `AuthStorageError`) | ~90 |
| 2 | `src/background/auth/state.ts` | `toAuthState(tokens, now)` pure derivation + `UNAUTHENTICATED` constant + `MAX_FUTURE_EXPIRY_MS`. Re-exports `AuthState` from A5 for local convenience. | ~95 |
| 3 | `src/background/auth/fragment-parser.ts` | `parseFragment(redirectUrl): ParsedFragment` -- the defensive fragment parser. Pure function, 100% testable. | ~195 |
| 4 | `src/background/auth/broadcaster.ts` | `broadcastAuthStateChanged(state)` using A5's `sendMessage` from the protocol barrel. Swallows no-receiver errors. Logs unexpected via A5's `createLogger`. | ~100 |
| 5 | `src/background/auth/sign-in.ts` | `signIn(deps)` + `createSignIn(deps)` -- the launchWebAuthFlow driver. Module-level single-flight mutex. Full DI per D20. | ~260 |
| 6 | `src/background/auth/sign-out.ts` | `signOut(deps)` -- wraps A5's existing `clearTokens` + `clearAllTabState` + A6's broadcast. | ~80 |
| 7 | `src/background/auth/status.ts` | `getAuthStatus(deps)` -- reads A5's `readTokens`, derives via `state.ts:toAuthState`, returns `AuthState`. | ~60 |
| 8 | `src/background/auth/index.ts` | Barrel export for the module's public surface. | ~40 |
| 9 | `src/background/auth/blueprint.contract.ts` | D22 contract file: declared exports, forbidden imports, coverage floor, auth-module shape snapshot. | ~55 |
| 10 | `scripts/rollback-phase-A6.sh` | D23 rollback script (bash for git bash on Windows). Removes every file A6 creates, reverts the 2 modified files. | ~30 |

### 5.2 Modified files (2)

| # | File | Change | Approx added/removed |
|---|------|--------|--------------|
| 1 | `src/background/messaging/handlers.ts` (A5) | Replace the stub `handleAuthSignIn` with a dispatch that calls A6's `signIn()` driver. Wrap A5's `handleAuthSignOut` with an after-hook that calls A6's `broadcastAuthStateChanged(UNAUTHENTICATED)`. Keep A5's `clearAllTabState()` call. The `handleAuthStatus` in A5 already uses `readTokens`+`toAuthState` and remains untouched (A6's `status.ts` is a pure re-export wiring A5's plumbing for the `AUTH_STATUS` key; the handler can import A6's `getAuthStatus` if preferred to eliminate duplication, but must NOT change return type). | +22 / -4 |
| 2 | `src/entrypoints/background.ts` (A1/A5) | Add a top-of-file `import '@/background/auth/index.js'` side-effect import so the auth module's blueprint contract runs on worker wake. No handler registration here (A5 owns `registerHandlers()`); the side-effect import exists so Vitest and CI find the module through tree-shaking. | +2 |

### 5.3 New test files (6)

| # | File | Cases | Approx lines |
|---|------|-------|--------------|
| 1 | `tests/background/auth/fragment-parser.spec.ts` | 22 cases -- adversarial fragment parsing per D19 | ~320 |
| 2 | `tests/background/auth/sign-in.spec.ts` | 9 cases including concurrent-mutex race | ~260 |
| 3 | `tests/background/auth/sign-out.spec.ts` | 3 cases (happy, idempotent, tab-state cleared) | ~80 |
| 4 | `tests/background/auth/status.spec.ts` | 4 cases (no tokens, valid, expired, future-clamp) | ~95 |
| 5 | `tests/background/auth/broadcaster.spec.ts` | 3 cases (happy, swallow no-receiver, log unexpected without throw) | ~85 |
| 6 | `tests/background/auth/contract-consume-auth-state.type-test.ts` | A5-consumer type assertion: imports `AuthState` from A5 and asserts A6's functions accept/return it | ~40 |

### 5.4 Files NOT touched (explicit boundary list)

- `wxt.config.ts` -- `identity` + `storage` permissions already declared by A1.
- `src/entrypoints/popup/**` -- A10's territory.
- `src/entrypoints/sidepanel/**` -- A11's territory.
- `src/entrypoints/options/**` -- A7's territory.
- Any file under `src/content/**`, `src/ats/**`, `src/core/**` -- not an auth concern.
- A5's `refresh-manager.ts`, `storage/tokens.ts`, `storage/profile.ts`, `storage/prefs.ts`, `storage/tab-state.ts`, `log.ts`, `messaging/protocol.ts`, `messaging/auth-state.ts` -- A5's sealed territory per D2. A6 imports; A6 does not modify.

---

## 6. Step-by-step execution

### 6.1 Verify A1 + A5 baseline

Before writing any new files:

```bash
cd e:/llmconveyors-chrome-extension
pnpm install
pnpm wxt prepare
pnpm typecheck
pnpm lint
```

Expected: all four commands exit 0 with zero errors and zero warnings. If any fails, STOP -- A1/A5 is broken and A6 cannot proceed until the baseline compiles.

Then verify A5's shipped surface matches what A6 imports:

```bash
test -f src/background/messaging/protocol.ts || { echo "A5 protocol.ts MISSING"; exit 1; }
test -f src/background/messaging/auth-state.ts || { echo "A5 auth-state.ts MISSING"; exit 1; }
test -f src/background/storage/tokens.ts || { echo "A5 tokens.ts MISSING"; exit 1; }
test -f src/background/storage/tab-state.ts || { echo "A5 tab-state.ts MISSING"; exit 1; }
test -f src/background/log.ts || { echo "A5 log.ts MISSING"; exit 1; }
test -f src/background/messaging/handlers.ts || { echo "A5 handlers.ts MISSING"; exit 1; }

grep -q 'export.*AuthState' src/background/messaging/auth-state.ts || { echo "A5 AuthState export MISSING"; exit 1; }
grep -q 'AUTH_STATE_CHANGED' src/background/messaging/protocol.ts || { echo "A5 AUTH_STATE_CHANGED key MISSING"; exit 1; }
grep -q 'export async function readTokens' src/background/storage/tokens.ts || { echo "A5 readTokens export MISSING"; exit 1; }
grep -q 'export async function writeTokens' src/background/storage/tokens.ts || { echo "A5 writeTokens export MISSING"; exit 1; }
grep -q 'export async function clearTokens' src/background/storage/tokens.ts || { echo "A5 clearTokens export MISSING"; exit 1; }
grep -q 'createLogger' src/background/log.ts || { echo "A5 createLogger MISSING"; exit 1; }
grep -q 'clearAllTabState' src/background/storage/tab-state.ts || { echo "A5 clearAllTabState MISSING"; exit 1; }
```

If any check fails, STOP and escalate to the orchestrator: A5 did not ship its promised v2.1 surface. Do NOT fall back to stubs inside A6 (the v1 A6 plan had a Section 10 fallback; v2.1 deletes that fallback entirely per the C2 reviewer finding -- A6 is a consumer of A5, not a re-implementer).

### 6.2 Wire format vs fragment keys vs storage shape - THE rename table

This is the single most important table in the plan. Every reviewer, implementer, and future debugger must agree on exactly where each rename happens.

| Layer | Access token | Refresh token | Front token | Expiry |
|---|---|---|---|---|
| **A2 backend response body** (keystone §C1, A2 §7 line 103, A2 schema §8 line 146-149) | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| **A4 fragment keys** (A4 §Step 5 line 143, A4 §Step 9 line 239) | `at` | `rt` | `ft` | `exp` |
| **A6 ParsedFragment** (long-name, wire-aligned, in `fragment-parser.ts`) | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| **A5 StoredTokens** (A5 §6.6 line 698-703, long-name storage shape) | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| **A6 AuthState field exposed to UI** (keystone §1.2) | n/a | n/a | n/a | `accessTokenExpiry` |

**The rename points**:

1. A2 -> A4: A2 sends `{ accessToken, refreshToken, frontToken, accessTokenExpiry }`. A4 reads via the SDK client and assigns each field unchanged into the fragment builder's input. No rename yet; A4's `buildFragment` is where the keys get compressed from long names to `at/rt/ft/exp`.
2. A4 -> chromiumapp.org URL: A4 emits `#at=<accessToken>&rt=<refreshToken>&ft=<frontToken>&exp=<accessTokenExpiry>` via `URLSearchParams`.
3. chromiumapp.org URL -> A6 `ParsedFragment`: A6's `fragment-parser.ts` reads `at/rt/ft/exp` via `URLSearchParams.get(...)` and emits long-name fields `accessToken/refreshToken/frontToken/accessTokenExpiry`. **This is the "short to long" rename**; it happens inside `parseFragment()`.
4. `ParsedFragment` -> A5 `StoredTokens`: A6's `sign-in.ts` calls `writeTokens({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, frontToken: parsed.frontToken, accessTokenExpiry: parsed.accessTokenExpiry, email: null })`. **No rename** -- all field names match between ParsedFragment and StoredTokens. `email` is set to `null` (A7 populates it later from `/me`).
5. `StoredTokens` -> `AuthState`: A6's `state.ts:toAuthState` reads `StoredTokens` and returns `AuthState { authed: true, email: null, accessTokenExpiry }`. No rename; `accessTokenExpiry` is the one field that survives the whole pipeline unchanged.

**Why only one rename point?** A5 StoredTokens uses the same long field names as the wire format (`accessToken`, `refreshToken`, `frontToken`, `accessTokenExpiry`). A4 compressed the fragment to short keys (`at/rt/ft/exp`) because URL fragments are visible in logs / error pages and SuperTokens tokens can be 2-4KB each; short keys save bytes. The only rename is A6's fragment parser expanding short keys back to long names. No second rename is needed at the storage boundary.

**Executor contract**: the rename point above (fragment short keys -> long names) is captured in code with a comment citing this table. Do not introduce additional renames (e.g. renaming `frontToken` to `front`). StoredTokens uses long names matching the wire format; no field-name translation is needed at the storage boundary.

### 6.3 Create `src/background/auth/errors.ts`

The typed error hierarchy is mandatory per D20 test matrix and the reviewer's F-category finding. No string matching on `Error.message` downstream of A6.

```ts
// src/background/auth/errors.ts
/**
 * Typed error hierarchy for the extension auth module.
 *
 * Every auth failure mode is a distinct class so callers (popup A10,
 * sidepanel A11) can branch on `err.name` without parsing `err.message`.
 *
 * Why `.name` and not `instanceof`: `@webext-core/messaging` transports
 * errors via `chrome.runtime.sendMessage`, which uses structured clone.
 * Structured clone preserves `.name` (it's an own property) but discards
 * the prototype chain, so `instanceof AuthCancelledError` on the receiver
 * side always returns false. Callers MUST branch on `err.name` instead.
 * This is documented in keystone §1.1 note and repeated in README.md.
 */

export class AuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    // `this.constructor.name` is preferred over a hard-coded string because
    // TypeScript minification can rename constructors. We double-pin the
    // name by setting it explicitly in each subclass constructor below.
    this.name = 'AuthError';
  }
}

/**
 * User closed the launchWebAuthFlow popup or denied access. Recoverable:
 * the UI should show a retry affordance and leave all state unchanged.
 */
export class AuthCancelledError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthCancelledError';
  }
}

/**
 * launchWebAuthFlow could not load the bridge page at all (DNS failure,
 * TLS handshake error, offline). Recoverable: user can retry once online.
 */
export class AuthNetworkError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthNetworkError';
  }
}

/**
 * The bridge page returned an error via URL fragment (#error=...) or the
 * bridge endpoint produced a non-2xx response that the bridge surfaced.
 * Distinct from AuthMalformedResponseError in that this IS a legitimate
 * bridge signal, not an attack or a parse bug.
 *
 * NOTE (security): if we encounter `#error=` in the chromiumapp.org fragment
 * we treat it as an attack (see AuthMalformedResponseError below). The
 * bridge page does NOT currently emit #error=; it renders an error UI and
 * lets the user click retry. AuthProviderError is reserved for future use
 * if the bridge contract changes and it begins surfacing backend errors
 * via a separate mechanism (e.g. a JSON body or a query param).
 */
export class AuthProviderError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthProviderError';
  }
}

/**
 * The redirect URL came back but something about its shape was wrong:
 * missing fragment, missing field, invalid host, non-https protocol,
 * past-expiry, far-future expiry, disallowed character in token, or
 * the presence of `#error=` (which we treat as tampering).
 * NOT recoverable by retry alone: this indicates a bug in the bridge
 * or a MITM redirect attempt.
 */
export class AuthMalformedResponseError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthMalformedResponseError';
  }
}

/**
 * chrome.storage.session.set or .remove failed. Very rare in practice;
 * possible under quota exhaustion (unlikely for 4 short strings),
 * corrupt storage, or service-worker termination mid-write.
 * NOT recoverable by retry alone.
 */
export class AuthStorageError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthStorageError';
  }
}
```

Rationale for five subclasses (not one-with-code):

- `.name` is a single discriminator for the UI, one switch-case per name, no parallel `.code` field to keep in sync.
- Structured clone carries `.name` but not private fields, so we avoid private fields entirely.
- Adversarial tests can assert `expect(err).toBeInstanceOf(AuthCancelledError)` inside the same module where the prototype chain is preserved; only the messaging boundary strips it.

### 6.4 Create `src/background/auth/state.ts`

```ts
// src/background/auth/state.ts
/**
 * Pure derivation from StoredTokens to AuthState + constants.
 *
 * Imports AuthState from A5 (keystone §1.2 authoritative source). A6
 * never defines AuthState locally; this file only provides:
 *   - UNAUTHENTICATED singleton
 *   - MAX_FUTURE_EXPIRY_MS clamp constant
 *   - toAuthState(tokens, now) pure function
 *
 * Used by: sign-in.ts (after persist), status.ts (on read), tests.
 */

import type { StoredTokens } from '@/background/storage/tokens';
import type { AuthState } from '@/background/messaging/auth-state';

/** Re-export for local convenience; A5 is the sole definition. */
export type { AuthState } from '@/background/messaging/auth-state';

/**
 * Singleton for the unauthenticated branch. Frozen to prevent accidental
 * mutation by downstream consumers.
 */
export const UNAUTHENTICATED: AuthState = Object.freeze({ authed: false });

/**
 * Upper bound on how far in the future a fresh access-token expiry may
 * legitimately sit. SuperTokens default is 1h; we allow 24h as a slack
 * factor to cover clock skew and future config changes, but anything
 * beyond 24h is treated as tampering or clock-skew attack and rejected.
 *
 * MIRRORED in fragment-parser.ts. If you change one, change both. Tests
 * assert they stay in sync via a constant-equality assertion.
 */
export const MAX_FUTURE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Derive a public AuthState from the tokens currently in storage.
 *
 * Returns UNAUTHENTICATED if:
 *   - tokens is null
 *   - accessTokenExpiry is NaN / not finite / not a number
 *   - accessTokenExpiry is in the past (inclusive of now)
 *   - accessTokenExpiry is more than MAX_FUTURE_EXPIRY_MS ahead
 *
 * Does NOT attempt refresh. Refresh is A5's RefreshManager's job and
 * is triggered on-demand by API calls, not by state derivation.
 *
 * `now` is injectable for tests. Production passes `Date.now()`.
 */
export function toAuthState(
  tokens: StoredTokens | null,
  now: number = Date.now(),
): AuthState {
  if (!tokens) {
    return UNAUTHENTICATED;
  }

  const exp = tokens.accessTokenExpiry;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return UNAUTHENTICATED;
  }

  if (exp <= now) {
    return UNAUTHENTICATED;
  }

  if (exp > now + MAX_FUTURE_EXPIRY_MS) {
    return UNAUTHENTICATED;
  }

  return Object.freeze({
    authed: true,
    email: null,
    accessTokenExpiry: exp,
  });
}
```

Notes:

- `email: null` is intentional per A5's `AuthState` shape (keystone §1.2). A7 populates email via a separate write path when the `/me` fetch succeeds. A6 never writes email.
- `Object.freeze` on both singleton and computed state prevents the popup from mutating state it receives from `sendMessage` -- a small sanity seal.

### 6.5 Create `src/background/auth/fragment-parser.ts`

This is the single most security-critical file in the phase. Every assertion is load-bearing. The parser is a pure function with no side effects; tests can call it directly with crafted URLs.

```ts
// src/background/auth/fragment-parser.ts
/**
 * Fragment parser for the chromiumapp.org redirect URL emitted by
 * launchWebAuthFlow after the A4 bridge page runs.
 *
 * The four fields our bridge emits are exactly (A4 §Step 5, §Step 9):
 *   #at=<accessToken>&rt=<refreshToken>&ft=<frontToken>&exp=<accessTokenExpiry>
 *
 * Each value is URL-encoded via URLSearchParams on the bridge side; we
 * decode via URLSearchParams on our side so the decoding is symmetric
 * (no manual decodeURIComponent which would handle `+` differently).
 *
 * Security posture:
 *   - Host MUST match /^[a-p]{32}\.chromiumapp\.org$/ (Chrome extension ID
 *     encoding maps the public-key hash bytes into the a-p range).
 *   - Protocol MUST be https.
 *   - `#error=` or `?error=` in the URL is treated as a tampering signal
 *     (AuthMalformedResponseError), not a legitimate bridge error. The
 *     actual A4 bridge page does not emit #error=; it renders an error UI.
 *     So any #error= we see is an attacker trying to smuggle a message.
 *   - Tokens: length-bounded, character-class restricted to the safe
 *     base64/base64url alphabet plus `.`, `=`, `+`, `/`, `-`, `_`.
 *   - Expiry: must be a positive integer, must be in the future, must be
 *     within MAX_FUTURE_EXPIRY_MS of `now`.
 */

import { AuthMalformedResponseError } from './errors';
import { MAX_FUTURE_EXPIRY_MS } from './state';

/**
 * Output of parseFragment. Uses long-name fields (keystone §6.2 rename
 * table). The storage boundary in sign-in.ts performs the long -> short
 * rename when calling writeTokens.
 */
export interface ParsedFragment {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly frontToken: string;
  readonly accessTokenExpiry: number;
}

/** Minimum plausible length of a SuperTokens JWT access token. */
const MIN_TOKEN_LENGTH = 20;

/**
 * Maximum length cap. SuperTokens access tokens are typically 600-1200
 * chars; refresh tokens are similar. We cap at 8192 to catch DoS attempts
 * or an attacker padding the fragment with a huge value.
 */
const MAX_TOKEN_LENGTH = 8192;

/**
 * Chrome extension IDs are 32 characters in the a-p range, derived from
 * the public-key hash bytes nibble-by-nibble (0-15 -> a-p). This regex
 * verifies the host belongs to a valid Chrome extension ID, mirroring
 * the assumption Chrome itself makes when intercepting navigations to
 * <id>.chromiumapp.org.
 *
 * Ref: investigation/34-launch-web-auth-flow.md §c
 */
const CHROMIUMAPP_HOST = /^[a-p]{32}\.chromiumapp\.org$/;

/**
 * Safe character class for token values. Covers base64url (a-zA-Z0-9_-)
 * plus base64 (+/), plus JWT segment separator (.), plus padding (=).
 * Disallows quotes, semicolons, whitespace, control chars, null bytes,
 * and all unicode outside ASCII printable.
 */
const SAFE_TOKEN_CHARS = /^[A-Za-z0-9._=+/-]+$/;

/**
 * Dependency object for `parseFragment`. Allows tests to inject a fake
 * `now` for deterministic expiry checks.
 */
export interface ParseFragmentDeps {
  readonly now: () => number;
}

export const defaultParseFragmentDeps: ParseFragmentDeps = Object.freeze({
  now: () => Date.now(),
});

/**
 * Parse and validate the redirect URL's fragment. Throws
 * AuthMalformedResponseError on any violation.
 *
 * `deps` is optional; omit in production, inject in tests.
 */
export function parseFragment(
  redirectUrl: string,
  deps: ParseFragmentDeps = defaultParseFragmentDeps,
): ParsedFragment {
  if (typeof redirectUrl !== 'string') {
    throw new AuthMalformedResponseError(
      `Redirect URL is not a string: ${typeof redirectUrl}`,
    );
  }

  if (redirectUrl.length === 0) {
    throw new AuthMalformedResponseError('Redirect URL is empty');
  }

  // Cap the raw URL length to prevent DoS via giant input.
  if (redirectUrl.length > 16384) {
    throw new AuthMalformedResponseError(
      `Redirect URL too long: ${redirectUrl.length}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch (err) {
    throw new AuthMalformedResponseError(
      'Redirect URL is not a valid URL',
      err,
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new AuthMalformedResponseError(
      `Unexpected redirect protocol: ${parsed.protocol}`,
    );
  }

  if (!CHROMIUMAPP_HOST.test(parsed.hostname)) {
    throw new AuthMalformedResponseError(
      `Redirect host is not a valid chromiumapp.org ID: ${parsed.hostname}`,
    );
  }

  // Error detection: bridge is not supposed to emit #error= or ?error=.
  // Either is a tampering signal.
  const queryError = parsed.searchParams.get('error');
  if (queryError !== null) {
    throw new AuthMalformedResponseError(
      `Redirect URL contains ?error= query param (tampering): ${truncate(queryError, 80)}`,
    );
  }

  // Trim the `#` prefix then parse as url-encoded form.
  const fragment = parsed.hash.startsWith('#')
    ? parsed.hash.slice(1)
    : parsed.hash;

  if (fragment.length === 0) {
    throw new AuthMalformedResponseError('Redirect URL has no fragment');
  }

  const params = new URLSearchParams(fragment);

  const fragError = params.get('error');
  if (fragError !== null) {
    throw new AuthMalformedResponseError(
      `Redirect fragment contains #error= (tampering): ${truncate(fragError, 80)}`,
    );
  }

  const at = params.get('at');
  const rt = params.get('rt');
  const ft = params.get('ft');
  const expRaw = params.get('exp');

  if (at === null || rt === null || ft === null || expRaw === null) {
    throw new AuthMalformedResponseError(
      `Missing fragment field(s): ${[
        at === null ? 'at' : null,
        rt === null ? 'rt' : null,
        ft === null ? 'ft' : null,
        expRaw === null ? 'exp' : null,
      ].filter(Boolean).join(', ')}`,
    );
  }

  assertTokenShape(at, 'at');
  assertTokenShape(rt, 'rt');
  assertTokenShape(ft, 'ft');

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !Number.isInteger(exp) || exp <= 0) {
    throw new AuthMalformedResponseError(
      `accessTokenExpiry is not a positive integer: ${truncate(expRaw, 40)}`,
    );
  }

  // Sanity clamps. MIRRORED in state.ts:toAuthState for defense in depth.
  const now = deps.now();

  if (exp <= now) {
    throw new AuthMalformedResponseError(
      `accessTokenExpiry is already in the past: exp=${exp} now=${now}`,
    );
  }

  if (exp > now + MAX_FUTURE_EXPIRY_MS) {
    throw new AuthMalformedResponseError(
      `accessTokenExpiry is more than 24h in the future: exp=${exp} now=${now}`,
    );
  }

  return Object.freeze({
    accessToken: at,
    refreshToken: rt,
    frontToken: ft,
    accessTokenExpiry: exp,
  });
}

function assertTokenShape(token: string, name: string): void {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new AuthMalformedResponseError(
      `Token ${name} is too short (${token.length} < ${MIN_TOKEN_LENGTH})`,
    );
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new AuthMalformedResponseError(
      `Token ${name} is too long (${token.length} > ${MAX_TOKEN_LENGTH})`,
    );
  }
  if (!SAFE_TOKEN_CHARS.test(token)) {
    throw new AuthMalformedResponseError(
      `Token ${name} contains disallowed characters`,
    );
  }
  // Null byte defense (redundant with SAFE_TOKEN_CHARS but explicit).
  if (token.indexOf('\0') !== -1) {
    throw new AuthMalformedResponseError(
      `Token ${name} contains a null byte`,
    );
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}
```

Notes on the parser:

- Character class `SAFE_TOKEN_CHARS` intentionally covers both base64 and base64url alphabets. SuperTokens typically emits base64url but may emit opaque base64 for non-JWT tokens in the future; we do not want to force a parser update if that happens.
- The URL-length cap (`16384`) prevents a DoS attack where a malicious intermediary crafts a 10MB redirect URL.
- `truncate` is used in error messages to prevent log-bomb attacks: a 10KB "error code" would be swallowed whole into `err.message` and persisted by whichever logger catches it.
- The `deps: ParseFragmentDeps` object is D20 compliance: tests pass `{ now: () => FIXED_TIME }` for deterministic expiry checks.

### 6.6 Create `src/background/auth/broadcaster.ts`

```ts
// src/background/auth/broadcaster.ts
/**
 * broadcastAuthStateChanged: single choke-point for AUTH_STATE_CHANGED
 * broadcasts from the background worker.
 *
 * CRITICAL (D2, reviewer C6): imports `sendMessage` from A5's protocol
 * module barrel, NOT from `@webext-core/messaging` directly. A5's barrel
 * binds `sendMessage` to the `ProtocolMap`; bypassing it creates a separate
 * message namespace that silently drops all messages.
 *
 * Logger: uses A5's createLogger per D11. No console.* anywhere.
 */

import { sendMessage } from '@/background/messaging/protocol';
import { createLogger } from '@/background/log';
import type { AuthState } from '@/background/messaging/auth-state';

const log = createLogger('auth:broadcaster');

/**
 * Dependency object for the broadcaster. Injectable for tests.
 */
export interface BroadcasterDeps {
  readonly sendMessage: typeof sendMessage;
  readonly logger: {
    readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
    readonly debug: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}

export const defaultBroadcasterDeps: BroadcasterDeps = Object.freeze({
  sendMessage,
  logger: log,
});

/**
 * Broadcast an auth-state change to popup, sidepanel, and options page.
 *
 * Semantics:
 *   - best-effort broadcast: if no receiver loaded, no error
 *   - never throws: a broadcast failure must not unwind sign-in/sign-out
 *   - unexpected errors are logged at warn level but not rethrown
 *
 * Consumers that start after the broadcast was sent pull state via
 * `sendMessage('AUTH_STATUS')` at mount; no data is lost.
 */
export async function broadcastAuthStateChanged(
  state: AuthState,
  deps: BroadcasterDeps = defaultBroadcasterDeps,
): Promise<void> {
  try {
    await deps.sendMessage('AUTH_STATE_CHANGED', state);
    deps.logger.debug('AUTH_STATE_CHANGED broadcast delivered', {
      authed: state.authed,
    });
  } catch (err) {
    if (isNoReceiverError(err)) {
      // Expected: no popup, sidepanel, or options page currently loaded.
      deps.logger.debug('AUTH_STATE_CHANGED had no receiver', {
        authed: state.authed,
      });
      return;
    }
    // Unexpected: e.g., structured-clone failure. Log but do NOT throw.
    deps.logger.warn('AUTH_STATE_CHANGED broadcast failed unexpectedly', {
      authed: state.authed,
      errName: err instanceof Error ? err.name : typeof err,
      errMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

function isNoReceiverError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  return /could not establish connection|receiving end does not exist|no receiver/i
    .test(err.message);
}
```

Note: `isNoReceiverError` covers the three wordings `@webext-core/messaging` surfaces across Chrome, Edge, and Firefox transports. If a new transport adds a fourth wording, add it to the regex and add a test case that asserts it.

### 6.7 Create `src/background/auth/sign-in.ts`

This is the main driver. Full DI per D20, module-level single-flight mutex per the reviewer's F-category concurrent-sign-in finding.

```ts
// src/background/auth/sign-in.ts
/**
 * sign-in driver: the complete launchWebAuthFlow + parse + persist +
 * broadcast transaction.
 *
 * DI shape (D20): every external dependency is injected via a Deps object.
 * Production exports a bound `signIn` singleton wired to real impls;
 * tests use `createSignIn(fakeDeps)` directly and never touch globals.
 *
 * Mutex: module-level single-flight promise. Two concurrent AUTH_SIGN_IN
 * calls share one launchWebAuthFlow invocation. Rationale: Chrome allows
 * only one launchWebAuthFlow per extension at a time (investigation 34 §j
 * gotcha 3). The second concurrent call would otherwise reject with
 * "OAuth2 request failed" and confuse the popup UI.
 */

import { browser } from 'wxt/browser';
import type { StoredTokens } from '@/background/storage/tokens';
import {
  readTokens,
  writeTokens,
} from '@/background/storage/tokens';
import {
  parseFragment,
  type ParsedFragment,
  type ParseFragmentDeps,
  defaultParseFragmentDeps,
} from './fragment-parser';
import { broadcastAuthStateChanged, defaultBroadcasterDeps } from './broadcaster';
import { toAuthState } from './state';
import type { AuthState } from '@/background/messaging/auth-state';
import { createLogger } from '@/background/log';
import {
  AuthCancelledError,
  AuthNetworkError,
  AuthProviderError,
  AuthMalformedResponseError,
  AuthStorageError,
  AuthError,
} from './errors';

const log = createLogger('auth:sign-in');

/**
 * BRIDGE_URL: full URL of the A4 extension-signin page.
 *
 * Sourced from an env var so local dev can point at `http://localhost:3000`
 * without editing source. The fallback is the production URL.
 */
const BRIDGE_URL: string =
  // @ts-expect-error: import.meta.env is WXT-typed at build time
  (import.meta.env?.WXT_BRIDGE_URL as string | undefined) ??
  'https://llmconveyors.com/en/auth/extension-signin';

/**
 * The full DI surface for signIn. Every external effect flows through
 * this object. Tests construct a bespoke Deps with fakes; production
 * uses `defaultSignInDeps`.
 */
export interface SignInDeps {
  /** chrome.identity.launchWebAuthFlow (or a fake in tests). */
  readonly launchWebAuthFlow: (opts: {
    url: string;
    interactive: boolean;
  }) => Promise<string | undefined>;

  /** chrome.identity.getRedirectURL (or a fake in tests). */
  readonly getRedirectURL: () => string;

  /** Parse + validate the chromiumapp.org fragment. Pure. */
  readonly parseFragment: (
    url: string,
    deps?: ParseFragmentDeps,
  ) => ParsedFragment;

  /** Persist tokens to chrome.storage.session. */
  readonly writeTokens: (tokens: StoredTokens) => Promise<void>;

  /** Read tokens from chrome.storage.session (for post-write verification). */
  readonly readTokens: () => Promise<StoredTokens | null>;

  /** Emit AUTH_STATE_CHANGED. */
  readonly broadcast: (state: AuthState) => Promise<void>;

  /** Structured logger scoped to auth:sign-in. */
  readonly logger: {
    readonly info: (msg: string, ctx?: Record<string, unknown>) => void;
    readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
    readonly error: (
      msg: string,
      err?: unknown,
      ctx?: Record<string, unknown>,
    ) => void;
    readonly debug: (msg: string, ctx?: Record<string, unknown>) => void;
  };

  /** Injectable time for deterministic tests. */
  readonly now: () => number;

  /** Bridge URL override; defaults to BRIDGE_URL env/const. */
  readonly bridgeUrl: string;
}

/**
 * Real wired dependencies. Production entrypoints import this and call
 * `signIn()` (which closes over `defaultSignInDeps`).
 */
export const defaultSignInDeps: SignInDeps = Object.freeze({
  launchWebAuthFlow: (opts) =>
    browser.identity.launchWebAuthFlow({
      url: opts.url,
      interactive: opts.interactive,
    }) as Promise<string | undefined>,
  getRedirectURL: () => browser.identity.getRedirectURL(),
  parseFragment: (url, deps) => parseFragment(url, deps ?? defaultParseFragmentDeps),
  writeTokens,
  readTokens,
  broadcast: (state) => broadcastAuthStateChanged(state, defaultBroadcasterDeps),
  logger: log,
  now: () => Date.now(),
  bridgeUrl: BRIDGE_URL,
});

// -------- module-level single-flight mutex --------

/**
 * Holds the in-flight signIn promise, if any. Two concurrent calls to
 * `signIn()` share this same promise; the second call does NOT issue a
 * second launchWebAuthFlow.
 *
 * Cleared on settle (resolve OR reject) so retry-after-cancel works.
 * The clearing happens in a `.finally()` inside `runSignIn`.
 *
 * Exported for tests only so they can assert on/reset state.
 */
let inflight: Promise<AuthState> | null = null;

/** Test-only: reset mutex. NEVER call from production. @internal */
export function __resetSignInMutex(): void {
  inflight = null;
}

/** Test-only: inspect mutex state. @internal */
export function __getSignInInflight(): Promise<AuthState> | null {
  return inflight;
}

/**
 * Production-facing entrypoint. Closes over `defaultSignInDeps`.
 * This is the function A5's `handleAuthSignIn` calls.
 */
export function signIn(): Promise<AuthState> {
  return createSignIn(defaultSignInDeps)();
}

/**
 * Factory. Returns a zero-argument function bound to the given Deps.
 * Used by tests to create a controlled signIn with fakes.
 *
 * The returned function implements the single-flight mutex: concurrent
 * calls return the same promise.
 */
export function createSignIn(
  deps: SignInDeps,
): () => Promise<AuthState> {
  return async function boundSignIn(): Promise<AuthState> {
    if (inflight !== null) {
      deps.logger.debug('sign-in mutex hit: awaiting existing in-flight');
      return inflight;
    }
    inflight = runSignIn(deps).finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

/**
 * The actual sign-in transaction. Called inside the mutex.
 *
 * Steps:
 *   1. Compute redirect URI via getRedirectURL
 *   2. Build bridge URL with `?redirect=<redirectUri>` query param
 *   3. Call launchWebAuthFlow (interactive: true)
 *   4. Parse the returned URL fragment (throws if malformed)
 *   5. Rename wire -> storage (long -> short field names)
 *   6. Persist via writeTokens
 *   7. Re-read via readTokens (defense in depth: verifies storage wrote)
 *   8. Compute AuthState via toAuthState
 *   9. Broadcast AUTH_STATE_CHANGED (errors swallowed inside broadcaster)
 *  10. Return AuthState
 */
async function runSignIn(deps: SignInDeps): Promise<AuthState> {
  deps.logger.info('sign-in start');

  // Step 1: redirect URI
  const redirectUri = deps.getRedirectURL();
  if (typeof redirectUri !== 'string' || redirectUri.length === 0) {
    throw new AuthProviderError(
      `getRedirectURL returned unusable value: ${String(redirectUri)}`,
    );
  }

  // Step 2: build bridge URL
  let signInUrl: URL;
  try {
    signInUrl = new URL(deps.bridgeUrl);
  } catch (err) {
    throw new AuthProviderError(
      `BRIDGE_URL is not a valid URL: ${deps.bridgeUrl}`,
      err,
    );
  }
  signInUrl.searchParams.set('redirect', redirectUri);

  // Step 3: launchWebAuthFlow
  let responseUrl: string | undefined;
  try {
    responseUrl = await deps.launchWebAuthFlow({
      url: signInUrl.toString(),
      interactive: true,
    });
  } catch (err) {
    const classified = classifyLaunchError(err);
    deps.logger.warn('launchWebAuthFlow rejected', {
      errName: classified.name,
      errMessage: classified.message,
    });
    throw classified;
  }

  if (typeof responseUrl !== 'string' || responseUrl.length === 0) {
    // launchWebAuthFlow returns undefined only on silent-refresh paths,
    // and we pass interactive: true. Defensive: treat as network failure.
    throw new AuthNetworkError(
      'launchWebAuthFlow returned empty response URL',
    );
  }

  // Step 4: parse fragment (validates host, protocol, shape, expiry)
  let parsed: ParsedFragment;
  try {
    parsed = deps.parseFragment(responseUrl, { now: deps.now });
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    // parseFragment should only throw AuthMalformedResponseError; any
    // other error is a parser bug. Wrap it to preserve the typed envelope.
    throw new AuthMalformedResponseError(
      'parseFragment threw a non-AuthError',
      err,
    );
  }

  deps.logger.debug('fragment parsed', {
    accessTokenLength: parsed.accessToken.length,
    expiryMs: parsed.accessTokenExpiry,
  });

  // Step 5 + 6: persist parsed tokens to storage.
  // All field names match between ParsedFragment and StoredTokens (long names).
  // email is null until A7 populates it from /me.
  const stored: StoredTokens = {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    frontToken: parsed.frontToken,
    accessTokenExpiry: parsed.accessTokenExpiry,
    email: null,
  };

  try {
    await deps.writeTokens(stored);
  } catch (err) {
    deps.logger.error('writeTokens failed', err);
    throw new AuthStorageError(
      'Failed to persist tokens to chrome.storage.session',
      err,
    );
  }

  // Step 7: defense-in-depth read-back. If writeTokens silently dropped
  // fields (impossible per A5's validation, but belt-and-braces), we catch
  // it here before broadcasting a bad AuthState.
  const verify = await deps.readTokens();
  if (!verify || verify.accessTokenExpiry !== stored.accessTokenExpiry) {
    throw new AuthStorageError(
      'writeTokens succeeded but readTokens returned mismatched record',
    );
  }

  // Step 8: compute AuthState. If derivation rejects (clock shift between
  // parseFragment's now() and toAuthState's now()), treat it as a parser
  // bug because the fragment parser already clamped to now +/- 24h.
  const state = toAuthState(verify, deps.now());
  if (!state.authed) {
    throw new AuthMalformedResponseError(
      'parseFragment accepted tokens but toAuthState rejected them',
    );
  }

  // Step 9: broadcast (fire-and-absorb errors internally)
  await deps.broadcast(state);

  // Step 10: return
  deps.logger.info('sign-in success', {
    accessTokenExpiry: state.accessTokenExpiry,
  });
  return state;
}

/**
 * Map the raw launchWebAuthFlow rejection to one of our typed errors.
 *
 * Chrome error message patterns (investigation 34 §h + §j):
 *   - "The user did not approve access."            -> cancel
 *   - "User interaction required."                   -> cancel (silent path, defensive)
 *   - "The user closed the window."                  -> cancel
 *   - "Authorization page could not be loaded."     -> network
 *   - "Network request failed"                      -> network
 *   - "OAuth2 request failed"                        -> network-or-provider (ambiguous; we classify as provider)
 *   - anything else                                  -> provider
 */
function classifyLaunchError(err: unknown): AuthError {
  const msg = err instanceof Error ? err.message : String(err);

  if (
    /did not approve|user.*cancel|user interaction required|user closed/i
      .test(msg)
  ) {
    return new AuthCancelledError(msg, err);
  }

  if (/could not be loaded|network|fetch failed|timeout|DNS/i.test(msg)) {
    return new AuthNetworkError(msg, err);
  }

  return new AuthProviderError(msg, err);
}
```

### 6.8 Create `src/background/auth/sign-out.ts`

A6 does NOT reimplement A5's `AUTH_SIGN_OUT` handler. A5 already ships a real `handleAuthSignOut` that calls `clearTokens()` + `clearAllTabState()` (A5 plan line 1291-1294). A6's contribution is the broadcast emission that A5's handler lacks.

Two integration strategies are possible:

(a) **Wrap at the handler layer**: swap A5's `handleAuthSignOut` entry in `HANDLERS` with a wrapper that calls A5's existing logic then A6's broadcast. Pro: single source of truth for sign-out in A5; A6 stays declarative. Con: mutates A5's handlers table at module load.

(b) **Provide a sign-out wrapper here**: ship `signOut(deps)` in A6 that imports A5's primitives (`clearTokens`, `clearAllTabState`) and orchestrates them + broadcast. Pro: explicit, testable, zero table mutation. Con: duplicates A5's sign-out logic shape (two places that know how to tear down auth state).

**Decision**: strategy (b). Rationale: D20 requires DI for every cross-module dependency, and (b) lets us inject `clearTokens`, `clearAllTabState`, `broadcastAuthStateChanged` as three testable deps. Strategy (a) would require monkey-patching A5's `HANDLERS` at load time which is opaque to tests.

The `handlers.ts` modification in §6.10 changes A5's `handleAuthSignOut` to call A6's `signOut()` instead of A5's in-module primitives, collapsing to one tear-down path.

```ts
// src/background/auth/sign-out.ts
/**
 * sign-out driver: clears tokens, clears per-tab state, broadcasts the
 * unauthenticated AuthState.
 *
 * This REPLACES the logic inside A5's handleAuthSignOut -- A5's handler
 * imports this module and delegates (see §6.10 handlers.ts patch).
 */

import { clearTokens } from '@/background/storage/tokens';
import { clearAllTabState } from '@/background/storage/tab-state';
import { broadcastAuthStateChanged, defaultBroadcasterDeps } from './broadcaster';
import { UNAUTHENTICATED } from './state';
import type { AuthState } from '@/background/messaging/auth-state';
import { createLogger } from '@/background/log';
import { AuthStorageError } from './errors';

const log = createLogger('auth:sign-out');

export interface SignOutDeps {
  readonly clearTokens: () => Promise<void>;
  readonly clearAllTabState: () => Promise<void>;
  readonly broadcast: (state: AuthState) => Promise<void>;
  readonly logger: {
    readonly info: (msg: string, ctx?: Record<string, unknown>) => void;
    readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
    readonly error: (
      msg: string,
      err?: unknown,
      ctx?: Record<string, unknown>,
    ) => void;
  };
}

export const defaultSignOutDeps: SignOutDeps = Object.freeze({
  clearTokens,
  clearAllTabState,
  broadcast: (state) => broadcastAuthStateChanged(state, defaultBroadcasterDeps),
  logger: log,
});

/**
 * Clear persisted tokens, clear per-tab state, broadcast UNAUTHENTICATED.
 *
 * Idempotent: calling signOut when already signed out is a no-op that
 * still returns UNAUTHENTICATED and still broadcasts. The UI can resync
 * even if its local state drifted.
 */
export async function signOut(
  deps: SignOutDeps = defaultSignOutDeps,
): Promise<AuthState> {
  deps.logger.info('sign-out start');

  try {
    await deps.clearTokens();
  } catch (err) {
    deps.logger.error('clearTokens failed', err);
    throw new AuthStorageError(
      'Failed to clear tokens from chrome.storage.session',
      err,
    );
  }

  try {
    await deps.clearAllTabState();
  } catch (err) {
    // Per-tab state cleanup failure is serious but should not block the
    // sign-out flow -- the tokens are already cleared, so the user IS
    // effectively signed out. Log loud, continue.
    deps.logger.warn('clearAllTabState failed after token clear', {
      errMessage: err instanceof Error ? err.message : String(err),
    });
  }

  await deps.broadcast(UNAUTHENTICATED);

  deps.logger.info('sign-out complete');
  return UNAUTHENTICATED;
}
```

### 6.9 Create `src/background/auth/status.ts`

```ts
// src/background/auth/status.ts
/**
 * status driver: reads tokens from A5's storage and derives AuthState.
 *
 * Hot path: invoked on every popup open, every sidepanel mount, every
 * content-script "am I signed in?" check. Must stay cheap. No network.
 * No refresh trigger.
 */

import { readTokens } from '@/background/storage/tokens';
import { toAuthState } from './state';
import type { AuthState } from '@/background/messaging/auth-state';
import type { StoredTokens } from '@/background/storage/tokens';

export interface GetAuthStatusDeps {
  readonly readTokens: () => Promise<StoredTokens | null>;
  readonly now: () => number;
}

export const defaultGetAuthStatusDeps: GetAuthStatusDeps = Object.freeze({
  readTokens,
  now: () => Date.now(),
});

/**
 * Read the current auth state from storage without touching the network.
 *
 * Returns UNAUTHENTICATED if tokens are missing, expired, or beyond the
 * sanity future clamp. Never triggers refresh; callers that want refresh
 * must call A5's RefreshManager directly (A6 does not import it).
 */
export async function getAuthStatus(
  deps: GetAuthStatusDeps = defaultGetAuthStatusDeps,
): Promise<AuthState> {
  const tokens = await deps.readTokens();
  return toAuthState(tokens, deps.now());
}
```

### 6.10 Modify `src/background/messaging/handlers.ts` (A5)

A6 edits exactly two blocks in A5's handlers file:

1. Replace `handleAuthSignIn`: delete the stub `throw new NotImplementedError('AUTH_SIGN_IN')` body and replace with a delegation to `signIn()`.
2. Replace `handleAuthSignOut`: delete the inline `clearTokens` + `clearAllTabState` calls and replace with a delegation to `signOut()`.

Do NOT introduce new imports outside the existing import block. Do NOT change the `HANDLERS` table entries (the keys remain `AUTH_SIGN_IN` and `AUTH_SIGN_OUT` as A5 declared).

```ts
// BEFORE (A5, abbreviated):
import { readTokens, clearTokens } from '../storage/tokens.js';
import { clearAllTabState } from '../storage/tab-state.js';
import { NotImplementedError } from '../sdk/errors.js';
// ...
const handleAuthSignIn: HandlerFor<'AUTH_SIGN_IN'> = async () => {
  throw new NotImplementedError('AUTH_SIGN_IN');
};
const handleAuthSignOut: HandlerFor<'AUTH_SIGN_OUT'> = async () => {
  await clearTokens();
  await clearAllTabState();
};
```

```ts
// AFTER (A6 edit):
import { readTokens } from '../storage/tokens.js';
import { signIn } from '../auth/sign-in.js';
import { signOut } from '../auth/sign-out.js';
import { getAuthStatus } from '../auth/status.js';
// `clearTokens`, `clearAllTabState`, and `NotImplementedError` imports are
// REMOVED here iff they are only used by handleAuthSignIn/Out. If A5
// uses them elsewhere in handlers.ts (e.g. refresh-failure path), keep
// the imports.
// ...
const handleAuthSignIn: HandlerFor<'AUTH_SIGN_IN'> = async () => {
  // A6: real implementation via the signIn driver.
  return signIn();
};
const handleAuthSignOut: HandlerFor<'AUTH_SIGN_OUT'> = async () => {
  // A6: delegate to auth/sign-out.ts which clears tokens + tab state
  // + broadcasts AUTH_STATE_CHANGED.
  return signOut();
};
const handleAuthStatus: HandlerFor<'AUTH_STATUS'> = async () => {
  // A6: delegate to auth/status.ts for a single tokens->AuthState path.
  return getAuthStatus();
};
```

Notes:

- `handleAuthStatus` may or may not already exist in A5 depending on A5's exact shipping state. If A5 ships a `handleAuthStatus` that calls `readTokens` + the inline derivation, A6 replaces it with the delegation above. If A5 does NOT ship `handleAuthStatus`, A6 adds it and includes it in the `HANDLERS` table (single-line addition at the bottom: `AUTH_STATUS: handleAuthStatus,`).
- `AUTH_STATE_CHANGED` is a broadcast-only key in A5's `HANDLERS` table (inert `async () => undefined`). A6 does NOT touch that entry. A6 never *handles* `AUTH_STATE_CHANGED`; it only emits it.
- `handlers.ts` gets +3 imports, -2 imports, +6 body lines, -5 body lines. Net diff: about +2 lines.

### 6.11 Modify `src/entrypoints/background.ts`

Single additive change: a side-effect import so the auth module participates in tree-shaking analysis and blueprint-contract checks.

```ts
// BEFORE (A5, abbreviated top of file):
import { defineBackground } from 'wxt/utils/define-background';
import { registerHandlers } from '@/background/messaging/handlers';
// ...

// AFTER (A6 edit, exactly two new lines at the top):
import { defineBackground } from 'wxt/utils/define-background';
import { registerHandlers } from '@/background/messaging/handlers';
// A6: side-effect import so the auth module's blueprint.contract.ts
// participates in tree-shaking and coverage reporting.
import '@/background/auth';
// ...
```

Rationale for the side-effect import: `handlers.ts` already imports `signIn`/`signOut`/`getAuthStatus` from `@/background/auth/...`, which pulls in every auth file transitively. The extra import at `background.ts` is a belt-and-braces signal that the module is part of the worker bundle; it also gives coverage tools (vitest + v8) a hook point.

### 6.12 Create `src/background/auth/index.ts` (barrel)

```ts
// src/background/auth/index.ts
/**
 * Public barrel for the auth module. Downstream phases (A10 popup,
 * A11 sidepanel) import from this path only.
 */

export { signIn, createSignIn, __resetSignInMutex, __getSignInInflight } from './sign-in';
export type { SignInDeps } from './sign-in';
export { defaultSignInDeps } from './sign-in';

export { signOut, defaultSignOutDeps } from './sign-out';
export type { SignOutDeps } from './sign-out';

export { getAuthStatus, defaultGetAuthStatusDeps } from './status';
export type { GetAuthStatusDeps } from './status';

export { toAuthState, UNAUTHENTICATED, MAX_FUTURE_EXPIRY_MS } from './state';
export type { AuthState } from './state';

export {
  parseFragment,
  defaultParseFragmentDeps,
} from './fragment-parser';
export type { ParsedFragment, ParseFragmentDeps } from './fragment-parser';

export {
  broadcastAuthStateChanged,
  defaultBroadcasterDeps,
} from './broadcaster';
export type { BroadcasterDeps } from './broadcaster';

export {
  AuthError,
  AuthCancelledError,
  AuthNetworkError,
  AuthProviderError,
  AuthMalformedResponseError,
  AuthStorageError,
} from './errors';

export { AUTH_BLUEPRINT } from './blueprint.contract';
```

### 6.13 Create `src/background/auth/blueprint.contract.ts` (D22)

```ts
// src/background/auth/blueprint.contract.ts
/**
 * Phase A6 blueprint contract. Machine-parseable declaration of this
 * module's public surface, forbidden imports, and coverage floor.
 *
 * CI runs `scripts/check-blueprint-contracts.mjs` which:
 *   - verifies declared publicExports match actual exports of index.ts
 *   - verifies forbiddenImports are absent from every file in src/background/auth/
 *   - verifies coverage-summary.json shows the floor or higher
 *
 * Ref: 02-decisions-v2.1-final.md §D22
 */

export const AUTH_BLUEPRINT = {
  phase: 'A6',
  version: '2.1',
  area: 'src/background/auth',
  publicExports: [
    'signIn',
    'createSignIn',
    'signOut',
    'getAuthStatus',
    'toAuthState',
    'UNAUTHENTICATED',
    'MAX_FUTURE_EXPIRY_MS',
    'parseFragment',
    'defaultParseFragmentDeps',
    'defaultSignInDeps',
    'defaultSignOutDeps',
    'defaultGetAuthStatusDeps',
    'defaultBroadcasterDeps',
    'broadcastAuthStateChanged',
    'AuthError',
    'AuthCancelledError',
    'AuthNetworkError',
    'AuthProviderError',
    'AuthMalformedResponseError',
    'AuthStorageError',
    'AUTH_BLUEPRINT',
    '__resetSignInMutex',
    '__getSignInInflight',
  ] as const,
  publicTypes: [
    'AuthState',
    'ParsedFragment',
    'ParseFragmentDeps',
    'SignInDeps',
    'SignOutDeps',
    'GetAuthStatusDeps',
    'BroadcasterDeps',
  ] as const,
  forbiddenImports: [
    // A6 must not reach into other phases' territory.
    'src/content/**',
    'src/ats/**',
    'src/core/**',
    'src/entrypoints/popup/**',
    'src/entrypoints/sidepanel/**',
    'src/entrypoints/options/**',
    // Must import sendMessage/onMessage from A5's protocol barrel, never
    // from @webext-core/messaging directly (see review-A6.md C6).
    '@webext-core/messaging',
  ] as const,
  requiredImports: [
    // Must import from A5's surface area per keystone §10.
    '@/background/messaging/protocol',
    '@/background/messaging/auth-state',
    '@/background/storage/tokens',
    '@/background/storage/tab-state',
    '@/background/log',
  ] as const,
  requiredCoverage: 90,
  owner: 'A6',
} as const;
```

### 6.14 Create `scripts/rollback-phase-A6.sh` (D23)

```bash
#!/usr/bin/env bash
# scripts/rollback-phase-A6.sh
# Mechanical rollback of Phase A6 (auth flow). Reverts A5 handlers.ts
# changes and removes every file A6 created.
#
# Safe to run multiple times. Fails loud if the working tree is dirty.
set -euo pipefail

echo "== Phase A6 rollback =="

if [[ -n "$(git status --porcelain)" ]]; then
  echo "FAIL: working tree is dirty. Commit or stash before rollback."
  exit 1
fi

# 1. Delete A6-created source files
rm -rf src/background/auth/
rm -rf tests/background/auth/

# 2. Revert A5 handlers.ts + background.ts to HEAD~1 (pre-A6 state).
#    The previous commit is assumed to be the A6 commit itself.
git checkout HEAD~1 -- src/background/messaging/handlers.ts || {
  echo "FAIL: could not revert handlers.ts"; exit 1;
}
git checkout HEAD~1 -- src/entrypoints/background.ts || {
  echo "FAIL: could not revert background.ts"; exit 1;
}

# 3. Delete the rollback script itself (it lives in the A6 commit).
#    Comment out the next line if you want to keep the script for repeat runs.
# rm -f scripts/rollback-phase-A6.sh

# 4. Verify the rollback is clean.
pnpm typecheck
pnpm test tests/background -- --run || true

echo "Phase A6 rolled back. Stage the reverts with 'git add -A && git commit'."
```

---

## 7. Tests

All tests live under `tests/background/auth/`. Vitest with `happy-dom` is declared in A1's `vitest.config.ts`. Each test file begins with a `vi.mock` block for the specific dependencies it fakes out.

**Test counts (must match exactly)**:

- fragment-parser.spec.ts: 22
- sign-in.spec.ts: 9
- sign-out.spec.ts: 3
- status.spec.ts: 4
- broadcaster.spec.ts: 3
- contract-consume-auth-state.type-test.ts: 1 type assertion (no runtime)

Total runtime cases: 41 runtime + 1 type-test = 42 assertions.

### 7.1 `tests/background/auth/fragment-parser.spec.ts` (22 cases)

D19 adversarial categories covered: null/undefined/NaN/Infinity at every parameter, unicode edge cases, injection (null byte, `#error=` smuggling, `?error=` smuggling, script in fragment), concurrent re-entry (N/A for pure fn), adversarial state (frozen input string), host impersonation.

```ts
import { describe, it, expect } from 'vitest';
import { parseFragment, MAX_FUTURE_EXPIRY_MS } from '@/background/auth';
import { AuthMalformedResponseError } from '@/background/auth';

const VALID_HOST = 'abcdefghijklmnopabcdefghijklmnop'; // 32 chars in a-p
const LONG_TOKEN = 'a'.repeat(64);
const FIXED_NOW = 1_700_000_000_000;
const FUTURE_EXP = FIXED_NOW + 30 * 60 * 1000;
const DEPS = { now: () => FIXED_NOW };

function url(params: Record<string, string | number | undefined>, hostOverride?: string, protoOverride?: string): string {
  const host = hostOverride ?? VALID_HOST;
  const proto = protoOverride ?? 'https';
  const frag = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${proto}://${host}.chromiumapp.org/cb#${frag}`;
}

describe('parseFragment (22 adversarial cases)', () => {
  // --- happy path (1) ---

  it('[01] parses a valid fragment with all four tokens', () => {
    const result = parseFragment(
      url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
      DEPS,
    );
    expect(result.accessToken).toBe(LONG_TOKEN);
    expect(result.refreshToken).toBe(LONG_TOKEN);
    expect(result.frontToken).toBe(LONG_TOKEN);
    expect(result.accessTokenExpiry).toBe(FUTURE_EXP);
  });

  // --- type / null / NaN cases (3) ---

  it('[02] throws on non-string redirectUrl (null)', () => {
    expect(() => parseFragment(null as unknown as string, DEPS)).toThrow(AuthMalformedResponseError);
  });

  it('[03] throws on empty string', () => {
    expect(() => parseFragment('', DEPS)).toThrow(/empty/);
  });

  it('[04] throws on a 16384+ char URL (DoS clamp)', () => {
    const huge = `https://${VALID_HOST}.chromiumapp.org/cb#at=${'a'.repeat(20000)}`;
    expect(() => parseFragment(huge, DEPS)).toThrow(/too long/);
  });

  // --- protocol / host (4) ---

  it('[05] throws on non-https protocol', () => {
    const bad = url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }, undefined, 'http');
    expect(() => parseFragment(bad, DEPS)).toThrow(/protocol/);
  });

  it('[06] throws on non-chromiumapp.org host', () => {
    const bad = `https://evil.com/cb#at=${LONG_TOKEN}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`;
    expect(() => parseFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  it('[07] throws on chromiumapp.org with uppercase ID', () => {
    const bad = url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }, VALID_HOST.toUpperCase());
    expect(() => parseFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  it('[08] throws on chromiumapp.org with length-31 ID (short host)', () => {
    const bad = url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }, 'abcdefghijklmnopabcdefghijklmno');
    expect(() => parseFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  // --- fragment presence / error smuggling (3) ---

  it('[09] throws on empty fragment', () => {
    expect(() => parseFragment(`https://${VALID_HOST}.chromiumapp.org/cb`, DEPS)).toThrow(/no fragment/);
  });

  it('[10] treats #error= as tampering (NOT as legitimate bridge error)', () => {
    const bad = url({ error: 'access_denied' });
    expect(() => parseFragment(bad, DEPS)).toThrow(/tampering/);
  });

  it('[11] treats ?error= in query as tampering', () => {
    const bad = `https://${VALID_HOST}.chromiumapp.org/cb?error=server_error#at=${LONG_TOKEN}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`;
    expect(() => parseFragment(bad, DEPS)).toThrow(/tampering/);
  });

  // --- missing field cases (4) ---

  it('[12] throws when at is missing', () => {
    expect(() => parseFragment(url({ rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/Missing.*at/);
  });

  it('[13] throws when rt is missing', () => {
    expect(() => parseFragment(url({ at: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/Missing.*rt/);
  });

  it('[14] throws when ft is missing', () => {
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/Missing.*ft/);
  });

  it('[15] throws when exp is missing', () => {
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN }), DEPS)).toThrow(/Missing.*exp/);
  });

  // --- expiry sanity (4) ---

  it('[16] throws when exp is not a number', () => {
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: 'soon' }), DEPS)).toThrow(/positive integer/);
  });

  it('[17] throws when exp is zero or negative', () => {
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: 0 }), DEPS)).toThrow(/positive integer/);
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: -1 }), DEPS)).toThrow(/positive integer/);
  });

  it('[18] throws when exp is in the past (clock skew or tampering)', () => {
    const past = FIXED_NOW - 1000;
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: past }), DEPS)).toThrow(/in the past/);
  });

  it('[19] throws when exp is more than 24h in the future', () => {
    const far = FIXED_NOW + MAX_FUTURE_EXPIRY_MS + 1;
    expect(() => parseFragment(url({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: far }), DEPS)).toThrow(/24h/);
  });

  // --- token shape (3) ---

  it('[20] throws when a token is too short', () => {
    expect(() => parseFragment(url({ at: 'short', rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/too short/);
  });

  it('[21] throws when a token contains a null byte (smuggling)', () => {
    const bad = `${'a'.repeat(40)}\0payload`;
    expect(() => parseFragment(url({ at: bad, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/disallowed|null/);
  });

  it('[22] throws when a token contains whitespace or control chars', () => {
    const bad = `${'a'.repeat(30)} space${'b'.repeat(10)}`;
    expect(() => parseFragment(url({ at: bad, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }), DEPS)).toThrow(/disallowed/);
  });
});
```

### 7.2 `tests/background/auth/sign-in.spec.ts` (9 cases including concurrent mutex)

D19 adversarial categories covered: null/undefined at every injected dep, concurrent re-entry (same-instance mutex), storage quota-exceeded, broadcast listener throws, user cancel, network error, clock skew between parser and state derivation.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSignIn,
  __resetSignInMutex,
  type SignInDeps,
  AuthCancelledError,
  AuthNetworkError,
  AuthMalformedResponseError,
  AuthStorageError,
  AuthProviderError,
} from '@/background/auth';
import type { StoredTokens } from '@/background/storage/tokens';
import type { AuthState } from '@/background/messaging/auth-state';

const VALID_HOST = 'abcdefghijklmnopabcdefghijklmnop';
const FIXED_NOW = 1_700_000_000_000;
const FUTURE_EXP = FIXED_NOW + 30 * 60 * 1000;
const LONG = 'a'.repeat(64);

function buildRedirect(overrides: Partial<Record<'at' | 'rt' | 'ft' | 'exp', string | number>> = {}): string {
  const merged = { at: LONG, rt: LONG, ft: LONG, exp: FUTURE_EXP, ...overrides };
  const frag = Object.entries(merged).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return `https://${VALID_HOST}.chromiumapp.org/cb#${frag}`;
}

function makeDeps(overrides: Partial<SignInDeps> = {}): SignInDeps {
  const calls: { writeTokens: StoredTokens[]; broadcasts: AuthState[] } = { writeTokens: [], broadcasts: [] };
  const base: SignInDeps = {
    launchWebAuthFlow: vi.fn().mockResolvedValue(buildRedirect()),
    getRedirectURL: vi.fn().mockReturnValue(`https://${VALID_HOST}.chromiumapp.org/`),
    parseFragment: (await import('@/background/auth')).parseFragment as SignInDeps['parseFragment'],
    writeTokens: vi.fn().mockImplementation(async (t: StoredTokens) => {
      calls.writeTokens.push(t);
    }),
    readTokens: vi.fn().mockImplementation(async () => {
      const t = calls.writeTokens.at(-1);
      return t ?? null;
    }),
    broadcast: vi.fn().mockImplementation(async (s: AuthState) => {
      calls.broadcasts.push(s);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    now: () => FIXED_NOW,
    bridgeUrl: 'https://llmconveyors.com/en/auth/extension-signin',
    ...overrides,
  };
  return base;
}

beforeEach(() => {
  __resetSignInMutex();
});

describe('signIn (9 cases)', () => {
  it('[01] happy path: launches, parses, persists, broadcasts, returns authed state', async () => {
    const deps = makeDeps();
    const signIn = createSignIn(deps);
    const state = await signIn();
    expect(state).toEqual({ authed: true, email: null, accessTokenExpiry: FUTURE_EXP });
    expect(deps.launchWebAuthFlow).toHaveBeenCalledOnce();
    expect(deps.writeTokens).toHaveBeenCalledWith({
      accessToken: LONG, refreshToken: LONG, frontToken: LONG, accessTokenExpiry: FUTURE_EXP, email: null,
    });
    expect(deps.broadcast).toHaveBeenCalledWith(state);
  });

  it('[02] builds bridge URL with redirect query param and interactive: true', async () => {
    const deps = makeDeps();
    await createSignIn(deps)();
    const call = (deps.launchWebAuthFlow as unknown as { mock: { calls: Array<[{ url: string; interactive: boolean }]> } }).mock.calls[0][0];
    const u = new URL(call.url);
    expect(u.origin).toBe('https://llmconveyors.com');
    expect(u.pathname).toBe('/en/auth/extension-signin');
    expect(u.searchParams.get('redirect')).toBe(`https://${VALID_HOST}.chromiumapp.org/`);
    expect(call.interactive).toBe(true);
  });

  it('[03] user cancel -> AuthCancelledError, no writes, no broadcast', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockRejectedValue(new Error('The user did not approve access.')),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthCancelledError);
    expect(deps.writeTokens).not.toHaveBeenCalled();
    expect(deps.broadcast).not.toHaveBeenCalled();
  });

  it('[04] network error -> AuthNetworkError', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockRejectedValue(new Error('Authorization page could not be loaded.')),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthNetworkError);
  });

  it('[05] unknown chrome error -> AuthProviderError', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockRejectedValue(new Error('OAuth2 request failed')),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthProviderError);
  });

  it('[06] malformed fragment (missing at) -> AuthMalformedResponseError', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockResolvedValue(
        `https://${VALID_HOST}.chromiumapp.org/cb#rt=${LONG}&ft=${LONG}&exp=${FUTURE_EXP}`,
      ),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthMalformedResponseError);
  });

  it('[07] host impersonation -> AuthMalformedResponseError', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockResolvedValue(
        `https://evil.com/cb#at=${LONG}&rt=${LONG}&ft=${LONG}&exp=${FUTURE_EXP}`,
      ),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthMalformedResponseError);
  });

  it('[08] writeTokens quota exceeded -> AuthStorageError, no broadcast', async () => {
    const deps = makeDeps({
      writeTokens: vi.fn().mockRejectedValue(new Error('QuotaExceededError')),
    });
    await expect(createSignIn(deps)()).rejects.toBeInstanceOf(AuthStorageError);
    expect(deps.broadcast).not.toHaveBeenCalled();
  });

  it('[09] MUTEX: two concurrent signIn calls share one launchWebAuthFlow invocation', async () => {
    let resolveFlow: (v: string) => void = () => {};
    const launchFlowPromise = new Promise<string>((res) => { resolveFlow = res; });
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockImplementation(() => launchFlowPromise),
    });
    const boundSignIn = createSignIn(deps);
    const p1 = boundSignIn();
    const p2 = boundSignIn();
    // Both share the in-flight promise; launchWebAuthFlow called only once.
    resolveFlow(buildRedirect());
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(deps.launchWebAuthFlow).toHaveBeenCalledTimes(1);
  });
});
```

Note on Test 09: the mutex is module-level, so `boundSignIn` returned by `createSignIn(deps)` shares mutex state with every other `createSignIn` call in the same test run. `beforeEach` resets it via `__resetSignInMutex()`.

### 7.3 `tests/background/auth/sign-out.spec.ts` (3 cases)

```ts
import { describe, it, expect, vi } from 'vitest';
import { signOut, AuthStorageError, type SignOutDeps } from '@/background/auth';
import type { AuthState } from '@/background/messaging/auth-state';

function makeDeps(overrides: Partial<SignOutDeps> = {}): SignOutDeps {
  return {
    clearTokens: vi.fn().mockResolvedValue(undefined),
    clearAllTabState: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined) as SignOutDeps['broadcast'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('signOut (3 cases)', () => {
  it('[01] clears tokens + tab state, broadcasts UNAUTHENTICATED, returns UNAUTHENTICATED', async () => {
    const deps = makeDeps();
    const state = await signOut(deps);
    expect(state).toEqual({ authed: false });
    expect(deps.clearTokens).toHaveBeenCalledOnce();
    expect(deps.clearAllTabState).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalledWith({ authed: false });
  });

  it('[02] idempotent: calling twice still returns UNAUTHENTICATED', async () => {
    const deps = makeDeps();
    const a = await signOut(deps);
    const b = await signOut(deps);
    expect(a).toEqual({ authed: false });
    expect(b).toEqual({ authed: false });
    expect(deps.clearTokens).toHaveBeenCalledTimes(2);
    expect(deps.clearAllTabState).toHaveBeenCalledTimes(2);
  });

  it('[03] clearTokens throws -> AuthStorageError, no tab-state cleanup, no broadcast', async () => {
    const deps = makeDeps({
      clearTokens: vi.fn().mockRejectedValue(new Error('quota')),
    });
    await expect(signOut(deps)).rejects.toBeInstanceOf(AuthStorageError);
    expect(deps.clearAllTabState).not.toHaveBeenCalled();
    expect(deps.broadcast).not.toHaveBeenCalled();
  });
});
```

### 7.4 `tests/background/auth/status.spec.ts` (4 cases)

```ts
import { describe, it, expect, vi } from 'vitest';
import { getAuthStatus, MAX_FUTURE_EXPIRY_MS, type GetAuthStatusDeps } from '@/background/auth';
import type { StoredTokens } from '@/background/storage/tokens';

const FIXED_NOW = 1_700_000_000_000;

function makeDeps(tokens: StoredTokens | null): GetAuthStatusDeps {
  return {
    readTokens: vi.fn().mockResolvedValue(tokens),
    now: () => FIXED_NOW,
  };
}

describe('getAuthStatus (4 cases)', () => {
  it('[01] returns UNAUTHENTICATED when no tokens stored', async () => {
    expect(await getAuthStatus(makeDeps(null))).toEqual({ authed: false });
  });

  it('[02] returns authed state when tokens are valid', async () => {
    const exp = FIXED_NOW + 30 * 60 * 1000;
    const state = await getAuthStatus(makeDeps({
      accessToken: 'a'.repeat(64), refreshToken: 'b'.repeat(64), frontToken: 'c'.repeat(64), accessTokenExpiry: exp, email: null,
    }));
    expect(state).toEqual({ authed: true, email: null, accessTokenExpiry: exp });
  });

  it('[03] returns UNAUTHENTICATED when access token is expired', async () => {
    const state = await getAuthStatus(makeDeps({
      accessToken: 'a'.repeat(64), refreshToken: 'b'.repeat(64), frontToken: 'c'.repeat(64), accessTokenExpiry: FIXED_NOW - 1000, email: null,
    }));
    expect(state).toEqual({ authed: false });
  });

  it('[04] returns UNAUTHENTICATED when expiry is beyond 24h future clamp', async () => {
    const state = await getAuthStatus(makeDeps({
      accessToken: 'a'.repeat(64), refreshToken: 'b'.repeat(64), frontToken: 'c'.repeat(64), accessTokenExpiry: FIXED_NOW + MAX_FUTURE_EXPIRY_MS + 1, email: null,
    }));
    expect(state).toEqual({ authed: false });
  });
});
```

### 7.5 `tests/background/auth/broadcaster.spec.ts` (3 cases)

Fixes the v1 reviewer F-category finding: the new Test 03 tests real behavior (logger is called, function resolves without throwing) rather than testing a mock of itself.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastAuthStateChanged, type BroadcasterDeps } from '@/background/auth';
import type { AuthState } from '@/background/messaging/auth-state';

function makeDeps(overrides: Partial<BroadcasterDeps> = {}): BroadcasterDeps {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined) as unknown as BroadcasterDeps['sendMessage'],
    logger: { warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
}

describe('broadcastAuthStateChanged (3 cases)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('[01] sends AUTH_STATE_CHANGED with the state and debug-logs', async () => {
    const deps = makeDeps();
    await broadcastAuthStateChanged({ authed: false }, deps);
    expect(deps.sendMessage).toHaveBeenCalledWith('AUTH_STATE_CHANGED', { authed: false });
    expect(deps.logger.debug).toHaveBeenCalledWith('AUTH_STATE_CHANGED broadcast delivered', expect.objectContaining({ authed: false }));
  });

  it('[02] swallows "no receiver" errors silently (no warn)', async () => {
    const deps = makeDeps({
      sendMessage: vi.fn().mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.')) as unknown as BroadcasterDeps['sendMessage'],
    });
    await expect(broadcastAuthStateChanged({ authed: false }, deps)).resolves.toBeUndefined();
    expect(deps.logger.warn).not.toHaveBeenCalled();
    expect(deps.logger.debug).toHaveBeenCalledWith('AUTH_STATE_CHANGED had no receiver', expect.any(Object));
  });

  it('[03] unexpected send error is logged at WARN and function resolves without throwing', async () => {
    const deps = makeDeps({
      sendMessage: vi.fn().mockRejectedValue(new Error('DataCloneError: structured clone failed')) as unknown as BroadcasterDeps['sendMessage'],
    });
    // Real behavior: resolves (does not throw) AND logs at warn.
    await expect(broadcastAuthStateChanged({ authed: false }, deps)).resolves.toBeUndefined();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'AUTH_STATE_CHANGED broadcast failed unexpectedly',
      expect.objectContaining({ errName: 'Error', errMessage: expect.stringContaining('DataCloneError') }),
    );
  });
});
```

### 7.6 `tests/background/auth/contract-consume-auth-state.type-test.ts`

Contract verification: A6's usage of `AuthState` matches A5's shipped type. Compile-time only; no runtime assertions.

```ts
// Type-level contract test. Compile-time only; no runtime behavior.
import type { AuthState } from '@/background/messaging/auth-state';
import type { SignInDeps } from '@/background/auth/sign-in';
import type { GetAuthStatusDeps } from '@/background/auth/status';
import { signIn, getAuthStatus, toAuthState, UNAUTHENTICATED } from '@/background/auth';

// --- UNAUTHENTICATED is assignable to AuthState ---
const _unauth: AuthState = UNAUTHENTICATED;
void _unauth;

// --- toAuthState returns AuthState ---
const _derived: AuthState = toAuthState(null);
void _derived;

// --- signIn() resolves to AuthState ---
async function _checkSignIn(): Promise<AuthState> {
  return signIn();
}
void _checkSignIn;

// --- getAuthStatus() resolves to AuthState ---
async function _checkStatus(): Promise<AuthState> {
  return getAuthStatus();
}
void _checkStatus;

// --- SignInDeps.broadcast accepts AuthState ---
type _BroadcastArg = Parameters<SignInDeps['broadcast']>[0];
type _Assert1 = _BroadcastArg extends AuthState ? true : false;
const _check1: _Assert1 = true;
void _check1;

// --- GetAuthStatusDeps is shaped correctly ---
type _ReadTokensResult = Awaited<ReturnType<GetAuthStatusDeps['readTokens']>>;
type _Assert2 = _ReadTokensResult extends null | { accessTokenExpiry: number } ? true : false;
const _check2: _Assert2 = true;
void _check2;

// --- AuthState is a discriminated union: narrowing works ---
function _narrow(state: AuthState): number | null {
  if (state.authed) {
    return state.accessTokenExpiry;
  }
  return null;
}
void _narrow;

// This file has no describe/it; vitest picks it up as a type-check-only
// module via the `.type-test.ts` naming convention declared in
// vitest.config.ts include glob. If A5 changes AuthState's shape
// incompatibly, this file fails to compile.

describe('contract-consume-auth-state (1 type-level assertion)', () => {
  it('compiles (type-only)', () => {
    expect(true).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
```

---

## 8. Acceptance criteria

- [ ] `pnpm typecheck` passes with zero errors. The contract-consume-auth-state.type-test.ts compiles.
- [ ] `pnpm lint` passes with zero warnings. No `eslint-disable` comments anywhere in A6.
- [ ] `pnpm test tests/background/auth -- --run` passes all 42 assertions, zero skips, zero failures.
- [ ] `pnpm test:coverage` shows src/background/auth/** at >= 90% line coverage, >= 85% branch coverage (matches D24 background floor; A6 targets the higher 90% per its blueprint.contract.ts requiredCoverage).
- [ ] `pnpm build` produces `.output/chrome-mv3/` without warnings.
- [ ] Extension loads unpacked in Chrome 114+; the background service worker comes up without errors in `chrome://extensions` -> Details -> Service Worker -> Inspect.
- [ ] Manual test 1: in the SW console run `chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }).then(console.log)`. Expect `{ authed: false }`.
- [ ] Manual test 2: in the SW console run `chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }).then(console.log)`. Expect a Chrome-owned popup to open showing `https://llmconveyors.com/en/auth/extension-signin?redirect=...`. Complete sign-in. Expect the popup to close and the promise to resolve with `{ authed: true, email: null, accessTokenExpiry: <ms> }`.
- [ ] Manual test 3: in the SW console run `chrome.storage.session.get('llmc.tokens.v1').then(console.log)`. Expect the record with keys `access`, `refresh`, `frontToken`, `accessTokenExpiry`.
- [ ] Manual test 4: run `chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }).then(console.log)` again. Expect `{ authed: true, email: null, accessTokenExpiry: <ms> }`.
- [ ] Manual test 5: run `chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' }).then(console.log)`. Expect `{ authed: false }`. Re-run manual test 3: the record is gone.
- [ ] Forbidden-token grep (D14.1) in `src/background/auth/` returns zero matches: `grep -rE '\bconsole\.(log|info|warn|error|debug)' src/background/auth/`.
- [ ] Forbidden-import grep returns zero matches: `grep -rE "from '@webext-core/messaging'" src/background/auth/`.
- [ ] Em-dash grep (D15): `grep -rl $'\u2014' src/background/auth/ tests/background/auth/ temp/impl/100-chrome-extension-mvp/phase_A6_auth_flow/` returns zero.
- [ ] Directory grep: `grep -rn 'job-assistant' .` returns zero matches anywhere in A6 source or plan file.
- [ ] `scripts/check-blueprint-contracts.mjs` verifies `AUTH_BLUEPRINT`: publicExports match actual exports, forbiddenImports are absent, required imports are present, coverage floor met.
- [ ] `bash scripts/rollback-phase-A6.sh` is syntactically valid shell (`bash -n scripts/rollback-phase-A6.sh` exits 0). Do NOT actually run it in the acceptance pass.
- [ ] Protocol-contract type-test (D14.2) in `tests/background/messaging/protocol-contract.type-test.ts` still compiles. (This is A5's test; A6 must not break it.)
- [ ] No direct `chrome.identity.*` calls anywhere in `src/background/auth/` except inside `defaultSignInDeps`'s two fields. Verified by `grep -rE 'chrome\.identity' src/background/auth/`.
- [ ] No `any` types in production code. `grep -rn ': any\b' src/background/auth/` returns zero. Type-test file may use `as unknown as T` for fake interop where structured types are impossible.

---

## 9. Manual verification script

Save as `scripts/verify-phase-A6.sh`. It is a one-shot script the executor runs at the end of the phase. Keep it committed (not deleted) so future rollback/replay can reuse it.

```bash
#!/usr/bin/env bash
# scripts/verify-phase-A6.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== [A6] typecheck =="
pnpm typecheck

echo "== [A6] lint =="
pnpm lint

echo "== [A6] unit tests =="
pnpm test tests/background/auth -- --run

echo "== [A6] coverage =="
pnpm test:coverage -- --run tests/background/auth
# We do not fail hard on coverage here; the real gate is vitest.config.ts
# thresholds. This step is informational.

echo "== [A6] build =="
pnpm build

echo "== [A6] forbidden-token grep (D14.1) =="
if grep -rE '\bconsole\.(log|info|warn|error|debug)' src/background/auth/ tests/background/auth/ 2>/dev/null; then
  echo "FAIL: console.* usage in A6"
  exit 1
fi

echo "== [A6] forbidden @webext-core/messaging direct import =="
if grep -rE "from '@webext-core/messaging'" src/background/auth/ 2>/dev/null; then
  echo "FAIL: direct @webext-core/messaging import in A6 (must import from @/background/messaging/protocol)"
  exit 1
fi

echo "== [A6] em-dash grep (D15) =="
if grep -rl $'\u2014' src/background/auth/ tests/background/auth/ 2>/dev/null; then
  echo "FAIL: em-dash found in A6"
  exit 1
fi

echo "== [A6] wrong-working-dir grep =="
if grep -rn 'job-assistant' src/ tests/ scripts/ 2>/dev/null; then
  echo "FAIL: job-assistant reference (must be llmconveyors-chrome-extension)"
  exit 1
fi

echo "== [A6] blueprint contract check =="
node scripts/check-blueprint-contracts.mjs src/background/auth

echo "== [A6] rollback script syntax =="
bash -n scripts/rollback-phase-A6.sh

echo "All A6 checks passed."
```

---

## 10. Risks and open issues

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | A5 ships `AuthState` as an interface rather than a discriminated union | Keystone §1.2 locks the discriminated union shape. If A5's shipped file diverges, A6 reports it as an A5 bug and blocks until A5 is amended. Do NOT patch A5 from A6. |
| R2 | Bridge URL locale prefix changes from `/en/` to something else | `BRIDGE_URL` reads from `import.meta.env.WXT_BRIDGE_URL` with the `/en/` fallback. Local dev can set `WXT_BRIDGE_URL=http://localhost:3000/en/auth/extension-signin` in `.env.development`. |
| R3 | `chrome.identity.getRedirectURL()` returns different IDs in dev vs prod | A1 pins a single dev key via `WXT_DEV_EXTENSION_KEY` in `wxt.config.ts`. If the key drifts, Chrome will change the extension ID and `CHROMIUMAPP_HOST` will reject. Test by regenerating the key on dev machine. |
| R4 | SuperTokens access token exceeds 8192 chars (`MAX_TOKEN_LENGTH`) | Unlikely for standard 1h JWT tokens. If it happens, raise the cap in `fragment-parser.ts` and update the corresponding test. |
| R5 | `@webext-core/messaging`'s `onMessage` cannot transport `Error` subclasses faithfully | Callers rely on `err.name` (own property, preserved by structured clone) rather than `instanceof`. Documented in `errors.ts` top comment and acceptance criteria. |
| R6 | Clock skew > 24h between user's clock and bridge's clock | `MAX_FUTURE_EXPIRY_MS = 24h` sanity clamp rejects fresh tokens. The false-positive rate on legitimate clock skew is low (modern OSes sync NTP on boot). If a user's clock is demonstrably wrong, the error message is clear enough that they can fix it. No mitigation code in A6; documented as a known limitation. |
| R7 | Two concurrent `AUTH_SIGN_IN` calls race the mutex before the module hoists | Module-level `let inflight` is initialized to `null` at module evaluation time (synchronous). Any `createSignIn(...)` call happens strictly after module eval, so the race is impossible. |
| R8 | A10 popup calls sendMessage from a context that bypasses A5's typed instance | A5's protocol barrel is the only way to get typed `sendMessage`. Popup TypeScript imports from `@/background/messaging/protocol`. D22 blueprint.contract.ts `forbiddenImports` catches any attempt to bypass in A6. A10's blueprint.contract.ts (shipped in A10 phase) catches it on the popup side. |
| R9 | `clearAllTabState` failure leaves per-tab state stale after token clear | `sign-out.ts` logs the failure at warn level but does not roll back. Per-tab state is derived data; next content-script run will re-populate. Partial inconsistency is accepted; full rollback would require a transaction log that A5 does not provide. |
| R10 | Test 09 (mutex) is timing-sensitive and flaky on CI | `resolveFlow` is called synchronously after both `p1` and `p2` are constructed; `Promise.all` awaits both. The test does not rely on `setTimeout` or event loop ordering. If CI flakes, add an explicit microtask yield (`await Promise.resolve()`) between `p2` and `resolveFlow`. |

---

## 11. Rollback plan

See `scripts/rollback-phase-A6.sh` (§6.14). Rollback is mechanical:

1. Delete `src/background/auth/` and `tests/background/auth/`
2. Revert `src/background/messaging/handlers.ts` to its pre-A6 state (A5 stub restored)
3. Revert `src/entrypoints/background.ts` to remove the side-effect import
4. Run `pnpm typecheck` to verify the rollback is clean
5. Stage and commit the reverts

Rollback leaves A5 fully operational because A6 never mutated A5's exports -- only its handler bodies.

---

## 12. Checklist (paste into phase completion report)

- [ ] Section 3 context files all read (list each file in the report with a one-line summary)
- [ ] Section 6.1 baseline verification passed (A1 + A5 surface intact)
- [ ] All 10 new files created
- [ ] Both modified files (`handlers.ts`, `background.ts`) touched correctly
- [ ] All 6 test files created with the exact case counts from Section 7
- [ ] Test case IDs in fragment-parser.spec.ts are `[01]`-`[22]` (22 cases)
- [ ] Test case IDs in sign-in.spec.ts are `[01]`-`[09]` (9 cases, includes mutex)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean (zero warnings, zero `eslint-disable`)
- [ ] `pnpm test tests/background/auth -- --run` all 42 assertions green
- [ ] `pnpm test:coverage` shows src/background/auth >= 90% line, >= 85% branch
- [ ] `pnpm build` produces `.output/chrome-mv3/`
- [ ] Manual tests 1-5 executed (screenshots or console transcript in the completion report)
- [ ] Forbidden-token greps all zero
- [ ] Em-dash grep zero
- [ ] `job-assistant` grep zero
- [ ] `scripts/check-blueprint-contracts.mjs` passes for `src/background/auth`
- [ ] `bash -n scripts/rollback-phase-A6.sh` exits 0
- [ ] Commit message: `feat(100-A6): extension auth flow (launchWebAuthFlow + fragment parser + token storage)`
- [ ] Phase completion report saved with this checklist marked off
- [ ] `temp/impl/100-chrome-extension-mvp/reviews/review-A6.md` review items C1-C6, E, F (broadcaster test), F (concurrent sign-in) all have corresponding fixes verified

---

## 13. Commit plan

Single atomic commit. Do NOT split across commits - A6 is the full sign-in flow; partial landings break A5's handler table (the stub replacement depends on `signIn` existing).

```
feat(100-A6): extension auth flow (launchWebAuthFlow + fragment parser + token storage)

Implements the background service worker auth flow for the llmconveyors
Chrome extension, v2.1 spec. Wires chrome.identity.launchWebAuthFlow
against llmconveyors.com/en/auth/extension-signin (A4), parses the
chromiumapp.org fragment into typed tokens, persists via A5 storage,
and broadcasts AUTH_STATE_CHANGED via the A5 messaging barrel.

Replaces A5's AUTH_SIGN_IN stub with a real driver. Wraps A5's
AUTH_SIGN_OUT with the post-cleanup broadcast. Adds AUTH_STATUS
delegation. Module-level single-flight mutex for concurrent sign-in.
Typed error hierarchy (AuthCancelledError, AuthNetworkError,
AuthProviderError, AuthMalformedResponseError, AuthStorageError)
consumed via err.name on the messaging boundary.

Full DI per D20. createLogger per D11. No console.*, no em-dashes.
blueprint.contract.ts per D22. rollback script per D23. Adversarial
fragment-parser tests (22) plus concurrent-mutex test (1) per D19.

Files: 10 created, 2 modified. Tests: 6 specs, 42 cases.
Blocks: A7, A10, A11. Depends on: A1, A5, A2, A4.
```

---

## 14. What A7, A10, A11 inherit from A6

- **A7** (profile storage + options page):
  - Imports `getAuthStatus` from `@/background/auth` to guard the profile-fetch API call mounted in the options page effect.
  - Uses `toAuthState` for local optimistic updates if tokens drift mid-flow.
  - Does NOT consume `SignInDeps` or any mutable internal.

- **A10** (popup):
  - Imports `sendMessage` from `@/background/messaging/protocol` (NOT directly from `@webext-core/messaging`).
  - Click handler: `const state = await sendMessage('AUTH_SIGN_IN')`.
  - Error handling branches on `err.name` in `{ 'AuthCancelledError', 'AuthNetworkError', 'AuthProviderError', 'AuthMalformedResponseError', 'AuthStorageError' }`.
  - Imports `AuthState` type from A5 (via `@/background/messaging/auth-state`) for UI state typing. Optionally imports the error class names as string-valued const union for exhaustive error switch: `type KnownAuthErrorName = 'AuthCancelledError' | 'AuthNetworkError' | ...`.

- **A11** (sidepanel):
  - Imports `onMessage` from `@/background/messaging/protocol`.
  - Subscribes: `onMessage('AUTH_STATE_CHANGED', (msg) => rerender(msg.data))` on mount.
  - On mount also calls `sendMessage('AUTH_STATUS')` to prime local state before the first broadcast arrives.

---

## 15. Traceability matrix (review-A6.md findings -> fixes)

| Review finding | Fix location in this plan |
|---|---|
| C1 -- `setTokens`/`getTokens` do not exist in A5 | §6.2 rename table + §6.7 sign-in.ts uses `writeTokens` / §6.9 status.ts uses `readTokens` |
| C2 -- working dir `e:/job-assistant` wrong | §4 (locked to `e:/llmconveyors-chrome-extension`) + §8 acceptance `grep -rn 'job-assistant'` gate |
| C4 -- ProtocolMap signature shape mismatch | §5.4 (A6 does NOT touch ProtocolMap; D2 makes A5 the sole owner) + keystone §1.1 authoritative shape |
| C5 -- `AuthState` vs `AuthStatus` shape mismatch | §6.4 imports `AuthState` from A5's `auth-state.ts` (keystone §1.2 discriminated union) |
| C6 -- direct `@webext-core/messaging` import drops broadcasts | §6.6 broadcaster.ts imports from `@/background/messaging/protocol` + §8 forbidden-import grep gate + §6.13 blueprint.contract.ts `forbiddenImports` |
| E -- sign-out regression: A5's `clearAllTabState` missing | §6.8 sign-out.ts calls `clearAllTabState` as a mandatory dep + §7.3 Test 01 asserts the call |
| F -- broadcaster test is testing its own mock | §7.5 Test 03 rewritten to assert real behavior: logger.warn is called, function resolves without throw |
| F -- concurrent sign-in mutex missing | §6.7 module-level single-flight + `createSignIn` factory + §7.2 Test 09 asserts single launchWebAuthFlow call for two parallel `signIn()` |
| R3 -- BRIDGE_URL locale hardcode | §6.7 `BRIDGE_URL` reads from `import.meta.env.WXT_BRIDGE_URL` with prod fallback |
| Strengths to preserve: fragment parser, typed errors, 22 parser tests, manual verification, refresh deferral | §6.3 errors.ts, §6.5 fragment-parser.ts (strengthened with additional length cap + `truncate` in error msgs), §7.1 (22 cases), §9 verify script, §1 out-of-scope refresh |

---

## 16. Design notes and rationales

### 16.1 Why five error classes instead of one-with-code

A single `AuthError` with a `.code` field would be simpler to wire over the messaging boundary, but it trades one problem for another: consumers have to pattern-match on a string field that TypeScript cannot discriminate. With five classes, consumers branch on `err.name` and TypeScript narrows the type within each branch.

The cost is five constructor bodies that all do the same thing. The benefit is that a missing `case 'AuthFooError':` in a popup error-handling `switch` is a runtime bug the first time; with one class + one code field, it is a runtime bug every time forever.

### 16.2 Why `parseFragment` is a pure function with a `deps: { now }`

The v1 plan's fragment parser called `Date.now()` directly. That creates a subtle race: the parser's clamp uses `now()` at parse time; `toAuthState`'s clamp uses `now()` at derivation time; between those two moments the clock can advance (SW sleep cycle, NTP correction). If the parser accepted a token with `exp = now + 24h - 1ms`, then the derivation 100ms later rejects it because `exp < now + 24h - 0ms`. Test 09 of the v1 plan (post-expiry window) was fragile because of this.

v2.1 fixes by passing `now: () => FIXED_NOW` through a `ParseFragmentDeps` object. In production the same `Date.now` reference is shared across parse and derivation; in tests, the single `FIXED_NOW` constant is passed to both. Deterministic.

### 16.3 Why the mutex is module-level, not per-instance

The mutex guards a process-level resource (Chrome's `launchWebAuthFlow`, which allows exactly one flow per extension at a time -- investigation 34 §j gotcha 3). Every call to `signIn()` in the same service worker hits the same underlying Chrome API, regardless of which `SignInDeps` was used to build the `createSignIn` factory. A per-instance mutex would permit two bogus concurrent calls by constructing two factories with two different deps.

The downside is tests must reset `inflight` between cases via `__resetSignInMutex()`. This is fine -- it is a named, exported test-only helper with a `@internal` JSDoc tag.

### 16.4 Why `readTokens` post-write verification

The `read-back-after-write` step in `sign-in.ts` catches a subtle class of bugs: `chrome.storage.session.set` can silently drop fields if the record exceeds 10MB (the per-item quota) or if the storage area is corrupted. `writeTokens` does shallow validation on the input but does not read back. The read-back verifies that what we persisted is what we persisted.

The cost is one extra async hop. The benefit is that a broken storage layer gets caught in `sign-in` (typed AuthStorageError) rather than silently drifting to "signed in but nothing persists" at the first `readTokens` call in A7.

### 16.5 Why `signOut` logs and continues on `clearAllTabState` failure

If `clearTokens` succeeds and `clearAllTabState` fails, the user is effectively signed out (tokens are gone, so any auth header check will see unauthenticated) but per-tab state (which tab has an intent, which tab has highlights on) is stale. The next content-script run on that tab will observe its own state is stale and recompute.

The alternative -- roll back the sign-out by calling `writeTokens` again with the old tokens -- is worse: the old tokens are the same object we just cleared; we would have to read them first into a local var, and a concurrent refresh manager call could mutate them mid-flight. Simpler to accept the stale per-tab state and log it.

### 16.6 Why `handlers.ts` changes are minimal (2 imports, 6 lines)

The full sign-in/sign-out/status logic lives in `src/background/auth/*.ts`. `handlers.ts` is just a dispatch table -- it imports the drivers and calls them. This is D20 compliance: `handlers.ts` does not know about `launchWebAuthFlow`, does not know about storage, does not know about broadcasters. It knows only the message-key -> handler-function mapping.

This also makes the rollback trivial: `git checkout HEAD~1 -- handlers.ts background.ts` restores the stub state with zero residue.

---

## 17. References

- `02-decisions-v2.1-final.md`: D2 (A5 owns ProtocolMap), D4 (repo path), D11 (no console.*), D14 (anti-drift gates), D15 (no em-dashes), D19 (adversarial tests), D20 (DI), D22 (blueprint.contract), D23 (rollback script)
- `03-keystone-contracts.md`: §1 (ProtocolMap + AuthState + handlers), §1.2 (`auth-state.ts` discriminated union), §1.4 (RefreshManager deps), §10 (imports table row for A6)
- `reviews/review-A6.md`: all C1-C6, E, and F findings addressed in §15 traceability matrix
- `phase_A2_backend_bridge_endpoint/plan.md`: §7 response body shape, §8 Zod schema lines 144-149
- `phase_A4_frontend_extension_signin/plan.md`: §Step 5 `buildFragment`, §Step 9 `exchangeTokens` + `window.location.replace`
- `phase_A5_background_and_messaging/plan.md` (v2.1 rewrite): §6.3 protocol.ts, §6.6 storage/tokens.ts, §6.10 storage/tab-state.ts, §6.11 log.ts, §6.12 handlers.ts, §6.13 auth-state.ts
- `investigation/34-launch-web-auth-flow.md`: §c chromiumapp.org host encoding, §g runnable TypeScript, §h error classification, §j gotchas (one-flow-at-a-time)
- `investigation/36-mv3-permissions.md`: §c identity permission, §i-j rejected permissions
- `investigation/53-supertokens-bridge-endpoint.md`: token rotation invariants (context only; A6 never calls this endpoint)

---

**End of Phase A6 v2.1 plan.**
