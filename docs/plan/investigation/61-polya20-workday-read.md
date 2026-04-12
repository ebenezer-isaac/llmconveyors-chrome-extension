# 61 — polya20/Autofill-workday (Kumquat) Read

## Verdict: SKIP (anti-reference) — look once, learn what NOT to do, move on.

This is NOT the "best reference architecture" — the prior research note was wrong. It's a solo hobby project by one student (polya20, 2022), unmaintained, no tests, no license, hard-coded profile constants, jQuery pulled in but barely used, and a 549-line `workday.js` that is essentially one giant `if/setTimeout` pyramid. berellevy's codebase is dramatically more sophisticated.

---

## a) License
**NONE.** No `LICENSE` file, no header comments, no SPDX. Cannot legally copy code verbatim. Ideas/patterns only.

## b) Manifest Version
**MV3** (`manifest_version: 3`) — at least this is current. But `background` uses `service_worker: ["background.js", "config.js"]` as an array (invalid — service_worker must be a string in MV3), and `content.js` still calls `chrome.extension.getURL()` which is MV2-only. **Extension is broken on modern Chrome.** MV2→MV3 migration is incomplete.

## c) Directory Structure (flat, no folders)
```
background.js        170 LOC   service worker (partial)
config.js             31 LOC   hard-coded form field lists
content.js           108 LOC   entry point, switch dispatch
main.js              167 LOC   generic helpers (trytype, pollDOM, existsquery)
workday.js           549 LOC   Workday (bulk of the complexity)
taleo.js             230 LOC   Taleo
greenhouse.js         54 LOC   Greenhouse
lever.js              16 LOC   Lever (literally 16 lines)
successfactors.js     54 LOC   SuccessFactors (unused — not in manifest)
resumePopup.js       522 LOC   options page form
popup.js              27 LOC
jquery-3.5.1.js   10,872 LOC   bundled jQuery
```
Last commit: **2022-06-04**. Abandoned ~4 years.

## d) File-Per-ATS Architecture — NOT worth adopting

**There is no abstraction.** Each ATS file defines a single top-level function (`workday()`, `greenhouse()`, `lever()`, `taleo()`). They are not classes, not modules, not registered in a table. `content.js` glues them together with a raw `switch(system)` + four URL `.includes()` checks:

```js
if (window.location.toString().includes("myworkdayjobs")) createPopup("workday");
if (currenturl.includes('lever.co') && currenturl.includes('/apply')) createPopup("lever");
// ...
switch(system) { case "workday": return workday(); ... }
```

**Shared base:** `main.js` has a handful of DOM helpers (`existsquery`, `trytype`, `pollDOM`, `existsxpath`). That is the entire "shared layer." No base class, no interface, no adapter contract. Each ATS file reads a global `PROFILE` object and writes directly to `document`.

**Verdict on the split pattern itself:** one-file-per-ATS at the filesystem level is fine — but the split here is just concatenation (the README literally tells you to build by running `closure-compiler --js content.js main.js workday.js taleo.js greenhouse.js lever.js` into a single `contentc.js`). It is strictly inferior to our hex adapter pattern, which has a typed `IAtsAdapter` contract + DI + tests. **Our architecture is already a superset of this.**

## e) Workday Handling — the one place with extractable value

`workday.js` is a stream-of-consciousness handler for the multi-page Workday wizard. Key observations:

1. **Selector strategy: `data-automation-id` attributes + XPath `contains(text(), 'X')` fallbacks.** This is the same dual-strategy berellevy uses and it is the correct approach for Workday. Confirmed selectors worth stealing:
   - `input[data-automation-id="legalNameSection_firstName"]`, `_lastName`, `_primary`
   - `input[data-automation-id="addressSection_addressLine1"]`, `_city`, `_postalCode`
   - `input[data-automation-id="phone-number"]`, `email`, `password`, `userName`, `verifyPassword`, `confirmPassword`
   - `[data-automation-id="createAccountCheckbox"]`, `click_filter` (submit button)
   - `[data-automation-id="jobTitle"]`, `company`, `location`, `description`, `currentlyWorkHere`
   - `[data-automation-id="dateInputWrapper"]` (month/year inputs, indexed by position)
   - `[aria-label="Add Work Experience"]`, `"Add Another Work Experience"`, `"Add Education"`, `"Add Languages"`
   - `[data-automation-id="school"]`, `gpa`, `degree`, `language`, `languageProficiency-0`, `nativeLanguage`
   - `[data-automation-id="taskOrchCurrentItemLabel"]` (page title element used to detect wizard step)

2. **Multi-page wizard handling: PRIMITIVE.** No state machine, no observer-based detection. Instead:
   - `createPopup("workday")` is fired on initial page load
   - User must **click the autofill button again on every wizard page** — `content.js` listens for `chrome.runtime.onMessage` to re-trigger
   - A `pagechange()` helper uses `waitForXPath('//*[@data-automation-id="taskOrchCurrentItemLabel"]')` to re-open the popup after nav clicks, but it is hard-wired with a `nav` parameter (1/2/3) set per-form
   - The code has a commented-out `MutationObserver` experiment the author abandoned

   berellevy's approach (hex state machine + MutationObserver + explicit page detection) is **far better**. Do not copy this.

3. **Section traversal: NO.** polya20 does not walk Workday's section/sub-section tree. It just blindly fires selectors and hopes they exist on the current page. Work experience is hard-coded for `job_title1..3`, `employer1..3` — **max three jobs, three-deep nested `setTimeout` pyramid** to add each one. Education and Languages are similarly hard-coded to one instance each. This is brittle and cannot scale to richer profiles.

4. **Two "form" variants**: `form == "default"` (modern Workday, `data-automation-id`) vs `form == "custom"` (xpath `contains(text(), ...)` fallback). Interesting idea — a single adapter with a secondary strategy when automation-ids aren't present — but the switch is manually passed in, not detected. We can do this auto-detection better.

5. **React input trick**: `setReactInputValue()` dispatches a `blur` event after setting `.value`. Workday uses React, and this is the known workaround for React's synthetic event system not picking up programmatic `.value =` assignments. berellevy handles this more robustly via `nativeInputValueSetter`, which is the canonical fix. polya20's blur-only trick sometimes fails. **Prefer berellevy's approach.**

## f) Greenhouse & Lever

- **Greenhouse (54 LOC):** Trivial. `trytype("input[id='first_name']", ...)` x8. Selects `degree` and `major` via a `selectItem()` helper that dispatches raw `mousedown`/`mouseup`/`keyup-change` events against `#select2-drop` (Greenhouse uses Select2). This Select2 quirk is **worth knowing** — if we hit it on Greenhouse, we need the mousedown-then-keyup-change pattern, not a native change event. Everything else is one-liner selector mapping we already have.
- **Lever (16 LOC):** `document.getElementsByName("name")[0].value = ...` for 6 fields. Completely trivial. andrewmillercode's Lever handling is more thorough. Skip.

## g) Taleo (230 LOC)

Out of our scope (plan 100 targets Workday/Greenhouse/Lever/Ashby). But as a reference for the "legacy form-POST ATS" class: Taleo is HTML-form-based, so Taleo.js uses straight `document.getElementById()` with literal IDs (`requisitionApplyCandidate_basicProfilePresentation_textfield01`, etc.). It sets `.value` directly, no React dance needed. If we ever add legacy ATS support, Taleo's ID list here is grep-worthy — 230 LOC of `document.getElementById("...").value = PROFILE.x`. No logic, pure data.

## h) Code Quality
- **No tests. No types.** Pure hand-written JS.
- **jQuery bundled, barely used** — one `/// <reference path="jquery-3.5.1.js"/>` in workday.js, then the file uses vanilla `document.evaluate`/`querySelector` anyway.
- **Global `PROFILE` object**, global `isWorkdayload` and `taleoflag` mutation flags.
- **Deeply nested `setTimeout` callbacks** (5-deep in the work-experience block). Promises exist (`waitForXPath(...).then`) but are inconsistently used.
- **Large swaths of commented-out code** — failed MutationObserver attempt, failed `DOMContentLoaded` listener, failed major-dropdown autofill. Author was iterating live in prod.
- **Hard-coded `"California"` fallback** on state selection (line 179): `waitForXPath('//div[contains(text(), "California")]').then(clickonstate());` — this is a bug even in the author's own code.
- **`changeevent` referenced but never defined** in the file I can see — the script relies on globals defined elsewhere; after Closure Compiler concatenation this works, but as module code it would fail.
- **No error handling anywhere.** Every `document.querySelector` assumes truthy.

## i) Last Commit
**2022-06-04** (commit message: "manifest v3 2"). Abandoned. No issues, no PRs, fork of a student project (the "rpeng220/kaleidoscope" lineage mentioned in the scope was itself abandoned).

---

## Extraction Targets — What's Actually Useful

1. **Workday selector constants (section e.1 above).** Drop into `adapters/workday/selectors.ts` as a reference map. Cross-check against berellevy's list; the union is the most complete we can assemble from open-source.
2. **Greenhouse Select2 quirk** (mousedown → `#select2-drop > div > input` → keyup-change → ancestor::li mousedown/mouseup). Document as a `GreenhouseSelect2Strategy` if we hit degree/major dropdowns on Greenhouse.
3. **Dual-strategy idea** (`data-automation-id` primary + XPath-contains-text fallback) — we should auto-detect and fall back, not require a config flag.
4. **Awareness of what NOT to do**: no setTimeout pyramids, no global flags, no hard-coded profile indices (`job_title1..3`), no blur-only React value injection.

## Nothing Here berellevy Doesn't Already Have Better

- Multi-page wizard handling: berellevy > polya20 (state machine vs re-click-button)
- Section traversal: berellevy has it, polya20 does not
- React value injection: berellevy uses `nativeInputValueSetter`, polya20 uses blur-only
- Code quality: berellevy has types and structure, polya20 is callback soup
- Selector coverage: roughly comparable — taking the **union** is the win

## Recommendation

- **DO NOT** adopt the file-per-ATS "pattern" from this repo — it's not a pattern, it's just four unrelated functions. Our hex `IAtsAdapter` interface is strictly better.
- **DO** grep the workday.js selector strings and merge any novel `data-automation-id`s into our Workday adapter's selector map.
- **DO** note the Greenhouse Select2 keyup-change trick as a known quirk.
- **Cite this repo as an "anti-reference"** in the plan: it demonstrates exactly why we need the hex architecture (state, types, tests, adapters) instead of per-page scripts.

Confidence: 92%

Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\61-polya20-workday-read.md`
