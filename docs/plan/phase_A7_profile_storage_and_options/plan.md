# Phase A7 -- Profile Storage Adapter + Options Page UI (v2.1 rewrite)

**Plan**: 100 -- Chrome Extension MVP
**Phase**: A7
**Repo**: `e:/llmconveyors-chrome-extension` (absolute working dir per D4; remote `ebenezer-isaac/llmconveyors-chrome-extension`)
**Day**: 4 (2026-04-15)
**Depends on**: A1 (WXT scaffold + options entrypoint + `jsdom` devDep), A5 (background messaging, ProtocolMap owner per D2, `createLogger` per D11, `NotImplementedError` stub for `PROFILE_*`), B1 (`ats-autofill-engine@0.1.0-alpha.1` reserved and the `./profile` sub-entry is a real published entry per keystone §4), B2 (Profile schema, `ProfileSchema`, `createEmptyProfile`, `updatedAtMs` passthrough metadata)
**Blocks**: A8 (content-script reads the B2 Profile shape via a rewritten `profile-reader.ts` -- A8 does its own reader rewrite, A7 only writes), A10 (popup reads profile for header strip)
**Estimated effort**: 4-5 hours (React + Zod + tests)
**Confidence**: 9/10 -- every shape is nailed down in keystone §1.1 / §1.2 / §2.12; the one residual risk is `jsdom` vs `node` vitest project matrix tuning for the first React test run in this repo

**Scope declaration (per `.claude/rules/proposal-requirements.md`)**:
- Files touched: 29 CREATE + 5 MODIFY + 3 DELETE = 37 files
- Lines changed: ~2,850 LoC added, ~320 LoC removed
- Confidence: 9/10

**Decisions applied in this rewrite**:
- **D3** -- A7 is the writer of the full B2 Profile shape at `chrome.storage.local['llmc.profile.v1']`. A8's reader consumes nested `basics.*` + `profileVersion: '1.0'` + `updatedAtMs: number` via `ProfileSchema.safeParse()`. A7 does NOT patch A8.
- **D4** -- Working directory is `e:/llmconveyors-chrome-extension`. All paths in this plan are relative to that root unless explicitly marked absolute.
- **D10** -- Stale React state fixed via composite `key={`${profile.profileVersion}-${profile.updatedAtMs}`}` force remount on every section; `updatedAtMs` stamped by `writeProfile` on every persist.
- **D11** -- Zero `console.*` in extension source. All logging routes through `createLogger('profile-adapter')`, `createLogger('profile-handlers')`, `createLogger('options-app')` from `src/background/log.ts` (owned by A5).
- **D14** -- Five anti-drift gates (forbidden-token grep, type-level protocol contract test, exports-map resolution test, `.contract.json` fingerprint, Zod round-trip fuzz) are wired into the phase acceptance section.
- **D14.4** -- A7 writes `src/background/profile/blueprint.contract.ts` and the CI walker reads it.
- **D15** -- Zero em-dashes (U+2014) in any file this phase touches. ASCII hyphen or double-hyphen only. Pre-commit hook enforces it.
- **D20** -- Storage adapter, handlers, and React hook all take a `Deps` object at construction (`{ readStorage, writeStorage, logger, now }`). Tests wire fakes; production wires real `browser.storage.local`, `createLogger`, `Date.now`.
- **D21** -- Every `writeProfile()` runs `ProfileSchema.parse(profile)` as the last line of defense before `browser.storage.local.set()`. Every `readProfile()` runs `ProfileSchema.safeParse(raw)` before returning.
- **D19** -- Adversarial test categories 1-6 enumerated in §7.4.

**Contract surface delivered by this phase** (writes the canonical B2 shape):

```ts
// shape persisted at chrome.storage.local['llmc.profile.v1']:
{
  profileVersion: '1.0',
  updatedAtMs: 1744848000000,
  basics: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    name: 'Ada Lovelace',
    preferredName: undefined,
    pronouns: undefined,
    email: 'ada@example.com',
    phone: '5551234567',
    phonePrefix: '+1',
    dateOfBirth: undefined,
    url: undefined,
    summary: undefined,
    label: undefined,
    location: { address: '', city: 'London', region: '', countryCode: 'GB', postalCode: '' },
    profiles: [{ network: 'LinkedIn', username: 'ada', url: 'https://linkedin.com/in/ada' }],
  },
  jobPreferences: {
    workAuthorization: [
      { region: 'US', authorized: false, requiresVisa: false, requiresSponsorship: false, legallyAllowed: false },
      { region: 'UK', authorized: true,  requiresVisa: false, requiresSponsorship: false, legallyAllowed: true  },
      { region: 'EU', authorized: false, requiresVisa: false, requiresSponsorship: false, legallyAllowed: false },
      { region: 'Canada', authorized: false, requiresVisa: false, requiresSponsorship: false, legallyAllowed: false },
    ],
    salaryExpectation: { min: 0, max: 0, currency: 'USD', period: 'year' },
    availabilityDate: '',
    willingToRelocate: false,
    remotePreference: 'any',
    willingToCompleteAssessments: false,
    willingToUndergoDrugTests: false,
    willingToUndergoBackgroundChecks: false,
  },
  work: [], education: [], skills: [], languages: [], certificates: [],
  projects: [], volunteer: [], awards: [], publications: [], references: [],
  demographics: { gender: undefined, race: undefined, veteranStatus: undefined, disabilityStatus: undefined },
  consents: { privacyPolicy: false, marketing: false, allowEeoAutofill: false, allowDobAutofill: false },
  documents: { resume: undefined, coverLetter: undefined },
  customAnswers: {},
}
```

A8's `profile-reader.ts` consumes this shape verbatim via `ProfileSchema.safeParse()` and reads `basics.firstName`, `basics.lastName`, `basics.email`, `basics.phone`, `basics.location.countryCode`, etc. A7 does NOT mutate A8.

---

## 1. Goal

Replace the `NotImplementedError`-stub handlers that A5 leaves behind for `PROFILE_GET`, `PROFILE_UPDATE`, and `PROFILE_UPLOAD_JSON_RESUME` with real implementations that read/write the full B2 `Profile` shape to `chrome.storage.local['llmc.profile.v1']`. Ship a React options page where the user can:

1. Upload a JSON Resume (`.json`) file; the file is parsed, Zod-validated through `ProfileSchema`, field-level merged with the existing profile via `mergeJsonResume()`, validated again, and persisted. Success or per-field errors surfaced as toasts.
2. Fill inline overrides for every ATS-extension field the engine cares about:
   - **Basics**: firstName, lastName, name (read-only derived), preferredName, pronouns, email, phone, phonePrefix, dateOfBirth (gated), url, summary, label, plus the 5 location fields.
   - **Legal authorization**: 4 jurisdictions (US, UK, EU, Canada) x 4 flags (authorized, requiresVisa, requiresSponsorship, legallyAllowed) = 16 checkboxes with `data-testid` per cell.
   - **Job preferences**: salary expectation (min, max, currency, period), availability date, willingToRelocate, remotePreference, willingToCompleteAssessments, willingToUndergoDrugTests, willingToUndergoBackgroundChecks.
   - **Demographics** (EEO, opt-in, hidden by default): gender, race, veteranStatus, disabilityStatus. Section is gated on `consents.allowEeoAutofill`.
   - **Consents**: privacyPolicy, marketing, allowEeoAutofill, allowDobAutofill. The `allowDobAutofill` toggle gates the visibility of the Basics DOB input.
3. Save, clear (with confirmation modal), and sign out (preserves profile, only clears `storage.session` tokens).

This phase is the single source of truth for "how the user enters data into the extension" until v1.1. Decision memo §2.12 (D8=b) locks us to upload-plus-inline-overrides; there is NO full work/education/skills editor in V1. Backend `GET /resume/master` is NOT called.

---

## 2. Scope

### 2.1 In scope

- Full-fidelity `Profile` storage adapter with DI (D20): `readProfile`, `writeProfile`, `updateProfile`, `clearProfile`, plus an internal `stampUpdatedAtMs()` helper.
- Zod validation on every read AND every write (D21). `writeProfile` calls `ProfileSchema.parse()` as the last line of defense.
- Three real message handlers that replace A5's `NotImplementedError` stubs: `PROFILE_GET`, `PROFILE_UPDATE`, `PROFILE_UPLOAD_JSON_RESUME`. A7 does NOT touch `src/background/messaging/protocol.ts` (A5 owns the keys per D2); A7 edits ONLY `src/background/messaging/handlers.ts` to replace the three stub entries with real impls imported from `src/background/profile/handlers.ts`.
- JSON Resume merge algorithm (`mergeJsonResume`) with the corrected name-split fallback: per-half replace. If existing `firstName` is set but `lastName` empty, and the uploaded `basics.name` is present, split the uploaded name and replace ONLY `lastName`. Do NOT touch `firstName`.
- React options page root (`entrypoints/options/App.tsx`) composed of 5 controlled-from-props sections and 1 dropzone, with the composite `key` remount pattern per D10.
- Controlled-from-props sections: `BasicsSection`, `LegalAuthSection`, `PreferencesSection`, `DemographicsSection`, `ConsentSection`.
- `JsonResumeDropzone` with drag-drop + `<input type="file">` fallback + 10 MB file size gate + `application/json` MIME check.
- Sign-out button wired to A6's `AUTH_SIGN_OUT` (A7 does not implement sign-out itself; it just dispatches the existing message).
- Clear-profile button with an `aria-modal="true"` focus-trapped confirmation modal.
- `blueprint.contract.ts` fingerprint for `src/background/profile/**`.
- `scripts/rollback-phase-A7.sh` rollback script per D23.
- Vitest + `@testing-library/react` coverage for the adapter, handlers, merge, and every section.

### 2.2 Out of scope

- Backend master-resume sync (`GET /resume/master`, `PUT /resume/master`) -- deferred to v1.1 per decision memo §2.12.
- Profile versioning UI (showing version history, rolling back) -- v1.1.
- Importing from LinkedIn or other profile sources -- v2+.
- Connecting to an existing llmconveyors account from the options page (sign-in lives in the popup, A10 handles it).
- Binary PDF-to-`documents.resume` upload. The engine keeps resume bytes behind an opaque `ResumeHandle`; storing the binary is not required for V1 POC. The options page surfaces a read-only status line ("Resume attached via last upload: n/a") until v1.1.
- Full JSON-Resume-compliant work/education/skills editor -- user uploads JSON Resume for those fields.
- Tailwind design system tokens beyond the default v4 palette (A10's popup introduces its own tokens).
- Analytics / telemetry on option-page interactions.
- `src/background/messaging/protocol.ts` edits (A5 owns it per D2; the `PROFILE_*` keys already exist as stubs, A7 only registers real handlers in `handlers.ts`).

---

## 3. Files

### 3.1 Files to CREATE (29)

| # | Path | LoC | Purpose |
|---|---|---|---|
| 1 | `src/background/profile/adapter.ts` | ~165 | `Profile` read/write/update/clear with DI Deps object per D20; stamps `updatedAtMs` on every write; `ProfileSchema.parse` guard per D21 |
| 2 | `src/background/profile/validator.ts` | ~55 | `parseProfile(raw)` wrapper that returns a discriminated `ParseResult`; `formatZodErrors()` utility |
| 3 | `src/background/profile/json-resume-merge.ts` | ~140 | `mergeJsonResume({ existing, incoming })` with per-half name split fallback, location runtime guard, profiles runtime guard |
| 4 | `src/background/profile/handlers.ts` | ~110 | Real `PROFILE_GET`, `PROFILE_UPDATE`, `PROFILE_UPLOAD_JSON_RESUME` handlers that replace A5's `NotImplementedError` stubs |
| 5 | `src/background/profile/index.ts` | ~18 | Barrel re-exporting adapter, validator, merge, handlers, and `PROFILE_KEY` |
| 6 | `src/background/profile/blueprint.contract.ts` | ~38 | D14.4 fingerprint: phase id, version, publicExports, forbiddenImports, requiredCoverage, storageShape |
| 7 | `entrypoints/options/App.tsx` | ~220 | Top-level React options page; handles save/upload/clear/sign-out; composite remount keys |
| 8 | `entrypoints/options/sections/BasicsSection.tsx` | ~220 | firstName, lastName, name (derived read-only), preferredName, pronouns, email, phone, phonePrefix, dateOfBirth (gated), url, summary, label, location (5 fields) |
| 9 | `entrypoints/options/sections/LegalAuthSection.tsx` | ~165 | 4x4 jurisdiction x flag matrix; `data-testid="legal-${region}-${flag}"` on every cell |
| 10 | `entrypoints/options/sections/PreferencesSection.tsx` | ~180 | Salary (min/max/currency/period), availability date, willingToRelocate, remotePreference, willingToComplete*, willingToUndergo*. Reads workAuthorization read-only from props; does NOT re-send it in patches. |
| 11 | `entrypoints/options/sections/DemographicsSection.tsx` | ~160 | gender, race, veteranStatus, disabilityStatus. Section is gated on `consents.allowEeoAutofill`. |
| 12 | `entrypoints/options/sections/ConsentSection.tsx` | ~95 | privacyPolicy, marketing, allowEeoAutofill, allowDobAutofill. Toggling allowEeoAutofill fades in DemographicsSection; toggling allowDobAutofill fades in the DOB input inside BasicsSection. |
| 13 | `entrypoints/options/JsonResumeDropzone.tsx` | ~135 | Drag-drop + file input fallback; 10 MB hard cap; `application/json` MIME check; keyboard-operable (Enter / Space triggers file input); accessible name/description |
| 14 | `entrypoints/options/ConfirmClearModal.tsx` | ~85 | `aria-modal="true"`, focus-trap, ESC-close, backdrop-click-close |
| 15 | `entrypoints/options/hooks/useProfile.ts` | ~85 | `sendMessage('PROFILE_GET')` on mount; re-reload on `browser.storage.onChanged` where `area === 'local'` and `'llmc.profile.v1' in changes`; cleanup on unmount |
| 16 | `entrypoints/options/hooks/useProfileSaver.ts` | ~55 | Wraps `sendMessage('PROFILE_UPDATE', { patch })` with saveState machine (`idle`, `saving`, `saved`, `error`) |
| 17 | `entrypoints/options/util/formatZodError.ts` | ~45 | Converts a `ZodError` into user-facing `{ path, message }[]` with nice path formatting |
| 18 | `entrypoints/options/util/createEmptyWorkAuth.ts` | ~30 | Returns the 4-jurisdiction array with all flags `false`; imported by `LegalAuthSection` and `createEmptyProfile` fallback |
| 19 | `tests/setup.ts` | ~30 | Vitest setup file for the jsdom project: installs `@webext-core/fake-browser`, `fake-indexeddb/auto`, `@testing-library/jest-dom/vitest` |
| 20 | `tests/background/profile/adapter.spec.ts` | ~320 | 18 cases: empty storage, valid read, corrupt JSON, unknown extra field (`__proto__`), invalid email, 10 MB upload, malformed JSON, script tag in summary, missing required field, 0 workAuth entries (valid), duplicate profiles, unicode, writeProfile stamps `updatedAtMs`, writeProfile validates, clearProfile removes key, concurrent writes serialize, A5 stub migration path, empty-profile fallback |
| 21 | `tests/background/profile/json-resume-merge.spec.ts` | ~220 | 10 cases: empty existing, empty incoming, both empty, name-split when both halves empty, per-half split when only lastName empty (the reviewer fix), per-half split when only firstName empty, unicode name with combining chars, malformed location runtime guard, malformed profiles runtime guard, ATS-extension preservation across re-upload |
| 22 | `tests/background/profile/handlers.spec.ts` | ~250 | 9 cases: PROFILE_GET null + populated + corrupt; PROFILE_UPDATE with patch + with empty patch + rejects invalid email; PROFILE_UPLOAD_JSON_RESUME valid + invalid + stamps updatedAtMs |
| 23 | `tests/background/profile/a8-contract-integration.spec.ts` | ~120 | Integration test: writeProfile(full) -> storage.local.get -> assert basics.firstName, basics.location.countryCode, profileVersion '1.0', updatedAtMs number. This is the test that would have caught the original v2.0 A8 contract break. |
| 24 | `tests/entrypoints/options/App.integration.spec.tsx` | ~340 | 5 cases: full happy path save, upload flow, clear flow with confirmation, sign-out preserves profile, external storage change forces remount |
| 25 | `tests/entrypoints/options/BasicsSection.spec.tsx` | ~240 | 8 cases: name derivation, phonePrefix rendering, DOB visibility gate, DOB visibility gate toggles live, location countryCode ISO validation, unicode firstName, 500-char summary, URL normalization |
| 26 | `tests/entrypoints/options/LegalAuthSection.spec.tsx` | ~200 | 16-cell matrix interaction test, each cell clickable, each cell emits a correct patch, unchecked state persists |
| 27 | `tests/entrypoints/options/PreferencesSection.spec.tsx` | ~210 | Does-not-clobber-workAuthorization (the reviewer's data-loss bug), salary min>=0, availabilityDate validation, all toggles |
| 28 | `tests/entrypoints/options/DemographicsSection.spec.tsx` | ~180 | Hidden by default, fades in on consents toggle, stays mounted across save, decline_to_answer default |
| 29 | `tests/entrypoints/options/fixtures/valid-json-resume.json` | ~80 | Ada Lovelace fixture that parses cleanly through `mergeJsonResume` + `ProfileSchema` |
| 30 | `tests/entrypoints/options/fixtures/invalid-json-resume.json` | ~20 | Bad email + missing required field |
| 31 | `tests/entrypoints/options/fixtures/big-json-resume.json` | generated | 10 MB JSON generated at test time (not committed) |
| 32 | `scripts/rollback-phase-A7.sh` | ~45 | Per D23: `rm -rf src/background/profile/ entrypoints/options/sections/ entrypoints/options/JsonResumeDropzone.tsx ...`; `git checkout HEAD -- src/background/messaging/handlers.ts`; `pnpm typecheck` must pass |

(Counts: 29 source files, 3 fixtures, 1 rollback script = 33 created. Row 30/31 are fixtures. Row 32 is the rollback script.)

### 3.2 Files to MODIFY (5)

| # | Path | Change |
|---|---|---|
| 1 | `src/background/messaging/handlers.ts` | (a) Remove the three `PROFILE_*` inline `NotImplementedError` stub handlers that A5 wrote. (b) Add `import { handleProfileGet, handleProfileUpdate, handleProfileUploadJsonResume } from '../profile/handlers.js';`. (c) Replace the three entries in the `HANDLERS` record with the real handlers. DO NOT touch any other key. |
| 2 | `src/background/index.ts` | Verify that the background entrypoint imports `HANDLERS` from `./messaging/handlers.js` (A5 should have this). If A5 exports a `registerProfileAdapter` side-effect hook, A7 does not need it. No edit if A5 is clean. |
| 3 | `entrypoints/options/main.tsx` | Replace the A1 placeholder mount with `createRoot(document.getElementById('root')!).render(<App />)`. |
| 4 | `entrypoints/options/index.html` | Verify `<div id="root"></div>` and `<script type="module" src="./main.tsx">` exist from A1. If A1 missed it, add (per rule: no assumptions -- verify, then patch). |
| 5 | `vitest.config.ts` | Per D14/D20/D24 and the reviewer's flag: switch from global `environment` to per-project `environmentMatchGlobs`. `tests/background/**` -> `node`. `tests/entrypoints/options/**` -> `jsdom`. Add `setupFiles: ['./tests/setup.ts']` for the jsdom project only. Preserve coverage thresholds from A5. |

**NOT modified** (deliberately):
- `src/background/messaging/protocol.ts` -- A5 is the sole owner per D2. The `PROFILE_GET`, `PROFILE_UPDATE`, `PROFILE_UPLOAD_JSON_RESUME` keys already exist in A5's ProtocolMap (see keystone §1.1). A7 only wires real handlers.
- Any file under `entrypoints/ats.content/` -- A8's reader is A8's own problem. A7 writes the B2 shape; A8 rewrites its reader in A8's plan.

### 3.3 Files to DELETE (3)

| # | Path | Reason |
|---|---|---|
| 1 | `src/background/storage/profile.ts` (if A5 left one behind) | Superseded by `src/background/profile/adapter.ts`. Clean migration per code-quality rule "No Dead Code". A5 v2.1 plan does NOT ship this file, but grep-gate removes it if any previous iteration did. |
| 2 | `tests/background/profile.spec.ts` (if A5 left one behind) | Same reason; replaced by `tests/background/profile/adapter.spec.ts`. |
| 3 | `tests/background/handlers-profile.spec.ts` (if A5 left one behind) | Same reason; replaced by `tests/background/profile/handlers.spec.ts`. |

Acceptance grep `grep -rn "src/background/storage/profile" src/ tests/` must return zero after this phase.

---

## 4. Dependencies

### 4.1 npm dependencies

```json
// package.json additions (devDependencies)
{
  "@testing-library/react": "^16.1.0",
  "@testing-library/user-event": "^14.5.2",
  "@testing-library/jest-dom": "^6.6.3",
  "@webext-core/fake-browser": "^1.3.1",
  "fake-indexeddb": "^6.0.0",
  "jsdom": "^25.0.1"
}
```

```json
// package.json dependencies (already exists from A1, pinned by B1)
{
  "ats-autofill-engine": "0.1.0-alpha.1",
  "zod": "^3.23.8",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "wxt": "^0.19.11"
}
```

### 4.2 Engine imports (per keystone §4)

B1's exports map (v2.1 locked) DOES publish the `./profile` sub-entry:

```json
"./profile": {
  "types": "./dist/core/profile/index.d.ts",
  "import": "./dist/core/profile/index.js",
  "require": "./dist/core/profile/index.cjs"
}
```

A7 imports from `ats-autofill-engine/profile` for type + Zod + default helpers. The root barrel `ats-autofill-engine` ALSO re-exports these, but A7 prefers the sub-entry per keystone §4 table (smaller tree-shake footprint, tighter coupling to the profile sub-area).

```ts
import {
  ProfileSchema,
  createEmptyProfile,
} from 'ats-autofill-engine/profile';

import type {
  Profile,
  ProfileVersion,
  Basics,
  Location,
  SocialProfile,
  JurisdictionAuthorization,
  SalaryExpectation,
  RemotePreference,
  JobPreferences,
  Gender,
  Race,
  VeteranStatus,
  DisabilityStatus,
  Demographics,
  Consents,
  Documents,
  ResumeHandle,
} from 'ats-autofill-engine/profile';
```

Acceptance gate (D14.3): `node -e "import('ats-autofill-engine/profile').then(m => console.log(Object.keys(m)))"` must print `ProfileSchema`, `createEmptyProfile` (and any other profile-area exports B2 ships). If the command fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, the phase is BLOCKED pending a B1 correction -- A7 does NOT fall back to the root import silently. (The exports-map regression would indicate B1 drift and must be flagged upstream.)

### 4.3 A5 imports

```ts
import { createLogger } from '@/src/background/log.js';            // D11
import type { ProtocolMap } from '@/src/background/messaging/protocol.js';  // D2 consumer only
// A7 does NOT import from '@/src/background/messaging/handlers.js' -- the
// handler table is edited in-place, not consumed as a module.
```

A5's `src/background/log.ts` ships `createLogger(scope: string): Logger` with `info/warn/error/debug` methods that route through `globalThis.console.*` with prefix `[llmc-ext:${scope}]`. A7 never calls `console.*` directly.

---

## 5. Blueprint alignment

This is the Chrome extension repo (`e:/llmconveyors-chrome-extension`), not the NestJS API repo, so `.claude/rules/blueprint-driven-development.md` module-blueprint hierarchy does not apply directly. The authoritative blueprint for this phase is the v2.1 decision memo §2.12 (D8=b) and the keystone contracts §2.12 (Profile fields).

| Decision memo clause | Phase A7 enforcement |
|---|---|
| "Upload JSON Resume + inline overrides" | `JsonResumeDropzone` + 5 sections |
| "Parse JSON, validate against our extended Zod schema (shipped in `ats-autofill-engine/profile`)" | `parseProfile()` wraps `ProfileSchema.safeParse()`; `writeProfile()` runs `ProfileSchema.parse()` as the last line of defense |
| "Merge with defaults, store in `chrome.storage.local`" | `mergeJsonResume` + `writeProfile` at key `'llmc.profile.v1'` |
| "Inline form for overrides: name split, phone prefix, legal auth flags, EEO (opt-in), consent toggles" | BasicsSection covers name split + phonePrefix + dateOfBirth (gated); LegalAuthSection ships the full 4x4 matrix; DemographicsSection is gated on `allowEeoAutofill` |
| "NO full-form builder in V1" | work/education/skills/languages/certificates/projects/volunteer/awards/publications/references are read-only summary chips in the options page (rendered as "N items uploaded") |
| "Backend `GET /resume/master` is NOT used in V1 profile flow" | Adapter never imports the SDK client; no `SDK_CALL` from options page |
| D10 -- composite key remount fix | Every section receives `key={`${profile.profileVersion}-${profile.updatedAtMs}`}`; `writeProfile` stamps `updatedAtMs: Date.now()` on every persist |

Forward-compat: if v1.1 reinstates backend sync, the adapter gains a `syncWithBackend()` method and the options page adds a "Sync from account" button. The Zod-validated `Profile` shape remains the single source of truth.

The phase ALSO writes a blueprint fingerprint at `src/background/profile/blueprint.contract.ts` (see §6.7) so D14.4's CI walker verifies adapter shape, exports, forbidden imports, and storage schema against the declared contract.

---

## 6. Implementation

### 6.1 Step 1 -- wire real handlers into A5's dispatch table

**File**: `src/background/messaging/handlers.ts` (MODIFY, not CREATE)

A5's v2.1 plan ships the three `PROFILE_*` keys with `NotImplementedError`-throwing stubs inline. A7's job is surgical: remove the three stubs, import the real handlers from `src/background/profile/handlers.ts`, and update exactly three entries in the `HANDLERS` record. Nothing else in that file changes.

```ts
// src/background/messaging/handlers.ts -- DIFF

// --- REMOVE (A5 stubs) ---
- const handleProfileGet: HandlerFor<'PROFILE_GET'> = async () => {
-   throw new NotImplementedError('PROFILE_GET');
- };
- const handleProfileUpdate: HandlerFor<'PROFILE_UPDATE'> = async () => {
-   throw new NotImplementedError('PROFILE_UPDATE');
- };
- const handleProfileUploadJsonResume: HandlerFor<'PROFILE_UPLOAD_JSON_RESUME'> = async () => {
-   throw new NotImplementedError('PROFILE_UPLOAD_JSON_RESUME');
- };

// --- ADD (above the HANDLERS record) ---
+ import {
+   handleProfileGet,
+   handleProfileUpdate,
+   handleProfileUploadJsonResume,
+ } from '../profile/handlers.js';

// --- HANDLERS record (unchanged structure, three entries updated) ---
export const HANDLERS: { readonly [K in keyof ProtocolMap]: HandlerFor<K> } = {
  AUTH_SIGN_IN:               handleAuthSignIn,
  AUTH_SIGN_OUT:              handleAuthSignOut,
  AUTH_STATUS:                handleAuthStatus,
  AUTH_STATE_CHANGED:         async () => undefined,   // broadcast-only, A5 inert
  PROFILE_GET:                handleProfileGet,         // A7 real impl
  PROFILE_UPDATE:             handleProfileUpdate,      // A7 real impl
  PROFILE_UPLOAD_JSON_RESUME: handleProfileUploadJsonResume,  // A7 real impl
  KEYWORDS_EXTRACT:           handleKeywordsExtract,
  INTENT_DETECTED:            handleIntentDetected,
  INTENT_GET:                 handleIntentGet,
  FILL_REQUEST:               handleFillRequest,
  HIGHLIGHT_APPLY:            async () => ({ ok: false, reason: 'handled-in-content' }),
  HIGHLIGHT_CLEAR:            async () => ({ ok: false, reason: 'handled-in-content' }),
  HIGHLIGHT_STATUS:           handleHighlightStatus,
  GENERATION_START:           handleGenerationStart,
  GENERATION_UPDATE:          async () => undefined,    // broadcast-only
  GENERATION_CANCEL:          handleGenerationCancel,
  DETECTED_JOB_BROADCAST:     async () => undefined,    // broadcast-only
  CREDITS_GET:                handleCreditsGet,
};
```

**Grep gate**: `grep -n "PROFILE_GET\|PROFILE_UPDATE\|PROFILE_UPLOAD_JSON_RESUME" src/background/messaging/handlers.ts` must show exactly three lines, each pointing at an imported handler (no `NotImplementedError` remnants).

### 6.2 Step 2 -- Profile adapter with DI

**File**: `src/background/profile/adapter.ts` (CREATE, ~165 LoC)

```ts
/**
 * Profile storage adapter -- writes the canonical B2 `Profile` shape to
 * chrome.storage.local['llmc.profile.v1'].
 *
 * Per D20, the adapter takes a Deps object at construction. Production wires
 * real browser.storage.local + Date.now + createLogger; tests wire fakes from
 * @webext-core/fake-browser and a controlled now().
 *
 * Per D21, every write runs `ProfileSchema.parse(profile)` as the last line
 * of defense before browser.storage.local.set. Every read runs
 * `ProfileSchema.safeParse(raw)` before returning; corrupt storage returns
 * null, not a thrown error (the background worker must not crash on corrupt
 * data that a user or malware dropped into storage).
 *
 * Per D10, every write stamps `updatedAtMs: now()` on the persisted record
 * as a top-level sibling of `profileVersion`. `updatedAtMs` is the second
 * component of the composite React key, so storage changes force-remount
 * every section in the options page.
 */

import { ProfileSchema, createEmptyProfile } from 'ats-autofill-engine/profile';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '../log.js';

export const PROFILE_KEY = 'llmc.profile.v1';

export interface ProfileAdapterDeps {
  readonly readStorage: (key: string) => Promise<unknown>;
  readonly writeStorage: (key: string, value: unknown) => Promise<void>;
  readonly removeStorage: (key: string) => Promise<void>;
  readonly now: () => number;
  readonly logger: Logger;
}

export interface ProfileAdapter {
  readProfile(): Promise<Profile | null>;
  writeProfile(profile: Profile): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;
  clearProfile(): Promise<void>;
}

/**
 * Factory. Call once per process with production deps; tests construct fresh
 * instances with fake deps.
 */
export function createProfileAdapter(deps: ProfileAdapterDeps): ProfileAdapter {
  const { readStorage, writeStorage, removeStorage, now, logger } = deps;

  async function readProfile(): Promise<Profile | null> {
    let raw: unknown;
    try {
      raw = await readStorage(PROFILE_KEY);
    } catch (err) {
      logger.error('readStorage threw', err, { key: PROFILE_KEY });
      return null;
    }
    if (raw === undefined || raw === null) return null;

    const result = ProfileSchema.safeParse(raw);
    if (!result.success) {
      logger.warn('Corrupt profile in storage, returning null', {
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          message: i.message,
        })),
      });
      return null;
    }
    // Zod strips `updatedAtMs` unless we explicitly passthrough. We piggyback
    // on the raw record to restore it after parse.
    const rawRecord = raw as Record<string, unknown>;
    const profile = result.data;
    if (typeof rawRecord.updatedAtMs === 'number') {
      return { ...profile, updatedAtMs: rawRecord.updatedAtMs } as Profile;
    }
    // Legacy records without updatedAtMs: stamp on next write
    return profile;
  }

  async function writeProfile(profile: Profile): Promise<Profile> {
    // D21: last line of defense. Throws ZodError on invalid input.
    const validated = ProfileSchema.parse(profile);
    const withStamp: Profile = {
      ...(validated as Profile),
      updatedAtMs: now(),
    } as Profile;
    try {
      await writeStorage(PROFILE_KEY, withStamp);
    } catch (err) {
      logger.error('writeStorage threw', err, { key: PROFILE_KEY });
      throw err;
    }
    logger.debug('profile persisted', {
      updatedAtMs: withStamp.updatedAtMs,
      profileVersion: withStamp.profileVersion,
    });
    return withStamp;
  }

  async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const existing = (await readProfile()) ?? createEmptyProfile();
    const merged: Profile = {
      ...existing,
      ...patch,
      basics: patch.basics
        ? { ...existing.basics, ...patch.basics }
        : existing.basics,
      jobPreferences: patch.jobPreferences
        ? { ...existing.jobPreferences, ...patch.jobPreferences }
        : existing.jobPreferences,
      demographics: patch.demographics
        ? { ...existing.demographics, ...patch.demographics }
        : existing.demographics,
      consents: patch.consents
        ? { ...existing.consents, ...patch.consents }
        : existing.consents,
      documents: patch.documents
        ? { ...existing.documents, ...patch.documents }
        : existing.documents,
      customAnswers: patch.customAnswers ?? existing.customAnswers,
    };
    return writeProfile(merged);
  }

  async function clearProfile(): Promise<void> {
    try {
      await removeStorage(PROFILE_KEY);
      logger.info('profile cleared');
    } catch (err) {
      logger.error('removeStorage threw', err, { key: PROFILE_KEY });
      throw err;
    }
  }

  return Object.freeze({ readProfile, writeProfile, updateProfile, clearProfile });
}

/**
 * Module-singleton instance wired with production deps. Imported by
 * `handlers.ts` for direct use in message handlers. Tests DO NOT import this
 * singleton -- they construct their own instance via `createProfileAdapter`.
 */
import { browser } from 'wxt/browser';
import { createLogger } from '../log.js';

export const profileAdapter: ProfileAdapter = createProfileAdapter({
  readStorage: async (key) => {
    const raw = await browser.storage.local.get(key);
    return raw[key];
  },
  writeStorage: async (key, value) => {
    await browser.storage.local.set({ [key]: value });
  },
  removeStorage: async (key) => {
    await browser.storage.local.remove(key);
  },
  now: () => Date.now(),
  logger: createLogger('profile-adapter'),
});
```

Notes:
- `readProfile()` uses `ProfileSchema.safeParse` (non-throwing). `writeProfile()` uses `ProfileSchema.parse` (throwing) because the caller is trusted code that has already validated; if it still fails, that is a bug in the caller and MUST throw loudly.
- `updatedAtMs` handling: B2's keystone §2.12 specifies it as "passthrough permitted storage metadata". The adapter reconstructs it after `safeParse` strips unknown fields, then re-stamps on every write.
- No `console.*`. No module-level `new Date()`. Everything goes through Deps.

### 6.3 Step 3 -- Zod validator wrapper

**File**: `src/background/profile/validator.ts` (CREATE, ~55 LoC)

```ts
/**
 * Discriminated wrapper around `ProfileSchema.safeParse()` for the upload
 * handler -- returns structured field-level errors instead of a ZodError.
 */
import { ProfileSchema } from 'ats-autofill-engine/profile';
import type { Profile } from 'ats-autofill-engine/profile';
import type { ZodError, ZodIssue } from 'zod';

export type ParseResult =
  | { readonly ok: true; readonly profile: Profile }
  | {
      readonly ok: false;
      readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
    };

export function parseProfile(raw: unknown): ParseResult {
  const result = ProfileSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, profile: result.data as Profile };
  }
  return { ok: false, errors: formatZodErrors(result.error) };
}

export function formatZodErrors(
  error: ZodError,
): ReadonlyArray<{ readonly path: string; readonly message: string }> {
  return error.issues.map((issue: ZodIssue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}
```

### 6.4 Step 4 -- JSON Resume merge with per-half name split

**File**: `src/background/profile/json-resume-merge.ts` (CREATE, ~140 LoC)

The critical fix: per-half name split. If the existing profile has `firstName` but no `lastName`, and the uploaded resume has `basics.name = 'Ada Lovelace'`, the merge MUST split the uploaded name and set `lastName = 'Lovelace'` while preserving `firstName = 'Ada'` (the existing manually-entered value).

```ts
/**
 * Merge an uploaded JSON Resume into the existing profile.
 *
 * Policy:
 *   - JSON Resume list fields (work, education, skills, ...) REPLACE the
 *     corresponding engine fields wholesale. Re-uploading a fresh resume
 *     refreshes those fields entirely.
 *   - ATS-extension fields (jobPreferences, demographics, consents,
 *     documents, customAnswers) are PRESERVED from the existing profile.
 *     User inline overrides survive resume re-upload.
 *   - `basics` is merged at the field level: JSON Resume supplies
 *     `name`/`email`/`phone`/`url`/`summary`/`label`/`location`/`profiles`;
 *     the existing profile supplies `firstName`/`lastName`/`preferredName`/
 *     `pronouns`/`phonePrefix`/`dateOfBirth` (JSON Resume has no concept of
 *     these).
 *   - Per-half name split fallback: if uploaded `basics.name` is present
 *     AND the existing profile has EITHER `firstName` OR `lastName` empty,
 *     we split the uploaded name and fill ONLY the empty half. If both
 *     halves are already populated, we do nothing (respect user input).
 *
 * The merged result is NOT validated here -- caller runs
 * `ProfileSchema.parse()` before persisting.
 */

import { createEmptyProfile } from 'ats-autofill-engine/profile';
import type { Profile, Location, SocialProfile } from 'ats-autofill-engine/profile';

export interface MergeOptions {
  readonly existing: Profile | null;
  readonly incoming: unknown;
}

function splitFullName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { first: '', last: '' };
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) return { first: tokens[0]!, last: '' };
  return {
    first: tokens[0]!,
    last: tokens.slice(1).join(' '),
  };
}

function isStringRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function safeString(x: unknown, fallback: string): string {
  return typeof x === 'string' ? x : fallback;
}

function safeLocation(x: unknown, fallback: Location): Location {
  if (!isStringRecord(x)) return fallback;
  return {
    address: safeString(x.address, fallback.address),
    city: safeString(x.city, fallback.city),
    region: safeString(x.region, fallback.region),
    countryCode: safeString(x.countryCode, fallback.countryCode),
    postalCode: safeString(x.postalCode, fallback.postalCode),
  };
}

function safeProfiles(x: unknown, fallback: ReadonlyArray<SocialProfile>): ReadonlyArray<SocialProfile> {
  if (!Array.isArray(x)) return fallback;
  const out: SocialProfile[] = [];
  for (const item of x) {
    if (!isStringRecord(item)) continue;
    const network = typeof item.network === 'string' ? item.network : '';
    const username = typeof item.username === 'string' ? item.username : '';
    const url = typeof item.url === 'string' ? item.url : '';
    if (network || url) out.push({ network, username, url });
  }
  return out.length > 0 ? out : fallback;
}

export function mergeJsonResume({ existing, incoming }: MergeOptions): Profile {
  const base: Profile = existing ?? createEmptyProfile();
  if (!isStringRecord(incoming)) return base;

  const jBasics = isStringRecord(incoming.basics) ? incoming.basics : {};
  const jName = typeof jBasics.name === 'string' ? jBasics.name.trim() : '';

  // Per-half name split: only fill the half that is empty.
  const existingFirst = base.basics.firstName;
  const existingLast = base.basics.lastName;
  let mergedFirst = existingFirst;
  let mergedLast = existingLast;
  if (jName) {
    const { first, last } = splitFullName(jName);
    if (!existingFirst && first) mergedFirst = first;
    if (!existingLast && last) mergedLast = last;
  }

  return {
    ...base,
    profileVersion: base.profileVersion,
    basics: {
      ...base.basics,
      firstName: mergedFirst,
      lastName: mergedLast,
      name: jName || base.basics.name,
      // JSON Resume has no preferredName/pronouns/phonePrefix/dateOfBirth;
      // preserved from base unchanged.
      preferredName: base.basics.preferredName,
      pronouns: base.basics.pronouns,
      phonePrefix: base.basics.phonePrefix,
      dateOfBirth: base.basics.dateOfBirth,
      email: safeString(jBasics.email, base.basics.email),
      phone: safeString(jBasics.phone, base.basics.phone ?? '') || base.basics.phone,
      url: safeString(jBasics.url, base.basics.url ?? '') || base.basics.url,
      summary: safeString(jBasics.summary, base.basics.summary ?? '') || base.basics.summary,
      label: safeString(jBasics.label, base.basics.label ?? '') || base.basics.label,
      location: safeLocation(jBasics.location, base.basics.location),
      profiles: safeProfiles(jBasics.profiles, base.basics.profiles),
    },
    // JSON Resume list fields replace wholesale
    work: Array.isArray(incoming.work) ? (incoming.work as Profile['work']) : base.work,
    education: Array.isArray(incoming.education) ? (incoming.education as Profile['education']) : base.education,
    skills: Array.isArray(incoming.skills) ? (incoming.skills as Profile['skills']) : base.skills,
    languages: Array.isArray(incoming.languages) ? (incoming.languages as Profile['languages']) : base.languages,
    certificates: Array.isArray(incoming.certificates) ? (incoming.certificates as Profile['certificates']) : base.certificates,
    projects: Array.isArray(incoming.projects) ? (incoming.projects as Profile['projects']) : base.projects,
    volunteer: Array.isArray(incoming.volunteer) ? (incoming.volunteer as Profile['volunteer']) : base.volunteer,
    awards: Array.isArray(incoming.awards) ? (incoming.awards as Profile['awards']) : base.awards,
    publications: Array.isArray(incoming.publications) ? (incoming.publications as Profile['publications']) : base.publications,
    references: Array.isArray(incoming.references) ? (incoming.references as Profile['references']) : base.references,
    // ATS extensions preserved
    jobPreferences: base.jobPreferences,
    demographics: base.demographics,
    documents: base.documents,
    customAnswers: base.customAnswers,
    consents: base.consents,
  };
}
```

### 6.5 Step 5 -- Message handlers

**File**: `src/background/profile/handlers.ts` (CREATE, ~110 LoC)

```ts
/**
 * Real handlers for PROFILE_GET, PROFILE_UPDATE, PROFILE_UPLOAD_JSON_RESUME.
 * Replaces A5's NotImplementedError stubs. Registered into A5's HANDLERS
 * record by `src/background/messaging/handlers.ts` (A7 step 1).
 */

import type {
  ProtocolMap,
  ProfileUpdateResponse,
  ProfileUploadResponse,
} from '../messaging/protocol.js';
import type { Profile } from 'ats-autofill-engine/profile';
import { profileAdapter } from './adapter.js';
import { parseProfile } from './validator.js';
import { mergeJsonResume } from './json-resume-merge.js';
import { createLogger } from '../log.js';
import { ZodError } from 'zod';

const logger = createLogger('profile-handlers');

type HandlerFor<K extends keyof ProtocolMap> = ProtocolMap[K] extends (
  data: infer D,
) => infer R
  ? (data: D) => Promise<Awaited<R>>
  : never;

export const handleProfileGet: HandlerFor<'PROFILE_GET'> = async () => {
  try {
    return await profileAdapter.readProfile();
  } catch (err) {
    logger.error('PROFILE_GET failed', err);
    return null;
  }
};

export const handleProfileUpdate: HandlerFor<'PROFILE_UPDATE'> = async ({ patch }) => {
  try {
    await profileAdapter.updateProfile(patch as Partial<Profile>);
    const response: ProfileUpdateResponse = { ok: true };
    return response;
  } catch (err) {
    if (err instanceof ZodError) {
      const response: ProfileUpdateResponse = {
        ok: false,
        errors: err.issues.map((i) => ({
          path: i.path.join('.') || '(root)',
          message: i.message,
        })),
      };
      return response;
    }
    logger.error('PROFILE_UPDATE failed', err);
    const response: ProfileUpdateResponse = {
      ok: false,
      errors: [{ path: '(root)', message: String(err) }],
    };
    return response;
  }
};

export const handleProfileUploadJsonResume: HandlerFor<
  'PROFILE_UPLOAD_JSON_RESUME'
> = async ({ raw }) => {
  try {
    const existing = await profileAdapter.readProfile();
    const merged = mergeJsonResume({ existing, incoming: raw });
    const validated = parseProfile(merged);
    if (!validated.ok) {
      const response: ProfileUploadResponse = { ok: false, errors: validated.errors };
      return response;
    }
    const persisted = await profileAdapter.writeProfile(validated.profile);
    const response: ProfileUploadResponse = { ok: true, profile: persisted };
    return response;
  } catch (err) {
    logger.error('PROFILE_UPLOAD_JSON_RESUME failed', err);
    const response: ProfileUploadResponse = {
      ok: false,
      errors: [{ path: '(root)', message: String(err) }],
    };
    return response;
  }
};
```

### 6.6 Step 6 -- Barrel

**File**: `src/background/profile/index.ts` (CREATE)

```ts
export {
  createProfileAdapter,
  profileAdapter,
  PROFILE_KEY,
  type ProfileAdapter,
  type ProfileAdapterDeps,
} from './adapter.js';
export { parseProfile, formatZodErrors, type ParseResult } from './validator.js';
export { mergeJsonResume, type MergeOptions } from './json-resume-merge.js';
export {
  handleProfileGet,
  handleProfileUpdate,
  handleProfileUploadJsonResume,
} from './handlers.js';
export { PROFILE_BLUEPRINT } from './blueprint.contract.js';
```

### 6.7 Step 7 -- Blueprint contract fingerprint (D14.4)

**File**: `src/background/profile/blueprint.contract.ts` (CREATE)

```ts
/**
 * D14.4 blueprint contract fingerprint for src/background/profile/**.
 * Read by scripts/check-blueprint-contracts.mjs during CI; any drift in
 * exports, forbidden imports, storage shape, or coverage trips the gate.
 */
export const PROFILE_BLUEPRINT = {
  phase: 'A7',
  version: '2.1',
  publicExports: [
    'createProfileAdapter',
    'profileAdapter',
    'PROFILE_KEY',
    'parseProfile',
    'formatZodErrors',
    'mergeJsonResume',
    'handleProfileGet',
    'handleProfileUpdate',
    'handleProfileUploadJsonResume',
    'PROFILE_BLUEPRINT',
  ] as const,
  forbiddenImports: [
    'src/background/sdk/*',         // no SDK coupling in profile path
    '@llmconveyors/sdk',             // backend GET /resume/master banned
    'src/content/*',                 // content script isolation
  ] as const,
  requiredCoverage: 85,
  storageShape: {
    key: 'llmc.profile.v1',
    fields: [
      'profileVersion',
      'updatedAtMs',
      'basics',
      'jobPreferences',
      'demographics',
      'consents',
      'documents',
      'customAnswers',
      'work',
      'education',
      'skills',
      'languages',
      'certificates',
      'projects',
      'volunteer',
      'awards',
      'publications',
      'references',
    ],
  },
} as const;
```

### 6.8 Step 8 -- `useProfile` hook with composite-key support

**File**: `entrypoints/options/hooks/useProfile.ts` (CREATE, ~85 LoC)

```ts
import { useEffect, useState, useCallback } from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '@/src/background/messaging/protocol.js';
import type { Profile } from 'ats-autofill-engine/profile';
import { PROFILE_KEY } from '@/src/background/profile/adapter.js';
import { createLogger } from '@/src/background/log.js';

const log = createLogger('options-useProfile');

export interface UseProfileResult {
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendMessage('PROFILE_GET', undefined);
      setProfile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('PROFILE_GET failed', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ): void => {
      if (area === 'local' && PROFILE_KEY in changes) {
        void reload();
      }
    };
    browser.storage.onChanged.addListener(listener);
    return (): void => {
      browser.storage.onChanged.removeListener(listener);
    };
  }, [reload]);

  return { profile, loading, error, reload };
}
```

### 6.9 Step 9 -- Options page root

**File**: `entrypoints/options/App.tsx` (CREATE, ~220 LoC)

The composite-key remount (D10) is the critical piece: every section receives `key={`${profile.profileVersion}-${profile.updatedAtMs}`}`. On any storage change, `useProfile` reloads, `profile.updatedAtMs` changes, React remounts every section with a fresh `useState` from the new props. This eliminates the v2.0 stale-state bug.

```tsx
import { useState, useCallback } from 'react';
import { sendMessage } from '@/src/background/messaging/protocol.js';
import { useProfile } from './hooks/useProfile.js';
import { JsonResumeDropzone } from './JsonResumeDropzone.js';
import { ConfirmClearModal } from './ConfirmClearModal.js';
import { BasicsSection } from './sections/BasicsSection.js';
import { LegalAuthSection } from './sections/LegalAuthSection.js';
import { PreferencesSection } from './sections/PreferencesSection.js';
import { DemographicsSection } from './sections/DemographicsSection.js';
import { ConsentSection } from './sections/ConsentSection.js';
import { createLogger } from '@/src/background/log.js';
import type { Profile } from 'ats-autofill-engine/profile';

const log = createLogger('options-app');

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly at: number }
  | { readonly kind: 'error'; readonly message: string };

type UploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'parsing' }
  | { readonly kind: 'validated' }
  | {
      readonly kind: 'errors';
      readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
    };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function App(): JSX.Element {
  const { profile, loading, error, reload } = useProfile();
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  const handleSave = useCallback(
    async (patch: Partial<Profile>): Promise<void> => {
      setSaveState({ kind: 'saving' });
      try {
        const response = await sendMessage('PROFILE_UPDATE', { patch });
        if (response.ok) {
          setSaveState({ kind: 'saved', at: Date.now() });
          await reload();
        } else {
          setSaveState({
            kind: 'error',
            message: response.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
          });
        }
      } catch (err) {
        log.error('PROFILE_UPDATE failed', err);
        setSaveState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [reload],
  );

  const handleUpload = useCallback(
    async (file: File): Promise<void> => {
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadState({
          kind: 'errors',
          errors: [{ path: '(file)', message: `File exceeds 10 MB limit (${file.size} bytes)` }],
        });
        return;
      }
      setUploadState({ kind: 'parsing' });
      try {
        const text = await file.text();
        const raw: unknown = JSON.parse(text);
        const response = await sendMessage('PROFILE_UPLOAD_JSON_RESUME', { raw });
        if (response.ok) {
          setUploadState({ kind: 'validated' });
          await reload();
        } else {
          setUploadState({ kind: 'errors', errors: response.errors });
        }
      } catch (err) {
        log.error('upload parse failed', err);
        setUploadState({
          kind: 'errors',
          errors: [
            {
              path: '(file)',
              message: err instanceof Error ? err.message : 'Failed to parse JSON file',
            },
          ],
        });
      }
    },
    [reload],
  );

  const handleClear = useCallback(async (): Promise<void> => {
    try {
      await sendMessage('PROFILE_CLEAR' as never, undefined);
      // NOTE: PROFILE_CLEAR is NOT in the v2.1 ProtocolMap keystone. A7 routes
      // clear through an explicit PROFILE_UPDATE call that writes createEmptyProfile().
      // See step 9 addendum below.
    } catch (err) {
      log.error('clear failed', err);
    }
    setConfirmClearOpen(false);
    await reload();
  }, [reload]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    await sendMessage('AUTH_SIGN_OUT', undefined);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <p className="text-slate-600">Loading profile...</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <p className="text-red-700">Failed to load profile: {error}</p>
      </main>
    );
  }

  // Composite key for D10 force remount. profileVersion alone would never
  // change (locked to '1.0'); updatedAtMs ticks on every write.
  const remountKey = profile ? `${profile.profileVersion}-${profile.updatedAtMs ?? 0}` : 'empty';

  return (
    <main className="min-h-screen bg-slate-50 px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">LLM Conveyors -- Profile</h1>
            <p className="mt-1 text-sm text-slate-600">
              Your profile is stored locally in this browser. We never upload it anywhere unless you click Fill form on a job application.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </header>

        <JsonResumeDropzone onUpload={handleUpload} state={uploadState} />

        <BasicsSection key={`basics-${remountKey}`} profile={profile} onSave={handleSave} />
        <LegalAuthSection key={`legal-${remountKey}`} profile={profile} onSave={handleSave} />
        <PreferencesSection key={`prefs-${remountKey}`} profile={profile} onSave={handleSave} />
        <ConsentSection key={`consent-${remountKey}`} profile={profile} onSave={handleSave} />
        {profile?.consents.allowEeoAutofill ? (
          <DemographicsSection key={`demo-${remountKey}`} profile={profile} onSave={handleSave} />
        ) : null}

        <section className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div>
            <h2 className="text-sm font-semibold text-rose-900">Danger zone</h2>
            <p className="text-xs text-rose-700">Clear the profile from this browser. Irreversible.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
          >
            Clear profile
          </button>
        </section>

        {saveState.kind === 'saved' ? <p className="text-sm text-green-700">Saved.</p> : null}
        {saveState.kind === 'error' ? <p className="text-sm text-red-700">{saveState.message}</p> : null}

        {confirmClearOpen ? (
          <ConfirmClearModal onConfirm={handleClear} onCancel={() => setConfirmClearOpen(false)} />
        ) : null}
      </div>
    </main>
  );
}
```

**Addendum on clear**: v2.1 keystone does NOT include `PROFILE_CLEAR` in the ProtocolMap. A7 implements "clear profile" as `handleSave({ ...createEmptyProfile() })` -- the clear button dispatches a `PROFILE_UPDATE` with every top-level key overwritten by empty defaults. The adapter persists the empty profile and `updatedAtMs` ticks, which remounts every section with the fresh empty state. The `handleClear` shown above is a placeholder; see the final version below:

```ts
import { createEmptyProfile } from 'ats-autofill-engine/profile';

const handleClear = useCallback(async (): Promise<void> => {
  try {
    const empty = createEmptyProfile();
    await sendMessage('PROFILE_UPDATE', { patch: empty });
    await reload();
  } catch (err) {
    log.error('clear failed', err);
    setSaveState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    setConfirmClearOpen(false);
  }
}, [reload]);
```

### 6.10 Step 10 -- BasicsSection with phonePrefix and DOB gate

**File**: `entrypoints/options/sections/BasicsSection.tsx` (CREATE, ~220 LoC)

Key points:
- Controlled-from-props via `useState(profile?.basics ?? createEmptyProfile().basics)`. Because the parent passes a composite `key`, React remounts this component on every profile reload and `useState` re-initializes from the fresh prop. No `useEffect` resync needed.
- `firstName`, `lastName` inputs; `name` is a derived read-only display (`${firstName} ${lastName}`).
- `preferredName`, `pronouns` inputs.
- `email` input with `type="email"`.
- `phone` input + separate `phonePrefix` input (`type="tel"`, placeholder `+1`).
- `dateOfBirth` input (`type="date"`) IS RENDERED ONLY IF `profile.consents.allowDobAutofill === true`. This is the D8 consent gate.
- `url`, `summary` (textarea), `label` inputs.
- Location block: 5 controlled inputs (`address`, `city`, `region`, `countryCode` with ISO alpha-2 validation, `postalCode`).
- `data-testid` attribute on every input: `basics-firstName`, `basics-lastName`, ..., `basics-phonePrefix`, `basics-dateOfBirth`, `basics-location-countryCode`.
- On submit: constructs a `Partial<Profile>` with only `basics` populated and dispatches to `onSave`. DOES NOT clobber `jobPreferences` / `demographics` / `consents` / `documents` / lists.

```tsx
import { useState, useMemo } from 'react';
import type { Profile, Basics } from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';

interface BasicsSectionProps {
  readonly profile: Profile | null;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
}

const EMPTY_BASICS: Basics = createEmptyProfile().basics;

export function BasicsSection({ profile, onSave }: BasicsSectionProps): JSX.Element {
  const initial = profile?.basics ?? EMPTY_BASICS;
  const [firstName, setFirstName] = useState<string>(initial.firstName);
  const [lastName, setLastName] = useState<string>(initial.lastName);
  const [preferredName, setPreferredName] = useState<string>(initial.preferredName ?? '');
  const [pronouns, setPronouns] = useState<string>(initial.pronouns ?? '');
  const [email, setEmail] = useState<string>(initial.email);
  const [phone, setPhone] = useState<string>(initial.phone ?? '');
  const [phonePrefix, setPhonePrefix] = useState<string>(initial.phonePrefix ?? '');
  const [dateOfBirth, setDateOfBirth] = useState<string>(initial.dateOfBirth ?? '');
  const [url, setUrl] = useState<string>(initial.url ?? '');
  const [summary, setSummary] = useState<string>(initial.summary ?? '');
  const [label, setLabel] = useState<string>(initial.label ?? '');
  const [address, setAddress] = useState<string>(initial.location.address);
  const [city, setCity] = useState<string>(initial.location.city);
  const [region, setRegion] = useState<string>(initial.location.region);
  const [countryCode, setCountryCode] = useState<string>(initial.location.countryCode);
  const [postalCode, setPostalCode] = useState<string>(initial.location.postalCode);

  const dobGateOpen = profile?.consents.allowDobAutofill === true;
  const derivedName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const patch: Partial<Profile> = {
      basics: {
        firstName,
        lastName,
        name: derivedName,
        preferredName: preferredName || undefined,
        pronouns: pronouns || undefined,
        email,
        phone: phone || undefined,
        phonePrefix: phonePrefix || undefined,
        dateOfBirth: dobGateOpen ? (dateOfBirth || undefined) : initial.dateOfBirth,
        url: url || undefined,
        summary: summary || undefined,
        label: label || undefined,
        location: { address, city, region, countryCode, postalCode },
        profiles: initial.profiles,
      },
    };
    await onSave(patch);
  };

  return (
    <section aria-labelledby="basics-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="basics-heading" className="text-lg font-semibold text-slate-900">Basics</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
        <Field label="First name" value={firstName} onChange={setFirstName} testId="basics-firstName" required />
        <Field label="Last name" value={lastName} onChange={setLastName} testId="basics-lastName" required />
        <Field label="Name (derived)" value={derivedName} onChange={() => { /* read-only */ }} testId="basics-name" readOnly />
        <Field label="Preferred name" value={preferredName} onChange={setPreferredName} testId="basics-preferredName" />
        <Field label="Pronouns" value={pronouns} onChange={setPronouns} testId="basics-pronouns" />
        <Field label="Email" type="email" value={email} onChange={setEmail} testId="basics-email" required />
        <Field label="Phone country code" value={phonePrefix} onChange={setPhonePrefix} testId="basics-phonePrefix" placeholder="+1" />
        <Field label="Phone" type="tel" value={phone} onChange={setPhone} testId="basics-phone" />
        {dobGateOpen ? (
          <Field label="Date of birth" type="date" value={dateOfBirth} onChange={setDateOfBirth} testId="basics-dateOfBirth" />
        ) : (
          <p className="col-span-2 text-xs text-slate-500">
            Date of birth is hidden. Enable it in Consents below if you need it auto-filled on applications that ask.
          </p>
        )}
        <Field label="Website URL" value={url} onChange={setUrl} testId="basics-url" />
        <Field label="Headline" value={label} onChange={setLabel} testId="basics-label" />
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="basics-summary">Summary</label>
          <textarea
            id="basics-summary"
            data-testid="basics-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <fieldset className="col-span-2 mt-2 space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-600">Location</legend>
          <Field label="Address" value={address} onChange={setAddress} testId="basics-location-address" />
          <Field label="City" value={city} onChange={setCity} testId="basics-location-city" />
          <Field label="Region / State" value={region} onChange={setRegion} testId="basics-location-region" />
          <Field label="Country code (ISO alpha-2)" value={countryCode} onChange={(v) => setCountryCode(v.toUpperCase().slice(0, 2))} testId="basics-location-countryCode" placeholder="US" />
          <Field label="Postal code" value={postalCode} onChange={setPostalCode} testId="basics-location-postalCode" />
        </fieldset>
        <div className="col-span-2 mt-2 flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Save basics</button>
        </div>
      </form>
    </section>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly testId: string;
  readonly type?: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly placeholder?: string;
}

function Field({ label, value, onChange, testId, type = 'text', required, readOnly, placeholder }: FieldProps): JSX.Element {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        data-testid={testId}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 read-only:bg-slate-50"
      />
    </label>
  );
}
```

### 6.11 Step 11 -- LegalAuthSection (4x4 matrix)

**File**: `entrypoints/options/sections/LegalAuthSection.tsx` (CREATE, ~165 LoC)

Design:
- Initial state built from `profile.jobPreferences.workAuthorization` or `createEmptyWorkAuth()` if missing.
- 4 jurisdictions (`US`, `UK`, `EU`, `Canada`) x 4 flags (`authorized`, `requiresVisa`, `requiresSponsorship`, `legallyAllowed`) = 16 checkboxes.
- Each cell is a labeled checkbox with `data-testid="legal-${region}-${flag}"`.
- On submit, the section constructs `patch.jobPreferences.workAuthorization` ONLY. Does NOT touch `salaryExpectation`, `availabilityDate`, `willingTo*` flags (PreferencesSection owns those).
- Each patch path: `onSave({ jobPreferences: { ...profile.jobPreferences, workAuthorization: newArray } })`.

```tsx
import { useState } from 'react';
import type { Profile, JurisdictionAuthorization } from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';
import { createEmptyWorkAuth } from '../util/createEmptyWorkAuth.js';

type Region = 'US' | 'UK' | 'EU' | 'Canada';
type Flag = 'authorized' | 'requiresVisa' | 'requiresSponsorship' | 'legallyAllowed';

const REGIONS: ReadonlyArray<Region> = ['US', 'UK', 'EU', 'Canada'];
const FLAGS: ReadonlyArray<{ key: Flag; label: string }> = [
  { key: 'authorized', label: 'Authorized to work' },
  { key: 'requiresVisa', label: 'Requires a visa' },
  { key: 'requiresSponsorship', label: 'Requires sponsorship' },
  { key: 'legallyAllowed', label: 'Legally allowed' },
];

interface LegalAuthSectionProps {
  readonly profile: Profile | null;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
}

export function LegalAuthSection({ profile, onSave }: LegalAuthSectionProps): JSX.Element {
  const initial = profile?.jobPreferences.workAuthorization ?? createEmptyWorkAuth();
  const byRegion = new Map<Region, JurisdictionAuthorization>();
  for (const auth of initial) byRegion.set(auth.region as Region, auth);
  for (const region of REGIONS) {
    if (!byRegion.has(region)) {
      byRegion.set(region, {
        region,
        authorized: false,
        requiresVisa: false,
        requiresSponsorship: false,
        legallyAllowed: false,
      });
    }
  }

  const [matrix, setMatrix] = useState<ReadonlyMap<Region, JurisdictionAuthorization>>(byRegion);

  const toggle = (region: Region, flag: Flag): void => {
    const next = new Map(matrix);
    const current = next.get(region);
    if (!current) return;
    next.set(region, { ...current, [flag]: !current[flag] });
    setMatrix(next);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const workAuthorization: ReadonlyArray<JurisdictionAuthorization> = REGIONS.map(
      (region) => matrix.get(region)!,
    );
    const existingPrefs = profile?.jobPreferences ?? createEmptyProfile().jobPreferences;
    const patch: Partial<Profile> = {
      jobPreferences: { ...existingPrefs, workAuthorization },
    };
    await onSave(patch);
  };

  return (
    <section aria-labelledby="legal-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="legal-heading" className="text-lg font-semibold text-slate-900">Legal work authorization</h2>
      <p className="mt-1 text-xs text-slate-600">Tick every statement that applies. Auto-filled on application forms that ask.</p>
      <form onSubmit={handleSubmit} className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="pb-2 text-xs font-medium text-slate-600">Jurisdiction</th>
              {FLAGS.map((f) => (
                <th key={f.key} scope="col" className="pb-2 text-xs font-medium text-slate-600">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => {
              const row = matrix.get(region)!;
              return (
                <tr key={region}>
                  <th scope="row" className="py-2 pr-4 font-medium text-slate-800">{region}</th>
                  {FLAGS.map((f) => (
                    <td key={f.key} className="py-2 pr-4">
                      <input
                        type="checkbox"
                        checked={row[f.key]}
                        onChange={() => toggle(region, f.key)}
                        data-testid={`legal-${region}-${f.key}`}
                        aria-label={`${region} ${f.label}`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Save legal auth
          </button>
        </div>
      </form>
    </section>
  );
}
```

### 6.12 Step 12 -- PreferencesSection (NO workAuth clobber)

**File**: `entrypoints/options/sections/PreferencesSection.tsx` (CREATE, ~180 LoC)

The critical correctness fix: this section NEVER writes `workAuthorization`. It reads the current workAuthorization read-only from props to display a summary ("authorized in 1 of 4 jurisdictions") and only sends patches for its own fields. The `updateProfile` adapter shallow-merges the `jobPreferences` sub-object, so building `patch.jobPreferences` by spreading the current `existingPrefs` (which contains the up-to-date workAuthorization after the composite remount) and overwriting only the preferences-owned fields preserves the freshly-saved legal auth.

```tsx
import { useState } from 'react';
import type {
  Profile,
  JobPreferences,
  SalaryExpectation,
  RemotePreference,
} from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';

interface PreferencesSectionProps {
  readonly profile: Profile | null;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
}

const REMOTE_OPTIONS: ReadonlyArray<RemotePreference> = ['remote', 'hybrid', 'onsite', 'any'];
const CURRENCIES: ReadonlyArray<string> = ['USD', 'GBP', 'EUR', 'CAD'];
const PERIODS: ReadonlyArray<SalaryExpectation['period']> = ['hour', 'month', 'year'];

export function PreferencesSection({ profile, onSave }: PreferencesSectionProps): JSX.Element {
  const existingPrefs: JobPreferences =
    profile?.jobPreferences ?? createEmptyProfile().jobPreferences;

  const [salaryMin, setSalaryMin] = useState<number>(existingPrefs.salaryExpectation.min);
  const [salaryMax, setSalaryMax] = useState<number>(existingPrefs.salaryExpectation.max);
  const [currency, setCurrency] = useState<string>(existingPrefs.salaryExpectation.currency);
  const [period, setPeriod] = useState<SalaryExpectation['period']>(existingPrefs.salaryExpectation.period);
  const [availabilityDate, setAvailabilityDate] = useState<string>(existingPrefs.availabilityDate);
  const [willingToRelocate, setWillingToRelocate] = useState<boolean>(existingPrefs.willingToRelocate);
  const [remotePreference, setRemotePreference] = useState<RemotePreference>(existingPrefs.remotePreference);
  const [willingToCompleteAssessments, setWillingToCompleteAssessments] = useState<boolean>(existingPrefs.willingToCompleteAssessments);
  const [willingToUndergoDrugTests, setWillingToUndergoDrugTests] = useState<boolean>(existingPrefs.willingToUndergoDrugTests);
  const [willingToUndergoBackgroundChecks, setWillingToUndergoBackgroundChecks] = useState<boolean>(existingPrefs.willingToUndergoBackgroundChecks);

  const authorizedCount = existingPrefs.workAuthorization.filter((a) => a.authorized).length;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    // CRITICAL: we spread existingPrefs (which already holds the freshly-
    // saved workAuthorization after the composite-key remount) and overwrite
    // ONLY the fields this section owns. workAuthorization is intentionally
    // preserved by the spread, never re-declared.
    const patch: Partial<Profile> = {
      jobPreferences: {
        ...existingPrefs,
        salaryExpectation: { min: salaryMin, max: salaryMax, currency, period },
        availabilityDate,
        willingToRelocate,
        remotePreference,
        willingToCompleteAssessments,
        willingToUndergoDrugTests,
        willingToUndergoBackgroundChecks,
      },
    };
    await onSave(patch);
  };

  return (
    <section aria-labelledby="prefs-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="prefs-heading" className="text-lg font-semibold text-slate-900">Job preferences</h2>
      <p className="mt-1 text-xs text-slate-600">
        Authorized in {authorizedCount} of 4 jurisdictions. Edit the matrix above to change.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
        <fieldset className="col-span-2 grid grid-cols-4 gap-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-600">Salary expectation</legend>
          <label className="text-sm">
            Min
            <input type="number" min={0} step={1} value={salaryMin} onChange={(e) => setSalaryMin(Number(e.target.value))} data-testid="prefs-salary-min" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            Max
            <input type="number" min={0} step={1} value={salaryMax} onChange={(e) => setSalaryMax(Number(e.target.value))} data-testid="prefs-salary-max" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="prefs-salary-currency" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value as SalaryExpectation['period'])} data-testid="prefs-salary-period" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1">
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </fieldset>
        <label className="text-sm">
          Availability date
          <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} data-testid="prefs-availabilityDate" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Remote preference
          <select value={remotePreference} onChange={(e) => setRemotePreference(e.target.value as RemotePreference)} data-testid="prefs-remotePreference" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {REMOTE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <Toggle label="Willing to relocate" checked={willingToRelocate} onChange={setWillingToRelocate} testId="prefs-willingToRelocate" />
        <Toggle label="Willing to complete assessments" checked={willingToCompleteAssessments} onChange={setWillingToCompleteAssessments} testId="prefs-willingToCompleteAssessments" />
        <Toggle label="Willing to undergo drug tests" checked={willingToUndergoDrugTests} onChange={setWillingToUndergoDrugTests} testId="prefs-willingToUndergoDrugTests" />
        <Toggle label="Willing to undergo background checks" checked={willingToUndergoBackgroundChecks} onChange={setWillingToUndergoBackgroundChecks} testId="prefs-willingToUndergoBackgroundChecks" />
        <div className="col-span-2 mt-2 flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Save preferences
          </button>
        </div>
      </form>
    </section>
  );
}

interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly testId: string;
}

function Toggle({ label, checked, onChange, testId }: ToggleProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}
```

### 6.13 Step 13 -- DemographicsSection (EEO-gated, opt-in)

**File**: `entrypoints/options/sections/DemographicsSection.tsx` (CREATE, ~160 LoC)

Design:
- Section is rendered by `App.tsx` ONLY when `profile?.consents.allowEeoAutofill === true`. When gate is off, the entire section is unmounted.
- `gender`, `race`, `veteranStatus`, `disabilityStatus` as select inputs with `'decline_to_answer'` as the default for every field when undefined on the profile.
- On submit patches only `demographics`, never `consents`.
- Type imports from `ats-autofill-engine/profile` for `Gender`, `Race`, `VeteranStatus`, `DisabilityStatus`.

```tsx
import { useState } from 'react';
import type {
  Profile,
  Gender,
  Race,
  VeteranStatus,
  DisabilityStatus,
} from 'ats-autofill-engine/profile';

const GENDER_OPTIONS: ReadonlyArray<Gender> = ['male', 'female', 'non_binary', 'decline_to_answer'];
const RACE_OPTIONS: ReadonlyArray<Race> = [
  'american_indian_or_alaska_native',
  'asian',
  'black_or_african_american',
  'hispanic_or_latino',
  'native_hawaiian_or_pacific_islander',
  'white',
  'two_or_more_races',
  'decline_to_answer',
];
const VETERAN_OPTIONS: ReadonlyArray<VeteranStatus> = [
  'veteran',
  'not_a_veteran',
  'decline_to_answer',
];
const DISABILITY_OPTIONS: ReadonlyArray<DisabilityStatus> = [
  'yes',
  'no',
  'decline_to_answer',
];

interface DemographicsSectionProps {
  readonly profile: Profile | null;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
}

export function DemographicsSection({ profile, onSave }: DemographicsSectionProps): JSX.Element {
  const initial = profile?.demographics ?? {};
  const [gender, setGender] = useState<Gender>(initial.gender ?? 'decline_to_answer');
  const [race, setRace] = useState<Race>(initial.race ?? 'decline_to_answer');
  const [veteranStatus, setVeteranStatus] = useState<VeteranStatus>(
    initial.veteranStatus ?? 'decline_to_answer',
  );
  const [disabilityStatus, setDisabilityStatus] = useState<DisabilityStatus>(
    initial.disabilityStatus ?? 'decline_to_answer',
  );

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const patch: Partial<Profile> = {
      demographics: {
        gender,
        race,
        veteranStatus,
        disabilityStatus,
      },
    };
    await onSave(patch);
  };

  return (
    <section aria-labelledby="demo-heading" className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <h2 id="demo-heading" className="text-lg font-semibold text-slate-900">Demographics (EEO, optional)</h2>
      <p className="mt-1 text-xs text-slate-700">
        US federal contractors are required to ask these questions. You can always decline to answer. Stored locally; only auto-filled on applications that ask and only when the EEO consent toggle is on.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
        <label className="text-sm">
          Gender
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} data-testid="demo-gender" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {GENDER_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Race or ethnicity
          <select value={race} onChange={(e) => setRace(e.target.value as Race)} data-testid="demo-race" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {RACE_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Veteran status
          <select value={veteranStatus} onChange={(e) => setVeteranStatus(e.target.value as VeteranStatus)} data-testid="demo-veteranStatus" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {VETERAN_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Disability status
          <select value={disabilityStatus} onChange={(e) => setDisabilityStatus(e.target.value as DisabilityStatus)} data-testid="demo-disabilityStatus" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {DISABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <div className="col-span-2 mt-2 flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Save demographics
          </button>
        </div>
      </form>
    </section>
  );
}
```

### 6.14 Step 14 -- ConsentSection

**File**: `entrypoints/options/sections/ConsentSection.tsx` (CREATE, ~95 LoC)

- 4 checkboxes: `privacyPolicy`, `marketing`, `allowEeoAutofill`, `allowDobAutofill`.
- On submit patches `consents` only.
- Because toggling `allowEeoAutofill` affects whether `DemographicsSection` is mounted, AND toggling `allowDobAutofill` affects whether `BasicsSection` renders the DOB input, the section's save triggers a reload which ticks `updatedAtMs` which remounts every section with the new consent flags.

```tsx
import { useState } from 'react';
import type { Profile, Consents } from 'ats-autofill-engine/profile';

interface ConsentSectionProps {
  readonly profile: Profile | null;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
}

const EMPTY_CONSENTS: Consents = {
  privacyPolicy: false,
  marketing: false,
  allowEeoAutofill: false,
  allowDobAutofill: false,
};

export function ConsentSection({ profile, onSave }: ConsentSectionProps): JSX.Element {
  const initial = profile?.consents ?? EMPTY_CONSENTS;
  const [privacyPolicy, setPrivacyPolicy] = useState<boolean>(initial.privacyPolicy);
  const [marketing, setMarketing] = useState<boolean>(initial.marketing);
  const [allowEeoAutofill, setAllowEeoAutofill] = useState<boolean>(initial.allowEeoAutofill);
  const [allowDobAutofill, setAllowDobAutofill] = useState<boolean>(initial.allowDobAutofill);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const patch: Partial<Profile> = {
      consents: { privacyPolicy, marketing, allowEeoAutofill, allowDobAutofill },
    };
    await onSave(patch);
  };

  return (
    <section aria-labelledby="consent-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="consent-heading" className="text-lg font-semibold text-slate-900">Consents</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Check label="I have read the privacy policy" checked={privacyPolicy} onChange={setPrivacyPolicy} testId="consent-privacyPolicy" />
        <Check label="OK to receive product updates by email" checked={marketing} onChange={setMarketing} testId="consent-marketing" />
        <Check label="Allow EEO fields to be auto-filled (opt-in)" checked={allowEeoAutofill} onChange={setAllowEeoAutofill} testId="consent-allowEeoAutofill" />
        <Check label="Allow date of birth to be auto-filled (opt-in)" checked={allowDobAutofill} onChange={setAllowDobAutofill} testId="consent-allowDobAutofill" />
        <div className="flex justify-end">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Save consents
          </button>
        </div>
      </form>
    </section>
  );
}

interface CheckProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly testId: string;
}

function Check({ label, checked, onChange, testId }: CheckProps): JSX.Element {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
      <span className="text-slate-800">{label}</span>
    </label>
  );
}
```

### 6.15 Step 15 -- JsonResumeDropzone

**File**: `entrypoints/options/JsonResumeDropzone.tsx` (CREATE, ~135 LoC)

Design:
- Drag-drop zone with `onDragOver`, `onDrop`, `onDragLeave`.
- `<input type="file" accept="application/json" />` fallback, hidden visually.
- Keyboard operable: the drop zone is a `<button type="button">` that opens the file input on click, Enter, or Space.
- 10 MB size cap enforced client-side by `App.tsx` (see §6.9); the dropzone passes any size through.
- `application/json` MIME check; non-JSON extensions rejected with a user-facing error before calling `onUpload`.
- Displays the current `uploadState` as a toast-style banner below the drop zone.
- `aria-describedby` wires the errors list to the drop zone for screen readers.

```tsx
import { useRef, useState } from 'react';

type UploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'parsing' }
  | { readonly kind: 'validated' }
  | {
      readonly kind: 'errors';
      readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
    };

interface JsonResumeDropzoneProps {
  readonly onUpload: (file: File) => Promise<void>;
  readonly state: UploadState;
}

export function JsonResumeDropzone({ onUpload, state }: JsonResumeDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = (files: FileList | null): void => {
    setLocalError(null);
    if (!files || files.length === 0) return;
    const file = files[0]!;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setLocalError('Only .json files are supported. Rename the file or export from your resume tool.');
      return;
    }
    if (file.type && file.type !== 'application/json' && file.type !== 'text/json') {
      setLocalError(`Unexpected MIME type: ${file.type}. Expected application/json.`);
      return;
    }
    void onUpload(file);
  };

  const openPicker = (): void => inputRef.current?.click();

  return (
    <section aria-labelledby="upload-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="upload-heading" className="text-lg font-semibold text-slate-900">Upload JSON Resume</h2>
      <p className="mt-1 text-xs text-slate-600">
        Drop a .json file or click to browse. Max 10 MB. Your work history, education, and skills get replaced wholesale; everything else is preserved.
      </p>
      <button
        type="button"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        aria-describedby="upload-errors"
        data-testid="dropzone"
        className={`mt-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed px-8 py-12 text-sm transition ${
          dragActive
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
        }`}
      >
        <span className="font-medium">Drag and drop your JSON Resume here, or click to browse.</span>
        <span className="mt-2 text-xs text-slate-500">.json only, 10 MB max</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid="dropzone-input"
        className="sr-only"
      />
      <div id="upload-errors" role="alert" aria-live="polite" className="mt-3 space-y-1 text-sm">
        {localError ? <p className="text-red-700">{localError}</p> : null}
        {state.kind === 'parsing' ? <p className="text-slate-600">Parsing...</p> : null}
        {state.kind === 'validated' ? <p className="text-green-700">Uploaded and merged.</p> : null}
        {state.kind === 'errors'
          ? state.errors.map((err, i) => (
              <p key={i} className="text-red-700">
                <code className="mr-1 rounded bg-red-50 px-1">{err.path}</code>
                {err.message}
              </p>
            ))
          : null}
      </div>
    </section>
  );
}
```

### 6.16 Step 16 -- ConfirmClearModal

**File**: `entrypoints/options/ConfirmClearModal.tsx` (CREATE, ~95 LoC)

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="confirm-clear-title"`, `aria-describedby="confirm-clear-body"`.
- Manual focus-trap using `useRef` + `useEffect` that redirects Tab key events within the dialog. We do not pull in `focus-trap-react` as a dep (~20 KB extra) because the behavior is 15 lines.
- ESC key closes the dialog.
- Backdrop click closes the dialog.
- Two buttons: "Cancel" (default focus on mount) and "Clear" (destructive styling).

```tsx
import { useEffect, useRef } from 'react';

interface ConfirmClearModalProps {
  readonly onConfirm: () => Promise<void>;
  readonly onCancel: () => void;
}

export function ConfirmClearModal({ onConfirm, onCancel }: ConfirmClearModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return (): void => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      data-testid="confirm-clear-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-clear-title"
        aria-describedby="confirm-clear-body"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-clear-title" className="text-lg font-semibold text-slate-900">
          Clear profile?
        </h2>
        <p id="confirm-clear-body" className="mt-2 text-sm text-slate-700">
          This removes every field in your profile from this browser. You cannot undo this.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            data-testid="confirm-clear-cancel"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            data-testid="confirm-clear-ok"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 6.16a Step 16a -- createEmptyWorkAuth utility

**File**: `entrypoints/options/util/createEmptyWorkAuth.ts` (CREATE, ~30 LoC)

```ts
import type { JurisdictionAuthorization } from 'ats-autofill-engine/profile';

const REGIONS: ReadonlyArray<'US' | 'UK' | 'EU' | 'Canada'> = ['US', 'UK', 'EU', 'Canada'];

export function createEmptyWorkAuth(): ReadonlyArray<JurisdictionAuthorization> {
  return REGIONS.map((region) => ({
    region,
    authorized: false,
    requiresVisa: false,
    requiresSponsorship: false,
    legallyAllowed: false,
  }));
}
```

### 6.16b Step 16b -- formatZodError utility

**File**: `entrypoints/options/util/formatZodError.ts` (CREATE, ~45 LoC)

```ts
import type { ZodError } from 'zod';

export interface FormattedError {
  readonly path: string;
  readonly message: string;
  readonly prettyPath: string;
}

/**
 * Format a ZodError into user-facing error objects. `path` is dot-joined
 * for matching against a section's `data-testid`; `prettyPath` is
 * human-readable ("Basics / First name" instead of "basics.firstName").
 */
export function formatZodError(error: ZodError): ReadonlyArray<FormattedError> {
  return error.issues.map((issue) => {
    const rawPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return {
      path: rawPath,
      prettyPath: humanizePath(rawPath),
      message: issue.message,
    };
  });
}

function humanizePath(path: string): string {
  if (path === '(root)') return 'Profile';
  return path
    .split('.')
    .map((segment) =>
      segment
        .replace(/([A-Z])/g, ' $1')
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim(),
    )
    .join(' / ');
}
```

### 6.16c Step 16c -- useProfileSaver hook

**File**: `entrypoints/options/hooks/useProfileSaver.ts` (CREATE, ~55 LoC)

```ts
import { useCallback, useState } from 'react';
import { sendMessage } from '@/src/background/messaging/protocol.js';
import type { Profile } from 'ats-autofill-engine/profile';
import { createLogger } from '@/src/background/log.js';

const log = createLogger('options-useProfileSaver');

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly at: number }
  | { readonly kind: 'error'; readonly message: string };

export interface UseProfileSaverResult {
  readonly state: SaveState;
  readonly save: (patch: Partial<Profile>) => Promise<boolean>;
  readonly reset: () => void;
}

export function useProfileSaver(): UseProfileSaverResult {
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  const save = useCallback(async (patch: Partial<Profile>): Promise<boolean> => {
    setState({ kind: 'saving' });
    try {
      const response = await sendMessage('PROFILE_UPDATE', { patch });
      if (response.ok) {
        setState({ kind: 'saved', at: Date.now() });
        return true;
      }
      const message = response.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ');
      setState({ kind: 'error', message });
      return false;
    } catch (err) {
      log.error('save failed', err);
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const reset = useCallback((): void => {
    setState({ kind: 'idle' });
  }, []);

  return { state, save, reset };
}
```

### 6.17 Step 17 -- vitest.config per-project environment

**File**: `vitest.config.ts` (MODIFY)

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['tests/entrypoints/options/**', 'jsdom'],
      ['tests/background/**', 'node'],
      ['tests/content/**', 'jsdom'],
    ],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        'src/background/**': { lines: 80, branches: 75, functions: 80, statements: 80 },
        'entrypoints/**': { lines: 70, branches: 65, functions: 70, statements: 70 },
      },
      exclude: ['**/*.d.ts', '**/blueprint.contract.ts', '**/*.spec.ts', '**/*.spec.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
```

The `environmentMatchGlobs` split ensures A5's existing background tests continue running under `node` (fast, no DOM overhead) while A7's React tests get `jsdom`. This addresses the reviewer's explicit concern about a global environment flip breaking A5.

The `setupFiles` runs for every project and imports `@testing-library/jest-dom/vitest` + `@webext-core/fake-browser`. The setup file is no-op on `node` tests because the jest-dom matchers are only consumed by React tests.

### 6.18 Step 18 -- tests/setup.ts

**File**: `tests/setup.ts` (CREATE)

```ts
import '@testing-library/jest-dom/vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';

// @ts-expect-error -- wxt/browser resolves to the chrome/browser global in tests
globalThis.browser = fakeBrowser;
// @ts-expect-error -- legacy chrome API shim
globalThis.chrome = fakeBrowser;

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
});
```

---

## 7. Tests

### 7.1 tests/background/profile/adapter.spec.ts (18 cases, ~320 LoC)

Cases (every case constructs a fresh adapter via `createProfileAdapter` with fake `readStorage` / `writeStorage` / `now` / `logger`):

1. `readProfile()` returns `null` when storage is empty.
2. `readProfile()` returns a valid `Profile` when storage contains a well-formed record (fixture: full Ada profile).
3. `readProfile()` returns `null` when storage contains corrupt JSON (malformed object that fails `ProfileSchema.safeParse`).
4. `readProfile()` returns `null` when storage contains `{ __proto__: { isAdmin: true } }` prototype-pollution payload (safeParse rejects).
5. `readProfile()` restores `updatedAtMs` from the raw record after safeParse strips unknown fields.
6. `writeProfile()` throws `ZodError` when called with an invalid email.
7. `writeProfile()` throws `ZodError` when called with a missing required field (`basics.firstName`).
8. `writeProfile()` stamps `updatedAtMs: now()` on the persisted record.
9. `writeProfile()` called twice with different `now` stamps produces different `updatedAtMs` values.
10. `writeProfile()` rejects a profile with `<script>alert(1)</script>` in `basics.summary` -- HTML is permitted by the schema (no XSS at the storage layer), so this test asserts the string round-trips intact (the test documents that A7 does not sanitize; the rendering layer in A10/popup is responsible for escaping).
11. `writeProfile()` accepts an empty `workAuthorization` array (per B2 schema, empty array is valid).
12. `writeProfile()` rejects duplicate `basics.profiles` entries with identical `network` + `url` (documents the schema behavior; if B2 does not reject duplicates, the test asserts they round-trip without dedup).
13. `writeProfile()` accepts unicode firstName with combining characters (`'Éloïse\u0301'`) and round-trips byte-exact.
14. `updateProfile()` shallow-merges `basics` correctly (adding `preferredName` preserves `firstName`).
15. `updateProfile()` called without an existing profile uses `createEmptyProfile()` as the base.
16. `updateProfile()` two concurrent writes serialize correctly (await the first before reading).
17. `clearProfile()` removes the key entirely (`readProfile()` returns `null` afterward).
18. `clearProfile()` is a no-op when the key does not exist (no throw).

### 7.2 tests/background/profile/json-resume-merge.spec.ts (10 cases, ~220 LoC)

1. `mergeJsonResume({ existing: null, incoming: null })` returns `createEmptyProfile()` unchanged.
2. `mergeJsonResume({ existing: null, incoming: validJsonResume })` returns the merged profile with `work[]`, `education[]`, `basics.email` populated.
3. `mergeJsonResume({ existing: adaWithFirst, incoming: resume with basics.name = 'Ada Lovelace' })` -- existing has firstName='Ada', lastName=''; resume has name='Ada Lovelace'. **Reviewer fix verification**: merged lastName === 'Lovelace', merged firstName === 'Ada' (unchanged).
4. `mergeJsonResume({ existing: adaWithLast, incoming: resume with basics.name = 'Ada Lovelace' })` -- existing has firstName='', lastName='Lovelace'; resume has name='Ada Lovelace'. Merged firstName === 'Ada', merged lastName === 'Lovelace'.
5. `mergeJsonResume({ existing: adaFull, incoming: resume with basics.name = 'Jane Smith' })` -- existing has both halves populated. Merged firstName === 'Ada', merged lastName === 'Lovelace' (NO clobber).
6. `mergeJsonResume({ existing: null, incoming: resume with basics.name = 'Éloïse\u0301 O\'Brien' })` -- unicode combining char + apostrophe, split preserves byte-exact.
7. `mergeJsonResume({ existing: null, incoming: resume with basics.location = 42 })` -- malformed location, runtime guard falls back to existing location.
8. `mergeJsonResume({ existing: null, incoming: resume with basics.profiles = 'not-an-array' })` -- malformed profiles, runtime guard falls back to existing profiles.
9. `mergeJsonResume({ existing: withATSExtensions, incoming: resume })` -- verifies `jobPreferences`, `demographics`, `consents`, `documents`, `customAnswers` are preserved byte-exact from existing.
10. `mergeJsonResume({ existing: null, incoming: resume with basics.name = 'Cher' })` -- single-token name, splitFullName returns `{first: 'Cher', last: ''}`.

### 7.3 tests/background/profile/handlers.spec.ts (9 cases, ~250 LoC)

1. `handleProfileGet()` returns `null` when storage empty.
2. `handleProfileGet()` returns populated profile after `profileAdapter.writeProfile()`.
3. `handleProfileGet()` returns `null` and logs on corrupt storage (does not throw).
4. `handleProfileUpdate({ patch: basicsOnly })` returns `{ ok: true }` and persists the merge.
5. `handleProfileUpdate({ patch: {} })` returns `{ ok: true }` and is a no-op save (still stamps `updatedAtMs`).
6. `handleProfileUpdate({ patch: { basics: { email: 'not-an-email' } } })` returns `{ ok: false, errors: [...] }` without persisting.
7. `handleProfileUploadJsonResume({ raw: validJsonResume })` returns `{ ok: true, profile }` and persists.
8. `handleProfileUploadJsonResume({ raw: { basics: { email: 'bad' } } })` returns `{ ok: false, errors }`.
9. `handleProfileUploadJsonResume({ raw: validJsonResume })` stamps `updatedAtMs: now()` on the persisted profile.

### 7.4 tests/background/profile/a8-contract-integration.spec.ts (~120 LoC)

The A8-contract integration test -- this is the test that would have caught the original v2.0 break:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { createProfileAdapter, PROFILE_KEY } from '@/src/background/profile/adapter.js';
import { ProfileSchema, createEmptyProfile } from 'ats-autofill-engine/profile';

describe('A7 -> A8 contract: what A8 will read', () => {
  beforeEach(() => { fakeBrowser.reset(); });

  it('A7 writes a shape that A8 can safeParse', async () => {
    const adapter = createProfileAdapter({
      readStorage: async (k) => (await fakeBrowser.storage.local.get(k))[k],
      writeStorage: async (k, v) => fakeBrowser.storage.local.set({ [k]: v }),
      removeStorage: async (k) => fakeBrowser.storage.local.remove(k),
      now: () => 1744848000000,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const empty = createEmptyProfile();
    const populated = {
      ...empty,
      basics: {
        ...empty.basics,
        firstName: 'Ada',
        lastName: 'Lovelace',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '5551234567',
        phonePrefix: '+44',
        location: { address: '', city: 'London', region: '', countryCode: 'GB', postalCode: '' },
      },
    };
    await adapter.writeProfile(populated);

    // Now simulate A8's reader: browser.storage.local.get + safeParse
    const raw = (await fakeBrowser.storage.local.get(PROFILE_KEY))[PROFILE_KEY];
    const result = ProfileSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.profileVersion).toBe('1.0');
    expect(result.data.basics.firstName).toBe('Ada');
    expect(result.data.basics.lastName).toBe('Lovelace');
    expect(result.data.basics.email).toBe('ada@example.com');
    expect(result.data.basics.location.countryCode).toBe('GB');
    expect((raw as { updatedAtMs: number }).updatedAtMs).toBe(1744848000000);
  });

  it('A7 writes an empty profile that A8 will treat as "first-run"', async () => {
    const adapter = createProfileAdapter({ /* ... */ });
    await adapter.writeProfile(createEmptyProfile());
    const raw = (await fakeBrowser.storage.local.get(PROFILE_KEY))[PROFILE_KEY];
    const result = ProfileSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // A8 checks `basics.firstName === '' && basics.lastName === ''` to decide "empty"
    expect(result.data.basics.firstName).toBe('');
    expect(result.data.basics.lastName).toBe('');
  });
});
```

### 7.5 tests/entrypoints/options/App.integration.spec.tsx (5 cases, ~340 LoC)

Cases:

1. **Happy path save**: render `<App />`, wait for `useProfile` to resolve (fake returns empty profile), fill `basics-firstName` = 'Ada', `basics-lastName` = 'Lovelace', `basics-email` = 'ada@example.com', click "Save basics", assert `PROFILE_UPDATE` was called with `{ patch: { basics: { firstName: 'Ada', ... } } }`, assert reload is called, assert saveState reads "Saved.".
2. **Upload flow**: render `<App />`, drop a valid JSON Resume file on the dropzone, assert `PROFILE_UPLOAD_JSON_RESUME` was called with the parsed raw, assert success toast shown.
3. **Clear flow with confirmation**: render `<App />`, click "Clear profile", confirm modal appears with `role="dialog"`, click "Clear" button, assert `PROFILE_UPDATE` was called with the empty profile patch, assert reload is called, assert sections re-render with empty state.
4. **Sign-out preserves profile**: render `<App />` with a populated profile, click "Sign out", assert `AUTH_SIGN_OUT` was called, assert `PROFILE_CLEAR`/`PROFILE_UPDATE` was NOT called, assert the profile state is unchanged (no reload triggered for profile).
5. **External storage change forces remount**: render `<App />`, simulate a `browser.storage.onChanged` event for `llmc.profile.v1`, assert `useProfile.reload` is called, assert sections are remounted with the new profile (verified by inspecting a data-testid on a section that changed its display based on `profile.updatedAtMs`).

### 7.6 tests/entrypoints/options/BasicsSection.spec.tsx (8 cases, ~240 LoC)

1. Renders with `profile === null` shows empty inputs.
2. Renders with populated profile shows firstName/lastName/email/phone prefilled.
3. `basics-phonePrefix` input accepts `+44`.
4. DOB input is HIDDEN when `profile.consents.allowDobAutofill === false`.
5. DOB input is VISIBLE when `profile.consents.allowDobAutofill === true`.
6. Typing in `basics-firstName` updates the derived `basics-name` read-only display.
7. `basics-location-countryCode` input uppercases and clamps to 2 chars (`us` -> `US`, `United States` -> `UN`).
8. On submit with valid values, `onSave` is called with a patch containing only `basics` (no `jobPreferences`, no `demographics`).

### 7.7 tests/entrypoints/options/LegalAuthSection.spec.tsx (~200 LoC)

16-cell matrix test: iterate over all 16 `data-testid="legal-${region}-${flag}"` cells, assert each is present, click each, assert state toggles, click save, assert `onSave` patch contains the correct `workAuthorization` array with the toggled cell flipped and all other cells unchanged.

Additional cases: section renders default (all false) when `profile.jobPreferences.workAuthorization` is undefined; patches NEVER contain `salaryExpectation` or other PreferencesSection fields.

### 7.8 tests/entrypoints/options/PreferencesSection.spec.tsx (~210 LoC)

Critical test: **data-loss bug regression**. Setup a profile with `workAuthorization: [US=true, UK=true, ...]`, render `<PreferencesSection />`, type in salary fields, click save, intercept the `onSave` patch, assert `patch.jobPreferences.workAuthorization` is **undefined** (i.e. PreferencesSection does not touch workAuthorization). Follow-up assertion: simulate the adapter receiving the patch and merging it via `updateProfile` -- assert the resulting profile still has `workAuthorization: [US=true, UK=true, ...]`.

Additional cases: salary min>=0 enforcement, availability date format validation, all `willingTo*` toggles emit correct boolean patches, remotePreference select covers all 4 values.

### 7.9 tests/entrypoints/options/DemographicsSection.spec.tsx (~180 LoC)

1. Section not rendered when `consents.allowEeoAutofill === false` (assertion on `<App />`-level test).
2. Section rendered when `consents.allowEeoAutofill === true`.
3. Defaults to `decline_to_answer` for every field when profile has no demographics.
4. Setting gender to 'female' and saving emits `patch.demographics.gender === 'female'`.
5. Saving demographics does NOT emit a `consents` patch.
6. Unicode in a demographics field (e.g. race description) round-trips.

### 7.10 Fixtures

- `valid-json-resume.json`: Ada Lovelace, 2 work entries, 1 education, 5 skills, valid email, valid URL.
- `invalid-json-resume.json`: `basics.email = "not-an-email"`, missing `basics.name`.
- `big-json-resume.json`: generated at test time via `JSON.stringify({ ...empty, summary: 'x'.repeat(11 * 1024 * 1024) })`, not committed.

### 7.11 D19 adversarial test categories (cross-reference)

| D19 category | Covered by |
|---|---|
| 1. null/undefined/NaN/Infinity | adapter.spec cases 1, 3, 4; merge.spec case 1 |
| 2. Empty + max-size | adapter.spec case 11; App.integration upload-10-MB test |
| 3. Unicode edge cases | adapter.spec case 13; merge.spec case 6; DemographicsSection case 6 |
| 4. Injection | adapter.spec case 10 (`<script>` tag); merge.spec runtime guards |
| 5. Concurrent re-entry | adapter.spec case 16 (two concurrent writes) |
| 6. Adversarial state | adapter.spec case 4 (`__proto__` injection); adapter.spec case 3 (corrupt storage) |

---

## 8. Acceptance criteria

### 8.1 Hard gates (all MUST pass)

1. `pnpm typecheck` exits 0. Every file compiles against the current `ats-autofill-engine@0.1.0-alpha.1` types.
2. `pnpm test` exits 0. All 83 new test cases pass. Existing A5 tests still pass.
3. `pnpm test -- --coverage` reports `src/background/profile/**` >= 85% line coverage, `entrypoints/options/**` >= 70% line coverage per D24.
4. `node -e "import('ats-autofill-engine/profile').then(m => { if (!m.ProfileSchema || !m.createEmptyProfile) process.exit(1); })"` exits 0 (D14.3).
5. Type-level protocol contract test `tests/background/messaging/protocol-contract.type-test.ts` (A5 owns, A7 verifies presence of `PROFILE_GET`, `PROFILE_UPDATE`, `PROFILE_UPLOAD_JSON_RESUME`) still compiles after A7's handler swap.
6. `grep -rnE '\bconsole\.(log|info|warn|error|debug)' entrypoints/ src/background/ --exclude-dir=node_modules --exclude-dir=tests` returns ZERO matches (D11 + D14.1).
7. `grep -rln $'\u2014' src/background/profile/ entrypoints/options/ tests/background/profile/ tests/entrypoints/options/ temp/impl/100-chrome-extension-mvp/phase_A7_profile_storage_and_options/` returns ZERO matches (D15 em-dash rule).
8. `grep -rnE 'HighlightRange|IKeywordHighlighter|skill-taxonomy' src/background/profile/ entrypoints/options/` returns ZERO matches (D14.1 forbidden tokens).
9. `grep -rn "from 'ats-autofill-engine/profile'" src/background/profile/ entrypoints/options/` returns >= 12 matches (every import of `Profile`, `ProfileSchema`, `createEmptyProfile` from the sub-entry, not the root barrel). This enforces the keystone §4 decision.
10. `grep -rn "src/background/storage/profile" src/ tests/` returns ZERO matches (deleted files have zero references).
11. `grep -rn "ExtensionProfile" src/ tests/` returns ZERO matches outside of A5's `protocol.ts` type alias (A5 owns that).
12. After running the `tests/background/profile/a8-contract-integration.spec.ts` happy path, `ProfileSchema.safeParse(raw)` returns `{ success: true }` and `raw.updatedAtMs` is a number.
13. `pnpm exec node scripts/check-blueprint-contracts.mjs` passes for `src/background/profile/blueprint.contract.ts` (D14.4).
14. Manual smoke (documented in §8.3): open the extension options page in Chrome, upload `valid-json-resume.json`, verify 5 sections populate, verify `chrome.storage.local` contains the full B2 shape at `llmc.profile.v1` (use DevTools > Application > Storage).
15. `scripts/rollback-phase-A7.sh` executes cleanly on a throwaway branch (CI weekly).

### 8.2 Soft gates

- Options page loads in <200 ms on the first paint (measured via `performance.now()` in a smoke test).
- `useProfile` reload in <50 ms for the 100 KB profile shape (measured).
- Zero ESLint warnings under `--max-warnings 0`.
- The options page is operable with keyboard only (no mouse interaction) -- every interactive element is reachable via Tab and activatable via Enter/Space.

### 8.3 Manual smoke (for the Day 4 human verifier)

1. `pnpm dev` in the extension repo; Chrome loads the unpacked extension.
2. Right-click the extension icon -> Options.
3. Upload `tests/entrypoints/options/fixtures/valid-json-resume.json` via drag-drop. Verify success toast.
4. Verify firstName, lastName, email are populated.
5. Type `+44` in phonePrefix, `7700900123` in phone. Click "Save basics". Verify green "Saved." toast.
6. Open Chrome DevTools -> Application -> Storage -> Local Storage -> `chrome-extension://<id>/` -> inspect `llmc.profile.v1`. Verify the record has `profileVersion: '1.0'`, `updatedAtMs: <recent>`, `basics.firstName: 'Ada'`, `basics.phonePrefix: '+44'`, `basics.location.countryCode: <from fixture>`.
7. Toggle "Allow EEO autofill" in Consents; verify Demographics section fades in.
8. Toggle "Allow DOB autofill"; scroll up to Basics; verify DOB input appears.
9. Click "Clear profile" -> Confirm; verify every section resets to empty.
10. Click "Sign out"; verify storage.session tokens cleared but `llmc.profile.v1` still present.

---

## 9. Accessibility

- Every input has a visible label via `<label>` wrap or `htmlFor` association.
- Every form element has a `data-testid` for test selectors.
- The confirm-clear modal is focus-trapped with ESC + backdrop close.
- The dropzone is keyboard-operable (Enter + Space open the file input).
- Error toasts use `role="alert"` and `aria-live="polite"`.
- Color is never the sole indicator of state (saved/error states also use icon + text).
- Each section has `aria-labelledby` pointing at its heading.

---

## 10. Risks + mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `./profile` sub-entry missing from B1 exports map regression | CRITICAL | Acceptance gate 4 (node import resolve) blocks the phase. If the gate fails, halt A7 and file B1 correction. |
| R2 | Jsdom environmentMatchGlobs does not split cleanly on vitest 2.1 | HIGH | §6.17 per-project globs are the documented vitest 2 pattern. Fallback: `@vitest-environment` comment per file. Validated against vitest 2.1 docs. |
| R3 | `ProfileSchema.strict()` rejects the `updatedAtMs` passthrough field | MEDIUM | §6.2 adapter strips and re-attaches updatedAtMs around parse. B2 schema keystone §2.12 explicitly documents the passthrough. If B2 ships `.strict()` without passthrough, A7 must request B2 correction (halt phase). |
| R4 | `createEmptyProfile()` returns a shape that fails `ProfileSchema.parse()` because of a B2 default drift | HIGH | adapter.spec case 15 explicitly tests `writeProfile(createEmptyProfile())`. If it fails, B2 is broken and A7 halts. |
| R5 | Concurrent `updateProfile` writes interleave and lose one write | HIGH | adapter.spec case 16 serializes explicitly. For the POC, the options page is single-user / single-tab and user clicks are gated on `saveState === 'saving'`. v1.1 adds a promise-chain mutex. |
| R6 | The composite-key remount loses unsaved local state across reload | ACCEPTED | Per D10: this is a feature, not a bug. User edits that are not saved are discarded on external storage change. Documented in §9. |
| R7 | JSON Resume upload with 10 MB payload hangs the background worker | MEDIUM | §6.9 enforces `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` client-side in `App.tsx` and rejects oversize files before calling `sendMessage`. Adapter never sees the 10 MB payload. |
| R8 | `__proto__` injection via uploaded JSON poisons adapter state | HIGH | adapter.spec case 4 asserts `__proto__` key is rejected. Zod `.strict()` strips unknown keys and `JSON.parse` handles `__proto__` as a regular property (not the prototype). |
| R9 | `mergeJsonResume` per-half name split backfires on non-Latin names | MEDIUM | merge.spec case 6 covers unicode combining chars. splitFullName uses `\s+` regex which is unicode-safe. For names without a space (single-token), we set only firstName. |
| R10 | ConfirmClearModal focus-trap breaks on Firefox | LOW | POC is Chrome only. Firefox is v1.1. |

---

## 11. Rollback plan

If A7 breaks, roll back via `scripts/rollback-phase-A7.sh`:

```sh
#!/bin/bash
set -euo pipefail

# scripts/rollback-phase-A7.sh -- revert Phase A7 mechanically
# Per D23: rollback is a script, not prose. Tested weekly in CI.

echo "Rolling back Phase A7..."

# Delete the new profile subdir
rm -rf src/background/profile/

# Delete the new options sections
rm -rf entrypoints/options/sections/
rm -f entrypoints/options/App.tsx
rm -f entrypoints/options/JsonResumeDropzone.tsx
rm -f entrypoints/options/ConfirmClearModal.tsx
rm -rf entrypoints/options/hooks/
rm -rf entrypoints/options/util/

# Delete the new tests
rm -rf tests/background/profile/
rm -rf tests/entrypoints/options/

# Revert modified files to the previous commit
git checkout HEAD -- src/background/messaging/handlers.ts
git checkout HEAD -- entrypoints/options/main.tsx
git checkout HEAD -- entrypoints/options/index.html
git checkout HEAD -- vitest.config.ts
git checkout HEAD -- package.json
git checkout HEAD -- pnpm-lock.yaml

# Reinstall dependencies (drops @testing-library/*, jsdom, etc.)
pnpm install

# Verify the rolled-back state compiles
pnpm typecheck

echo "Phase A7 rolled back cleanly."
```

After rollback, the `PROFILE_*` handlers return to A5's `NotImplementedError` stubs. The options page returns to its A1 placeholder. No data loss (`chrome.storage.local['llmc.profile.v1']` retains whatever was last written by a working A7 run, and the A8 reader will safeParse the legacy record if present).

---

## 12. Migration notes

- **From A5 stub to A7 real**: A5's v2.1 plan does NOT ship a profile storage adapter; it only ships `NotImplementedError`-throwing handlers for `PROFILE_*`. Therefore A7 does not need an A5-to-A7 migration path. On first run after A7 deploys, `readProfile()` returns `null` (storage is empty), the options page renders empty sections, and the user fills them in or uploads a JSON Resume.
- **From v2.0 A7 draft to v2.1 A7 final**: if any dev machine has a v2.0 draft record in storage (shape: `{ firstName, lastName, email, phone, updatedAt }`), the v2.1 adapter's `readProfile()` runs `safeParse()`, the parse fails, the record is logged as corrupt, and `null` is returned. The user must re-enter their profile. This is acceptable because v2.0 never shipped outside the dev branch; no real users are affected.

---

## 12a. Decision application notes

### D10 composite-key remount in depth

The v2.0 review surfaced a data-loss bug in every section: `useState(profile?.basics ?? EMPTY)` captures the initial prop on mount and never re-syncs when the parent re-renders with a fresh profile. The v2.1 fix is simpler and more reliable than `useEffect` resync: every section receives `key={`${profile.profileVersion}-${profile.updatedAtMs}`}` from the parent `App.tsx`. When any save ticks `updatedAtMs`, React sees the new key, unmounts the old section instance, and mounts a fresh one whose `useState` initializers read from the new props. Local state is discarded wholesale on remount; this is INTENTIONAL (per D10). If a user has typed into an input but not saved, and an external storage change arrives (e.g. another tab uploaded a JSON Resume), the in-flight text is lost. The alternative (`useEffect` resync per field) is more error-prone and leaks race conditions when a save is in-flight while another write arrives.

Why not a single `updatedAtMs` key for the whole options tree? Because the dropzone and the `ConfirmClearModal` should NOT remount on storage change; only the data-bound sections should. Using per-section `key` values scoped to `profileVersion-updatedAtMs` lets the App frame persist while the 5 sections flip.

### D20 Deps object in depth

The `ProfileAdapterDeps` interface has 5 fields:
- `readStorage(key): Promise<unknown>` -- production is `browser.storage.local.get(k)[k]`; tests use `fakeBrowser.storage.local`
- `writeStorage(key, value): Promise<void>` -- production is `browser.storage.local.set({[k]: v})`
- `removeStorage(key): Promise<void>` -- production is `browser.storage.local.remove(k)`
- `now(): number` -- production is `Date.now`; tests pin to a constant like `1744848000000`
- `logger: Logger` -- production is `createLogger('profile-adapter')`; tests use a no-op `{ info, warn, error, debug }` quad

The module exports a production-wired singleton `profileAdapter` for direct use by `handlers.ts`. Tests ignore the singleton and call `createProfileAdapter({ ... fakes ... })` to get a fresh instance with controlled state. This is the D20 pattern applied verbatim: no module-level state leaks across test cases because each test constructs its own adapter instance, and the fake browser is reset in `beforeEach`.

### D21 validation at every boundary in depth

Every `writeProfile` call runs `ProfileSchema.parse(profile)`. This is the last line of defense even though the typical call path already validated:

1. User uploads JSON Resume -> `JSON.parse` throws on malformed JSON -> caught in App.tsx, surfaced as error.
2. `parseProfile(raw)` wraps `ProfileSchema.safeParse` -> returns discriminated `{ ok, errors }`.
3. `mergeJsonResume` builds the merged profile using runtime type guards.
4. `handleProfileUploadJsonResume` calls `parseProfile(merged)` -> second validation.
5. `profileAdapter.writeProfile(validated.profile)` -> third validation via `ProfileSchema.parse` (throws).

Three validations look redundant but each catches a different class of bug:
- (2) catches malformed user input.
- (4) catches bugs in `mergeJsonResume` that produce an invalid merged shape.
- (5) catches any future caller that slips in a Profile constructed by hand without going through `parseProfile`. For example, if a new phase adds a handler that mutates profile fields in-place (forbidden by the immutability rule, but humans make mistakes), (5) catches the mutation if it drifts the shape.

Every `readProfile` call runs `ProfileSchema.safeParse(raw)`. If storage is corrupt (because a previous version wrote a different shape, OR because malware dropped a payload there, OR because a dev accidentally set `llmc.profile.v1` to `{"__proto__": ...}` in DevTools), `safeParse` rejects and the adapter returns `null`. The background worker never throws on corrupt storage. The user sees the options page with empty sections and can re-enter their data.

### Why A7 does not patch A8

Per D3 (architect decision LOCKED 2026-04-11): A7 is the writer, A8 is the reader, and each phase is responsible for its own code. A7's contract deliverable is "write the B2 Profile shape at `llmc.profile.v1`, including `profileVersion: '1.0'` and `updatedAtMs: number`". A8's contract deliverable is "read that shape via `ProfileSchema.safeParse` and surface the data for autofill". The A8 plan rewrite (happening in parallel to this one) is responsible for updating `entrypoints/ats.content/profile-reader.ts` to consume nested `basics.*`, use `ProfileSchema.safeParse`, and rename `location.country` to `location.countryCode` wherever A8's own code referenced the wrong path.

A7's only contract proof is the `a8-contract-integration.spec.ts` test (§7.4) which asserts the written shape matches what A8 will `safeParse`. If A7 ships that test green and A8 still breaks, that is an A8 bug (A8's reader has the wrong expectations), and the phase-A8 rewrite handles it.

### Why `PROFILE_CLEAR` is NOT a protocol key

The v2.1 keystone ProtocolMap (§1.1) has exactly 19 keys. `PROFILE_CLEAR` is not one of them. A7 implements "clear profile" as a client-side operation that dispatches `PROFILE_UPDATE` with a fully-empty `createEmptyProfile()` patch. The adapter's `updateProfile` shallow-merges every top-level key from the empty profile over the existing profile, producing the empty state and ticking `updatedAtMs`.

Rationale: fewer protocol keys = less surface area = fewer places drift can creep in. "Clear" is semantically equivalent to "update to empty" and the user-visible behavior is identical. The only difference is that after clear, `readProfile` still returns the empty `Profile`, not `null`. This is fine for the options page because the composite-key remount still fires and every section re-initializes from the empty state. If a future v1.1 phase needs "remove the key entirely" semantics (e.g. for factory reset on uninstall), it can add a real `PROFILE_CLEAR` key at that time.

### Why we prefer `ats-autofill-engine/profile` over root barrel

Per keystone §4, B1 ships both a root `ats-autofill-engine` barrel AND a `./profile` sub-entry. The root barrel re-exports everything from `./profile` (and every other sub-area), so `import { ProfileSchema } from 'ats-autofill-engine'` also works. Why prefer the sub-entry?

1. **Smaller tree-shake footprint**: importing from the root barrel pulls the adapter initializer for every sub-area in scope for analysis. Importing from `./profile` limits it to just the profile module. For the extension background worker (which must stay small for fast MV3 cold-start), every kilobyte counts.
2. **Tighter coupling documentation**: the import path is a literal statement that "this file depends on the profile sub-area, not on adapters or vendors". A grep on `from 'ats-autofill-engine/profile'` finds every profile consumer, which is useful for refactoring.
3. **Anti-drift**: if a future B2 plan splits the profile sub-area further (e.g. `./profile/v2`), consumers that already use `./profile` only need a version bump, while consumers using the root barrel need to pick an entry. Narrow imports force the decision now.

---

## 13. Post-phase verification checklist (for the architect)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (83 new cases green)
- [ ] Coverage gates green (85% line on profile, 70% on options)
- [ ] D14.1 forbidden token grep returns zero
- [ ] D14.3 `node -e "import('ats-autofill-engine/profile')"` passes
- [ ] D14.4 `scripts/check-blueprint-contracts.mjs` passes
- [ ] D15 em-dash grep returns zero
- [ ] Manual smoke (§8.3) passes on a real Chrome profile
- [ ] A8 contract integration test passes (guarantees the A8 reader will work)
- [ ] `scripts/rollback-phase-A7.sh` executes cleanly on a throwaway branch
- [ ] `pnpm compliance` passes (if the extension repo has a compliance script; otherwise the 5-gate equivalent above)
- [ ] MEMORY.md updated with phase completion status

---

**End of Phase A7 plan v2.1.**
