# Review — Phase A2 (Backend bridge endpoint)

- Plan file: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A2_backend_bridge_endpoint/plan.md`
- Reviewer: Opus 4.6 (1M)
- Date: 2026-04-11
- Scope: single phase plan, contract neighbors A4 + A6, decision memo §2.7

---

## 1. Findings by severity

### Blockers
None.

### Major
None.

### Minor
- **M1. `buildMockReq` typing mismatch with controller signature.** `buildMockReq` returns `{ headers: Record<string, string> }`, but `req.headers` in Express is `IncomingHttpHeaders` (values may be `string | string[] | undefined`). The plan mitigates via `@ts-expect-error` on each call site, which is acceptable but brittle. Consider casting the mock to `Partial<Request>` inside each test invocation rather than suppressing per call. Non-blocking — the tests will still run.
- **M2. Test case 1 (happy path) does not assert the exact `frontToken` value returned.** It uses `expect.any(String)`. Given that the happy path also asserts `accessTokenExpiry: 1234567890000`, the `frontToken` is reconstructable and could be pinned for a stronger assertion. Non-blocking — other assertions already cover the decode path indirectly.
- **M3. Rollback step 6 uses Unix `rm` but the project is Windows.** Bash is the expected shell per env (forward slashes OK, Unix-style commands OK). Not a blocker — `rm` exists under git-bash / WSL, which matches the environment note. Flag only for clarity.
- **M4. Required reading line 17 says "Section 2.7 ... lines 172-201"**, but in the current decision memo v2 Section 2.7 is at lines 142-152 (line numbers shifted after v2 restructure). Low impact — the executor will still find the section by title. Non-blocking.

### Nit
- **N1. Line 510 (test description) uses the word "stub" in the phrase "Session.getSession resolves with a stub". This is a jest mock, not a placeholder stub — correct usage but worth noting that the stub-hunt grep will flag it. Accepted as false positive.**
- **N2. Controller snippet omits the explicit `private readonly decodeFrontTokenExpiry` vs top-level function decision**. Step 13 says "private method on the controller, or a local function above the class" — leaves choice to executor. Minor ambiguity but harmless; both patterns compile.

---

## 2. Contract checks (A2 ↔ A4 ↔ A6)

### Token field shape (decision memo §2.7 line 147)
Memo invariant: `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` — verbatim.

| Phase | File reference | Field 1 | Field 2 | Field 3 | Field 4 |
|---|---|---|---|---|---|
| A2 (schema) | plan.md:144-150 | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| A2 (controller return) | plan.md:232 | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| A4 (parser) | plan.md:231-234 | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| A4 (fragment map) | plan.md:148-151 | `at: accessToken` | `rt: refreshToken` | `ft: frontToken` | `exp: accessTokenExpiry` |
| A6 (StoredTokens interface) | plan.md:290-293 | `accessToken` | `refreshToken` | `frontToken` | `accessTokenExpiry` |
| A6 (fragment parser) | plan.md:388-391 | at→accessToken | rt→refreshToken | ft→frontToken | exp→accessTokenExpiry |

**Verdict: byte-for-byte aligned across A2/A4/A6.** No drift.

### Endpoint path
- Decision memo: `POST /api/v1/auth/extension-token-exchange`
- A2 plan (step-level, blueprint, acceptance, scrubber): all match.
- A4: `'/api/v1/auth/extension-token-exchange'` relative path.
- A6: URL template `https://llmconveyors.com/api/v1/auth/extension-token-exchange`.

**Verdict: aligned.**

### Response envelope handling
- A2 returns raw `{ accessToken, ... }`. `ResponseTransformInterceptor` (global) wraps it as `{ success, data: { ... }, requestId, timestamp }`. A2 step 15 correctly notes "Do NOT wrap it yourself."
- A4 step: `const data = raw?.data ?? raw;` — tolerates both wrapped and unwrapped. Safe.

**Verdict: contract is defensive on A4's side, which is correct given the global interceptor behavior.**

### Fragment format
- A4 builds `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` with `URLSearchParams`.
- A6 parses the same four keys in the same order, validates with strict schema.

**Verdict: aligned.**

---

## 3. Stub hits

Grep hits for: `// TODO`, `// FIXME`, `// ... rest`, `// executor will`, `placeholder`, `stub`, comments ending with `...`.

| Hit | Line | Verdict |
|---|---|---|
| "a stub that returns tenant 'public'" | 510 | FALSE POSITIVE — describes jest mock, not an unfinished stub |
| `// createNewSession would normally set headers on res — simulate it:` | 329 | FALSE POSITIVE — test comment, fully implemented below |

No `// TODO`, `// FIXME`, `// ... rest`, or ellipsis-terminated comments. No placeholder or "executor will" language. **Clean.**

---

## 4. Decision memo invariant checks

| Invariant | Memo line | A2 plan location | Match |
|---|---|---|---|
| Response shape `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` verbatim | 147 | plan.md:144-155, 232 | YES |
| Path `POST /api/v1/auth/extension-token-exchange` | 144, 146 | plan.md:43, 450, 489 | YES |
| Mutates `req.headers['st-auth-mode']='header'` | 147 | plan.md:80, 172, 360 | YES — inlined as `(req.headers as Record<string, string>)['st-auth-mode'] = 'header'` |
| Calls `Session.createNewSession(...)` | 147 | plan.md:82-84, 186-194 | YES — full 7-arg signature inlined with `tenantId`, `recipeUserId`, `{}, {}, {}` |
| Reads response headers (st-access-token, st-refresh-token, front-token) | 147 | plan.md:86, 204-206 | YES |
| Scrubs headers before returning | 147 | plan.md:91-100, 221-228 | YES — explicit 5-item list including `anti-csrf` and `access-control-expose-headers` |
| Returns JSON body | 147 | plan.md:103, 232 | YES |

### Header-mode mutation subtlety
The plan **does** inline the subtle bit. Line 80 and code snippet line 172 both show the exact mutation with the exact rationale: "SuperTokens reads `req.headers['st-auth-mode']` inside `createNewSession`." The plan also references investigation 53 lines 27-31 for provenance. **This is the load-bearing detail of A2 and it is correctly inlined, not deferred to "see investigation."**

### Controller body completeness
The "Code snippets" section (lines 158-252) inlines the entire load-bearing sequence:
1. api-key rejection
2. header mutation
3. `Session.getSession` re-resolution with try/catch
4. `Session.createNewSession` with try/catch
5. header extraction with null-guard
6. `frontToken` decode with fallback
7. header scrubbing
8. return body

The `decodeFrontTokenExpiry` helper is also inlined with the exact base64url→JSON→`ate` parse logic. **No "executor fills in" language anywhere in the handler body.**

---

## 5. Completeness checks

| Requirement | Present | Notes |
|---|---|---|
| Metadata block | YES | lines 3-11 |
| Required reading | YES | 6 memo/investigation files + 11 codebase files, each with specific line ranges |
| Files to create (with absolute paths) | YES | lines 42-44 |
| Files to modify (with absolute paths) | YES | lines 48-50 |
| Numbered steps (15-40 target) | YES | 25 steps, lines 56-123 |
| Inlined SuperTokens mutation code | YES | Section "Code snippets" lines 158-252 |
| Testable acceptance criteria | YES | 13 checkboxes lines 489-502 |
| Test file paths | YES | `api/src/modules/auth/__tests__/auth.controller.spec.ts` |
| Test case enumeration | YES | 6 named cases lines 510-520 |
| Rollback plan | YES | 8 steps lines 528-535 |
| Out-of-scope | YES | 11 explicit prohibitions lines 541-551 |
| Exact commands | YES | Compliance gates block lines 557-569 |

**All sections present and substantive.**

---

## 6. Dependencies and fixtures

- A2 has zero phase dependencies (config.json:48). Correct.
- A2 blocks A6 (plan metadata line 9). Consistent with config.json:52 (`"A6": ["A5", "A2", "A4"]`).
- A4 depends on A2 (config.json:50). Consistent.
- Parallel-safe with A1 and B1 (Day 1 schedule). Correct.

**No fixtures required** — unit tests use pure jest mocks of `supertokens-node/recipe/session` and hand-rolled request/response mocks. Plan correctly avoids real Express objects.

**No new npm dependencies.** Verified by step 548: `supertokens-node`, `zod`, `@nestjs/common`, `@nestjs/swagger`, `express` all already present.

---

## 7. Blueprint drift risk

Plan step 18-19 updates `api/src/modules/auth/blueprint.ts` with:
- New endpoint entry under `endpoints` array (exact shape provided lines 447-485)
- New module-level invariant `bridge-does-not-invalidate-caller-session`

This aligns with project rule `blueprint-driven-development.md` — blueprint updated in same phase as code. **Good.**

One note: the invariants block (step 19) assumes the existing `invariants` array is discoverable by scanning the file. A line-number reference would be tighter, but acceptable.

---

## 8. Security posture

Adversarial-reading checklist applied:
- **Token leakage via headers**: handled — 5-header scrub list including `access-control-expose-headers` (defense in depth against the browser observing a `Access-Control-Expose-Headers: front-token` leak).
- **Anti-CSRF**: handled — included in scrub list even though currently `NONE`, future-proofed.
- **Api-key caller minting extension tokens**: handled — hard 403 in first line, unit test asserts zero `createNewSession` invocations.
- **Error message leak**: handled — internal `supertokens-node` errors logged but never echoed. Test 3 explicitly asserts `'core unreachable'` does NOT appear in the thrown exception.
- **Session invalidation side effect**: handled — blueprint invariant locks in "never revokes caller session."
- **Frontend token exposure via body**: acceptable — this is the intentional exfil channel; body is same-origin fetch over HTTPS, and the A4 page immediately consumes the tokens into a URL fragment that is never logged by Chrome identity.
- **Replay of `accessTokenExpiry`**: A6 validates `exp` is > now and < now + 24h (A6 plan lines 255-262). A2 does not need to double-validate.

**No security gaps in A2's scope.**

---

## 9. Recommended fixes

None required for acceptance. Optional polish:

1. **(nice-to-have)** Fix required-reading line number range in step 1 (lines 172-201 → 142-152 per v2 memo). Cosmetic.
2. **(nice-to-have)** Tighten `buildMockReq` typing to `Partial<Request>` instead of `Record<string, string>` to reduce `@ts-expect-error` usage.
3. **(nice-to-have)** Pin the exact `frontToken` base64url string in happy-path test 1 instead of `expect.any(String)`.
4. **(optional)** Add a 7th test case: "happy path also sets `req.headers['st-auth-mode']='header'` BEFORE `createNewSession` is called" (via call-order assertion on the mock). Current test 1 asserts it was set but not the ordering relative to the `createNewSession` call. Very minor — the code structure makes the ordering obvious.

None of these are blockers.

---

## 10. Grade

**A**

A2 is the cleanest phase plan in the batch: every load-bearing line of the SuperTokens header-mode ritual is inlined with provenance (memo line + investigation line references), every field name matches A4 and A6 byte-for-byte, every subtle trap (api-key caller loop, access-control-expose-headers leak, error-message echoing, session invalidation) has an explicit mitigation with a corresponding test, and the out-of-scope list pre-empts six common executor mistakes (main.ts CORS, ScopeGuard, ApiKeyAuditInterceptor, Bearer JWT parser, chrome-extension:// origin, docs mdx).

Downgrade from A+ only because of the minor line-number drift in required reading (M4) and a couple of non-critical test tightenings. Nothing blocks execution. Executor can pick this up and run it with no further clarification.

## 11. Confidence

**9.5 / 10**

High confidence that A2 as written will produce a working bridge endpoint that A4 can POST to and A6 can parse from. The one half-point deducted is the usual risk that a live `supertokens-node@latest` SDK might have introduced a signature change for `Session.createNewSession` since investigation 53 was written — but even that is covered by the unit test catching the throw and the compliance-gate typecheck catching a signature mismatch at CI time.
