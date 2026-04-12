# Review -- Phase A7 (Profile Storage Adapter + Options Page UI)

**Reviewer**: Opus 4.6 (architect / reviewer role)
**Plan under review**: `temp/impl/100-chrome-extension-mvp/phase_A7_profile_storage_and_options/plan.md`
**Decision memo**: `00-decision-memo.md` v2 (locked 2026-04-11)
**Contract neighbors**: `phase_A8_content_script_autofill/plan.md`, `phase_B2_core_types_and_taxonomy/plan.md`, `phase_A5_background_and_messaging/plan.md`, `phase_B1_scaffold/plan.md`
**Verdict**: **CHANGES REQUIRED -- Grade C+**

---

## Executive summary

Plan A7 is architecturally faithful to decision memo section 2.12 (D8=b): JSON Resume upload + inline overrides, Zod validation, `chrome.storage.local` write, sign-out preserves profile, no backend `GET /resume/master`. The adapter, validator, JSON-Resume merge, and dispatch wiring are well-structured and properly scoped (~110/85/80/85 LoC per module). The React options page correctly splits into 5 sections with accessible markup, the confirm-clear modal uses `aria-modal`, the dropzone is keyboard-operable, and the A5-stub migration path in `readProfile()` is a thoughtful touch.

However, the plan carries **three blocking contract breaks** with neighboring phases, plus two blueprint-drift bugs against the decision memo and B2 schema:

1. **B1 exports-map break**: every import uses `from 'ats-autofill-engine/profile'`, but B1's locked 8-entry exports map has NO `./profile` sub-entry (only `.`, `./ports`, `./heuristics`, `./dom`, `./chrome`, `./greenhouse`, `./lever`, `./workday`). The plan acknowledges this risk in section 4.2 but ships the broken import path as the primary and never implements a concrete fallback.
2. **A8 profile-shape contract break**: A8's `profile-reader.ts` reads `chrome.storage.local` directly and requires `typeof r.updatedAt === 'number'` as its validity check, then extracts top-level `firstName`/`lastName`/`email`/`phone`/`location`. A7 writes the B2 full `Profile` shape which has NO `updatedAt` (replaced by `profileVersion: '1.0'`) and nests basics under `basics.*`. After A7 executes, every A8 `readProfile()` call returns `null`, `isEmptyProfile()` returns `true`, and the fill pipeline short-circuits with "profile is empty" on every live Greenhouse/Lever/Workday demo. **This breaks the April 17 hard-must-have acceptance criteria.**
3. **Decision-memo blueprint drift**: memo 2.12 explicitly requires "**phone prefix**" and "**DOB/EEO consent**" in inline overrides. B2's `Basics` schema exposes both `phonePrefix` and `dateOfBirth`. A7's `BasicsSection.tsx` renders NEITHER input. The consent toggle `allowDobAutofill` exists in `ConsentSection` but there is no DOB value input anywhere, so toggling it does nothing useful.

Fixing (1) is a one-line path change. Fixing (2) requires either teaching A8 to read the new shape (correction plan for A8) or writing a dual-shape compatibility layer in A7. Fixing (3) is two extra inputs in `BasicsSection.tsx` (~15 LoC). None of these are mentioned in the plan's rollback or risk sections; the author did not spot the A8 break.

Additional non-blocking concerns: React stale-state bug in all 5 sections (`useState` captures initial props, never re-syncs on profile reload), `vitest.config.ts` environment flip to `jsdom` may break A5's background tests, and the name-split fallback in `mergeJsonResume` is only applied when BOTH `existingFirst` and `existingLast` are empty -- a user who filled in `firstName` manually and then uploads a JSON Resume with a different name silently loses the upload's last name.

---

## A -- Invariant compliance (BLOCKING)

| # | Invariant from brief | Status | Evidence |
|---|---|---|---|
| I1 | D8=b: JSON Resume upload + inline overrides (no full form builder) | PASS | `JsonResumeDropzone` + 5 sections; no work/education/skills editor; scope section 2.2 excludes full form builder explicitly |
| I2 | Zod validate on upload, merge with defaults, store in `chrome.storage.local` | PASS | `parseProfile()` uses `ProfileSchema.safeParse`; `writeProfile()` re-validates with `ProfileSchema.parse` as last line of defense; storage key `llmc.profile.v1` persisted via `browser.storage.local.set` |
| I3 | Inline overrides: name split, **phone prefix**, 16 legal-auth flags (4 jurisdictions x 4 flags), demographics (opt-in, hidden by default), consents | PARTIAL -- **phone prefix missing** | `BasicsSection` has `phone` but no `phonePrefix` input; 4x4 legal-auth matrix present in `LegalAuthSection` with `data-testid` per cell; demographics toggle defaults `false` and is `useState(false)` gated |
| I4 | **DOB/EEO consent** | PARTIAL -- **DOB input missing** | `ConsentSection` has `allowDobAutofill` checkbox, `allowEeoAutofill` checkbox; but `BasicsSection` has no `dateOfBirth` input. Toggling `allowDobAutofill` autofills nothing because there is no value to autofill. Blueprint drift vs memo 2.12 and B2 `Basics.dateOfBirth?: string`. |
| I5 | Backend `GET /resume/master` NOT used in V1 | PASS | Adapter never imports SDK client; no `SDK_CALL` from options page; section 5 table row 6 and section 8 last row enforce |
| I6 | `PROFILE_GET` / `PROFILE_UPDATE` / `PROFILE_UPLOAD_JSON_RESUME` messages added to A5's ProtocolMap | PASS | Section 6.1 adds all three plus `PROFILE_CLEAR`; handler record wired in section 6.6; barrel in section 6.7 |
| I7 | Profile schema = JSON Resume base + 16 legal-auth + willing_to_undergo_* + DOB/EEO consent | PARTIAL | The **schema** itself (B2) has all required fields, but the A7 UI never surfaces DOB or phonePrefix inputs, so the schema's coverage is only partially user-actionable in V1 |

**Blocking**: I3 (phone prefix) and I4 (DOB input) are direct decision-memo violations. Fix = add two inputs to `BasicsSection.tsx`.

---

## B -- Contract parity with A8 (BLOCKING)

A8's `entrypoints/ats.content/profile-reader.ts` (plan A8 lines 670-750) reads `chrome.storage.local.get('llmc.profile.v1')` directly and returns `null` when `typeof r.updatedAt !== 'number'`. It then extracts top-level `firstName`, `lastName`, `email`, `phone`, and `location` fields:

```ts
// A8 reader (lines 714-737):
const r = record as Record<string, unknown>;
if (typeof r.updatedAt !== 'number') { ... return null; }
return {
  firstName: typeof r.firstName === 'string' ? r.firstName : undefined,
  lastName:  typeof r.lastName  === 'string' ? r.lastName  : undefined,
  ...
  location: { city, region, country, postalCode },
  updatedAt: r.updatedAt,
};
```

After A7 upgrades storage, the persisted record has:
- `profileVersion: '1.0'` (required by B2 `ProfileSchema.profileVersion: z.literal('1.0')`)
- `basics: { firstName, lastName, email, phone, location, ... }` (nested)
- **NO `updatedAt`** top-level field (the B2 schema has no such field; A7's `writeProfile` does not stamp one)
- `r.location` does not exist at top level -- only `basics.location`
- A8's `ReadableProfile.location.country` vs B2 `Basics.location.countryCode` -- field name mismatch even if the path were correct

Consequence: every A8 `readProfile()` returns `null` after A7 executes, `isEmptyProfile()` returns `true`, `AutofillController` short-circuits with "profile is empty" error, and **zero fields autofill on Greenhouse/Lever/Workday**. This blocks the April 17 hard acceptance gate (`On a live Greenhouse posting: fill works (8+ fields)`).

A7's plan section 11 "Rollback plan" step 6 acknowledges that "A8 can proceed with the minimal A5 ExtensionProfile stub for basics-only autofill; full Profile wiring is deferred to a correction plan" -- but this is backwards: A7 is the phase that *breaks* A8, so the rollback plan should live in the primary path, not the rollback path. The plan as written silently breaks A8.

### Required fix -- pick one

**Option A (preferred, minimal)**: A7 writes the full `Profile` at `llmc.profile.v1` (as currently specified) AND writes a compatibility stub at a secondary key that A8 reads. A8 plan needs a correction to read from the new key, OR A7 writes a secondary `llmc.profile.v1.readable` record with the A5-stub shape flattened from `basics`.

**Option B**: A7 embeds a compatibility-stub view inside the same record: extend `writeProfile()` to also persist `{ firstName, lastName, email, phone, location, updatedAt: Date.now() }` as a top-level *shadow* alongside `basics`, `profileVersion`, etc. Zod `.strict()` on the B2 schema will reject this because of unknown-field stripping. Requires B2 amendment to allow passthrough or split storage into two keys.

**Option C (cleanest)**: Correction plan to A8 to read `basics.*` instead of top-level, and to check `profileVersion === '1.0'` instead of `updatedAt`. Ship the A8 correction in the same phase as A7 (before A8 executes on Day 5) -- A7 is written Day 4, A8 is written Day 5, so an A7-authored patch to A8's plan file is still in time. The plan already declares A8 is blocked on A7 in the dependency graph, so this is the natural fix.

The plan MUST pick one of these before executor runs. Current text ships with the break unaddressed.

### Related A8 field-name drift

Even if the shape issue were fixed, A8 reads `location.country` but B2's `Location` interface has `countryCode` (ISO alpha-2). A7's `BasicsSection` writes `countryCode` (line 1102/1155), matching B2. A8 would need to rename to `countryCode`. Flag for A8 correction.

---

## C -- Contract parity with B2 (BLOCKING on import path)

### B1 exports map does NOT include `./profile`

B1 plan lines 216-258 lock the 8-entry `exports` map:
```
".", "./ports", "./heuristics", "./dom", "./chrome",
"./greenhouse", "./lever", "./workday", "./package.json"
```

A7 imports from `ats-autofill-engine/profile` in at least 11 places:
- `src/background/profile/adapter.ts` (lines 277-278)
- `src/background/profile/validator.ts` (lines 412-413)
- `src/background/profile/json-resume-merge.ts` (lines 466-467)
- `src/background/profile/handlers.ts` (line 598)
- `src/background/messaging/protocol.ts` (line 190)
- `entrypoints/options/hooks/useProfile.ts` (line 711)
- `entrypoints/options/App.tsx` (line 773)
- `entrypoints/options/sections/BasicsSection.tsx` (line 1083)
- `entrypoints/options/sections/LegalAuthSection.tsx` (line 1223)
- `entrypoints/options/sections/PreferencesSection.tsx` (line 1373)
- `entrypoints/options/sections/DemographicsSection.tsx` (lines 1555-1557)
- `entrypoints/options/sections/ConsentSection.tsx` (line 1713)

Node's `exports` map enforcement is strict: a consumer importing a non-exported sub-path gets `ERR_PACKAGE_PATH_NOT_EXPORTED` at build time. `pnpm typecheck` and `pnpm build` would both fail.

A7 section 4.2 says: *"If B2's barrel did not include `./profile` as a distinct sub-entry, the import path defaults to `ats-autofill-engine` (the root). The plan uses `ats-autofill-engine/profile` on the assumption the exports map includes it; fall back to the root import if CI trips."*

This is an **assumption-based plan** -- against `.claude/rules/code-quality.md` "Ask When In Doubt". Per B1 plan section 2.2 and the grep-gate rule, any exports-map ambiguity is a bug in B1 that should be flagged to the operator (B2 plan line 1958), not silently patched or assumed.

**The actual state**: B2 section 18 re-exports profile types from `src/core/index.ts` via `export * from './profile'`. So the **root import works**: `import { Profile, ProfileSchema, createEmptyProfile, ... } from 'ats-autofill-engine'`.

### Required fix

Replace every `'ats-autofill-engine/profile'` import with `'ats-autofill-engine'` across all 12 listed files. This is a global find-and-replace. No new exports-map entry needed. B1 remains untouched, B2 remains untouched, grep-gate holds.

Alternative (not recommended): add a `./profile` entry to B1's exports map. This is a **scope creep** into B1 and is explicitly forbidden by B2 plan line 1958 ("B1 locked the exports map... must be flagged back to the human operator").

### Profile type field-by-field parity with B2

Assuming the import path is fixed, the type references in A7 sections are all valid:

| A7 consumer field | B2 `Profile` | Status |
|---|---|---|
| `profile.basics.firstName` | `Basics.firstName: string` | PASS |
| `profile.basics.lastName` | `Basics.lastName: string` | PASS |
| `profile.basics.name` | `Basics.name: string` | PASS |
| `profile.basics.preferredName` | `Basics.preferredName?: string` | PASS |
| `profile.basics.pronouns` | `Basics.pronouns?: string` | PASS |
| `profile.basics.email` | `Basics.email: string` | PASS |
| `profile.basics.phone` | `Basics.phone?: string` | PASS |
| `profile.basics.phonePrefix` | `Basics.phonePrefix?: string` | **UNUSED in A7 UI** -- blueprint drift |
| `profile.basics.dateOfBirth` | `Basics.dateOfBirth?: string` | **UNUSED in A7 UI** -- blueprint drift |
| `profile.basics.url` | `Basics.url?: string` | PASS (mapped to Website) |
| `profile.basics.summary` | `Basics.summary?: string` | **UNUSED in A7 UI** -- not flagged in scope-out |
| `profile.basics.label` | `Basics.label?: string` | **UNUSED in A7 UI** -- not flagged in scope-out |
| `profile.basics.location.{address,city,region,countryCode}` | matches B2 `Location` (plus `postalCode?`) | PASS |
| `profile.basics.profiles[]` | `Basics.profiles: ReadonlyArray<SocialProfile>` | PASS (LinkedIn + Website write path) |
| `profile.jobPreferences.workAuthorization[]` | `JobPreferences.workAuthorization: ReadonlyArray<JurisdictionAuthorization>` | PASS |
| `profile.jobPreferences.workAuthorization[i].{region,authorized,requiresVisa,requiresSponsorship,legallyAllowed}` | matches B2 exactly | PASS |
| `profile.jobPreferences.salaryExpectation.{min,max,currency,period}` | matches B2 | PASS |
| `profile.jobPreferences.availabilityDate` | matches | PASS |
| `profile.jobPreferences.willingToRelocate` | matches | PASS |
| `profile.jobPreferences.remotePreference: RemotePreference` | `'remote' \| 'hybrid' \| 'onsite' \| 'any'` | PASS |
| `profile.jobPreferences.willingToCompleteAssessments` | matches | PASS |
| `profile.jobPreferences.willingToUndergoDrugTests` | matches | PASS |
| `profile.jobPreferences.willingToUndergoBackgroundChecks` | matches | PASS |
| `profile.demographics.{gender,race,veteranStatus,disabilityStatus}` | matches B2 `Demographics` (all optional) | PASS |
| `profile.consents.{privacyPolicy,marketing,allowEeoAutofill,allowDobAutofill}` | matches B2 `Consents` | PASS |
| `profile.documents` | `Documents` interface exists in B2 | PASS (read-only per A7 scope) |
| `profile.customAnswers` | `Readonly<Record<string,string>>` | PASS (not surfaced in UI) |
| `profile.profileVersion: '1.0'` | `ProfileVersion = '1.0'` literal | PASS (preserved by merge, pinned at creation) |

**Minor drift**: A7 does not surface `summary`, `label`, `work[]`, `education[]`, `skills[]` in the UI at all. Per decision memo 2.6 table "NO full-form builder for work history/education/skills in V1", `work/education/skills` are correctly JSON-Resume-upload-only. But `summary` and `label` are single-string Basics fields, not list editors -- they could and should be inline-editable alongside the other Basics fields for feature parity with the JSON Resume upload path. If a user does manual entry only (no JSON Resume), they can never set a summary or headline. **Soft gate, not blocking.** Flag for v1.1.

### Strict-mode risk

B2 plan line 1038 says Zod uses `.strict()` on every object. A7's `updateProfile` shallow-merges `patch.basics ?? existing.basics`, and if the caller sends a `patch.basics` with fewer fields than existing, the spread preserves the rest. Good. But the top-level merge `{ ...existing, ...patch, ... }` will pass through fields that were already in `existing`. Since `existing` came from `ProfileSchema.parse()`, it is already strict-conformant. OK.

**However**, `writeProfile` calls `ProfileSchema.parse(profile)` which, with `.strict()`, will throw on any unknown field. If a future phase adds a `workAuthorization.reason` string without updating B2, `writeProfile` throws. That is by design and correct. No issue.

---

## D -- Code quality / coding-style

| Check | Status | Note |
|---|---|---|
| No stubs / `TODO: implement` | PASS | No todos in plan; `dropzone.handleFiles` silently tolerates non-`.json` extension -- could be clarified but is not a stub |
| No `any` / `@ts-ignore` | MOSTLY PASS | `json-resume-merge.ts` casts `jBasics.location as Profile['basics']['location']` and `jBasics.profiles as Profile['basics']['profiles']` without validating array item shapes; Zod at `ProfileSchema.parse()` later catches invalid items and short-circuits persistence. Acceptable. `App.tsx` casts `JSON.parse(text) as unknown` -- correct use of unknown. |
| File size budgets | PASS | All new files <200 LoC per budget; adapter ~110, handlers ~85, json-merge ~80, App.tsx ~180, sections 60-140 each |
| No `console.*` | MOSTLY FAIL | Adapter uses `console.info` (line 334) and `console.warn` (line 341). Project rule `project-conventions.md` says "NEVER use `console.log`, `console.error`, `console.warn`, `console.debug`" and requires NestJS Logger. **However**, this is the Chrome extension repo, not the NestJS API. Decision memo section 2.11 doesn't specify logger choice for the extension; A5 may have established a pattern. Flag: verify the extension repo's logging convention (check A5 for `log.info`/`log.warn`/`log.error` helper). If A5 ships a `log` helper, A7 should use it. |
| Error handling explicit | PASS | Upload handler catches `JSON.parse` error and surfaces in `uploadState`; `readProfile` returns `null` on corrupt storage and logs; `writeProfile` throws on invalid input |
| Immutability | PASS | All type signatures `Readonly`/`ReadonlyArray`; state setters construct new objects; patches spread existing |
| Input validation at boundary | PASS | Zod on every profile write; file extension check is advisory; JSON parse error captured |
| Defensive patterns | PASS | `safeParse` + fallback `null`, A5-stub migration, shallow-merge per top-level key to prevent wholesale replacement |
| Storage single-writer invariant | PASS | Options page never calls `browser.storage.local.set` directly; all writes through `PROFILE_*` messages; A5 invariant preserved |

### Stale-state bug in all 5 sections (NON-BLOCKING but real)

Every section initializes `useState` from the `profile` prop exactly once (on mount). When another section triggers `PROFILE_UPDATE` -> `storage.onChanged` -> `useProfile` reloads -> `App` re-renders with a new `profile` prop, the sections' local input state does NOT re-sync. Only sections that are remounted pick up the reload.

Example: user types `firstName` in Basics, clicks Save. App re-renders with fresh profile. User opens Demographics, toggles it, saves. Demographics handler reads `profile?.jobPreferences` which is fine (from the re-rendered prop). But Basics section still has the user's typed value in local state -- correct this time, but if the JSON Resume upload path runs (via dropzone) AFTER Basics is mounted with stale values, the Basics inputs still show the old values, and a subsequent "Save basics" click writes the STALE values back, silently reverting the JSON Resume upload for those fields.

**Fix**: add `useEffect(() => setFirstName(basics?.firstName ?? ''), [basics?.firstName])` per field, or restructure sections to pull state from props on every render (controlled-from-props pattern with an internal "dirty" flag). Alternatively, force remount on profile reload via `<BasicsSection key={profile?.profileVersion + (profile?.basics?.firstName ?? '')} ... />` with a composite key. Flag for correction before execution.

### `vitest.config.ts` environment flip

Section 3.2 row 8: "Ensure `environment: 'jsdom'` + `setupFiles: ['./tests/setup.ts']` for React component tests." If A5 configured vitest with `environment: 'node'` for background tests (likely, since A5 had no React), flipping globally to `jsdom` may slow down or break the background test suite. Vitest supports per-file overrides via `@vitest-environment` comment, or a workspace config with two projects. The plan should specify a per-directory or per-file env override rather than a global flip. **Minor but concrete risk.**

---

## E -- Testing rigor

- **31 test cases** enumerated across 3 suites (12 adapter + 7 merge + 12 options integration). Adversarial cases dominate the adapter suite: corrupt storage, A5-stub migration, invalid email via `writeProfile`, sequential writes, consent-field isolation.
- Test quality: specific assertions (e.g. test 7: "assert `basics.firstName === 'Ada'`, `basics.name === 'Ada Lovelace'`, `profileVersion === '1.0'`"), not tautologies.
- Fixtures included inline for both valid and invalid JSON Resume.
- `fake-indexeddb` + `@webext-core/fake-browser` reuse from A5's setup is correct.
- Acceptance section 10.1 includes 15 hard gates with concrete values, plus 4 soft gates.

### Gaps

1. **No A8 integration test**. Since A7 is supposed to produce a profile A8 can read, there should be an integration test: `writeProfile(validProfile); const stored = await browser.storage.local.get('llmc.profile.v1'); /* simulate A8 reader */`. Because A8's reader is broken (section B above), this test would fail -- which is exactly why it should exist. **Add this test to catch the contract break.**
2. **No test for `updateProfile` on `consents` sub-merge**. Test 10 covers `consents.privacyPolicy` vs `consents.marketing`, but the updateProfile shallow merge for `consents` is `patch.consents ? { ...existing.consents, ...patch.consents } : existing.consents`. A unit test for the shallow-merge branch would prove the pattern works.
3. **No test for schema `.strict()` rejection**. Send a profile with `{ ...valid, extraField: 'x' }` -- expect ZodError. Confirms B2's strict mode is enforced at the A7 boundary.
4. **Demographics "close does not wipe"**. After user sets gender to `female` and toggles demographics off, re-opening should still show `female` (not reset to `decline_to_answer`). No test covers this invariant -- and the current implementation uses `useState(..., demographics?.gender ?? 'decline_to_answer')` which defaults `decline_to_answer` on mount, so if the profile is reloaded while the section is collapsed, the state is stale (same bug as D above).
5. **Adapter test 8 checks `console.warn`**, but project convention prohibits console. Test should spy on the replacement logger.

**Non-blocking but recommended additions.**

---

## F -- Blueprint / full-stack update rule

The A7 plan is an extension-repo phase, not an API-repo phase, so the NestJS module blueprint rule does not apply. Decision memo 2.12 (D8=b) IS the blueprint. Checks against it:

- "Upload JSON Resume + inline overrides" -- dropzone + 5 sections. PASS
- "Parse JSON, validate against our extended Zod schema" -- `parseProfile` + `ProfileSchema.safeParse`. PASS
- "Merge with defaults, store in `chrome.storage.local`" -- `mergeJsonResume` + `writeProfile`. PASS
- "Inline form for overrides: name split, **phone prefix**, legal auth flags, EEO (opt-in), consent toggles" -- phone prefix MISSING. FAIL
- "NO full-form builder in V1" -- work/education/skills are upload-only. PASS
- "Backend `GET /resume/master` is NOT used in V1 profile flow" -- adapter has no SDK import. PASS
- Memo 2.6 scope row "Profile schema | JSON Resume base + 16 legal-auth flags + `willing_to_undergo_*` + **DOB/EEO consent**" -- DOB *consent* checkbox is present, but DOB *value* input is absent, meaning the consent toggle is a no-op. FAIL

Full-stack update rule (`feedback_full_stack_update_rule.md`): when the profile schema changes, ALL related artifacts must update in the same phase. A7 updates: protocol.ts, handlers.ts, storage adapter, React UI, tests. What it DOES NOT update:

- **A8 profile-reader** -- breaks immediately. Must be patched in same phase.
- **Extension repo blueprint** (if one exists under `.claude/blueprints/` -- plan doesn't mention) -- should document the new storage shape.
- **README.md for the extension repo** -- should mention JSON Resume upload as the primary profile path.

The plan should add A8's `profile-reader.ts` to section 3.2 "Files to MODIFY" with an explicit patch, OR spawn a follow-up correction phase before A8 executes. Current plan does neither.

---

## G -- Scope declaration (per `.claude/rules/proposal-requirements.md`)

- **Confidence**: 9/10 (stated line 10). **Justification does not hold** because the 1-point gap cited is only the `ats-autofill-engine/profile` sub-entry -- but the actual risks are (a) the A8 reader break, (b) the phone prefix / DOB drift, (c) the stale-state bug, none of which were investigated. True confidence should be 6-7/10. **Correction: downgrade confidence score after acknowledging the A8 break and the blueprint drift.**
- **Files touched**: 20 created, 8 modified, 3 deleted = 31 files (stated line 2035). If the A8 patch is added, becomes 32. Reasonable.
- **Lines changed**: ~2,120 total (stated line 2036). Reasonable.

---

## H -- Concerns / nitpicks (NON-BLOCKING)

1. **`splitFullName` fallback only when BOTH existing names empty**. Lines 505-510: `const splitName = !existingFirst && !existingLast && jName ? splitFullName(jName) : null;`. If the user typed `firstName = 'Alex'` manually, then uploads a JSON Resume with `basics.name = 'Alex Smith'`, the merge preserves `firstName = 'Alex'` but `lastName` stays empty (never split). The uploaded last name is lost. Counter-intuitive. Either always split when `jName` is present and the existing field is empty for that specific half, or document this behavior prominently.

2. **`preferredName`, `pronouns`, `phonePrefix`, `dateOfBirth` in the merge**. The spread `...base.basics` preserves these, and JSON Resume has no concept of them, so the result is correct. But the comment on line 457 says "the existing profile supplies `firstName`/`lastName`/`preferredName`/`pronouns` (JSON Resume has no concept of these)" -- should also list `phonePrefix` and `dateOfBirth` for completeness.

3. **`location` spread is unguarded type cast**. Line 534: `(jBasics.location as Profile['basics']['location']) ?? base.basics.location`. If a malicious or malformed JSON Resume sets `basics.location: 42`, this assigns `42` to location, then `ProfileSchema.parse()` catches it and the upload fails cleanly. OK, but a runtime type guard inside `mergeJsonResume` would produce better user-facing errors ("your JSON has an invalid location").

4. **`BasicsSection.extractUsername`**. Lines 1202-1209: extracts a username from a LinkedIn URL. If the URL is `https://linkedin.com/in/ada/`, `split('/').filter(Boolean).pop()` returns `'ada'`. OK. But if the URL is just `linkedin.com/in/ada` (no scheme), `new URL(url)` throws, catches, returns the raw `url` as `username`. That is a long, ugly username. Minor UX issue.

5. **`emptyBasics` duplicated in `BasicsSection`** (lines 1212-1214) instead of importing `createEmptyProfile().basics`. Duplication risk: if B2 adds a new required field to `Basics`, `BasicsSection.emptyBasics` silently goes out of sync. Prefer importing from the engine.

6. **`LegalAuthSection.buildInitialMatrix`** initializes every jurisdiction with all 4 flags `false` (line 1248-1252), but this becomes the default even if `profile?.jobPreferences.workAuthorization` is `undefined`. When the user saves, all 16 false values are persisted, which is a valid but unhelpful "I am unauthorized everywhere" state. Consider leaving `workAuthorization: []` when the user has never touched the section (no submit click). Low priority.

7. **`PreferencesSection.handleSubmit`** writes `workAuthorization: prefs?.workAuthorization ?? []` (line 1413). If the user first ticks legal auth in `LegalAuthSection` and saves, then saves preferences without a page reload, the `prefs` snapshot is stale (stale-state bug, section D), so preferences save wipes the freshly-saved legal auth. **This is a concrete data-loss bug** under normal user flow. Upgrade from non-blocking to **BLOCKING**: fix the stale-state pattern, or change `PreferencesSection.handleSubmit` to only patch the preferences sub-fields it owns without re-sending `workAuthorization`.

8. **`documents` field in `updateProfile`**. Line 388: `documents: patch.documents ?? existing.documents`. Correct. But `ResumeHandle` is an opaque handle; the options page has no code path that writes documents. Dead branch for V1. OK to keep for future-proofing.

9. **`chrome.storage.onChanged` listener in `useProfile`** uses `chrome.storage.StorageChange` type. The `wxt/browser` shim re-exports this correctly in A5, so OK. But the `area: string` parameter should be more specifically typed as `chrome.storage.AreaName` for type safety. Minor.

10. **Sign-out handler** relies on A6's `AUTH_SIGN_OUT` being idempotent and not touching `storage.local`. A7's tests (section 7.3 case 10) assert this round-trips correctly, but only by simulating the message via fakes. A real A6 test would be in A6's own suite. OK.

11. **Accessibility**: confirm-clear modal lacks focus-trap. When open, Tab can escape to the page behind. Not flagged by accessibility hard gates in section 9. Low priority for POC.

12. **Rollback plan step 6**: "A8 can proceed with the minimal A5 ExtensionProfile stub for basics-only autofill". This contradicts the plan's primary path, where A7 deletes the A5 stub entirely. Rollback plan is self-inconsistent.

---

## I -- Risks

| # | Risk | Severity | In plan? |
|---|---|---|---|
| Rk1 | `ats-autofill-engine/profile` sub-entry does not exist in B1 exports map -> build fails | **HIGH** | Acknowledged in 4.2 but shipped as primary; fallback not implemented |
| Rk2 | A8 reader returns `null` for every A7-written profile -> zero autofill on demo | **CRITICAL** | NOT acknowledged; breaks Apr 17 hard gate |
| Rk3 | Phone prefix + DOB inputs missing -> decision memo 2.12 drift | HIGH | NOT acknowledged |
| Rk4 | Stale React state in sections -> data loss when saving sections out of order | HIGH | NOT acknowledged |
| Rk5 | `vitest.config.ts` jsdom global env breaks A5 background tests | Medium | Partially acknowledged (section 3.2) but no concrete per-project split |
| Rk6 | `extractUsername` fallback produces full URL as username on unparseable input | Low | NOT acknowledged |
| Rk7 | `console.warn` in adapter may violate extension repo logger convention | Low | NOT acknowledged |
| Rk8 | `mergeJsonResume` name-split fallback too restrictive -> lost last name | Medium | NOT acknowledged |

Four of eight risks are blocking or semi-blocking and not listed in the plan.

---

## Final verdict

**CHANGES REQUIRED -- Grade C+.**

The plan is well-structured and shows strong understanding of the profile storage model, the JSON Resume merge semantics, the consent-by-default policy, and the B2 schema shape. Test coverage is reasonable and the acceptance gates are concrete. The A5-stub migration path is thoughtful.

But the plan ships with a critical A8 contract break (Rk2) that would make the April 17 demo silently fail, a certain build break (Rk1), two decision-memo violations (phone prefix, DOB value input), and a data-loss-class React state bug that corrupts user data across section saves (Rk4/#7). None of these were self-identified.

### Required changes before executor runs

1. **B1 exports map**: global replace `from 'ats-autofill-engine/profile'` -> `from 'ats-autofill-engine'`. 12 files.
2. **A8 contract**: pick one of Options A/B/C in section B. Preferred is Option C -- correction patch to A8's `profile-reader.ts` in the same phase (add to A7's "Files to MODIFY"), to read `basics.*` and check `profileVersion === '1.0'`. Also rename `location.country` -> `location.countryCode`.
3. **Phone prefix input**: add `<Field label="Phone country code" />` to `BasicsSection.tsx`, wire to `basics.phonePrefix`.
4. **DOB input**: add `<Field type="date" label="Date of birth (optional)" />` to `BasicsSection.tsx`, wire to `basics.dateOfBirth`. Gate on `consents.allowDobAutofill` toggle (don't show the field if the user has not opted in).
5. **Stale-state fix**: add `useEffect` resync per section OR add a composite `key` prop to force remount on reload OR restructure sections to derive state from props + local dirty flag. Minimum: fix `PreferencesSection` + `LegalAuthSection` to not cross-pollute each other's `jobPreferences` patches.
6. **Add integration test**: "after `writeProfile(validFullProfile)`, a read of `storage.local.get('llmc.profile.v1')` produces a record whose `basics.firstName === 'Ada'` AND whose `profileVersion === '1.0'`" -- effectively a contract test that any downstream consumer (including A8) can rely on.
7. **Vitest config**: per-project env override, not global flip. Document in section 3.2 row 8.
8. **Downgrade confidence score** to 7/10 and update section 13 to list Rk1-Rk4.
9. **Clarify logger convention** (`console.*` vs A5 `log` helper) and use the established pattern.

### Soft recommendations

- Add `summary` and `label` inputs to `BasicsSection` for manual-only users.
- Replace `emptyBasics` in `BasicsSection` with `createEmptyProfile().basics` to avoid duplication drift.
- Runtime type-guard `location` in `mergeJsonResume` for better UX on malformed uploads.

Executor may NOT proceed as written. Re-review required after the 9 required changes are applied.
