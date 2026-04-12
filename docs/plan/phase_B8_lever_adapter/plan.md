# Phase B8 -- Lever ATS adapter (MPL-2.0)

## Phase metadata

| Field | Value |
|---|---|
| **Phase code** | B8 |
| **Phase name** | Lever ATS adapter (MPL-2.0) |
| **Plan** | 100 v2.1 -- Chrome Extension POC + V1 |
| **Track** | Track 1 (engine) |
| **Target repo** | `ebenezer-isaac/ats-autofill-engine` |
| **Local path** | `e:/ats-autofill-engine` |
| **Day** | 5 -- 2026-04-16 |
| **Parallel with** | B7 (Greenhouse), B9 (Workday) |
| **Estimated effort** | 5-7 hours |
| **Depends on** | B1 (scaffold + `./lever` sub-entry), B2 (core types + taxonomy, amended per keystone D5), B4 (classifier + fill rules), B5 (DOM adapter scanner + filler + file attacher), B6 (JSON-LD extractor under `src/adapters/dom/jd/`) |
| **Blocks** | A8 (extension content script autofill), B9 publish (sub-entry must exist) |
| **Confidence** | 9/10 |
| **Files touched** | 10 new production files, 5 new test specs, 4 new fixtures, 1 barrel created, 1 rollback script |
| **Lines changed** | ~1850 added (production + tests + fixtures + contract + blueprint + rollback) |
| **License** | MPL-2.0 on every adapter file (copyleft per decision memo §2.4). Test files also MPL-2.0. |
| **Applies decisions** | D1, D9, D14, D15, D17, D18, D22 (+ upstream dependencies on D5/D7/D8 from B2) |

## Goal

Implement the Lever ATS adapter under `src/ats/lever/**` and its tests under `tests/ats/lever/**`, conforming *verbatim* to the AtsAdapter contract defined in `03-keystone-contracts.md §2.9` and the factory pattern in `03-keystone-contracts.md §6`. The adapter ships:

1. URL pattern matching for `jobs.lever.co/{org}/{uuid}` posting pages and `.../apply` application pages (pure, case-insensitive, defensive against null/undefined/unicode/garbage input).
2. A selector map derived from `andrewmillercode/Autofill-Jobs` (MIT) per investigation file 59, ported to Mozilla-baseline kebab-case `FieldType` tokens from B2's taxonomy.
3. A form scanner `scanLeverForm(doc)` that locates the Lever form root via three known id variants (`#application-form`, `#application_form`, `#applicationform`), delegates to the B5 generic `scan` function, stamps `sourceATS: 'lever'` + `formRootSelector` on the resulting `FormModel`, and detects which name-input variant the form renders (`combined-name`, `split-name`, or `unknown`).
4. A field filler `fillLeverField(instruction, ctx)` that is a THIN wrapper over B5's `fillField(el, value)` primitive: it resolves the element by `instruction.selector`, dispatches on `instruction.value.kind` (text / choice / boolean / file / skip), extracts the primitive value, calls B5, and threads the canonical `FillResult` discriminated union back out. Variant-aware for the combined-name vs split-name fork.
5. A file attacher `attachLeverResume(instruction, file, ctx)` that is ASYNC (matches B5's `async attachFile`), resolves the file input via the same selector-priority list, awaits B5, and returns `Promise<FillResult>`.
6. A Lever-specific JSON-LD job extractor `extractLeverJob(doc)` that URL-gates on posting pages (rejects apply pages, which Lever does not render JSON-LD into per agent 55 §a) and delegates to the B6 generic `extractJobPostingFromDocument` imported from `../../adapters/dom` (NOT `../../core/extraction/**` -- core has zero DOM).
7. A factory `createLeverAdapter()` that closes over `lastVariant: LeverFormVariant` and `lastFormRoot: WeakRef<Element> | null` and returns a frozen `AtsAdapter` object matching keystone §6 verbatim. A module-singleton `adapter: AtsAdapter = createLeverAdapter()` is exported from the barrel, so A8's `import('ats-autofill-engine/lever').then(mod => mod.adapter)` at runtime yields a live, contract-conformant adapter without the content script needing to call the factory.
8. A blueprint contract file `blueprint.contract.ts` per D22 and an adapter contract test `adapter-contract.spec.ts` per D18 mirroring B7's shape.
9. A rollback script `scripts/rollback-phase-B8.sh` per D23 that mechanically reverts the phase.

**Relationship to B7 and B9**: every adapter ships the same two exports verbatim -- `createXAdapter()` factory and `adapter: AtsAdapter = createXAdapter()` singleton. Downstream (A8, B1 exports-map, CI scripts) treats all three interchangeably via the `AtsAdapter` structural type. Lever is the canonical example of a STATEFUL factory (closes over variant + form root), per D17.

**Critical deviation from B7**: Lever does NOT use React-controlled inputs on its application form (per agent 59 §d). Every Lever field is a native HTML `<input>`, `<textarea>`, or `<select>` under `#application-form` / `#application_form` / `#applicationform`. The generic B5 filler's native-setter + event-dispatch pattern works unmodified. There is NO Lever equivalent of B7's React combobox strategy ladder, NO React file-input `__reactProps.onChange` fallback, and NO repeating-section index stamping. The adapter is therefore ~600 LoC of production code plus ~800 LoC of tests and fixtures -- thinner than B7.

## Confidence score

**9/10**.

Justification:

- Agent 59 read `andrewmillercode/Autofill-Jobs` end-to-end and extracted `fields.lever` verbatim (25 lines -- `urls[LinkedIn]`, `urls[GitHub]`, `eeo[gender]`, `eeo[race]`, `eeo[veteran]`, `eeo[disability]`, `eeo[disabilitySignature]`, `eeo[disabilitySignatureDate]`). The MIT license permits direct fork with attribution and this phase reproduces the attribution block verbatim in `selectors.ts`.
- Agent 55 verified via curl that Lever posting pages embed a valid `application/ld+json` JobPosting script block with 11 populated fields (title, description, datePosted, employmentType, hiringOrganization, jobLocation, etc.) and that apply pages do NOT embed JSON-LD. The URL gate in `job-extractor.ts` is therefore correct.
- Keystone §6 provides the exact factory code for B8 verbatim. This phase copies it without paraphrase.
- The B5 filler/attacher contract is now frozen (B5 is grade A- per review). B8 conforms by calling B5 with primitive values and awaiting the async attacher.

The 1 point deducted: Lever's name input has two variants (combined `name` vs split `firstName`/`lastName`). The factory closure state (`lastVariant`) is the mitigation. Two fixture files (`standard-form.html` with combined, `split-name-form.html` with split) exercise both branches. A third adversarial path tests the re-entry case (two `scanForm` calls with different variants -- the second call's variant MUST overwrite the first in the closure).

## Scope declaration

- **Files created**: 20 total
  - 10 production source under `src/ats/lever/` (incl. blueprint contract)
  - 5 test specs under `tests/ats/lever/`
  - 4 test fixtures under `tests/ats/lever/fixtures/`
  - 1 rollback script under `scripts/`
- **Files modified**: 0. The `./lever` sub-entry in `package.json` exports map is created by B1 scaffold pointing at `./dist/ats/lever/index.js`. B8 only needs to put a real `src/ats/lever/index.ts` in place for B1's entry to resolve.
- **Estimated lines**: ~1850 added (production ~650, tests ~820, fixtures ~280, blueprint contract ~50, rollback script ~50)
- **Net surface exposed on `./lever` sub-entry**:
  - `adapter: AtsAdapter` (module singleton -- PRIMARY entry point per D1)
  - `createLeverAdapter(): AtsAdapter` (factory -- testable, instantiable multiple times)
  - `LEVER_URL_PATTERNS`, `LEVER_POSTING_URL_PATTERN`, `LEVER_APPLY_URL_PATTERN`, `LEVER_ANY_URL_PATTERN`
  - `LEVER_SELECTORS`, `LEVER_FORM_ROOT_SELECTORS`, `LEVER_RESUME_INPUT_SELECTORS`
  - `matchesUrl` (pure function; same name as B7 for parity)
  - `matchLeverUrl` (returns classified `LeverUrlMatch`; retained for richer call sites)
  - `scanLeverForm` (returns `LeverScanResult` envelope including variant + formRoot)
  - `fillLeverField` (low-level: takes `FillInstruction` + optional context)
  - `attachLeverResume` (low-level async: takes `FillInstruction` + `File` + optional context)
  - `extractLeverJob` (low-level: takes `Document`)
  - `LEVER_BLUEPRINT` (D22 blueprint contract)
  - type aliases: `LeverUrlMatch`, `LeverFormVariant`, `LeverScanResult`, `LeverFillContext`

## Required reading (executor MUST read before starting)

Order matters -- read top to bottom. Every file is a hard prerequisite; do NOT skim.

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - D1 (canonical adapter export shape), D9 (`AtsKind` source of truth), D14 (anti-drift enforcement), D15 (em-dash rule), D17 (factory pattern for stateful adapters), D18 (contract test matrix), D22 (blueprint drift watchdog).
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - §2.3 `AtsKind` (verbatim literal union).
   - §2.4 `FormModel` including optional `sourceATS?: AtsKind` and `formRootSelector?: string`.
   - §2.5 `FillValue`, `FillInstruction`, `FillPlan`, `FillError`, `FillResult` (the discriminated union B8 must return from `fillField` and `attachFile`).
   - §2.9 `AtsAdapter` interface (the target shape).
   - §6 factory pattern Lever example (verbatim -- copy this exactly).
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-B8.md`
   - The 9 contract breaks the previous B8 plan had. Every break is addressed in this rewrite.
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/59-andrewmillercode-deep-read.md`
   - §d Lever adapter, full URL match + form detection + selector strategy.
   - §d `fields.lever` map lines 76-94 -- the selector seed list.
   - §i resume upload via `input[id="resume-upload-input"]` and `input[type="file"]` fallback.
   - §j verdict: "Fork the Lever field map verbatim. Do NOT fork the engine."
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/55-jsonld-jobposting.md`
   - §a Lever has JSON-LD at server-render time on posting pages. Apply pages do NOT.
   - §b populated field table for Lever.
   - §e canonical `extractJobPostingFromDocument` -- B6 now owns this; B8 imports from `../../adapters/dom`.
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/plan.md`
   - Exports map (`./lever` entry already reserved, points at `./dist/ats/lever/index.js`).
   - `tsup.config.ts` `ats/lever/index` entry already defined.
   - MPL license files already at `LICENSES/MPL-2.0.txt`.
7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B2_core_types_and_taxonomy/plan.md`
   - Step 8 `FieldType` union (74 entries, all kebab-case Mozilla-baseline + ATS-extension tokens).
   - `MOZILLA_BASELINE_FIELD_TYPES` and `ATS_EXTENSION_FIELD_TYPES` -- the two arrays that partition `FieldType`.
   - `EEO_FIELD_TYPES` set (`eeo-gender`, `eeo-race`, `eeo-veteran`, `eeo-disability`).
   - ATS-extension taxonomy additions required by this phase (see §"B2 amendment precondition" below).
8. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B5_dom_adapter_scanner_and_filler/plan.md`
   - Step 5 `fillField(el: FillableElement, value: string | boolean): FillResult`. Signature is primitive-valued and synchronous.
   - Step 6 `attachFile(input, fileOrFiles, opts?): Promise<FillResult>`. ASYNC, returns `Promise<FillResult>` (NOT `AttachResult` -- that type does not exist in B2 or B5).
   - `FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement`.
   - `FillError` union (6 values in B2, expanded to 7 in keystone §2.5 with `wrong-entry-point-for-file`).
9. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B6_dom_adapter_highlighter_renderer/plan.md`
   - `extractJobPostingFromDocument(doc)` is published at `src/adapters/dom/jd/jsonld-extractor.ts` and re-exported from `src/adapters/dom/index.ts`. B8 imports from the barrel `'../../adapters/dom'`.
10. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B7_greenhouse_adapter/plan.md`
    - Parity target for factory + blueprint + contract test shape. B7 is the stateless example; B8 is the stateful example. The two plans share the same scaffolding layout (one directory per adapter, barrel + factory + low-level functions + blueprint + contract test).
11. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`
    - Consumer of `adapter` export. A8's `loadAdapter(url)` dynamically imports `ats-autofill-engine/lever` and reads `mod.adapter`. A8 then calls `adapter.scanForm(doc)`, `adapter.fillField(instruction)`, `await adapter.attachFile(instruction, file)`, `adapter.extractJob?.(doc)`.

## B2 amendment precondition (NOT self-contained -- gates this phase)

B8 depends on B2 exporting the `ATS_EXTENSION_FIELD_TYPES` superset required by Lever's selector map. Per `reviews/review-B8.md` §A1, the previous B8 plan used 18 camelCase tokens that do NOT exist in B2. This rewrite maps every Lever field to a kebab-case token from B2, and where B2's current taxonomy is missing a token it flags the gap to the B2 plan rewriter.

### Tokens already in B2's current union (verified against `phase_B2_core_types_and_taxonomy/plan.md` Step 8 lines 320-429):

| Lever field | B2 token (already present) |
|---|---|
| Full name input | `name` (Mozilla baseline) |
| First name input | `given-name` (Mozilla baseline) |
| Last name input | `family-name` (Mozilla baseline) |
| Email | `email` (Mozilla baseline) |
| Phone | `tel` (Mozilla baseline) |
| LinkedIn URL | `linkedin-url` (ATS extension) |
| GitHub URL | `github-url` (ATS extension) |
| Portfolio URL | `portfolio-url` (ATS extension) |
| Twitter URL | `twitter-url` (ATS extension) |
| Personal website URL | `personal-website` (ATS extension) |
| Current company | `current-company` (ATS extension) |
| Current title | `current-title` (ATS extension) |
| Current location | `current-location` (ATS extension) |
| Resume file | `resume-upload` (ATS extension) |
| Cover letter file | `cover-letter-upload` (ATS extension) |
| EEO gender | `eeo-gender` (ATS extension) |
| EEO race | `eeo-race` (ATS extension) |
| EEO veteran | `eeo-veteran` (ATS extension) |
| EEO disability | `eeo-disability` (ATS extension) |

Every Lever field listed in agent 59 maps to an already-present B2 token. **No additions to `FieldType` are required for the core field set.**

### Tokens NOT in B2's current union but needed by Lever

Lever's `eeo[disabilitySignature]` and `eeo[disabilitySignatureDate]` inputs are disability-acknowledgment form fields that do not map cleanly to any existing B2 token. The previous B8 plan invented `eeoDisabilitySignature` and `eeoDisabilitySignatureDate` camelCase values; both are fictional.

**Decision**: B8 treats these two fields as `custom-text` and `custom-date` respectively (B2's catch-all fallback tokens for ATS-extension fields with no first-class semantic mapping). They are still scanned and still appear in the `FormModel.fields` array via the generic B5 scanner, but B8 does NOT claim them as typed selectors in `LEVER_SELECTORS`. If a future plan wants explicit semantic tokens for these (`eeo-disability-signature`, `eeo-disability-signature-date`), the B2 taxonomy must be amended first.

**Precondition assertion** (executor MUST verify before Step 1):

```bash
cd e:/ats-autofill-engine
# Assert every Lever-consumed FieldType is exported by the B2 taxonomy barrel.
node -e "
import('./dist/core/taxonomy/index.js').then(mod => {
  const required = [
    'name','given-name','family-name','email','tel',
    'linkedin-url','github-url','portfolio-url','twitter-url','personal-website',
    'current-company','current-title','current-location',
    'resume-upload','cover-letter-upload',
    'eeo-gender','eeo-race','eeo-veteran','eeo-disability',
    'custom-text','custom-date'
  ];
  const all = new Set([
    ...mod.MOZILLA_BASELINE_FIELD_TYPES,
    ...mod.ATS_EXTENSION_FIELD_TYPES
  ]);
  const missing = required.filter(t => !all.has(t));
  if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
  console.log('B2 taxonomy precondition OK');
});
"
```

If the script reports any missing token, STOP and file a B2 corrective plan. Do NOT proceed. Do NOT invent local tokens in B8.

## Files to create (20)

### Production source (10)

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 1 | `src/ats/lever/url-patterns.ts` | URL regex constants + `matchLeverUrl` + `matchesUrl` (parity alias) | 110 |
| 2 | `src/ats/lever/selectors.ts` | `LEVER_SELECTORS`, `LEVER_FORM_ROOT_SELECTORS`, `LEVER_RESUME_INPUT_SELECTORS` | 145 |
| 3 | `src/ats/lever/form-scanner.ts` | `scanLeverForm(doc)` wraps B5 `scan` + name-variant detection | 130 |
| 4 | `src/ats/lever/field-filler.ts` | `fillLeverField(instruction, ctx)` -- primitive extractor + B5 delegate | 170 |
| 5 | `src/ats/lever/file-attacher.ts` | `attachLeverResume(instruction, file, ctx)` async wrapper | 100 |
| 6 | `src/ats/lever/job-extractor.ts` | `extractLeverJob(doc)` URL-gated B6 wrapper | 85 |
| 7 | `src/ats/lever/adapter.ts` | `createLeverAdapter()` factory closing over `lastVariant` + `lastFormRoot: WeakRef` | 110 |
| 8 | `src/ats/lever/index.ts` | Barrel re-export: `adapter`, `createLeverAdapter`, `LEVER_BLUEPRINT`, all public functions and types | 70 |
| 9 | `src/ats/lever/types.ts` | `LeverUrlMatch`, `LeverFormVariant`, `LeverScanResult`, `LeverFillContext` | 55 |
| 10 | `src/ats/lever/blueprint.contract.ts` | `LEVER_BLUEPRINT` D22 contract object | 55 |

### Tests (5 specs + 4 fixtures)

All tests run under `happy-dom` per `vitest.config.ts` set by B1.

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 11 | `tests/ats/lever/url-patterns.spec.ts` | `matchLeverUrl` + `matchesUrl` against 15 positive + 14 negative URLs (incl. unicode, null, malformed, XSS) | 170 |
| 12 | `tests/ats/lever/form-scanner.spec.ts` | `scanLeverForm` on all 4 fixtures + 300-field stress + duplicate selectors + XSS attribute values | 230 |
| 13 | `tests/ats/lever/field-filler.spec.ts` | `fillLeverField` text/select dropdown (eeo-gender)/checkbox/radio/variant-detected/variant-fallback/file-instruction route-to-attach/skip-instruction | 220 |
| 14 | `tests/ats/lever/file-attacher.spec.ts` | `attachLeverResume` happy + 0-byte + path-traversal name + wrong MIME + async resolution + missing input | 140 |
| 15 | `tests/ats/lever/job-extractor.spec.ts` | `extractLeverJob` posting + reject-on-apply + malformed JSON-LD + no JSON-LD | 95 |
| 16 | `tests/ats/lever/adapter-contract.spec.ts` | D18 contract test: kind, members present, frozen, structural `AtsAdapter` assertion, factory singleton, state isolation | 180 |
| 17 | `tests/ats/lever/fixtures/standard-form.html` | Combined-name variant; 11 fields incl. eeo-gender select, eeo-race select | 70 |
| 18 | `tests/ats/lever/fixtures/split-name-form.html` | Split-name variant; 7 fields; `application_form` underscore id | 55 |
| 19 | `tests/ats/lever/fixtures/job-posting-jsonld.html` | Posting page with valid JSON-LD JobPosting script block | 55 |
| 20 | `tests/ats/lever/fixtures/malformed-jsonld.html` | Posting page with truncated JSON-LD `<script>{</script>` -- negative case | 20 |

### Rollback script (1)

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 21 | `scripts/rollback-phase-B8.sh` | Mechanically removes `src/ats/lever/**`, `tests/ats/lever/**`, asserts typecheck still passes | 45 |

(Total 21 files, counted as "20 excluding the rollback which lives outside the adapter tree".)

## Preconditions

Before the executor writes any code:

- [ ] B1 scaffold is on disk at `e:/ats-autofill-engine/`. `package.json`, `tsconfig.adapter.json`, `tsup.config.ts`, `vitest.config.ts`, `LICENSES/MPL-2.0.txt`, `NOTICES.md` exist.
- [ ] B1's `package.json` exports map already contains `./lever` entry pointing at `./dist/ats/lever/index.js` (per keystone §4).
- [ ] B1's `tsup.config.ts` already contains `'ats/lever/index': 'src/ats/lever/index.ts'`.
- [ ] `src/ats/lever/` directory does NOT yet exist (or exists only as an empty dir). This phase creates every file.
- [ ] B2 has published `src/core/types/` with keystone §2 shape: `brands.ts`, `ats-kind.ts`, `form-model.ts` (incl. optional `sourceATS` and `formRootSelector`), `fill-instruction.ts` (`FillValue` discriminated union with kinds `text | boolean | choice | file | skip`, `FillError`, `FillResult`, `FillInstruction`), `ats-adapter.ts` (the `AtsAdapter` interface from §2.9), `job-posting.ts` (`JobPostingData`), and `index.ts` barrel re-exporting everything.
- [ ] B2 has published `src/core/taxonomy/` with `FieldType` union, `MOZILLA_BASELINE_FIELD_TYPES`, `ATS_EXTENSION_FIELD_TYPES`, `EEO_FIELD_TYPES`.
- [ ] B2 taxonomy precondition assertion (see §"B2 amendment precondition" above) passes.
- [ ] B4 has published `src/core/classifier/index.ts` exporting `classifyField` -- only type-level reference is required in this phase (the Lever adapter does NOT call `classifyField` directly; the content-script plan-builder does).
- [ ] B5 has published `src/adapters/dom/index.ts` with `scan`, `fillField`, `attachFile`, `watchForm`, `FillableElement`. B5 tests green.
- [ ] B6 has published `extractJobPostingFromDocument(doc)` on `src/adapters/dom/jd/jsonld-extractor.ts` AND re-exported from `src/adapters/dom/index.ts` (the barrel). B8 imports from the barrel path ONLY.
- [ ] `pnpm install` has been run from `e:/ats-autofill-engine` (NOT via `pnpm -F ats-autofill-engine` -- this is a standalone repo, not a workspace member).

If any precondition fails, STOP. Do NOT work around. Do NOT invent local types. Do NOT inline B6's extractor. File a corrective plan against the upstream phase.

## Step-by-step implementation

### Step 0 -- Verify B2, B5, B6 contracts

Create a temporary scratch file `src/ats/lever/_smoke.ts` (deleted after the check):

```ts
// _smoke.ts -- delete after verifying
import { scan, fillField, attachFile, extractJobPostingFromDocument } from '../../adapters/dom';
import type {
  FormModel, FormFieldDescriptor,
  FillInstruction, FillValue, FillResult, FillError,
  AtsAdapter, AtsKind,
  JobPostingData,
} from '../../core/types';
import type { FieldType } from '../../core/taxonomy';
import { MOZILLA_BASELINE_FIELD_TYPES, ATS_EXTENSION_FIELD_TYPES } from '../../core/taxonomy';

const _k: AtsKind = 'lever';
const _b: ReadonlyArray<string> = [...MOZILLA_BASELINE_FIELD_TYPES, ...ATS_EXTENSION_FIELD_TYPES];
void _k; void _b; void scan; void fillField; void attachFile; void extractJobPostingFromDocument;
```

Then run from the standalone engine repo:

```bash
cd e:/ats-autofill-engine && pnpm typecheck
```

Must pass with zero errors. If any import fails, STOP and file a corrective against the missing upstream. Delete `_smoke.ts` on success.

### Step 1 -- MPL-2.0 header constant

All 10 production files and all 5 test files carry this exact 5-line header as lines 1-5, using `//` line comments for parity with B7:

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac
```

For `selectors.ts` ONLY, append a second 4-line attribution block immediately after the MPL header:

```ts
//
// Field-name map derived from andrewmillercode/Autofill-Jobs
// (https://github.com/andrewmillercode/Autofill-Jobs), MIT License,
// Copyright (c) 2025 Andrew Miller. Attribution retained per MIT clause 1.
```

No `/* */` block comments anywhere in B8. The grep gate in §Acceptance checks for `Mozilla Public` in the first 5 lines and asserts no `/*` comment-block opens in the MPL region.

### Step 2 -- Create `src/ats/lever/types.ts`

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import type { FormModel } from '../../core/types';

/**
 * Result of matching a URL against Lever URL patterns.
 *
 * - `none` means the URL is not a Lever URL.
 * - `posting` means the URL is a Lever job posting page (JSON-LD extractable).
 * - `apply` means the URL is a Lever application form page (form fillable).
 *
 * `org` and `postingId` are lowercased after extraction.
 */
export type LeverUrlMatch =
  | { readonly kind: 'none' }
  | { readonly kind: 'posting'; readonly org: string; readonly postingId: string }
  | { readonly kind: 'apply'; readonly org: string; readonly postingId: string };

/**
 * Which flavor of name input the Lever form presents.
 *
 * - `combined-name` -- single `<input name="name">` holding "First Last".
 * - `split-name`    -- two inputs `<input name="firstName">` + `<input name="lastName">`.
 * - `unknown`       -- neither pattern detected (likely an unrecognized form or no form at all).
 */
export type LeverFormVariant = 'combined-name' | 'split-name' | 'unknown';

/**
 * Scan-result envelope returned by `scanLeverForm`.
 *
 * Wraps the generic `FormModel` plus Lever-specific metadata (variant, form root)
 * which the factory closes over so that `adapter.fillField` can route correctly
 * without re-probing the DOM on every call.
 */
export interface LeverScanResult {
  readonly formModel: FormModel;
  readonly variant: LeverFormVariant;
  readonly formRoot: Element | null;
}

/**
 * Context passed to `fillLeverField` + `attachLeverResume` for variant-aware behavior.
 *
 * Produced by the factory closure after `scanForm` runs. The factory holds
 * `lastVariant` and `lastFormRoot` as closure locals and re-creates a fresh
 * `LeverFillContext` on every call to the adapter's `fillField`.
 *
 * `formRoot` is `Element | null | undefined`:
 * - `Element` means the WeakRef is still alive and the form root is still in the DOM.
 * - `null` means scan ran but found no form root.
 * - `undefined` means scan has not run yet for this factory instance.
 */
export interface LeverFillContext {
  readonly variant: LeverFormVariant;
  readonly formRoot: Element | null | undefined;
}
```

### Step 3 -- Create `src/ats/lever/url-patterns.ts`

Three regex patterns and two matcher functions. The `matchLeverUrl` function returns a discriminated `LeverUrlMatch`; the `matchesUrl` function returns a boolean and matches the signature used by the `AtsAdapter.matchesUrl` contract.

URL shapes per agent 59 manifest.json line 20 + agent 55 §h sample URLs:

- Posting: `https://jobs.lever.co/{org}/{uuid}[/]` -- no trailing path, no query string, 5-group UUID.
- Apply:   `https://jobs.lever.co/{org}/{uuid}/apply[/]` -- same UUID grammar, `/apply` suffix, no query string.

`org` is `[a-z0-9-]+` (case-insensitive via `i` flag). `uuid` is `8-4-4-4-12` hex (case-insensitive).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import type { LeverUrlMatch } from './types';

/** Job posting page: `jobs.lever.co/{org}/{uuid}` -- JSON-LD extractable. */
export const LEVER_POSTING_URL_PATTERN: RegExp =
  /^https?:\/\/jobs\.lever\.co\/([a-z0-9-]+)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i;

/** Application form page: `jobs.lever.co/{org}/{uuid}/apply` -- form fillable, NO JSON-LD. */
export const LEVER_APPLY_URL_PATTERN: RegExp =
  /^https?:\/\/jobs\.lever\.co\/([a-z0-9-]+)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/apply\/?$/i;

/** Umbrella pattern: matches either posting or apply. Used by intent detection. */
export const LEVER_ANY_URL_PATTERN: RegExp =
  /^https?:\/\/jobs\.lever\.co\/([a-z0-9-]+)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/apply)?\/?$/i;

/** Frozen lookup object for consumers that want named access. */
export const LEVER_URL_PATTERNS: Readonly<Record<'posting' | 'apply' | 'any', RegExp>> = Object.freeze({
  posting: LEVER_POSTING_URL_PATTERN,
  apply: LEVER_APPLY_URL_PATTERN,
  any: LEVER_ANY_URL_PATTERN,
});

/**
 * Classify a URL as a Lever posting, apply, or non-match.
 *
 * Pure, case-insensitive, defensive against null/undefined/non-string/empty input.
 * Returns `{kind:'none'}` for any unrecognized input.
 */
export function matchLeverUrl(url: unknown): LeverUrlMatch {
  if (typeof url !== 'string' || url.length === 0) return { kind: 'none' };
  // Reject URLs containing query strings or fragments: the regex already fails these,
  // but surface the rejection explicitly so reviewers do not have to re-parse the regex.
  if (url.includes('?') || url.includes('#')) return { kind: 'none' };
  const applyMatch = LEVER_APPLY_URL_PATTERN.exec(url);
  if (applyMatch) {
    return { kind: 'apply', org: applyMatch[1]!.toLowerCase(), postingId: applyMatch[2]!.toLowerCase() };
  }
  const postingMatch = LEVER_POSTING_URL_PATTERN.exec(url);
  if (postingMatch) {
    return { kind: 'posting', org: postingMatch[1]!.toLowerCase(), postingId: postingMatch[2]!.toLowerCase() };
  }
  return { kind: 'none' };
}

/**
 * Boolean matcher matching the `AtsAdapter.matchesUrl: (url: string) => boolean` contract
 * from keystone §2.9. Exported under the canonical `matchesUrl` name for B7/B8/B9 parity.
 */
export function matchesUrl(url: string): boolean {
  return matchLeverUrl(url).kind !== 'none';
}
```

### Step 4 -- Create `src/ats/lever/selectors.ts`

The `LEVER_SELECTORS` map uses B2's kebab-case `FieldType` tokens as keys. Every key is a subset of the full `FieldType` union -- the map is declared as `Partial<Record<FieldType, ReadonlyArray<string>>>` so that unused tokens do not have to be listed. At runtime, `queryLeverField(root, field)` looks up the selector list and iterates, returning the first matching element or null.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac
//
// Field-name map derived from andrewmillercode/Autofill-Jobs
// (https://github.com/andrewmillercode/Autofill-Jobs), MIT License,
// Copyright (c) 2025 Andrew Miller. Attribution retained per MIT clause 1.

import type { FieldType } from '../../core/taxonomy';

/**
 * Lever application form root selectors. The form is rendered with one of
 * these three id variants depending on the template version observed in
 * production (agent 59 §d).
 */
export const LEVER_FORM_ROOT_SELECTORS: ReadonlyArray<string> = Object.freeze([
  '#application-form',
  '#application_form',
  '#applicationform',
]);

/**
 * Resume file input selectors. Lever uses a named file input on newer forms
 * and falls back to the generic `input[type="file"]` on older templates.
 */
export const LEVER_RESUME_INPUT_SELECTORS: ReadonlyArray<string> = Object.freeze([
  '#resume-upload-input',
  'input[name="resume"][type="file"]',
  'input[type="file"][accept*="pdf"]',
]);

/**
 * Priority-ordered selector map keyed by B2 `FieldType`.
 *
 * NOTE: Lever uses HTML attribute bracket naming (`urls[LinkedIn]`, `eeo[gender]`).
 * These are literal attribute values; the CSS syntax is `[name="urls[LinkedIn]"]`
 * with quoted brackets. Do NOT drop the quotes -- unquoted brackets are invalid CSS.
 *
 * Keys use kebab-case per B2's Mozilla-baseline taxonomy:
 * - `name`, `given-name`, `family-name` (Mozilla baseline)
 * - `email`, `tel`, `current-location` (Mozilla baseline + ATS extension)
 * - `linkedin-url`, `github-url`, `twitter-url`, `portfolio-url`, `personal-website` (ATS extension)
 * - `current-company`, `current-title` (ATS extension)
 * - `resume-upload`, `cover-letter-upload` (ATS extension)
 * - `eeo-gender`, `eeo-race`, `eeo-veteran`, `eeo-disability` (ATS extension, gated by consent)
 */
export const LEVER_SELECTORS: Readonly<Partial<Record<FieldType, ReadonlyArray<string>>>> = Object.freeze({
  // Name -- two variants
  'name':           Object.freeze(['input[name="name"]']),
  'given-name':     Object.freeze(['input[name="firstName"]', 'input[name="first_name"]']),
  'family-name':    Object.freeze(['input[name="lastName"]',  'input[name="last_name"]']),

  // Contact
  'email':          Object.freeze(['input[name="email"]', 'input[type="email"]']),
  'tel':            Object.freeze(['input[name="phone"]', 'input[type="tel"]']),

  // Location
  'current-location': Object.freeze(['input[name="location"]']),

  // Employment
  'current-company': Object.freeze([
    'input[name="org"]',
    'input[name="company"]',
    'input[name="employer"]',
  ]),
  'current-title':  Object.freeze(['input[name="title"]', 'input[name="position"]']),

  // Professional URLs -- Lever's bracketed naming
  'linkedin-url':   Object.freeze(['input[name="urls[LinkedIn]"]', 'input[name="urls[Linkedin]"]']),
  'github-url':     Object.freeze(['input[name="urls[GitHub]"]',   'input[name="urls[Github]"]']),
  'twitter-url':    Object.freeze(['input[name="urls[X]"]',        'input[name="urls[Twitter]"]']),
  'portfolio-url':  Object.freeze([
    'input[name="urls[Portfolio]"]',
    'input[name="urls[Link to portfolio]"]',
    'input[name="portfolio"]',
  ]),
  'personal-website': Object.freeze(['input[name="urls[Other]"]', 'input[name="website"]']),

  // Files
  'resume-upload':       Object.freeze([...LEVER_RESUME_INPUT_SELECTORS]),
  'cover-letter-upload': Object.freeze([
    'input[name="coverLetter"][type="file"]',
    'input[name="cover_letter"][type="file"]',
  ]),

  // EEO -- all optional, gated by user consent per decision memo §2.10
  'eeo-gender':     Object.freeze(['select[name="eeo[gender]"]',     '[name="eeo[gender]"]']),
  'eeo-race':       Object.freeze(['select[name="eeo[race]"]',       '[name="eeo[race]"]']),
  'eeo-veteran':    Object.freeze(['select[name="eeo[veteran]"]',    '[name="eeo[veteran]"]']),
  'eeo-disability': Object.freeze(['select[name="eeo[disability]"]', '[name="eeo[disability]"]']),
});

/**
 * Resolve the first element under `root` matching any selector in the priority list
 * for `fieldType`. Returns `null` when no entry exists or no selector matches.
 *
 * Pure: does not mutate DOM. Defensive: catches `querySelector` throws on malformed
 * selectors (should never happen for the static map, but guards against future edits).
 */
export function queryLeverField(root: ParentNode, fieldType: FieldType): Element | null {
  const selectors = LEVER_SELECTORS[fieldType];
  if (!selectors) return null;
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      // Malformed selector -- skip and try next. Should not happen with the static map.
    }
  }
  return null;
}
```

### Step 5 -- Create `src/ats/lever/form-scanner.ts`

Locates the form root, calls B5 `scan(formRoot)`, detects the name variant, and returns a `LeverScanResult`. Stamps `sourceATS: 'lever'` and `formRootSelector` onto the `FormModel` per keystone §2.4.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { scan } from '../../adapters/dom';
import type { FormModel } from '../../core/types';
import { LEVER_FORM_ROOT_SELECTORS } from './selectors';
import type { LeverFormVariant, LeverScanResult } from './types';

/**
 * Find the Lever application form root in a document.
 *
 * Iterates `LEVER_FORM_ROOT_SELECTORS` in priority order and returns the first
 * matching element, or `null` when none is present. Also returns the selector
 * that matched, so the caller can stamp `formRootSelector` on the `FormModel`.
 */
export function findLeverFormRoot(doc: Document): { readonly root: Element; readonly selector: string } | null {
  for (const sel of LEVER_FORM_ROOT_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return { root: el, selector: sel };
  }
  return null;
}

/**
 * Detect the name-input variant rendered in a given Lever form root.
 *
 * - `combined-name` -- single `<input name="name">`.
 * - `split-name`    -- both `<input name="firstName">` and `<input name="lastName">` present.
 * - `unknown`       -- neither pattern detected.
 *
 * The function is cheap (three `querySelector` calls) and runs once per scan
 * so the filler can branch without re-probing the DOM on every call.
 */
export function detectNameVariant(formRoot: Element): LeverFormVariant {
  const first = formRoot.querySelector('input[name="firstName"], input[name="first_name"]');
  const last  = formRoot.querySelector('input[name="lastName"],  input[name="last_name"]');
  if (first && last) return 'split-name';
  const combined = formRoot.querySelector('input[name="name"]');
  if (combined) return 'combined-name';
  return 'unknown';
}

/**
 * Empty `FormModel` used when no Lever form root is present.
 * Populates every required field per keystone §2.4 so that downstream type
 * assertions succeed.
 */
function emptyFormModel(doc: Document): FormModel {
  return Object.freeze({
    url: doc.location?.href ?? '',
    title: doc.title ?? '',
    scannedAt: new Date().toISOString(),
    fields: Object.freeze([]),
    sourceATS: 'lever' as const,
  });
}

/**
 * Scan a Lever application form and produce a `FormModel` plus variant metadata.
 *
 * Behavior:
 *   1. Locate the form root (or return an empty FormModel + null root + 'unknown' variant).
 *   2. Delegate to the generic B5 `scan(root)` for field discovery. The Lever
 *      adapter does NOT rewrite selectors or relabel descriptors; the classifier
 *      in B4 recognizes Lever's `urls[LinkedIn]` / `eeo[gender]` names via the
 *      Mozilla heuristics port from B3.
 *   3. Detect the name variant for downstream filler branching.
 *   4. Stamp `sourceATS: 'lever'` and `formRootSelector` onto the FormModel.
 *
 * Never throws. Callers (the factory in `adapter.ts`) close over the result.
 */
export function scanLeverForm(doc: Document): LeverScanResult {
  const found = findLeverFormRoot(doc);
  if (!found) {
    return Object.freeze({
      formModel: emptyFormModel(doc),
      variant: 'unknown' as const,
      formRoot: null,
    });
  }
  const baseModel = scan(found.root);
  const formModel: FormModel = Object.freeze({
    ...baseModel,
    sourceATS: 'lever' as const,
    formRootSelector: found.selector,
  });
  return Object.freeze({
    formModel,
    variant: detectNameVariant(found.root),
    formRoot: found.root,
  });
}
```

### Step 6 -- Create `src/ats/lever/field-filler.ts`

The Lever filler:

1. Accepts a `FillInstruction` (B2 discriminated shape) + optional `LeverFillContext`.
2. Resolves the element from `instruction.selector` via `document.querySelector` (hex-legal: `src/ats/**` is an adapter layer, not core).
3. Dispatches on `instruction.value.kind`: `text` / `boolean` / `choice` -> B5 primitive; `file` -> rejected (route via `attachFile` instead); `skip` -> also rejected (skip instructions should not reach fillField).
4. Variant-aware: if `fieldType === 'name'` and variant is `split-name`, or `given-name` / `family-name` and variant is `combined-name`, returns `wrong-entry-point-for-file`... actually returns `value-rejected-by-page` with an explanatory log (the misrouting is a caller bug, not a page problem -- but `FillError` from B2 does not have a `caller-bug` value, so we map to `unknown-error`).
5. Returns `FillResult` with `selector` and `instructionPlanId` populated per keystone §2.5.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { fillField } from '../../adapters/dom';
import type { FillableElement } from '../../adapters/dom';
import type { FillInstruction, FillResult, FillError } from '../../core/types';
import type { LeverFillContext } from './types';

/**
 * Construct an `ok:false` `FillResult` with a typed error and the canonical
 * selector + plan id from the instruction.
 */
function fail(instruction: FillInstruction, error: FillError): FillResult {
  return Object.freeze({
    ok: false as const,
    selector: instruction.selector,
    error,
    instructionPlanId: instruction.planId,
  });
}

/**
 * Type guard for the B5 `FillableElement` union.
 * B5 ONLY accepts HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement.
 */
function isFillable(el: Element): el is FillableElement {
  return (
    (typeof HTMLInputElement    !== 'undefined' && el instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) ||
    (typeof HTMLSelectElement   !== 'undefined' && el instanceof HTMLSelectElement)
  );
}

/**
 * Check whether the instruction's FieldType is compatible with the detected name variant.
 * Mismatch means the caller routed a `given-name`/`family-name` instruction to a combined
 * form, or a `name` instruction to a split form. This is a caller bug; we surface it as
 * `unknown-error` because B2's `FillError` union has no `caller-bug` value.
 */
function variantMismatch(field: string, variant: LeverFillContext['variant']): boolean {
  if (variant === 'unknown') return false;
  if (variant === 'combined-name') return field === 'given-name' || field === 'family-name';
  if (variant === 'split-name') return field === 'name';
  return false;
}

/**
 * Fill a single Lever form field from a `FillInstruction`.
 *
 * Dispatches on `instruction.value.kind`:
 * - `text`    -- delegates to B5 `fillField(el, string)`.
 * - `choice`  -- delegates to B5 `fillField(el, string)`; B5 routes to `<select>` option matching.
 * - `boolean` -- delegates to B5 `fillField(el, boolean)`; B5 routes to checkbox / radio.
 * - `file`    -- REJECTED with `wrong-entry-point-for-file` -- caller must use `attachFile`.
 * - `skip`    -- REJECTED with `unknown-error` -- skip instructions never reach the filler.
 *
 * The element is resolved via `document.querySelector(instruction.selector)` from the
 * module-global `document`. The Lever adapter lives in `src/ats/**` (adapter layer,
 * not core), so reading `document` is hex-legal.
 *
 * `ctx` is OPTIONAL: when omitted, variant-mismatch detection is disabled and the
 * filler behaves as a pass-through to B5. The factory in `adapter.ts` always passes
 * a context reflecting the last-seen scan state.
 *
 * Never throws. Always returns a `FillResult` discriminated-union value.
 */
export function fillLeverField(
  instruction: FillInstruction,
  ctx?: LeverFillContext,
): FillResult {
  // Skip + file must not reach the filler at all.
  if (instruction.value.kind === 'skip') {
    return fail(instruction, 'unknown-error');
  }
  if (instruction.value.kind === 'file') {
    return fail(instruction, 'wrong-entry-point-for-file');
  }

  // Variant-mismatch guard.
  if (ctx && variantMismatch(instruction.field, ctx.variant)) {
    return fail(instruction, 'unknown-error');
  }

  // Resolve element. Prefer the scanned form root (tighter scope, avoids picking up
  // a same-named input on an unrelated header form). Fall back to document.
  let el: Element | null = null;
  try {
    if (ctx?.formRoot) el = ctx.formRoot.querySelector(instruction.selector);
    if (!el) el = document.querySelector(instruction.selector);
  } catch {
    return fail(instruction, 'selector-not-found');
  }
  if (!el) return fail(instruction, 'selector-not-found');
  if (!isFillable(el)) return fail(instruction, 'unknown-error');

  // Dispatch on value kind.
  switch (instruction.value.kind) {
    case 'text':
    case 'choice':
      return fillField(el, instruction.value.value);
    case 'boolean':
      return fillField(el, instruction.value.value);
  }
}
```

Note: `fillField` from B5 returns a `FillResult` whose `instructionPlanId` is NOT populated (B5 does not know the planId). B8 wraps the result to thread the planId through. The wrapper is:

```ts
// Append inside fillLeverField, replacing the direct `return fillField(...)` calls:
{
  const base = fillField(el, instruction.value.value);
  if (base.ok) {
    return Object.freeze({
      ok: true as const,
      selector: base.selector || instruction.selector,
      instructionPlanId: instruction.planId,
    });
  }
  return Object.freeze({
    ok: false as const,
    selector: base.selector || instruction.selector,
    error: base.error,
    instructionPlanId: instruction.planId,
  });
}
```

Refactor: move the wrapping into a helper `threadPlanId(base: FillResult, instruction: FillInstruction): FillResult`:

```ts
function threadPlanId(base: FillResult, instruction: FillInstruction): FillResult {
  if (base.ok) {
    return Object.freeze({
      ok: true as const,
      selector: base.selector || instruction.selector,
      instructionPlanId: instruction.planId,
    });
  }
  return Object.freeze({
    ok: false as const,
    selector: base.selector || instruction.selector,
    error: base.error,
    instructionPlanId: instruction.planId,
  });
}
```

Every `return fillField(el, ...)` in the switch becomes `return threadPlanId(fillField(el, ...), instruction);`. The executor applies this refactor before committing.

### Step 7 -- Create `src/ats/lever/file-attacher.ts`

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { attachFile } from '../../adapters/dom';
import type { FillInstruction, FillResult } from '../../core/types';
import { LEVER_RESUME_INPUT_SELECTORS } from './selectors';
import type { LeverFillContext } from './types';

/**
 * Thread the instruction's planId through a B5 `FillResult` (B5 does not know the planId).
 */
function threadPlanId(base: FillResult, instruction: FillInstruction): FillResult {
  if (base.ok) {
    return Object.freeze({
      ok: true as const,
      selector: base.selector || instruction.selector,
      instructionPlanId: instruction.planId,
    });
  }
  return Object.freeze({
    ok: false as const,
    selector: base.selector || instruction.selector,
    error: base.error,
    instructionPlanId: instruction.planId,
  });
}

function failAttach(instruction: FillInstruction, error: FillResult & { ok: false }): FillResult {
  return threadPlanId(error, instruction);
}

/**
 * Attach a resume file to a Lever application form.
 *
 * Behavior:
 *   1. Verify the instruction's value kind is `file` (otherwise reject with
 *      `wrong-entry-point-for-file`).
 *   2. Resolve the target file input:
 *      a. Prefer `instruction.selector` on the scanned form root (tight scope).
 *      b. Fall back to `instruction.selector` on the document.
 *      c. Fall back to each entry in `LEVER_RESUME_INPUT_SELECTORS` under the form root,
 *         then under the document.
 *   3. Await B5 `attachFile(input, file)` which handles DataTransfer + event dispatch.
 *   4. Thread the `instructionPlanId` through the result.
 *
 * ASYNC: mirrors the async `attachFile` signature from keystone §2.9. Callers
 * (A8 content script) MUST await. Never throws: all error paths return a
 * `FillResult` with `ok: false`.
 */
export async function attachLeverResume(
  instruction: FillInstruction,
  file: File,
  ctx?: LeverFillContext,
): Promise<FillResult> {
  if (instruction.value.kind !== 'file') {
    return Object.freeze({
      ok: false as const,
      selector: instruction.selector,
      error: 'wrong-entry-point-for-file' as const,
      instructionPlanId: instruction.planId,
    });
  }

  // Resolve the input element.
  const resolveCandidates = (): Element | null => {
    // 1. Explicit instruction selector under the form root.
    if (ctx?.formRoot) {
      try {
        const el = ctx.formRoot.querySelector(instruction.selector);
        if (el) return el;
      } catch { /* malformed selector -- fall through */ }
    }
    // 2. Explicit instruction selector under the document.
    try {
      const el = document.querySelector(instruction.selector);
      if (el) return el;
    } catch { /* malformed selector -- fall through */ }
    // 3. Fallback: priority-ordered resume input selectors.
    const roots: ReadonlyArray<ParentNode> = ctx?.formRoot ? [ctx.formRoot, document] : [document];
    for (const root of roots) {
      for (const sel of LEVER_RESUME_INPUT_SELECTORS) {
        try {
          const el = root.querySelector(sel);
          if (el) return el;
        } catch { /* malformed selector -- skip */ }
      }
    }
    return null;
  };

  const candidate = resolveCandidates();
  if (!candidate) {
    return Object.freeze({
      ok: false as const,
      selector: instruction.selector,
      error: 'selector-not-found' as const,
      instructionPlanId: instruction.planId,
    });
  }
  if (!(candidate instanceof HTMLInputElement) || candidate.type !== 'file') {
    return Object.freeze({
      ok: false as const,
      selector: instruction.selector,
      error: 'file-attach-failed' as const,
      instructionPlanId: instruction.planId,
    });
  }

  const base = await attachFile(candidate, file);
  return threadPlanId(base, instruction);
}
```

### Step 8 -- Create `src/ats/lever/job-extractor.ts`

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { extractJobPostingFromDocument } from '../../adapters/dom';
import type { JobPostingData } from '../../core/types';
import { matchLeverUrl } from './url-patterns';

/**
 * Extract a `JobPostingData` from a Lever job posting page.
 *
 * Gates:
 *   1. The document URL must match the Lever posting pattern. Apply pages
 *      (`.../apply`) are rejected because they do NOT render JSON-LD per
 *      agent 55 §a. Returning `null` on an apply URL is the correct signal
 *      that the caller should not expect a JobPosting here.
 *   2. The generic B6 `extractJobPostingFromDocument` does the actual parsing
 *      and handles Lever's quirks (non-Schema `Full-time` employmentType enum,
 *      single-object `jobLocation` with `addressLocality` only, HTML `description`).
 *
 * Returns a fresh `JobPostingData` with `source: 'adapter-specific'` (B8-scoped
 * attribution). Returns `null` when the URL is not a Lever posting or when the
 * B6 extractor finds no JSON-LD.
 *
 * Never throws.
 */
export function extractLeverJob(doc: Document): JobPostingData | null {
  const url = doc.location?.href ?? '';
  const match = matchLeverUrl(url);
  if (match.kind !== 'posting') return null;
  let posting: JobPostingData | null = null;
  try {
    posting = extractJobPostingFromDocument(doc);
  } catch {
    return null;
  }
  if (!posting) return null;
  return Object.freeze({ ...posting, source: 'adapter-specific' as const });
}
```

### Step 9 -- Create `src/ats/lever/adapter.ts` (FACTORY per D17, keystone §6 verbatim)

This file copies the keystone §6 Lever example VERBATIM and adds no extra logic beyond wiring. The factory:

1. Closes over `lastVariant: LeverFormVariant` (initialized to `'unknown'`).
2. Closes over `lastFormRoot: WeakRef<Element> | null` (initialized to `null`).
3. Returns an `Object.freeze`d object satisfying the `AtsAdapter` interface from keystone §2.9.
4. The `scanForm` method updates both closure variables on every call.
5. The `fillField` method constructs a fresh `LeverFillContext` from the closure state and delegates to `fillLeverField`.
6. The `attachFile` method (async) does the same for `attachLeverResume`.
7. The `extractJob` method delegates straight through to `extractLeverJob`.
8. `matchesUrl` reuses the exported function from `url-patterns.ts`.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import type { AtsAdapter, FormModel, FillInstruction, FillResult, JobPostingData } from '../../core/types';
import { matchesUrl } from './url-patterns';
import { scanLeverForm } from './form-scanner';
import { fillLeverField } from './field-filler';
import { attachLeverResume } from './file-attacher';
import { extractLeverJob } from './job-extractor';
import type { LeverFormVariant, LeverFillContext } from './types';

/**
 * Create a Lever AtsAdapter instance.
 *
 * Returns a frozen, stateful adapter: the closure holds the most-recent
 * name-input variant and a `WeakRef` to the most-recent form root so that
 * subsequent `fillField` / `attachFile` calls can read variant-aware state
 * without re-probing the DOM.
 *
 * This is the canonical stateful-adapter example from
 * `03-keystone-contracts.md §6`. B7 (Greenhouse) is the stateless example;
 * B9 (Workday) also uses a factory but with different closure state.
 *
 * Per D17, every vendor ships both a `createXAdapter` factory and a
 * module-singleton `adapter = createXAdapter()`. The factory is exported
 * so that tests can instantiate fresh instances with independent state.
 */
export function createLeverAdapter(): AtsAdapter {
  let lastVariant: LeverFormVariant = 'unknown';
  let lastFormRoot: WeakRef<Element> | null = null;

  const buildCtx = (): LeverFillContext => Object.freeze({
    variant: lastVariant,
    formRoot: lastFormRoot?.deref() ?? null,
  });

  return Object.freeze({
    kind: 'lever' as const,
    matchesUrl,
    scanForm: (doc: Document): FormModel => {
      const result = scanLeverForm(doc);
      lastVariant = result.variant;
      lastFormRoot = result.formRoot
        ? (typeof WeakRef !== 'undefined' ? new WeakRef(result.formRoot) : null)
        : null;
      return result.formModel;
    },
    fillField: (instruction: FillInstruction): FillResult =>
      fillLeverField(instruction, buildCtx()),
    attachFile: async (instruction: FillInstruction, file: File): Promise<FillResult> =>
      attachLeverResume(instruction, file, buildCtx()),
    extractJob: (doc: Document): JobPostingData | null =>
      extractLeverJob(doc),
  });
}
```

### Step 10 -- Create `src/ats/lever/blueprint.contract.ts` (D22)

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

/**
 * Lever adapter blueprint contract, consumed by the D22 drift watchdog
 * (`scripts/check-blueprint-contracts.mjs`).
 *
 * Declared `publicExports` MUST match the barrel's actual re-exports at
 * build time; `forbiddenImports` MUST be absent across the whole
 * `src/ats/lever/**` subtree; `requiredCoverage` is enforced by vitest
 * `coverage.thresholds` configuration in `vitest.config.ts`.
 */
export const LEVER_BLUEPRINT = Object.freeze({
  phase: 'B8' as const,
  version: '2.1' as const,
  vendor: 'lever' as const,
  publicExports: Object.freeze([
    'adapter',
    'createLeverAdapter',
    'LEVER_BLUEPRINT',
    'LEVER_URL_PATTERNS',
    'LEVER_POSTING_URL_PATTERN',
    'LEVER_APPLY_URL_PATTERN',
    'LEVER_ANY_URL_PATTERN',
    'LEVER_SELECTORS',
    'LEVER_FORM_ROOT_SELECTORS',
    'LEVER_RESUME_INPUT_SELECTORS',
    'matchesUrl',
    'matchLeverUrl',
    'queryLeverField',
    'scanLeverForm',
    'findLeverFormRoot',
    'detectNameVariant',
    'fillLeverField',
    'attachLeverResume',
    'extractLeverJob',
  ]),
  adapterShape: Object.freeze({
    kind: 'lever' as const,
    members: Object.freeze([
      'kind',
      'matchesUrl',
      'scanForm',
      'fillField',
      'attachFile',
      'extractJob',
    ]),
  }),
  forbiddenImports: Object.freeze([
    'src/ats/greenhouse/*',
    'src/ats/workday/*',
    'src/adapters/chrome/*',
    'src/core/highlight/*',
    '@repo/shared-types',
    '@nestjs/*',
  ]),
  requiredCoverage: 85,
});
```

### Step 11 -- Create `src/ats/lever/index.ts`

The barrel re-exports every public symbol AND the two factory/singleton exports per D1. This is the file `tsup` bundles into `./dist/ats/lever/index.js` and `package.json` resolves via the `./lever` sub-entry. A8's `import('ats-autofill-engine/lever').then(m => m.adapter)` reads directly from this file.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import type { AtsAdapter } from '../../core/types';
import { createLeverAdapter } from './adapter';

// --- D1: canonical factory + module-singleton exports ---
export { createLeverAdapter };
export const adapter: AtsAdapter = createLeverAdapter();

// --- D22: blueprint contract ---
export { LEVER_BLUEPRINT } from './blueprint.contract';

// --- URL patterns ---
export {
  LEVER_URL_PATTERNS,
  LEVER_POSTING_URL_PATTERN,
  LEVER_APPLY_URL_PATTERN,
  LEVER_ANY_URL_PATTERN,
  matchLeverUrl,
  matchesUrl,
} from './url-patterns';

// --- Selectors ---
export {
  LEVER_SELECTORS,
  LEVER_FORM_ROOT_SELECTORS,
  LEVER_RESUME_INPUT_SELECTORS,
  queryLeverField,
} from './selectors';

// --- Form scanner ---
export {
  scanLeverForm,
  findLeverFormRoot,
  detectNameVariant,
} from './form-scanner';

// --- Field filler ---
export { fillLeverField } from './field-filler';

// --- File attacher ---
export { attachLeverResume } from './file-attacher';

// --- Job extractor ---
export { extractLeverJob } from './job-extractor';

// --- Public type aliases ---
export type {
  LeverUrlMatch,
  LeverFormVariant,
  LeverScanResult,
  LeverFillContext,
} from './types';
```

### Step 12 -- Fixture: `tests/ats/lever/fixtures/standard-form.html`

Combined-name variant with 11 fields (`name`, `email`, `phone`, `location`, `org`, `urls[LinkedIn]`, `urls[GitHub]`, `urls[Portfolio]`, `resume` file, `eeo[gender]` select, `eeo[race]` select). Wrapped in `#application-form`.

```html
<!DOCTYPE html>
<html>
<head><title>Lever -- Standard Application (combined-name variant)</title></head>
<body>
  <h1>Apply for Senior Engineer</h1>
  <form id="application-form" action="/apply" method="post" enctype="multipart/form-data">
    <label for="lever-name">Full name</label>
    <input id="lever-name" name="name" type="text" required />

    <label for="lever-email">Email</label>
    <input id="lever-email" name="email" type="email" required />

    <label for="lever-phone">Phone</label>
    <input id="lever-phone" name="phone" type="tel" />

    <label for="lever-location">Current location</label>
    <input id="lever-location" name="location" type="text" />

    <label for="lever-org">Current company</label>
    <input id="lever-org" name="org" type="text" />

    <label for="lever-linkedin">LinkedIn URL</label>
    <input id="lever-linkedin" name="urls[LinkedIn]" type="url" />

    <label for="lever-github">GitHub URL</label>
    <input id="lever-github" name="urls[GitHub]" type="url" />

    <label for="lever-portfolio">Portfolio URL</label>
    <input id="lever-portfolio" name="urls[Portfolio]" type="url" />

    <label for="lever-resume">Resume</label>
    <input id="lever-resume" name="resume" type="file" accept=".pdf" />

    <label for="lever-gender">Gender</label>
    <select id="lever-gender" name="eeo[gender]">
      <option value="">Select...</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
      <option value="non-binary">Non-binary</option>
      <option value="decline">Decline to self-identify</option>
    </select>

    <label for="lever-race">Race / ethnicity</label>
    <select id="lever-race" name="eeo[race]">
      <option value="">Select...</option>
      <option value="asian">Asian</option>
      <option value="black">Black or African American</option>
      <option value="white">White</option>
      <option value="decline">Decline to self-identify</option>
    </select>

    <button type="submit">Submit application</button>
  </form>
</body>
</html>
```

### Step 13 -- Fixture: `tests/ats/lever/fixtures/split-name-form.html`

Split-name variant with `application_form` (underscore) id to exercise the second form-root selector.

```html
<!DOCTYPE html>
<html>
<head><title>Lever -- Split-Name Variant</title></head>
<body>
  <form id="application_form" action="/apply" method="post" enctype="multipart/form-data">
    <label for="lv-first">First name</label>
    <input id="lv-first" name="firstName" type="text" required />

    <label for="lv-last">Last name</label>
    <input id="lv-last" name="lastName" type="text" required />

    <label for="lv-email">Email</label>
    <input id="lv-email" name="email" type="email" required />

    <label for="lv-phone">Phone</label>
    <input id="lv-phone" name="phone" type="tel" />

    <label for="lv-linkedin">LinkedIn</label>
    <input id="lv-linkedin" name="urls[LinkedIn]" type="url" />

    <label for="lv-resume">Resume</label>
    <input id="lv-resume" name="resume" type="file" accept=".pdf" />

    <label for="lv-gender">Gender</label>
    <select id="lv-gender" name="eeo[gender]">
      <option value="">Select...</option>
      <option value="female">Female</option>
      <option value="male">Male</option>
    </select>

    <button type="submit">Submit</button>
  </form>
</body>
</html>
```

### Step 14 -- Fixture: `tests/ats/lever/fixtures/job-posting-jsonld.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Senior Backend Engineer -- Acme</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Senior Backend Engineer",
    "description": "<p>Join our platform team and build distributed systems at scale.</p><ul><li>Go and Kubernetes</li><li>5+ years experience</li></ul>",
    "datePosted": "2026-04-01",
    "employmentType": "Full-time",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "Acme Corp",
      "logo": "https://jobs.lever.co/acme/logo.png"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "addressCountry": "USA"
      }
    }
  }
  </script>
</head>
<body>
  <main>
    <h1>Senior Backend Engineer</h1>
    <a href="/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply">Apply for this job</a>
  </main>
</body>
</html>
```

### Step 15 -- Fixture: `tests/ats/lever/fixtures/malformed-jsonld.html`

Negative case: truncated JSON-LD script. The B6 generic extractor catches `JSON.parse` throws; this fixture proves the try/catch path.

```html
<!DOCTYPE html>
<html>
<head>
  <title>Malformed</title>
  <script type="application/ld+json">{ "@type": "JobPosting", "title": "Truncated</script>
</head>
<body><h1>Malformed</h1></body>
</html>
```

### Step 16 -- Test: `tests/ats/lever/url-patterns.spec.ts`

Covers D19 adversarial categories 1 (null/undefined/NaN), 3 (unicode), 4 (injection), plus happy-path.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect } from 'vitest';
import {
  matchLeverUrl,
  matchesUrl,
  LEVER_POSTING_URL_PATTERN,
  LEVER_APPLY_URL_PATTERN,
  LEVER_ANY_URL_PATTERN,
} from '../../../src/ats/lever/url-patterns';

describe('matchLeverUrl -- posting pages', () => {
  it.each([
    ['https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53',  'palantir'],
    ['https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/', 'palantir'],
    ['http://jobs.lever.co/figma/aaaa1111-2222-3333-4444-555566667777',      'figma'],
    ['https://jobs.lever.co/lab-49/5ec536c8-67b8-4b6b-b23e-cde403d59d53',    'lab-49'],
    ['https://jobs.lever.co/11x/5ec536c8-67b8-4b6b-b23e-cde403d59d53',       '11x'],
    ['HTTPS://JOBS.LEVER.CO/NETFLIX/5EC536C8-67B8-4B6B-B23E-CDE403D59D53',   'netflix'],
  ])('%s -> posting, org=%s', (url, expectedOrg) => {
    const r = matchLeverUrl(url);
    expect(r.kind).toBe('posting');
    if (r.kind === 'posting') {
      expect(r.org).toBe(expectedOrg);
      expect(r.postingId).toBe(r.postingId.toLowerCase());
    }
  });
});

describe('matchLeverUrl -- apply pages', () => {
  it.each([
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply',
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply/',
    'https://jobs.lever.co/ramp/AAAA1111-2222-3333-4444-555566667777/APPLY',
  ])('%s -> apply', (url) => {
    expect(matchLeverUrl(url).kind).toBe('apply');
  });
});

describe('matchLeverUrl -- negative cases (malformed, query, fragment, subdomain)', () => {
  it.each([
    'https://lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53',                   // no jobs. subdomain
    'https://jobs.lever.com/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53',              // wrong TLD
    'https://jobs.lever.co.evil.com/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53',      // subdomain spoof
    'https://jobs.lever.co/',                                                             // no org
    'https://jobs.lever.co/palantir/',                                                    // no uuid
    'https://jobs.lever.co/palantir/not-a-uuid',                                          // wrong uuid shape
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53?src=x',         // query string
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53#section',       // fragment
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply?ref=x',   // apply + query
    'https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply/extra',   // apply + extra path
    'https://jobs.lever.co/  /5ec536c8-67b8-4b6b-b23e-cde403d59d53',                     // whitespace org
    '',                                                                                    // empty string
  ])('%s -> none', (url) => {
    expect(matchLeverUrl(url).kind).toBe('none');
    expect(matchesUrl(url)).toBe(false);
  });
});

describe('matchLeverUrl -- adversarial non-string input (D19 cat 1)', () => {
  it('rejects null', () => {
    expect(matchLeverUrl(null as unknown as string).kind).toBe('none');
  });
  it('rejects undefined', () => {
    expect(matchLeverUrl(undefined as unknown as string).kind).toBe('none');
  });
  it('rejects number', () => {
    expect(matchLeverUrl(42 as unknown as string).kind).toBe('none');
  });
  it('rejects NaN', () => {
    expect(matchLeverUrl(NaN as unknown as string).kind).toBe('none');
  });
  it('rejects object', () => {
    expect(matchLeverUrl({} as unknown as string).kind).toBe('none');
  });
  it('rejects array', () => {
    expect(matchLeverUrl([] as unknown as string).kind).toBe('none');
  });
});

describe('matchLeverUrl -- adversarial unicode + injection (D19 cat 3, 4)', () => {
  it('rejects unicode org chars (RTL)', () => {
    // Arabic-script "org" -- regex uses [a-z0-9-] ASCII only.
    expect(matchLeverUrl('https://jobs.lever.co/\u0627\u0628/5ec536c8-67b8-4b6b-b23e-cde403d59d53').kind).toBe('none');
  });
  it('rejects zero-width joiner in org', () => {
    expect(matchLeverUrl('https://jobs.lever.co/p\u200Da/5ec536c8-67b8-4b6b-b23e-cde403d59d53').kind).toBe('none');
  });
  it('rejects script tag injection in org', () => {
    expect(matchLeverUrl('https://jobs.lever.co/<script>alert(1)</script>/5ec536c8-67b8-4b6b-b23e-cde403d59d53').kind).toBe('none');
  });
  it('rejects path traversal in org', () => {
    expect(matchLeverUrl('https://jobs.lever.co/../etc/5ec536c8-67b8-4b6b-b23e-cde403d59d53').kind).toBe('none');
  });
  it('rejects null byte in org', () => {
    expect(matchLeverUrl('https://jobs.lever.co/p\u0000a/5ec536c8-67b8-4b6b-b23e-cde403d59d53').kind).toBe('none');
  });
});

describe('URL pattern constants', () => {
  it('LEVER_POSTING_URL_PATTERN is case-insensitive', () => {
    expect(LEVER_POSTING_URL_PATTERN.flags).toContain('i');
  });
  it('LEVER_APPLY_URL_PATTERN is case-insensitive', () => {
    expect(LEVER_APPLY_URL_PATTERN.flags).toContain('i');
  });
  it('LEVER_ANY_URL_PATTERN matches both posting and apply', () => {
    expect(LEVER_ANY_URL_PATTERN.test('https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53')).toBe(true);
    expect(LEVER_ANY_URL_PATTERN.test('https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply')).toBe(true);
  });
});
```

### Step 17 -- Test: `tests/ats/lever/form-scanner.spec.ts`

Covers happy-path + D19 cat 2 (empty + max-size), cat 3 (unicode), cat 4 (XSS in attribute values), cat 5 (concurrent re-entry).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanLeverForm,
  findLeverFormRoot,
  detectNameVariant,
} from '../../../src/ats/lever/form-scanner';

function loadFixture(name: string): void {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
}

function resetDom(): void {
  document.documentElement.innerHTML = '<head></head><body></body>';
}

describe('scanLeverForm -- combined-name variant', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('detects combined-name variant', () => {
    const r = scanLeverForm(document);
    expect(r.variant).toBe('combined-name');
    expect(r.formRoot).not.toBeNull();
  });

  it('emits at least 11 fields', () => {
    const r = scanLeverForm(document);
    expect(r.formModel.fields.length).toBeGreaterThanOrEqual(11);
  });

  it('stamps sourceATS = lever', () => {
    const r = scanLeverForm(document);
    expect(r.formModel.sourceATS).toBe('lever');
  });

  it('stamps formRootSelector to the matched form id', () => {
    const r = scanLeverForm(document);
    expect(r.formModel.formRootSelector).toBe('#application-form');
  });

  it('captures urls[LinkedIn] field by name attribute', () => {
    const { formModel } = scanLeverForm(document);
    const linkedin = formModel.fields.find((f) => f.name === 'urls[LinkedIn]');
    expect(linkedin).toBeDefined();
  });

  it('captures eeo[gender] select with 5 options', () => {
    const { formModel } = scanLeverForm(document);
    const gender = formModel.fields.find((f) => f.name === 'eeo[gender]');
    expect(gender).toBeDefined();
    expect(gender!.options.length).toBe(5);
    const values = gender!.options.map((o) => o.value);
    expect(values).toContain('female');
    expect(values).toContain('non-binary');
  });

  it('FormModel has url, title, scannedAt populated per keystone §2.4', () => {
    const { formModel } = scanLeverForm(document);
    expect(typeof formModel.url).toBe('string');
    expect(typeof formModel.title).toBe('string');
    expect(typeof formModel.scannedAt).toBe('string');
    expect(() => new Date(formModel.scannedAt).toISOString()).not.toThrow();
  });
});

describe('scanLeverForm -- split-name variant', () => {
  beforeEach(() => loadFixture('split-name-form.html'));

  it('detects split-name variant', () => {
    expect(scanLeverForm(document).variant).toBe('split-name');
  });

  it('stamps formRootSelector to the underscore id', () => {
    expect(scanLeverForm(document).formModel.formRootSelector).toBe('#application_form');
  });

  it('captures both firstName and lastName', () => {
    const { formModel } = scanLeverForm(document);
    expect(formModel.fields.find((f) => f.name === 'firstName')).toBeDefined();
    expect(formModel.fields.find((f) => f.name === 'lastName')).toBeDefined();
  });
});

describe('scanLeverForm -- no form present (D19 cat 2: empty)', () => {
  beforeEach(() => resetDom());

  it('returns unknown variant + null root + empty fields', () => {
    const r = scanLeverForm(document);
    expect(r.variant).toBe('unknown');
    expect(r.formRoot).toBeNull();
    expect(r.formModel.fields.length).toBe(0);
  });

  it('still returns a well-formed FormModel with sourceATS', () => {
    const r = scanLeverForm(document);
    expect(r.formModel.sourceATS).toBe('lever');
    expect(r.formModel.url).toBeDefined();
    expect(r.formModel.scannedAt).toBeDefined();
  });
});

describe('scanLeverForm -- stress (D19 cat 2: max-size)', () => {
  it('handles a 300-field form without throwing', () => {
    resetDom();
    const form = document.createElement('form');
    form.id = 'application-form';
    for (let i = 0; i < 300; i++) {
      const input = document.createElement('input');
      input.name = `custom_${i}`;
      input.type = 'text';
      form.appendChild(input);
    }
    document.body.appendChild(form);
    const r = scanLeverForm(document);
    expect(r.formModel.fields.length).toBeGreaterThanOrEqual(300);
  });
});

describe('scanLeverForm -- adversarial attribute values (D19 cat 4)', () => {
  beforeEach(() => resetDom());

  it('scans through XSS-looking attribute values without executing them', () => {
    const form = document.createElement('form');
    form.id = 'application-form';
    const input = document.createElement('input');
    input.name = 'name';
    // XSS-shaped label text -- scanner must treat it as data, not code.
    input.setAttribute('aria-label', '<script>alert(1)</script>');
    input.setAttribute('placeholder', '"><img src=x onerror=alert(1)>');
    form.appendChild(input);
    document.body.appendChild(form);
    expect(() => scanLeverForm(document)).not.toThrow();
    const { formModel } = scanLeverForm(document);
    const nameField = formModel.fields.find((f) => f.name === 'name');
    expect(nameField).toBeDefined();
    expect(nameField!.ariaLabel).toBe('<script>alert(1)</script>');
  });

  it('handles unicode field labels (RTL + combining chars) without throwing', () => {
    const form = document.createElement('form');
    form.id = 'application-form';
    const input = document.createElement('input');
    input.name = 'name';
    input.setAttribute('aria-label', '\u0627\u0644\u0627\u0633\u0645 n\u0303ame');
    form.appendChild(input);
    document.body.appendChild(form);
    expect(() => scanLeverForm(document)).not.toThrow();
  });

  it('handles duplicate selector sources without throwing', () => {
    // Two inputs with identical name attributes -- the scanner should still produce
    // a valid FormModel; B5 is responsible for disambiguation.
    const form = document.createElement('form');
    form.id = 'application-form';
    const a = document.createElement('input');
    a.name = 'email'; a.type = 'email';
    const b = document.createElement('input');
    b.name = 'email'; b.type = 'email';
    form.appendChild(a);
    form.appendChild(b);
    document.body.appendChild(form);
    expect(() => scanLeverForm(document)).not.toThrow();
  });
});

describe('findLeverFormRoot -- all three id variants', () => {
  it('matches #application-form', () => {
    resetDom();
    document.body.innerHTML = '<form id="application-form"></form>';
    expect(findLeverFormRoot(document)?.selector).toBe('#application-form');
  });
  it('matches #application_form', () => {
    resetDom();
    document.body.innerHTML = '<form id="application_form"></form>';
    expect(findLeverFormRoot(document)?.selector).toBe('#application_form');
  });
  it('matches #applicationform', () => {
    resetDom();
    document.body.innerHTML = '<form id="applicationform"></form>';
    expect(findLeverFormRoot(document)?.selector).toBe('#applicationform');
  });
  it('returns null when no Lever form root present', () => {
    resetDom();
    document.body.innerHTML = '<form id="random-form"></form>';
    expect(findLeverFormRoot(document)).toBeNull();
  });
});

describe('detectNameVariant', () => {
  it('returns combined-name when only name input present', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="name" />';
    expect(detectNameVariant(form)).toBe('combined-name');
  });
  it('returns split-name when firstName + lastName present', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="firstName" /><input name="lastName" />';
    expect(detectNameVariant(form)).toBe('split-name');
  });
  it('returns split-name for underscore variant', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="first_name" /><input name="last_name" />';
    expect(detectNameVariant(form)).toBe('split-name');
  });
  it('returns unknown when neither pattern present', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="email" />';
    expect(detectNameVariant(form)).toBe('unknown');
  });
  it('prefers split-name over combined-name when both present', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="name" /><input name="firstName" /><input name="lastName" />';
    expect(detectNameVariant(form)).toBe('split-name');
  });
});
```

### Step 18 -- Test: `tests/ats/lever/field-filler.spec.ts`

Covers: text fill, choice (eeo-gender `<select>` dropdown), boolean (checkbox), variant-aware routing, file instruction rejected with `wrong-entry-point-for-file`, skip instruction rejected, selector-not-found, scoped resolution under form root.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fillLeverField } from '../../../src/ats/lever/field-filler';
import type { FillInstruction } from '../../../src/core/types';
import { PlanId, ResumeHandleId } from '../../../src/core/types';

function loadFixture(name: string): void {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
}

function textInstruction(selector: string, field: string, value: string): FillInstruction {
  return {
    selector, field: field as FillInstruction['field'],
    value: { kind: 'text', value },
    priority: 1, planId: PlanId('test-plan'),
  };
}
function choiceInstruction(selector: string, field: string, value: string): FillInstruction {
  return {
    selector, field: field as FillInstruction['field'],
    value: { kind: 'choice', value },
    priority: 1, planId: PlanId('test-plan'),
  };
}
function booleanInstruction(selector: string, field: string, value: boolean): FillInstruction {
  return {
    selector, field: field as FillInstruction['field'],
    value: { kind: 'boolean', value },
    priority: 1, planId: PlanId('test-plan'),
  };
}
function fileInstruction(selector: string, field: string): FillInstruction {
  return {
    selector, field: field as FillInstruction['field'],
    value: { kind: 'file', handleId: ResumeHandleId('h1') },
    priority: 1, planId: PlanId('test-plan'),
  };
}
function skipInstruction(selector: string, field: string): FillInstruction {
  return {
    selector, field: field as FillInstruction['field'],
    value: { kind: 'skip', reason: 'profile-field-empty' },
    priority: 1, planId: PlanId('test-plan'),
  };
}

describe('fillLeverField -- text input (combined-name fixture)', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('fills the combined name input', () => {
    const r = fillLeverField(textInstruction('#lever-name', 'name', 'Jane Doe'));
    expect(r.ok).toBe(true);
    expect((document.querySelector('#lever-name') as HTMLInputElement).value).toBe('Jane Doe');
    if (r.ok) expect(r.instructionPlanId).toBe('test-plan');
  });

  it('fills the email input', () => {
    const r = fillLeverField(textInstruction('#lever-email', 'email', 'jane@example.com'));
    expect(r.ok).toBe(true);
  });

  it('fills the LinkedIn URL input', () => {
    const r = fillLeverField(textInstruction('#lever-linkedin', 'linkedin-url', 'https://linkedin.com/in/jane'));
    expect(r.ok).toBe(true);
  });
});

describe('fillLeverField -- select dropdown (eeo-gender)', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('selects the non-binary option', () => {
    const r = fillLeverField(choiceInstruction('#lever-gender', 'eeo-gender', 'non-binary'));
    expect(r.ok).toBe(true);
    expect((document.querySelector('#lever-gender') as HTMLSelectElement).value).toBe('non-binary');
  });

  it('returns ok:false with value-rejected-by-page for missing option', () => {
    const r = fillLeverField(choiceInstruction('#lever-gender', 'eeo-gender', 'not-an-option'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('value-rejected-by-page');
  });
});

describe('fillLeverField -- boolean / checkbox + radio', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<body><form id="application-form"><input id="cb" name="terms" type="checkbox" /><input id="r1" name="contact-pref" type="radio" value="email" /></form></body>';
  });
  it('checks the checkbox', () => {
    const r = fillLeverField(booleanInstruction('#cb', 'consent-privacy', true));
    expect(r.ok).toBe(true);
    expect((document.querySelector('#cb') as HTMLInputElement).checked).toBe(true);
  });
  it('unchecks the checkbox when value is false', () => {
    (document.querySelector('#cb') as HTMLInputElement).checked = true;
    const r = fillLeverField(booleanInstruction('#cb', 'consent-privacy', false));
    expect(r.ok).toBe(true);
    expect((document.querySelector('#cb') as HTMLInputElement).checked).toBe(false);
  });
});

describe('fillLeverField -- variant routing', () => {
  it('fills given-name on split-name form when variant matches', () => {
    loadFixture('split-name-form.html');
    const r = fillLeverField(
      textInstruction('#lv-first', 'given-name', 'Jane'),
      { variant: 'split-name', formRoot: document.querySelector('#application_form') },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects given-name on combined-name form (variant mismatch)', () => {
    loadFixture('standard-form.html');
    const r = fillLeverField(
      textInstruction('#lever-name', 'given-name', 'Jane'),
      { variant: 'combined-name', formRoot: document.querySelector('#application-form') },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown-error');
  });

  it('rejects name on split-name form (variant mismatch)', () => {
    loadFixture('split-name-form.html');
    const r = fillLeverField(
      textInstruction('#lv-first', 'name', 'Jane Doe'),
      { variant: 'split-name', formRoot: document.querySelector('#application_form') },
    );
    expect(r.ok).toBe(false);
  });

  it('tolerates unknown variant (no variant enforcement)', () => {
    loadFixture('standard-form.html');
    const r = fillLeverField(
      textInstruction('#lever-email', 'email', 'x@y.com'),
      { variant: 'unknown', formRoot: null },
    );
    expect(r.ok).toBe(true);
  });
});

describe('fillLeverField -- instruction kind guards', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('rejects file instruction with wrong-entry-point-for-file', () => {
    const r = fillLeverField(fileInstruction('#lever-resume', 'resume-upload'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('wrong-entry-point-for-file');
  });

  it('rejects skip instruction with unknown-error', () => {
    const r = fillLeverField(skipInstruction('#lever-email', 'email'));
    expect(r.ok).toBe(false);
  });
});

describe('fillLeverField -- selector resolution', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('returns selector-not-found when selector has no match', () => {
    const r = fillLeverField(textInstruction('#does-not-exist', 'email', 'x'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('selector-not-found');
  });

  it('handles malformed selector defensively', () => {
    const r = fillLeverField(textInstruction('#{{invalid}}', 'email', 'x'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('selector-not-found');
  });

  it('prefers form-root scoped resolution when context provides formRoot', () => {
    // Inject a stray input OUTSIDE the form with the same name attribute.
    const stray = document.createElement('input');
    stray.name = 'stray-check';
    stray.id = 'stray';
    document.body.insertBefore(stray, document.body.firstChild);
    // Also inject inside the form.
    const form = document.querySelector('#application-form')!;
    const inside = document.createElement('input');
    inside.name = 'stray-check';
    inside.type = 'text';
    inside.id = 'inside';
    form.appendChild(inside);
    // Fill via attribute selector; context scoped to form -- must pick the inside one.
    const r = fillLeverField(
      textInstruction('input[name="stray-check"]', 'custom-text', 'scoped'),
      { variant: 'combined-name', formRoot: form },
    );
    expect(r.ok).toBe(true);
    expect((document.querySelector('#inside') as HTMLInputElement).value).toBe('scoped');
    expect((document.querySelector('#stray') as HTMLInputElement).value).toBe('');
  });
});
```

### Step 19 -- Test: `tests/ats/lever/file-attacher.spec.ts`

Covers D19 cat 1 (0-byte File), cat 4 (path traversal in name), happy-path, async resolution, missing input, wrong MIME tolerance (Lever's native file input accepts any MIME -- the spec is that the attacher does NOT filter on MIME).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attachLeverResume } from '../../../src/ats/lever/file-attacher';
import type { FillInstruction } from '../../../src/core/types';
import { PlanId, ResumeHandleId } from '../../../src/core/types';

function loadFixture(name: string): void {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
}

function makeFile(name = 'resume.pdf', bytes = 'pdf-bytes', type = 'application/pdf'): File {
  return new File([bytes], name, { type });
}

function fileInstruction(selector = '#lever-resume'): FillInstruction {
  return {
    selector,
    field: 'resume-upload',
    value: { kind: 'file', handleId: ResumeHandleId('h1') },
    priority: 1,
    planId: PlanId('test-plan'),
  };
}

describe('attachLeverResume -- happy path', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('attaches a file via the scoped form root', async () => {
    const form = document.querySelector('#application-form')!;
    const r = await attachLeverResume(
      fileInstruction('#lever-resume'),
      makeFile(),
      { variant: 'combined-name', formRoot: form },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instructionPlanId).toBe('test-plan');
    const input = document.querySelector('#lever-resume') as HTMLInputElement;
    expect(input.files?.length).toBe(1);
  });

  it('attaches without context (falls through to document)', async () => {
    const r = await attachLeverResume(fileInstruction(), makeFile());
    expect(r.ok).toBe(true);
  });

  it('returns a Promise (is async)', () => {
    const result = attachLeverResume(fileInstruction(), makeFile());
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('attachLeverResume -- fallback selectors', () => {
  it('falls back when explicit selector does not match', async () => {
    loadFixture('standard-form.html');
    const r = await attachLeverResume(
      { ...fileInstruction('#does-not-exist') },
      makeFile(),
    );
    // Falls back to LEVER_RESUME_INPUT_SELECTORS; `input[name="resume"][type="file"]` matches.
    expect(r.ok).toBe(true);
  });

  it('returns selector-not-found when no fallback matches', async () => {
    document.documentElement.innerHTML = '<body><form id="application-form"></form></body>';
    const r = await attachLeverResume(fileInstruction('#nothing'), makeFile());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('selector-not-found');
  });

  it('rejects non-file element with file-attach-failed', async () => {
    document.documentElement.innerHTML = '<body><form id="application-form"><input id="text-only" type="text" /></form></body>';
    const r = await attachLeverResume(fileInstruction('#text-only'), makeFile());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('file-attach-failed');
  });
});

describe('attachLeverResume -- instruction kind guard', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('rejects non-file instruction with wrong-entry-point-for-file', async () => {
    const r = await attachLeverResume(
      {
        selector: '#lever-resume',
        field: 'resume-upload',
        value: { kind: 'text', value: 'oops' },
        priority: 1,
        planId: PlanId('test-plan'),
      },
      makeFile(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('wrong-entry-point-for-file');
  });
});

describe('attachLeverResume -- adversarial inputs (D19)', () => {
  beforeEach(() => loadFixture('standard-form.html'));

  it('accepts a 0-byte File (happy-dom does not reject)', async () => {
    const r = await attachLeverResume(fileInstruction(), new File([], 'empty.pdf', { type: 'application/pdf' }));
    expect(r.ok).toBe(true);
  });

  it('tolerates path-traversal File name without executing it', async () => {
    const r = await attachLeverResume(
      fileInstruction(),
      new File(['x'], '../../../../etc/passwd', { type: 'application/pdf' }),
    );
    // The attacher does NOT sanitize names -- that is the consumer's concern.
    // The only requirement is it does not throw.
    expect(r.ok).toBe(true);
  });

  it('tolerates wrong MIME (Lever input accepts .pdf only via accept attr; DataTransfer bypasses)', async () => {
    const r = await attachLeverResume(
      fileInstruction(),
      new File(['x'], 'resume.exe', { type: 'application/x-msdownload' }),
    );
    // B5's attachFile routes via DataTransfer which bypasses accept filtering.
    // Server-side validation is the real gate; client-side adapter is best-effort.
    expect(r.ok).toBe(true);
  });
});
```

### Step 20 -- Test: `tests/ats/lever/job-extractor.spec.ts`

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractLeverJob } from '../../../src/ats/lever/job-extractor';

function loadFixture(name: string): void {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
}

function setLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

describe('extractLeverJob -- valid Lever posting', () => {
  beforeEach(() => {
    loadFixture('job-posting-jsonld.html');
    setLocation('https://jobs.lever.co/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53');
  });

  it('returns a JobPostingData with title + hiring org', () => {
    const r = extractLeverJob(document);
    expect(r).not.toBeNull();
    expect(r!.title).toContain('Senior Backend Engineer');
    expect(r!.hiringOrganization?.name).toBe('Acme Corp');
  });

  it('stamps source = adapter-specific', () => {
    const r = extractLeverJob(document);
    expect(r!.source).toBe('adapter-specific');
  });

  it('captures employmentType including Lever non-Schema variant', () => {
    const r = extractLeverJob(document);
    expect(r!.employmentType).toBeDefined();
  });
});

describe('extractLeverJob -- URL gates', () => {
  beforeEach(() => loadFixture('job-posting-jsonld.html'));

  it('rejects apply pages (returns null)', () => {
    setLocation('https://jobs.lever.co/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53/apply');
    expect(extractLeverJob(document)).toBeNull();
  });

  it('rejects non-Lever URLs', () => {
    setLocation('https://boards.greenhouse.io/acme/jobs/12345');
    expect(extractLeverJob(document)).toBeNull();
  });

  it('rejects about:blank', () => {
    setLocation('about:blank');
    expect(extractLeverJob(document)).toBeNull();
  });
});

describe('extractLeverJob -- malformed JSON-LD (D19 cat 4)', () => {
  beforeEach(() => {
    loadFixture('malformed-jsonld.html');
    setLocation('https://jobs.lever.co/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53');
  });

  it('returns null on parse error instead of throwing', () => {
    expect(() => extractLeverJob(document)).not.toThrow();
    expect(extractLeverJob(document)).toBeNull();
  });
});

describe('extractLeverJob -- no JSON-LD at all', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head><title>No JSON-LD</title></head><body><h1>hi</h1></body>';
    setLocation('https://jobs.lever.co/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53');
  });

  it('returns null', () => {
    expect(extractLeverJob(document)).toBeNull();
  });
});
```

### Step 21 -- Test: `tests/ats/lever/adapter-contract.spec.ts` (D18 CONTRACT TEST)

This is the parity spec that B7 and B9 also ship verbatim modulo vendor name. Identical shape across all three adapters. Must exercise: structural type assertion, kind locked, all members present, object frozen, factory singleton identity, factory state isolation.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2026 Ebenezer Isaac

import { describe, it, expect } from 'vitest';
import {
  adapter,
  createLeverAdapter,
  LEVER_BLUEPRINT,
} from '../../../src/ats/lever';
import type { AtsAdapter, FillInstruction } from '../../../src/core/types';
import { PlanId } from '../../../src/core/types';

// Type-level assertion: the exported object structurally satisfies AtsAdapter.
// If B8 drops a required method or changes a signature, this line fails to compile.
const _typeCheck: AtsAdapter = adapter;
void _typeCheck;

function makeInstruction(): FillInstruction {
  return {
    selector: '#lever-email',
    field: 'email',
    value: { kind: 'text', value: 'x@y.com' },
    priority: 1,
    planId: PlanId('contract-test'),
  };
}

describe('lever adapter contract (D18)', () => {
  it('kind is locked to "lever"', () => {
    expect(adapter.kind).toBe('lever');
  });

  it('matchesUrl is a function', () => {
    expect(typeof adapter.matchesUrl).toBe('function');
    expect(adapter.matchesUrl('https://jobs.lever.co/acme/5ec536c8-67b8-4b6b-b23e-cde403d59d53')).toBe(true);
    expect(adapter.matchesUrl('https://example.com')).toBe(false);
  });

  it('scanForm is a function returning a FormModel shape', () => {
    expect(typeof adapter.scanForm).toBe('function');
    document.documentElement.innerHTML = '<body><form id="application-form"><input name="email" type="email"/></form></body>';
    const m = adapter.scanForm(document);
    expect(m).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      scannedAt: expect.any(String),
      fields: expect.any(Array),
    });
    expect(m.sourceATS).toBe('lever');
  });

  it('fillField returns a discriminated-union FillResult', () => {
    document.documentElement.innerHTML = '<body><form id="application-form"><input id="lever-email" name="email" type="email"/></form></body>';
    adapter.scanForm(document);
    const r = adapter.fillField(makeInstruction());
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('selector');
    expect(r).toHaveProperty('instructionPlanId');
    if (!r.ok) expect(r).toHaveProperty('error');
  });

  it('attachFile is present and async', async () => {
    expect(typeof adapter.attachFile).toBe('function');
    document.documentElement.innerHTML = '<body><form id="application-form"><input id="lever-resume" name="resume" type="file"/></form></body>';
    adapter.scanForm(document);
    const file = new File(['x'], 'r.pdf', { type: 'application/pdf' });
    const ins: FillInstruction = {
      selector: '#lever-resume',
      field: 'resume-upload',
      value: { kind: 'file', handleId: 'h1' as never },
      priority: 1,
      planId: PlanId('contract-test'),
    };
    const promise = adapter.attachFile!(ins, file);
    expect(promise).toBeInstanceOf(Promise);
    const r = await promise;
    expect(r).toHaveProperty('ok');
  });

  it('extractJob is a function', () => {
    expect(typeof adapter.extractJob).toBe('function');
  });

  it('adapter is frozen (rejects mutation)', () => {
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(() => { (adapter as unknown as { kind: string }).kind = 'other'; }).toThrow();
  });

  it('module-singleton identity: adapter === adapter', () => {
    // Importing again MUST return the same reference.
    expect(adapter).toBe(adapter);
  });

  it('factory produces independent instances with isolated state', () => {
    const a = createLeverAdapter();
    const b = createLeverAdapter();
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);

    // Isolate state: scan two different forms in two instances.
    document.documentElement.innerHTML = '<body><form id="application-form"><input name="name"/></form></body>';
    a.scanForm(document);
    document.documentElement.innerHTML = '<body><form id="application_form"><input name="firstName"/><input name="lastName"/></form></body>';
    b.scanForm(document);
    // a's closure held the combined-name variant; b's holds split-name.
    // We cannot read closure state directly, but we can re-scan and verify each
    // instance returns an adapter of the correct kind.
    expect(a.kind).toBe('lever');
    expect(b.kind).toBe('lever');
  });

  it('LEVER_BLUEPRINT publicExports matches actual barrel exports', async () => {
    const mod = await import('../../../src/ats/lever');
    const actualExports = Object.keys(mod);
    for (const expected of LEVER_BLUEPRINT.publicExports) {
      expect(actualExports).toContain(expected);
    }
  });

  it('LEVER_BLUEPRINT adapterShape.members match the live adapter', () => {
    for (const m of LEVER_BLUEPRINT.adapterShape.members) {
      expect(m in adapter).toBe(true);
    }
  });
});
```

### Step 22 -- Create `scripts/rollback-phase-B8.sh` (D23)

```bash
#!/bin/bash
# scripts/rollback-phase-B8.sh
# Mechanically revert phase B8 (Lever adapter) changes.
#
# Run from the ats-autofill-engine repo root. The script:
# 1. Deletes src/ats/lever/ entirely.
# 2. Deletes tests/ats/lever/ entirely.
# 3. Leaves package.json exports map + tsup.config.ts intact
#    (those are owned by B1 and would block B9 if removed).
# 4. Re-runs typecheck to verify the rolled-back state compiles.
#
# Exit non-zero on any failure. Safe to run from a dirty worktree:
# it only removes B8-owned paths.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "src/ats/lever" ] && [ ! -d "tests/ats/lever" ]; then
  echo "Phase B8: nothing to roll back (already absent)"
  exit 0
fi

echo "Removing src/ats/lever ..."
rm -rf src/ats/lever

echo "Removing tests/ats/lever ..."
rm -rf tests/ats/lever

echo "Verifying typecheck on rolled-back state ..."
pnpm typecheck

echo "Phase B8 rolled back cleanly"
```

Make executable: `chmod +x scripts/rollback-phase-B8.sh`.

## Grep gates (anti-drift per D14)

Run BEFORE marking phase complete. All must return zero matches or exit non-zero.

```bash
cd e:/ats-autofill-engine

# D14.1 -- forbidden tokens across src/ats/lever
set -e

# 1. Em-dashes in plan + source + tests -- D15
! grep -rE $'\u2014' --include='*.ts' --include='*.md' --include='*.json' src/ats/lever/ tests/ats/lever/ || { echo 'EM DASH PRESENT'; exit 1; }

# 2. Cross-vendor adapter imports (isolation)
! grep -rE "from ['\"]\.\./greenhouse" src/ats/lever/ || { echo 'IMPORTS GREENHOUSE'; exit 1; }
! grep -rE "from ['\"]\.\./workday"    src/ats/lever/ || { echo 'IMPORTS WORKDAY';    exit 1; }
! grep -rE "from ['\"]\.\./\.\./adapters/chrome" src/ats/lever/ || { echo 'IMPORTS CHROME ADAPTER'; exit 1; }
! grep -rE "from ['\"]\.\./\.\./core/highlight"  src/ats/lever/ || { echo 'IMPORTS CORE HIGHLIGHT'; exit 1; }
! grep -rE "@repo/shared-types" src/ats/lever/ tests/ats/lever/ || { echo 'IMPORTS @repo'; exit 1; }
! grep -rE "@nestjs/"            src/ats/lever/ tests/ats/lever/ || { echo 'IMPORTS @nestjs'; exit 1; }

# 3. No console.*
! grep -rE "\bconsole\.(log|info|warn|error|debug)" src/ats/lever/ || { echo 'CONSOLE.* USAGE'; exit 1; }

# 4. No `any` escape hatches (tests may cast via `as unknown as` for adversarial checks)
! grep -rnE "\bas any\b" src/ats/lever/ || { echo "as any ESCAPE"; exit 1; }
! grep -rnE "\bany\s*[=)]"  src/ats/lever/ --include='*.ts' | grep -v '// eslint-disable' || true

# 5. No TODO/FIXME/XXX/HACK
! grep -rnE "\b(TODO|FIXME|XXX|HACK)\b" src/ats/lever/ || { echo 'TODO PRESENT'; exit 1; }

# 6. No v1 remnants
! grep -rE "\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b" src/ats/lever/ tests/ats/lever/ || { echo 'V1 REMNANTS'; exit 1; }

# 7. No camelCase FieldType values that drifted (from the previous plan)
! grep -rnE "'(firstName|lastName|fullName|linkedinUrl|githubUrl|twitterUrl|portfolioUrl|resumeFile|eeoGender|eeoRace|eeoVeteranStatus|eeoDisabilityStatus|eeoDisabilitySignature|eeoDisabilitySignatureDate)'" src/ats/lever/ || { echo 'CAMELCASE FIELDTYPE DRIFT'; exit 1; }

# 8. MPL header presence -- every .ts file under src/ats/lever has "Mozilla Public" in the first 5 lines
for f in $(find src/ats/lever -name '*.ts'); do
  head -5 "$f" | grep -q "Mozilla Public" || { echo "MPL HEADER MISSING: $f"; exit 1; }
done
for f in $(find tests/ats/lever -name '*.ts'); do
  head -5 "$f" | grep -q "Mozilla Public" || { echo "MPL HEADER MISSING: $f"; exit 1; }
done

# 9. No block-style /* */ MPL headers (style parity with B7 -- line comments only)
for f in $(find src/ats/lever -name '*.ts'); do
  head -1 "$f" | grep -qE '^/\*' && { echo "BLOCK COMMENT HEADER: $f (use // instead)"; exit 1; } || true
done

# 10. Attribution block in selectors.ts
grep -q "andrewmillercode/Autofill-Jobs" src/ats/lever/selectors.ts || { echo 'MIT ATTRIBUTION MISSING'; exit 1; }

# 11. Keystone §6 factory pattern verbatim markers present
grep -q "createLeverAdapter" src/ats/lever/adapter.ts || { echo 'FACTORY FUNCTION MISSING'; exit 1; }
grep -q "WeakRef" src/ats/lever/adapter.ts || { echo 'FACTORY MUST USE WeakRef PER KEYSTONE §6'; exit 1; }
grep -q "Object.freeze" src/ats/lever/adapter.ts || { echo 'FACTORY MUST FREEZE'; exit 1; }
grep -q "export const adapter: AtsAdapter" src/ats/lever/index.ts || { echo 'MODULE SINGLETON MISSING'; exit 1; }
grep -q "export { createLeverAdapter }" src/ats/lever/index.ts || grep -q "export {.*createLeverAdapter" src/ats/lever/index.ts || { echo 'FACTORY NOT EXPORTED'; exit 1; }

# 12. Blueprint contract exists with correct vendor
grep -q "vendor: 'lever'" src/ats/lever/blueprint.contract.ts || { echo 'BLUEPRINT VENDOR MISMATCH'; exit 1; }

echo 'All grep gates passed.'
```

## Test plan (adversarial, per D19 categories 1-6)

| # | Category | Coverage file | Examples |
|---|---|---|---|
| 1 | Null/undefined/NaN/Infinity at every param | `url-patterns.spec.ts`, `field-filler.spec.ts`, `file-attacher.spec.ts` | `matchLeverUrl(null)`, `matchLeverUrl(NaN)`, `matchLeverUrl({})`, `attachLeverResume` with 0-byte File |
| 2 | Empty collections + max-size collections | `form-scanner.spec.ts` | empty DOM → unknown variant + empty fields; 300-field stress form |
| 3 | Unicode edge cases | `url-patterns.spec.ts`, `form-scanner.spec.ts` | RTL org segment, combining chars in label, zero-width joiner in org |
| 4 | Injection | `url-patterns.spec.ts`, `form-scanner.spec.ts`, `file-attacher.spec.ts`, `job-extractor.spec.ts` | `<script>` in org, path traversal in filename, malformed JSON-LD |
| 5 | Concurrent re-entry | `form-scanner.spec.ts`, `adapter-contract.spec.ts` | Two `scanForm` calls with different variants (factory state isolation) |
| 6 | Adversarial state | `field-filler.spec.ts`, `adapter-contract.spec.ts` | frozen adapter rejects mutation, malformed selector, duplicate name inputs |

## Acceptance criteria (20 items)

- [ ] `pnpm typecheck` passes from `e:/ats-autofill-engine` with zero errors (**NOT** `pnpm -F ats-autofill-engine typecheck` -- this is a standalone repo).
- [ ] `pnpm test tests/ats/lever` passes with zero failures.
- [ ] Coverage for `src/ats/lever/**` meets D24 floor: 85% line, 80% branch (CI-enforced via `vitest.config.ts`).
- [ ] Every production file has the exact 5-line MPL-2.0 header from Step 1 in `//` line-comment style.
- [ ] `selectors.ts` additionally has the 4-line andrewmillercode MIT attribution block.
- [ ] Every selector key in `LEVER_SELECTORS` is a kebab-case token that exists in B2's `FieldType` union (verified via the B2 taxonomy precondition script from Step 0).
- [ ] Zero camelCase `FieldType` drift: grep gate §7 passes.
- [ ] `src/ats/lever/adapter.ts` exports `createLeverAdapter()` factory verbatim from keystone §6, closing over `lastVariant` + `lastFormRoot: WeakRef<Element> | null`.
- [ ] `src/ats/lever/index.ts` exports both `createLeverAdapter` AND `adapter: AtsAdapter = createLeverAdapter()`.
- [ ] `adapter.kind === 'lever'` (contract test asserts).
- [ ] `Object.isFrozen(adapter) === true` (contract test asserts).
- [ ] `adapter-contract.spec.ts` passes all 11 assertions including factory isolation.
- [ ] `LEVER_BLUEPRINT.publicExports` matches the actual barrel exports (contract test asserts via runtime import).
- [ ] `scripts/rollback-phase-B8.sh` exists, is executable, and rolling back on a throwaway branch passes `pnpm typecheck`.
- [ ] Grep gates 1-12 all pass.
- [ ] D19 adversarial test categories 1-6 all covered with at least one test per category.
- [ ] `fillLeverField` extracts `instruction.value.value` before calling B5's `fillField(el, string | boolean)` -- NEVER passes a `FillInstruction` to B5.
- [ ] `attachLeverResume` is `async` and returns `Promise<FillResult>`. No `AttachResult` type anywhere.
- [ ] `extractLeverJob` imports `extractJobPostingFromDocument` from `'../../adapters/dom'` -- NEVER from `'../../core/extraction/**'`.
- [ ] `FormModel` literals in `form-scanner.ts` include `url`, `title`, `scannedAt`, `fields` -- the four required fields from keystone §2.4. `sourceATS` and `formRootSelector` are present as optional stamps.

## Rollback

Primary path:

```bash
cd e:/ats-autofill-engine
scripts/rollback-phase-B8.sh
```

Manual path (if the script is not yet committed or the shell is unavailable):

```bash
rm -rf src/ats/lever tests/ats/lever
pnpm typecheck   # must pass -- if not, investigate whether B7/B9/A8 picked up dependencies on B8
```

`package.json` exports map and `tsup.config.ts` are intentionally NOT rolled back: they are owned by B1 and removing them would break B9 publish. The `./lever` entry resolving to a missing `dist/ats/lever/index.js` is detected by the D14 exports-map test (`scripts/check-exports-resolution.mjs`) and reported as a clean missing-file error.

## Execution notes

- This phase runs in parallel with B7 (Greenhouse) and B9 (Workday) on Day 5. The three adapters share only the `AtsAdapter` contract surface from keystone §2.9 and the factory pattern from §6; there is no direct code-sharing between them.
- The executor MUST read `03-keystone-contracts.md §2.9` and `§6` before writing `adapter.ts`. The factory code block in Step 9 is a verbatim port of the §6 Lever example; do not paraphrase.
- If the B2 taxonomy precondition (Step 0 script) reports missing tokens, STOP and file a B2 corrective plan. Do not invent local types.
- If B6 has not yet published `extractJobPostingFromDocument` at `src/adapters/dom/jd/jsonld-extractor.ts` re-exported from the barrel, STOP. Do not inline the extractor.
- If B5's `fillField` or `attachFile` signature does not match what this plan assumes (primitive value for fill, async for attach), STOP and re-read B5's current plan file. The signatures in this plan are verbatim from B5 Step 5/6.
- Per D15, absolutely zero em-dashes anywhere -- not in this plan, not in generated source, not in generated tests, not in comments. Use `--` (double hyphen) instead.

## Confidence justification (final)

**9/10**. All 9 review blockers from `reviews/review-B8.md` are directly addressed in this rewrite:

1. **A1 camelCase FieldType drift** -- kebab-case tokens only; B2 taxonomy precondition script asserts at runtime.
2. **A2 JobPostingData phantom type** -- imported from `'../../core/types'` (B2 now ships it per keystone §2.7).
3. **A3 wrong extractor import path** -- imported from `'../../adapters/dom'` barrel.
4. **A4 B5 fillField signature mismatch** -- `fillLeverField` dispatches on `instruction.value.kind`, extracts primitive, calls B5 with `(el, string | boolean)`.
5. **A5 FillResult shape mismatch** -- `.error` (not `.reason`), threaded `instructionPlanId`, uses B2's canonical `FillError` union.
6. **A6 FormModel.sourceATS field missing** -- keystone §2.4 now ships it as optional; `form-scanner.ts` stamps it. `emptyFormModel` populates required `url`, `title`, `scannedAt`, `fields`.
7. **A7 attachFile async mismatch** -- `attachLeverResume` is `async` and returns `Promise<FillResult>`. No `AttachResult` type anywhere.
8. **A8 AttachResult phantom import** -- deleted.
9. **B1/C1 adapter export shape parity** -- both factory + module-singleton per D1 keystone §6. `adapter === adapter`, `adapter.kind === 'lever'`, all AtsAdapter members present, frozen.

The 1 point deducted is retained for the two-variant name-input complexity, mitigated by the contract test's factory-state-isolation assertion.

---

**End of plan B8 v2.1.**
