# Post-v2.1 Drift Check

**Date**: 2026-04-12
**Phases checked**: 20
**Checks run**: 11

## Results

| Check | Status | Drift found |
|---|---|---|
| 1. Repo path | WARN | A4 line 10 has stale `zovo-labs/job-assistant` in Blocks field; all other A-phase hits are documentation/prohibition context (PASS). B-phases clean (PASS). |
| 2. ProtocolMap keys | PASS | A10 uses `INTENT_GET` (correct), reads `res.keywordCount` (correct). A9 sends `KEYWORDS_EXTRACT` (correct), does NOT import `@webext-core/messaging` directly (correct). A6 imports `readTokens`/`writeTokens` (correct), uses `AuthState` (correct). A11 registers GENERATION_* handlers through A5's HANDLERS dispatch table (correct). |
| 3. AtsAdapter shape | PASS | B7/B8/B9 all export `adapter: AtsAdapter` via factory pattern. `fillField(instruction: FillInstruction): FillResult` (correct D1 shape). A8 reads `mod.adapter` (correct). B8's `LeverScanResult` is a vendor-internal type (not the public `scanForm` return), which correctly returns `FormModel` at the adapter surface. |
| 4. B1 exports map | PASS | `./profile` entry present with `{types, import, require}`. `zod@^3.23.8` in dependencies. Version `0.1.0-alpha.1` (correct). |
| 5. HighlightRange eliminated | PASS | All 30+ hits are in prohibition prose, grep gate commands, or test assertions checking absence. Zero hits inside TypeScript code blocks that create/import/use the type. |
| 6. Profile shape alignment | PASS | A7 writes nested `basics.*` + `profileVersion: '1.0'` + `updatedAtMs: number`. A8 reads via `ProfileSchema.safeParse()`. A8 has `basics.firstName`/`basics.email` read paths. `ReadableProfile` only appears in deletion context. `updatedAt` (old) only appears in deletion documentation and one adversarial test that deliberately passes the old shape to verify rejection. |
| 7. Em-dash elimination | **FAIL** | 6 plans contain em-dashes (U+2014) in prose, not just in grep gate commands. A2 (75), A3 (110), B3 (105), B5 (96), B6 (55) have em-dashes throughout. B4 has 1 em-dash inside a grep gate command (acceptable). |
| 8. applyHighlights signature | PASS | B6: `applyHighlights(root: Element, keywords: readonly string[]): () => void` (correct). A9: calls `applyHighlights(document.body, keywords.map(k => k.term))` with `string[]` (correct). A9 does NOT import `walkTextNodes`, `TextWalk`, or `HighlightRange`. |
| 9. B2 type catalogue | PASS | B2 creates all 7 required files: brands.ts, ats-kind.ts, ats-adapter.ts, job-posting.ts, page-intent.ts, fill-plan-result.ts, extracted-skill.ts. Does NOT create highlight-range.ts. `IKeywordHighlighter` explicitly absent. |
| 10. D6 wizard ownership | PASS | A8 has `detectCurrentStep`, `watchForStepChange`, `fillStep` (owns the loop). B9 does NOT export `orchestrateFill` (exposes primitives only). |
| 11. Cross-phase compile chain | PASS | A5->A6 (AuthState, readTokens/writeTokens, sendMessage/onMessage). A5->A7 (PROFILE_GET/UPDATE/UPLOAD_JSON_RESUME). A5->A9 (KEYWORDS_EXTRACT, HIGHLIGHT_APPLY/CLEAR). A5->A10 (INTENT_GET, AUTH_STATUS, CREDITS_GET, HIGHLIGHT_STATUS). A5->A11 (GENERATION_START/UPDATE/CANCEL, DETECTED_JOB_BROADCAST). B1->B2 (zod in deps, ./profile in exports). B2->B4 (FormModel, FillInstruction, FillPlan, Profile, FieldType). B2->B5 (FormModel, FillResult, FillError). B2->B7/B8/B9 (AtsAdapter, FillInstruction, FillResult, JobPostingData). B5->B7/B8/B9 (fillField sync, attachFile async). B6->A9 (applyHighlights(root, keywords)). All verified. |

## Per-phase status

| Phase | All checks | Residual issues |
|---|---|---|
| A1 | PASS | Mentions of `zovo-labs` and `job-assistant` are all in prohibition/documentation context |
| A2 | **FAIL** | 75 em-dashes in prose (Check 7) |
| A3 | **FAIL** | 110 em-dashes in prose (Check 7) |
| A4 | WARN | Line 10 Blocks field says `zovo-labs/job-assistant` as if the extension repo is that path; should say `ebenezer-isaac/llmconveyors-chrome-extension` (Check 1) |
| A5 | PASS | Clean on all checks. Does NOT contain `INTENT_GET_FOR_TAB`. |
| A6 | PASS | `job-assistant` reference at line 2195 is inside a review traceability table (acceptable). All contract surfaces correct. |
| A7 | PASS | All profile shape contracts aligned |
| A8 | PASS | Reads `mod.adapter`, uses `ProfileSchema.safeParse`, owns wizard loop, no stale types |
| A9 | PASS | Uses A5 barrel, correct applyHighlights consumer, no fictional imports |
| A10 | PASS | Uses `INTENT_GET` (not `INTENT_GET_FOR_TAB`), reads `keywordCount` (not `applied`) |
| A11 | PASS | Registers through A5's HANDLERS dispatch table, no raw onMessage bypass |
| B1 | PASS | ./profile entry, zod dep, version 0.1.0-alpha.1 all correct |
| B2 | PASS | Full type catalogue, no HighlightRange, no IKeywordHighlighter |
| B3 | **FAIL** | 105 em-dashes in prose (Check 7) |
| B4 | PASS | Single em-dash is inside a grep gate command (acceptable) |
| B5 | **FAIL** | 96 em-dashes in prose (Check 7) |
| B6 | **FAIL** | 55 em-dashes in prose (Check 7) |
| B7 | PASS | Correct adapter shape, factory pattern, D1 compliance |
| B8 | PASS | Correct adapter shape, factory pattern, LeverScanResult is vendor-internal |
| B9 | PASS | Correct adapter shape, factory pattern, wizard primitives, no orchestrateFill |

## Residual drift items

1. **[A2] [Check 7] 75 em-dashes (U+2014) throughout plan prose** -- MEDIUM severity. D15 requires zero em-dashes. These plans were marked "light polish" in the decision memo but the em-dash scrub was not applied.
2. **[A3] [Check 7] 110 em-dashes (U+2014) throughout plan prose** -- MEDIUM severity. Same as A2.
3. **[B3] [Check 7] 105 em-dashes (U+2014) throughout plan prose** -- MEDIUM severity. Same issue.
4. **[B5] [Check 7] 96 em-dashes (U+2014) throughout plan prose** -- MEDIUM severity. Same issue.
5. **[B6] [Check 7] 55 em-dashes (U+2014) throughout plan prose** -- MEDIUM severity. Same issue.
6. **[A4] [Check 1] Line 10 Blocks field references `zovo-labs/job-assistant`** -- LOW severity. The Blocks field says the extension repo is `zovo-labs/job-assistant`; per D4 it should reference `ebenezer-isaac/llmconveyors-chrome-extension`. This is a metadata line, not a code path, so execution impact is minimal but the executor might be confused about the repo identity.

## Corrective actions

### Action 1 -- Em-dash scrub (5 plans, bulk find-replace)

Run a global replace of U+2014 with ` -- ` (space-dash-dash-space) or `-` as appropriate in:
- `phase_A2_backend_bridge_endpoint/plan.md`
- `phase_A3_backend_keywords_endpoint/plan.md`
- `phase_B3_mozilla_heuristics_port/plan.md`
- `phase_B5_dom_adapter_scanner_and_filler/plan.md`
- `phase_B6_dom_adapter_highlighter_renderer/plan.md`

These 5 plans were graded A or A- in the review and received "light polish" or "targeted fixes" corrections. The correction agents for these phases did not scrub em-dashes.

### Action 2 -- A4 Blocks field fix (1 line)

In `phase_A4_frontend_extension_signin/plan.md` line 10, replace:
```
- **Blocks**: A6 - Extension auth flow (`zovo-labs/job-assistant` calls `launchWebAuthFlow` against this page)
```
with:
```
- **Blocks**: A6 - Extension auth flow (`ebenezer-isaac/llmconveyors-chrome-extension` calls `launchWebAuthFlow` against this page)
```

## Verdict

**6 of 20 plans have residual drift -- 5 need em-dash scrub (mechanical bulk fix), 1 needs a repo path correction (1-line fix). All 11 structural/contract checks PASS. No type-level, signature-level, or architectural drift remains. Proceed to execution after applying the 2 corrective actions above.**
