# Phase B2 -- Core types + taxonomy + profile schema (v2.1 rewrite)

## Phase metadata

| Key | Value |
|---|---|
| **Plan** | 100 -- Chrome extension MVP (v2.1) |
| **Phase** | B2 |
| **Title** | Core types + taxonomy + profile schema |
| **Target repo** | `ebenezer-isaac/ats-autofill-engine` (standalone repo; B1 scaffolded it) |
| **Local path** | `e:/ats-autofill-engine` (absolute working dir per D4) |
| **Day** | 2 (2026-04-13) |
| **Depends on** | B1 v2.1 (pnpm workspace, `tsconfig.core.json`, `zod@^3.23.8` in dependencies, tsup entry map with `./profile` sub-entry, ESLint + vitest + happy-dom, `LICENSES/MPL-2.0.txt`, pre-commit em-dash grep hook) |
| **Blocks** | B3 (heuristics port), B4 (classifier + plan builder), B5 (DOM scanner + filler), B6 (highlighter renderer), B7 (Greenhouse adapter), B8 (Lever adapter), B9 (Workday adapter + publish), A5 (bg messaging), A7 (profile storage + options), A8 (content-script controller), A9 (content-script highlight + intent) |
| **Estimated effort** | 4-6 hours |
| **Executor** | Sonnet (64k context) -- plan is self-contained, zero external lookups required |
| **Confidence** | 9/10 (see rationale below) |
| **Scope declaration** | **Files touched**: 27 new source + 7 new test = 34. **Lines added**: approximately 2400 (source) + 1500 (tests) = approximately 3900. **Lines modified**: 0 (everything new). **Lines removed**: 0 (B1 placeholder files are overwritten, not deleted). |

### Confidence rationale

9/10 because (a) every type and every test assertion is pinned verbatim against `03-keystone-contracts.md` Section 2 (the single source of truth for cross-phase contracts), (b) every consumer of B2 (B3, B4, B5, B6, B7, B8, B9, A5, A7, A8, A9) has had its import list cross-referenced with the type exports shipped here, and (c) this is a pure type-and-validation phase with zero runtime side effects so rollback is a clean git reset. The remaining 1 point of uncertainty is the Zod v3.23 `.strict()` interaction with `.passthrough()` on the single metadata field `updatedAtMs` -- the plan spells out the exact pattern to use, but a Zod minor-version surprise could still require a 2-line adjustment during execution.

---

## Required reading (in order)

1. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\02-decisions-v2.1-final.md` -- D5 (B2 scope), D7 (FillPlanResult), D8 (SkipReason vs FillError), D9 (AtsKind), D14 (anti-drift gates), D15 (em-dash rule), D16 (branded types), D17 (factory pattern), D19 (adversarial tests), D22 (blueprint.contract.ts), D24 (coverage floors). This memo is the absolute contract for B2's scope.
2. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\03-keystone-contracts.md` -- **Section 2 in full** (B2 ships every type in Section 2 verbatim). Also Section 3 (profile layout), Section 10 (the import matrix that tells you which consumer needs which symbol).
3. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\reviews\review-B2.md` -- the drift findings this rewrite resolves.
4. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B1_scaffold\plan.md` -- confirms the preconditions (tsconfig.core.json with `lib: ["ES2022"]` and no DOM, `zod` in dependencies, `./profile` sub-entry in the exports map). If any precondition fails, STOP and report B1 drift.
5. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B3_mozilla_heuristics_port\plan.md` -- B3 imports `FieldType`, port types, and the classified-field shape from B2. B2 must ship both.
6. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B4_classifier_and_fill_rules\plan.md` -- B4 imports `ClassifiedField` with `{ descriptor, type, confidence, matchedOn }`, `FillPlan`, `FillInstruction`, `FillValue`, `SkipReason`, `Profile`, taxonomy constants. B2 must ship every single symbol B4 imports.
7. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B5_dom_adapter_scanner_and_filler\plan.md` -- B5 imports `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillResult`, `FillError`.
8. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B6_dom_adapter_highlighter_renderer\plan.md` -- B6 does NOT import `HighlightRange`. `HighlightRange` is deleted in v2. The renderer takes `readonly string[]` directly. B2 MUST NOT ship `HighlightRange` or `IKeywordHighlighter`.
9. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B7_greenhouse_adapter\plan.md` -- B7 imports `AtsAdapter`, `AtsKind`, `FormModel`, `FillInstruction`, `FillResult`, `JobPostingData`.
10. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B8_lever_adapter\plan.md` -- B8 imports the same symbols as B7.
11. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B9_workday_adapter_and_publish\plan.md` -- B9 imports `AtsAdapter`, `WorkdayWizardStep`, `FillPlanResult`, per-step primitives in addition to the B7 set.
12. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_A7_profile_storage_and_options\plan.md` -- A7 imports `Profile`, `ProfileSchema`, `createEmptyProfile` from `ats-autofill-engine/profile` sub-entry. The A7 options page uses `(profile.profileVersion, profile.updatedAtMs)` as the React composite key (D10); B2 must expose `updatedAtMs` on `Profile`.

### Reading order rationale

You read the decision memo first so you know why the changes exist. You read the keystone contracts second so you know the exact text to paste. You read the review third so you know which pitfalls the v1 plan fell into. You read B1 fourth to confirm scaffold is ready. You read B3-B9 and A7 last, treating them as consumer contracts: each one tells you which symbol it will import, and your job is to ship every one.

---

## Goal

Create every pure-TypeScript type, taxonomy constant, Zod schema, helper function, and port interface that any downstream phase (engine or extension) imports from `ats-autofill-engine` or `ats-autofill-engine/profile`. No business logic, no DOM references, no Chrome references, no side effects. After B2 lands, every consumer phase can `import` its contract without adding new types.

Concrete acceptance:

- `pnpm --filter ats-autofill-engine typecheck` passes against `tsconfig.core.json` (which has `lib: ["ES2022"]`; there is no `"DOM"` in `lib`).
- `pnpm --filter ats-autofill-engine test tests/core` passes with 80 plus tests green.
- `grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core/` returns zero matches across every `.ts` file (INCLUDING JSDoc comments). Per D14.
- `grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/` returns zero matches. Per D14.
- `grep -rl $'\u2014'` (em-dash scan) across `src/`, `tests/`, and this plan returns zero. Per D15.
- Every branded ID constructor (`TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId`, `ResumeHandleId`) round-trips through the `unbrand` helper. Per D16.
- `src/core/blueprint.contract.ts` is committed per D22 and the anti-drift CI script can read it.
- Coverage on `src/core/**` exceeds 90 percent line and 85 percent branch. Per D24.

---

## Hard invariants (enforced by grep gates in step 23, never cross)

1. **Core is DOM-free.** No reference to `document`, `window`, `HTMLElement`, `Node`, `Element`, `chrome.*` anywhere under `src/core/**`, including JSDoc comment text. Instead use phrases like "source element", "scanned form", "host platform-native storage", "resume/CV file".
2. **Core is Chrome-free.** Zero `chrome.*` mentions in `src/core/**`.
3. **Core has no v1 remnants.** Zero mentions of `HighlightRange`, `IKeywordHighlighter`, `skill-taxonomy` anywhere in `src/`.
4. **Core imports only `zod`** (and type-only imports from its own sub-paths). No `@repo/shared-types`, no `@nestjs/*`, no SDKs.
5. **Every object type is `readonly`** at the field level, every array is `ReadonlyArray<T>`, every record is `Readonly<Record<K, V>>`. Zero mutable fields.
6. **Every Zod object uses `.strict()`** except the one documented exception for `updatedAtMs` where `.passthrough()` applies, and even that is documented inline.
7. **Zero em-dashes.** `-` or `--` only. This applies to plan prose AND code comments AND test descriptions. Per D15.
8. **Zero `any`.** `grep -rE '\bany\b' src/core/` returns zero. Use `unknown` for opaque boundaries.
9. **Branded IDs cross every module boundary.** `TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId`, `ResumeHandleId` wrap all primitive identifiers. Raw `number`/`string` IDs are rejected at compile time.
10. **Profile lives at `src/core/profile/**`** (NOT under `src/core/types/profile/`). Per keystone Section 3.

---

## File plan

### Source files to create (27 total)

#### Core types (under `src/core/types/`) -- 11 files

| # | Path | Size | Purpose |
|---|---|---|---|
| 1 | `src/core/types/brands.ts` | approximately 55 lines | Branded primitives per D16 (6 brands plus `unbrand` helpers) |
| 2 | `src/core/types/ats-kind.ts` | approximately 35 lines | `AtsKind` union + `ATS_KINDS` const + `isAtsKind` type guard + `AtsVendor` backward-compat alias |
| 3 | `src/core/types/form-model.ts` | approximately 120 lines | `FormFieldDescriptor`, `FormFieldOption`, `FormModel` with optional `sourceATS` and `formRootSelector` (keystone 2.4), `freezeFormModel` helper |
| 4 | `src/core/types/fill-instruction.ts` | approximately 140 lines | `FillValue` discriminated union, `SkipReason` union (D8), `FillInstruction`, `FillPlan`, `FillError`, `FillResult`, `AttachFailureReason` |
| 5 | `src/core/types/fill-plan-result.ts` | approximately 60 lines | `AbortReason`, `FillPlanResult` (D7, keystone 2.6) |
| 6 | `src/core/types/classified-field.ts` | approximately 80 lines | `ClassificationConfidence`, `ClassifiedField` with `{descriptor, type, confidence, matchedOn}` shape for B4 |
| 7 | `src/core/types/job-posting.ts` | approximately 70 lines | `JobPostingData` per keystone 2.7 |
| 8 | `src/core/types/page-intent.ts` | approximately 55 lines | `PageIntent` discriminated union and `DetectedIntent` record per keystone 2.8 |
| 9 | `src/core/types/ats-adapter.ts` | approximately 90 lines | `AtsAdapter` interface plus `WorkdayWizardStep` literal union per keystone 2.9 |
| 10 | `src/core/types/extracted-skill.ts` | approximately 40 lines | `ExtractedSkill` record per keystone 2.10 (used by A5 KEYWORDS_EXTRACT consumer) |
| 11 | `src/core/types/index.ts` | approximately 90 lines | Barrel re-exporting every symbol above |

Deleted vs current plan:

- `src/core/types/highlight-range.ts` -- **never created**. Review says this file is the blocker. B6 takes `string[]` directly.
- `src/core/types/ats-vendor.ts` -- **renamed** to `ats-kind.ts` (D9). An alias `export type AtsVendor = AtsKind` is shipped in `ats-kind.ts` for one-release backward compatibility; deprecated and removed in 2.2.

#### Profile schema (under `src/core/profile/`) -- 5 files

Profile lives at `src/core/profile/**` per keystone Section 3 (NOT `src/core/types/profile/`). If B1 scaffolded a placeholder there, overwrite.

| # | Path | Size | Purpose |
|---|---|---|---|
| 12 | `src/core/profile/types.ts` | approximately 340 lines | All pure TypeScript interfaces: `Profile`, `Basics`, `Location`, `SocialProfile`, `WorkExperience`, `Education`, `Skill`, `Language`, `Certificate`, `Project`, `Volunteer`, `Award`, `Publication`, `Reference`, `JurisdictionAuthorization`, `JobPreferences`, `SalaryExpectation`, `Demographics`, `DemographicAnswer`, `Gender`, `Race`, `VeteranStatus`, `DisabilityStatus`, `ResumeHandle`, `CoverLetterHandle`, `Documents`, `Consents`, `ProfileVersion`. Every field `readonly`. `updatedAtMs: number` at the root level. |
| 13 | `src/core/profile/schema.ts` | approximately 360 lines | Zod schemas: `ProfileSchema` (draft-tolerant: email accepts empty string literal), `CompleteProfileSchema` (strict: email is an RFC-valid address), helper `isProfileFillReady(p)`. Every object `.strict()` except the root which is `.passthrough()` ONLY for `updatedAtMs`. |
| 14 | `src/core/profile/defaults.ts` | approximately 120 lines | `createEmptyProfile()` (prod) returns a draft-valid profile with `basics.email = ''`. `createPlaceholderProfile()` (test fixture) returns an otherwise empty profile with `basics.email = 'placeholder@example.com'`. Both stamp `updatedAtMs: now()`. |
| 15 | `src/core/profile/migrations.ts` | approximately 45 lines | `ProfileMigration<From, To>` type, `MIGRATIONS` registry (empty at 1.0), `migrateProfile()` no-op passthrough. |
| 16 | `src/core/profile/index.ts` | approximately 110 lines | Barrel re-exporting every symbol from the four files above. |

#### Taxonomy (under `src/core/taxonomy/`) -- 5 files

| # | Path | Size | Purpose |
|---|---|---|---|
| 17 | `src/core/taxonomy/field-types.ts` | approximately 130 lines | `FieldType` literal union, 74 entries verbatim from agent 46 section 3. |
| 18 | `src/core/taxonomy/mozilla-baseline.ts` | approximately 50 lines | `MOZILLA_BASELINE_FIELD_TYPES` (the 32-entry subset: 14 identity/contact + 11 address + 7 personal) plus `MOZILLA_BASELINE_SET`. The test asserts 32, not 25; the enum is the source of truth. |
| 19 | `src/core/taxonomy/ats-extensions.ts` | approximately 110 lines | `ATS_EXTENSION_FIELD_TYPES`, `EEO_FIELD_TYPES`, `CONSENT_FIELD_TYPES`, `DOB_FIELD_TYPES`, guards `isAtsExtensionField`, `isEeoField`, `isConsentField`, `isDobField`. |
| 20 | `src/core/taxonomy/synonyms.ts` | approximately 220 lines | `SYNONYMS: Readonly<Record<FieldType, ReadonlyArray<string>>>`. English only. Lowercase only. First match wins in classifier (B4). |
| 21 | `src/core/taxonomy/index.ts` | approximately 45 lines | Barrel. |

#### Ports (under `src/core/ports/`) -- 1 file

| # | Path | Size | Purpose |
|---|---|---|---|
| 22 | `src/core/ports/index.ts` | approximately 140 lines | `IFormScanner`, `IFieldFiller`, `IFileAttacher`, `IPageIntentDetector`, `IProfileProvider`. **NO `IKeywordHighlighter`.** All JSDoc sanitized per the grep gate. |

#### Core barrel and blueprint -- 2 files

| # | Path | Size | Purpose |
|---|---|---|---|
| 23 | `src/core/index.ts` | approximately 25 lines | Re-exports everything from `./types`, `./profile`, `./taxonomy`, `./ports`. This is what `main` / `exports['.']` points to. |
| 24 | `src/core/blueprint.contract.ts` | approximately 95 lines | D22 anti-drift contract: declares `publicExports`, `forbiddenImports`, `requiredCoverage` = 90. Read by `scripts/check-blueprint-contracts.mjs`. |

#### Utility (under `src/core/util/`) -- 3 files

| # | Path | Size | Purpose |
|---|---|---|---|
| 25 | `src/core/util/freeze-deep.ts` | approximately 50 lines | `freezeDeep<T>(obj): Readonly<T>` helper used by `freezeFormModel`. |
| 26 | `src/core/util/iso-8601.ts` | approximately 60 lines | `isIso8601Date`, `isIso8601DateTime`, small regex helpers. Shared between Zod and tests. |
| 27 | `src/core/util/index.ts` | approximately 15 lines | Barrel. |

### Test files to create (7 total)

All tests under `tests/core/`. Vitest with the `node` environment project that B1 configured.

| # | Path | Size | Coverage target |
|---|---|---|---|
| T1 | `tests/core/types/brands.spec.ts` | approximately 120 lines | `TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId`, `ResumeHandleId`: construction, round-trip via `unbrand`, compile-time wrong-type rejection (type-test via `expectTypeOf`), zero-size runtime footprint assertion. |
| T2 | `tests/core/types/ats-adapter.type-test.ts` | approximately 90 lines | Pure type assertions per D14: `AtsAdapter extends { kind: AtsKind; scanForm: (r: Document) => FormModel; ... }`, `WorkdayWizardStep` is the exact 5-member union, backward compat alias works. |
| T3 | `tests/core/types/form-model.spec.ts` | approximately 110 lines | Literal construction, `freezeFormModel` freezes nested arrays and records, optional `sourceATS` and `formRootSelector` present, double-freeze is idempotent. |
| T4 | `tests/core/types/fill-instruction.spec.ts` | approximately 130 lines | `FillValue` five-variant union exhaustiveness (compile-time `never` check), `SkipReason` 7 values, `FillError` 7 values, `FillResult` discriminated union switches correctly. |
| T5 | `tests/core/profile/schema.spec.ts` | approximately 640 lines | The adversarial suite (see below). At least 80 assertions across the 6 D19 categories + the reviewer-required fuzz tests. |
| T6 | `tests/core/profile/defaults.spec.ts` | approximately 110 lines | `createEmptyProfile` and `createPlaceholderProfile` round-trip, new-object-per-call, `updatedAtMs` stamped, `ProfileSchema.parse` succeeds for both, `CompleteProfileSchema.parse` fails for empty prod profile and passes for placeholder. |
| T7 | `tests/core/taxonomy/field-types.spec.ts` | approximately 90 lines | 32 baseline count, 49 plus extension count, XOR partition, total >= 74, staple membership, `isEeoField` and siblings return correct booleans for the 20-plus key fields. |

(Existing `tests/core/taxonomy/synonyms.spec.ts`, `tests/core/profile/migrations.spec.ts` from the v1 plan are preserved verbatim; they test material that has not changed. They are listed in step 22 but not expanded here, count them as T8 and T9 for line totals; the 8-plus-1 total quoted in the step list refers to the 7 new-or-rewritten specs above.)

---

## Step-by-step implementation

Each step ships exactly one file (or one tightly coupled pair) and ends with a localized `pnpm typecheck`. If any step fails typecheck, STOP and report. Do not paper over with `any`.

### Step 1 -- Verify B1 scaffold preconditions

From `e:/ats-autofill-engine`:

```bash
pnpm --filter ats-autofill-engine typecheck   # MUST pass before B2 starts
node -e "console.log(require('./package.json').dependencies.zod)"   # MUST print '^3.23.8'
grep -q '"./profile"' package.json || { echo "B1 missing ./profile sub-entry"; exit 1; }
grep -q '"lib": \["ES2022"\]' tsconfig.core.json || { echo "B1 tsconfig.core lib is wrong"; exit 1; }
[ -f LICENSES/MPL-2.0.txt ] || { echo "B1 MPL license file missing"; exit 1; }
```

If any check fails, that is B1 drift. STOP and report to the human operator. Do NOT auto-patch B1 from inside B2.

If all pass, proceed.

### Step 2 -- `src/core/util/freeze-deep.ts`

Used by `freezeFormModel` and by tests. Pure, small, no dependencies.

```ts
/**
 * Recursively freezes an object. Arrays are frozen as arrays (Object.freeze
 * on the array itself plus every element if it is an object). Records are
 * frozen similarly. Primitives pass through unchanged.
 *
 * Guarantees:
 * - Returned object is `Object.isFrozen` === true
 * - Every reachable nested object is frozen
 * - Same reference returned for primitives
 * - Does NOT mutate the input if it is already frozen (idempotent)
 *
 * Invariant: does not follow circular references. Caller must ensure inputs
 * are acyclic. Circular inputs throw with a descriptive error.
 */
export function freezeDeep<T>(value: T, seen: WeakSet<object> = new WeakSet()): Readonly<T> {
  if (value === null || typeof value !== 'object') return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) {
    throw new Error('freezeDeep: circular reference detected');
  }
  seen.add(obj);
  if (Object.isFrozen(obj)) return value as Readonly<T>;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item, seen);
    return Object.freeze(value) as Readonly<T>;
  }
  for (const key of Object.keys(obj) as Array<keyof typeof obj>) {
    freezeDeep((obj as Record<string, unknown>)[key as string], seen);
  }
  return Object.freeze(value) as Readonly<T>;
}
```

Run `pnpm typecheck`.

### Step 3 -- `src/core/util/iso-8601.ts`

Shared regex helpers. Zod schemas reference these.

```ts
/**
 * ISO-8601 date only: YYYY-MM-DD. No timezone, no time component.
 */
export const ISO_8601_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO-8601 datetime with timezone: YYYY-MM-DDTHH:mm:ssZ or with offset.
 * Accepts milliseconds.
 */
export const ISO_8601_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIso8601Date(s: string): boolean {
  if (!ISO_8601_DATE_REGEX.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

export function isIso8601DateTime(s: string): boolean {
  if (!ISO_8601_DATETIME_REGEX.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
```

Tests exist in T5 (profile schema spec) implicitly through Zod runs.

### Step 4 -- `src/core/util/index.ts`

```ts
export { freezeDeep } from './freeze-deep';
export {
  ISO_8601_DATE_REGEX,
  ISO_8601_DATETIME_REGEX,
  isIso8601Date,
  isIso8601DateTime,
} from './iso-8601';
```

### Step 5 -- `src/core/types/brands.ts` (D16, keystone 2.2)

VERBATIM from keystone 2.2. Do not improvise.

```ts
/**
 * Nominal typing helper. A branded type pairs a primitive with a
 * compile-time-only marker so that two brands cannot be mixed up
 * even though at runtime they are both strings (or both numbers).
 */
type Brand<T, B> = T & { readonly __brand: B };

export type TabId = Brand<number, 'TabId'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type ResumeHandleId = Brand<string, 'ResumeHandleId'>;

export const TabId = Object.assign(
  (n: number): TabId => n as TabId,
  { unbrand: (id: TabId): number => id as unknown as number },
);
export const GenerationId = Object.assign(
  (s: string): GenerationId => s as GenerationId,
  { unbrand: (id: GenerationId): string => id as unknown as string },
);
export const SessionId = Object.assign(
  (s: string): SessionId => s as SessionId,
  { unbrand: (id: SessionId): string => id as unknown as string },
);
export const RequestId = Object.assign(
  (s: string): RequestId => s as RequestId,
  { unbrand: (id: RequestId): string => id as unknown as string },
);
export const PlanId = Object.assign(
  (s: string): PlanId => s as PlanId,
  { unbrand: (id: PlanId): string => id as unknown as string },
);
export const ResumeHandleId = Object.assign(
  (s: string): ResumeHandleId => s as ResumeHandleId,
  { unbrand: (id: ResumeHandleId): string => id as unknown as string },
);
```

Write the T1 test now (see step 22 for full code): verifies construction, `unbrand` round-trip, and a `@ts-expect-error` line proving you cannot pass a raw number where `GenerationId` is expected.

Run `pnpm typecheck`.

### Step 6 -- `src/core/types/ats-kind.ts` (D9, keystone 2.3)

```ts
/**
 * Canonical ATS vendor enumeration. Adding a new vendor in v1.1 means
 * editing ONE file. Every consumer imports from here.
 */
export type AtsKind = 'greenhouse' | 'lever' | 'workday';

export const ATS_KINDS: ReadonlyArray<AtsKind> = Object.freeze([
  'greenhouse',
  'lever',
  'workday',
] as const);

/**
 * Runtime type guard. Zod schemas use this under the hood for `AtsKind` fields.
 */
export function isAtsKind(x: unknown): x is AtsKind {
  return typeof x === 'string' && (ATS_KINDS as ReadonlyArray<string>).includes(x);
}

/**
 * Backward-compat alias. v1 used `AtsVendor`. One-release grace period then
 * remove in 2.2. Consumers should migrate to `AtsKind`. See D9.
 *
 * @deprecated Use `AtsKind`. Removed in 2.2.
 */
export type AtsVendor = AtsKind;
```

### Step 7 -- `src/core/types/form-model.ts` (keystone 2.4)

```ts
import type { AtsKind } from './ats-kind';
import { freezeDeep } from '../util/freeze-deep';

/**
 * A single select option. Value is the form post value; label is the visible
 * text. Both are plain strings -- no reference to the source element.
 */
export interface FormFieldOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A single form field snapshot, as extracted by a scanner adapter.
 * All fields are plain strings or numbers. No reference to the source element
 * appears here. Adapters that want to resolve back to the live element carry
 * their own internal map keyed on `selector`.
 */
export interface FormFieldDescriptor {
  /** Stable selector the adapter can resolve later (CSS selector or XPath). */
  readonly selector: string;
  /** `name` attribute, or null if absent. */
  readonly name: string | null;
  /** `id` attribute, or null. */
  readonly id: string | null;
  /** Resolved label text (via `for=`, ancestor, or aria-labelledby). Null if the scanner could not resolve one. */
  readonly label: string | null;
  /** `placeholder` text, or null. */
  readonly placeholder: string | null;
  /** `aria-label` resolved text, or null. */
  readonly ariaLabel: string | null;
  /** `autocomplete` token, or null. */
  readonly autocomplete: string | null;
  /** HTML input type string, e.g. "text", "email", "file", "select", "textarea", "checkbox", "radio", "combobox". */
  readonly type: string;
  /** Select options in source order. Empty for non-select fields. */
  readonly options: ReadonlyArray<FormFieldOption>;
  /** Whether the field is marked required by the source platform. */
  readonly required: boolean;
  /** `data-*` attribute snapshot. */
  readonly dataAttributes: Readonly<Record<string, string>>;
  /** Nearest ancestor heading text or section label, if any. */
  readonly sectionHeading: string | null;
  /** Zero-based index within the scanned form (fallback ordering signal). */
  readonly domIndex: number;
}

/**
 * An ordered, immutable snapshot of every form field the scanner detected.
 * `url` is captured at scan time so downstream logic can detect page changes.
 * `sourceATS` is set by vendor adapters (B7/B8/B9) so the classifier can
 * short-circuit vendor-specific mapping. `formRootSelector` identifies the
 * form-root element (useful for re-scanning the same form).
 */
export interface FormModel {
  readonly url: string;
  readonly title: string;
  /** ISO-8601 datetime (YYYY-MM-DDTHH:mm:ss.sssZ). */
  readonly scannedAt: string;
  readonly fields: ReadonlyArray<FormFieldDescriptor>;
  /** Optional per keystone 2.4. Set by the vendor adapter when known. */
  readonly sourceATS?: AtsKind;
  /** Optional per keystone 2.4. Identifies the form root for re-scans. */
  readonly formRootSelector?: string;
}

/**
 * Deeply freezes a FormModel so downstream code cannot mutate it. This is the
 * preferred way vendor adapters hand the model back to the engine, so the
 * classifier and plan-builder cannot accidentally stomp on it.
 */
export function freezeFormModel(m: FormModel): FormModel {
  return freezeDeep(m);
}
```

### Step 8 -- `src/core/types/fill-instruction.ts` (keystone 2.5, D8)

```ts
import type { PlanId, ResumeHandleId } from './brands';
import type { FieldType } from '../taxonomy/field-types';

/**
 * Why a fill was skipped BEFORE touching the source element. Distinct from
 * `FillError` per D8: `SkipReason` is decided in the plan-builder pass, before
 * any adapter runs. `FillError` is decided by the adapter after attempting
 * the fill. They are two orthogonal concepts with no union between them.
 */
export type SkipReason =
  | 'profile-field-empty'
  | 'consent-not-granted'
  | 'consent-denied-field-type'
  | 'htmlTypeGuard-rejected'
  | 'value-out-of-allowed-options'
  | 'skipped-by-user'
  | 'out-of-scope-for-v1';

/**
 * Discriminated union of values the adapter writes. File attachments carry a
 * `ResumeHandleId` (the adapter resolves the handle to actual bytes through
 * the `IFileAttacher` port). The `skip` variant is how the plan-builder
 * signals "do not touch this field and here is why".
 */
export type FillValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'choice'; readonly value: string }
  | { readonly kind: 'file'; readonly handleId: ResumeHandleId; readonly hint?: string }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

/**
 * A single operation the adapter must perform to fill one field.
 * `selector` is the same selector present on the `FormFieldDescriptor` that
 * produced this instruction. `planId` is the parent plan's id, allowing the
 * adapter to correlate back to the plan that generated this instruction.
 */
export interface FillInstruction {
  readonly selector: string;
  readonly field: FieldType;
  readonly value: FillValue;
  /** Execution ordering priority (lower = earlier). Default 100. */
  readonly priority: number;
  readonly planId: PlanId;
}

/**
 * Ordered list of fill instructions plus a parallel list of fields that were
 * deliberately skipped (for UI + debugging).
 */
export interface FillPlan {
  readonly planId: PlanId;
  /** ISO-8601 datetime. */
  readonly createdAt: string;
  readonly formUrl: string;
  readonly instructions: ReadonlyArray<FillInstruction>;
  readonly skipped: ReadonlyArray<{
    readonly instruction: FillInstruction;
    readonly reason: SkipReason;
  }>;
}

/**
 * Adapter-side error categories. These are decided AFTER touching the source
 * element. Distinct from `SkipReason` per D8. 7 entries:
 * - `selector-not-found`: the selector did not resolve to anything
 * - `element-disabled`: the resolved element is disabled and cannot accept input
 * - `element-not-visible`: resolved but hidden/offscreen beyond recovery
 * - `value-rejected-by-page`: platform-native validation rejected the value
 * - `file-attach-failed`: file attachment API threw or the resolver returned null
 * - `wrong-entry-point-for-file`: tried to attach a file to a non-file field
 * - `unknown-error`: catch-all for unanticipated failures
 */
export type FillError =
  | 'selector-not-found'
  | 'element-disabled'
  | 'element-not-visible'
  | 'value-rejected-by-page'
  | 'file-attach-failed'
  | 'wrong-entry-point-for-file'
  | 'unknown-error';

/**
 * Result of a single fill attempt. Discriminated on `ok`.
 * Always includes `selector` and `instructionPlanId` regardless of success
 * so the caller can correlate back to the plan without additional lookups.
 */
export type FillResult =
  | { readonly ok: true; readonly selector: string; readonly instructionPlanId: PlanId }
  | {
      readonly ok: false;
      readonly selector: string;
      readonly error: FillError;
      readonly instructionPlanId: PlanId;
    };

/**
 * DOM-level fill result without plan correlation. Used by low-level DOM
 * fillers (B5) that operate below the instruction-plan layer. Adapter
 * factories (B7/B8/B9) thread `instructionPlanId` to produce `FillResult`.
 */
export type DomFillResult =
  | { readonly ok: true; readonly selector: string }
  | { readonly ok: false; readonly selector: string; readonly error: FillError };

/**
 * Why an `IFileAttacher.attach()` call failed. Exported for B5/B7/B8/B9
 * consumers who need to surface reasons to the UI (e.g. "resume is too big").
 * Note: this is strictly narrower than `FillError['file-attach-failed']`.
 */
export type AttachFailureReason =
  | 'handle-not-found'
  | 'bytes-unavailable'
  | 'size-limit-exceeded'
  | 'mime-type-rejected'
  | 'target-not-file-input'
  | 'native-api-threw';
```

### Step 9 -- `src/core/types/fill-plan-result.ts` (D7, keystone 2.6)

```ts
import type { FillInstruction, FillResult, SkipReason } from './fill-instruction';
import type { PlanId } from './brands';

/**
 * Why an entire `FillPlanResult` aborted before or during execution. Distinct
 * from `SkipReason` (per-field) and `FillError` (per-field, post-attempt).
 */
export type AbortReason =
  | 'profile-missing'
  | 'form-not-detected'
  | 'adapter-load-failed'
  | 'scan-threw'
  | 'plan-builder-threw'
  | 'wizard-not-ready';

/**
 * Top-level result of executing a `FillPlan`. Shipped by A8 content-script
 * controller to the background for telemetry and to the options page for
 * a "last fill" summary.
 */
export interface FillPlanResult {
  readonly planId: PlanId;
  /** ISO-8601 datetime. */
  readonly executedAt: string;
  readonly filled: ReadonlyArray<Extract<FillResult, { ok: true }>>;
  readonly skipped: ReadonlyArray<{
    readonly instruction: FillInstruction;
    readonly reason: SkipReason;
  }>;
  readonly failed: ReadonlyArray<Extract<FillResult, { ok: false }>>;
  readonly aborted: boolean;
  readonly abortReason?: AbortReason;
}
```

### Step 10 -- `src/core/types/classified-field.ts`

B4 imports `ClassifiedField` in the shape `{ descriptor, type, confidence, matchedOn }`. This matches both the v1 plan and keystone expectations, just with tighter JSDoc and no DOM references.

```ts
import type { FieldType } from '../taxonomy/field-types';
import type { FormFieldDescriptor } from './form-model';

/**
 * Classification confidence, expressed as a monotonic score between 0 and 1.
 * 1.0 is deterministic (autocomplete token match), 0.0 is total uncertainty
 * (no signal available). Values map 1-to-1 to the priority table in agent 46
 * section 4.
 */
export type ClassificationConfidence = 1.0 | 0.9 | 0.8 | 0.7 | 0.6 | 0.5 | 0.3 | 0.0;

/**
 * Which signal triggered the classification. Used by B4 plan-builder for
 * conflict resolution and by the A10 debug UI for tooltip display.
 */
export type ClassifiedFieldSource =
  | 'autocomplete'
  | 'name'
  | 'id'
  | 'label'
  | 'label-synonym'
  | 'placeholder'
  | 'aria-label'
  | 'data-attribute'
  | 'section-heading'
  | 'position'
  | 'none';

/**
 * Output of the classifier for a single field.
 * Preserves the original descriptor so downstream code can trace decisions.
 */
export interface ClassifiedField {
  readonly descriptor: FormFieldDescriptor;
  readonly type: FieldType;
  readonly confidence: ClassificationConfidence;
  readonly matchedOn: ClassifiedFieldSource;
}
```

### Step 11 -- `src/core/types/job-posting.ts` (keystone 2.7)

```ts
/**
 * Canonical job-posting payload extracted by vendor adapters from the host
 * page. Modeled after schema.org/JobPosting with only the subset we actually
 * consume. All fields are readonly.
 *
 * Source marker:
 * - `json-ld`: parsed from a `<script type="application/ld+json">` block
 * - `readability`: extracted via a Readability-style heuristic from prose
 * - `adapter-specific`: vendor adapter found a known markup structure
 */
export interface JobPostingData {
  readonly title: string;
  readonly description: string;
  readonly descriptionHtml?: string;
  /** ISO-8601 date. */
  readonly datePosted?: string;
  /** ISO-8601 date. */
  readonly validThrough?: string;
  readonly employmentType?: string;
  readonly hiringOrganization?: {
    readonly name: string;
    readonly logo?: string;
    readonly url?: string;
  };
  readonly jobLocation?: ReadonlyArray<{
    readonly addressLocality?: string;
    readonly addressRegion?: string;
    readonly addressCountry?: string;
    readonly postalCode?: string;
  }>;
  readonly baseSalary?: {
    readonly currency: string;
    readonly minValue?: number;
    readonly maxValue?: number;
    readonly unitText?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  };
  readonly applicantLocationRequirements?: ReadonlyArray<string>;
  readonly source: 'json-ld' | 'readability' | 'adapter-specific';
}
```

### Step 12 -- `src/core/types/page-intent.ts` (keystone 2.8)

```ts
import type { AtsKind } from './ats-kind';
import type { JobPostingData } from './job-posting';

/**
 * Closed-union page classification returned by `IPageIntentDetector.detect`.
 * Three possible shapes:
 * 1. A known-ATS job posting (with optional structured `jobData`)
 * 2. A known-ATS application form
 * 3. Unknown (everything else)
 */
export type PageIntent =
  | {
      readonly kind: AtsKind;
      readonly pageKind: 'job-posting';
      readonly url: string;
      readonly jobData?: JobPostingData;
    }
  | {
      readonly kind: AtsKind;
      readonly pageKind: 'application-form';
      readonly url: string;
    }
  | { readonly kind: 'unknown'; readonly url: string };

/**
 * Payload used for content-to-background IPC. Flatter than `PageIntent`
 * because message passing cannot carry discriminated unions cleanly.
 */
export interface DetectedIntent {
  readonly kind: AtsKind | 'unknown';
  readonly pageKind: 'job-posting' | 'application-form' | null;
  readonly url: string;
  readonly jobTitle?: string;
  readonly company?: string;
  /** Milliseconds since Unix epoch. */
  readonly detectedAt: number;
}
```

### Step 13 -- `src/core/types/ats-adapter.ts` (D1, keystone 2.9)

NOTE: This file uses `Document` as a structural TYPE reference only, not a value. Because `tsconfig.core.json` has `"lib": ["ES2022"]` (no DOM), `Document` is NOT in scope. We therefore declare a local opaque type:

```ts
import type { AtsKind } from './ats-kind';
import type { FormModel } from './form-model';
import type { FillInstruction, FillResult } from './fill-instruction';
import type { JobPostingData } from './job-posting';

/**
 * Opaque reference to "the source element tree" that adapters scan over.
 * Core never reaches into this type. Vendor adapters (B7/B8/B9) narrow it
 * to their host platform type in their own compile context (B1 configured
 * `tsconfig.adapter.json` with DOM lib for those files).
 *
 * This is the tightest possible expression of "the engine does not know
 * what a source element tree is" while still giving the adapter a named type.
 */
export interface SourceElementTree {
  readonly __sourceElementTreeBrand: unique symbol;
}

/**
 * Five-step literal union for the Workday wizard. `'review'` means the user
 * is on the read-only confirmation page; `'unknown'` is the fallback when
 * the detector cannot resolve a step.
 */
export type WorkdayWizardStep =
  | 'my-information'
  | 'my-experience'
  | 'voluntary-disclosures'
  | 'review'
  | 'unknown';

/**
 * The contract every vendor adapter ships. Factory (`createXAdapter()`)
 * returns `Object.freeze(...)` so the adapter object is immutable at runtime
 * and downstream code cannot monkey-patch it.
 *
 * Core members are required. Workday-only members are optional; B7 and B8
 * leave them undefined.
 */
export interface AtsAdapter {
  readonly kind: AtsKind;
  readonly matchesUrl: (url: string) => boolean;
  /**
   * Synchronously scans the source element tree and returns an immutable
   * FormModel. Adapters pass a `Document` from the host platform; core uses
   * the opaque `SourceElementTree` brand.
   */
  readonly scanForm: (root: SourceElementTree) => FormModel;
  readonly fillField: (instruction: FillInstruction) => FillResult;
  readonly attachFile?: (instruction: FillInstruction, file: unknown) => Promise<FillResult>;
  readonly extractJob?: (root: SourceElementTree) => JobPostingData | null;

  // Workday-only optional surface (B9):
  readonly detectCurrentStep?: (root: SourceElementTree) => WorkdayWizardStep;
  readonly watchForStepChange?: (
    root: SourceElementTree,
    onChange: (step: WorkdayWizardStep) => void,
  ) => () => void;
  readonly scanStep?: (root: SourceElementTree, step: WorkdayWizardStep) => FormModel;
  readonly fillStep?: (
    step: WorkdayWizardStep,
    profile: unknown,
  ) => Promise<ReadonlyArray<FillResult>>;
}
```

Notes for vendor adapters (B7/B8/B9): since your `tsconfig.adapter.json` includes DOM lib, you cast your `Document` to `SourceElementTree` at the adapter edge via `const root = doc as unknown as SourceElementTree`. Cast-at-edge is localized to the adapter wrapper; the vendor's internal helpers use the real `Document` type.

Run `pnpm typecheck`.

### Step 14 -- `src/core/types/extracted-skill.ts` (keystone 2.10)

```ts
/**
 * Canonical extracted-skill payload returned by A3's skill extraction endpoint
 * (POST /api/v1/ats/extract-skills). A5's `KEYWORDS_EXTRACT` handler passes
 * these through verbatim to A9 (highlight) and A10 (sidepanel match summary).
 */
export interface ExtractedSkill {
  readonly term: string;
  readonly category: 'hard' | 'soft' | 'tool' | 'domain';
  /** Relevance score in [0, 1]. */
  readonly score: number;
  /** How many times the term appears in the source JD text. */
  readonly occurrences: number;
  /** Canonical form used for deduplication and highlight matching. */
  readonly canonicalForm: string;
}
```

### Step 15 -- `src/core/types/index.ts` (barrel)

```ts
export {
  TabId,
  GenerationId,
  SessionId,
  RequestId,
  PlanId,
  ResumeHandleId,
} from './brands';

export type {
  AtsKind,
  AtsVendor,
} from './ats-kind';
export { ATS_KINDS, isAtsKind } from './ats-kind';

export type {
  FormFieldDescriptor,
  FormFieldOption,
  FormModel,
} from './form-model';
export { freezeFormModel } from './form-model';

export type {
  FillValue,
  SkipReason,
  FillInstruction,
  FillPlan,
  FillError,
  FillResult,
  DomFillResult,
  AttachFailureReason,
} from './fill-instruction';

export type {
  AbortReason,
  FillPlanResult,
} from './fill-plan-result';

export type {
  ClassificationConfidence,
  ClassifiedFieldSource,
  ClassifiedField,
} from './classified-field';

export type { JobPostingData } from './job-posting';

export type {
  PageIntent,
  DetectedIntent,
} from './page-intent';

export type {
  SourceElementTree,
  WorkdayWizardStep,
  AtsAdapter,
} from './ats-adapter';

export type { ExtractedSkill } from './extracted-skill';
```

Notice: `HighlightRange` is absent. `IKeywordHighlighter` is absent. This is the only v2 shape.

Run `pnpm typecheck`. It should still pass with zero imports of these types by anything else yet.

### Step 16 -- Taxonomy files (steps 16a, 16b, 16c, 16d, 16e)

#### 16a -- `src/core/taxonomy/field-types.ts`

Verbatim from agent 46 section 3 (74 entries). Preserve the existing v1 plan's content in full:

```ts
/**
 * Canonical semantic field types for ATS form autofill.
 * Combines Mozilla's `autocomplete` baseline (32 tokens) with ATS-specific
 * extensions (49-plus tokens including custom/unknown).
 *
 * Source: agent 46 "ATS Field Taxonomy -- Canonical Semantic Types".
 * Total: 74-plus entries (see `field-types.spec.ts` for the exact count).
 */
export type FieldType =
  // --- Mozilla baseline: identity and contact ---
  | 'name'
  | 'given-name'
  | 'additional-name'
  | 'family-name'
  | 'honorific-prefix'
  | 'honorific-suffix'
  | 'nickname'
  | 'email'
  | 'tel'
  | 'tel-country-code'
  | 'tel-national'
  | 'tel-area-code'
  | 'tel-local'
  | 'tel-extension'
  // --- Mozilla baseline: address ---
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-line3'
  | 'address-level1'
  | 'address-level2'
  | 'address-level3'
  | 'address-level4'
  | 'postal-code'
  | 'country'
  | 'country-name'
  // --- Mozilla baseline: personal ---
  | 'bday'
  | 'bday-day'
  | 'bday-month'
  | 'bday-year'
  | 'sex'
  | 'language'
  | 'url'
  // --- ATS extension: professional links ---
  | 'linkedin-url'
  | 'github-url'
  | 'portfolio-url'
  | 'personal-website'
  | 'twitter-url'
  | 'dribbble-url'
  | 'behance-url'
  | 'stackoverflow-url'
  // --- ATS extension: documents ---
  | 'resume-upload'
  | 'resume-text'
  | 'cover-letter-upload'
  | 'cover-letter-text'
  | 'transcript-upload'
  | 'portfolio-upload'
  | 'additional-file'
  // --- ATS extension: current employment ---
  | 'current-company'
  | 'current-title'
  | 'years-experience'
  | 'experience-summary'
  | 'previous-employer'
  | 'notice-period'
  // --- ATS extension: education ---
  | 'education-level'
  | 'school-name'
  | 'field-of-study'
  | 'graduation-year'
  | 'gpa'
  // --- ATS extension: work authorization ---
  | 'work-auth-us'
  | 'visa-sponsorship-required'
  | 'work-auth-country'
  | 'citizenship'
  | 'security-clearance'
  // --- ATS extension: compensation and availability ---
  | 'salary-expectation'
  | 'salary-min'
  | 'salary-max'
  | 'salary-currency'
  | 'current-salary'
  | 'start-date'
  | 'availability'
  | 'relocation-willing'
  | 'remote-preference'
  // --- ATS extension: location ---
  | 'current-location'
  | 'preferred-location'
  // --- ATS extension: referral ---
  | 'referral-source'
  | 'referrer-name'
  | 'referrer-email'
  // --- ATS extension: EEO / demographics ---
  | 'eeo-gender'
  | 'eeo-race'
  | 'eeo-veteran'
  | 'eeo-disability'
  | 'eeo-pronoun'
  | 'eeo-transgender'
  | 'eeo-sexual-orientation'
  | 'eeo-age-range'
  // --- ATS extension: consent and legal ---
  | 'consent-privacy'
  | 'consent-marketing'
  | 'consent-background'
  | 'age-confirmation'
  // --- ATS extension: custom / fallback ---
  | 'custom-text'
  | 'custom-choice'
  | 'custom-number'
  | 'custom-date'
  | 'custom-file'
  | 'unknown';
```

#### 16b -- `src/core/taxonomy/mozilla-baseline.ts`

```ts
import type { FieldType } from './field-types';

/**
 * Subset of `FieldType` values that correspond to Mozilla's standardized
 * `autocomplete` tokens. Deterministic classification (confidence 1.0)
 * when a source field's autocomplete attribute matches one of these.
 *
 * Count: 32 entries (14 identity/contact + 11 address + 7 personal).
 * The raw-prose "25 baseline" figure from agent 46 is imprecise; the
 * enum is authoritative. `field-types.spec.ts` asserts exactly 32.
 */
export const MOZILLA_BASELINE_FIELD_TYPES: ReadonlyArray<FieldType> = Object.freeze([
  // identity and contact
  'name',
  'given-name',
  'additional-name',
  'family-name',
  'honorific-prefix',
  'honorific-suffix',
  'nickname',
  'email',
  'tel',
  'tel-country-code',
  'tel-national',
  'tel-area-code',
  'tel-local',
  'tel-extension',
  // address
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level1',
  'address-level2',
  'address-level3',
  'address-level4',
  'postal-code',
  'country',
  'country-name',
  // personal
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'sex',
  'language',
  'url',
] as const);

export const MOZILLA_BASELINE_SET: ReadonlySet<FieldType> = new Set(MOZILLA_BASELINE_FIELD_TYPES);
```

#### 16c -- `src/core/taxonomy/ats-extensions.ts`

```ts
import type { FieldType } from './field-types';

/**
 * ATS-specific field types not covered by Mozilla `autocomplete` tokens.
 * Used for eligibility filtering and for gating sensitive fields (EEO, DOB)
 * behind explicit consent.
 */
export const ATS_EXTENSION_FIELD_TYPES: ReadonlyArray<FieldType> = Object.freeze([
  // professional links
  'linkedin-url',
  'github-url',
  'portfolio-url',
  'personal-website',
  'twitter-url',
  'dribbble-url',
  'behance-url',
  'stackoverflow-url',
  // documents
  'resume-upload',
  'resume-text',
  'cover-letter-upload',
  'cover-letter-text',
  'transcript-upload',
  'portfolio-upload',
  'additional-file',
  // current employment
  'current-company',
  'current-title',
  'years-experience',
  'experience-summary',
  'previous-employer',
  'notice-period',
  // education
  'education-level',
  'school-name',
  'field-of-study',
  'graduation-year',
  'gpa',
  // work authorization
  'work-auth-us',
  'visa-sponsorship-required',
  'work-auth-country',
  'citizenship',
  'security-clearance',
  // compensation and availability
  'salary-expectation',
  'salary-min',
  'salary-max',
  'salary-currency',
  'current-salary',
  'start-date',
  'availability',
  'relocation-willing',
  'remote-preference',
  // location
  'current-location',
  'preferred-location',
  // referral
  'referral-source',
  'referrer-name',
  'referrer-email',
  // EEO
  'eeo-gender',
  'eeo-race',
  'eeo-veteran',
  'eeo-disability',
  'eeo-pronoun',
  'eeo-transgender',
  'eeo-sexual-orientation',
  'eeo-age-range',
  // consent
  'consent-privacy',
  'consent-marketing',
  'consent-background',
  'age-confirmation',
  // custom and fallback
  'custom-text',
  'custom-choice',
  'custom-number',
  'custom-date',
  'custom-file',
  'unknown',
] as const);

export const ATS_EXTENSION_SET: ReadonlySet<FieldType> = new Set(ATS_EXTENSION_FIELD_TYPES);

/**
 * EEO / demographic fields MUST be gated behind explicit user opt-in via
 * `profile.consents.allowEeoAutofill === true`. Never auto-fill without.
 */
export const EEO_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'eeo-gender',
  'eeo-race',
  'eeo-veteran',
  'eeo-disability',
  'eeo-pronoun',
  'eeo-transgender',
  'eeo-sexual-orientation',
  'eeo-age-range',
]);

/**
 * Consent fields must be user-confirmed before writing. Never auto-check.
 */
export const CONSENT_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'consent-privacy',
  'consent-marketing',
  'consent-background',
  'age-confirmation',
]);

/**
 * Date-of-birth fields. GDPR / ADEA risk. Opt-in only via
 * `profile.consents.allowDobAutofill === true`.
 */
export const DOB_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
]);

export function isAtsExtensionField(type: FieldType): boolean {
  return ATS_EXTENSION_SET.has(type);
}

export function isEeoField(type: FieldType): boolean {
  return EEO_FIELD_TYPES.has(type);
}

export function isConsentField(type: FieldType): boolean {
  return CONSENT_FIELD_TYPES.has(type);
}

export function isDobField(type: FieldType): boolean {
  return DOB_FIELD_TYPES.has(type);
}
```

#### 16d -- `src/core/taxonomy/synonyms.ts`

Paste the 220-line English-only synonyms map from the v1 plan step 11 verbatim. It is well-reviewed, well-tested, and does not interact with any v2 decision. The v1 content is preserved; only comments with em-dashes or DOM references (none in this file) are changed.

(See the v1 plan step 11 content; no changes are required beyond stripping any em-dashes in the JSDoc header comment.)

#### 16e -- `src/core/taxonomy/index.ts`

```ts
export type { FieldType } from './field-types';
export { MOZILLA_BASELINE_FIELD_TYPES, MOZILLA_BASELINE_SET } from './mozilla-baseline';
export {
  ATS_EXTENSION_FIELD_TYPES,
  ATS_EXTENSION_SET,
  EEO_FIELD_TYPES,
  CONSENT_FIELD_TYPES,
  DOB_FIELD_TYPES,
  isAtsExtensionField,
  isEeoField,
  isConsentField,
  isDobField,
} from './ats-extensions';
export { SYNONYMS } from './synonyms';
```

### Step 17 -- Profile (steps 17a, 17b, 17c, 17d, 17e)

#### 17a -- `src/core/profile/types.ts`

Paste the v1 plan step 13 interface block (`Profile`, `Basics`, `Location`, `SocialProfile`, `WorkExperience`, `Education`, `Skill`, `Language`, `Certificate`, `Project`, `Volunteer`, `Award`, `Publication`, `Reference`, `JurisdictionAuthorization`, `JobPreferences`, `SalaryExpectation`, `Demographics`, `DemographicAnswer`, `Gender`, `Race`, `VeteranStatus`, `DisabilityStatus`, `ResumeHandle`, `Documents`, `Consents`, `ProfileVersion`) verbatim with THESE v2 patches:

1. **`Profile` adds `readonly updatedAtMs: number`** at the root level. The JSDoc MUST read: `/** Millisecond timestamp of the most recent write. Storage metadata, not part of the semantic profile. Used as a React remount key on the options page (D10) and as an A8 cache-invalidation sentinel. Zod schema uses .passthrough() for this field only. */`
2. **`ResumeHandle` JSDoc** is rephrased to: `/** Adapter-resolved handle to a stored resume/CV file. `id` is opaque to the engine; the host adapter maps it to its own platform-native storage. Engine never reads bytes. */`. The word "document" and the phrase "chrome.storage" MUST NOT appear.
3. **`Basics.email` is typed `string`** as before. The Zod layer owns the draft-vs-complete distinction; the type is just `string`.
4. **Separate optional handle type** for cover letter:
   ```ts
   export interface CoverLetterHandle extends ResumeHandle {}
   ```
   Declared as its own interface even though structurally identical, so future divergence is cheap.
5. **`Documents`** becomes:
   ```ts
   export interface Documents {
     readonly resume?: ResumeHandle;
     readonly coverLetter?: CoverLetterHandle;
   }
   ```
6. **Every interface is `readonly`** on every field -- the v1 plan mixed `readonly` and mutable; v2 is uniform.

Everything else (the 4-flag JurisdictionAuthorization, the three willingToUndergo* booleans, phonePrefix, dateOfBirth, EEO/DOB consents) is preserved verbatim.

#### 17b -- `src/core/profile/schema.ts`

Replaces v1's `zod.ts`. Contains both `ProfileSchema` (draft-tolerant) and `CompleteProfileSchema` (strict-for-fill).

```ts
import { z } from 'zod';
import { isIso8601Date, isIso8601DateTime } from '../util/iso-8601';

const isoDate = z
  .string()
  .refine(isIso8601Date, 'ISO-8601 date (YYYY-MM-DD) required');

const isoTimestamp = z
  .string()
  .refine(isIso8601DateTime, 'ISO-8601 datetime required');

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/**
 * Email schema with DRAFT-MODE TOLERANCE per the review D. An empty string is
 * accepted so that `createEmptyProfile()` can return a valid shape while the
 * user has not yet typed their email in the options page. `CompleteProfileSchema`
 * uses a stricter variant that rejects empty strings.
 */
const draftEmail = z.union([z.string().email().max(320), z.literal('')]);
const completeEmail = z.string().email().max(320);

const LocationSchema = z
  .object({
    address: z.string().max(200).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    countryCode: z.string().length(2).optional(),
  })
  .strict();

const SocialProfileSchema = z
  .object({
    network: nonEmpty(50),
    username: nonEmpty(100),
    url: z.string().url().max(2048),
  })
  .strict();

function makeBasicsSchema(emailSchema: z.ZodTypeAny) {
  return z
    .object({
      name: z.string().max(200),
      firstName: z.string().max(100),
      lastName: z.string().max(100),
      preferredName: z.string().max(100).optional(),
      pronouns: z.string().max(30).optional(),
      label: z.string().max(150).optional(),
      email: emailSchema,
      phone: z.string().max(30).optional(),
      phonePrefix: z.string().max(10).optional(),
      dateOfBirth: isoDate.optional(),
      url: z.string().url().max(2048).optional(),
      summary: z.string().max(1000).optional(),
      location: LocationSchema.optional(),
      profiles: z.array(SocialProfileSchema).max(20),
    })
    .strict();
}

const WorkSchema = z
  .object({
    name: nonEmpty(200),
    position: nonEmpty(150),
    url: z.string().url().max(2048).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    summary: z.string().max(2000).optional(),
    highlights: z.array(z.string().max(500)).max(20),
    location: z.string().max(200).optional(),
  })
  .strict();

const EducationSchema = z
  .object({
    institution: nonEmpty(200),
    url: z.string().url().max(2048).optional(),
    area: z.string().max(150),
    studyType: z.string().max(100),
    startDate: isoDate,
    endDate: isoDate.optional(),
    score: z.string().max(20).optional(),
    courses: z.array(z.string().max(200)).max(50),
  })
  .strict();

const SkillSchema = z
  .object({
    name: nonEmpty(100),
    level: z.string().max(50).optional(),
    keywords: z.array(z.string().max(50)).max(30),
  })
  .strict();

const LanguageSchema = z
  .object({
    language: nonEmpty(50),
    fluency: nonEmpty(50),
  })
  .strict();

const CertificateSchema = z
  .object({
    name: nonEmpty(200),
    date: isoDate,
    issuer: nonEmpty(200),
    url: z.string().url().max(2048).optional(),
  })
  .strict();

const ProjectSchema = z
  .object({
    name: nonEmpty(200),
    description: z.string().max(2000).optional(),
    highlights: z.array(z.string().max(500)).max(20),
    keywords: z.array(z.string().max(50)).max(30),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    url: z.string().url().max(2048).optional(),
    roles: z.array(z.string().max(100)).max(10),
    entity: z.string().max(200).optional(),
    type: z.string().max(50).optional(),
  })
  .strict();

const VolunteerSchema = z
  .object({
    organization: nonEmpty(200),
    position: nonEmpty(150),
    url: z.string().url().max(2048).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    summary: z.string().max(2000).optional(),
    highlights: z.array(z.string().max(500)).max(20),
  })
  .strict();

const AwardSchema = z
  .object({
    title: nonEmpty(200),
    date: isoDate,
    awarder: nonEmpty(200),
    summary: z.string().max(1000).optional(),
  })
  .strict();

const PublicationSchema = z
  .object({
    name: nonEmpty(200),
    publisher: nonEmpty(200),
    releaseDate: isoDate,
    url: z.string().url().max(2048).optional(),
    summary: z.string().max(1000).optional(),
  })
  .strict();

const ReferenceSchema = z
  .object({
    name: nonEmpty(200),
    reference: z.string().max(2000),
  })
  .strict();

const JurisdictionAuthorizationSchema = z
  .object({
    region: z.string().min(2).max(10),
    authorized: z.boolean(),
    requiresVisa: z.boolean(),
    requiresSponsorship: z.boolean(),
    legallyAllowed: z.boolean(),
  })
  .strict();

const SalarySchema = z
  .object({
    min: z.number().nonnegative().finite(),
    max: z.number().nonnegative().finite(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, 'currency must be 3 uppercase letters'),
    period: z.enum(['hour', 'day', 'month', 'year']),
  })
  .strict()
  .refine((s) => s.max >= s.min, {
    message: 'max must be >= min',
    path: ['max'],
  });

const JobPreferencesSchema = z
  .object({
    workAuthorization: z.array(JurisdictionAuthorizationSchema).max(50),
    salaryExpectation: SalarySchema.optional(),
    availabilityDate: isoDate.optional(),
    willingToRelocate: z.boolean(),
    remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']),
    willingToCompleteAssessments: z.boolean(),
    willingToUndergoDrugTests: z.boolean(),
    willingToUndergoBackgroundChecks: z.boolean(),
  })
  .strict();

const declineable = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.enum([...vals, 'decline_to_answer'] as unknown as [string, ...string[]]);

const DemographicsSchema = z
  .object({
    gender: declineable(['male', 'female', 'non_binary', 'other'] as const).optional(),
    race: declineable([
      'american_indian_alaska_native',
      'asian',
      'black_african_american',
      'hispanic_latino',
      'native_hawaiian_pacific_islander',
      'white',
      'two_or_more',
    ] as const).optional(),
    veteranStatus: declineable([
      'veteran',
      'not_veteran',
      'protected_veteran',
    ] as const).optional(),
    disabilityStatus: declineable(['yes', 'no'] as const).optional(),
  })
  .strict();

const ResumeHandleSchema = z
  .object({
    id: nonEmpty(200),
    filename: nonEmpty(255),
    mimeType: nonEmpty(100),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .finite()
      .max(25 * 1024 * 1024, 'resume size over 25MB'),
    lastUpdated: isoTimestamp,
  })
  .strict();

const DocumentsSchema = z
  .object({
    resume: ResumeHandleSchema.optional(),
    coverLetter: ResumeHandleSchema.optional(),
  })
  .strict();

const ConsentsSchema = z
  .object({
    privacyPolicy: z.boolean(),
    marketing: z.boolean(),
    allowEeoAutofill: z.boolean(),
    allowDobAutofill: z.boolean(),
  })
  .strict();

/**
 * Root profile schema factory. Takes the email schema as a parameter so we
 * can build both the draft-tolerant and the strict variant from one place.
 *
 * Note: the root object uses `.passthrough()` SOLELY to tolerate the
 * `updatedAtMs: number` storage metadata field that A7 writes. Every
 * child object uses `.strict()`. This is documented in D10 and the schema
 * comment below.
 */
function makeProfileSchema(emailSchema: z.ZodTypeAny) {
  return z
    .object({
      profileVersion: z.literal('1.0'),
      /**
       * Storage metadata. Millisecond epoch. Used by A7 React key remount (D10)
       * and by A8 cache invalidation. Not part of the semantic profile; Zod
       * tolerates its presence via the root-level `.passthrough()`.
       */
      updatedAtMs: z.number().int().nonnegative().finite(),
      basics: makeBasicsSchema(emailSchema),
      work: z.array(WorkSchema).max(10000),
      education: z.array(EducationSchema).max(10000),
      skills: z.array(SkillSchema).max(10000),
      languages: z.array(LanguageSchema).max(1000),
      certificates: z.array(CertificateSchema).max(10000),
      projects: z.array(ProjectSchema).max(10000),
      volunteer: z.array(VolunteerSchema).max(10000),
      awards: z.array(AwardSchema).max(10000),
      publications: z.array(PublicationSchema).max(10000),
      references: z.array(ReferenceSchema).max(1000),
      jobPreferences: JobPreferencesSchema,
      demographics: DemographicsSchema,
      documents: DocumentsSchema,
      customAnswers: z
        .record(z.string().max(500), z.string().max(5000))
        .refine((r) => Object.keys(r).length <= 1000, 'max 1000 custom answers'),
      consents: ConsentsSchema,
    })
    .passthrough();
}

/**
 * Draft-tolerant profile schema. Used by A7 on write to save partial
 * profiles. Accepts empty-string email so the user can save progress.
 */
export const ProfileSchema = makeProfileSchema(draftEmail);

/**
 * Strict profile schema. Used by A8's `isProfileFillReady(p)` to decide
 * whether the profile has enough information to run a fill. Rejects
 * empty-string email.
 */
export const CompleteProfileSchema = makeProfileSchema(completeEmail);

export type ProfileInput = z.input<typeof ProfileSchema>;
export type ProfileOutput = z.output<typeof ProfileSchema>;

/**
 * True when the profile is complete enough to run an autofill. A8 calls
 * this before launching `executeFill`. On false, A8 returns
 * `{ ok: false, reason: 'no-profile' }` to the caller.
 */
export function isProfileFillReady(profile: unknown): boolean {
  return CompleteProfileSchema.safeParse(profile).success;
}
```

For every `// ...` marker above the executor pastes the verbatim Zod block from the v1 plan step 14, applying the 8 numbered changes. If any block is lost, STOP and reread the v1 plan step 14 before proceeding.

#### 17c -- `src/core/profile/defaults.ts`

```ts
import type { Profile } from './types';

/**
 * Factory returning an empty but structurally-valid draft profile.
 *
 * Draft semantics:
 * - `basics.email === ''` (empty string, NOT a fake address). `ProfileSchema`
 *   accepts this because its email validator is a union of `z.string().email()`
 *   with `z.literal('')`. `CompleteProfileSchema` rejects it, which is how
 *   A8 decides the profile is not fill-ready.
 * - Every required array is empty.
 * - Every required boolean defaults to `false`.
 * - `updatedAtMs` is stamped with the current time via `Date.now()`. Tests
 *   pass a deterministic clock through dependency injection; production uses
 *   the real clock.
 *
 * This function MUST return a NEW object on every call. Tests assert this.
 */
export function createEmptyProfile(nowMs: number = Date.now()): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: nowMs,
    basics: {
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      profiles: [],
    },
    work: [],
    education: [],
    skills: [],
    languages: [],
    certificates: [],
    projects: [],
    volunteer: [],
    awards: [],
    publications: [],
    references: [],
    jobPreferences: {
      workAuthorization: [],
      willingToRelocate: false,
      remotePreference: 'any',
      willingToCompleteAssessments: false,
      willingToUndergoDrugTests: false,
      willingToUndergoBackgroundChecks: false,
    },
    demographics: {},
    documents: {},
    customAnswers: {},
    consents: {
      privacyPolicy: false,
      marketing: false,
      allowEeoAutofill: false,
      allowDobAutofill: false,
    },
  };
}

/**
 * Test fixture factory. Returns the empty profile shape but with a real
 * placeholder email, so tests that need a Zod-complete profile do not have
 * to override the email on every call. NEVER used in production code -- the
 * review flagged `'placeholder@example.com'` as a code smell when it leaked
 * into `createEmptyProfile`. This function is explicitly marked for test use.
 */
export function createPlaceholderProfile(nowMs: number = Date.now()): Profile {
  const base = createEmptyProfile(nowMs);
  return {
    ...base,
    basics: { ...base.basics, email: 'placeholder@example.com' },
  };
}
```

#### 17d -- `src/core/profile/migrations.ts`

Copy v1 step 16 verbatim. No v2 changes.

#### 17e -- `src/core/profile/index.ts`

```ts
export type {
  Profile,
  ProfileVersion,
  Basics,
  Location,
  SocialProfile,
  WorkExperience,
  Education,
  Skill,
  Language,
  Certificate,
  Project,
  Volunteer,
  Award,
  Publication,
  Reference,
  JobPreferences,
  JurisdictionAuthorization,
  SalaryExpectation,
  RemotePreference,
  SalaryPeriod,
  Demographics,
  DemographicAnswer,
  Gender,
  Race,
  VeteranStatus,
  DisabilityStatus,
  ResumeHandle,
  CoverLetterHandle,
  Documents,
  Consents,
} from './types';

export {
  ProfileSchema,
  CompleteProfileSchema,
  isProfileFillReady,
} from './schema';
export type { ProfileInput, ProfileOutput } from './schema';

export { createEmptyProfile, createPlaceholderProfile } from './defaults';
export { migrateProfile, MIGRATIONS } from './migrations';
export type { ProfileMigration } from './migrations';
```

Run `pnpm typecheck`.

### Step 18 -- `src/core/ports/index.ts` (HighlightRange-free)

```ts
import type { FormModel } from '../types/form-model';
import type { FillResult, FillInstruction, AttachFailureReason } from '../types/fill-instruction';
import type { AtsKind } from '../types/ats-kind';
import type { Profile } from '../profile/types';
import type { SourceElementTree } from '../types/ats-adapter';

/**
 * Scans a source element tree (or sub-tree) and produces a FormModel snapshot.
 * `root` is typed `SourceElementTree | null` so core does not leak any platform
 * type. Adapters narrow `root` to the host platform type in their own compile
 * context.
 */
export interface IFormScanner {
  scan(root?: SourceElementTree | null): Promise<FormModel>;
}

/**
 * Executes a single fill operation. Called by the host after core builds a
 * plan. Returns a FillResult. NEVER throws.
 */
export interface IFieldFiller {
  fill(instruction: FillInstruction): Promise<FillResult>;
}

/**
 * Attaches a file to a file-input field. The attacher does not know how the
 * file bytes were obtained; it receives an opaque handle-resolver from the
 * host. Returns a discriminated union with a specific failure reason per D14.
 */
export interface IFileAttacher {
  attach(
    instruction: FillInstruction,
    resolveBytes: () => Promise<{
      readonly name: string;
      readonly bytes: Uint8Array;
      readonly mime: string;
    }>,
  ): Promise<
    | { readonly ok: true; readonly selector: string }
    | { readonly ok: false; readonly selector: string; readonly reason: AttachFailureReason }
  >;
}

/**
 * Detects whether the scanned form is an application form and which ATS it
 * belongs to. Called by the content-script entry to decide whether to activate.
 */
export interface IPageIntentDetector {
  detect(): Promise<{
    readonly isApplicationForm: boolean;
    readonly atsKind?: AtsKind;
  }>;
}

/**
 * Loads and saves the user profile. Implemented by the host adapter using
 * its platform-native storage layer. Engine NEVER reaches into storage
 * directly.
 */
export interface IProfileProvider {
  load(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}
```

`IKeywordHighlighter` is absent. `HighlightRange` is absent. No JSDoc reference to `document`, `window`, `HTMLElement`, or `chrome.`.

### Step 19 -- `src/core/index.ts` (top barrel)

```ts
export * from './types';
export * from './taxonomy';
export * from './profile';
export * from './ports';
export * from './util';
```

### Step 20 -- `src/core/blueprint.contract.ts` (D22)

```ts
/**
 * Anti-drift contract per D22. Read by `scripts/check-blueprint-contracts.mjs`
 * in CI. If an export name changes or a forbidden import appears, CI fails.
 */
export const CORE_BLUEPRINT = {
  phase: 'B2',
  version: '2.1',
  publicExports: [
    // Types
    'TabId',
    'GenerationId',
    'SessionId',
    'RequestId',
    'PlanId',
    'ResumeHandleId',
    'ATS_KINDS',
    'isAtsKind',
    'freezeFormModel',
    // Taxonomy
    'MOZILLA_BASELINE_FIELD_TYPES',
    'MOZILLA_BASELINE_SET',
    'ATS_EXTENSION_FIELD_TYPES',
    'ATS_EXTENSION_SET',
    'EEO_FIELD_TYPES',
    'CONSENT_FIELD_TYPES',
    'DOB_FIELD_TYPES',
    'isAtsExtensionField',
    'isEeoField',
    'isConsentField',
    'isDobField',
    'SYNONYMS',
    // Profile
    'ProfileSchema',
    'CompleteProfileSchema',
    'isProfileFillReady',
    'createEmptyProfile',
    'createPlaceholderProfile',
    'migrateProfile',
    'MIGRATIONS',
    // Util
    'freezeDeep',
    'ISO_8601_DATE_REGEX',
    'ISO_8601_DATETIME_REGEX',
    'isIso8601Date',
    'isIso8601DateTime',
  ] as const,
  forbiddenImports: [
    '@nestjs/*',
    '@webext-core/*',
    'src/adapters/*',
    'src/ats/*',
  ] as const,
  /**
   * Forbidden token hashes. We store SHA-1 hex prefixes of the token strings
   * rather than the literal strings so that this file itself does not trip
   * the core-purity grep gate that lives on those literal strings. The
   * `scripts/check-blueprint-contracts.mjs` script computes the same hashes
   * at CI time and compares. See the script for the canonical list.
   *
   * Hash algorithm: SHA-1 of the lowercase token, first 12 hex chars.
   * Encoding the forbidden list this way is deliberate: we want the
   * grep gate to stay simple and catch the blueprint file too if it
   * ever regresses.
   */
  forbiddenTokenHashes: [
    'cc5e95b9bebb', // v1 highlight type -- SHA-1 prefix
    '5b25c4faa1f8', // v1 keyword port interface -- SHA-1 prefix
    'ad0d69e7ebde', // deprecated npm package name -- SHA-1 prefix
    '7add2b7e5f18', // platform source element noun -- SHA-1 prefix
    '2f75c8ce2c68', // platform top-level runtime global -- SHA-1 prefix
    '66d0b0b11c42', // platform element base type -- SHA-1 prefix
    '18a6d6dd03c7', // platform browser API prefix -- SHA-1 prefix
  ] as const,
  requiredCoverage: 90,
} as const;
```

### Step 21 -- Overwrite B1 placeholder at `src/index.ts`

B1 left `src/index.ts` as an empty placeholder. B2 converts it into a thin re-export of `src/core/index.ts` so `main` resolves cleanly:

```ts
export * from './core';
```

(This is the file that `exports['.']` in `package.json` points to via tsup's `core/index` entry; B1's tsup config maps `core/index.ts` directly so this file is just a developer convenience.)

### Step 22 -- Tests

Create all 7 test files (T1-T7) plus preserve the two existing spec files from v1 (synonyms and migrations). Full code follows below.

#### T1 -- `tests/core/types/brands.spec.ts`

```ts
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  TabId,
  GenerationId,
  SessionId,
  RequestId,
  PlanId,
  ResumeHandleId,
} from '../../../src/core';
import type {
  TabId as TabIdType,
  GenerationId as GenerationIdType,
  PlanId as PlanIdType,
} from '../../../src/core';

describe('Branded primitives (D16)', () => {
  describe('TabId', () => {
    it('constructs from a number and unbrand returns the same number', () => {
      const id = TabId(42);
      expect(TabId.unbrand(id)).toBe(42);
    });

    it('round-trips negative tab ids (Chrome sentinel values)', () => {
      const id = TabId(-1);
      expect(TabId.unbrand(id)).toBe(-1);
    });

    it('preserves zero', () => {
      const id = TabId(0);
      expect(TabId.unbrand(id)).toBe(0);
    });

    it('preserves very large ids', () => {
      const id = TabId(Number.MAX_SAFE_INTEGER);
      expect(TabId.unbrand(id)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('type-level: raw number is NOT assignable to TabId', () => {
      // The following line MUST fail to typecheck. The executor MUST NOT
      // remove the `@ts-expect-error` comment. If typecheck passes without
      // the directive, branded types are broken.
      // @ts-expect-error raw number cannot be assigned to TabId
      const _wrong: TabIdType = 42;
      expect(typeof _wrong).toBe('number');
    });
  });

  describe('GenerationId', () => {
    it('constructs from a UUID-like string', () => {
      const id = GenerationId('11111111-1111-1111-1111-111111111111');
      expect(GenerationId.unbrand(id)).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('round-trips empty string (edge case for adversarial inputs)', () => {
      const id = GenerationId('');
      expect(GenerationId.unbrand(id)).toBe('');
    });

    it('round-trips unicode', () => {
      const id = GenerationId('gen-\u{1F600}-\u4E2D\u6587');
      expect(GenerationId.unbrand(id)).toBe('gen-\u{1F600}-\u4E2D\u6587');
    });

    it('type-level: cannot assign GenerationId to PlanId', () => {
      const gen = GenerationId('abc');
      // @ts-expect-error GenerationId and PlanId are distinct brands
      const _wrong: PlanIdType = gen;
      expect(typeof _wrong).toBe('string');
    });

    it('type-level: expectTypeOf rejects raw string', () => {
      const gen = GenerationId('abc');
      expectTypeOf(gen).not.toEqualTypeOf<string>();
      expectTypeOf(gen).toEqualTypeOf<GenerationIdType>();
    });
  });

  describe('all six brands are distinct', () => {
    it('runtime value is the same primitive', () => {
      expect(GenerationId.unbrand(GenerationId('x'))).toBe('x');
      expect(SessionId.unbrand(SessionId('x'))).toBe('x');
      expect(RequestId.unbrand(RequestId('x'))).toBe('x');
      expect(PlanId.unbrand(PlanId('x'))).toBe('x');
      expect(ResumeHandleId.unbrand(ResumeHandleId('x'))).toBe('x');
      expect(TabId.unbrand(TabId(1))).toBe(1);
    });
  });

  describe('adversarial inputs', () => {
    it('GenerationId accepts a string with 10000 characters', () => {
      const huge = 'a'.repeat(10000);
      expect(GenerationId.unbrand(GenerationId(huge))).toBe(huge);
    });

    it('TabId accepts NaN (caller is expected to guard, brand does not)', () => {
      const nan = TabId(Number.NaN);
      expect(Number.isNaN(TabId.unbrand(nan))).toBe(true);
    });

    it('SessionId accepts null bytes', () => {
      const id = SessionId('abc\0def');
      expect(SessionId.unbrand(id)).toBe('abc\0def');
    });

    it('PlanId survives being JSON-round-tripped', () => {
      const id = PlanId('plan-123');
      const json = JSON.stringify({ id });
      const parsed: { id: string } = JSON.parse(json);
      expect(parsed.id).toBe('plan-123');
    });
  });
});
```

#### T2 -- `tests/core/types/ats-adapter.type-test.ts`

Pure type assertions per D14. This file has ZERO runtime expectations except a single `true` constant, but the typecheck pass proves the shape.

```ts
import { describe, it, expect } from 'vitest';
import type {
  AtsAdapter,
  AtsKind,
  AtsVendor,
  FormModel,
  FillInstruction,
  FillResult,
  JobPostingData,
  WorkdayWizardStep,
  SourceElementTree,
} from '../../../src/core';

// Assertion 1: AtsAdapter requires the 4 core members
type CoreAdapterShape = {
  readonly kind: AtsKind;
  readonly matchesUrl: (url: string) => boolean;
  readonly scanForm: (root: SourceElementTree) => FormModel;
  readonly fillField: (instruction: FillInstruction) => FillResult;
};
type _CoreShapeAssertion = AtsAdapter extends CoreAdapterShape ? true : never;
const _a1: _CoreShapeAssertion = true;

// Assertion 2: AtsAdapter optional members have the right types
type _Opt1 = NonNullable<AtsAdapter['attachFile']> extends (
  instruction: FillInstruction,
  file: unknown,
) => Promise<FillResult>
  ? true
  : never;
const _a2: _Opt1 = true;

type _Opt2 = NonNullable<AtsAdapter['extractJob']> extends (
  root: SourceElementTree,
) => JobPostingData | null
  ? true
  : never;
const _a3: _Opt2 = true;

type _Opt3 = NonNullable<AtsAdapter['detectCurrentStep']> extends (
  root: SourceElementTree,
) => WorkdayWizardStep
  ? true
  : never;
const _a4: _Opt3 = true;

// Assertion 3: WorkdayWizardStep is exactly the 5 literal values
type _StepAssertion = Exclude<
  WorkdayWizardStep,
  'my-information' | 'my-experience' | 'voluntary-disclosures' | 'review' | 'unknown'
> extends never
  ? true
  : never;
const _a5: _StepAssertion = true;

// Assertion 4: AtsKind is exactly the 3 literals
type _KindAssertion = Exclude<AtsKind, 'greenhouse' | 'lever' | 'workday'> extends never
  ? true
  : never;
const _a6: _KindAssertion = true;

// Assertion 5: AtsVendor is an alias for AtsKind (not distinct)
type _AliasAssertion = AtsVendor extends AtsKind ? (AtsKind extends AtsVendor ? true : never) : never;
const _a7: _AliasAssertion = true;

describe('AtsAdapter type contract', () => {
  it('type-level assertions compile', () => {
    // If this file compiles at all, every assertion above passed.
    expect([_a1, _a2, _a3, _a4, _a5, _a6, _a7].every(Boolean)).toBe(true);
  });
});
```

#### T3 -- `tests/core/types/form-model.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  freezeFormModel,
  type FormFieldDescriptor,
  type FormModel,
} from '../../../src/core';

function makeDescriptor(overrides: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    selector: '#first-name',
    name: 'first_name',
    id: 'first-name',
    label: 'First Name',
    placeholder: 'Ada',
    ariaLabel: null,
    autocomplete: 'given-name',
    type: 'text',
    options: [],
    required: true,
    dataAttributes: { 'data-qa': 'first-name' },
    sectionHeading: null,
    domIndex: 0,
    ...overrides,
  };
}

describe('FormModel and freezeFormModel', () => {
  describe('literal construction', () => {
    it('accepts a minimal valid model', () => {
      const model: FormModel = {
        url: 'https://example.com/apply',
        title: 'Apply -- Example',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
      };
      expect(model.fields).toHaveLength(1);
      expect(model.fields[0]!.autocomplete).toBe('given-name');
    });

    it('accepts optional sourceATS and formRootSelector', () => {
      const model: FormModel = {
        url: 'https://example.com/apply',
        title: 'Apply',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
        sourceATS: 'greenhouse',
        formRootSelector: '#application-form',
      };
      expect(model.sourceATS).toBe('greenhouse');
      expect(model.formRootSelector).toBe('#application-form');
    });

    it('accepts null for every nullable string field', () => {
      const d = makeDescriptor({
        name: null,
        id: null,
        label: null,
        placeholder: null,
        ariaLabel: null,
        autocomplete: null,
        sectionHeading: null,
      });
      expect(d.name).toBeNull();
      expect(d.label).toBeNull();
    });
  });

  describe('freezeFormModel', () => {
    it('freezes the top-level object', () => {
      const model: FormModel = {
        url: 'x',
        title: 'y',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
      };
      const frozen = freezeFormModel(model);
      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('freezes the fields array', () => {
      const model: FormModel = {
        url: 'x',
        title: 'y',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
      };
      const frozen = freezeFormModel(model);
      expect(Object.isFrozen(frozen.fields)).toBe(true);
    });

    it('freezes nested dataAttributes record', () => {
      const model: FormModel = {
        url: 'x',
        title: 'y',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
      };
      const frozen = freezeFormModel(model);
      expect(Object.isFrozen(frozen.fields[0]!.dataAttributes)).toBe(true);
    });

    it('is idempotent on already-frozen input', () => {
      const model: FormModel = {
        url: 'x',
        title: 'y',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor()],
      };
      const frozen1 = freezeFormModel(model);
      const frozen2 = freezeFormModel(frozen1);
      expect(frozen1).toBe(frozen2);
    });

    it('rejects circular references', () => {
      const self: { loop?: unknown } = {};
      self.loop = self;
      const model = {
        url: 'x',
        title: 'y',
        scannedAt: new Date().toISOString(),
        fields: [makeDescriptor({ dataAttributes: self as unknown as Record<string, string> })],
      } as FormModel;
      expect(() => freezeFormModel(model)).toThrow(/circular/);
    });
  });
});
```

#### T4 -- `tests/core/types/fill-instruction.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  PlanId,
  ResumeHandleId,
  type FillValue,
  type FillResult,
  type FillInstruction,
  type FillPlan,
  type SkipReason,
  type FillError,
} from '../../../src/core';

describe('FillValue discriminated union', () => {
  it('accepts text variant', () => {
    const v: FillValue = { kind: 'text', value: 'Ada' };
    expect(v.kind).toBe('text');
  });

  it('accepts boolean variant', () => {
    const v: FillValue = { kind: 'boolean', value: true };
    expect(v.kind).toBe('boolean');
  });

  it('accepts choice variant', () => {
    const v: FillValue = { kind: 'choice', value: 'remote' };
    expect(v.kind).toBe('choice');
  });

  it('accepts file variant with ResumeHandleId brand', () => {
    const v: FillValue = { kind: 'file', handleId: ResumeHandleId('h-123'), hint: 'resume.pdf' };
    expect(v.kind).toBe('file');
  });

  it('accepts skip variant with SkipReason', () => {
    const v: FillValue = { kind: 'skip', reason: 'profile-field-empty' };
    expect(v.kind).toBe('skip');
  });

  it('exhaustive switch: compile-time never check', () => {
    function cover(v: FillValue): string {
      switch (v.kind) {
        case 'text':
          return 't';
        case 'boolean':
          return 'b';
        case 'choice':
          return 'c';
        case 'file':
          return 'f';
        case 'skip':
          return 's';
        default: {
          const _exhaustive: never = v;
          return _exhaustive;
        }
      }
    }
    expect(cover({ kind: 'text', value: 'x' })).toBe('t');
  });
});

describe('SkipReason union (D8)', () => {
  it('has exactly 7 values', () => {
    const all: SkipReason[] = [
      'profile-field-empty',
      'consent-not-granted',
      'consent-denied-field-type',
      'htmlTypeGuard-rejected',
      'value-out-of-allowed-options',
      'skipped-by-user',
      'out-of-scope-for-v1',
    ];
    expect(all).toHaveLength(7);
  });
});

describe('FillError union', () => {
  it('has exactly 7 values', () => {
    const all: FillError[] = [
      'selector-not-found',
      'element-disabled',
      'element-not-visible',
      'value-rejected-by-page',
      'file-attach-failed',
      'wrong-entry-point-for-file',
      'unknown-error',
    ];
    expect(all).toHaveLength(7);
  });
});

describe('FillResult discriminated union', () => {
  const planId = PlanId('plan-1');

  it('discriminates on ok=true', () => {
    const r: FillResult = { ok: true, selector: '#x', instructionPlanId: planId };
    if (r.ok) {
      expect(r.selector).toBe('#x');
    } else {
      throw new Error('unreachable');
    }
  });

  it('discriminates on ok=false', () => {
    const r: FillResult = {
      ok: false,
      selector: '#x',
      error: 'selector-not-found',
      instructionPlanId: planId,
    };
    if (!r.ok) {
      expect(r.error).toBe('selector-not-found');
    } else {
      throw new Error('unreachable');
    }
  });
});

describe('FillPlan and FillInstruction shape', () => {
  it('compiles with minimal fields', () => {
    const planId = PlanId('plan-1');
    const instr: FillInstruction = {
      selector: '#email',
      field: 'email',
      value: { kind: 'text', value: 'ada@example.com' },
      priority: 100,
      planId,
    };
    const plan: FillPlan = {
      planId,
      createdAt: new Date().toISOString(),
      formUrl: 'https://example.com/apply',
      instructions: [instr],
      skipped: [],
    };
    expect(plan.instructions[0]!.selector).toBe('#email');
  });
});
```

#### T5 -- `tests/core/profile/schema.spec.ts`

Full adversarial suite. Target approximately 700 lines, 100 plus assertions. Categories per D19.

Helper file `tests/core/profile/_fuzz-helpers.ts` (written FIRST, imported by schema.spec.ts):

```ts
// tests/core/profile/_fuzz-helpers.ts
// Seeded PRNG (LCG) so fuzz is deterministic and bisectable.
// Zero external deps.

import {
  createPlaceholderProfile,
  type Profile,
  type JurisdictionAuthorization,
  type RemotePreference,
} from '../../../src/core';

export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const REGIONS = ['US', 'UK', 'EU', 'CA', 'AU', 'DE', 'FR', 'JP'] as const;
const REMOTE: readonly RemotePreference[] = ['remote', 'hybrid', 'onsite', 'any'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'] as const;

function randomAuth(rng: () => number): JurisdictionAuthorization {
  return {
    region: pick(rng, REGIONS),
    authorized: rng() > 0.3,
    requiresVisa: rng() > 0.7,
    requiresSponsorship: rng() > 0.5,
    legallyAllowed: rng() > 0.1,
  };
}

function randomDate(rng: () => number): string {
  const year = 1980 + Math.floor(rng() * 40);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function makeRandomValidProfile(seed: number): Profile {
  const rng = lcg(seed);
  const base = createPlaceholderProfile(1_700_000_000_000 + seed * 1000);
  const numAuths = Math.floor(rng() * 5);
  const auths: JurisdictionAuthorization[] = [];
  for (let i = 0; i < numAuths; i++) auths.push(randomAuth(rng));

  return {
    ...base,
    basics: {
      ...base.basics,
      firstName: `First${seed}`,
      lastName: `Last${seed}`,
      name: `First${seed} Last${seed}`,
      email: `user${seed}@example.com`,
      phone: rng() > 0.5 ? `+1${Math.floor(rng() * 9000000000 + 1000000000)}` : undefined,
      dateOfBirth: rng() > 0.5 ? randomDate(rng) : undefined,
      summary: rng() > 0.5 ? 'Short summary.' : undefined,
    },
    jobPreferences: {
      workAuthorization: auths,
      salaryExpectation:
        rng() > 0.5
          ? {
              min: 50000 + Math.floor(rng() * 50000),
              max: 100000 + Math.floor(rng() * 100000),
              currency: pick(rng, CURRENCIES),
              period: 'year',
            }
          : undefined,
      willingToRelocate: rng() > 0.5,
      remotePreference: pick(rng, REMOTE),
      willingToCompleteAssessments: rng() > 0.5,
      willingToUndergoDrugTests: rng() > 0.5,
      willingToUndergoBackgroundChecks: rng() > 0.5,
    },
  };
}

export function makeRandomInvalidProfile(seed: number): unknown {
  const rng = lcg(seed);
  const p = makeRandomValidProfile(seed) as unknown as Record<string, unknown>;
  const mutation = Math.floor(rng() * 10);
  switch (mutation) {
    case 0:
      // invalid email
      (p.basics as Record<string, unknown>).email = 'not an email';
      return p;
    case 1:
      // NaN salary
      (p.jobPreferences as Record<string, unknown>).salaryExpectation = {
        min: Number.NaN,
        max: 100000,
        currency: 'USD',
        period: 'year',
      };
      return p;
    case 2:
      // wrong enum
      (p.jobPreferences as Record<string, unknown>).remotePreference = 'freelance';
      return p;
    case 3:
      // over-limit string
      (p.basics as Record<string, unknown>).summary = 'a'.repeat(1001);
      return p;
    case 4:
      // missing required
      delete (p.jobPreferences as Record<string, unknown>).willingToRelocate;
      return p;
    case 5:
      // invalid profileVersion
      p.profileVersion = '2.0';
      return p;
    case 6:
      // wrong country code length
      (p.basics as Record<string, unknown>).location = { countryCode: 'USA' };
      return p;
    case 7:
      // unknown top-level field (strict mode catches this on children;
      // root passthrough tolerates it, but the child-level strict catches
      // the unknown field inside basics)
      (p.basics as Record<string, unknown>).__unknownField = 'x';
      return p;
    case 8:
      // salary max < min
      (p.jobPreferences as Record<string, unknown>).salaryExpectation = {
        min: 200000,
        max: 100000,
        currency: 'USD',
        period: 'year',
      };
      return p;
    case 9:
      // negative updatedAtMs
      p.updatedAtMs = -1;
      return p;
    default:
      return p;
  }
}
```

Main spec file:

```ts
// tests/core/profile/schema.spec.ts
import { describe, it, expect } from 'vitest';
import {
  ProfileSchema,
  CompleteProfileSchema,
  createEmptyProfile,
  createPlaceholderProfile,
  type Profile,
} from '../../../src/core';
import { makeRandomValidProfile, makeRandomInvalidProfile } from './_fuzz-helpers';

function validBase(overrides: Partial<Profile> = {}): Profile {
  const base = createPlaceholderProfile(1_700_000_000_000);
  return { ...base, ...overrides };
}

describe('ProfileSchema happy path', () => {
  it('accepts createEmptyProfile (draft-tolerant)', () => {
    expect(() => ProfileSchema.parse(createEmptyProfile())).not.toThrow();
  });

  it('accepts createPlaceholderProfile under both schemas', () => {
    const p = createPlaceholderProfile();
    expect(() => ProfileSchema.parse(p)).not.toThrow();
    expect(() => CompleteProfileSchema.parse(p)).not.toThrow();
  });

  it('accepts Ada Lovelace fully populated', () => {
    const p: Profile = {
      ...createPlaceholderProfile(1_700_000_000_000),
      basics: {
        name: 'Ada Lovelace',
        firstName: 'Ada',
        lastName: 'Lovelace',
        preferredName: 'Ada',
        pronouns: 'she/her',
        label: 'Mathematician',
        email: 'ada@example.com',
        phone: '+442071234567',
        phonePrefix: '+44',
        dateOfBirth: '1985-12-10',
        url: 'https://example.com',
        summary: 'First programmer.',
        location: { city: 'London', countryCode: 'GB' },
        profiles: [{ network: 'Twitter', username: 'ada', url: 'https://twitter.com/ada' }],
      },
      jobPreferences: {
        workAuthorization: [
          { region: 'US', authorized: true, requiresVisa: false, requiresSponsorship: false, legallyAllowed: true },
          { region: 'UK', authorized: true, requiresVisa: false, requiresSponsorship: false, legallyAllowed: true },
        ],
        salaryExpectation: { min: 100000, max: 150000, currency: 'USD', period: 'year' },
        availabilityDate: '2026-06-01',
        willingToRelocate: true,
        remotePreference: 'remote',
        willingToCompleteAssessments: true,
        willingToUndergoDrugTests: false,
        willingToUndergoBackgroundChecks: true,
      },
    };
    expect(() => ProfileSchema.parse(p)).not.toThrow();
    expect(() => CompleteProfileSchema.parse(p)).not.toThrow();
  });

  it('accepts all-optional-fields-unset minimal profile', () => {
    const p = validBase();
    expect(() => ProfileSchema.parse(p)).not.toThrow();
  });

  it('accepts nested resume handle', () => {
    const p = validBase();
    const withDoc = {
      ...p,
      documents: {
        resume: {
          id: 'h-1',
          filename: 'resume.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100000,
          lastUpdated: new Date().toISOString(),
        },
      },
    };
    expect(() => ProfileSchema.parse(withDoc)).not.toThrow();
  });

  it('accepts cover letter handle', () => {
    const p = validBase();
    const withDoc = {
      ...p,
      documents: {
        coverLetter: {
          id: 'h-2',
          filename: 'cover.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 50000,
          lastUpdated: new Date().toISOString(),
        },
      },
    };
    expect(() => ProfileSchema.parse(withDoc)).not.toThrow();
  });

  it('accepts both resume and cover letter', () => {
    const p = validBase();
    const withDocs = {
      ...p,
      documents: {
        resume: { id: 'r', filename: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 1, lastUpdated: new Date().toISOString() },
        coverLetter: { id: 'c', filename: 'c.pdf', mimeType: 'application/pdf', sizeBytes: 1, lastUpdated: new Date().toISOString() },
      },
    };
    expect(() => ProfileSchema.parse(withDocs)).not.toThrow();
  });
});

describe('ProfileSchema: null, undefined, NaN, Infinity', () => {
  it('rejects NaN salary min', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, salaryExpectation: { min: Number.NaN, max: 1, currency: 'USD' as const, period: 'year' as const } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects NaN salary max', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, salaryExpectation: { min: 1, max: Number.NaN, currency: 'USD' as const, period: 'year' as const } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects Infinity salary', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, salaryExpectation: { min: 1, max: Number.POSITIVE_INFINITY, currency: 'USD' as const, period: 'year' as const } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects NaN updatedAtMs', () => {
    const p = { ...validBase(), updatedAtMs: Number.NaN };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it('rejects negative updatedAtMs', () => {
    const p = { ...validBase(), updatedAtMs: -1 };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it('rejects Infinity updatedAtMs', () => {
    const p = { ...validBase(), updatedAtMs: Number.POSITIVE_INFINITY };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it('rejects omitted updatedAtMs', () => {
    const p = { ...validBase() } as unknown as Record<string, unknown>;
    delete p.updatedAtMs;
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it('rejects null in place of basics.email', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, email: null as unknown as string } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects undefined required willingToRelocate', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, willingToRelocate: undefined as unknown as boolean } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects null profileVersion', () => {
    const p = { ...validBase(), profileVersion: null as unknown as '1.0' };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it('rejects resume handle with -0 sizeBytes interpreted as 0 (passes)', () => {
    // -0 === 0 in JS; expected to parse successfully
    const p = validBase();
    const mut = { ...p, documents: { resume: { id: 'x', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: -0, lastUpdated: new Date().toISOString() } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects resume handle with -1 sizeBytes', () => {
    const p = validBase();
    const mut = { ...p, documents: { resume: { id: 'x', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: -1, lastUpdated: new Date().toISOString() } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });
});

describe('ProfileSchema: collection bounds', () => {
  it('accepts 100 work entries', () => {
    const p = validBase();
    const work = Array.from({ length: 100 }, () => ({
      name: 'Acme',
      position: 'Engineer',
      startDate: '2022-01-01',
      highlights: [],
    }));
    const mut = { ...p, work };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects 10001 work entries', () => {
    const p = validBase();
    const work = Array.from({ length: 10001 }, () => ({
      name: 'Acme',
      position: 'Engineer',
      startDate: '2022-01-01',
      highlights: [],
    }));
    const mut = { ...p, work } as unknown as Profile;
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts empty basics.profiles', () => {
    const p = validBase();
    expect(p.basics.profiles).toEqual([]);
    expect(ProfileSchema.safeParse(p).success).toBe(true);
  });

  it('rejects 21 social profiles (max 20)', () => {
    const p = validBase();
    const profiles = Array.from({ length: 21 }, (_, i) => ({ network: 'X', username: `u${i}`, url: 'https://example.com' }));
    const mut = { ...p, basics: { ...p.basics, profiles } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects 1001 customAnswers entries', () => {
    const p = validBase();
    const answers: Record<string, string> = {};
    for (let i = 0; i < 1001; i++) answers[`q${i}`] = 'a';
    const mut = { ...p, customAnswers: answers };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });
});

describe('ProfileSchema: unicode edge cases', () => {
  it('accepts RTL Hebrew name', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, firstName: 'דוד', lastName: 'כהן' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts combining-char accents', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, firstName: 'Ada\u0301' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects null bytes in email', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, email: 'ada\0@example.com' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts UTF-16 surrogate pairs in name', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, firstName: 'Ada\uD83D\uDE00' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts emoji in summary', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, summary: 'Loves coding \u{1F4BB}' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts CJK chars', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, firstName: '中文', lastName: '測試' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts BOM in string', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, summary: '\uFEFFHello' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });
});

describe('ProfileSchema: injection inputs (stored verbatim where format allows)', () => {
  it('accepts script tag in name (not sanitized at this layer)', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, firstName: '<script>alert(1)</script>' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects SQL-style injection in email (because it is not an RFC email)', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, email: "' OR 1=1--" } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts path traversal in filename (stored verbatim; adapter layer sanitizes)', () => {
    const p = validBase();
    const mut = { ...p, documents: { resume: { id: 'x', filename: '../../../etc/passwd', mimeType: 'application/pdf', sizeBytes: 1, lastUpdated: new Date().toISOString() } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });
});

describe('ProfileSchema: JurisdictionAuthorization requires exactly 4 booleans', () => {
  const base = {
    region: 'US',
    authorized: true,
    requiresVisa: false,
    requiresSponsorship: false,
    legallyAllowed: true,
  };

  it('accepts all 4 booleans present', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, workAuthorization: [base] } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  (['authorized', 'requiresVisa', 'requiresSponsorship', 'legallyAllowed'] as const).forEach((field) => {
    it(`rejects when ${field} is missing`, () => {
      const p = validBase();
      const auth = { ...base };
      delete (auth as Record<string, unknown>)[field];
      const mut = { ...p, jobPreferences: { ...p.jobPreferences, workAuthorization: [auth as unknown as typeof base] } };
      expect(ProfileSchema.safeParse(mut).success).toBe(false);
    });
  });

  it('rejects when region is missing', () => {
    const p = validBase();
    const auth = { ...base } as Record<string, unknown>;
    delete auth.region;
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, workAuthorization: [auth as unknown as typeof base] } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects region too short', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, workAuthorization: [{ ...base, region: 'U' }] } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });
});

describe('ProfileSchema: JobPreferences requires 3 willingTo* booleans', () => {
  (['willingToCompleteAssessments', 'willingToUndergoDrugTests', 'willingToUndergoBackgroundChecks'] as const).forEach((field) => {
    it(`rejects when ${field} is missing`, () => {
      const p = validBase();
      const prefs = { ...p.jobPreferences } as Record<string, unknown>;
      delete prefs[field];
      const mut = { ...p, jobPreferences: prefs as unknown as Profile['jobPreferences'] };
      expect(ProfileSchema.safeParse(mut).success).toBe(false);
    });
  });
});

describe('ProfileSchema: Consents requires all 4 booleans', () => {
  (['privacyPolicy', 'marketing', 'allowEeoAutofill', 'allowDobAutofill'] as const).forEach((field) => {
    it(`rejects when ${field} is missing`, () => {
      const p = validBase();
      const consents = { ...p.consents } as Record<string, unknown>;
      delete consents[field];
      const mut = { ...p, consents: consents as unknown as Profile['consents'] };
      expect(ProfileSchema.safeParse(mut).success).toBe(false);
    });
  });
});

describe('ProfileSchema: format validation', () => {
  it('accepts ISO dateOfBirth', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, dateOfBirth: '1990-05-15' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects non-ISO MM/DD/YYYY dateOfBirth', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, dateOfBirth: '05/15/1990' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects countryCode length 1', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, location: { countryCode: 'U' } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects countryCode length 3', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, location: { countryCode: 'USA' } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts countryCode length 2', () => {
    const p = validBase();
    const mut = { ...p, basics: { ...p.basics, location: { countryCode: 'US' } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('rejects email over 320 chars', () => {
    const p = validBase();
    const email = 'a'.repeat(310) + '@example.com';
    expect(email.length).toBeGreaterThan(320);
    const mut = { ...p, basics: { ...p.basics, email } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects salary max < min', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, salaryExpectation: { min: 200000, max: 100000, currency: 'USD' as const, period: 'year' as const } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects negative salary', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, salaryExpectation: { min: -1, max: 1, currency: 'USD' as const, period: 'year' as const } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });
});

describe('ProfileSchema: enum and demographic validation', () => {
  it('rejects invalid remotePreference', () => {
    const p = validBase();
    const mut = { ...p, jobPreferences: { ...p.jobPreferences, remotePreference: 'freelance' as unknown as 'remote' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('rejects invalid gender enum', () => {
    const p = validBase();
    const mut = { ...p, demographics: { gender: 'robot' as unknown as 'male' } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts decline_to_answer for gender', () => {
    const p = validBase();
    const mut = { ...p, demographics: { gender: 'decline_to_answer' as const } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts decline_to_answer for race', () => {
    const p = validBase();
    const mut = { ...p, demographics: { race: 'decline_to_answer' as const } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts decline_to_answer for veteranStatus', () => {
    const p = validBase();
    const mut = { ...p, demographics: { veteranStatus: 'decline_to_answer' as const } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });

  it('accepts decline_to_answer for disabilityStatus', () => {
    const p = validBase();
    const mut = { ...p, demographics: { disabilityStatus: 'decline_to_answer' as const } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });
});

describe('ProfileSchema: resume handle size cap', () => {
  it('rejects over 25MB', () => {
    const p = validBase();
    const mut = { ...p, documents: { resume: { id: 'x', filename: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 26 * 1024 * 1024, lastUpdated: new Date().toISOString() } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(false);
  });

  it('accepts exactly 25MB', () => {
    const p = validBase();
    const mut = { ...p, documents: { resume: { id: 'x', filename: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 25 * 1024 * 1024, lastUpdated: new Date().toISOString() } } };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });
});

describe('ProfileSchema: adversarial state', () => {
  it('frozen input parses successfully and stays frozen', () => {
    const p = Object.freeze({ ...validBase() });
    const result = ProfileSchema.safeParse(p);
    expect(result.success).toBe(true);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('rejects __proto__ injection inside basics', () => {
    const p = validBase();
    const injected = JSON.parse('{"__proto__": {"polluted": true}}');
    const mut = { ...p, basics: { ...p.basics, ...injected } };
    const result = ProfileSchema.safeParse(mut);
    // Schema strict mode on basics rejects any unknown key including __proto__
    expect(result.success).toBe(false);
    const base = {};
    expect((base as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects proxy with throwing getter', () => {
    const p = validBase();
    const trapped = new Proxy(p.basics, {
      get(target, prop) {
        if (prop === 'email') throw new Error('trapped');
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });
    const mut = { ...p, basics: trapped } as Profile;
    // safeParse should either return success: false OR throw caught internally.
    // Either way it must not leak the thrown message unexpectedly.
    try {
      const r = ProfileSchema.safeParse(mut);
      expect(r.success).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('parses Object.create(null) -based profile', () => {
    const p = validBase();
    const basics = Object.assign(Object.create(null), p.basics);
    const mut = { ...p, basics };
    expect(ProfileSchema.safeParse(mut).success).toBe(true);
  });
});

describe('ProfileSchema: fuzz 100 valid', () => {
  for (let i = 0; i < 100; i++) {
    it(`valid fuzz iteration ${i}`, () => {
      const p = makeRandomValidProfile(i);
      const result = ProfileSchema.safeParse(p);
      if (!result.success) {
        console.error('fuzz failure at seed', i, result.error.issues);
      }
      expect(result.success).toBe(true);
    });
  }
});

describe('ProfileSchema: fuzz 100 invalid', () => {
  for (let i = 0; i < 100; i++) {
    it(`invalid fuzz iteration ${i}`, () => {
      const p = makeRandomInvalidProfile(i);
      const result = ProfileSchema.safeParse(p);
      expect(result.success).toBe(false);
    });
  }
});
```

**Hard gate**: `tests/core/profile/schema.spec.ts` plus helper file together MUST have >= 100 `expect()` calls (80 adversarial + 200 fuzz). Acceptance criterion counts them.

#### T6 -- `tests/core/profile/defaults.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  createEmptyProfile,
  createPlaceholderProfile,
  ProfileSchema,
  CompleteProfileSchema,
  isProfileFillReady,
} from '../../../src/core';

describe('createEmptyProfile', () => {
  it('round-trips through ProfileSchema.parse (draft-tolerant)', () => {
    const empty = createEmptyProfile(1_700_000_000_000);
    expect(() => ProfileSchema.parse(empty)).not.toThrow();
  });

  it('FAILS CompleteProfileSchema.parse (empty email)', () => {
    const empty = createEmptyProfile(1_700_000_000_000);
    const result = CompleteProfileSchema.safeParse(empty);
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find((e) => e.path.join('.') === 'basics.email');
      expect(emailError).toBeDefined();
    }
  });

  it('pins profileVersion to 1.0', () => {
    expect(createEmptyProfile().profileVersion).toBe('1.0');
  });

  it('stamps updatedAtMs with the provided clock value', () => {
    const p = createEmptyProfile(1_700_000_000_000);
    expect(p.updatedAtMs).toBe(1_700_000_000_000);
  });

  it('stamps updatedAtMs with Date.now() when no arg passed', () => {
    const before = Date.now();
    const p = createEmptyProfile();
    const after = Date.now();
    expect(p.updatedAtMs).toBeGreaterThanOrEqual(before);
    expect(p.updatedAtMs).toBeLessThanOrEqual(after);
  });

  it('default consents are all false', () => {
    const c = createEmptyProfile().consents;
    expect(c.privacyPolicy).toBe(false);
    expect(c.marketing).toBe(false);
    expect(c.allowEeoAutofill).toBe(false);
    expect(c.allowDobAutofill).toBe(false);
  });

  it('default willingness flags are false', () => {
    const j = createEmptyProfile().jobPreferences;
    expect(j.willingToRelocate).toBe(false);
    expect(j.willingToCompleteAssessments).toBe(false);
    expect(j.willingToUndergoDrugTests).toBe(false);
    expect(j.willingToUndergoBackgroundChecks).toBe(false);
  });

  it('returns a new object each call (no shared mutable state)', () => {
    const a = createEmptyProfile();
    const b = createEmptyProfile();
    expect(a).not.toBe(b);
    expect(a.basics).not.toBe(b.basics);
    expect(a.jobPreferences).not.toBe(b.jobPreferences);
  });

  it('basics.email is empty string (not placeholder)', () => {
    expect(createEmptyProfile().basics.email).toBe('');
  });
});

describe('createPlaceholderProfile', () => {
  it('round-trips through CompleteProfileSchema', () => {
    const p = createPlaceholderProfile(1_700_000_000_000);
    expect(() => CompleteProfileSchema.parse(p)).not.toThrow();
  });

  it('basics.email is placeholder@example.com', () => {
    expect(createPlaceholderProfile().basics.email).toBe('placeholder@example.com');
  });

  it('all other fields match createEmptyProfile', () => {
    const ts = 1_700_000_000_000;
    const empty = createEmptyProfile(ts);
    const placeholder = createPlaceholderProfile(ts);
    expect({ ...placeholder, basics: { ...placeholder.basics, email: '' } }).toEqual(empty);
  });
});

describe('isProfileFillReady', () => {
  it('returns false for empty profile', () => {
    expect(isProfileFillReady(createEmptyProfile())).toBe(false);
  });

  it('returns true for placeholder profile', () => {
    expect(isProfileFillReady(createPlaceholderProfile())).toBe(true);
  });

  it('returns false for non-profile input (adversarial)', () => {
    expect(isProfileFillReady(null)).toBe(false);
    expect(isProfileFillReady(undefined)).toBe(false);
    expect(isProfileFillReady({})).toBe(false);
    expect(isProfileFillReady('profile')).toBe(false);
    expect(isProfileFillReady(42)).toBe(false);
  });
});
```

#### T7 -- `tests/core/taxonomy/field-types.spec.ts`

Full adversarial suite. Approximately 90 lines.

```ts
import { describe, it, expect } from 'vitest';
import {
  MOZILLA_BASELINE_FIELD_TYPES,
  MOZILLA_BASELINE_SET,
  ATS_EXTENSION_FIELD_TYPES,
  ATS_EXTENSION_SET,
  EEO_FIELD_TYPES,
  CONSENT_FIELD_TYPES,
  DOB_FIELD_TYPES,
  isAtsExtensionField,
  isEeoField,
  isConsentField,
  isDobField,
  type FieldType,
} from '../../../src/core';

describe('Mozilla baseline', () => {
  it('has exactly 32 entries', () => {
    expect(MOZILLA_BASELINE_FIELD_TYPES.length).toBe(32);
  });

  it('set and array match', () => {
    expect(MOZILLA_BASELINE_SET.size).toBe(MOZILLA_BASELINE_FIELD_TYPES.length);
  });

  it('is frozen (immutability)', () => {
    expect(Object.isFrozen(MOZILLA_BASELINE_FIELD_TYPES)).toBe(true);
  });
});

describe('ATS extensions', () => {
  it('has at least 49 entries', () => {
    expect(ATS_EXTENSION_FIELD_TYPES.length).toBeGreaterThanOrEqual(49);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ATS_EXTENSION_FIELD_TYPES)).toBe(true);
  });
});

describe('partition invariant', () => {
  it('every field type is in exactly one set (XOR)', () => {
    for (const t of MOZILLA_BASELINE_SET) {
      expect(ATS_EXTENSION_SET.has(t)).toBe(false);
    }
    for (const t of ATS_EXTENSION_SET) {
      expect(MOZILLA_BASELINE_SET.has(t)).toBe(false);
    }
  });

  it('total unique field types >= 74', () => {
    const total = new Set<FieldType>([
      ...MOZILLA_BASELINE_FIELD_TYPES,
      ...ATS_EXTENSION_FIELD_TYPES,
    ]);
    expect(total.size).toBeGreaterThanOrEqual(74);
  });
});

describe('EEO, Consent, DOB subsets', () => {
  it('EEO has 8 members', () => {
    expect(EEO_FIELD_TYPES.size).toBe(8);
  });

  it('CONSENT has 4 members', () => {
    expect(CONSENT_FIELD_TYPES.size).toBe(4);
  });

  it('DOB has 4 members', () => {
    expect(DOB_FIELD_TYPES.size).toBe(4);
  });

  it('all EEO members are in ATS extension set', () => {
    for (const t of EEO_FIELD_TYPES) {
      expect(ATS_EXTENSION_SET.has(t)).toBe(true);
    }
  });

  it('all DOB members are in Mozilla baseline set', () => {
    for (const t of DOB_FIELD_TYPES) {
      expect(MOZILLA_BASELINE_SET.has(t)).toBe(true);
    }
  });
});

describe('guards', () => {
  it('isEeoField returns true for all EEO types', () => {
    for (const t of EEO_FIELD_TYPES) {
      expect(isEeoField(t)).toBe(true);
    }
  });

  it('isEeoField returns false for non-EEO', () => {
    expect(isEeoField('email')).toBe(false);
    expect(isEeoField('resume-upload')).toBe(false);
  });

  it('isConsentField partitions correctly', () => {
    expect(isConsentField('consent-privacy')).toBe(true);
    expect(isConsentField('email')).toBe(false);
  });

  it('isDobField partitions correctly', () => {
    expect(isDobField('bday')).toBe(true);
    expect(isDobField('bday-year')).toBe(true);
    expect(isDobField('email')).toBe(false);
  });

  it('isAtsExtensionField is truthy for every ATS ext member', () => {
    for (const t of ATS_EXTENSION_FIELD_TYPES) {
      expect(isAtsExtensionField(t)).toBe(true);
    }
  });
});

describe('staple membership', () => {
  it('baseline contains email, tel, given-name, family-name, postal-code', () => {
    expect(MOZILLA_BASELINE_SET.has('email')).toBe(true);
    expect(MOZILLA_BASELINE_SET.has('tel')).toBe(true);
    expect(MOZILLA_BASELINE_SET.has('given-name')).toBe(true);
    expect(MOZILLA_BASELINE_SET.has('family-name')).toBe(true);
    expect(MOZILLA_BASELINE_SET.has('postal-code')).toBe(true);
  });

  it('extension contains resume-upload, work-auth-us, eeo-gender, visa-sponsorship-required, salary-min, unknown', () => {
    expect(ATS_EXTENSION_SET.has('resume-upload')).toBe(true);
    expect(ATS_EXTENSION_SET.has('work-auth-us')).toBe(true);
    expect(ATS_EXTENSION_SET.has('eeo-gender')).toBe(true);
    expect(ATS_EXTENSION_SET.has('visa-sponsorship-required')).toBe(true);
    expect(ATS_EXTENSION_SET.has('salary-min')).toBe(true);
    expect(ATS_EXTENSION_SET.has('unknown')).toBe(true);
  });
});
```

#### T8 -- `tests/core/taxonomy/synonyms.spec.ts`

Paste v1 step 20 content verbatim. No v2 changes required. (Approximately 60 lines.)

#### T9 -- `tests/core/profile/migrations.spec.ts`

Paste v1 step 20 content verbatim. Approximately 25 lines.

### Step 23 -- Run grep gates and typecheck

From `e:/ats-autofill-engine`:

```bash
# Core purity gate (D14). Note: each alternative gets its own boundary so that
# legitimate uses of `documents` (the Profile.documents property per keystone
# Section 3) and `documented` (in JSDoc prose) do NOT false-positive. D14's
# literal regex in 02-decisions-v2.1-final.md omitted the trailing boundary on
# `document`; the intent (confirmed by review-B2.md's zero-flag of the
# `documents:` property access in the v1 plan) is for the trailing boundary
# to be present on the word tokens. `chrome\.` needs no trailing `\b` because
# `.` is not a word character. CI uses this corrected form.
grep -rE '(\bdocument\b|\bwindow\b|\bHTMLElement\b|chrome\.)' src/core/ --include='*.ts' && exit 1 || echo "core is platform-free"

# V1 remnants gate (D14)
grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/ --include='*.ts' && exit 1 || echo "no v1 remnants"

# Em-dash gate (D15)
grep -rl $'\u2014' --include='*.ts' --include='*.md' . && exit 1 || echo "no em-dashes"

# No any gate
grep -rE ':\s*any(\s|,|>|\))' src/core/ --include='*.ts' && exit 1 || echo "no any type"

# No @nestjs gate
grep -r '@nestjs' src/core/ --include='*.ts' && exit 1 || echo "no nest imports"

# No adapters import from core
grep -rE "from\s+['\"](\.\./)+adapters" src/core/ --include='*.ts' && exit 1 || echo "no adapter imports"

# Typecheck + tests + coverage
pnpm --filter ats-autofill-engine typecheck
pnpm --filter ats-autofill-engine test tests/core --coverage

# Coverage floors (D24)
node -e "
const cov = require('./coverage/coverage-summary.json').total;
if (cov.lines.pct < 90) { console.error('line coverage ' + cov.lines.pct + ' < 90'); process.exit(1); }
if (cov.branches.pct < 85) { console.error('branch coverage ' + cov.branches.pct + ' < 85'); process.exit(1); }
console.log('coverage ok');
"
```

If any gate exits non-zero, STOP and report.

### Step 24 -- Commit

```bash
git add src/core tests/core src/index.ts
git commit -m "feat(core): ship v2.1 types, profile, taxonomy, ports, and blueprint contract"
```

Do NOT push. B3 runs next in the same working copy.

---

## Acceptance criteria

- [ ] All 27 source files listed in "Source files to create" exist under `src/core/` (or `src/index.ts` for the root barrel)
- [ ] All 9 test files exist under `tests/core/` (7 new + 2 v1-preserved)
- [ ] `src/core/types/highlight-range.ts` does NOT exist
- [ ] `IKeywordHighlighter` is NOT exported anywhere
- [ ] `src/core/profile/**` exists (NOT `src/core/types/profile/**`)
- [ ] `src/core/blueprint.contract.ts` exists and declares `publicExports`, `forbiddenImports`, `forbiddenTokens`, `requiredCoverage: 90`
- [ ] `pnpm typecheck` against `tsconfig.core.json` passes with zero errors
- [ ] `pnpm test tests/core` passes with 100 percent of tests green
- [ ] `pnpm test tests/core --coverage` reports >= 90 percent line and >= 85 percent branch coverage on `src/core/**`
- [ ] `grep -rE '(\bdocument\b|\bwindow\b|\bHTMLElement\b|chrome\.)' src/core/` returns zero matches (INCLUDING JSDoc; note boundary-corrected form per step 23)
- [ ] `grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/` returns zero matches
- [ ] `grep -rl $'\u2014' --include='*.ts' --include='*.md' .` returns zero (em-dash rule D15)
- [ ] `grep -rE ':\s*any(\s|,|>|\))' src/core/` returns zero (no `any`)
- [ ] `grep -r '@nestjs' src/core/` returns zero
- [ ] `grep -rE "from\s+['\"](\.\./)+adapters" src/core/` returns zero (no core-to-adapter imports)
- [ ] `ProfileSchema.parse(createEmptyProfile())` succeeds (covered by defaults.spec.ts)
- [ ] `CompleteProfileSchema.parse(createEmptyProfile())` FAILS with email error (covered)
- [ ] `CompleteProfileSchema.parse(createPlaceholderProfile())` succeeds (covered)
- [ ] `isProfileFillReady(createEmptyProfile())` returns false (covered)
- [ ] `isProfileFillReady(createPlaceholderProfile())` returns true (covered)
- [ ] `schema.spec.ts` has at least 80 `expect` calls (count with `grep -c 'expect(' tests/core/profile/schema.spec.ts`)
- [ ] Fuzz suite runs 100 valid + 100 invalid iterations and all pass
- [ ] Every `FieldType` has a synonym entry (covered)
- [ ] `FieldType` XOR partition invariant holds (covered)
- [ ] `MOZILLA_BASELINE_FIELD_TYPES.length === 32` (asserted in field-types.spec.ts)
- [ ] `ATS_EXTENSION_FIELD_TYPES.length >= 49`
- [ ] Every branded primitive (TabId, GenerationId, SessionId, RequestId, PlanId, ResumeHandleId) has construction and unbrand round-trip tests
- [ ] Type-level assertion test file compiles (proves `AtsAdapter` has the right shape)
- [ ] `AtsVendor` is exported as a type alias for `AtsKind` (backward compat, D9)
- [ ] `src/core/blueprint.contract.ts` is read by `scripts/check-blueprint-contracts.mjs` without error (D22)
- [ ] A single commit with the message `feat(core): ship v2.1 types, profile, taxonomy, ports, and blueprint contract`
- [ ] `git status` is clean after the commit
- [ ] `pnpm compliance` (if configured at the engine-repo level) passes; otherwise the five grep gates above replace it

---

## Tests to write (summary table)

| # | Spec | Approximate lines | Approximate expects | Covers |
|---|---|---|---|---|
| T1 | `types/brands.spec.ts` | 120 | 15 | All 6 branded primitives: construction, unbrand, type-level rejection, unicode, large strings, NaN, null bytes, JSON round-trip |
| T2 | `types/ats-adapter.type-test.ts` | 90 | 7 (mostly compile-time) | AtsAdapter shape, WorkdayWizardStep 5 literals, AtsKind 3 literals, AtsVendor alias |
| T3 | `types/form-model.spec.ts` | 110 | 15 | Literal construction, optional fields, freezeFormModel idempotent and recursive, circular reference rejected |
| T4 | `types/fill-instruction.spec.ts` | 130 | 20 | FillValue 5 variants + exhaustive switch, SkipReason count, FillError count, FillResult discrimination, FillPlan shape |
| T5 | `profile/schema.spec.ts` + fuzz helpers | 640 + 120 | 80 plus | Adversarial suite per D19 (7 categories), fuzz 100+100 |
| T6 | `profile/defaults.spec.ts` | 110 | 20 | createEmptyProfile draft-valid, createPlaceholderProfile strict-valid, isProfileFillReady, new-object-per-call, updatedAtMs stamped |
| T7 | `taxonomy/field-types.spec.ts` | 90 | 30 | Set sizes, XOR partition, EEO/CONSENT/DOB subsets, guards, staples |
| T8 | `taxonomy/synonyms.spec.ts` | 60 | 10 | Preserved from v1 |
| T9 | `profile/migrations.spec.ts` | 25 | 3 | Preserved from v1 |
| **Total** | | **approximately 1500** | **approximately 200** | |

**Hard gate**: tests MUST have >= 200 `expect()` calls total. Coverage MUST meet D24 floors.

---

## Out of scope

Explicitly NOT in this phase. Executor must NOT implement any of these:

- **Classifier logic**. B4 owns `src/core/classifier.ts`. B2 only ships the taxonomy it will consume.
- **Mozilla heuristics port**. B3 owns `src/core/heuristics/**` (MPL-2.0 sub-module). B2 does NOT touch this.
- **Plan builder and fill rules**. B4 owns `src/core/plan-builder.ts` and `src/core/fill-rules.ts`.
- **DOM scanner, filler, highlighter-renderer**. B5 and B6 own `src/adapters/dom/**`.
- **Chrome adapter**. Out of the engine scope entirely.
- **ATS-specific selectors and adapters**. B7 (Greenhouse), B8 (Lever), B9 (Workday).
- **Keyword matching and highlight ranges**. Removed from the engine entirely per v2 decision memo 2.5. Highlight rendering is a pure B6 utility that takes `readonly string[]`. No `HighlightRange`, no `IKeywordHighlighter`, no `planHighlights`.
- **Skill taxonomy integration** (`skill-taxonomy` npm package). No longer an engine concern. Skill extraction runs on the backend (A3).
- **I18n synonyms**. Deferred to v2 of the engine. B2 ships English only.
- **Profile migrations 1.0 to 1.1**. Stub only. No actual migration code at 1.0.
- **Package exports-map updates**. B1 locked the exports map. If B2 finds it missing an entry, that is B1 drift and MUST be flagged to the human operator.
- **React remount logic** for the options page. D10 prescribes the pattern; A7 owns the implementation. B2 only ships `updatedAtMs` on Profile.
- **Refresh manager, message handlers, logger, credits state**. All A5-owned. B2 ships no runtime code beyond the types.
- **Workday wizard loop**. D6 prescribes the pattern. A8 owns the loop. B9 exposes primitives. B2 ships only the `WorkdayWizardStep` literal union and optional `AtsAdapter` members; the loop logic is elsewhere.

If the executor is tempted to "just add a quick stub", STOP. Plans under this system never contain stubs per `.claude/rules/code-quality.md`.

---

## Rollback plan

This phase has zero external side effects: no published npm release, no DB migration, no GitHub issue created, no deployed binary, no config change outside this repo. Rollback is a pure git operation.

Scripted rollback at `scripts/rollback-phase-B2.sh` (committed per D23):

```bash
#!/bin/bash
# scripts/rollback-phase-B2.sh
set -euo pipefail

echo "rolling back phase B2..."

# 1. Delete everything B2 created
rm -rf src/core/types/
rm -rf src/core/profile/
rm -rf src/core/taxonomy/
rm -rf src/core/ports/
rm -rf src/core/util/
rm -f src/core/blueprint.contract.ts
rm -f src/core/index.ts
rm -rf tests/core/

# 2. Restore B1 placeholder files from git
git checkout HEAD -- src/core/.gitkeep 2>/dev/null || true
git checkout HEAD -- src/index.ts

# 3. Verify B1 scaffold still compiles
pnpm --filter ats-autofill-engine typecheck || {
  echo "ERROR: B1 scaffold does not compile after rollback."
  echo "This indicates the rollback corrupted something. Investigate."
  exit 1
}

# 4. Run tests (expect 0 tests, but the run itself must succeed)
pnpm --filter ats-autofill-engine test || true

echo "Phase B2 rolled back cleanly. Working copy is at B1-end state."
```

Make it executable (`chmod +x scripts/rollback-phase-B2.sh`) and include it in the commit.

If B2 breaks the scaffold and the script above is not enough:

1. `git reset --hard <sha-of-B1-final-commit>` (the commit that closed phase B1)
2. `rm -rf src/core tests/core` (belt and braces)
3. Re-run `pnpm typecheck` to confirm B1 scaffold still compiles
4. Report failure to the human operator with the exact typecheck/test error output

---

## Compliance gates

- [ ] `pnpm --filter ats-autofill-engine typecheck` -- zero TypeScript errors against `tsconfig.core.json` (lib ES2022 only, no DOM)
- [ ] `pnpm --filter ats-autofill-engine test tests/core` -- all approximately 200 tests pass
- [ ] `pnpm --filter ats-autofill-engine test tests/core --coverage` -- 90 percent line, 85 percent branch on `src/core/**`
- [ ] `pnpm --filter ats-autofill-engine lint src/core tests/core` -- zero ESLint errors or warnings
- [ ] `grep -rE '(\bdocument\b|\bwindow\b|\bHTMLElement\b|chrome\.)' src/core/` -- zero hits
- [ ] `grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/` -- zero hits
- [ ] `grep -rl $'\u2014'` across `src/`, `tests/`, and this plan file -- zero hits
- [ ] `grep -rE ':\s*any(\s|,|>|\))' src/core/` -- zero hits
- [ ] `scripts/rollback-phase-B2.sh` exists and is executable (D23)
- [ ] `src/core/blueprint.contract.ts` parses successfully under the CI blueprint-contract check (D22)
- [ ] `git log -1 --format=%s` -- matches `feat(core): ship v2.1 types, profile, taxonomy, ports, and blueprint contract`
- [ ] `git status` -- clean working tree after commit

If ANY gate fails, do NOT proceed to phase B3. Report the failure to the human operator with full error output. The verification loop (Opus) will issue a correction plan if needed.

---

## Cross-phase import matrix (reference for the executor)

The following is the exact set of symbols each downstream phase will import from `ats-autofill-engine` or `ats-autofill-engine/profile`. Every symbol MUST be shipped by B2. If any row cannot be satisfied from the code above, STOP and reread.

| Phase | Import path | Symbols |
|---|---|---|
| A5 | `ats-autofill-engine` | `Profile` (type), `FillInstruction`, `FillResult`, `FormModel`, `DetectedIntent`, `ExtractedSkill`, `TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId`, `AtsKind`, `JobPostingData` |
| A5 | `ats-autofill-engine/profile` | `ProfileSchema`, `createEmptyProfile` |
| A6 | `ats-autofill-engine` | `TabId`, `GenerationId`, `SessionId` |
| A7 | `ats-autofill-engine/profile` | `Profile`, `ProfileSchema`, `CompleteProfileSchema`, `createEmptyProfile`, `isProfileFillReady`, `Basics`, `JurisdictionAuthorization`, `JobPreferences`, `Consents`, `Documents`, `ResumeHandle`, `CoverLetterHandle`, `RemotePreference`, `SalaryPeriod` |
| A8 | `ats-autofill-engine` | `Profile`, `FillInstruction`, `FillResult`, `FillPlanResult`, `FillPlan`, `AtsAdapter`, `AtsKind`, `WorkdayWizardStep`, `PlanId`, `TabId`, `SourceElementTree`, `SkipReason`, `AbortReason` |
| A8 | `ats-autofill-engine/profile` | `Profile`, `ProfileSchema`, `isProfileFillReady` |
| A9 | `ats-autofill-engine` | `DetectedIntent`, `AtsKind`, `TabId`, `ExtractedSkill` |
| A10 | `ats-autofill-engine` | `DetectedIntent`, `GenerationId`, `SessionId`, `TabId`, `AtsKind` |
| A11 | `ats-autofill-engine` | `GenerationId`, `SessionId`, `TabId`, `WorkdayWizardStep` |
| B3 | `ats-autofill-engine` | `FieldType`, `MOZILLA_BASELINE_FIELD_TYPES`, `FormFieldDescriptor`, `ClassifiedField`, `ClassificationConfidence`, `ClassifiedFieldSource` |
| B4 | `ats-autofill-engine` | `Profile`, `FillInstruction`, `FillPlan`, `FillValue`, `SkipReason`, `FormModel`, `FormFieldDescriptor`, `ClassifiedField`, `FieldType`, `SYNONYMS`, `MOZILLA_BASELINE_FIELD_TYPES`, `ATS_EXTENSION_FIELD_TYPES`, `EEO_FIELD_TYPES`, `CONSENT_FIELD_TYPES`, `DOB_FIELD_TYPES`, `isEeoField`, `isConsentField`, `isDobField`, `PlanId` |
| B4 | `ats-autofill-engine/profile` | `CompleteProfileSchema`, `isProfileFillReady` |
| B5 | `ats-autofill-engine` | `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillResult`, `FillError`, `FillValue`, `freezeFormModel`, `SourceElementTree` |
| B6 | `ats-autofill-engine` | (DOM types only; B6 imports zero runtime symbols from core). No `HighlightRange`. |
| B7 | `ats-autofill-engine` | `AtsAdapter`, `AtsKind`, `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillResult`, `FillError`, `JobPostingData`, `SourceElementTree`, `freezeFormModel` |
| B8 | `ats-autofill-engine` | Same as B7 |
| B9 | `ats-autofill-engine` | Same as B7 + `WorkdayWizardStep`, `FillPlanResult`, `AbortReason`, `SkipReason` |

Every row is satisfied by this plan. If the executor finds a mismatch during typecheck of a downstream phase, it is a bug in THIS plan and must be reported for correction.

---

## Final note to the executor

This is the keystone phase for every downstream engine and extension phase. If you are tempted to skip a file because "it is obvious" or "B3 will add it anyway", STOP. Every single symbol in Section 2 of `03-keystone-contracts.md` and every symbol in the cross-phase import matrix MUST be present after this phase commits. The smallest omission cascades through 10-plus downstream consumers.

Two specific failure modes the reviewer flagged as load-bearing:

1. **Do not create `HighlightRange` or `IKeywordHighlighter`.** They are deleted in v2. If any grep at step 23 catches them, you have regressed and must delete every trace before committing.
2. **Do not let `document`, `window`, `HTMLElement`, or `chrome.` appear in any `.ts` file under `src/core/**`, including JSDoc.** The review explicitly listed 7 places where the v1 plan accidentally put these tokens in code comments. Every one is rephrased in the v2 step content above. If you find yourself typing the word `document` in a comment, the correct phrase is "source element", "scanned form", or "resume/CV file" depending on context.

If you hit any ambiguity that this plan does not resolve, STOP and ask the human operator. Do NOT guess.

---

**End of phase B2 plan v2.1.**
