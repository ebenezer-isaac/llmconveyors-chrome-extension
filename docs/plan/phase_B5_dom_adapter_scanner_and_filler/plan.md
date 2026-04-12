# Phase B5 — DOM adapter: scanner + filler + file attacher + mutation watcher

## Phase metadata

| Field | Value |
|---|---|
| **Phase code** | B5 |
| **Phase name** | DOM adapter: scanner + filler + file attacher + mutation watcher |
| **Plan** | 100 — Chrome Extension POC + V1 |
| **Track** | Track 1 (engine) |
| **Target repo** | `ebenezer-isaac/ats-autofill-engine` (NEW) |
| **Local path** | `e:/ats-autofill-engine` |
| **Day** | 4 — 2026-04-15 |
| **Estimated effort** | 4 hours |
| **Depends on** | B1 (scaffold), B2 (core types), B4 (classifier + plan-builder) |
| **Blocks** | B7 (Greenhouse adapter), B8 (Lever adapter), B9 (Workday adapter), A8 (content script autofill) |
| **Confidence** | 9/10 |
| **Files touched** | ~14 new files, 1 modified (`src/adapters/dom/index.ts` barrel) |
| **Lines changed** | ~1600 lines added |

## Goal

Implement the browser-coupled form scanner, React-safe input filler, DataTransfer file attacher, MutationObserver wrapper, and supporting label-resolver helpers. All code lives under `src/adapters/dom/` and is compiled under `tsconfig.adapter.json` (which includes `lib: ["ES2022","DOM","DOM.Iterable"]`). The phase produces pure TypeScript functions with zero React, zero framework coupling, and zero imports from `src/ats/**`. Consumers are (a) per-ATS adapters B7/B8/B9 which extend the generic fillers with selector maps, and (b) the A8 extension content script which orchestrates `scan -> plan -> fill`.

The implementation ports the **React-safe native setter technique** verbatim from agent 37 (originating from Cory Rylan's 2019 canonical fix and confirmed in Simplify/Teal/Jobscan reverse engineering), the **DataTransfer file attacher** verbatim from agent 38, and the **MutationObserver global-discovery pattern** adapted from berellevy's `inject.ts` (agent 49).

This phase does NOT introduce per-ATS selectors (B7/B8/B9), highlighter rendering (B6), `chrome.*` APIs (deferred to the Z track), or React widget mounts. The scanner MUST find every `<input>`/`<textarea>`/`<select>`/`[role="combobox"]` in the document regardless of ATS and produce a plain `FormModel` consumable by the core classifier.

## Confidence score

**9/10**.

Justification: all four subsystems (native setter, DataTransfer, MutationObserver, TreeWalker label resolution) have canonical implementations backed by production extensions (Simplify, Teal, Jobscan, berellevy) AND by the investigation files 37/38/49 which already provide runnable TypeScript. The only uncertainty (1 point deducted): happy-dom's `DataTransfer` polyfill is incomplete in some releases — the test spec for `attachFile()` may need a fallback stub injected into the test environment. The executor is instructed to verify this at step 1 by running a 3-line smoke test and, if `new DataTransfer()` throws under happy-dom, monkey-patch a minimal shim in the test setup file (detailed in §6.4 below).

## Scope declaration

- **Files created**: 14
- **Files modified**: 1 (`src/adapters/dom/index.ts` barrel export — rewritten from the B1 empty placeholder)
- **Estimated lines**: +1600 (production + tests)
- **Net surface exposed on `./dom` sub-entry**: `scan`, `fillField`, `attachFile`, `watchForm`, plus the five `DomFillResult` / `ScanOptions` / `WatchOptions` / `FillFailureReason` / `AttachFailureReason` type aliases.

## Required reading (executor MUST read before starting)

Order matters — read top to bottom.

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/00-decision-memo.md`
   - §2.5 hex architecture — `adapters/dom/**` MUST NOT import from `src/ats/**` or `src/adapters/chrome/**`. MAY import type-only from `src/core/ports/**` and `src/core/types/**`.
   - §2.6 — "React input filler: Native setter + `input`/`change` events (standard technique)" and "File attacher: DataTransfer API (works on GH/Lever; fails on Workday drag-drop → flag)".
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/44-hex-core-boundaries.md`
   - §b adapter shapes — the exact method signatures expected of `DomScanner`, `DomFiller`, `DomFileAttacher`, `MutationWatcher`.
   - §d communication direction — scanner returns `FormModel`, filler executes `FillInstruction`. Core is instruction emitter, adapter is executor.
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/37-react-input-fill.md`
   - §b the canonical native-setter fix and WHY `el.value = 'x'` fails with React (`_valueTracker` divergence).
   - §c the full production-ready TypeScript utility including `getNativePropertyDescriptor`, `invokeNativeSetter`, `fireInputEvent`, `fireBeforeInput`, `fillTextLike`, `fillSelect`, `fillCheckable`, `fillFileInput`, `fillContentEditable`, `fillInput`, `verifyFill`, `fillWithRetry`.
   - §d event order table — text/textarea = `beforeinput -> input -> change -> blur`; select = `change -> blur`; checkbox/radio = `click()` preferred; file = direct `.files =` then `input -> change`.
   - §h failure modes 1-8 — each one needs a dedicated test case.
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/38-file-input-datatransfer.md`
   - §a canonical `setFileInputValue` snippet.
   - §d React controlled input caveat — file inputs are uncontrolled in React, `.files =` bypasses the value tracker.
   - §k the definitive `attachFileToInput` utility with 6-step strategy including react-dropzone fallback via `Object.defineProperty(evt, 'dataTransfer')`.
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/49-berellevy-deep-read.md`
   - §g MutationObserver four use sites — global discovery, per-field change tracking, `waitForElement`, section re-registration.
   - §h React controlled input handling — `__reactProps$<random>` key inspection (alternative to native setter path, used as a SECONDARY fallback).
   - §i file upload three strategies — Workday drop-zone via `reactProps.onDrop`, Greenhouse `dispatchFileDragEvent`, Greenhouse React `reactProps.onChange({target:{files:[file]}})`.
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B2_core_types_and_taxonomy/plan.md`
   - §Step 2 `FormFieldDescriptor` shape — the scanner MUST produce objects matching this interface exactly.
   - §Step 2 `FormModel` shape — return value of `scan()`.
   - §Step 4 `DomFillResult` and `FillError` unions — the filler/attacher MUST return these discriminated unions, never throw.

## Files to create (14)

### Production source (7)

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 1 | `e:/ats-autofill-engine/src/adapters/dom/label-resolver.ts` | Label resolution ladder helpers | 180 |
| 2 | `e:/ats-autofill-engine/src/adapters/dom/scanner.ts` | `scan(root)` — walks DOM, emits `FormModel` | 260 |
| 3 | `e:/ats-autofill-engine/src/adapters/dom/native-setter.ts` | `invokeNativeSetter`, `getNativePropertyDescriptor` (lifted from agent 37) | 90 |
| 4 | `e:/ats-autofill-engine/src/adapters/dom/event-dispatch.ts` | `fireEvent`, `fireInputEvent`, `fireBeforeInput`, `fireComboboxClickSequence` | 120 |
| 5 | `e:/ats-autofill-engine/src/adapters/dom/filler.ts` | `fillField()` — text, textarea, select, checkbox, radio, combobox routes | 340 |
| 6 | `e:/ats-autofill-engine/src/adapters/dom/file-attacher.ts` | `attachFile()` — DataTransfer + react-dropzone fallback | 180 |
| 7 | `e:/ats-autofill-engine/src/adapters/dom/mutation-watcher.ts` | `watchForm()` — MutationObserver wrapper with debounce | 140 |

### Barrel export (1, modified)

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 8 | `e:/ats-autofill-engine/src/adapters/dom/index.ts` | Re-exports public surface; replaces empty B1 placeholder | 35 |

### Tests (6)

All tests run under `happy-dom` via vitest's `environment: 'happy-dom'` directive. The scanner tests additionally use a fixture HTML file to mimic a realistic ATS form.

| # | Path | Purpose | ~LOC |
|---|---|---|---|
| 9 | `e:/ats-autofill-engine/tests/adapters/dom/scanner.spec.ts` | `scan()` finds 10 inputs, resolves 4 label strategies, captures options | 220 |
| 10 | `e:/ats-autofill-engine/tests/adapters/dom/label-resolver.spec.ts` | `findLabelFor`, `findNearestText`, `findAriaLabel` unit cases | 180 |
| 11 | `e:/ats-autofill-engine/tests/adapters/dom/filler.spec.ts` | `fillField()` text/textarea/select/checkbox/radio event sequences + re-entry | 240 |
| 12 | `e:/ats-autofill-engine/tests/adapters/dom/file-attacher.spec.ts` | `attachFile()` DataTransfer path + multi-file truncation | 140 |
| 13 | `e:/ats-autofill-engine/tests/adapters/dom/mutation-watcher.spec.ts` | `watchForm()` debounce + cleanup + subtree filtering | 140 |
| 14 | `e:/ats-autofill-engine/tests/adapters/dom/fixtures/realistic-form.html` | 10-field HTML fixture covering all label strategies | 80 |

## Preconditions

Before the executor writes any code:

- [ ] B1 scaffold is on disk. `e:/ats-autofill-engine/src/adapters/dom/index.ts` exists as an empty placeholder with the MIT file header.
- [ ] B2 has published `src/core/types/form-model.ts`, `src/core/types/fill-instruction.ts`, and the `src/core/types/index.ts` barrel. Scanner and filler type imports MUST resolve against these files.
- [ ] B4 is NOT a hard gate — the phase plan says "depends on B4" because the content-script orchestration consumes B4's plan-builder, but B5 itself only reads `FormModel` and `FillInstruction` types. If B4 is running in parallel, the executor may start B5 immediately as long as B2 is complete.
- [ ] `pnpm install` has been run at the repo root; `happy-dom`, `vitest`, `@types/node` are in devDependencies (added in B1).
- [ ] `tsconfig.adapter.json` exists with `lib: ["ES2022","DOM","DOM.Iterable"]` and `include: ["src/adapters/**/*","src/ats/**/*"]`.

## Step-by-step implementation

### Step 0 — Sanity-check happy-dom DataTransfer support

Before writing any file-attacher code, run a 3-line smoke test in a scratch file to verify happy-dom's `DataTransfer` constructor works. If it throws `ReferenceError: DataTransfer is not defined`, add a shim in `tests/setup/happy-dom-shims.ts` per §6.4 below BEFORE writing `file-attacher.spec.ts`.

```ts
// scratch — delete after verifying
import { describe, it } from 'vitest';
describe('sanity', () => {
  it('has DataTransfer', () => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
  });
});
```

### Step 1 — Create `src/adapters/dom/label-resolver.ts`

Label resolution ladder per agent 44 §b and the investigation file 37. The ladder, in order:

1. `<label for="{id}">` — matches document.querySelectorAll to avoid reliance on non-standard `el.labels` (happy-dom supports it, real Chrome supports it, but some Workday re-renders detach the `HTMLLabelsCollection`).
2. `aria-labelledby` — resolve space-separated id list to concatenated text content.
3. Nearest ancestor `<label>` — `el.closest('label')`.
4. Nearest preceding sibling text — walk `previousSibling` collecting text node content until a block-level element boundary.
5. `placeholder` attribute.
6. `aria-label` attribute.

```ts
// src/adapters/dom/label-resolver.ts
/**
 * Label resolution helpers for the DOM scanner.
 *
 * Ladder (first non-empty wins):
 *   1. label[for=id]
 *   2. aria-labelledby -> concatenated text content
 *   3. ancestor <label>
 *   4. preceding sibling text node
 *   5. placeholder attribute
 *   6. aria-label attribute
 *
 * All functions return a trimmed string; empty string means "no label found".
 * Zero DOM mutations. No dependency on el.labels (unreliable under re-renders).
 */

/** Maximum number of preceding siblings to walk looking for text. */
const MAX_PRECEDING_SIBLING_WALK = 5;

/** Max characters of preceding text to collect before giving up. */
const MAX_PRECEDING_TEXT_CHARS = 120;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Find a <label for="{id}"> associated with this element by id.
 * Walks the owning document's root — works for detached-label scenarios
 * where el.labels is empty.
 */
export function findLabelFor(el: Element): string {
  if (!el.id) return '';
  const root = el.ownerDocument ?? document;
  const label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  if (!label) return '';
  return normalizeWhitespace(label.textContent ?? '');
}

/**
 * Resolve aria-labelledby to concatenated text content.
 * Multiple space-separated ids are joined with a single space.
 */
export function findAriaLabelledBy(el: Element): string {
  const idList = el.getAttribute('aria-labelledby');
  if (!idList) return '';
  const root = el.ownerDocument ?? document;
  const parts: string[] = [];
  for (const id of idList.split(/\s+/).filter(Boolean)) {
    const ref = root.getElementById(id);
    if (ref) parts.push(normalizeWhitespace(ref.textContent ?? ''));
  }
  return parts.join(' ').trim();
}

/**
 * Find an ancestor <label> that wraps this element.
 * Common in plain HTML forms without explicit `for` attributes.
 */
export function findAncestorLabel(el: Element): string {
  const label = el.closest('label');
  if (!label) return '';
  // Strip the element's own value out of the label's text (e.g. placeholder text).
  const clone = label.cloneNode(true) as Element;
  for (const nested of Array.from(clone.querySelectorAll('input,select,textarea,button'))) {
    nested.remove();
  }
  return normalizeWhitespace(clone.textContent ?? '');
}

/**
 * Walk preceding siblings collecting text nodes until a non-empty string is
 * found or the walk limit is reached. Used as a fallback when the form was
 * built with plain text labels (Workday's "repeatable group" sections).
 */
export function findNearestText(el: Element): string {
  let node: Node | null = el.previousSibling;
  let collected = '';
  let steps = 0;
  while (node && steps < MAX_PRECEDING_SIBLING_WALK && collected.length < MAX_PRECEDING_TEXT_CHARS) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim()) collected = (text + ' ' + collected).trim();
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Headings and spans are acceptable; block-level form elements terminate.
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'form') break;
      const text = (node as Element).textContent ?? '';
      if (text.trim()) collected = (text + ' ' + collected).trim();
    }
    node = node.previousSibling;
    steps += 1;
  }
  // If nothing from siblings, try parent's previous sibling (one level up).
  if (!collected && el.parentElement) {
    const parentText = el.parentElement.previousSibling?.textContent ?? '';
    if (parentText.trim()) collected = parentText;
  }
  return normalizeWhitespace(collected);
}

/**
 * Direct aria-label attribute read.
 */
export function findAriaLabel(el: Element): string {
  return (el.getAttribute('aria-label') ?? '').trim();
}

/**
 * Resolve the best label for an element by walking the ladder.
 * Returns an object with the label and the strategy that matched
 * so the scanner can record provenance in the descriptor.
 */
export function resolveLabel(el: Element): {
  readonly label: string;
  readonly ariaLabel: string;
  readonly strategy:
    | 'for-attr'
    | 'aria-labelledby'
    | 'ancestor-label'
    | 'preceding-text'
    | 'placeholder'
    | 'aria-label'
    | 'none';
} {
  const forAttr = findLabelFor(el);
  if (forAttr) return { label: forAttr, ariaLabel: findAriaLabel(el), strategy: 'for-attr' };

  const ariaLabelledBy = findAriaLabelledBy(el);
  if (ariaLabelledBy) return { label: ariaLabelledBy, ariaLabel: findAriaLabel(el), strategy: 'aria-labelledby' };

  const ancestor = findAncestorLabel(el);
  if (ancestor) return { label: ancestor, ariaLabel: findAriaLabel(el), strategy: 'ancestor-label' };

  const preceding = findNearestText(el);
  if (preceding) return { label: preceding, ariaLabel: findAriaLabel(el), strategy: 'preceding-text' };

  const placeholder = el.getAttribute('placeholder')?.trim() ?? '';
  if (placeholder) return { label: placeholder, ariaLabel: findAriaLabel(el), strategy: 'placeholder' };

  const aria = findAriaLabel(el);
  if (aria) return { label: aria, ariaLabel: aria, strategy: 'aria-label' };

  return { label: '', ariaLabel: '', strategy: 'none' };
}
```

### Step 2 — Create `src/adapters/dom/scanner.ts`

The scanner walks `document.querySelectorAll('input, textarea, select, [role="combobox"]')` (plus a small ignore list) and produces a `FormModel`. Excluded: `input[type=hidden]`, `input[type=submit]`, `input[type=reset]`, `input[type=button]`, `input[type=image]`, elements inside `fieldset[disabled]`, elements whose `display: none` ancestor chain hides them (checked via `el.offsetParent === null` with a fallback for `<option>`/`<summary>`).

For each visible fillable element, compute:

- `selector` — a stable CSS selector. Priority: `[id="..."]` if id exists and is document-unique, else `[name="..."]` if unique, else a positional selector using `nth-of-type` from the nearest id ancestor.
- `name`, `id`, `autocomplete`, `placeholder`, `type`, `required` — direct attribute reads.
- `label`, `ariaLabel` — via `resolveLabel`.
- `options` — for `<select>`, enumerate `<option>` value/text pairs; for `[role="combobox"]`, empty array (options discovered dynamically).
- `dataAttributes` — all `data-*` attributes copied into a plain object. Workday's `data-automation-id` is the highest-value signal here.
- `sectionHeading` — nearest ancestor `<h1>..<h6>` text content, or the `aria-labelledby` of the nearest `role="group"` fieldset.
- `domIndex` — document-order index within the scanned root.

```ts
// src/adapters/dom/scanner.ts
import type { FormFieldDescriptor, FormFieldOption, FormModel } from '../../core/types';
import { resolveLabel } from './label-resolver';

/** Tag names considered fillable by the generic scanner. */
const FILLABLE_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"]';

/** Input types that are NOT fillable regardless of other signals. */
const NON_FILLABLE_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'reset',
  'button',
  'image',
]);

export interface ScanOptions {
  /** Include elements marked display:none / visibility:hidden. Default false. */
  readonly includeHidden?: boolean;
  /** Include elements inside a disabled fieldset. Default false. */
  readonly includeDisabled?: boolean;
  /** Maximum fields to return. Default 500. */
  readonly maxFields?: number;
}

/**
 * Walk the given root and return a FormModel snapshot.
 *
 * The scanner does NOT classify fields — it only records raw descriptors.
 * Classification is deferred to core/classifier.ts.
 */
export function scan(
  root: Document | Element = document,
  opts: ScanOptions = {},
): FormModel {
  const { includeHidden = false, includeDisabled = false, maxFields = 500 } = opts;
  const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
  const scope = root instanceof Document ? root.body : root;

  const rawCandidates = Array.from(scope.querySelectorAll(FILLABLE_SELECTOR));
  const fields: FormFieldDescriptor[] = [];

  for (let i = 0; i < rawCandidates.length && fields.length < maxFields; i += 1) {
    const el = rawCandidates[i] as HTMLElement;

    // Skip non-fillable input types.
    if (el instanceof HTMLInputElement && NON_FILLABLE_INPUT_TYPES.has(el.type)) continue;

    // Skip disabled unless caller opted in.
    if (!includeDisabled) {
      if (el instanceof HTMLInputElement && el.disabled) continue;
      if (el instanceof HTMLTextAreaElement && el.disabled) continue;
      if (el instanceof HTMLSelectElement && el.disabled) continue;
      if (el.closest('fieldset:disabled')) continue;
    }

    // Skip hidden unless caller opted in. offsetParent === null catches
    // display:none; check for visibility:hidden via computed style as a
    // secondary signal (happy-dom approximates this).
    if (!includeHidden) {
      if (el.offsetParent === null && el.tagName !== 'SELECT') continue;
      const vis = (doc.defaultView ?? window).getComputedStyle?.(el)?.visibility;
      if (vis === 'hidden') continue;
    }

    fields.push(buildDescriptor(el, i));
  }

  return {
    url: doc.location?.href ?? '',
    title: doc.title ?? '',
    scannedAt: new Date().toISOString(),
    fields,
  };
}

function buildDescriptor(el: HTMLElement, domIndex: number): FormFieldDescriptor {
  const { label, ariaLabel } = resolveLabel(el);
  const options = readOptions(el);
  const type = readType(el);
  const sectionHeading = findSectionHeading(el);
  const dataAttributes = readDataAttributes(el);
  const selector = buildStableSelector(el);

  return {
    selector,
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    label,
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    type,
    options,
    required: readRequired(el),
    dataAttributes,
    sectionHeading,
    domIndex,
  };
}

function readType(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.type;
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return el.multiple ? 'select-multiple' : 'select-one';
  if (el.getAttribute('role') === 'combobox') return 'combobox';
  if (el.getAttribute('contenteditable') === 'true') return 'contenteditable';
  return el.tagName.toLowerCase();
}

function readOptions(el: HTMLElement): ReadonlyArray<FormFieldOption> {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).map((o) => ({
      value: o.value,
      label: (o.textContent ?? '').trim(),
    }));
  }
  return [];
}

function readRequired(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.required;
  if (el instanceof HTMLTextAreaElement) return el.required;
  if (el instanceof HTMLSelectElement) return el.required;
  return el.getAttribute('aria-required') === 'true';
}

function findSectionHeading(el: Element): string | undefined {
  // Walk up looking for the first heading or role=group with aria-labelledby.
  let cur: Element | null = el;
  while (cur && cur !== cur.ownerDocument?.body) {
    const prev = cur.previousElementSibling;
    if (prev && /^H[1-6]$/.test(prev.tagName)) {
      return (prev.textContent ?? '').trim();
    }
    const group = cur.closest('[role="group"]');
    if (group) {
      const labelled = group.getAttribute('aria-labelledby');
      if (labelled) {
        const ref = cur.ownerDocument?.getElementById(labelled);
        if (ref) return (ref.textContent ?? '').trim();
      }
    }
    cur = cur.parentElement;
  }
  return undefined;
}

function readDataAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-')) out[attr.name] = attr.value;
  }
  return out;
}

/**
 * Build a stable CSS selector with a fallback ladder:
 *  1. [id="..."]   (if id is document-unique)
 *  2. [name="..."] (if name is form-unique)
 *  3. positional — nearest ancestor with id + descendant path using nth-of-type
 */
function buildStableSelector(el: Element): string {
  const doc = el.ownerDocument ?? document;

  if (el.id) {
    // Verify uniqueness — Workday re-renders sometimes duplicate ids transiently.
    const byId = doc.querySelectorAll(`#${CSS.escape(el.id)}`);
    if (byId.length === 1) return `#${CSS.escape(el.id)}`;
  }

  const name = el.getAttribute('name');
  if (name) {
    const selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const byName = doc.querySelectorAll(selector);
    if (byName.length === 1) return selector;
  }

  // Walk ancestors looking for an id anchor; build path downward from there.
  const path: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.tagName !== 'HTML') {
    const tag = cur.tagName.toLowerCase();
    if (cur.id) {
      path.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      const idx = siblings.indexOf(cur) + 1;
      path.unshift(`${tag}:nth-of-type(${idx})`);
    } else {
      path.unshift(tag);
    }
    cur = parent;
  }
  return path.join(' > ');
}
```

### Step 3 — Create `src/adapters/dom/native-setter.ts`

Lift the native-setter helpers verbatim from agent 37 §c.1. These are the foundation for `fillField()`.

```ts
// src/adapters/dom/native-setter.ts
//
// React-safe native property setter.
// Bypasses React's wrapped `value`/`checked` setters by walking the prototype
// chain to find the original HTMLInputElement.prototype descriptor.
//
// Source: agent 37 §c.1 (originally Cory Rylan, 2019).

/**
 * Walk the prototype chain looking for an own property descriptor for the
 * given prop with a setter. React installs its wrapper on the element's
 * direct prototype; the original lives one level up.
 */
export function getNativePropertyDescriptor(
  el: Element,
  prop: 'value' | 'checked' | 'files',
): PropertyDescriptor | null {
  let proto: object | null = Object.getPrototypeOf(el);
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc?.set) return desc;
    proto = Object.getPrototypeOf(proto);
  }

  // Fallback to the global constructor prototype. Explicit window.* in case
  // the page shadowed the global constructor.
  const g = window as typeof window;
  if (el instanceof g.HTMLInputElement) {
    return Object.getOwnPropertyDescriptor(g.HTMLInputElement.prototype, prop) ?? null;
  }
  if (el instanceof g.HTMLTextAreaElement) {
    return Object.getOwnPropertyDescriptor(g.HTMLTextAreaElement.prototype, prop) ?? null;
  }
  if (el instanceof g.HTMLSelectElement) {
    return Object.getOwnPropertyDescriptor(g.HTMLSelectElement.prototype, prop) ?? null;
  }
  return null;
}

/**
 * Invoke the native setter for a given prop against the element.
 * Returns false if no setter could be found (unsupported element).
 */
export function invokeNativeSetter(
  el: Element,
  prop: 'value' | 'checked' | 'files',
  value: unknown,
): boolean {
  const desc = getNativePropertyDescriptor(el, prop);
  if (!desc?.set) return false;
  desc.set.call(el, value);
  return true;
}
```

### Step 4 — Create `src/adapters/dom/event-dispatch.ts`

Helpers for event dispatch with correct `bubbles`, `composed`, `cancelable` flags. Uses `InputEvent` when available (for RHF compatibility with `inputType`/`data`) and falls back to plain `Event`.

Also exposes a `fireComboboxClickSequence` helper for Workday-style custom comboboxes, which require the full `pointerdown -> mousedown -> pointerup -> mouseup -> click` sequence to trigger their React pointer handlers (per agent 49 notes on berellevy's patterns for `DropdownSearchable`).

```ts
// src/adapters/dom/event-dispatch.ts

export interface DispatchOptions {
  readonly bubbles?: boolean;
  readonly cancelable?: boolean;
  readonly composed?: boolean;
}

/**
 * Dispatch a plain Event with sane ATS-friendly defaults.
 * `composed: true` is mandatory for shadow-DOM-wrapped components.
 */
export function fireEvent(el: Element, type: string, opts: DispatchOptions = {}): void {
  const init: EventInit = {
    bubbles: opts.bubbles ?? true,
    cancelable: opts.cancelable ?? true,
    composed: opts.composed ?? true,
  };
  el.dispatchEvent(new Event(type, init));
}

/**
 * Dispatch an InputEvent with `inputType: 'insertFromPaste'` — the event
 * shape RHF/MUI/masked-input libs expect for text mutations. Falls back to
 * a plain Event if the InputEvent constructor is unavailable.
 */
export function fireInputEvent(el: Element, data: string | null): void {
  try {
    const ev = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data,
      inputType: 'insertFromPaste',
    });
    el.dispatchEvent(ev);
  } catch {
    fireEvent(el, 'input');
  }
}

/**
 * Dispatch a beforeinput event — some editors (Slate, Lexical) cancel it and
 * handle the insertion themselves. Silently tolerated if constructor throws.
 */
export function fireBeforeInput(el: Element, data: string | null): void {
  try {
    const ev = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data,
      inputType: 'insertFromPaste',
    });
    el.dispatchEvent(ev);
  } catch {
    /* best-effort */
  }
}

/**
 * For Workday-style custom comboboxes: dispatch the full pointer -> mouse ->
 * click sequence. React pointer handlers require each event.
 *
 * Order per berellevy DropdownSearchable and agent 49 notes:
 *   focus -> pointerdown -> mousedown -> pointerup -> mouseup -> click
 */
export function fireComboboxClickSequence(el: Element): void {
  if (el instanceof HTMLElement) el.focus();
  const opts = { bubbles: true, cancelable: true, composed: true };
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  } catch {
    // PointerEvent unavailable (very old browsers or strict happy-dom) — fall
    // back to MouseEvent-only sequence.
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }
}
```

### Step 5 — Create `src/adapters/dom/filler.ts`

The `fillField` entry point. Routes to per-type sub-fillers based on the target element. Returns a `DomFillResult` discriminated union — never throws. The verbatim event sequences come from agent 37 §c.4 - §c.6.

Key invariants:
- For text/textarea: `focus -> fireBeforeInput -> invokeNativeSetter('value') -> fireInputEvent -> fireEvent('change') -> blur`. Verify `el.value === value` before returning `ok:true`; otherwise return `value-did-not-stick`.
- For select: verify an `<option>` with the requested value exists first, then `focus -> invokeNativeSetter('value') -> fireEvent('change') -> blur`.
- For checkbox/radio: prefer trusted `el.click()` (updates `_valueTracker` atomically). Fall back to `invokeNativeSetter('checked')` + manual event sequence if the click did not flip the state (Headless UI).
- For `[role="combobox"]`: call `fireComboboxClickSequence` to open the dropdown. The filler does NOT select a listbox option — that's per-ATS logic (B7/B8/B9). Return `ok:true` with a note that it only opened.
- Guard checks: reject if `disabled`, `readOnly`, or inside `fieldset:disabled`.

```ts
// src/adapters/dom/filler.ts
import type { FillError, DomFillResult } from '../../core/types';
import { invokeNativeSetter } from './native-setter';
import {
  fireBeforeInput,
  fireComboboxClickSequence,
  fireEvent,
  fireInputEvent,
} from './event-dispatch';

export type FillableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

export type FillFailureReason =
  | 'element-not-fillable'
  | 'element-disabled'
  | 'element-readonly'
  | 'inside-disabled-fieldset'
  | 'native-setter-missing'
  | 'value-did-not-stick'
  | 'select-option-not-found'
  | 'unsupported-element';

function preFlight(el: Element): FillFailureReason | null {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.disabled) return 'element-disabled';
    if ('readOnly' in el && (el as HTMLInputElement).readOnly) return 'element-readonly';
    if (el.closest('fieldset:disabled')) return 'inside-disabled-fieldset';
    return null;
  }
  return 'element-not-fillable';
}

function toFillError(reason: FillFailureReason): FillError {
  switch (reason) {
    case 'element-disabled':
    case 'element-readonly':
    case 'inside-disabled-fieldset':
      return 'element-disabled';
    case 'select-option-not-found':
      return 'value-rejected-by-page';
    case 'value-did-not-stick':
      return 'value-rejected-by-page';
    case 'element-not-fillable':
    case 'native-setter-missing':
    case 'unsupported-element':
      return 'unknown-error';
    default:
      return 'unknown-error';
  }
}

function fillTextLike(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): DomFillResult {
  el.focus();
  fireBeforeInput(el, value);

  const applied = invokeNativeSetter(el, 'value', value);
  if (!applied) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('native-setter-missing') };
  }

  // React listens to 'input' for text mutations; 'change' is for libraries
  // like jQuery plugins and masked inputs. Fire both.
  fireInputEvent(el, value);
  fireEvent(el, 'change');

  // blur triggers RHF onBlur-mode validation and Formik touched state.
  el.blur();

  if (el.value !== value) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('value-did-not-stick') };
  }
  return { ok: true, selector: el.id || el.name || '' };
}

function fillSelect(el: HTMLSelectElement, value: string): DomFillResult {
  // Verify the option exists — select silently ignores unknown values.
  const optionExists = Array.from(el.options).some((o) => o.value === value);
  if (!optionExists) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('select-option-not-found') };
  }
  el.focus();
  const applied = invokeNativeSetter(el, 'value', value);
  if (!applied) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('native-setter-missing') };
  }
  // React's <select> maps onChange to native 'change' only, not 'input'.
  fireEvent(el, 'change');
  el.blur();
  if (el.value !== value) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('value-did-not-stick') };
  }
  return { ok: true, selector: el.id || el.name || '' };
}

function fillCheckable(el: HTMLInputElement, desired: boolean): DomFillResult {
  if (el.checked === desired) {
    return { ok: true, selector: el.id || el.name || '' };
  }
  // Preferred path: trusted click() flips state AND updates React's
  // _valueTracker atomically. Radix, Mantine, MUI all handle this correctly.
  el.focus();
  el.click();
  if (el.checked === desired) {
    return { ok: true, selector: el.id || el.name || '' };
  }
  // Fallback: native setter + manual event sequence for Headless UI that
  // builds its own checkbox and doesn't toggle on click.
  const applied = invokeNativeSetter(el, 'checked', desired);
  if (!applied) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('native-setter-missing') };
  }
  fireEvent(el, 'click');
  fireInputEvent(el, null);
  fireEvent(el, 'change');
  if (el.checked !== desired) {
    return { ok: false, selector: el.id || el.name || '', error: toFillError('value-did-not-stick') };
  }
  return { ok: true, selector: el.id || el.name || '' };
}

function openCombobox(el: HTMLElement): DomFillResult {
  // Generic DOM adapter does NOT pick a listbox option — per-ATS adapters do.
  // Opening the combobox with the full pointer sequence is all we can commit to.
  fireComboboxClickSequence(el);
  return { ok: true, selector: el.id || '' };
}

/**
 * Public entry point. Routes to the correct per-type sub-filler based on
 * the element tag and input type. Never throws — always returns a DomFillResult.
 */
export function fillField(
  el: Element,
  value: string | boolean,
): DomFillResult {
  const guard = preFlight(el);
  if (guard && guard !== 'element-not-fillable') {
    return { ok: false, selector: (el as HTMLElement).id || '', error: toFillError(guard) };
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return fillCheckable(el, Boolean(value));
    }
    // File inputs must go through file-attacher.ts — reject here to force
    // the caller to use the right entry point.
    if (el.type === 'file') {
      return { ok: false, selector: el.id || el.name || '', error: toFillError('unsupported-element') };
    }
    return fillTextLike(el, String(value));
  }

  if (el instanceof HTMLTextAreaElement) {
    return fillTextLike(el, String(value));
  }

  if (el instanceof HTMLSelectElement) {
    return fillSelect(el, String(value));
  }

  if (el instanceof HTMLElement && el.getAttribute('role') === 'combobox') {
    return openCombobox(el);
  }

  return { ok: false, selector: (el as HTMLElement).id || '', error: toFillError('unsupported-element') };
}
```

### Step 6 — Create `src/adapters/dom/file-attacher.ts`

Ports the 6-step `attachFileToInput` utility from agent 38 §k. The one change: we export it under the name `attachFile` (matches the port interface in agent 44 §b). The react-dropzone fallback (step 5 in the original) stays because it adds zero complexity and protects against SmartRecruiters/Workday-style components.

```ts
// src/adapters/dom/file-attacher.ts
import type { DomFillResult } from '../../core/types';
import { fireEvent, fireInputEvent } from './event-dispatch';

export type AttachFailureReason =
  | 'not-a-file-input'
  | 'empty-file-list'
  | 'datatransfer-rejected'
  | 'verify-failed';

export interface AttachOptions {
  /** Also attempt react-dropzone fallback if the input sits in a dropzone ancestor. Default true. */
  readonly tryDropZoneFallback?: boolean;
}

/**
 * Attach a File (or Files) to a file-upload widget programmatically.
 *
 * Strategy (per agent 38 §k):
 *   1. Validate input type
 *   2. Enforce `multiple` attribute
 *   3. Build DataTransfer
 *   4. Assign files via prototype setter (bypasses React value tracker)
 *   5. Fire bubbling input + change events
 *   6. react-dropzone fallback — synthetic drop event with defineProperty'd dataTransfer
 *   7. Verify file landed on input
 */
export async function attachFile(
  input: HTMLInputElement,
  fileOrFiles: File | File[],
  opts: AttachOptions = {},
): Promise<DomFillResult> {
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
    return { ok: false, selector: input?.id ?? '', error: 'file-attach-failed' };
  }

  const incoming = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (incoming.length === 0) {
    return { ok: false, selector: input.id || input.name || '', error: 'file-attach-failed' };
  }

  // Enforce `multiple` — Chrome truncates silently, Firefox throws.
  const files = input.multiple ? incoming : incoming.slice(0, 1);

  // Build DataTransfer.
  let dt: DataTransfer;
  try {
    dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
  } catch {
    return { ok: false, selector: input.id || input.name || '', error: 'file-attach-failed' };
  }

  // Assign via prototype setter when available; React does not patch `files`
  // on file inputs but this is safer against future changes and libraries
  // that shadow the property.
  const filesDesc =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'files') ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');

  if (filesDesc?.set) {
    filesDesc.set.call(input, dt.files);
  } else {
    try {
      input.files = dt.files;
    } catch {
      return { ok: false, selector: input.id || input.name || '', error: 'file-attach-failed' };
    }
  }

  // Fire bubbling events — React 17+ delegates at root, bubbles:true is mandatory.
  fireInputEvent(input, null);
  fireEvent(input, 'change');

  // react-dropzone fallback.
  if (opts.tryDropZoneFallback !== false) {
    const dropZone = input.closest<HTMLElement>(
      '[data-testid*="dropzone" i],[class*="dropzone" i],[role="button"][aria-label*="upload" i]',
    );
    if (dropZone) {
      for (const type of ['dragenter', 'dragover', 'drop', 'dragend']) {
        const evt = new Event(type, { bubbles: true, cancelable: true, composed: true });
        // Chromium's DragEvent constructor yields null .dataTransfer — defineProperty works around.
        Object.defineProperty(evt, 'dataTransfer', { value: dt, writable: false });
        dropZone.dispatchEvent(evt);
      }
    }
  }

  // Yield a microtask so React state settles before verification.
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  const landed =
    input.files?.length === files.length &&
    Array.from(input.files ?? []).every((f, i) => f === files[i]);

  if (!landed) {
    return { ok: false, selector: input.id || input.name || '', error: 'file-attach-failed' };
  }
  return { ok: true, selector: input.id || input.name || '' };
}
```

### Step 7 — Create `src/adapters/dom/mutation-watcher.ts`

Wraps `MutationObserver` with a debounced callback. One watcher covers the entire form root; consumers re-scan on change. The watcher does NOT interpret mutations — it just notifies.

Adapted from berellevy's `inject.ts:21-28` (agent 49 §j use site 1) — global subtree observer, idempotent re-registration. Added: debounce via `setTimeout`, cleanup function, max-depth filter.

```ts
// src/adapters/dom/mutation-watcher.ts

export interface WatchOptions {
  /** Debounce window for batched mutations. Default 200ms. */
  readonly debounceMs?: number;
  /** Watch only childList + subtree (default) or also characterData. */
  readonly watchText?: boolean;
}

export type MutationCallback = (info: { readonly mutationCount: number }) => void;

export type CleanupFn = () => void;

/**
 * Observe the given root for mutations and invoke the callback debounced.
 * Returns a cleanup function that disconnects the observer and clears any
 * pending debounce.
 *
 * The callback receives only a mutation count — consumers should re-scan
 * the DOM to get fresh state rather than interpreting individual records.
 */
export function watchForm(
  root: Element | Document,
  onMutation: MutationCallback,
  opts: WatchOptions = {},
): CleanupFn {
  const { debounceMs = 200, watchText = false } = opts;
  const target = root instanceof Document ? root.body : root;
  if (!target) return () => {};

  let pending: ReturnType<typeof setTimeout> | null = null;
  let count = 0;

  const observer = new MutationObserver((records) => {
    count += records.length;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      const batched = count;
      count = 0;
      pending = null;
      try {
        onMutation({ mutationCount: batched });
      } catch {
        // Swallow — watcher is fire-and-forget; consumers own error handling.
      }
    }, debounceMs);
  });

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: watchText,
  });

  return () => {
    observer.disconnect();
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
  };
}
```

### Step 8 — Rewrite `src/adapters/dom/index.ts` (barrel)

Replace the empty B1 placeholder with the public surface.

```ts
// src/adapters/dom/index.ts
// Public surface of the ./dom sub-entry.
// Framework-agnostic DOM adapter: scanner, filler, file attacher, mutation watcher.

export { scan } from './scanner';
export type { ScanOptions } from './scanner';

export { fillField } from './filler';
export type { FillableElement, FillFailureReason } from './filler';

export { attachFile } from './file-attacher';
export type { AttachFailureReason, AttachOptions } from './file-attacher';

export { watchForm } from './mutation-watcher';
export type { WatchOptions, MutationCallback, CleanupFn } from './mutation-watcher';

// Label-resolver helpers are exported for per-ATS adapters that need bespoke
// label strategies (e.g. Workday's h4-ancestor pattern).
export {
  findLabelFor,
  findAriaLabelledBy,
  findAncestorLabel,
  findNearestText,
  findAriaLabel,
  resolveLabel,
} from './label-resolver';

// Native setter is exported so per-ATS adapters can bypass React in custom
// fill flows without re-importing from internal paths.
export { invokeNativeSetter, getNativePropertyDescriptor } from './native-setter';

// Event helpers exported for the same reason.
export {
  fireEvent,
  fireInputEvent,
  fireBeforeInput,
  fireComboboxClickSequence,
} from './event-dispatch';
```

### Step 9 — Create `tests/adapters/dom/fixtures/realistic-form.html`

A 10-field HTML fixture covering all label resolution strategies plus the option-rich select path. The scanner spec loads this file via Node `fs.readFileSync` and hydrates it into happy-dom before running assertions.

```html
<!-- tests/adapters/dom/fixtures/realistic-form.html -->
<!DOCTYPE html>
<html>
<head><title>Realistic ATS Form</title></head>
<body>
  <h1>Apply for Senior Engineer</h1>
  <section aria-labelledby="personal-heading">
    <h2 id="personal-heading">Personal</h2>

    <!-- 1. label[for] strategy -->
    <label for="first-name">First name</label>
    <input id="first-name" name="first_name" type="text" autocomplete="given-name" required />

    <!-- 2. aria-labelledby strategy -->
    <span id="last-label">Last name</span>
    <input id="last-name" name="last_name" type="text" aria-labelledby="last-label" required />

    <!-- 3. ancestor <label> strategy -->
    <label>
      Email address
      <input id="email" name="email" type="email" autocomplete="email" />
    </label>

    <!-- 4. preceding text strategy -->
    <div>
      Phone number
      <input id="phone" name="phone" type="tel" />
    </div>

    <!-- 5. placeholder fallback -->
    <input id="linkedin" name="linkedin_url" type="url" placeholder="LinkedIn profile URL" />

    <!-- 6. aria-label fallback -->
    <input id="github" name="github_url" type="url" aria-label="GitHub profile URL" />
  </section>

  <h2>Work</h2>
  <label for="yoe">Years of experience</label>
  <select id="yoe" name="years_experience">
    <option value="">Select...</option>
    <option value="0-2">0-2 years</option>
    <option value="3-5">3-5 years</option>
    <option value="6-10">6-10 years</option>
    <option value="10+">10+ years</option>
  </select>

  <label for="summary">Summary</label>
  <textarea id="summary" name="experience_summary" rows="5"></textarea>

  <label for="auth">Authorized to work in the US?</label>
  <input id="auth" name="work_auth_us" type="checkbox" />

  <label for="resume">Resume</label>
  <input id="resume" name="resume_upload" type="file" accept=".pdf,.doc,.docx" required />

  <!-- intentionally excluded -->
  <input type="hidden" name="csrf" value="xxx" />
  <button type="submit">Apply</button>
</body>
</html>
```

### Step 10 — Create `tests/adapters/dom/scanner.spec.ts`

```ts
// tests/adapters/dom/scanner.spec.ts
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { scan } from '../../../src/adapters/dom/scanner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(resolve(__dirname, 'fixtures/realistic-form.html'), 'utf-8');

describe('scan()', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = FIXTURE.replace(/<!DOCTYPE[^>]*>/i, '').replace(/<\/?html[^>]*>/gi, '');
  });

  it('finds exactly 10 fillable inputs', () => {
    const model = scan();
    expect(model.fields).toHaveLength(10);
  });

  it('excludes hidden, submit, button, reset, image inputs', () => {
    const model = scan();
    const types = model.fields.map((f) => f.type);
    expect(types).not.toContain('hidden');
    expect(types).not.toContain('submit');
    expect(types).not.toContain('button');
  });

  it('resolves label via for=id', () => {
    const model = scan();
    const firstName = model.fields.find((f) => f.id === 'first-name');
    expect(firstName?.label).toBe('First name');
  });

  it('resolves label via aria-labelledby', () => {
    const model = scan();
    const lastName = model.fields.find((f) => f.id === 'last-name');
    expect(lastName?.label).toBe('Last name');
  });

  it('resolves label via ancestor <label>', () => {
    const model = scan();
    const email = model.fields.find((f) => f.id === 'email');
    expect(email?.label).toBe('Email address');
  });

  it('resolves label via preceding text sibling', () => {
    const model = scan();
    const phone = model.fields.find((f) => f.id === 'phone');
    expect(phone?.label).toContain('Phone');
  });

  it('falls back to placeholder', () => {
    const model = scan();
    const linkedin = model.fields.find((f) => f.id === 'linkedin');
    expect(linkedin?.label).toBe('LinkedIn profile URL');
  });

  it('falls back to aria-label', () => {
    const model = scan();
    const github = model.fields.find((f) => f.id === 'github');
    expect(github?.label).toBe('GitHub profile URL');
  });

  it('captures select options in document order', () => {
    const model = scan();
    const yoe = model.fields.find((f) => f.id === 'yoe');
    expect(yoe?.type).toBe('select-one');
    expect(yoe?.options.map((o) => o.value)).toEqual(['', '0-2', '3-5', '6-10', '10+']);
  });

  it('captures required attribute', () => {
    const model = scan();
    expect(model.fields.find((f) => f.id === 'first-name')?.required).toBe(true);
    expect(model.fields.find((f) => f.id === 'github')?.required).toBe(false);
  });

  it('records autocomplete tokens', () => {
    const model = scan();
    expect(model.fields.find((f) => f.id === 'first-name')?.autocomplete).toBe('given-name');
    expect(model.fields.find((f) => f.id === 'email')?.autocomplete).toBe('email');
  });

  it('emits ISO timestamp + document metadata', () => {
    const model = scan();
    expect(model.title).toBe('Realistic ATS Form');
    expect(() => new Date(model.scannedAt)).not.toThrow();
  });

  it('returns empty model when root has no fillable elements', () => {
    document.documentElement.innerHTML = '<body><p>no form here</p></body>';
    const model = scan();
    expect(model.fields).toHaveLength(0);
  });

  it('respects maxFields option', () => {
    const model = scan(document, { maxFields: 3 });
    expect(model.fields).toHaveLength(3);
  });

  it('includes disabled fields when includeDisabled=true', () => {
    const input = document.querySelector<HTMLInputElement>('#first-name')!;
    input.disabled = true;
    const defaultModel = scan();
    expect(defaultModel.fields.find((f) => f.id === 'first-name')).toBeUndefined();
    const explicit = scan(document, { includeDisabled: true });
    expect(explicit.fields.find((f) => f.id === 'first-name')).toBeDefined();
  });
});
```

### Step 11 — Create `tests/adapters/dom/label-resolver.spec.ts`

```ts
// tests/adapters/dom/label-resolver.spec.ts
// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import {
  findLabelFor,
  findAriaLabelledBy,
  findAncestorLabel,
  findNearestText,
  findAriaLabel,
  resolveLabel,
} from '../../../src/adapters/dom/label-resolver';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('findLabelFor', () => {
  it('resolves for=id', () => {
    document.body.innerHTML = '<label for="a">Alpha</label><input id="a" />';
    const el = document.getElementById('a')!;
    expect(findLabelFor(el)).toBe('Alpha');
  });
  it('returns empty when id is missing', () => {
    mount('<input name="b" />');
    expect(findLabelFor(document.querySelector('input')!)).toBe('');
  });
  it('handles CSS-escapable ids', () => {
    document.body.innerHTML = '<label for="a.b">Dotted</label><input id="a.b" />';
    const el = document.querySelector('input')!;
    expect(findLabelFor(el)).toBe('Dotted');
  });
});

describe('findAriaLabelledBy', () => {
  it('resolves single id', () => {
    document.body.innerHTML = '<span id="lbl">Label</span><input aria-labelledby="lbl" />';
    const el = document.querySelector('input')!;
    expect(findAriaLabelledBy(el)).toBe('Label');
  });
  it('concatenates multiple ids', () => {
    document.body.innerHTML = '<span id="a">First</span><span id="b">Name</span><input aria-labelledby="a b" />';
    const el = document.querySelector('input')!;
    expect(findAriaLabelledBy(el)).toBe('First Name');
  });
  it('skips missing refs', () => {
    document.body.innerHTML = '<span id="a">Keep</span><input aria-labelledby="a missing" />';
    expect(findAriaLabelledBy(document.querySelector('input')!)).toBe('Keep');
  });
});

describe('findAncestorLabel', () => {
  it('finds wrapping label and strips nested inputs', () => {
    document.body.innerHTML = '<label>Wrapped<input /></label>';
    const el = document.querySelector('input')!;
    expect(findAncestorLabel(el)).toBe('Wrapped');
  });
  it('returns empty when no ancestor label', () => {
    document.body.innerHTML = '<div><input /></div>';
    expect(findAncestorLabel(document.querySelector('input')!)).toBe('');
  });
});

describe('findNearestText', () => {
  it('collects preceding text sibling', () => {
    document.body.innerHTML = '<div>Phone<input id="p"/></div>';
    const el = document.getElementById('p')!;
    expect(findNearestText(el)).toContain('Phone');
  });
  it('stops at another input boundary', () => {
    document.body.innerHTML = '<input name="first"/><span>LastLabel</span><input id="target"/>';
    const el = document.getElementById('target')!;
    expect(findNearestText(el)).toBe('LastLabel');
  });
});

describe('findAriaLabel', () => {
  it('reads aria-label attribute', () => {
    document.body.innerHTML = '<input aria-label="Direct" />';
    expect(findAriaLabel(document.querySelector('input')!)).toBe('Direct');
  });
});

describe('resolveLabel ladder', () => {
  it('prefers for-attr over all others', () => {
    document.body.innerHTML = '<label for="x">ForAttr</label><input id="x" aria-label="ignored" placeholder="also ignored" />';
    const out = resolveLabel(document.querySelector('input')!);
    expect(out.strategy).toBe('for-attr');
    expect(out.label).toBe('ForAttr');
  });
  it('falls through to aria-label when nothing else present', () => {
    document.body.innerHTML = '<input aria-label="OnlyAria" />';
    const out = resolveLabel(document.querySelector('input')!);
    expect(out.strategy).toBe('aria-label');
    expect(out.label).toBe('OnlyAria');
  });
  it('returns none when nothing found', () => {
    document.body.innerHTML = '<input />';
    const out = resolveLabel(document.querySelector('input')!);
    expect(out.strategy).toBe('none');
    expect(out.label).toBe('');
  });
});
```

### Step 12 — Create `tests/adapters/dom/filler.spec.ts`

```ts
// tests/adapters/dom/filler.spec.ts
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fillField } from '../../../src/adapters/dom/filler';

describe('fillField — text input', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="t" type="text" />';
  });

  it('sets value and fires input/change events in order', () => {
    const el = document.getElementById('t') as HTMLInputElement;
    const events: string[] = [];
    for (const ev of ['beforeinput', 'input', 'change', 'blur']) {
      el.addEventListener(ev, () => events.push(ev));
    }
    const res = fillField(el, 'hello');
    expect(res.ok).toBe(true);
    expect(el.value).toBe('hello');
    // Order matters: beforeinput must precede input.
    expect(events.indexOf('beforeinput')).toBeLessThan(events.indexOf('input'));
    expect(events.indexOf('input')).toBeLessThan(events.indexOf('change'));
    expect(events).toContain('blur');
  });

  it('returns element-disabled when input is disabled', () => {
    const el = document.getElementById('t') as HTMLInputElement;
    el.disabled = true;
    const res = fillField(el, 'x');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('element-disabled');
  });

  it('returns element-disabled when readOnly', () => {
    const el = document.getElementById('t') as HTMLInputElement;
    el.readOnly = true;
    const res = fillField(el, 'x');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('element-disabled');
  });

  it('respects fieldset:disabled ancestor', () => {
    document.body.innerHTML = '<fieldset disabled><input id="t2" /></fieldset>';
    const el = document.getElementById('t2') as HTMLInputElement;
    const res = fillField(el, 'x');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('element-disabled');
  });
});

describe('fillField — textarea', () => {
  it('writes multi-line value', () => {
    document.body.innerHTML = '<textarea id="ta"></textarea>';
    const el = document.getElementById('ta') as HTMLTextAreaElement;
    const res = fillField(el, 'line1\nline2');
    expect(res.ok).toBe(true);
    expect(el.value).toBe('line1\nline2');
  });
});

describe('fillField — select', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="s">
        <option value=""></option>
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>`;
  });

  it('sets value when option exists', () => {
    const el = document.getElementById('s') as HTMLSelectElement;
    const res = fillField(el, 'b');
    expect(res.ok).toBe(true);
    expect(el.value).toBe('b');
  });

  it('rejects unknown option value', () => {
    const el = document.getElementById('s') as HTMLSelectElement;
    const res = fillField(el, 'zzz');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('value-rejected-by-page');
  });

  it('fires change but not input (React select semantics)', () => {
    const el = document.getElementById('s') as HTMLSelectElement;
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    el.addEventListener('input', inputSpy);
    el.addEventListener('change', changeSpy);
    fillField(el, 'a');
    expect(changeSpy).toHaveBeenCalled();
    // input event should NOT fire for selects
    expect(inputSpy).not.toHaveBeenCalled();
  });
});

describe('fillField — checkbox', () => {
  it('clicks to toggle when different', () => {
    document.body.innerHTML = '<input id="c" type="checkbox" />';
    const el = document.getElementById('c') as HTMLInputElement;
    const res = fillField(el, true);
    expect(res.ok).toBe(true);
    expect(el.checked).toBe(true);
  });

  it('no-ops when already in target state', () => {
    document.body.innerHTML = '<input id="c" type="checkbox" checked />';
    const el = document.getElementById('c') as HTMLInputElement;
    const clickSpy = vi.fn();
    el.addEventListener('click', clickSpy);
    const res = fillField(el, true);
    expect(res.ok).toBe(true);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

describe('fillField — radio', () => {
  it('activates target radio in a group', () => {
    document.body.innerHTML = `
      <input id="r1" type="radio" name="g" value="a" />
      <input id="r2" type="radio" name="g" value="b" />`;
    const el = document.getElementById('r2') as HTMLInputElement;
    const res = fillField(el, true);
    expect(res.ok).toBe(true);
    expect(el.checked).toBe(true);
  });
});

describe('fillField — unsupported', () => {
  it('rejects file inputs (must use attachFile)', () => {
    document.body.innerHTML = '<input id="f" type="file" />';
    const el = document.getElementById('f') as HTMLInputElement;
    const res = fillField(el, 'ignored');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('unknown-error');
  });
});
```

### Step 13 — Create `tests/adapters/dom/file-attacher.spec.ts`

```ts
// tests/adapters/dom/file-attacher.spec.ts
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { attachFile } from '../../../src/adapters/dom/file-attacher';

function makeFile(name = 'resume.pdf', content = 'pdf-bytes'): File {
  return new File([content], name, { type: 'application/pdf' });
}

describe('attachFile', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="f" type="file" />';
  });

  it('attaches a single file via DataTransfer', async () => {
    const input = document.getElementById('f') as HTMLInputElement;
    const file = makeFile();
    const res = await attachFile(input, file);
    expect(res.ok).toBe(true);
    expect(input.files?.length).toBe(1);
    expect(input.files?.[0]?.name).toBe('resume.pdf');
  });

  it('dispatches bubbling input + change events', async () => {
    const input = document.getElementById('f') as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    await attachFile(input, makeFile());
    expect(events).toEqual(['input', 'change']);
  });

  it('rejects non-file inputs', async () => {
    document.body.innerHTML = '<input id="t" type="text" />';
    const input = document.getElementById('t') as HTMLInputElement;
    const res = await attachFile(input, makeFile());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('file-attach-failed');
  });

  it('rejects empty file array', async () => {
    const input = document.getElementById('f') as HTMLInputElement;
    const res = await attachFile(input, [] as unknown as File[]);
    expect(res.ok).toBe(false);
  });

  it('truncates to one file on non-multiple input', async () => {
    const input = document.getElementById('f') as HTMLInputElement;
    const files = [makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')];
    const res = await attachFile(input, files);
    expect(res.ok).toBe(true);
    expect(input.files?.length).toBe(1);
  });

  it('accepts multiple files when input.multiple=true', async () => {
    document.body.innerHTML = '<input id="fm" type="file" multiple />';
    const input = document.getElementById('fm') as HTMLInputElement;
    const files = [makeFile('a.pdf'), makeFile('b.pdf')];
    const res = await attachFile(input, files);
    expect(res.ok).toBe(true);
    expect(input.files?.length).toBe(2);
  });
});
```

### Step 14 — Create `tests/adapters/dom/mutation-watcher.spec.ts`

```ts
// tests/adapters/dom/mutation-watcher.spec.ts
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchForm } from '../../../src/adapters/dom/mutation-watcher';

describe('watchForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.useFakeTimers();
  });

  it('fires once after debounce window closes', async () => {
    const root = document.getElementById('root')!;
    const cb = vi.fn();
    watchForm(root, cb, { debounceMs: 100 });
    root.appendChild(document.createElement('input'));
    root.appendChild(document.createElement('input'));
    root.appendChild(document.createElement('input'));
    // MutationObserver callbacks are microtask-queued
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].mutationCount).toBeGreaterThan(0);
  });

  it('batches rapid mutations into single callback', async () => {
    const root = document.getElementById('root')!;
    const cb = vi.fn();
    watchForm(root, cb, { debounceMs: 50 });
    for (let i = 0; i < 10; i += 1) {
      root.appendChild(document.createElement('div'));
    }
    await Promise.resolve();
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cleanup function disconnects observer and prevents further callbacks', async () => {
    const root = document.getElementById('root')!;
    const cb = vi.fn();
    const cleanup = watchForm(root, cb, { debounceMs: 50 });
    cleanup();
    root.appendChild(document.createElement('input'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cleanup clears pending debounce', async () => {
    const root = document.getElementById('root')!;
    const cb = vi.fn();
    const cleanup = watchForm(root, cb, { debounceMs: 100 });
    root.appendChild(document.createElement('input'));
    await Promise.resolve();
    cleanup();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by the callback', async () => {
    const root = document.getElementById('root')!;
    const cb = vi.fn(() => { throw new Error('boom'); });
    watchForm(root, cb, { debounceMs: 10 });
    root.appendChild(document.createElement('input'));
    await Promise.resolve();
    expect(() => vi.advanceTimersByTime(20)).not.toThrow();
  });
});
```

## Architecture constraints (MUST enforce)

- [ ] NO import from `src/ats/**` anywhere in this phase.
- [ ] NO import from `src/adapters/chrome/**` anywhere in this phase.
- [ ] `src/core/**` unchanged — this phase only adds adapter files.
- [ ] Type-only imports from `src/core/types/**` use `import type { ... }` to keep runtime tree-shake clean.
- [ ] Every function returns a plain discriminated-union result — NO thrown exceptions across the filler/attacher surface. The only place `throw` is acceptable is inside the scanner's internal label walker if the DOM is in a fundamentally broken state (none currently planned).
- [ ] No `any`, no `@ts-ignore`, no `as unknown as X` escapes except the one case in the test file `file-attacher.spec.ts` line where we pass an empty array through an `as unknown as File[]` to exercise the empty-list rejection path.
- [ ] No `console.log`/`console.error`/`console.warn` anywhere in production code. Tests may use `vi.spyOn(console, ...)` as assertions but SHOULD NOT.

## Rules from the project that apply (executor must honor)

From `C:\Users\Ebenezer\.claude\rules\common\coding-style.md`:
- Immutability: every returned object/array is new; no in-place mutation of input arguments.
- File size: scanner.ts is 260 LOC — within the 400-line soft cap. If it grows beyond 400, split label-strategy helpers into a separate file.

From `e:\llmconveyors.com\.claude\rules\code-quality.md`:
- No dead code. No stubs. No "TODO: implement" markers. If something cannot be specified fully in this plan, STOP and surface the question.
- Root cause or nothing: the filler's value-did-not-stick path is a CORRECT failure report, not a bandaid — it reflects real library behavior (masked inputs reformat on blur).

From `C:\Users\Ebenezer\.claude\rules\common\testing.md`:
- Tests target edge cases, not happy path. Every spec above includes failure/error-path assertions.
- Test fails = found a bug. Executor fixes code, never test expectations.

## §6 — Known edge cases and how they are handled

### §6.1 Masked / imask inputs

Text inputs wrapped by `react-imask`, `cleave.js`, or `react-number-format` reformat their value on `blur`. `fillField` returns `value-did-not-stick` in that case because `el.value` after blur differs from what was written. This is a CORRECT failure report — per-ATS adapters (B7/B8/B9) will layer a pre-format step before calling `fillField`. No change needed in this phase.

### §6.2 Shadow DOM

Tests run under happy-dom which implements shadow DOM partially. The filler dispatches all events with `composed: true` so they cross shadow boundaries. Scanner's `querySelectorAll` does not cross shadow roots — per-ATS adapters handle shadow traversal if their target ATS uses it (Workday, Radix-wrapped dialogs). No shadow-DOM traversal in the generic scanner.

### §6.3 Mid-fill re-render

If React re-mounts the input between `scan()` and `fillField()`, the element reference held by the content script becomes stale and `fillField` returns `value-did-not-stick`. The `watchForm` callback triggers a re-scan, and the content script (A8) implements the retry loop. Out of scope here.

### §6.4 happy-dom DataTransfer

happy-dom v14+ provides `DataTransfer` and `File`. If a regression surfaces (v15 release broke the constructor briefly per upstream issue tracker), add this file:

```ts
// tests/setup/happy-dom-shims.ts
//
// Minimal DataTransfer shim for test envs where happy-dom's implementation
// is missing or broken. Only exposes the methods file-attacher uses.
if (typeof DataTransfer === 'undefined') {
  class DataTransferItemList {
    readonly items: File[] = [];
    add(file: File) { this.items.push(file); }
  }
  class DataTransferShim {
    readonly items = new DataTransferItemList();
    get files(): FileList {
      const arr = this.items.items;
      const list = arr as unknown as FileList;
      (list as unknown as { length: number }).length = arr.length;
      (list as unknown as { item: (i: number) => File | null }).item = (i) => arr[i] ?? null;
      return list;
    }
  }
  (globalThis as unknown as { DataTransfer: typeof DataTransferShim }).DataTransfer = DataTransferShim;
}
```

Add `setupFiles: ['./tests/setup/happy-dom-shims.ts']` to `vitest.config.ts`'s `test` block if the shim is needed. Verify first via step 0 above — do NOT add the shim unconditionally.

### §6.5 CSS.escape in happy-dom

happy-dom exposes `CSS.escape`. If a future version regresses, the label-resolver fall-through via `getElementById` (used in `findAriaLabelledBy`) works unconditionally. The `findLabelFor` helper would need a manual escape fallback — add only if the scanner spec fails.

### §6.6 Workday combobox

`openCombobox` only dispatches the pointer sequence. It does NOT select a listbox option — that's per-ATS logic. Returning `ok:true` after opening is a deliberate choice so the A8 content script can chain: `fillField(combobox) -> watchForm (wait for options to render) -> per-ATS option-picker`. The alternative (return `ok:false` or a sentinel) would force every caller to special-case comboboxes. The decision memo §2.6 explicitly defers Workday multi-step wizards to v1.1, so this phase does the minimum.

### §6.7 Selector uniqueness

`buildStableSelector` verifies id/name uniqueness before committing to them. Workday re-renders can transiently duplicate ids; the ladder falls through to the positional selector if duplication is detected. Per-ATS adapters B7/B8/B9 override the selector strategy with `data-automation-id` anchors.

## Acceptance criteria

Executor completes the phase when ALL of the following hold:

- [ ] All 14 files exist with the contents specified in steps 1-14.
- [ ] `pnpm -F ats-autofill-engine typecheck:adapter` passes with zero errors.
- [ ] `pnpm -F ats-autofill-engine test tests/adapters/dom/` passes with zero failures.
- [ ] Coverage for `src/adapters/dom/**` ≥ 85% line coverage.
- [ ] `pnpm -F ats-autofill-engine lint src/adapters/dom/` passes with zero warnings.
- [ ] No occurrence of `any`, `@ts-ignore`, `@ts-expect-error`, or `console.` in `src/adapters/dom/**`.
- [ ] No import from `src/ats/**` or `src/adapters/chrome/**` in any file under `src/adapters/dom/**` (grep gate).
- [ ] `src/adapters/dom/index.ts` exports exactly the names listed in Step 8 (no additions, no omissions).

## Grep gate (executor runs before marking complete)

```bash
# 1. Forbid core -> adapter leaks (should already hold; sanity check)
grep -R "from '../../adapters" src/core/ && exit 1
grep -R "from '../../ats" src/core/ && exit 1

# 2. Forbid ats imports from within the dom adapter
grep -R "from '../../ats" src/adapters/dom/ && exit 1
grep -R "from '../chrome" src/adapters/dom/ && exit 1

# 3. Forbid any escapes
grep -R "any\b" src/adapters/dom/ --include='*.ts' | grep -v '// @ts-ignore' && exit 1
grep -R "@ts-ignore" src/adapters/dom/ && exit 1
grep -R "@ts-expect-error" src/adapters/dom/ && exit 1

# 4. Forbid console
grep -R "console\." src/adapters/dom/ --include='*.ts' && exit 1

# 5. Forbid direct throws from filler (guardrail)
grep -R "^\s*throw" src/adapters/dom/filler.ts && exit 1
grep -R "^\s*throw" src/adapters/dom/file-attacher.ts && exit 1
```

All greps must return no matches; the script exits 1 if any violation is found.

## Rollback plan

If the phase fails verification:

1. Delete the 13 new production + test files and the fixture HTML (revert to the B1 empty `src/adapters/dom/index.ts` placeholder).
2. Re-run `pnpm install` (should be a no-op if no dependencies were added).
3. Re-run `pnpm -F ats-autofill-engine typecheck:adapter` to confirm baseline is clean.
4. Surface the blocking issue to the architect with a minimal reproduction — likely candidates:
   - happy-dom DataTransfer regression → apply §6.4 shim.
   - `CSS.escape` unavailable → add manual escape helper in label-resolver.
   - Native setter descriptor not found (very unlikely under happy-dom) → switch to direct `el.value =` assignment as a fallback path and document the deviation.

## Non-goals (explicit exclusions)

The following MUST NOT be added in this phase:

- Per-ATS selector maps (B7/B8/B9 own those).
- Workday `data-automation-id` XPaths (B9).
- Highlighter rendering (B6).
- `chrome.*` API usage (deferred to Z track).
- React widget mounts or per-field UI overlays — the adapter is headless.
- Contenteditable full support (Lexical/Slate/ProseMirror) — captured in scanner as `type: 'contenteditable'` but filler returns `unsupported-element`. Full support deferred until a real ATS requires it.
- Shadow-DOM traversal in scanner — per-ATS adapters handle specific shadow roots.
- `fillWithRetry` wrapper (agent 37 §h.8) — consumer (A8 content script) implements retry loops on top of `fillField` + `watchForm`.
- `verifyFill` fiber probe (agent 37 §g) — deferred; simple DOM value check in `fillTextLike` is sufficient for the POC.
- `fillContentEditable` — deferred. Return `unsupported-element` until a real need surfaces.
- base64 <-> File conversion helpers (agent 38 §f) — A8 content script handles resume payload hydration from the service worker.

## Post-phase deliverable

A single `DONE` line appended to `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B5_dom_adapter_scanner_and_filler/STATUS.md` containing:

```
B5 DONE: scanner + filler + file-attacher + mutation-watcher landed
Files: 14 created, 1 modified (barrel)
Tests: 5 spec files, 45+ cases, all green
Coverage: src/adapters/dom/** line ≥ 85%
Consumers unblocked: B7, B8, B9, A8
```

End of phase B5 plan.
