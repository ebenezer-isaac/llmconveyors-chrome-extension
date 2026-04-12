# Review — Phase A6 (Extension Auth Flow)

**Reviewer**: Claude Opus 4.6
**Date**: 2026-04-11
**Plan file**: `phase_A6_auth_flow/plan.md`
**Overall grade**: **C+**

---

## Executive summary

A6 is conceptually strong: it decomposes the flow into parser/driver/status/broadcaster/errors, writes sharp adversarial tests, enforces host allow-listing and expiry sanity clamps, and defines a clean typed-error taxonomy. The fragment parser in particular (§6.4) is the best single piece of code in the phase.

However, A6 has **multiple hard contract breaks against A5** (which IS written) and one structural invariant violation against the decision memo. These are not stylistic; they will cause the phase to not compile against A5's shipped surface. The bulk of the work is correct, but the executor will waste a full hour reconciling working-directory, module paths, protocol signatures, and the AuthState shape before a single test runs.

**Recommendation**: return to planner for C1-C6 fixes before execution. Grade held at C+ rather than lower because the investigative rigor (adversarial tests, sanity clamps, typed errors, chromiumapp host regex) is genuinely good — the fix set is mechanical once identified.

---

## A. Correctness against invariants (spec conformance)

| Invariant | Status | Evidence |
|---|---|---|
| Uses `chrome.identity.launchWebAuthFlow` → opens `/auth/extension-signin?redirect=<getRedirectURL()>` | PASS | §6.6 lines 513-524 |
| Parses fragment `#at=&rt=&ft=&exp=` from resolved URL | PASS | §6.4 fragment parser |
| Stores in `chrome.storage.session` | PASS | Delegated via A5 helper (§6.6, §10.1) |
| Token shape `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` | **FAIL — see C1** | A6 uses `access`/`refresh`; A2 backend returns `accessToken`/`refreshToken` |
| Refresh on 401 with retry once | PARTIAL | Correctly deferred to A5 (§1 "Not in scope"). A6 explicitly disclaims the retry; acceptable. |
| Single in-flight refresh promise dedup | NOT IN SCOPE | Correctly deferred to A5 |
| SDK client via `getAuthHeaders` reads from storage | NOT IN SCOPE | A6 only writes tokens; reads are A5/A8+. Correct deferral. |

**Verdict: one hard fail (C1). Everything else in scope is handled.**

---

## B. Contract vs A2 (backend bridge endpoint)

A2 plan line 103 explicitly locks the response body:
```
{ accessToken, refreshToken, frontToken, accessTokenExpiry }
```
A4 plan line 32 confirms extension-signin page receives the same four fields from `/api/v1/auth/extension-token-exchange`.

A6's **fragment parser** correctly extracts the four fields and its `ParsedFragment` interface uses the correct names:
```ts
interface ParsedFragment {
  accessToken: string;
  refreshToken: string;
  frontToken: string;
  accessTokenExpiry: number;
}
```
**PASS** at the fragment-parser layer.

But then in `sign-in.ts` (§6.6 lines 541-546) A6 calls:
```ts
await setTokens({
  access: parsed.accessToken,      // <-- field rename
  refresh: parsed.refreshToken,    // <-- field rename
  frontToken: parsed.frontToken,
  accessTokenExpiry: parsed.accessTokenExpiry,
});
```

A6 is silently renaming `accessToken` → `access` and `refreshToken` → `refresh` when handing off to the storage layer. This matches A5's `StoredTokens` shape (§C below), but **the plan directive** says the token shape is `{ accessToken, refreshToken, frontToken, accessTokenExpiry }`. Either the directive is wrong or A5 is wrong; the plan does not acknowledge the divergence.

**Action**: A6 must (a) document the intentional rename from wire format to storage format, or (b) normalize on `accessToken`/`refreshToken` end-to-end. Option (b) is cleaner but forces an A5 patch. Option (a) is less invasive but must land as a `// NOTE:` block in `sign-in.ts` so A10/popup authors don't get confused.

---

## C. Contract vs A5 (background + messaging)

A5 IS fully committed at plan time (despite A6's §6.1 saying "IF IT EXISTS"). A6 must bind to A5's actual exports. The following divergences will break typecheck on day one:

### C1. Storage function names — HARD FAIL

A6 imports (§6.6, §6.7, §6.8):
```ts
import { setTokens, clearTokens, getTokens } from '@/background/storage/tokens';
```

A5 exports (A5 plan §6.6 lines 718, 749, 765):
```ts
export async function readTokens(): Promise<StoredTokens | null>
export async function writeTokens(tokens: StoredTokens): Promise<void>
export async function clearTokens(): Promise<void>
```

**`getTokens`/`setTokens` DO NOT EXIST in A5.** Only `clearTokens` matches. Typecheck will fail.

**Action**: rename A6 call sites to `readTokens`/`writeTokens`/`clearTokens`, OR append an alias export block in A6's §10 (but §10 is a fallback-only section — do not rely on it).

### C2. Working directory — HARD FAIL

A6 §4 declares target directory **`e:/job-assistant/`** and §0 again repeats `e:/job-assistant/`. A5 §4 also declares **`e:/job-assistant`**. BUT the `config.json` for plan 100 pins:
```json
"chromeExtension": { "path": "e:/llmconveyors-chrome-extension" }
```
And the decision memo §2.1 locks the GitHub repo name as `ebenezer-isaac/llmconveyors-chrome-extension`.

**Both A5 and A6 ship with the wrong working directory.** This is a plan-wide defect rather than an A6-specific one, but A6 inherits it. File at planner level for the whole 100 plan.

**Action**: replace every `e:/job-assistant` reference in A6 (and A5) with `e:/llmconveyors-chrome-extension` before execution.

### C3. `StoredTokens` field names — PASS BUT UNDOCUMENTED

A5 defines (A5 plan §6.6 line 698-703):
```ts
export interface StoredTokens {
  readonly access: string;
  readonly refresh: string;
  readonly frontToken: string;
  readonly accessTokenExpiry: number;
}
```

A6 §10.1 stub happens to use the same field names. GOOD — they agree. But the invariant stated by the reviewer directive (`accessToken, refreshToken, frontToken, accessTokenExpiry`) does NOT agree with this. The plan memo §2.7 step 4 and §2.7 step 5 use the wire format `{ accessToken, ... }` and fragment keys `at/rt/ft/exp`, but never explicitly lock the storage field names.

So A5 made a design choice (short field names in storage) that A6 inherits silently. This is consistent but un-documented. The A6 plan should call out in §6.3 or §6.4 that "wire format uses `accessToken`; storage format uses `access`; the transform happens in `sign-in.ts` between parse and persist."

### C4. `ProtocolMap` signature shape — HARD FAIL

A5 declares the protocol entries as function-type signatures (A5 plan line 368-370):
```ts
AUTH_SIGN_IN: (data: void) => AuthStatus;
AUTH_SIGN_OUT: (data: void) => void;
AUTH_STATUS: (data: void) => AuthStatus;
```

A6 §6.10 redefines them as method signatures returning Promises:
```ts
AUTH_SIGN_IN(): Promise<AuthState>;
AUTH_SIGN_OUT(): Promise<AuthState>;
AUTH_STATUS(): Promise<AuthState>;
AUTH_STATE_CHANGED(state: AuthState): void;
```

Two different-enough shapes that typecheck will break:
1. A5 uses `(data: void) => R` (arrow-function in interface); A6 uses `method()` shorthand. `@webext-core/messaging` accepts both but you cannot mix them in the same interface without merging conflicts.
2. A5's return type is `AuthStatus` (sync). A6's return type is `Promise<AuthState>`. A5's `HandlerFor<K>` wraps the return in a `Promise` at the handler layer, so A5's effective wire type is `Promise<AuthStatus>`. A6 short-circuits the wrapping by declaring `Promise<AuthState>` directly.
3. Most critically: **A5 names the type `AuthStatus`; A6 names it `AuthState`.** Different names, different definitions (§C5 below). A6 shadows the type.

**Action**: A6 must EXTEND A5's `ProtocolMap` in place, not replace it. Use A5's existing function-type signature form. Use A5's `AuthStatus` type OR explicitly rename A5's type to `AuthState` with a migration note in A5. Currently A6 §6.10 says "extend the existing A5 ProtocolMap" but the code example effectively overwrites it.

### C5. `AuthState` vs `AuthStatus` type — HARD FAIL

A5 plan §6.3 line 247-251:
```ts
export interface AuthStatus {
  readonly authed: boolean;
  readonly email?: string;
  readonly accessTokenExpiry?: number;
}
```

A6 §6.3 line 214-216:
```ts
export type AuthState =
  | { authed: true; email: string | null; accessTokenExpiry: number }
  | { authed: false };
```

Two incompatible shapes:
- **Name**: `AuthStatus` (A5) vs `AuthState` (A6)
- **Shape**: single interface with optional fields (A5) vs discriminated union (A6)
- **Email nullability**: `email?: string` (undefined-or-string, A5) vs `email: string | null` (null-or-string, A6)

A6's discriminated union is strictly better for type narrowing — the popup can branch on `state.authed` and TypeScript narrows `email` and `accessTokenExpiry` to non-undefined. A5's interface forces defensive `?? null` checks everywhere.

A6's design is the right call, BUT A6 must:
1. Declare itself as authoritative for the Auth type (rename A5's `AuthStatus` to `AuthState`).
2. Update A5's `handleAuthStatus` return type in the same commit.
3. Update A5's tests that use `AuthStatus`.

Or, alternatively, back down and use A5's `AuthStatus` shape. The plan must pick one; it currently ships two.

**Action**: the plan must include an explicit A5 patch list. Since A5 is already written and this is a post-hoc A6 fix, the patch section belongs in A6's §5.2 "Modified files" table, and it is currently missing.

### C6. `@webext-core/messaging` import source — HARD FAIL

A6 §6.5 (broadcaster.ts) and §6.11 (background.ts):
```ts
import { sendMessage } from '@webext-core/messaging';
import { onMessage } from '@webext-core/messaging';
```

A5 §6.3 line 404:
```ts
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```
A5 mandates (line 400-403): "Every caller imports `sendMessage` / `onMessage` from this module. Callers MUST NOT construct their own `defineExtensionMessaging` — that would create a separate message namespace and drop messages silently."

A6 is importing directly from `@webext-core/messaging` instead of from `@/background/messaging/protocol`. **This will silently drop every auth broadcast** because `@webext-core/messaging`'s top-level `sendMessage` is a different namespace from A5's typed instance. This is the exact anti-pattern A5 warned against.

**Action**: change every `from '@webext-core/messaging'` in A6 to `from '@/background/messaging/protocol'` (or the equivalent path after C2 working-dir fix). This is mentioned in A5's line 401-403; A6 missed it.

---

## D. Contract vs A4 (frontend extension-signin page)

| Check | Result |
|---|---|
| Fragment format regex: `#at=…&rt=…&ft=…&exp=…` | **PASS** — A6's parser reads exactly these four keys |
| Uses `URLSearchParams` for symmetric decoding | **PASS** — A6 §6.4 line 340 matches A4 §6.4 line 500 |
| Both sides encodeURIComponent via URLSearchParams | **PASS** — A4 line 500-506 uses `URLSearchParams({...})` |
| Fragment is on the chromiumapp.org URL | **PASS** — A4 calls `window.location.replace(targetRedirect + fragment)` where `targetRedirect` is the chromiumapp.org URL |
| `exp` is `String(accessTokenExpiry)` (ms since epoch) | **PASS** — A4 line 504 matches A6 line 364 `Number(expRaw)` |

One **subtle concern** worth flagging: `URLSearchParams.toString()` encodes space as `+` per application/x-www-form-urlencoded. A6's token-shape regex `/^[\w.=\-+/]+$/` includes `+` as allowed. If a SuperTokens token ever contains a space (it won't — base64url tokens never do), A4 would emit `+` and A6 would decode it back to space, which the regex would reject (no space in character class). This is not a bug today but is a latent assumption worth a one-line comment in §6.4.

Also flag: A6 §6.4 line 408 `/^[\w.=\-+/]+$/` allows `=` (padding) and `/` and `+` (standard base64, NOT base64url). SuperTokens emits base64url for frontToken but could emit opaque base64 for access/refresh. Character class is sound.

---

## E. Contract vs A5 messaging protocol — cross-check

Required messages per directive: `AUTH_SIGN_IN`, `AUTH_STATUS`, `AUTH_STATE_CHANGED`.

| Message | A5 status | A6 status |
|---|---|---|
| `AUTH_SIGN_IN` | Stub `NotImplementedError` | Real implementation |
| `AUTH_SIGN_OUT` | Real implementation (clears tokens + tab state) | **REIMPLEMENTS** — §6.7 |
| `AUTH_STATUS` | Real implementation | Reimplementation |
| `AUTH_STATE_CHANGED` | **NOT IN A5** | New in A6 |

**Problem**: A5 already ships a `handleAuthSignOut` that clears tokens AND clears per-tab state (A5 plan line 1293 `await clearAllTabState()`). A6 §6.7's `signOut()` only clears tokens. If A6 takes over the message handler, **per-tab state leaks** — A5's tab state stays populated after sign-out, breaking the "fresh device" invariant.

**Action**: A6 must either (a) preserve A5's `clearAllTabState()` call in its `signOut()` wrapper, or (b) keep A5's handler and only add the broadcast step. Option (a) requires an import from A5's tab-state module which A6 does not mention.

`AUTH_STATE_CHANGED` is a legitimate new broadcast — A6 adds it, A5 does not have it. A6's §6.10 correctly appends it to `ProtocolMap`. GOOD.

---

## F. Adversarial / edge cases

| Category | Status | Notes |
|---|---|---|
| Fragment parser: 22 unit tests | STRONG | Covers missing fields, bad host, past expiry, far-future expiry, short/long tokens, null bytes, whitespace, non-https. Exemplary. |
| Host regex `[a-p]{32}` | STRONG | Matches Chrome extension ID encoding. Centralized. Comment cites investigation 34 §c. |
| Expiry sanity clamp `MAX_FUTURE_EXPIRY_MS = 24h` | STRONG | Mirrored in both parser and state derivation. Duplication noted in §6.4 line 419. |
| User cancel path | STRONG | §6.6 lines 584-594 classify error messages into `AuthCancelledError`/`AuthNetworkError`/`AuthProviderError`. Pattern list is from investigation 34 §h. |
| Service-worker suspension mid-flow | STRONG | §6.6 line 600 notes `launchWebAuthFlow` is cross-wake resilient; A6's single-await design has no in-memory state to lose. Correct. |
| Broadcast fire-and-forget | PARTIAL | §6.5 `isNoReceiverError` regex swallows "no receiver" rejections. But §7.2 test "still broadcasts even if broadcast rejects" expects `signIn` to RETHROW when broadcast fails with a non-no-receiver error. The test contradicts the documented contract: §6.5 line 449 says "a broadcast failure must not unwind the transaction" but the broadcaster rethrows via `console.warn` then returns (not throws). The sign-in test mocks `broadcastAuthStateChanged` to reject directly — bypassing the broadcaster's internal swallow. The test is testing the mock, not the module. **Refactor: §7.2 "still broadcasts even if broadcast rejects" is testing nothing meaningful.** Replace with: mock `sendMessage` to reject with non-no-receiver error, verify `signIn` resolves with correct state and `console.warn` was called. |
| `setTokens` quota-exceeded path | COVERED | §7.2 "throws AuthStorageError when setTokens fails" |
| Malformed fragment from `#error=` attack | COVERED | §6.4 lines 343-347 detect `error` in query OR fragment |
| Idempotent sign-out | COVERED | §6.7 note + §7.3 test "calling twice still returns UNAUTHENTICATED" |
| `instanceof` broken over messaging bridge | FLAGGED | §11 R6 correctly notes that A10 must use `err.name` not `instanceof` because `@webext-core/messaging` strips error prototypes during structured clone. Good awareness. |
| Race: two concurrent `AUTH_SIGN_IN` calls | **MISSING** | If the popup fires `AUTH_SIGN_IN` twice (user double-clicks), two `launchWebAuthFlow` calls race. Only one Chrome popup shows at a time per investigation 34 §j (gotcha 3: "only one flow per extension at a time — second call rejects with `OAuth2 request failed`"). A6 does not document this or test it. The parent refresh-manager dedup belongs to A5 but the **sign-in dedup** is A6's responsibility. |
| Tampered `#error=` query param is rejected as attack (not user message) | FLAGGED CORRECTLY | §6.6 line 599 explicitly says "we should treat it as an attack" — and the implementation throws `AuthMalformedResponseError` rather than `AuthProviderError` per §6.4 line 344. |
| Clock skew (client clock wrong by more than 24h) | IMPLICITLY BROKEN | If user's local clock is off by more than 24h vs. the bridge's `Date.now()` (rare but possible), the sanity clamp fires and rejects the fresh token. A6 treats this as "tampering." False-positive risk is low but nonzero; flag for future cross-check against `Date.now()` drift. |

---

## Missing / incorrect items to fix

1. **C1** (HARD): rename `setTokens`/`getTokens` call sites to `writeTokens`/`readTokens` to match A5's actual exports.
2. **C2** (HARD): change every `e:/job-assistant` to `e:/llmconveyors-chrome-extension`.
3. **C4** (HARD): rewrite §6.10 to **extend A5's existing ProtocolMap file in place**, using A5's function-type signature convention, not method shorthand. Do not introduce a conflicting name.
4. **C5** (HARD): pick one auth state type. Recommended: rename A5's `AuthStatus` → `AuthState`, adopt A6's discriminated-union shape, patch A5's `handleAuthStatus` in the same commit. Add an explicit "A5 modification list" subsection to A6 §5.2.
5. **C6** (HARD): change every `from '@webext-core/messaging'` import in A6 to `from '@/background/messaging/protocol'`. The whole silently-dropped-broadcasts bug is preventable with one search-and-replace.
6. **E (signOut regression)**: preserve A5's `clearAllTabState()` call in A6's `signOut()`. Either import it from A5 or extend §6.7 to document the wrap.
7. **F (broadcaster test)**: rewrite §7.2 "still broadcasts even if broadcast rejects" — it currently tests a mock, not real behavior.
8. **F (concurrent sign-in)**: add a sign-in mutex — either a module-level in-flight promise in `sign-in.ts` or a guard in `background.ts`'s `onMessage('AUTH_SIGN_IN', ...)` handler. Add one unit test that verifies two parallel `signIn()` calls share a single `launchWebAuthFlow` invocation.
9. **§6.1 prerequisite check**: drop the "IF A5 EXISTS" branching. A5 is committed; A6 depends on A5, not the reverse. Section 10 fallback should be deleted or kept only as a rollback document, not an execution branch.
10. **§3 reading list**: point the executor at A5's plan file explicitly and delete the "IF IT EXISTS" qualifier.
11. **§6.6 `BRIDGE_URL`**: `'https://llmconveyors.com/en/auth/extension-signin'` hardcodes the `/en/` locale. §11 R3 notes this is a local-dev concern but leaves it unresolved. Wire an env var (`import.meta.env.WXT_BRIDGE_URL` with fallback to the prod URL) in this phase, not later — it is 3 lines of code.
12. **Barrel export (§6.9)**: re-exports `MAX_FUTURE_EXPIRY_MS` but not `UNAUTHENTICATED` constant, and not the `StoredTokens` type. Popup/sidepanel consumers will need both.

---

## Strengths worth preserving through revisions

- **Fragment parser (§6.4)** is the most defensive piece of code in the whole plan — host regex, protocol check, fragment/query error detection, sanity clamps, character-class allowlist, length bounds. Do not weaken during the fix pass.
- **Typed error hierarchy (§6.2)** is strictly better than error codes. Keep all five classes.
- **Test coverage**: 22 parser tests + 9 sign-in tests + 3 sign-out tests + 4 status tests + 3 broadcaster tests = 41 unit tests. Genuinely exhaustive for a phase this size.
- **Adversarial framing**: explicitly treats `#error=` as attack rather than user message. Correct threat model.
- **Manual verification script (§9)**: mechanical, exact commands, grep gates for `chrome.identity` ad-hoc usage. Good hygiene.
- **Documented deferral of refresh to A5**: clean separation of concerns. A6 writes, A5 reads/refreshes.

---

## Grade justification

Breakdown:
- **Spec conformance (A)**: 6/10 — one wire-format vs storage-format rename is unacknowledged.
- **Contract vs A2 (B)**: 9/10 — parser correctly consumes the wire format.
- **Contract vs A5 (C)**: 3/10 — six divergences, at least three of which are compile failures.
- **Contract vs A4 (D)**: 9/10 — fragment format matches byte-for-byte.
- **Protocol vs A5 (E)**: 4/10 — sign-out tab-state regression is a real bug.
- **Adversarial depth (F)**: 8/10 — strong parser tests, missing concurrent sign-in mutex.

Weighted: ~**C+**. The underlying engineering is good, but the phase cannot be executed as written without ~1 hour of mechanical reconciliation against A5. A planner pass to fix C1/C2/C4/C5/C6 lifts the grade to a solid A-.

---

**Grade**: **C+**
