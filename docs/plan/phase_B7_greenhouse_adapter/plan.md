# Phase B7 -- Greenhouse ATS adapter

## Phase metadata

| Field | Value |
|---|---|
| **Phase code** | B7 |
| **Phase name** | Greenhouse ATS adapter |
| **Plan** | 100 v2.1 -- Chrome Extension POC + V1 |
| **Track** | Track 1 (engine) |
| **Target repo** | `ebenezer-isaac/ats-autofill-engine` |
| **Local path** | `e:/ats-autofill-engine` |
| **Day** | 5 -- 2026-04-16 |
| **Estimated effort** | 7-9 hours |
| **Depends on** | B1 (scaffold: package.json, tsup, empty `src/ats/greenhouse/index.ts` stub, `./greenhouse` export entry), B2 (`AtsAdapter`, `FormModel`, `FillInstruction`, `FillResult`, `FillError`, `JobPostingData`, `AtsKind`, branded types), B5 (`scan`, `fillField`, `attachFile`, `watchForm` function-based surface), B6 (`extractJobPostingFromDocument` via `./dom` barrel) |
| **Blocks** | A8 (content-script dynamic-imports `ats-autofill-engine/greenhouse` and reads `mod.adapter`), B9 publish alpha.2 bundle |
| **Runs in parallel with** | B8 (Lever), B9 (Workday) |
| **Confidence** | 9/10 |
| **Files created** | 17 (10 production source, 1 blueprint contract, 1 rollback script, 5 test spec files plus 4 fixture HTML files under tests/) |
| **Files modified** | 1 (`NOTICES.md` appended; `package.json` exports entry is INSPECTED and left untouched if B1 already matches keystone shape) |
| **Lines changed** | approximately +2650 lines added, 0 removed |
| **License** | Every new production source + test file MPL-2.0 with 5-line header. Attribution to berellevy/job_app_filler (BSD-3-Clause) reproduced in `NOTICES.md` and as a 2-line inline comment on derived files. |
| **Publishes to npm** | NO. B1 reserves `0.1.0-alpha.1`; B9 bumps to `0.1.0-alpha.2` after all three adapters land. B7 MUST NOT run `pnpm publish`. |

## Goal

Ship a self-contained, MPL-2.0 licensed `./greenhouse` sub-entry of `ats-autofill-engine` that implements the `AtsAdapter` contract defined in `03-keystone-contracts.md` section 2.9 for the Greenhouse ATS. The adapter is stateless (Greenhouse has no per-session variant state), but it ships the full factory pattern per decision D17 so that B7, B8, and B9 have symmetric shapes. The adapter MUST work on both Greenhouse front-ends observed in production 2026-04-11:

1. **Classic Greenhouse boards** -- `boards.greenhouse.io/<org>/jobs/<id>` and `boards.eu.greenhouse.io/<org>/jobs/<id>`, mostly plain HTML forms with `#first_name`, `#last_name`, `#email`, `#phone`, `input[type=file]` for resume, a mix of `<select>` and custom combobox widgets for custom questions, and embedded via `<iframe src*="greenhouse.io/embed/job_app">` on many external careers pages.
2. **React `job-boards.greenhouse.io`** -- Remix SPA, React-controlled text inputs, `div[role="combobox"]` for searchable dropdowns, uncontrolled file inputs, form root is `form[action*="/applications"]`.

This phase does NOT introduce multi-step wizard traversal (Greenhouse is single-page), auto-submit (never), Lever selectors (B8), Workday selectors (B9), Ashby selectors (v1.1), or Chrome extension glue (A8). It consumes B5 (`scan`, `fillField`, `attachFile`) and B6 (`extractJobPostingFromDocument` via the `./dom` barrel) and exports a single `adapter` object (and the `createGreenhouseAdapter` factory) that structurally satisfies `AtsAdapter`.

The entire port draws on investigation file 49 (`berellevy/job_app_filler`, BSD-3-Clause, Greenhouse + Greenhouse-React adapters, approximately 2350 LOC of field classes and XPath constants) as primary source. Secondary inputs: agent 59 (`andrewmillercode/Autofill-Jobs`, MIT, Greenhouse field-name seed list), agent 60 (`josephajibodu/greenhouse-autofill-chrome-extension`, unlicensed, facts only), agent 55 (JSON-LD extraction), agent 37 (React controlled input technique B5 already implements), agent 38 (DataTransfer file attacher B5 already implements).

**Attribution and license compliance**: every ported source file (production plus tests) carries the 5-line MPL-2.0 Mozilla boilerplate header, and every file whose logic originates from `berellevy/job_app_filler` carries a 2-line block stating `// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md`. `NOTICES.md` at repo root (created in B1) gains a Greenhouse-scoped entry listing the derived files and reproducing the BSD-3 copyright notice for Dovber Levy per BSD clauses 1-2. This phase does NOT modify the core MIT license.

## Confidence score

**9/10**.

Justification: the Greenhouse classic selectors (`#first_name`, `input[name="job_application[first_name]"]`, etc.) are extremely stable and appear identically in berellevy, andrewmiller, and josephajibodu. The React combobox strategy ladder is fully specified in agent 49 section h with 5 proven patterns (type-to-filter, ArrowDown-Enter, `__reactProps.onChange`, click-option, keyboard Tab dispatch). The repeating-section algorithm from `greenhouse/Sections.ts` is 51 LOC of clear imperative logic mapping cleanly to our architecture. JSON-LD extraction is already solved in B6. The only 1-point deduction: `job-boards.greenhouse.io` Remix SPA injects JSON-LD AFTER React hydration, so `job-extractor.ts` MUST use a sync read that tolerates absence (and the A8 content-script has its own `watchForm`-based re-scan loop), and there is a small chance happy-dom's `document.evaluate` behaves differently from Chrome on edge-case XPath predicates (we translate everything to CSS where possible and keep XPath only where absolutely necessary, specifically the repeating section ancestor walks).

## Scope declaration

- **Files created**: 17
  - 10 production source (`url-patterns.ts`, `selectors.ts`, `form-scanner.ts`, `field-filler.ts`, `file-attacher.ts`, `dropdown-handler.ts`, `repeating-sections.ts`, `job-extractor.ts`, `react-props-probe.ts`, `adapter.ts`)
  - 1 blueprint contract file (`blueprint.contract.ts`, per D22)
  - 1 rollback script (`scripts/rollback-phase-B7.sh`, per D23)
  - 5 test spec files under `tests/ats/greenhouse/`
    - `adapter-contract.spec.ts` (D18 contract matrix)
    - `url-patterns.spec.ts`
    - `form-scanner.spec.ts`
    - `field-filler.spec.ts`
    - `dropdown-handler.spec.ts`
    - `file-attacher.spec.ts`
    - `job-extractor.spec.ts`
    - `headers-and-exports.spec.ts` (D22 shape assertion + MPL header grep)
  - Actual test file count: 8 (listed in table). Fixture HTML files are static assets counted separately.
- **Files modified**: 1 (`NOTICES.md` appended; `package.json` INSPECTED only and left untouched if B1 already matches the keystone shape from `03-keystone-contracts.md` section 4)
- **Files OVERWRITTEN**: 1 (`src/ats/greenhouse/index.ts`, currently an empty MPL-headered stub from B1 File 23, is overwritten with the full barrel)
- **Estimated LoC**: +2650 (production: 1330, tests: 960, fixtures: 260, blueprint: 30, rollback script: 20, NOTICES append: 50)
- **Files NOT touched by B7**: `src/core/**`, `src/adapters/dom/**`, `src/adapters/chrome/**`, `src/ats/lever/**`, `src/ats/workday/**`, `tsconfig.*.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`

## Required reading (executor MUST read before starting -- order matters)

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - D1 (canonical `AtsAdapter` shape = frozen object with `kind`, `matchesUrl`, `scanForm`, `fillField`, `attachFile?`, `extractJob?`, returned from `createXAdapter()` factory)
   - D9 (`AtsKind = 'greenhouse' | 'lever' | 'workday'` single source, already exported from `core/types/ats-kind.ts`)
   - D12 (B7 does NOT publish; leave publishing to B9)
   - D14 (mandatory anti-drift gates: forbidden token grep, type-level contract test, exports-map resolution test, contract snapshot, Zod round-trip -- Zod not applicable to B7 since adapter has no runtime payload boundary of its own)
   - D15 (zero em-dash rule -- ASCII dashes only in plan files and code blocks)
   - D17 (factory pattern even when stateless; `createGreenhouseAdapter()` returns frozen object; `adapter` is a module-singleton `= createGreenhouseAdapter()`)
   - D18 (contract test matrix: ship `tests/ats/greenhouse/adapter-contract.spec.ts`)
   - D19 (adversarial test categories: null/undefined/NaN/Infinity, empty plus max, unicode, injection, concurrent re-entry, adversarial state)
   - D22 (blueprint contract watchdog: ship `src/ats/greenhouse/blueprint.contract.ts`)
   - D23 (rollback script, not prose)
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - Section 2.9 (`AtsAdapter` interface -- COPY VERBATIM into type imports; do not redefine)
   - Section 2.4 (`FormModel`, `FormFieldDescriptor`, `FormFieldOption`, `freezeFormModel`)
   - Section 2.5 (`FillInstruction`, `FillValue`, `SkipReason`, `FillError`, `FillResult`)
   - Section 2.7 (`JobPostingData` -- B2 now publishes this; no gap)
   - Section 2.3 (`AtsKind`, `ATS_KINDS`, `isAtsKind`)
   - Section 2.2 (branded IDs -- `PlanId` used in `FillResult.instructionPlanId`)
   - Section 4 (`./greenhouse` exports entry MUST be `{types, import, require}`, NOT `{types, import, default}`)
   - Section 6 (factory pattern verbatim for Greenhouse -- the block starting `// src/ats/greenhouse/index.ts (B7)` is the copy-paste source; do not paraphrase)
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/plan.md`
   - File 1 (package.json exports map; `./greenhouse` entry already populated with `{types, import, require}`)
   - File 23 (empty `src/ats/greenhouse/index.ts` stub with MPL-2.0 header -- this phase overwrites that file)
   - section Acceptance line 950 ("Each exports entry specifies `types`, `import`, AND `require`")
   - tsup.config.ts entry `'ats/greenhouse/index': 'src/ats/greenhouse/index.ts'` (already registered, no edit needed)
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B2_core_types_and_taxonomy/plan.md`
   - section 2.9 (`AtsAdapter` -- this is B2's publication point for the interface; B7 imports `type { AtsAdapter } from '../../core/types'`)
   - section 2.4 (`FormModel`, `FormFieldDescriptor`)
   - section 2.5 (`FillInstruction`, `FillResult`, `FillError`)
   - section 2.7 (`JobPostingData`)
   - section 2.11 barrel (`core/types/index.ts` re-exports everything, so `../../core/types` resolves)
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B5_dom_adapter_scanner_and_filler/plan.md`
   - section Files (function-based surface: `scan(root, opts): FormModel`, `fillField(el, value: string | boolean): FillResult` SYNC, `attachFile(input, file, opts?): Promise<FillResult>`)
   - section Step 5 filler -- `fillField` returns `FillResult` with `.error` field, NOT `.reason`. Do NOT `await` it.
   - section Step 6 file-attacher -- `attachFile` is async, returns `Promise<FillResult>` (same discriminated union).
   - B5 exports NO `AttachResult` type; `AttachFailureReason` exists but it is an internal enum mapped into `FillError` via `toFillError()`. B7 uses `FillResult` as the attach return type.
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B6_dom_adapter_highlighter_renderer/plan.md`
   - section Files (`extractJobPostingFromDocument(doc): JobPostingData | null` exported from `src/adapters/dom/jd/jsonld-extractor.ts`, re-exported from `src/adapters/dom/index.ts` barrel)
   - B7 MUST import from the barrel path `from '../../adapters/dom'`, NOT from the internal `jd/jsonld-extractor` subpath
7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`
   - section Files (`adapter-loader.ts`)
   - lines 603-623 -- the A8 `loadAdapter` function:
     ```ts
     const mod = await import('ats-autofill-engine/greenhouse');
     return mod.adapter;
     ```
     Confirm: A8 reads `mod.adapter`, NOT `mod.default`, NOT `mod.GreenhouseAdapter`, NOT `mod.createGreenhouseAdapter`. B7 MUST export a module-level named binding `adapter` with type `AtsAdapter`.
8. Investigation artifacts (cite when relevant to a step):
   - `investigation/49-berellevy-deep-read.md` sections a/e/f/g/h/i/j
   - `investigation/55-jsonld-jobposting.md` sections a/b/e/f
   - `investigation/59-andrewmillercode-deep-read.md` sections e/f/i
   - `investigation/60-josephajibodu-deep-read.md` section f (facts only)

## Preconditions (verified before executor writes any code)

1. B1 is landed. The following exist on disk:
   - `e:/ats-autofill-engine/package.json` with `exports["./greenhouse"]` equal to `{types: "./dist/ats/greenhouse/index.d.ts", import: "./dist/ats/greenhouse/index.js", require: "./dist/ats/greenhouse/index.cjs"}`
   - `e:/ats-autofill-engine/src/ats/greenhouse/index.ts` -- empty MPL-2.0-headered barrel stub (from B1 File 23)
   - `e:/ats-autofill-engine/tsup.config.ts` lists `'ats/greenhouse/index': 'src/ats/greenhouse/index.ts'` in entry map
   - `e:/ats-autofill-engine/tsconfig.adapter.json` lib includes `["ES2022", "DOM", "DOM.Iterable"]`, include glob covers `src/ats/**/*.ts`
   - `e:/ats-autofill-engine/NOTICES.md` exists with the MPL-2.0 section header
2. B2 is landed. The following symbols resolve via `import type { X } from '../../core/types'`:
   - `AtsAdapter` (section 2.9)
   - `AtsKind` (section 2.3)
   - `FormModel`, `FormFieldDescriptor`, `FormFieldOption` (section 2.4)
   - `FillInstruction`, `FillValue`, `FillResult`, `FillError`, `SkipReason`, `PlanId` (sections 2.5 and 2.2)
   - `JobPostingData` (section 2.7)
   - `freezeFormModel` (runtime helper from section 2.4)
3. B5 is landed. The following symbols resolve via `import { X } from '../../adapters/dom'`:
   - `scan(root: Document | Element, opts?: ScanOptions): FormModel` -- synchronous
   - `fillField(el: FillableElement, value: string | boolean): FillResult` -- SYNCHRONOUS, returns `FillResult` with `.error` on failure
   - `attachFile(input: HTMLInputElement, fileOrFiles: File | File[], opts?: AttachOptions): Promise<FillResult>` -- async, returns `FillResult`
   - `watchForm(root, callback, opts?): CleanupFn` -- NOT used by B7 (A8 uses it)
   - Types: `ScanOptions`, `AttachOptions`
4. B6 is landed. The following resolves via `import { X } from '../../adapters/dom'`:
   - `extractJobPostingFromDocument(doc: Document): JobPostingData | null`
5. `pnpm install` has been run; devDeps include `happy-dom`, `vitest`, `@types/node`.
6. If any precondition is missing, executor STOPS and reports to orchestrator. No workaround, no inline stubs, no `// TODO(B2-integration)`.

Smoke-verify preconditions with a scratch file `src/ats/greenhouse/_smoke.ts` (delete after verifying):

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type {
  AtsAdapter,
  AtsKind,
  FormModel,
  FormFieldDescriptor,
  FillInstruction,
  FillValue,
  FillResult,
  FillError,
  JobPostingData,
  PlanId,
} from '../../core/types';
import { scan, fillField, attachFile, extractJobPostingFromDocument } from '../../adapters/dom';
import type { ScanOptions, AttachOptions } from '../../adapters/dom';

const _a: AtsKind = 'greenhouse';
const _b: (root: Document) => FormModel = (d) => scan(d);
const _c: (el: HTMLInputElement, v: string) => FillResult = (el, v) => fillField(el, v);
const _d: (input: HTMLInputElement, f: File) => Promise<FillResult> = async (i, f) => attachFile(i, f);
const _e: (d: Document) => JobPostingData | null = (d) => extractJobPostingFromDocument(d);
export {};
```

If `pnpm tsc -p tsconfig.adapter.json --noEmit` emits any error against this file, STOP -- a precondition is not met. Delete `_smoke.ts` after typecheck passes.

## Files to create / overwrite (17 plus fixtures)

### Production source (10)

| Num | Path | Purpose | Approx LOC |
|---|---|---|---|
| 1 | `src/ats/greenhouse/url-patterns.ts` | URL regex matchers + `matchesUrl(url: string): boolean` helper (simple-boolean per AtsAdapter); plus internal `matchUrlDetail` that returns `{org, jobId, variant}` for diagnostics | 140 |
| 2 | `src/ats/greenhouse/selectors.ts` | Selector constant map (core fields, custom questions, form root, submit, headers, repeating sections) | 240 |
| 3 | `src/ats/greenhouse/form-scanner.ts` | Internal `scanGreenhouseForm(doc: Document): GreenhouseScanResult` (richer shape including internal selectorMatches map); vendor-internal richness; the adapter's public `scanForm` wrapper extracts only the `FormModel` slice | 230 |
| 4 | `src/ats/greenhouse/field-filler.ts` | Internal `fillGreenhouseField(el, value, hints?): FillResult` -- syncs-wraps B5 `fillField` with reactProps fallback | 180 |
| 5 | `src/ats/greenhouse/file-attacher.ts` | Internal `attachGreenhouseResume(input, file): Promise<FillResult>` -- async-wraps B5 `attachFile` with reactProps fallback | 150 |
| 6 | `src/ats/greenhouse/dropdown-handler.ts` | Internal `selectGreenhouseDropdown(combobox, value, opts?): FillResult` -- 3-strategy ladder (type-filter, click-option, react-props) | 310 |
| 7 | `src/ats/greenhouse/repeating-sections.ts` | `stampRepeatingSections(root)` -- stamps `data-gh-section-index` on employment/education containers | 170 |
| 8 | `src/ats/greenhouse/job-extractor.ts` | `extractGreenhouseJob(doc): JobPostingData | null` -- 3-tier (JSON-LD, __remixContext, DOM scrape) | 240 |
| 9 | `src/ats/greenhouse/react-props-probe.ts` | `getReactProps(el)` and `invokeReactHandler(el, prop, evt)` -- used by filler and attacher | 70 |
| 10 | `src/ats/greenhouse/adapter.ts` | `createGreenhouseAdapter(): AtsAdapter` factory that closes over zero state and returns `Object.freeze({kind, matchesUrl, scanForm, fillField, attachFile, extractJob})` | 100 |

Barrel (overwritten, not newly created):

| Num | Path | Purpose | Approx LOC |
|---|---|---|---|
| 11 | `src/ats/greenhouse/index.ts` (OVERWRITE B1 stub) | Re-exports `createGreenhouseAdapter`, `adapter` module-singleton, `GREENHOUSE_BLUEPRINT`; NO internal helpers leak | 45 |

Blueprint contract + rollback (per D22 + D23):

| Num | Path | Purpose | Approx LOC |
|---|---|---|---|
| 12 | `src/ats/greenhouse/blueprint.contract.ts` | `GREENHOUSE_BLUEPRINT` const with `phase`, `version`, `publicExports`, `adapterShape`, `forbiddenImports`, `requiredCoverage` | 30 |
| 13 | `scripts/rollback-phase-B7.sh` | Mechanical rollback (delete `src/ats/greenhouse/`, restore empty B1 stub, checkout `NOTICES.md`, run typecheck) | 20 |

### Tests (8 spec files)

All tests run under `happy-dom` via vitest `environment: 'happy-dom'`. Fixtures are static HTML committed under `tests/ats/greenhouse/fixtures/`.

| Num | Path | Purpose | Approx LOC |
|---|---|---|---|
| 14 | `tests/ats/greenhouse/adapter-contract.spec.ts` | D18 contract matrix: `adapter satisfies AtsAdapter`, kind locked, frozen-mutation reject, discriminated-union shape assertion | 120 |
| 15 | `tests/ats/greenhouse/url-patterns.spec.ts` | Positive + negative, plus adversarial (malformed, unicode, javascript:, data:, subdomain impersonation) | 150 |
| 16 | `tests/ats/greenhouse/form-scanner.spec.ts` | Classic + React fixtures; duplicate id stress; disabled-input exclusion; XSS-as-attribute; unicode field values; 300-field form stress | 220 |
| 17 | `tests/ats/greenhouse/field-filler.spec.ts` | Pass-through (null bytes, 10KB payload, unicode, RTL); readonly element; `fillField` sync assertion; react-props fallback | 170 |
| 18 | `tests/ats/greenhouse/dropdown-handler.spec.ts` | All 3 strategies; 50-option stress; small-timeout-ms simulation; fallback chain | 180 |
| 19 | `tests/ats/greenhouse/file-attacher.spec.ts` | DataTransfer path; react-props fallback; 0-byte file; path-traversal name; unusual MIME | 130 |
| 20 | `tests/ats/greenhouse/job-extractor.spec.ts` | JSON-LD + __remixContext + DOM fallback; `__remixContext = null`; Proxy with throwing `get`; malformed JSON-LD | 170 |
| 21 | `tests/ats/greenhouse/headers-and-exports.spec.ts` | Grep first 5 lines of every `src/ats/greenhouse/*.ts` for MPL header; assert `package.json.exports["./greenhouse"]` shape = `{types, import, require}` (exact keys) | 100 |

### Fixtures (4 HTML files counted under tests/, not in the 17)

Committed under `tests/ats/greenhouse/fixtures/`:

- `greenhouse-classic.html` -- 14 fields, `<form id="application_form">`, classic selectors
- `greenhouse-react.html` -- 10 fields, `<form action="/applications">` no id, React wrapper classes
- `greenhouse-classic-jsonld.html` -- classic fixture plus inline `<script type="application/ld+json">` with 12-field JobPosting
- `greenhouse-remix-context.html` -- react fixture plus `<script>window.__remixContext = {...}</script>` block with Remix route payload

Full fixture field map (fixture author and test author agree on markup):

| Fixture field | CSS selector | Input type | Notes |
|---|---|---|---|
| firstName | `#first_name` | `input[type=text]` | classic |
| lastName | `#last_name` | `input[type=text]` | classic |
| email | `#email` | `input[type=email]` | classic |
| phone | `#phone` | `input[type=tel]` | classic |
| resume | `#resume` | `input[type=file]` | classic |
| coverLetter | `#cover_letter` | `input[type=file]` | classic |
| linkedinUrl | `input[name="job_application[answers_attributes][0][text_value]"]` | `input[type=url]` | custom question |
| websiteUrl | `input[name="job_application[answers_attributes][1][text_value]"]` | `input[type=url]` | custom question |
| candidateLocation | `#candidate-location` | `input[type=text]` (combobox) | Google Places |
| whyCompany | `#job_application_answers_attributes_2_text_value` | `textarea` | long text custom question |
| gender | `select[name="job_application[demographic_information][gender]"]` | `<select>` | 4 options |
| race | `div[id="race"][role="combobox"]` | div-based combobox | 7 options |
| veteranStatus | `select[name="job_application[demographic_information][veteran_status]"]` | `<select>` | 3 options |
| disabilityStatus | `select[name="job_application[demographic_information][disability]"]` | `<select>` | 3 options |

Fixture files cap at 120 lines each.

## Step-by-step implementation

Read the entire step before writing any code. Steps are ordered by dependency; do not skip or reorder.

### Step 0 -- Sanity-check preconditions

Write `src/ats/greenhouse/_smoke.ts` with the content shown in the Preconditions section. Run `pnpm tsc -p tsconfig.adapter.json --noEmit`. If zero errors, delete `_smoke.ts` and proceed. If any error, STOP and report.

Separately, verify B1's `./greenhouse` export entry matches the keystone. Read `package.json` (do NOT write it). Confirm:

```json
"./greenhouse": {
  "types": "./dist/ats/greenhouse/index.d.ts",
  "import": "./dist/ats/greenhouse/index.js",
  "require": "./dist/ats/greenhouse/index.cjs"
}
```

Exact keys, in any order: `types`, `import`, `require`. If it says `default` instead of `require`, or any key is missing, STOP and report (B1 has drift and needs correction -- B7 does not fix B1). If it matches, proceed WITHOUT modifying package.json. The `headers-and-exports.spec.ts` test asserts this invariant.

### Step 1 -- File header constants

Every new source and test file begins with the 5-line MPL-2.0 header. For files whose logic derives from berellevy/job_app_filler, append two extra lines per header (blank separator plus attribution):

**Base MPL header (5 lines, used on `url-patterns.ts`, `blueprint.contract.ts`, and the `_smoke.ts` scratch file)**:

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
```

Three `//` lines is the correct count -- the "5 lines" label refers to the file starting with a 3-line comment and then a blank line before code (5 visible lines at top of file). Keep it 3 comment lines plus 1 blank line above the first `import`.

**MPL plus attribution (used on everything else)**:

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md
```

The `headers-and-exports.spec.ts` test reads the first 5 lines of each production file and asserts the MPL header is present. Non-derived files use the 3-line shorter form and still pass (the test checks for the MPL phrase, not the attribution phrase, on every file).

### Step 2 -- `src/ats/greenhouse/url-patterns.ts`

Public export (used by adapter): `matchesUrl(url: string): boolean`. Internal-only helper: `matchUrlDetail(url): {org, jobId, variant} | null` for diagnostics and tests. Four URL shapes to recognize:

1. `boards.greenhouse.io/<org>/jobs/<id>` -- classic US
2. `boards.eu.greenhouse.io/<org>/jobs/<id>` -- classic EU
3. `job-boards.greenhouse.io/<org>/jobs/<id>` -- React Remix SPA
4. `iframe[src*="greenhouse.io/embed/job_app"]` -- embed iframe (opaque query params, no org or id in URL)

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * URL patterns for Greenhouse ATS postings.
 *
 * Four observed shapes as of 2026-04-11:
 *   1. boards.greenhouse.io/<org>/jobs/<id>       -- classic boards (US)
 *   2. boards.eu.greenhouse.io/<org>/jobs/<id>    -- classic boards (EU)
 *   3. job-boards.greenhouse.io/<org>/jobs/<id>   -- React Remix SPA
 *   4. <any>.greenhouse.io/embed/job_app          -- embed iframe
 *
 * matchesUrl returns boolean for AtsAdapter compatibility. matchUrlDetail
 * returns structured variant metadata for diagnostics.
 */

export type GreenhouseVariant = 'classic' | 'classic-eu' | 'react' | 'embed-iframe';

export interface GreenhouseUrlMatch {
  readonly org: string;
  readonly jobId: string;
  readonly variant: GreenhouseVariant;
}

const CLASSIC_RE = /^https?:\/\/boards\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\/(\d+)(?:[/?#]|$)/i;
const CLASSIC_EU_RE = /^https?:\/\/boards\.eu\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\/(\d+)(?:[/?#]|$)/i;
const REACT_RE = /^https?:\/\/job-boards\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\/(\d+)(?:[/?#]|$)/i;
const EMBED_IFRAME_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?greenhouse\.io\/embed\/job_app(?:[?#]|$)/i;

export const GREENHOUSE_URL_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  CLASSIC_RE,
  CLASSIC_EU_RE,
  REACT_RE,
  EMBED_IFRAME_RE,
]);

/**
 * AtsAdapter.matchesUrl implementation: returns true if href is a supported
 * Greenhouse URL, false otherwise. Rejects non-strings, empty strings, and
 * any javascript:/data:/vbscript: scheme. Unicode and percent-encoded slugs
 * are accepted only if they round-trip through the regex charset [a-z0-9_-].
 */
export function matchesUrl(href: string): boolean {
  if (typeof href !== 'string' || href.length === 0) return false;
  // Reject javascript:, data:, vbscript:, file: and other non-http schemes early.
  // The regex already requires http(s):// but a defensive pre-check rejects
  // mixed-case `JavaScript:` variants without leaking them into the regex engine.
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return GREENHOUSE_URL_PATTERNS.some((re) => re.test(trimmed));
}

export function matchUrlDetail(href: string): GreenhouseUrlMatch | null {
  if (typeof href !== 'string' || href.length === 0) return null;
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  const classic = CLASSIC_RE.exec(trimmed);
  if (classic) return { org: classic[1], jobId: classic[2], variant: 'classic' };

  const classicEu = CLASSIC_EU_RE.exec(trimmed);
  if (classicEu) return { org: classicEu[1], jobId: classicEu[2], variant: 'classic-eu' };

  const react = REACT_RE.exec(trimmed);
  if (react) return { org: react[1], jobId: react[2], variant: 'react' };

  if (EMBED_IFRAME_RE.test(trimmed)) return { org: '', jobId: '', variant: 'embed-iframe' };

  return null;
}

/**
 * Scan a document for embedded Greenhouse iframes. Returns the matching
 * iframe elements so a caller (A8 content-script) can choose to hop into
 * the iframe's contentDocument. Returns empty array if none.
 */
export function findEmbeddedGreenhouseIframes(doc: Document): HTMLIFrameElement[] {
  const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe[src*="greenhouse.io/embed/job_app"]');
  return Array.from(iframes);
}
```

**Note on `matchesUrl` signature**: `AtsAdapter.matchesUrl` is `(url: string) => boolean` per keystone section 2.9. The factory wires this function directly into the frozen adapter object. `matchUrlDetail` is exported from this file so tests can verify variant detection, but is NOT re-exported from the barrel (internal use only).

### Step 3 -- `src/ats/greenhouse/selectors.ts`

The largest file in the phase. Every selector carries a fallback ladder; the scanner tries each in order, first match wins. Canonical source is agent 49 section g (classic + React XPath translated to CSS where possible) cross-checked against agent 59 section e (andrewmiller's MIT-licensed field name list) and agent 60 section f (josephajibodu facts only).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

/**
 * CSS selector ladder for every fillable field on a Greenhouse application form.
 *
 * Each entry is an ordered array of CSS selectors -- the first match wins.
 * Ordering rule: most specific -> least specific. The scanner resolves each
 * ladder exactly once per scan (single-pass) and builds a
 * Map<Element, {fieldKey, selector}> for O(1) descriptor lookup.
 *
 * Classic vs React: we unify both front-ends into a single ladder. The
 * scanner deduplicates via element identity, so it is safe for a single
 * element to match multiple ladders (first wins in iteration order).
 *
 * DO NOT re-order without re-running the form-scanner tests -- ordering is
 * tuned to avoid false-positive matches in the more permissive selectors.
 */

export interface GreenhouseSelectorEntry {
  readonly fieldKey: string;
  readonly selectors: ReadonlyArray<string>;
  readonly fieldType:
    | 'text'
    | 'email'
    | 'tel'
    | 'url'
    | 'textarea'
    | 'select'
    | 'combobox'
    | 'file'
    | 'checkbox'
    | 'radio-group';
  readonly commonlyRequired: boolean;
  readonly note?: string;
}

export const GREENHOUSE_SELECTORS: Readonly<Record<string, GreenhouseSelectorEntry>> = Object.freeze({
  firstName: {
    fieldKey: 'firstName',
    selectors: [
      '#first_name',
      'input[name="job_application[first_name]"]',
      'input[autocomplete="given-name"]',
      'input[aria-label*="First name" i]',
    ],
    fieldType: 'text',
    commonlyRequired: true,
  },
  lastName: {
    fieldKey: 'lastName',
    selectors: [
      '#last_name',
      'input[name="job_application[last_name]"]',
      'input[autocomplete="family-name"]',
      'input[aria-label*="Last name" i]',
    ],
    fieldType: 'text',
    commonlyRequired: true,
  },
  email: {
    fieldKey: 'email',
    selectors: [
      '#email',
      'input[name="job_application[email]"]',
      'input[type="email"]',
      'input[autocomplete="email"]',
    ],
    fieldType: 'email',
    commonlyRequired: true,
  },
  phone: {
    fieldKey: 'phone',
    selectors: [
      '#phone',
      'input[name="job_application[phone]"]',
      'input[type="tel"]',
      'input[autocomplete="tel"]',
    ],
    fieldType: 'tel',
    commonlyRequired: true,
  },
  resume: {
    fieldKey: 'resume',
    selectors: [
      '#resume',
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name="job_application[resume]"]',
      'input[type="file"][accept*="pdf"]',
      'input[type="file"][aria-label*="resume" i]',
    ],
    fieldType: 'file',
    commonlyRequired: true,
    note: 'Greenhouse classic uses #resume; React boards use hidden input under div[data-field*="resume"]',
  },
  coverLetter: {
    fieldKey: 'coverLetter',
    selectors: [
      '#cover_letter',
      'input[type="file"][name*="cover_letter" i]',
      'input[type="file"][name="job_application[cover_letter]"]',
      'textarea[name="job_application[cover_letter_text]"]',
    ],
    fieldType: 'file',
    commonlyRequired: false,
  },
  linkedinUrl: {
    fieldKey: 'linkedinUrl',
    selectors: [
      'input[id*="urls--question" i][name*="linkedin" i]',
      'input[name*="linkedin_profile" i]',
      'input[aria-label*="LinkedIn" i]',
      'input[placeholder*="linkedin.com" i]',
    ],
    fieldType: 'url',
    commonlyRequired: false,
    note: 'Custom-question URL fields use job_application[answers_attributes][N][text_value]; LinkedIn is usually the first URL question',
  },
  websiteUrl: {
    fieldKey: 'websiteUrl',
    selectors: [
      'input[id*="urls--question" i][name*="website" i]',
      'input[name*="portfolio" i]',
      'input[aria-label*="Website" i]',
      'input[aria-label*="Portfolio" i]',
    ],
    fieldType: 'url',
    commonlyRequired: false,
  },
  githubUrl: {
    fieldKey: 'githubUrl',
    selectors: [
      'input[id*="urls--question" i][name*="github" i]',
      'input[aria-label*="GitHub" i]',
      'input[placeholder*="github.com" i]',
    ],
    fieldType: 'url',
    commonlyRequired: false,
  },
  candidateLocation: {
    fieldKey: 'candidateLocation',
    selectors: [
      '#candidate-location',
      'input[name*="candidate_location" i]',
      'input[aria-label*="Current location" i]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
    note: 'Greenhouse renders this as a search combobox backed by Google Places',
  },
  customTextAnswer: {
    fieldKey: 'customTextAnswer',
    selectors: [
      'input[name*="answers_attributes" i][name*="text_value" i]',
      'textarea[name*="answers_attributes" i][name*="text_value" i]',
    ],
    fieldType: 'text',
    commonlyRequired: false,
  },
  gender: {
    fieldKey: 'gender',
    selectors: [
      'select[name*="gender" i]',
      'div[id*="gender" i][role="combobox"]',
      'div[class*="react-select"][id*="gender" i]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
  },
  race: {
    fieldKey: 'race',
    selectors: [
      'select[name*="race" i]',
      'div[id*="race" i][role="combobox"]',
      'div[class*="react-select-race-placeholder"]',
      'div[class*="react-select"][id*="race" i]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
  },
  hispanicEthnicity: {
    fieldKey: 'hispanicEthnicity',
    selectors: [
      'select[name*="hispanic_ethnicity" i]',
      'div[id*="hispanic_ethnicity" i][role="combobox"]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
  },
  veteranStatus: {
    fieldKey: 'veteranStatus',
    selectors: [
      'select[name*="veteran_status" i]',
      'div[id*="veteran_status" i][role="combobox"]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
  },
  disabilityStatus: {
    fieldKey: 'disabilityStatus',
    selectors: [
      'select[name*="disability" i]',
      'div[id*="disability" i][role="combobox"]',
    ],
    fieldType: 'combobox',
    commonlyRequired: false,
  },
});

export const GREENHOUSE_FORM_ROOT_SELECTORS: ReadonlyArray<string> = Object.freeze([
  '#application_form',
  '#application-form',
  'form#application-form',
  'form[action*="/applications"]',
  'div.application--form',
  'div[data-testid="application-form"]',
]);

export const GREENHOUSE_SUBMIT_SELECTORS: ReadonlyArray<string> = Object.freeze([
  '#submit_app',
  'button[type="submit"][name*="apply" i]',
  'input[type="submit"][value*="Submit" i]',
]);

export const GREENHOUSE_COMPANY_HEADER_SELECTORS: ReadonlyArray<string> = Object.freeze([
  'header h1',
  'header a[href*="boards.greenhouse.io"] img[alt]',
  'header a[href*="job-boards.greenhouse.io"]',
  '[data-testid="company-name"]',
  '.app-title .company',
]);

export const GREENHOUSE_JOB_TITLE_SELECTORS: ReadonlyArray<string> = Object.freeze([
  'h1.app-title',
  'h1[class*="job-title" i]',
  'h1[data-testid="job-title"]',
  'main h1',
]);

export const GREENHOUSE_REPEATING_SECTION_SELECTORS = Object.freeze({
  employment: [
    '[data-testid="employment-section"]',
    'fieldset[class*="employment" i]',
    'div[class*="field-repeat"][class*="employment" i]',
  ],
  education: [
    '.education--container',
    '[data-testid="education-section"]',
    'fieldset[class*="education" i]',
    'div[class*="field-repeat"][class*="education" i]',
  ],
} as const);
```

Note: the previous plan's `employment` list contained `.education--container` (copy-paste error). The corrected list has employment-specific selectors only.

### Step 4 -- `src/ats/greenhouse/react-props-probe.ts`

Small helper that locates the `__reactProps$xxx` key on an element and invokes named handlers. Used by `field-filler.ts` and `file-attacher.ts` as a secondary fallback.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

/**
 * React 17+ attaches its internal prop bag on DOM nodes under a key of the
 * form `__reactProps$<hash>`. This object exposes `onChange`, `onBlur`, etc.
 * attached by React without going through the DOM event system.
 *
 * Used as a SECONDARY fallback when B5's native-setter technique fails to
 * propagate the value (observed on some react-select and react-dropzone
 * components in Greenhouse React forms). Less resilient than DOM events
 * (internal API may change between React versions), but works in cases
 * where event delegation is bypassed.
 */

export function getReactProps(el: Element): Record<string, unknown> | null {
  // Intentional `any` access: __reactProps$* is React's internal key shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = el as any;
  // Object.keys skips non-enumerable, which is what we want -- we only
  // invoke props React chose to publish on the element.
  for (const key of Object.keys(e)) {
    if (key.startsWith('__reactProps$')) {
      const val = e[key];
      return val && typeof val === 'object' ? (val as Record<string, unknown>) : null;
    }
  }
  return null;
}

/**
 * Find and invoke an event-handler prop by name on an element.
 *
 * Example: invokeReactHandler(input, 'onChange', {target: {value: 'Ada'}})
 *
 * Returns true if the handler existed and was invoked without throwing,
 * false otherwise. Never throws -- caller checks the return value.
 */
export function invokeReactHandler(
  el: Element,
  propName: string,
  event: unknown,
): boolean {
  const props = getReactProps(el);
  if (!props) return false;
  const handler = props[propName];
  if (typeof handler !== 'function') return false;
  try {
    (handler as (evt: unknown) => unknown)(event);
    return true;
  } catch {
    return false;
  }
}
```

### Step 5 -- `src/ats/greenhouse/form-scanner.ts`

Two responsibilities:

1. **Scope narrowing**: find the Greenhouse form root via `GREENHOUSE_FORM_ROOT_SELECTORS`; pass as `root` to B5 `scan`, fall back to the full document. Avoids classifying unrelated fields on external careers pages.
2. **Single-pass selector matching** (performance fix per review): resolve each `GREENHOUSE_SELECTORS` ladder ONCE, build `Map<Element, {fieldKey, selector}>`, then look up each descriptor's resolved element in the map -- O(N + M*K) instead of O(N * M * K).

The file exports TWO shapes:

- `scanGreenhouseForm(doc: Document): GreenhouseScanResult` -- INTERNAL function that returns a richer shape including `selectorMatches` map (used by tests and by the adapter's wrapper).
- Default B7 adapter uses `scanGreenhouseForm` internally and projects to the plain `FormModel` slice when called via `adapter.scanForm(doc)`.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

import { scan } from '../../adapters/dom';
import type { ScanOptions } from '../../adapters/dom';
import type { FormModel, FormFieldDescriptor } from '../../core/types';
import { freezeFormModel } from '../../core/types';
import {
  GREENHOUSE_FORM_ROOT_SELECTORS,
  GREENHOUSE_SELECTORS,
} from './selectors';

export interface GreenhouseSelectorMatch {
  readonly fieldKey: string;
  readonly selector: string;
}

export interface GreenhouseScanResult {
  readonly formModel: FormModel;
  readonly formRoot: Element | null;
  readonly formRootSelector: string | null;
  /**
   * Map from descriptor.selector -> GreenhouseSelectorMatch for every
   * descriptor that matched a Greenhouse ladder entry. Keyed by the
   * descriptor's canonical selector (not by element identity) so that
   * downstream fillers can look up hints by selector alone.
   */
  readonly selectorMatches: ReadonlyMap<string, GreenhouseSelectorMatch>;
}

/**
 * Find the Greenhouse form root, or return null if none is present.
 * Tries each selector in GREENHOUSE_FORM_ROOT_SELECTORS in order.
 */
export function findFormRoot(doc: Document): Element | null {
  for (const selector of GREENHOUSE_FORM_ROOT_SELECTORS) {
    try {
      const el = doc.querySelector<Element>(selector);
      if (el) return el;
    } catch {
      // Invalid selector -- skip. None of ours are invalid; defensive only.
    }
  }
  return null;
}

/**
 * Scan a document for Greenhouse form fields. Returns a GreenhouseScanResult
 * whose formModel slice is a plain FormModel (ReadonlyArray<FormFieldDescriptor>)
 * and whose selectorMatches map provides per-field GH hints for the filler.
 *
 * Single-pass selector resolution: iterate GREENHOUSE_SELECTORS exactly once,
 * run each ladder's selectors against the scope, and insert every matched
 * element into a Map<Element, GreenhouseSelectorMatch>. Then for each
 * descriptor produced by B5, resolve its selector back to an element and
 * look it up in the map. Total work is O(fields-selectors + descriptor-count),
 * not O(descriptors * selectors * fields).
 */
export function scanGreenhouseForm(
  doc: Document,
  opts: ScanOptions = {},
): GreenhouseScanResult {
  const formRoot = findFormRoot(doc);
  const scanScope: Document | Element = formRoot ?? doc;

  const baseModel = scan(scanScope, opts);

  // Single-pass: iterate ladders once, build Map<Element, match>.
  const elementToMatch = new Map<Element, GreenhouseSelectorMatch>();
  for (const [fieldKey, entry] of Object.entries(GREENHOUSE_SELECTORS)) {
    for (const selector of entry.selectors) {
      let matches: NodeListOf<Element>;
      try {
        matches = (formRoot ?? doc).querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const el of Array.from(matches)) {
        // First match wins -- do not overwrite if the element is already
        // mapped under a more specific selector earlier in the ladder.
        if (!elementToMatch.has(el)) {
          elementToMatch.set(el, { fieldKey, selector });
        }
      }
    }
  }

  // Project descriptors -> selectorMatches map.
  const selectorMatches = new Map<string, GreenhouseSelectorMatch>();
  for (const descriptor of baseModel.fields) {
    let descriptorEl: Element | null = null;
    try {
      descriptorEl = (formRoot ?? doc).querySelector(descriptor.selector);
    } catch {
      continue;
    }
    if (!descriptorEl) continue;
    const match = elementToMatch.get(descriptorEl);
    if (match) selectorMatches.set(descriptor.selector, match);
  }

  const frozenModel: FormModel = freezeFormModel({
    ...baseModel,
    sourceATS: 'greenhouse',
    formRootSelector: formRoot ? buildFormRootSelector(formRoot) : undefined,
  });

  return {
    formModel: frozenModel,
    formRoot,
    formRootSelector: formRoot ? buildFormRootSelector(formRoot) : null,
    selectorMatches,
  };
}

/**
 * Build a stable CSS selector string for an element. Prefers `#id` (with
 * CSS.escape), falls back to `tag.class1.class2` (with CSS.escape on each
 * class name, guarding against colons and special chars).
 */
function buildFormRootSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const classes = Array.from((el as HTMLElement).classList).slice(0, 2).map((c) => CSS.escape(c));
  return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
}
```

### Step 6 -- `src/ats/greenhouse/field-filler.ts`

Vendor-internal `fillGreenhouseField` wraps B5 `fillField` with two patches:

1. **Combobox routing**: when the element looks like a combobox (role, class, or hints say so), delegate to `selectGreenhouseDropdown`.
2. **React-props fallback**: when B5 returns `{ok: false, error: 'value-rejected-by-page'}`, try `invokeReactHandler(el, 'onChange', ...)` and RE-READ the DOM to verify the value landed.

Critical contract correctness:

- B5 `fillField` is SYNC. Do NOT `await` it. The return is `FillResult`, not `Promise<FillResult>`.
- On failure, B5's `FillResult` uses `.error: FillError`, NOT `.reason`. The fallback branch checks `error === 'value-rejected-by-page'` (the B5 error code that maps from the internal `value-did-not-stick` reason).
- The "always verified: true" claim from the previous plan is wrong. The fallback RE-READS the DOM via `(el as HTMLInputElement).value === value` (or equivalent for textarea/checkbox) before declaring success.
- Return type is `FillResult` (the B2 discriminated union), NOT a custom extended type. The internal function returns B2's shape directly.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

import { fillField } from '../../adapters/dom';
import type { FillInstruction, FillResult, PlanId } from '../../core/types';
import { invokeReactHandler } from './react-props-probe';
import { selectGreenhouseDropdown } from './dropdown-handler';

export interface GreenhouseFillHints {
  /** Override the field type detected by the generic scanner. */
  readonly asType?: 'text' | 'textarea' | 'select' | 'combobox' | 'file' | 'checkbox' | 'radio-group';
  /** For comboboxes, pin a specific strategy (default: ladder all three). */
  readonly comboboxStrategy?: 'type-filter' | 'click-option' | 'react-props';
  /** Repeating section index -- used by repeating-sections.ts to resolve duplicate fields. */
  readonly sectionIndex?: number;
}

/**
 * Vendor-internal filler. Synchronous wrapper around B5 fillField with
 * Greenhouse-specific patches. The adapter's public fillField wraps this
 * function by resolving instruction.selector into an element and delegating.
 *
 * Returns B2's FillResult discriminated union. Never throws.
 */
export function fillGreenhouseField(
  el: Element,
  value: string | boolean,
  planId: PlanId,
  hints: GreenhouseFillHints = {},
): FillResult {
  const selector = (el as HTMLElement).id
    ? `#${(el as HTMLElement).id}`
    : (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.name
      ? `[name="${el.name}"]`
      : (el as HTMLElement).tagName.toLowerCase();

  // Route comboboxes to the dropdown handler. Dropdown handler is async;
  // only call if hints request it -- synchronous callers route here too
  // when the element is a native <select>, which B5 handles directly.
  if (hints.asType === 'combobox' || isDivCombobox(el)) {
    // Dropdown handler is async; return a selector-not-found result here
    // so that the caller (adapter.fillField) can differentiate and invoke
    // the async path. In practice the adapter routes combobox FillInstructions
    // through attachFile-style async handling; see Step 11 adapter.ts.
    return {
      ok: false,
      selector,
      error: 'value-rejected-by-page',
      instructionPlanId: planId,
    };
  }

  // Primary: B5 native-setter path. SYNCHRONOUS -- no await.
  if (typeof value === 'string') {
    const primary = fillField(el as HTMLInputElement | HTMLTextAreaElement, value);
    if (primary.ok) return { ...primary, instructionPlanId: planId };

    // Secondary: react-props fallback for text-like elements when B5
    // reports value-rejected-by-page (value did not stick after setter).
    if (primary.error === 'value-rejected-by-page' && isTextLikeElement(el)) {
      const invoked = invokeReactHandler(el, 'onChange', {
        target: { value },
        currentTarget: { value },
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      });
      if (invoked) {
        // Real verification: re-read DOM to confirm value landed.
        const actual = readElementValue(el);
        if (actual === value) {
          return { ok: true, selector, instructionPlanId: planId };
        }
      }
    }

    // Still failing -- return B5's original error, re-tagged with planId.
    return { ...primary, instructionPlanId: planId };
  }

  // Boolean path -- checkbox/radio handled by B5 directly, no fallback needed.
  const boolResult = fillField(el as HTMLInputElement, value);
  return { ...boolResult, instructionPlanId: planId };
}

export function isDivCombobox(el: Element): boolean {
  if (el.getAttribute('role') === 'combobox') return true;
  const cls = (el as HTMLElement).className;
  return typeof cls === 'string' && /react-select/i.test(cls);
}

function isTextLikeElement(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    return t === 'text' || t === 'email' || t === 'tel' || t === 'url' || t === 'search' || t === '';
  }
  return el instanceof HTMLTextAreaElement;
}

function readElementValue(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value;
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) return el.value;
  return '';
}
```

### Step 7 -- `src/ats/greenhouse/file-attacher.ts`

Internal `attachGreenhouseResume(input, file): Promise<FillResult>` wraps B5's async `attachFile` with a React-props `onChange` fallback. The file input accepts a single `File` per fill operation (cover letters go through a separate instruction).

B5 `attachFile` returns `Promise<FillResult>`. On failure, `FillResult.error: FillError`. The fallback checks `error === 'file-attach-failed'` (the B5 error code for `toFillError('datatransfer-rejected')`).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md
//
// React onChange fallback technique from berellevy/job_app_filler
// (src/inject/app/services/formFields/greenhouseReact/File.ts lines 71-83).

import { attachFile } from '../../adapters/dom';
import type { FillResult, PlanId } from '../../core/types';
import { invokeReactHandler } from './react-props-probe';

/**
 * Attach a file (resume or cover letter) to a Greenhouse file input.
 *
 * Primary path: B5 attachFile (DataTransfer + native events). Works on
 * classic Greenhouse and most React forms.
 *
 * Fallback: when B5 returns file-attach-failed, invoke React's onChange
 * handler directly via __reactProps with `{target:{files:[file]}}`. This
 * matches the berellevy greenhouseReact/File.ts pattern.
 *
 * Verification: the fallback re-reads `input.files?.[0]?.name === file.name`
 * before declaring success.
 *
 * Never throws. Returns B2 FillResult shape.
 */
export async function attachGreenhouseResume(
  input: Element,
  file: File,
  planId: PlanId,
): Promise<FillResult> {
  const selector = (input as HTMLElement).id
    ? `#${(input as HTMLElement).id}`
    : input instanceof HTMLInputElement && input.name
      ? `[name="${input.name}"]`
      : (input as HTMLElement).tagName.toLowerCase();

  if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
    return {
      ok: false,
      selector,
      error: 'wrong-entry-point-for-file',
      instructionPlanId: planId,
    };
  }

  const primary = await attachFile(input, file);
  if (primary.ok) return { ...primary, instructionPlanId: planId };

  if (primary.error === 'file-attach-failed') {
    const invoked = invokeReactHandler(input, 'onChange', {
      target: { files: [file] },
      currentTarget: { files: [file] },
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    });
    if (invoked) {
      // Real verification: re-read input.files
      const landedName = input.files && input.files.length > 0 ? input.files[0].name : null;
      if (landedName === file.name) {
        return { ok: true, selector, instructionPlanId: planId };
      }
    }
  }

  return { ...primary, instructionPlanId: planId };
}
```

### Step 8 -- `src/ats/greenhouse/dropdown-handler.ts`

The most complex file. Greenhouse renders all dropdowns via `react-select`: no native `<select>`, instead a `<div role="combobox">` with hidden `<input>` for typing and a dynamically-populated `<ul>` of options on click.

Strategy ladder from agent 49 section h:

1. **type-filter**: click combobox, wait for focused input descendant, set value via B5 `fillField` (synchronous call but async overall due to MutationObserver waits), wait for option list to populate, click matching option.
2. **click-option**: click combobox, wait for option list in document, find by text match, click.
3. **react-props**: direct `invokeReactHandler(combobox, 'onChange', {value, label})`.

Internal `selectGreenhouseDropdown` is async (the whole file uses MutationObserver waits). It is exposed internally only -- the adapter routes combobox fills via the async path described in Step 11.

`findOptionByText` does a single-pass scored match (exact, startsWith, contains) instead of three full iterations -- performance fix per review.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md
//
// Strategy ladder derived from berellevy/job_app_filler
// (src/inject/app/services/formFields/greenhouseReact/Dropdown.ts +
//  DropdownSearchable.ts, approximately 330 LOC adapted to our architecture).

import { fillField } from '../../adapters/dom';
import type { FillResult, PlanId } from '../../core/types';
import { invokeReactHandler } from './react-props-probe';

export type GreenhouseDropdownStrategy = 'type-filter' | 'click-option' | 'react-props';

export interface DropdownSelectOptions {
  readonly strategy?: GreenhouseDropdownStrategy;
  /** Max ms to wait for option list to appear. Default 2000 in production, tests override. */
  readonly timeoutMs?: number;
}

/**
 * Select an option from a Greenhouse react-select combobox. Async.
 *
 * Returns B2 FillResult. On failure, error is 'value-rejected-by-page'
 * (all strategies exhausted) or 'value-out-of-allowed-options' (no matching
 * option in the populated list).
 */
export async function selectGreenhouseDropdown(
  combobox: Element,
  value: string,
  planId: PlanId,
  options: DropdownSelectOptions = {},
): Promise<FillResult> {
  const selector = (combobox as HTMLElement).id
    ? `#${(combobox as HTMLElement).id}`
    : (combobox as HTMLElement).tagName.toLowerCase();

  if (!(combobox instanceof HTMLElement)) {
    return { ok: false, selector, error: 'value-rejected-by-page', instructionPlanId: planId };
  }

  const timeoutMs = options.timeoutMs ?? 2000;
  const strategies: GreenhouseDropdownStrategy[] = options.strategy
    ? [options.strategy]
    : ['type-filter', 'click-option', 'react-props'];

  for (const strategy of strategies) {
    const hit = await runStrategy(strategy, combobox, value, timeoutMs);
    if (hit) {
      return { ok: true, selector, instructionPlanId: planId };
    }
  }
  return { ok: false, selector, error: 'value-rejected-by-page', instructionPlanId: planId };
}

async function runStrategy(
  strategy: GreenhouseDropdownStrategy,
  combobox: HTMLElement,
  value: string,
  timeoutMs: number,
): Promise<boolean> {
  switch (strategy) {
    case 'type-filter':
      return typeFilterStrategy(combobox, value, timeoutMs);
    case 'click-option':
      return clickOptionStrategy(combobox, value, timeoutMs);
    case 'react-props':
      return reactPropsStrategy(combobox, value);
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

async function typeFilterStrategy(
  combobox: HTMLElement,
  value: string,
  timeoutMs: number,
): Promise<boolean> {
  combobox.click();
  const input = await waitForDescendant<HTMLInputElement>(
    combobox,
    (root) => (root as HTMLElement).querySelector<HTMLInputElement>('input:not([type="hidden"])'),
    500,
  );
  if (!input) return false;
  // B5 fillField is sync -- no await.
  const filled = fillField(input, value);
  if (!filled.ok) return false;

  const doc = combobox.ownerDocument;
  const option = await waitForDescendantInDoc<HTMLElement>(
    doc,
    () => findOptionByText(doc, value),
    timeoutMs,
  );
  if (!option) return false;
  option.click();
  return true;
}

async function clickOptionStrategy(
  combobox: HTMLElement,
  value: string,
  timeoutMs: number,
): Promise<boolean> {
  combobox.click();
  const doc = combobox.ownerDocument;
  const option = await waitForDescendantInDoc<HTMLElement>(
    doc,
    () => findOptionByText(doc, value),
    timeoutMs,
  );
  if (!option) return false;
  option.click();
  return true;
}

async function reactPropsStrategy(combobox: HTMLElement, value: string): Promise<boolean> {
  // react-select v5 expects {value, label} shape on onChange, not a DOM event.
  return invokeReactHandler(combobox, 'onChange', { value, label: value });
}

function waitForDescendant<T extends Element>(
  root: Element,
  find: (root: Element) => T | null,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = find(root);
    if (existing) {
      resolve(existing);
      return;
    }
    let resolved = false;
    const finish = (value: T | null) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const hit = find(root);
      if (hit) finish(hit);
    });
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

function waitForDescendantInDoc<T extends Element>(
  doc: Document,
  find: () => T | null,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = find();
    if (existing) {
      resolve(existing);
      return;
    }
    let resolved = false;
    const finish = (value: T | null) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const hit = find();
      if (hit) finish(hit);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Single-pass scored match for option elements. Iterates candidates once
 * and tracks the best match across three tiers (exact > startsWith > contains).
 */
function findOptionByText(doc: Document, value: string): HTMLElement | null {
  const selectors = [
    'div[class*="react-select"] div[id^="react-select-"][id*="-option-"]',
    '[role="option"]',
    'li[data-value]',
    'li[role="menuitem"]',
  ];
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;

  let bestScore = 0;
  let bestEl: HTMLElement | null = null;
  for (const selector of selectors) {
    let candidates: NodeListOf<HTMLElement>;
    try {
      candidates = doc.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }
    for (const c of Array.from(candidates)) {
      const text = (c.textContent ?? '').trim().toLowerCase();
      if (text.length === 0) continue;
      let score = 0;
      if (text === v) score = 3;
      else if (text.startsWith(v)) score = 2;
      else if (text.includes(v)) score = 1;
      if (score > bestScore) {
        bestScore = score;
        bestEl = c;
        if (score === 3) return bestEl; // Exact match short-circuits.
      }
    }
  }
  return bestEl;
}
```

### Step 9 -- `src/ats/greenhouse/repeating-sections.ts`

Greenhouse supports repeating Work Experience and Education sections via an Add Another button. Names are stable (`education_school_name_0`, `education_school_name_1`). The algorithm stamps `data-gh-section-index` on each container.

Fix applied from review: remove the wasted double-assign. Do a single-pass stamp in document order, no sort-then-reassign.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md
//
// Section stamping algorithm derived from
// src/inject/app/services/formFields/greenhouse/Sections.ts (BSD-3-Clause, 51 LOC).
// Ported and rewritten for our architecture.

import { GREENHOUSE_REPEATING_SECTION_SELECTORS } from './selectors';

export type GreenhouseSectionKind = 'employment' | 'education';

export interface GreenhouseSectionStamp {
  readonly kind: GreenhouseSectionKind;
  readonly index: number;
  readonly element: HTMLElement;
}

const STAMP_ATTR = 'data-gh-section-index';
const STAMP_KIND_ATTR = 'data-gh-section-kind';

/**
 * Walk the document looking for employment and education section containers
 * and stamp each with an index (0-based) in document order. Returns the
 * stamps in document order, grouped by kind.
 *
 * Idempotent: re-running on the same DOM returns identical indices without
 * re-mutating attributes.
 *
 * Single-pass: collects all kind candidates, sorts by document position,
 * then assigns indices. No double-assign.
 */
export function stampRepeatingSections(
  root: Document | Element,
): ReadonlyArray<GreenhouseSectionStamp> {
  const scope: Element = root instanceof Document ? root.body : root;
  const stamps: GreenhouseSectionStamp[] = [];

  for (const kind of ['employment', 'education'] as const) {
    const selectors = GREENHOUSE_REPEATING_SECTION_SELECTORS[kind];
    const seen = new Set<Element>();
    const collected: HTMLElement[] = [];
    for (const selector of selectors) {
      let matches: NodeListOf<HTMLElement>;
      try {
        matches = scope.querySelectorAll<HTMLElement>(selector);
      } catch {
        continue;
      }
      for (const el of Array.from(matches)) {
        if (seen.has(el)) continue;
        seen.add(el);
        collected.push(el);
      }
    }
    // Sort by document position for deterministic indexing.
    collected.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    collected.forEach((el, index) => {
      const existing = el.getAttribute(STAMP_ATTR);
      if (existing === null) {
        el.setAttribute(STAMP_ATTR, String(index));
        el.setAttribute(STAMP_KIND_ATTR, kind);
      }
      const finalIndex = existing !== null ? Number(existing) : index;
      stamps.push({ kind, index: finalIndex, element: el });
    });
  }

  return stamps;
}

export function findSectionIndexForField(el: Element): {
  readonly index: number;
  readonly kind: GreenhouseSectionKind;
} | null {
  const container = el.closest<HTMLElement>('[data-gh-section-index]');
  if (!container) return null;
  const rawIndex = container.getAttribute(STAMP_ATTR);
  const rawKind = container.getAttribute(STAMP_KIND_ATTR);
  if (rawIndex === null || rawKind === null) return null;
  const index = Number(rawIndex);
  if (!Number.isFinite(index)) return null;
  if (rawKind !== 'employment' && rawKind !== 'education') return null;
  return { index, kind: rawKind };
}
```

### Step 10 -- `src/ats/greenhouse/job-extractor.ts`

Three-tier: JSON-LD via B6 barrel, `window.__remixContext` fallback, DOM scrape last resort.

Import path fix: `from '../../adapters/dom'` (B6 barrel), NOT `from '../../adapters/dom/jsonld-extractor'` or `from '../../core/extraction/jsonld-extractor'`.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

import { extractJobPostingFromDocument } from '../../adapters/dom';
import type { JobPostingData } from '../../core/types';
import {
  GREENHOUSE_COMPANY_HEADER_SELECTORS,
  GREENHOUSE_JOB_TITLE_SELECTORS,
} from './selectors';

/**
 * Extract JobPostingData from a Greenhouse posting page.
 *
 * 1. JSON-LD via B6 extractJobPostingFromDocument (primary, highest fidelity).
 * 2. window.__remixContext fallback for React boards pre-hydration.
 * 3. DOM scrape last resort.
 *
 * Returns null only if all three fail.
 */
export function extractGreenhouseJob(doc: Document): JobPostingData | null {
  const jsonLd = extractJobPostingFromDocument(doc);
  if (jsonLd) return jsonLd;

  const remixData = extractFromRemixContext(doc);
  if (remixData) return remixData;

  return extractFromDom(doc);
}

function extractFromRemixContext(doc: Document): JobPostingData | null {
  const win = doc.defaultView as (Window & { __remixContext?: unknown }) | null;
  if (!win) return null;
  let ctx: unknown;
  try {
    // Defensive: __remixContext may be a Proxy with a throwing get trap.
    ctx = win.__remixContext;
  } catch {
    return null;
  }
  if (!ctx || typeof ctx !== 'object') return null;

  let state: unknown;
  try {
    state = (ctx as Record<string, unknown>)['state'];
  } catch {
    return null;
  }
  if (!state || typeof state !== 'object') return null;

  let loaderData: unknown;
  try {
    loaderData = (state as Record<string, unknown>)['loaderData'];
  } catch {
    return null;
  }
  if (!loaderData || typeof loaderData !== 'object') return null;

  // Remix key shape is verbose -- match any route key that looks like a jobs route.
  let jobPost: unknown = null;
  try {
    for (const [key, route] of Object.entries(loaderData as Record<string, unknown>)) {
      if (!key.includes('jobs_') || !key.includes('job_post_id')) continue;
      if (route && typeof route === 'object' && 'jobPost' in route) {
        jobPost = (route as Record<string, unknown>)['jobPost'];
        break;
      }
    }
  } catch {
    return null;
  }
  if (!jobPost || typeof jobPost !== 'object') return null;

  const jp = jobPost as Record<string, unknown>;
  const title = typeof jp.title === 'string' ? jp.title.trim() : '';
  const description = typeof jp.content === 'string' ? jp.content : '';
  if (!title || !description) return null;

  const locationName = typeof jp.location_name === 'string' ? jp.location_name.trim() : '';
  const jobLocation = locationName
    ? [{ addressLocality: locationName }] as const
    : undefined;

  return {
    title,
    description,
    datePosted: typeof jp.first_published === 'string' ? jp.first_published : undefined,
    employmentType: typeof jp.employment_type === 'string' ? jp.employment_type : undefined,
    hiringOrganization: undefined,
    jobLocation,
    source: 'adapter-specific',
  };
}

function extractFromDom(doc: Document): JobPostingData | null {
  const title = queryFirstText(doc, GREENHOUSE_JOB_TITLE_SELECTORS);
  if (!title) return null;
  const orgName = queryFirstText(doc, GREENHOUSE_COMPANY_HEADER_SELECTORS);
  const descriptionEl = doc.querySelector<HTMLElement>(
    '#content, [data-testid="job-description"], #app_body, main [role="main"]',
  );
  const description = descriptionEl?.textContent?.trim() ?? '';
  if (!description) return null;

  return {
    title,
    description,
    descriptionHtml: descriptionEl?.innerHTML?.trim() || undefined,
    hiringOrganization: orgName ? { name: orgName } : undefined,
    source: 'adapter-specific',
  };
}

function queryFirstText(doc: Document, selectors: ReadonlyArray<string>): string {
  for (const selector of selectors) {
    try {
      const el = doc.querySelector<HTMLElement>(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return '';
}
```

### Step 11 -- `src/ats/greenhouse/adapter.ts` (factory + module-singleton)

This is THE keystone file for B7's D1 conformance. Copied VERBATIM from `03-keystone-contracts.md` section 6 block starting `// src/ats/greenhouse/adapter.ts (B7)`, fleshed out with concrete implementations that wire the vendor-internal helpers into the `AtsAdapter` surface.

Critical shape correctness:

- `createGreenhouseAdapter()` returns `Object.freeze({...})` typed as `AtsAdapter`.
- `kind: 'greenhouse' as const` -- literal type, required by D9.
- `matchesUrl: (url) => boolean` -- delegates to the url-patterns module.
- `scanForm: (doc: Document) => FormModel` -- returns PLAIN FormModel (the slice from `scanGreenhouseForm(doc).formModel`). Internal richness stays internal.
- `fillField: (instruction: FillInstruction) => FillResult` -- resolves `instruction.selector` via `document.querySelector`, extracts the plain string or boolean from `instruction.value`, delegates to vendor-internal `fillGreenhouseField` with `instruction.planId`.
- `attachFile: (instruction, file) => Promise<FillResult>` -- resolves the selector, delegates to `attachGreenhouseResume`.
- `extractJob: (doc) => JobPostingData | null` -- delegates to `extractGreenhouseJob`.
- No `console.*` anywhere. If a selector resolution fails, return `{ok: false, error: 'selector-not-found', ...}` (a B2 FillError).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

import type { AtsAdapter, FillInstruction, FillResult, FormModel } from '../../core/types';
import { matchesUrl } from './url-patterns';
import { scanGreenhouseForm } from './form-scanner';
import { fillGreenhouseField, isDivCombobox } from './field-filler';
import { attachGreenhouseResume } from './file-attacher';
import { selectGreenhouseDropdown } from './dropdown-handler';
import { extractGreenhouseJob } from './job-extractor';

/**
 * Factory for the Greenhouse AtsAdapter. Stateless closure -- Greenhouse has
 * no per-session variant state (unlike Lever which tracks a form variant
 * across scanForm and fillField calls). The factory form is kept for
 * symmetry with B8 (Lever) and B9 (Workday) per decision D17.
 *
 * Returns a frozen object that structurally satisfies the AtsAdapter
 * interface from core/types/ats-adapter.ts (keystone section 2.9).
 */
export function createGreenhouseAdapter(): AtsAdapter {
  return Object.freeze({
    kind: 'greenhouse' as const,

    matchesUrl,

    scanForm(doc: Document): FormModel {
      return scanGreenhouseForm(doc).formModel;
    },

    fillField(instruction: FillInstruction): FillResult {
      const el = resolveInstructionElement(instruction);
      if (!el) {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'selector-not-found',
          instructionPlanId: instruction.planId,
        };
      }

      // File instructions must go through attachFile, not fillField.
      if (instruction.value.kind === 'file') {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'wrong-entry-point-for-file',
          instructionPlanId: instruction.planId,
        };
      }

      // Skip instructions are a no-op (caller decides what to do).
      if (instruction.value.kind === 'skip') {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'value-rejected-by-page',
          instructionPlanId: instruction.planId,
        };
      }

      // Combobox routing: div-based comboboxes require async selectGreenhouseDropdown.
      // Since AtsAdapter.fillField is sync, we report selector-not-found here and
      // let the caller (A8 controller) retry via an async attachFile-style path
      // that the controller knows to invoke for combobox types. A8 uses the
      // returned FillResult's error code to decide whether to promote to async.
      // The preferred path: A8 routes combobox instructions through a dedicated
      // async primitive (not shipped in B7 -- v1.1). For v1.0 POC, combobox
      // fills go through the native <select> path which B5 handles directly.
      if (isDivCombobox(el)) {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'value-rejected-by-page',
          instructionPlanId: instruction.planId,
        };
      }

      const value =
        instruction.value.kind === 'text'
          ? instruction.value.value
          : instruction.value.kind === 'choice'
            ? instruction.value.value
            : instruction.value.kind === 'boolean'
              ? instruction.value.value
              : '';

      return fillGreenhouseField(el, value, instruction.planId);
    },

    async attachFile(instruction: FillInstruction, file: File): Promise<FillResult> {
      const el = resolveInstructionElement(instruction);
      if (!el) {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'selector-not-found',
          instructionPlanId: instruction.planId,
        };
      }
      if (instruction.value.kind !== 'file') {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'wrong-entry-point-for-file',
          instructionPlanId: instruction.planId,
        };
      }
      return attachGreenhouseResume(el, file, instruction.planId);
    },

    extractJob(doc: Document) {
      return extractGreenhouseJob(doc);
    },
  });
}

/**
 * Resolve the element targeted by a FillInstruction. Uses document-level
 * querySelector because adapter methods receive only the instruction (not
 * a root scope). If the selector fails to match, returns null.
 */
function resolveInstructionElement(instruction: FillInstruction): Element | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.querySelector(instruction.selector);
  } catch {
    return null;
  }
}

// Internal re-export of the async combobox helper so v1.1 can route
// combobox instructions through an async path without reshaping the adapter.
export { selectGreenhouseDropdown };
```

### Step 12 -- `src/ats/greenhouse/blueprint.contract.ts` (D22)

Small const file that the CI blueprint-drift watchdog reads. Must export `GREENHOUSE_BLUEPRINT` with the exact field names and types that the global `scripts/check-blueprint-drift.mjs` parser expects.

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const GREENHOUSE_BLUEPRINT = {
  phase: 'B7',
  version: '2.1',
  publicExports: ['adapter', 'createGreenhouseAdapter', 'GREENHOUSE_BLUEPRINT'] as const,
  adapterShape: {
    kind: 'greenhouse',
    members: ['kind', 'matchesUrl', 'scanForm', 'fillField', 'attachFile', 'extractJob'] as const,
  },
  forbiddenImports: [
    'src/ats/lever',
    'src/ats/workday',
    'src/adapters/chrome',
    '@nestjs',
    'chrome.storage',
  ] as const,
  requiredCoverage: 85,
} as const;

export type GreenhouseBlueprint = typeof GREENHOUSE_BLUEPRINT;
```

### Step 13 -- `src/ats/greenhouse/index.ts` (OVERWRITE B1's empty stub)

B1 File 23 creates this file as an empty MPL-headered barrel. B7 OVERWRITES it with the full barrel. Do NOT "create" it -- open it, read B1's header, and replace the body with the barrel exports below. Keep the MPL header intact.

Per keystone section 6, the barrel exports:

1. `createGreenhouseAdapter` (named export, for testers and v1.1 stateful consumers)
2. `adapter: AtsAdapter = createGreenhouseAdapter()` (module-singleton, A8 reads `mod.adapter`)
3. `GREENHOUSE_BLUEPRINT` re-export (CI watchdog finds it by barrel path)

Nothing else leaks. `GREENHOUSE_SELECTORS`, `stampRepeatingSections`, etc. stay internal to the package (not re-exported from `./greenhouse`). If tests need them, tests import directly from `src/ats/greenhouse/selectors` etc. (deep imports into source tree, allowed inside the repo but not across `./greenhouse` as a public surface).

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Original patterns inspired by berellevy/job_app_filler (BSD-3-Clause) -- see NOTICES.md

import type { AtsAdapter } from '../../core/types';
import { createGreenhouseAdapter } from './adapter';

export { createGreenhouseAdapter };
export const adapter: AtsAdapter = createGreenhouseAdapter();
export { GREENHOUSE_BLUEPRINT } from './blueprint.contract';
export type { GreenhouseBlueprint } from './blueprint.contract';
```

Verification after writing: `grep -n "^export" src/ats/greenhouse/index.ts` should show exactly 4 lines:

1. `export { createGreenhouseAdapter };`
2. `export const adapter: AtsAdapter = createGreenhouseAdapter();`
3. `export { GREENHOUSE_BLUEPRINT } from './blueprint.contract';`
4. `export type { GreenhouseBlueprint } from './blueprint.contract';`

No other public surface.

### Step 14 -- `NOTICES.md` append

Append the following block at the bottom of `NOTICES.md` (created in B1, contains MPL-2.0 Mozilla heuristics notice from B3). Do NOT replace the file; APPEND.

```markdown

## src/ats/greenhouse/**

Patterns and algorithms adapted from:

**berellevy/job_app_filler** (https://github.com/berellevy/job_app_filler)
BSD-3-Clause License
Copyright (c) 2024-present, Dovber Levy. All rights reserved.

Specifically derived from:
- `src/inject/app/services/formFields/greenhouse/Sections.ts` (51 LOC, repeating section indexing)
- `src/inject/app/services/formFields/greenhouseReact/Dropdown.ts` (strategy ladder)
- `src/inject/app/services/formFields/greenhouseReact/DropdownSearchable.ts` (type-to-filter technique)
- `src/inject/app/services/formFields/greenhouseReact/File.ts` (__reactProps.onChange file attach)
- `src/inject/app/services/formFields/utils/index.ts` (getReactProps helper)

Full BSD-3-Clause text:

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

**andrewmillercode/Autofill-Jobs** (https://github.com/andrewmillercode/Autofill-Jobs)
MIT License
Copyright (c) 2025 Andrew Miller

The `GREENHOUSE_SELECTORS` field-name seed list in `src/ats/greenhouse/selectors.ts`
cross-references the `fields.greenhouse` map from `src/public/contentScripts/utils.js`
of this project. Selector strings (DOM names) are facts and non-copyrightable;
this acknowledgment is provided as a courtesy and satisfies the MIT attribution
clause for the seed list.
```

### Step 15 -- `scripts/rollback-phase-B7.sh` (D23)

Mechanical rollback script. Reverts `src/ats/greenhouse/` to B1's empty stub, un-appends the `NOTICES.md` Greenhouse section, runs typecheck to verify clean state.

```bash
#!/bin/bash
# scripts/rollback-phase-B7.sh
# Mechanical rollback for Phase B7 -- Greenhouse ATS adapter
set -euo pipefail

echo "Rolling back Phase B7..."

# 1. Delete all B7 production files under src/ats/greenhouse/ (except index.ts, which we restore)
rm -f src/ats/greenhouse/url-patterns.ts
rm -f src/ats/greenhouse/selectors.ts
rm -f src/ats/greenhouse/form-scanner.ts
rm -f src/ats/greenhouse/field-filler.ts
rm -f src/ats/greenhouse/file-attacher.ts
rm -f src/ats/greenhouse/dropdown-handler.ts
rm -f src/ats/greenhouse/repeating-sections.ts
rm -f src/ats/greenhouse/job-extractor.ts
rm -f src/ats/greenhouse/react-props-probe.ts
rm -f src/ats/greenhouse/adapter.ts
rm -f src/ats/greenhouse/blueprint.contract.ts

# 2. Restore index.ts to B1's empty stub
git checkout HEAD -- src/ats/greenhouse/index.ts

# 3. Delete B7 tests
rm -rf tests/ats/greenhouse/

# 4. Revert NOTICES.md
git checkout HEAD -- NOTICES.md

# 5. Verify clean state via typecheck
pnpm tsc --noEmit -p tsconfig.adapter.json

echo "Phase B7 rolled back cleanly."
```

On Windows the executor may adapt to `.ps1` but the bash version is primary (runs in CI on Linux runners).

### Step 16 -- Fixture HTML files (4)

Write the fixtures under `tests/ats/greenhouse/fixtures/`. Each fixture is a minimal realistic Greenhouse form, hand-crafted to avoid copying HTML from live sites. Selector strings come from `GREENHOUSE_SELECTORS`.

**`greenhouse-classic.html`** (approximately 80 lines):

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Acme -- Senior SWE</title></head>
  <body>
    <header>
      <h1 data-testid="company-name">Acme Corp</h1>
    </header>
    <main>
      <h1 class="app-title">Senior Software Engineer</h1>
      <div id="content">Apply to join our engineering team...</div>
      <form id="application_form" action="/applications" method="post" enctype="multipart/form-data">
        <label for="first_name">First Name</label>
        <input type="text" id="first_name" name="job_application[first_name]" required>

        <label for="last_name">Last Name</label>
        <input type="text" id="last_name" name="job_application[last_name]" required>

        <label for="email">Email</label>
        <input type="email" id="email" name="job_application[email]" required>

        <label for="phone">Phone</label>
        <input type="tel" id="phone" name="job_application[phone]">

        <label for="resume">Resume</label>
        <input type="file" id="resume" name="job_application[resume]" accept="application/pdf" required>

        <label for="cover_letter">Cover Letter</label>
        <input type="file" id="cover_letter" name="job_application[cover_letter]" accept="application/pdf">

        <label for="urls--question_1">LinkedIn</label>
        <input type="url" id="urls--question_1" name="job_application[answers_attributes][0][text_value]" placeholder="https://linkedin.com/in/...">

        <label for="urls--question_2">Website</label>
        <input type="url" id="urls--question_2" name="job_application[answers_attributes][1][text_value]" placeholder="https://example.com">

        <label for="candidate-location">Current Location</label>
        <input type="text" id="candidate-location" name="candidate_location">

        <label for="why_company">Why Acme?</label>
        <textarea id="why_company" name="job_application[answers_attributes][2][text_value]"></textarea>

        <label for="gender">Gender</label>
        <select id="gender" name="job_application[demographic_information][gender]">
          <option value=""></option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="nonbinary">Non-binary</option>
          <option value="decline">Decline to self-identify</option>
        </select>

        <label for="race">Race / Ethnicity</label>
        <div id="race" role="combobox" aria-expanded="false">Select...</div>

        <label for="veteran_status">Veteran Status</label>
        <select id="veteran_status" name="job_application[demographic_information][veteran_status]">
          <option value=""></option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="decline">Decline</option>
        </select>

        <label for="disability">Disability</label>
        <select id="disability" name="job_application[demographic_information][disability]">
          <option value=""></option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="decline">Decline</option>
        </select>

        <div class="education--container">
          <label>School Name</label>
          <input type="text" name="education_school_name_0">
        </div>
        <div class="education--container">
          <label>School Name</label>
          <input type="text" name="education_school_name_1">
        </div>

        <button type="submit" id="submit_app">Submit Application</button>
      </form>
    </main>
  </body>
</html>
```

**`greenhouse-react.html`** (approximately 70 lines): similar markup, but `<form action="/applications">` with no id, wraps fields in `<div class="text-input-wrapper">`, uses `div[role="combobox"]` for gender and race, and includes an inline `<script>` that attaches `__reactProps$fake = {onChange: function(e) { this.__lastCall = e; }}` to the text inputs after DOMContentLoaded (for react-props fallback tests).

**`greenhouse-classic-jsonld.html`**: copy of `greenhouse-classic.html` plus an inline JSON-LD block in `<head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Software Engineer",
  "description": "<p>Build distributed systems at Acme...</p>",
  "datePosted": "2026-01-15",
  "validThrough": "2026-04-15",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "Acme Corp",
    "logo": "https://acme.example/logo.png"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "San Francisco",
      "addressRegion": "CA",
      "addressCountry": "USA"
    }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": {
      "@type": "QuantitativeValue",
      "minValue": 150000,
      "maxValue": 220000,
      "unitText": "YEAR"
    }
  }
}
</script>
```

**`greenhouse-remix-context.html`**: copy of `greenhouse-react.html` plus this `<script>` before the form:

```html
<script>
  window.__remixContext = {
    state: {
      loaderData: {
        "routes/$url_token_.jobs_.$job_post_id": {
          jobPost: {
            id: 12345,
            title: "Senior SWE",
            content: "<p>desc</p>",
            location_name: "Remote",
            first_published: "2026-01-15",
            employment_type: "FULL_TIME"
          }
        }
      }
    }
  };
</script>
```

### Step 17 -- Tests (8 spec files)

All test files begin with the 5-line MPL-2.0 header plus, where the test exercises berellevy-derived logic, the 2-line attribution. Happy-dom environment is set via vitest project config from B1.

#### `tests/ats/greenhouse/adapter-contract.spec.ts` (D18)

```ts
import { describe, it, expect } from 'vitest';
import { adapter } from '../../../src/ats/greenhouse';
import type { AtsAdapter, FillInstruction, PlanId } from '../../../src/core/types';

// Compile-time assertion: adapter satisfies AtsAdapter structurally.
const _typeCheck: AtsAdapter = adapter;
void _typeCheck;

describe('greenhouse adapter contract (D18)', () => {
  it('exports a module-singleton adapter named "adapter"', () => {
    expect(adapter).toBeDefined();
    expect(typeof adapter).toBe('object');
  });

  it('kind is the literal "greenhouse"', () => {
    expect(adapter.kind).toBe('greenhouse');
  });

  it('all required AtsAdapter members are present', () => {
    expect(typeof adapter.matchesUrl).toBe('function');
    expect(typeof adapter.scanForm).toBe('function');
    expect(typeof adapter.fillField).toBe('function');
    expect(typeof adapter.attachFile).toBe('function');
    expect(typeof adapter.extractJob).toBe('function');
  });

  it('does NOT expose Workday-only members', () => {
    expect(adapter.detectCurrentStep).toBeUndefined();
    expect(adapter.watchForStepChange).toBeUndefined();
    expect(adapter.scanStep).toBeUndefined();
    expect(adapter.fillStep).toBeUndefined();
  });

  it('frozen adapter rejects mutation of kind', () => {
    expect(() => {
      (adapter as { kind: string }).kind = 'other';
    }).toThrow(TypeError);
    expect(adapter.kind).toBe('greenhouse');
  });

  it('frozen adapter rejects addition of new properties', () => {
    expect(() => {
      (adapter as unknown as { hacked: true }).hacked = true;
    }).toThrow(TypeError);
  });

  it('matchesUrl returns boolean', () => {
    expect(adapter.matchesUrl('https://boards.greenhouse.io/acme/jobs/12345')).toBe(true);
    expect(adapter.matchesUrl('https://lever.co/foo')).toBe(false);
  });

  it('scanForm returns plain FormModel shape (no GH-specific fields leaked)', () => {
    document.body.innerHTML = '<form id="application_form"><input id="first_name" /></form>';
    const m = adapter.scanForm(document);
    expect(m).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      scannedAt: expect.any(String),
      fields: expect.any(Array),
    });
    // sourceATS SHOULD be set by the adapter
    expect(m.sourceATS).toBe('greenhouse');
  });

  it('fillField returns FillResult discriminated union', () => {
    document.body.innerHTML = '<input id="first_name" type="text" />';
    const instruction: FillInstruction = {
      selector: '#first_name',
      field: 'firstName' as FillInstruction['field'],
      value: { kind: 'text', value: 'Ada' },
      priority: 1,
      planId: 'plan-test' as PlanId,
    };
    const r = adapter.fillField(instruction);
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('selector');
    expect(r).toHaveProperty('instructionPlanId');
    if (!r.ok) expect(r).toHaveProperty('error');
  });
});
```

#### `tests/ats/greenhouse/url-patterns.spec.ts` (D19 adversarial)

```ts
import { describe, it, expect } from 'vitest';
import { matchesUrl, matchUrlDetail, findEmbeddedGreenhouseIframes } from '../../../src/ats/greenhouse/url-patterns';

describe('matchesUrl -- happy path', () => {
  it('matches classic boards.greenhouse.io', () => {
    expect(matchesUrl('https://boards.greenhouse.io/acme/jobs/12345')).toBe(true);
  });
  it('matches classic EU', () => {
    expect(matchesUrl('https://boards.eu.greenhouse.io/acme-eu/jobs/67890')).toBe(true);
  });
  it('matches React boards', () => {
    expect(matchesUrl('https://job-boards.greenhouse.io/gitlab/jobs/8481922002')).toBe(true);
  });
  it('matches embed iframe', () => {
    expect(matchesUrl('https://boards.greenhouse.io/embed/job_app?token=abc')).toBe(true);
  });
});

describe('matchesUrl -- adversarial (D19)', () => {
  it('rejects javascript: scheme', () => {
    expect(matchesUrl('javascript:alert(1)')).toBe(false);
    expect(matchesUrl('JavaScript:alert(1)')).toBe(false);
  });
  it('rejects data: scheme', () => {
    expect(matchesUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
  it('rejects vbscript: scheme', () => {
    expect(matchesUrl('vbscript:msgbox(1)')).toBe(false);
  });
  it('rejects subdomain impersonation', () => {
    expect(matchesUrl('https://boards.greenhouse.io.evil.example/acme/jobs/1')).toBe(false);
    expect(matchesUrl('https://evilboards.greenhouse.io/acme/jobs/1')).toBe(false);
  });
  it('rejects unicode slug (charset [a-z0-9_-] only)', () => {
    expect(matchesUrl('https://boards.greenhouse.io/\u00e9crivain/jobs/123')).toBe(false);
  });
  it('rejects empty + null + non-string', () => {
    expect(matchesUrl('')).toBe(false);
    // @ts-expect-error -- intentional null for adversarial test
    expect(matchesUrl(null)).toBe(false);
    // @ts-expect-error
    expect(matchesUrl(undefined)).toBe(false);
    // @ts-expect-error
    expect(matchesUrl(42)).toBe(false);
    // @ts-expect-error
    expect(matchesUrl({})).toBe(false);
  });
  it('rejects NaN jobId pattern', () => {
    expect(matchesUrl('https://boards.greenhouse.io/acme/jobs/NaN')).toBe(false);
    expect(matchesUrl('https://boards.greenhouse.io/acme/jobs/abc')).toBe(false);
  });
  it('rejects non-greenhouse domains', () => {
    expect(matchesUrl('https://jobs.lever.co/foo/bar')).toBe(false);
    expect(matchesUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIA')).toBe(false);
    expect(matchesUrl('https://example.com/path')).toBe(false);
  });
});

describe('matchUrlDetail', () => {
  it('returns variant classic', () => {
    expect(matchUrlDetail('https://boards.greenhouse.io/acme/jobs/12345')).toEqual({
      org: 'acme', jobId: '12345', variant: 'classic',
    });
  });
  it('returns variant react', () => {
    expect(matchUrlDetail('https://job-boards.greenhouse.io/gitlab/jobs/99')).toEqual({
      org: 'gitlab', jobId: '99', variant: 'react',
    });
  });
  it('returns null for non-match', () => {
    expect(matchUrlDetail('https://example.com')).toBeNull();
  });
});

describe('findEmbeddedGreenhouseIframes', () => {
  it('finds iframes with matching src', () => {
    document.body.innerHTML = `
      <iframe src="https://boards.greenhouse.io/embed/job_app?token=x"></iframe>
      <iframe src="https://other.com/unrelated"></iframe>
    `;
    const iframes = findEmbeddedGreenhouseIframes(document);
    expect(iframes).toHaveLength(1);
  });
  it('returns empty array when none match', () => {
    document.body.innerHTML = '<iframe src="https://other.com"></iframe>';
    expect(findEmbeddedGreenhouseIframes(document)).toEqual([]);
  });
});
```

#### `tests/ats/greenhouse/form-scanner.spec.ts`

Loads `greenhouse-classic.html` via `fs.readFileSync(__dirname + '/fixtures/greenhouse-classic.html', 'utf-8')` then `document.documentElement.innerHTML = fixture;` then calls `scanGreenhouseForm(document)`. Asserts:

- `formModel.fields.length >= 10`
- `formModel.sourceATS === 'greenhouse'`
- `formModel.formRootSelector === '#application_form'`
- `selectorMatches.size >= 8` with the expected keys (`firstName`, `lastName`, `email`, `phone`, `resume`, `coverLetter`, `gender`, `linkedinUrl`)
- fields inside `<fieldset disabled>` are excluded (build a synthetic fixture variant in-test)
- **Adversarial (D19)**: form with 300 synthetic fields (`for (let i = 0; i < 300; i++) { form.appendChild(input) }`) completes in under 100ms (performance check for the single-pass fix)
- **Adversarial**: duplicate `#first_name` (two inputs with same id) -- both are captured as descriptors but only one maps to `firstName` fieldKey (first match wins)
- **Adversarial**: XSS attribute values -- `<input placeholder="<script>alert(1)</script>">` is scanned and the descriptor's `placeholder` field contains the literal string (pass-through, no escaping)
- **Adversarial**: unicode field value `aria-label="\u00e9crivain"` is captured unchanged
- `findFormRoot(document)` returns the form element
- When no form root exists (empty document), returns `null` and `scanGreenhouseForm` falls back to document scope

Test uses actual `scanGreenhouseForm` from `../../../src/ats/greenhouse/form-scanner`. No mocks -- B5 `scan` is exercised end-to-end via happy-dom.

#### `tests/ats/greenhouse/field-filler.spec.ts`

Tests `fillGreenhouseField(el, value, planId, hints)` directly.

- Fill `#first_name` with `'Ada'` -- returns `{ok: true, selector: '#first_name', instructionPlanId}`, DOM value is `'Ada'`, `input`/`change`/`blur` events fired (spy via `addEventListener`)
- Fill with empty string -- B5 handles; returns per B5 contract
- **D19 pass-through**: null bytes (`'foo\x00bar'`), 10KB payload, unicode (`'\u00e9'`), RTL (`'\u202efoo\u202c'`), combining chars (`'e\u0301'`), surrogate pairs (`'\ud83d\ude00'`) -- all pass through unchanged; DOM value matches input exactly
- **D19 injection**: `<script>alert(1)</script>`, `"';--`, path traversal `'../../etc/passwd'` -- all pass through; the adapter is NOT a sanitizer
- **D19 readonly element**: filling a `readonly` input returns `{ok: false, error: 'value-rejected-by-page'}` (B5 handles this)
- **D19 disabled element**: filling a `disabled` input returns `{ok: false, error: 'element-disabled'}` (B5)
- **B5 contract sync assertion**: `const r = fillField(el, 'x'); expect(r).toHaveProperty('ok');` -- verifies the call returns synchronously (not a Promise)
- **React-props fallback**: mock a `__reactProps$fake.onChange` on a text input that does NOT allow B5's native setter to stick (simulate by using `Object.defineProperty` to make the value setter a no-op). The filler attempts the fallback, invokes onChange, and RE-READS the DOM. Because the value setter is still a no-op, the re-read fails to confirm and the filler returns the original B5 error (not a fake success).
- **Concurrent re-entry (D19)**: fire `fillGreenhouseField(el, 'a', planId)` and `fillGreenhouseField(el, 'b', planId)` without awaiting the first. Both return synchronously; the second call wins (DOM value is `'b'`).

#### `tests/ats/greenhouse/dropdown-handler.spec.ts`

Tests `selectGreenhouseDropdown(combobox, value, planId, opts)` with small `timeoutMs` (e.g. 50) for fast tests.

- All three strategies exercised individually via `opts.strategy`
- Fallback chain: build a combobox where type-filter fails (no input descendant), click-option fails (no option list), react-props succeeds -- result is `{ok: true}`
- **D19 stress**: 50-option synthetic list -- `findOptionByText` returns correct match in a single pass
- **D19 timeout**: combobox never populates options -- with `timeoutMs: 50`, returns `{ok: false, error: 'value-rejected-by-page'}` within 100ms
- **D19 empty value**: empty string -- returns failure fast (no iteration through candidates)
- **D19 unicode value**: `'\u00e9crivain'` matches an option with that text (case-insensitive)
- `isDivCombobox` returns true for `<div role="combobox">`, `<div class="react-select__container">`, and false for `<input>`

#### `tests/ats/greenhouse/file-attacher.spec.ts`

Tests `attachGreenhouseResume(input, file, planId)`.

- Primary DataTransfer path: create a File via `new File(['content'], 'resume.pdf', {type: 'application/pdf'})`, attach to `#resume`, verify `input.files?.[0].name === 'resume.pdf'`
- Non-file input: passing a text input returns `{ok: false, error: 'wrong-entry-point-for-file'}`
- **D19 zero-byte File**: `new File([], 'empty.pdf')` -- attaches successfully (Greenhouse accepts)
- **D19 path-traversal name**: `new File(['x'], '../../etc/passwd')` -- attaches as-is (sanitization is not the adapter's job)
- **D19 unusual MIME**: `new File(['x'], 'resume.bin', {type: 'application/x-executable'})` -- attaches (backend validates)
- **React-props fallback**: mock `__reactProps$fake.onChange` on the file input, make B5 return `{ok: false, error: 'file-attach-failed'}`, verify fallback invokes handler. The post-invoke read (`input.files?.[0]?.name === file.name`) must actually succeed (in happy-dom with a mock, simulate by having the onChange handler manually assign to `input.files` via the test double).

Note on happy-dom `DataTransfer`: B5 ships a shim (`tests/setup/happy-dom-shims.ts`). B7 tests import the shim via a vitest setup file or rely on B5's auto-setup -- the test file does NOT reinvent the shim.

#### `tests/ats/greenhouse/job-extractor.spec.ts`

- Load `greenhouse-classic-jsonld.html` -- `extractGreenhouseJob(document)` returns `{title: 'Senior Software Engineer', description: ..., hiringOrganization: {name: 'Acme Corp'}, source: 'json-ld'}`
- Load `greenhouse-remix-context.html` -- `extractGreenhouseJob(document)` returns `{title: 'Senior SWE', description: '<p>desc</p>', jobLocation: [{addressLocality: 'Remote'}], datePosted: '2026-01-15', employmentType: 'FULL_TIME', source: 'adapter-specific'}`
- Load `greenhouse-classic.html` (no JSON-LD, no remix) -- DOM scrape falls back, returns at minimum `{title: 'Senior Software Engineer', description: ..., source: 'adapter-specific'}`
- Empty document -- returns `null`
- **D19 `__remixContext = null`**: set `(window as any).__remixContext = null` -- returns from DOM scrape, not the remix branch
- **D19 `__remixContext = undefined`**: same
- **D19 Proxy with throwing get**: `(window as any).__remixContext = new Proxy({}, {get() {throw new Error('boom')}})` -- the try/catch around each property access returns null from the remix branch, falls through to DOM scrape
- **D19 malformed JSON-LD**: inject `<script type="application/ld+json">{not valid}</script>` -- B6's extractor returns null (its own contract), adapter falls through to remix then DOM
- **D19 missing fields in remix**: `jobPost: {title: 'x'}` (no content) -- returns null from remix branch, falls through

#### `tests/ats/greenhouse/headers-and-exports.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GH_SRC = resolve(__dirname, '../../../src/ats/greenhouse');

describe('MPL-2.0 header presence (D15 + D22)', () => {
  const files = readdirSync(GH_SRC).filter((f) => f.endsWith('.ts'));

  it('every src/ats/greenhouse/*.ts starts with MPL header in first 5 lines', () => {
    for (const file of files) {
      const content = readFileSync(join(GH_SRC, file), 'utf-8');
      const firstFive = content.split('\n').slice(0, 5).join('\n');
      expect(firstFive, `file ${file} is missing MPL header`).toContain(
        'Mozilla Public'
      );
    }
  });
});

describe('package.json exports shape (D22)', () => {
  it('./greenhouse uses {types, import, require} exactly', () => {
    const pkgPath = resolve(__dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const entry = pkg.exports['./greenhouse'];
    expect(entry).toBeDefined();
    expect(Object.keys(entry).sort()).toEqual(['import', 'require', 'types']);
    expect(entry.types).toBe('./dist/ats/greenhouse/index.d.ts');
    expect(entry.import).toBe('./dist/ats/greenhouse/index.js');
    expect(entry.require).toBe('./dist/ats/greenhouse/index.cjs');
    expect(entry.default).toBeUndefined();
  });
});

describe('blueprint contract (D22)', () => {
  it('GREENHOUSE_BLUEPRINT exports expected shape', async () => {
    const { GREENHOUSE_BLUEPRINT } = await import('../../../src/ats/greenhouse');
    expect(GREENHOUSE_BLUEPRINT.phase).toBe('B7');
    expect(GREENHOUSE_BLUEPRINT.version).toBe('2.1');
    expect(GREENHOUSE_BLUEPRINT.adapterShape.kind).toBe('greenhouse');
    expect(GREENHOUSE_BLUEPRINT.requiredCoverage).toBe(85);
    expect(GREENHOUSE_BLUEPRINT.forbiddenImports).toContain('src/ats/lever');
    expect(GREENHOUSE_BLUEPRINT.forbiddenImports).toContain('src/ats/workday');
  });
});

describe('no console.* in src/ats/greenhouse', () => {
  it('every production file is free of console.log/info/warn/error/debug', () => {
    const files = readdirSync(GH_SRC).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const content = readFileSync(join(GH_SRC, file), 'utf-8');
      expect(content, `file ${file} contains a console.* call`).not.toMatch(
        /\bconsole\.(log|info|warn|error|debug)\b/
      );
    }
  });
});
```

### Step 18 -- Run tests and fix issues

```bash
cd e:/ats-autofill-engine
pnpm tsc --noEmit -p tsconfig.adapter.json
pnpm vitest run tests/ats/greenhouse/
```

All specs must pass. Fix source, not tests, unless a test is genuinely broken. If happy-dom lacks DataTransfer, reuse B5's shim per Step 17 `file-attacher.spec.ts` note.

### Step 19 -- Verify anti-drift gates (D14)

Run the following five checks in order. All must pass before declaring the phase complete:

1. **Forbidden token grep**:
   ```bash
   grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/ats/greenhouse tests/ats/greenhouse && exit 1 || true
   grep -rE '\bconsole\.(log|info|warn|error|debug)' src/ats/greenhouse && exit 1 || true
   grep -rE '\u2014' src/ats/greenhouse tests/ats/greenhouse && exit 1 || true
   grep -rE 'from .(\.\./\.\./ats/lever|\.\./\.\./ats/workday|\.\./\.\./adapters/chrome).' src/ats/greenhouse && exit 1 || true
   grep -rE '@nestjs' src/ats/greenhouse && exit 1 || true
   ```

2. **Type-level contract assertion** (built into `adapter-contract.spec.ts`): `const _typeCheck: AtsAdapter = adapter;` line -- compile error if shape drifts.

3. **Exports-map resolution test**:
   ```bash
   # Build first, then resolve
   pnpm build
   node -e "import('ats-autofill-engine/greenhouse').then(m => { if (!('adapter' in m)) { console.error('missing adapter export'); process.exit(1); } if (m.adapter.kind !== 'greenhouse') { console.error('wrong kind'); process.exit(1); } console.log('OK'); });"
   ```

4. **Cross-phase contract snapshot**: `src/ats/greenhouse/blueprint.contract.ts` IS the contract snapshot for this phase. CI runs `scripts/check-blueprint-drift.mjs` (shipped by B1) to parse every blueprint.contract.ts and verify. B7 makes sure the file exports the exact shape the parser expects -- see Step 12.

5. **Zod round-trip**: not applicable to B7 (no Zod-validated runtime boundary; the adapter does not parse external payloads).

## Acceptance criteria

- [ ] All 21 files (10 production src, 1 blueprint contract, 1 rollback script, 8 test specs) exist at their specified paths
- [ ] 4 fixture HTML files exist under `tests/ats/greenhouse/fixtures/`
- [ ] `src/ats/greenhouse/index.ts` has been overwritten (not newly created) and exports exactly `createGreenhouseAdapter`, `adapter: AtsAdapter = createGreenhouseAdapter()`, `GREENHOUSE_BLUEPRINT`, `GreenhouseBlueprint`
- [ ] Every production source + test file starts with the 5-line MPL-2.0 header (3 `//` lines plus 1 blank plus first import); derived files add the 2-line berellevy attribution
- [ ] `pnpm tsc --noEmit -p tsconfig.adapter.json` emits zero errors
- [ ] `pnpm vitest run tests/ats/greenhouse/` passes with zero failures
- [ ] `adapter.kind === 'greenhouse'` at runtime
- [ ] `adapter satisfies AtsAdapter` at compile time (typeCheck line in `adapter-contract.spec.ts`)
- [ ] Adapter is frozen: mutation attempts throw TypeError
- [ ] `package.json` `exports["./greenhouse"]` is `{types, import, require}` (verified by `headers-and-exports.spec.ts`); B7 has NOT written package.json
- [ ] `NOTICES.md` contains the appended Greenhouse section with full BSD-3-Clause text + MIT acknowledgment
- [ ] `scripts/rollback-phase-B7.sh` is executable and succeeds on a throwaway branch
- [ ] `GREENHOUSE_BLUEPRINT.phase === 'B7'`, `version === '2.1'`, `adapterShape.kind === 'greenhouse'`, `requiredCoverage === 85`
- [ ] Test coverage for `src/ats/greenhouse/**` is at least 85% lines and 80% branches per D24 floor
- [ ] `scanGreenhouseForm` on `greenhouse-classic.html` yields `formModel.fields.length >= 10` and `selectorMatches.size >= 8`
- [ ] `fillGreenhouseField` correctly sets DOM values AND re-reads to verify (no fake verification)
- [ ] B5 `fillField` is called SYNCHRONOUSLY (no `await`) and the result is read via `.error`, NOT `.reason`
- [ ] B5 `attachFile` is properly `await`-ed; its `FillResult` error codes are read via `.error`
- [ ] `extractGreenhouseJob` returns valid `JobPostingData` for JSON-LD, Remix, and DOM fallback fixtures; returns `null` for empty doc
- [ ] `matchesUrl` returns `true` for all 4 URL shapes and `false` for `javascript:`, `data:`, subdomain impersonation, unicode slug, non-string, empty
- [ ] B7 has NOT run `pnpm publish` (D12); only B9 publishes alpha.2
- [ ] No `src/ats/greenhouse/**` file imports from `src/ats/lever`, `src/ats/workday`, `src/adapters/chrome`, `@nestjs`, or uses `chrome.*`
- [ ] No `src/ats/greenhouse/**` file contains a `console.*` call (enforced by `headers-and-exports.spec.ts`)
- [ ] No em-dash characters (U+2014) in any B7 source, test, fixture, or plan file (D15)
- [ ] Files are 50-340 LoC each; no file exceeds 400 LoC
- [ ] All 6 D19 adversarial categories are exercised in at least one spec each

## Out of scope (explicitly deferred)

- **Lever adapter** -- B8. No Lever selectors, no `urls[X]` / `eeo[X]` nested naming convention appear in any B7 file.
- **Workday adapter** -- B9. No `data-automation-id` XPath selectors, no `WorkdayBaseInput`, no wizard primitives.
- **Ashby adapter** -- v1.1.
- **Multi-step wizard traversal** -- Greenhouse is single-page; no B7 code assumes wizard state.
- **Auto-submit** -- `GREENHOUSE_SUBMIT_SELECTORS` exists for diagnostics only; zero `click()` calls on submit buttons anywhere.
- **Live-site E2E tests** -- happy-dom unit tests only in B7; live verification in A11 Day 6.
- **Chrome extension integration** -- A8 wires the adapter; B7 is engine-only.
- **Content script dynamic import** -- A8's `adapter-loader.ts` does `await import('ats-autofill-engine/greenhouse')` and reads `mod.adapter`. B7 guarantees the `adapter` named export exists and satisfies `AtsAdapter`.
- **i18n of field labels** -- English only; v1.1.
- **`skill-taxonomy` integration** -- keyword matching is server-side via A3, highlight rendering is B6, wiring is A9. B7 does not touch any of this.
- **Custom-question intelligent routing** -- the `customTextAnswer` selector is a generic catch-all; semantic routing of profile data into custom questions is B4's `buildFillPlan` responsibility.
- **npm publishing** -- D12: B7 does not publish. B9 publishes alpha.2.
- **Zod schemas for the adapter surface** -- `AtsAdapter` is a pure TypeScript interface; the adapter has no runtime payload boundary of its own. Zod lives in B2 (profile) and A5 (ProtocolMap handlers).

## Blueprint drift check

This phase implements the Greenhouse piece of the `AtsAdapter` contract from `03-keystone-contracts.md` section 2.9. The blueprint drift watchdog (D22) reads `src/ats/greenhouse/blueprint.contract.ts` and verifies:

1. `publicExports` list matches actual exports in `src/ats/greenhouse/index.ts`
2. `forbiddenImports` are absent from every file under `src/ats/greenhouse/**`
3. `adapterShape.members` list matches the set of keys on the frozen `adapter` object at runtime
4. `requiredCoverage` is met or exceeded by the vitest coverage report

If the executor discovers that B1 has drift (e.g. `./greenhouse` uses `default` instead of `require`, or B1's File 23 stub is missing), STOP and file a B1 corrective plan; B7 does NOT fix B1.

If the executor discovers that B2 has drift (e.g. `AtsAdapter` is not exported from `core/types/index.ts`), STOP and file a B2 corrective plan.

If the executor discovers that B5 has drift (e.g. `fillField` is async or `attachFile` is sync), STOP and file a B5 corrective plan. B7 does NOT work around B5 drift.

## Rollback plan (mechanical, per D23)

See `scripts/rollback-phase-B7.sh` in Step 15. Rollback is mechanical, not prose. On failure:

1. Execute `bash scripts/rollback-phase-B7.sh` (or the PS1 equivalent on Windows)
2. Confirm `pnpm tsc --noEmit -p tsconfig.adapter.json` exits 0 in the rolled-back state
3. Report to orchestrator with the specific failure mode (test name, stack trace, file path)

## Compliance checklist (run before declaring phase complete)

- [ ] `pnpm tsc --noEmit -p tsconfig.adapter.json` -- zero errors
- [ ] `pnpm eslint src/ats/greenhouse tests/ats/greenhouse` -- zero errors, zero warnings
- [ ] `pnpm vitest run tests/ats/greenhouse/` -- all specs pass
- [ ] `pnpm vitest run tests/ats/greenhouse/ --coverage` -- lines >= 85%, branches >= 80%
- [ ] `grep -rE '\bconsole\.(log|info|warn|error|debug)' src/ats/greenhouse tests/ats/greenhouse` -- no matches
- [ ] `grep -rE '@nestjs|chrome\.' src/ats/greenhouse` -- no matches
- [ ] `grep -rE 'src/ats/lever|src/ats/workday|src/adapters/chrome' src/ats/greenhouse` -- no matches
- [ ] `grep -rE '\u2014' src/ats/greenhouse tests/ats/greenhouse phase_B7_greenhouse_adapter/plan.md` -- no matches (D15)
- [ ] Every .ts file under `src/ats/greenhouse/` begins with the MPL-2.0 header (3 `//` lines starting with `This Source Code Form`)
- [ ] `NOTICES.md` contains the appended Greenhouse block with the BSD-3-Clause reproduction and MIT acknowledgment
- [ ] `package.json` `exports["./greenhouse"]` matches `{types, import, require}` -- B7 did NOT modify it
- [ ] `git status` shows exactly: 10 new src files, 1 blueprint contract, 1 rollback script, 8 new test files, 4 new fixture files, 1 modified `NOTICES.md`, 1 modified `src/ats/greenhouse/index.ts` (overwritten from B1 stub)
- [ ] Type-level assertion in `adapter-contract.spec.ts` (`const _typeCheck: AtsAdapter = adapter;`) compiles without error
- [ ] Runtime assertion `adapter.kind === 'greenhouse'` passes
- [ ] Frozen-mutation test throws TypeError for both property assignment and property addition
- [ ] B7 has NOT run `pnpm publish` or `pnpm publish --dry-run` (D12; that is B9's job)
- [ ] `scripts/rollback-phase-B7.sh` succeeds on a throwaway branch
- [ ] `scripts/check-blueprint-drift.mjs` (shipped by B1, or by a CI gate) resolves `GREENHOUSE_BLUEPRINT` and finds no discrepancy
- [ ] D19 adversarial categories 1-6 each exercised in at least one spec:
  - [ ] 1 null/undefined/NaN/Infinity -- `url-patterns.spec.ts`
  - [ ] 2 empty + max collections -- `form-scanner.spec.ts` (300-field stress), `dropdown-handler.spec.ts` (50-option)
  - [ ] 3 unicode edge cases -- `field-filler.spec.ts` (RTL, combining, surrogate, null byte), `form-scanner.spec.ts`
  - [ ] 4 injection -- `field-filler.spec.ts`, `form-scanner.spec.ts` (XSS attr)
  - [ ] 5 concurrent re-entry -- `field-filler.spec.ts`
  - [ ] 6 adversarial state -- `job-extractor.spec.ts` (Proxy throwing get)
