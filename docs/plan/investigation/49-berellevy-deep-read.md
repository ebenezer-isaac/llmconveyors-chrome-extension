# Agent 49 — berellevy/job_app_filler Deep Read

**Scope**: MIT fork candidate for Workday + Greenhouse autofill. Commit `main` HEAD, cloned `e:/scratch/job_app_filler`.

## a) LICENSE — NOT MIT (IMPORTANT CORRECTION)

**`e:/scratch/job_app_filler/LICENSE.md`**: Copyright (c) 2024-present, Dovber Levy. All rights reserved. License text is **BSD-3-Clause** in substance (three classic clauses: retain copyright notice in source, reproduce in binaries, no endorsement via author name). `package.json:8` claims `"license": "ISC"` — this is **wrong/inconsistent**. README never states MIT. The agent prompt's "MIT" assumption is **false**.

**Porting implication**: BSD-3-Clause is permissive and fork-compatible. We must (1) retain copyright notice in any ported source file, (2) reproduce notice in our distributed extension (LICENSE-THIRD-PARTY or NOTICES file), (3) NOT use "Berel Levy" or "Dovber Levy" or "Job App Filler" in our product name or promotional copy without written permission. Clause 3 is the real constraint — we must rename everything.

## b) Build System

- **Bundler**: Webpack 5 (`webpack.common.js`, `webpack.dev.js`, `webpack.prod.js`), `ts-loader`, `clean-webpack-plugin`, `copy-webpack-plugin`, `html-webpack-plugin`, `node-polyfill-webpack-plugin`
- **Language**: TypeScript 5.5 (`tsconfig.json`)
- **UI**: React 18.3 + MUI 5.16 + emotion + mui-markdown
- **Other deps** (`package.json:11-43`): `elasticlunr` + `lunr` (answer search index), `lodash`, `uuid`, `@types/chrome`, `@fontsource/roboto`
- **Total TS/TSX files**: 110

## c) Directory Structure

```
src/
  background/background.ts              # service worker (minimal)
  contentScript/                        # chrome.storage access + message server
    contentScript.ts                    # entry: Server instance, injects inject.js
    app/App.tsx                         # "What's new" modal in content context
    utils/storage/                      # Answers1010, DataStore, migrations (chrome.storage)
  inject/                               # runs in PAGE CONTEXT, has React access
    inject.ts                           # entry: domain routing + MutationObserver
    app/
      App.tsx, AppContext.tsx           # React root per-field
      FieldWidget/                      # Fill/Save/MoreInfo buttons (UI)
      MoreInfoPopup/                    # MUI popper with answer editor
      hooks/                            # useEditableAnswerState, etc.
      services/
        contentScriptApi.ts             # Client to content-script Server
        formFields/
          baseFormInput.tsx             # abstract BaseFormInput<T>
          utils/index.ts                # getReactProps, fillReactTextInput, addCharacterMutationObserver
          workday/                      # 16 files (XPATH + 12 field types)
          greenhouse/                   # classic DOM Greenhouse (boards.greenhouse.io)
          greenhouseReact/              # React-rendered Greenhouse (job-boards.greenhouse.io)
  popup/                                # extension popup UI
  shared/                               # imported by both contexts
    utils/
      getElements.ts                    # XPath wrappers, waitForElement
      fieldFillerQueue.ts               # singleton AsyncQueue
      file.ts                           # base64 <-> File
      fileUploadHelpers.ts              # dispatchFileDragEvent (DataTransfer polyfill)
      crossContextCommunication/        # Client + Server event-based RPC
      stringMatch.ts                    # exact/contains/startsWith/keywordCount
      scroll.ts, async.ts, xpath.ts, events.ts, strings.ts
  static/                               # manifest.json, icons
```

## d) Workday Adapter

**Entry**: `src/inject/app/services/formFields/workday/index.ts:13-34`. Exports `RegisterInputs(node)` that bails if `jobSearch` element exists, else runs `Promise.all(inputs.map(i => i.autoDiscover(node)))` over 12 field classes.

**12 field classes** (`workday/*.ts`): `TextInput` (61 LOC), `Password` (33), `TextArea` (39), `Dropdown` (145), `DropdownSearchable` (196), `BooleanCheckbox`, `BooleanRadio.tsx`, `CheckboxesSingle`, `MonthYear`, `Year`, `MonthDayYear` (all under `Dates/`), `FileMulti` (123). All extend `WorkdayBaseInput` (51 LOC).

**Discovery algorithm** = **XPath-only, `data-automation-id` driven**. `workday/xpaths.ts:1-76` — every selector looks for `div[starts-with(@data-automation-id, 'formField-')]` plus a distinguishing predicate (e.g. `[.//input[@type='text']][not(.//*[@aria-haspopup])]` for TextInput). This is brittle but powerful: Workday's `data-automation-id` attributes are more stable than class names.

**Section/subsection traversal**: `WorkdayBaseInput.sectionLabelXpath` (`WorkdayBaseInput.ts:21-41`) uses a **primary** XPath `ancestor::fieldset/parent::div[.//div[@job-app-filler='${uuid}']][1]//h4` + a **secondary** XPath `ancestor::div[@role="group"][1][...][1]//h4[@id]`, combined with `(primary | secondary)`. This is the core trick for repeating Workday sections (work history, education) — it grabs the nearest ancestor fieldset, verifies this very field lives inside, then finds the `<h4>` heading. `h4[@id]` filter distinguishes repeating sections whose h4 is referenced by aria from static ones.

**Copy-paste viability**: XPaths are **Workday-only** but the `WorkdayBaseInput` pattern and `autoDiscover` flow are general. Field classes 80% reusable if we keep the XPath strings.

## e) Greenhouse Adapter

Two separate adapters because Greenhouse has two front-ends:

**Classic DOM** (`greenhouse/*.ts`, 13 files, `boards.greenhouse.io` + `boards.eu.greenhouse.io`): added in v2.0.0 (2024-11-06 per CHANGELOG). Covers basic select, textarea, simple dropdown, address-searchable, single file upload, text field, **MonthYear**, repeating employment/education sections (v2.1.0 2024-11-19), searchable dropdown + MonthYear (v2.1.1 2024-12-03). `Sections.ts:1-51` is the repeating-section manager — it stamps `jaf-section="employment 1"`, `jaf-section="employment 2"` attributes on children and re-runs on mutation so field paths are stable.

**React Greenhouse** (`greenhouseReact/*.ts`, 15 files, `job-boards.greenhouse.io`): newer job-boards front-end. Covers TextInput, Textarea, NumberInput, File, CheckboxBoolean, CheckboxMulti, Dropdown, DropdownSearchable (271 LOC — biggest), DropdownMultiSearchable, AddressSearchable, Section. XPaths target `div[@class="text-input-wrapper"]`, `div[@class="select"]`, `fieldset[@class="checkbox"]`, etc. (`greenhouseReact/xpaths.ts:1-54`).

**XPaths are Greenhouse-specific** and break if Greenhouse changes class names. File upload uses `getReactProps(inputElement).onChange({target:{files:[file]}})` directly (`greenhouseReact/File.ts:80-82`) — elegant when React props are exposed.

## f) FormField Class Hierarchy

```
BaseFormInput<AnswerType>  (abstract, baseFormInput.tsx:28-204)
  |— WorkdayBaseInput<T>      (WorkdayBaseInput.ts:5-51)
  |     |— TextInput, Password, TextArea, Dropdown, DropdownSearchable,
  |     |— BooleanCheckbox, BooleanRadio, CheckboxesSingle, FileMulti,
  |     `— Dates/{Year, MonthYear, MonthDayYear}
  |— GreenhouseBaseInput<T>   (GreenhouseBaseInput.ts:5-54, adds jaf-section lookup)
  |     `— TextInput, Textarea, Select, Dropdown, DropdownMulti,
  |     `— DropdownSearchable, AddressSearchable, Checkboxes, File, MonthYear
  `— GreenhouseReactBaseInput<T>
        `— (same fieldset, react-flavoured)
```

**Key methods on `BaseFormInput`** (`baseFormInput.tsx`):
- `static XPATH: string` (line 52) — override per subclass
- `static autoDiscover(node)` (91-100) — runs `getElements(node, this.XPATH)` and constructs one instance per match, gated by `hasAttribute('job-app-filler')`
- `constructor(element)` (81-89) — stamps `job-app-filler=<uuid>`, calls `listenForChanges()`, mounts React app via `attachReactApp(<App backend={this}/>, element)`
- `abstract listenForChanges(): void` (108) — per-subclass MutationObserver or native event listeners
- `abstract fill(): Promise<void>` (203) — field-specific fill pipeline
- `abstract currentValue(): any` (160)
- `get labelElement / fieldName / page / section / path` (119-158) — derive the answer lookup key `{page, section, fieldType, fieldName}`
- `save/answer/deleteAnswer` (169-188) — RPC to content script via `contentScriptAPI.send()`
- `triggerReactUpdate()` (115-117) — dispatches a CustomEvent that the widget React app listens on

## g) Field Detection / Discovery

**Two layers**:

1. **Static XPath registration** per subclass (`static XPATH = xpaths.TEXT_INPUT`).
2. **Global MutationObserver** in `inject.ts:21-28` watching `document.body` with `childList: true, subtree: true`. On ANY mutation, re-runs `RegisterInputs(document)` which calls every class's `autoDiscover`. Duplicate registration is prevented by the `job-app-filler` attribute check (`isRegistered()` in `baseFormInput.tsx:20-22`).

**XPath engine**: `shared/utils/getElements.ts:37-46` — thin wrapper around `document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)`. `getElements()` (66-79) returns all matches via `ORDERED_NODE_SNAPSHOT_TYPE`. `waitForElement()` (98-122) polls via MutationObserver with configurable timeout — critical for post-click dropdowns.

**`getElement()` polymorphism** (`getElements.ts:12-31`) is clever: accepts `Node`, `MutationRecord`, or array thereof. This means XPath predicates like `self::*[@data-automation-id="file-upload-successful"]` can run against a MutationRecord's `addedNodes`, enabling "detect when a specific element is added" without separately querying.

## h) React Controlled Input Handling

**Core technique** in `services/formFields/utils/index.ts:6-10`:
```ts
export const getReactProps = (element: HTMLElement): any => {
  for (const key in element) {
    if (key.startsWith('__reactProps')) return element[key]
  }
}
```
React 17+ attaches the internal props object on DOM nodes under `__reactProps$<random>`. Reading this **bypasses the "value setter" trick** (no `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')`). Instead the filler directly calls `props.onChange({target: input})` or `props.onBlur(...)` — whichever the field listens to for state updates.

**TextInput fill** (`workday/TextInput.ts:39-60`): (1) set `input.value = answer` directly, (2) invoke `reactProps.onChange({target: input})`, (3) invoke `reactProps.onBlur({target: input})`. The comment at line 28-38 explains WHY both: Workday has blur-only fields AND change-only fields; calling onBlur ensures client-side validation accepts the value; setting `input.value` FIRST prevents a race where onBlur fires but React reads the stale DOM value.

**Dropdown fill** (`workday/Dropdown.ts:115-143`): open dropdown, wait for `<li>`, XPath-search inside for `[${lowerText()}="${answer}"]/parent::li`, call `getReactProps(answerElement).onClick({preventDefault:()=>{}})`. `scrollBack()` wraps the whole thing to restore scroll position.

**DropdownSearchable fill** (`workday/DropdownSearchable.ts:150-195`): even cleverer — simulates Tab keydown via `getReactProps(inputElement).onKeyDown({key:'Tab', target:{value: answer}})`, which triggers Workday's typeahead selection without opening the dropdown visually. Falls back to clicking the first `promptOption` if multiple matches.

**`onBlur` handling**: yes — `TextInput.ts:55-57` calls both `onChange` and `onBlur`; `listenForChanges()` wires both `input` and `blur` events (line 12-13).

**This is the single most valuable component in the repo.**

## i) File Upload

**Two strategies depending on the target**:

1. **`workday/FileMulti.ts:102-122`** — calls `getReactProps(dropZone).onDrop(fakeEvent)` where `fakeEvent = {dataTransfer: {files: [file]}, preventDefault:()=>{}, stopPropagation:()=>{}}`. No real DragEvent needed because Workday binds its drop handler via React props.

2. **`shared/utils/fileUploadHelpers.ts:1-63` `dispatchFileDragEvent()`** — used by `greenhouse/File.ts:84`. Builds a **fake DataTransfer object** with the right prototype chain, constructs a `DragEvent`, uses `Object.setPrototypeOf(dragEvent, null); dragEvent.dataTransfer = dataTransfer; Object.setPrototypeOf(dragEvent, DragEvent.prototype)` to bypass the read-only `dataTransfer` descriptor, then `element.dispatchEvent(dragEvent)`. This is the **gold-standard DataTransfer workaround** and the highest-value single file in the repo.

3. **`greenhouseReact/File.ts:71-83`** — simpler: `getReactProps(fileInput).onChange({target: {files: [file]}})`. Works because Greenhouse's React file input has an `onChange` prop directly.

**File storage format** (`shared/utils/file.ts:1-47`): `LocalStorageFile = {name, size, type, body: base64, lastModified}`. `fileToLocalStorage()` uses `FileReader.readAsDataURL()`; `localStorageToFile()` decodes base64 with `atob`, builds `Uint8Array`, wraps in `Blob`, constructs `new File([blob], name, {type, lastModified})`.

## j) MutationObserver Usage

**Four distinct use sites**:

1. **Global discovery** (`inject.ts:21-28`) — body-wide `childList+subtree`, re-runs `RegisterInputs` on every mutation. Idempotent via the `job-app-filler` attribute guard.
2. **Per-field change tracking** — each `listenForChanges()` impl, e.g. `Dropdown.ts:40-44` uses `addCharacterMutationObserver` (watches `characterData` on the button element), `DropdownSearchable.ts:37-48` watches its `multiSelectContainer` for added/removed `selectedItemList` children, `FileMulti.ts:36-55` watches for added `file-upload-successful` or removed `file-upload-item`.
3. **`waitForElement`** (`getElements.ts:98-122`) — one-shot observer with timeout, used after actions like opening dropdowns.
4. **Section re-registration** (`greenhouse/Sections.ts:43-50`) — re-stamps `jaf-section` indices when sections are added/removed.

All observers are per-field or per-global; no leaks because they live with the FormField instance (or the `waitForElement` promise).

## k) Profile / Data Source

**`chrome.storage.local` via the content script**. The injected script can't access `chrome.*` APIs (different context), so it uses a **custom RPC over DOM CustomEvents**:

- `shared/utils/crossContextCommunication/client.ts` — `Client.send(methodName, data)` dispatches `CustomEvent(url, {requestId, methodName, data})`, awaits a `CustomEvent(requestId)` response. 5s timeout.
- `shared/utils/crossContextCommunication/server.ts` — `Server.register(method, handler)` listens for request events, dispatches response events.
- `contentScript.ts:9-29` registers `addAnswer`, `updateAnswer`, `getAnswer`, `deleteAnswer` — backed by `answers1010` store in `contentScript/utils/storage/Answers1010.ts`.

**Answer lookup key** = `{page, section, fieldType, fieldName}` (path, `types.ts:23-28`). Page = first `<h2>` text. Section = per-adapter (Workday h4, Greenhouse `jaf-section` attr). Answers are stored as lists (backup values for dropdowns with varying choices).

**No hardcoded profile / no resume parser / no AI**. Users save each answer by hand on first fill, extension remembers. Fundamentally different from our "push resume down to fields" model — we'll need to build the resume-to-answer-path mapping layer ourselves.

---

## Porting Instructions per Component

**`BaseFormInput`** (`baseFormInput.tsx`): drop into `@ebenezer-isaac/autofill-core/src/base-form-input.ts`. Strip React imports (`attachReactApp` becomes a no-op or DI-port `IWidgetMount`). Replace `contentScriptAPI.send()` with an injected `IAnswerStore` port. Replace `FieldPath` with our Zod schema. Keep `autoDiscover`, `isRegistered`, `triggerReactUpdate`, `uuid4` stamping.

**`getElements.ts` + `xpath.ts`**: copy **verbatim** to `autofill-core/src/dom/xpath.ts`. Zero dependencies. BSD notice in header.

**`fieldFillerQueue.ts`**: copy verbatim to `autofill-core/src/runtime/filler-queue.ts`. Singleton pattern is fine; we may want to make it non-singleton for multi-form pages — trivial refactor.

**`fileUploadHelpers.ts` (`dispatchFileDragEvent`)**: copy verbatim to `autofill-core/src/dom/drag-drop.ts`. This is the highest-leverage 60 LOC in the repo.

**`file.ts` (base64 <-> File)**: copy verbatim to `autofill-core/src/dom/file-serde.ts`.

**`utils/index.ts` (`getReactProps`, `fillReactTextInput`, `addCharacterMutationObserver`)**: copy verbatim to `autofill-core/src/react/react-internals.ts`. The 3 functions together are ~50 LOC and are THE trick for filling React forms.

**`workday/WorkdayBaseInput.ts` + `workday/xpaths.ts` + 12 field classes**: port to `@ebenezer-isaac/autofill-workday-adapter`. Strip MUI / AnswerValueDisplay imports. Replace `this.answer()` calls with `IAnswerResolver.resolve(path)`. The XPaths are the crown jewels — 100% reusable. React prop-invocation logic reusable.

**`greenhouseReact/*.ts`**: port to `@ebenezer-isaac/autofill-greenhouse-adapter`. Same treatment.

**`greenhouse/*.ts` (classic DOM)**: port as a separate `greenhouse-legacy` adapter. Lower priority unless we care about `boards.greenhouse.io` (older tenants).

**`contentScript/utils/storage/*`**: SKIP. We're backend-driven, not chrome.storage-driven.

**`crossContextCommunication/*`**: ADAPT. Same event-based RPC pattern, but our "server" is the background service worker + backend API, not a local answer store. Reuse the Client/Server envelope format (`requestId`, `methodName`, `data`, `ok`).

**`stringMatch.ts`**: copy verbatim to `autofill-core/src/match/string-match.ts`. Used by isFilled() checks.

**React app / MUI widgets / popups (`FieldWidget/*`, `MoreInfoPopup/*`, `App.tsx`)**: SKIP for MVP. We don't need per-field UI — we fill headlessly from a resume. If we later want a "review before submit" popup, revisit as INSPIRATION.

---

## Extraction Menu

### DIRECT FORK (copy verbatim, attribute BSD-3 notice in header)
| File | LOC | Reason |
|------|-----|--------|
| `shared/utils/getElements.ts` | 122 | XPath engine, zero deps |
| `shared/utils/fieldFillerQueue.ts` | 57 | Singleton async queue |
| `shared/utils/fileUploadHelpers.ts` | 63 | DataTransfer polyfill — gold |
| `shared/utils/file.ts` | 47 | Base64 <-> File |
| `shared/utils/stringMatch.ts` | 128 | Exact/contains/startsWith matchers |
| `shared/utils/async.ts`, `scroll.ts`, `xpath.ts`, `events.ts` | ~150 combined | Small utility bag |
| `inject/app/services/formFields/utils/index.ts` | 50 | getReactProps, fillReactTextInput |
| `inject/app/services/formFields/workday/xpaths.ts` | 76 | Workday XPath constants |
| `inject/app/services/formFields/greenhouseReact/xpaths.ts` | 54 | GH React XPath constants |
| `inject/app/services/formFields/greenhouse/xpaths.ts` | 54 | GH classic XPath constants |

**Subtotal: ~800 LOC direct fork.**

### ADAPT (extract algorithm, rewrite for our architecture)
| File | LOC | Reason |
|------|-----|--------|
| `inject/app/services/formFields/baseFormInput.tsx` | 204 | Strip React widget mount, replace RPC with DI port |
| `inject/app/services/formFields/workday/WorkdayBaseInput.ts` | 51 | Keep section XPath, strip React |
| `workday/TextInput.ts`, `Password.ts`, `TextArea.ts` | ~130 | Fill logic reusable |
| `workday/Dropdown.ts` | 145 | Dropdown open + XPath answer + onClick simulation |
| `workday/DropdownSearchable.ts` | 196 | Tab-keydown typeahead trick |
| `workday/FileMulti.ts` | 123 | Keep onDrop-via-reactProps pattern |
| `workday/Dates/*` (Year, MonthYear, MonthDayYear) | ~200 | Multi-input date handling |
| `workday/BooleanCheckbox`, `BooleanRadio`, `CheckboxesSingle` | ~200 | Checkbox/radio fill |
| `greenhouseReact/*` (12 files) | ~1200 | All 12 GH React field classes |
| `greenhouse/*` (classic, 13 files) | ~1150 | Lower-priority adapter |
| `greenhouse/Sections.ts` | 51 | Repeating section indexing |
| `shared/utils/crossContextCommunication/*` | ~100 | Envelope format reusable; transport rewritten |
| `inject/inject.ts` | 44 | Domain routing + global MutationObserver entry |

**Subtotal: ~3800 LOC adapt.**

### INSPIRATION ONLY (read but don't copy)
- `inject/app/App.tsx`, `FieldWidget/*`, `MoreInfoPopup/*` — per-field UI overlay. Informs a future "review-before-fill" UX but not MVP.
- `inject/app/hooks/useEditableAnswerState.ts`, `saveButtonClickHandlers.ts`, `answerValueInit.ts` — React hooks for edit/save. Not applicable headless.
- `contentScript/utils/storage/Answers1010.ts`, `DataStore.ts` — answer storage schema + migration logic. Our schema is Zod-defined backend-side.
- `README.md` architecture diagram (sandboxing section lines 37-52) — the two-context problem is the same; our solution differs (service worker + backend).

### SKIP (not relevant or not reusable)
- `popup/*` — extension popup UI (we'll design our own)
- `static/*` — manifest.json, icons (write our own)
- `background/background.ts` — minimal, our service worker is different
- `release.js`, `webpack.*.js`, `tsconfig.json` — our monorepo uses different tooling
- `inject/app/MoreInfoPopup/AnswerDisplay/*` — MUI components for in-page answer editor
- `shared/components/Logo.tsx`, `LogoTitleBar.tsx` — branded assets (license clause 3 forbids reuse of name anyway)
- `src/inject/app/services/contentScriptApi.ts` — specific to their storage schema
- `contentScript/utils/storage/migrateEducationSectionNames.ts` — schema migrations for their format

---

## Confidence

- **License (BSD-3 not MIT)**: 98% — directly read LICENSE.md line-by-line. `package.json` "ISC" claim is a lie, README is silent. The prompt's MIT assumption is WRONG — must correct upstream plan.
- **Architecture understanding**: 95% — read `baseFormInput.tsx`, `WorkdayBaseInput.ts`, `TextInput.ts`, `Dropdown.ts`, `DropdownSearchable.ts`, `FileMulti.ts`, `utils/index.ts`, `getElements.ts`, `fieldFillerQueue.ts`, `fileUploadHelpers.ts`, `inject.ts`, `contentScript.ts` fully. Scanned all other field classes via line counts and xpaths files.
- **Porting estimates**: 82% — LOC estimates based on `wc -l`, adapt-vs-direct split assumes our hex architecture accepts the same abstractions. Actual porting will reveal friction points (React widget coupling, `this.answer()` threading).
- **Greenhouse coverage dates**: 95% — direct from CHANGELOG.md lines 14-60.

**Overall: 88%**

**Key risk**: the license is stricter than assumed. We must write attribution notices on every forked file AND pick a product name unrelated to "Job App Filler"/"Berel Levy"/"Dovber Levy". Flag this to the plan orchestrator immediately.
