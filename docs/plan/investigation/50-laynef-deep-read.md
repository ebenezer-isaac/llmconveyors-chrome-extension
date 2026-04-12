# Agent 50 — laynef/AI-Job-Autofill Deep Read

## TL;DR Verdict

**`laynef/AI-Job-Autofill` does not exist.** GitHub returns 404. The only close match is `sinatooor/AI-Job-Autofill` (branded "Hired Always", Chrome Web Store ID `kedoofhdliinkiibdljbplolfnbhaiia`, no stars, no license file, 7.4 MB). I deep-read this as the closest available reference.

**It is NOT a per-ATS reference.** It is a single generic engine that discovers all form fields via CSS+ARIA selectors, heuristically classifies them from label/name/placeholder/aria text, and delegates anything hard to Gemini 2.5 Flash using a hard-coded API key. The 8-ATS claim is marketing: the only per-ATS code is `host_permissions`, iframe-detection patterns, and URL-to-company-name regexes. Zero hard-coded field selectors per platform.

**Porting value: LOW for selectors, MEDIUM for generic technique, HIGH for cautionary tale.** For Ashby specifically there is no better OSS reference — reverse engineering ourselves is still required.

---

## a) License

**Not confirmed MIT.** `README.md` says "This project is licensed under the MIT License" but there is **no LICENSE file in the repo root or anywhere in the tree**. `curl api.github.com/repos/sinatooor/AI-Job-Autofill` returns `"license": null`. README text alone is legally ambiguous — cannot safely fork without author clarification.

`laynef/AI-Job-Autofill` itself returns 404.

## b) Build System + Frameworks

- Chrome MV3 extension, vanilla JavaScript only. No TypeScript, no bundler, no transpile step.
- No `package.json` in repo root. Ad-hoc `tests/setup.js` + two hand-rolled test files (no framework assertions runner visible).
- `cloudbuild.yaml` exists for some GCP build but is irrelevant to extension source.
- Distribution is raw `.zip` files committed to repo (`hired-always-v3.15.zip` through `v3.18.zip`).

## c) Directory Tree

```
AI-Job-Autofill-sina/
├── manifest.json              (MV3, 8 ATS host_permissions)
├── popup.html                 (18 KB UI)
├── popup.js                   (4565 lines — the entire engine)
├── ats-config.js              (312 lines — JOB EXTRACTION only, not fill)
├── form-handler.js            (312 lines — popup's own save form, NOT target filling)
├── job-extractor.js           (351 lines — company/title scrape for tracker)
├── rating-manager.js          (250 lines — Chrome Web Store rating prompt)
├── tracker.{html,js,css}      (application tracker dashboard)
├── utils.js                   (280 lines)
├── tests/ {setup,test_job_extractor,test_utils}.js
├── hired-always-v3.{15..18}.zip
├── README.md, CHANGELOG.md, CODE_REVIEW.md, 8 other .md marketing docs
└── icons/, images/, website/
```

No `adapters/`, no `platforms/`, no `content-scripts/` directory. The extension has **no content_scripts registered in manifest.json**. Filling happens via `chrome.scripting.executeScript({function: autofillPage})` invoked from popup click.

## d) Per-ATS Coverage Audit

All 8 platforms receive identical treatment. The only per-ATS code outside `host_permissions` (manifest.json:11-20):

1. **iframe detection patterns** (`ats-config.js:18-67`, duplicated at `popup.js:658-665`) — 8 entries, one-line `iframe[src*="..."]` selectors used only to decide whether to open the form in a new tab.
2. **URL-to-company-name regexes** (`ats-config.js:133-174`, duplicated at `popup.js:829-852`) — 8 entries, regex + title-case transform. Pure company-name extraction for the tracker; not used for form filling.
3. **`isATSDomain` / `getATSPlatform` switch** (`ats-config.js:241-269`, duplicated at `popup.js:158-165`) — 8-way string-contains check, used only to skip iframe detection when already on an ATS.
4. **One Greenhouse-only company selector chain** (`popup.js:764-770`): `.company-name` → `[class*="app-title"]` → `div[class*="application--header"] h2`. For job-info extraction, not form filling.
5. **One passing comment** at `popup.js:3851` mentioning "React Select combobox (like Greenhouse's location field)" inside otherwise-generic React-select handling.

**Per-platform verdict:**

| ATS | File(s) | Platform-specific LOC | Verdict |
|---|---|---|---|
| Greenhouse | ats-config.js + popup.js | ~15 (3 company selectors + 1 iframe + 1 URL regex + 1 comment) | SHALLOW — URL/company extraction only, no form-fill selectors |
| Lever | ats-config.js + popup.js | ~3 (1 iframe + 1 URL regex + 1 domain check) | SHALLOW |
| Workday | ats-config.js + popup.js | ~3 | SHALLOW — notably missing despite Workday being the hardest ATS |
| Ashby | ats-config.js + popup.js | ~3 | SHALLOW |
| BambooHR | ats-config.js + popup.js | ~3 | SHALLOW |
| Workable | ats-config.js + popup.js | ~2 (iframe + domain check, no URL regex) | SHALLOW |
| Jobvite | ats-config.js + popup.js | ~3 | SHALLOW |
| SmartRecruiters | ats-config.js + popup.js | ~3 | SHALLOW |

**None are REAL.** None are AI-MEDIATED in the "send selector to Gemini per field" sense — the AI generates *content*, not selectors. The actual DOM traversal is one generic loop over `discoverFormElements()` (`popup.js:2531-2612`) which unions ~40 generic selectors (inputs, textarea, `[role=combobox]`, Material UI classes, `[class*="input"]`, `[aria-label]`, `[placeholder]`, Formik/RHF prefixes, etc.).

## e) Gemini Integration Surface

- Single function `getAIResponse(prompt, userData)` at `popup.js:2349-2393`.
- **Hard-coded API key in source**: `const apiKey = '<REDACTED-THIRD-PARTY-KEY>';` (`popup.js:2365`). README says users supply their own key; the code ignores that and ships a developer key. This is a leaked key and also means any fork carries the author's quota liability.
- Endpoint: `generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent`.
- Resume PDF/DOCX is sent as `inlineData` (base64) alongside the prompt — full document to Google on every call.
- **No fallback if Gemini is unavailable**: `getAIResponse` returns `""` on error and the caller just leaves the field empty. Hard-coded fields (firstName, email, phone, address, LinkedIn URL, demographic dropdowns) are filled **without** Gemini via direct classification; everything narrative (cover letter, work history JSON, "why are you interested", textarea free-text) is Gemini-dependent.
- Used for: work-history JSON extraction from resume, cover-letter generation, free-text answers, unclassified textarea fallback (`classifyFieldType` returns `type: 'unknownText'` → AI).

## f) Profile Data Model

Source: `chrome.storage.sync` via popup's own form in `form-handler.js:8-14`. Flat strings only:

```
firstName, lastName, email, phone, pronouns,
address, city, state, zipCode, country,
linkedinUrl, portfolioUrl, additionalInfo, coverLetter,
gender, hispanic, race, veteran, disability,
citizenship, sponsorship,
resume (base64 data URL), resumeFileName
```

No structured work-history/education — those are re-extracted from the resume PDF by Gemini on every autofill click. No skills list, no structured address parts beyond city/state/zip.

## g) React Input Filling Technique

`setNativeValue` at `popup.js:1107-1122`: the standard React trick — grab the HTMLInputElement prototype's `value` setter via `Object.getOwnPropertyDescriptor(prototype, 'value').set`, call it with `prototypeValueSetter.call(element, value)`, then dispatch `input` + `change` bubbling events. Identical pattern to berellevy's and to every other React autofill extension. Nothing novel.

`simulateClick` (`popup.js:1078-1104`) dispatches the full `pointerdown → mousedown → pointerup → mouseup → click` sequence plus focus — more thorough than typical and reasonably robust for custom React dropdowns.

React-select / Material Autocomplete handling (`selectReactSelectOption`, lines 1161-1597) is a 430-line generic fallback engine: strategies span aria-controls lookup → visible listbox via z-index → class-pattern dropdown → keyboard ArrowDown → type-to-filter with per-char input events. This is the one genuinely useful chunk of code in the repo — framework-agnostic dropdown selection. Worth studying as a reference, not copying outright.

## h) File Upload

`attachResumeFile` at `popup.js:1599-1633`. One path for all ATS:

1. Query `input[type="file"]` where `id.includes('resume'|'cv')` OR `accept` contains `pdf`/`.doc`.
2. Base64 → `Blob` → `File`, wrap in `DataTransfer`, assign `fileInput.files = dataTransfer.files`, dispatch `change` bubbling.

Standard DataTransfer trick, no per-ATS variation. Will silently fail on Workday (which uses drag-drop regions + virtualised custom uploaders) and likely on Ashby's styled upload button — but the code makes no attempt to detect or work around either.

---

## Final Verdict

**Primarily SHALLOW marketing.** The `sinatooor/AI-Job-Autofill` repo (and any hypothetical `laynef` fork) is a generic heuristic + Gemini wrapper that claims 8-ATS support because its manifest has 8 `host_permissions` entries and its README lists them. There is no per-ATS selector expertise to port.

**What is worth extracting** (all MEDIUM confidence without a LICENSE file — treat as reference, not copy-paste):

1. `selectReactSelectOption` strategy ladder at `popup.js:1161-1597` — generic dropdown handler spanning react-select, MUI, Ant, Formik, plain ARIA. Useful as a reference for our own generic fallback layer.
2. `setNativeValue` + full pointer event sequence (`popup.js:1078-1122`) — standard, already known, reaffirms the approach.
3. `discoverFormElements` union-of-selectors approach (`popup.js:2530-2612`) — a catalog of ~40 selectors worth keeping as a checklist of field patterns in the wild.
4. `classifyFieldType` heuristic (`popup.js:2163-2347`) — label/name/placeholder/aria text matching taxonomy. Reasonable starting ontology: firstName, lastName, email, phone, address, city, state, zip, country, linkedinUrl, portfolioUrl, pronouns, gender, hispanic, race, veteran, disability, citizenship, sponsorship, coverLetter, workHistory, education, startDate, referralSource, comment, unknownText.
5. `IFRAME_PATTERNS` constants (`ats-config.js:17-67`) — 8 exact iframe selectors are real and reusable: `iframe[id*="grnhse"], iframe[src*="greenhouse.io/embed/job_app"]`, `iframe[src*="jobs.lever.co"]`, `iframe[src*="myworkdayjobs.com"]`, `iframe[src*="jobs.ashbyhq.com"]`, `iframe[src*="bamboohr.com/jobs"]`, `iframe[src*="apply.workable.com"]`, `iframe[src*="jobs.jobvite.com"]`, `iframe[src*="jobs.smartrecruiters.com"]`. These are the one genuinely per-ATS artifact.
6. `URL_PATTERNS` regexes (`ats-config.js:133-174`) — 8 URL-to-company regexes, correct and reusable for detecting which ATS the user is on.
7. `manifest.json:11-20` host_permissions block — exact 8-ATS URL patterns, directly usable.

**Active warnings:**

- Do NOT copy the hard-coded Gemini API key at `popup.js:2365`. It is leaked, presumably rate-limited, and forking it puts quota liability on the original author.
- No LICENSE file → treat all snippets as reference-only until license is confirmed with upstream.
- Ashby specifically has NO better OSS selector reference here. Plan 100 should still budget reverse-engineering time for Ashby's DOM.

## Effort Estimate to Extract Anything Usable

- **iframe patterns + URL regexes + manifest host_permissions**: 30 min — trivial copy, re-derivable from scratch in similar time, so licensing ambiguity is not blocking.
- **classifyFieldType field ontology** as a checklist: 1 hour — use as validation against our own taxonomy; do not import source.
- **selectReactSelectOption reference study**: 2-3 hours — read, note strategies, implement our own TypeScript version with tests rather than porting JS.
- **Total useful reference time: half a day.** No actual code should be imported verbatim given the missing LICENSE.

**Net finding for Plan 100**: this repo does not eliminate any per-ATS reverse-engineering work. It confirms that a pure-generic approach can cover the "easy 60%" of fields across all 8 ATS if paired with an LLM for narrative text, and that the hard parts (Workday's custom widgets, Ashby's styled controls, file upload beyond DataTransfer) are genuinely unsolved in the OSS landscape.

---

Confidence: 92%
