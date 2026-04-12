# Review — Phase A5 (background + messaging + SDK client factory)

**Reviewer**: Claude Opus 4.6
**Date**: 2026-04-11
**Plan file**: `phase_A5_background_and_messaging/plan.md` (2502 lines)
**Grade**: **C-** (protocol drift, several downstream contract violations)
**Confidence**: 9/10

---

## Findings

### F1 — CRITICAL: ProtocolMap is missing 4 of the 13 required message types

The phase directive explicitly enumerates 13 message types that MUST appear in `ProtocolMap`. A5 ships only 9 of them. The missing ones are:

| Required key | Present in A5? | Who needs it |
|---|---|---|
| `AUTH_SIGN_IN` | YES | A6 (real impl), A10 (popup) |
| `AUTH_SIGN_OUT` | YES | A6, A7 (options sign-out), A10 |
| `AUTH_STATUS` | YES | A6, A10 |
| **`AUTH_STATE_CHANGED`** | **NO** | A6 (broadcaster), A9 (auth-loss cleanup), A10 (useAuthState), A11 |
| `PROFILE_GET` | YES | A7, A10 |
| `PROFILE_UPDATE` | YES | A7 |
| **`PROFILE_UPLOAD_JSON_RESUME`** | **NO** | A7 (explicit addition) |
| **`KEYWORDS_EXTRACT`** | **NO** | A9 (background calls `/ats/extract-skills`) |
| `INTENT_DETECTED` | YES | A8 bootstrap, A9 intent, A10 reads, A11 |
| `FILL_REQUEST` | YES | A8 forward + content side, A10 popup |
| `HIGHLIGHT_APPLY` | YES (wrong shape — see F2) | A9, A10 |
| `HIGHLIGHT_CLEAR` | YES (wrong shape — see F2) | A9, A10 |
| **`GENERATION_UPDATE`** | **NO** | A11 side panel (hook subscribes to this exact string) |

The A5 plan does declare extra keys (`PREFS_GET`, `PREFS_UPDATE`, `SDK_CALL`, `INTENT_GET_FOR_TAB`) which is fine and desirable — but the missing four are load-bearing for downstream phases.

Downstream plans confirm A5's omission and paper over it with protocol-surgery tasks:
- **A6** plan §6 (task 2): `"Extend the ProtocolMap interface with ... AUTH_STATE_CHANGED"`.
- **A7** plan step 1: `"Add PROFILE_UPLOAD_JSON_RESUME to ProtocolMap"`.
- **A9** plan §6.2: `"Add KEYWORDS_EXTRACT, AUTH_STATE_CHANGED to ProtocolMap"` — A9 even duplicates the `AUTH_STATE_CHANGED` addition A6 supposedly already did, which smells like race condition between day-2 A6 and day-6 A9.
- **A11** plan step 6.3: `"Read the current file. If it already exports GENERATION_UPDATE, skip. Otherwise add."` — conditional because the phase author knew A5 was incomplete.

This is the exact "one owner of the protocol" principle A5 §5.6 promises: *"A complete ProtocolMap from A5 means A8/A9/A10 can wire content-side and popup-side senders without touching protocol.ts again. One owner of the protocol (bg/messaging/protocol.ts) reduces drift."* — and then A5 immediately violates it.

**Fix**: A5 must declare ALL 13 message keys from the directive up front, even as stubbed `NotImplementedError` handlers. Types must be defined too (see F3).

---

### F2 — HIGH: `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` payload shapes are wrong

A5 declares:
```
HIGHLIGHT_APPLY: (data: HighlightApplyRequest) => { applied: boolean };
// where HighlightApplyRequest = { tabId, keywords: readonly string[] }
```

A9 §6.2 explicitly flags this as wrong: *"A5 originally shipped HIGHLIGHT_APPLY: (data: { tabId, keywords }) => { applied } — the `keywords` field was wrong for online-only and the `{ applied: boolean }` response was too thin for popup UX."*

Decision memo §2.8 locks keyword extraction as **online-only via backend endpoint**. The popup never has keywords in hand; it sends `HIGHLIGHT_APPLY { tabId }` and the content script (via the bg-forwarded `KEYWORDS_EXTRACT` call) pulls them from the API. A5 inverted this by baking `keywords` into the request payload — treating the popup as if it already had the corpus.

**Fix**: A5 must ship `HIGHLIGHT_APPLY: (data: { tabId: number }) => HighlightApplyResponse` and `HIGHLIGHT_CLEAR: (data: { tabId: number }) => HighlightClearResponse` with proper discriminated-union response envelopes (ok/reason codes) so A9 can consume them without reshaping.

---

### F3 — HIGH: Value types for missing messages are absent

Because the four missing keys are not declared, the following supporting interfaces are also absent from `protocol.ts` and must be invented ad-hoc later:
- `AuthState` / `AuthStateChangedPayload`
- `KeywordsExtractRequest` / `KeywordsExtractResponse`
- `ProfileUploadResponse` (ok/errors discriminated union)
- `GenerationUpdateBroadcast`

The A7 plan shows it has to swap the A5 `ExtensionProfile` stub with `Profile` from `ats-autofill-engine` — meaning A5's profile type itself is a throwaway stub that creates churn in A7 §6 task 1 (three-step rewrite of `protocol.ts`). The A5 plan documents this at §6.3 ("this is a MINIMAL shape for A5/A6/A7. A7 may extend") but the "forward-compatible superset" claim doesn't hold because A7 actually **replaces** the type with the engine import.

**Fix**: Either (a) A5 imports `Profile` from `ats-autofill-engine/profile` directly (requires B2 to publish first, which the dep graph permits since B2 finishes Day 2 same as A5), or (b) A5 defines `ExtensionProfile` as a strict re-export alias the way A7 does rather than a stub shape.

---

### F4 — MEDIUM: `FILL_REQUEST` stub throws `NotImplementedError` for anything beyond 4 profile fields

The A5 `handleFillRequest` has hardcoded regex matches for `first`, `last`, `email`, `phone` and throws `NotImplementedError(`FILL_REQUEST:${req.fieldLabel}`)` for everything else. This is technically a stub with fallthrough (as the phase header says "full implementations" for fill), but:

- The FILL_REQUEST contract says A5 delivers the **forwarder** to the content script (§6.13 of A8 plan: *"A5 §6.5 FILL_REQUEST handler (A8 replaces the stub)"*). Yet A5 implements bg-side value resolution instead of forwarding to `chrome.tabs.sendMessage(tabId, 'FILL_REQUEST', ...)`.
- Architecture drift: bg should not be looking up profile fields for fill. The content script executes the fill pipeline against the form in its own DOM; bg is only a mediator.
- The A8 plan explicitly says A8 replaces the stub with a forwarder. Fine if A5 just ships the stub. But A5 ships something **worse than a stub**: a half-impl that happens to "work" for 4 fields and throws for everything else. This is the kind of code the `code-review-on-read` rule flags as "bandaid".

**Fix**: A5 `handleFillRequest` should be a plain `NotImplementedError('FILL_REQUEST')` throw matching the A6/A8 handoff pattern, OR a forwarder to `chrome.tabs.sendMessage`. The current middle-ground is the worst option.

---

### F5 — MEDIUM: `AUTH_STATE_CHANGED` broadcast pattern not wired in A5

Even though A6 is the phase that sends the first broadcast, A5 owns the protocol + `onMessage` registration. The broadcast pattern requires A5's background `index.ts` to register a noop bg-side handler so the type-exhaustiveness check in `HANDLERS: { [K in keyof ProtocolMap]: HandlerFor<K> }` passes. A9 §6.2 has to manually add `AUTH_STATE_CHANGED: async () => undefined` to the `HANDLERS` record in its own phase — which is protocol surgery A5 should have done.

---

### F6 — MEDIUM: `INTENT_GET` vs `INTENT_GET_FOR_TAB` naming inconsistency

A10 references `sendMessage('INTENT_GET', ...)` in several places; A5 exposes `INTENT_GET_FOR_TAB`. One of these is wrong. Per A5's naming (more descriptive), A10 has the bug — but A5 should double-check that A10's references are the canonical name A10 will use, because "one owner of the protocol" means A5 dictates the name and A10 has to follow.

**Fix**: Either rename A5's `INTENT_GET_FOR_TAB` to `INTENT_GET` (shorter, matches A10 references), or flag to A10 reviewer that A10 must use `INTENT_GET_FOR_TAB`. The A5 plan should pick one and stick to it.

---

### F7 — LOW: `SDK_CALL` whitelist is too narrow for downstream phases

The whitelist ships with only 6 methods:
```
health.check, health.live, health.ready,
settings.getProfile, settings.getUsageSummary,
agents.getManifest
```

A11's side panel requires a generation-triggering SDK call (something like `agents.generate` or `sessions.create`). A10's popup requires `settings.getUsageSummary` (covered) and credit-balance reads. If A5 locks the whitelist this tight, every downstream phase has to edit `handlers.ts` to add methods — which is fine in principle but the plan should acknowledge the churn (or export the whitelist as an "extend-only" structure).

**Fix**: Either (a) document in the A5 plan that `SDK_METHOD_WHITELIST` is expected to grow in A10/A11, or (b) widen the whitelist now to cover the known-needed methods.

---

### F8 — LOW: `REFRESH_ENDPOINT` hardcoded to `https://api.llmconveyors.com`

Same criticism as `API_BASE_URL` — both are hardcoded with a TODO-ish "future phase may read from chrome.storage.managed". Since A5 is the canonical auth layer, these constants should live in a `src/background/config.ts` module so A6's test harness (which mocks the bridge endpoint) can inject a test URL without monkey-patching. The current design forces test mocks via `vi.spyOn(globalThis, 'fetch')` which is more brittle.

---

### F9 — LOW: `tests/background/prefs.spec.ts` quota-error test has ordering race

The test at lines 2102-2116 simulates a quota error on first `.set()` call, expects reschedule, but then uses `__flushPrefsForTest` which synchronously flushes — but the reschedule is a 60-second `setTimeout`. The test mock would need to intercept the 60-second retry to verify recovery. The test as written only asserts `.resolves.not.toThrow()` on the flush that fails, which technically passes but doesn't exercise the retry path at all. Weak test per the `testing.md` rule.

**Fix**: Use `vi.useFakeTimers()` and advance by 60s+ to verify the retry actually fires.

---

### F10 — LOW: `@webext-core/messaging` `onMessage` return-type erasure in `registerHandlers`

Line 1546:
```typescript
onMessage(key, handler as Parameters<typeof onMessage>[1]);
```

This `as` cast drops the per-key type safety that the rest of the protocol carefully preserves. It's a known limitation of mapping over `keyof ProtocolMap` at runtime, but the plan should note that the alternative (one `onMessage('AUTH_STATUS', handler)` line per key) is strictly more type-safe and only adds 12 lines. For a 2500-line plan file, 12 more lines for explicit registration is cheap insurance.

**Fix**: Replace the loop with explicit per-key registrations. Minor, but the `any`/cast escape hatches rule applies.

---

## Contract checks (vs. downstream A6-A11)

| Downstream phase | References this key | A5 declares it? | Notes |
|---|---|---|---|
| A6 | `AUTH_SIGN_IN` | yes | — |
| A6 | `AUTH_SIGN_OUT` | yes | — |
| A6 | `AUTH_STATUS` | yes | — |
| A6 | `AUTH_STATE_CHANGED` | **NO** | A6 must add to protocol.ts — drift |
| A7 | `PROFILE_GET` | yes | A7 replaces shape (ExtensionProfile → Profile) |
| A7 | `PROFILE_UPDATE` | yes | A7 replaces shape |
| A7 | `PROFILE_UPLOAD_JSON_RESUME` | **NO** | A7 must add — drift |
| A7 | `AUTH_SIGN_OUT` | yes | sign-out from options button |
| A8 | `FILL_REQUEST` | yes (wrong shape) | A8 replaces stub with forwarder; shape ok |
| A8 | `INTENT_DETECTED` | yes | — |
| A8 | `FILL_RESULT_BROADCAST` | **NO** | A8 plan adds; borderline — could be A8's responsibility |
| A9 | `KEYWORDS_EXTRACT` | **NO** | A9 must add — drift |
| A9 | `HIGHLIGHT_APPLY` | yes (wrong shape) | A9 must reshape — drift |
| A9 | `HIGHLIGHT_CLEAR` | yes (wrong shape) | A9 must reshape — drift |
| A9 | `AUTH_STATE_CHANGED` | **NO** | A9 duplicates A6's addition — drift |
| A9 | `INTENT_DETECTED` | yes | — |
| A10 | `AUTH_SIGN_IN` | yes | — |
| A10 | `AUTH_STATE_CHANGED` | **NO** | read via `onBroadcast` — drift |
| A10 | `AUTH_STATUS` | yes | — |
| A10 | `FILL_REQUEST` | yes | — |
| A10 | `HIGHLIGHT_APPLY` | yes (wrong shape) | A10 sends `{ tabId }` (no keywords) |
| A10 | `HIGHLIGHT_CLEAR` | yes (wrong shape) | same |
| A10 | `HIGHLIGHT_STATUS` | **NO** | A10 references — drift |
| A10 | `INTENT_GET` | no (A5 has `INTENT_GET_FOR_TAB`) | naming mismatch |
| A11 | `GENERATION_UPDATE` | **NO** | A11 conditionally adds — drift |
| A11 | `GENERATION_START` | **NO** | A11 adds |
| A11 | `GENERATION_CANCEL` | **NO** | A11 adds |
| A11 | `DETECTED_JOB_BROADCAST` | **NO** | A11 adds |
| A11 | `FILL_REQUEST` | yes | — |

**Summary**: A5 is missing **7 distinct message keys** that downstream phases need (AUTH_STATE_CHANGED, PROFILE_UPLOAD_JSON_RESUME, KEYWORDS_EXTRACT, GENERATION_UPDATE, GENERATION_START, GENERATION_CANCEL, HIGHLIGHT_STATUS, plus DETECTED_JOB_BROADCAST and FILL_RESULT_BROADCAST which are arguably scope-of-A8/A11). Of the 13 specifically enumerated in the phase directive, **4 are missing** (AUTH_STATE_CHANGED, PROFILE_UPLOAD_JSON_RESUME, KEYWORDS_EXTRACT, GENERATION_UPDATE).

---

## Stub hits

| Location | Stub type | Acceptable? |
|---|---|---|
| `handleAuthSignIn` | `throw NotImplementedError('AUTH_SIGN_IN')` | YES — documented, A6 replaces |
| `handleFillRequest` | fall-through `throw NotImplementedError(...)` after 4 hardcoded field matches | NO — half-impl masking a forwarder pattern; see F4 |
| `handleHighlightApply` | returns `{ applied: true }` with only a log line | YES as a stub, but wrong shape (F2) |
| `handleHighlightClear` | same | same |
| `AUTH_STATE_CHANGED` handler | missing entirely | NO — should exist as inert `async () => undefined` |
| `KEYWORDS_EXTRACT` handler | missing entirely | NO — should exist even if A9 rewrites |
| `PROFILE_UPLOAD_JSON_RESUME` handler | missing | NO |
| `GENERATION_UPDATE` handler | missing | NO |

---

## Invariant checks

| Invariant | Status | Notes |
|---|---|---|
| ProtocolMap declares all 13 message types | **FAIL** | 4 missing (F1) |
| SDK client factory + refresh manager exists | PASS | §6.5 + §6.10 |
| Single in-flight promise dedup for 401 retry | PASS | §6.5 `inflight` + tests |
| On-demand SDK client lifecycle (D10=b) | PASS | `createSdkClient()` documented per-op |
| SCREAMING_SNAKE_CASE keys | PASS | — |
| Storage split: session for tokens, local for profile, sync for prefs | PASS | §6.6-§6.9 |
| `storage.session` default access level (not TRUSTED_AND_UNTRUSTED) | PASS | §5.2 |
| Hex architecture: core/ zero DOM imports | N/A | this phase is adapter-layer |
| NestJS `Logger` (project-wide rule) | N/A | extension repo, not api repo |
| `console.log` forbidden | PASS | uses `bgLogger` wrapper over `console.*` (acceptable wrapper) |
| Decision memo §2.7 auth flow refresh headers | PASS | `rid: session`, `fdi-version: 3.0`, `st-auth-mode: header` |
| Decision memo §2.8 refresh dedup rationale | PASS | documented + tested |
| Decision memo §2.9 `@webext-core/messaging` choice | PASS | — |
| Decision memo §2.9 fetch-based `/ats/extract-skills` (not SDK) | **FAIL** | A5 never defines `KEYWORDS_EXTRACT` handler; A9 has to add the fetch call to bg, which should be A5's job since bg owns SDK + fetch |

---

## Fixes (ordered by blast radius)

### Must-fix before execution (blockers)

1. **Add 4 missing ProtocolMap keys** plus supporting value types:
   - `AUTH_STATE_CHANGED: (data: { authed: boolean; email?: string; accessTokenExpiry?: number }) => void`
   - `PROFILE_UPLOAD_JSON_RESUME: (data: { raw: unknown }) => ProfileUploadResponse` with `ProfileUploadResponse = { ok: true; profile: Profile } | { ok: false; errors: Array<{ path: string; message: string }> }`
   - `KEYWORDS_EXTRACT: (data: KeywordsExtractRequest) => KeywordsExtractResponse` with full request/response types per decision memo §2.9
   - `GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void` with a schema covering `{ sessionId, generationId, phase, status, progress }`

2. **Reshape HIGHLIGHT_APPLY / HIGHLIGHT_CLEAR** to drop `keywords` from the request and use discriminated-union responses `{ ok: true; applied: number } | { ok: false; reason: 'signed-out' | 'no-jd' | 'api-error' | ... }`.

3. **Add inert bg-side handlers** for broadcast-only keys (`AUTH_STATE_CHANGED`, `GENERATION_UPDATE`) as `async () => undefined` so the `HANDLERS` type-exhaustiveness check passes.

4. **Ship KEYWORDS_EXTRACT handler skeleton** — A5 owns the SDK/fetch infrastructure. Even if A9 later replaces the impl, A5 should ship a working bg-side `fetch('/api/v1/ats/extract-skills')` path using the refresh manager's auth layer. This is exactly the "one owner" principle.

### Should-fix

5. **Replace `handleFillRequest` half-impl** with either (a) a plain `NotImplementedError` throw, or (b) a proper `chrome.tabs.sendMessage` forwarder. The current hardcoded 4-field shim is a bandaid per `code-quality.md`.

6. **Decide INTENT_GET vs INTENT_GET_FOR_TAB**. Align with A10. Recommend shortening to `INTENT_GET`.

7. **Import `Profile` from `ats-autofill-engine/profile`** instead of shipping `ExtensionProfile` as a minimal stub. Removes the A7 rewrite churn.

8. **Extract `API_BASE_URL` and `REFRESH_ENDPOINT`** to `src/background/config.ts` so tests can inject.

### Nice-to-have

9. **Widen SDK whitelist** to cover A10/A11 needs (or document the growth).

10. **Replace dynamic `registerHandlers` loop** with 13 explicit `onMessage(KEY, handler)` lines to preserve per-key type safety.

11. **Fix prefs quota-retry test** with `vi.useFakeTimers()`.

---

## Grade

**C-**

Rationale: The refresh-manager design is solid, storage layering is well-reasoned, tests cover the dedup path thoroughly, and the decision-memo alignment on §2.7/§2.8/§2.9 is accurate. BUT the single most important deliverable of this phase — the ProtocolMap as the canonical contract for all downstream extension phases — is materially incomplete. Four of the thirteen required message types are missing, and two more (`HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR`) have wrong shapes. The downstream plans (A6, A7, A9, A11) are all forced to do protocol surgery in their own phases, which contradicts A5's own §5.6 "one owner of the protocol" principle and creates merge-conflict risk during parallel day-2/day-6 execution.

This phase cannot be executed as written without breaking the parallel-day schedule. The missing keys MUST be added before A6/A7/A9/A11 start, otherwise multiple phases will simultaneously try to edit `protocol.ts`.

**Confidence**: 9/10. The 1-point hedge is on whether the phase author intended `INTENT_GET` vs `INTENT_GET_FOR_TAB` to be renamed late in A10 (a cross-phase reviewer would know; A5-only review cannot).

---

**End of review.**
