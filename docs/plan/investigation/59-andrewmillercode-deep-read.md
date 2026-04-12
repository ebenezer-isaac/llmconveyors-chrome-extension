# Agent 59 - andrewmillercode/Autofill-Jobs Deep Read

**Repo:** https://github.com/andrewmillercode/Autofill-Jobs
**Cloned:** `e:/scratch/Autofill-Jobs` (depth 1)
**Status per README:** "This project is not actively maintained at the moment."
**Stack:** Vue 3 + TypeScript + Vite, Manifest V3, pure JS content scripts (not bundled)
**Total code:** 34 files, content scripts ~839 LOC total (autofill 182, utils 265, workday 392)

---

## a) License: MIT CONFIRMED

`e:/scratch/Autofill-Jobs/LICENSE` line 1-3: `MIT License / Copyright (c) 2025 Andrew Miller`.
Safe to fork with attribution.

---

## b) Build System

`e:/scratch/Autofill-Jobs/src/package.json` - Vite 6 + `@vitejs/plugin-vue` (NOT Vue CLI / Webpack). TypeScript 5.6, `vue-tsc` for type-check. Vue 3.5, vue-router 4.5. Dev deps include `@types/chrome`. Scripts: `dev`, `build`, `type-check`, `watch` - build runs type-check in parallel with `vite build`. This is a vanilla Vite scaffold. Minimal, modern, clean.

Notable: the Vue app (`vue_src/`) is only the **popup UI** (data entry for resume profile). Content scripts in `src/public/contentScripts/*.js` are hand-written plain JS, loaded as ES modules via MV3 `content_scripts` with `world: ISOLATED`, `run_at: document_end`.

---

## c) Directory Structure

```
Autofill-Jobs/
├── LICENSE (MIT)
├── README.md
└── src/
    ├── package.json, vite.config.ts, tsconfig*.json
    ├── index.html (popup entry)
    ├── public/
    │   ├── manifest.json            <- MV3, matches 6 hostname patterns
    │   ├── icons/{16,48,128}.png
    │   └── contentScripts/
    │       ├── utils.js             <- fields[] field-map + shared helpers
    │       ├── workday.js           <- Workday-only logic
    │       └── autofill.js          <- Greenhouse + Lever + Dover entrypoint
    └── vue_src/
        ├── App.vue, main.ts, assets/main.css
        ├── components/ (8 .vue - InputField, GridDataField, etc.)
        └── composables/ (5 .ts - ResumeDetails, WorkExperience, Skills, Privacy, Explanation)
```

**Key finding:** there are NOT separate Lever/Greenhouse/Dover adapter files. All three share ONE generic filler in `autofill.js` driven by the platform-keyed map in `utils.js`. Only Workday is isolated.

---

## d) Lever Adapter (in detail)

**File path:** `e:/scratch/Autofill-Jobs/src/public/contentScripts/autofill.js` (182 LOC) - no Lever-specific file.

**URL match:** `https://jobs.lever.co/*` (manifest.json line 20).

**Form detection:** Lever takes a special fallback branch (`autofill.js:101-104`):
```js
if (window.location.hostname.includes("lever")) {
  let form = document.querySelector("#application-form, #application_form");
  if (form) autofill(form);
}
```
Plus the shared `applicationFormQuery = "#application-form, #application_form, #applicationform"` (line 29) is run inside a `MutationObserver` (line 73) that awaits dynamic form injection.

**Selector strategy:** generic attribute-fuzzy-match in `inputQuery()` (`autofill.js:32-58`). For each `<input>` in the form, it collects:
- `id`, `name`, `placeholder`
- `aria-label`, `aria-labelledby`, `aria-describedby`
- `data-qa`

lowercased and trimmed, then checks `attr.includes(normalizedParam)` for a match. This is a **substring contains**, not equality - loose and forgiving. No XPath anywhere in the codebase.

**Field map (`utils.js:39-63`):** the key is the substring-matched HTML `name` attribute Lever's posted form uses, mapped to the profile key:
```js
lever: {
  resume:   "Resume",
  name:     "Full Name",
  email:    "Email",
  phone:    "Phone",
  location: "Location (City)",
  org: "Current Employer", company: "Current Employer", employer: "Current Employer",
  "urls[LinkedIn]": "LinkedIn",  "urls[Linkedin]": "LinkedIn",
  "urls[GitHub]":   "Github",
  "urls[X]":        "Twitter/X", "urls[Twitter]":   "Twitter/X",
  "urls[Portfolio]":"Website",   "urls[Link to portfolio]": "Website",
  website: "Website", portfolio: "Website",
  "eeo[gender]":    "Gender",
  "eeo[race]":      "Race",
  "eeo[veteran]":   "Veteran Status",
  "eeo[disability]":"Disability Status",
  "eeo[disabilitySignature]":     "Full Name",
  "eeo[disabilitySignatureDate]": "Current Date",
}
```
This is the most valuable artifact in the repo. Lever's form uses `urls[Provider]` and `eeo[field]` nested naming - captured here. Multiple aliases handle case variance (`LinkedIn` vs `Linkedin`).

**Value write path:** `setNativeValue(el, value)` in `utils.js:238-260`. For text: sets `el.value`, then `setAttribute("value", value)`, dispatches `change` + `input` events (bubbles). For `<select>`: iterates children, picks first option whose `value.toLowerCase().includes(target.toLowerCase())`. For checkbox/radio: programmatic `.click()`. Has a **bug** - line 253 references `previousValue` which is never defined in scope (dead branch since `_valueTracker` is React-specific anyway).

**Resume upload (`autofill.js:120-153`):** decodes base64 resume from `chrome.storage.local` via `base64ToArrayBuffer` into a `File`, uses `DataTransfer` to assign to `el.files`, dispatches change. Lever selector: `input[id="resume-upload-input"]`. Fallback for old forms: `input[type="file"]`.

**Form submission:** NOT automated. Extension fills fields and stops. Resume upload listener calls `event.preventDefault()` on the form's submit (line 135) to block accidental submission during fill.

**Edge cases:**
- **Custom questions:** not handled. The generic `inputQuery` only matches on known field keys.
- **Dropdowns:** detects react-select via `inputElement.closest(".select__control--outside-label")` (line 168) - this is a **Greenhouse** react-select class, NOT Lever. Lever uses native `<select>` handled by `setNativeValue`'s `HTMLSelectElement` branch.
- **Location/Gender:** longer delay (`delays.long = 600ms`) to let async dropdowns settle.

---

## e) Greenhouse Adapter vs berellevy

Same file as Lever - differs only in the `fields.greenhouse` map (`utils.js:9-38`) and the resume selector `input[id="resume"]` (autofill.js:125). Greenhouse field keys are flat snake_case: `first_name`, `last_name`, `email`, `phone`, `candidate-location`, `school`, `degree`, `discipline`, `start-month`/`start-year`, `gender`, `hispanic_ethnicity`, `race`, `veteran_status`, `disability`. The one react-select oddity: `"react-select-race-placeholder race-error": "Race"` (line 35) - targets the multi-class id Greenhouse emits for the race dropdown.

**Comparison vs berellevy:** this one is much simpler - ~20 field-names in a flat map plus a fuzzy substring-matcher vs berellevy's more structured approach. **berellevy is almost certainly the cleaner reference for Greenhouse** since it was purpose-built. The only thing andrewmiller adds for Greenhouse is the two extra aria-attribute probes (`aria-labelledby`, `aria-describedby`, `data-qa`) in `inputQuery` - worth copying into berellevy's matcher if missing.

---

## f) Workday Adapter vs berellevy

`workday.js` is 392 LOC - **twice** the size of the entire other-platform logic. Uses `data-automation-id` / `data-automation-label` selectors (`workdayQuery` line 11), progress-bar-driven stage detection via MutationObserver (`getCurStageWorkday` line 1-9), per-stage field sub-maps (`utils.js:74-111` nest under stage names: "My Information", "My Experience", "Voluntary Disclosures", "Self Identify"), and has helpers `handleResume`, `handleSkills`, `handleWorkExperience`, `handleInputElement`, `handleDropdownElement`.

**Verdict:** berellevy's Workday adapter is almost certainly more sophisticated (he specialises in Workday). This file is a **secondary reference only** - useful for cross-checking the stage-name enumeration and the `data-automation-id` selector discipline, not for direct fork. The stage map pattern is nice but berellevy likely already has it.

---

## g) Dover Adapter (brief)

Same generic engine. Field map `utils.js:64-73` is trivial: `firstName`, `lastName`, `email`, `phone`, `linkedinUrl`, `github`, `phoneNumber`, `resume`. Resume selector: `input[type="file"][accept=".pdf"], input[type="file"][accept="application/pdf"]` (autofill.js:127-128). Dover isn't in our target list; skip.

---

## h) Profile / Data Source

- **Profile fields** - `chrome.storage.sync` via `getStorageDataSync()` (`utils.js:227-237`).
- **Resume file** - `chrome.storage.local` via `getStorageDataLocal()` (`utils.js:213-223`), stored as base64 string + `Resume_name` sibling key.
- **Profile UI** - Vue 3 popup in `vue_src/App.vue` with composables `ResumeDetails.ts`, `WorkExperience.ts`, `Skills.ts` (not read - assumed reactive ref wrappers around the `chrome.storage.sync.get`/`set` calls).

Chrome `storage.sync` has an 8KB-per-item / 100KB-total quota, which is why resume bytes are split to `.local` (5MB quota). Our extension should do the same split.

---

## i) Extraction Targets For Us

### DIRECT FORK (copy with MIT attribution)
1. **`utils.js` - the `fields.lever` map (`utils.js:39-63`)**. This is 25 lines of hard-won Lever field-name knowledge (`urls[LinkedIn]`, `eeo[gender]`, etc.). Copy verbatim into our Lever adapter's selector-constant file. Attribution: `// Field names derived from andrewmillercode/Autofill-Jobs (MIT)`.
2. **`base64ToArrayBuffer` + resume `DataTransfer` upload pattern (`autofill.js:139-148`)** - standard File-upload trick for Chrome extensions, but this form is compact and proven.
3. **`setNativeValue` change+input event dispatch pattern (`utils.js:238-260`)** after fixing the `previousValue` undefined bug - this is the canonical React-aware form-fill pattern.

### Selector constants worth pulling
- Resume selectors per platform (`autofill.js:124-129`): Greenhouse `#resume`, Lever `#resume-upload-input`, Dover file accept variants.
- `applicationFormQuery` = `"#application-form, #application_form, #applicationform"` - Lever/Greenhouse form-root triad.
- `.select__control--outside-label` - react-select wrapper class used by Greenhouse.

### Algorithms to understand but REWRITE
- **Generic fuzzy `inputQuery`** (`autofill.js:32-58`): the 7-attribute probe list (`id, name, placeholder, aria-label, aria-labelledby, aria-describedby, data-qa`) is useful but substring-contains is too loose (causes `email` to match `email_work` unpredictably). Rewrite with exact-match first, substring second, and a priority order per attribute.
- **MutationObserver-based form detection** (`autofill.js:71-105`) - sound idea, but bug: observer fires once per mutation batch and disconnects after first match, which misses SPA nav events. Rewrite with proper `urlchange` listener.
- **Workday stage-map pattern** - the nested `{stage: {field: profileKey}}` shape in `utils.js:74-111` is good, adopt the shape but author our own selectors.

### SKIP
- `autofill.js:163` bug: `if (param === "Gender" || "Location (City)")` is always true (constant truthy). Do NOT copy.
- `utils.js:253` `previousValue` undefined - obvious bug, fix on import.
- `workday.js` as a whole - defer to berellevy.

---

## j) Verdict: GO (narrow scope)

**This repo is a meaningful reference for Lever specifically.** berellevy covers Greenhouse + Workday and has nothing on Lever. andrewmillercode's `fields.lever` map plus the `urls[X]` / `eeo[X]` naming conventions are the single highest-value artifact - 25 lines that would otherwise take a day of live-site inspection to derive.

**Recommendation:**
- **Fork the Lever field map verbatim** (with MIT attribution header) into our Lever adapter constants file.
- **Copy resume-upload pattern and setNativeValue** (fixed) into shared utils.
- **Do NOT fork the engine** - `autofill.js` is buggy (always-true conditional, undefined variable, loose substring match, SPA-unaware observer). Rewrite clean.
- **Ignore Workday/Greenhouse** here - berellevy wins both.
- **Ignore Dover** - not in scope.

Net extractable value: ~60 lines of constants + 2 small functions = 1-2 hours of porting work, saves ~1 day of Lever field-discovery.

---

**Files cited:**
- `e:/scratch/Autofill-Jobs/LICENSE`
- `e:/scratch/Autofill-Jobs/README.md`
- `e:/scratch/Autofill-Jobs/src/package.json`
- `e:/scratch/Autofill-Jobs/src/public/manifest.json`
- `e:/scratch/Autofill-Jobs/src/public/contentScripts/autofill.js` (lines 29, 32-58, 71-105, 107-181, 124-153, 163, 168)
- `e:/scratch/Autofill-Jobs/src/public/contentScripts/utils.js` (lines 8-112, 39-63, 213-237, 238-260, 261-265)
- `e:/scratch/Autofill-Jobs/src/public/contentScripts/workday.js` (lines 1-120, structure to 392)

Word count: ~1480.
