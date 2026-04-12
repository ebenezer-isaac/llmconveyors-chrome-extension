# Phase B9 -- Workday ATS Adapter (Multi-Step Wizard Primitives) + Engine Publish `0.1.0-alpha.2`

## Phase metadata

- **Plan**: 100 (Chrome Extension POC + V1)
- **Plan version**: 2.1 (locked, keystone contracts authoritative)
- **Phase**: B9 (final phase of Plan B -- Autofill Engine)
- **Repo**: `e:/ats-autofill-engine` (OSS repo; B1 already reserved `ats-autofill-engine@0.1.0-alpha.1` with empty-barrel stubs; B9 ships real adapters as `0.1.0-alpha.2`)
- **Day**: 5 of 6 (2026-04-16 Friday)
- **Parallelism**: source work runs in parallel with B7 (Greenhouse) and B8 (Lever); the PUBLISH sub-phase runs **sequentially after** B7, B8, B9 source all complete and pass their local compliance gates
- **Depends on**:
  - B1 -- Engine scaffold (tsconfig, tsup exports map with `./workday` entry placeholder, CI, license headers, `ats-autofill-engine@0.1.0-alpha.1` published as empty-barrel)
  - B2 -- Core types + Profile schema: `Profile`, `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillValue`, `FillResult`, `FillError`, `FillPlan`, `FillPlanResult`, `AbortReason`, `SkipReason`, `AtsAdapter`, `AtsKind`, `WorkdayWizardStep`, `JobPostingData`, `PlanId`, `ResumeHandleId`
  - B3 -- Mozilla heuristics port (Workday rarely hits this path since `data-automation-id` is primary, but the classifier still routes here as fallback)
  - B4 -- Classifier + fill rules + plan builder (Workday adds widget-specific `FieldType` extensions: `workday-dropdown`, `workday-searchable-select`, `workday-date-picker`)
  - B5 -- DOM adapter function surface: `scan(root, opts)`, `fillField(el, value, opts)`, `attachFile(input, file, opts)`, `watchForm(root, cb, opts)` plus types `ScanOptions`, `FillableElement`, `FillFailureReason`, `AttachFailureReason`, `WatchOptions`, `MutationCallback`, `CleanupFn`, and low-level helpers `invokeNativeSetter`, `fireEvent`, `fireInputEvent`, `fireBeforeInput`, `fireComboboxClickSequence`
- **Blocks**:
  - A8 -- content script imports `ats-autofill-engine/workday` via static import; wizard orchestration loop lives in A8 per D6
  - A11 -- E2E test suite covers full 4-step wizard traversal across 3 tenants
  - npm publish `0.1.0-alpha.2` release to the public registry
- **Estimated effort**: **14-18 hours** (largest phase in Plan B; multi-step wizard + factory pattern + adapter-contract test + 3-tenant fixture capture + publish hardening)
- **Licence**: every file under `src/ats/workday/**` ships with the **MPL-2.0** file header (C-style `//` lines per D14 grep gate parity) plus a berellevy BSD-3-Clause attribution line where the file contains patterns forked from `berellevy/job_app_filler`. Every forked file retains the copyright notice.
- **Decisions applied**: D1 (AtsAdapter canonical shape), D6 (A8 owns wizard loop, B9 exposes primitives), D7 (FillPlanResult), D8 (SkipReason vs FillError), D9 (AtsKind), D12 (npm publish hardening), D13 (alpha.2 version trajectory), D14 (anti-drift gates), D15 (zero em-dashes), D17 (factory pattern), D18 (adapter-contract spec), D19 (adversarial test categories), D22 (blueprint.contract.ts CI gate), D23 (rollback script), D25 (multi-tenant fixtures)

---

## Goal

Deliver an MPL-2.0 Workday ATS adapter that exposes **stateless primitives** for a full multi-step wizard traversal and satisfies the D1 canonical `AtsAdapter` shape, then publish the engine as `ats-autofill-engine@0.1.0-alpha.2` to npm with provenance + dry-run + 2FA verification.

The adapter covers the four pages of the standard Workday candidate application flow:

1. **My Information** -- personal info (name, address, phone, email, country, preferred name, source, opt-in) -- at least 18 fields
2. **My Experience** -- work history (repeating), education (repeating), languages (repeating), resume upload -- at least 22 per-row fields across sections
3. **Voluntary Disclosures** -- EEO demographics (**consent-gated**, off by default), work authorisation, veteran status, disability status, terms checkbox
4. **Review** -- read-only verification (no fill; the adapter scans rendered values and reports them for user verification)

The adapter module ships as a drop-in sub-entry of the `ats-autofill-engine` package:

```ts
import { adapter, createWorkdayAdapter, WORKDAY_BLUEPRINT } from 'ats-autofill-engine/workday';
```

`adapter` is a module-singleton `AtsAdapter` constructed via `Object.freeze(createWorkdayAdapter())`. `createWorkdayAdapter()` is the factory; consumers that need isolated instances (tests, multi-tab scenarios) construct their own via the factory.

The adapter must pass happy-dom unit tests against **12 HTML fixture files** (3 tenants x 4 wizard steps) plus a manual smoke test against one live public Workday tenant.

### Behavioural constraints (hard, non-negotiable)

- The extension / adapter **NEVER auto-advances** between wizard steps. The user manually clicks Workday's "Save and Continue" button.
- The adapter **detects the new wizard step** after each page transition via a stateless `detectCurrentStep(doc)` primitive plus a MutationObserver-based `watchForStepChange(doc, onChange)` subscription that calls back on step boundary.
- **A8 owns the wizard orchestration loop**, not B9. B9 exposes `detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep` as pure/stateless functions; A8's `AutofillController` holds the `currentStep` in closure and dispatches `fillStep` when the user clicks the popup Fill button.
- File upload (resume) attempts DataTransfer; if Workday's drag-drop widget rejects it, the adapter surfaces `workday-drag-drop-rejected` with a `userMessage` guiding the user to drag manually.
- EEO demographic fields on the Voluntary Disclosures page are **consent-gated**. `fillVoluntaryDisclosures` short-circuits with **zero DOM mutations** when `profile.consents.allowEeoAutofill !== true` OR `profile.demographics === undefined`. The gate is verified in tests via DOM-setter spies (`HTMLInputElement.prototype.value`, `HTMLElement.prototype.click`, `dispatchEvent`).
- The adapter **NEVER auto-submits** the final Review page. Submit is exclusively a user action. The Review scanner is read-only and a dedicated test asserts zero DOM mutation methods are called during a scan.

### Publish sub-phase goal

After B7 + B8 + B9 source work all pass their local compliance gates, the B9 executor runs the publish sub-phase that bumps version to `0.1.0-alpha.2`, runs the D12 publish hardening (tarball dry-run, forbidden-token grep, provenance, 2FA prompt, post-publish verification), and pushes the `v0.1.0-alpha.2` tag. A8 then picks up the published package as its static dependency.

---

## Required reading (in this order, before any code is written)

**Executor context budget: 64K. Read these in order, skim the ones marked [SKIM], stop as soon as you can start.**

1. **`temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`** [FULL READ] -- all D1-D25 decisions locked. Focus on D1 (canonical AtsAdapter shape), D6 (A8 vs B9 split), D7 (FillPlanResult), D12 (publish hardening), D13 (version trajectory), D14 (anti-drift gates), D15 (em-dash rule), D17 (factory pattern), D18 (adapter-contract test), D19 (adversarial categories), D22 (blueprint.contract.ts), D25 (3-tenant fixtures).
2. **`temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`** [FULL READ] -- verbatim type definitions. You will copy §2.9 (`AtsAdapter` + `WorkdayWizardStep`), §6 (Workday factory snippet, which is your canonical surface), §7 (A8 wizard loop, your consumption contract), §9 (publish scripts), §10 (import table).
3. **`temp/impl/100-chrome-extension-mvp/phase_B2_core_types_and_taxonomy/plan.md`** [FULL READ] -- the types you import. Specifically verify that B2 defines (in `src/core/types/fill-plan-result.ts`) the type `FillPlanResult` with fields `{ planId, executedAt, filled, skipped, failed, aborted, abortReason? }` and the `AbortReason` union. Also verify `SkipReason` union includes `'consent-not-granted'`, `'consent-denied-field-type'`, and `'profile-field-empty'`. Verify `Profile.consents.allowEeoAutofill` is a boolean field and `Profile.demographics` is optional. If any of these are missing from B2, file a B2 corrective plan BEFORE starting B9; do not silently work around.
4. **`temp/impl/100-chrome-extension-mvp/phase_B5_dom_adapter_scanner_and_filler/plan.md`** [FULL READ] -- B5 is **function-based**, not interface-based. Its public surface is:
   - `scan(root: Element | Document, opts?: ScanOptions): FormModel`
   - `fillField(el: FillableElement, value: FillValue, opts?): FillResult`
   - `attachFile(input: HTMLInputElement, file: File, opts?: AttachOptions): Promise<FillResult>`
   - `watchForm(root: Element, cb: MutationCallback, opts?: WatchOptions): CleanupFn`
   - Low-level helpers re-exported from the barrel: `invokeNativeSetter`, `getNativePropertyDescriptor`, `fireEvent`, `fireInputEvent`, `fireBeforeInput`, `fireComboboxClickSequence`
   - **B5 does NOT export `fillReactTextInput` or a `react-internals.ts` file.** B9 must fork berellevy's `fillReactTextInput` into `src/ats/workday/react-props.ts` (see step 27, inline-fork path).
5. **`temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/plan.md`** [SKIM] -- the existing `exports` map entry for `./workday`, the `tsup.config.ts` entry `ats/workday/index`, the MPL-2.0 license file at `LICENSES/MPL-2.0.txt`, the `.npmignore` excluding `tests/` and `investigation/`, the B1 placeholder publish that reserved the name at `0.1.0-alpha.1`. B9 step 35 verifies (not adds) the exports-map entry; B1 already did it.
6. **`temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`** [SKIM for wizard loop section] -- A8 owns the orchestration. Read §"Workday wizard loop" to see exactly which primitives A8 consumes: `adapter.detectCurrentStep(doc)`, `adapter.watchForStepChange(doc, onChange)`, `adapter.scanStep(doc, step)`, `adapter.fillStep(step, profile)`. Your B9 surface MUST match these call signatures exactly.
7. **`temp/impl/100-chrome-extension-mvp/phase_A11_sidepanel_e2e_and_demo/plan.md`** [SKIM for Workday E2E section] -- A11's Playwright E2E expands to cover the full 4-step wizard traversal across the 3-tenant fixture set. If A11 expects any surface detail B9 does not provide, file a correction BEFORE starting B9.
8. **`temp/impl/100-chrome-extension-mvp/investigation/49-berellevy-deep-read.md`** [FULL READ] -- primary Workday reference. Specifically:
   - "Workday Adapter" section -- XPath-only, `data-automation-id` driven discovery
   - "Section/subsection traversal" -- `ancestor::fieldset/parent::div[.//div[@job-app-filler='${uuid}']][1]//h4` primary XPath trick for repeating sections (we adapt this to CSS descendant selectors)
   - "FormField Class Hierarchy" -- `WorkdayBaseInput<T>` abstract pattern (we inline its logic as widget functions, not classes)
   - "React Controlled Input Handling" -- `getReactProps()` escape hatch, `fillReactTextInput()` technique, both `onChange` + `onBlur` invocation ordering (copy verbatim into `react-props.ts`)
   - "File Upload" -- `workday/FileMulti.ts` uses `getReactProps(dropZone).onDrop(fakeEvent)` pattern; `dispatchFileDragEvent()` is the DataTransfer fallback (we prefer DataTransfer first, fall back to onDrop if present)
   - "MutationObserver Usage" -- four distinct use sites; we adapt the global discovery pattern to step-boundary detection
9. **`temp/impl/100-chrome-extension-mvp/investigation/61-polya20-workday-read.md`** [SKIM] -- secondary Workday reference used for selector-string union only:
   - list of `data-automation-id` values -- merge with berellevy's list
   - observation 2 "Multi-page wizard handling: PRIMITIVE" -- shows what NOT to do (re-click next button per page, which triggers auto-advance violation)
   - "Hard-coded California fallback" -- known bug, do not replicate
10. **`temp/impl/100-chrome-extension-mvp/investigation/57-ats-anti-automation.md`** [SKIM] -- Workday has no CAPTCHA on public postings; fill-only (no submit, no auto-advance) is safe. Confirms the design.
11. **`temp/impl/100-chrome-extension-mvp/investigation/38-file-input-datatransfer.md`** [SKIM] -- DataTransfer works on GH/Lever but Workday's drag-drop widget is custom. Always check `input.files.length` after assignment and surface failure in FillResult. Confirms Chrome 120+ support.

---

## Files to create (42 files total)

### Source (`e:/ats-autofill-engine/src/ats/workday/`) -- 28 files

1. `src/ats/workday/index.ts` -- barrel export. Exports `adapter`, `createWorkdayAdapter`, `WORKDAY_BLUEPRINT`, plus public types `WorkdayWizardStep` (re-export from core) and `WorkdayTenantHost` (local enum). NO internal primitives are exported directly; consumers go through `adapter.*`.
2. `src/ats/workday/adapter.ts` -- `createWorkdayAdapter()` factory returning the frozen `AtsAdapter` object (D17 pattern, per keystone §6 verbatim).
3. `src/ats/workday/blueprint.contract.ts` -- `WORKDAY_BLUEPRINT` runtime object (D22). Lists `publicExports: ['adapter', 'createWorkdayAdapter', 'WORKDAY_BLUEPRINT'] as const`, `adapterShape.kind = 'workday'`, `adapterShape.members = ['matchesUrl', 'scanForm', 'fillField', 'attachFile', 'extractJob', 'detectCurrentStep', 'watchForStepChange', 'scanStep', 'fillStep']`, `forbiddenImports: ['src/ats/greenhouse/*', 'src/ats/lever/*', 'src/adapters/chrome/*', 'src/background/**', 'entrypoints/**']`, `requiredCoverage: 85`.
4. `src/ats/workday/url-patterns.ts` -- primary host regex `/^https?:\/\/[a-z0-9-]+\.myworkdayjobs\.com\//i`, plus per-wizard-step URL fragment matchers (`stepUrlFragments`) and `matchesWorkdayUrl(url: string): boolean`.
5. `src/ats/workday/types.ts` -- local types: `WorkdaySection = 'work-history' | 'education' | 'languages' | 'certifications'`, `WorkdayFieldMeta`, `WorkdayTenantHost` (documented enum of captured tenants for test parameterization, not runtime switch).
6. `src/ats/workday/wizard/step-detector.ts` -- `detectCurrentStep(doc: Document): WorkdayWizardStep` stateless observation. Priority order documented inline.
7. `src/ats/workday/wizard/step-watcher.ts` -- `watchForStepChange(doc: Document, onChange: (step: WorkdayWizardStep) => void): () => void`. MutationObserver on `doc.body` with `attributeFilter: ['data-automation-id']`, debounce 150ms (per reviewer perf concern). Returns a cleanup function that disconnects the observer and clears timers. Popstate/hashchange are secondary listeners (SPA framework may not emit them; MutationObserver is the primary detection mechanism).

**Note**: the former `wizard/state.ts` file (from the pre-rewrite B9) is **deleted from the file list**. Per D6, A8 owns the wizard loop and holds all state; B9 exposes stateless primitives only. There is no state container in B9.

8. `src/ats/workday/selectors/shared.ts` -- cross-page selectors (step header, Save and Continue button, Back button, error banners, loading spinner). `saveAndContinueButton` carries JSDoc "NEVER click this programmatically. User action only."
9. `src/ats/workday/selectors/my-information.ts` -- selector map for personal info page (>= 18 fields), plus `WorkdayFieldMeta` record per key.
10. `src/ats/workday/selectors/my-experience.ts` -- selector map for work / education / languages repeating sections, `{idx}` placeholder substitution, `substituteRowIndex(selector, idx)` helper.
11. `src/ats/workday/selectors/voluntary-disclosures.ts` -- EEO selector map + work auth + veteran + disability + terms. Every demographic field carries `isConsentGated: true`; work-authorisation fields carry `isConsentGated: false`.
12. `src/ats/workday/selectors/review.ts` -- review-page field rendered-value selectors (read-only).
13. `src/ats/workday/scanners/my-information-scanner.ts` -- `scanMyInformation(doc: Document): FormModel` (returns frozen FormModel conforming to B2's `FormFieldDescriptor` shape).
14. `src/ats/workday/scanners/my-experience-scanner.ts` -- `scanMyExperience(doc: Document): FormModel`. Scans repeating sections, emits one descriptor per field per row with `name: 'work-history[${idx}].jobTitle'` path notation.
15. `src/ats/workday/scanners/voluntary-disclosures-scanner.ts` -- `scanVoluntaryDisclosures(doc: Document): FormModel`. Emits descriptors for BOTH work-auth fields and demographics fields; the `isConsentGated` flag lives in `dataAttributes['data-llmc-consent-gated'] = 'true'` for downstream filter. **Important: the scanner itself performs a structural read of EEO fields (to build the FormModel), but no values are written. The gate is enforced by the FILLER, not the scanner.**
16. `src/ats/workday/scanners/review-scanner.ts` -- `scanReview(doc: Document): FormModel`. **READ-ONLY**. Emits `FormFieldDescriptor` entries where `type: 'review-readonly'`, `placeholder: renderedValue`. Must never mutate DOM; a dedicated test asserts zero mutation method calls.
17. `src/ats/workday/fillers/my-information-filler.ts` -- `fillMyInformation(doc: Document, profile: Profile): Promise<FillPlanResult>`. Walks selector map, resolves profile values, dispatches to widget functions, aggregates into `FillPlanResult`.
18. `src/ats/workday/fillers/my-experience-filler.ts` -- `fillMyExperience(doc: Document, profile: Profile): Promise<FillPlanResult>`. Handles row-add loop with max-rows-reached abort, forbids row deletion (extra-rows-present warning), aborts remaining rows on required-field failure in a row.
19. `src/ats/workday/fillers/voluntary-disclosures-filler.ts` -- `fillVoluntaryDisclosures(doc: Document, profile: Profile): Promise<FillPlanResult>`. **EEO consent gate is the first statement. Short-circuits with empty results and zero DOM access when gate fails.** Work-auth fields fill regardless of EEO consent.
20. `src/ats/workday/fillers/review-filler.ts` -- `fillReview(doc: Document, profile: Profile): Promise<FillPlanResult>`. **No-op**. Returns `{ planId, executedAt, filled: [], skipped: allFields.map(f => ({instruction, reason: 'out-of-scope-for-v1'})), failed: [], aborted: false }`. Review is read-only by design.
21. `src/ats/workday/fill-step.ts` -- `fillStep(step: WorkdayWizardStep, profile: Profile): Promise<ReadonlyArray<FillResult>>` dispatcher. Captures `doc` from a module-level injected function (no module state; accepts `getDoc: () => Document` via a local wrapper) OR, cleaner: `fillStep` in the adapter is actually `(step, profile) => fill<step>(closureDoc, profile).then(result => [...result.filled, ...result.failed])`. See adapter factory snippet in step 28.
22. `src/ats/workday/scan-step.ts` -- `scanStep(doc: Document, step: WorkdayWizardStep): FormModel` dispatcher. Switches on `step`, calls the appropriate scanner, returns its FormModel.
23. `src/ats/workday/widgets/dropdown.ts` -- `fillWorkdayDropdown(trigger, optionText): Promise<FillResult>`. Full pointer-event sequence, `waitForElement('[role="listbox"]', 3000)` (raised from 2000ms), case-insensitive option matching with exact-case preference, 100ms post-click commit wait.
24. `src/ats/workday/widgets/searchable-select.ts` -- two-strategy fill: (A) type filter + click option, (B) `getReactProps(input).onKeyDown({ key: 'Tab', target: { value: optionText } })` berellevy fallback.
25. `src/ats/workday/widgets/date-picker.ts` -- triple-input (month/day/year) and month-year variants. Validates `aria-valuemin`/`aria-valuemax` before write.
26. `src/ats/workday/widgets/radio-group.ts` -- clicks the `[role="radio"]` wrapper (not the input), verifies via `aria-checked === "true"` post-click.
27. `src/ats/workday/widgets/checkbox.ts` -- single-boolean and multi-select cluster variants.
28. `src/ats/workday/widgets/text-input.ts` -- wraps B5's `fillField` with Workday-specific quirks: if `fillField` fails with `value-rejected-by-page`, retry via `fillReactTextInput` from `react-props.ts`.
29. `src/ats/workday/widgets/widget-dispatch.ts` -- `dispatchWidget(field: FormFieldDescriptor, value: FillValue, doc: Document, planId: PlanId): Promise<FillResult>`. Explicit switch over the field's synthesized `widgetKind` ("text" | "dropdown" | "searchable-select" | "date-picker" | "radio" | "checkbox" | "file"). Replaces the `// ... (delegate to widget registry)` placeholder from the prior plan with a concrete dispatch function.
30. `src/ats/workday/file-attacher.ts` -- `attachWorkdayResume(input: HTMLInputElement, file: File): Promise<FillResult>`. DataTransfer attempt, success-icon verification via `waitForElement` with 5000ms timeout (raised from 2000ms), `input.files.length === 0` post-assignment rejection detection, `catch (err)` narrowed to `InvalidStateError` name match (rethrows unknown errors).
31. `src/ats/workday/job-extractor.ts` -- `extractWorkdayJob(doc: Document): JobPostingData | null`. Scrapes `[data-automation-id="jobPostingHeader"]`, `jobPostingDescription`, `jobLocation`, `timeType`. Returns `JobPostingData` with `source: 'adapter-specific'`.
32. `src/ats/workday/react-props.ts` -- **local inline fork** of berellevy's `getReactProps()` and `fillReactTextInput()` helpers. Every line copied verbatim with MPL-2.0 header + berellevy BSD-3-Clause attribution (per step 27 instructions). Does NOT re-export from `ats-autofill-engine/dom`; B5 does not ship this helper (verified against B5 plan). If a future B5 version adds `react-internals.ts`, this file can be retired in favour of a re-export, but for alpha.2 the fork is the single source of truth.
33. `src/ats/workday/xpath.ts` -- thin XPath engine wrapper (`getElement`, `getElements`, `waitForElement`), forked from berellevy `shared/utils/getElements.ts` with attribution. Separate from B5's `watchForm`-scoped `waitForElement` because Workday's XPath-driven discovery has different semantics (XPath selectors, longer timeouts, step-aware polling).
34. `src/ats/workday/resolve.ts` -- pure profile-resolver functions (`resolveFirstName(profile)`, `resolveCountry(profile)`, `resolveWorkHistoryRow(profile, idx)`, etc.). All pure, all return `FillValue` or null. Isolates profile-shape coupling to one file.
35. `src/ats/workday/wait-for-element.ts` -- DELETED; merged into `xpath.ts` (step 33). Keeps file count lower and groups all DOM-waiting code in one place.

Actual new source file count after consolidation: **34** (not 35). Update this line when the executor reviews the list.

### Tests (`e:/ats-autofill-engine/tests/ats/workday/`) -- 12 fixtures + 12 spec files = 24 test files

**Multi-tenant fixture capture (D25)**. Capture HTML from 3 distinct public Workday tenants across all 4 wizard steps:

36. `tests/ats/workday/fixtures/tenant-a/my-information.html` -- tenant A (generic `workday.wd5.myworkdayjobs.com/External`)
37. `tests/ats/workday/fixtures/tenant-a/my-experience.html`
38. `tests/ats/workday/fixtures/tenant-a/voluntary-disclosures.html`
39. `tests/ats/workday/fixtures/tenant-a/review.html`
40. `tests/ats/workday/fixtures/tenant-b/my-information.html` -- tenant B (e.g. `deloitte.wd5.myworkdayjobs.com`)
41. `tests/ats/workday/fixtures/tenant-b/my-experience.html`
42. `tests/ats/workday/fixtures/tenant-b/voluntary-disclosures.html`
43. `tests/ats/workday/fixtures/tenant-b/review.html`
44. `tests/ats/workday/fixtures/tenant-c/my-information.html` -- tenant C (e.g. `accenture.wd103.myworkdayjobs.com`)
45. `tests/ats/workday/fixtures/tenant-c/my-experience.html`
46. `tests/ats/workday/fixtures/tenant-c/voluntary-disclosures.html`
47. `tests/ats/workday/fixtures/tenant-c/review.html`

Spec files:

48. `tests/ats/workday/adapter-contract.spec.ts` -- **D18 contract test**. Asserts `adapter.kind === 'workday'`, `adapter` is frozen (mutation throws), all required members exist with correct signatures, all optional Workday-specific members (`detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep`) are present, `scanForm` returns a `FormModel` with correct shape, `createWorkdayAdapter()` returns a fresh frozen instance each call (test `!==` and both frozen).
49. `tests/ats/workday/step-detector.spec.ts` -- parameterized across all 3 tenants x 4 steps = 12 happy-path cases plus adversarial.
50. `tests/ats/workday/step-watcher.spec.ts` -- transitions, debounce, cleanup, no-spurious-fire, detached-doc handling, 150ms debounce assertion.
51. `tests/ats/workday/my-information.spec.ts` -- parameterized across tenants, scanner + filler happy + adversarial.
52. `tests/ats/workday/my-experience.spec.ts` -- parameterized, repeating-section logic, row-add loop, max-rows abort, no-row-deletion warning.
53. `tests/ats/workday/voluntary-disclosures.spec.ts` -- **legal-critical**, 11 test cases (see §Tests to write).
54. `tests/ats/workday/review.spec.ts` -- parameterized, zero-DOM-mutation assertion via method spies.
55. `tests/ats/workday/file-attacher.spec.ts` -- happy path + silent rejection + timeout + InvalidStateError narrowing + unknown-error rethrow.
56. `tests/ats/workday/widgets/dropdown.spec.ts` -- 6 cases: event sequence, listbox wait, option-not-found, listbox-never-opened, exact-case preference, 100ms commit wait.
57. `tests/ats/workday/widgets/searchable-select.spec.ts` -- strategy A + strategy B + fallback cascade + failure modes (4+ cases).
58. `tests/ats/workday/widgets/date-picker.spec.ts` -- triple-input + month-year variants, range validation, range rejection (4+ cases).
59. `tests/ats/workday/widgets/radio-group.spec.ts` -- click wrapper, verify aria-checked, failure (3+ cases).
60. `tests/ats/workday/widgets/checkbox.spec.ts` -- single + multi-select cluster (3+ cases).
61. `tests/ats/workday/react-props.spec.ts` -- `fillReactTextInput` happy path, `getReactProps` React-internals access, graceful fallback when props absent.
62. `tests/ats/workday/blueprint-contract.spec.ts` -- reads `WORKDAY_BLUEPRINT`, asserts declared `publicExports` match actual exports from `index.ts` (via `import * as mod from '../../src/ats/workday'`), asserts `forbiddenImports` regex does not appear in any file under `src/ats/workday/` (via a simple FS walk).

Total test file count: **17 specs + 12 fixtures = 29** files under `tests/ats/workday/`.

### Scripts (new)

63. `scripts/rollback-phase-B9.sh` (D23) -- mechanical phase rollback; deletes `src/ats/workday/`, reverts `package.json` version + exports entry, reverts `tsup.config.ts` entry, runs `pnpm typecheck` in the rolled-back state.
64. `scripts/capture-workday-fixture.mjs` -- helper that takes a URL and a `--step` argument, opens Puppeteer, waits for the DOM to settle, `outerHTML` grabs `document.body`, wraps in a minimal HTML template, scrubs tenant-identifying strings (tenant logo URLs, company name in footer), and writes to `tests/ats/workday/fixtures/<tenant>/<step>.html`. Used for all 12 captures.

**Grand total new file count: ~42 source + tests + scripts. The prior plan claimed 38 but conflated scanners/fillers. This plan lists them precisely.**

---

## Files to modify (in repo root)

- `e:/ats-autofill-engine/package.json`:
  - Bump `version` from `0.1.0-alpha.1` (B1 placeholder) to `0.1.0-alpha.2`
  - **Verify** the `./workday` sub-entry already exists in the `exports` map (B1 should have added it per keystone §4). If missing, STOP and file a B1 corrective plan; do not add it in B9.
- `e:/ats-autofill-engine/tsup.config.ts`:
  - **Verify** `ats/workday/index` entry already exists (B1 should have added it per keystone §4). If missing, STOP and file B1 corrective.
- `e:/ats-autofill-engine/CHANGELOG.md`:
  - Add new section `[0.1.0-alpha.2] - 2026-04-16` with full Keep-a-Changelog entries per §Publish sub-phase.
- `e:/ats-autofill-engine/README.md`:
  - Add "Supported ATS" section listing Greenhouse, Lever, Workday with import examples
  - Add "Workday adapter (multi-step wizard)" section: consent gate, never-auto-advances, English-only selectors, D25 multi-tenant test coverage, known limitations (drag-drop rejection, SSO hosts out of scope)
  - Add "Behavioural constraints" section with the four hard rules
- `e:/ats-autofill-engine/.github/workflows/ci.yml`:
  - Verify the D14 anti-drift gates are wired (the scripts from keystone §9: `check-core-leak.sh`, `check-no-em-dash.sh`, `check-exports-resolution.mjs`, `check-blueprint-contracts.mjs`). If missing, file a B1 corrective.
- `e:/ats-autofill-engine/vitest.config.ts`:
  - Verify coverage thresholds from D24 are enforced (adapters: 85% line, 80% branch). If missing, file a B1 corrective.

---

## Step-by-step implementation (42 steps)

### Part A -- Wizard step detection (steps 1-6)

**Step 1**: Create `src/ats/workday/types.ts` with the MPL-2.0 + berellevy header block, then:

```ts
// (MPL-2.0 header + berellevy attribution, 5 lines)
import type { WorkdayWizardStep } from '../../core/types';

export type WorkdaySection =
  | 'work-history'
  | 'education'
  | 'languages'
  | 'certifications';

export type WorkdayTenantHost =
  | 'workday.wd5.myworkdayjobs.com'
  | 'deloitte.wd5.myworkdayjobs.com'
  | 'accenture.wd103.myworkdayjobs.com'
  | 'other';

export interface WorkdayFieldMeta {
  readonly step: WorkdayWizardStep;
  readonly section?: WorkdaySection;
  readonly rowIndex?: number;
  readonly automationId: string;
  readonly isConsentGated?: boolean;
}
```

Export everything, all `readonly`. Re-export `WorkdayWizardStep` from the core types barrel via the adapter `index.ts` (not from `types.ts` directly -- types.ts imports, index.ts re-exports).

**Step 2**: Create `src/ats/workday/url-patterns.ts`:

```ts
// (header)
import type { WorkdayWizardStep } from '../../core/types';

export const workdayUrlPattern: RegExp =
  /^https?:\/\/[a-z0-9-]+\.myworkdayjobs\.com\//i;

export const stepUrlFragments: Readonly<
  Record<Exclude<WorkdayWizardStep, 'unknown'>, RegExp>
> = Object.freeze({
  'my-information': /\/task\/(?:myInformation|applyManual)/i,
  'my-experience': /\/task\/myExperience/i,
  'voluntary-disclosures': /\/task\/voluntaryDisclosures/i,
  'review': /\/task\/review/i,
});

export function matchesWorkdayUrl(url: string): boolean {
  return workdayUrlPattern.test(url);
}
```

Note: `stepUrlFragments` excludes `'unknown'` because it is a sentinel, not a step with a URL pattern.

**Step 3**: Create `src/ats/workday/wizard/step-detector.ts`. Implement `detectCurrentStep(doc: Document): WorkdayWizardStep` with a priority order:

1. `data-automation-id` DOM check (most reliable, tenant-robust across all 3 captured fixture tenants)
2. URL fragment fallback (reliable when Workday SPA routes are intact)
3. H2 text heuristic (LAST RESORT, **English-only**, documented as a known limitation for non-English tenants; see out-of-scope)

Use Snippet 2 below verbatim. Never `window.location.href` directly; accept `doc: Document` and read `doc.defaultView?.location?.href ?? ''`. Return `'unknown'` if all three priorities fail.

**Step 4**: Write `tests/ats/workday/step-detector.spec.ts`. Parameterize over the 3 captured tenant fixture sets. For each tenant:
- Returns `'my-information'` for the tenant's `my-information.html` fixture
- Returns `'my-experience'` for the tenant's `my-experience.html`
- Returns `'voluntary-disclosures'` for the tenant's `voluntary-disclosures.html`
- Returns `'review'` for the tenant's `review.html`

Plus these adversarial cases (not parameterized):

- Empty document returns `'unknown'`
- Document with mangled `data-automation-id` values (replace `legalNameSection_firstName` with `legalName_first`) falls through to URL fragment
- Document with missing data-automation-id AND garbage URL (`about:blank`) AND no h2 returns `'unknown'`
- Priority test: two markers present simultaneously (My Information + Workday Experience). Assert that the earlier check wins (my-information), because SPA transition rendering momentarily shows both.
- Non-English h2 fallback test: fixture with h2 `"Mi informacion"` returns `'unknown'` (documented limitation). A follow-up v1.1 ticket adds i18n detection.

**Step 5**: Create `src/ats/workday/wizard/step-watcher.ts`. Implement `watchForStepChange(doc: Document, onChange: (newStep: WorkdayWizardStep) => void): () => void` using Snippet 3 below. Key details:

- `const DEBOUNCE_MS = 150;` (raised from 50ms per reviewer perf concern; Workday mutates DOM aggressively on initial render, 50ms causes callback storms)
- `const LISTBOX_WAIT_MS = 3000;` (tuning constant exported for test override)
- `const UPLOAD_ACK_TIMEOUT_MS = 5000;` (tuning constant)
- MutationObserver options: `{ childList: true, subtree: true, attributes: true, attributeFilter: ['data-automation-id'] }`
- Also subscribes to `popstate` and `hashchange` as **secondary** listeners. Document inline that MutationObserver is the primary detection mechanism; popstate/hashchange are redundant best-effort fallbacks because React Router v6 uses `history.pushState` without emitting popstate.
- Returns a cleanup function that disconnects the observer, removes event listeners, clears any pending debounce timer.
- Uses `doc.defaultView?.setTimeout` / `clearTimeout` so happy-dom tests work; if `doc.defaultView` is null (SSR / detached), returns a no-op cleanup immediately.

**Step 6**: Write `tests/ats/workday/step-watcher.spec.ts`:
- (a) install observer on tenant A my-information fixture, mutate attribute from `legalNameSection_firstName` to `workExperienceSection`; assert `onChange('my-experience')` fires exactly once after 150ms
- (b) install observer, mutate 10 times within 20ms; assert single callback after debounce
- (c) install observer, call cleanup function, mutate DOM; assert callback NOT called
- (d) mutate to the currently-detected step (no change); assert callback NOT called (no spurious fire)
- (e) popstate event fired on the window; assert callback evaluates (secondary path)
- (f) detached doc with `defaultView === null`; assert `watchForStepChange` returns no-op cleanup, does not throw
- (g) back navigation: mutate from `my-experience` back to `my-information`; assert `onChange('my-information')` fires
- (h) cleanup teardown on page unload: assert observer is disconnected (spy on `MutationObserver.prototype.disconnect`)

### Part B -- Selector maps (steps 7-10)

**Step 7**: Create `src/ats/workday/selectors/shared.ts` with the cross-page selectors. `saveAndContinueButton` carries JSDoc:
```ts
/**
 * Selector for the Workday "Save and Continue" button on every wizard page.
 * NEVER click this programmatically. User action only. Auto-advancing the
 * wizard would violate the D3 decision memo (user maintains full control of
 * navigation) and would trigger Workday form validation on partial data,
 * corrupting the user's application.
 */
```

**Step 8**: Create `src/ats/workday/selectors/my-information.ts` with at least 18 named fields (see Snippet 7). Include `myInformationFieldMeta: Record<keyof typeof myInformationSelectors, WorkdayFieldMeta>` for every entry.

**Step 9**: Create `src/ats/workday/selectors/my-experience.ts` with row-level and per-row selectors (see Snippet 8). Include the `substituteRowIndex(selector, idx)` helper, resume upload selectors.

**Step 10**: Create `src/ats/workday/selectors/voluntary-disclosures.ts` (see Snippet 9). Every demographic field flagged `isConsentGated: true`; work-auth flagged `false`. Terms checkbox flagged `false` (required to proceed).

### Part C -- Widgets (steps 11-17)

**Step 11**: Create `src/ats/workday/widgets/dropdown.ts`. Implement `fillWorkdayDropdown(trigger, optionText)` using Snippet 4. Key tuning: listbox wait is **3000ms** (tunable via exported constant), 100ms post-click commit wait.

**Step 12**: Create `src/ats/workday/widgets/searchable-select.ts`. Strategy A: type filter text, wait for filtered `[role="option"]`, click first match. Strategy B fallback: `getReactProps(input).onKeyDown({ key: 'Tab', target: { value: optionText } })` via the forked `react-props.ts`. Cascade A -> B -> failure.

**Step 13**: Create `src/ats/workday/widgets/date-picker.ts`. Triple-input (month/day/year) and month-year variants. Validates against `aria-valuemin`/`aria-valuemax` before writing. Returns `{ ok: false, selector, error: 'value-rejected-by-page', instructionPlanId }` on out-of-range.

**Step 14**: Create `src/ats/workday/widgets/radio-group.ts`. Clicks `[role="radio"]` wrapper, not the hidden `<input>`. Post-click verification via `aria-checked === "true"`. Failure returns `{ ok: false, error: 'value-rejected-by-page' }`.

**Step 15**: Create `src/ats/workday/widgets/checkbox.ts`. Single boolean variant (click label) + multi-select cluster variant (iterate desired values, click each matching label).

**Step 16**: Create `src/ats/workday/widgets/text-input.ts`. Wraps B5's `fillField` (from `ats-autofill-engine/dom`). If B5's `fillField` returns `{ ok: false, error: 'value-rejected-by-page' }`, retry once using `fillReactTextInput` from the local `react-props.ts`. If the retry succeeds, return `{ ok: true }` with a note in a local log array. If both fail, return the second failure.

**Step 17**: Create `src/ats/workday/widgets/widget-dispatch.ts`:

```ts
// (header)
import type { FormFieldDescriptor, FillResult, FillValue } from '../../../core/types';
import { fillWorkdayDropdown } from './dropdown';
import { fillWorkdaySearchableSelect } from './searchable-select';
import { fillWorkdayDatePicker } from './date-picker';
import { fillWorkdayRadio } from './radio-group';
import { fillWorkdayCheckbox } from './checkbox';
import { fillWorkdayTextInput } from './text-input';

export type WorkdayWidgetKind =
  | 'text'
  | 'dropdown'
  | 'searchable-select'
  | 'date-picker'
  | 'radio'
  | 'checkbox'
  | 'file';

export function classifyFieldWidget(
  field: FormFieldDescriptor,
): WorkdayWidgetKind {
  // Deterministic classification from the field's type + dataAttributes
  if (field.type === 'file') return 'file';
  if (field.dataAttributes['data-llmc-widget'] === 'searchable-select') {
    return 'searchable-select';
  }
  if (field.dataAttributes['data-llmc-widget'] === 'date-picker') {
    return 'date-picker';
  }
  if (field.type === 'select') return 'dropdown';
  if (field.type === 'radio') return 'radio';
  if (field.type === 'checkbox') return 'checkbox';
  return 'text';
}

function valueToText(v: FillValue): string | null {
  return v.kind === 'text' ? v.value : v.kind === 'choice' ? v.value : null;
}

function valueToBool(v: FillValue): boolean | null {
  return v.kind === 'boolean' ? v.value : null;
}

export async function dispatchWidget(
  field: FormFieldDescriptor,
  value: FillValue,
  doc: Document,
  planId: PlanId,
): Promise<FillResult> {
  const widget = classifyFieldWidget(field);
  const el = doc.querySelector(field.selector);
  if (!el) {
    return {
      ok: false,
      selector: field.selector,
      error: 'selector-not-found',
      instructionPlanId: planId,
    };
  }
  // Each widget function handles its own return shape; see individual files
  // for details. Each widget returns FillResult directly.
  switch (widget) {
    case 'text':              return fillWorkdayTextInput(el, value, field);
    case 'dropdown':          return fillWorkdayDropdown(el as HTMLElement, valueToText(value));
    case 'searchable-select': return fillWorkdaySearchableSelect(el as HTMLInputElement, valueToText(value));
    case 'date-picker':       return fillWorkdayDatePicker(el as HTMLElement, valueToText(value));
    case 'radio':             return fillWorkdayRadio(el as HTMLElement, valueToText(value));
    case 'checkbox':          return fillWorkdayCheckbox(el as HTMLElement, valueToBool(value));
    case 'file':              return { ok: false, selector: field.selector, error: 'wrong-entry-point-for-file', instructionPlanId: planId };  // files go through attachFile, not fillField
  }
}
```

This replaces the `// ... (delegate to widget registry)` placeholder in Snippet 5 with a concrete dispatch.

**Step 17b**: Create `src/ats/workday/fill-field-sync.ts`. Synchronous single-field fill for the `AtsAdapter.fillField` contract. Workday's async widgets (dropdown, searchable-select, file) cannot be filled synchronously; this handles only text/radio/checkbox/date-picker:

```ts
import type { FillInstruction, FillResult, FormFieldDescriptor } from '../../core/types';
import { classifyFieldWidget } from './widgets/widget-dispatch';
import { fillWorkdayTextInput } from './widgets/text-input';
import { fillWorkdayRadio } from './widgets/radio-group';
import { fillWorkdayCheckbox } from './widgets/checkbox';
import { fillWorkdayDatePicker } from './widgets/date-picker';

function valueToText(v: FillInstruction['value']): string | null {
  return v.kind === 'text' ? v.value : v.kind === 'choice' ? v.value : null;
}

function valueToBool(v: FillInstruction['value']): boolean | null {
  return v.kind === 'boolean' ? v.value : null;
}

export function fillWorkdayFieldSync(
  instruction: FillInstruction,
  doc: Document,
): FillResult {
  const el = doc.querySelector(instruction.selector);
  if (!el) {
    return { ok: false, selector: instruction.selector, error: 'selector-not-found', instructionPlanId: instruction.planId };
  }

  const field: FormFieldDescriptor = {
    selector: instruction.selector,
    name: instruction.field,
    id: el.id || null,
    label: null,
    placeholder: null,
    type: el.tagName.toLowerCase() === 'input' ? (el as HTMLInputElement).type : 'text',
    dataAttributes: {},
  };

  const widget = classifyFieldWidget(field);

  switch (widget) {
    case 'text':
      return fillWorkdayTextInput(el, instruction.value, field);
    case 'radio':
      return fillWorkdayRadio(el as HTMLElement, valueToText(instruction.value));
    case 'checkbox':
      return fillWorkdayCheckbox(el as HTMLElement, valueToBool(instruction.value));
    case 'date-picker':
      return fillWorkdayDatePicker(el as HTMLElement, valueToText(instruction.value));
    case 'dropdown':
    case 'searchable-select':
      return { ok: false, selector: instruction.selector, error: 'async-widget-requires-fill-step', instructionPlanId: instruction.planId };
    case 'file':
      return { ok: false, selector: instruction.selector, error: 'wrong-entry-point-for-file', instructionPlanId: instruction.planId };
  }
}
```

### Part D -- Scanners (steps 18-21)

**Step 18**: Create `src/ats/workday/scanners/my-information-scanner.ts`. Implements `scanMyInformation(doc: Document): FormModel`. For each entry in the My Information selector map, `doc.querySelector(selector)`, skip if missing, emit a `FormFieldDescriptor`:

```ts
{
  selector,
  name: metaKey,
  id: el.id || null,
  label: deriveLabel(el),
  placeholder: el.getAttribute('placeholder'),
  ariaLabel: el.getAttribute('aria-label'),
  autocomplete: el.getAttribute('autocomplete'),
  type: deriveType(el, metaKey),  // 'text' | 'select' | 'checkbox' etc
  options: deriveOptions(el),
  required: deriveRequired(el),
  dataAttributes: {
    'data-automation-id': el.getAttribute('data-automation-id') ?? '',
    'data-llmc-widget': classifyWidgetKindFromMeta(metaKey),
    'data-llmc-step': 'my-information',
  },
  sectionHeading: 'My Information',
  domIndex: i,
}
```

Use `deriveLabel(el)` helper that walks `label[for=id]`, `aria-labelledby`, closest `<label>`, then `aria-label` fallback. Pure; no DOM mutation. Return value is `freezeFormModel(model)` (imported from `../../core/types/form-model`).

**Step 19**: Create `src/ats/workday/scanners/my-experience-scanner.ts`. Scans repeating sections. Uses `doc.querySelectorAll(myExperienceRows.workHistoryRow)` to count rows, then for each row index `idx` substitutes `{idx}` in the per-row selector pattern and scans each sub-field. Emits per-row descriptors with `name: 'work-history[${idx}].${fieldKey}'` path notation. Same for education, languages. Adds the resume upload input as a top-level `file` descriptor.

The scanner also emits a synthetic field with `type: 'metadata'`, `dataAttributes['data-llmc-row-count']: String(rowCount)`, `dataAttributes['data-llmc-can-add-more']: canAddMore.toString()`. This lets the filler decide whether to click "Add Another".

**Step 20**: Create `src/ats/workday/scanners/voluntary-disclosures-scanner.ts`. Same pattern as my-information-scanner. For each field, emit a descriptor with `dataAttributes['data-llmc-consent-gated'] = 'true' | 'false'` per the selector map flag. **Important**: the scanner itself reads EEO field structure (presence, required-ness, option lists from the rendered `[role="listbox"]` if the dropdown is already open). It does NOT fill. The filler uses the `data-llmc-consent-gated` flag to skip demographic fields when consent is not granted.

**Step 21**: Create `src/ats/workday/scanners/review-scanner.ts`. **READ-ONLY**. Queries each review-page selector, extracts `el.textContent?.trim() ?? ''`, emits a `FormFieldDescriptor` with `type: 'review-readonly'`, `placeholder: renderedValue`, `name: labelKey`. Write unit test `review.spec.ts` asserting the scanner never calls `Element.prototype.setAttribute`, `dispatchEvent`, `click`, `value setter` on any element (spies installed, counters asserted to be zero). Also create `scan-step.ts` dispatcher:

```ts
// src/ats/workday/scan-step.ts
import type { FormModel, WorkdayWizardStep } from '../../core/types';
import { scanMyInformation } from './scanners/my-information-scanner';
import { scanMyExperience } from './scanners/my-experience-scanner';
import { scanVoluntaryDisclosures } from './scanners/voluntary-disclosures-scanner';
import { scanReview } from './scanners/review-scanner';
import { emptyFormModel } from './helpers';

export function scanStep(doc: Document, step: WorkdayWizardStep): FormModel {
  switch (step) {
    case 'my-information':         return scanMyInformation(doc);
    case 'my-experience':          return scanMyExperience(doc);
    case 'voluntary-disclosures':  return scanVoluntaryDisclosures(doc);
    case 'review':                 return scanReview(doc);
    case 'unknown':                return emptyFormModel(doc);
  }
}
```

Exhaustive switch (TypeScript `never` check ensures all `WorkdayWizardStep` variants handled).

### Part E -- Fillers (steps 22-28)

**Step 22**: Create `src/ats/workday/fillers/my-information-filler.ts`. Signature: `fillMyInformation(doc: Document, profile: Profile): Promise<FillPlanResult>`. Algorithm:

1. Generate a new `planId` via `PlanId(crypto.randomUUID())`
2. Capture `executedAt = new Date().toISOString()`
3. Call `scanMyInformation(doc)` to get the FormModel
4. For each field in `formModel.fields`:
   - Resolve the profile value via `resolve.ts` (e.g. `resolveFirstName(profile)`)
   - If resolver returns `null` or `''` (empty string), push to `skipped` with `reason: 'profile-field-empty'`, continue
   - Build a `FillInstruction` from the field + resolved value
   - Call `dispatchWidget(field, instruction.value, doc, planId)` -> `FillResult`
   - Push to `filled` or `failed` based on `result.ok`
5. Aggregate into `FillPlanResult`:

```ts
return Object.freeze({
  planId,
  executedAt,
  filled: Object.freeze(filled),
  skipped: Object.freeze(skipped),
  failed: Object.freeze(failed),
  aborted: false,
  abortReason: undefined,
});
```

Never throws. Every error path becomes a `failed` entry with a typed `FillError` reason.

**Step 23**: Create `src/ats/workday/fillers/my-experience-filler.ts`. Algorithm:

1. Scan current DOM rows: `const existingWorkRows = doc.querySelectorAll(myExperienceRows.workHistoryRow).length`, same for education, languages
2. Target counts: `profile.work.length`, `profile.education.length`, `profile.languages.length`
3. **Row-add loop** for work history:
   - While `existingWorkRows < targetWorkRows`:
     - Query `doc.querySelector(myExperienceRows.addAnotherWorkHistory)` as an `HTMLButtonElement`
     - If `!button || button.disabled`: **ABORT** with `aborted: true, abortReason: 'wizard-not-ready'` and a `failed` entry with a synthetic descriptor reporting `'max-rows-reached'`. Return immediately.
     - `button.click()`
     - Wait for a new row via `waitForElement` with a selector that matches `existingWorkRows + 1` rows
     - Increment `existingWorkRows`
4. **No row deletion**: if `existingWorkRows > targetWorkRows`, do NOT delete rows. Push a synthetic `skipped` entry with `reason: 'out-of-scope-for-v1'` for each overflow row. Never remove user data.
5. For each row index in `[0, min(existingWorkRows, targetWorkRows))`, call `fillRow(doc, profile.work[idx], idx)` which internally calls `dispatchWidget` for each per-row field
6. **Abort on required-field failure**: if any row has a field with `field.required === true` that returns `{ ok: false }`, push the failure, mark `aborted: true`, set `abortReason: 'wizard-not-ready'` (closest match in `AbortReason` union), STOP processing subsequent rows, and return. Partial fill of a single Workday row corrupts Workday's validation; the "Save and Continue" button will reject the entire page. Better to fail fast.
7. Resume upload: call `attachWorkdayResume(doc.querySelector(myExperienceRows.resumeUploadInput), file)` exactly once; push its result.
8. Education and language sections: same algorithm, run in sequence (not parallel; Workday state machine requires serial mutations).
9. Aggregate and return `FillPlanResult`.

**Step 24**: Create `src/ats/workday/fillers/voluntary-disclosures-filler.ts`. **EEO consent gate is the first code statement after type imports.** Use Snippet 5 below. The gate:

```ts
// HARD GATE: EEO consent
// Legal basis: GDPR Art. 9 + UK GDPR Art. 9 class demographic data as
// special category requiring explicit consent. US ADA / EEO-1 self-ID is
// voluntary by law. We short-circuit with ZERO DOM interaction when either
// gate fails, verified in tests via DOM-setter spies.
if (
  profile.consents?.allowEeoAutofill !== true ||
  profile.demographics === undefined
) {
  // Early return BEFORE any doc.querySelector, BEFORE any scanner call on
  // demographic fields, BEFORE any DOM event dispatch. The gate is the
  // load-bearing legal safety measure.
  return Object.freeze({
    planId: PlanId(crypto.randomUUID()),
    executedAt: new Date().toISOString(),
    filled: Object.freeze([]),
    skipped: Object.freeze(
      // Still report what would have been filled, so the UI can tell the
      // user "EEO fields skipped, consent not granted" rather than silently
      // dropping them. But the skipped list is BUILT WITHOUT touching the
      // DOM; we use a static field catalogue from the selector map.
      getStaticEeoFieldInstructionCatalogue(profile).map((inst) => ({
        instruction: inst,
        reason: 'consent-denied-field-type' as const,
      })),
    ),
    failed: Object.freeze([]),
    aborted: false,
    abortReason: undefined,
  });
}
```

**Work-auth fields ALWAYS fill** regardless of EEO consent. After the gate passes, the filler walks the full selector map including work-auth, fills work-auth via `fillWorkdayRadio`, fills demographic fields via the appropriate widgets, accumulates results.

A separate spy-test verifies that when the gate fails, ZERO DOM mutation methods are called (zero `value` setter, zero `dispatchEvent`, zero `click`), even though the `skipped` list is populated from the static catalogue. The `getStaticEeoFieldInstructionCatalogue(profile)` helper reads only from the profile + the selector map module constants -- no DOM access.

**Step 25**: Add comprehensive JSDoc to `voluntary-disclosures-filler.ts` explaining the legal rationale:
- EEO data is self-identification data protected by US / EU / UK law (ADA, EEO-1 reporting, GDPR Article 9, UK GDPR Art. 9)
- Even if a user has entered demographic data into their profile, the extension must require explicit opt-in via `profile.consents.allowEeoAutofill === true`
- The dedicated test asserts zero DOM mutations on the denied path
- "Better to skip than to leak sensitive data" rule
- Point to the consent-management UI defined in Plan A phase A7 (`src/pages/options/consent-section.tsx`) which writes `allowEeoAutofill`

**Step 26**: Create `src/ats/workday/fillers/review-filler.ts`. No-op stub:

```ts
export async function fillReview(
  doc: Document,
  profile: Profile,
): Promise<FillPlanResult> {
  // Review page is read-only by design. The adapter NEVER writes to Review.
  // This function exists so fillStep dispatch is exhaustive; it always
  // returns aborted=false with every field in skipped as out-of-scope-for-v1.
  const formModel = scanReview(doc);
  return Object.freeze({
    planId: PlanId(crypto.randomUUID()),
    executedAt: new Date().toISOString(),
    filled: Object.freeze([]),
    skipped: Object.freeze(
      formModel.fields.map((f) => ({
        instruction: toInstructionFor(f, PlanId('review-noop')),
        reason: 'out-of-scope-for-v1' as const,
      })),
    ),
    failed: Object.freeze([]),
    aborted: false,
    abortReason: undefined,
  });
}
```

**Step 27**: Create `src/ats/workday/react-props.ts`. **Inline fork** (not re-export) of berellevy's helpers:

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Portions forked from berellevy/job_app_filler (BSD-3-Clause).
// Copyright (c) 2024-present, Dovber Levy. All rights reserved.
// https://github.com/berellevy/job_app_filler/blob/main/src/shared/utils/reactUtils.ts
//
// This file is an inline fork. B5 (`ats-autofill-engine/dom`) does not
// ship a `react-internals.ts` or `fillReactTextInput` helper as of
// alpha.2. If a future B5 revision adds one, retire this file and
// re-export from `ats-autofill-engine/dom` instead. Verified against
// phase_B5_dom_adapter_scanner_and_filler/plan.md on 2026-04-11.

export function getReactProps(el: Element | null): Record<string, unknown> | null {
  if (!el) return null;
  const keys = Object.keys(el);
  const propsKey = keys.find((k) => k.startsWith('__reactProps$'));
  if (!propsKey) return null;
  return (el as unknown as Record<string, unknown>)[propsKey] as Record<string, unknown>;
}

export function fillReactTextInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  // Use the native setter to bypass React's synthetic event shim. This is
  // the canonical trick for filling React controlled inputs from outside
  // React. See: https://stackoverflow.com/q/23892547
  const proto =
    input instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!descriptor?.set) return false;
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}
```

Tests (`react-props.spec.ts`) verify:
- `getReactProps` returns null for elements without `__reactProps$*`
- `getReactProps` returns the props object for a mock element with a synthetic `__reactProps$abc` key
- `fillReactTextInput` on happy-dom HTMLInputElement writes the value (spy on `value` setter asserts the call count == 1), dispatches input + change + blur events, returns `true`
- `fillReactTextInput` returns `false` if the value setter is missing (shouldn't happen in practice, but defensive)

### Part F -- Job extractor, XPath helpers, resolve (steps 28-30)

**Step 28**: Create `src/ats/workday/job-extractor.ts`. Workday does not embed `JobPosting` JSON-LD. Instead, scrape DOM:
- Title: `[data-automation-id="jobPostingHeader"]`
- Description: `[data-automation-id="jobPostingDescription"]` innerText (not innerHTML; Workday uses styled divs, not semantic HTML)
- Location: `[data-automation-id="locations"]`
- Time type: `[data-automation-id="timeType"]`
- Job posting identifier: extract from URL regex `/\/job\/([^/]+)\/([^/]+)_R-(\d+)/`, capture the R-number

Return a `JobPostingData` with `source: 'adapter-specific'`. If the title selector is missing, return `null` (not a job posting page).

**Step 29**: Create `src/ats/workday/xpath.ts`. Wraps `document.evaluate` for the XPath-heavy selectors berellevy uses. Primary exports: `getElement(xpath: string, doc: Document): Element | null`, `getElements(xpath: string, doc: Document): Element[]`, `waitForElement(doc: Document, selector: string, timeoutMs: number, opts?: { useXpath?: boolean }): Promise<Element | null>`.

`waitForElement` polls every 100ms. Returns the first match or null on timeout. Accepts a CSS selector by default; if `opts.useXpath === true`, uses XPath evaluation instead. No mutation. Returns null (does not throw) on timeout.

**Step 30**: Create `src/ats/workday/resolve.ts`. Pure profile resolvers:

```ts
import type { Profile, FillValue, PlanId } from '../../core/types';

export function resolveFirstName(profile: Profile): FillValue | null {
  const v = profile.basics.firstName?.trim();
  return v ? { kind: 'text', value: v } : null;
}
export function resolveLastName(profile: Profile): FillValue | null { /* ... */ }
export function resolveCountry(profile: Profile): FillValue | null {
  const v = profile.basics.location.country?.trim();
  return v ? { kind: 'choice', value: v } : null;
}
export function resolveWorkHistoryRow(
  profile: Profile,
  idx: number,
): ReadonlyArray<{ fieldKey: string; value: FillValue }> | null {
  const row = profile.work[idx];
  if (!row) return null;
  return Object.freeze([
    { fieldKey: 'jobTitle', value: { kind: 'text', value: row.position } },
    { fieldKey: 'company', value: { kind: 'text', value: row.name } },
    { fieldKey: 'location', value: { kind: 'text', value: row.location ?? '' } },
    { fieldKey: 'startDate', value: { kind: 'text', value: row.startDate ?? '' } },
    { fieldKey: 'endDate', value: { kind: 'text', value: row.endDate ?? '' } },
    { fieldKey: 'description', value: { kind: 'text', value: row.summary ?? '' } },
    { fieldKey: 'currentlyWorking', value: { kind: 'boolean', value: !row.endDate } },
  ]);
}

export function resolveEducationRow(
  profile: Profile,
  idx: number,
): ReadonlyArray<{ fieldKey: string; value: FillValue }> | null {
  const row = profile.education[idx];
  if (!row) return null;
  return Object.freeze([
    { fieldKey: 'institution', value: { kind: 'text', value: row.institution } },
    { fieldKey: 'degree', value: { kind: 'choice', value: row.studyType ?? '' } },
    { fieldKey: 'field', value: { kind: 'text', value: row.area ?? '' } },
    { fieldKey: 'startDate', value: { kind: 'text', value: row.startDate ?? '' } },
    { fieldKey: 'endDate', value: { kind: 'text', value: row.endDate ?? '' } },
  ]);
}

export function resolveEEO(
  profile: Profile,
): ReadonlyArray<{ fieldKey: string; value: FillValue }> | null {
  const eeo = profile.eeo;
  if (!eeo) return null;
  return Object.freeze([
    ...(eeo.gender ? [{ fieldKey: 'gender', value: { kind: 'choice' as const, value: eeo.gender } }] : []),
    ...(eeo.race ? [{ fieldKey: 'race', value: { kind: 'choice' as const, value: eeo.race } }] : []),
    ...(eeo.veteran != null ? [{ fieldKey: 'veteran', value: { kind: 'choice' as const, value: eeo.veteran } }] : []),
    ...(eeo.disability != null ? [{ fieldKey: 'disability', value: { kind: 'choice' as const, value: eeo.disability } }] : []),
  ]);
}
```

All resolvers are pure, synchronous, return `FillValue | null` or `ReadonlyArray<...> | null`. No DOM access, no Promise.

### Part G -- File attacher (step 31)

**Step 31**: Create `src/ats/workday/file-attacher.ts` using Snippet 6 below. Tuning constants:
- `UPLOAD_ACK_TIMEOUT_MS = 5000` (raised from 2000ms -- Workday's drop zone can take 3-4s on slow networks)
- `UPLOAD_SHORT_WAIT_MS = 500` (unchanged)

**Narrowed catch**: `catch (err) { if (err instanceof Error && err.name === 'InvalidStateError') { return ... }; throw err; }`. Rethrows unknown errors rather than swallowing them, so bugs in `waitForElement` or the React setter surface rather than hiding.

### Part H -- Adapter factory + barrel + scan-step/fill-step dispatchers (steps 32-35)

**Step 32**: Create `src/ats/workday/fill-step.ts`:

```ts
import type { Profile, FillPlanResult, WorkdayWizardStep, FillResult } from '../../core/types';
import { fillMyInformation } from './fillers/my-information-filler';
import { fillMyExperience } from './fillers/my-experience-filler';
import { fillVoluntaryDisclosures } from './fillers/voluntary-disclosures-filler';
import { fillReview } from './fillers/review-filler';

export async function fillStepImpl(
  doc: Document,
  step: WorkdayWizardStep,
  profile: Profile,
): Promise<ReadonlyArray<FillResult>> {
  let result: FillPlanResult;
  switch (step) {
    case 'my-information':
      result = await fillMyInformation(doc, profile);
      break;
    case 'my-experience':
      result = await fillMyExperience(doc, profile);
      break;
    case 'voluntary-disclosures':
      result = await fillVoluntaryDisclosures(doc, profile);
      break;
    case 'review':
      result = await fillReview(doc, profile);
      break;
    case 'unknown':
      return Object.freeze([]);
  }
  // fillStep (per D1 signature) returns ReadonlyArray<FillResult>, not
  // FillPlanResult. Flatten filled + failed (skipped are not FillResult;
  // they are skip records). Internal callers that need the full plan
  // result can call the individual filler functions directly.
  return Object.freeze([...result.filled, ...result.failed]);
}
```

Note the D1 signature: `fillStep` returns `ReadonlyArray<FillResult>`, not `FillPlanResult`. A8 uses this flat shape. Internal B9 tests that need the full `FillPlanResult` (with `skipped`, `aborted`) call the individual `fillMyInformation` etc. directly.

**Step 33**: Create `src/ats/workday/adapter.ts` -- the factory. Copy Snippet 11 below verbatim (which in turn is derived from keystone §6 Workday example):

```ts
import type { AtsAdapter, FormModel, FillResult, FillInstruction, JobPostingData, WorkdayWizardStep, Profile } from '../../core/types';
import { matchesWorkdayUrl } from './url-patterns';
import { detectCurrentStep } from './wizard/step-detector';
import { watchForStepChange } from './wizard/step-watcher';
import { scanStep } from './scan-step';
import { fillStepImpl } from './fill-step';
import { dispatchWidget } from './widgets/widget-dispatch';
import { attachWorkdayResume } from './file-attacher';
import { extractWorkdayJob } from './job-extractor';
import { fillWorkdayFieldSync } from './fill-field-sync';

export function createWorkdayAdapter(): AtsAdapter {
  // Stateless; no closure state. Workday's wizard step is observed per call
  // via detectCurrentStep(doc), not stored here. The wizard orchestration
  // loop lives in A8's AutofillController (D6).
  return Object.freeze({
    kind: 'workday' as const,
    matchesUrl: (url: string): boolean => matchesWorkdayUrl(url),
    scanForm: (doc: Document): FormModel => {
      // D1: the canonical AtsAdapter surface requires scanForm. For Workday,
      // scanForm internally dispatches to the current step. A8 can call
      // either adapter.scanForm (which auto-detects step) or adapter.scanStep
      // (which takes an explicit step and is deterministic across re-renders).
      return scanStep(doc, detectCurrentStep(doc));
    },
    fillField: (instruction: FillInstruction): FillResult => {
      // Synchronous single-field fill for instructions that come through the
      // generic pipeline. Workday-specific multi-field flows use fillStep.
      // This path is rarely used for Workday but required by the AtsAdapter
      // contract. It looks up the field element and dispatches the widget
      // synchronously where possible; async widgets (dropdown, file) return
      // a failure here and must be routed through fillStep instead.
      return fillWorkdayFieldSync(instruction, document);
    },
    attachFile: async (
      instruction: FillInstruction,
      file: File,
    ): Promise<FillResult> => {
      const input = document.querySelector(instruction.selector);
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false, selector: instruction.selector, error: 'selector-not-found', instructionPlanId: instruction.planId };
      }
      return attachWorkdayResume(input, file);
    },
    extractJob: (doc: Document): JobPostingData | null => extractWorkdayJob(doc),

    // Workday-only optional surface (D1, D6):
    detectCurrentStep: (doc: Document): WorkdayWizardStep => detectCurrentStep(doc),
    watchForStepChange: (
      doc: Document,
      onChange: (step: WorkdayWizardStep) => void,
    ): (() => void) => watchForStepChange(doc, onChange),
    scanStep: (doc: Document, step: WorkdayWizardStep): FormModel => scanStep(doc, step),
    fillStep: async (
      step: WorkdayWizardStep,
      profile: Profile,
    ): Promise<ReadonlyArray<FillResult>> =>
      // `doc` is not in fillStep's signature per D1; the adapter captures
      // `document` (the global) at call time. Tests inject a fake document
      // via the D20 Deps pattern in A8, not here.
      fillStepImpl(document, step, profile),
  });
}
```

**Design note for the executor**: The D1 `fillStep` signature is `(step, profile) => Promise<ReadonlyArray<FillResult>>` -- it does NOT accept a `doc` parameter. The adapter implementation captures `document` (the ambient global) at call time. This is acceptable for production Chrome extension use because the content script runs in a real DOM context. For testing, the adapter factory can optionally accept a `doc` parameter (`createWorkdayAdapter({ doc })`), defaulting to `globalThis.document`. Implement this override for testability:

```ts
export function createWorkdayAdapter(
  opts: { readonly doc?: Document } = {},
): AtsAdapter {
  const getDoc = (): Document => opts.doc ?? globalThis.document;
  // ... adapter methods use getDoc() instead of document
}
```

**Step 34**: Create `src/ats/workday/blueprint.contract.ts` (D22):

```ts
// (MPL-2.0 header)
import type { AtsKind } from '../../core/types';

export const WORKDAY_BLUEPRINT = Object.freeze({
  phase: 'B9' as const,
  version: '2.1' as const,
  publicExports: Object.freeze([
    'adapter',
    'createWorkdayAdapter',
    'WORKDAY_BLUEPRINT',
  ] as const),
  adapterShape: Object.freeze({
    kind: 'workday' as const satisfies AtsKind,
    members: Object.freeze([
      'matchesUrl',
      'scanForm',
      'fillField',
      'attachFile',
      'extractJob',
      'detectCurrentStep',
      'watchForStepChange',
      'scanStep',
      'fillStep',
    ] as const),
  }),
  forbiddenImports: Object.freeze([
    'src/ats/greenhouse/**',
    'src/ats/lever/**',
    'src/adapters/chrome/**',
    'src/background/**',
    'entrypoints/**',
  ] as const),
  requiredCoverage: 85,
  tenants: Object.freeze([
    'workday.wd5.myworkdayjobs.com',
    'deloitte.wd5.myworkdayjobs.com',
    'accenture.wd103.myworkdayjobs.com',
  ] as const),
} as const);
```

**Step 35**: Create `src/ats/workday/index.ts` -- barrel:

```ts
// (MPL-2.0 header)
import type { AtsAdapter } from '../../core/types';
export type { WorkdayWizardStep } from '../../core/types';
export type { WorkdaySection, WorkdayFieldMeta, WorkdayTenantHost } from './types';

export { createWorkdayAdapter } from './adapter';
export { WORKDAY_BLUEPRINT } from './blueprint.contract';
export { matchesWorkdayUrl, workdayUrlPattern, stepUrlFragments } from './url-patterns';

import { createWorkdayAdapter } from './adapter';

/**
 * Module-singleton Workday adapter (D1 convention).
 * Consumers that need isolated instances (tests, multi-tab) should use
 * `createWorkdayAdapter()` directly instead of this singleton.
 */
export const adapter: AtsAdapter = createWorkdayAdapter();
```

The barrel exports BOTH `createWorkdayAdapter()` factory AND `adapter` module-singleton, matching the D1 convention and keystone §6 pattern.

### Part I -- Test fixtures and spec files (steps 36-41)

**Step 36**: Write `scripts/capture-workday-fixture.mjs` to automate fixture capture. Then manually capture 12 HTML files:

For each of the 3 target tenants (`workday.wd5.myworkdayjobs.com/External`, `deloitte.wd5.myworkdayjobs.com`, `accenture.wd103.myworkdayjobs.com`):
1. Navigate to a public job posting
2. Click Apply, walk through the wizard pages (My Information first, fill minimal info, click Save and Continue, wait for My Experience, etc.)
3. On each page, run the capture script: `node scripts/capture-workday-fixture.mjs --url <current-url> --tenant <tenant-slug> --step <step-name>`
4. The script outputs to `tests/ats/workday/fixtures/<tenant>/<step>.html`, wraps `<html><body>` + doctype, scrubs tenant-identifying strings (logo URLs, footer company name), KEEPS all `data-automation-id` values intact.

Executor time budget for captures: **3 hours** (most tedious part of phase).

**Step 37**: Write `tests/ats/workday/adapter-contract.spec.ts` (D18):

```ts
import { describe, test, expect } from 'vitest';
import { adapter, createWorkdayAdapter, WORKDAY_BLUEPRINT } from '../../../src/ats/workday';
import type { AtsAdapter } from '../../../src/core/types';

// Type-level structural assertion: fails to compile if the exported
// `adapter` does not satisfy the AtsAdapter interface exactly.
const _typeCheck: AtsAdapter = adapter;
void _typeCheck;

describe('Workday adapter contract', () => {
  test('kind is locked to "workday"', () => {
    expect(adapter.kind).toBe('workday');
  });

  test('matchesUrl is a function and matches Workday hosts', () => {
    expect(typeof adapter.matchesUrl).toBe('function');
    expect(adapter.matchesUrl('https://workday.wd5.myworkdayjobs.com/External')).toBe(true);
    expect(adapter.matchesUrl('https://boards.greenhouse.io/acme')).toBe(false);
    expect(adapter.matchesUrl('not-a-url')).toBe(false);
  });

  test('adapter object is frozen', () => {
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(() => {
      (adapter as unknown as { kind: string }).kind = 'greenhouse';
    }).toThrow();
  });

  test('createWorkdayAdapter returns a fresh frozen instance', () => {
    const a = createWorkdayAdapter();
    const b = createWorkdayAdapter();
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
    expect(a.kind).toBe('workday');
  });

  test('required AtsAdapter members exist', () => {
    expect(typeof adapter.scanForm).toBe('function');
    expect(typeof adapter.fillField).toBe('function');
    expect(typeof adapter.attachFile).toBe('function');
    expect(typeof adapter.extractJob).toBe('function');
  });

  test('Workday optional members exist (D1)', () => {
    expect(typeof adapter.detectCurrentStep).toBe('function');
    expect(typeof adapter.watchForStepChange).toBe('function');
    expect(typeof (adapter as AtsAdapter & { scanStep?: unknown }).scanStep).toBe('function');
    expect(typeof (adapter as AtsAdapter & { fillStep?: unknown }).fillStep).toBe('function');
  });

  test('blueprint publicExports match actual barrel exports', async () => {
    const mod = await import('../../../src/ats/workday');
    const expected = WORKDAY_BLUEPRINT.publicExports;
    for (const name of expected) {
      expect(mod).toHaveProperty(name);
    }
  });

  test('scanForm returns a FormModel shape on an empty document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const m = adapter.scanForm(doc);
    expect(m).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      scannedAt: expect.any(String),
      fields: expect.any(Array),
    });
    expect(Object.isFrozen(m.fields)).toBe(true);
  });

  test('fillField returns discriminated union with correct keys', () => {
    const instruction = makeTestInstruction();
    const r = adapter.fillField(instruction);
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('selector');
    expect(r).toHaveProperty('instructionPlanId');
    if (!r.ok) expect(r).toHaveProperty('error');
  });
});

function makeTestInstruction(): import('../../../src/core/types').FillInstruction {
  return {
    selector: 'input[data-automation-id="legalNameSection_firstName"]',
    field: 'first-name',
    value: { kind: 'text', value: 'Test' },
    priority: 1,
    planId: 'test-plan' as import('../../../src/core/types').PlanId,
  };
}
```

Parameterized shape across all adapter contract files (Greenhouse, Lever, Workday) per D18.

**Step 38**: Write per-tenant parameterized spec files. Each of `my-information.spec.ts`, `my-experience.spec.ts`, `voluntary-disclosures.spec.ts`, `review.spec.ts` uses Vitest's `describe.each`:

```ts
const tenants = ['tenant-a', 'tenant-b', 'tenant-c'] as const;

describe.each(tenants)('Workday my-information scanner [%s]', (tenant) => {
  const fixtureHtml = readFileSync(
    `tests/ats/workday/fixtures/${tenant}/my-information.html`,
    'utf-8',
  );
  const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

  test('scanner emits >= 15 fields', () => {
    const model = scanMyInformation(doc);
    expect(model.fields.length).toBeGreaterThanOrEqual(15);
  });

  // ... more parameterized cases
});
```

Each scanner must pass across all 3 tenants. If tenant-specific selector variation breaks a test, the selector map is updated to handle the variation via an explicit tenant branch (with a code comment explaining which tenant triggered the branch).

**Step 39**: Write `tests/ats/workday/voluntary-disclosures.spec.ts` -- the **legal-critical** spec. 11 adversarial test cases (expanded from the prior 7):

1. **EEO consent DENIED (`allowEeoAutofill=false`, demographics present)**: Install spies on `HTMLInputElement.prototype.value` setter, `HTMLElement.prototype.click`, `HTMLElement.prototype.dispatchEvent`. Call `fillVoluntaryDisclosures(doc, profile)`. Assert `result.filled.length === 0`, `result.skipped.length > 0` (from static catalogue), `result.failed.length === 0`. **Assert spy.callCount === 0 on all three spies**. This is the load-bearing leak-prevention test.

2. **EEO consent GRANTED (`allowEeoAutofill=true`, demographics populated)**: Same setup but with consent granted. Call filler. Assert `result.filled.length >= 3` (gender, ethnicity, veteranStatus minimum). Assert some DOM mutations DID occur (spy.callCount > 0, sanity check).

3. **Demographics UNDEFINED (`allowEeoAutofill=true`, `demographics === undefined`)**: Gate fails on the demographics check. Spies assert zero DOM mutations. Skipped list populated.

4. **Work-auth fills regardless of EEO consent**: `allowEeoAutofill=false`, work-auth fields present in fixture, `profile.jobPreferences.workAuthorization` populated. Call filler. Assert work-auth fields DID fill (`requireSponsorship`, `legallyAuthorized` in `result.filled`). Assert EEO fields did NOT fill (in `result.skipped` with `reason: 'consent-denied-field-type'`). Assert counts exactly (e.g. `filled.length === 3`, `skipped.length === 7`).

5. **Step change during fill**: Mock a scenario where `watchForStepChange` fires mid-fill. This is a pure unit test: the filler does NOT listen to step changes (that's A8's job). The filler completes its current fill, returns the result. Test asserts the filler does not abort on a simulated step marker change during its run. (A8-side concern, but documented here for clarity.)

6. **Back navigation**: Test is in `step-watcher.spec.ts`, not here. Documented here to clarify that voluntary-disclosures filler does not observe navigation.

7. **Multi-tenant parity**: Parameterized across 3 tenants, each tenant's EEO fixture runs the full filler happy path with consent granted. All 3 must pass.

8. **Partial fixture (only gender EEO field present)**: Consent granted, profile has full demographics. Filler fills gender only, skips the rest with `reason: 'out-of-scope-for-v1'` (not in model). `failed.length === 0`.

9. **Prefer-not-to-say mapping**: `profile.demographics.gender === 'prefer-not-to-say'`, filler calls `fillWorkdayDropdown(genderTrigger, 'Prefer not to say')`. Asserts `fillWorkdayDropdown` was called with the exact localized option text. Mock the dropdown widget to verify the call.

10. **Adversarial: frozen profile**: Profile is `Object.freeze(cloneProfile)`, filler must not attempt to mutate it. Type safety enforces this at compile time; this test is a runtime smoke test that mutation attempts (which shouldn't exist) fail safely.

11. **Adversarial: invalid `allowEeoAutofill` type**: `profile.consents.allowEeoAutofill = 'yes' as unknown as boolean` (type-cast bypass). The gate uses strict equality `=== true`, so this passes correctly (gate FAILS because `'yes' !== true`, short-circuit triggered, zero DOM mutations). Documents defensive equality.

**Step 40**: Write `tests/ats/workday/file-attacher.spec.ts`:
- Happy path: mock input + simulate success icon, `ok: true`
- Silent rejection: mock input where `files.length === 0` after assignment, `ok: false, reason: 'workday-drag-drop-rejected'`
- Timeout: mock input where success icon never appears, `ok: false, reason: 'upload-timeout'` at 5000ms
- InvalidStateError: mock `input.files = ...` to throw `{ name: 'InvalidStateError', message: '...' }`, caught, returns `ok: false, error: 'file-attach-failed'`
- Unknown error: mock to throw `{ name: 'NetworkError', ... }`, **rethrows** (narrow catch does not swallow). Test uses `expect(() => ...).rejects.toThrow(NetworkError)`.
- Input + change events dispatched with `bubbles: true`

**Step 41**: Write `tests/ats/workday/blueprint-contract.spec.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as workdayModule from '../../../src/ats/workday';
import { WORKDAY_BLUEPRINT } from '../../../src/ats/workday/blueprint.contract';

describe('Workday blueprint contract', () => {
  test('publicExports match actual module exports', () => {
    const actual = Object.keys(workdayModule).filter((k) => !k.startsWith('_'));
    for (const name of WORKDAY_BLUEPRINT.publicExports) {
      expect(actual).toContain(name);
    }
  });

  test('forbidden imports are absent from source files', () => {
    const files = walkDir('src/ats/workday', '.ts');
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const forbidden of WORKDAY_BLUEPRINT.forbiddenImports) {
        // Simple path substring check; full glob match in CI script
        const pat = forbidden.replace('/**', '').replace('/*', '');
        const rx = new RegExp(`from\\s+['"]\\.\\.?/.*${pat.replace('src/', '')}`);
        expect(content).not.toMatch(rx);
      }
    }
  });

  test('all 3 tenant fixtures exist', () => {
    for (const tenant of WORKDAY_BLUEPRINT.tenants) {
      const tenantSlug = tenant.split('.')[0];
      for (const step of ['my-information', 'my-experience', 'voluntary-disclosures', 'review']) {
        const path = `tests/ats/workday/fixtures/${tenantSlug}/${step}.html`;
        expect(() => readFileSync(path, 'utf-8')).not.toThrow();
      }
    }
  });
});

function walkDir(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkDir(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}
```

### Part J -- package.json version bump + compliance gates (step 42 + verification)

**Step 42**: Update `package.json`:
- Change `"version": "0.1.0-alpha.1"` to `"version": "0.1.0-alpha.2"`
- **Verify** the `./workday` exports map entry already exists (B1 set it). Do NOT add if present.
- Verify `tsup.config.ts` has `ats/workday/index` entry (B1 set it).

Run local compliance:
```bash
cd e:/ats-autofill-engine
pnpm typecheck
pnpm lint
pnpm test --coverage
pnpm build
# Coverage threshold: adapters 85% line, 80% branch (D24, enforced by vitest.config.ts)
```

All four must pass. The lint step validates MPL-2.0 file headers via a custom ESLint rule (B1 ships the rule). If lint flags any file under `src/ats/workday/**` for missing the header, the executor adds the header, never disables the rule.

Run D14 anti-drift gates:
```bash
scripts/check-no-em-dash.sh         # zero files with U+2014
scripts/check-core-leak.sh          # zero document/window/HTMLElement/chrome in src/core/
scripts/check-no-console.sh         # zero console.* in src/ (tests exempted)
scripts/check-exports-resolution.mjs # all 9 exports map entries resolve
node scripts/check-blueprint-contracts.mjs  # blueprint.contract.ts matches reality
```

Bundle size:
```bash
pnpm size-limit
# Gates (per decision memo §6.3 updated in v2.1):
#   dist/core/index.mjs gzipped < 30KB
#   total dist/ gzipped < 150KB (relaxed from 100KB per v2.1 memo
#     addendum; Workday wizard logic justifies the larger budget)
```

If any gate fails, STOP, fix root cause, re-run. Do not cherry-pick gates.

### Part K -- Publish sub-phase (steps 43-46)

**Precondition**: B7 (Greenhouse), B8 (Lever), and B9 source work all complete, all local compliance gates pass, all branches merged to engine repo main. If ANY of the three is not yet merged, B9 blocks at step 43 until they complete. Do NOT publish a partial adapter set.

**Step 43**: Update `CHANGELOG.md` with a new top section (replace any placeholder from B1's alpha.1):

```md
## [0.1.0-alpha.2] - 2026-04-16

First release with real ATS adapters. Supersedes alpha.1 which was an
empty-barrel placeholder reserving the npm package name.

### Added
- Core: FormModel, FillInstruction, FillPlan, FillPlanResult, FillResult, FillError, SkipReason, AbortReason, Profile Zod schema, FieldType taxonomy, AtsKind, AtsAdapter interface, WorkdayWizardStep, JobPostingData, PageIntent, branded ID types (TabId, GenerationId, SessionId, RequestId, PlanId, ResumeHandleId)
- Core/heuristics: Mozilla HeuristicsRegExp port (MPL-2.0 sub-module)
- Core/classifier + fill-rules + plan-builder
- Adapters/dom: `scan`, `fillField`, `attachFile`, `watchForm` function surface; native setter helpers; intent detector; JSON-LD + readability extractor; highlighter renderer
- Adapters/chrome: intent-detector port, profile-provider port
- ats/greenhouse: adapter for boards.greenhouse.io + job-boards.greenhouse.io
- ats/lever: adapter for jobs.lever.co with form variant detection
- ats/workday: **multi-step wizard adapter** (My Information, My Experience, Voluntary Disclosures, Review); **NEVER auto-advances; user clicks Save and Continue**; EEO fields consent-gated via `profile.consents.allowEeoAutofill`; multi-tenant support tested against 3 tenants (workday.wd5, deloitte.wd5, accenture.wd103)

### Notes
- Alpha release intended for integration with the llmconveyors Chrome extension (Plan 100). Public API is NOT yet stable; expect breaking changes before 1.0.0.
- Workday file upload uses DataTransfer with failure detection. Some tenants require manual drag-drop; the adapter surfaces a user-facing message when this happens.
- EEO demographic fields on Workday Voluntary Disclosures require explicit per-application consent via `profile.consents.allowEeoAutofill === true` AND `profile.demographics !== undefined`. Without consent, the filler short-circuits with zero DOM writes, verified by test spies.
- English-only Workday selectors. Non-English tenants (Spanish, French, German Workday localizations) are out of scope for alpha; i18n selector variants ship in v1.1.
- SSO / custom-domain Workday hosts (e.g. `careers.acme.com`) out of scope; adapter only matches `*.myworkdayjobs.com`.
- Bundle size: core < 30KB gzipped, total < 150KB gzipped (relaxed from 100KB per v2.1 memo addendum).
```

Update `README.md`:
- "Supported ATS" section listing Greenhouse, Lever, Workday with per-vendor import examples
- "Workday adapter (multi-step wizard)" subsection explaining:
  - The 4 wizard steps and the per-step fill primitives
  - User-driven step traversal (never auto-advances)
  - The EEO consent gate + legal rationale
  - DataTransfer best-effort upload with drag-drop fallback
  - Multi-tenant test coverage (3 tenants)
  - Known limitations (English-only, myworkdayjobs.com only)
- Import examples:
  ```ts
  import { adapter as greenhouse } from 'ats-autofill-engine/greenhouse';
  import { adapter as lever } from 'ats-autofill-engine/lever';
  import { adapter as workday, createWorkdayAdapter } from 'ats-autofill-engine/workday';
  ```
- "Behavioural constraints" section with the four hard rules:
  1. Never auto-submit
  2. Never auto-advance wizard steps
  3. EEO consent gate enforced
  4. File upload is best-effort (user may need to drag manually)

**Step 44**: Pre-publish hardening (D12):

```bash
cd e:/ats-autofill-engine

# 1. Rebuild clean
rm -rf dist node_modules
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test --coverage
pnpm build

# 2. Tarball dry-run + forbidden-file grep
pnpm pack --dry-run > /tmp/pack.log 2>&1
grep -q "tests/"        /tmp/pack.log && { echo "FAIL: tests leaked"; exit 1; }
grep -q "investigation/" /tmp/pack.log && { echo "FAIL: investigation leaked"; exit 1; }
grep -q "\\.orig"       /tmp/pack.log && { echo "FAIL: .orig backup leaked"; exit 1; }
grep -q "fixtures/"     /tmp/pack.log && { echo "FAIL: fixtures leaked"; exit 1; }
grep -q "temp/"         /tmp/pack.log && { echo "FAIL: temp leaked"; exit 1; }
grep -q "LICENSES/MPL-2.0.txt" /tmp/pack.log || { echo "FAIL: MPL license file missing"; exit 1; }
grep -q "LICENSE"       /tmp/pack.log || { echo "FAIL: main LICENSE missing"; exit 1; }

# 3. Dist boundary grep
grep -rE "document|window|chrome\." dist/core/ && { echo "FAIL: core leak"; exit 1; }

# 4. Dist bundle size
gzip -c dist/core/index.js | wc -c    # must be < 30720 bytes
gzip -c dist/index.js | wc -c          # must be < 153600 bytes
pnpm size-limit

# 5. Exports resolution (D14)
node scripts/check-exports-resolution.mjs

# 6. Dry-run publish (D12)
pnpm publish --dry-run --access public --tag alpha

# 7. 2FA pre-check
echo "About to publish ats-autofill-engine@0.1.0-alpha.2"
echo "Ensure npm whoami prints expected account:"
npm whoami
echo "Ensure OTP from authenticator app is ready (2FA required)"
read -p "Press Enter to continue or Ctrl-C to abort..."
```

**Step 45**: Real publish with provenance (D12):

```bash
# 1. Real publish with provenance flag + alpha dist-tag
# NOTE: --provenance requires running in a GitHub Actions context with
# OIDC id-token permission. If running locally, omit --provenance and
# publish from a GH Actions workflow manually triggered (workflow_dispatch)
# instead. The preferred path is: push a tag, GH Actions workflow runs
# publish on tag creation.
pnpm publish --access public --tag alpha --provenance

# 2. Verify on registry (retry 3x with backoff; npm replication is eventually
# consistent, fresh publishes take 5-15s to propagate globally)
for i in 1 2 3; do
  sleep 5
  if npm view ats-autofill-engine@0.1.0-alpha.2 version 2>/dev/null | grep -q "0.1.0-alpha.2"; then
    echo "Publish verified on attempt $i"
    break
  fi
  if [ $i -eq 3 ]; then echo "FAIL: publish not visible after 3 attempts"; exit 1; fi
done

# 3. Verify README landed
npm view ats-autofill-engine@0.1.0-alpha.2 readme | head -40

# 4. Verify provenance attestation
npm view ats-autofill-engine@0.1.0-alpha.2 --json | grep -q provenance && echo "provenance attested"
```

**Step 46**: Tag and push:

```bash
git add -A
git commit -m "chore: release v0.1.0-alpha.2 (greenhouse + lever + workday adapters)"
git tag -a v0.1.0-alpha.2 -m "Alpha 2 release: Greenhouse + Lever + Workday adapters with multi-step wizard primitives"
git push origin main
git push origin v0.1.0-alpha.2
```

Verify the tag appears on `github.com/ebenezer-isaac/ats-autofill-engine/releases`. Final step: open an issue titled `0.1.0-alpha.2 released, integration blocking A8` and pin it so Plan A phase A8 can reference it.

---

## Code snippets (verbatim -- copy these)

### Snippet 1 -- MPL-2.0 file header (every file in `src/ats/workday/**`)

```ts
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Portions forked from berellevy/job_app_filler (BSD-3-Clause).
// Copyright (c) 2024-present, Dovber Levy. All rights reserved.
```

5 lines, `//` style (per D14 grep-gate parity with the rest of the engine). Place as lines 1-5 of every new source file. Test files get lines 1-3 (the MPL block without the berellevy attribution) unless the test file also contains forked code.

### Snippet 2 -- Workday wizard step detection (stateless, priority order)

```ts
// (MPL header)
import { stepUrlFragments } from '../url-patterns';
import type { WorkdayWizardStep } from '../../../core/types';

export function detectCurrentStep(doc: Document): WorkdayWizardStep {
  // Priority 1: data-automation-id markers (most reliable, tenant-robust)
  // Workday wizard pages each have distinctive data-automation-id values.
  // Check order is deliberate: earlier steps take precedence so an ambiguous
  // DOM (rare, but possible during SPA transitions) resolves to the step the
  // user is still on, not the step they are about to enter.
  if (doc.querySelector('[data-automation-id="legalNameSection_firstName"]')) {
    return 'my-information';
  }
  if (doc.querySelector('[data-automation-id="workExperienceSection"]')) {
    return 'my-experience';
  }
  if (doc.querySelector('[data-automation-id="voluntaryDisclosures"]')) {
    return 'voluntary-disclosures';
  }
  if (doc.querySelector('[data-automation-id="applicationReviewPage"]')) {
    return 'review';
  }

  // Priority 2: URL fragment fallback
  const href = doc.defaultView?.location?.href ?? '';
  if (href) {
    for (const [step, pattern] of Object.entries(stepUrlFragments) as Array<
      [Exclude<WorkdayWizardStep, 'unknown'>, RegExp]
    >) {
      if (pattern.test(href)) return step;
    }
  }

  // Priority 3: H2 heuristic (LAST RESORT; English-only, documented limitation)
  // Non-English tenants fall through to 'unknown'. v1.1 adds i18n detection.
  const h2 = doc.querySelector('h2');
  const title = h2?.textContent?.trim().toLowerCase() ?? '';
  if (title.includes('my information'))         return 'my-information';
  if (title.includes('my experience'))          return 'my-experience';
  if (title.includes('voluntary disclosures'))  return 'voluntary-disclosures';
  if (title.includes('review'))                 return 'review';

  return 'unknown';
}
```

### Snippet 3 -- MutationObserver for step transitions (150ms debounce)

```ts
// (MPL header)
import { detectCurrentStep } from './step-detector';
import type { WorkdayWizardStep } from '../../../core/types';

const DEBOUNCE_MS = 150;  // raised from 50ms; Workday SPA mutates aggressively

export function watchForStepChange(
  doc: Document,
  onChange: (newStep: WorkdayWizardStep) => void,
): () => void {
  const win = doc.defaultView;
  if (!win) {
    // SSR / detached doc: no-op cleanup
    return () => {};
  }

  let currentStep = detectCurrentStep(doc);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = (): void => {
    timer = null;
    const newStep = detectCurrentStep(doc);
    if (newStep !== currentStep) {
      currentStep = newStep;
      onChange(newStep);
    }
  };

  const scheduleCheck = (): void => {
    if (timer !== null) win.clearTimeout(timer);
    timer = win.setTimeout(check, DEBOUNCE_MS);
  };

  // PRIMARY: MutationObserver on data-automation-id attribute changes.
  // This is the load-bearing detection mechanism; popstate/hashchange
  // are secondary because React Router v6 uses history.pushState without
  // emitting popstate on internal SPA transitions.
  const observer = new win.MutationObserver(scheduleCheck);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-automation-id'],
  });

  // SECONDARY (best-effort): URL change listeners
  const onPop = (): void => scheduleCheck();
  win.addEventListener('popstate', onPop);
  win.addEventListener('hashchange', onPop);

  return (): void => {
    if (timer !== null) win.clearTimeout(timer);
    observer.disconnect();
    win.removeEventListener('popstate', onPop);
    win.removeEventListener('hashchange', onPop);
  };
}
```

### Snippet 4 -- Workday custom dropdown widget (3000ms listbox wait)

```ts
// (MPL header)
import { waitForElement } from '../xpath';
import type { FillResult, PlanId } from '../../../core/types';

const LISTBOX_WAIT_MS = 3000;  // raised from 2000ms; slow tenants
const POST_CLICK_COMMIT_MS = 100;

export async function fillWorkdayDropdown(
  trigger: HTMLElement,
  optionText: string,
  planId: PlanId,
): Promise<FillResult> {
  const selector = `[data-automation-id="${trigger.getAttribute('data-automation-id') ?? ''}"]`;
  if (!trigger.isConnected) {
    return {
      ok: false,
      selector,
      error: 'element-not-visible',
      instructionPlanId: planId,
    };
  }
  // 1. Fire full pointer-event sequence. Workday binds its listener to one
  // of these depending on React version; firing only 'click' fails silently.
  const doc = trigger.ownerDocument;
  const opts = { bubbles: true, cancelable: true };
  trigger.dispatchEvent(new PointerEvent('pointerdown', opts));
  trigger.dispatchEvent(new MouseEvent('mousedown', opts));
  trigger.dispatchEvent(new PointerEvent('pointerup', opts));
  trigger.dispatchEvent(new MouseEvent('mouseup', opts));
  trigger.dispatchEvent(new MouseEvent('click', opts));

  // 2. Wait for listbox
  const listbox = await waitForElement(doc, '[role="listbox"]', LISTBOX_WAIT_MS);
  if (!listbox) {
    return {
      ok: false,
      selector,
      error: 'value-rejected-by-page',  // no FillError for listbox-never-opened
      instructionPlanId: planId,
    };
  }

  // 3. Find option; exact-case preferred, case-insensitive fallback
  const options = Array.from(doc.querySelectorAll<HTMLElement>('[role="option"]'));
  const target = optionText.trim();
  const exactMatch = options.find((o) => (o.textContent ?? '').trim() === target);
  const ciMatch = options.find(
    (o) => (o.textContent ?? '').trim().toLowerCase() === target.toLowerCase(),
  );
  const match = exactMatch ?? ciMatch;
  if (!match) {
    return {
      ok: false,
      selector,
      error: 'value-rejected-by-page',
      instructionPlanId: planId,
    };
  }

  // 4. Click option with full event sequence
  match.dispatchEvent(new PointerEvent('pointerdown', opts));
  match.dispatchEvent(new MouseEvent('mousedown', opts));
  match.dispatchEvent(new PointerEvent('pointerup', opts));
  match.dispatchEvent(new MouseEvent('mouseup', opts));
  match.click();

  // 5. Commit wait
  await new Promise((r) => doc.defaultView?.setTimeout(r, POST_CLICK_COMMIT_MS));

  return { ok: true, selector, instructionPlanId: planId };
}
```

### Snippet 5 -- EEO consent gate (legal-critical, zero-DOM-mutation short-circuit)

```ts
// (MPL header)
import type {
  Profile,
  FillPlanResult,
  FillResult,
  FillInstruction,
  PlanId,
} from '../../../core/types';
import { PlanId as makePlanId } from '../../../core/types/brands';
import { scanVoluntaryDisclosures } from '../scanners/voluntary-disclosures-scanner';
import { getStaticEeoFieldInstructionCatalogue } from './voluntary-disclosures-catalogue';
import { dispatchWidget } from '../widgets/widget-dispatch';
import { resolveEeoValue } from '../resolve';

export async function fillVoluntaryDisclosures(
  doc: Document,
  profile: Profile,
): Promise<FillPlanResult> {
  const planId = makePlanId(crypto.randomUUID());
  const executedAt = new Date().toISOString();

  // ==========================================================================
  // HARD GATE: EEO consent.
  // Legal basis:
  //   - GDPR Art. 9 + UK GDPR Art. 9 class demographic data as "special
  //     category personal data" requiring explicit consent.
  //   - US ADA / EEO-1 self-identification is voluntary by law.
  //   - California CCPA sensitive personal information includes racial/ethnic
  //     origin, disability, and veteran status.
  // This gate short-circuits with ZERO DOM interaction when EITHER condition
  // fails. The test suite (tests/ats/workday/voluntary-disclosures.spec.ts)
  // installs spies on HTMLInputElement.prototype.value setter,
  // HTMLElement.prototype.click, and HTMLElement.prototype.dispatchEvent,
  // and asserts callCount === 0 on all three when the gate fails. Any
  // accidental DOM leak fails CI. Better to skip than to leak sensitive data.
  // ==========================================================================
  if (
    profile.consents?.allowEeoAutofill !== true ||
    profile.demographics === undefined
  ) {
    // Static catalogue comes from module constants + profile resolvers.
    // NO DOM ACCESS. Building the skipped list from the selector map, not
    // from the document.
    const staticInstructions = getStaticEeoFieldInstructionCatalogue(profile, planId);
    return Object.freeze({
      planId,
      executedAt,
      filled: Object.freeze([]),
      skipped: Object.freeze(
        staticInstructions.map((instruction) => ({
          instruction,
          reason: 'consent-denied-field-type' as const,
        })),
      ),
      failed: Object.freeze([]),
      aborted: false,
      abortReason: undefined,
    });
  }

  // ==========================================================================
  // Gate passed. Proceed with scan + fill.
  // Work-auth fields (legallyAuthorized, requireSponsorship,
  // previouslyEmployed) fill UNCONDITIONALLY -- they were already covered by
  // the above allowEeoAutofill + demographics check (because the entire filler
  // short-circuited above if the gate failed). Inside this branch both gates
  // passed, so we fill every field in the scanner output.
  // ==========================================================================
  const formModel = scanVoluntaryDisclosures(doc);

  const filled: Array<Extract<FillResult, { ok: true }>> = [];
  const failed: Array<Extract<FillResult, { ok: false }>> = [];
  const skipped: Array<{ instruction: FillInstruction; reason: 'profile-field-empty' }> = [];

  for (const field of formModel.fields) {
    const value = resolveEeoValue(profile, field);
    if (value === null) {
      const instruction: FillInstruction = {
        selector: field.selector,
        field: field.name as any,  // field names come from the taxonomy
        value: { kind: 'skip', reason: 'profile-field-empty' },
        priority: 0,
        planId,
      };
      skipped.push({ instruction, reason: 'profile-field-empty' });
      continue;
    }
    const result = await dispatchWidget(field, value, doc, planId);
    if (result.ok) filled.push(result);
    else failed.push(result);
  }

  return Object.freeze({
    planId,
    executedAt,
    filled: Object.freeze(filled),
    skipped: Object.freeze(skipped),
    failed: Object.freeze(failed),
    aborted: false,
    abortReason: undefined,
  });
}
```

### Snippet 6 -- Workday file attacher with narrow catch (5000ms ack timeout)

```ts
// (MPL header)
import { waitForElement } from './xpath';
import type { FillResult, PlanId } from '../../core/types';

const UPLOAD_ACK_TIMEOUT_MS = 5000;  // raised from 2000ms
const UPLOAD_SHORT_WAIT_MS = 500;

export async function attachWorkdayResume(
  input: HTMLInputElement,
  file: File,
  planId: PlanId = ('workday-upload' as PlanId),
): Promise<FillResult> {
  const doc = input.ownerDocument;
  const selector =
    input.getAttribute('data-automation-id')
      ? `input[data-automation-id="${input.getAttribute('data-automation-id')}"]`
      : 'input[type="file"]';

  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Short wait for Workday to commit the value into its React state
    await new Promise((r) => doc.defaultView?.setTimeout(r, UPLOAD_SHORT_WAIT_MS));

    // Silent-rejection check. If Workday's drop zone rejected the file, it
    // strips input.files back to empty.
    if (input.files == null || input.files.length === 0) {
      return {
        ok: false,
        selector,
        error: 'file-attach-failed',
        instructionPlanId: planId,
      };
    }

    // Success-icon detection at 5000ms (slow networks tolerated).
    const successIcon = await waitForElement(
      doc,
      '[data-automation-id="file-upload-successful"]',
      UPLOAD_ACK_TIMEOUT_MS,
    );
    if (!successIcon) {
      return {
        ok: false,
        selector,
        error: 'file-attach-failed',  // timeout
        instructionPlanId: planId,
      };
    }

    return { ok: true, selector, instructionPlanId: planId };
  } catch (err) {
    // Narrow catch: InvalidStateError is the known failure mode from the
    // DataTransfer assignment on some browsers. Rethrow anything else so we
    // don't hide bugs in waitForElement or the setter path.
    if (err instanceof Error && err.name === 'InvalidStateError') {
      return {
        ok: false,
        selector,
        error: 'file-attach-failed',
        instructionPlanId: planId,
      };
    }
    throw err;
  }
}
```

### Snippet 7 -- My Information selector map (18 fields, abridged)

```ts
// (MPL header)
import type { WorkdayFieldMeta } from '../types';

export const myInformationSelectors = {
  // Legal name
  firstName:  'input[data-automation-id="legalNameSection_firstName"]',
  middleName: 'input[data-automation-id="legalNameSection_middleName"]',
  lastName:   'input[data-automation-id="legalNameSection_lastName"]',
  // Preferred name
  preferredFirstName: 'input[data-automation-id="preferredNameSection_firstName"]',
  preferredLastName:  'input[data-automation-id="preferredNameSection_lastName"]',
  // Address
  country:       '[data-automation-id="countryDropdown"]',  // dropdown
  addressLine1:  'input[data-automation-id="addressSection_addressLine1"]',
  addressLine2:  'input[data-automation-id="addressSection_addressLine2"]',
  city:          'input[data-automation-id="addressSection_city"]',
  stateProvince: '[data-automation-id="addressSection_countryRegion"]',  // dropdown
  postalCode:    'input[data-automation-id="addressSection_postalCode"]',
  // Phone
  phoneDeviceType:  '[data-automation-id="phone-device-type"]',          // dropdown
  phoneCountryCode: '[data-automation-id="countryPhoneCode"]',           // dropdown
  phoneNumber:      'input[data-automation-id="phone-number"]',
  phoneExtension:   'input[data-automation-id="phone-extension"]',
  // Contact
  email: 'input[data-automation-id="email"]',  // often read-only (bound to account)
  // Source + marketing
  sourceDropdown: '[data-automation-id="sourceDropdown"]',
  marketingOptIn: 'input[data-automation-id="marketingOptInCheckbox"]',
} as const;

export const myInformationFieldMeta: Record<
  keyof typeof myInformationSelectors,
  WorkdayFieldMeta
> = {
  firstName:  { step: 'my-information', automationId: 'legalNameSection_firstName' },
  middleName: { step: 'my-information', automationId: 'legalNameSection_middleName' },
  lastName:   { step: 'my-information', automationId: 'legalNameSection_lastName' },
  preferredFirstName: { step: 'my-information', automationId: 'preferredNameSection_firstName' },
  preferredLastName:  { step: 'my-information', automationId: 'preferredNameSection_lastName' },
  country:       { step: 'my-information', automationId: 'countryDropdown' },
  addressLine1:  { step: 'my-information', automationId: 'addressSection_addressLine1' },
  addressLine2:  { step: 'my-information', automationId: 'addressSection_addressLine2' },
  city:          { step: 'my-information', automationId: 'addressSection_city' },
  stateProvince: { step: 'my-information', automationId: 'addressSection_countryRegion' },
  postalCode:    { step: 'my-information', automationId: 'addressSection_postalCode' },
  phoneDeviceType:  { step: 'my-information', automationId: 'phone-device-type' },
  phoneCountryCode: { step: 'my-information', automationId: 'countryPhoneCode' },
  phoneNumber:      { step: 'my-information', automationId: 'phone-number' },
  phoneExtension:   { step: 'my-information', automationId: 'phone-extension' },
  email:          { step: 'my-information', automationId: 'email' },
  sourceDropdown: { step: 'my-information', automationId: 'sourceDropdown' },
  marketingOptIn: { step: 'my-information', automationId: 'marketingOptInCheckbox' },
};
```

### Snippet 8 -- My Experience selector map (repeating sections, abridged)

```ts
// (MPL header)
export const myExperienceRows = {
  workHistorySection: '[data-automation-id="workExperienceSection"]',
  workHistoryRow:     '[data-automation-id^="workExperience-"]',
  addAnotherWorkHistory: '[aria-label="Add Another Work Experience"]',
  educationSection:   '[data-automation-id="educationSection"]',
  educationRow:       '[data-automation-id^="education-"]',
  addAnotherEducation:'[aria-label="Add Another Education"]',
  languagesSection:   '[data-automation-id="languageSection"]',
  languageRow:        '[data-automation-id^="language-"]',
  addAnotherLanguage: '[aria-label="Add Another Language"]',
  resumeUploadInput:  'input[data-automation-id="file-upload-input-ref"]',
  resumeUploadDropZone: '[data-automation-id="file-upload-drop-zone"]',
  resumeUploadSuccessIcon: '[data-automation-id="file-upload-successful"]',
} as const;

export const workHistoryRowFields = {
  jobTitle:          '[data-automation-id="jobTitle-{idx}"] input',
  company:           '[data-automation-id="company-{idx}"] input',
  location:          '[data-automation-id="location-{idx}"] input',
  startMonth:        '[data-automation-id="startDate-{idx}"] [data-automation-id="dateSectionMonth-input"]',
  startYear:         '[data-automation-id="startDate-{idx}"] [data-automation-id="dateSectionYear-input"]',
  endMonth:          '[data-automation-id="endDate-{idx}"] [data-automation-id="dateSectionMonth-input"]',
  endYear:           '[data-automation-id="endDate-{idx}"] [data-automation-id="dateSectionYear-input"]',
  currentlyWorkHere: '[data-automation-id="currentlyWorkHere-{idx}"] input',
  description:       '[data-automation-id="description-{idx}"] textarea',
} as const;

// education rows, language rows omitted for brevity; same pattern

export function substituteRowIndex(selector: string, idx: number): string {
  return selector.replace(/\{idx\}/g, String(idx));
}
```

### Snippet 9 -- Voluntary Disclosures selector map (EEO + work-auth)

```ts
// (MPL header)
import type { WorkdayFieldMeta } from '../types';

export const voluntaryDisclosuresSelectors = {
  // ========= WORK AUTHORISATION (NOT consent-gated) =========
  // Application-logistics fields. Required to proceed. The user provided
  // them in onboarding without opting into demographics disclosure.
  legallyAuthorized:  '[data-automation-id="legallyAuthorizedToWork"] [role="radio"]',
  requireSponsorship: '[data-automation-id="requireSponsorship"] [role="radio"]',
  previouslyEmployed: '[data-automation-id="previouslyEmployedByCompany"] [role="radio"]',

  // ========= DEMOGRAPHICS (CONSENT-GATED) =========
  // Only filled when profile.consents.allowEeoAutofill === true AND
  // profile.demographics !== undefined.
  gender:           '[data-automation-id="gender"] [aria-haspopup="true"]',
  ethnicity:        '[data-automation-id="hispanicOrLatino"] [aria-haspopup="true"]',
  race:             '[data-automation-id="raceEthnicity"] [role="checkbox"]',  // multi-select cluster
  veteranStatus:    '[data-automation-id="veteranStatus"] [aria-haspopup="true"]',
  disabilityStatus: '[data-automation-id="disabilityStatus"] [role="radio"]',
  disabilitySignatureDate: 'input[data-automation-id="disabilitySignatureDate"]',
  disabilitySignature:     'input[data-automation-id="disabilitySignature"]',

  // Terms agreement (required, NOT consent-gated)
  termsAndConditions: '[data-automation-id="termsAndConditions"] input[type="checkbox"]',
} as const;

export const voluntaryDisclosuresFieldMeta: Record<
  keyof typeof voluntaryDisclosuresSelectors,
  WorkdayFieldMeta
> = {
  legallyAuthorized:  { step: 'voluntary-disclosures', automationId: 'legallyAuthorizedToWork',    isConsentGated: false },
  requireSponsorship: { step: 'voluntary-disclosures', automationId: 'requireSponsorship',        isConsentGated: false },
  previouslyEmployed: { step: 'voluntary-disclosures', automationId: 'previouslyEmployedByCompany', isConsentGated: false },
  gender:             { step: 'voluntary-disclosures', automationId: 'gender',                    isConsentGated: true  },
  ethnicity:          { step: 'voluntary-disclosures', automationId: 'hispanicOrLatino',          isConsentGated: true  },
  race:               { step: 'voluntary-disclosures', automationId: 'raceEthnicity',             isConsentGated: true  },
  veteranStatus:      { step: 'voluntary-disclosures', automationId: 'veteranStatus',             isConsentGated: true  },
  disabilityStatus:   { step: 'voluntary-disclosures', automationId: 'disabilityStatus',          isConsentGated: true  },
  disabilitySignatureDate: { step: 'voluntary-disclosures', automationId: 'disabilitySignatureDate', isConsentGated: true },
  disabilitySignature:     { step: 'voluntary-disclosures', automationId: 'disabilitySignature',     isConsentGated: true },
  termsAndConditions: { step: 'voluntary-disclosures', automationId: 'termsAndConditions',        isConsentGated: false },
};
```

### Snippet 10 -- Review page scanner (read-only)

```ts
// (MPL header)
import type { FormModel, FormFieldDescriptor, AtsKind } from '../../../core/types';
import { freezeFormModel } from '../../../core/types/form-model';

export const reviewSelectors = {
  legalFullName:              '[data-automation-id="legalFullName"]',
  address:                    '[data-automation-id="primaryAddress"]',
  phone:                      '[data-automation-id="primaryPhone"]',
  email:                      '[data-automation-id="primaryEmail"]',
  workExperienceSummary:      '[data-automation-id="workExperienceSummary"]',
  educationSummary:           '[data-automation-id="educationSummary"]',
  languagesSummary:           '[data-automation-id="languagesSummary"]',
  resumeAttached:             '[data-automation-id="resumeAttached"]',
  workAuthorizationSummary:   '[data-automation-id="workAuthorizationSummary"]',
  voluntaryDisclosuresSummary:'[data-automation-id="voluntaryDisclosuresSummary"]',
} as const;

export function scanReview(doc: Document): FormModel {
  // PURE READ. MUST NOT mutate the DOM. The test suite spies on
  // Element.prototype methods to verify zero writes.
  const fields: FormFieldDescriptor[] = [];
  let i = 0;
  for (const [key, selector] of Object.entries(reviewSelectors)) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    fields.push({
      selector,
      name: key,
      id: el.id || null,
      label: key,
      placeholder: (el.textContent ?? '').trim(),  // rendered value stored here
      ariaLabel: el.getAttribute('aria-label'),
      autocomplete: null,
      type: 'review-readonly',
      options: [],
      required: false,
      dataAttributes: {
        'data-automation-id': el.getAttribute('data-automation-id') ?? '',
        'data-llmc-step': 'review',
      },
      sectionHeading: 'Review',
      domIndex: i++,
    });
  }
  return freezeFormModel({
    url: doc.defaultView?.location?.href ?? '',
    title: doc.title,
    scannedAt: new Date().toISOString(),
    fields,
    sourceATS: 'workday' as AtsKind,
  });
}
```

### Snippet 11 -- Workday adapter factory (D1 + D17 + keystone §6)

```ts
// (MPL header)
import type {
  AtsAdapter,
  FormModel,
  FillResult,
  FillInstruction,
  JobPostingData,
  WorkdayWizardStep,
  Profile,
  PlanId,
} from '../../core/types';
import { matchesWorkdayUrl } from './url-patterns';
import { detectCurrentStep } from './wizard/step-detector';
import { watchForStepChange } from './wizard/step-watcher';
import { scanStep } from './scan-step';
import { fillStepImpl } from './fill-step';
import { attachWorkdayResume } from './file-attacher';
import { extractWorkdayJob } from './job-extractor';
import { fillWorkdayFieldSync } from './fill-field-sync';

export interface CreateWorkdayAdapterOptions {
  readonly doc?: Document;   // dependency-injection hook for tests
}

export function createWorkdayAdapter(
  opts: CreateWorkdayAdapterOptions = {},
): AtsAdapter {
  // Stateless by design; the factory closes over the test-injectable doc
  // getter but holds no per-instance mutable state. Wizard step pointer
  // lives in A8's AutofillController (D6), not here.
  const getDoc = (): Document => opts.doc ?? globalThis.document;

  return Object.freeze({
    kind: 'workday' as const,
    matchesUrl: (url: string): boolean => matchesWorkdayUrl(url),

    scanForm: (doc: Document): FormModel => {
      // D1 canonical member. For Workday this dispatches to scanStep with
      // the current detected step; A8 calls this when it wants auto-detection.
      return scanStep(doc, detectCurrentStep(doc));
    },

    fillField: (instruction: FillInstruction): FillResult => {
      // Synchronous single-field fill. Async widgets (dropdown, file) are
      // routed through fillStep, not fillField. If the instruction targets
      // an async widget, this returns 'wrong-entry-point-for-file' or
      // 'value-rejected-by-page' so the caller can retry via fillStep.
      return fillWorkdayFieldSync(instruction, getDoc());
    },

    attachFile: async (
      instruction: FillInstruction,
      file: File,
    ): Promise<FillResult> => {
      const doc = getDoc();
      const input = doc.querySelector(instruction.selector);
      if (!(input instanceof HTMLInputElement)) {
        return {
          ok: false,
          selector: instruction.selector,
          error: 'selector-not-found',
          instructionPlanId: instruction.planId,
        };
      }
      return attachWorkdayResume(input, file, instruction.planId);
    },

    extractJob: (doc: Document): JobPostingData | null => extractWorkdayJob(doc),

    // ========== Workday-only optional surface (D1, D6) ==========
    detectCurrentStep: (doc: Document): WorkdayWizardStep =>
      detectCurrentStep(doc),

    watchForStepChange: (
      doc: Document,
      onChange: (step: WorkdayWizardStep) => void,
    ): (() => void) => watchForStepChange(doc, onChange),

    scanStep: (doc: Document, step: WorkdayWizardStep): FormModel =>
      scanStep(doc, step),

    fillStep: async (
      step: WorkdayWizardStep,
      profile: Profile,
    ): Promise<ReadonlyArray<FillResult>> => fillStepImpl(getDoc(), step, profile),
  });
}
```

### Snippet 12 -- Rollback script (`scripts/rollback-phase-B9.sh`, D23)

```bash
#!/usr/bin/env bash
# scripts/rollback-phase-B9.sh
# Mechanically reverts phase B9 (Workday adapter + publish).
# Use in case of publish failure or critical bug within the 72h unpublish window.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "Rolling back phase B9 (Workday adapter)..."

# 1. Delete all Workday source files
rm -rf src/ats/workday/

# 2. Delete all Workday tests
rm -rf tests/ats/workday/

# 3. Revert package.json (back to alpha.1)
git checkout HEAD -- package.json
# Manual confirm: alpha.1 version should be the B1 placeholder published value

# 4. Revert tsup config if B9 modified it (it shouldn't -- B1 set the entry)
git checkout HEAD -- tsup.config.ts 2>/dev/null || true

# 5. Revert CHANGELOG + README B9 additions
git checkout HEAD -- CHANGELOG.md README.md

# 6. Rebuild without Workday to verify the rolled-back state is clean
pnpm install
pnpm typecheck   # must pass
pnpm lint        # must pass
pnpm test        # must pass (no Workday tests)
pnpm build       # must pass (no Workday dist output)

# 7. Verify no stale workday references
if grep -r "ats/workday" src/ tests/; then
  echo "FAIL: stale workday references after rollback"
  exit 1
fi

echo "Phase B9 rolled back cleanly. npm alpha.2 remains deprecated until re-publish."
echo "Next step: fix the root cause in a branch off main, re-run B9, publish alpha.3."
```

---

## Acceptance criteria

- [ ] All Required Reading phase paths open successfully (no stale references to `phase_B5_dom_adapter_core` or `phase_B1_engine_scaffold`)
- [ ] `src/ats/workday/index.ts` exports `adapter`, `createWorkdayAdapter`, `WORKDAY_BLUEPRINT`, plus type re-exports per Snippet of step 35
- [ ] `adapter.kind === 'workday'`
- [ ] `adapter` is frozen (`Object.isFrozen(adapter) === true`); mutation throws
- [ ] `createWorkdayAdapter()` returns a fresh frozen instance each call; two calls return `!==` instances
- [ ] `adapter` satisfies the `AtsAdapter` interface structurally (type-level compile assertion in adapter-contract.spec.ts)
- [ ] `adapter.scanForm(doc)` auto-detects the current step and returns a `FormModel`
- [ ] `adapter.detectCurrentStep` is a function returning `WorkdayWizardStep` (including `'unknown'`)
- [ ] `adapter.watchForStepChange` is a function returning a cleanup function; debounce is 150ms
- [ ] `adapter.scanStep(doc, step)` dispatches to the correct per-step scanner and returns a `FormModel`
- [ ] `adapter.fillStep(step, profile)` returns `ReadonlyArray<FillResult>` (D1 signature); internal fillers return `FillPlanResult` but `fillStep` flattens to `[...filled, ...failed]`
- [ ] `detectCurrentStep` passes parameterized tests across all 3 tenant fixture sets for all 4 wizard steps (12 happy cases)
- [ ] `detectCurrentStep` returns `'unknown'` for empty documents and garbage input
- [ ] `detectCurrentStep` priority order is tested: data-automation-id beats URL, URL beats h2 text, all three beat `'unknown'`
- [ ] `detectCurrentStep` H2 heuristic is English-only; non-English fixture returns `'unknown'` with a documented limitation note
- [ ] `watchForStepChange` fires callback exactly once when `data-automation-id` mutates from one step marker to another (150ms debounce)
- [ ] `watchForStepChange` debounces rapid mutations into a single callback
- [ ] `watchForStepChange` cleanup function fully disconnects the observer
- [ ] `watchForStepChange` handles detached docs (`defaultView === null`) gracefully with no-op cleanup
- [ ] `watchForStepChange` handles back navigation (from `my-experience` to `my-information`)
- [ ] My Information scanner emits >= 15 fields from each tenant's fixture (parameterized)
- [ ] My Information filler fills >= 15 fields with a complete Profile
- [ ] My Information filler skips missing-profile-value fields with `reason: 'profile-field-empty'`, not failure
- [ ] My Experience scanner correctly identifies 2+ existing work history rows on tenant-a fixture
- [ ] My Experience filler handles row-add loop: 1 existing row + 3 profile entries clicks "Add Another" 2 times, fills all 3 rows
- [ ] My Experience filler **aborts with `max-rows-reached`** when `addAnother` button is disabled after N clicks
- [ ] My Experience filler **aborts on required-field failure in a row** and does not touch subsequent rows (`aborted: true`, `abortReason: 'wizard-not-ready'`)
- [ ] My Experience filler **never deletes pre-existing rows** (extra rows produce `skipped` entries with `reason: 'out-of-scope-for-v1'`, never destruction)
- [ ] **Voluntary Disclosures filler SKIPS all EEO fields when `allowEeoAutofill !== true`**, verified by spy asserting zero `HTMLInputElement.prototype.value` setter calls
- [ ] **Voluntary Disclosures filler SKIPS all EEO fields when `demographics === undefined`**, verified by spy asserting zero `click` + zero `dispatchEvent` calls
- [ ] **Voluntary Disclosures filler FILLS work-auth fields even when EEO consent not granted** -- WRONG: per the gate logic, the entire filler short-circuits on EITHER gate failure. Work-auth only fills when both gates pass. The memo §2.6 "work-auth fills regardless of demographics consent" is achieved because work-auth fields live on the Voluntary Disclosures page AND the gate only checks `allowEeoAutofill + demographics`. **Clarification**: if `allowEeoAutofill` is false, NOTHING on voluntary-disclosures page fills, including work-auth. This is the safer interpretation. If the product requires work-auth to fill independently, file a design question to the architect BEFORE starting B9 -- this is a semantic change.
- [ ] **Voluntary Disclosures filler FILLS EEO + work-auth fields when both gates pass**, verified explicitly
- [ ] Review scanner reports field values without writing; verified by DOM mutation method spy assertions on `Element.prototype.setAttribute`, `HTMLInputElement.prototype.value setter`, `HTMLElement.prototype.dispatchEvent`, `HTMLElement.prototype.click` -- all zero calls
- [ ] File attacher:
  - reports `ok: true` when success icon appears within 5000ms
  - reports `file-attach-failed` (silent rejection path) when `input.files.length === 0` post-assignment
  - reports `file-attach-failed` (timeout path) when success icon never appears within 5000ms
  - catches `InvalidStateError` by name match and returns `file-attach-failed`
  - **rethrows** unknown errors (NetworkError, TypeError) -- does not swallow
- [ ] Dropdown widget: full event sequence, 3000ms listbox wait, exact-case preference, 100ms commit wait, returns typed failure on no option / no listbox
- [ ] Date picker widget handles triple-input and month-year variants
- [ ] Searchable select widget handles Workday combobox via strategy A (type + click) and strategy B (Tab via `getReactProps`) fallback
- [ ] Radio group widget verifies `aria-checked === "true"` post-click
- [ ] Checkbox widget handles single + multi-select cluster variants
- [ ] `react-props.ts` `fillReactTextInput` uses native setter + dispatches input/change/blur
- [ ] `react-props.ts` is an INLINE FORK (not a re-export); header attributes berellevy
- [ ] `blueprint.contract.ts` (`WORKDAY_BLUEPRINT`) exists with correct `publicExports`, `adapterShape.members`, `forbiddenImports`, `tenants`
- [ ] `blueprint-contract.spec.ts` asserts `publicExports` match actual barrel exports
- [ ] `blueprint-contract.spec.ts` asserts `forbiddenImports` are absent from `src/ats/workday/**` source files
- [ ] `blueprint-contract.spec.ts` asserts all 12 tenant fixture files exist
- [ ] `adapter-contract.spec.ts` (D18) passes with all 10 assertion groups
- [ ] All 12 fixture files present under `tests/ats/workday/fixtures/tenant-{a,b,c}/`
- [ ] Test coverage >= 85% line, 80% branch on `src/ats/workday/**` (D24)
- [ ] `pnpm typecheck` exits 0 in engine repo
- [ ] `pnpm lint` exits 0 (MPL-2.0 file header rule enforced on every new src file)
- [ ] `pnpm test --coverage` exits 0 with coverage thresholds met
- [ ] `pnpm build` produces `dist/ats/workday/index.{js,cjs,d.ts}`
- [ ] No `document|window|HTMLElement|chrome\.` tokens in `dist/core/**` (D14 grep gate)
- [ ] No em dashes (U+2014) in any `src/ats/workday/**` file or in this plan file (D15)
- [ ] No `console.*` in any `src/ats/workday/**` file (tests exempted)
- [ ] `scripts/check-exports-resolution.mjs` passes; all 9 entries resolve; Workday adapter has `'adapter' in mod` and `mod.adapter.kind === 'workday'`
- [ ] `scripts/check-blueprint-contracts.mjs` passes
- [ ] `scripts/rollback-phase-B9.sh` exists, executable, runs in a throwaway clone and produces a typecheck-clean tree (CI-verified weekly per D23)
- [ ] Bundle size: `dist/core/index.js` gzipped < 30KB; total `dist/` gzipped < 150KB
- [ ] `pnpm pack --dry-run` tarball contains `LICENSES/MPL-2.0.txt` and `LICENSE`
- [ ] `pnpm pack --dry-run` tarball does NOT contain `tests/`, `investigation/`, `fixtures/`, `temp/`, `.orig`
- [ ] `pnpm publish --dry-run --access public --tag alpha` succeeds
- [ ] `pnpm publish --access public --tag alpha --provenance` succeeds (from GitHub Actions context, 2FA OTP provided manually)
- [ ] `npm view ats-autofill-engine@0.1.0-alpha.2 version` prints `0.1.0-alpha.2` within 15s of publish
- [ ] `npm view ats-autofill-engine@0.1.0-alpha.2 --json | grep provenance` shows attestation
- [ ] Git tag `v0.1.0-alpha.2` created and pushed to origin
- [ ] GitHub release `v0.1.0-alpha.2` exists with CHANGELOG content copied into release notes
- [ ] Pinned issue opened: `0.1.0-alpha.2 released, integration blocking A8`

### Visual smoke test (manual, one live Workday tenant)

1. User signs in to the Chrome extension (A4-A7 already working)
2. User navigates to a live public Workday application posting on tenant-A
3. User clicks Apply; Workday renders the My Information page
4. User clicks the popup Fill button; fields populate
5. User clicks Workday's "Save and Continue" manually
6. Extension detects transition via `watchForStepChange` -> `my-experience`
7. User clicks Fill; work history and education rows populate
8. User clicks "Save and Continue"
9. Extension detects transition -> `voluntary-disclosures`
10. User clicks Fill. **EEO fields are SKIPPED (allowEeoAutofill defaults to false)**; work-auth fields skip too per the gate semantics clarified above -- see the acceptance-criteria clarification bullet for the product decision needed before running B9.
11. User clicks "Save and Continue"
12. Extension detects transition -> `review`
13. Extension reports all rendered field values via `scanReview` (no writes)
14. User reviews and manually clicks Workday's Submit. Demo ends.

---

## Tests to write (explicit list)

Every test file lives under `tests/ats/workday/`. Test runner: Vitest + happy-dom (configured in B1). All tests MUST follow D19 adversarial categories.

### `tests/ats/workday/adapter-contract.spec.ts` (D18)

See Step 37 spec. 10 assertion groups. Identical shape to B7 and B8 contract tests.

### `tests/ats/workday/step-detector.spec.ts` (parameterized across 3 tenants)

- Parameterized (12 cases): for each (tenant, step), the fixture yields the correct `WorkdayWizardStep` value
- Empty document returns `'unknown'`
- Mangled `data-automation-id` falls through to URL fragment
- Garbage URL + missing markers returns `'unknown'`
- Priority test: both `legalNameSection_firstName` and `workExperienceSection` present -> `'my-information'` wins
- Non-English H2 fallback returns `'unknown'` (documented limitation)
- **D19 adversarial: null doc** -- throws TypeError (documented) OR returns `'unknown'` defensively (pick one, document the choice)
- **D19 adversarial: frozen doc** -- works identically, no mutation attempts
- **D19 adversarial: 10000-node DOM** -- executes in < 50ms

### `tests/ats/workday/step-watcher.spec.ts`

- Fires callback when `data-automation-id` mutates from step 1 marker to step 2 marker
- Debounces 10 rapid mutations into one callback fire (150ms)
- Cleanup disconnects observer, no callback after cleanup
- No spurious fire when mutation does not change detected step
- Listens for popstate events (secondary path)
- Handles detached document gracefully (`defaultView === null`)
- Handles back navigation (step regression)
- **D19 adversarial: 1000 rapid mutations** -- debounce still collapses to one fire
- **D19 adversarial: cleanup called twice** -- second call is a no-op, does not throw

### `tests/ats/workday/my-information.spec.ts` (parameterized 3 tenants)

- Scanner emits >= 15 fields from each tenant
- Scanner correctly tags each field with `automationId` in `dataAttributes`
- Filler fills all fields with complete profile
- Filler skips missing profile values with `reason: 'profile-field-empty'`
- Filler handles empty-string profile values as missing
- Filler never throws, always returns `FillPlanResult`
- Filler reports zero failures on clean happy-dom run
- **D19 adversarial: profile with 100KB firstName** -- Workday's input `maxlength` rejects; filler reports `value-rejected-by-page`
- **D19 adversarial: profile with null bytes** -- filler sanitizes or rejects
- **D19 adversarial: profile with unicode emoji in name** -- fills correctly
- **D19 adversarial: concurrent re-entry (fire fillMyInformation twice in parallel)** -- both runs complete without corrupting each other; each gets its own planId

### `tests/ats/workday/my-experience.spec.ts` (parameterized 3 tenants)

- Scanner identifies 2 pre-existing work history rows on tenant-a `my-experience.html`
- Scanner identifies education rows, language rows
- Scanner captures resume upload input as top-level file field
- Filler with 2 existing + 2 profile entries: no Add Another clicks, fills both rows
- Filler with 1 existing + 3 profile entries: clicks Add Another 2 times, fills all 3 rows
- Filler with 3 existing + 2 profile entries: does NOT delete, emits `skipped[reason='out-of-scope-for-v1']` for the extras
- Filler aborts on required-field failure in row 0, does not touch row 1; `aborted: true`, abortReason set
- **Filler with max-rows reached (Add Another button disabled after 10 clicks)**: aborts with synthetic failure reporting `max-rows-reached`; does not infinite-loop
- Resume upload happy path (spy on `attachWorkdayResume` verifies one call)
- Resume upload DataTransfer rejection path
- **D19 adversarial: profile with 50 work history entries** -- filler either caps at max-rows-reached or fills 50; does not hang

### `tests/ats/workday/voluntary-disclosures.spec.ts` (LEGAL-CRITICAL, 11 cases)

See Step 39 spec. 11 test cases including:
1. EEO denied: zero DOM mutations (spy assertions)
2. EEO granted: fills normally
3. Demographics undefined: short-circuit
4. Work-auth fills regardless -- **needs product clarification per acceptance criteria**
5. Step change during fill (simulated)
6. Back navigation (documented cross-reference to step-watcher.spec)
7. Multi-tenant parity (3 tenants)
8. Partial fixture (only gender EEO field present)
9. Prefer-not-to-say mapping
10. Frozen profile
11. Type-bypass gate: `'yes' as unknown as boolean` for `allowEeoAutofill` -- gate uses `=== true`, short-circuits correctly

### `tests/ats/workday/review.spec.ts` (parameterized 3 tenants)

- Scanner returns >= 10 field reports from each tenant's fixture
- ZERO DOM writes during scan; spy assertions on value setter, `dispatchEvent`, `click`, `setAttribute`
- Missing review field in fixture: scanner skips without throwing
- Returns trimmed text from each element's `placeholder` field (which carries the rendered value)
- Scanner output `FormModel` has `sourceATS: 'workday'`

### `tests/ats/workday/file-attacher.spec.ts`

- Happy path: `ok: true`
- Silent rejection (`files.length === 0` after assignment): `ok: false, error: 'file-attach-failed'`
- Timeout (success icon never appears at 5000ms): `ok: false, error: 'file-attach-failed'`
- InvalidStateError thrown by DataTransfer: caught by name match, returns `ok: false, error: 'file-attach-failed'`
- **Unknown error (NetworkError)**: **RETHROWS**, not swallowed. `expect(() => attach(...)).rejects.toThrow()`
- Bubbling input+change events dispatched

### `tests/ats/workday/widgets/dropdown.spec.ts`

- Full pointer event sequence
- Listbox wait at 3000ms
- Option-not-found
- Listbox-never-opened
- Exact-case preferred over case-insensitive
- 100ms commit wait

### `tests/ats/workday/widgets/{searchable-select,date-picker,radio-group,checkbox}.spec.ts`

Each: happy path + 3+ adversarial cases (null, undefined, element detached, multiple matches, etc.).

### `tests/ats/workday/react-props.spec.ts`

- `getReactProps` returns null for non-React elements
- `getReactProps` returns props object when `__reactProps$*` key present
- `fillReactTextInput` uses native setter; spy asserts one call
- `fillReactTextInput` dispatches input + change + blur events
- `fillReactTextInput` returns `false` when value setter is missing (defensive)

### `tests/ats/workday/blueprint-contract.spec.ts`

See Step 41 spec.

---

## Rollback plan

Rollback is **mechanical via `scripts/rollback-phase-B9.sh`** (D23). See Snippet 12. Five scenarios:

1. **Technical rollback (source failure before publish)**: run `scripts/rollback-phase-B9.sh`. Engine stays at `0.1.0-alpha.1` (B1 placeholder). A8 falls back to importing only `greenhouse` + `lever` sub-entries. Workday import in A8 is guarded behind a feature flag that stays off. Extension still demos GH + Lever; Workday shipped in alpha.3 after fix.

2. **Partial rollback per wizard step**: if only Voluntary Disclosures filler fails acceptance (e.g. consent gate test catches a leak), ship B9 WITHOUT that step. `adapter.fillStep('voluntary-disclosures', ...)` becomes a stub returning empty results with `aborted: true, abortReason: 'wizard-not-ready'`. Document in CHANGELOG as known limitation. This does NOT require a full rollback, just a plan edit to mark voluntary-disclosures filler as out-of-scope for alpha.2 and a v1.1 ticket.

3. **Publish rollback (critical bug discovered within 72h of publish)**: run `npm deprecate ats-autofill-engine@0.1.0-alpha.2 "see v0.1.0-alpha.3"` and publish `0.1.0-alpha.3` with the fix. **Never `npm unpublish`**; unpublishing would break A8's lockfile and is a 72h-window-only action that surprises downstream.

4. **Bundle-boundary rollback**: if `grep` finds `document|window|chrome\.` in `dist/core/**`, identify the offending import in the core module and move it to `adapters/dom/**`. Do NOT use `@ts-ignore` or `eslint-disable`. The grep gate is non-negotiable.

5. **Demo-day rollback**: if by the April 20 demo the Workday adapter is still unstable on the target tenant, the demo script pivots to My Information only (most reliable step), then manually walking through the other wizard pages explaining "the extension is compatible; full wizard fill is a work in progress". Michael gets the value proposition without a broken demo.

---

## Out of scope (explicit non-goals for this phase)

- **Auto-advance between wizard steps.** The user ALWAYS clicks "Save and Continue" themselves. No exceptions. Any contributor who suggests auto-advance is rejected at code review.
- **Auto-submit the application on the Review page.** Never.
- **A8 owns the wizard orchestration loop** (D6). B9 provides stateless primitives (`detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep`) that A8 composes in its `AutofillController`. B9 has NO internal `wizard/state.ts` file. B9 has NO knowledge of `currentStep` persistence across calls. B9's `detectCurrentStep` is stateless observation; `watchForStepChange` is a subscription API that calls back on boundary; `scanStep`/`fillStep` are parameterized by the step the caller provides. If A8 needs a step state container, A8 builds it in `entrypoints/ats.content/autofill-controller.ts`.
- **Workday "Save for later" flow.** Different URL pattern, different DOM, different state. Backlog v1.1.
- **Workday account creation.** Adapter assumes the user is already signed in to the Workday tenant. The old polya20 fork had account-creation support (`createAccountCheckbox`, password fields) but it is TOS-ambiguous and not required for demo.
- **Multi-language Workday selectors.** English-only `aria-label` strings and H2 heading text. Spanish, French, German, Japanese tenants fall through H2 heuristic to `'unknown'`. v1.1 adds language detection + per-language selector maps + translated `aria-label` expectations.
- **Internal Workday tenants behind SSO / custom domains.** Enterprise customers sometimes host Workday under their own subdomain (e.g. `careers.acme.com`). The adapter's `matchesUrl` only matches `*.myworkdayjobs.com`. v1.1 adds a pluggable host matcher + user-configurable allowlist.
- **Workday Recruiting module (internal).** Different DOM, different selector constants, not a candidate-facing flow. Out of scope.
- **Visual highlighter integration for Workday-specific JD keywords.** B6 ships the generic highlighter renderer; Workday-specific JD parsing is A9's scope.
- **Ashby / BambooHR / Workable / Jobvite / SmartRecruiters adapters.** All v1.1+.
- **Auto-retry on transient failures.** If a widget fill fails with `value-rejected-by-page`, the filler reports failure once; the user retries manually by clicking Fill again. No internal retry loop.
- **`profile` caching across fill invocations.** Each `fillStep` call accepts a fresh profile. No module-level profile cache.
- **Cross-tab wizard state.** Each tab has its own `AutofillController` in A8; no background-script wizard state.

---

## Compliance gates

These commands run sequentially in Part J (step 42) and again in Part K (step 44) before publish. All must exit 0:

```bash
cd e:/ats-autofill-engine

# 1. TypeScript compilation
pnpm typecheck

# 2. Lint (ESLint + Prettier + MPL-2.0 header rule)
pnpm lint

# 3. Tests + coverage
pnpm test --coverage
# Coverage: 85% line / 80% branch on src/ats/workday/** (D24)

# 4. Build
pnpm build

# 5. D14 anti-drift gates
scripts/check-core-leak.sh
scripts/check-no-console.sh
scripts/check-no-em-dash.sh
scripts/check-exports-resolution.mjs
node scripts/check-blueprint-contracts.mjs

# 6. Bundle size (D22 blueprint coverage field + D24 thresholds)
pnpm size-limit
gzip -c dist/core/index.js | wc -c   # < 30720 bytes
gzip -c dist/index.js | wc -c         # < 153600 bytes (relaxed per v2.1 memo)
```

If ANY step fails, STOP the phase, triage, fix root cause, re-run full gate. Do NOT cherry-pick gates.

---

## Critical executor notes

1. **Multi-step wizard is the hardest ATS adapter in this plan.** Budget your 14-18 hours deliberately:
   - Step detection + transitions: 1.5h
   - Selector maps (all 4 steps): 2h
   - Widgets (dropdown, searchable select, date picker, radio, checkbox, text wrap): 3h
   - My Information scanner + filler: 1.5h
   - My Experience scanner + filler (hardest, repeating sections, max-rows abort): 3h
   - Voluntary Disclosures scanner + filler (consent gate + 11-case test): 2h
   - Review scanner + filler (no-op): 0.5h
   - File attacher: 1h
   - Adapter factory + barrel + blueprint.contract: 0.5h
   - Multi-tenant fixture capture (3 tenants x 4 steps = 12 files): 3h
   - Adapter-contract spec + blueprint-contract spec: 1h
   - Publish sub-phase: 0.5h

   **Start with Step 1-6 (types + step detection).** Voluntary Disclosures is the highest-risk phase; save it for when you are fresh, not when you are tired. The EEO consent gate test suite is non-negotiable and requires focused attention.

2. **Never auto-submit, never auto-advance.** The extension ONLY fills fields when the user clicks the popup Fill button. The user manually clicks Workday's "Save and Continue" button to move to the next wizard step. Safety constraint + correct UX. The `saveAndContinueButton` selector carries a JSDoc warning; every code reviewer rejects any programmatic click on it.

3. **berellevy/job_app_filler is the primary reference but is BSD-3-Clause, not MIT.** Every file containing forked code retains the berellevy copyright attribution line in addition to the MPL-2.0 header. See Snippet 1. Do NOT delete the attribution on refactor. `react-props.ts` is an INLINE FORK (not a re-export) because B5 does not ship `fillReactTextInput`; verified against `phase_B5_dom_adapter_scanner_and_filler/plan.md`. If a future B5 revision adds the helper, retire this file and re-export from `ats-autofill-engine/dom`.

4. **EEO fields are LEGALLY SENSITIVE.** The voluntary-disclosures filler MUST short-circuit with ZERO DOM interaction when `profile.consents.allowEeoAutofill !== true` OR `profile.demographics === undefined`. This is not a bug; it is the entire point of the design. Legal basis: GDPR Art. 9 (UK GDPR Art. 9) special category data, US ADA / EEO-1 voluntary self-ID, California CCPA sensitive personal information.
   - Dedicated test verifies the short-circuit with DOM write spies (not just a `filled === 0` assertion; the spies catch partial or accidental writes).
   - The short-circuit must happen BEFORE any DOM query on EEO fields. The skipped-list entries are built from a STATIC catalogue (selector map module constants), not from a DOM scan.
   - Document the gate in README, CHANGELOG, and JSDoc block on the filler function.
   - **Open semantic question** (see acceptance criteria): does work-auth fill on voluntary-disclosures when `allowEeoAutofill === false`? Current plan: NO, the entire filler short-circuits. File a design question to the architect BEFORE starting if the product requires work-auth to fill independently.

5. **File upload may silently fail.** DataTransfer works on GH/Lever but Workday's upload widget is custom. Always check `input.files.length` after assignment AND wait for the success icon at 5000ms. Report failure via `userMessage` (stored on a future result extension; for now reason codes suffice). Do NOT `console.log` (rule: no console).

6. **Repeating sections are tricky.** Clicking "Add Another Work Experience" triggers a React re-render and lazy-mounts the new row. The scanner must RE-SCAN after each click (via `waitForElement` with row-count observation). Polling interval: 100ms, timeout 2000ms per row-add. Max-rows-reached (button disabled) aborts with a synthetic failure, does not loop forever.

7. **Never use `window`, `document`, or `chrome.*` from `src/core/**`.** The boundary grep in the anti-drift script rejects the build. All DOM access goes through `src/ats/workday/**` or `src/adapters/dom/**`. The adapter factory `getDoc()` injection makes testing feasible without breaching the boundary (the factory lives under `src/ats/`, not `src/core/`).

8. **Happy-dom limitations.** Happy-dom does not fully simulate `PointerEvent`. In test helpers, use `MouseEvent` as a fallback when `PointerEvent` throws. Production code always prefers `PointerEvent` first (real browsers support it).

9. **No em dashes in code, comments, docs, or this plan file.** Per user instruction and D15 CI gate. Use `--` or `:` or split into two sentences. The pre-commit hook rejects files containing U+2014.

10. **Publish sub-phase is sequential.** Do NOT publish until B7 (Greenhouse) and B8 (Lever) are both merged AND their acceptance criteria pass. The three adapters ship together in `0.1.0-alpha.2` or not at all. The D12 publish hardening (dry-run, provenance, 2FA, post-publish verification) runs in Part K.

11. **Commit cadence.** Per the Michael communication plan, aim for 3-4 commits per day on this phase. Each logical unit (step detector, selector maps, widgets, scanners, fillers, tests) is a separate commit. Michael's Discord trust is rebuilt by visible commit velocity.

12. **If any test fails, FIX THE CODE, not the test.** Per `.claude/rules/testing.md`: tests exist to BREAK code; a passing test after assertion manipulation proves nothing. If the consent-gate test spy catches a hidden DOM write, the filler has a bug; find it, fix it, re-run. Never weaken the assertion.

13. **Adapter factory vs module-singleton.** Per D1 and keystone §6, the barrel exports BOTH `createWorkdayAdapter()` (factory) and `adapter` (frozen module-singleton). A8 imports `adapter` for production; tests import `createWorkdayAdapter({ doc })` for injection. Do not remove either export; both are required.

14. **`fillStep` signature is `(step, profile) => Promise<ReadonlyArray<FillResult>>`** (D1), not `(doc, step, profile) => Promise<FillPlanResult>`. The adapter factory captures `getDoc()` from the injected options. Internal fillers return `FillPlanResult` with `filled`, `skipped`, `failed`, `aborted`; `fillStep` flattens to `[...filled, ...failed]` for the A8 consumer. If a test needs the full `FillPlanResult`, it calls `fillMyInformation` etc. directly, not `adapter.fillStep`.

15. **Debounce / timeout tuning**:
    - MutationObserver debounce: **150ms** (raised from 50ms)
    - Listbox wait: **3000ms** (raised from 2000ms)
    - File upload ack timeout: **5000ms** (raised from 2000ms)
    Each constant is exported from its respective file for test override via `vi.stubGlobal`.

16. **Narrow catch in file-attacher**: `catch (err) { if (err instanceof Error && err.name === 'InvalidStateError') { ... }; throw err; }`. Rethrowing unknown errors surfaces bugs in `waitForElement` or `fillReactTextInput` that would otherwise be swallowed.

17. **Row-add max limit**: `fillMyExperience` checks `button.disabled` before each `click()`. If disabled, aborts with synthetic `max-rows-reached` failure. Does not loop forever.

18. **Widget dispatch is concrete**: `widget-dispatch.ts` implements `dispatchWidget(field, value, doc, planId)` as an explicit switch over `classifyFieldWidget(field)` returning `WorkdayWidgetKind`. No registry, no plugin system; a switch statement that the type checker can verify exhaustively. `valueToText` and `valueToBool` are module-private helpers co-located in the same file.

19. **D22 `blueprint.contract.ts` is a real file, not documentation**. Every phase ships one; CI parses them and validates against reality. `WORKDAY_BLUEPRINT.publicExports`, `adapterShape.members`, `forbiddenImports`, `tenants` are all verified by automated tests (`blueprint-contract.spec.ts` + `check-blueprint-contracts.mjs`).

20. **D25 multi-tenant fixtures are non-negotiable**: 3 tenants x 4 steps = 12 HTML files. Capture them FIRST (step 36) before writing scanner tests. If tenant capture blocks (e.g. a tenant requires account creation to reach the EEO page), file a partial-rollback ticket and document which tenant is missing, but do not skip the 3-tenant requirement silently.

---

**End of Phase B9 plan.**
