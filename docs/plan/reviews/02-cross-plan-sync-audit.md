# Plan 100 -- Cross-Plan Sync Audit (All 20 Phases)

**Date**: 2026-04-12
**Auditor**: Opus (5 parallel agents, full line-by-line read of all 20 phase plans)
**Scope**: TODOs/stubs, parameter sync, data flow, cross-phase contract alignment
**Verdict**: **17 issues found -- 6 CRITICAL, 5 HIGH, 6 MEDIUM**. Plans are NOT ready for execution until the critical issues are resolved.

---

## CRITICAL Issues (will cause compile errors or runtime failures)

### C1. StoredTokens field name mismatch (A5 vs A6)

- **A5** defines `StoredTokens` with long field names: `{ accessToken, refreshToken, accessTokenExpiry, email }`
- **A6** assumes short names: `{ access, refresh, frontToken, accessTokenExpiry }` and writes that shape
- A5's schema is `.strict()` so A6's write will fail Zod validation at runtime
- Additionally, A5 has no `frontToken` field, and A6 never writes `email`
- **Fix**: Align StoredTokens shape. Either A5 adopts short names + adds frontToken, or A6 adopts long names + adds email. Pick one canonical shape and propagate.

### C2. FillResult missing `instructionPlanId` in B5 (B5 vs B2 contract)

- B2 defines `FillResult` as `{ ok, selector, instructionPlanId: PlanId }` (required field)
- B5's `fillField` returns only `{ ok, selector }` or `{ ok, selector, error }` -- no `instructionPlanId`
- **This will not compile.** Every B5 return path must include `instructionPlanId`.
- B7 works around this with `threadPlanId` wrapper. B8 does the same. But B5 itself does not satisfy the type.
- **Fix**: Either (a) B5's fillField signature takes a PlanId param and threads it through, or (b) define an internal `AdapterFillResult` without planId and have the adapter factory wrap it. Option (b) is cleaner -- add a `RawFillResult` type to B2 that omits `instructionPlanId`, used by B5/adapters internally, with the adapter index.ts wrapping to full `FillResult`.

### C3. Repo path mismatch across Plan B (B1/B3/B5 vs B2/B4)

- B1, B3, B5 declare repo path as `e:/ats-autofill-engine` (standalone)
- B2, B4 declare repo path as `e:/llmconveyors-chrome-extension/packages/ats-autofill-engine` (monorepo subfolder)
- The config.json and README both say the engine is a standalone repo at `e:/ats-autofill-engine`
- **Fix**: Update B2 and B4 metadata to `e:/ats-autofill-engine`. This is a plan-text fix, not a code fix.

### C4. B9 Workday adapter has 3 stubs/placeholders

- `resolveWorkHistoryRow` contains `// ... more fields` placeholder (line ~664)
- `dispatchWidget` hardcodes `'' as PlanId` with no way to thread the real planId
- `fillWorkdayFieldSync` is referenced in the adapter factory but never defined anywhere
- `valueToText` / `valueToBool` helpers are called but never specified
- **Fix**: B9 plan must be completed -- specify all resolver fields, define fillWorkdayFieldSync, define value helpers, and thread planId from the caller.

### C5. A8/A9 incompatible Deps types for shared main.ts

- A8 creates `AutofillControllerDeps` in `src/content/autofill/deps-factory.ts`
- A9 creates a separate `ContentDeps` in `entrypoints/ats.content/deps.ts`
- Both modify the same `main.ts` bootstrap, but their Deps types are incompatible
- A9's `initIntent(deps)` expects `ContentDeps`, but `main.ts` constructs `AutofillControllerDeps`
- **Fix**: Define a single unified `ContentDeps` type that merges both surfaces. A8 defines the base, A9 extends it. One factory function in main.ts.

### C6. A11 references non-existent code and wrong import paths

- Orchestrator code says "copies from previous plan revision" -- not self-contained
- `readProfile` import path `./storage/profile.js` does not match A7's actual location `./profile/storage.ts`
- `HandlerFor` type imported from `../messaging/handlers-types` -- not defined in A5
- `__tabId` injection in handler is undocumented in A5's dispatch loop
- **Fix**: A11 plan must be rewritten to be self-contained. Fix all import paths to match A5/A7 actual file layouts.

---

## HIGH Issues (will cause subtle bugs or test failures)

### H1. A4 double-fetch bug

- `useEffect` has `status` in dependency array but no guard for `'exchanging'` state
- Setting status to `'exchanging'` re-fires the effect, passes all guards, calls `exchangeTokens` twice
- **Fix**: Add `if (status === 'exchanging') return;` guard, or remove `status` from deps array.

### H2. HANDLERS exhaustiveness conflict (A5 vs A7)

- A5 line 74 says HANDLERS type uses `Exclude<keyof ProtocolMap, 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR'>`
- A7 adds inline fallback handlers FOR those excluded keys inside the HANDLERS record
- Both A10 and A11 also modify handlers.ts with no merge coordination
- **Fix**: Pick one approach. Either HANDLERS covers all 19 keys (with inert handlers for content-script-owned ones), or it excludes them. Then document the merge order for A7/A10/A11.

### H3. B3 uses console.warn violating ESLint no-console: error

- B3's `compile()` fallback uses `console.warn(...)` in `src/core/heuristics/mozilla/`
- B1's ESLint config sets `no-console: error` on all `src/**/*.ts`
- **Fix**: Use the structured logger from B1/B2 or add an ESLint override for MPL-2.0 files only.

### H4. B5 AttachFailureReason shadows B2's type

- B5 declares `AttachFailureReason` with 4 members: `'not-a-file-input' | 'empty-file-list' | 'datatransfer-rejected' | 'verify-failed'`
- B2 exports `AttachFailureReason` with 6 completely different members
- If both are re-exported from barrels, name collision
- **Fix**: Either merge into one union in B2, or rename B5's to `DomAttachFailureReason`.

### H5. A9 object mutation violates immutability rule

- `buildIntentPayload` mutates the `base` const object: `(base as { jobTitle?: string }).jobTitle = title`
- Project rules require "ALWAYS new objects, NEVER mutate"
- **Fix**: Use spread: `return { ...base, ...(title ? { jobTitle: title } : {}) }`

---

## MEDIUM Issues (friction for executors, potential runtime edge cases)

### M1. Import path alias inconsistency (A6 vs A7)

- A6 uses `@/background/log` (no `src/` prefix)
- A7 uses `@/src/background/log.js` (with `src/` prefix and `.js` extension)
- Only one form is correct depending on tsconfig.paths
- **Fix**: Standardize on `@/background/...` (no src/ prefix, no .js extension) per WXT convention.

### M2. FormFieldDescriptor null vs empty-string mismatch (B2 vs B5)

- B2 types `name` and `id` as `string | null`
- B5 scanner always produces empty string (`''`), never null
- B5's `sectionHeading` returns `undefined` but B2 types it as `string | null`
- **Fix**: Either B5 produces null (not empty string) when absent, or B2 types as `string`.

### M3. B9 fillStep types profile as Profile, keystone says unknown

- Keystone AtsAdapter: `fillStep?: (step, profile: unknown) => Promise<ReadonlyArray<FillResult>>`
- B9 implementation types it as `profile: Profile`
- **Fix**: Update keystone to `Profile` (preferred -- type safety) or B9 accepts unknown and casts.

### M4. B8 matchLeverUrl rejects URLs with query params

- Early bail-out: `if (url.includes('?') || url.includes('#')) return { kind: 'none' }`
- Real Lever URLs often have `?source=linkedin` or UTM params
- **Fix**: Strip query/fragment before matching, or remove the early bail-out.

### M5. A3 service method signature mismatch (description vs code)

- Plan description says `extract(text, options, context)` with 3 params
- Code snippet has `extract(rawText, options)` with 2 params
- **Fix**: Update description to match the code (2 params).

### M6. B2 synonyms.ts references "v1 plan step 11" without inline content

- Executor without access to superseded v1 plan cannot complete this step
- **Fix**: Inline the synonyms table content into the B2 plan.

---

## LOW Issues (cosmetic, documentation, dead code)

| ID | Phase | Issue |
|----|-------|-------|
| L1 | A1 | File count metadata says 30, actual is 34+ |
| L2 | A3 | "TODO: verify" text could leak into source comments |
| L3 | A4 | References `zovo-labs/job-assistant` repo slug (should be `ebenezer-isaac/llmconveyors-chrome-extension`) |
| L4 | A5 | `AtsKindSchema` hardcodes 3 values instead of importing from engine |
| L5 | A10 | Direct `chrome.runtime.onMessage` bypasses A5's messaging barrel |
| L6 | A11 | `.js` extensions in TS imports may not resolve under Vite/WXT |
| L7 | B1 | `terserOptions` is dead config (tsup uses esbuild, not terser) |
| L8 | B3 | Title contains em-dash violating D15 |
| L9 | B4 | Missing 3 EEO classifier rules (eeo-transgender, eeo-sexual-orientation, eeo-age-range) |
| L10 | B6 | Local `Ats` type includes 'ashby' not in keystone AtsKind |
| L11 | B7 | File count metadata says 17, actual is 21+ |
| L12 | B9 | Metadata lists wrong B5 fillField signature (3 params vs actual 2) |

---

## Phases that are CLEAN (no blocking issues)

- **A2** -- Backend bridge endpoint. Fully specified, matches A4 consumer expectations.
- **A3** -- Backend skills endpoint. One medium documentation issue (M5), otherwise clean.
- **B6** -- DOM highlighter/renderer. One low naming issue (L10), otherwise clean.

---

## Recommended Fix Order

1. **C1 (StoredTokens)** -- blocks A6 entirely
2. **C2 (FillResult planId)** -- blocks B5, B7, B8, B9
3. **C3 (repo path)** -- blocks B2, B4 executor from finding the repo
4. **C4 (B9 stubs)** -- blocks B9 execution
5. **C5 (content Deps merge)** -- blocks A8+A9 integration
6. **C6 (A11 self-contained)** -- blocks A11 execution
7. H1-H5 and M1-M6 can be fixed in parallel after criticals

---

## Orchestrator Readiness

The plans are currently structured as one `config.json` with 20 phases. The user requested splitting into two separate orchestrator-ready plans:

- **Plan 100A** (11 phases): A1-A11, chrome extension, repos = chrome-extension + llmconveyors.com (A2/A3/A4)
- **Plan 100B** (9 phases): B1-B9, ats-autofill-engine npm package

This split requires:
1. Two separate `config.json` files with correct dependency DAGs
2. B-plan phases referenced as external deps in A-plan (A8 depends on B7/B8/B9 publish, A9 depends on B6)
3. Each plan self-contained with its own decisions + contracts reference

**Status**: Split CANNOT proceed until critical issues C1-C6 are resolved. Fixing the plans first, then splitting, avoids propagating errors into two config files.
