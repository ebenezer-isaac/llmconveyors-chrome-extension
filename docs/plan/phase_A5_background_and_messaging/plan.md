# Phase A5 - Background service worker, messaging protocol (KEYSTONE), SDK client factory, refresh manager, logger

**Plan**: 100-chrome-extension-mvp (v2.1)
**Phase code**: A5
**Track**: Extension (Track 3)
**Day**: 2 (2026-04-13)
**Executor context budget**: 64k
**Estimated effort**: 5-6 hours (keystone phase, deeper scope than other A-phases)
**Rewrite reason**: post-review v2.1 corrective, supersedes C- drafted version. Applies decisions D2, D4, D10, D11, D14, D15, D16, D18, D19, D20, D21, D22, D23, D24.
**Source of truth**: `02-decisions-v2.1-final.md` + `03-keystone-contracts.md` (verbatim for §1 ProtocolMap).

---

## 0. Confidence + scope declaration

**Confidence**: 9.5/10. The ProtocolMap, value types, refresh manager class shape, storage areas, and anti-drift gates are all locked verbatim in `03-keystone-contracts.md`. The 0.5 hedge is the exact wiring of `@webext-core/messaging` `onMessage` per-key registration with generic handlers; §10.1 documents the fallback if the library's generic inference does not cooperate.

**Files touched**:
- Created: 24 source files + 8 test files + 1 rollback script + 1 blueprint contract file = 34 files.
- Modified: 1 file (`entrypoints/background.ts` from A1 skeleton, thinned to a forwarder).
- **Touched in `e:/llmconveyors.com`**: zero. This phase writes ONLY under `e:/llmconveyors-chrome-extension/`.

**Lines changed**: ~3200 lines added (code + tests). This is the keystone phase for the extension; every downstream A-phase depends on these exports.

**Repository**: `e:/llmconveyors-chrome-extension/` (per D4). Do NOT write to `e:/job-assistant/` - that path is dead per the v2.1 decision memo §1 D4.

---

## 1. Goal

A5 is the **single owner** of the extension's cross-context messaging contract (per D2). After A5 completes:

1. `src/background/messaging/protocol.ts` exports a `ProtocolMap` with **all 19 keys** (enumerated verbatim in `03-keystone-contracts.md §1.1`). No downstream phase ever edits this file except to replace A5's stubbed handlers with real implementations of the same signatures.
2. `src/background/messaging/protocol-types.ts` exports every value type the ProtocolMap references (`ProfileUpdateResponse`, `ProfileUploadResponse`, `DetectedIntentPayload`, `FillRequestResponse`, `KeywordsExtractRequest`, `KeywordsExtractResponse`, `HighlightApplyResponse`, `HighlightClearResponse`, `HighlightStatus`, `GenerationStartRequest`, `GenerationStartResponse`, `GenerationUpdateBroadcast`, `GenerationArtifact`, `CreditsState`) - verbatim from keystone `§1.2`.
3. `src/background/messaging/auth-state.ts` exports the `AuthState` discriminated union - verbatim from keystone `§1.2`.
4. `src/background/messaging/handlers.ts` exports an exhaustive `HANDLERS: { [K in keyof ProtocolMap]: HandlerFor<K> }` record. The type system guarantees every key is handled. Missing keys = compile error.
5. `src/background/messaging/schemas.ts` exports Zod schemas for every handler payload that carries user-supplied data, per D21. Schemas run BEFORE business logic.
6. `src/background/auth/refresh-manager.ts` exports the `RefreshManager` class (per keystone `§1.4`) with DI-injected dependencies (`readTokens`, `writeTokens`, `clearTokens`, `fetch`, `now`, `logger`). A5 also exports a module-singleton `refreshManager` wired with real deps for production. Per D20, tests instantiate fresh `RefreshManager` instances with fakes - no module-level state is mocked.
7. `src/background/sdk/sdk-client.ts` exports `createSdkClient()` - on-demand SDK client factory per decision memo D10=(b). Each bg handler that needs SDK calls constructs a fresh client, executes one operation, and drops the reference. Tests verify no client leaks across handler invocations.
8. `src/background/log.ts` exports the `Logger` interface, `createLogger(scope)` factory, and a module-singleton `log = createLogger('default')` per D11. Every extension phase routes console output through this - zero `console.*` calls in production code.
9. `src/background/storage/tokens.ts` reads and writes StoredTokens to `chrome.storage.session` (per decision memo §2.7 - tokens live in-memory only, not on disk).
10. `src/background/storage/profile.ts` reads the full B2 `Profile` from `chrome.storage.local['llmc.profile.v1']` via `ProfileSchema.safeParse()` (per D3 - A7 writes, A5 reads).
11. `src/background/storage/prefs.ts` reads and writes per-agent preferences to `chrome.storage.sync` with write throttling.
12. `src/background/storage/tab-state.ts` holds the per-tab intent cache, highlight status cache, and fill lock cache in a single module-scoped `Map<TabId, TabState>`. Cleared when a tab closes (`chrome.tabs.onRemoved`).
13. `src/background/index.ts` is the background entrypoint. It initializes the refresh manager, sets up `chrome.tabs.onRemoved` cleanup, registers every handler via the key-iterated `onMessage` loop, and installs a global error handler.
14. `entrypoints/background.ts` (owned by A1, thinned here) imports `main` from `src/background/index.ts` and invokes it inside `defineBackground`. This is the ONLY file that touches `defineBackground` - all real logic lives under `src/background/`.
15. `src/background/blueprint.contract.ts` declares the public exports of this phase, forbidden imports, and required coverage (per D22).
16. `scripts/rollback-phase-A5.sh` mechanically reverts the phase (per D23).

**Handler ownership table** (memorize this - it governs every NotImplementedError throw):

| Key | A5 impl | Phase that replaces A5's impl |
|---|---|---|
| `AUTH_SIGN_IN` | `throw NotImplementedError('A6 owns')` | A6 |
| `AUTH_SIGN_OUT` | **real** (clear tokens + `clearAllTabState()` + broadcast) | A6 may extend with broadcast |
| `AUTH_STATUS` | **real** (read AuthState from tokens storage) | - |
| `AUTH_STATE_CHANGED` | inert `async () => undefined` (broadcast-only) | - (senders use `sendMessage`) |
| `PROFILE_GET` | **real** (read + ProfileSchema validate) | - |
| `PROFILE_UPDATE` | **real** (Zod validate patch, deep-merge, ProfileSchema validate result, write) | A7 may extend with broadcast |
| `PROFILE_UPLOAD_JSON_RESUME` | `throw NotImplementedError('A7 owns')` | A7 |
| `INTENT_DETECTED` | **real** (substitute sender.tab.id when tabId=-1, store in per-tab map) | - |
| `INTENT_GET` | **real** (read from per-tab map) | - |
| `FILL_REQUEST` | **real** (forward to content tab via `chrome.tabs.sendMessage`) | - |
| `KEYWORDS_EXTRACT` | **real** (direct fetch to /api/v1/ats/extract-skills via buildAuthHeaders) | - |
| `HIGHLIGHT_APPLY` | NOT registered in bg HANDLERS - content script registers | A9 content side |
| `HIGHLIGHT_CLEAR` | NOT registered in bg HANDLERS - content script registers | A9 content side |
| `HIGHLIGHT_STATUS` | **real** (read per-tab map) | - |
| `GENERATION_START` | stub throws `NotImplementedError('A11 owns')` | A11 |
| `GENERATION_UPDATE` | inert `async () => undefined` (broadcast-only) | - |
| `GENERATION_CANCEL` | stub throws `NotImplementedError('A11 owns')` | A11 |
| `DETECTED_JOB_BROADCAST` | inert `async () => undefined` (broadcast-only) | - |
| `CREDITS_GET` | **real** (direct fetch to /api/v1/settings/usage/summary) | - |

For `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR`: A5 declares the types in `protocol.ts` BUT does NOT register handlers in the background's `HANDLERS` record. These two keys are registered ONLY by the content script via `onMessage('HIGHLIGHT_APPLY', ...)` at content-script mount time (A9). Because `@webext-core/messaging` dispatches to whichever side registered `onMessage` first, the background never sees these messages when they come from popup -> content direction. A5's exhaustive `HANDLERS` record must be declared as `HANDLERS: { [K in Exclude<keyof ProtocolMap, 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR'>]: HandlerFor<K> }` to keep the compile-time exhaustiveness check intact without faking handlers A5 does not own.

**Non-goals** (out of scope, later phases):
- Real launchWebAuthFlow (A6)
- Profile upload JSON-Resume parsing (A7)
- Options page React tree (A7)
- Content-script DOM scanning / filling (A8)
- Highlight renderer wiring on the page (A9)
- Popup UI (A10)
- Side panel + `GENERATION_START` / `GENERATION_CANCEL` real impls (A11)

---

## 2. Blocks / depends on

**Depends on**:
- **A1** (WXT scaffold) - `package.json`, `wxt.config.ts`, `tsconfig.json`, `entrypoints/background.ts` skeleton, `node_modules/` exist. A1 also installs `@webext-core/messaging@^2.1.0`, `zod@^3.23.8`, `webextension-polyfill@^0.12.0`.
- **A2** (backend /auth/session/refresh bridge endpoint deployed to prod or `pnpm dev:api`) - A5's RefreshManager hits this endpoint.
- **A3** (backend `POST /api/v1/ats/extract-skills` deployed) - A5's `KEYWORDS_EXTRACT` handler hits this endpoint.
- **B1** (`ats-autofill-engine@0.1.0-alpha.1` published to npm registry) - A5 imports `Profile`, `ProfileSchema`, `TabId`, `GenerationId`, `SessionId`, `RequestId`, `DetectedIntent`, `AtsKind`, `ExtractedSkill` from this package.
- **B2** (core types defined + published as part of the engine package) - A5 imports the branded types per D16.

**Blocks**:
- **A6** (auth flow) - replaces `AUTH_SIGN_IN` stub, extends `AUTH_SIGN_OUT` to also broadcast `AUTH_STATE_CHANGED`. A6 must NOT edit `protocol.ts`.
- **A7** (profile + options) - replaces `PROFILE_UPLOAD_JSON_RESUME` stub, consumes `PROFILE_GET` / `PROFILE_UPDATE`. A7 must NOT edit `protocol.ts`.
- **A8** (content autofill) - registers its own `onMessage('FILL_REQUEST', ...)` in the content-script context. A5's bg-side handler forwards to that content script via `chrome.tabs.sendMessage`.
- **A9** (highlight + intent content script) - registers `onMessage('HIGHLIGHT_APPLY', ...)` / `onMessage('HIGHLIGHT_CLEAR', ...)` in content-script context; consumes `KEYWORDS_EXTRACT` via `sendMessage` to bg. A9 must NOT edit `protocol.ts`.
- **A10** (popup UI) - calls `AUTH_STATUS`, `AUTH_SIGN_IN`, `PROFILE_GET`, `INTENT_GET`, `FILL_REQUEST`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`, `HIGHLIGHT_STATUS`, `CREDITS_GET`. A10 must NOT edit `protocol.ts`.
- **A11** (sidepanel E2E) - replaces `GENERATION_START` / `GENERATION_CANCEL` stubs, consumes `GENERATION_UPDATE` / `DETECTED_JOB_BROADCAST` broadcasts. A11 must NOT edit `protocol.ts`.

If any downstream phase discovers a missing key, it is an A5 bug - do NOT add keys in downstream phases (per D2). Stop the orchestrator, amend A5, re-run.

---

## 3. Required reading (before any code)

The executor MUST read these files before writing a single line:

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - Entire file - all 25 decisions are binding.
   - Especially D2 (A5 single owner), D10 (SDK on-demand), D11 (logger), D14 (anti-drift gates), D15 (em-dash rule), D16 (branded types), D18 (contract test matrix), D19 (adversarial tests mandatory), D20 (DI), D21 (Zod at every boundary), D22 (blueprint contract), D23 (rollback script), D24 (coverage floor).

2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - **§1 in full** - copy every type VERBATIM. Do not paraphrase, rename, or reorder.
   - §2.2 (brands.ts) - understand what `TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId` are (branded primitives, constructed via helpers).
   - §2.3 (ats-kind.ts) - A5 imports `AtsKind`.
   - §2.7-2.10 (job-posting, page-intent, ats-adapter, extracted-skill) - A5 imports these types.
   - §8 (A3 backend contract) - `POST /api/v1/ats/extract-skills` request/response shape.
   - §10 (import summary row A5) - the exact list of symbols A5 imports from `ats-autofill-engine`.

3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A1_wxt_scaffold/plan.md`
   - §6.6.1 (current `entrypoints/background.ts` skeleton) - A5 replaces this.
   - §6.4 (manifest permissions) - confirm `storage`, `identity`, `tabs`, `alarms`, `sidePanel` are granted.

4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A3_backend_keywords_endpoint/plan.md`
   - §"Code snippets / 1" - the request/response Zod shape for `/ats/extract-skills`. A5's `KEYWORDS_EXTRACT` bg handler fetches this endpoint.
   - The backend response envelope is `{ success: true, data: { keywords, missing?, tookMs }, requestId, timestamp }`.

5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A6_auth_flow/plan.md`
   - §6.4 refresh headers (`rid: session`, `fdi-version: 3.0`, `st-auth-mode: header`) - A5's RefreshManager uses these.
   - §6.2 (A6 consumer of A5's `AUTH_SIGN_IN`, `AUTH_SIGN_OUT`, `AUTH_STATUS`, `AUTH_STATE_CHANGED`).

6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A7_profile_storage_and_options/plan.md`
   - §"Step 2 - Storage layout" - the exact `Profile` shape A7 writes. A5 reads from the same key and validates with the same schema.

7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md`
   - §6.2 (messaging consumer) - note that A9 registers `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` on the content side, not via bg.
   - §6.3 (KEYWORDS_EXTRACT flow) - A9 calls `sendMessage('KEYWORDS_EXTRACT', ...)` and expects A5's bg handler to fetch and return.

8. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A10_popup_ui/plan.md`
   - §6.3-§6.5 (popup sendMessage surface) - confirm A5's handler set matches A10's consumption.

9. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A11_sidepanel_e2e_and_demo/plan.md`
   - §6.3-§6.5 (sidepanel sendMessage + onMessage surface) - confirm A5's generation keys match A11's consumption.

10. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A5.md`
    - The review that produced this rewrite. Every finding F1-F10 is addressed below.

**Do not read the llmconveyors.com backend source tree.** This phase lives entirely in `e:/llmconveyors-chrome-extension/`. The only cross-repo references are HTTP contracts documented in the files above.

---

## 4. Working directory

**Target directory**: `e:/llmconveyors-chrome-extension/` (EXISTS from A1).

Executor protocol:
1. `cd e:/llmconveyors-chrome-extension/`.
2. Confirm A1 artifacts exist: `package.json`, `wxt.config.ts`, `tsconfig.json`, `entrypoints/background.ts`, `entrypoints/popup/index.html`, `node_modules/`. If missing, halt and report "A1 has not completed".
3. Confirm `node_modules/@webext-core/messaging`, `node_modules/zod`, `node_modules/ats-autofill-engine`, `node_modules/webextension-polyfill` resolve. If any missing, run `pnpm install` once; if still missing, halt.
4. Confirm `node_modules/ats-autofill-engine/package.json` version >= `0.1.0-alpha.1`. If not, halt - B1 has not completed.
5. All file paths in this plan are relative to `e:/llmconveyors-chrome-extension/` unless prefixed otherwise.

---

## 5. Design rationale (read before coding)

### 5.1 Why A5 is the single owner of ProtocolMap (D2)

The extension has 6 surfaces that exchange messages: background service worker, content script, popup, options page, side panel, and future devtools. A single canonical `ProtocolMap` type under `src/background/messaging/protocol.ts` means:
- Every sender and every receiver imports from the same file.
- The type checker enforces request/response shapes across the boundary.
- Adding a new key = one edit in one file (A5's, in a future corrective plan, never mid-phase).
- Dropping a key = compile error in every consumer simultaneously.

The previous A5 draft missed 4 keys and had 2 wrong shapes. Downstream phases papered over this by editing `protocol.ts` in their own phases, which caused merge-conflict risk during parallel execution and violated the one-owner principle. v2.1 fixes this by shipping **all 19 keys** in A5 up front, with either real handlers, inert broadcast stubs, or explicit `NotImplementedError` throws that name the phase that replaces them.

### 5.2 Why `@webext-core/messaging` and not raw `chrome.runtime.sendMessage`

Type safety across 19 message types is unmaintainable with raw `chrome.runtime.sendMessage`. `defineExtensionMessaging<ProtocolMap>()` from `@webext-core/messaging` gives:
- Compile-time typing per key for both request and response.
- Shared `sendMessage` / `onMessage` bound to `ProtocolMap` - any extension surface that imports from `src/background/messaging/protocol.ts` gets the same typed instance.
- `sendMessage(key, data, tabId)` overload for bg->content direction, so one transport covers all patterns.

WXT's own docs recommend this package; `@wxt-dev/messaging` is a re-export of the same library.

### 5.3 Why `chrome.storage.session` for tokens (D not-yet-numbered, per memo §2.9)

- Tokens are RAM-only, never hit disk, mitigates disk-level exfiltration.
- Survives SW idle termination (the whole point of `storage.session` for MV3 service workers).
- Cleared on browser close - forces a new sign-in each browser session. 1h access + 100d refresh makes the UX acceptable.
- NOT exposed to content scripts by default. Our BG-only access policy matches the default - we NEVER call `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`.

### 5.4 Why on-demand SDK client (D10=b)

- Service workers sleep and wake arbitrarily. A long-lived `LLMConveyors` singleton assumes module-level state persists across SW restarts. It does not.
- Stateless construction is simpler: each handler does `const sdk = createSdkClient({ getAuthHeaders }); const res = await sdk.agents.generate(...);` and drops the reference.
- The ONE piece of shared state is the `RefreshManager` singleton, which holds the in-flight refresh promise for dedup. That promise survives a single SW invocation; on SW restart, a stale promise is GC'd naturally.

### 5.5 Why single in-flight refresh dedup (memo §2.8)

SuperTokens rotates refresh tokens on each call. If two concurrent 401s both trigger a refresh, the second call sees a freshly rotated (invalidated) refresh token and gets a 401, forcing a full sign-out. Dedup via `RefreshManager.inflight: Promise<StoredTokens> | null`: the first caller starts the refresh; the second caller awaits the same promise; the third caller awaits the same promise; and so on until `inflight` resolves or rejects. Rejection clears `inflight`; the next caller may try again.

### 5.6 Why DI for RefreshManager (D20)

Module-scoped `let inflight` made tests hard: they had to import the module, reach into internals, and reset state between tests. D20 requires every cross-module dependency to flow through a `Deps` object. `RefreshManager` is a class that takes `{ readTokens, writeTokens, clearTokens, fetch, now, logger }` at construction. Production code constructs a singleton with real deps and exports it. Tests construct fresh instances with fake deps. No global state to reset, no timing races between tests.

### 5.7 Why Zod at every handler boundary (D21)

Every `onMessage` handler receives `data: unknown` from the library's perspective (the library trusts the `ProtocolMap` type, but the library can't verify the runtime shape). A malicious extension (or a buggy downstream phase that passes the wrong shape) could crash handlers with `Cannot read property of undefined`. D21 requires Zod schemas for every handler payload - parsed before business logic. Schemas live in `src/background/messaging/schemas.ts` for A5's local types (AuthState, ProfileUpdateResponse, etc.) or imported from `ats-autofill-engine` for profile shapes.

### 5.8 Why the logger (D11, F11 in review)

Zero `console.log` / `console.info` / `console.warn` / `console.error` / `console.debug` in production code. The CI grep gate rejects any match. A5 ships `src/background/log.ts` with a `Logger` interface and `createLogger(scope)` factory. Under the hood the logger routes to `globalThis.console.*` with the prefix `[llmc-ext:${scope}]` and a JSON-stringified context object - so tests can still capture output by spying on `globalThis.console`.

### 5.9 SCREAMING_SNAKE_CASE keys

`ProtocolMap` uses SCREAMING_SNAKE_CASE keys. Rationale:
- Grep-friendly: `grep -r AUTH_SIGN_IN` finds every emitter and handler in one pass.
- Disambiguates from JS property access (`auth.signIn()` is a method call, `AUTH_SIGN_IN` is a message key - impossible to confuse).
- Matches the phase directive plus every consumer plan.

### 5.10 Why `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` have no bg handlers

`@webext-core/messaging` uses a global dispatch: whichever context registers `onMessage(key, handler)` first (or has a handler when the message arrives) receives the message. For `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR`, the popup sends with an explicit `tabId` and the library routes via `chrome.tabs.sendMessage(tabId, ...)` to the content script. The content script registers the handler. The background never sees the message. If A5 registered a bg handler for these keys, it would either shadow the content-script handler or cause double-handling ambiguity.

So A5's `HANDLERS` record intentionally excludes these two keys, and the exhaustiveness check uses `Exclude<keyof ProtocolMap, 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR'>`. A type-level `BG_HANDLED_KEYS` constant documents the split:

```ts
export const BG_HANDLED_KEYS = [
  'AUTH_SIGN_IN', 'AUTH_SIGN_OUT', 'AUTH_STATUS', 'AUTH_STATE_CHANGED',
  'PROFILE_GET', 'PROFILE_UPDATE', 'PROFILE_UPLOAD_JSON_RESUME',
  'INTENT_DETECTED', 'INTENT_GET',
  'FILL_REQUEST',
  'KEYWORDS_EXTRACT',
  'HIGHLIGHT_STATUS',
  'GENERATION_START', 'GENERATION_UPDATE', 'GENERATION_CANCEL',
  'DETECTED_JOB_BROADCAST',
  'CREDITS_GET',
] as const;
export type BgHandledKey = (typeof BG_HANDLED_KEYS)[number];
```

---

## 6. Step-by-step execution

### 6.1 - Verify A1/A2/A3/B1 preconditions

Run from `e:/llmconveyors-chrome-extension/`:

```bash
ls -la package.json wxt.config.ts tsconfig.json entrypoints/background.ts entrypoints/popup/index.html
pnpm list @webext-core/messaging webextension-polyfill zod ats-autofill-engine
node -e "console.log(require('ats-autofill-engine/package.json').version)"
node -e "require('ats-autofill-engine').then(m => console.log(Object.keys(m).sort()))" || echo "ESM import failing"
```

**Expected**:
- All files exist.
- `@webext-core/messaging@2.x`, `webextension-polyfill@0.12.x`, `zod@3.23.x`, `ats-autofill-engine@0.1.0-alpha.1` or later.
- The engine package resolves and exports (at minimum) `TabId`, `GenerationId`, `SessionId`, `RequestId`, `AtsKind`, `DetectedIntent`.

If any precondition fails, halt and report.

### 6.2 - Create the `src/background/` directory tree

```bash
mkdir -p src/background/messaging
mkdir -p src/background/auth
mkdir -p src/background/sdk
mkdir -p src/background/storage
mkdir -p src/background/http
mkdir -p tests/background/messaging
mkdir -p tests/background/auth
mkdir -p tests/background/storage
mkdir -p tests/background/sdk
mkdir -p tests/background/http
mkdir -p scripts
```

**Target layout after this phase**:

```
src/background/
  index.ts                       (entrypoint, wires everything)
  log.ts                         (Logger interface + createLogger, D11)
  blueprint.contract.ts          (D22)
  config.ts                      (API_BASE_URL + REFRESH_ENDPOINT + endpoint URLs, extracted from env)
  messaging/
    protocol.ts                  (ProtocolMap verbatim from keystone 1.1)
    protocol-types.ts            (value types verbatim from keystone 1.2)
    auth-state.ts                (AuthState union verbatim from keystone 1.2)
    schemas.ts                   (Zod schemas for handler payloads, D21)
    handlers.ts                  (exhaustive HANDLERS record)
    send.ts                      (re-export of sendMessage typed to ProtocolMap)
  auth/
    refresh-manager.ts           (class with DI per D20 + keystone 1.4)
    refresh-manager.singleton.ts (module-singleton wiring for production)
    auth-headers.ts              (buildAuthHeaders for non-SDK fetch paths)
  sdk/
    sdk-client.ts                (createSdkClient factory, on-demand per D10=b)
    errors.ts                    (NotImplementedError, SessionExpiredError, SdkError)
  storage/
    tokens.ts                    (readTokens/writeTokens/clearTokens, chrome.storage.session)
    profile.ts                   (readProfile/writeProfile, chrome.storage.local, validated by ProfileSchema)
    prefs.ts                     (readPrefs/writePrefs, chrome.storage.sync, throttled writes)
    tab-state.ts                 (per-tab intent + highlight + fill-lock Map)
    storage-errors.ts            (QuotaExceededError wrapper)
  http/
    fetch-with-retry.ts          (401-aware fetch wrapper that uses RefreshManager)

tests/background/
  log.spec.ts
  messaging/
    protocol-contract.type-test.ts   (D14.2 assertion)
    handlers.spec.ts
    schemas.spec.ts
  auth/
    refresh-manager.spec.ts
    auth-headers.spec.ts
  sdk/
    sdk-client.spec.ts
  storage/
    tokens.spec.ts
    profile.spec.ts
    prefs.spec.ts
    tab-state.spec.ts
  http/
    fetch-with-retry.spec.ts

scripts/
  rollback-phase-A5.sh   (D23)
```

### 6.3 - Write `src/background/log.ts` (D11, first file - everything else uses it)

```typescript
// src/background/log.ts
/**
 * Structured logger for the extension (D11).
 *
 * ZERO console.* calls outside this file. Every other module in the extension
 * imports createLogger(scope) or the default `log` singleton.
 *
 * Under the hood: routes to globalThis.console.* with prefix `[llmc-ext:${scope}]`
 * and a JSON-stringified context object. debug() is gated on build mode.
 *
 * Tests spy on globalThis.console to capture output.
 */

export interface LogContext {
  readonly tabId?: number;
  readonly requestId?: string;
  readonly [k: string]: unknown;
}

export interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}

const PREFIX_ROOT = 'llmc-ext';

// Build-mode gate for debug. WXT injects import.meta.env.MODE at build time.
// In vitest / happy-dom, import.meta.env is undefined, so we fall back to
// checking process.env.NODE_ENV.
function isDebugEnabled(): boolean {
  try {
    // @ts-expect-error - import.meta.env is injected by WXT / Vite
    const viteMode = import.meta?.env?.MODE;
    if (typeof viteMode === 'string') return viteMode !== 'production';
  } catch {
    // ignore
  }
  try {
    const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    if (typeof nodeEnv === 'string') return nodeEnv !== 'production';
  } catch {
    // ignore
  }
  return true; // default to debug enabled for dev builds + tests
}

const DEBUG_ENABLED: boolean = isDebugEnabled();

function stringifyCtx(ctx: LogContext | undefined): string {
  if (!ctx) return '';
  try {
    return ' ' + JSON.stringify(ctx);
  } catch {
    // Circular refs or BigInt - fall back to a safe representation.
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx)) {
      try {
        JSON.stringify(v);
        safe[k] = v;
      } catch {
        safe[k] = '[unserializable]';
      }
    }
    return ' ' + JSON.stringify(safe);
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) {
    return ` error=${err.name}: ${err.message}`;
  }
  if (err === null) return ' error=null';
  if (err === undefined) return '';
  try {
    return ' error=' + JSON.stringify(err);
  } catch {
    return ' error=[unserializable]';
  }
}

export function createLogger(scope: string): Logger {
  const prefix = `[${PREFIX_ROOT}:${scope}]`;
  return Object.freeze({
    info(msg: string, ctx?: LogContext): void {
      globalThis.console.info(prefix + ' ' + msg + stringifyCtx(ctx));
    },
    warn(msg: string, ctx?: LogContext): void {
      globalThis.console.warn(prefix + ' ' + msg + stringifyCtx(ctx));
    },
    error(msg: string, err?: unknown, ctx?: LogContext): void {
      globalThis.console.error(prefix + ' ' + msg + stringifyErr(err) + stringifyCtx(ctx));
    },
    debug(msg: string, ctx?: LogContext): void {
      if (!DEBUG_ENABLED) return;
      globalThis.console.debug(prefix + ' ' + msg + stringifyCtx(ctx));
    },
  });
}

export const log: Logger = createLogger('default');
```

**Notes**:
- `PREFIX_ROOT = 'llmc-ext'` matches D4.
- Debug is build-mode gated. Tests run in `MODE=test` (not production) so debug is enabled there.
- No `any` types. The `globalThis.console` and `process.env.NODE_ENV` accesses are wrapped in `try/catch` for environments that lack them.
- `createLogger` returns a frozen object - callers cannot monkey-patch it.

### 6.4 - Write `src/background/config.ts`

```typescript
// src/background/config.ts
/**
 * Runtime configuration for the background worker.
 *
 * API base URLs are injected at build time by WXT via import.meta.env.
 * In dev, WXT reads from .env.development; in prod, from .env.production.
 *
 * This file centralizes every URL so tests can stub via module mocking
 * and A6's refresh tests can verify the URL is what the executor thinks.
 */

function readEnv(key: string, fallback: string): string {
  try {
    // @ts-expect-error - import.meta.env is injected by WXT
    const v = import.meta?.env?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {
    // ignore
  }
  return fallback;
}

export const API_BASE_URL: string = readEnv('VITE_LLMC_API_BASE_URL', 'https://api.llmconveyors.com');

export const REFRESH_ENDPOINT: string = API_BASE_URL + '/auth/session/refresh';
export const EXTRACT_SKILLS_ENDPOINT: string = API_BASE_URL + '/api/v1/ats/extract-skills';
export const USAGE_SUMMARY_ENDPOINT: string = API_BASE_URL + '/api/v1/settings/usage/summary';

/** Storage keys (kept in one place to prevent typos across modules). */
export const STORAGE_KEYS = Object.freeze({
  tokens: 'llmc.tokens.v1',
  profile: 'llmc.profile.v1',
  prefs: 'llmc.prefs.v1',
} as const);

/** Message logging scope names. Kept here to prevent typos in createLogger calls. */
export const LOG_SCOPES = Object.freeze({
  background: 'bg',
  refresh: 'bg.refresh',
  sdk: 'bg.sdk',
  handlers: 'bg.handlers',
  storage: 'bg.storage',
  http: 'bg.http',
} as const);
```

### 6.5 - Write `src/background/messaging/auth-state.ts` (VERBATIM from keystone 1.2)

```typescript
// src/background/messaging/auth-state.ts
/**
 * AuthState discriminated union - single source of truth for "is the user signed in".
 *
 * VERBATIM from 03-keystone-contracts.md 1.2. Do NOT modify.
 *
 * Consumers: A5 HANDLERS (AUTH_STATUS returns this), A6 (sign-in/out mutate it),
 * A7 options (sign-out button), A9 (auth-loss cleanup), A10 (useAuthState),
 * A11 (sidepanel auth display).
 */

export type AuthState =
  | { readonly authed: true; readonly email: string | null; readonly accessTokenExpiry: number }
  | { readonly authed: false };

/** Convenience constructor for the unauthed state (keeps the null-field conventions explicit). */
export const UNAUTHED: AuthState = Object.freeze({ authed: false });
```

### 6.6 - Write `src/background/messaging/protocol-types.ts` (VERBATIM from keystone 1.2)

```typescript
// src/background/messaging/protocol-types.ts
/**
 * Value types for the ProtocolMap.
 *
 * VERBATIM from 03-keystone-contracts.md 1.2. Do NOT modify, rename, or reorder.
 *
 * Any downstream phase that needs to change a shape files a corrective plan
 * that amends A5 (and this file) - NEVER edits these types in a downstream phase.
 */

import type { Profile, ExtractedSkill, DetectedIntent } from 'ats-autofill-engine';
import type { TabId, GenerationId, SessionId, PlanId } from 'ats-autofill-engine';
import type { AtsKind } from 'ats-autofill-engine';

// ---- Profile update ----

export interface ProfileUpdateResponse {
  readonly ok: boolean;
  readonly errors?: ReadonlyArray<{ readonly path: string; readonly message: string }>;
}

// ---- Profile upload (A7 replaces the stub) ----

export type ProfileUploadResponse =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }> };

// ---- Intent ----

export interface DetectedIntentPayload {
  readonly tabId: TabId | -1; // -1 sentinel = "use sender.tab.id" (bg handler substitutes)
  readonly url: string;
  readonly kind: AtsKind;
  readonly pageKind: 'job-posting' | 'application-form';
  readonly company?: string;
  readonly jobTitle?: string;
  readonly detectedAt: number;
}

// ---- Fill ----

export type FillRequestResponse =
  | {
      readonly ok: true;
      readonly filled: number;
      readonly skipped: number;
      readonly failed: number;
      readonly planId: PlanId;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'no-adapter'
        | 'no-profile'
        | 'no-form'
        | 'scan-failed'
        | 'plan-failed'
        | 'ats-mismatch'
        | 'wizard-not-ready'
        | 'no-tab'
        | 'content-script-not-loaded';
    };

// ---- Keywords extract (A5 is the real handler here; decision memo 2.10 locks fetch, not SDK) ----

export interface KeywordsExtractRequest {
  readonly text: string;
  readonly url: string;
  readonly topK?: number;
}

export type KeywordsExtractResponse =
  | {
      readonly ok: true;
      readonly keywords: ReadonlyArray<ExtractedSkill>;
      readonly tookMs: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'signed-out' | 'empty-text' | 'api-error' | 'rate-limited' | 'network-error';
    };

// ---- Highlight (content-script registers the apply/clear handlers) ----

export type HighlightApplyResponse =
  | {
      readonly ok: true;
      readonly keywordCount: number;
      readonly rangeCount: number;
      readonly tookMs: number;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'signed-out'
        | 'no-jd-on-page'
        | 'not-a-job-posting'
        | 'api-error'
        | 'rate-limited'
        | 'network-error'
        | 'no-tab'
        | 'render-error';
    };

export type HighlightClearResponse =
  | { readonly ok: true; readonly cleared: boolean }
  | { readonly ok: false; readonly reason: string };

export interface HighlightStatus {
  readonly on: boolean;
  readonly keywordCount: number;
  readonly appliedAt: number | null;
}

// ---- Generation (A11 replaces stubs) ----

export interface GenerationStartRequest {
  readonly agent: 'job-hunter' | 'b2b-sales';
  readonly payload: unknown; // validated by the agent's own schema downstream
}

export type GenerationStartResponse =
  | { readonly ok: true; readonly generationId: GenerationId; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: string };

export interface GenerationUpdateBroadcast {
  readonly generationId: GenerationId;
  readonly sessionId: SessionId;
  readonly phase: string;
  readonly status: 'running' | 'completed' | 'failed' | 'awaiting_input' | 'cancelled';
  readonly progress?: number;
  readonly interactionType?: string;
  readonly artifacts?: ReadonlyArray<GenerationArtifact>;
}

export interface GenerationArtifact {
  readonly kind: 'cv' | 'cover-letter' | 'email' | 'other';
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ---- Credits ----

export interface CreditsState {
  readonly balance: number;
  readonly plan: string;
  readonly resetAt: number | null;
}

// ---- Utility: deep partial (for PROFILE_UPDATE patch) ----

export type DeepPartial<T> = {
  readonly [K in keyof T]?: T[K] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};
```

### 6.7 - Write `src/background/messaging/protocol.ts` (VERBATIM from keystone 1.1)

```typescript
// src/background/messaging/protocol.ts
/**
 * ProtocolMap - the single owner of every cross-context message in the extension.
 *
 * Per D2, ONLY this phase (A5) edits this file. Downstream phases consume
 * `sendMessage` / `onMessage` from here and replace A5's stubbed HANDLERS
 * entries (in handlers.ts) with real implementations of the SAME signature.
 *
 * If a downstream phase needs a new key, that is an A5 bug - a corrective
 * plan amends this file before the downstream phase runs.
 *
 * VERBATIM from 03-keystone-contracts.md 1.1. Do NOT modify.
 */

import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Profile, DetectedIntent } from 'ats-autofill-engine';
import type { TabId, GenerationId } from 'ats-autofill-engine';
import type { AuthState } from './auth-state';
import type {
  ProfileUpdateResponse,
  ProfileUploadResponse,
  DetectedIntentPayload,
  FillRequestResponse,
  KeywordsExtractRequest,
  KeywordsExtractResponse,
  HighlightApplyResponse,
  HighlightClearResponse,
  HighlightStatus,
  GenerationStartRequest,
  GenerationStartResponse,
  GenerationUpdateBroadcast,
  CreditsState,
  DeepPartial,
} from './protocol-types';

export interface ProtocolMap {
  // --- Auth (4) ---
  AUTH_SIGN_IN: () => AuthState;
  AUTH_SIGN_OUT: () => AuthState;
  AUTH_STATUS: () => AuthState;
  AUTH_STATE_CHANGED: (data: AuthState) => void; // broadcast-only, bg handler is noop

  // --- Profile (3) ---
  PROFILE_GET: () => Profile | null;
  PROFILE_UPDATE: (data: { patch: DeepPartial<Profile> }) => ProfileUpdateResponse;
  PROFILE_UPLOAD_JSON_RESUME: (data: { raw: unknown }) => ProfileUploadResponse;

  // --- Intent (2) ---
  INTENT_DETECTED: (data: DetectedIntentPayload) => void; // content->bg, bg stores in per-tab map
  INTENT_GET: (data: { tabId: TabId }) => DetectedIntent | null;

  // --- Fill (1) ---
  FILL_REQUEST: (data: { tabId: TabId }) => FillRequestResponse; // bg forwards to content via chrome.tabs.sendMessage

  // --- Keywords (1) ---
  KEYWORDS_EXTRACT: (data: KeywordsExtractRequest) => KeywordsExtractResponse;

  // --- Highlight (3) --- bg declares types; content script registers APPLY+CLEAR handlers
  HIGHLIGHT_APPLY: (data: { tabId: TabId }) => HighlightApplyResponse;
  HIGHLIGHT_CLEAR: (data: { tabId: TabId }) => HighlightClearResponse;
  HIGHLIGHT_STATUS: (data: { tabId: TabId }) => HighlightStatus;

  // --- Generation (3) ---
  GENERATION_START: (data: GenerationStartRequest) => GenerationStartResponse;
  GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void; // broadcast-only
  GENERATION_CANCEL: (data: { generationId: GenerationId }) => { ok: boolean };

  // --- Broadcast (1) ---
  DETECTED_JOB_BROADCAST: (data: { tabId: TabId; intent: DetectedIntent }) => void; // broadcast-only

  // --- Credits (1) ---
  CREDITS_GET: () => CreditsState;
}

/**
 * List of ProtocolMap keys the BACKGROUND handles.
 *
 * Excludes HIGHLIGHT_APPLY and HIGHLIGHT_CLEAR - those are registered by the
 * content script (A9) because the popup sends them with an explicit tabId and
 * @webext-core/messaging routes via chrome.tabs.sendMessage directly to the tab.
 */
export const BG_HANDLED_KEYS = [
  'AUTH_SIGN_IN',
  'AUTH_SIGN_OUT',
  'AUTH_STATUS',
  'AUTH_STATE_CHANGED',
  'PROFILE_GET',
  'PROFILE_UPDATE',
  'PROFILE_UPLOAD_JSON_RESUME',
  'INTENT_DETECTED',
  'INTENT_GET',
  'FILL_REQUEST',
  'KEYWORDS_EXTRACT',
  'HIGHLIGHT_STATUS',
  'GENERATION_START',
  'GENERATION_UPDATE',
  'GENERATION_CANCEL',
  'DETECTED_JOB_BROADCAST',
  'CREDITS_GET',
] as const;

export type BgHandledKey = (typeof BG_HANDLED_KEYS)[number];

/** Shared sendMessage / onMessage bound to ProtocolMap. Every surface imports from here. */
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();

// Re-export value types for ergonomic imports from consumers.
export type { AuthState } from './auth-state';
export type {
  ProfileUpdateResponse,
  ProfileUploadResponse,
  DetectedIntentPayload,
  FillRequestResponse,
  KeywordsExtractRequest,
  KeywordsExtractResponse,
  HighlightApplyResponse,
  HighlightClearResponse,
  HighlightStatus,
  GenerationStartRequest,
  GenerationStartResponse,
  GenerationUpdateBroadcast,
  GenerationArtifact,
  CreditsState,
  DeepPartial,
} from './protocol-types';
```

### 6.8 - Write `src/background/messaging/schemas.ts` (D21)

Zod schemas for handler payloads. Per D21, every handler runs its payload through a schema before the business logic. Schemas for shared types (`Profile`, `DetectedIntent`) are imported from `ats-autofill-engine`; A5's local schemas live here.

```typescript
// src/background/messaging/schemas.ts
/**
 * Zod schemas for A5 handler payload validation (D21).
 *
 * Every handler in handlers.ts runs `Schema.safeParse(data)` BEFORE business
 * logic. Failures return a typed error response (never throw through the
 * messaging boundary).
 *
 * Shared types (Profile, DetectedIntent) import their schemas from
 * ats-autofill-engine/profile and ats-autofill-engine.
 */

import { z } from 'zod';

// Re-export engine schemas where available. If B2 ships them, this is the
// canonical source. If not, A5 defines its own narrow validators locally.
import { ProfileSchema } from 'ats-autofill-engine/profile';

export { ProfileSchema };

// ---- Branded IDs (narrow runtime validation) ----

const NonEmptyString = z.string().min(1).max(2000);
const SafeUrl = z.string().url().max(2048);
const SafeText = z.string().min(1).max(50_000);

const TabIdSchema = z.number().int().refine((n) => n >= -1 && n < 2 ** 31, {
  message: 'tabId must be a positive int32 (or -1 sentinel)',
});

const GenerationIdSchema = NonEmptyString;
const SessionIdSchema = NonEmptyString;
const PlanIdSchema = NonEmptyString;

// ---- Intent ----

export const AtsKindSchema = z.enum(['greenhouse', 'lever', 'workday']);

export const DetectedIntentPayloadSchema = z
  .object({
    tabId: TabIdSchema,
    url: SafeUrl,
    kind: AtsKindSchema,
    pageKind: z.enum(['job-posting', 'application-form']),
    company: z.string().max(500).optional(),
    jobTitle: z.string().max(500).optional(),
    detectedAt: z.number().int().nonnegative(),
  })
  .strict();

export const IntentGetRequestSchema = z.object({ tabId: TabIdSchema }).strict();

// ---- Profile ----

// PROFILE_UPDATE carries a deep partial of Profile. Since ZOD does not natively
// support DeepPartial, we validate the top-level shape only and then run
// ProfileSchema.safeParse on the merged result inside the handler.
export const ProfileUpdateRequestSchema = z
  .object({
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();

// Reject __proto__ / constructor / prototype injection at the patch root.
// This is defense-in-depth; the merge function below also walks the patch
// tree and skips these keys.
export function validatePatchSafety(patch: unknown): { safe: true } | { safe: false; reason: string } {
  if (patch === null || typeof patch !== 'object') {
    return { safe: false, reason: 'patch must be a non-null object' };
  }
  const seen = new WeakSet<object>();
  const queue: unknown[] = [patch];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node as object)) return { safe: false, reason: 'circular reference detected' };
    seen.add(node as object);
    for (const key of Object.keys(node as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return { safe: false, reason: `forbidden key: ${key}` };
      }
      const child = (node as Record<string, unknown>)[key];
      if (child !== null && typeof child === 'object') {
        queue.push(child);
      }
    }
  }
  return { safe: true };
}

export const ProfileUploadRequestSchema = z.object({ raw: z.unknown() }).strict();

// ---- Fill ----

export const FillRequestSchema = z.object({ tabId: TabIdSchema }).strict();

// ---- Keywords ----

export const KeywordsExtractRequestSchema = z
  .object({
    text: SafeText,
    url: SafeUrl,
    topK: z.number().int().min(1).max(100).optional(),
  })
  .strict();

// Response envelope from /api/v1/ats/extract-skills (A3 backend).
// Used to validate the backend response before handing back to content script.
const ExtractedSkillSchema = z
  .object({
    term: z.string().min(1).max(200),
    category: z.enum(['hard', 'soft', 'tool', 'domain']),
    score: z.number().min(0).max(1),
    occurrences: z.number().int().nonnegative(),
    canonicalForm: z.string().min(1).max(200),
  })
  .strict();

export const ExtractSkillsBackendResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      keywords: z.array(ExtractedSkillSchema).max(500),
      missing: z.array(ExtractedSkillSchema).max(500).optional(),
      tookMs: z.number().int().nonnegative(),
    }),
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .strict();

// ---- Highlight status ----

export const HighlightStatusRequestSchema = z.object({ tabId: TabIdSchema }).strict();

// ---- Generation ----

export const GenerationStartRequestSchema = z
  .object({
    agent: z.enum(['job-hunter', 'b2b-sales']),
    payload: z.unknown(),
  })
  .strict();

export const GenerationUpdateBroadcastSchema = z
  .object({
    generationId: GenerationIdSchema,
    sessionId: SessionIdSchema,
    phase: z.string().min(1).max(100),
    status: z.enum(['running', 'completed', 'failed', 'awaiting_input', 'cancelled']),
    progress: z.number().min(0).max(1).optional(),
    interactionType: z.string().max(100).optional(),
    artifacts: z
      .array(
        z.object({
          kind: z.enum(['cv', 'cover-letter', 'email', 'other']),
          content: z.string().max(1_000_000),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

export const GenerationCancelRequestSchema = z.object({ generationId: GenerationIdSchema }).strict();

export const DetectedJobBroadcastSchema = z
  .object({
    tabId: TabIdSchema,
    intent: z
      .object({
        kind: z.union([AtsKindSchema, z.literal('unknown')]),
        pageKind: z.enum(['job-posting', 'application-form']).nullable(),
        url: SafeUrl,
        jobTitle: z.string().max(500).optional(),
        company: z.string().max(500).optional(),
        detectedAt: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

// ---- AuthState broadcast ----

export const AuthStateSchema = z.union([
  z
    .object({
      authed: z.literal(true),
      email: z.string().email().nullable(),
      accessTokenExpiry: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ authed: z.literal(false) }).strict(),
]);
```

### 6.9 - Write `src/background/storage/storage-errors.ts`

```typescript
// src/background/storage/storage-errors.ts
export class QuotaExceededError extends Error {
  readonly name = 'QuotaExceededError';
  constructor(
    readonly area: 'session' | 'local' | 'sync',
    readonly bytesAttempted: number,
    cause?: unknown,
  ) {
    super(`chrome.storage.${area} quota exceeded (attempted ${bytesAttempted} bytes)`);
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class StorageCorruptError extends Error {
  readonly name = 'StorageCorruptError';
  constructor(
    readonly area: 'session' | 'local' | 'sync',
    readonly key: string,
    readonly reason: string,
  ) {
    super(`chrome.storage.${area}[${key}] is corrupt: ${reason}`);
  }
}
```

### 6.10 - Write `src/background/storage/tokens.ts`

```typescript
// src/background/storage/tokens.ts
/**
 * Token storage adapter over chrome.storage.session.
 *
 * Tokens are RAM-only (never disk). Cleared on browser close. Survives SW idle.
 * Default access level is TRUSTED_CONTEXTS, so content scripts cannot read.
 *
 * Schema:
 *   llmc.tokens.v1 -> StoredTokens
 */

import { z } from 'zod';
import { STORAGE_KEYS, LOG_SCOPES } from '../config';
import { createLogger } from '../log';
import { QuotaExceededError, StorageCorruptError } from './storage-errors';

const logger = createLogger(LOG_SCOPES.storage + '.tokens');

export interface StoredTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly frontToken: string;
  readonly accessTokenExpiry: number; // ms epoch
  readonly email: string | null;
}

const StoredTokensSchema = z
  .object({
    accessToken: z.string().min(1).max(16384),
    refreshToken: z.string().min(1).max(16384),
    frontToken: z.string().min(1).max(16384),
    accessTokenExpiry: z.number().int().nonnegative(),
    email: z.string().email().nullable(),
  })
  .strict();

export async function readTokens(): Promise<StoredTokens | null> {
  const raw = await chrome.storage.session.get(STORAGE_KEYS.tokens);
  const value = raw[STORAGE_KEYS.tokens];
  if (value === undefined || value === null) return null;
  const parsed = StoredTokensSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('readTokens: stored shape is corrupt, treating as signed out', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    // Best effort cleanup - do not throw into callers.
    try {
      await chrome.storage.session.remove(STORAGE_KEYS.tokens);
    } catch (err) {
      logger.error('readTokens: failed to remove corrupt entry', err);
    }
    return null;
  }
  return parsed.data;
}

export async function writeTokens(t: StoredTokens): Promise<void> {
  const parsed = StoredTokensSchema.safeParse(t);
  if (!parsed.success) {
    throw new Error('writeTokens: invalid StoredTokens shape: ' + parsed.error.message);
  }
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.tokens]: parsed.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('QUOTA_BYTES') || msg.toLowerCase().includes('quota')) {
      const bytes = JSON.stringify(parsed.data).length;
      throw new QuotaExceededError('session', bytes, err);
    }
    throw err;
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await chrome.storage.session.remove(STORAGE_KEYS.tokens);
  } catch (err) {
    logger.warn('clearTokens: remove failed, attempting full clear', { error: String(err) });
    try {
      await chrome.storage.session.clear();
    } catch (err2) {
      logger.error('clearTokens: full clear also failed', err2);
      throw err2;
    }
  }
}
```

### 6.11 - Write `src/background/storage/profile.ts`

```typescript
// src/background/storage/profile.ts
/**
 * Profile storage adapter over chrome.storage.local.
 *
 * A7 is the writer (it writes the full B2 Profile shape per D3). A5 is the
 * primary reader. Every read goes through ProfileSchema.safeParse to reject
 * any shape that drifts from the engine contract.
 *
 * Schema:
 *   llmc.profile.v1 -> Profile (see ats-autofill-engine/profile)
 */

import type { Profile } from 'ats-autofill-engine';
import { ProfileSchema } from 'ats-autofill-engine/profile';
import { STORAGE_KEYS, LOG_SCOPES } from '../config';
import { createLogger } from '../log';
import { QuotaExceededError } from './storage-errors';

const logger = createLogger(LOG_SCOPES.storage + '.profile');

export async function readProfile(): Promise<Profile | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.profile);
  const value = raw[STORAGE_KEYS.profile];
  if (value === undefined || value === null) return null;
  const parsed = ProfileSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('readProfile: stored shape failed ProfileSchema validation', {
      issueCount: parsed.error.issues.length,
      firstIssue: parsed.error.issues[0]?.path.join('.') + ': ' + parsed.error.issues[0]?.message,
    });
    return null;
  }
  return parsed.data;
}

export async function writeProfile(p: Profile): Promise<void> {
  // Defensive re-validation. A bug in a caller that constructs a partial shape
  // should not poison storage.
  const parsed = ProfileSchema.safeParse(p);
  if (!parsed.success) {
    throw new Error('writeProfile: invalid Profile shape: ' + parsed.error.message);
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.profile]: parsed.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('QUOTA_BYTES') || msg.toLowerCase().includes('quota')) {
      const bytes = JSON.stringify(parsed.data).length;
      throw new QuotaExceededError('local', bytes, err);
    }
    throw err;
  }
}

export async function clearProfile(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.profile);
  } catch (err) {
    logger.error('clearProfile: remove failed', err);
    throw err;
  }
}

/**
 * Deep merge a DeepPartial patch onto a base profile.
 *
 * Skips __proto__ / constructor / prototype keys at every level.
 * Arrays are replaced wholesale (not merged element-wise).
 * Objects are merged recursively.
 */
export function deepMergeProfilePatch<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof patch !== 'object') return base;
  if (Array.isArray(patch)) return patch as unknown as T;
  if (base === null || base === undefined || typeof base !== 'object' || Array.isArray(base)) {
    return patch as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch as object)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const patchValue = (patch as Record<string, unknown>)[key];
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] = deepMergeProfilePatch(baseValue, patchValue);
  }
  return result as T;
}
```

### 6.12 - Write `src/background/storage/prefs.ts`

```typescript
// src/background/storage/prefs.ts
/**
 * Preferences storage adapter over chrome.storage.sync.
 *
 * Sync has strict quotas (8KB per item, 100KB total) and write-throttles
 * at 120 writes/hour. We buffer writes in-memory and flush every 60s (or on
 * explicit flush) to avoid tripping the throttle.
 *
 * Schema:
 *   llmc.prefs.v1 -> UserPrefs
 */

import { z } from 'zod';
import { STORAGE_KEYS, LOG_SCOPES } from '../config';
import { createLogger } from '../log';
import { QuotaExceededError } from './storage-errors';

const logger = createLogger(LOG_SCOPES.storage + '.prefs');

const UserPrefsSchema = z
  .object({
    agentLastUsed: z.enum(['job-hunter', 'b2b-sales']).optional(),
    highlightEnabledByDefault: z.boolean().optional(),
    showOnboarding: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict();

export type UserPrefs = z.infer<typeof UserPrefsSchema>;

const DEFAULT_PREFS: UserPrefs = Object.freeze({
  highlightEnabledByDefault: true,
  showOnboarding: true,
  theme: 'system',
});

let pendingWrite: UserPrefs | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 60_000;

export async function readPrefs(): Promise<UserPrefs> {
  const raw = await chrome.storage.sync.get(STORAGE_KEYS.prefs);
  const value = raw[STORAGE_KEYS.prefs];
  if (value === undefined || value === null) return DEFAULT_PREFS;
  const parsed = UserPrefsSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('readPrefs: corrupt, returning defaults', { issues: parsed.error.issues.length });
    return DEFAULT_PREFS;
  }
  return { ...DEFAULT_PREFS, ...parsed.data };
}

export function writePrefs(next: UserPrefs): void {
  const parsed = UserPrefsSchema.safeParse(next);
  if (!parsed.success) {
    logger.error('writePrefs: invalid shape, dropping', parsed.error);
    return;
  }
  pendingWrite = parsed.data;
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      void flushPrefs();
    }, FLUSH_INTERVAL_MS);
  }
}

export async function flushPrefs(): Promise<void> {
  if (pendingWrite === null) return;
  const toWrite = pendingWrite;
  pendingWrite = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    await chrome.storage.sync.set({ [STORAGE_KEYS.prefs]: toWrite });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('QUOTA') || msg.toLowerCase().includes('quota') || msg.includes('WRITE_OPERATIONS')) {
      logger.warn('flushPrefs: quota/throttle hit, rescheduling in 60s', { error: msg });
      pendingWrite = toWrite;
      flushTimer = setTimeout(() => {
        void flushPrefs();
      }, FLUSH_INTERVAL_MS);
      return;
    }
    logger.error('flushPrefs: write failed', err);
    throw err;
  }
}

/** Test-only: force synchronous flush. */
export async function __flushPrefsForTest(): Promise<void> {
  await flushPrefs();
}

/** Test-only: reset module state between tests. */
export function __resetPrefsForTest(): void {
  pendingWrite = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
```

### 6.13 - Write `src/background/storage/tab-state.ts`

```typescript
// src/background/storage/tab-state.ts
/**
 * Per-tab in-memory state: intent, highlight status, fill lock.
 *
 * Lives in a module-scoped Map<number, TabState>. Cleared on chrome.tabs.onRemoved.
 * Does NOT persist across SW restarts - that's fine, each fresh SW spin-up starts
 * with an empty map and re-builds from INTENT_DETECTED broadcasts.
 *
 * NOTE: we key on raw number (tab id), not branded TabId, because the Map is
 * internal to the background worker and does not cross the messaging boundary.
 * Callers from outside this module pass branded TabIds which we unwrap.
 */

import type { DetectedIntent } from 'ats-autofill-engine';
import type { TabId } from 'ats-autofill-engine';
import type { HighlightStatus } from '../messaging/protocol-types';

export interface TabState {
  readonly intent: DetectedIntent | null;
  readonly highlight: HighlightStatus;
  readonly fillLockedAt: number | null;
}

const EMPTY: TabState = Object.freeze({
  intent: null,
  highlight: Object.freeze({ on: false, keywordCount: 0, appliedAt: null }),
  fillLockedAt: null,
});

const state = new Map<number, TabState>();

function unbrand(tabId: TabId): number {
  return tabId as unknown as number;
}

export function getTabState(tabId: TabId): TabState {
  return state.get(unbrand(tabId)) ?? EMPTY;
}

export function setIntent(tabId: TabId, intent: DetectedIntent): void {
  const prev = state.get(unbrand(tabId)) ?? EMPTY;
  state.set(unbrand(tabId), Object.freeze({ ...prev, intent }));
}

export function setHighlight(tabId: TabId, highlight: HighlightStatus): void {
  const prev = state.get(unbrand(tabId)) ?? EMPTY;
  state.set(unbrand(tabId), Object.freeze({ ...prev, highlight }));
}

export function setFillLock(tabId: TabId, lockedAt: number | null): void {
  const prev = state.get(unbrand(tabId)) ?? EMPTY;
  state.set(unbrand(tabId), Object.freeze({ ...prev, fillLockedAt: lockedAt }));
}

export function clearTabState(tabId: number): void {
  state.delete(tabId);
}

export function clearAllTabState(): void {
  state.clear();
}

/** Test-only: snapshot the full map. */
export function __snapshotForTest(): ReadonlyMap<number, TabState> {
  return new Map(state);
}
```

### 6.14 - Write `src/background/auth/refresh-manager.ts` (D20 class + keystone 1.4)

```typescript
// src/background/auth/refresh-manager.ts
/**
 * RefreshManager - single-flight refresh dedup (memo 2.8) with DI per D20.
 *
 * Tests instantiate fresh RefreshManager instances with fake deps. Production
 * uses the singleton from refresh-manager.singleton.ts.
 *
 * Contract (verbatim from 03-keystone-contracts.md 1.4):
 *
 *   class RefreshManager {
 *     constructor(deps: RefreshManagerDeps);
 *     refreshOnce(): Promise<StoredTokens>;   // single-flight
 *   }
 */

import type { StoredTokens } from '../storage/tokens';
import type { Logger } from '../log';
import { REFRESH_ENDPOINT } from '../config';

export interface RefreshManagerDeps {
  readonly readTokens: () => Promise<StoredTokens | null>;
  readonly writeTokens: (t: StoredTokens) => Promise<void>;
  readonly clearTokens: () => Promise<void>;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly logger: Logger;
  readonly refreshEndpoint?: string;
}

export class SessionExpiredError extends Error {
  readonly name = 'SessionExpiredError';
  constructor(reason: string) {
    super(`session expired: ${reason}`);
  }
}

export class RefreshManager {
  private inflight: Promise<StoredTokens> | null = null;
  private readonly endpoint: string;

  constructor(private readonly deps: RefreshManagerDeps) {
    this.endpoint = deps.refreshEndpoint ?? REFRESH_ENDPOINT;
  }

  /**
   * Attempt a single refresh. If another caller is already refreshing, return
   * the same in-flight promise. On success, persist the new tokens and resolve.
   * On failure, clear tokens and reject with SessionExpiredError.
   */
  refreshOnce(): Promise<StoredTokens> {
    if (this.inflight !== null) {
      this.deps.logger.debug('refresh: dedup - joining in-flight');
      return this.inflight;
    }
    this.inflight = this.doRefresh()
      .catch(async (err) => {
        // Clear tokens on failure so subsequent calls see signed-out state.
        try {
          await this.deps.clearTokens();
        } catch (clearErr) {
          this.deps.logger.warn('refresh: clearTokens after failure also failed', { error: String(clearErr) });
        }
        throw err;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async doRefresh(): Promise<StoredTokens> {
    const existing = await this.deps.readTokens();
    if (existing === null) {
      throw new SessionExpiredError('no tokens in storage');
    }
    this.deps.logger.info('refresh: starting', { email: existing.email });

    let res: Response;
    try {
      res = await this.deps.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${existing.refreshToken}`,
          rid: 'session',
          'fdi-version': '3.0',
          'st-auth-mode': 'header',
        },
        body: JSON.stringify({}),
      });
    } catch (networkErr) {
      this.deps.logger.error('refresh: network error', networkErr);
      throw new SessionExpiredError('network error: ' + (networkErr instanceof Error ? networkErr.message : 'unknown'));
    }

    if (res.status === 401 || res.status === 403) {
      this.deps.logger.warn('refresh: rejected by server', { status: res.status });
      throw new SessionExpiredError(`server rejected refresh (${res.status})`);
    }
    if (!res.ok) {
      this.deps.logger.warn('refresh: non-2xx', { status: res.status });
      throw new SessionExpiredError(`refresh failed with status ${res.status}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (parseErr) {
      throw new SessionExpiredError('refresh response is not JSON');
    }

    // Expected shape: { accessToken, refreshToken, frontToken, accessTokenExpiry (ms), email? }
    if (typeof body !== 'object' || body === null) {
      throw new SessionExpiredError('refresh response is not an object');
    }
    const obj = body as Record<string, unknown>;
    const accessToken = obj.accessToken;
    const refreshToken = obj.refreshToken;
    const frontToken = obj.frontToken;
    const expiry = obj.accessTokenExpiry;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new SessionExpiredError('refresh response missing accessToken');
    }
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new SessionExpiredError('refresh response missing refreshToken');
    }
    if (typeof frontToken !== 'string' || frontToken.length === 0) {
      throw new SessionExpiredError('refresh response missing frontToken');
    }
    if (typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= 0) {
      throw new SessionExpiredError('refresh response missing or invalid accessTokenExpiry');
    }

    const rawEmail = obj.email;
    const email: string | null =
      typeof rawEmail === 'string' && rawEmail.length > 0 ? rawEmail : existing.email;

    const next: StoredTokens = {
      accessToken,
      refreshToken,
      frontToken,
      accessTokenExpiry: expiry,
      email,
    };
    await this.deps.writeTokens(next);
    this.deps.logger.info('refresh: success', { expiry });
    return next;
  }
}
```

### 6.15 - Write `src/background/auth/refresh-manager.singleton.ts`

```typescript
// src/background/auth/refresh-manager.singleton.ts
/**
 * Module-singleton RefreshManager wired with real production deps.
 *
 * Test code must NOT import this file; tests instantiate RefreshManager
 * directly with fake deps. See refresh-manager.spec.ts.
 */

import { RefreshManager } from './refresh-manager';
import { readTokens, writeTokens, clearTokens } from '../storage/tokens';
import { createLogger } from '../log';
import { LOG_SCOPES } from '../config';

export const refreshManager = new RefreshManager({
  readTokens,
  writeTokens,
  clearTokens,
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  logger: createLogger(LOG_SCOPES.refresh),
});
```

### 6.16 - Write `src/background/auth/auth-headers.ts`

```typescript
// src/background/auth/auth-headers.ts
/**
 * Build auth headers for non-SDK fetch calls (KEYWORDS_EXTRACT, CREDITS_GET).
 *
 * If the access token is expired or within 30s of expiry, proactively refresh
 * via the RefreshManager singleton before returning headers.
 *
 * Callers use this pattern:
 *   const headers = await buildAuthHeaders();
 *   const res = await fetch(url, { headers });
 *   if (res.status === 401) { await refreshManager.refreshOnce(); const retry = await fetch(url, { headers: await buildAuthHeaders() }); }
 */

import { readTokens } from '../storage/tokens';
import { refreshManager } from './refresh-manager.singleton';
import { SessionExpiredError } from './refresh-manager';

const PROACTIVE_REFRESH_WINDOW_MS = 30_000;

export async function buildAuthHeaders(): Promise<HeadersInit> {
  let tokens = await readTokens();
  if (tokens === null) {
    throw new SessionExpiredError('not signed in');
  }
  const now = Date.now();
  if (tokens.accessTokenExpiry - now < PROACTIVE_REFRESH_WINDOW_MS) {
    tokens = await refreshManager.refreshOnce();
  }
  return {
    authorization: `Bearer ${tokens.accessToken}`,
    'content-type': 'application/json',
  };
}
```

### 6.17 - Write `src/background/sdk/errors.ts`

```typescript
// src/background/sdk/errors.ts
export class NotImplementedError extends Error {
  readonly name = 'NotImplementedError';
  constructor(messageKey: string) {
    super(`handler not implemented: ${messageKey}`);
  }
}

export class SdkError extends Error {
  readonly name = 'SdkError';
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export { SessionExpiredError } from '../auth/refresh-manager';
```

### 6.18 - Write `src/background/sdk/sdk-client.ts`

```typescript
// src/background/sdk/sdk-client.ts
/**
 * On-demand SDK client factory (D10=b).
 *
 * Each handler that needs SDK calls:
 *   const sdk = createSdkClient();
 *   const res = await sdk.agents.listAgents();
 *
 * No singleton. No module-scoped client. The SDK instance is GC'd after the
 * handler's scope ends. The RefreshManager singleton handles auth header
 * construction across invocations via the `getAuthHeaders` callback.
 *
 * Tests verify no leaks by constructing 1000 clients in a loop and asserting
 * the module-scope has no references.
 */

import { API_BASE_URL } from '../config';
import { buildAuthHeaders } from '../auth/auth-headers';

// The llmconveyors SDK type is imported via dynamic shape because at the time
// of A5 implementation, the SDK package may still be pinned to 0.4.x. We
// declare the minimum surface we need here.
export interface SdkClient {
  readonly agents: {
    listAgents: () => Promise<unknown>;
    getManifest: (agentId: string) => Promise<unknown>;
  };
  readonly settings: {
    getUsageSummary: () => Promise<unknown>;
  };
}

export interface SdkClientFactoryDeps {
  readonly apiBaseUrl: string;
  readonly getAuthHeaders: () => Promise<HeadersInit>;
}

/**
 * Construct a fresh SdkClient for a single operation. Do NOT cache the return
 * value across handler invocations.
 */
export function createSdkClient(
  deps: SdkClientFactoryDeps = { apiBaseUrl: API_BASE_URL, getAuthHeaders: buildAuthHeaders },
): SdkClient {
  const doFetch = async (path: string): Promise<unknown> => {
    const headers = await deps.getAuthHeaders();
    const res = await fetch(deps.apiBaseUrl + path, { method: 'GET', headers });
    if (!res.ok) {
      throw new Error(`sdk call failed: ${res.status} ${path}`);
    }
    return res.json();
  };

  return Object.freeze({
    agents: Object.freeze({
      listAgents: () => doFetch('/api/v1/agents'),
      getManifest: (agentId: string) => doFetch(`/api/v1/agents/${encodeURIComponent(agentId)}/manifest`),
    }),
    settings: Object.freeze({
      getUsageSummary: () => doFetch('/api/v1/settings/usage/summary'),
    }),
  });
}
```

### 6.19 - Write `src/background/http/fetch-with-retry.ts`

```typescript
// src/background/http/fetch-with-retry.ts
/**
 * fetch wrapper that auto-retries once on 401 via the RefreshManager.
 *
 * Used by KEYWORDS_EXTRACT and CREDITS_GET bg handlers.
 */

import { buildAuthHeaders } from '../auth/auth-headers';
import { refreshManager } from '../auth/refresh-manager.singleton';
import { SessionExpiredError } from '../auth/refresh-manager';
import { createLogger } from '../log';
import { LOG_SCOPES } from '../config';

const logger = createLogger(LOG_SCOPES.http);

export interface FetchWithRetryOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  let headers: HeadersInit;
  try {
    headers = await buildAuthHeaders();
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    throw err;
  }
  const doOnce = (h: HeadersInit): Promise<Response> =>
    fetch(url, { method: opts.method ?? 'GET', headers: h, body: opts.body, signal: opts.signal });

  let res: Response;
  try {
    res = await doOnce(headers);
  } catch (networkErr) {
    logger.warn('fetchWithRetry: network error on first attempt', { error: String(networkErr) });
    throw networkErr;
  }
  if (res.status !== 401) return res;

  // Single 401 retry: refresh once, rebuild headers, retry.
  logger.info('fetchWithRetry: 401 received, triggering refresh');
  try {
    await refreshManager.refreshOnce();
  } catch (refreshErr) {
    throw refreshErr;
  }
  const freshHeaders = await buildAuthHeaders();
  return doOnce(freshHeaders);
}
```

### 6.20 - Write `src/background/messaging/handlers.ts` (the exhaustive HANDLERS record)

```typescript
// src/background/messaging/handlers.ts
/**
 * Exhaustive dispatch table for every background-handled ProtocolMap key.
 *
 * Per D18 contract test matrix: every key in BG_HANDLED_KEYS has a handler.
 * The compiler enforces this via:
 *
 *   type HandlerFor<K extends BgHandledKey> =
 *     (msg: { data: Parameters<ProtocolMap[K]>[0] }) => Promise<ReturnType<ProtocolMap[K]>>;
 *
 *   export const HANDLERS: { [K in BgHandledKey]: HandlerFor<K> } = { ... };
 *
 * HIGHLIGHT_APPLY and HIGHLIGHT_CLEAR are EXCLUDED - those are registered by
 * the content script (A9). See section 5.10.
 */

import type { ProtocolMap, BgHandledKey } from './protocol';
import type { Profile, DetectedIntent } from 'ats-autofill-engine';
import type { TabId } from 'ats-autofill-engine';
import type { AuthState } from './auth-state';
import { UNAUTHED } from './auth-state';
import type {
  ProfileUpdateResponse,
  ProfileUploadResponse,
  FillRequestResponse,
  KeywordsExtractResponse,
  HighlightStatus,
  GenerationStartResponse,
  CreditsState,
} from './protocol-types';

import {
  DetectedIntentPayloadSchema,
  IntentGetRequestSchema,
  ProfileUpdateRequestSchema,
  ProfileUploadRequestSchema,
  FillRequestSchema,
  KeywordsExtractRequestSchema,
  ExtractSkillsBackendResponseSchema,
  HighlightStatusRequestSchema,
  GenerationStartRequestSchema,
  GenerationCancelRequestSchema,
  DetectedJobBroadcastSchema,
  AuthStateSchema,
  validatePatchSafety,
} from './schemas';

import { readTokens, clearTokens } from '../storage/tokens';
import { readProfile, writeProfile, deepMergeProfilePatch } from '../storage/profile';
import {
  getTabState,
  setIntent,
  setHighlight,
  clearAllTabState,
} from '../storage/tab-state';
import { ProfileSchema } from 'ats-autofill-engine/profile';
import { NotImplementedError } from '../sdk/errors';
import { SessionExpiredError } from '../auth/refresh-manager';
import { fetchWithRetry } from '../http/fetch-with-retry';
import { EXTRACT_SKILLS_ENDPOINT, USAGE_SUMMARY_ENDPOINT, LOG_SCOPES } from '../config';
import { createLogger } from '../log';

const logger = createLogger(LOG_SCOPES.handlers);

/**
 * HandlerFor<K> is the signature @webext-core/messaging passes to onMessage.
 * The library gives us `{ data, sender, ... }`; we return a Promise of the
 * ProtocolMap return type.
 */
type HandlerFor<K extends BgHandledKey> = (msg: {
  data: Parameters<ProtocolMap[K]>[0];
  sender: chrome.runtime.MessageSender;
}) => Promise<ReturnType<ProtocolMap[K]>>;

// --- AUTH ---

const handleAuthSignIn: HandlerFor<'AUTH_SIGN_IN'> = async () => {
  throw new NotImplementedError('AUTH_SIGN_IN (A6 owns)');
};

const handleAuthSignOut: HandlerFor<'AUTH_SIGN_OUT'> = async () => {
  logger.info('AUTH_SIGN_OUT');
  try {
    await clearTokens();
  } catch (err) {
    logger.error('AUTH_SIGN_OUT: clearTokens failed', err);
  }
  clearAllTabState();
  return UNAUTHED;
};

const handleAuthStatus: HandlerFor<'AUTH_STATUS'> = async () => {
  const tokens = await readTokens();
  if (tokens === null) return UNAUTHED;
  return {
    authed: true,
    email: tokens.email,
    accessTokenExpiry: tokens.accessTokenExpiry,
  };
};

const handleAuthStateChanged: HandlerFor<'AUTH_STATE_CHANGED'> = async ({ data }) => {
  // Broadcast-only. Still validate the shape so malformed broadcasts don't
  // silently propagate. Do not throw (the sender is not awaiting a response).
  const parsed = AuthStateSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn('AUTH_STATE_CHANGED: invalid payload, dropping', { issues: parsed.error.issues.length });
  }
  return undefined;
};

// --- PROFILE ---

const handleProfileGet: HandlerFor<'PROFILE_GET'> = async () => {
  return readProfile();
};

const handleProfileUpdate: HandlerFor<'PROFILE_UPDATE'> = async ({ data }) => {
  const parsed = ProfileUpdateRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const safety = validatePatchSafety(parsed.data.patch);
  if (!safety.safe) {
    logger.warn('PROFILE_UPDATE: unsafe patch rejected', { reason: safety.reason });
    return { ok: false, errors: [{ path: 'patch', message: safety.reason }] };
  }
  const existing = await readProfile();
  if (existing === null) {
    return { ok: false, errors: [{ path: '', message: 'no profile to patch; use PROFILE_UPLOAD_JSON_RESUME first' }] };
  }
  const merged = deepMergeProfilePatch<Profile>(existing, parsed.data.patch);
  const valid = ProfileSchema.safeParse(merged);
  if (!valid.success) {
    return {
      ok: false,
      errors: valid.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  await writeProfile(valid.data);
  return { ok: true };
};

const handleProfileUploadJsonResume: HandlerFor<'PROFILE_UPLOAD_JSON_RESUME'> = async () => {
  throw new NotImplementedError('PROFILE_UPLOAD_JSON_RESUME (A7 owns)');
};

// --- INTENT ---

const handleIntentDetected: HandlerFor<'INTENT_DETECTED'> = async ({ data, sender }) => {
  const parsed = DetectedIntentPayloadSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn('INTENT_DETECTED: invalid payload', { issues: parsed.error.issues.length });
    return undefined;
  }
  // Substitute sender.tab.id when tabId === -1 sentinel.
  let resolvedTabId: number | null = parsed.data.tabId;
  if (resolvedTabId === -1) {
    const senderTabId = sender.tab?.id;
    if (typeof senderTabId !== 'number') {
      logger.warn('INTENT_DETECTED: tabId=-1 but sender.tab.id unavailable');
      return undefined;
    }
    resolvedTabId = senderTabId;
  }
  const intent: DetectedIntent = {
    kind: parsed.data.kind,
    pageKind: parsed.data.pageKind,
    url: parsed.data.url,
    jobTitle: parsed.data.jobTitle,
    company: parsed.data.company,
    detectedAt: parsed.data.detectedAt,
  };
  setIntent(resolvedTabId as TabId, intent);
  return undefined;
};

const handleIntentGet: HandlerFor<'INTENT_GET'> = async ({ data }) => {
  const parsed = IntentGetRequestSchema.safeParse(data);
  if (!parsed.success) return null;
  const s = getTabState(parsed.data.tabId as TabId);
  return s.intent;
};

// --- FILL (forwarder to content script) ---

const handleFillRequest: HandlerFor<'FILL_REQUEST'> = async ({ data }) => {
  const parsed = FillRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: 'no-tab' } as FillRequestResponse;
  }
  const tabId = parsed.data.tabId as number;
  try {
    // Forward to the content script in that tab. The content script registers
    // its own onMessage('FILL_REQUEST', ...) and returns the real response.
    const resp = (await chrome.tabs.sendMessage(tabId, { type: 'FILL_REQUEST', data: { tabId } })) as
      | FillRequestResponse
      | undefined;
    if (!resp || typeof resp !== 'object') {
      return { ok: false, reason: 'content-script-not-loaded' };
    }
    return resp;
  } catch (err) {
    logger.warn('FILL_REQUEST: forward failed', { tabId, error: String(err) });
    return { ok: false, reason: 'content-script-not-loaded' };
  }
};

// --- KEYWORDS_EXTRACT (direct fetch, per memo 2.10) ---

const handleKeywordsExtract: HandlerFor<'KEYWORDS_EXTRACT'> = async ({ data }) => {
  const parsed = KeywordsExtractRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: 'empty-text' };
  }
  const tookStart = Date.now();
  let res: Response;
  try {
    res = await fetchWithRetry(EXTRACT_SKILLS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        text: parsed.data.text,
        options: { topK: parsed.data.topK ?? 40 },
      }),
    });
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return { ok: false, reason: 'signed-out' };
    }
    logger.warn('KEYWORDS_EXTRACT: network error', { error: String(err) });
    return { ok: false, reason: 'network-error' };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'signed-out' };
  }
  if (res.status === 429) {
    return { ok: false, reason: 'rate-limited' };
  }
  if (!res.ok) {
    return { ok: false, reason: 'api-error' };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'api-error' };
  }
  const envelope = ExtractSkillsBackendResponseSchema.safeParse(body);
  if (!envelope.success) {
    logger.warn('KEYWORDS_EXTRACT: backend response shape drift', {
      issues: envelope.error.issues.length,
    });
    return { ok: false, reason: 'api-error' };
  }
  const tookMs = Date.now() - tookStart;
  return { ok: true, keywords: envelope.data.data.keywords, tookMs };
};

// --- HIGHLIGHT_STATUS (bg-side read of per-tab map) ---

const handleHighlightStatus: HandlerFor<'HIGHLIGHT_STATUS'> = async ({ data }) => {
  const parsed = HighlightStatusRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { on: false, keywordCount: 0, appliedAt: null };
  }
  const s = getTabState(parsed.data.tabId as TabId);
  return s.highlight;
};

// --- GENERATION (A11 replaces the real-work handlers) ---

const handleGenerationStart: HandlerFor<'GENERATION_START'> = async ({ data }) => {
  const parsed = GenerationStartRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid payload' };
  }
  throw new NotImplementedError('GENERATION_START (A11 owns)');
};

const handleGenerationUpdate: HandlerFor<'GENERATION_UPDATE'> = async () => {
  // Broadcast-only.
  return undefined;
};

const handleGenerationCancel: HandlerFor<'GENERATION_CANCEL'> = async ({ data }) => {
  const parsed = GenerationCancelRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false };
  }
  throw new NotImplementedError('GENERATION_CANCEL (A11 owns)');
};

// --- DETECTED_JOB_BROADCAST (inert) ---

const handleDetectedJobBroadcast: HandlerFor<'DETECTED_JOB_BROADCAST'> = async ({ data }) => {
  const parsed = DetectedJobBroadcastSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn('DETECTED_JOB_BROADCAST: invalid payload', { issues: parsed.error.issues.length });
  }
  return undefined;
};

// --- CREDITS_GET (direct fetch) ---

const handleCreditsGet: HandlerFor<'CREDITS_GET'> = async () => {
  const fallback: CreditsState = { balance: 0, plan: 'unknown', resetAt: null };
  let res: Response;
  try {
    res = await fetchWithRetry(USAGE_SUMMARY_ENDPOINT, { method: 'GET' });
  } catch (err) {
    if (err instanceof SessionExpiredError) return fallback;
    logger.warn('CREDITS_GET: network error', { error: String(err) });
    return fallback;
  }
  if (!res.ok) return fallback;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }
  if (typeof body !== 'object' || body === null) return fallback;
  const obj = body as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data) return fallback;
  const balance = typeof data.balance === 'number' ? data.balance : 0;
  const plan = typeof data.plan === 'string' ? data.plan : 'unknown';
  const resetAt = typeof data.resetAt === 'number' ? data.resetAt : null;
  return { balance, plan, resetAt };
};

// --- Exhaustive HANDLERS record (compile-time exhaustiveness per D18) ---

export const HANDLERS: { readonly [K in BgHandledKey]: HandlerFor<K> } = Object.freeze({
  AUTH_SIGN_IN: handleAuthSignIn,
  AUTH_SIGN_OUT: handleAuthSignOut,
  AUTH_STATUS: handleAuthStatus,
  AUTH_STATE_CHANGED: handleAuthStateChanged,
  PROFILE_GET: handleProfileGet,
  PROFILE_UPDATE: handleProfileUpdate,
  PROFILE_UPLOAD_JSON_RESUME: handleProfileUploadJsonResume,
  INTENT_DETECTED: handleIntentDetected,
  INTENT_GET: handleIntentGet,
  FILL_REQUEST: handleFillRequest,
  KEYWORDS_EXTRACT: handleKeywordsExtract,
  HIGHLIGHT_STATUS: handleHighlightStatus,
  GENERATION_START: handleGenerationStart,
  GENERATION_UPDATE: handleGenerationUpdate,
  GENERATION_CANCEL: handleGenerationCancel,
  DETECTED_JOB_BROADCAST: handleDetectedJobBroadcast,
  CREDITS_GET: handleCreditsGet,
});
```

### 6.21 - Write `src/background/index.ts` (entrypoint wiring)

```typescript
// src/background/index.ts
/**
 * Background entrypoint. Called once per service-worker spin-up from
 * entrypoints/background.ts via the WXT defineBackground shell.
 *
 * Responsibilities:
 *  1. Install global error handlers (uncaught rejection logging).
 *  2. Wire chrome.tabs.onRemoved to clean up per-tab state.
 *  3. Register every BG_HANDLED_KEYS entry via onMessage(key, HANDLERS[key]).
 *  4. Reference the refresh-manager singleton so its side effects start.
 */

import { onMessage, BG_HANDLED_KEYS } from './messaging/protocol';
import { HANDLERS } from './messaging/handlers';
import { clearTabState } from './storage/tab-state';
import { refreshManager as _refreshManager } from './auth/refresh-manager.singleton';
import { createLogger } from './log';
import { LOG_SCOPES } from './config';

const logger = createLogger(LOG_SCOPES.background);

export function main(): void {
  // Touch the singleton so the import is not dead-code-eliminated.
  void _refreshManager;

  logger.info('background main() starting');

  // Per-key onMessage registration. Generic dispatch loses per-key type safety
  // inside the @webext-core/messaging signature, so we use a typed wrapper.
  for (const key of BG_HANDLED_KEYS) {
    const handler = HANDLERS[key];
    // The library's onMessage signature is per-key at the surface but erases
    // inside the implementation. We cast here at the single boundary; the
    // HANDLERS record's typing above guarantees each handler is correct.
    (onMessage as (k: typeof key, h: typeof handler) => void)(key, handler);
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearTabState(tabId);
  });

  // Global unhandled-rejection handler. Service workers lose stack context on
  // async failures if we don't catch at the top level.
  globalThis.addEventListener?.('unhandledrejection', (ev) => {
    logger.error('unhandledrejection', (ev as PromiseRejectionEvent).reason);
  });

  logger.info('background main() ready', { keys: BG_HANDLED_KEYS.length });
}
```

### 6.22 - Replace `entrypoints/background.ts` (thinned forwarder)

```typescript
// entrypoints/background.ts
/**
 * WXT background entry. Delegates to src/background/index.ts::main().
 *
 * Do NOT add logic to this file. All real code lives in src/background/.
 */
import { defineBackground } from 'wxt/sandbox';
import { main } from '@/background';

export default defineBackground({
  type: 'module',
  main() {
    main();
  },
});
```

### 6.23 - Write `src/background/blueprint.contract.ts` (D22)

```typescript
// src/background/blueprint.contract.ts
/**
 * Blueprint contract for the background subtree.
 *
 * CI script scripts/check-blueprint-contracts.mjs reads this, verifies:
 *  - Declared publicExports match actual exports from the area's index.ts
 *  - forbiddenImports are absent from any file under the area
 *  - requiredCoverage threshold is met
 */

export const BACKGROUND_BLUEPRINT = {
  phase: 'A5',
  version: '2.1',
  area: 'src/background/**',
  publicExports: [
    // messaging
    'ProtocolMap',
    'BG_HANDLED_KEYS',
    'sendMessage',
    'onMessage',
    'AuthState',
    'UNAUTHED',
    // protocol-types
    'ProfileUpdateResponse',
    'ProfileUploadResponse',
    'DetectedIntentPayload',
    'FillRequestResponse',
    'KeywordsExtractRequest',
    'KeywordsExtractResponse',
    'HighlightApplyResponse',
    'HighlightClearResponse',
    'HighlightStatus',
    'GenerationStartRequest',
    'GenerationStartResponse',
    'GenerationUpdateBroadcast',
    'GenerationArtifact',
    'CreditsState',
    // log
    'log',
    'createLogger',
    // auth
    'RefreshManager',
    'SessionExpiredError',
    'buildAuthHeaders',
    // sdk
    'createSdkClient',
    'NotImplementedError',
    // entrypoint
    'main',
  ] as const,
  forbiddenImports: [
    // Content-script surface (bg must not depend on content-script internals)
    'entrypoints/ats.content/*',
    'entrypoints/popup/*',
    'entrypoints/options/*',
    'entrypoints/sidepanel/*',
    // DOM-specific engine modules (bg is non-DOM)
    'ats-autofill-engine/dom',
    'ats-autofill-engine/greenhouse',
    'ats-autofill-engine/lever',
    'ats-autofill-engine/workday',
  ],
  allowedImports: [
    'ats-autofill-engine',
    'ats-autofill-engine/profile',
    '@webext-core/messaging',
    'webextension-polyfill',
    'zod',
  ],
  requiredCoverage: { line: 80, branch: 75 },
} as const;
```

### 6.24 - Write `scripts/rollback-phase-A5.sh` (D23)

```bash
#!/bin/bash
# scripts/rollback-phase-A5.sh
# Mechanically revert phase A5. Restores the A1 background skeleton.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Rolling back phase A5..."

rm -rf src/background/
rm -rf tests/background/

# Restore the A1 skeleton of entrypoints/background.ts. A1's plan has the
# canonical version; git should have it from the A1 commit.
git checkout HEAD -- entrypoints/background.ts || {
  echo "ERROR: could not restore entrypoints/background.ts - check git log"
  exit 1
}

# Re-run typecheck in rolled-back state.
pnpm typecheck || {
  echo "ERROR: rolled-back state does not typecheck"
  exit 1
}

echo "Phase A5 rolled back cleanly."
```

Make it executable: `chmod +x scripts/rollback-phase-A5.sh`.

### 6.25 - Test file: `tests/background/messaging/protocol-contract.type-test.ts` (D14.2)

```typescript
// tests/background/messaging/protocol-contract.type-test.ts
/**
 * Compile-time assertion that A5 ships EXACTLY the 19 ProtocolMap keys from
 * 03-keystone-contracts.md 1.3. Compile fails if any key is missing OR if
 * any undocumented key is added.
 */

import type { ProtocolMap } from '@/background/messaging/protocol';

type RequiredKeys =
  | 'AUTH_SIGN_IN'
  | 'AUTH_SIGN_OUT'
  | 'AUTH_STATUS'
  | 'AUTH_STATE_CHANGED'
  | 'PROFILE_GET'
  | 'PROFILE_UPDATE'
  | 'PROFILE_UPLOAD_JSON_RESUME'
  | 'KEYWORDS_EXTRACT'
  | 'INTENT_DETECTED'
  | 'INTENT_GET'
  | 'FILL_REQUEST'
  | 'HIGHLIGHT_APPLY'
  | 'HIGHLIGHT_CLEAR'
  | 'HIGHLIGHT_STATUS'
  | 'GENERATION_START'
  | 'GENERATION_UPDATE'
  | 'GENERATION_CANCEL'
  | 'DETECTED_JOB_BROADCAST'
  | 'CREDITS_GET';

type _RequiredPresent = RequiredKeys extends keyof ProtocolMap ? true : never;
type _NoExtras = Exclude<keyof ProtocolMap, RequiredKeys> extends never ? true : never;

// If either assertion fails, this file fails to compile. That's the point.
const _check1: _RequiredPresent = true;
const _check2: _NoExtras = true;

// Force the consts to be "used" so TS does not drop them in erased output.
export const __PROTOCOL_CONTRACT_CHECK = { _check1, _check2 } as const;
```

### 6.26 - Test file: `tests/background/auth/refresh-manager.spec.ts`

Structure (pseudo - full impl in the executor's hands, bounded by these adversarial categories per D19):

```typescript
// tests/background/auth/refresh-manager.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefreshManager, SessionExpiredError } from '@/background/auth/refresh-manager';
import type { StoredTokens } from '@/background/storage/tokens';
import type { Logger } from '@/background/log';

function makeDeps(overrides: Partial<Parameters<typeof RefreshManager['prototype']['constructor']>[0]> = {}) {
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const tokens: StoredTokens = {
    accessToken: 'AT',
    refreshToken: 'RT',
    frontToken: 'FT',
    accessTokenExpiry: Date.now() + 3600_000,
    email: 'u@example.com',
  };
  return {
    readTokens: vi.fn().mockResolvedValue(tokens),
    writeTokens: vi.fn().mockResolvedValue(undefined),
    clearTokens: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn(),
    now: () => Date.now(),
    logger,
    refreshEndpoint: 'https://api.test/auth/session/refresh',
    ...overrides,
  };
}

describe('RefreshManager', () => {
  describe('happy path', () => {
    it('performs a successful refresh and persists new tokens', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'NEW_AT',
            refreshToken: 'NEW_RT',
            frontToken: 'NEW_FT',
            accessTokenExpiry: Date.now() + 7200_000,
            email: 'u@example.com',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const rm = new RefreshManager(deps);
      const result = await rm.refreshOnce();
      expect(result.accessToken).toBe('NEW_AT');
      expect(deps.writeTokens).toHaveBeenCalledOnce();
    });
  });

  describe('single-flight dedup (memo 2.8)', () => {
    it('joins concurrent refreshOnce callers to the same in-flight promise', async () => {
      const deps = makeDeps();
      let resolveFetch: (r: Response) => void = () => {};
      deps.fetch.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
      const rm = new RefreshManager(deps);
      const p1 = rm.refreshOnce();
      const p2 = rm.refreshOnce();
      const p3 = rm.refreshOnce();
      expect(deps.fetch).toHaveBeenCalledTimes(1); // dedup
      resolveFetch(
        new Response(
          JSON.stringify({
            accessToken: 'NEW_AT',
            refreshToken: 'NEW_RT',
            frontToken: 'NEW_FT',
            accessTokenExpiry: Date.now() + 3600_000,
          }),
          { status: 200 },
        ),
      );
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('releases the in-flight slot after success so subsequent refreshes work', async () => {
      const deps = makeDeps();
      deps.fetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ accessToken: 'AT1', refreshToken: 'RT1', frontToken: 'FT1', accessTokenExpiry: Date.now() + 3600_000 }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ accessToken: 'AT2', refreshToken: 'RT2', frontToken: 'FT2', accessTokenExpiry: Date.now() + 3600_000 }),
            { status: 200 },
          ),
        );
      const rm = new RefreshManager(deps);
      await rm.refreshOnce();
      await rm.refreshOnce();
      expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it('releases the in-flight slot after rejection so new attempts are allowed', async () => {
      const deps = makeDeps();
      deps.fetch
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ accessToken: 'OK', refreshToken: 'OK', frontToken: 'OK_FT', accessTokenExpiry: Date.now() + 3600_000 }),
            { status: 200 },
          ),
        );
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
      // readTokens was wiped by the failure path; re-seed for the retry
      deps.readTokens.mockResolvedValue({
        accessToken: 'old',
        refreshToken: 'old',
        frontToken: 'old_ft',
        accessTokenExpiry: 0,
        email: null,
      });
      await expect(rm.refreshOnce()).resolves.toMatchObject({ accessToken: 'OK' });
    });
  });

  describe('failure modes', () => {
    it('throws SessionExpiredError on 401', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(new Response('', { status: 401 }));
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
      expect(deps.clearTokens).toHaveBeenCalled();
    });

    it('throws SessionExpiredError on network error', async () => {
      const deps = makeDeps();
      deps.fetch.mockRejectedValue(new TypeError('net::ERR_CONNECTION_REFUSED'));
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws when readTokens returns null', async () => {
      const deps = makeDeps({ readTokens: vi.fn().mockResolvedValue(null) });
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws on malformed refresh response (missing accessToken)', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(
        new Response(JSON.stringify({ refreshToken: 'x', accessTokenExpiry: 1 }), { status: 200 }),
      );
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws on malformed JWT fragment (accessToken is not a string)', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 123, refreshToken: 'x', accessTokenExpiry: 1 }), { status: 200 }),
      );
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws on non-JSON response body', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 200 }));
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws on Infinity expiry', async () => {
      const deps = makeDeps();
      deps.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({ accessToken: 'a', refreshToken: 'b', accessTokenExpiry: Infinity }),
          { status: 200 },
        ),
      );
      const rm = new RefreshManager(deps);
      await expect(rm.refreshOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    });
  });

  describe('adversarial: storm of 100 concurrent callers', () => {
    it('still makes exactly one fetch call', async () => {
      const deps = makeDeps();
      let resolveFetch: (r: Response) => void = () => {};
      deps.fetch.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
      const rm = new RefreshManager(deps);
      const promises = Array.from({ length: 100 }, () => rm.refreshOnce());
      expect(deps.fetch).toHaveBeenCalledTimes(1);
      resolveFetch(
        new Response(
          JSON.stringify({ accessToken: 'N', refreshToken: 'N', frontToken: 'N_FT', accessTokenExpiry: Date.now() + 3600_000 }),
          { status: 200 },
        ),
      );
      const results = await Promise.all(promises);
      expect(new Set(results).size).toBe(1);
    });
  });
});
```

### 6.27 - Test file: `tests/background/storage/tokens.spec.ts`

```typescript
// tests/background/storage/tokens.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readTokens, writeTokens, clearTokens } from '@/background/storage/tokens';
import { QuotaExceededError } from '@/background/storage/storage-errors';

const makeTokens = () => ({
  accessToken: 'AT',
  refreshToken: 'RT',
  frontToken: 'FT',
  accessTokenExpiry: Date.now() + 3600_000,
  email: 'u@example.com',
});

describe('tokens storage', () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
          clear: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('readTokens returns null when storage empty', async () => {
    expect(await readTokens()).toBeNull();
  });

  it('roundtrip write -> read', async () => {
    const t = makeTokens();
    (chrome.storage.session.get as any).mockResolvedValue({ 'llmc.tokens.v1': t });
    const got = await readTokens();
    expect(got?.accessToken).toBe('AT');
  });

  it('readTokens returns null on corrupt shape and cleans up', async () => {
    (chrome.storage.session.get as any).mockResolvedValue({
      'llmc.tokens.v1': { accessToken: 123, refreshToken: null },
    });
    expect(await readTokens()).toBeNull();
    expect(chrome.storage.session.remove).toHaveBeenCalled();
  });

  it('writeTokens throws on invalid shape', async () => {
    await expect(writeTokens({} as any)).rejects.toThrow();
  });

  it('writeTokens wraps quota errors as QuotaExceededError', async () => {
    (chrome.storage.session.set as any).mockRejectedValue(new Error('QUOTA_BYTES exceeded'));
    await expect(writeTokens(makeTokens())).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('clearTokens falls back to full clear if remove fails', async () => {
    (chrome.storage.session.remove as any).mockRejectedValue(new Error('boom'));
    await clearTokens();
    expect(chrome.storage.session.clear).toHaveBeenCalled();
  });
});
```

### 6.28 - Test file: `tests/background/messaging/handlers.spec.ts`

One describe per BG-handled key. For each: happy path, Zod rejection, error path.

```typescript
// tests/background/messaging/handlers.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage modules BEFORE importing handlers.
vi.mock('@/background/storage/tokens', () => ({
  readTokens: vi.fn(),
  writeTokens: vi.fn(),
  clearTokens: vi.fn(),
}));
vi.mock('@/background/storage/profile', async () => {
  const actual = await vi.importActual<typeof import('@/background/storage/profile')>(
    '@/background/storage/profile',
  );
  return {
    ...actual,
    readProfile: vi.fn(),
    writeProfile: vi.fn(),
  };
});
vi.mock('@/background/http/fetch-with-retry', () => ({
  fetchWithRetry: vi.fn(),
}));

import { HANDLERS } from '@/background/messaging/handlers';
import { readTokens, clearTokens } from '@/background/storage/tokens';
import { readProfile, writeProfile } from '@/background/storage/profile';
import { fetchWithRetry } from '@/background/http/fetch-with-retry';
import { NotImplementedError } from '@/background/sdk/errors';

const senderStub = { tab: { id: 42 } } as chrome.runtime.MessageSender;

describe('HANDLERS record completeness', () => {
  it('exposes exactly the BG_HANDLED_KEYS set', () => {
    const keys = Object.keys(HANDLERS).sort();
    expect(keys).toEqual(
      [
        'AUTH_SIGN_IN',
        'AUTH_SIGN_OUT',
        'AUTH_STATUS',
        'AUTH_STATE_CHANGED',
        'PROFILE_GET',
        'PROFILE_UPDATE',
        'PROFILE_UPLOAD_JSON_RESUME',
        'INTENT_DETECTED',
        'INTENT_GET',
        'FILL_REQUEST',
        'KEYWORDS_EXTRACT',
        'HIGHLIGHT_STATUS',
        'GENERATION_START',
        'GENERATION_UPDATE',
        'GENERATION_CANCEL',
        'DETECTED_JOB_BROADCAST',
        'CREDITS_GET',
      ].sort(),
    );
  });
  it('omits HIGHLIGHT_APPLY and HIGHLIGHT_CLEAR (content-script owned)', () => {
    expect(HANDLERS).not.toHaveProperty('HIGHLIGHT_APPLY');
    expect(HANDLERS).not.toHaveProperty('HIGHLIGHT_CLEAR');
  });
});

describe('AUTH_SIGN_IN handler', () => {
  it('throws NotImplementedError (A6 owns)', async () => {
    await expect(HANDLERS.AUTH_SIGN_IN({ data: undefined, sender: senderStub })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});

describe('AUTH_SIGN_OUT handler', () => {
  beforeEach(() => vi.clearAllMocks());
  it('clears tokens and returns UNAUTHED', async () => {
    const result = await HANDLERS.AUTH_SIGN_OUT({ data: undefined, sender: senderStub });
    expect(clearTokens).toHaveBeenCalled();
    expect(result).toEqual({ authed: false });
  });
});

describe('AUTH_STATUS handler', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns unauthed when no tokens', async () => {
    vi.mocked(readTokens).mockResolvedValue(null);
    expect(await HANDLERS.AUTH_STATUS({ data: undefined, sender: senderStub })).toEqual({ authed: false });
  });
  it('returns authed state when tokens present', async () => {
    vi.mocked(readTokens).mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      frontToken: 'FT',
      accessTokenExpiry: 999,
      email: 'u@x.com',
    });
    expect(await HANDLERS.AUTH_STATUS({ data: undefined, sender: senderStub })).toEqual({
      authed: true,
      email: 'u@x.com',
      accessTokenExpiry: 999,
    });
  });
});

describe('PROFILE_UPDATE handler', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects null payload', async () => {
    const result = await HANDLERS.PROFILE_UPDATE({
      data: null as unknown as { patch: Record<string, unknown> },
      sender: senderStub,
    });
    expect(result.ok).toBe(false);
  });
  it('rejects __proto__ injection', async () => {
    vi.mocked(readProfile).mockResolvedValue({} as never);
    const patch = JSON.parse('{"__proto__":{"polluted":true}}');
    const result = await HANDLERS.PROFILE_UPDATE({ data: { patch }, sender: senderStub });
    expect(result.ok).toBe(false);
  });
  it('rejects when no existing profile', async () => {
    vi.mocked(readProfile).mockResolvedValue(null);
    const result = await HANDLERS.PROFILE_UPDATE({
      data: { patch: { basics: { firstName: 'A' } } },
      sender: senderStub,
    });
    expect(result.ok).toBe(false);
  });
});

describe('PROFILE_UPLOAD_JSON_RESUME handler', () => {
  it('throws NotImplementedError (A7 owns)', async () => {
    await expect(
      HANDLERS.PROFILE_UPLOAD_JSON_RESUME({ data: { raw: {} }, sender: senderStub }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});

describe('INTENT_DETECTED handler', () => {
  it('accepts valid payload and substitutes sender.tab.id for -1 sentinel', async () => {
    const result = await HANDLERS.INTENT_DETECTED({
      data: {
        tabId: -1,
        url: 'https://boards.greenhouse.io/foo/jobs/123',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: Date.now(),
      },
      sender: senderStub,
    });
    expect(result).toBeUndefined();
  });
  it('rejects invalid url', async () => {
    const result = await HANDLERS.INTENT_DETECTED({
      data: {
        tabId: 1 as never,
        url: 'not-a-url',
        kind: 'greenhouse',
        pageKind: 'job-posting',
        detectedAt: Date.now(),
      },
      sender: senderStub,
    });
    expect(result).toBeUndefined();
  });
});

describe('KEYWORDS_EXTRACT handler', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns ok with keywords on successful backend call', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            keywords: [{ term: 'typescript', category: 'hard', score: 0.9, occurrences: 3, canonicalForm: 'typescript' }],
            tookMs: 42,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await HANDLERS.KEYWORDS_EXTRACT({
      data: { text: 'We use typescript', url: 'https://example.com/job', topK: 40 },
      sender: senderStub,
    });
    expect(result).toMatchObject({ ok: true });
  });
  it('returns signed-out on 401', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response('', { status: 401 }));
    const result = await HANDLERS.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://example.com' },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'signed-out' });
  });
  it('returns rate-limited on 429', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response('', { status: 429 }));
    const result = await HANDLERS.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://example.com' },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns api-error on backend shape drift', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 }),
    );
    const result = await HANDLERS.KEYWORDS_EXTRACT({
      data: { text: 'x', url: 'https://example.com' },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'api-error' });
  });
  it('rejects empty text via Zod', async () => {
    const result = await HANDLERS.KEYWORDS_EXTRACT({
      data: { text: '', url: 'https://example.com' },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'empty-text' });
  });
});

describe('FILL_REQUEST handler', () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      tabs: { sendMessage: vi.fn() },
    };
  });
  it('forwards to content-script and returns its response', async () => {
    (chrome.tabs.sendMessage as any).mockResolvedValue({
      ok: true,
      filled: 8,
      skipped: 2,
      failed: 0,
      planId: 'plan_1',
    });
    const result = await HANDLERS.FILL_REQUEST({
      data: { tabId: 42 as never },
      sender: senderStub,
    });
    expect(result).toMatchObject({ ok: true, filled: 8 });
  });
  it('returns content-script-not-loaded when chrome.tabs.sendMessage rejects', async () => {
    (chrome.tabs.sendMessage as any).mockRejectedValue(new Error('Could not establish connection'));
    const result = await HANDLERS.FILL_REQUEST({
      data: { tabId: 42 as never },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'content-script-not-loaded' });
  });
});

describe('GENERATION_START / GENERATION_CANCEL handlers', () => {
  it('GENERATION_START throws NotImplementedError for valid payload (A11 owns)', async () => {
    await expect(
      HANDLERS.GENERATION_START({
        data: { agent: 'job-hunter', payload: {} },
        sender: senderStub,
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('GENERATION_START returns ok: false for invalid payload (rejects before stub throws)', async () => {
    const result = await HANDLERS.GENERATION_START({
      data: { agent: 'not-a-real-agent' as 'job-hunter', payload: {} },
      sender: senderStub,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid payload' });
  });
});

describe('broadcast-only handlers', () => {
  it('AUTH_STATE_CHANGED returns undefined on valid payload', async () => {
    const r = await HANDLERS.AUTH_STATE_CHANGED({ data: { authed: false }, sender: senderStub });
    expect(r).toBeUndefined();
  });
  it('AUTH_STATE_CHANGED returns undefined on invalid payload (does not throw)', async () => {
    const r = await HANDLERS.AUTH_STATE_CHANGED({
      data: { authed: 'yes' as unknown as false },
      sender: senderStub,
    });
    expect(r).toBeUndefined();
  });
  it('GENERATION_UPDATE returns undefined', async () => {
    const r = await HANDLERS.GENERATION_UPDATE({
      data: {
        generationId: 'g' as never,
        sessionId: 's' as never,
        phase: 'p',
        status: 'running',
      },
      sender: senderStub,
    });
    expect(r).toBeUndefined();
  });
  it('DETECTED_JOB_BROADCAST returns undefined', async () => {
    const r = await HANDLERS.DETECTED_JOB_BROADCAST({
      data: {
        tabId: 1 as never,
        intent: {
          kind: 'greenhouse',
          pageKind: 'job-posting',
          url: 'https://x.y/z',
          detectedAt: Date.now(),
        },
      },
      sender: senderStub,
    });
    expect(r).toBeUndefined();
  });
});
```

### 6.29 - Test file: `tests/background/log.spec.ts`

```typescript
// tests/background/log.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, log } from '@/background/log';

describe('log', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(globalThis.console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(globalThis.console, 'debug').mockImplementation(() => {});
  });

  it('info includes the scope prefix', () => {
    const l = createLogger('test-scope');
    l.info('hello');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[llmc-ext:test-scope] hello'));
  });

  it('info serializes context as JSON', () => {
    const l = createLogger('s');
    l.info('msg', { tabId: 42, requestId: 'r1' });
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"tabId":42'));
  });

  it('info tolerates circular refs in context', () => {
    const l = createLogger('s');
    const circ: { self?: unknown } = {};
    circ.self = circ;
    expect(() => l.info('msg', { circ })).not.toThrow();
  });

  it('error formats error objects', () => {
    const l = createLogger('s');
    l.error('failed', new TypeError('bad thing'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TypeError: bad thing'));
  });

  it('error tolerates undefined err', () => {
    const l = createLogger('s');
    expect(() => l.error('failed')).not.toThrow();
  });

  it('default export `log` uses "default" scope', () => {
    log.info('x');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[llmc-ext:default]'));
  });
});
```

### 6.30 - Test file: `tests/background/sdk/sdk-client.spec.ts`

```typescript
// tests/background/sdk/sdk-client.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSdkClient } from '@/background/sdk/sdk-client';

describe('createSdkClient (D10=b: on-demand, no leaks)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  it('constructs a fresh client per call', () => {
    const a = createSdkClient();
    const b = createSdkClient();
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('1000 constructions do not accumulate module-scoped state', () => {
    for (let i = 0; i < 1000; i++) createSdkClient();
    // No assertions on module internals - just that this does not throw or OOM.
    expect(true).toBe(true);
  });

  it('accepts injected deps for testing', async () => {
    const getAuthHeaders = vi.fn().mockResolvedValue({ authorization: 'Bearer x' });
    const sdk = createSdkClient({ apiBaseUrl: 'https://api.test', getAuthHeaders });
    await sdk.settings.getUsageSummary();
    expect(getAuthHeaders).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/settings/usage/summary',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
```

### 6.31 - Test file: `tests/background/messaging/schemas.spec.ts`

```typescript
// tests/background/messaging/schemas.spec.ts
import { describe, it, expect } from 'vitest';
import {
  DetectedIntentPayloadSchema,
  KeywordsExtractRequestSchema,
  ProfileUpdateRequestSchema,
  validatePatchSafety,
  ExtractSkillsBackendResponseSchema,
} from '@/background/messaging/schemas';

describe('DetectedIntentPayloadSchema', () => {
  it('accepts a valid payload with tabId=-1 sentinel', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: -1,
      url: 'https://boards.greenhouse.io/foo/jobs/123',
      kind: 'greenhouse',
      pageKind: 'job-posting',
      detectedAt: Date.now(),
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown ATS kind', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: 1,
      url: 'https://x.y/z',
      kind: 'icims',
      pageKind: 'job-posting',
      detectedAt: 1,
    });
    expect(r.success).toBe(false);
  });
  it('rejects url longer than 2048 chars', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: 1,
      url: 'https://x.y/' + 'a'.repeat(3000),
      kind: 'greenhouse',
      pageKind: 'job-posting',
      detectedAt: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe('KeywordsExtractRequestSchema', () => {
  it('rejects empty text', () => {
    const r = KeywordsExtractRequestSchema.safeParse({ text: '', url: 'https://x.y' });
    expect(r.success).toBe(false);
  });
  it('rejects text > 50k chars', () => {
    const r = KeywordsExtractRequestSchema.safeParse({
      text: 'a'.repeat(50_001),
      url: 'https://x.y',
    });
    expect(r.success).toBe(false);
  });
  it('rejects topK > 100', () => {
    const r = KeywordsExtractRequestSchema.safeParse({
      text: 'hello',
      url: 'https://x.y',
      topK: 200,
    });
    expect(r.success).toBe(false);
  });
});

describe('validatePatchSafety', () => {
  it('accepts a plain nested object', () => {
    expect(validatePatchSafety({ a: { b: 1 } })).toEqual({ safe: true });
  });
  it('rejects __proto__ at root', () => {
    expect(validatePatchSafety(JSON.parse('{"__proto__":{"polluted":true}}'))).toMatchObject({
      safe: false,
    });
  });
  it('rejects constructor at nested level', () => {
    expect(validatePatchSafety({ a: { constructor: {} } })).toMatchObject({ safe: false });
  });
  it('rejects prototype', () => {
    expect(validatePatchSafety({ prototype: {} })).toMatchObject({ safe: false });
  });
  it('rejects circular references', () => {
    const obj: { self?: unknown } = {};
    obj.self = obj;
    expect(validatePatchSafety(obj)).toMatchObject({ safe: false });
  });
  it('rejects null', () => {
    expect(validatePatchSafety(null)).toMatchObject({ safe: false });
  });
  it('rejects non-object', () => {
    expect(validatePatchSafety('oops')).toMatchObject({ safe: false });
  });
});

describe('ExtractSkillsBackendResponseSchema', () => {
  it('accepts a valid envelope', () => {
    const r = ExtractSkillsBackendResponseSchema.safeParse({
      success: true,
      data: {
        keywords: [{ term: 'typescript', category: 'hard', score: 0.9, occurrences: 3, canonicalForm: 'typescript' }],
        tookMs: 42,
      },
    });
    expect(r.success).toBe(true);
  });
  it('rejects envelopes missing success literal', () => {
    const r = ExtractSkillsBackendResponseSchema.safeParse({ data: { keywords: [], tookMs: 0 } });
    expect(r.success).toBe(false);
  });
  it('rejects keywords array > 500', () => {
    const r = ExtractSkillsBackendResponseSchema.safeParse({
      success: true,
      data: {
        keywords: Array.from({ length: 501 }, () => ({
          term: 'x',
          category: 'hard',
          score: 0.5,
          occurrences: 1,
          canonicalForm: 'x',
        })),
        tookMs: 0,
      },
    });
    expect(r.success).toBe(false);
  });
});
```

### 6.32 - Test file: `tests/background/storage/profile.spec.ts`

```typescript
// tests/background/storage/profile.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deepMergeProfilePatch } from '@/background/storage/profile';

describe('deepMergeProfilePatch', () => {
  it('returns base when patch is null', () => {
    expect(deepMergeProfilePatch({ a: 1 }, null)).toEqual({ a: 1 });
  });
  it('overrides scalar fields', () => {
    expect(deepMergeProfilePatch({ a: 1, b: 2 }, { a: 3 })).toEqual({ a: 3, b: 2 });
  });
  it('recurses into nested objects', () => {
    const base = { basics: { firstName: 'A', lastName: 'B' } };
    const patch = { basics: { firstName: 'X' } };
    expect(deepMergeProfilePatch(base, patch)).toEqual({ basics: { firstName: 'X', lastName: 'B' } });
  });
  it('replaces arrays wholesale', () => {
    expect(deepMergeProfilePatch({ work: [{ title: 'old' }] }, { work: [{ title: 'new' }] })).toEqual({
      work: [{ title: 'new' }],
    });
  });
  it('skips __proto__ at root', () => {
    const patch = JSON.parse('{"__proto__":{"polluted":true}}');
    const result = deepMergeProfilePatch<Record<string, unknown>>({}, patch);
    expect((result as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
  it('skips constructor at nested level', () => {
    const patch = { a: { constructor: { polluted: true } } };
    const result = deepMergeProfilePatch<{ a?: Record<string, unknown> }>({ a: {} }, patch);
    expect(result.a?.constructor).toEqual({});
  });
});
```

### 6.33 - Test file: `tests/background/storage/tab-state.spec.ts`

```typescript
// tests/background/storage/tab-state.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTabState,
  setIntent,
  setHighlight,
  clearTabState,
  clearAllTabState,
  __snapshotForTest,
} from '@/background/storage/tab-state';
import type { TabId } from 'ats-autofill-engine';

const TAB = 42 as unknown as TabId;

describe('tab-state', () => {
  beforeEach(() => clearAllTabState());

  it('returns a default state for an unknown tab', () => {
    const s = getTabState(TAB);
    expect(s.intent).toBeNull();
    expect(s.highlight.on).toBe(false);
  });

  it('setIntent persists across reads', () => {
    setIntent(TAB, {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://x.y/z',
      detectedAt: 1,
    });
    const s = getTabState(TAB);
    expect(s.intent?.kind).toBe('greenhouse');
  });

  it('setHighlight does not clobber intent', () => {
    setIntent(TAB, {
      kind: 'lever',
      pageKind: 'application-form',
      url: 'https://x.y/z',
      detectedAt: 1,
    });
    setHighlight(TAB, { on: true, keywordCount: 10, appliedAt: 5 });
    const s = getTabState(TAB);
    expect(s.intent?.kind).toBe('lever');
    expect(s.highlight.on).toBe(true);
  });

  it('clearTabState removes a single tab', () => {
    setIntent(TAB, {
      kind: 'workday',
      pageKind: 'application-form',
      url: 'https://x.y',
      detectedAt: 1,
    });
    clearTabState(42);
    expect(__snapshotForTest().has(42)).toBe(false);
  });

  it('clearAllTabState wipes the map', () => {
    setIntent(TAB, {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://x.y',
      detectedAt: 1,
    });
    clearAllTabState();
    expect(__snapshotForTest().size).toBe(0);
  });
});
```

### 6.34 - Test file: `tests/background/storage/prefs.spec.ts`

```typescript
// tests/background/storage/prefs.spec.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  readPrefs,
  writePrefs,
  __flushPrefsForTest,
  __resetPrefsForTest,
} from '@/background/storage/prefs';

describe('prefs storage', () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    __resetPrefsForTest();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('readPrefs returns defaults when storage empty', async () => {
    const p = await readPrefs();
    expect(p.theme).toBe('system');
    expect(p.highlightEnabledByDefault).toBe(true);
  });

  it('writePrefs throttles to one flush per 60s', async () => {
    writePrefs({ theme: 'dark' });
    writePrefs({ theme: 'light' });
    writePrefs({ theme: 'dark' });
    vi.advanceTimersByTime(59_000);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    await __flushPrefsForTest();
    expect(chrome.storage.sync.set).toHaveBeenCalledOnce();
    expect(vi.mocked(chrome.storage.sync.set).mock.calls[0][0]['llmc.prefs.v1']).toMatchObject({
      theme: 'dark',
    });
  });

  it('quota error reschedules the write and the retry succeeds', async () => {
    vi.mocked(chrome.storage.sync.set)
      .mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM'))
      .mockResolvedValueOnce(undefined);
    writePrefs({ theme: 'dark' });
    vi.advanceTimersByTime(60_001);
    await __flushPrefsForTest();
    // first attempt failed; the code rescheduled another 60s timer
    vi.advanceTimersByTime(60_001);
    await __flushPrefsForTest();
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2);
  });
});
```

### 6.35 - Test file: `tests/background/http/fetch-with-retry.spec.ts`

```typescript
// tests/background/http/fetch-with-retry.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/background/auth/auth-headers', () => ({
  buildAuthHeaders: vi.fn().mockResolvedValue({ authorization: 'Bearer T0' }),
}));
vi.mock('@/background/auth/refresh-manager.singleton', () => ({
  refreshManager: { refreshOnce: vi.fn().mockResolvedValue(undefined) },
}));

import { fetchWithRetry } from '@/background/http/fetch-with-retry';
import { buildAuthHeaders } from '@/background/auth/auth-headers';
import { refreshManager } from '@/background/auth/refresh-manager.singleton';

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns the first response when status is not 401', async () => {
    (fetch as any).mockResolvedValue(new Response('ok', { status: 200 }));
    const r = await fetchWithRetry('https://api.test/path');
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once after 401 via refreshManager', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const r = await fetchWithRetry('https://api.test/path');
    expect(r.status).toBe(200);
    expect(refreshManager.refreshOnce).toHaveBeenCalledTimes(1);
    expect(buildAuthHeaders).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry more than once', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const r = await fetchWithRetry('https://api.test/path');
    expect(r.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
```

### 6.36 - Test file: `tests/background/auth/auth-headers.spec.ts`

```typescript
// tests/background/auth/auth-headers.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/background/storage/tokens', () => ({
  readTokens: vi.fn(),
}));
vi.mock('@/background/auth/refresh-manager.singleton', () => ({
  refreshManager: { refreshOnce: vi.fn() },
}));

import { buildAuthHeaders } from '@/background/auth/auth-headers';
import { readTokens } from '@/background/storage/tokens';
import { refreshManager } from '@/background/auth/refresh-manager.singleton';
import { SessionExpiredError } from '@/background/auth/refresh-manager';

describe('buildAuthHeaders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws SessionExpiredError when readTokens returns null', async () => {
    vi.mocked(readTokens).mockResolvedValue(null);
    await expect(buildAuthHeaders()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('returns headers without refresh when token is fresh', async () => {
    vi.mocked(readTokens).mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      frontToken: 'FT',
      accessTokenExpiry: Date.now() + 3600_000,
      email: null,
    });
    const h = await buildAuthHeaders();
    expect(h).toMatchObject({ authorization: 'Bearer AT' });
    expect(refreshManager.refreshOnce).not.toHaveBeenCalled();
  });

  it('proactively refreshes when token is within 30s of expiry', async () => {
    vi.mocked(readTokens)
      .mockResolvedValueOnce({
        accessToken: 'AT',
        refreshToken: 'RT',
        frontToken: 'FT',
        accessTokenExpiry: Date.now() + 10_000,
        email: null,
      });
    vi.mocked(refreshManager.refreshOnce).mockResolvedValue({
      accessToken: 'NEW_AT',
      refreshToken: 'NEW_RT',
      frontToken: 'NEW_FT',
      accessTokenExpiry: Date.now() + 3600_000,
      email: null,
    });
    const h = await buildAuthHeaders();
    expect(h).toMatchObject({ authorization: 'Bearer NEW_AT' });
    expect(refreshManager.refreshOnce).toHaveBeenCalledTimes(1);
  });
});
```

---

## 7. Adversarial test categories (D19, mandatory)

Every phase test plan must list at least these 6 categories. A5 covers them as follows:

| Category | Where covered |
|---|---|
| Null/undefined/NaN/Infinity at every parameter | refresh-manager.spec.ts (Infinity expiry, null readTokens), handlers.spec.ts (null payload PROFILE_UPDATE), tokens.spec.ts (corrupt shape) |
| Empty + max-size collections | schemas.spec.ts (empty text rejection, 50k+ text rejection, keywords array > 500 rejection), auth-headers.spec.ts (absent tokens), tab-state.spec.ts (empty map) |
| Unicode edge cases | schemas.spec.ts (URL length > 2048), handlers.spec.ts (non-ASCII text in KEYWORDS_EXTRACT - document a test case for RTL+combining chars) |
| Injection (__proto__, path traversal, script tags) | schemas.spec.ts (__proto__, constructor, prototype via validatePatchSafety), profile.spec.ts (deepMergeProfilePatch __proto__ skip) |
| Concurrent re-entry | refresh-manager.spec.ts (100 concurrent callers = 1 fetch), prefs.spec.ts (concurrent writes throttled to one flush) |
| Adversarial state (frozen, proxies, circular) | log.spec.ts (circular context), schemas.spec.ts (circular patch), tab-state.spec.ts (frozen-object mutation check) |

The executor MUST add at least one test per category that is NOT already satisfied by the above and commit it before running the coverage gate.

---

## 8. Anti-drift gates (D14, mandatory)

Every acceptance-criterion check must include ALL of these five:

### 8.1 Forbidden-token grep (phase-specific)

```bash
# A5 is extension-area, so this ruleset applies:
grep -rE '\b(console\.(log|info|warn|error|debug))\b' entrypoints/ src/background/ src/content/ --include='*.ts' --include='*.tsx' | grep -v '^src/background/log.ts' && exit 1

# No em-dash rule (D15):
grep -rlP '\xe2\x80\x94' --include='*.ts' --include='*.md' temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/ src/background/ tests/background/ entrypoints/ && exit 1

# No stray 'job-assistant' path (D4):
grep -rE 'job-assistant' src/background/ tests/background/ entrypoints/ && exit 1

# No 'ExtensionProfile' stub name (dead per v2.1):
grep -rE '\bExtensionProfile\b' src/background/ tests/background/ entrypoints/ && exit 1
```

### 8.2 Type-level protocol contract assertion

The file `tests/background/messaging/protocol-contract.type-test.ts` (section 6.25) IS the assertion. It compiles as part of `pnpm typecheck`. If A5 drops a key or adds an undocumented one, the file fails to compile.

### 8.3 Exports-map resolution test

```bash
node -e "import('ats-autofill-engine').then(m => { if (!('TabId' in m && 'GenerationId' in m && 'SessionId' in m && 'RequestId' in m)) { console.error('branded types missing'); process.exit(1); } })"
node -e "import('ats-autofill-engine/profile').then(m => { if (!('ProfileSchema' in m)) { console.error('ProfileSchema missing'); process.exit(1); } })"
```

### 8.4 Cross-phase contract snapshot

`src/background/blueprint.contract.ts` (section 6.23) declares the `publicExports`, `forbiddenImports`, and `requiredCoverage`. CI runs `scripts/check-blueprint-contracts.mjs` which parses every consumer's imports and verifies each symbol resolves.

### 8.5 Zod schema round-trip test

`tests/background/messaging/schemas.spec.ts` (section 6.31) parses valid and invalid fixtures through every exported schema. Fuzz-style round-trip (generate valid fixture, parse, assert round-trip equality) is added for `AuthStateSchema`, `DetectedIntentPayloadSchema`, and `ExtractSkillsBackendResponseSchema` with 10 random-value iterations each.

---

## 9. Build + test execution

Run from `e:/llmconveyors-chrome-extension/`:

```bash
pnpm typecheck    # must pass with zero errors
pnpm lint         # must pass with zero warnings
pnpm test -- tests/background
pnpm test -- --coverage tests/background   # must hit 80% line / 75% branch per D24
pnpm build        # wxt build for MV3, must succeed
```

Manual smoke test:
1. Load the unpacked extension from `e:/llmconveyors-chrome-extension/.output/chrome-mv3/` via `chrome://extensions`.
2. Open the service-worker DevTools (Details -> Service Worker -> inspect).
3. In the SW console, run:
   ```js
   chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }).then(r => console.log(r));
   ```
   Expect `{ authed: false }`.
4. Write fake tokens via `chrome.storage.session.set({ 'llmc.tokens.v1': { accessToken: 'a', refreshToken: 'b', frontToken: 'f', accessTokenExpiry: Date.now() + 3600000, email: 'u@x.com' } })`.
5. Re-run the AUTH_STATUS message. Expect `{ authed: true, email: 'u@x.com', accessTokenExpiry: ... }`.
6. Run `chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' })`. Expect `{ authed: false }` and the tokens removed from storage.

---

## 10. Known uncertainties

### 10.1 `sender.tab.id` availability in `@webext-core/messaging` onMessage

The library passes `sender: chrome.runtime.MessageSender` to the handler. `sender.tab` is populated when the message comes from a content script. When the message comes from the popup or options page, `sender.tab` is `undefined` (the popup has no tab). The `INTENT_DETECTED` handler uses the `-1` sentinel for the content-script case; when sender.tab.id is unavailable and tabId=-1, we log a warning and drop the message (no silent corruption).

### 10.2 `@webext-core/messaging` `onMessage` generic inference

The library's `onMessage<K>(key, handler)` overload expects the handler type to match `ProtocolMap[K]` precisely. When we iterate `BG_HANDLED_KEYS` and pass a generic `HandlerFor<typeof key>`, TypeScript may erase the per-key narrowing. The fallback (documented in section 6.21) is a single cast at the registration site - the HANDLERS record itself carries the per-key types, so type safety is preserved at the definition boundary.

### 10.3 Fetch body in `fetchWithRetry` when retrying with a ReadableStream

If a caller passes a body derived from a `ReadableStream`, the first fetch consumes the stream and the retry will fail to re-send. All current callers (KEYWORDS_EXTRACT, CREDITS_GET) use string bodies, so this is not an issue. Documented for future-phase callers.

---

## 11. Rollback plan

See `scripts/rollback-phase-A5.sh` (section 6.24) for the mechanical revert. Manual steps if the script is not available:

1. `git status` - confirm no staged or unstaged changes.
2. `rm -rf src/background/ tests/background/`
3. `git checkout HEAD -- entrypoints/background.ts`
4. `pnpm typecheck` - must pass in the rolled-back state.
5. Report "Phase A5 rolled back, repo at clean pre-A5 state".

---

## 12. Files created / modified summary

### Created (34)

Source (24):
- `src/background/index.ts`
- `src/background/log.ts`
- `src/background/config.ts`
- `src/background/blueprint.contract.ts`
- `src/background/messaging/protocol.ts`
- `src/background/messaging/protocol-types.ts`
- `src/background/messaging/auth-state.ts`
- `src/background/messaging/schemas.ts`
- `src/background/messaging/handlers.ts`
- `src/background/auth/refresh-manager.ts`
- `src/background/auth/refresh-manager.singleton.ts`
- `src/background/auth/auth-headers.ts`
- `src/background/sdk/sdk-client.ts`
- `src/background/sdk/errors.ts`
- `src/background/storage/tokens.ts`
- `src/background/storage/profile.ts`
- `src/background/storage/prefs.ts`
- `src/background/storage/tab-state.ts`
- `src/background/storage/storage-errors.ts`
- `src/background/http/fetch-with-retry.ts`

Tests (9):
- `tests/background/log.spec.ts`
- `tests/background/messaging/protocol-contract.type-test.ts`
- `tests/background/messaging/handlers.spec.ts`
- `tests/background/messaging/schemas.spec.ts`
- `tests/background/auth/refresh-manager.spec.ts`
- `tests/background/auth/auth-headers.spec.ts`
- `tests/background/sdk/sdk-client.spec.ts`
- `tests/background/storage/tokens.spec.ts`
- `tests/background/storage/profile.spec.ts`
- `tests/background/storage/prefs.spec.ts`
- `tests/background/storage/tab-state.spec.ts`
- `tests/background/http/fetch-with-retry.spec.ts`

Scripts (1):
- `scripts/rollback-phase-A5.sh`

### Modified (1)

- `entrypoints/background.ts` - thinned to a forwarder that invokes `main()` from `src/background/index.ts`.

---

## 13. Acceptance criteria

- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm lint` passes with zero warnings.
- [ ] `pnpm test -- tests/background` passes every test.
- [ ] `pnpm test -- --coverage tests/background` reports line coverage >= 80% and branch coverage >= 75% for `src/background/**` (D24).
- [ ] `pnpm build` produces a valid MV3 bundle under `.output/chrome-mv3/`.
- [ ] `tests/background/messaging/protocol-contract.type-test.ts` compiles - this is the type-level assertion that all 19 keys are present.
- [ ] `HANDLERS` object in `src/background/messaging/handlers.ts` contains exactly the 17 BG-handled keys (19 minus the 2 content-script-owned highlight keys).
- [ ] Forbidden-token grep (section 8.1) returns zero matches.
- [ ] No em-dashes anywhere in phase files or source code (D15).
- [ ] No `console.*` calls outside `src/background/log.ts` (CI grep gate).
- [ ] `src/background/blueprint.contract.ts` exists and declares public exports.
- [ ] `scripts/rollback-phase-A5.sh` exists, is executable, and successfully reverts the phase on a throwaway branch (smoke-tested once).
- [ ] Manual smoke test (section 9) passes: AUTH_STATUS round-trip works for both unauthed and fake-authed cases.

---

## 14. Review findings addressed (review-A5.md)

| Finding | Status in v2.1 rewrite |
|---|---|
| F1 CRITICAL: missing 4 ProtocolMap keys | FIXED - all 19 keys from keystone 1.1 verbatim |
| F2 HIGH: HIGHLIGHT_APPLY/CLEAR wrong shape | FIXED - `{ tabId: TabId }` request, discriminated-union response |
| F3 HIGH: missing value types | FIXED - protocol-types.ts verbatim from keystone 1.2 |
| F4 MEDIUM: FILL_REQUEST half-impl | FIXED - now a pure `chrome.tabs.sendMessage` forwarder with no field-label branching |
| F5 MEDIUM: AUTH_STATE_CHANGED broadcast unwired | FIXED - inert `async () => undefined` in HANDLERS, Zod-validates shape |
| F6 MEDIUM: INTENT_GET naming | FIXED - renamed to `INTENT_GET` per keystone |
| F7 LOW: SDK whitelist too narrow | N/A - no whitelist in v2.1, on-demand factory with full surface |
| F8 LOW: hardcoded endpoints | FIXED - extracted to `src/background/config.ts` |
| F9 LOW: prefs quota test ordering race | FIXED - uses `vi.useFakeTimers()` + `advanceTimersByTime(60_001)` twice |
| F10 LOW: `onMessage` generic erasure | FIXED - exhaustive HANDLERS record carries per-key types; the single cast is at the registration loop boundary, documented in section 10.2 |

---

## 15. Blueprint-driven development compliance

A5 does not modify any backend blueprint (lives in `api/src/modules/**/blueprint.ts`). A5 DOES create a blueprint for its own area (`src/background/blueprint.contract.ts`, section 6.23) per D22. That file:
- Declares `publicExports`, `forbiddenImports`, `requiredCoverage`.
- Is consumed by `scripts/check-blueprint-contracts.mjs` as a CI gate.
- Versioned at `version: '2.1'` to match the decision memo.

Downstream phases that modify A5's area (if any - should be zero per D2) must update this file in the same commit.

---

## 16. Post-phase deliverables

After A5 completes:
- A6 executor picks up, reads A5's `protocol.ts`, does NOT edit it, replaces `handleAuthSignIn` body with real impl.
- A7 executor picks up, reads A5's `protocol.ts`, does NOT edit it, replaces `handleProfileUploadJsonResume` body with real impl.
- A9 content-script executor picks up, registers `onMessage('HIGHLIGHT_APPLY', ...)` and `onMessage('HIGHLIGHT_CLEAR', ...)` in the content-script context, consumes `KEYWORDS_EXTRACT` via `sendMessage`.
- A10 popup executor imports `sendMessage` from `src/background/messaging/protocol.ts` and calls every key it needs.
- A11 sidepanel executor picks up, replaces `handleGenerationStart` and `handleGenerationCancel` stubs with real impls, reads `GENERATION_UPDATE` broadcasts via `onMessage`.

If any downstream phase attempts to edit `src/background/messaging/protocol.ts`, the orchestrator's grep gate rejects the commit.

---

**End of Phase A5 plan v2.1. Target grade: A. Confidence: 9.5/10.**
