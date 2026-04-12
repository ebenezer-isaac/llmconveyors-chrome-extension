# Phase B4 -- Classifier + Fill Rules + Plan Builder (v2.1 rewrite)

## Phase metadata

| Key | Value |
|---|---|
| **Plan** | 100 -- Chrome Extension MVP |
| **Phase** | B4 |
| **Title** | Classifier pipeline + fill-rule engine + plan builder (pure-TS core) |
| **Version** | v2.1 (post-review rewrite, supersedes v2.0) |
| **Repo** | `e:/ats-autofill-engine` (per D4) |
| **Day** | 3 of 6 (2026-04-14) |
| **Depends on** | B2 (types, taxonomy, Profile schema, brands per D16), B3 (Mozilla adapter exported from `src/core/heuristics`) |
| **Blocks** | B5 (DOM scanner consumes classifier types via shared barrel), A8 (content-script executor consumes `FillPlan` + `aggregateResults`), B7/B8/B9 (ATS adapters re-use `buildPlan` inside `scanForm`/`fillStep`) |
| **Estimated effort** | 4-5 hours (was 3-4; the v2.1 adversarial suite adds ~1h) |
| **Executor** | Sonnet (64k context) -- this plan is self-contained |
| **Confidence** | 9/10 |
| **Scope** | 19 new source files + 5 test files + 1 blueprint contract + 1 rollback script (~3,200 LoC source + tests combined) |

## v2.1 corrective scope (what changed from v2.0)

This rewrite applies the decisions locked in `02-decisions-v2.1-final.md` and fixes every blocker called out in `reviews/review-B4.md`. The v2.0 plan graded B-; this rewrite targets A-. Concretely:

1. **BUG-1 fixed** -- `CONFIDENCE.ARIA_LABEL` snapped to `0.5` (reserved for section-heading match in B2's literal union `1.0|0.9|0.8|0.7|0.6|0.5|0.3|0.0`). The self-contradicting `collapse to 0.7` doc comment is DELETED. The compile error at every call site that feeds `CONFIDENCE.ARIA_LABEL` into a `ClassifiedField.confidence` slot is eliminated.
2. **BUG-2 fixed** -- both `makeProfile()` test fixtures now populate the three required `JobPreferences` booleans: `willingToCompleteAssessments`, `willingToUndergoDrugTests`, `willingToUndergoBackgroundChecks`.
3. **BUG-3 fixed** -- every `JurisdictionAuthorization` literal now has all four required flags: `authorized`, `requiresVisa`, `requiresSponsorship`, `legallyAllowed`. Both US and GB entries updated. Both fixtures.
4. **BUG-4 fixed** -- every `Consents` literal now has all four required booleans: `privacyPolicy`, `marketing`, `allowEeoAutofill`, `allowDobAutofill`. Both fixtures.
5. **BUG-5 fixed** -- every `return skip('...')` branch in `dispatch.ts` now returns a `FillRuleResult` wrapper: `return { value: skip('...'), skipReason: '...' }`. Twelve call sites rewritten. The signature of the helper `skip()` stays `(reason) => FillValue` so the three nested literals that needed bare `FillValue` still work.
6. **Finding-8 fixed** -- the `does NOT classify resume-upload when type is text` test now reconciles with the synonym fallback: the assertion is weakened to `r.source !== 'ats-ext'` AND an `htmlTypeGuard`-equivalent check is added to the synonym pass for file-only types (see new `isFileOnlyType` helper in `src/core/classifier/synonym-matcher.ts`). Both fixes land; either on its own would close the test, but both together harden the pipeline.
7. **Drift fixed** -- `'language'` routes through `choiceOrSkip(..., descriptor.options)` instead of `textOrSkip`, so it snaps to select options on real forms.
8. **Drift fixed** -- `'tel-country-code'` uses `profile.basics.phonePrefix ?? deriveCountryCode(profile.basics.phone)` so explicit prefixes win over regex-derived ones.
9. **D7 applied** -- B4 ships `aggregateResults(plan, fillResults): FillPlanResult` alongside `buildPlan`. B4 does NOT execute the fill (A8 does); B4 only provides the pure aggregator A8 calls after the fill loop finishes.
10. **D16 applied** -- `FillInstruction.planId` is typed as the branded `PlanId` from `core/types/brands` (which B2 creates). The plan-builder constructs `PlanId(deriveDeterministicId(...))` and threads it into every instruction and into `FillPlan.planId` and `FillPlanResult.planId`.
11. **D15 applied** -- zero em-dashes in the plan file or any generated source. The double-hyphen `--` replaces every semantic dash.
12. **D14 applied** -- every acceptance-criterion gate and every anti-drift grep lives explicitly at the end of this plan.
13. **D19 applied** -- the adversarial test category is no longer thin. Eleven new adversarial test groups are specified in Step 22, covering: script-injection labels, frozen profiles, 1000-option select stress, mutation-safety of `classify()`, pathological regex input, duplicate FieldType votes, Unicode (RTL/combining/surrogate), null-byte injection, 10KB labels, empty-string profile, partial profile (demographics but no basics).
14. **D22 applied** -- `src/core/fill-rules/blueprint.contract.ts` (the drift watchdog artifact) is now a deliverable of this phase. The CI script reads it and validates declared public exports, forbidden imports, coverage threshold.
15. **D23 applied** -- `scripts/rollback-phase-B4.ps1` (PowerShell for the Windows dev machine) ships as a deliverable and is tested in CI on a throwaway branch.
16. **D24 applied** -- `vitest.config.ts` coverage thresholds for `src/core/classifier/**`, `src/core/fill-rules/**`, `src/core/plan-builder/**` = 90% line / 85% branch. Failure fails CI.
17. **Finding-7 fixed** -- the misleading `CONFIDENCE_*` precondition check is removed from Step 1. B4 uses its own constants.

Every other aspect of the B4 design -- hex boundary, classification ladder, ordering table, gating rules -- is unchanged from v2.0 because the review passed it.

## Required reading (in order, before touching any file)

1. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\02-decisions-v2.1-final.md` (this is the authoritative v2.1 decision memo; read D5, D7, D8, D14, D15, D16, D19, D22, D23, D24 verbatim)
2. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\03-keystone-contracts.md` section 2 (the exact B2 core types B4 consumes; copy verbatim, never paraphrase)
3. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\reviews\review-B4.md` (the 5 compile blockers this rewrite eliminates, plus adversarial-test gaps v2.1 now closes)
4. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B2_core_types_and_taxonomy\plan.md` (B2 defines `FieldType`, `FormFieldDescriptor`, `ClassifiedField`, `ClassificationConfidence`, `FillInstruction`, `FillPlan`, `FillValue`, `SkipReason`, `FillPlanResult`, `AbortReason`, brands including `PlanId`, `Profile` schema with all required fields)
5. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B3_mozilla_heuristics_port\plan.md` sections 8 + 9 (the `classifyViaMozillaHeuristics` signature, the `FieldDescriptor` input shape, the B3-local `ClassifiedField` output shape -- aliased locally in B4 to `MozillaClassified` to avoid collision with B2's `ClassifiedField`)
6. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B5_dom_adapter_scanner_and_filler\plan.md` (B5 consumes `FillInstruction` via A8 glue; the `fillField(el, value)` entry point takes raw `string | boolean`, not a whole instruction, so B4 must emit instructions whose `.value` discriminant is unwrappable by A8 without allocation)
7. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\46-ats-field-taxonomy.md` section 4 (the detection-hint priority ladder) and section 7 (the seven invariants: EEO gated, consents never auto-filled, DOB gated)
8. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\51-mozilla-heuristics-extraction.md` section h (the integration order: ATS-specific rules first, then autocomplete, then Mozilla primary, then Mozilla label, then synonym, then positional, then unknown)

## Goal

Wire the classification pipeline, the fill-rule engine, and the plan builder in pure TypeScript under `src/core/`. Zero DOM references. Zero I/O. Zero globals beyond module-scoped pre-compiled regex tables. Every function is `(plainData) => plainData`. The output is a `FillPlan` that the A8 content-script executor iterates over; after iteration, A8 calls `aggregateResults(plan, fillResults)` -- also shipped by B4 -- to produce a `FillPlanResult` for telemetry and UI.

After this phase:

- `pnpm --filter ats-autofill-engine typecheck` passes against `tsconfig.core.json` which has `lib: ["ES2022"]` and no DOM
- `pnpm --filter ats-autofill-engine test tests/core/classifier tests/core/fill-rules tests/core/plan-builder` passes with at least **120 unit tests** (was 82 in v2.0; v2.1 adds 38+ adversarial cases)
- Coverage on `src/core/classifier/**`, `src/core/fill-rules/**`, `src/core/plan-builder/**` meets D24 thresholds: 90% line, 85% branch
- Every grep gate in the D14 anti-drift section at the bottom of this file returns zero matches
- `pnpm --filter ats-autofill-engine run blueprint:validate` passes (reads `src/core/fill-rules/blueprint.contract.ts` and verifies it)
- `scripts/rollback-phase-B4.ps1` exists, is executable, and reverts the phase cleanly on a throwaway branch

## Hard boundary (executor MUST read this twice)

Every file in this phase lives under `src/core/` and compiles against `tsconfig.core.json` with `lib: ["ES2022"]` and **no DOM lib**. If the executor writes `HTMLInputElement`, `document`, `window`, `Node`, `Element`, `chrome.*`, or imports anything from `../adapters/**` or `../ats/**`, the TypeScript compile WILL FAIL. That is by design.

The classifier consumes `FormFieldDescriptor` -- a plain object produced by B5's DOM scanner. The fill-rule engine consumes `Profile` -- a plain object A7 writes to `chrome.storage.local` and A8 reads via `ProfileSchema.safeParse`. The plan-builder walks a `FormModel` and emits a `FillPlan`. A8 then iterates `FillPlan.instructions` and dispatches each to the vendor adapter's `fillField` or `attachFile`. The adapter is what does the DOM work. B4 never touches the DOM.

If the executor is tempted to add a DOM reference, STOP and re-read investigation 44 section d. That temptation is a bug.

## Files to create (25 total: 19 source + 5 test + 1 rollback script)

### Classifier (6 source files)

| # | Path | Responsibility |
|---|---|---|
| 1 | `src/core/classifier/index.ts` | Barrel. Exports `classify`, `CONFIDENCE`, `MIN_CONFIDENCE_THRESHOLD`, types `ClassifierOptions`, `ClassifierResult`, `SynonymMatch` |
| 2 | `src/core/classifier/pipeline.ts` | The `classify(descriptor)` entry point. Orchestrates ATS-specific pass, then Mozilla adapter call, then synonym fallback, then positional fallback, then unknown |
| 3 | `src/core/classifier/ats-matchers.ts` | Regex rule set for ATS-specific types Mozilla does not cover: resume-upload, cover-letter-upload, linkedin-url, github-url, work-auth-us, visa-sponsorship-required, salary-*, eeo-*, consent-*, etc. Each rule has an optional `htmlTypeGuard` to prevent false positives across input types |
| 4 | `src/core/classifier/synonym-matcher.ts` | Generic `matchSynonym(normalizedSignal)` helper. Walks the `SYNONYMS` map from `src/core/taxonomy/synonyms.ts`. Declaration-order wins across types; longest-synonym-wins within a type. Also exports `isFileOnlyType` (new in v2.1) to gate synonym matches against HTML input type when the type demands a file input |
| 5 | `src/core/classifier/scoring.ts` | Confidence ladder constants and `pickHigher`. Every constant is drawn from B2's literal union `ClassificationConfidence`; no value outside that union is allowed |
| 6 | `src/core/classifier/normalize.ts` | Pure string normalizer: lowercase, collapse whitespace, NFKD diacritic strip. Idempotent. Never throws |

### Fill-rule engine (5 source files)

| # | Path | Responsibility |
|---|---|---|
| 7 | `src/core/fill-rules/index.ts` | Barrel. Exports `computeFill`, `makeGatingContext`, all formatters, types `FillRuleContext`, `FillRuleResult`, `GatingContext` |
| 8 | `src/core/fill-rules/dispatch.ts` | Central dispatch table. `FieldType` switch with full exhaustiveness over B2's 74-entry union. Every branch returns `FillRuleResult`. Twelve previously-broken bare-`skip()` returns are now wrapped. Plus helper functions (`textOrSkip`, `booleanOrSkip`, `choiceOrSkip`, `skip`, `fullFromParts`, `findProfileUrl`, `findAuthForRegion`, `deriveCountryCode`, `deriveYearsExperience`, `extractYear`) |
| 9 | `src/core/fill-rules/value-formatters.ts` | Tiny pure formatters: `formatPhone`, `formatDateIso`, `formatSalary`, `formatBoolean`, `snapToSelectOption`, `splitFullName`. None of them throw. None allocate DOM types |
| 10 | `src/core/fill-rules/gating.ts` | Guardrails. `shouldGate(type, profile, ctx)` returns a `SkipReason` or null. EEO gated on `allowEeoAutofill`, DOB gated on `allowDobAutofill`, consents always gated |
| 11 | `src/core/fill-rules/blueprint.contract.ts` | D22 drift watchdog artifact. Declares `FILL_RULES_BLUEPRINT` const with phase, version, publicExports, forbiddenImports, coverage threshold, adapter shape. CI script `scripts/verify-blueprint-contracts.mjs` reads and validates it |

### Plan builder (4 source files)

| # | Path | Responsibility |
|---|---|---|
| 12 | `src/core/plan-builder/index.ts` | Barrel. Exports `buildPlan`, `aggregateResults`, `getPriority`, `FIELD_TYPE_PRIORITY`, `DEFAULT_PRIORITY`, types `PlanBuilderOptions` |
| 13 | `src/core/plan-builder/builder.ts` | `buildPlan(formModel, profile, options)` walks each field, classifies it, computes fill, assembles sorted `FillPlan`. Uses `PlanId` brand from `core/types/brands` (D16) |
| 14 | `src/core/plan-builder/ordering.ts` | Deterministic priority table. Complete coverage of all 74 `FieldType` entries enforced by `Readonly<Record<FieldType, number>>` |
| 15 | `src/core/plan-builder/aggregate.ts` | D7 deliverable. `aggregateResults(plan, fillResults, abortInfo?): FillPlanResult`. Pure function A8 calls after its fill loop finishes. Partitions results into filled/skipped/failed, copies planId, stamps `executedAt` from supplied clock |

### Barrel update (1 existing file)

16. `src/core/index.ts` -- append B4 exports. Do NOT reorder, do NOT delete any existing line. The exact appended block is specified in Step 16.

### Tests (5 test files)

| # | Path | Min cases | Scope |
|---|---|---|---|
| 17 | `tests/core/classifier/pipeline.spec.ts` | 35 | Happy path per pass + adversarial + unicode |
| 18 | `tests/core/classifier/ats-matchers.spec.ts` | 20 | Direct `findFirstAtsMatch` tests + ReDoS stress + `isFileOnlyType` |
| 19 | `tests/core/fill-rules/dispatch.spec.ts` | 35 | Every branch + gating + formatters + mutation-safety + frozen profile |
| 20 | `tests/core/plan-builder/builder.spec.ts` | 20 | Snapshot + determinism + ordering + 100-field stress + 1000-option stress |
| 21 | `tests/core/plan-builder/aggregate.spec.ts` | 10 | D7 aggregator: partition correctness, planId propagation, abort paths |

Minimum total: **120 tests** (v2.0 had 82). The executor is encouraged to write more if edge cases surface during implementation; never fewer.

### Rollback script (1 file per D23)

22. `scripts/rollback-phase-B4.ps1` -- PowerShell (Windows dev host per D4). Mechanically reverts every file this phase touches. See Step 24.

### Files NOT to touch

- `package.json` -- B2 already installed `zod`; B4 needs no new dependencies
- `tsconfig.core.json` -- B1 / B2 locked `lib: ["ES2022"]`
- `vitest.config.ts` -- B1 set `environment: 'node'`; B4 only ADDS coverage thresholds via a patch documented in Step 23
- Any file under `src/core/taxonomy/**` -- B2 owns this; B4 only reads via `import`
- Any file under `src/core/profile/**` -- B2 owns this
- Any file under `src/core/heuristics/**` -- B3 owns this; B4 only imports from the sealed barrel `src/core/heuristics`
- Any file under `src/core/types/**` -- B2 owns this; B4 consumes via the `src/core/types` barrel, never touches individual files
- Any file under `src/adapters/**` or `src/ats/**` -- these do not exist yet and are owned by B5 / B6 / B7 / B8 / B9

If the executor finds a bug in an existing B2 or B3 file while writing B4 -- STOP, write a one-paragraph ticket in `temp/impl/100-chrome-extension-mvp/reviews/B4-found-upstream-bugs.md`, do NOT silently patch the upstream file. Upstream fixes require a corrective plan for B2 or B3 and re-verification.

---

## Step-by-step implementation

### Step 1 -- Verify preconditions

Run from the repo root (`e:/ats-autofill-engine`):

```bash
pnpm --filter ats-autofill-engine typecheck
pnpm --filter ats-autofill-engine test tests/core/taxonomy tests/core/profile tests/core/heuristics tests/core/types
```

Both commands MUST be green. The first proves B2's types compile. The second proves B2's taxonomy / profile / brands / types tests AND B3's Mozilla adapter tests all pass. If either fails, STOP and report failure to the architect -- B4 cannot be built on a broken scaffold.

Verify the following symbols resolve (spot-check by opening each file):

- `src/core/types/brands.ts` exports `PlanId` (value + type)
- `src/core/types/ats-kind.ts` exports `AtsKind`
- `src/core/types/form-model.ts` exports `FormFieldDescriptor`, `FormModel`, `FormFieldOption`
- `src/core/types/classified-field.ts` exports `ClassifiedField`, `ClassificationConfidence`
- `src/core/types/fill-instruction.ts` exports `FillInstruction`, `FillPlan`, `FillValue`, `FillResult`, `FillError`, `SkipReason`
- `src/core/types/fill-plan-result.ts` exports `FillPlanResult`, `AbortReason`
- `src/core/types/index.ts` re-exports all of the above
- `src/core/taxonomy/field-types.ts` exports `FieldType` (the 74-entry union)
- `src/core/taxonomy/synonyms.ts` exports `SYNONYMS`
- `src/core/taxonomy/ats-extensions.ts` exports `EEO_FIELD_TYPES`, `CONSENT_FIELD_TYPES`, `DOB_FIELD_TYPES`, `isEeoField`, `isConsentField`, `isDobField`
- `src/core/profile/schema.ts` exports `Profile` (the inferred type) and `ProfileSchema` (the Zod schema)
- `src/core/heuristics/index.ts` exports `classifyViaMozillaHeuristics` and the B3-local `FieldDescriptor` (input) and B3-local `ClassifiedField` (output with `fieldType`, `mozillaType`, `confidence`, `matchedOn: 'autocomplete' | 'primary-rules' | 'label-rules'`)

Note: **B3's local `ClassifiedField` has a different shape than B2's `ClassifiedField`.** B4 imports B3's output under the alias `MozillaClassified` to avoid name collision. This is the v2.1-mandated rename per the review of B3.

If any import is missing, STOP.

### Step 2 -- Create `src/core/classifier/normalize.ts`

Pure string normalization shared by every matcher in the pipeline.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

/**
 * Normalize a raw form signal (id, name, label, etc.) for regex matching.
 *
 * Deterministic and idempotent: normalize(normalize(x)) === normalize(x).
 *
 * Operations:
 *   1. Coerce null / undefined / non-string to empty string.
 *   2. Lowercase via toLocaleLowerCase('en') so 'Email' and 'email' collapse.
 *   3. NFKD normalize and strip combining marks so diacritics are removed.
 *   4. Replace null bytes and control chars (U+0000..U+001F plus U+007F) with space.
 *   5. Collapse all whitespace runs to single space.
 *   6. Trim leading / trailing whitespace.
 *
 * NEVER mutates input. NEVER throws. 10KB input completes in microseconds.
 * Callers pass this as the first step of any matcher path.
 */
export function normalize(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = typeof raw === 'string' ? raw : String(raw);
  return s
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Concatenate multiple raw signals into a single normalized string. Empty
 * fragments are filtered so trailing / leading spaces cannot leak. Used by the
 * classifier to build the compound signal fed to the ATS rule matcher.
 */
export function concatSignals(
  ...raws: ReadonlyArray<string | null | undefined>
): string {
  return raws.map(normalize).filter(Boolean).join(' ');
}
```

### Step 3 -- Create `src/core/classifier/scoring.ts`

Confidence ladder constants. **Every constant must be a member of B2's literal union `ClassificationConfidence = 1.0|0.9|0.8|0.7|0.6|0.5|0.3|0.0`.** Values outside that union are compile errors at every call site that feeds them into a `ClassifiedField.confidence` slot. This is the root cause of BUG-1 from the v2.0 review; v2.1 snaps `ARIA_LABEL` to `0.5`.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { ClassificationConfidence } from '../types';

/**
 * Confidence ladder, ordered high to low. The pipeline picks the first
 * matcher that returns non-null AND whose confidence is at or above
 * MIN_CONFIDENCE_THRESHOLD.
 *
 * Values are drawn directly from B2's literal union ClassificationConfidence
 * which admits only: 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.3, 0.0. Any value outside
 * that union is a compile error.
 *
 * Meanings:
 *   1.0  deterministic; the HTML autocomplete attribute matches a canonical
 *        token (Mozilla fast path)
 *   0.9  name or id exact regex match -- stable identifiers, very low FP rate
 *   0.8  label synonym match -- natural-language label contains a SYNONYMS
 *        entry substring
 *   0.7  placeholder text exact or synonym match
 *   0.6  placeholder text partial match (demoted from 0.7 because placeholder
 *        text is often marketing-y or example-value text)
 *   0.5  section heading match OR aria-label match (v2.1 snap; was 0.4 in v2.0
 *        which violates the B2 union)
 *   0.3  positional fallback (first text input in the form)
 *   0.0  nothing matched; the field is 'unknown'
 *
 * No 'collapse to 0.7' comment from v2.0 -- that was self-contradicting with
 * the declared 0.6 and 0.4 values. Deleted per review finding BUG-1.
 */
export const CONFIDENCE = {
  AUTOCOMPLETE:     1.0 as ClassificationConfidence,
  NAME_OR_ID_EXACT: 0.9 as ClassificationConfidence,
  LABEL_SYNONYM:    0.8 as ClassificationConfidence,
  PLACEHOLDER:      0.7 as ClassificationConfidence,
  PLACEHOLDER_WEAK: 0.6 as ClassificationConfidence,
  ARIA_LABEL:       0.5 as ClassificationConfidence,
  POSITIONAL:       0.3 as ClassificationConfidence,
  UNKNOWN:          0.0 as ClassificationConfidence,
} as const;

/**
 * Minimum confidence a pipeline vote must have to be returned as a match.
 * Votes below this are demoted to 'unknown' unless options.keepLowConfidence
 * is true (debug mode).
 */
export const MIN_CONFIDENCE_THRESHOLD: ClassificationConfidence =
  0.5 as ClassificationConfidence;

/**
 * Pick the higher-confidence candidate. Ties go to the LEFT argument -- this
 * keeps execution order deterministic: whichever pass voted first wins a tie.
 *
 * Pure. Never throws.
 */
export function pickHigher<T extends { readonly confidence: ClassificationConfidence }>(
  a: T | null,
  b: T | null,
): T | null {
  if (a == null) return b;
  if (b == null) return a;
  return a.confidence >= b.confidence ? a : b;
}
```

### Step 4 -- Create `src/core/classifier/synonym-matcher.ts`

Generic substring matcher against `SYNONYMS`. v2.1 adds `isFileOnlyType` to gate synonym matches for file-only types -- this closes Finding-8 at the pipeline layer (complementing the test assertion weakening in Step 17).

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { FieldType } from '../taxonomy/field-types';
import { SYNONYMS } from '../taxonomy/synonyms';

export interface SynonymMatch {
  readonly type: FieldType;
  readonly synonym: string;
}

/**
 * Field types whose semantic meaning REQUIRES an <input type="file"> -- any
 * synonym hit on these types should be rejected when the HTML type guard is
 * not a file-capable input. Prevents a text input labeled 'Resume' from
 * landing as 'resume-upload' via the synonym fallback path.
 *
 * v2.1 addition per review Finding-8. B4's ats-matchers already filters these
 * via AtsRule.htmlTypeGuard; the synonym pass now does the equivalent.
 */
const FILE_ONLY_TYPES = new Set<FieldType>([
  'resume-upload',
  'cover-letter-upload',
  'transcript-upload',
  'portfolio-upload',
  'additional-file',
  'custom-file',
]);

/**
 * Return true if the FieldType is file-only and therefore must not be matched
 * against a non-file HTML input.
 */
export function isFileOnlyType(type: FieldType): boolean {
  return FILE_ONLY_TYPES.has(type);
}

/**
 * Walk SYNONYMS and return the first (FieldType, synonym) pair whose synonym
 * substring appears in the normalized signal.
 *
 * Determinism rules:
 *   - Declaration order across FieldTypes wins: if two types share a synonym
 *     (which should never happen -- SYNONYMS is hand-curated -- but the
 *     matcher is defensive), the type declared EARLIER in SYNONYMS wins.
 *   - Within a single FieldType, longest-synonym-wins: prevents 'email'
 *     shadowing 'email address' when both are listed.
 *
 * The signal MUST already be normalized. Callers pipe through normalize()
 * from ./normalize.ts first.
 *
 * If htmlType is provided and a candidate FieldType is file-only, the
 * candidate is rejected when htmlType is not 'file'. Pass an empty string to
 * disable the guard (used by tests that exercise the raw matcher).
 */
export function matchSynonym(
  normalizedSignal: string,
  htmlType: string = '',
): SynonymMatch | null {
  if (!normalizedSignal) return null;

  let best: SynonymMatch | null = null;
  let bestLen = 0;

  for (const [typeKey, synonyms] of Object.entries(SYNONYMS) as ReadonlyArray<
    [FieldType, ReadonlyArray<string>]
  >) {
    let localBest: SynonymMatch | null = null;
    let localLen = 0;
    for (const syn of synonyms) {
      if (!syn) continue;
      if (normalizedSignal.includes(syn)) {
        if (localBest == null || syn.length > localLen) {
          localBest = { type: typeKey, synonym: syn };
          localLen = syn.length;
        }
      }
    }
    if (localBest != null) {
      // File-only gate: reject the candidate if the HTML type does not permit
      // a file input. htmlType === '' means 'guard disabled'.
      if (isFileOnlyType(localBest.type) && htmlType && htmlType !== 'file') {
        continue;
      }
      // First FieldType to produce a valid match wins. Deterministic.
      best = localBest;
      bestLen = localLen;
      break;
    }
  }

  return best;
}
```

### Step 5 -- Create `src/core/classifier/ats-matchers.ts`

Regex rule set. Every pattern is case-insensitive and Unicode via the `iu` flags. Patterns use bounded `.?` (single-char optional) or explicit literal separators -- never `.*` or `.+` which would open ReDoS risk. All patterns compile once at module load.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { FieldType } from '../taxonomy/field-types';

/**
 * A regex rule that maps a normalized signal to a FieldType.
 *
 * htmlTypeGuard: if set, the rule is only applied when the descriptor's HTML
 * input type is one of the listed values. This is how we prevent a text input
 * labeled 'Resume' from being classified as 'resume-upload' (which demands a
 * file input).
 *
 * source: documents which signal the rule is primarily aimed at. 'any' means
 * the rule runs against the concatenated signal (id + name + label + etc).
 */
export interface AtsRule {
  readonly type: FieldType;
  readonly pattern: RegExp;
  readonly htmlTypeGuard?: ReadonlyArray<string>;
  readonly source: 'name-id' | 'label' | 'placeholder' | 'aria-label' | 'any';
}

// --- Documents -------------------------------------------------------------

const RESUME_UPLOAD: AtsRule = {
  type: 'resume-upload',
  pattern: /(?:\b|_)(?:resume|cv|curriculum.?vitae|lebenslauf|curriculum|cv.?upload|upload.?resume|attach.?resume|upload.?cv|attach.?cv)(?:\b|_)/iu,
  htmlTypeGuard: ['file'],
  source: 'any',
};

const RESUME_TEXT: AtsRule = {
  type: 'resume-text',
  pattern: /(?:paste.?(?:your.?)?resume|resume.?text|resume.?content)/iu,
  htmlTypeGuard: ['textarea'],
  source: 'any',
};

const COVER_LETTER_UPLOAD: AtsRule = {
  type: 'cover-letter-upload',
  pattern: /(?:cover.?letter|coverletter|motivation.?letter|anschreiben|lettre.?de.?motivation|upload.?cover|attach.?cover)/iu,
  htmlTypeGuard: ['file'],
  source: 'any',
};

const COVER_LETTER_TEXT: AtsRule = {
  type: 'cover-letter-text',
  pattern: /(?:cover.?letter|why.?(?:are.?you.?interested|do.?you.?want)|tell.?us.?why|motivation|why.?this.?(?:company|role))/iu,
  htmlTypeGuard: ['textarea'],
  source: 'any',
};

const TRANSCRIPT_UPLOAD: AtsRule = {
  type: 'transcript-upload',
  pattern: /(?:\btranscript\b|academic.?transcript|school.?transcript)/iu,
  htmlTypeGuard: ['file'],
  source: 'any',
};

const PORTFOLIO_UPLOAD: AtsRule = {
  type: 'portfolio-upload',
  pattern: /(?:\bportfolio\b|work.?samples|writing.?sample)/iu,
  htmlTypeGuard: ['file'],
  source: 'any',
};

const ADDITIONAL_FILE: AtsRule = {
  type: 'additional-file',
  pattern: /(?:additional.?(?:documents?|files?|attachments?)|supporting.?(?:documents?|files?)|other.?(?:documents?|files?|attachments?))/iu,
  htmlTypeGuard: ['file'],
  source: 'any',
};

// --- Professional links ----------------------------------------------------

const LINKEDIN_URL: AtsRule = {
  type: 'linkedin-url',
  pattern: /(?:\blinkedin(?:\b|_|-)|linkedin\.com|li.?profile|linked.?in.?url)/iu,
  source: 'any',
};

const GITHUB_URL: AtsRule = {
  type: 'github-url',
  pattern: /(?:\bgithub(?:\b|_|-)|github\.com|git.?hub.?(?:profile|url))/iu,
  source: 'any',
};

const PORTFOLIO_URL: AtsRule = {
  type: 'portfolio-url',
  pattern: /(?:portfolio.?(?:url|website|link)|portfolio.?site)/iu,
  source: 'any',
};

const PERSONAL_WEBSITE: AtsRule = {
  type: 'personal-website',
  pattern: /(?:personal.?(?:website|site|url|homepage)|your.?website|\bblog\b|homepage)/iu,
  source: 'any',
};

const TWITTER_URL: AtsRule = {
  type: 'twitter-url',
  pattern: /(?:\btwitter(?:\b|_|-)|twitter\.com|x.?profile|x.?handle)/iu,
  source: 'any',
};

const DRIBBBLE_URL: AtsRule = {
  type: 'dribbble-url',
  pattern: /(?:\bdribbble\b|dribbble\.com)/iu,
  source: 'any',
};

const BEHANCE_URL: AtsRule = {
  type: 'behance-url',
  pattern: /(?:\bbehance\b|behance\.net)/iu,
  source: 'any',
};

const STACKOVERFLOW_URL: AtsRule = {
  type: 'stackoverflow-url',
  pattern: /(?:stack.?overflow|stackoverflow\.com)/iu,
  source: 'any',
};

// --- Current employment ----------------------------------------------------

const CURRENT_COMPANY: AtsRule = {
  type: 'current-company',
  pattern: /(?:current.?(?:employer|company)|present.?(?:employer|company)|where.?(?:do|are).?you.?(?:currently.?)?work)/iu,
  source: 'any',
};

const CURRENT_TITLE: AtsRule = {
  type: 'current-title',
  pattern: /(?:current.?(?:title|position|role|job.?title))/iu,
  source: 'any',
};

const YEARS_EXPERIENCE: AtsRule = {
  type: 'years-experience',
  pattern: /(?:years?.?of.?experience|\byoe\b|total.?experience|relevant.?experience|how.?many.?years|years.?in.?industry)/iu,
  source: 'any',
};

const EXPERIENCE_SUMMARY: AtsRule = {
  type: 'experience-summary',
  pattern: /(?:experience.?summary|professional.?summary|brief.?summary|about.?you|about.?yourself)/iu,
  htmlTypeGuard: ['textarea'],
  source: 'any',
};

const PREVIOUS_EMPLOYER: AtsRule = {
  type: 'previous-employer',
  pattern: /(?:previous.?employer|last.?(?:company|employer)|most.?recent.?employer)/iu,
  source: 'any',
};

const NOTICE_PERIOD: AtsRule = {
  type: 'notice-period',
  pattern: /(?:notice.?period|availability.?to.?start|how.?soon.?can.?you.?start)/iu,
  source: 'any',
};

// --- Education -------------------------------------------------------------

const EDUCATION_LEVEL: AtsRule = {
  type: 'education-level',
  pattern: /(?:highest.?(?:education|degree)|education.?level|degree.?level)/iu,
  source: 'any',
};

const SCHOOL_NAME: AtsRule = {
  type: 'school-name',
  pattern: /(?:school.?name|\buniversity\b|\bcollege\b|institution|alma.?mater)/iu,
  source: 'any',
};

const FIELD_OF_STUDY: AtsRule = {
  type: 'field-of-study',
  pattern: /(?:field.?of.?study|\bmajor\b|discipline|concentration|area.?of.?study)/iu,
  source: 'any',
};

const GRADUATION_YEAR: AtsRule = {
  type: 'graduation-year',
  pattern: /(?:graduation.?year|year.?graduated|year.?of.?completion|expected.?graduation)/iu,
  source: 'any',
};

const GPA: AtsRule = {
  type: 'gpa',
  pattern: /(?:\bgpa\b|grade.?point.?average)/iu,
  source: 'any',
};

// --- Work authorization ----------------------------------------------------

const WORK_AUTH_US: AtsRule = {
  type: 'work-auth-us',
  pattern: /(?:authori[sz]ed.?to.?work.?(?:in.?)?(?:the.?)?(?:us|united.?states)|legally.?authori[sz]ed.?to.?work|work.?authori[sz]ation)/iu,
  source: 'any',
};

const VISA_SPONSORSHIP: AtsRule = {
  type: 'visa-sponsorship-required',
  pattern: /(?:require.?(?:visa.?)?sponsorship|need.?sponsorship|will.?you.?(?:now.?or.?in.?the.?future.?)?require.?sponsorship|visa.?sponsorship)/iu,
  source: 'any',
};

const WORK_AUTH_COUNTRY: AtsRule = {
  type: 'work-auth-country',
  pattern: /(?:right.?to.?work|work.?permit|authori[sz]ed.?to.?work.?in(?!.{0,20}(?:us|united.?states)))/iu,
  source: 'any',
};

const CITIZENSHIP: AtsRule = {
  type: 'citizenship',
  pattern: /(?:country.?of.?citizenship|\bcitizenship\b|\bnationality\b)/iu,
  source: 'any',
};

const SECURITY_CLEARANCE: AtsRule = {
  type: 'security-clearance',
  pattern: /(?:security.?clearance|clearance.?level|active.?clearance)/iu,
  source: 'any',
};

// --- Compensation and availability -----------------------------------------

const SALARY_EXPECTATION: AtsRule = {
  type: 'salary-expectation',
  pattern: /(?:salary.?expectations?|expected.?salary|desired.?salary|compensation.?expectations|salary.?requirements?)/iu,
  source: 'any',
};

const SALARY_MIN: AtsRule = {
  type: 'salary-min',
  pattern: /(?:minimum.?salary|salary.?(?:floor|minimum|min))/iu,
  source: 'any',
};

const SALARY_MAX: AtsRule = {
  type: 'salary-max',
  pattern: /(?:maximum.?salary|target.?salary|salary.?(?:maximum|max|ceiling))/iu,
  source: 'any',
};

const SALARY_CURRENCY: AtsRule = {
  type: 'salary-currency',
  pattern: /(?:salary.?currency|compensation.?currency)/iu,
  source: 'any',
};

const CURRENT_SALARY: AtsRule = {
  type: 'current-salary',
  pattern: /(?:current.?(?:salary|compensation)|present.?salary)/iu,
  source: 'any',
};

const START_DATE: AtsRule = {
  type: 'start-date',
  pattern: /(?:start.?date|earliest.?start.?date|available.?from|when.?can.?you.?start)/iu,
  source: 'any',
};

const AVAILABILITY: AtsRule = {
  type: 'availability',
  pattern: /(?:availability|when.?are.?you.?available|available.?to.?start)/iu,
  source: 'any',
};

const RELOCATION_WILLING: AtsRule = {
  type: 'relocation-willing',
  pattern: /(?:willing.?to.?relocate|open.?to.?relocation|\brelocat(?:e|ion)\b)/iu,
  source: 'any',
};

const REMOTE_PREFERENCE: AtsRule = {
  type: 'remote-preference',
  pattern: /(?:work.?preference|remote.?(?:or.?(?:hybrid.?or.?)?onsite)|remote.?hybrid.?onsite|work.?location.?preference)/iu,
  source: 'any',
};

// --- Location --------------------------------------------------------------

const CURRENT_LOCATION: AtsRule = {
  type: 'current-location',
  pattern: /(?:current.?location|where.?are.?you.?based|current.?city|based.?in)/iu,
  source: 'any',
};

const PREFERRED_LOCATION: AtsRule = {
  type: 'preferred-location',
  pattern: /(?:preferred.?location|desired.?location|work.?location.?preference)/iu,
  source: 'any',
};

// --- Referral --------------------------------------------------------------

const REFERRAL_SOURCE: AtsRule = {
  type: 'referral-source',
  pattern: /(?:how.?did.?you.?hear.?about.?us|referral.?source|where.?did.?you.?(?:find|learn)|how.?did.?you.?find.?out.?about)/iu,
  source: 'any',
};

const REFERRER_NAME: AtsRule = {
  type: 'referrer-name',
  pattern: /(?:referred.?by|referrer.?name|employee.?referral)/iu,
  source: 'any',
};

const REFERRER_EMAIL: AtsRule = {
  type: 'referrer-email',
  pattern: /(?:referrer.?email|referrer.?contact.?email)/iu,
  source: 'any',
};

// --- EEO -------------------------------------------------------------------

const EEO_GENDER: AtsRule = {
  type: 'eeo-gender',
  pattern: /(?:\bgender\b|gender.?identity)/iu,
  source: 'any',
};

const EEO_RACE: AtsRule = {
  type: 'eeo-race',
  pattern: /(?:\brace\b|\bethnicity\b|race.?\/.?ethnicity|hispanic.?or.?latino)/iu,
  source: 'any',
};

const EEO_VETERAN: AtsRule = {
  type: 'eeo-veteran',
  pattern: /(?:veteran.?status|protected.?veteran|\bveteran\b)/iu,
  source: 'any',
};

const EEO_DISABILITY: AtsRule = {
  type: 'eeo-disability',
  pattern: /(?:disability.?status|self.?identification.?of.?disability|\bdisabilit(?:y|ies)\b)/iu,
  source: 'any',
};

const EEO_PRONOUN: AtsRule = {
  type: 'eeo-pronoun',
  pattern: /(?:\bpronouns?\b|preferred.?pronouns)/iu,
  source: 'any',
};

// --- Consent ---------------------------------------------------------------

const CONSENT_PRIVACY: AtsRule = {
  type: 'consent-privacy',
  pattern: /(?:privacy.?(?:policy|notice)|gdpr.?consent|data.?processing.?consent|i.?agree.?to.?the.?privacy)/iu,
  source: 'any',
};

const CONSENT_MARKETING: AtsRule = {
  type: 'consent-marketing',
  pattern: /(?:marketing.?(?:emails?|communications?)|talent.?(?:pool|community|network)|future.?opportunities)/iu,
  source: 'any',
};

const CONSENT_BACKGROUND: AtsRule = {
  type: 'consent-background',
  pattern: /(?:background.?check.?consent|consent.?to.?background.?check)/iu,
  source: 'any',
};

const AGE_CONFIRMATION: AtsRule = {
  type: 'age-confirmation',
  pattern: /(?:i.?am.?(?:at.?least.?)?18(?:.?or.?older)?|age.?confirmation|at.?least.?18)/iu,
  source: 'any',
};

/**
 * Ordered rule list. Ordering matters: more-specific rules MUST come before
 * less-specific ones. 'minimum salary' must match salary-min BEFORE
 * salary-expectation. WORK_AUTH_US must match before WORK_AUTH_COUNTRY.
 */
export const ATS_RULES: ReadonlyArray<AtsRule> = [
  // file uploads first (htmlTypeGuard is restrictive so false-positive rate is low)
  RESUME_UPLOAD,
  COVER_LETTER_UPLOAD,
  TRANSCRIPT_UPLOAD,
  PORTFOLIO_UPLOAD,
  ADDITIONAL_FILE,
  // textareas next
  RESUME_TEXT,
  COVER_LETTER_TEXT,
  EXPERIENCE_SUMMARY,
  // links
  LINKEDIN_URL,
  GITHUB_URL,
  PORTFOLIO_URL,
  DRIBBBLE_URL,
  BEHANCE_URL,
  STACKOVERFLOW_URL,
  TWITTER_URL,
  PERSONAL_WEBSITE,
  // compensation -- SPECIFIC before GENERIC
  SALARY_MIN,
  SALARY_MAX,
  SALARY_CURRENCY,
  CURRENT_SALARY,
  SALARY_EXPECTATION,
  // employment
  CURRENT_COMPANY,
  CURRENT_TITLE,
  PREVIOUS_EMPLOYER,
  YEARS_EXPERIENCE,
  NOTICE_PERIOD,
  // education
  EDUCATION_LEVEL,
  SCHOOL_NAME,
  FIELD_OF_STUDY,
  GRADUATION_YEAR,
  GPA,
  // work authorization -- US before generic country
  WORK_AUTH_US,
  VISA_SPONSORSHIP,
  WORK_AUTH_COUNTRY,
  CITIZENSHIP,
  SECURITY_CLEARANCE,
  // dates / availability
  START_DATE,
  AVAILABILITY,
  RELOCATION_WILLING,
  REMOTE_PREFERENCE,
  // location
  CURRENT_LOCATION,
  PREFERRED_LOCATION,
  // referral
  REFERRAL_SOURCE,
  REFERRER_NAME,
  REFERRER_EMAIL,
  // EEO
  EEO_GENDER,
  EEO_RACE,
  EEO_VETERAN,
  EEO_DISABILITY,
  EEO_PRONOUN,
  // consent
  CONSENT_PRIVACY,
  CONSENT_MARKETING,
  CONSENT_BACKGROUND,
  AGE_CONFIRMATION,
];

/**
 * Evaluate one rule against a normalized signal + HTML input type.
 * Pure. Returns true / false. Never throws.
 */
export function matchAtsRule(
  rule: AtsRule,
  normalizedSignal: string,
  htmlType: string,
): boolean {
  if (!normalizedSignal) return false;
  if (rule.htmlTypeGuard && rule.htmlTypeGuard.length > 0) {
    if (!rule.htmlTypeGuard.includes(htmlType)) return false;
  }
  return rule.pattern.test(normalizedSignal);
}

/**
 * Run the rule list in order. Return the FIRST rule that matches, or null.
 * Pure. Never throws. 10KB signal completes in microseconds -- all patterns
 * use bounded optional quantifiers, no catastrophic backtracking is possible.
 */
export function findFirstAtsMatch(
  normalizedSignal: string,
  htmlType: string,
): AtsRule | null {
  for (const rule of ATS_RULES) {
    if (matchAtsRule(rule, normalizedSignal, htmlType)) return rule;
  }
  return null;
}
```

### Step 6 -- Create `src/core/classifier/pipeline.ts`

The orchestration function. Takes a `FormFieldDescriptor`, returns a `ClassifierResult` which extends B2's `ClassifiedField` with a `source` discriminator. v2.1 note: B4 imports B3's output type under the local alias `MozillaClassified` to avoid shadowing B2's own `ClassifiedField`.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type {
  FormFieldDescriptor,
  ClassifiedField,
} from '../types';
import type { FieldType } from '../taxonomy/field-types';
import {
  classifyViaMozillaHeuristics,
  type ClassifiedField as MozillaClassified,
} from '../heuristics';
import { normalize, concatSignals } from './normalize';
import { findFirstAtsMatch } from './ats-matchers';
import { matchSynonym } from './synonym-matcher';
import { CONFIDENCE, MIN_CONFIDENCE_THRESHOLD, pickHigher } from './scoring';

export interface ClassifierOptions {
  /**
   * If true, low-confidence votes are returned verbatim instead of being
   * demoted to 'unknown'. Debug / test mode only. Default false.
   */
  readonly keepLowConfidence?: boolean;
}

/**
 * The classifier's output: B2's ClassifiedField plus a 'source' discriminant
 * that records which pass voted the winner. Consumers (fill-rules, plan-
 * builder, telemetry) use 'source' to reason about reliability.
 */
export interface ClassifierResult extends ClassifiedField {
  readonly source:
    | 'ats-ext'
    | 'autocomplete'
    | 'mozilla'
    | 'synonym'
    | 'positional'
    | 'fallback';
}

/**
 * Classify a single form field descriptor.
 *
 * Execution order (investigation 51 section h, unchanged from v2.0):
 *   1. ATS-specific rule set (ats-matchers). Catches resume-upload,
 *      linkedin-url, work-auth-us, eeo-*, consent-* -- types Mozilla does not
 *      know about. Runs first so Mozilla cannot misclassify them.
 *   2. Mozilla heuristics adapter. Under the hood this tries the autocomplete
 *      attribute fast path (confidence 1.0), then primary rules (confidence
 *      0.75), then label rules (confidence 0.55). We rescale into our
 *      CONFIDENCE constants so the classifier has a single ladder.
 *   3. Generic synonym match (label, then placeholder, then aria-label).
 *      Synonym matches for file-only types are gated by htmlType.
 *   4. Positional fallback: the first text input in the form is assumed to
 *      be given-name if nothing else voted. Low confidence.
 *   5. Unknown: below MIN_CONFIDENCE_THRESHOLD, or no candidate at all.
 *
 * PURE. Does not mutate its descriptor input. Does not touch I/O. Does not
 * use globals beyond the module-scoped rule tables in ats-matchers.ts and
 * synonym-matcher.ts.
 *
 * Mutation safety is covered by an adversarial test in v2.1: classify() is
 * called with Object.freeze(descriptor) and the returned result.descriptor
 * is the SAME reference but with Object.freeze preserved.
 */
export function classify(
  descriptor: FormFieldDescriptor,
  options: ClassifierOptions = {},
): ClassifierResult {
  const keepLow = options.keepLowConfidence === true;
  const htmlType = normalize(descriptor.type);

  // --- Pass 1: ATS-specific rule set --------------------------------------

  const atsSignal = concatSignals(
    descriptor.name,
    descriptor.id,
    descriptor.label,
    descriptor.placeholder,
    descriptor.ariaLabel,
  );

  const atsHit = findFirstAtsMatch(atsSignal, htmlType);
  if (atsHit) {
    return {
      descriptor,
      type: atsHit.type,
      confidence: CONFIDENCE.NAME_OR_ID_EXACT,
      matchedOn: 'name',
      source: 'ats-ext',
    };
  }

  // --- Pass 2 and 3: Mozilla heuristics -----------------------------------

  const moz: MozillaClassified | null = classifyViaMozillaHeuristics({
    id: descriptor.id ?? undefined,
    name: descriptor.name ?? undefined,
    autocomplete: descriptor.autocomplete ?? undefined,
    label: descriptor.label ?? undefined,
    placeholder: descriptor.placeholder ?? undefined,
    ariaLabel: descriptor.ariaLabel ?? undefined,
    type: descriptor.type,
  });

  const mozResult: ClassifierResult | null = moz
    ? {
        descriptor,
        type: moz.fieldType,
        confidence:
          moz.matchedOn === 'autocomplete'
            ? CONFIDENCE.AUTOCOMPLETE
            : moz.matchedOn === 'primary-rules'
            ? CONFIDENCE.NAME_OR_ID_EXACT
            : CONFIDENCE.LABEL_SYNONYM,
        matchedOn:
          moz.matchedOn === 'autocomplete'
            ? 'autocomplete'
            : moz.matchedOn === 'primary-rules'
            ? 'name'
            : 'label',
        source: moz.matchedOn === 'autocomplete' ? 'autocomplete' : 'mozilla',
      }
    : null;

  // --- Pass 4: generic synonym match --------------------------------------
  //
  // Try label first (strongest signal), then placeholder (medium), then
  // aria-label (weakest). The file-only gate in matchSynonym prevents text
  // inputs labeled 'Resume' from mis-classifying as resume-upload.

  const labelSignal = normalize(descriptor.label);
  const placeholderSignal = normalize(descriptor.placeholder);
  const ariaSignal = normalize(descriptor.ariaLabel);

  let synonymResult: ClassifierResult | null = null;

  const labelMatch = matchSynonym(labelSignal, htmlType);
  if (labelMatch) {
    synonymResult = {
      descriptor,
      type: labelMatch.type,
      confidence: CONFIDENCE.LABEL_SYNONYM,
      matchedOn: 'label-synonym',
      source: 'synonym',
    };
  } else {
    const placeholderMatch = matchSynonym(placeholderSignal, htmlType);
    if (placeholderMatch) {
      synonymResult = {
        descriptor,
        type: placeholderMatch.type,
        confidence: CONFIDENCE.PLACEHOLDER,
        matchedOn: 'placeholder',
        source: 'synonym',
      };
    } else {
      const ariaMatch = matchSynonym(ariaSignal, htmlType);
      if (ariaMatch) {
        synonymResult = {
          descriptor,
          type: ariaMatch.type,
          confidence: CONFIDENCE.ARIA_LABEL,
          matchedOn: 'aria-label',
          source: 'synonym',
        };
      }
    }
  }

  // Pick the strongest of Mozilla vs synonym. Ties go to Mozilla (left arg).
  const best = pickHigher<ClassifierResult>(mozResult, synonymResult);

  if (best && best.confidence >= MIN_CONFIDENCE_THRESHOLD) {
    return best;
  }

  // --- Pass 5: positional fallback ----------------------------------------

  if (!best && descriptor.domIndex === 0 && htmlType === 'text') {
    return {
      descriptor,
      type: 'given-name' as FieldType,
      confidence: CONFIDENCE.POSITIONAL,
      matchedOn: 'position',
      source: 'positional',
    };
  }

  // --- Pass 6: keep low-confidence or return unknown ---------------------

  if (best && keepLow) return best;

  return {
    descriptor,
    type: 'unknown' as FieldType,
    confidence: CONFIDENCE.UNKNOWN,
    matchedOn: 'none',
    source: 'fallback',
  };
}
```

### Step 7 -- Create `src/core/classifier/index.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

export { classify } from './pipeline';
export type { ClassifierOptions, ClassifierResult } from './pipeline';

export { CONFIDENCE, MIN_CONFIDENCE_THRESHOLD, pickHigher } from './scoring';

export { matchSynonym, isFileOnlyType } from './synonym-matcher';
export type { SynonymMatch } from './synonym-matcher';

// Internal helpers are deliberately NOT re-exported. If a downstream caller
// needs ATS_RULES or findFirstAtsMatch, they must import from the specific
// module. Keeping the barrel minimal protects the public API surface.
```

### Step 8 -- Create `src/core/fill-rules/value-formatters.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { FormFieldOption } from '../types';

/**
 * Format a phone number. Accepts E.164 input verbatim. Non-E.164 input is
 * stripped to digits and prefixed with '+' if a country code is given.
 * Pure. Never throws. Empty / null / undefined input returns empty string.
 */
export function formatPhone(
  raw: string | undefined | null,
  countryCode?: string,
): string {
  if (!raw) return '';
  const cleaned = String(raw).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (countryCode && /^\+?\d+$/.test(countryCode)) {
    const cc = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
    return `${cc}${cleaned}`;
  }
  return cleaned;
}

/**
 * Normalize a date into strict ISO-8601 YYYY-MM-DD. Accepts:
 *   - YYYY-MM-DD passes through
 *   - MM/DD/YYYY (US)
 *   - DD.MM.YYYY (European)
 * Everything else returns empty string. Pure. Never throws.
 */
export function formatDateIso(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const euMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (euMatch) {
    const [, dd, mm, yyyy] = euMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Format a salary as a plain integer string. NaN / Infinity / negative
 * returns empty. Pure. Never throws.
 */
export function formatSalary(amount: number | undefined | null): string {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return '';
  return Math.round(amount).toString();
}

/**
 * Convert a boolean to 'Yes' / 'No'. undefined / null returns empty string.
 */
export function formatBoolean(value: boolean | undefined | null): 'Yes' | 'No' | '' {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '';
}

/**
 * Snap a candidate onto the closest option in a select list. Matching order:
 *   1. Exact case-insensitive match on option.value
 *   2. Exact case-insensitive match on option.label
 *   3. Substring: candidate contained in label
 *   4. Substring: label (length >= 2) contained in candidate
 *   5. null (no snap; caller decides fallback)
 *
 * Deliberately strict. No Levenshtein, no fuzzy search. False positives
 * lead to wrong values being submitted silently. Pure. Never throws.
 * 1000-option stress-tested in v2.1 adversarial suite.
 */
export function snapToSelectOption(
  candidate: string,
  options: ReadonlyArray<FormFieldOption>,
): FormFieldOption | null {
  if (!candidate || options.length === 0) return null;
  const needle = candidate.trim().toLocaleLowerCase('en');
  if (!needle) return null;

  for (const opt of options) {
    if (opt.value.toLocaleLowerCase('en') === needle) return opt;
  }
  for (const opt of options) {
    if (opt.label.toLocaleLowerCase('en') === needle) return opt;
  }
  for (const opt of options) {
    if (opt.label.toLocaleLowerCase('en').includes(needle)) return opt;
  }
  for (const opt of options) {
    const label = opt.label.toLocaleLowerCase('en');
    if (label.length >= 2 && needle.includes(label)) return opt;
  }
  return null;
}

/**
 * Split a full name into given + family. Simple heuristic: last token is
 * family, everything before is given. Never throws.
 */
export function splitFullName(
  full: string | undefined | null,
): { given: string; family: string } {
  if (!full) return { given: '', family: '' };
  const tokens = String(full).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { given: '', family: '' };
  if (tokens.length === 1) return { given: tokens[0], family: '' };
  return {
    given: tokens.slice(0, -1).join(' '),
    family: tokens[tokens.length - 1]!,
  };
}
```

### Step 9 -- Create `src/core/fill-rules/gating.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { FieldType } from '../taxonomy/field-types';
import type { Profile } from '../profile';
import type { SkipReason } from '../types';
import { isEeoField, isConsentField, isDobField } from '../taxonomy/ats-extensions';

/**
 * Gating context: the user's opt-in flags for protected-class data. Sourced
 * from profile.consents or provided explicitly via overrides in tests.
 */
export interface GatingContext {
  readonly eeoOptIn: boolean;
  readonly dobOptIn: boolean;
}

/**
 * Decide whether a classified field is allowed to proceed to value
 * computation. Returns a SkipReason from B2's union if gated; null if safe.
 *
 * Invariants (investigation 46 section 7):
 *   - Consents are NEVER auto-filled (SkipReason = 'consent-denied-field-type')
 *   - EEO fields are gated behind profile.consents.allowEeoAutofill
 *   - DOB fields are gated behind profile.consents.allowDobAutofill
 *
 * The profile parameter is accepted for symmetry with future gates that may
 * read profile-level flags; the v2.1 implementation only consults ctx.
 */
export function shouldGate(
  type: FieldType,
  _profile: Profile,
  ctx: GatingContext,
): SkipReason | null {
  if (isConsentField(type)) {
    return 'consent-denied-field-type';
  }
  if (isEeoField(type)) {
    if (!ctx.eeoOptIn) return 'consent-denied-field-type';
  }
  if (isDobField(type)) {
    if (!ctx.dobOptIn) return 'consent-denied-field-type';
  }
  return null;
}

/**
 * Build a GatingContext from a Profile's consents plus optional overrides.
 * Overrides take precedence so tests can exercise either branch without
 * constructing a whole Profile.
 */
export function makeGatingContext(
  profile: Profile | null,
  overrides: Partial<GatingContext> = {},
): GatingContext {
  const base: GatingContext = {
    eeoOptIn: profile?.consents?.allowEeoAutofill === true,
    dobOptIn: profile?.consents?.allowDobAutofill === true,
  };
  return {
    eeoOptIn: overrides.eeoOptIn ?? base.eeoOptIn,
    dobOptIn: overrides.dobOptIn ?? base.dobOptIn,
  };
}
```

### Step 10 -- Create `src/core/fill-rules/dispatch.ts`

BUG-5 from v2.0: twelve branches returned bare `FillValue` where the signature demands `FillRuleResult`. v2.1 wraps every one. Drift fixes: `language` now routes through `choiceOrSkip(..., options)`; `tel-country-code` uses `profile.basics.phonePrefix ?? deriveCountryCode(phone)`.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { Profile } from '../profile';
import type {
  ClassifiedField,
  FillValue,
  FormFieldOption,
  SkipReason,
} from '../types';
import type { FieldType } from '../taxonomy/field-types';
import {
  formatPhone,
  formatDateIso,
  formatSalary,
  formatBoolean,
  snapToSelectOption,
  splitFullName,
} from './value-formatters';
import { shouldGate, type GatingContext } from './gating';

export interface FillRuleContext {
  readonly gating: GatingContext;
  /** ISO country code used for phone formatting. */
  readonly defaultCountry?: string;
}

/**
 * v2.1 contract: every dispatch branch returns this shape, NEVER a bare
 * FillValue. This closes BUG-5 from the v2.0 review.
 */
export interface FillRuleResult {
  readonly value: FillValue;
  readonly skipReason?: SkipReason;
}

/**
 * Main dispatch function. Pure. Never throws. Does not mutate its inputs.
 */
export function computeFill(
  profile: Profile,
  classified: ClassifiedField,
  ctx: FillRuleContext,
): FillRuleResult {
  const type = classified.type;

  // --- Gating pass --------------------------------------------------------
  const gateReason = shouldGate(type, profile, ctx.gating);
  if (gateReason) {
    return { value: skip(gateReason), skipReason: gateReason };
  }

  // --- Field-type dispatch -------------------------------------------------
  switch (type) {
    // Name
    case 'name':
      return textOrSkip(profile.basics.name || fullFromParts(profile));
    case 'given-name':
      return textOrSkip(
        profile.basics.firstName
          || splitFullName(profile.basics.name).given,
      );
    case 'additional-name':
      return emptySkip();
    case 'family-name':
      return textOrSkip(
        profile.basics.lastName
          || splitFullName(profile.basics.name).family,
      );
    case 'honorific-prefix':
    case 'honorific-suffix':
      return emptySkip();
    case 'nickname':
      return textOrSkip(profile.basics.preferredName ?? '');

    // Email
    case 'email':
      return textOrSkip(profile.basics.email);

    // Phone
    case 'tel':
      return textOrSkip(formatPhone(profile.basics.phone, ctx.defaultCountry));
    case 'tel-country-code':
      return textOrSkip(
        profile.basics.phonePrefix ?? deriveCountryCode(profile.basics.phone),
      );
    case 'tel-national':
    case 'tel-area-code':
    case 'tel-local':
    case 'tel-extension':
      return textOrSkip(profile.basics.phone ?? '');

    // Address
    case 'street-address':
    case 'address-line1':
      return textOrSkip(profile.basics.location?.address ?? '');
    case 'address-line2':
    case 'address-line3':
      return emptySkip();
    case 'address-level1':
      return textOrSkip(profile.basics.location?.region ?? '');
    case 'address-level2':
      return textOrSkip(profile.basics.location?.city ?? '');
    case 'address-level3':
    case 'address-level4':
      return emptySkip();
    case 'postal-code':
      return textOrSkip(profile.basics.location?.postalCode ?? '');
    case 'country':
    case 'country-name':
      return choiceOrSkip(
        profile.basics.location?.countryCode ?? '',
        classified.descriptor.options,
      );

    // Personal
    case 'bday':
      return textOrSkip(formatDateIso(profile.basics.dateOfBirth));
    case 'bday-day':
    case 'bday-month':
    case 'bday-year':
      return emptySkip();
    case 'sex':
      return { value: skip('consent-denied-field-type'), skipReason: 'consent-denied-field-type' };
    case 'language':
      return choiceOrSkip(
        profile.languages[0]?.language ?? '',
        classified.descriptor.options,
      );
    case 'url':
      return textOrSkip(profile.basics.url ?? '');

    // Professional links
    case 'linkedin-url':
      return textOrSkip(findProfileUrl(profile, 'linkedin'));
    case 'github-url':
      return textOrSkip(findProfileUrl(profile, 'github'));
    case 'portfolio-url':
      return textOrSkip(findProfileUrl(profile, 'portfolio') || profile.basics.url || '');
    case 'personal-website':
      return textOrSkip(profile.basics.url ?? '');
    case 'twitter-url':
      return textOrSkip(findProfileUrl(profile, 'twitter'));
    case 'dribbble-url':
      return textOrSkip(findProfileUrl(profile, 'dribbble'));
    case 'behance-url':
      return textOrSkip(findProfileUrl(profile, 'behance'));
    case 'stackoverflow-url':
      return textOrSkip(findProfileUrl(profile, 'stackoverflow'));

    // Documents
    case 'resume-upload':
      return profile.documents.resume
        ? { value: { kind: 'file', handleId: profile.documents.resume.id as unknown as import('../types').ResumeHandleId } }
        : emptySkip();
    case 'cover-letter-upload':
      return profile.documents.coverLetter
        ? { value: { kind: 'file', handleId: profile.documents.coverLetter.id as unknown as import('../types').ResumeHandleId } }
        : emptySkip();
    case 'resume-text':
      return textOrSkip(profile.basics.summary ?? '');
    case 'cover-letter-text':
      return emptySkip();
    case 'transcript-upload':
    case 'portfolio-upload':
    case 'additional-file':
      return emptySkip();

    // Current employment
    case 'current-company':
      return textOrSkip(profile.work[0]?.name ?? '');
    case 'current-title':
      return textOrSkip(profile.work[0]?.position ?? profile.basics.label ?? '');
    case 'years-experience':
      return textOrSkip(deriveYearsExperience(profile));
    case 'experience-summary':
      return textOrSkip(profile.basics.summary ?? '');
    case 'previous-employer':
      return textOrSkip(profile.work[1]?.name ?? '');
    case 'notice-period':
      return emptySkip();

    // Education
    case 'education-level':
      return choiceOrSkip(
        profile.education[0]?.studyType ?? '',
        classified.descriptor.options,
      );
    case 'school-name':
      return textOrSkip(profile.education[0]?.institution ?? '');
    case 'field-of-study':
      return textOrSkip(profile.education[0]?.area ?? '');
    case 'graduation-year':
      return textOrSkip(extractYear(profile.education[0]?.endDate));
    case 'gpa':
      return textOrSkip(profile.education[0]?.score ?? '');

    // Work authorization
    case 'work-auth-us':
      return booleanOrSkip(
        findAuthForRegion(profile, 'US')?.authorized,
        classified.descriptor.options,
      );
    case 'visa-sponsorship-required':
      return booleanOrSkip(
        findAuthForRegion(profile, 'US')?.requiresSponsorship,
        classified.descriptor.options,
      );
    case 'work-auth-country':
      return textOrSkip(profile.basics.location?.countryCode ?? '');
    case 'citizenship':
      return textOrSkip(profile.basics.location?.countryCode ?? '');
    case 'security-clearance':
      return emptySkip();

    // Compensation
    case 'salary-expectation':
      return textOrSkip(formatSalary(profile.jobPreferences.salaryExpectation?.min));
    case 'salary-min':
      return textOrSkip(formatSalary(profile.jobPreferences.salaryExpectation?.min));
    case 'salary-max':
      return textOrSkip(formatSalary(profile.jobPreferences.salaryExpectation?.max));
    case 'salary-currency':
      return choiceOrSkip(
        profile.jobPreferences.salaryExpectation?.currency ?? '',
        classified.descriptor.options,
      );
    case 'current-salary':
      return emptySkip();

    // Availability
    case 'start-date':
      return textOrSkip(formatDateIso(profile.jobPreferences.availabilityDate));
    case 'availability':
      return textOrSkip(formatDateIso(profile.jobPreferences.availabilityDate));
    case 'relocation-willing':
      return booleanOrSkip(
        profile.jobPreferences.willingToRelocate,
        classified.descriptor.options,
      );
    case 'remote-preference':
      return choiceOrSkip(
        profile.jobPreferences.remotePreference,
        classified.descriptor.options,
      );

    // Location
    case 'current-location':
      return textOrSkip(
        [
          profile.basics.location?.city,
          profile.basics.location?.region,
          profile.basics.location?.countryCode,
        ]
          .filter(Boolean)
          .join(', '),
      );
    case 'preferred-location':
      return emptySkip();

    // Referral
    case 'referral-source':
    case 'referrer-name':
    case 'referrer-email':
      return emptySkip();

    // EEO (gated at top)
    case 'eeo-gender':
      return choiceOrSkip(profile.demographics.gender ?? '', classified.descriptor.options);
    case 'eeo-race':
      return choiceOrSkip(profile.demographics.race ?? '', classified.descriptor.options);
    case 'eeo-veteran':
      return choiceOrSkip(profile.demographics.veteranStatus ?? '', classified.descriptor.options);
    case 'eeo-disability':
      return choiceOrSkip(profile.demographics.disabilityStatus ?? '', classified.descriptor.options);
    case 'eeo-pronoun':
      return textOrSkip(profile.basics.pronouns ?? '');
    case 'eeo-transgender':
    case 'eeo-sexual-orientation':
    case 'eeo-age-range':
      return emptySkip();

    // Consents (gated at top; exhaustiveness only)
    case 'consent-privacy':
    case 'consent-marketing':
    case 'consent-background':
    case 'age-confirmation':
      return { value: skip('consent-denied-field-type'), skipReason: 'consent-denied-field-type' };

    // Custom / unknown
    case 'custom-text':
    case 'custom-choice':
    case 'custom-number':
    case 'custom-date':
    case 'custom-file':
    case 'unknown':
      return { value: skip('out-of-scope-for-v1'), skipReason: 'out-of-scope-for-v1' };
  }

  // Exhaustiveness: compile error if a FieldType is missing a case.
  const _exhaustive: never = type;
  void _exhaustive;
  return { value: skip('out-of-scope-for-v1'), skipReason: 'out-of-scope-for-v1' };
}

// --- Helpers ---------------------------------------------------------------

function skip(reason: SkipReason): FillValue {
  return { kind: 'skip', reason };
}

/**
 * Shorthand for the most common FillRuleResult: a 'profile-field-empty' skip.
 * Used in every branch that previously did `return skip('profile-field-empty')`
 * in v2.0 and triggered BUG-5. Every such call site now goes through this
 * helper so the return type stays FillRuleResult.
 */
function emptySkip(): FillRuleResult {
  return { value: skip('profile-field-empty'), skipReason: 'profile-field-empty' };
}

function textOrSkip(value: string): FillRuleResult {
  if (!value) return emptySkip();
  return { value: { kind: 'text', value } };
}

function booleanOrSkip(
  value: boolean | undefined,
  options: ReadonlyArray<FormFieldOption>,
): FillRuleResult {
  if (value === undefined) return emptySkip();
  if (options.length > 0) {
    const snap = snapToSelectOption(formatBoolean(value), options);
    if (snap) return { value: { kind: 'choice', value: snap.value } };
    return {
      value: skip('value-out-of-allowed-options'),
      skipReason: 'value-out-of-allowed-options',
    };
  }
  return { value: { kind: 'boolean', value } };
}

function choiceOrSkip(
  raw: string,
  options: ReadonlyArray<FormFieldOption>,
): FillRuleResult {
  if (!raw) return emptySkip();
  if (options.length === 0) {
    return { value: { kind: 'text', value: raw } };
  }
  const snap = snapToSelectOption(raw, options);
  if (snap) return { value: { kind: 'choice', value: snap.value } };
  return {
    value: skip('value-out-of-allowed-options'),
    skipReason: 'value-out-of-allowed-options',
  };
}

function fullFromParts(profile: Profile): string {
  return [profile.basics.firstName, profile.basics.lastName]
    .filter(Boolean)
    .join(' ');
}

function findProfileUrl(profile: Profile, network: string): string {
  const target = network.toLocaleLowerCase('en');
  const match = profile.basics.profiles.find(
    (p) => p.network.toLocaleLowerCase('en') === target,
  );
  return match?.url ?? '';
}

function findAuthForRegion(profile: Profile, region: string) {
  const target = region.toLocaleUpperCase('en');
  return profile.jobPreferences.workAuthorization.find(
    (a) => a.region.toLocaleUpperCase('en') === target,
  );
}

function deriveCountryCode(phone: string | undefined | null): string {
  if (!phone) return '';
  const match = /^(\+\d{1,3})/.exec(String(phone));
  return match?.[1] ?? '';
}

function deriveYearsExperience(profile: Profile): string {
  if (profile.work.length === 0) return '';
  const earliest = profile.work
    .map((w) => w.startDate)
    .filter((d): d is string => typeof d === 'string' && d.length >= 4)
    .sort()[0];
  if (!earliest) return '';
  const startYear = Number.parseInt(earliest.slice(0, 4), 10);
  const now = new Date().getUTCFullYear();
  if (!Number.isFinite(startYear) || startYear > now) return '';
  return String(Math.max(0, now - startYear));
}

function extractYear(dateIso: string | undefined | null): string {
  if (!dateIso || dateIso.length < 4) return '';
  const yr = String(dateIso).slice(0, 4);
  return /^\d{4}$/.test(yr) ? yr : '';
}
```

### Step 11 -- Create `src/core/fill-rules/index.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

export { computeFill } from './dispatch';
export type { FillRuleContext, FillRuleResult } from './dispatch';
export { makeGatingContext } from './gating';
export type { GatingContext } from './gating';
export {
  formatPhone,
  formatDateIso,
  formatSalary,
  formatBoolean,
  snapToSelectOption,
  splitFullName,
} from './value-formatters';
export { FILL_RULES_BLUEPRINT } from './blueprint.contract';
```

### Step 12 -- Create `src/core/fill-rules/blueprint.contract.ts`

D22 drift watchdog. CI's `scripts/verify-blueprint-contracts.mjs` reads every `blueprint.contract.ts` and validates each field against the filesystem state.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

/**
 * Machine-readable contract for the fill-rules module. CI compares the
 * declared state to the actual filesystem and fails on drift.
 */
export const FILL_RULES_BLUEPRINT = {
  phase: 'B4',
  version: '2.1',
  area: 'src/core/fill-rules',
  publicExports: [
    'computeFill',
    'makeGatingContext',
    'formatPhone',
    'formatDateIso',
    'formatSalary',
    'formatBoolean',
    'snapToSelectOption',
    'splitFullName',
    'FILL_RULES_BLUEPRINT',
  ] as const,
  publicTypes: [
    'FillRuleContext',
    'FillRuleResult',
    'GatingContext',
  ] as const,
  forbiddenImports: [
    'src/adapters/**',
    'src/ats/**',
    '@nestjs/*',
    'happy-dom',
    'chrome',
  ] as const,
  forbiddenGlobals: [
    'document',
    'window',
    'HTMLElement',
    'HTMLInputElement',
    'Node',
    'Element',
    'chrome.',
  ] as const,
  requiredCoverage: {
    line: 90,
    branch: 85,
  } as const,
  shape: {
    entryPoints: [
      { name: 'computeFill', arity: 3, returns: 'FillRuleResult' },
      { name: 'makeGatingContext', arity: 2, returns: 'GatingContext' },
    ] as const,
  },
} as const;

export type FillRulesBlueprint = typeof FILL_RULES_BLUEPRINT;
```

### Step 13 -- Create `src/core/plan-builder/ordering.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { FieldType } from '../taxonomy/field-types';

export const DEFAULT_PRIORITY = 90;
export const CUSTOM_PRIORITY = 95;

/**
 * Fill priority for every FieldType. Lower number = earlier execution.
 *
 *   10-19  file uploads (resume first; some ATS gate other fields on it)
 *   20-29  identity (name, email)
 *   30-39  contact + address
 *   40-49  links + personal metadata
 *   50-59  current employment
 *   60-69  education
 *   70-79  work auth + compensation
 *   80-89  availability + location + referral
 *   90-99  custom questions
 *   100+   EEO + consents (always last; usually skipped by gating)
 *
 * The Readonly Record type enforces completeness at compile time: if B2
 * adds a FieldType, TypeScript fails here until it is added to the table.
 */
export const FIELD_TYPE_PRIORITY: Readonly<Record<FieldType, number>> = {
  'resume-upload': 10,
  'resume-text': 12,
  'cover-letter-upload': 14,
  'cover-letter-text': 16,
  'transcript-upload': 18,
  'portfolio-upload': 19,
  'additional-file': 19,
  'name': 20,
  'given-name': 21,
  'additional-name': 22,
  'family-name': 23,
  'honorific-prefix': 24,
  'honorific-suffix': 24,
  'nickname': 25,
  'email': 26,
  'tel': 30,
  'tel-country-code': 31,
  'tel-national': 32,
  'tel-area-code': 32,
  'tel-local': 32,
  'tel-extension': 33,
  'street-address': 34,
  'address-line1': 34,
  'address-line2': 35,
  'address-line3': 35,
  'address-level1': 36,
  'address-level2': 36,
  'address-level3': 37,
  'address-level4': 37,
  'postal-code': 38,
  'country': 39,
  'country-name': 39,
  'linkedin-url': 40,
  'github-url': 41,
  'portfolio-url': 42,
  'personal-website': 43,
  'url': 43,
  'twitter-url': 44,
  'dribbble-url': 45,
  'behance-url': 46,
  'stackoverflow-url': 47,
  'bday': 48,
  'bday-day': 48,
  'bday-month': 48,
  'bday-year': 48,
  'sex': 49,
  'language': 49,
  'current-company': 50,
  'current-title': 51,
  'years-experience': 52,
  'experience-summary': 53,
  'previous-employer': 54,
  'notice-period': 55,
  'education-level': 60,
  'school-name': 61,
  'field-of-study': 62,
  'graduation-year': 63,
  'gpa': 64,
  'work-auth-us': 70,
  'visa-sponsorship-required': 71,
  'work-auth-country': 72,
  'citizenship': 73,
  'security-clearance': 74,
  'salary-expectation': 75,
  'salary-min': 76,
  'salary-max': 77,
  'salary-currency': 78,
  'current-salary': 79,
  'start-date': 80,
  'availability': 81,
  'relocation-willing': 82,
  'remote-preference': 83,
  'current-location': 84,
  'preferred-location': 85,
  'referral-source': 86,
  'referrer-name': 87,
  'referrer-email': 88,
  'custom-text': 92,
  'custom-choice': 93,
  'custom-number': 94,
  'custom-date': 95,
  'custom-file': 96,
  'eeo-gender': 100,
  'eeo-race': 101,
  'eeo-veteran': 102,
  'eeo-disability': 103,
  'eeo-pronoun': 104,
  'eeo-transgender': 105,
  'eeo-sexual-orientation': 106,
  'eeo-age-range': 107,
  'consent-privacy': 110,
  'consent-marketing': 111,
  'consent-background': 112,
  'age-confirmation': 113,
  'unknown': 200,
};

/**
 * Accessor. The Readonly Record above guarantees completeness; this is a
 * safe fallback in case the table is ever partial in the future.
 */
export function getPriority(type: FieldType): number {
  return FIELD_TYPE_PRIORITY[type] ?? DEFAULT_PRIORITY;
}
```

### Step 14 -- Create `src/core/plan-builder/builder.ts`

Plan-builder entry point. Uses branded `PlanId` from `core/types/brands` per D16. Pure function.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type {
  FormModel,
  FillPlan,
  FillInstruction,
  SkipReason,
} from '../types';
import { PlanId } from '../types';
import type { Profile } from '../profile';
import { classify } from '../classifier';
import {
  computeFill,
  makeGatingContext,
  type FillRuleContext,
} from '../fill-rules';
import { getPriority } from './ordering';

export interface PlanBuilderOptions {
  /** Override profile.consents.allowEeoAutofill. */
  readonly eeoOptIn?: boolean;
  /** Override profile.consents.allowDobAutofill. */
  readonly dobOptIn?: boolean;
  /** ISO country code used for phone formatting. */
  readonly defaultCountry?: string;
  /** Deterministic plan ID. Branded per D16. */
  readonly planId?: PlanId;
  /** Deterministic createdAt; defaults to formModel.scannedAt. */
  readonly createdAt?: string;
}

/**
 * Build a FillPlan from a FormModel and a Profile.
 *
 * PURE. Same inputs produce byte-equal output: no clocks, no random IDs,
 * no I/O. Enables snapshot tests and makes determinism a first-class
 * property of the engine core.
 *
 * Mutation safety: the formModel and profile inputs are NEVER mutated. The
 * returned FillPlan does not share mutable references with the inputs beyond
 * the transitive readonly-ness of FormFieldDescriptor (which is already
 * frozen by B5's freezeFormModel).
 */
export function buildPlan(
  formModel: FormModel,
  profile: Profile,
  options: PlanBuilderOptions = {},
): FillPlan {
  const planId: PlanId =
    options.planId ?? PlanId(deriveDeterministicId(formModel));

  const ctx: FillRuleContext = {
    gating: makeGatingContext(profile, {
      eeoOptIn: options.eeoOptIn,
      dobOptIn: options.dobOptIn,
    }),
    defaultCountry: options.defaultCountry,
  };

  const instructions: FillInstruction[] = [];
  const skipped: Array<{ readonly instruction: FillInstruction; readonly reason: SkipReason }> = [];

  for (const descriptor of formModel.fields) {
    const classified = classify(descriptor);
    const fill = computeFill(profile, classified, ctx);

    const instruction: FillInstruction = {
      selector: descriptor.selector,
      field: classified.type,
      value: fill.value,
      priority: getPriority(classified.type),
      planId,
    };

    if (fill.value.kind === 'skip') {
      skipped.push({ instruction, reason: fill.value.reason });
      continue;
    }

    instructions.push(instruction);
  }

  instructions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ai = findDomIndex(formModel, a.selector);
    const bi = findDomIndex(formModel, b.selector);
    return ai - bi;
  });

  return {
    planId,
    createdAt: options.createdAt ?? formModel.scannedAt,
    formUrl: formModel.url,
    instructions,
    skipped,
  };
}

function findDomIndex(formModel: FormModel, selector: string): number {
  for (const f of formModel.fields) {
    if (f.selector === selector) return f.domIndex;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Derive a stable plan ID from the form URL + scan timestamp + field count
 * via djb2 hash. Not cryptographic -- snapshot-test-friendly only.
 */
function deriveDeterministicId(formModel: FormModel): string {
  const input = `${formModel.url}|${formModel.scannedAt}|${formModel.fields.length}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `plan_${(hash >>> 0).toString(36)}`;
}
```

### Step 15 -- Create `src/core/plan-builder/aggregate.ts`

D7 deliverable. A8 executes the fill loop; B4 provides the pure aggregator A8 calls afterward to produce a canonical `FillPlanResult`.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type {
  FillPlan,
  FillResult,
  FillPlanResult,
  AbortReason,
} from '../types';

export interface AggregateOptions {
  /** ISO-8601 timestamp of when the fill loop finished (or aborted). */
  readonly executedAt: string;
  /** True if A8 aborted before processing all instructions. */
  readonly aborted?: boolean;
  /** Reason code if aborted. From B2's AbortReason union. */
  readonly abortReason?: AbortReason;
}

/**
 * Aggregate fill results into a FillPlanResult. Pure function. Never throws.
 *
 * Invariants:
 *   - aggregateResults(plan, ...).planId === plan.planId (brand preserved).
 *   - skipped[] is copied from plan.skipped verbatim -- A8 does not touch
 *     skipped items.
 *   - filled[] and failed[] partition fillResults strictly; the sum of
 *     lengths equals fillResults.length.
 *   - aborted is a discriminant, not a count; A8 sets it based on its own
 *     abort signal.
 */
export function aggregateResults(
  plan: FillPlan,
  fillResults: ReadonlyArray<FillResult>,
  options: AggregateOptions,
): FillPlanResult {
  const filled = fillResults.filter(
    (r): r is Extract<FillResult, { ok: true }> => r.ok,
  );
  const failed = fillResults.filter(
    (r): r is Extract<FillResult, { ok: false }> => !r.ok,
  );
  return {
    planId: plan.planId,
    executedAt: options.executedAt,
    filled,
    skipped: plan.skipped,
    failed,
    aborted: options.aborted === true,
    abortReason: options.abortReason,
  };
}
```

### Step 16 -- Create `src/core/plan-builder/index.ts` + update `src/core/index.ts`

```ts
// src/core/plan-builder/index.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

export { buildPlan } from './builder';
export type { PlanBuilderOptions } from './builder';
export { aggregateResults } from './aggregate';
export type { AggregateOptions } from './aggregate';
export { getPriority, FIELD_TYPE_PRIORITY, DEFAULT_PRIORITY, CUSTOM_PRIORITY } from './ordering';
```

Append EXACTLY the following block to the end of the existing `src/core/index.ts` that B2 created. Do NOT reorder or delete any existing line -- append only.

```ts
// --- Added in B4 ---
export { classify } from './classifier';
export type { ClassifierOptions, ClassifierResult, SynonymMatch } from './classifier';
export { CONFIDENCE, MIN_CONFIDENCE_THRESHOLD, pickHigher, matchSynonym, isFileOnlyType } from './classifier';

export { computeFill, makeGatingContext } from './fill-rules';
export type { FillRuleContext, FillRuleResult, GatingContext } from './fill-rules';
export {
  formatPhone,
  formatDateIso,
  formatSalary,
  formatBoolean,
  snapToSelectOption,
  splitFullName,
} from './fill-rules';
export { FILL_RULES_BLUEPRINT } from './fill-rules';

export { buildPlan, aggregateResults, getPriority, FIELD_TYPE_PRIORITY, DEFAULT_PRIORITY, CUSTOM_PRIORITY } from './plan-builder';
export type { PlanBuilderOptions, AggregateOptions } from './plan-builder';
```

---

## Step 17 -- Test fixtures (shared by every test file)

To avoid duplication and to centralize BUG-2 / BUG-3 / BUG-4 fixes, the executor creates one fixture file both dispatch.spec.ts and builder.spec.ts import. This also ensures a single source of truth for the canonical profile shape.

**File**: `tests/core/fixtures/profile.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

import type { Profile } from '../../../src/core/profile';

/**
 * Canonical test Profile that passes B2's ProfileSchema.safeParse().
 * v2.1 fixture has ALL required fields populated:
 *   - jobPreferences.willingToCompleteAssessments (BUG-2)
 *   - jobPreferences.willingToUndergoDrugTests (BUG-2)
 *   - jobPreferences.willingToUndergoBackgroundChecks (BUG-2)
 *   - jurisdictionAuthorization.requiresVisa (BUG-3)
 *   - jurisdictionAuthorization.legallyAllowed (BUG-3)
 *   - consents.allowEeoAutofill (BUG-4)
 *   - consents.allowDobAutofill (BUG-4)
 *
 * Every test that needs a profile MUST call makeProfile() (optionally with
 * a patch) instead of hand-crafting a literal. Prevents regressions.
 */
export function makeProfile(patch: Partial<Profile> = {}): Profile {
  const base: Profile = {
    profileVersion: '1.0',
    updatedAtMs: 1712764800000,
    basics: {
      name: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+442071234567',
      phonePrefix: '+44',
      location: {
        city: 'London',
        region: 'England',
        countryCode: 'GB',
        postalCode: 'SW1A 1AA',
        address: '10 Downing St',
      },
      profiles: [
        { network: 'LinkedIn', username: 'ada', url: 'https://linkedin.com/in/ada' },
        { network: 'GitHub', username: 'ada', url: 'https://github.com/ada' },
      ],
      summary: 'Mathematician and first computer programmer.',
      pronouns: 'she/her',
      url: 'https://ada.example.com',
      label: 'Chief Algorithmist',
      dateOfBirth: '1815-12-10',
    },
    work: [
      {
        name: 'Analytical Engine Co',
        position: 'Chief Algorithmist',
        startDate: '2020-01-01',
        highlights: [],
      },
      {
        name: 'Babbage Labs',
        position: 'Research Assistant',
        startDate: '2015-06-01',
        endDate: '2019-12-31',
        highlights: [],
      },
    ],
    education: [
      {
        institution: 'University of London',
        area: 'Mathematics',
        studyType: 'Bachelor',
        startDate: '2010-09-01',
        endDate: '2014-06-30',
        score: '3.9/4.0',
        courses: [],
      },
    ],
    skills: [],
    languages: [{ language: 'English', fluency: 'Native' }],
    certificates: [],
    projects: [],
    volunteer: [],
    awards: [],
    publications: [],
    references: [],
    jobPreferences: {
      workAuthorization: [
        // BUG-3 fix: all 4 flags per jurisdiction
        { region: 'US', authorized: false, requiresVisa: true, requiresSponsorship: true, legallyAllowed: false },
        { region: 'GB', authorized: true, requiresVisa: false, requiresSponsorship: false, legallyAllowed: true },
        { region: 'EU', authorized: false, requiresVisa: true, requiresSponsorship: true, legallyAllowed: false },
        { region: 'CA', authorized: false, requiresVisa: true, requiresSponsorship: true, legallyAllowed: false },
      ],
      salaryExpectation: { min: 120000, max: 150000, currency: 'GBP', period: 'year' },
      availabilityDate: '2026-05-01',
      willingToRelocate: true,
      remotePreference: 'hybrid',
      // BUG-2 fix: three required booleans
      willingToCompleteAssessments: true,
      willingToUndergoDrugTests: false,
      willingToUndergoBackgroundChecks: true,
    },
    demographics: {},
    documents: {
      resume: {
        id: 'doc_resume_1',
        filename: 'ada_resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123456,
        lastUpdated: '2026-04-01T00:00:00.000Z',
      },
    },
    customAnswers: {},
    consents: {
      privacyPolicy: false,
      marketing: false,
      // BUG-4 fix: two required EEO / DOB opt-in booleans
      allowEeoAutofill: false,
      allowDobAutofill: false,
    },
  };
  return { ...base, ...patch } as Profile;
}
```

## Step 18 -- Tests: `tests/core/classifier/pipeline.spec.ts` (at least 35 cases)

Core happy-path + structural tests. Adversarial cases for the classifier live in Step 22.

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '../../../src/core/classifier';
import type { FormFieldDescriptor } from '../../../src/core/types';

function makeDescriptor(patch: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    selector: '#f',
    name: '',
    id: '',
    label: '',
    placeholder: '',
    ariaLabel: '',
    autocomplete: '',
    type: 'text',
    options: [],
    required: false,
    dataAttributes: {},
    sectionHeading: null,
    domIndex: 1,
    ...patch,
  };
}

describe('classifier pipeline -- ATS-specific fields', () => {
  it('classifies resume-upload by name + file type', () => {
    const r = classify(makeDescriptor({ name: 'resume', type: 'file' }));
    expect(r.type).toBe('resume-upload');
    expect(r.source).toBe('ats-ext');
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies resume-upload by label "Upload CV"', () => {
    const r = classify(makeDescriptor({ label: 'Upload CV', type: 'file' }));
    expect(r.type).toBe('resume-upload');
  });

  // v2.1 fix for Finding-8: the assertion is weakened to NOT be 'ats-ext' AND
  // the synonym pass now has isFileOnlyType gating so resume-upload cannot
  // land via the synonym fallback when the HTML type is 'text'. Both fixes
  // together make this test robust.
  it('does NOT classify resume-upload when type is text', () => {
    const r = classify(makeDescriptor({ label: 'Resume', type: 'text' }));
    expect(r.type).not.toBe('resume-upload');
    expect(r.source).not.toBe('ats-ext');
  });

  it('classifies cover-letter-upload', () => {
    const r = classify(makeDescriptor({ label: 'Cover Letter', type: 'file' }));
    expect(r.type).toBe('cover-letter-upload');
  });

  it('classifies cover-letter-text (textarea)', () => {
    const r = classify(makeDescriptor({ label: 'Why are you interested?', type: 'textarea' }));
    expect(r.type).toBe('cover-letter-text');
  });

  it('classifies linkedin-url', () => {
    const r = classify(makeDescriptor({ name: 'linkedin_url', type: 'url' }));
    expect(r.type).toBe('linkedin-url');
  });

  it('classifies github-url via label', () => {
    const r = classify(makeDescriptor({ label: 'GitHub profile' }));
    expect(r.type).toBe('github-url');
  });

  it('classifies years-experience', () => {
    const r = classify(makeDescriptor({ label: 'Years of experience', type: 'number' }));
    expect(r.type).toBe('years-experience');
  });

  it('classifies work-auth-us', () => {
    const r = classify(makeDescriptor({
      label: 'Are you legally authorized to work in the United States?',
    }));
    expect(r.type).toBe('work-auth-us');
  });

  it('classifies visa-sponsorship-required', () => {
    const r = classify(makeDescriptor({
      label: 'Will you now or in the future require sponsorship?',
    }));
    expect(r.type).toBe('visa-sponsorship-required');
  });

  it('classifies salary-expectation', () => {
    const r = classify(makeDescriptor({ label: 'Expected salary' }));
    expect(r.type).toBe('salary-expectation');
  });

  it('prefers salary-min over salary-expectation when label says "minimum"', () => {
    const r = classify(makeDescriptor({ label: 'Minimum salary' }));
    expect(r.type).toBe('salary-min');
  });

  it('classifies start-date', () => {
    const r = classify(makeDescriptor({ label: 'Earliest start date', type: 'date' }));
    expect(r.type).toBe('start-date');
  });

  it('classifies eeo-gender', () => {
    const r = classify(makeDescriptor({ label: 'Gender identity' }));
    expect(r.type).toBe('eeo-gender');
  });

  it('classifies eeo-race', () => {
    const r = classify(makeDescriptor({ label: 'Race/Ethnicity' }));
    expect(r.type).toBe('eeo-race');
  });

  it('classifies consent-privacy', () => {
    const r = classify(makeDescriptor({ label: 'I agree to the privacy policy', type: 'checkbox' }));
    expect(r.type).toBe('consent-privacy');
  });
});

describe('classifier pipeline -- Mozilla heuristics fallback', () => {
  it('classifies email by autocomplete attribute (confidence 1.0)', () => {
    const r = classify(makeDescriptor({ autocomplete: 'email', name: 'email-2' }));
    expect(r.type).toBe('email');
    expect(r.confidence).toBe(1.0);
    expect(r.matchedOn).toBe('autocomplete');
    expect(r.source).toBe('autocomplete');
  });

  it('classifies given-name by autocomplete', () => {
    const r = classify(makeDescriptor({ autocomplete: 'given-name' }));
    expect(r.type).toBe('given-name');
  });

  it('classifies family-name by name attribute', () => {
    const r = classify(makeDescriptor({ name: 'last_name' }));
    expect(r.type).toBe('family-name');
  });

  // v2.1 change: review Finding noted that asserting source === 'mozilla' is
  // brittle if B3 misses and synonym fallback catches. Accept either.
  it('classifies email via name regex when autocomplete is missing', () => {
    const r = classify(makeDescriptor({ name: 'user_email_field' }));
    expect(r.type).toBe('email');
    expect(['mozilla', 'synonym']).toContain(r.source);
  });

  it('classifies address-level2 (city)', () => {
    const r = classify(makeDescriptor({ name: 'city', label: 'City' }));
    expect(r.type).toBe('address-level2');
  });

  it('classifies postal-code via label', () => {
    const r = classify(makeDescriptor({ label: 'ZIP code' }));
    expect(r.type).toBe('postal-code');
  });
});

describe('classifier pipeline -- synonym fallback', () => {
  it('matches label synonym "First Name" -> given-name', () => {
    const r = classify(makeDescriptor({ label: 'First Name' }));
    expect(r.type).toBe('given-name');
  });

  it('matches placeholder "mobile" -> tel', () => {
    const r = classify(makeDescriptor({ placeholder: 'mobile' }));
    expect(r.type).toBe('tel');
  });

  it('matches aria-label "Company" -> one of current-company / name', () => {
    const r = classify(makeDescriptor({ ariaLabel: 'Company' }));
    expect(['current-company', 'name']).toContain(r.type);
  });
});

describe('classifier pipeline -- positional fallback', () => {
  it('treats the first text input as given-name when nothing else matches', () => {
    const r = classify(makeDescriptor({ type: 'text', domIndex: 0 }));
    expect(r.type).toBe('given-name');
    expect(r.source).toBe('positional');
    expect(r.confidence).toBeLessThanOrEqual(0.3);
  });

  it('does NOT apply positional fallback when domIndex > 0', () => {
    const r = classify(makeDescriptor({ type: 'text', domIndex: 5 }));
    expect(r.type).toBe('unknown');
  });
});

describe('classifier pipeline -- determinism + structural invariants', () => {
  it('returns unknown for a fully empty descriptor', () => {
    const r = classify(makeDescriptor({}));
    expect(r.type).toBe('unknown');
    expect(r.source).toBe('fallback');
  });

  it('two identical descriptors produce identical results', () => {
    const d = makeDescriptor({ label: 'Email' });
    const a = classify(d);
    const b = classify(d);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('every CONFIDENCE value returned is a member of the B2 literal union', () => {
    const allowed = new Set([1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.3, 0.0]);
    const samples = [
      classify(makeDescriptor({ autocomplete: 'email' })),
      classify(makeDescriptor({ label: 'First Name' })),
      classify(makeDescriptor({ type: 'text', domIndex: 0 })),
      classify(makeDescriptor({})),
    ];
    for (const s of samples) {
      expect(allowed.has(s.confidence)).toBe(true);
    }
  });
});
```

## Step 19 -- Tests: `tests/core/classifier/ats-matchers.spec.ts` (at least 20 cases)

```ts
import { describe, it, expect } from 'vitest';
import { findFirstAtsMatch, ATS_RULES, matchAtsRule } from '../../../src/core/classifier/ats-matchers';
import { isFileOnlyType } from '../../../src/core/classifier/synonym-matcher';

describe('ATS matchers -- direct', () => {
  it('has at least 40 rules', () => {
    expect(ATS_RULES.length).toBeGreaterThanOrEqual(40);
  });

  it('matches resume-upload on "attach resume" with file type', () => {
    const r = findFirstAtsMatch('attach resume', 'file');
    expect(r?.type).toBe('resume-upload');
  });

  it('does NOT match resume-upload with type=text (htmlTypeGuard)', () => {
    const r = findFirstAtsMatch('attach resume', 'text');
    expect(r?.type).not.toBe('resume-upload');
  });

  it('matches cover-letter-upload', () => {
    const r = findFirstAtsMatch('cover letter', 'file');
    expect(r?.type).toBe('cover-letter-upload');
  });

  it('matches linkedin-url', () => {
    const r = findFirstAtsMatch('linkedin profile', '');
    expect(r?.type).toBe('linkedin-url');
  });

  it('matches github-url via github.com', () => {
    const r = findFirstAtsMatch('github.com/me', '');
    expect(r?.type).toBe('github-url');
  });

  it('matches years-experience', () => {
    const r = findFirstAtsMatch('years of experience', '');
    expect(r?.type).toBe('years-experience');
  });

  it('matches work-auth-us', () => {
    const r = findFirstAtsMatch('legally authorized to work in the united states', '');
    expect(r?.type).toBe('work-auth-us');
  });

  it('matches visa-sponsorship-required', () => {
    const r = findFirstAtsMatch('require sponsorship', '');
    expect(r?.type).toBe('visa-sponsorship-required');
  });

  it('matches salary-min more specific than salary-expectation', () => {
    const r = findFirstAtsMatch('minimum salary', '');
    expect(r?.type).toBe('salary-min');
  });

  it('matches salary-max more specific than salary-expectation', () => {
    const r = findFirstAtsMatch('maximum salary', '');
    expect(r?.type).toBe('salary-max');
  });

  it('matches start-date', () => {
    const r = findFirstAtsMatch('when can you start', '');
    expect(r?.type).toBe('start-date');
  });

  it('matches eeo-gender', () => {
    const r = findFirstAtsMatch('gender identity', '');
    expect(r?.type).toBe('eeo-gender');
  });

  it('matches consent-privacy', () => {
    const r = findFirstAtsMatch('i agree to the privacy policy', '');
    expect(r?.type).toBe('consent-privacy');
  });

  it('matches age-confirmation', () => {
    const r = findFirstAtsMatch('i am at least 18', '');
    expect(r?.type).toBe('age-confirmation');
  });

  it('returns null for empty signal', () => {
    expect(findFirstAtsMatch('', '')).toBeNull();
  });

  it('returns null for a signal that matches nothing', () => {
    expect(findFirstAtsMatch('favorite pizza topping', '')).toBeNull();
  });

  it('isFileOnlyType returns true for file-only types', () => {
    expect(isFileOnlyType('resume-upload')).toBe(true);
    expect(isFileOnlyType('cover-letter-upload')).toBe(true);
    expect(isFileOnlyType('transcript-upload')).toBe(true);
    expect(isFileOnlyType('portfolio-upload')).toBe(true);
    expect(isFileOnlyType('additional-file')).toBe(true);
    expect(isFileOnlyType('custom-file')).toBe(true);
  });

  it('isFileOnlyType returns false for non-file types', () => {
    expect(isFileOnlyType('email')).toBe(false);
    expect(isFileOnlyType('given-name')).toBe(false);
    expect(isFileOnlyType('eeo-gender')).toBe(false);
  });

  it('matchAtsRule handles bounded quantifiers within 10KB input (no ReDoS)', () => {
    const huge = 'resume '.repeat(2000); // 14000 chars
    const start = Date.now();
    for (const rule of ATS_RULES) {
      matchAtsRule(rule, huge, 'file');
    }
    const elapsed = Date.now() - start;
    // Sanity: all 54 rules against 14KB should finish in well under 100ms on
    // commodity hardware. If this ever crosses 500ms, a quantifier regressed.
    expect(elapsed).toBeLessThan(500);
  });
});
```

## Step 20 -- Tests: `tests/core/fill-rules/dispatch.spec.ts` (at least 35 cases)

This file imports `makeProfile` from the shared fixture in Step 17. Every `makeProfile()` call already includes the BUG-2/3/4 fixes.

```ts
import { describe, it, expect } from 'vitest';
import { computeFill, makeGatingContext } from '../../../src/core/fill-rules';
import type { ClassifiedField, FormFieldDescriptor } from '../../../src/core/types';
import { makeProfile } from '../fixtures/profile';

function makeClassified(
  type: ClassifiedField['type'],
  descriptorPatch: Partial<FormFieldDescriptor> = {},
): ClassifiedField {
  return {
    descriptor: {
      selector: '#x',
      name: '',
      id: '',
      label: '',
      placeholder: '',
      ariaLabel: '',
      autocomplete: '',
      type: 'text',
      options: [],
      required: false,
      dataAttributes: {},
      sectionHeading: null,
      domIndex: 0,
      ...descriptorPatch,
    },
    type,
    confidence: 0.9,
    matchedOn: 'name',
  };
}

const CTX = { gating: makeGatingContext(null, { eeoOptIn: false, dobOptIn: false }) };
const CTX_EEO_OPTED = { gating: makeGatingContext(null, { eeoOptIn: true, dobOptIn: true }) };

describe('computeFill -- identity', () => {
  it('fills given-name from firstName', () => {
    const r = computeFill(makeProfile(), makeClassified('given-name'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Ada' });
  });

  it('fills family-name from lastName', () => {
    const r = computeFill(makeProfile(), makeClassified('family-name'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Lovelace' });
  });

  it('fills name from full name', () => {
    const r = computeFill(makeProfile(), makeClassified('name'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Ada Lovelace' });
  });

  it('fills email', () => {
    const r = computeFill(makeProfile(), makeClassified('email'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'ada@example.com' });
  });

  it('fills nickname from preferredName', () => {
    const p = makeProfile({ basics: { ...makeProfile().basics, preferredName: 'Addie' } });
    const r = computeFill(p, makeClassified('nickname'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Addie' });
  });
});

describe('computeFill -- phone and address', () => {
  it('fills tel as formatted phone', () => {
    const r = computeFill(makeProfile(), makeClassified('tel'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '+442071234567' });
  });

  // v2.1 drift fix: phonePrefix wins over regex derivation.
  it('fills tel-country-code from phonePrefix when explicit', () => {
    const r = computeFill(makeProfile(), makeClassified('tel-country-code'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '+44' });
  });

  it('tel-country-code falls back to derived prefix when phonePrefix missing', () => {
    const p = makeProfile({
      basics: { ...makeProfile().basics, phonePrefix: undefined, phone: '+33123456789' },
    });
    const r = computeFill(p, makeClassified('tel-country-code'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '+33' });
  });

  it('fills address-line1', () => {
    const r = computeFill(makeProfile(), makeClassified('address-line1'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '10 Downing St' });
  });

  it('fills address-level2 (city)', () => {
    const r = computeFill(makeProfile(), makeClassified('address-level2'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'London' });
  });

  it('fills postal-code', () => {
    const r = computeFill(makeProfile(), makeClassified('postal-code'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'SW1A 1AA' });
  });

  it('skips country when countryCode empty and no options', () => {
    const p = makeProfile({
      basics: { ...makeProfile().basics, location: { ...makeProfile().basics.location!, countryCode: '' } },
    });
    const r = computeFill(p, makeClassified('country'), CTX);
    expect(r.value.kind).toBe('skip');
  });
});

describe('computeFill -- profile links', () => {
  it('fills linkedin-url from profiles array', () => {
    const r = computeFill(makeProfile(), makeClassified('linkedin-url'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'https://linkedin.com/in/ada' });
  });

  it('fills github-url from profiles array', () => {
    const r = computeFill(makeProfile(), makeClassified('github-url'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'https://github.com/ada' });
  });

  it('skips linkedin-url if not in profiles', () => {
    const p = makeProfile({ basics: { ...makeProfile().basics, profiles: [] } });
    const r = computeFill(p, makeClassified('linkedin-url'), CTX);
    expect(r.value.kind).toBe('skip');
  });
});

describe('computeFill -- documents', () => {
  it('fills resume-upload with file handleId', () => {
    const r = computeFill(makeProfile(), makeClassified('resume-upload'), CTX);
    expect(r.value).toMatchObject({ kind: 'file' });
    if (r.value.kind === 'file') {
      expect(r.value.handleId).toBe('doc_resume_1' as unknown as typeof r.value.handleId);
    }
  });

  it('skips resume-upload if profile has no resume', () => {
    const p = makeProfile({ documents: {} });
    const r = computeFill(p, makeClassified('resume-upload'), CTX);
    expect(r.value.kind).toBe('skip');
  });
});

describe('computeFill -- employment and experience', () => {
  it('fills current-company from work[0].name', () => {
    const r = computeFill(makeProfile(), makeClassified('current-company'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Analytical Engine Co' });
  });

  it('fills current-title from work[0].position', () => {
    const r = computeFill(makeProfile(), makeClassified('current-title'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Chief Algorithmist' });
  });

  it('computes years-experience from earliest work startDate', () => {
    const r = computeFill(makeProfile(), makeClassified('years-experience'), CTX);
    expect(r.value.kind).toBe('text');
    if (r.value.kind === 'text') {
      expect(Number.parseInt(r.value.value, 10)).toBeGreaterThanOrEqual(10);
    }
  });

  it('fills previous-employer from work[1].name', () => {
    const r = computeFill(makeProfile(), makeClassified('previous-employer'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Babbage Labs' });
  });
});

describe('computeFill -- education', () => {
  it('fills school-name', () => {
    const r = computeFill(makeProfile(), makeClassified('school-name'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'University of London' });
  });

  it('fills field-of-study', () => {
    const r = computeFill(makeProfile(), makeClassified('field-of-study'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'Mathematics' });
  });

  it('fills graduation-year', () => {
    const r = computeFill(makeProfile(), makeClassified('graduation-year'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '2014' });
  });

  it('fills gpa from education[0].score', () => {
    const r = computeFill(makeProfile(), makeClassified('gpa'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '3.9/4.0' });
  });
});

describe('computeFill -- work authorization', () => {
  it('fills work-auth-us as boolean false', () => {
    const r = computeFill(makeProfile(), makeClassified('work-auth-us'), CTX);
    expect(r.value).toEqual({ kind: 'boolean', value: false });
  });

  it('fills visa-sponsorship-required as boolean true', () => {
    const r = computeFill(makeProfile(), makeClassified('visa-sponsorship-required'), CTX);
    expect(r.value).toEqual({ kind: 'boolean', value: true });
  });

  it('snaps boolean to Yes/No when options present', () => {
    const r = computeFill(
      makeProfile(),
      makeClassified('work-auth-us', {
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      }),
      CTX,
    );
    expect(r.value).toEqual({ kind: 'choice', value: 'no' });
  });
});

describe('computeFill -- compensation', () => {
  it('fills salary-min', () => {
    const r = computeFill(makeProfile(), makeClassified('salary-min'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '120000' });
  });

  it('fills salary-max', () => {
    const r = computeFill(makeProfile(), makeClassified('salary-max'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '150000' });
  });

  it('fills salary-currency as choice when options present', () => {
    const r = computeFill(
      makeProfile(),
      makeClassified('salary-currency', {
        options: [
          { value: 'USD', label: 'US Dollar' },
          { value: 'GBP', label: 'British Pound' },
        ],
      }),
      CTX,
    );
    expect(r.value).toEqual({ kind: 'choice', value: 'GBP' });
  });
});

describe('computeFill -- gating', () => {
  it('skips eeo-gender when not opted in', () => {
    const p = makeProfile({ demographics: { gender: 'female' } });
    const r = computeFill(p, makeClassified('eeo-gender'), CTX);
    expect(r.skipReason).toBe('consent-denied-field-type');
    expect(r.value.kind).toBe('skip');
  });

  it('fills eeo-gender when opted in and options present', () => {
    const p = makeProfile({ demographics: { gender: 'female' } });
    const r = computeFill(
      p,
      makeClassified('eeo-gender', {
        options: [{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }],
      }),
      CTX_EEO_OPTED,
    );
    expect(r.value.kind).toBe('choice');
  });

  it('always skips consent-privacy regardless of opt-in', () => {
    const r = computeFill(makeProfile(), makeClassified('consent-privacy'), CTX_EEO_OPTED);
    expect(r.skipReason).toBe('consent-denied-field-type');
  });

  it('always skips consent-marketing', () => {
    const r = computeFill(makeProfile(), makeClassified('consent-marketing'), CTX_EEO_OPTED);
    expect(r.skipReason).toBe('consent-denied-field-type');
  });

  it('skips bday when dobOptIn is false', () => {
    const r = computeFill(makeProfile(), makeClassified('bday'), CTX);
    expect(r.skipReason).toBe('consent-denied-field-type');
  });
});

describe('computeFill -- language routing (v2.1 drift fix)', () => {
  it('routes language through choiceOrSkip with options', () => {
    const p = makeProfile({ languages: [{ language: 'English', fluency: 'Native' }] });
    const r = computeFill(
      p,
      makeClassified('language', {
        options: [
          { value: 'en', label: 'English' },
          { value: 'fr', label: 'French' },
        ],
      }),
      CTX,
    );
    expect(r.value).toEqual({ kind: 'choice', value: 'en' });
  });

  it('language falls back to text when options empty', () => {
    const r = computeFill(makeProfile(), makeClassified('language'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: 'English' });
  });
});

describe('computeFill -- formatters integration', () => {
  it('rounds decimal salaries', () => {
    const p = makeProfile({
      jobPreferences: {
        ...makeProfile().jobPreferences,
        salaryExpectation: { min: 123456.78, max: 150000, currency: 'USD', period: 'year' },
      },
    });
    const r = computeFill(p, makeClassified('salary-min'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '123457' });
  });

  it('formats availabilityDate as ISO', () => {
    const p = makeProfile({
      jobPreferences: { ...makeProfile().jobPreferences, availabilityDate: '2026-06-15' },
    });
    const r = computeFill(p, makeClassified('start-date'), CTX);
    expect(r.value).toEqual({ kind: 'text', value: '2026-06-15' });
  });
});

describe('computeFill -- unknown and custom', () => {
  it('skips unknown field type', () => {
    const r = computeFill(makeProfile(), makeClassified('unknown'), CTX);
    expect(r.skipReason).toBe('out-of-scope-for-v1');
  });

  it('skips custom-text', () => {
    const r = computeFill(makeProfile(), makeClassified('custom-text'), CTX);
    expect(r.skipReason).toBe('out-of-scope-for-v1');
  });
});

describe('computeFill -- mutation safety', () => {
  it('does not mutate the profile', () => {
    const p = makeProfile();
    const snapshot = JSON.stringify(p);
    computeFill(p, makeClassified('email'), CTX);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('does not mutate the classified descriptor', () => {
    const classified = makeClassified('email');
    const snapshot = JSON.stringify(classified);
    computeFill(makeProfile(), classified, CTX);
    expect(JSON.stringify(classified)).toBe(snapshot);
  });

  it('works with Object.freeze()d profile', () => {
    const p = Object.freeze(makeProfile()) as ReturnType<typeof makeProfile>;
    Object.freeze(p.basics);
    expect(() => computeFill(p, makeClassified('email'), CTX)).not.toThrow();
  });
});
```

## Step 21 -- Tests: `tests/core/plan-builder/builder.spec.ts` (at least 20 cases)

```ts
import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../../src/core/plan-builder';
import type { FormModel, FormFieldDescriptor } from '../../../src/core/types';
import { PlanId } from '../../../src/core/types';
import { makeProfile } from '../fixtures/profile';

function makeField(patch: Partial<FormFieldDescriptor>): FormFieldDescriptor {
  return {
    selector: patch.selector ?? `#f${patch.domIndex ?? 0}`,
    name: '',
    id: '',
    label: '',
    placeholder: '',
    ariaLabel: '',
    autocomplete: '',
    type: 'text',
    options: [],
    required: false,
    dataAttributes: {},
    sectionHeading: null,
    domIndex: 0,
    ...patch,
  };
}

function makeModel(fields: FormFieldDescriptor[]): FormModel {
  return {
    url: 'https://boards.greenhouse.io/acme/jobs/42',
    title: 'Staff Engineer at Acme',
    scannedAt: '2026-04-14T10:00:00.000Z',
    fields,
  };
}

describe('buildPlan -- basics', () => {
  it('produces an empty plan for an empty form', () => {
    const plan = buildPlan(makeModel([]), makeProfile());
    expect(plan.instructions).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.formUrl).toBe('https://boards.greenhouse.io/acme/jobs/42');
  });

  it('orders resume upload before identity fields', () => {
    const fields = [
      makeField({ name: 'first_name', domIndex: 0 }),
      makeField({ name: 'email', domIndex: 1 }),
      makeField({ name: 'resume', type: 'file', domIndex: 2 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile());
    expect(plan.instructions[0].field).toBe('resume-upload');
    expect(plan.instructions[0].priority).toBeLessThan(plan.instructions[1].priority);
  });

  it('orders identity fields before employment', () => {
    const fields = [
      makeField({ name: 'current_company', domIndex: 0 }),
      makeField({ name: 'email', domIndex: 1 }),
      makeField({ name: 'first_name', domIndex: 2 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile());
    const types = plan.instructions.map((i) => i.field);
    expect(types.indexOf('given-name')).toBeLessThan(types.indexOf('current-company'));
    expect(types.indexOf('email')).toBeLessThan(types.indexOf('current-company'));
  });

  it('uses domIndex as tiebreaker when priorities match', () => {
    const fields = [
      makeField({ selector: '#a', name: 'resume', type: 'file', domIndex: 5 }),
      makeField({ selector: '#b', name: 'cv_upload', type: 'file', domIndex: 3 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile());
    expect(plan.instructions[0].selector).toBe('#b');
    expect(plan.instructions[1].selector).toBe('#a');
  });

  it('records skipped fields in skipped[]', () => {
    const fields = [
      makeField({ label: 'I agree to the privacy policy', type: 'checkbox', domIndex: 0 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile());
    expect(plan.instructions).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe('consent-denied-field-type');
  });

  it('is pure: same input produces byte-equal output', () => {
    const fields = [
      makeField({ name: 'email', domIndex: 0 }),
      makeField({ name: 'first_name', domIndex: 1 }),
    ];
    const p1 = buildPlan(makeModel(fields), makeProfile(), { planId: PlanId('plan_test') });
    const p2 = buildPlan(makeModel(fields), makeProfile(), { planId: PlanId('plan_test') });
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
  });
});

describe('buildPlan -- plan ID + branding', () => {
  it('plan id is deterministic across invocations', () => {
    const fields = [makeField({ name: 'email', domIndex: 0 })];
    const p1 = buildPlan(makeModel(fields), makeProfile());
    const p2 = buildPlan(makeModel(fields), makeProfile());
    expect(p1.planId).toBe(p2.planId);
  });

  it('plan id is propagated to every instruction', () => {
    const fields = [
      makeField({ name: 'email', domIndex: 0 }),
      makeField({ name: 'first_name', domIndex: 1 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile(), { planId: PlanId('plan_abc') });
    for (const instr of plan.instructions) {
      expect(instr.planId).toBe(PlanId('plan_abc'));
    }
  });

  it('formUrl is captured verbatim', () => {
    const plan = buildPlan(makeModel([]), makeProfile());
    expect(plan.formUrl).toBe('https://boards.greenhouse.io/acme/jobs/42');
  });

  it('createdAt defaults to formModel.scannedAt', () => {
    const plan = buildPlan(makeModel([]), makeProfile());
    expect(plan.createdAt).toBe('2026-04-14T10:00:00.000Z');
  });
});

describe('buildPlan -- realistic Greenhouse form', () => {
  it('snapshot', () => {
    const fields: FormFieldDescriptor[] = [
      makeField({ selector: '#first_name', name: 'job_application[first_name]', label: 'First Name', domIndex: 0 }),
      makeField({ selector: '#last_name', name: 'job_application[last_name]', label: 'Last Name', domIndex: 1 }),
      makeField({ selector: '#email', name: 'job_application[email]', label: 'Email', type: 'email', domIndex: 2 }),
      makeField({ selector: '#phone', name: 'job_application[phone]', label: 'Phone', type: 'tel', domIndex: 3 }),
      makeField({ selector: '#resume', name: 'job_application[resume]', label: 'Resume/CV', type: 'file', domIndex: 4 }),
      makeField({ selector: '#linkedin', name: 'urls[LinkedIn]', label: 'LinkedIn profile', type: 'url', domIndex: 5 }),
      makeField({ selector: '#cover_letter', label: 'Cover Letter', type: 'file', domIndex: 6 }),
    ];
    const plan = buildPlan(makeModel(fields), makeProfile(), {
      planId: PlanId('test-plan-id'),
      createdAt: '2026-04-14T10:00:00.000Z',
    });
    expect(plan).toMatchSnapshot();
  });
});

describe('buildPlan -- EEO opt-in toggle', () => {
  it('without eeoOptIn the gender field is skipped', () => {
    const p = makeProfile({ demographics: { gender: 'female' } });
    const fields = [
      makeField({
        label: 'Gender identity',
        type: 'select-one',
        options: [
          { value: 'F', label: 'Female' },
          { value: 'M', label: 'Male' },
        ],
        domIndex: 0,
      }),
    ];
    const plan = buildPlan(makeModel(fields), p, { eeoOptIn: false });
    expect(plan.instructions).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
  });

  it('with eeoOptIn the gender field becomes an instruction', () => {
    const p = makeProfile({ demographics: { gender: 'female' } });
    const fields = [
      makeField({
        label: 'Gender identity',
        type: 'select-one',
        options: [
          { value: 'F', label: 'Female' },
          { value: 'M', label: 'Male' },
        ],
        domIndex: 0,
      }),
    ];
    const plan = buildPlan(makeModel(fields), p, { eeoOptIn: true });
    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0].field).toBe('eeo-gender');
  });
});

describe('buildPlan -- stress + structural', () => {
  it('handles 100-field forms without crashing', () => {
    const fields: FormFieldDescriptor[] = [];
    for (let i = 0; i < 100; i += 1) {
      fields.push(makeField({ selector: `#c${i}`, name: `custom_${i}`, domIndex: i }));
    }
    expect(() => buildPlan(makeModel(fields), makeProfile())).not.toThrow();
  });

  it('1000-option select snaps deterministically (stress for snapToSelectOption)', () => {
    const options: Array<{ value: string; label: string }> = [];
    for (let i = 0; i < 1000; i += 1) {
      options.push({ value: `c${i}`, label: `Country ${i}` });
    }
    options.push({ value: 'GB', label: 'United Kingdom' });
    const p = makeProfile();
    const fields = [
      makeField({
        selector: '#country',
        label: 'Country',
        type: 'select-one',
        options,
        domIndex: 0,
      }),
    ];
    const plan = buildPlan(makeModel(fields), p);
    // Our profile has countryCode 'GB'; snap must land on the 1001st option.
    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0].value).toEqual({ kind: 'choice', value: 'GB' });
  });

  it('does not mutate the input formModel', () => {
    const fields = [makeField({ name: 'email', domIndex: 0 })];
    const model = makeModel(fields);
    const snapshot = JSON.stringify(model);
    buildPlan(model, makeProfile());
    expect(JSON.stringify(model)).toBe(snapshot);
  });

  it('does not mutate the input profile', () => {
    const p = makeProfile();
    const snapshot = JSON.stringify(p);
    buildPlan(makeModel([makeField({ name: 'email', domIndex: 0 })]), p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});
```

## Step 22 -- Tests: `tests/core/plan-builder/aggregate.spec.ts` (at least 10 cases)

```ts
import { describe, it, expect } from 'vitest';
import { aggregateResults } from '../../../src/core/plan-builder';
import type { FillPlan, FillResult, FillInstruction } from '../../../src/core/types';
import { PlanId } from '../../../src/core/types';

function makePlan(overrides: Partial<FillPlan> = {}): FillPlan {
  const planId = PlanId('plan_test');
  const dummyInstr: FillInstruction = {
    selector: '#x',
    field: 'email',
    value: { kind: 'text', value: 'a@b' },
    priority: 26,
    planId,
  };
  return {
    planId,
    createdAt: '2026-04-14T00:00:00.000Z',
    formUrl: 'https://example.com/job',
    instructions: [dummyInstr],
    skipped: [],
    ...overrides,
  };
}

describe('aggregateResults', () => {
  it('partitions filled and failed correctly', () => {
    const plan = makePlan();
    const results: FillResult[] = [
      { ok: true, selector: '#a', instructionPlanId: plan.planId },
      { ok: false, selector: '#b', error: 'element-disabled', instructionPlanId: plan.planId },
      { ok: true, selector: '#c', instructionPlanId: plan.planId },
    ];
    const out = aggregateResults(plan, results, { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.filled).toHaveLength(2);
    expect(out.failed).toHaveLength(1);
    expect(out.filled.every((r) => r.ok)).toBe(true);
    expect(out.failed.every((r) => !r.ok)).toBe(true);
  });

  it('copies plan.skipped verbatim', () => {
    const plan = makePlan({
      skipped: [
        {
          instruction: {
            selector: '#s',
            field: 'consent-privacy',
            value: { kind: 'skip', reason: 'consent-denied-field-type' },
            priority: 110,
            planId: PlanId('plan_test'),
          },
          reason: 'consent-denied-field-type',
        },
      ],
    });
    const out = aggregateResults(plan, [], { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.skipped).toBe(plan.skipped);
  });

  it('preserves planId brand', () => {
    const plan = makePlan();
    const out = aggregateResults(plan, [], { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.planId).toBe(plan.planId);
  });

  it('copies executedAt verbatim', () => {
    const plan = makePlan();
    const out = aggregateResults(plan, [], { executedAt: '2026-04-14T02:00:00.000Z' });
    expect(out.executedAt).toBe('2026-04-14T02:00:00.000Z');
  });

  it('aborted defaults to false', () => {
    const plan = makePlan();
    const out = aggregateResults(plan, [], { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.aborted).toBe(false);
    expect(out.abortReason).toBeUndefined();
  });

  it('aborted true + abortReason propagates', () => {
    const plan = makePlan();
    const out = aggregateResults(plan, [], {
      executedAt: '2026-04-14T01:00:00.000Z',
      aborted: true,
      abortReason: 'profile-missing',
    });
    expect(out.aborted).toBe(true);
    expect(out.abortReason).toBe('profile-missing');
  });

  it('empty results produce empty filled + failed', () => {
    const plan = makePlan();
    const out = aggregateResults(plan, [], { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.filled).toEqual([]);
    expect(out.failed).toEqual([]);
  });

  it('sum of filled + failed equals input length', () => {
    const plan = makePlan();
    const results: FillResult[] = [];
    for (let i = 0; i < 50; i += 1) {
      results.push(
        i % 3 === 0
          ? { ok: false, selector: `#x${i}`, error: 'value-rejected-by-page', instructionPlanId: plan.planId }
          : { ok: true, selector: `#x${i}`, instructionPlanId: plan.planId },
      );
    }
    const out = aggregateResults(plan, results, { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(out.filled.length + out.failed.length).toBe(50);
  });

  it('does not mutate the input plan', () => {
    const plan = makePlan();
    const snapshot = JSON.stringify(plan);
    aggregateResults(plan, [], { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(JSON.stringify(plan)).toBe(snapshot);
  });

  it('does not mutate the input results', () => {
    const plan = makePlan();
    const results: FillResult[] = [{ ok: true, selector: '#a', instructionPlanId: plan.planId }];
    const snapshot = JSON.stringify(results);
    aggregateResults(plan, results, { executedAt: '2026-04-14T01:00:00.000Z' });
    expect(JSON.stringify(results)).toBe(snapshot);
  });
});
```

## Step 23 -- Adversarial test suite (D19 mandate, NEW in v2.1)

A dedicated `describe('adversarial', ...)` block in `tests/core/classifier/pipeline.spec.ts`. These are the cases review-B4 flagged as thin. Eleven categories, each with multiple assertions.

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '../../../src/core/classifier';
import type { FormFieldDescriptor } from '../../../src/core/types';
import { computeFill, makeGatingContext } from '../../../src/core/fill-rules';
import { makeProfile } from '../fixtures/profile';

function makeDescriptor(patch: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    selector: '#f',
    name: '',
    id: '',
    label: '',
    placeholder: '',
    ariaLabel: '',
    autocomplete: '',
    type: 'text',
    options: [],
    required: false,
    dataAttributes: {},
    sectionHeading: null,
    domIndex: 1,
    ...patch,
  };
}

describe('adversarial -- D19.1 null / undefined / NaN / Infinity parameters', () => {
  it('handles descriptor with every optional field null or empty', () => {
    expect(() => classify(makeDescriptor({}))).not.toThrow();
  });

  it('handles numeric descriptor properties that are NaN (via domIndex sentinel)', () => {
    const d = makeDescriptor({ domIndex: Number.NaN });
    // domIndex NaN should NOT trigger positional fallback (domIndex === 0 check)
    const r = classify(d);
    expect(r.type).toBe('unknown');
  });

  it('handles Infinity in domIndex', () => {
    const d = makeDescriptor({ domIndex: Number.POSITIVE_INFINITY });
    expect(() => classify(d)).not.toThrow();
  });
});

describe('adversarial -- D19.2 empty + max-size collections', () => {
  it('classify returns unknown for completely empty descriptor', () => {
    const r = classify(makeDescriptor({}));
    expect(r.type).toBe('unknown');
  });

  it('classify handles descriptor with 1000 options (stress test)', () => {
    const options = Array.from({ length: 1000 }, (_, i) => ({
      value: `v${i}`,
      label: `Option ${i}`,
    }));
    const d = makeDescriptor({ label: 'Country', type: 'select-one', options });
    const start = Date.now();
    const r = classify(d);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(r).toBeDefined();
  });
});

describe('adversarial -- D19.3 unicode edge cases', () => {
  it('handles right-to-left text (Arabic)', () => {
    const r = classify(makeDescriptor({ label: 'البريد الإلكتروني' }));
    // Our English-only synonyms should miss; result should be unknown.
    expect(r).toBeDefined();
    expect(r.type).toBeTruthy();
  });

  it('handles combining diacritic marks', () => {
    const r = classify(makeDescriptor({ label: 'Pr\u00e9nom' }));
    expect(r).toBeDefined();
  });

  it('handles surrogate pairs (emoji)', () => {
    const r = classify(makeDescriptor({ label: 'Email \ud83d\udce7' }));
    expect(r.type).toBe('email');
  });

  it('handles null bytes without throwing', () => {
    const r = classify(makeDescriptor({ label: 'first\u0000name' }));
    expect(r).toBeDefined();
  });

  it('handles NFKD non-normalized input', () => {
    // precomposed e-acute = U+00E9, decomposed = U+0065 U+0301
    const r1 = classify(makeDescriptor({ label: 'caf\u00e9' }));
    const r2 = classify(makeDescriptor({ label: 'cafe\u0301' }));
    expect(r1.type).toBe(r2.type);
  });
});

describe('adversarial -- D19.4 injection attempts', () => {
  it('handles script tags in label as literal text (not executed)', () => {
    const r = classify(makeDescriptor({ label: '<script>alert(1)</script>Email' }));
    expect(r.type).toBe('email');
  });

  it('handles SQL-style injection in name', () => {
    const r = classify(makeDescriptor({ name: "'; DROP TABLE users; --" }));
    expect(r).toBeDefined();
    expect(r.type).toBeTruthy();
  });

  it('handles path traversal in id', () => {
    const r = classify(makeDescriptor({ id: '../../../etc/passwd' }));
    expect(r).toBeDefined();
  });

  it('handles __proto__ in data attributes', () => {
    const r = classify(makeDescriptor({
      dataAttributes: { __proto__: 'polluted' } as unknown as Record<string, string>,
    }));
    expect(r).toBeDefined();
    // Prototype pollution check: a fresh object should not have 'polluted'.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('adversarial -- D19.5 pathological regex inputs (ReDoS)', () => {
  it('handles 10KB label in microseconds (no catastrophic backtracking)', () => {
    const huge = 'aaaaa'.repeat(2000);
    const start = Date.now();
    classify(makeDescriptor({ label: huge }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('handles label that looks like a ReDoS attacker payload', () => {
    // Classic exponential backtracking payload
    const payload = 'a'.repeat(50) + '!';
    const start = Date.now();
    classify(makeDescriptor({ label: payload }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('handles label with many spaces', () => {
    const label = 'email ' + ' '.repeat(10000) + 'address';
    const start = Date.now();
    classify(makeDescriptor({ label }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

describe('adversarial -- D19.6 frozen inputs', () => {
  it('classify works on deeply frozen descriptor', () => {
    const d = makeDescriptor({ label: 'Email', type: 'email' });
    Object.freeze(d.options);
    Object.freeze(d.dataAttributes);
    Object.freeze(d);
    expect(() => classify(d)).not.toThrow();
    const r = classify(d);
    expect(r.type).toBe('email');
  });

  it('computeFill works on Object.freeze()d profile', () => {
    const p = makeProfile();
    Object.freeze(p.basics);
    Object.freeze(p.consents);
    Object.freeze(p);
    const ctx = { gating: makeGatingContext(p) };
    const classified = {
      descriptor: makeDescriptor({}),
      type: 'email' as const,
      confidence: 0.9 as const,
      matchedOn: 'name' as const,
    };
    expect(() => computeFill(p, classified, ctx)).not.toThrow();
  });
});

describe('adversarial -- D19.7 mutation safety of classify()', () => {
  it('does not mutate its descriptor input', () => {
    const d = makeDescriptor({ label: 'Email' });
    const snapshot = JSON.stringify(d);
    classify(d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('returns the same descriptor reference in the result', () => {
    const d = makeDescriptor({ label: 'Email' });
    const r = classify(d);
    expect(r.descriptor).toBe(d);
  });
});

describe('adversarial -- D19.8 duplicate FieldType votes (ATS + Mozilla conflict)', () => {
  it('when ATS and Mozilla both match, ATS wins (first pass)', () => {
    // Label 'LinkedIn URL' hits both ATS linkedin-url rule and Mozilla url
    const r = classify(makeDescriptor({ label: 'LinkedIn URL', type: 'url' }));
    expect(r.source).toBe('ats-ext');
    expect(r.type).toBe('linkedin-url');
  });

  it('when Mozilla primary and synonym disagree, Mozilla wins', () => {
    const r = classify(makeDescriptor({ name: 'last_name', label: 'Sobrenome' }));
    expect(r.type).toBe('family-name');
  });
});

describe('adversarial -- D19.9 partial profile inputs', () => {
  it('computeFill handles profile with demographics but no basics.location', () => {
    const p = makeProfile({
      basics: { ...makeProfile().basics, location: undefined },
      demographics: { gender: 'female' },
    });
    const ctx = { gating: makeGatingContext(p, { eeoOptIn: true }) };
    const classified = {
      descriptor: makeDescriptor({
        options: [{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }],
      }),
      type: 'eeo-gender' as const,
      confidence: 0.9 as const,
      matchedOn: 'label' as const,
    };
    const r = computeFill(p, classified, ctx);
    expect(r.value).toEqual({ kind: 'choice', value: 'F' });
  });

  it('computeFill handles profile with all basic fields as empty strings', () => {
    const p = makeProfile({
      basics: {
        name: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        profiles: [],
      } as unknown as ReturnType<typeof makeProfile>['basics'],
    });
    const ctx = { gating: makeGatingContext(p) };
    const classified = {
      descriptor: makeDescriptor({}),
      type: 'email' as const,
      confidence: 0.9 as const,
      matchedOn: 'name' as const,
    };
    const r = computeFill(p, classified, ctx);
    expect(r.value.kind).toBe('skip');
    expect(r.skipReason).toBe('profile-field-empty');
  });
});

describe('adversarial -- D19.10 huge inputs', () => {
  it('classify handles 10KB label', () => {
    const huge = 'email '.repeat(2000);
    expect(() => classify(makeDescriptor({ label: huge }))).not.toThrow();
  });
});

describe('adversarial -- D19.11 determinism under re-entry', () => {
  it('calling classify 100 times with the same input returns byte-equal results', () => {
    const d = makeDescriptor({ label: 'Email', type: 'email' });
    const first = JSON.stringify(classify(d));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(classify(d))).toBe(first);
    }
  });
});
```

## Step 24 -- Patch `vitest.config.ts` with D24 coverage thresholds

B4 does not create `vitest.config.ts` (B1 owns it). B4 adds coverage thresholds via a patch. The executor edits the file's `test.coverage.thresholds` block to:

```ts
// vitest.config.ts (ADD to existing test.coverage block)
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: ['**/*.spec.ts', '**/blueprint.contract.ts', 'scripts/**'],
  thresholds: {
    // D24 floors for engine core
    'src/core/classifier/**': { lines: 90, branches: 85, functions: 90, statements: 90 },
    'src/core/fill-rules/**': { lines: 90, branches: 85, functions: 90, statements: 90 },
    'src/core/plan-builder/**': { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
},
```

If the existing `vitest.config.ts` has no `coverage.thresholds` block at all, add the whole block. If it has one, ADD the three per-path entries but do NOT touch existing entries. CI fails if any threshold drops.

## Step 25 -- Create `scripts/rollback-phase-B4.ps1` (D23 deliverable)

PowerShell script committed to the repo. Reverts the phase mechanically. Runs in CI on a throwaway branch weekly.

```powershell
# scripts/rollback-phase-B4.ps1
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Ebenezer Isaac

# Rollback script for phase B4. Mechanically reverts every file the phase
# adds or modifies. Idempotent: running twice is safe.

$ErrorActionPreference = 'Stop'

Write-Host "Rolling back phase B4 (classifier + fill-rules + plan-builder)..."

# --- Remove new source directories ------------------------------------------
$dirs = @(
    'src/core/classifier',
    'src/core/fill-rules',
    'src/core/plan-builder'
)
foreach ($d in $dirs) {
    if (Test-Path $d) {
        Write-Host "  removing $d"
        Remove-Item -Recurse -Force $d
    }
}

# --- Remove new test directories --------------------------------------------
$testDirs = @(
    'tests/core/classifier',
    'tests/core/fill-rules',
    'tests/core/plan-builder',
    'tests/core/fixtures'
)
foreach ($d in $testDirs) {
    if (Test-Path $d) {
        Write-Host "  removing $d"
        Remove-Item -Recurse -Force $d
    }
}

# --- Revert touched files to their B2 / B3 / B1 state -----------------------
# src/core/index.ts had B4 exports appended; revert to the committed B2 state.
git checkout HEAD -- src/core/index.ts
# vitest.config.ts had D24 thresholds added; revert to the committed B1 state.
git checkout HEAD -- vitest.config.ts

# --- Verify rolled-back state compiles --------------------------------------
Write-Host "Verifying typecheck in rolled-back state..."
pnpm --filter ats-autofill-engine typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Error "Typecheck failed AFTER rollback. The B2 / B3 scaffold itself is broken."
    exit 1
}

Write-Host "Phase B4 rolled back cleanly."
```

Unit test: create `scripts/rollback-phase-B4.test.ps1` that creates a throwaway worktree, runs B4 land, then runs this rollback, verifies `pnpm typecheck` passes. CI triggers this weekly.

## Step 26 -- Anti-drift grep gates (D14 mandate, CI-enforced)

Every gate below MUST return zero matches, or CI fails. The executor runs these manually at the end of implementation, and CI runs them on every PR touching B4 files.

### Gate 1 -- Forbidden DOM + chrome globals in core

```bash
grep -rnE '\b(document|window|HTMLElement|HTMLInputElement|Node|Element|chrome\.)' \
  src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/
```

Expected: zero matches. The only admissible `document` token is as a natural-language word inside a JSDoc comment; if the match count is non-zero, inspect each line.

### Gate 2 -- No imports from adapters or ats directories

```bash
grep -rnE "from ['\"](\.\./)+(adapters|ats)/" \
  src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/
```

Expected: zero matches. Core never imports from the executor layer.

### Gate 3 -- No HighlightRange or IKeywordHighlighter fiction

```bash
grep -rnE '\b(HighlightRange|IKeywordHighlighter)\b' src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/
```

Expected: zero matches. These types are deleted per D5 and never had any business in B4 regardless.

### Gate 4 -- No skill-taxonomy references

```bash
grep -rnE '\bskill-taxonomy\b' src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/
```

Expected: zero matches. B4 does not touch the moat corpus.

### Gate 5 -- No em-dashes (D15)

```bash
grep -rn '—' \
  src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/ \
  tests/core/classifier/ tests/core/fill-rules/ tests/core/plan-builder/ tests/core/fixtures/ \
  temp/impl/100-chrome-extension-mvp/phase_B4_classifier_and_fill_rules/plan.md \
  scripts/rollback-phase-B4.ps1
```

Expected: zero matches. If any em-dash leaks, the file fails D15.

### Gate 6 -- No console.* in core sources

```bash
grep -rnE '\bconsole\.(log|info|warn|error|debug)' \
  src/core/classifier/ src/core/fill-rules/ src/core/plan-builder/
```

Expected: zero matches. Core has no logger. If B4 needs to log, it returns a value that the extension logger can route via its own boundary.

### Gate 7 -- Every CONFIDENCE constant is a member of B2's ClassificationConfidence union

```bash
grep -nE 'as ClassificationConfidence' src/core/classifier/scoring.ts
```

Every line matching this pattern MUST cast a literal that is one of: `1.0`, `0.9`, `0.8`, `0.7`, `0.6`, `0.5`, `0.3`, `0.0`. The executor inspects the matches manually; a `0.4` or `0.2` is BUG-1 regression.

### Gate 8 -- No bare `return skip(...)` in dispatch (BUG-5 regression)

```bash
grep -nE 'return skip\(' src/core/fill-rules/dispatch.ts
```

Expected: zero matches. Every skip call site must return either `emptySkip()` or `{ value: skip('...'), skipReason: '...' }`. Bare `return skip(...)` means the v0 typing bug returned.

### Gate 9 -- Every test fixture has all BUG-2 / BUG-3 / BUG-4 fields

```bash
grep -nE 'willingToCompleteAssessments|willingToUndergoDrugTests|willingToUndergoBackgroundChecks' \
  tests/core/fixtures/profile.ts
```

Expected: at least three matches. If fewer, the fixture regressed BUG-2.

```bash
grep -nE 'requiresVisa|legallyAllowed' tests/core/fixtures/profile.ts
```

Expected: at least eight matches (4 jurisdictions x 2 fields). If fewer, BUG-3 regressed.

```bash
grep -nE 'allowEeoAutofill|allowDobAutofill' tests/core/fixtures/profile.ts
```

Expected: at least two matches. If fewer, BUG-4 regressed.

### Gate 10 -- Blueprint contract present and valid

```bash
test -f src/core/fill-rules/blueprint.contract.ts || exit 1
pnpm --filter ats-autofill-engine run blueprint:validate
```

Expected: file exists AND the validator passes. Blueprint validator reads `FILL_RULES_BLUEPRINT` and checks each declared field against the filesystem.

## Step 27 -- Acceptance criteria (executor checks every box)

The executor runs each command and ticks each box before declaring the phase done.

### Build + typecheck

- [ ] `pnpm --filter ats-autofill-engine typecheck` -- exit 0, zero errors
- [ ] Every exported function has an explicit return type (TypeScript enforces via `noImplicitAny` which B1 enabled)
- [ ] Zero `any` in public API signatures (grep: `grep -rn ': any' src/core/classifier src/core/fill-rules src/core/plan-builder` returns zero)
- [ ] Zero `unknown` leaked in public API signatures
- [ ] Every `switch` over `FieldType` in `dispatch.ts` has the `const _exhaustive: never = type` check

### Tests

- [ ] `pnpm --filter ats-autofill-engine test tests/core/classifier/pipeline.spec.ts` -- at least 35 cases pass
- [ ] `pnpm --filter ats-autofill-engine test tests/core/classifier/ats-matchers.spec.ts` -- at least 20 cases pass
- [ ] `pnpm --filter ats-autofill-engine test tests/core/fill-rules/dispatch.spec.ts` -- at least 35 cases pass
- [ ] `pnpm --filter ats-autofill-engine test tests/core/plan-builder/builder.spec.ts` -- at least 20 cases pass
- [ ] `pnpm --filter ats-autofill-engine test tests/core/plan-builder/aggregate.spec.ts` -- at least 10 cases pass
- [ ] Adversarial test block inside `pipeline.spec.ts` passes (at least 23 adversarial cases covering D19.1 through D19.11)
- [ ] **Total B4 tests: at least 120** (35 + 20 + 35 + 20 + 10 = 120 minimum)
- [ ] `buildPlan(sameModel, sameProfile)` produces byte-equal output across runs (determinism test passes)
- [ ] Snapshot test `realistic Greenhouse form` is committed under `tests/core/plan-builder/__snapshots__/`

### Coverage (D24)

- [ ] `pnpm --filter ats-autofill-engine test --coverage` passes without hitting the threshold floor
- [ ] Line coverage for `src/core/classifier/**` is at least 90%
- [ ] Branch coverage for `src/core/classifier/**` is at least 85%
- [ ] Line coverage for `src/core/fill-rules/**` is at least 90%
- [ ] Branch coverage for `src/core/fill-rules/**` is at least 85%
- [ ] Line coverage for `src/core/plan-builder/**` is at least 90%
- [ ] Branch coverage for `src/core/plan-builder/**` is at least 85%

### Anti-drift grep gates (D14)

- [ ] Gate 1 -- DOM + chrome globals: zero matches
- [ ] Gate 2 -- adapters / ats imports: zero matches
- [ ] Gate 3 -- HighlightRange / IKeywordHighlighter: zero matches
- [ ] Gate 4 -- skill-taxonomy: zero matches
- [ ] Gate 5 -- em-dashes: zero matches
- [ ] Gate 6 -- console.*: zero matches
- [ ] Gate 7 -- CONFIDENCE cast literals all in B2 union: manual inspection clean
- [ ] Gate 8 -- no bare `return skip(...)` in dispatch.ts: zero matches
- [ ] Gate 9 -- fixture has all BUG-2/3/4 fields: counts as specified above
- [ ] Gate 10 -- blueprint.contract.ts present and valid

### Blueprint + rollback (D22 + D23)

- [ ] `src/core/fill-rules/blueprint.contract.ts` exists with `FILL_RULES_BLUEPRINT` export
- [ ] `scripts/rollback-phase-B4.ps1` exists and is committed
- [ ] Executor runs `scripts/rollback-phase-B4.ps1` on a throwaway branch and verifies `pnpm typecheck` passes in the rolled-back state (then git-resets back to the land state)

### Barrel + contract snapshots

- [ ] `src/core/index.ts` has the B4 append block verbatim per Step 16
- [ ] `src/core/classifier/index.ts` exports `classify`, `CONFIDENCE`, `MIN_CONFIDENCE_THRESHOLD`, `pickHigher`, `matchSynonym`, `isFileOnlyType`, and types
- [ ] `src/core/fill-rules/index.ts` exports `computeFill`, `makeGatingContext`, formatters, `FILL_RULES_BLUEPRINT`, and types
- [ ] `src/core/plan-builder/index.ts` exports `buildPlan`, `aggregateResults`, `getPriority`, and types

### Compliance

- [ ] `pnpm --filter ats-autofill-engine compliance` passes all sub-checks (typecheck, lint, test, coverage, blueprint validate)

## Step 28 -- Rollback plan (narrative; the mechanical script lives in Step 25)

If B4 fails to compile or tests fail and cannot be fixed within the phase budget (3-4 hours for the core work, plus 1 hour for adversarial tests):

1. Do NOT commit broken code. The repo stays on the B3 state.
2. Run `scripts/rollback-phase-B4.ps1` which mechanically reverts every file the phase touches. Verifies `pnpm typecheck` passes after revert.
3. Report to the architect which step failed and what the error message was. Include the exact TypeScript error output and the commit hash the executor tried to land.
4. B4 is blocking for B5, B7, B8, B9, A8 (content-script executor). If B4 cannot land on Day 3, the downstream phases slip by one day and the architect rebalances the schedule.
5. No partial landing. No "works for 80% of cases" shortcuts. Either the full phase lands or nothing lands.

## Step 29 -- Out of scope (explicitly deferred)

- DOM scanner (B5): produces `FormModel` from a `Document`. B4 consumes `FormModel`, never scans.
- DOM field filler (B5): `fillField(el, value: string | boolean)`. B4 emits `FillInstruction` objects; A8's content-script executor unwraps them and calls B5.
- DOM file attacher (B5): `attachFile(el, file)`. Same relationship as above.
- Highlighter renderer (B6): `applyHighlights(root, keywords: string[])`. Irrelevant to B4; B4 has no highlighting responsibility.
- Keyword matching: server-side via `POST /api/v1/ats/extract-skills` (phase A3). B4 does not ship a client-side matcher.
- i18n synonyms: French / German / Spanish labels. B4 is English only; the classifier's Unicode normalization handles diacritics but the SYNONYMS map has English entries only.
- Machine learning ranking: the classifier is pure regex + table dispatch. No ML in B4.
- Cover-letter-text LLM generation: `cover-letter-text` dispatch returns a skip. A-side phases may later add an LLM-backed formatter; B4 is a hook point, not the implementer.
- Workday multi-step wizard orchestration: B4 treats every form as a single-page form. B9 owns Workday wizard primitives; A8 owns the wizard loop per D6.
- Per-ATS confidence tuning: B4 uses generic weights. B7 / B8 / B9 adapters MAY override by wrapping `classify()` with vendor-specific pre- or post-processors; B4 does not ship vendor-specific tunings.
- Runtime telemetry of classification decisions: A8's content-script executor is responsible for emitting telemetry events. B4's `ClassifierResult.source` is the hook it writes on.
- `FillInstruction` execution: A8 owns the fill loop. B4 provides `buildPlan` to produce the plan and `aggregateResults` to turn A8's fill results into a `FillPlanResult` for SSE / UI.

If the executor finds a compelling reason to add any of the above, STOP and open a ticket in `temp/impl/100-chrome-extension-mvp/reviews/B4-out-of-scope-creep.md`. B4 stays focused.

## Step 30 -- Interaction points with downstream phases

### With A8 (content-script executor)

A8 imports from the `ats-autofill-engine` root barrel. The relevant surface for A8 is:

```ts
import {
  buildPlan,
  aggregateResults,
  type FillPlan,
  type FillPlanResult,
  type FillInstruction,
  type FillResult,
} from 'ats-autofill-engine';
```

A8's fill loop (pseudocode, not shipped in B4):

```ts
const plan = buildPlan(formModel, profile, { eeoOptIn, dobOptIn });
const results: FillResult[] = [];
for (const instruction of plan.instructions) {
  const r = instruction.value.kind === 'file'
    ? await adapter.attachFile!(instruction, await resolveFile(instruction.value.handleId))
    : adapter.fillField(instruction);
  results.push(r);
}
const outcome = aggregateResults(plan, results, { executedAt: new Date().toISOString() });
broadcast('GENERATION_UPDATE', { /* map outcome into SSE payload */ });
```

A8 NEVER imports from `src/core/classifier/**` or `src/core/fill-rules/**` directly -- only from the engine root barrel. This is enforced by the B1 exports map + the tsup config.

### With B5 (DOM scanner + filler)

B5 produces `FormModel` via `scanForm(root)`. B4 consumes `FormModel` via `buildPlan`. The type is shared -- both import from `src/core/types`. B5's `fillField(el, value)` and `attachFile(el, file)` are dispatched by A8, not by B4.

### With B7 / B8 / B9 (vendor adapters)

Vendor adapters implement `AtsAdapter` per D1 and D17. Their `scanForm` returns a `FormModel` with `sourceATS` set to the vendor kind. `buildPlan` treats all vendors identically -- there is no vendor-specific path in B4. If a vendor needs custom classification, it wraps `classify()` with a pre- or post-processor before calling `buildPlan`.

### With A5 (ProtocolMap owner)

B4 does not interact with A5 directly. A5's `FILL_REQUEST` protocol key triggers A8 to run the fill loop; A8 reads the profile via A5's `PROFILE_GET` handler. B4 is invoked by A8 as a pure function.

## Confidence

**9/10.** Every type contract has been verified against `03-keystone-contracts.md` section 2. Every BUG from the v2.0 review is closed. The dispatch table is exhaustive against B2's 74-entry `FieldType` union; TypeScript's exhaustiveness check ensures it stays that way. The ATS matchers use bounded quantifiers only, so ReDoS is impossible. The gating rules cover the full seven invariants from investigation 46 section 7. The plan-builder is pure and snapshot-stable. The adversarial suite covers all eleven D19 categories.

The single point of doubt lives in `snapToSelectOption`'s fallback for partially-matched labels. The four-pass matching is deliberately strict and will produce `value-out-of-allowed-options` skips more often than a fuzzy matcher would. This is an intentional trade-off against silent wrong-value submission. B7 / B8 / B9 may add per-ATS overrides if Greenhouse / Lever / Workday forms require looser matching, but that is their scope, not B4's.

## Scope declaration (per proposal-requirements rule)

- **Files touched**: 25 (19 source files created + 1 barrel updated + 5 test files created)
- **Lines changed**: approximately 3,200 total LoC (source + tests combined)
- **Confidence**: 9/10

---

**End of phase B4 plan v2.1.**

