# Agent 60 — josephajibodu/greenhouse-autofill-chrome-extension Deep Read

**Repo**: https://github.com/josephajibodu/greenhouse-autofill-chrome-extension
**Date cloned**: 2026-04-11
**Path**: `e:/scratch/joseph-greenhouse`

## Verdict: SKIP (with a single pattern worth salvaging)

Rough PoC. Vite powers only the popup; content/background scripts are hand-written vanilla JS sitting in `public/` and copied verbatim into the build. This is the *opposite* of what we want in a WXT/crxjs investigation. It is a useful negative example and a modest Greenhouse selector reference, but not a structural template.

---

## a) License
**None.** No `LICENSE` file in repo root. Default copyright applies — we cannot legally fork or copy substantial code without contacting the author. Selector lists and field-name dictionaries are likely fact-based and non-copyrightable; code structures are not.

## b) Build System
**Vanilla Vite 6 + @vitejs/plugin-react + Tailwind v4.** No crxjs, no WXT, no Plasmo. `vite.config.ts` is 8 lines, plugins-only, zero CRX awareness. The content script (`public/content.js`, 430 lines) and background service worker (`public/background.js`, 33 lines) are authored as plain JS and shipped by Vite's `public/` pass-through. They never touch the bundler, never get TypeScript, never get React, never get tree-shaking or HMR.

This is the crudest possible "React popup + static CS" split, and it is exactly what WXT and crxjs exist to improve upon. As a **fallback reference** for crxjs adoption: worthless. It does not demonstrate crxjs at all.

## c) Folder Structure
```
/
  index.html             (popup entry, Vite-built)
  vite.config.ts
  tsconfig.{json,app,node}.json
  eslint.config.js
  public/
    manifest.json        (MV3, hand-authored)
    background.js        (33 LOC vanilla)
    content.js           (430 LOC vanilla)
    candidate.json       (hardcoded sample profile, Jane Doe)
    resume.pdf           (sample PDF, committed)
    icon.png
  src/
    main.tsx             (React 19 root)
    App.tsx              (55 LOC, single button popup)
    index.css
    assets/react.svg
    vite-env.d.ts
```
No `entrypoints/`, no `content-scripts/` folder, no selectors file, no types shared between popup and CS. Zero barrel exports.

## d) React Usage
**Popup only.** `src/main.tsx` does `createRoot(document.getElementById('root')!).render(<App />)`. No Shadow DOM mount, no content-script React injection, no `createRoot` inside CS. `App.tsx` is one stateful button that fires `chrome.runtime.sendMessage({ action: "startAutofill" })`. That is the entire React surface area.

## e) TypeScript Config
Strict mode on, `moduleResolution: bundler`, `jsx: react-jsx`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports` — a clean copy of the standard Vite React TS template. **`@types/chrome ^0.0.313`** is installed but only used in `App.tsx` (`chrome.runtime.sendMessage`). Content and background scripts are `.js`, not `.ts`, and receive zero type coverage. `tsconfig.app.json` `"include": ["src"]` — `public/` is invisible to the typechecker by design.

## f) Greenhouse-Specific Code (content.js)
Lives entirely in one 430-line file. Architecture:

1. **Form detection**: `isGreenhouseForm()` checks `form#application-form` OR `.application--form`. Two selectors, both legacy Greenhouse markup. Does not cover modern `job-boards.greenhouse.io` React-rendered forms, despite the manifest matching that host.
2. **Field discovery strategy** (three-tier fallback): by `id` → by `[name="..."]` → by `[placeholder*="..."]` → by `<label>` text scan. This is actually reasonable and mirrors berellevy's approach.
3. **Field dictionary** (`fillBasicInfo`): `firstName / lastName / email / phone / linkedin / website / gender / city` — each mapped to 2-4 likely DOM names. Worth pulling as a seed list:
   - `first_name, firstName, given-name, first-name`
   - `last_name, lastName, family-name, last-name`
   - `email, email_address, emailAddress`
   - `phone, phone_number, phoneNumber, mobile_phone`
   - `linkedin, linkedinUrl, linkedin_url`
   - `website, personal_website, portfolio`
4. **Repeating sections**: education (`.education--container`) and experience (`.experience--container`) each scan for an "Add another" button by textContent, click it, then `setTimeout(500)` and fill. Indexed fields follow a `fieldname--N` convention.
5. **Input filling** (`fillInputField`): branches by tagName/inputType. For text/email/tel/url/hidden → assigns `.value` and dispatches `input` and `change` bubbling events. Radios iterate group; selects do exact-then-partial option match. **No React controlled-input handling** — no native setter override, no `_valueTracker` nulling. This is the critical flaw for modern Greenhouse (which is React-based): values set via `input.value = x` are reverted by React reconciliation on the next render. The 1s delay in `autofillWithDelay` suggests the author hit this and worked around it with prayer rather than technique.
6. **File upload**: fetches `chrome.runtime.getURL("resume.pdf")`, wraps in `File`, uses `DataTransfer` to assign `input.files`. Standard pattern. Will null-deref if the input is missing (`resumeInput.scrollIntoView` runs *before* the `if (resumeInput)` guard — bug at line 404).

## g) Messaging Pattern
Popup → `chrome.runtime.sendMessage({action:'startAutofill'})` → background listens → `chrome.tabs.sendMessage(activeTabId, ...)` → content script listens, does work, calls `sendResponse(result)`. Background acts as a blind forwarder and adds nothing. Could be eliminated entirely — popup could message the active tab directly. Both listeners return `true` to keep the channel open. No typed message contract, no discriminated union, no shared types package.

## h) Storage
**None used.** `storage` permission is declared in the manifest but the code never calls `chrome.storage.local` or `chrome.storage.sync`. Profile data is hardcoded in `public/candidate.json` and shipped with the extension. There is no UI for editing it.

## i) Manifest
MV3. Permissions: `activeTab`, `storage` (unused). Host matches: `*://*.greenhouse.io/*` and `*://*.job-boards.greenhouse.io/*`. Background: `background.js` service worker. Action: `index.html` popup. Web accessible resources: `candidate.json`, `resume.pdf` to `<all_urls>` — sample data shipped publicly.

## j) Code Quality
Rough proof-of-concept. Red flags:
- Resume-upload null deref bug (line 404).
- No React-controlled-input technique despite targeting a React-based site.
- Hardcoded candidate data, zero UI for editing.
- Background worker is a useless middleman.
- Timing via `setTimeout(500)` and `delay(1000)` — race-condition roulette.
- No tests, no types on CS, no error boundaries, no Zod.
- package name in `package.json` is `"lever-autofill"` — copy-paste residue from a prior project.

## k) Activity / Signal
No README badges, no stars visible in cloned metadata, no CI, no releases, no tags, single-contributor exploratory repo. Treat as a solo weekend project.

---

## Extraction Targets

| Target | Worth pulling? |
|---|---|
| Vite+crxjs fallback setup | **No** — repo doesn't use crxjs at all |
| WXT migration hints | **No** — no WXT present |
| React mounting in content script | **No** — not attempted |
| Greenhouse selector list | **Partial** — 8 basic-info field-name arrays are decent seed data (see section f). Re-derive independently to avoid license ambiguity. |
| `.education--container` / `.application--form` container selectors | **Yes, as hints** — cheap to re-verify against live Greenhouse DOM |
| tsconfig/eslint scaffolding | **No** — identical to Vite template; WXT generates its own |
| Repeating-section "Add another" button scan by textContent | **Yes, pattern only** — useful idea, re-implement with proper MutationObserver instead of setTimeout |
| DataTransfer file upload technique | **Yes, pattern only** — standard, re-implement in TS |

## Comparison to berellevy (agent assumption)
berellevy's repo is expected to cover both Lever and Greenhouse with more mature selectors and almost certainly handles React controlled inputs (native setter override). This repo does not. **berellevy is the better Greenhouse selector reference.** Joseph's repo only wins on "tiny enough to read in one sitting."

## Structural recommendation
WXT remains the primary choice. If WXT is rejected, the crxjs fallback investigation must look elsewhere — this repo is not a crxjs example. Do **not** fork. Pull the field-name seed list and container-class hints as independent facts, verify against live Greenhouse DOM, and discard the rest.

Confidence: 94%

filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\60-josephajibodu-deep-read.md`
