# Review — Phase A9 (Content script: highlight + intent)

**Reviewer**: Claude Opus 4.6
**Date**: 2026-04-11
**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md`
**Grade**: **F (BLOCKING — contract violation with B6)**

---

## TL;DR

A9 fabricates an engine API that does not exist. It imports a `HighlightRange` type from `ats-autofill-engine/dom`, calls `applyHighlights(root, ranges)` with a range array, and treats `walkTextNodes` as returning `{ concatenated, segments }`. None of those exist in B6. B6 explicitly deletes `HighlightRange`, exposes `applyHighlights(root: Element, keywords: readonly string[]): () => void`, and ships `walkTextNodes(root): Generator<Text>`. B6 even calls out drift of this exact shape as requiring an "A9 rewrite pass." This plan must be rewritten before execution.

A secondary issue: the plan describes decision-memo `§2.8` correctly in prose (line 161 of memo: "calls engine's `applyHighlights(document.body, keywords)`") but then contradicts itself in the implementation section by building a ranges array.

Grep gates otherwise pass (`skill-taxonomy` appears only in a prose citation to the memo, not as an import; no raw `HighlightRange` in shipping code is possible anyway because the plan is the problem). Message-name contracts vs A5 are additively correct. A3 response shape is consumed correctly. Protocol reshape is defensible. Tests are thorough in structure but inherit the bogus `HighlightRange` contract and will not compile against the real engine.

---

## Critical issues (MUST fix before any execution)

### C1. HighlightRange does not exist in `ats-autofill-engine/dom` — HARD BLOCKER

**Severity**: CRITICAL — plan cannot compile against B6 output.

**Evidence**:
- B6 plan §"Scope declaration" (line 28): *"Core `HighlightRange` type or core highlight planner (do NOT exist in v2)."*
- B6 plan acceptance (line 65): `grep -rn 'HighlightRange' src/adapters/dom/` returns zero matches (type does not exist).
- B6 plan step 8 (line 135): `applyHighlights(root: Element, keywords: readonly string[]): () => void` — the public entry.
- B6 plan line 919: *"A9's consumer contract is verified: A9 calls `applyHighlights(document.body, keywordStrings: string[])`. Any remaining drift (e.g. passing a `HighlightRange[]`) is flagged to the architect for an A9 rewrite pass."*

**A9 violations**:
- Line 101: `"types HighlightRange, JobDescriptionResult, PageIntent, TextWalk"` — lists `HighlightRange` and `TextWalk` as B6 exports. B6 exports neither.
- Line 137: *"the `applyHighlights(root, ranges, options?)` signature, the `HighlightRange` shape"* — wrong signature, wrong type.
- Line 138: *"`walkTextNodes(root): { segments, concatenated }`"* — B6 ships `Generator<Text>`, not a record.
- Lines 722-803 (§6.5 range-builder.ts): the entire file builds `HighlightRange[]` from a regex match. It imports `HighlightRange` from `ats-autofill-engine/dom` (line 727) — this import will fail at typecheck.
- Line 1013: `applyHighlights(document.body, ranges)` — wrong argument type. The real engine expects `readonly string[]`.
- Test file §9.2 (lines 1344-1440): asserts offsets like `{ start: 10, end: 16, keyword: 'Python' }` and tests `walkTextNodes.concatenated` shape — both fictional.
- Test file §9.3 (line 1452): `walkTextNodes: vi.fn(() => ({ concatenated: 'python here', segments: [] }))` — mocks the wrong shape.

**Fix** (required):
1. Delete `entrypoints/ats.content/highlight/range-builder.ts` entirely (~140 LoC + its 200 LoC test file).
2. In `apply-handler.ts`, replace the 6-step orchestration at lines 1011-1035 with:
   ```typescript
   const terms = extractResponse.keywords.map((k) => k.term);
   let cleanup: () => void;
   try {
     cleanup = applyHighlights(document.body, terms);
   } catch (err) {
     logger.warn(`applyHighlights threw: ${(err as Error).message}`);
     return { ok: false, reason: 'api-error' };
   }
   ```
3. Drop `rangeCount` from the `HighlightApplyResponse` success envelope, or compute it post-hoc via `document.querySelectorAll('mark[data-ats-autofill="true"]').length` after the cleanup is captured. The plan already treats it as a UI-only metric — removing it is simpler.
4. Remove `HighlightRange`, `walkTextNodes` (as a consumer), and `TextWalk` imports from every A9 file and every test file.
5. Remove the prose in §0.1, §3, §5.2, §6.5 that describes the range-builder layer.
6. Delete §9.2 entirely; rewrite §9.3 mocks to drop `walkTextNodes` and just have `applyHighlights: vi.fn(() => () => {})`.
7. Adjust the §4 scope table: new files drop from 7 to 6, LoC estimate falls by ~340 production + ~200 test.

**Blast radius**: the whole highlight subdirectory shrinks. This is not a small edit — it is a structural rewrite of the core contribution of this phase. Estimated -450 LoC once done.

### C2. Self-contradicting narrative between §0.1 and §6.5

**Severity**: HIGH — plan author knew the contract and still wrote the wrong code.

The A9 plan correctly quotes decision memo line 161 in its §3 reading list: *"content → bg → `/ats/extract-skills` → bg → content → `applyHighlights`"* (plan line 121). And the B6 §"Does NOT depend on" section (B6 line 13) says explicitly: *"The renderer receives a plain `readonly string[]` and finds occurrences itself."*

Yet §0.1 confidence paragraph (plan line 25) asserts the engine's DOM surface (`applyHighlights`, `walkTextNodes`...) is "locked in B6" and §6.5 (plan line 812) says *"there is no `planHighlights` in the engine anymore — decision memo §2.5 dropped it. The engine's `./dom` entry exposes `walkTextNodes` and `applyHighlights`, and the range calculation is the integration layer's job."*

This is wrong on two counts:
1. `walkTextNodes` is exposed by B6 but as a `Generator<Text>` (see B6 line 356), not a structure with `concatenated` / `segments`. A9 invented that shape.
2. "range calculation is the integration layer's job" — no. B6 renderer step 6-9 (B6 lines 141-151) does range computation internally via `findTextMatches` + `splitNodeAtMatches`. The consumer passes keyword strings; the engine walks the DOM and computes matches itself.

**Fix**: rewrite §0.1 to drop references to `HighlightRange` and `TextWalk`. Rewrite §6.5 to either delete the section or explain that no range-builder exists.

### C3. B6 plan explicitly flags A9 drift and refuses to patch from inside B6

B6 plan line 919: *"Any remaining drift (e.g. passing a `HighlightRange[]`) is flagged to the architect for an A9 rewrite pass — do not patch A9 from inside B6."*

This is the exact situation. B6 is locked to the correct contract; A9 is the file that needs the rewrite. Executor cannot paper over this by adding a `HighlightRange` type in B6.

---

## High-severity issues

### H1. Modifying A5's `DetectedIntent.kind` with `pageKind` is a cross-phase refactor outside A9's stated scope

**Severity**: HIGH.

Plan §6.4 lines 690-700 adds an optional `pageKind?: 'job-posting' | 'application-form'` field to A5's `DetectedIntent` interface in `src/background/messaging/protocol.ts`. The scope declaration in §0.2 lists only 3 modified files and characterizes them as additive (`+45 LoC` to `protocol.ts`). Adding `pageKind` is additive but the justification — "A5's pre-refactor vendor-keyed enum vs B6's post-refactor category-keyed enum" — reveals that the A5 `DetectedIntent` was designed before B6 was redesigned, and A9 is absorbing that drift silently.

This is reasonable, but it should be an explicit corrective plan line item against A5, not a self-contradicting mid-plan patch ("**Correction**: the first draft above bails on..." — plan line 688). The "Correction" language makes it look like an internal edit rather than a deliberate A5 schema evolution.

**Fix**: move the `pageKind` extension into a named subsection §6.2.b ("A5 DetectedIntent extension — required by B6 category split") with a one-line callout in §0.2 scope.

### H2. `tabId: -1` sentinel reliance without A5 handler verification

**Severity**: HIGH.

Plan §6.4 lines 665-670: content script sends `INTENT_DETECTED` with `tabId: -1` and relies on bg handler reading `sender.tab.id` instead. Plan §14 line 1702 doubles down: *"The `tabId: -1` sentinel in `intent.ts`'s `INTENT_DETECTED` payload is load-bearing — A5's bg handler reads `sender.tab.id` when the payload tabId is the sentinel."*

But A5 plan line 2420 says: *"The `INTENT_DETECTED` handler takes `tabId` as part of its data payload instead of reading it from the sender metadata."* A5 line 2425 says the sender-based fallback "is left for A8 to add when the need is confirmed." So A5 as-shipped does NOT read `sender.tab.id` by default. A8 was supposed to add that overload if needed.

If A8 doesn't add the sender-based fallback, A9's `-1` sentinel will write bogus state into the bg intent map (`intentByTabId.set(-1, ...)`). The popup reading `INTENT_GET_FOR_TAB(currentTabId)` will never find the intent because it's keyed on `-1`, not the real tab id.

**Fix**: add an explicit prerequisite check in §2.1: *"Verify A5 (or A8) bg handler `handleIntentDetected` reads `sender.tab.id` when payload `tabId < 0`. If not, add that overload in A9 as a cross-phase fix."* Then either add the bg fallback to the `handlers.ts` diff in §6.3 or STOP and report a corrective plan for A5/A8.

### H3. `applyHighlights` throws path returns `api-error`, conflating engine bugs with server errors

**Severity**: MEDIUM-HIGH.

Plan §6.8 lines 1032-1035: if `applyHighlights` throws, the handler returns `{ ok: false, reason: 'api-error' }`. But `api-error` is a server-side reason literal. An engine exception is a client-side bug, not an API problem.

The `HighlightApplyResponse.reason` union (plan line 239) has: `'signed-out' | 'not-a-job-posting' | 'no-jd-on-page' | 'api-error' | 'rate-limited' | 'network-error' | 'no-tab'`. None of these cleanly describe "engine crash." Popup UX will display "API error. Try again." when the real failure is in `ats-autofill-engine/dom`.

**Fix**: add a `'render-error'` literal to the union and map engine throws to it, or (cheaper) treat engine throws as fatal and let them propagate — they indicate an unrecoverable engine bug that an API-error tooltip only masks.

### H4. The `inflight` re-entrancy guard has a subtle starvation bug

**Severity**: MEDIUM-HIGH.

Plan §6.8 lines 935-1057: the `inflight` module-scoped promise is awaited at the top of each call, then *reassigned* inside the handler. Between the `await inflight` line and `inflight = (async () => ...)()`, a third rapid-fire caller could see the still-fresh (now resolved) promise and also await it, and then race on the assignment — two outer handlers both kick off a new inner IIFE. The JS event loop usually saves you, but the pattern is not serial and the comment claims it is.

Also, the `try { await inflight; } catch {}` silently swallows prior failures, then the new apply proceeds regardless. Fine for the happy path, but if the prior apply threw mid-render, the page DOM is in a partially-wrapped state (some marks inserted, cleanup not captured) and the new apply calls `clearActive()` first — which is a no-op because `state.cleanup === null` on failure. The partial marks from the prior crash remain.

**Fix**: use a proper mutex pattern — single `pending: Promise<void> | null` that is awaited at the top, then replaced BEFORE the inner work starts (not after). And before starting, call `removeAllHighlights(document.body)` as a belt-and-braces cleanup instead of relying on `clearActive`'s state.

### H5. No validation that `extractResponse.keywords` is non-empty before calling `applyHighlights`

**Severity**: MEDIUM.

Plan §6.8 lines 1011-1026: if `terms` is empty (backend returned 0 keywords), the plan still calls `buildHighlightRanges(document.body, terms)` which returns `{ rangeCount: 0, ranges: [] }`, then falls into the `if (rangeCount === 0)` branch. But with the C1 fix, the code becomes `applyHighlights(document.body, [])` — and per B6 line 139 that returns a no-op cleanup. Still safe, but the success envelope `{ ok: true, keywordCount: 0, rangeCount: 0 }` conveys "backend succeeded but no matches" which the popup may render as "highlighted 0 keywords" — confusing.

**Fix** (minor): map `keywordCount === 0` to `{ ok: false, reason: 'no-keywords-found' }` as a new literal, or document in §8.1 that `keywordCount: 0` is a valid success and the popup should render a distinct message.

---

## Medium-severity issues

### M1. Lines 1679: grep gate excludes test files for `any`, weakening coverage

The compliance grep for `: any` adds a parenthetical "excluding test files where `any` is sometimes pragmatic for mocks." This is lazy. Test files use `as any` in the vi.mock sections (e.g. plan line 1277: `(detectPageIntent as any).mockReturnValue(...)`). Even in tests, `any` should be `ReturnType<typeof vi.fn>` or a typed `Mock<Parameters<...>, ReturnType<...>>`. The code-quality rule (`.claude/rules/code-quality.md` §"No Bandaids" + `.claude/rules/testing.md` §"Anti-Patterns") bans `any` in tests.

**Fix**: delete the parenthetical. Tests must type their mocks.

### M2. §5.2 claims A5 shipped `HIGHLIGHT_APPLY` with a `keywords` field; A5 stub tests confirm this

A9 §0.1 line 29: *"The v1 A5 shape assumed the popup or background would supply keywords directly (pre-refactor from offline matching)."* A5 line 2338 confirms this: the A5 test calls `HANDLERS.HIGHLIGHT_APPLY({ tabId: 1, keywords: ['rust', 'typescript'] })`. So A9's claim that the reshape is a "low-risk additive change scoped to this phase" is overstated — the typecheck will break the A5 test file. Plan §6.10 line 1603 acknowledges this and extends the test. Good, but §5 should be louder about this being a breaking change to the A5 ProtocolMap, not additive.

**Fix**: rename §5 header from "Messaging protocol extensions (critical)" to "Messaging protocol reshape + extensions" and call out the breaking removal of the `keywords` field explicitly.

### M3. `handleKeywordsExtract` builds an 8-element keyword object with deep narrowing; pluck just the needed fields

Plan §6.3 lines 556-566 maps each returned keyword to an object with 5 fields identical to the source. This is defensive copying for the type system, but it duplicates the shape. If A3's schema evolves (adds a field), this mapper silently drops it. Fine for POC but should be commented.

**Fix** (minor): add a one-line comment `// Project to our local type shape; drops unknown fields defensively.` above line 558.

### M4. `getApiBaseUrl()` assumed to exist in A1

Plan §14 line 1703: *"The backend `/ats/extract-skills` base URL must come from `getApiBaseUrl()` in `src/background/config.ts` (shipped by A1)."*

A1's scope (see config.json + decision memo §3.1 line 216) is "WXT scaffold" — it is not clear A1 ships a runtime config module. If A1 does not ship `getApiBaseUrl`, A9 either needs to add it (cross-phase scope creep) or hardcode a placeholder. The plan acknowledges this on line 1703 but handles it with *"add it as a one-line addition to A1's config file"* — which silently expands A9's blast radius by touching A1 files.

**Fix**: change §0.2 scope declaration to list `src/background/config.ts` as a conditionally modified file (4th file). Or require A5 to own this helper (A5 already talks to the API via SDK).

### M5. Test coverage is structurally thorough but inherits C1's broken contract

All three test files (§9.1, §9.2, §9.3) assert against a `HighlightRange`-based API. Once C1 is fixed, §9.2 should be deleted entirely and §9.3's `walkTextNodes` mock should be dropped. The author's testing instinct is right (coverage across happy path, signed-out, rate-limited, network-error, re-entrancy, cache hit) but all the concrete assertions need rewriting around `applyHighlights(root, terms)`.

---

## Low-severity / nits

### L1. Plan line 33: "dual-entry (`.` and `./dom`)" should be "8-entry exports map"

B1 plan line 42: 8 sub-entries, not 2. Minor but shows the author didn't read B1 carefully.

### L2. Plan §3 line 153: "Do NOT read: Any file under `api/src/modules/ats/**`"

Good rule, but then §6.3 line 570 asks the executor to hand-write a runtime guard that mirrors `ExtractedSkillSchema`. Without reading A3's schema, how is the executor supposed to get the category literal union right? §3 should allow reading `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` as a sibling, since that IS the contract (not internal backend code).

**Fix**: adjust §3 line 153 to allow `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` as an optional read.

### L3. Plan line 1685 DevTools smoke test message shape

```js
chrome.tabs.sendMessage(t.id, { type: 'HIGHLIGHT_APPLY', data: { tabId: t.id } })
```

`@webext-core/messaging` uses a specific envelope internally — the raw `{ type, data }` shape above may not be what `@webext-core/messaging` decodes. The smoke test should use `sendMessage('HIGHLIGHT_APPLY', { tabId }, t.id)` from the bg console (importing from the compiled bundle) or use the bg handler's mediator directly.

### L4. Bundle-size claim (200 KB gz) unsubstantiated

Plan §0.1 footnote: "A8 baseline was ~110 KB; A9 adds ~15 KB." Neither figure is sourced. A8 bundle size will be determined empirically after A8 ships. Acceptable for a plan, but mark as "expected" not "verified."

### L5. Multiple em-dashes throughout

The user's `feedback_no_em_dashes.md` rule: *"NEVER use em dashes in any output, anywhere, ever."* The plan is riddled with em-dashes (U+2014). Count: 150+. All should be ASCII `--` or `-`. Same issue in other phase plans but noted here per the reviewer's obligation.

---

## Contract cross-checks

| Contract vs... | Required shape | A9 plan says | Result |
|---|---|---|---|
| **B6 `applyHighlights` signature** | `(root: Element, keywords: readonly string[]) => () => void` | `applyHighlights(document.body, ranges)` where ranges is `HighlightRange[]` | **FAIL (C1)** |
| **B6 `walkTextNodes`** | `Generator<Text>` | `{ concatenated, segments }` record | **FAIL (C1)** |
| **B6 `HighlightRange` export** | Does not exist | Imported from `ats-autofill-engine/dom` | **FAIL (C1)** |
| **B6 `TextWalk` export** | Does not exist | Listed as an exported type (plan line 101) | **FAIL (C1)** |
| **B6 `extractJobDescription`** | `(doc: Document) => Promise<{ text; structured?; method } \| null>` | Used as synchronous `extractJobDescription(document)` (plan lines 654, 974, 1283) | **FAIL (B6 §"Step 14" makes it `async`)** |
| **B6 `detectPageIntent`** | `(location: Location, doc: Document) => PageIntent` with `kind: 'job-posting' \| 'application-form' \| 'unknown'` and optional `ats` | Used correctly | **PASS** |
| **A3 request shape** | `{ text: string, options?: { topK?, categories?, includeMissing?, resumeText? } }` | `{ text: req.text, options: { topK } }` | **PASS** |
| **A3 response shape** | `{ success: true, data: { keywords: [...], missing?, tookMs }, requestId, timestamp }` | `isExtractSkillsResponseShape` checks `success === true`, `data.keywords`, `data.tookMs` | **PASS** (ignores `missing`, `requestId`, `timestamp` which is fine) |
| **A3 keyword schema** | `{ term, category: 'hard'\|'soft'\|'tool'\|'domain', score 0..1, occurrences, canonicalForm }` | `ExtractedKeyword` in protocol.ts matches | **PASS** |
| **A5 message names** | `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`, `INTENT_DETECTED`, `INTENT_GET_FOR_TAB` | Used correctly, plus new `KEYWORDS_EXTRACT`, `AUTH_STATE_CHANGED` | **PASS** (additive) |
| **A5 `HIGHLIGHT_APPLY` payload/response** | Was `{ tabId, keywords }` → `{ applied }` | Reshaped to `{ tabId }` → discriminated envelope | **BREAKING** (acknowledged in plan but understated) |
| **A5 `INTENT_DETECTED` handler reads sender.tab.id** | A5 line 2425: NOT shipped by default | Plan relies on the fallback without adding it | **FAIL (H2)** |
| **B1 import paths** | Entry `ats-autofill-engine/dom` (sub-entry in 8-entry exports) | Plan imports `ats-autofill-engine/dom` | **PASS** (if B6 actually exposes the `./dom` barrel) |

---

## Checklist walkthrough

### A. Contract conformance
- [F] applyHighlights signature matches B6
- [F] walkTextNodes shape matches B6
- [F] HighlightRange doesn't exist
- [F] extractJobDescription await boundary
- [P] detectPageIntent shape
- [P] A3 endpoint contract

### B. Message protocol vs A5
- [P] Key names preserved
- [P] Key additions (`KEYWORDS_EXTRACT`, `AUTH_STATE_CHANGED`)
- [P] Type-level breaking change (HIGHLIGHT_APPLY payload) is identified and test file updated
- [F] `INTENT_DETECTED` sender-based fallback not verified (H2)

### C. Scope discipline
- [P] §0.2 declares files touched (3 modified, 7 new, but fudges `getApiBaseUrl`)
- [F] Adds `pageKind` to A5 protocol mid-plan without explicit scope callout (H1)
- [F] Touches `src/background/config.ts` implicitly (M4)

### D. Grep gates
- [P] `skill-taxonomy`: only in prose citation of decision memo, not imported — PASS
- [F] `HighlightRange`: 15 hits in plan code blocks — FAIL (but this is the plan itself, not shipped code; once C1 is fixed, shipped code will have zero hits)

### E. Test quality
- [P] Structure: happy path + signed-out + rate-limited + network-error + re-entrancy + cache hit + shape drift + broadcast
- [F] Assertions built on fictional `HighlightRange` and `walkTextNodes.concatenated` shape (M5)
- [F] Test files use `as any` for mocks despite testing rule ban (M1)

### F. Code quality
- [P] No `console.log`, uses `logger` wrapper
- [P] No `any` in production files
- [P] Runtime type guard for API response (no blind trust)
- [F] `applyHighlights` throw mapped to `api-error` (H3)
- [F] Re-entrancy guard has subtle window (H4)
- [F] 150+ em-dashes (L5)

---

## Verdict

**Grade: F**

Do not execute. The C1 contract violation is fatal: B6 will ship a renderer that takes `(root, keywords: string[])` and A9 will attempt to call it with `(root, HighlightRange[])`. Typecheck fails in step 1, before any code can land.

**Required rewrite scope before re-review:**
1. Delete `range-builder.ts` and its test (~340 LoC).
2. Rewrite `apply-handler.ts` step 5-6 to pass keyword strings directly.
3. Drop `HighlightRange`, `TextWalk`, `walkTextNodes` (as consumer) from all imports.
4. Add async/await to `extractJobDescription` call sites.
5. Resolve the `tabId: -1` sentinel (H2) — either confirm A5/A8 handler supports it or add the bg-side fallback in §6.3.
6. Move `pageKind` addition to a named scope item (H1).
7. Either add `render-error` literal (H3) or let engine exceptions propagate.
8. Tighten re-entrancy guard (H4).
9. Strip em-dashes (L5).
10. Remove `as any` from test mocks (M1).

Estimated rewrite cost: 3-4 hours. After the rewrite, the plan should be ~900 LoC net adds instead of ~1,335, and the structural simplicity will make it one of the easier Sonnet execution targets in Plan 100 v2.
