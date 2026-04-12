# Review — Phase B8 (Lever adapter)

**Reviewer**: Claude Opus 4.6 (1M context)
**Date**: 2026-04-11
**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B8_lever_adapter/plan.md`
**Grade**: **D**

---

## Summary

B8's plan is a well-written, self-aware, 1293-line Lever adapter spec with good scope hygiene (MPL headers, attribution, no skill-taxonomy, no HighlightRange) and defensible edge-case coverage (combined-name vs split-name variant, URL gating, bracketed CSS selectors). In isolation it reads as a thoughtful phase.

However, **the plan contradicts its own upstream contracts in at least nine load-bearing places** and **breaks parity with B7 (Greenhouse) on the single most important surface that A8 depends on**: the `adapter` object export. The executor cannot implement B8 as written without B2, B5, and B6 drifting from their current plans. Every contract drift is catalogued below with a specific upstream counter-citation.

Because the drifts are fundamental (wrong import paths, nonexistent types, nonexistent FieldType values, nonexistent FillResult reason codes, missing sourceATS field, wrong A8 export shape), B8 requires substantial rewrite before the orchestrator can execute it. Grade **D** reflects "structurally sound but the contracts are fiction".

---

## Checklist A — Preconditions and upstream contracts

### A1. `FieldType` values used in `LEVER_SELECTORS` do not exist in B2 — BLOCKER

`src/ats/lever/selectors.ts` (Step 3) types the map as `Readonly<Record<FieldType, readonly string[]>>` and uses keys:

```
firstName, lastName, fullName, email, phone, currentLocation,
currentCompany, linkedinUrl, githubUrl, twitterUrl, portfolioUrl,
resumeFile, eeoGender, eeoRace, eeoVeteranStatus, eeoDisabilityStatus,
eeoDisabilitySignature, eeoDisabilitySignatureDate
```

`phase_B2_core_types_and_taxonomy/plan.md` Step 8 (lines 307-430) derives `FieldType` verbatim from agent 46 and uses Mozilla-baseline **kebab-case** tokens:

```
'name' | 'given-name' | 'family-name' | 'email' | 'tel' | ...
```

None of the 18 camelCase keys B8 uses exist in the FieldType union. The B8 plan even explicitly says "If any is missing from B2, STOP and surface the gap" — but asserts they're all present. They are all absent.

**Impact**: every `Record<FieldType, ...>` entry is a type error; the entire selectors.ts file does not type-check.

**Fix**: either (a) rewrite B8 to use kebab-case FieldType values (`given-name`, `family-name`, `tel`, etc.) and drop B2 non-members, or (b) draft a B2 addendum extending the FieldType union with the missing ATS-extension values BEFORE B8 runs. B6/B7 have the same dependency, so this is a cross-plan B2 gap, not B8-specific — but B8 cannot execute without it.

### A2. `JobPostingData` type does not exist in B2 — BLOCKER

B8 Step 7 imports `JobPostingData` from `'../../core/types'`. Searching `phase_B2_core_types_and_taxonomy/plan.md`: zero references to `JobPostingData`. The B2 barrel (Step 7) exports only `FormFieldDescriptor`, `FormModel`, `ClassifiedField`, `FillInstruction`, `FillPlan`, `FillResult`, `FillError`, `FillValue`, `HighlightRange`, `AtsVendor`.

B6 phase plan (line 47) says: "B2 defines `JobPostingData` and `PageIntent` in `src/core/types/**`. If those types do not exist or differ from what this plan assumes, STOP and fix B2 first." It does not exist. Neither B6 nor B7 nor B8 can proceed without an upstream B2 amendment.

**Impact**: B8's `job-extractor.ts` signature `extractLeverJobPosting(doc): JobPostingData | null` refers to a phantom type.

**Fix**: blueprint B2 to add `JobPostingData` (and `PageIntent`) as first-class core types before any B6/B7/B8 work begins, OR declare `JobPostingData` in B6 and import from `../../adapters/dom/jd/jsonld-extractor` (see A3 below).

### A3. `extractJobPostingFromDocument` import path is wrong — BLOCKER

B8 Step 7 imports from `'../../core/extraction/jsonld-extractor'`.

`phase_B6_dom_adapter_highlighter_renderer/plan.md` line 95 creates the extractor at `src/adapters/dom/jd/jsonld-extractor.ts` — **NOT** `src/core/extraction/**`. The decision memo §2.5 hex architecture also disallows `core/extraction/` because core has "zero DOM" and JSON-LD parsing requires `Document`.

B7 Step 0 smoke import (line 167) uses `'../../adapters/dom/jsonld-extractor'` which is also wrong (should be `/jd/jsonld-extractor`) — so B7 has the same drift, but B8 has drifted further by placing it in `core/`.

**Impact**: `src/ats/lever/job-extractor.ts` fails to resolve the import. Typecheck fails.

**Fix**: correct the import to `'../../adapters/dom/jd/jsonld-extractor'` (or to the B6 barrel `'../../adapters/dom'` if that barrel re-exports it per B6 §115). Also correct B7 for parity.

### A4. B5 `fillField` signature mismatch — BLOCKER

B8 Step 5 (`field-filler.ts`) calls:

```ts
import { fillField } from '../../adapters/dom';
return fillField(el, instruction);  // (el, FillInstruction)
```

`phase_B5_dom_adapter_scanner_and_filler/plan.md` Step 5 (lines 660-820) and test fixture (line 1385) define:

```ts
export function fillField(el: FillableElement, value: string | boolean): FillResult
```

**B5 `fillField` takes `(el, value: string | boolean)`, NOT `(el, FillInstruction)`**. B8 is passing the wrong second argument. B7 got it right (`fillField(el, value, hints)` — plans a wrapper that extracts the primitive value).

**Impact**: every B5 `fillField` call in B8's `field-filler.ts` is a type error.

**Fix**: B8 must extract `instruction.value.value` (or similar, depending on the FillValue discriminant) and pass a primitive to B5. Also add a kind-switch for 'file' (which should route to attachFile, not fillField).

### A5. B5 `FillResult` shape mismatch — BLOCKER

B8 returns `{ ok: false, reason: 'element-not-found' }` in six places.

`phase_B5_dom_adapter_scanner_and_filler/plan.md` Step 5 + B2 `fill-instruction.ts` line 244-254 define:

```ts
export type FillResult =
  | { readonly ok: true; readonly selector: string }
  | { readonly ok: false; readonly selector: string; readonly error: FillError };
```

The failed shape has `selector` + `error`, NOT `reason`. B5's `FillFailureReason` union is local to the filler (line 685) and is NOT the public error type — the public type is `FillError`, which has 6 values:

```
'selector-not-found' | 'element-disabled' | 'element-not-visible'
| 'value-rejected-by-page' | 'file-attach-failed' | 'unknown-error'
```

B8 uses reason strings that are not in EITHER `FillFailureReason` or `FillError`: `'element-not-found'`, `'wrong-element-type'`, `'variant-mismatch'`.

**Impact**: B8's six return sites for failure are all type errors; the test assertion `if (!r.ok) expect(r.reason).toBe('variant-mismatch')` has no runtime meaning because `r.reason` doesn't exist.

**Fix**: (a) use `FillError` ('unknown-error' is the catch-all) OR (b) draft a B2 addendum to extend `FillError` with 'variant-mismatch'/'wrong-element-type' etc. OR (c) introduce a Lever-local `LeverFillResult` type that extends the public contract with richer failures. Option (c) breaks consumer polymorphism (A8 can't treat Lever's result uniformly), so (a)/(b) are correct.

### A6. `FormModel.sourceATS` field does not exist — BLOCKER

B8 Step 4 (`form-scanner.ts`) returns:

```ts
formModel: { fields: [], sourceATS: 'lever', pageUrl: doc.location?.href ?? '' }
```

and spreads `{ ...model, sourceATS: 'lever' }`.

`phase_B2_core_types_and_taxonomy/plan.md` Step 2 (lines 149-154) defines:

```ts
export interface FormModel {
  readonly url: string;
  readonly title: string;
  readonly scannedAt: string;
  readonly fields: ReadonlyArray<FormFieldDescriptor>;
}
```

**`sourceATS` and `pageUrl` do not exist on `FormModel`.** B2 has `AtsVendor` as a standalone type alias, but `FormModel` does not embed it. Additionally, B8's empty-formModel literal omits the three required fields (`url`, `title`, `scannedAt`) and adds two fake ones (`sourceATS`, `pageUrl`).

B8's test `expect(formModel.sourceATS).toBe('lever')` will fail to type-check.

**Impact**: `form-scanner.ts` does not type-check; the `scanLeverForm` test suite is written against a phantom shape.

**Fix**: either (a) draft a B2 amendment to add `sourceATS?: AtsVendor` to FormModel (cross-adapter concern — better), or (b) drop the sourceATS stamping from B8 and let the caller tag the model externally. Also emit the real required fields (`url`, `title`, `scannedAt`) when returning an empty model.

### A7. B5 `attachFile` shape + return type mismatch — BLOCKER

B8 Step 6 (`file-attacher.ts`) declares:

```ts
import type { AttachResult } from '../../core/types';
export function attachLeverResume(root: ParentNode, file: File): AttachResult {
  return attachFile(el, [file]);  // sync call, treats AttachResult as non-Promise
}
```

`phase_B5_dom_adapter_scanner_and_filler/plan.md` Step 6 (lines 850-910) defines:

```ts
export async function attachFile(input, fileOrFiles, opts): Promise<FillResult>
```

- **Return type is `Promise<FillResult>`, not `AttachResult`.** There is no `AttachResult` type in B2 or B5 barrel exports. Only `AttachFailureReason` exists (as a local union in B5 file-attacher.ts).
- `attachFile` is **async**; B8 treats it synchronously.
- B8 imports `AttachResult` from `'../../core/types'` — not exported there.

B8 also uses `{ ok: false, reason: 'resume-input-not-found' }` which again is not in the FillResult shape.

**Impact**: import fails; return type is wrong; even if typing were reconciled, the sync wrapping of an async call drops the Promise.

**Fix**: `attachLeverResume` must be `async`, return `Promise<FillResult>`, use the correct failure shape `{ok: false, selector, error: 'file-attach-failed'}`.

### A8. `AttachOptions` / `AttachResult` barrel exports missing — BLOCKER

B8 assumes `AttachResult` is exported from `'../../core/types'`. B5 Step 7 barrel exports `AttachFailureReason` and `AttachOptions` but never `AttachResult` — the type does not exist at all. B2 barrel (Step 7, line 284-305) exports no attach-related types.

**Impact**: dead import.

**Fix**: remove the import; use `FillResult`.

---

## Checklist B — Parity with B7 (Greenhouse adapter)

### B1. Adapter export shape diverges from B7 — BLOCKER

**B7 (parity target)** exports from `src/ats/greenhouse/index.ts` (lines 1515-1523):

```ts
export const GreenhouseAdapter = Object.freeze({
  matchesUrl, scanForm, fillField, attachFile,
  selectDropdown, extractJob, findFormRoot,
});
```

**B8** exports only flat named functions:

```ts
export { matchLeverUrl, scanLeverForm, fillLeverField, ... };
```

**No `LeverAdapter` namespace object.**

The reviewer prompt explicitly calls out "parity of adapter shape (same plan builder factory pattern)". B8 has no factory / frozen namespace parity with B7. Any consumer that does `GreenhouseAdapter.scanForm(doc)` cannot do the equivalent `LeverAdapter.scanForm(doc)`.

**Fix**: add `export const LeverAdapter = Object.freeze({ matchesUrl, scanForm, fillField, attachFile, extractJob, findFormRoot })` at the bottom of `src/ats/lever/index.ts` mirroring B7's pattern.

### B2. Filler signature diverges from B7 — BLOCKER

- **B7**: `fillGreenhouseField(el, value, hints?): FillResult` — 3 positional args, el+value+optional hints, matches B5's `fillField(el, value)` with a hints extension.
- **B8**: `fillLeverField(root: ParentNode, fieldType: FieldType, instruction: FillInstruction, context: LeverFillContext): FillResult` — 4 positional args, starts with ParentNode instead of Element, requires FieldType lookup, requires context object.

These signatures are completely different. A8's `AtsAdapter.fillField(instruction: FillInstruction): FillResult` (line 282) matches **neither**, but at least B7's can be adapted by wrapping `el = resolve(instruction.selector)`. B8's 4-arg signature cannot be reconciled with the `AtsAdapter.fillField` contract because B8 requires caller-supplied variant context.

**Fix**: collapse B8's signature to `fillLeverField(instruction: FillInstruction): FillResult` (or `(instruction, context?)`), do the element lookup internally via `document.querySelector(instruction.selector)`, and infer the variant once per scan (store on a closure when `scanLeverForm` runs, or re-detect on every call from the form root).

### B3. No matchesUrl name parity — MINOR

B7 names the URL matcher `matchesUrl`; B8 names it `matchLeverUrl`. Not wrong per se, but the `LeverAdapter.matchesUrl` spread (if it existed, per B1) would need a rename. Prefer `matchesUrl` for parity, keeping a `LEVER_URL_PATTERNS` constant for direct consumers.

### B4. Test barrel shape diverges — MINOR

B7 has 6 test specs with `greenhouse-classic-jsonld.html` and `greenhouse-remix-context.html` fixtures. B8 has 4 test specs with 3 fixtures. The delta is legitimate (Lever has simpler reality), but B8 is missing a dropdown-handler spec. Even though Lever uses native `<select>`, the filler should have a spec for the EEO dropdown case that exercises the option-value path. Current `field-filler.spec.ts` only covers text inputs (cases 1-9) and does not touch `eeoGender` select-one behavior. Recommend adding an 11th case: "fill eeoGender with choice value 'female' via select path".

---

## Checklist C — Parity with B2 / B5 / A8 contracts

### C1. A8 expects `mod.adapter` (lowercase), not `LeverAdapter` — BLOCKER

`phase_A8_content_script_autofill/plan.md` line 617:

```ts
case 'lever': {
  const mod = await import('ats-autofill-engine/lever');
  return mod.adapter;
}
```

Comment at line 601: *"Every adapter sub-entry exports an object literal named `adapter` with the `AtsAdapter` shape. B7/B8/B9 enforce this via a named export test."*

A8 expects **`export const adapter`** (lowercase), not `LeverAdapter` (PascalCase). B7 exports `GreenhouseAdapter`; A8 reads `mod.adapter`. **Both B7 and B8 miss this contract.** The A8 plan explicitly says B7/B8/B9 must "enforce this via a named export test" — no such test exists in B8's list (4 specs: url-patterns, form-scanner, field-filler, job-extractor).

The `AtsAdapter` interface B8 must satisfy (A8 line 270-297):

```ts
interface AtsAdapter {
  readonly scanForm: (root: Document) => FormModel;
  readonly fillField: (instruction: FillInstruction) => FillResult;
  readonly attachFile?: (instruction: FillInstruction) => Promise<FillResult>;
  readonly kind: 'greenhouse' | 'lever' | 'workday';
}
```

Not one of B8's exports matches this shape:
- `scanLeverForm(doc)` returns `LeverScanResult` (wraps FormModel), not `FormModel`.
- `fillLeverField(root, fieldType, instruction, context)` has wrong arity/types.
- `attachLeverResume(root, file)` takes `File`, not a `FillInstruction`; is sync, not async.
- `kind: 'lever'` is not exported.

**Impact**: A8's dynamic `import('ats-autofill-engine/lever')` at runtime yields an object with none of the expected properties; `adapter.scanForm is not a function` at test time.

**Fix**: add to `src/ats/lever/index.ts`:

```ts
export const adapter: AtsAdapter = Object.freeze({
  kind: 'lever',
  scanForm: (doc: Document) => scanLeverForm(doc).formModel,
  fillField: (instruction) => fillLeverField(instruction),
  attachFile: async (instruction) => {
    const handle = resolveFileHandle(instruction.value);
    return attachLeverResume(document, handle);
  },
});
```

This requires the prior signature fixes in A4/A7 to be real.

### C2. `scanLeverForm` loses FormModel vs LeverScanResult for A8 — BLOCKER

A8's `adapter.scanForm(root)` returns `FormModel`. B8's `scanLeverForm(doc)` returns `LeverScanResult = { formModel, variant, formRoot }`. The adapter object's `scanForm` must unwrap this and return only `formModel`. But then the variant metadata is **lost** before `fillLeverField` can use it.

**Fix**: stash the last scan result's variant on a module-level `WeakMap<Document, LeverFormVariant>` or a closure in the adapter factory, so `fillField` can re-read it. This requires B8 to introduce a factory pattern:

```ts
export function createLeverAdapter(): AtsAdapter {
  let lastVariant: LeverFormVariant = 'unknown';
  return Object.freeze({
    kind: 'lever',
    scanForm(doc) {
      const r = scanLeverForm(doc);
      lastVariant = r.variant;
      return r.formModel;
    },
    fillField(instruction) {
      return fillLeverField(document, instruction, { variant: lastVariant });
    },
    attachFile: async (instruction) => { ... },
  });
}
export const adapter = createLeverAdapter();
```

This factory pattern is what the reviewer prompt's "same plan builder factory pattern" hints at. B7 also lacks this pattern, so it's a cross-phase omission — but B8 needs it more because it actually has variant state.

### C3. A8 content script import path matches B1 exports map — OK

A8 uses `import('ats-autofill-engine/lever')`. B1 package.json exports (line 247-251) defines `./lever` → `./dist/ats/lever/index.js`. Path resolution is correct.

---

## Checklist D — Grep gate / forbidden tokens

### D1. `skill-taxonomy` — PASS
Zero matches in B8 plan. ✓

### D2. `HighlightRange` — PASS
Zero matches in B8 plan. ✓ (Note: B2 still ships `HighlightRange` as a v1 relic — decision memo §2.5 says engine does NOT own keyword matching, but the type alias remains in B2 Step 5. That's a B2 problem, not B8's.)

### D3. `@repo/shared-types` — PASS
Zero matches in B8 plan. ✓

### D4. Sibling adapter cross-imports — PASS
B8 grep gate §1 explicitly forbids `'../greenhouse`, `'../workday`, `'../../adapters/chrome`. Coverage is good, but missing a forbid for `'../../core/highlight'` and `'@repo/`.

### D5. `any` escapes — MOSTLY OK
B8 exempts the null-cast in url-patterns.spec.ts (`matchLeverUrl(null as unknown as string)`). Acceptable narrow exception. No other `any` introduced.

### D6. console — PASS
No console.* in the production code.

### D7. `TODO` / `FIXME` — PASS
B8 text explicitly bans `// TODO(post-B6)` markers and states the executor should hard-block instead. ✓

### D8. Grep gate MPL header check — subtle bug — MINOR
```bash
head -5 "$f" | grep -q "Mozilla Public"
```
B8's MPL header (Step 1) starts with `/*` on line 1 and `Mozilla Public` text on line 2, so the grep will still match (line 2 is within `head -5`). ✓

But B8's gate does NOT check that the comment style is consistent. B7 uses `//` line comments; B8 uses `/* */` blocks. Across the engine this is inconsistent; pick one and apply it. Prefer B7's `//` style (simpler, grep-friendly).

---

## Checklist E — Fixture specificity

### E1. `standard-form.html` — OK
Uses real Lever attribute names: `name`, `email`, `phone`, `org`, `urls[LinkedIn]`, `urls[GitHub]`, `urls[Portfolio]`, `resume` (file), `eeo[gender]`, `eeo[race]`. Wrapped in `#application-form`. Matches agent 59's reported Lever field map. ≥10 fields as required.

### E2. `split-name-form.html` — OK
Uses `application_form` (underscore form-id variant) to exercise second selector. `firstName`, `lastName`, `email`, `phone`, `urls[LinkedIn]`, `resume`. 6 fields. Correct variant exercise.

### E3. `job-posting-jsonld.html` — OK
Inline JSON-LD with title, description (HTML with ul/li), datePosted, employmentType `"Full-time"` (non-Schema, per agent 55 §b), hiringOrganization (name + logo), jobLocation (single object with address). Matches real Lever observed shape.

**Minor gap E3a**: no fixture for the **no-JSON-LD posting page** (Step 15 case 4 uses inline `innerHTML` overwrite instead of a fixture file — acceptable, but consistency would be better).

**Minor gap E3b**: no fixture for **malformed JSON-LD** (Step 15 case 5 says "B6 extractor handles the catch" — assumes B6 behavior without test evidence in B8. Acceptable since B6 owns that path, but a one-liner negative smoke test using an inline `<script type="application/ld+json">{</script>` would harden the boundary).

### E4. Fixtures realistic vs toy? — OK
B8 fixtures are not just `<input name="a">` toys; they carry accept attributes, required flags, label/for bindings, option values, form enctype. Quality is on par with B7. ✓

---

## Checklist F — Rules and architecture

### F1. Hex architecture imports — PASS
B8 imports only from `'../../adapters/dom'`, `'../../core/types'`, `'../../core/taxonomy'`. No `@nestjs`, no `chrome.*`, no cross-adapter. Architecture rule honored.

### F2. MPL-2.0 headers — PASS on intent
Every production file has the 5-line MPL boilerplate. The selectors.ts file has a secondary attribution citing andrewmillercode/Autofill-Jobs MIT, per decision memo §2.4. ✓

### F3. Immutability — PASS
All constants use `as const` and `readonly`. All types use `readonly` modifiers. `Object.freeze` is not applied to `LEVER_SELECTORS` at runtime — recommend adding for defense in depth, but not required.

### F4. No stubs / TODO — PASS
B8 explicitly refuses to emit TODOs and hard-blocks on B6 dependency miss. Matches code-quality.md. ✓

### F5. File size — PASS
Largest file (selectors.ts) ~120 LoC, well under the 400 soft cap / 800 hard cap.

### F6. Test strategy — PARTIAL
Adversarial cases present (variant-mismatch, element-not-found, null input, apply-URL gate, non-Lever-URL gate, empty document). Good happy-path coverage. But:

- No stress / concurrency test for `scanLeverForm` on large forms (300+ inputs). Not blocking for 85% coverage target, but weak.
- No test for XSS-style attribute values in label text (`<script>alert(1)</script>` in a `name` attribute should not break the scanner).
- No test for unicode field values (`"名字"` into `name` input).
- `field-filler.spec.ts` case 8 (`resumeFile` → `wrong-element-type`) is predicated on a reason code that doesn't exist in B5 (see A5).

### F7. Rollback plan — OK
B8 lists a credible rollback, and candidates (A4, A5, A6, A7 drifts) are exactly the problems the review surfaces. B8 has self-diagnosed its own risks — just hasn't resolved them.

### F8. Acceptance criteria — OK
20-item checklist is strong. `pnpm -F ats-autofill-engine typecheck` command (§Step 0 and §Acceptance) is wrong — the engine is a **standalone repo** at `e:/ats-autofill-engine`, not a pnpm workspace. Should be `cd e:/ats-autofill-engine && pnpm typecheck`. Same drift in §Grep gate script. **MINOR** fix.

### F9. `document` / `window` usage — PARTIAL
B8 §6.8 forbids `document` / `window` globals inside adapter code and requires a `Document` arg. But §Step 5 `field-filler.ts` uses `(document.querySelector('#lever-email') as HTMLInputElement).value` in the test — that's test-side, OK. However, §C2 above requires the adapter factory to close over `document` for fillField to work with A8's `AtsAdapter.fillField(instruction)` contract. Need to pass the doc explicitly or read `instruction.selector` + global `document` (hex-legal in the adapter layer, since `src/ats/**` is `adapters/`, not `core/`).

---

## Remediation roadmap (minimum viable B8 rewrite)

Ordered by blocker severity:

1. **Upstream fix (B2 amendment, architect-owned)** — add `JobPostingData`, `PageIntent`, and the 18 ATS-extension FieldType values (`firstName`, `lastName`, `linkedinUrl`, `eeoGender`, ...). Decide whether FormModel carries `sourceATS` or whether adapters tag separately. Extend `FillError` with `'variant-mismatch'` + `'wrong-element-type'` or refactor B8 to collapse these into `'unknown-error'`.

2. **Upstream fix (B5 amendment)** — no changes needed if B8 adopts the existing `fillField(el, value)` / `attachFile(input, files): Promise<FillResult>` contracts.

3. **Upstream fix (B6 amendment)** — correct import path: B6 publishes at `src/adapters/dom/jd/jsonld-extractor.ts` and re-exports from `src/adapters/dom/index.ts`. B8 imports from `'../../adapters/dom'`.

4. **B8 rewrite — field-filler.ts**: change signature to `fillLeverField(instruction: FillInstruction, ctx?: LeverFillContext): FillResult`. Resolve element via `document.querySelector(instruction.selector)`. Map `FillInstruction.value` kinds (text/choice/boolean) to B5's primitive second arg. Return `{ok:false, selector, error}` shape.

5. **B8 rewrite — form-scanner.ts**: emit real `FormModel` with `{url, title, scannedAt, fields}` + (if B2 amended) optional `sourceATS: 'lever'`. Drop `pageUrl`. Keep variant on `LeverScanResult` wrapper but expose via factory closure.

6. **B8 rewrite — file-attacher.ts**: declare `async`. Return `Promise<FillResult>`. Drop `AttachResult` import. Accept `(instruction: FillInstruction, fileHandleResolver: (handleId: string) => File)` or read from a closed-over profile store in the adapter factory.

7. **B8 add — `src/ats/lever/adapter.ts`** (new file): `createLeverAdapter()` factory closing over variant state. Export `adapter` from barrel. Add a test `index.spec.ts` asserting `adapter` exists, `adapter.kind === 'lever'`, and the four methods are functions.

8. **B8 add — LeverAdapter namespace** (parity with B7): `export const LeverAdapter = Object.freeze({ matchesUrl, scanForm, fillField, attachFile, extractJob, findFormRoot })`.

9. **B8 fix — pnpm commands**: replace `pnpm -F ats-autofill-engine typecheck` with `pnpm typecheck` (run from `e:/ats-autofill-engine`).

10. **B8 add — eeoGender filler spec case**: exercise a `<select>` choice value path, currently untested.

11. **Consistency — MPL header style**: pick `//` or `/* */` and apply across all adapters. Recommend `//` for B7 parity.

---

## Verdict

**Grade: D**

The plan is well-thought-out in prose and edge-case reasoning, but the contract layer is broken in seven distinct load-bearing dimensions (FieldType values, JobPostingData, import path, fillField signature, FillResult shape, sourceATS field, attachFile return type). Plus the single most important cross-phase contract — the `adapter` export A8 reads at runtime — is absent.

The executor cannot run B8 as-is without triggering a cascade of STOP directives that B8 itself catalogs (§Preconditions and §Rollback). The orchestrator will either (a) stall on B8 waiting for upstream B2/B5/B6 amendments, or (b) produce code that typechecks locally against stub types and fails at B8-B7-A8 integration.

A resubmission after the 11-step remediation roadmap (primarily B2 amendments + B8 rewrite of field-filler / form-scanner / file-attacher / adapter factory) would plausibly be grade A-. The Lever-specific content (selectors, URL patterns, variant detection, fixtures, grep gate) is solid and should be preserved.

Recommended next action: treat B2 as the real blocker, write a B2 addendum phase (B2.1) specifying the full FieldType superset + JobPostingData + FormModel.sourceATS + FillError extensions, then rerun B7 and B8 reviews against the amended contract.
