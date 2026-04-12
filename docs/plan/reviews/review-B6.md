# Review — Phase B6 (DOM adapter: highlighter renderer + JD extractor + intent detector)

**Reviewer:** Claude Opus 4.6 (architect)
**Plan file:** `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B6_dom_adapter_highlighter_renderer\plan.md`
**Date:** 2026-04-11
**Grade:** A-

---

## Summary

Phase B6 is well-structured, self-contained, and aligns with the v2 decision memo. The signature `applyHighlights(root: Element, keywords: readonly string[]): () => void` is correctly used throughout, the renderer is a pure "wrap these strings" utility (no keyword matching in engine), JSON-LD extraction is specified verbatim from investigation 55, and the intent detector has clear URL regex tables. The plan correctly forbids `HighlightRange`, `core/highlight/**`, and `skill-taxonomy` imports. One material cross-phase contract issue is surfaced by B6 itself (A9 drift, see below) — credit to the plan for flagging it in step 33.

---

## Invariant checks (MUST pass)

| Invariant | Status | Notes |
|---|---|---|
| Signature `applyHighlights(root: Element, keywords: readonly string[]): () => void` | PASS | Declared in metadata (L13), goal section (L55), code snippet L270-273, acceptance criteria, step 33. Returns `() => void` cleanup. |
| Returns cleanup function | PASS | Explicit in JSDoc L267, code L301-312, acceptance criterion L803. |
| Wraps matches in `<mark data-ats-autofill>` spans | PASS | Constants `MARK_ATTR='data-ats-autofill'`, `MARK_CLASS='ats-autofill-highlight'` L256-257; attribute value `"true"` consistently used. |
| No `HighlightRange` type introduced | PASS | Zero affirmative usages. All 8 occurrences in B6 plan are explicit prohibitions ("do NOT exist in v2", "returns zero matches", "Do NOT reintroduce"). |
| No `skill-taxonomy` import | PASS | Zero occurrences in the plan file. |
| JD extractor: JSON-LD first, readability+turndown fallback | PASS | Pipeline specified in `extractJobDescription` L705-723; JSON-LD extraction copies investigation 55 verbatim; readability fallback clones the doc (Readability mutates its input) L668. |
| Intent detector: GH/Lever/Workday JD pages | PASS | URL patterns for `greenhouse`, `lever`, `workday`, `ashby` with `form` tested before `posting` to correctly classify `/apply` as application-form; returns `{ kind: 'unknown' }` on no match, never throws. |
| Lives under `src/adapters/dom/**` only | PASS | Three subtrees: `highlighter/`, `jd/`, `intent/`. DOM refs allowed. Import rules explicitly exclude `src/core/highlight/**` (stale v1 path), `src/ats/**`, `src/adapters/chrome/**`. |

---

## Checklist A — Scope and boundaries

- [x] Scope declaration present (L22-30): 14 new + 3 modified, ~1000 LoC source + ~550 LoC tests.
- [x] Out-of-scope list explicit (L24-29): skill-taxonomy loading, A9 content-script glue, chrome.* calls, MutationObserver re-highlight, core HighlightRange type.
- [x] Hex architecture boundary check (L72-82): adapter tsconfig must include `DOM` in lib; MAY type-only import `core/types`, `core/ports`, `core/taxonomy`; MUST NOT import `ats/**` or `adapters/chrome/**`.
- [x] Dependency list correct: depends on B2 (types) and B5 (barrel + shared utils), blocks A9.
- [x] Rollback plan present L883-891.

## Checklist B — File plan and LoC budget

- [x] File inventory (L86-110): 10 source files + 5 test files with paths, purposes, LoC estimates. Realistic per-file LoC numbers.
- [x] Modified files table L111-118: `index.ts` (barrel additions, no reorder of B5 exports), `package.json` (new runtime deps), `vitest.config.ts` (environmentMatchGlobs routing).
- [x] No file >400 lines.
- [x] Barrel additions clearly alphabetically grouped, do not touch B5 exports.

## Checklist C — Contract with A9 and B5

- [x] **A9 consumer contract (B6 side):** step 33 (L243) explicitly verifies A9 calls `applyHighlights(document.body, keywordStrings)` where `keywordStrings` is `readonly string[]`.
- [!] **CROSS-PHASE DRIFT DETECTED (A9 is stale, NOT B6):** `phase_A9_content_script_highlight_and_intent/plan.md` still references:
  - `applyHighlights(document.body, ranges)` at L76 (passing ranges, not keywords)
  - `applyHighlights(root, ranges, options?)` signature at L137
  - `HighlightRange` type at L101, L722-726
  - `TextWalk` type at L101
  - A custom range-computation step at L722+ ("convert a `readonly string[]` into `readonly HighlightRange[]`")
  - R3 risk at L1628 referring to `walkTextNodes.concatenated` offsets — not part of B6's v2 surface
  - This is **A9's bug, not B6's**. B6 plan correctly flags it in step 33 as "flag to the architect for an A9 rewrite pass — do NOT change A9 from inside B6." **A9 needs a rewrite pass before execution, and because A9 is scheduled Day 6 while B6 is Day 4, there is time to fix A9.**
- [x] **B5 contract (barrel collision):** B5 exports `scan`, `fillField`, `attachFile`, `watchForm`, label helpers, native setters, event helpers. B6 adds `applyHighlights`, `removeAllHighlights`, `walkTextNodes`, `findTextMatches`, `injectHighlightStyles`, `extractJobDescription`, `extractJobPostingFromDocument`, `extractViaReadability`, `detectPageIntent`, `URL_PATTERNS`, `PageIntent`, `Ats`. **Zero symbol collisions**. B6 instructs to append beneath B5's existing exports without reordering them.
- [x] **B1 contract (`./dom` sub-entry):** B1 creates the empty `src/adapters/dom/index.ts` placeholder and declares `./dom` in `package.json` exports map. B5 rewrites the barrel. B6 extends it. Chain is intact.

## Checklist D — Algorithm correctness

- [x] **Renderer (L250-343):**
  - Early return on empty keywords (L274-278).
  - Idempotency via `removeAllHighlights(root)` before walk (L281).
  - TreeWalker materialised into array BEFORE splitText to avoid walker invalidation (L289-292) — correct.
  - Right-to-left split order (L319-320) so earlier indices stay valid — correct per standard `splitText` reentrance lore.
  - Cleanup unwraps marks and calls `parent.normalize()` — DOM restoration verified by snapshot test.
- [x] **Text walker (L356-384):** TreeWalker rejects `<script>`, `<style>`, `<noscript>`, nodes already inside `data-ats-autofill`, and whitespace-only nodes.
- [x] **findTextMatches (L398-451):** pure function, ASCII word-boundary heuristic, longest-wins on overlap via `sort → walk → lastEnd`.
  - Minor: `indexOf`-based scan with O(nk) worst case for k keywords. Acceptable for POC (< 50ms on 10KB × 50 keywords per L197 performance case).
  - Word boundary: character code check `[0-9A-Za-z]` — explicitly ASCII per the v1.1 backlog note L898.
- [x] **Styles (L463-486):** idempotent by id-check; cleanup is a closure that removes by id.
- [x] **Cleanup (L497-509):** standalone, uses static `Array.from(NodeList)` snapshot to avoid mutating while iterating a live NodeList.
- [x] **JSON-LD extractor (L521-652):** recursive `findJobPosting` handles `@graph` arrays, `@type` as string or array, defensive `toStr`/`toNum` coercions, `hiringOrganization` as object or string, `jobLocation` as array/object/missing.
- [x] **Readability fallback (L667-681):** clones the doc (Readability mutates input — critical), runs turndown with GFM plugin. Note: `@ts-expect-error` on the gfm import — acceptable, the package ships without types and L116 adds `@types/turndown` only.
- [x] **JD pipeline (L705-723):** JSON-LD first, readability second, null third. `stripHtml` uses `doc.createElement('div')` so it works outside global `document`.
- [x] **URL patterns (L742-759):** case-insensitive, both Greenhouse subdomains (`boards` and `job-boards`), form tested before posting at detection time.
- [x] **Intent detector (L781-797):** deterministic iteration order, `{ kind: 'unknown' }` on no match, never throws.

## Checklist E — Test plan

- [x] 15 `find-matches.spec.ts` cases (pure Node) — covers empty input, case, boundary, overlap, multi-word, duplicates, unicode, 10KB/50-keyword perf.
- [x] 11 `renderer.spec.ts` cases (happy-dom) — happy path, cleanup, idempotency, boundary, case, cross-node limitation (documented v1 limit), script/style skip, stray-mark clear, empty-array no-op, style injection, multiple matches per node.
- [x] 7 `jsonld-extractor.spec.ts` cases — top-level, `@graph`, multi-script, malformed JSON, string `hiringOrganization`, no JSON-LD, non-JobPosting.
- [x] 3 `readability-fallback.spec.ts` cases — happy article, no content, no mutation.
- [x] 20+ `detector.spec.ts` cases across four ATSes × {posting, form, unknown}, plus `jobData` attachment.
- [x] vitest environment routing: `find-matches.spec.ts` runs under `node`, everything else under `happy-dom` — correct since find-matches is a pure string function.
- [x] Adversarial cases present: cross-node text split negative test, stray pre-existing mark test, multi-script malformed JSON recovery test, punctuation/boundary edge cases.

## Checklist F — Acceptance criteria and grep gates

- [x] 18 acceptance criteria in bullet form L802-823.
- [x] Includes negative-grep gates: `HighlightRange`, `chrome.`, `console.` return zero matches.
- [x] Bundle size check: <35 KB gzipped for the three new subtrees (excluding third-party readability + turndown).
- [x] Build artefact check: `dist/adapters/dom/` inspected for forbidden identifiers post-build.

---

## Grep gate results

| Pattern | Target | Result |
|---|---|---|
| `HighlightRange` in B6 plan | 0 **affirmative** hits | PASS — all 8 occurrences are explicit prohibitions |
| `skill-taxonomy` in B6 plan | 0 hits | PASS |
| `applyHighlights(root: Element, keywords: readonly string[])` signature | Present | PASS L270-273 |
| Old `applyHighlights(ranges: HighlightRange[])` shape in B6 plan | 0 hits | PASS — only appears as A9 drift warning at L242 |
| `core/highlight/` imports in B6 plan | 0 affirmative | PASS — only appears as explicit prohibition |

---

## Cross-phase findings

### Critical (blocks A9 execution, not B6)

**A9 plan is stale and must be rewritten before Day 6.** `phase_A9_content_script_highlight_and_intent/plan.md` has not been updated for v2:

1. **Wrong call shape:** L76 calls `applyHighlights(document.body, ranges)`, L137 documents `applyHighlights(root, ranges, options?)`. Both must become `applyHighlights(document.body, keywords)` where `keywords: readonly string[]`.
2. **Dead type imports:** L101 imports `HighlightRange`, `TextWalk` from `ats-autofill-engine/dom`. Neither type exists in v2 — B6 does not export them.
3. **Dead range-computation file:** L169 specifies `entrypoints/ats.content/highlight/apply-handler.ts` with a ~140 LoC step to "convert `readonly string[]` into `readonly HighlightRange[]`". The conversion is unnecessary in v2 — the renderer does the conversion internally via `findTextMatches`.
4. **Mock drift:** L1449, L1460, L1500, L1530, L1549, L1565, L1588 mock `applyHighlights` with old shape.
5. **Dead risk row:** L1628 R3 references `walkTextNodes.concatenated` offset alignment — not part of B6's v2 surface.

**Impact:** if A9 executes as-written, it will (a) pass the wrong argument type to `applyHighlights`, (b) import non-existent types from `ats-autofill-engine/dom` and fail typecheck, (c) build ~140 LoC of unneeded range-computation code. B6 itself is unaffected. B6 step 33 correctly flags this and says "do NOT change A9 from inside B6."

**Recommended action for architect:** rewrite A9 plan before Day 6. The rewrite should:
- Change signature to `applyHighlights(document.body, keywordStrings)`.
- Drop `HighlightRange` and `TextWalk` imports entirely.
- Delete the `highlight/apply-handler.ts` range-computation step; move the direct call into the `HIGHLIGHT_APPLY` handler.
- Update the test mocks to match the new shape.
- Remove R3 from the risk register.

### Minor

- **L659 `@ts-expect-error`:** using `@ts-expect-error` rather than a type declaration file is acceptable for POC; if the Typescript strict config treats this as error, the executor should fall back to a `.d.ts` shim. Note this in the plan? Already implicitly acceptable per the POC timeline.
- **L130 LoC for renderer.ts:** 130 LoC feels tight given the renderer includes `splitNodeAtMatches`, but the snippets at L250-343 fit comfortably within that budget. OK.
- **Intent detector imports cross-dir:** `src/adapters/dom/intent/detector.ts` imports from `../jd/jsonld-extractor`. This is a same-adapter intra-directory import and is legal under the hex rules. No violation.
- **`extractJobDescription` returns unused `structured` on readability path:** the type allows `structured?: JobPostingData` to be undefined on readability path. Consumer (A9) needs to handle both. Correct.
- **Confidence score:** plan declares 9/10 — reasonable given investigation 52 and 55 are authoritative sources for JD extraction and the renderer algorithm is standard.

---

## Recommendation

**APPROVE with one mandatory downstream action.**

B6 is internally sound, contract-correct, and ready for Sonnet execution on Day 4 (2026-04-15). The cross-phase drift lives in A9, not B6, and B6 correctly flags it rather than trying to patch it in place (per the architect's explicit "do not edit other phases" rule).

**Mandatory architect action before Day 6:** rewrite `phase_A9_content_script_highlight_and_intent/plan.md` to adopt the v2 `applyHighlights(root, keywords: readonly string[])` signature and delete the `HighlightRange` / `TextWalk` / range-computation artefacts. This is independent of B6 execution — B6 can and should ship as-specified.

**Grade: A-**

The minus reflects the severity of the A9 drift, not any defect in B6. If A9 is fixed before Day 6, the final integration grade will promote to A.
