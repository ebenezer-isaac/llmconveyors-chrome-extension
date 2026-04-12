# 44 - Hexagonal Core/Adapter Boundaries for `@ebenezer-isaac/autofill-core`

**Scope**: Define the exact layered architecture for the standalone OSS autofill package.
**Confidence**: 88%

---

## a) `core/` - pure, Node-testable, zero DOM

All of these are pure functions over plain data. No `window`, no `document`, no `fetch`, no globals.

| Module | Responsibility | Input (plain data) | Output (plain data) |
|---|---|---|---|
| `core/taxonomy.ts` | Field type enum + synonym dictionary | - | `FieldType` union + `SYNONYMS: Record<FieldType, string[]>` |
| `core/classifier.ts` | Classify a `FormFieldDescriptor` into a `FieldType` | `FormFieldDescriptor` | `{ type: FieldType, confidence: number, matchedOn: string }` |
| `core/fill-rules.ts` | Given profile + classified field, compute the value | `(Profile, ClassifiedField)` | `FillInstruction` |
| `core/keyword-matcher.ts` | Diff JD tokens against resume tokens | `(jdText, resumeText)` | `{ matches: Match[], missing: string[] }` |
| `core/highlight-planner.ts` | Compute highlight ranges over a text stream | `(text: string, keywords: string[])` | `HighlightRange[]` with `{start, end, keyword}` |
| `core/form-model.ts` | Plain types: `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillPlan` | - | type-only |
| `core/plan-builder.ts` | Walk a `FormModel` + profile → emit `FillPlan` | `(FormModel, Profile)` | `FillPlan` (ordered instructions) |

**Hard constraint**: `core/` `package.json` sub-entry declares `"sideEffects": false` and TypeScript `lib` excludes `DOM`. Any accidental `HTMLElement` reference fails compilation in CI.

## b) `adapters/dom/` and `adapters/chrome-ext/` - browser-coupled

These touch live browser APIs and implement ports. Each is optional; core runs without them.

| Adapter | Role | Requires |
|---|---|---|
| `adapters/dom/scanner.ts` | Walks `document`, emits `FormModel` via querySelectorAll on `input, select, textarea` + label resolution via `for`/`aria-labelledby`/nearest-text | `document` |
| `adapters/dom/filler.ts` | Executes one `FillInstruction`: resolves selector, calls React-safe native setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v)`), dispatches `input` + `change` bubbling events | `HTMLElement` |
| `adapters/dom/file-attacher.ts` | Wraps `DataTransfer` for `<input type=file>`; assigns `el.files` via the setter trick | `DataTransfer`, `File` |
| `adapters/dom/mutation-watcher.ts` | `MutationObserver` wrapper, debounced, emits `'formChanged'` events to re-trigger scan | `MutationObserver` |
| `adapters/dom/highlighter-renderer.ts` | Consumes `HighlightRange[]` from core, wraps text nodes in `<mark data-autofill>` spans (TreeWalker + Range) | `document`, `Range`, `TreeWalker` |
| `adapters/chrome-ext/intent-detector.ts` | Uses `chrome.tabs`/content-script URL matching to decide "is this an ATS form page" | `chrome.*` APIs |
| `adapters/chrome-ext/profile-provider.ts` | Reads profile from `chrome.storage.local`, implements `IProfileProvider` | `chrome.storage` |

## c) `ports/` - TypeScript interfaces in core

```ts
// core/ports/index.ts - pure type-only exports
export interface IFormScanner { scan(root?: unknown): Promise<FormModel>; }
export interface IFieldFiller { fill(selector: string, value: string | boolean): Promise<FillResult>; }
export interface IFileAttacher { attach(selector: string, file: { name: string; bytes: Uint8Array; mime: string }): Promise<FillResult>; }
export interface IPageIntentDetector { detect(): Promise<{ isApplicationForm: boolean; atsVendor?: AtsVendor }>; }
export interface IProfileProvider { load(): Promise<Profile>; save(p: Profile): Promise<void>; }
export interface IKeywordHighlighter { apply(ranges: HighlightRange[]): Promise<void>; clear(): Promise<void>; }
```

Ports live in core because they are pure types. Implementations live in `adapters/`. Core never imports from `adapters/` - only from `./ports` (type-only) or sibling core modules.

## d) Communication direction - **Core returns plans, adapter executes**

**Decision**: Core is an **instruction emitter**, adapter is an **executor**. Core does NOT call into adapter interfaces for fill operations.

Flow:
1. Host calls `adapter.scanner.scan()` → `FormModel`
2. Host calls `core.planBuilder.build(formModel, profile)` → `FillPlan` (array of `FillInstruction`)
3. Host iterates the plan and calls `adapter.filler.fill(...)` per instruction

Why this direction:
- **Testability**: `build()` is a pure function `(FormModel, Profile) -> FillPlan`. Zero mocks needed.
- **Determinism**: Plans are snapshot-testable JSON. Regression tests become `expect(plan).toMatchSnapshot()`.
- **Dry-run mode**: Extension can show the user the plan before executing.
- **Offline-capable**: Core needs no adapter instance to produce a plan.
- **The exception**: `IProfileProvider` IS called from the host shell (not core). Core receives `Profile` as a parameter, never fetches it.

`IKeywordHighlighter` and `IFormScanner` are used at the boundary *before* and *after* core runs. Core never dereferences a port at runtime.

## e) Testability demonstration

```ts
// core/__tests__/classifier.spec.ts - runs in Node, zero DOM
import { classify } from '../classifier';

test('classifies email field by autocomplete attr', () => {
  const descriptor = {
    name: 'email', id: 'email-2',
    label: 'Email Address', placeholder: 'you@example.com',
    autocomplete: 'email', type: 'email',
  };
  expect(classify(descriptor)).toEqual({
    type: 'EMAIL', confidence: 1.0, matchedOn: 'autocomplete',
  });
});

test('falls back to label synonym for first name', () => {
  expect(classify({
    name: 'fn_1', id: '', label: 'Given name',
    placeholder: '', autocomplete: '', type: 'text',
  })).toEqual({ type: 'FIRST_NAME', confidence: 0.8, matchedOn: 'label-synonym' });
});
```

Same story for `planBuilder`, `keywordMatcher`, `highlightPlanner`: every test is `(plainStruct) -> plainStruct`. Tests run under `vitest --environment=node` with **no jsdom dependency**.

## f) Package `exports` map

```jsonc
{
  "name": "@ebenezer-isaac/autofill-core",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".":              { "types": "./dist/core/index.d.ts",              "default": "./dist/core/index.js" },
    "./taxonomy":     { "types": "./dist/core/taxonomy.d.ts",           "default": "./dist/core/taxonomy.js" },
    "./ports":        { "types": "./dist/core/ports/index.d.ts",        "default": "./dist/core/ports/index.js" },
    "./dom":          { "types": "./dist/adapters/dom/index.d.ts",      "default": "./dist/adapters/dom/index.js" },
    "./chrome":       { "types": "./dist/adapters/chrome-ext/index.d.ts","default": "./dist/adapters/chrome-ext/index.js" }
  },
  "files": ["dist"]
}
```

- `.` → pure core; importable in Node, Deno, Cloudflare Workers, tests.
- `./ports` → type-only, zero runtime cost.
- `./dom` → requires `document` globals; Node consumers who import this crash at runtime (intentional).
- `./chrome` → requires MV3 `chrome.*`; usable only inside extension contexts.

`tsconfig.core.json` uses `"lib": ["ES2022"]` (no DOM). `tsconfig.dom.json` adds `"lib": ["ES2022","DOM"]`. A single `pnpm build` emits both into `dist/`. CI fails if `dist/core/**` contains any `HTMLElement` token.

## g) Layering diagram

```
+---------------------------------------------------------------+
|  Chrome Extension (MV3 content script + service worker)       |
|   - orchestrates: scan -> build plan -> execute plan          |
|   - owns Profile, chrome.storage, tabs, messaging             |
+------------------------+--------------------------------------+
                         |  imports
          +--------------+---------------+
          v                              v
+---------------------+        +-----------------------+
|  @.../autofill-core |        |  @.../autofill-core   |
|  /dom   (adapter)   |        |  /chrome  (adapter)   |
|                     |        |                       |
|  DomScanner         |        |  ChromeProfileProvider|
|  DomFiller          |        |  ChromeIntentDetector |
|  DomFileAttacher    |        |                       |
|  HighlightRenderer  |        |                       |
|  MutationWatcher    |        |                       |
+----------+----------+        +-----------+-----------+
           |                               |
           |  implements                   |  implements
           v                               v
+---------------------------------------------------------------+
|                     @.../autofill-core  (core)                |
|                                                               |
|   ports/  (type-only interfaces)                              |
|     IFormScanner  IFieldFiller  IFileAttacher                 |
|     IPageIntentDetector  IProfileProvider  IKeywordHighlighter|
|                                                               |
|   taxonomy   classifier   fillRules   planBuilder             |
|   keywordMatcher          highlightPlanner                    |
|                                                               |
|   Plain types: FormModel, FormFieldDescriptor, FillPlan,      |
|   FillInstruction, HighlightRange, Profile                    |
|                                                               |
|   tsconfig lib=ES2022 (NO DOM) | sideEffects=false            |
+---------------------------------------------------------------+
                         ^
                         |  imports (Node tests)
+---------------------------------------------------------------+
|  vitest --environment=node                                    |
|  - classifier.spec, planBuilder.spec, keywordMatcher.spec     |
|  - zero mocks, zero jsdom                                     |
+---------------------------------------------------------------+
```

**Dependency rule**: arrows point inward. `dom/` and `chrome/` may import from `core/`; `core/` may NEVER import from `dom/`, `chrome/`, or any external runtime. Enforced by:
1. `tsconfig.core.json` `lib: ["ES2022"]` - DOM symbols unresolved.
2. ESLint `import/no-restricted-paths` rule blocking `core/**` from importing `adapters/**`.
3. CI step greps `dist/core/` for `document|window|chrome\.` tokens.

---

**Confidence: 88%**

Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\44-hex-core-boundaries.md`
