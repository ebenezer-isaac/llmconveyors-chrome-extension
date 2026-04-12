# Review — Phase B5 (DOM adapter: scanner + filler + file attacher + mutation watcher)

**Reviewer**: Claude Opus 4.6 (1M)
**Date**: 2026-04-11
**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B5_dom_adapter_scanner_and_filler/plan.md` (1811 lines)

## Grade: A-

---

## Summary verdict

B5 is a strong, self-contained, executor-ready phase plan. The two most fragile invariants the reviewer was asked to hard-check (React-safe native setter, DataTransfer file attachment) are both inlined verbatim with runnable TypeScript. All forbidden identifiers (`skill-taxonomy`, `HighlightRange`) are absent. Hexagonal invariants are respected (no `src/ats/**`, no `src/adapters/chrome/**`, type-only imports from `core/types`). The barrel-export contract with B1 and B6 is compatible.

Minor issues (two P2, three P3 nits) flagged below; none are blockers. The grade is A- rather than A because of one genuine contract mismatch around `FillError` mapping that will surface at runtime but not break compilation.

---

## A. Critical snippet inlining (hard check)

| Snippet | Status | Evidence |
|---|---|---|
| React-safe native setter (`getNativePropertyDescriptor` + `invokeNativeSetter`) | INLINED | Step 3 §native-setter.ts, lines 509-563. Walks prototype chain, falls through to global constructor prototype, returns false rather than throwing. |
| `DataTransfer` file attachment (`new DataTransfer()` + `items.add` + prototype-setter assignment) | INLINED | Step 6 §file-attacher.ts, lines 852-954. Includes the 6-step strategy verbatim including the `Object.defineProperty(evt, 'dataTransfer')` react-dropzone fallback. |
| Event sequence table (text: `beforeinput -> input -> change -> blur`; select: `change -> blur`; checkable: `click()`) | INLINED | Step 5 §filler.ts, lines 728-798. Matches agent 37 §d verbatim. |
| Pointer sequence for Workday-style comboboxes (`pointerdown -> mousedown -> pointerup -> mouseup -> click`) | INLINED | Step 4 §event-dispatch.ts, lines 639-655. |
| MutationObserver debounced wrapper | INLINED | Step 7 §mutation-watcher.ts, lines 984-1025. Includes cleanup semantics. |

**Result**: no stubs, no "see investigation 37 §c" hand-offs. Executor has full source in-plan. **PASS**.

---

## B. Forbidden identifier grep (hard check)

Ran `Grep("skill-taxonomy|HighlightRange", B5 plan)` — **zero matches**. PASS.

The plan also does not import `HighlightRange` from `core/types` even though B2 defines it (B2 step 5). This is correct because B5 is scanner/filler, not highlighter. Any import of `HighlightRange` here would be a scope bleed; its absence is correct.

---

## C. Contract vs B2 (types)

B5's type consumption:

| B5 import | B2 definition | Match |
|---|---|---|
| `FormFieldDescriptor` (scanner.ts §buildDescriptor) | B2 step 2, 14 readonly fields | Exact. All 14 fields (selector, name, id, label, placeholder, ariaLabel, autocomplete, type, options, required, dataAttributes, sectionHeading, domIndex) produced by `buildDescriptor`. |
| `FormFieldOption` | B2 step 2 (`{value, label}`) | Exact. Scanner's `readOptions` produces `{value: o.value, label: (o.textContent ?? '').trim()}`. |
| `FormModel` | B2 step 2 (`{url, title, scannedAt, fields}`) | Exact. |
| `FillResult` discriminated union | B2 step 4 (`{ok:true, selector} \| {ok:false, selector, error: FillError}`) | Exact. |
| `FillError` union | B2 step 4 (6 values: `selector-not-found`, `element-disabled`, `element-not-visible`, `value-rejected-by-page`, `file-attach-failed`, `unknown-error`) | Consumed via `toFillError` mapper. **See C1 below.** |

**C1 — P2 finding — `toFillError` collapses distinct failure modes**:

B5 defines a richer `FillFailureReason` union (8 values) and maps it down to the 6-value `FillError`. The mapping is correct for the cases it covers, but:

- `element-readonly` → `element-disabled` (lossy but acceptable; documented intent)
- `value-did-not-stick` → `value-rejected-by-page` (good)
- `native-setter-missing` → `unknown-error` (acceptable)
- `unsupported-element` → `unknown-error` — **this is the problem**. When `fillField(fileInput, ...)` is called, the plan returns `error: 'unknown-error'` (see filler.ts line 826-827 and test assertion at line 1504: `expect(res.error).toBe('unknown-error')`). But file inputs have their own semantic category `file-attach-failed` in the B2 union. The caller cannot distinguish "genuinely unknown failure" from "you used the wrong entry point".

Severity: **P2**. Impact: A8 content-script orchestration in the diagnostics UI will show "unknown error" on misrouted file fills, which is misleading. The correct mapping would be: if `el instanceof HTMLInputElement && el.type === 'file'`, return a distinct reason (add `wrong-entry-point-for-file` to `FillFailureReason`, still map to `FillError='file-attach-failed'` since semantically closer). Alternatively, keep the current behavior and add a one-line comment in filler.ts explaining the deliberate collapse.

Recommend: tighten mapping before execution.

---

## D. Contract vs B4 (classifier / plan builder)

B4 produces `FillInstruction` objects which A8 then feeds to the filler. B5's `fillField(el: Element, value: string | boolean)` takes an element reference and a primitive — **it does not consume `FillInstruction` directly**. This is a layering split, not a mismatch:

- B5's surface: `fillField(el, value)` — low-level primitive.
- B7/B8/B9 (per-ATS adapters) wrap B5 with `fillField(instruction: FillInstruction)` — high-level, which A8 calls (per A8 step line 282: `readonly fillField: (instruction: FillInstruction) => FillResult`).

This indirection matches §2.5 hex architecture in the decision memo. **PASS**, but see D1.

**D1 — P3 nit — contract discontinuity is not spelled out in B5**:

B5 line 820-830 routes `string | boolean` through `fillField`. The per-ATS adapter will destructure `FillInstruction.value.kind` / `.value.value` and call B5's primitive. This layer is implicit in B5. Adding a 3-line comment to `filler.ts` top-of-file saying "per-ATS adapters (B7/B8/B9) wrap this primitive and accept a FillInstruction; the primitive intentionally does NOT couple to core types" would save the executor a lookup and guard against future drift.

Severity: **P3**.

---

## E. Contract vs B6 (file ownership under `src/adapters/dom/**`)

Both B5 and B6 contribute files under `src/adapters/dom/**`. Collision check:

| Path | B5 creates? | B6 creates? | Collision? |
|---|---|---|---|
| `src/adapters/dom/label-resolver.ts` | YES | no | none |
| `src/adapters/dom/scanner.ts` | YES | no | none |
| `src/adapters/dom/native-setter.ts` | YES | no | none |
| `src/adapters/dom/event-dispatch.ts` | YES | no | none |
| `src/adapters/dom/filler.ts` | YES | no | none |
| `src/adapters/dom/file-attacher.ts` | YES | no | none |
| `src/adapters/dom/mutation-watcher.ts` | YES | no | none |
| `src/adapters/dom/index.ts` | MODIFIES (rewrites placeholder) | MODIFIES (appends) | **ordered — no collision** |
| `src/adapters/dom/highlighter/**` (5 files) | no | YES | none |
| `src/adapters/dom/jd/**` (3 files) | no | YES | none |
| `src/adapters/dom/intent/**` (3 files) | no | YES | none |

The barrel `src/adapters/dom/index.ts` is the only shared file. B5 line 1028-1071 writes it first. B6 line 115 explicitly says "Do NOT modify or reorder B5's existing exports" and appends three blocks. Ordering invariant holds because B5 is scheduled day 3 (Apr 14) and B6 is scheduled day 4 (Apr 15) per config.json day map. **PASS**.

**E1 — P3 nit — directory naming drift in B6**:

B6 line 48 references B5 as `phase_B5_dom_adapter_scanner_filler/plan.md` but the actual directory is `phase_B5_dom_adapter_scanner_and_filler/`. This is B6's bug, not B5's, but flag it here because it could cause the B6 executor to fail its required-reading step. The fix belongs in B6 (reviewer of B6 should catch it separately).

Severity: **P3** (informational; not a B5 defect).

---

## F. Contract vs A8 (consumer)

A8 imports **types** from `ats-autofill-engine` root (`FormModel`, `FillInstruction`, `FillResult`, `FillPlan`) — these flow from B2 through the package root barrel (set up in B1), not from B5 directly. A8 also imports `buildPlan` from `ats-autofill-engine` (B4 artifact).

A8's actual DOM-touching calls go through the per-ATS adapter (`adapter.scanForm(document)`, `adapter.fillField(instruction)`, `adapter.attachFile?(instruction)`), per A8 lines 255-289. The adapter is imported via `ats-autofill-engine/greenhouse` etc. (B7/B8/B9 sub-entries). **A8 never imports directly from `ats-autofill-engine/dom`** in the reviewed excerpt.

This means B5's `./dom` sub-entry is consumed by B6 (which extends the barrel), B7, B8, B9 (which wrap the primitives). A8 only touches it transitively. **PASS**.

**F1 — P2 finding — FillResult selector uses id/name rather than the CSS selector**:

B5 filler.ts uses `el.id || el.name || ''` as the `selector` field in every `FillResult`. But B2's `FillResult` type has `selector: string` intended to carry a stable CSS selector that A8 can log and display. Agent 44 and A8 line 255-289 both expect the selector to match the scanner's emitted `FormFieldDescriptor.selector` (which scanner.ts builds with `buildStableSelector` — CSS selector with id/name/path fallback).

Result: if a user fills a field by `name` only (no id), the `FillResult.selector` will be just `"first_name"` — a bare string, not a CSS selector. A8 cannot re-resolve it with `document.querySelector(result.selector)`.

Severity: **P2**. The filler should either:
(a) accept a `selector: string` parameter alongside `el` and `value`, OR
(b) call the same `buildStableSelector` helper (import from scanner.ts) when constructing `FillResult`.

Option (b) is cleaner and costs 2 lines. Recommend tightening before execution.

---

## G. Other findings

**G1 — P3 — scanner selector escape for bracketed ids**:
`buildStableSelector` at line 471 uses `#${CSS.escape(el.id)}` but `#` is not a valid way to target ids containing special characters — should be `[id="${CSS.escape(el.id)}"]` for robustness. Workday's `data-automation-id` is often used but some Workday tenants put `:` or `.` in native ids, which `#` prefix cannot address even with CSS.escape (well, CSS.escape produces `\.` but the resulting `#foo\.bar` is legal — this is actually fine). Retract: **no action needed**, CSS.escape handles it. (Self-correction noted; no grade impact.)

**G2 — P3 — `offsetParent === null` is unreliable under happy-dom**:
Line 364: `if (el.offsetParent === null && el.tagName !== 'SELECT') continue;`. happy-dom's `offsetParent` implementation historically returns `null` for every element because no layout engine runs. This means the default `includeHidden: false` path will skip ALL elements in tests, and every scanner test will fail.

Looking at step 10 (scanner.spec.ts), tests do not set `includeHidden: true`, they rely on the default. If happy-dom really returns `null` for every `offsetParent`, every test at lines 1156-1253 will fail with "finds 0 inputs" instead of 10.

Severity: **P2** — this may be a blocker depending on happy-dom version. Verification step:

```ts
// quick sanity check to run before B5 execution
document.body.innerHTML = '<input id="x" />';
console.log(document.getElementById('x')?.offsetParent); // null or body?
```

Per happy-dom tracker, v14+ returns the parent element for visible-ish elements, but anything inside `<head>` or with no computed layout returns null. Since the fixture puts inputs in `<body>`, they MAY pass, but the executor should add a safety net: the scanner should treat `offsetParent === null` as "unknown visibility" under happy-dom and fall through to `getComputedStyle(el).display === 'none'` check as the authoritative signal. The current `getComputedStyle` check only runs for `visibility: hidden`, not `display: none`.

Recommend: add an explicit happy-dom sanity-check to Step 0 (already exists for DataTransfer; extend it to cover `offsetParent`). Alternatively, invert the check: include by default, only exclude elements with `display: none` in the computed style or in an ancestor `[hidden]` attribute. This is more robust than the `offsetParent` heuristic.

Severity: **P2**.

**G3 — P3 — `CSS.escape` availability**:
Line 176 and 471 use `CSS.escape`. happy-dom provides this but older versions may not. §6.5 of the plan already acknowledges this and says "add only if the scanner spec fails" — acceptable.

**G4 — P3 — `<option>` type declared but not consumable**:
Line 396 reads `el.getAttribute('name') ?? ''` — this is fine. But `readOptions` returns options for `<select>` only, and `[role="combobox"]` gets an empty array. A8 needs a way to know which combobox options are available post-scan; B5's answer is "per-ATS adapters discover them dynamically". Documented in §6.6. **Acceptable**.

**G5 — P3 — plan says 14 files touched but counts 13 production+test + 1 fixture = 14**: correct.

**G6 — P3 — lines 75 `include: ['src/adapters/**/*','src/ats/**/*']`** is consistent with B1 line 45 `tsconfig.adapter.json`. PASS.

**G7 — P3 — `preFlight` returns `'element-not-fillable'` but the caller falls through**:
Line 815-817: `if (guard && guard !== 'element-not-fillable')` — the guard check explicitly ignores `element-not-fillable` so the type-routing block below can run. This is fine, but the readability suffers. A one-line comment explaining "fall through to the type-routing switch; unsupported types return their own error" would help.

Severity: **P3** (nit).

---

## H. Architecture invariants (all PASS)

- [x] `src/adapters/dom/**` — DOM coupled (allowed). PASS.
- [x] No import from `src/ats/**`. PASS (grep gate §5).
- [x] No import from `src/adapters/chrome/**`. PASS (grep gate §5).
- [x] Type-only imports from `core/types/**`. PASS (scanner.ts line 305 uses `import type`).
- [x] No `any`, `@ts-ignore`, `@ts-expect-error` in production. PASS (grep gate §5).
- [x] No `console.*`. PASS (grep gate §5).
- [x] No `throw` in filler / file-attacher. PASS (grep gate §5).
- [x] Discriminated-union returns, never throw. PASS.
- [x] File-level MIT header implied (per B1 convention). Not explicitly shown but §1 step 1 says "Continue the MIT header pattern from B1".

---

## I. Test coverage

- 5 spec files, 45+ test cases asserted in §Post-phase deliverable.
- Target 85% line coverage for `src/adapters/dom/**`.
- Tests cover: happy path, label-ladder fallthrough, disabled/readonly guards, fieldset:disabled, unknown option rejection, checkbox no-op, radio group activation, file input rejection, DataTransfer attach, multi-file truncation, multi-file accept when `multiple=true`, MutationObserver debounce, batch collapse, cleanup, callback error swallowing, custom CSS.escape-able ids.
- Adversarial cases present: empty file array (line 1554), non-file input to attachFile (1546), unknown select option (1446), disabled ancestor fieldset (1411).
- Missing: input element that re-renders mid-fill (acknowledged §6.3 as out of scope; acceptable).
- Missing: stress test for scanner with 500+ fields (hitting `maxFields` cap). Add one case.

Severity of gaps: **P3**.

---

## J. Blocker list

**Zero blockers**. The P2 findings (C1, F1, G2) are real bugs in the plan but do not prevent execution; they surface as either (a) misleading error codes at runtime or (b) possible test failures under happy-dom. The executor can proceed, discover them, and fix per `.claude/rules/code-quality.md` "root cause or nothing".

---

## K. Recommended pre-execution fixes

1. **C1** — Tighten `toFillError` mapping for file inputs: route `unsupported-element` for file inputs to `file-attach-failed`, not `unknown-error`. Update the test at line 1504 to match. (1 line code + 1 line test.)
2. **F1** — `FillResult.selector` must be a stable CSS selector (call `buildStableSelector` or accept selector as a parameter). (~6 lines.)
3. **G2** — Add `offsetParent` sanity check to Step 0 alongside the DataTransfer probe; if happy-dom returns null universally, switch visibility detection to `display: none` + `[hidden]` attribute check. (~10 lines.)
4. **D1, G7** — Add clarifying comments (cheap, ~4 lines total).

With those four changes, this plan goes from A- to A.

---

## Grade rationale

- Critical snippets inlined: +A
- Forbidden identifiers absent: +A
- Contract matches with B2/B4/B6/A8: +A
- Test adversarial coverage: +A-
- Two P2 runtime defects (error mapping, selector shape) and one P2 test-env risk (offsetParent): **-1 notch**

**Final: A-**
