# Review — Phase B2 (Core types + taxonomy + profile schema)

**Reviewer**: Claude Opus 4.6 (architect role)
**Date**: 2026-04-11
**Plan file**: `phase_B2_core_types_and_taxonomy/plan.md` (1977 lines)
**Grade**: **C+ (requires correction)**

---

## Verdict summary

B2 is a solid, thorough, executor-ready plan in most respects — the type/taxonomy/profile structure, Zod validation, test coverage, and A7/B4 contract alignment are all in good shape. **However, the plan contains a load-bearing v1-era artifact that directly contradicts the v2 decision memo and the B6 contract: it creates a `HighlightRange` type and an `IKeywordHighlighter` port that v2 explicitly deletes.** B6's plan flags this exact drift as a blocker and says "if you find `HighlightRange`, STOP and ask". B2 is the upstream source of that drift.

In addition, the plan text body contains non-fatal prose references to `HTMLElement`, `chrome.storage`, and `skill-taxonomy` that violate the B2 hard-grep invariants. These are in comments only (not in the file content that lands in `src/core/**`), but several of them *are* in code blocks that the executor will copy verbatim into `.ts` files under `src/core/`. That makes them hit the grep gate for real.

This is fixable with surgical edits — not a rewrite. Detail below.

---

## Hard grep results (against the plan markdown)

| Token | Hits | Load-bearing? | Notes |
|---|---|---|---|
| `HighlightRange` | 5 | **YES — BLOCKER** | Creates `src/core/types/highlight-range.ts`, re-exports from `types/index.ts`, imports into `ports/index.ts`, includes in `IKeywordHighlighter.apply(ranges: ReadonlyArray<HighlightRange>)` |
| `document` | 8 | Partial | 2 hits are bash grep commands (OK), 3 are comments inside `.ts` code blocks that will land in `src/core/**` files (JSDoc: "option values in document order", "scanned document", "flattened text of the document", "Adapter-resolved handle to a stored document", "Applies highlight ranges to the live document"). Since these are in JSDoc comments, `grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core/` **will match** and the B2 acceptance criterion will fail on the executor's own machine. |
| `window` | 0 | — | Only in grep commands/criteria. Clean. |
| `HTMLElement` | 1 | **YES** | In `src/core/ports/index.ts` JSDoc: `"Adapters narrow it to Document \| HTMLElement in their implementation."` — lands in `src/core/**` and trips the acceptance-criterion grep. |
| `chrome.` | 2 | **YES** | In `src/core/profile/schema.ts` JSDoc ("chrome.storage.local / IndexedDB") and `src/core/ports/index.ts` JSDoc ("chrome.storage.local (plus IndexedDB…)"). Both land in `src/core/**` and trip the grep. |
| `skill-taxonomy` | 1 | No | Only in the "Out of scope" section prose of the plan markdown, not in any `.ts` file. Safe. |

**Critical interpretation**: B2's own step-22 acceptance test runs `grep -rE '\b(document\|window\|HTMLElement\|chrome\.)' src/core` and exits non-zero on any hit. The plan contains code blocks destined for `src/core/` that hit that grep. The executor, following the plan verbatim, will produce a phase that fails its own compliance gate. This is a self-inconsistency, not just a style nit.

---

## Checklist A — Decision-memo alignment

| # | Requirement | Status |
|---|---|---|
| A1 | Core is DOM-free (per §2.5) | **FAIL** — JSDoc comments in code blocks reference `HTMLElement`, `document`, `chrome.*` (see grep table above) |
| A2 | No skill-taxonomy in engine (per §2.5) | PASS — only in "out of scope" prose |
| A3 | Engine does not own keyword matching (per §2.5) | **FAIL** — `HighlightRange` type and `IKeywordHighlighter` port are both keyword-matching-era artifacts that v2 §2.5 explicitly deletes |
| A4 | Profile = JSON Resume base + 16 legal-auth flags + willingToUndergo* + DOB/EEO consent (per §2.6) | PASS — `JurisdictionAuthorization` × 4, three `willingToUndergo*` flags, `allowDobAutofill`, `allowEeoAutofill` all present |
| A5 | JSON Resume v1.0 compatible superset (per §2.12) | PASS — `Basics`, `WorkExperience`, `Education`, `Skill`, `Language`, `Certificate`, `Project`, `Volunteer`, `Award`, `Publication`, `Reference` all modeled |
| A6 | Hex boundary: core imports nothing external except zod (per §2.5) | PASS — only `zod` imported |
| A7 | No `@repo/shared-types` import (per config grepGate) | PASS |

---

## Checklist B — Downstream contract match

### vs B4 (classifier + fill-rules + plan-builder)

B4 Step 1 spot-checks these imports from B2:

- `FieldType` from `src/core/taxonomy/field-types.ts` — **PASS** (B2 step 8 exports it)
- `SYNONYMS` from `src/core/taxonomy/synonyms.ts` — **PASS** (B2 step 11)
- `EEO_FIELD_TYPES`, `CONSENT_FIELD_TYPES`, `DOB_FIELD_TYPES`, `isEeoField`, `isConsentField`, `isDobField` from `src/core/taxonomy/ats-extensions.ts` — **PASS** (B2 step 10)
- `FormFieldDescriptor`, `FormModel`, `ClassifiedField`, `ClassificationConfidence`, `FillInstruction`, `FillPlan`, `FillValue` from `src/core/types/index.ts` — **PASS** (B2 steps 2-7)
- `Profile` from `src/core/profile/schema.ts` — **PASS** (B2 step 13)

B4 plan-builder imports `FormModel`, `FormFieldDescriptor`, `FillInstruction` — all match B2 shapes exactly.

**B4 contract: CLEAN.**

### vs B5 (DOM adapter scanner + filler)

B5's required reading lists these exact imports from B2:

- `FormFieldDescriptor` shape — B5 needs every documented field. B2 defines `selector`, `name`, `id`, `label`, `placeholder`, `ariaLabel`, `autocomplete`, `type`, `options`, `required`, `dataAttributes`, `sectionHeading?`, `domIndex`. **PASS.**
- `FormModel` (return shape of `scan()`) — B2 defines `url`, `title`, `scannedAt`, `fields`. **PASS.**
- `FillResult` and `FillError` unions — B2 step 4 defines both. **PASS.**
- `FillInstruction` — B2 defines `selector`, `field`, `value`, `priority`. **PASS.**

However, B5 writes: *"The filler/attacher MUST return these discriminated unions, never throw."* B2's `IFieldFiller.fill(selector, value)` signature in ports takes `string | boolean` — but `FillValue` is a discriminated union with five variants including `file`, `choice`, `skip`. **Minor drift**: `IFieldFiller` in ports is weaker than what B5 actually needs. Low severity (ports in B2 are sketches; B5 redefines its own surface).

**B5 contract: MOSTLY CLEAN with one minor port-signature drift (not a blocker for B5).**

### vs B6 (DOM highlighter renderer)

**MAJOR DRIFT.** B6's plan explicitly states:

> `grep -rn 'HighlightRange' src/adapters/dom/` returns zero matches (type does not exist).
> A core `HighlightRange` type or a `planHighlights` function — explicitly deleted in v2 per decision memo §2.5. Do NOT reintroduce.

And:

> Ignore any section that talks about a core `planHighlights` or `HighlightRange` type — those existed in v1 only and are dead in v2.

B6's contract with A9 is literally:

> `applyHighlights(document.body, keywordStrings: string[]): () => void`

The renderer takes a `readonly string[]`, not a `HighlightRange[]`.

B2 creates:

1. `src/core/types/highlight-range.ts` defining the v1 type
2. Re-exports `HighlightRange` from `src/core/types/index.ts`
3. Imports `HighlightRange` into `src/core/ports/index.ts`
4. Declares `IKeywordHighlighter.apply(ranges: ReadonlyArray<HighlightRange>): Promise<void>`

Every one of these contradicts B6. If B2 ships as written, B6's acceptance criterion #8 (`grep -rn 'HighlightRange' src/adapters/dom/` zero-hit) may still pass because B6 lives under `src/adapters/dom/**`, but B6's explicit instruction to "STOP and ask" when `HighlightRange` exists will fire — the executor of B6 will halt and escalate.

**B6 contract: FAIL — requires B2 to delete highlight-range.ts, the IKeywordHighlighter port, and all re-exports.**

### vs A7 (profile storage + options page)

A7's required reading lists:

- `Profile`, `ProfileSchema`, `createEmptyProfile` from `ats-autofill-engine/profile` — **PASS**
- `ProfileVersion`, `Basics`, `JobPreferences`, `JurisdictionAuthorization`, `Consents`, `Documents` — all imported via `ats-autofill-engine/profile`. **PASS** — B2 step 17 re-exports every one of these.
- `jobPreferences.workAuthorization[]` as 4 jurisdictions × 4 flags — B2 models this as `ReadonlyArray<JurisdictionAuthorization>` with 4 boolean flags each. **PASS.**
- `willingToCompleteAssessments`, `willingToUndergoDrugTests`, `willingToUndergoBackgroundChecks` — all three in B2's `JobPreferences`. **PASS.**
- `allowEeoAutofill`, `allowDobAutofill` consents — both in B2's `Consents`. **PASS.**
- `phonePrefix`, `preferredName`, `pronouns`, `dateOfBirth` in `Basics` — all present. **PASS.**
- `ResumeHandle` under `Documents` — B2 defines both. **PASS.**
- Zod `strict()` parsing so JSON Resume upload rejects unknown fields — B2 step 14 uses `.strict()` throughout. **PASS.**

One minor compatibility nit: A7 uses `ProfileSchema.safeParse()` in its validator; B2 only exports `ProfileSchema.parse()`-compatible code. Since `safeParse` is a Zod method on the schema itself (not a separately-exported function), this is a no-op concern — A7 just calls `.safeParse()` on the imported `ProfileSchema`. **PASS.**

**A7 contract: CLEAN.**

---

## Checklist C — Invariant grep (against plan.md)

| Token | Required | Actual | Verdict |
|---|---|---|---|
| `document` (excluding bash grep commands + prose) | 0 in `.ts` code blocks | 3 | **FAIL — in JSDoc inside `src/core/**` files** |
| `window` | 0 | 0 | PASS |
| `HTMLElement` | 0 | 1 | **FAIL — in `src/core/ports/index.ts` JSDoc** |
| `chrome.` | 0 | 2 | **FAIL — in `src/core/profile/schema.ts` and `src/core/ports/index.ts` JSDoc** |
| `skill-taxonomy` | 0 | 1 | PASS (prose-only, in "Out of scope" section — does not land in code) |
| `HighlightRange` | 0 | 5 | **FAIL — creates type, exports, and port method signature** |

---

## Checklist D — File-list consistency

Plan declares 18 source files + 6 test files = 24 total. Actual file list in the plan (items 1-24) matches. However:

- Item 5 (`src/core/types/highlight-range.ts`) **must be deleted** to satisfy the v2 memo.
- Item 17 (`src/core/ports/index.ts`) **must remove the `IKeywordHighlighter` interface** and its `HighlightRange` import.
- Item 7 (`src/core/types/index.ts`) **must remove the `HighlightRange` re-export**.

Post-correction file count: 17 source + 6 test = 23.

---

## Checklist E — Test quality

Test coverage is genuinely strong:

- `profile/schema.spec.ts` — 18 cases including happy path, invalid email, non-ISO dates, salary max<min, NaN salary, negative salary, country code length, strict-mode unknown field rejection, over-limit strings, array caps, invalid enums, invalid remote preference, resume handle size cap, demographic enum, and `decline_to_answer` acceptance. This is genuinely adversarial testing per `.claude/rules/testing.md`. **STRONG.**
- `profile/defaults.spec.ts` — 5 cases including new-object-per-call (no shared mutable state), default flag values, round-trip validation. **GOOD.**
- `profile/migrations.spec.ts` — 3 cases. Minimal but correct (v1.0 has no migrations to test). **OK.**
- `taxonomy/field-types.spec.ts` — 6 cases including XOR partition, staple membership, count ≥ 74. **GOOD.**
- `taxonomy/synonyms.spec.ts` — 6 cases including lowercase, no cross-contamination, non-empty. **GOOD.**
- `types/form-model.spec.ts` — 2 cases, type-level literal construction. **MINIMAL** — acceptable since these are types not runtime.

One concern: the plan inserts `'placeholder@example.com'` into `createEmptyProfile()` to satisfy `z.string().email()`. This is a **minor code smell** — the factory should return a truly empty string and `ProfileSchema` should tolerate empty-but-required strings via a "draft mode" wrapper. As written, `createEmptyProfile()` returns a profile whose `basics.email` is a fake value that will silently ship if the user forgets to override it. Not a blocker for B2, but flag it — better solution is `z.union([z.string().email(), z.literal('')])` or a separate `DraftProfileSchema` vs `CompleteProfileSchema` split. **Raise to architect for decision, not a B2 rewrite.**

Another concern: `tests/core/profile/schema.spec.ts` uses inline `(p as { jobPreferences: Record<string, unknown> })` casts to bypass type safety. This is acceptable for negative tests that intentionally construct invalid inputs, but the plan should explicitly note that these casts are deliberate. Minor.

---

## Checklist F — Coding-rules compliance

- Immutability: `readonly` on every type field + `ReadonlyArray<>` + `Readonly<Record<>>`. **PASS.**
- File sizes: estimated 100-300 lines per file based on the code blocks. **PASS.**
- Error handling: N/A for pure types.
- Zod at boundaries: `.strict()` on every object schema. **PASS.**
- API envelope: N/A for this phase (no endpoints).
- No `any`: `.claude/rules` enforces zero `any`; compliance gate greps for it. The plan's acceptance criteria include a zero-`any` grep. **PASS.**
- No `console.log`: N/A for pure types.
- No em dashes: plan uses "—" (em dash) throughout the prose and inside code comments. Per `feedback_no_em_dashes.md`: **NEVER use em dashes in any output, anywhere, ever**. This is a global user-rule violation but it is in the plan text itself, not in the final `.ts` code — the code blocks in B2 also contain em dashes in JSDoc comments that will land in `src/core/**`. **MINOR VIOLATION** of the em-dash rule across the whole plan; should be normalized to ASCII `-` or `--` before the executor touches it. (Note: this rule-violation is consistent across all plans in `temp/impl/100-chrome-extension-mvp/`, not unique to B2.)

---

## Required corrections (before B2 can ship)

### Blocker corrections (MUST fix, else B2 fails its own compliance gate or contradicts downstream B6)

1. **Delete `src/core/types/highlight-range.ts` entirely.** Remove step 5 from the "Files to create" list. Remove the code block at step 5 ("Step 5 — Create `src/core/types/highlight-range.ts`"). Adjust file count from 18 → 17.
2. **Remove `HighlightRange` re-export from `src/core/types/index.ts`** (step 7). Delete the line `export type { HighlightRange } from './highlight-range';`.
3. **Remove `IKeywordHighlighter` from `src/core/ports/index.ts`** (step 18). Delete the interface declaration and its `HighlightRange` import. The highlighter is a DOM adapter concern (B6), not a core port — B6 does not reference this port interface anywhere.
4. **Strip `HTMLElement` from the `IFormScanner` JSDoc** in step 18. Replace `"Adapters narrow it to Document | HTMLElement in their implementation."` with `"Adapters narrow the root to their platform type (e.g. in a browser context) in their implementation."`
5. **Strip `chrome.storage` from `ResumeHandle` JSDoc** in step 13. Replace `"the extension adapter maps it to chrome.storage.local / IndexedDB where the Blob lives."` with `"the host adapter (e.g. the extension's profile provider) maps it to its own storage layer where the Blob lives."`
6. **Strip `chrome.storage` from `IProfileProvider` JSDoc** in step 18. Replace `"Implemented by the extension adapter using chrome.storage.local (plus IndexedDB for Blob documents)."` with `"Implemented by the host adapter using its platform-native storage."`
7. **Strip `document` from JSDoc comments that land in `src/core/**`**. Specifically:
   - `form-model.ts` line 128: `"option values in document order"` → `"option values in source order"`
   - `form-model.ts` line 136: `"Zero-based index within the scanned document"` → `"Zero-based index within the scanned form"`
   - `highlight-range.ts`: deleted entirely, so comment goes away.
   - `profile/schema.ts` `ResumeHandle` JSDoc line 1005: `"Adapter-resolved handle to a stored document."` is ambiguous — in this context "document" refers to a PDF/docx resume file, not a DOM document, so `grep -E '\bdocument\b'` will still match. Rephrase to `"Adapter-resolved handle to a stored resume/CV file."`
   - `ports/index.ts` `IKeywordHighlighter` JSDoc: `"Applies highlight ranges to the live document."` — deleted because the whole interface goes away.
8. **Update the compliance-gate regex** at step 21 and step 22 — it currently reads `grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core` — to match the corrected JSDoc. No change needed to the regex itself; the fix is removing the tokens from the code blocks.
9. **Update "Out of scope" section** in step 21 or the "Files to create" table to explicitly call out that the engine DOES NOT own the highlighter port, the `HighlightRange` type, or any keyword-matching contract — these belong to the B6 DOM adapter as pure strings. Add a sentence: *"Per v2 decision memo §2.5 the engine has no core keyword-matching module. The DOM highlighter renderer (B6) receives a plain `readonly string[]` directly and is a pure utility."*

### Non-blocking corrections (should fix, not strict blockers)

10. Resolve the `createEmptyProfile()` `'placeholder@example.com'` hack — either split schema into draft vs complete variants, or accept the hack but document it.
11. Normalize em dashes throughout the plan markdown and code-block JSDoc to ASCII `-` / `--`. Applies to all 1977 lines. (Global violation across the whole 100-plan set; raise as a batch fix task.)
12. Clarify that the type assertions in `schema.spec.ts` are deliberate for negative tests. Add a one-line comment near the first cast.
13. Fix the 32-vs-25 baseline count discrepancy noted at step 21 line 1767 — the plan notes this, defers to the executor, and tells them to adjust the test. Better: commit to one number now (the enum has 32, so set `toBe(32)` now and delete the ambiguity).
14. Minor `IFieldFiller.fill(selector, value: string | boolean)` in ports under-specifies the `FillValue` union that B5 actually handles (text, boolean, choice, file, skip). Either widen the port signature to `FillValue` or explicitly note that the port is a sketch and B5 defines its own authoritative signature. Not a B5 blocker but B5's `ports/index.ts` comment will drift from reality.

---

## Strengths (keep these)

- **Comprehensive Zod coverage** with `.strict()` on every object schema — excellent boundary hardening.
- **Adversarial test suite** — NaN salary, over-limit strings, negative numbers, unknown-field rejection, XOR partition, duplicate-synonym detection. This is what `.claude/rules/testing.md` asks for.
- **Clean type-only port interfaces** — IFormScanner takes `unknown` for root, avoiding DOM leakage. (After the IKeywordHighlighter deletion, the remaining ports are well-scoped.)
- **Profile schema fully captures the AIHawk-gap patches** from agent 62 investigation — phonePrefix, dateOfBirth, 16 legal-auth flags, 3 willing-to-undergo flags, DOB/EEO consent gating.
- **Self-contained rollback plan** — clean git reset since there are no external side effects.
- **File-by-file step ordering** is linear and independently verifiable — each step compiles on top of the previous.
- **Acceptance criteria are measurable** (grep counts, test counts, typecheck pass/fail).
- **Migration registry stub** is a smart forward-compat hook even though it's empty at v1.0.

---

## Grade rationale

- Decision-memo alignment: **FAIL on A3 (keyword-matching artifacts leaked into core)** → heavy penalty
- Invariant grep: **FAIL on HighlightRange (5 hits), FAIL on HTMLElement (1 hit), FAIL on chrome. (2 hits), FAIL on document (3 hits in JSDoc)** → heavy penalty
- Downstream contracts: **FAIL on B6 (blocker), PASS on B4, PASS on B5 (minor), PASS on A7** → heavy penalty
- Type structure and profile schema: **STRONG**
- Zod and test coverage: **STRONG**
- Executor-readiness: **GOOD** (self-contained, unambiguous steps)
- Coding rules: **PASS** except em-dash prose (shared with all plans)

Net: C+. The plan is 85% correct and the blocking issues are localized to ~40 lines of the 1977-line plan — fixable in 15 minutes of architect editing. The architect should issue a small correction plan and re-score to A- once applied.

---

## Recommended next action

Issue a one-page B2 correction plan titled `phase_B2_core_types_and_taxonomy/correction-01-remove-highlightrange.md` that:

1. Deletes `src/core/types/highlight-range.ts` from the file list
2. Deletes the `HighlightRange` re-export from `src/core/types/index.ts`
3. Deletes the `IKeywordHighlighter` port from `src/core/ports/index.ts`
4. Rewrites the 5 JSDoc comments that trip the hard-grep invariants (HTMLElement, chrome.storage, document)
5. Adds a one-sentence note to the "Out of scope" section confirming the engine never owns a keyword-highlighter port
6. Adjusts file count from 18 → 17 everywhere it appears

Once those corrections land, B2 is ready to execute and the downstream B6 phase will no longer be blocked on a B2 drift.

---

**End of review B2.**
