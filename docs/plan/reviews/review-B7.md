# Review — Phase B7 Greenhouse ATS Adapter

**Plan file:** `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B7_greenhouse_adapter/plan.md` (1792 lines)
**Reviewer:** Opus 4.6 (architect)
**Date:** 2026-04-11

---

## TL;DR

The plan is thorough on domain substance — URL patterns, selector ladder, dropdown strategy ladder, repeating sections, JSON-LD / `__remixContext` fallback, licensing, and attribution are all top-tier and faithful to the investigation artifacts. Required-reading and step-by-step layout are meticulous, and fixture content is specified field-by-field (no hand-wave).

However, the plan has **systematic contract drift against B1, B2, B5, and A8** that will block compilation and break the A8 integration. These are not stylistic — they are hard interface mismatches in function signatures, sync/async mode, exported type names, and package.json shape. The plan must be corrected before the executor runs it.

---

## A. Invariants (CRITICAL rules)

| Invariant | Status | Evidence |
|---|---|---|
| `src/ats/greenhouse/**` files MPL-2.0 with file header | PASS | Step 1 declares the 5-line MPL boilerplate, every source file stub shows it, acceptance + compliance checklist enforce `git grep` of the header. |
| Fork of berellevy attribution | PASS | `NOTICES.md` append block (Step 13) reproduces BSD-3-Clause text verbatim + per-file inline attribution via line 5 of header. §e/§g/§h/§i of investigation-49 are explicitly cited. |
| Exports via `./greenhouse` entry | **FAIL (export shape)** | Step 12 writes `{ types, import, default }`. B1 scaffold writes `{ types, import, require }` (see B1 plan lines 242-246). `default` vs `require` is a real JSON divergence — B1's §acceptance says each entry MUST specify `types`, `import`, AND `require`. **Executor will overwrite B1's `require` with `default` and break CJS consumers of the package.** |
| Exports via `./greenhouse` entry (B1 state) | **FAIL (placeholder assumption)** | Step 12 claims B1 leaves `./greenhouse` as `null` and executor replaces null. B1 plan lines 242-246 show `./greenhouse` **already populated** with the full export object, and B1 File 23 creates `src/ats/greenhouse/index.ts` as a real (empty) barrel. The "replace null" instruction will fail because there is no null to replace. |
| Consumes B2 types (`FormFieldDescriptor`, `FormModel`, `FillInstruction`, `FillResult`, `JobPostingData`) | **FAIL (B2 gap + FillResult shape)** | 1. `JobPostingData` does **NOT** exist in B2 — B2 plan §Files to create lists only `form-model.ts`, `fill-instruction.ts`, `highlight-range.ts`, `ats-vendor.ts`. B6 also depends on it and explicitly says "STOP and fix B2 first if missing". B7 silently imports it without flagging. 2. B2 `FillResult` is `\{ ok: true, selector \} \| \{ ok: false, selector, error: FillError \}`. B7's `GreenhouseFillResult extends FillResult` adds `pathTaken`, `verified`, and uses `reason: 'empty-value' \| 'invalid-element' \| 'fill-not-detected'` — none of those are in B2's `FillError` enum (`selector-not-found \| element-disabled \| element-not-visible \| value-rejected-by-page \| file-attach-failed \| unknown-error`), and `verified` is not a B2 field. The discriminated union is incompatible with `extends`. |
| Consumes B5 DOM adapter API | **FAIL (sync vs async + type names)** | 1. B5 `fillField(el, value): FillResult` is **synchronous**. B7 Step 6 writes `const primary = await fillField(el as HTMLElement, value);` and declares `fillGreenhouseField` as `async`. Await-on-non-promise is legal but `primary.ok === false` / `primary.reason` accesses do not match B5's shape (B5 uses `error`, not `reason`). 2. B5 exports `AttachFailureReason` type alias but **not** `AttachResult`. B7 Step 7 imports `type AttachResult` from `'../../adapters/dom'` — this type does not exist. B5 `attachFile` returns `FillResult`, not a distinct `AttachResult`. 3. B5 `attachFile` signature is `(input, fileOrFiles, opts?) => Promise<FillResult>` — the `opts` param is missing from B7's wrapper but that is non-breaking. |
| NO `skill-taxonomy` references | PASS | Single mention at line 1756, inside "Out of scope" paragraph explaining server-side delegation. No import, no code reference. |
| NO `HighlightRange` references | PASS | Zero occurrences anywhere in the plan. |
| No `console.*` | PASS | Compliance checklist line 1785 greps for it and expects zero matches. |
| Hex boundary (no `@nestjs`, no `chrome.*`, no cross-adapter imports) | PASS | Compliance checklist lines 1786-1788 enforce all three via `git grep`. |

**Invariant grade: FAIL — 3 critical contract breaks (exports shape, B2 `JobPostingData` gap, B5 `FillResult`/`AttachResult` mismatch).**

---

## B. Contract consistency with upstream phases

### B1 ↔ B7 contract

| Item | B1 (source of truth) | B7 claims | Verdict |
|---|---|---|---|
| `./greenhouse` entry shape | `{ types, import, require }` | `{ types, import, default }` | **MISMATCH** — B7 changes the CJS consumer key from `require` to `default`, silently breaking tsup's dual-emit contract. Fix: Step 12 must use `require`, not `default`. |
| `./greenhouse` entry initial state | Populated with real object (B1 plan lines 242-246); barrel file `src/ats/greenhouse/index.ts` created as an empty MPL-headered stub (File 23) | "Replace the `./greenhouse` placeholder entry (set to `null` by B1 scaffold)" | **FALSE ASSUMPTION** — there is no `null` placeholder. Fix: Step 12 should say "verify B1's `./greenhouse` export entry matches this shape; no change needed if identical" and instead only handle the src/dist mapping. The `tsup.config.ts` entries (B1 line 396) already register `ats/greenhouse/index`. |
| Barrel file creation | B1 creates empty `src/ats/greenhouse/index.ts` (File 23) | B7 "creates" `src/ats/greenhouse/index.ts` as File 10 | **COLLISION** — B7 must **overwrite** (not create) the B1 stub. Plan should say "replace the B1 scaffolding stub". Low severity but should be explicit to avoid "file already exists" executor confusion. |

### B2 ↔ B7 contract

| Item | B2 (source of truth) | B7 claims | Verdict |
|---|---|---|---|
| `FormFieldDescriptor` | Defined in `src/core/types/form-model.ts` | Imported | OK (interface extended with `gh?:` overlay — structural extension, safe) |
| `FormModel` | Defined, `fields: ReadonlyArray<FormFieldDescriptor>` | `GreenhouseFormModel extends Omit<FormModel, 'fields'>` + replaces with `GreenhouseFormFieldDescriptor` | OK (standard pattern) |
| `FillInstruction` | `{ selector, field, value, priority }` where `value` is discriminated `FillValue` | Mentioned but not actually used by B7 code (no step calls `buildPlan` or iterates `instructions`) | INCONSISTENT with Step 7 "Consumes B4 `buildFillPlan`… converts instructions back into per-field `fillField` calls" — no code step shows the conversion. |
| `FillResult` | `{ ok: true, selector } \| { ok: false, selector, error: FillError }` | Extended with `pathTaken`, `verified`, and non-FillError `reason` codes | **SHAPE INCOMPATIBLE** — `extends FillResult` on a discriminated union requires both branches; adding non-common properties like `pathTaken: 'a6-native-setter'` to the whole union is only legal if the property is on both, and TS will flag `reason: 'empty-value'` as "not assignable to `FillError`". The executor will either write broken TS or redefine `FillResult` locally (violates B2 as single source). |
| `JobPostingData` | **NOT DEFINED** | Imported from `../../core/types` | **MISSING TYPE** — same gap B6 already flagged. B7 should either (a) add a precondition "B2 must publish `JobPostingData` in `src/core/types/job-posting.ts` — if missing, STOP" with the same rigour B6 uses, or (b) mark this as a B2 corrective plan blocker. Currently the plan just assumes it exists. |
| `PageIntent` / `Ats` | Not used by B7 | — | N/A |

### B5 ↔ B7 contract

| Item | B5 (source of truth) | B7 claims | Verdict |
|---|---|---|---|
| `scan(root, opts)` return | `FormModel` (synchronous) | `scan(scanScope, opts)` called sync — **OK** | OK |
| `ScanOptions` export | Exported | Imported | OK |
| `fillField(el, value)` | **Synchronous**, returns `FillResult` (not Promise) | `await fillField(el, value)` + reads `primary.reason` | **SYNC/ASYNC MISMATCH** + **PROPERTY NAME MISMATCH** (`reason` vs `error`). `await` on non-promise resolves fine at runtime but the whole `fill-not-detected` fallback branch is dead code — there is no such error code in B5's `FillError` enum. |
| `attachFile(input, file, opts?)` | Returns `Promise<FillResult>` | `await attachFile(input, file)` — **OK for async**; but imports `type AttachResult` which does not exist | **TYPE NAME MISMATCH** |
| `watchForm` | Exported | Not used by B7 (fine) | OK |
| `AttachFailureReason` enum | `'not-a-file-input' \| 'empty-file-list' \| 'datatransfer-rejected' \| 'verify-failed'` | B7 uses `reason: 'invalid-input'` (not in B5) and `reason: 'fill-not-detected'` (not in B5) | **MISSING ENUM MEMBERS** |
| `toFillError('unsupported-element')` | Used in B5 for file inputs routed through `fillField` | B7's `fillGreenhouseField` doesn't check for this error, instead relies on non-existent `fill-not-detected` | **UNREACHABLE FALLBACK** |

### A8 ↔ B7 contract (CRITICAL — downstream consumer)

A8 dynamically imports `'ats-autofill-engine/greenhouse'` and structurally types the module against:

```ts
interface AtsAdapter {
  readonly scanForm: (root: Document) => FormModel;           // sync, Document only, plain FormModel
  readonly fillField: (instruction: FillInstruction) => FillResult;  // sync, takes FillInstruction
  readonly attachFile?: (instruction: FillInstruction) => Promise<FillResult>;
  readonly kind: AtsKind;                                     // 'greenhouse' | 'lever' | 'workday'
}
```

B7's `GreenhouseAdapter` namespace exports:

```ts
export const GreenhouseAdapter = Object.freeze({
  matchesUrl, scanForm, fillField, attachFile, selectDropdown,
  extractJob, findFormRoot,
  // NO `kind` field
});
```

with signatures:

- `scanForm: (root?: Document | Element, opts?: ScanOptions) => GreenhouseFormModel` — **not assignable** to `(root: Document) => FormModel` (parameter types narrower; return type is `GreenhouseFormModel` which `Omit`s `fields` from `FormModel` and replaces, which is structurally OK via upcast, but the actual named type differs).
- `fillField: (el: Element, value: string, hints?) => Promise<GreenhouseFillResult>` — **not assignable** to `(instruction: FillInstruction) => FillResult`. Completely different signature (instruction object vs element+value+hints) and sync vs async.
- `attachFile: (input: Element, file: File) => Promise<GreenhouseAttachResult>` — same mismatch (instruction vs element+file).
- `kind` — **missing**.

**Impact:** A8 will fail to type-check `resolveAdapter()`'s return, OR the executor will write a different engine-facing shape that A8 never consumes. The dynamic import in A8 expects:

```ts
const mod = await import('ats-autofill-engine/greenhouse');
// mod.default or mod.<something> must satisfy AtsAdapter
```

B7 never says which export A8 pulls. Is it `mod.GreenhouseAdapter`? `mod.default`? The plan is silent and A8 plan line 613 just says `const mod = await import('ats-autofill-engine/greenhouse')` without specifying which key the controller reads.

**Required fix:** B7 must publish an `AtsAdapter`-conforming object (name, signatures, `kind: 'greenhouse'`) as a well-defined export, e.g. `export const greenhouseAdapter: AtsAdapter = { scanForm, fillField, attachFile, kind: 'greenhouse' }` where the three functions are **adapter-level thin wrappers** that unwrap `FillInstruction → element + value` and call the internal Greenhouse-specific implementations. The internal (thick) functions can keep their current `(el, value, hints)` shape under a different name for adapter-internal use.

### B4 ↔ B7 contract (mentioned but not loaded)

- B7 precondition says "B4 has published `classifyField(descriptor)` and `buildFillPlan(model, profile)`" but A8 imports it as `buildPlan` from the root entry. Name divergence flagged but out of scope for this review.

---

## C. Fixture specificity

Rule: plan must name exact HTML fixture content or point to a committed saved fixture — not "write realistic Greenhouse HTML".

**Verdict: PASS with minor gap.**

Step 14 specifies four fixtures with **named field inventories**:

- `greenhouse-classic.html` — 14 fields explicitly listed (first_name, last_name, email, phone, resume, cover_letter, linkedin_url, website, location, why_company, gender, race, veteran_status, disability) + `#application_form` form root, `<select>` for gender, div-combobox for race, `<div class="education--container">` with two school-name inputs.
- `greenhouse-react.html` — 10 fields, `<form action="/applications">` no id, React-wrapper classes named, simulated `__reactProps$xxx` via script.
- `greenhouse-classic-jsonld.html` — derived from classic + inline `<script type="application/ld+json">` with 12-field JobPosting matching investigation-55 §b.
- `greenhouse-remix-context.html` — derived from react + explicit `window.__remixContext = { state: { loaderData: { 'routes/$url_token_.jobs_.$job_post_id': { jobPost: { title: 'Senior SWE', ..., id: 12345 } } } } };` literal.

Fixture content specificity is strong — an executor can build them without guessing.

**Minor gap:** The classic fixture lists "14 inputs" but does not enumerate the exact `name` / `id` attributes for all 14. For fields like `why_company` the selector is not in `GREENHOUSE_SELECTORS` at all (step 3 has no `whyCompany` entry) — executor has to invent the DOM attribute. Recommend: add a table "Fixture field → expected CSS selector" so the test and the fixture author agree on markup without reverse-engineering the selector map.

---

## D. Code quality flags

Flagged during passive read of the plan's embedded code blocks:

- **[plan.md:688] `buildFormRootSelector`** — uses `CSS.escape` on `el.id`. Fine, but the fallback `${tag}.${cls}` does not escape class names containing colons or special chars. Low severity, but worth a code-quality note.
- **[plan.md:662-684] `matchDescriptorToSelectorMap`** — O(N*M*K) where N = descriptor fields, M = selector keys, K = selectors per key. For a 30-field Greenhouse form with 16 selector keys × 4 selectors each, that is 30×64 = 1920 `querySelectorAll` calls per scan. Should use a single pass: iterate `GREENHOUSE_SELECTORS`, resolve each ladder once, build a `Map<Element, {fieldKey, selector}>`, then look up each descriptor's element in the map. Performance hint, not a blocker.
- **[plan.md:836-848] React-props fallback** — always marks result `verified: true` without re-reading the DOM to confirm the value landed. A real verification step would query the input's `.value` after the handler returns. Not shipped as "ok" without verification otherwise.
- **[plan.md:1260-1286] `stampRepeatingSections`** — the loop mutates `STAMP_ATTR` twice: first in the selector-iteration loop (assigns `index++`), then again in the reindex block. The first write is wasted work. Low severity.
- **[plan.md:1269-1274] compareDocumentPosition sort** — sort comparator returns 0 when nodes are neither following nor preceding (same node), but `compareDocumentPosition` against self returns 0 and the bit flags are 0, so the comparator returns 0 correctly; OK.
- **[plan.md:1286] `void doc`** — linting workaround for unused var. Better to just remove the `doc` local since it is genuinely unused (`scope` is what actually gets used). Cosmetic.
- **[plan.md:807-811] Early return `empty-value`** — `value === null || value === undefined` on a parameter typed `string` is unreachable under strict TS but fine as defensive runtime guard. The type should be `string | null | undefined` to be honest, OR the guard should be removed. As written it triggers a `@typescript-eslint/no-unnecessary-condition` warning under strict lint. Low.
- **[plan.md:1166-1192] `findOptionByText`** — three passes (exact, startsWith, contains) over every selector bucket. For `[role="option"]` with 50 options this is 150 iterations per option. Acceptable for test-time but flag for adversarial forms. Single-pass with a scored match would be cleaner.

No `any` types except one `as any` in `react-props-probe.ts` with `eslint-disable` comment, justified.

No dead code, no stubs, no TODOs.

**Code quality grade: B+** (clean, annotated, but with one O(N*M*K) hot spot and one "always verified" claim that isn't really verified.)

---

## E. Testing rigor

**Verdict: PASS for structure, but thin on adversarial coverage.**

6 spec files, fixture coverage clear. Each spec has named assertions. Happy-dom environment declared. Mocks used only for B5 return values (boundary, not internals).

**Missing adversarial tests that should be added:**

- `url-patterns.spec.ts`: no test for malformed URLs like `https://boards.greenhouse.io/acme/jobs/NaN`, `javascript:alert(1)`, or unicode in org slug.
- `form-scanner.spec.ts`: no test for a form with **duplicate** `#first_name` (Greenhouse never does this but a malicious careers site might). Also no test for disabled inputs — acceptance says they are excluded but no test asserts that.
- `field-filler.spec.ts`: no test for value injection (`<script>`, `"';--`, null bytes). Even though Greenhouse sanitizes server-side, the adapter should pass through unchanged. Test the pass-through.
- `dropdown-handler.spec.ts`: "timeout case" is mentioned in the spec prose but the 2-second timeout on happy-dom is a slow test. Spec should override `timeoutMs` to a smaller value for the test (e.g. 50ms).
- `file-attacher.spec.ts`: no test for attaching a 0-byte File, a File with a name containing path traversal (`../../etc/passwd`), or a File with an unusual MIME.
- `job-extractor.spec.ts`: no test for `__remixContext` being set to `null`, `undefined`, or a Proxy with a thrown `get` — the code walks it defensively but the test does not exercise those branches.
- **No** test that asserts the MPL-2.0 header is present on every src file (a 5-line regex assertion in `headers.spec.ts` would catch executor mistakes).
- **No** test for the `./greenhouse` export entry shape in `package.json` (prevents Step 12 drift from re-occurring).

None of these are blockers, but the phase promises "adversarial coverage" per project testing rules and delivers mostly happy-path.

---

## F. Scope, size, attribution, roll-back

| Check | Verdict |
|---|---|
| Files touched count matches scope declaration | PASS (16 new + 2 modified) |
| Estimated LOC per file stays in 60-340 range | PASS (table values 50-260) |
| Out-of-scope list explicit | PASS (9 items including Lever, Workday, Ashby, wizards, auto-submit, live E2E, i18n, skill-taxonomy, custom-question routing) |
| Attribution: berellevy BSD-3 reproduced in NOTICES | PASS (full BSD-3 text in Step 13) |
| Attribution: andrewmiller MIT reproduced | PASS (acknowledgment in NOTICES) |
| Attribution: josephajibodu facts-only (unlicensed repo) | PASS (selector strings treated as facts, no code copy) |
| Rollback plan | PASS (step-by-step, deletes dir, reverts exports, reverts NOTICES) |
| Confidence score justified | PASS (9/10 with documented uncertainty on happy-dom XPath edge cases) |
| Scope declaration at top of file | PASS |
| Blueprint drift check | PASS |
| Compliance checklist at bottom | PASS |
| MPL-2.0 header on every file declared | PASS |

---

## Required fixes before executor run

1. **[CRITICAL] Fix `./greenhouse` exports entry (Step 12).** Change `default` to `require`. Add a note that B1 already populated the entry; the executor should **verify** the shape matches B7's expectation and **not** rewrite it unless B1 drifted.
2. **[CRITICAL] Fix all `FillResult` / `AttachResult` contract mismatches with B5.** Either:
    a. Drop `extends FillResult` and define `GreenhouseFillResult` as a brand-new shape that wraps B5's `FillResult` (e.g. `{ core: FillResult; pathTaken: ...; verified: boolean }`), OR
    b. Update B5 to add `fill-not-detected` to `AttachFailureReason` / `FillError` and export `AttachResult` (but that is a B5 change, not B7's problem to solve).
    The current plan does neither and the executor will write broken TS.
3. **[CRITICAL] Resolve `JobPostingData` gap.** Add a hard precondition matching B6's language: "B2 MUST publish `JobPostingData` at `src/core/types/job-posting.ts`. If the type is not present, STOP and file a B2 corrective plan." Better: point to the investigation-55 §b field list and let B7 inline the type if and only if a B2 corrective plan is the critical path.
4. **[CRITICAL] Fix `fillField` sync/async mismatch.** Remove `await` on B5's `fillField` (it is synchronous per B5 Step 5 §signature), and stop reading `primary.reason` — use `primary.error` per B2's `FillError` type. The entire React-props fallback branch needs to be re-gated on a real B5 error code like `'value-rejected-by-page'` or the plan must explicitly extend B5.
5. **[CRITICAL] Add A8-shaped export.** Publish an `AtsAdapter`-conforming object with `kind: 'greenhouse'` and `FillInstruction`-taking `fillField` / `attachFile` signatures so A8's dynamic import satisfies its local structural type. State clearly which symbol A8 imports.
6. **[HIGH] Drop `AttachResult` import.** B5 does not export that type. Either use `FillResult` or define a local `GreenhouseAttachResult` that does not extend a non-existent type.
7. **[MEDIUM] Clarify the `jsonld-extractor` import path.** B6 places the file at `src/adapters/dom/jd/jsonld-extractor.ts` but re-exports it from the `src/adapters/dom/index.ts` barrel. B7 Step 10 imports from `'../../adapters/dom/jsonld-extractor'` (no `/jd/`) — that specific subpath does not exist. Change to `'../../adapters/dom'` (barrel) and import the function from there.
8. **[MEDIUM] Acknowledge B1 barrel collision.** `src/ats/greenhouse/index.ts` is created by B1 as an empty stub (B1 File 23). B7 Step 11 creates it again. Plan should say "overwrite B1 stub with full barrel".
9. **[LOW] Add adversarial tests** per section E.
10. **[LOW] Optimize `matchDescriptorToSelectorMap`** to single-pass keyed-by-element lookup.

---

## Grade

**Grade: C**

Justification: The plan nails domain substance, licensing, attribution, fixture specificity, and investigation citations — this is genuine senior-level Greenhouse adapter work. But it has **four critical contract breaks** (exports shape, B2 missing type, B5 FillResult shape, A8 consumer surface) that prevent compilation or downstream integration. Plan B is supposed to be a drop-in standalone engine — if A8 cannot consume it and TypeScript rejects the imports, the whole Day-5 schedule slips. Grade "C" reflects: would-be A with rigorous implementation, but knocked down by must-fix contract drift that a careful executor would flag and bounce back, and a careless one would paper over with `any`. Address the 6 critical/high fixes and this becomes a solid A-.

Review written: e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-B7.md
