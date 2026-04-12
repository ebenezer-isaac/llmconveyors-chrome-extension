# Plan 100 v2 — Consolidated Review

**Date**: 2026-04-11
**Phases reviewed**: 20
**Orchestrator**: Opus review orchestrator (Claude Opus 4.6)
**Source reviews**: `reviews/review-{A1..A11,B1..B9}.md`

---

## Executive verdict

Plan 100 v2 is **NOT executable as written**. Six phases ship with hard contract breaks against neighbours, and one phase (A9) imports types that explicitly do not exist in B6. Three additional phases have decision-memo invariant violations. The blockers are mostly mechanical (renames, signature alignment, missing exports-map entries, missing protocol keys) but they cluster around the cross-phase contract surfaces — A5 ProtocolMap, the engine `AtsAdapter` shape, the Profile storage shape, and the B1 exports map. Fixing these requires architect coordination across multiple phase plans, not isolated executor edits.

**Recommendation**: option **(b)** — fire corrective rewrites for ~9 phases before execution starts Apr 12. Estimated architect time: 4-6 hours of plan editing across A1, A5, A6, A7, A8, A9, A10, B1, B2, B7, B8 (and a B9 typo pass).

---

## Grade distribution

| Grade | Count | Phases |
|---|---|---|
| A (executable) | 2 | A2, A3 |
| A- (minor polish) | 4 | A4, B3, B5, B6, B9 |
| B / B- (small fixes) | 2 | A10, B4 |
| C+ / C / C- (section rewrite) | 8 | A5, A6, A7, A11, B1, B2, B7, A8 |
| D (major rewrite) | 2 | A1, B8 |
| F (blocker, contract fiction) | 1 | A9 |

(Note: A4 self-graded "A-", reviewer placed it in the A-band.)

---

## Top blockers (must fix before execution starts Apr 12)

1. **A9 calls `applyHighlights(root, ranges: HighlightRange[])` against B6's `applyHighlights(root, keywords: readonly string[])`** — A9 imports `HighlightRange`, `TextWalk`, `walkTextNodes` shapes that B6 explicitly deletes in v2. B6 plan flags this exact drift as "do not patch from inside B6". → Rewrite A9 §6.5 (delete `range-builder.ts`, ~340 LoC), §6.8 apply-handler, §9 tests. Owner: architect, before Day 6.

2. **A5 ProtocolMap missing 4 of the 13 required message types** (`AUTH_STATE_CHANGED`, `PROFILE_UPLOAD_JSON_RESUME`, `KEYWORDS_EXTRACT`, `GENERATION_UPDATE`) plus `HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR` carry the wrong response shapes. A6, A7, A9, A10, A11 all do "protocol surgery" in their own phases, violating A5's own "one owner" principle and creating merge-conflict risk during parallel execution. → Add the 4 keys + reshape highlight envelopes in A5 before any downstream phase runs.

3. **`adapter` named export missing from B7/B8/B9** — A8's `adapter-loader.ts` reads `mod.adapter` and `loaded.kind`. B7 exports `GreenhouseAdapter`, B8 only flat functions, B9 a `WorkdayAdapter` namespace; none expose `adapter` or a `kind` field. Every dynamic adapter import returns `undefined`. → Architect must pick ONE export shape (recommended: `export const adapter: AtsAdapter = Object.freeze({ kind, scanForm, fillField, attachFile?, ... })`) and propagate to A8 + B7 + B8 + B9.

4. **B7/B8 `fillField`/`attachFile` signatures incompatible with both B5 and A8** — B7 uses `(el, value, hints)`, B8 uses `(root, fieldType, instruction, ctx)`, A8 expects `(instruction: FillInstruction)`, B5 ships sync `(el, value: string|boolean)`. Three mutually incompatible shapes; typecheck will fail at every call site.

5. **`FormModel` / `ReadableProfile` / `JobPostingData` / `FillPlanResult` types not defined where consumers import them** — B7/B8/B9 import `JobPostingData` from `core/types` but B2 never defines it (B2 plan §Files-to-create lists only form-model, fill-instruction, highlight-range, ats-vendor). B9 imports `FillPlanResult` (B2 only defines `FillPlan`). A8 reads top-level `firstName/lastName/email/updatedAt` but A7 writes nested `basics.*` + `profileVersion: '1.0'`. Three separate type-shape contract failures with one root cause: B2 needs an addendum AND A8's `profile-reader.ts` needs a rewrite to match A7's actual storage shape.

6. **B1 exports map missing `./profile` sub-entry** — A7 imports `from 'ats-autofill-engine/profile'` in 12+ places; B1's locked 8-entry map has no `./profile`. Build fails at typecheck. B2 explicitly forbids B2 from patching the exports map (must be flagged to operator). → Add `./profile` sub-entry to B1 (one-line `package.json` + tsup entry edit) OR rewrite all 12 imports to use the root `ats-autofill-engine` entry (recommended; B2 already re-exports `profile` from root).

7. **B1 missing `zod` runtime dependency** — B1 declares "zero runtime dependencies"; B2 imports `from 'zod'` in profile schema. B2 contradicts itself ("if missing, run `pnpm add zod`") but its own §1958 forbids silent dep changes. → Add `zod@^3.23.8` to B1 dependencies.

8. **Repo path drift across all A-phases**: A1 hard-codes `e:/job-assistant` + `zovo-labs/job-assistant` in package.json, manifest, LICENSE, README, ALL absolute paths in 20+ §6 sub-sections. A5/A6/A7/A8/A9/A10 all inherit this. Decision memo §2.1 + §2.3 + §4.1 lock the path to `e:/llmconveyors-chrome-extension` and the catch-up email TODAY references that exact URL. → Coordinated rename across A1, A5, A6, A7, A8, A9, A10, A11.

9. **B2 ships `HighlightRange` type and `IKeywordHighlighter` port that v2 explicitly deletes** — B6 plan says "if you find HighlightRange, STOP and ask". B2 creates `src/core/types/highlight-range.ts` and re-exports from `types/index.ts` and from `ports/index.ts`. Plus B2 has `document`, `HTMLElement`, `chrome.storage` references in JSDoc inside `src/core/**` files which trip B2's own grep gate. → Delete the file, the re-exports, the port; rewrite 5 JSDoc comments.

10. **A8 implements single-page Workday (D3=a) when memo locks D3=b multi-step wizard** — A8 plan §5.7 says "we only care about the single-page 'My Information' screen (D3=a)". The flip to multi-step wizard happened the same day A8 was written; A8 missed the update. There is no Workday step-change orchestration anywhere. The Apr 17 hard demo gate ("multi-step wizard traversal — My Info → My Experience → Voluntary Disclosures → Review") cannot be met. → A8 needs ~300-400 LoC addition for wizard orchestration loop OR move the loop into B9 and have A8 just delegate.

---

## Top critical issues (non-blocking but will cause integration pain)

| # | Phase | Issue | Severity |
|---|---|---|---|
| C1 | A1 | ESLint flat config will not lint: missing `@eslint/js` dep, wrong `tseslint.configs.recommended.rules` spread (yields undefined under v8 meta) | Critical |
| C2 | A1 | `ats-autofill-engine` placeholder `file:` sibling at `../ats-autofill-engine/index.js` is a literal stub written to a file the executor creates — admits "CI will fail until B1 publishes" | Critical |
| C3 | A1 | `tsconfig` `exactOptionalPropertyTypes: true` + `types: ["chrome", "node"]` likely break WXT-generated types | Critical |
| C4 | A4 | Double-fetch race in `useEffect`: no `status === 'exchanging'` guard, `sessionContext` re-emit fires a second `/extension-token-exchange` POST mid-flight | Medium |
| C5 | A4 | `FALLBACK_LOGIN_PATH = '/login'` is locale-less; Next i18n middleware likely 404s on client-side navigation from a `[locale]` page | Medium |
| C6 | A4 | Test fixture `FAKE_TOKENS` use 17-char strings + year-2030 expiry; A6 parser rejects all of them (length < 20, exp > now+24h). Cannot share fixtures across A4↔A11 E2E | Medium |
| C7 | A6 | Imports `setTokens`/`getTokens` from storage module, but A5 ships `writeTokens`/`readTokens` only — typecheck fails | Critical |
| C8 | A6 | Imports `from '@webext-core/messaging'` directly instead of A5's typed `defineExtensionMessaging` instance — silently drops every auth broadcast | Critical |
| C9 | A6 | Defines `AuthState` discriminated union; A5 shipped `AuthStatus` interface. Different name + shape, two-source-of-truth | Critical |
| C10 | A6 | `signOut()` clears tokens but drops A5's `clearAllTabState()` — per-tab state leaks after sign-out | High |
| C11 | A6 | No mutex on concurrent `AUTH_SIGN_IN`; `chrome.identity.launchWebAuthFlow` allows only one flow at a time, second call rejects | Medium |
| C12 | A7 | Phone prefix + DOB value inputs never rendered in `BasicsSection.tsx` despite memo §2.12 requiring them; `allowDobAutofill` consent toggle is a no-op | Critical |
| C13 | A7 | All 5 sections initialize React state from props on mount only — saving sections out of order silently reverts each other's writes (data-loss-class bug under normal flow) | Critical |
| C14 | A7 | `vitest.config.ts` global flip to `jsdom` likely breaks A5's `node`-env background tests | Medium |
| C15 | A8 | Substring host match `host.includes('greenhouse.io')` matches `notgreenhouse.io.evil.com` — homograph weakness | High |
| C16 | A8 | `FILL_RESULT_BROADCAST` only fires on success; popup status shows "last fill: never" after 5 failed attempts | Medium |
| C17 | A8 | `FillResult` for `value.kind === 'skip'` reports `error: 'unknown-error'` instead of distinct skipped category — popup UX shows "3 unknown errors" for deliberate skips | Medium |
| C18 | A10 | `INTENT_GET` does not exist in A5; correct key is `INTENT_GET_FOR_TAB`. Compile error | Critical |
| C19 | A10 | `HighlightToggle` reads `res.applied`; A9 returns `res.keywordCount`/`res.rangeCount`. Compile error | Critical |
| C20 | A10 | Calls `HIGHLIGHT_STATUS` which has no handler in A5 OR A9 — runtime "no handler registered" reject | Critical |
| C21 | A10 | `DetectedIntent` consumer code branches on `kind: 'job-posting'\|'application-form'\|'unknown'`, but A9 ships `kind: 'greenhouse'\|'lever'\|'workday'` + `pageKind`. Discriminant mismatch | Critical |
| C22 | A10 | D9 invariant ("highlight toggle disabled with tooltip when signed out") prose-only — `HighlightToggle` has no `disabled` prop and the `SignedOut` view never renders the toggle | Critical |
| C23 | A11 | Adds `GENERATION_*` + `DETECTED_JOB_BROADCAST` keys directly to A5's protocol.ts via raw `onMessage` calls, bypassing A5's `HANDLERS` exhaustive Record. Second protocol owner | Critical |
| C24 | A11 | `chrome.alarms` 2-second polling silently clamped to 30s by Chrome's minimum-period rule. Generation tab "stalls" updating every 30s | High |
| C25 | A11 | Workday E2E covers only My Information page (1 step), success criterion says 2 steps, decision memo requires 4. Three different numbers in three places. Demo will not show D3=b wizard | Critical |
| C26 | A11 | "Highlight disabled when signed out" never tested in E2E despite being a Zovo-deal-explicit UX contract | High |
| C27 | A11 | Refresh-flow E2E missing — single 60-min session test would catch the most likely Day-2 prod failure mode | Medium |
| C28 | B2 | JSDoc inside `src/core/**` code blocks references `document`, `HTMLElement`, `chrome.storage` — fails B2's own grep-gate acceptance criterion | High |
| C29 | B4 | 5 BLOCKER-class compile errors against B2 fixtures: `ClassificationConfidence` literal-union (0.4 not in {1.0..0.9..0.0}), missing required `JobPreferences` willingTo* fields, missing `JurisdictionAuthorization` flags, missing `Consents` flags, dispatch.ts `return skip(...)` returns `FillValue` not `FillRuleResult` | Critical |
| C30 | B7 | `./greenhouse` exports entry uses `default` instead of B1's `require` key → breaks CJS dual-emit | Critical |
| C31 | B7 | "Replace null placeholder" instruction is wrong — B1 actually populates `./greenhouse` with a real (empty) object | High |
| C32 | B9 | Stale phase-directory paths in Required Reading: `phase_B5_dom_adapter_core/`, `phase_B1_engine_scaffold/` (actual: `phase_B5_dom_adapter_scanner_and_filler/`, `phase_B1_scaffold/`). Executor will fail to open required files | Critical |
| C33 | B9 | Required Reading §6 says B5 exports `IScanner`/`IFiller`/`IFileAttacher`/`IMutationWatcher` interfaces; B5 ships function-based surface | Critical |
| C34 | B9 | `fillReactTextInput` helper provenance ambiguous — B5 doesn't document a `react-internals.ts` file | High |
| C35 | B9 | Bundle-size budget 150KB vs decision memo §6.3 100KB — pick one | Medium |
| C36 | B9 | Single-tenant fixture vs decision memo §5 R2 "test against 3+ Workday tenants" | Medium |

---

## Contract mismatch matrix

| Producer | Consumer | Mismatch | Severity |
|---|---|---|---|
| A2 | A4 | None — token field names byte-aligned | PASS |
| A4 | A6 | Fragment encoding symmetric, regex agrees, 4-key URLSearchParams; **but** A4 test fixture tokens fail A6 parser (length < 20, exp > now+24h) | Medium |
| A2 | A6 | A6 silently renames wire `accessToken/refreshToken` → storage `access/refresh`; not documented | Medium |
| A5 | A6 | A6 imports `setTokens/getTokens`; A5 ships `writeTokens/readTokens` | **CRITICAL** |
| A5 | A6 | A6 redefines `AuthState` (union) overriding A5's `AuthStatus` (interface); same name slot | **CRITICAL** |
| A5 | A6 | A6 imports `from '@webext-core/messaging'` (different namespace) instead of A5's typed instance — silent broadcast drop | **CRITICAL** |
| A5 | A6 | A6 `signOut()` drops A5's `clearAllTabState()` — tab-state leak | High |
| A5 | A7 | `PROFILE_UPLOAD_JSON_RESUME` missing from A5 ProtocolMap; A7 adds in own phase | High |
| A5 | A8 | `FILL_REQUEST` payload reshape (`{tabId, ats}` vs `{tabId, fieldId, fieldLabel, intent}`) — protocol surgery | Medium |
| A5 | A9 | `KEYWORDS_EXTRACT` missing from A5; A9 adds in own phase | **CRITICAL** |
| A5 | A9 | `HIGHLIGHT_APPLY` payload `keywords` field is wrong shape for online-only; A9 must reshape | **CRITICAL** |
| A5 | A9 | `INTENT_DETECTED` handler does not read `sender.tab.id`; A9 relies on `tabId: -1` sentinel that A5 never honors | High |
| A5 | A10 | `INTENT_GET` does not exist; A5 ships `INTENT_GET_FOR_TAB` | **CRITICAL** |
| A5 | A10 | `HIGHLIGHT_STATUS` never declared; A10 calls it on mount | **CRITICAL** |
| A5 | A11 | `GENERATION_UPDATE`, `GENERATION_START`, `GENERATION_CANCEL`, `DETECTED_JOB_BROADCAST` all missing; A11 mutates protocol.ts | **CRITICAL** |
| A3 | A9 | Bit-perfect contract on `POST /api/v1/ats/extract-skills` | PASS |
| A7 | A8 | A8 reads top-level `firstName/lastName/email/updatedAt`; A7 writes nested `basics.*` + `profileVersion`. `readProfile()` returns null for every real profile. **Breaks Apr 17 demo gate** | **CRITICAL** |
| A9 | A10 | A10 branches on `intent.kind === 'job-posting'`; A9 ships `kind: 'greenhouse'/'lever'/'workday'` + `pageKind`. Discriminant mismatch | **CRITICAL** |
| A9 | A10 | A10's `HighlightToggle` reads `res.applied`/`cleared:number`; A9 returns `keywordCount`/`cleared:boolean` | **CRITICAL** |
| B1 | A7 | A7 imports `from 'ats-autofill-engine/profile'`; B1 exports map has no `./profile` | **CRITICAL** |
| B1 | B2 | B2 imports `zod`; B1 declares "zero runtime deps" | **CRITICAL** |
| B1 | B7 | B7 changes `./greenhouse` exports key from `require` to `default` (breaks CJS) | **CRITICAL** |
| B2 | B6 | B2 ships `HighlightRange` + `IKeywordHighlighter` port that B6 explicitly deletes in v2 | **CRITICAL** |
| B2 | B7/B8/B9 | B2 doesn't define `JobPostingData`, `PageIntent`, `FillPlanResult`, `FormModel.sourceATS`, ATS-extension FieldType values | **CRITICAL** |
| B2 | B4 | B4 uses `CONFIDENCE.ARIA_LABEL = 0.4`; B2's `ClassificationConfidence` literal union doesn't include 0.4 | **CRITICAL** |
| B2 | B4 | B4 test fixtures missing required `JobPreferences.willingTo*`, `Jurisdiction.requiresVisa/legallyAllowed`, `Consents.allowEeoAutofill/allowDobAutofill` | **CRITICAL** |
| B5 | B7 | `fillField` sync vs B7 `await fillField`; B7 reads `primary.reason`, B5 returns `error` | **CRITICAL** |
| B5 | B7 | B7 imports `type AttachResult` from B5; B5 doesn't export it | **CRITICAL** |
| B5 | B8 | B8 calls `fillField(el, instruction)`; B5 takes `(el, value: string\|boolean)` | **CRITICAL** |
| B5 | B8 | B8 imports `AttachResult`; B5 doesn't export | **CRITICAL** |
| B5 | B8 | B8's `attachLeverResume` is sync; B5's `attachFile` is `Promise<FillResult>` | **CRITICAL** |
| B6 | A9 | A9 calls `applyHighlights(root, ranges: HighlightRange[])`; B6 ships `(root, keywords: readonly string[])` | **CRITICAL** |
| B7 | A8 | B7 exports `GreenhouseAdapter`; A8 reads `mod.adapter`; no `kind` field | **CRITICAL** |
| B7 | A8 | `fillField` signature `(el, value, hints)` vs A8's expected `(instruction)` | **CRITICAL** |
| B8 | A8 | B8 only flat exports, no namespace, no `adapter`, no `kind` | **CRITICAL** |
| B8 | A8 | `fillLeverField(root, fieldType, instruction, ctx)` 4-arg signature can't satisfy A8 contract | **CRITICAL** |
| B9 | A8 | B9 has `WorkdayAdapter.scan/fill`; A8 expects `adapter.scanForm/fillField`; A8 also missing wizard step orchestration | **CRITICAL** |
| B5 | B6 | File ownership in `src/adapters/dom/**` — B5 writes barrel first, B6 appends. No collision, ordering invariant holds | PASS |
| B7/B8 | parity | B7 has namespace + flat, B8 only flat. Inconsistent | High |

---

## Invariant violations

### Decision-memo invariants

- **`skill-taxonomy` leaked into B-phase**: NONE. All B-phase plans pass the grep gate. (A3 is the only phase that mentions it; correct per memo §2.5.)
- **DOM references in core (`document`/`window`/`HTMLElement`/`chrome.*`)**: B2 (3 hits in JSDoc inside `src/core/**` code blocks — `HTMLElement` in `IFormScanner` JSDoc, `chrome.storage` in `ResumeHandle` and `IProfileProvider` JSDoc, `document` in `form-model.ts` and `highlight-range.ts` JSDoc). Source files would fail B2's own acceptance grep. **B2 must rewrite the 5 JSDoc comments.**
- **`HighlightRange` remnants**: B2 (creates the type + port + 5 references), A9 (imports + uses 15+ times). B2 is the upstream source; A9 is the consumer. Both must be cleaned per v2 §2.5.
- **Workday D3=b multi-step wizard implementation**: B9 implements correctly with 4-step adapter and EEO consent gate test. **A8 still implements D3=a single-page** (silent revert). A11 E2E covers only 1-2 wizard steps (not 4). Two consumers ignore the v2 flip.
- **EEO consent gate test in B9**: PASS — `voluntary-disclosures.spec.ts` ships 7 cases including DOM-setter spies on the consent-denied path.
- **Engine `applyHighlights(root, keywords)` shape in B6**: PASS in B6, FAIL in A9 consumer.
- **A5 ProtocolMap covers all 13 messages**: FAIL (4 missing).
- **B1 exports map covers all downstream imports**: FAIL (`./profile` missing for A7/A10).
- **Auth token shape `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` byte-aligned A2→A4→A6**: PASS at the wire-format layer. A6 silently renames to `{ access, refresh, frontToken, accessTokenExpiry }` at the storage layer; consistent with A5 but undocumented.

### Repo path drift

A1, A5, A6 (and presumably A7-A11) all hard-code `e:/job-assistant` + `zovo-labs/job-assistant` instead of decision-memo-locked `e:/llmconveyors-chrome-extension` + `ebenezer-isaac/llmconveyors-chrome-extension`. **System-wide cascade fix required.** The catch-up email to Michael TODAY references `ebenezer-isaac/llmconveyors-chrome-extension` — if executor runs A1 verbatim, the URL 404s.

### B1 version drift

B1 publishes `0.1.0-alpha.0` as a "name reservation"; B9 publishes `0.1.0-alpha.1`. Decision memo §2.1 says initial version IS `0.1.0-alpha.1`. Either update memo to sanction the placeholder or fix B1.

### Em-dash rule

Every plan file uses em dashes (`—`) heavily despite user `feedback_no_em_dashes.md` rule "NEVER use em dashes in any output, anywhere, ever". Cosmetic but consistent across all 20 plans.

---

## Per-phase grade table

| Phase | Grade | Blockers | Critical | Minor | One-line summary |
|---|---|---|---|---|---|
| A1 | D | 3 | 9 | 11 | Repo naming drift, ESLint/tsconfig broken, dep stub |
| A2 | A | 0 | 0 | 4 | Cleanest plan in batch — ships as-is |
| A3 | A | 0 | 0 | 6 | Contract bit-perfect with A9; minor LoC overrun OK |
| A4 | A- | 0 | 4 | 3 | Strong contract adherence; double-fetch race + locale hardcode |
| A5 | C- | 4 | 6 | 6 | ProtocolMap incomplete; downstream phases force protocol surgery |
| A6 | C+ | 6 | 4 | 6 | Strong fragment parser; 6 hard imports break against A5 |
| A7 | C+ | 4 | 8 | 12 | Profile shape breaks A8; phone prefix/DOB drift; stale-state data loss |
| A8 | C- | 9 | 12 | 23 | All 4 adapter contracts broken; D3=b wizard silently reverted |
| A9 | F | 1 | 5 | 5 | Imports types that don't exist; range-builder fiction |
| A10 | B- | 5 | 4 | 3 | 5 contract drifts vs A5+A9; D9 disabled state unreachable |
| A11 | C+ | 2 | 7 | 6 | Workday wizard E2E only 1 step; sign-in coverage shallow; chrome.alarms 30s clamp |
| B1 | C | 2 | 1 | 5 | `./profile` missing from exports map; zod missing from deps |
| B2 | C+ | 6 | 4 | 4 | Ships HighlightRange + IKeywordHighlighter (deleted in v2); JSDoc grep failures |
| B3 | A- | 0 | 3 | 6 | Mozilla port clean; ClassifiedField name shadow; LABEL_RULES drift |
| B4 | B- | 5 | 1 | 8 | 5 type-fixture compile errors against B2 |
| B5 | A- | 0 | 3 | 5 | Critical snippets inlined; FillResult.selector + offsetParent risk |
| B6 | A- | 0 | 1 | 4 | Internally clean; flags A9 drift correctly |
| B7 | C | 6 | 5 | 6 | exports map drift, B5 sync/async mismatch, B2 type gap, A8 contract |
| B8 | D | 9 | 6 | 5 | 7 contract dimensions wrong; no `adapter` export, no LeverAdapter namespace |
| B9 | A- | 4 | 3 | 10 | Highest-quality phase; 4 clerical blockers (stale paths, undefined type) |

---

## Cross-cutting themes

### Theme 1 — A5 ProtocolMap is the keystone defect

A5 was supposed to be the single owner of the message protocol. It shipped 9 of 13 required keys and got 2 of those wrong. Every downstream A-phase compensates by mutating `protocol.ts` in its own phase plan, creating 6 separate protocol-edit sites that will conflict during parallel Day-3..6 execution. **Fix A5 first.** This unblocks A6, A7, A9, A10, A11 simultaneously.

### Theme 2 — Engine adapter shape was never agreed

B7/B8/B9 each invented their own export shape (`GreenhouseAdapter` namespace, flat exports, `WorkdayAdapter` namespace), and A8 invented a fourth (`mod.adapter` with `kind` field). No phase plan cites a "canonical AtsAdapter shape" decision. **Architect decision required**: name (`adapter` vs `XAdapter`), members (signature of `fillField`/`attachFile`), `kind` field, factory pattern for stateful adapters (B8 needs variant state, B9 needs wizard state). Once decided, propagate to A8 + B7 + B8 + B9.

### Theme 3 — B2 type catalogue is incomplete

B2 ships type names that look complete but several downstream consumers import types B2 never defines: `JobPostingData` (B6, B7, B8), `PageIntent` (B6, B8), `FillPlanResult` (B9), `AttachResult` (B7, B8), `FormModel.sourceATS` (B8), `IScanner`/`IFiller`/`IFileAttacher` (B9), and ATS-extension `FieldType` values (B8 uses 18 camelCase keys not in B2's kebab-case union). PLUS B2 ships v1-era artifacts (`HighlightRange`, `IKeywordHighlighter`) v2 explicitly deletes. **B2 needs an addendum phase before B5/B6/B7/B8/B9 can run.**

### Theme 4 — Profile shape is two incompatible schemas

A7 writes the full B2 `Profile` (nested `basics.*`, `profileVersion: '1.0'`, no `updatedAt`). A8 reads the A5-stub shape (top-level `firstName`/`email`/`updatedAt`). After A7 ships, every A8 `readProfile()` returns null and the Apr 17 demo silently fails. Neither A7 nor A8 noticed.

### Theme 5 — D3=b Workday flip is incomplete

The D3 flip from single-page to multi-step wizard happened the same day plans were written. B9 caught the flip and built the 4-step adapter correctly. A8 missed the flip and still says "D3=a single-page scope". A11 missed the flip and only tests 1 wizard step. The Apr 17 hard demo gate ("4-step wizard traversal with EEO consent gate") cannot be met until A8 + A11 are updated.

### Theme 6 — Repo path is wrong everywhere

Decision memo locks `ebenezer-isaac/llmconveyors-chrome-extension` (per the catch-up email going to Michael TODAY). A1 + A5 + A6 + (likely A7-A11) all hard-code `e:/job-assistant` + `zovo-labs/job-assistant`. System-wide cascade fix.

---

## Recommended remediation order (architect work, ~4-6 hours)

1. **Tier 1 — unblockers (do first, ~2h)**
   - Repo path cascade: rename `e:/job-assistant` → `e:/llmconveyors-chrome-extension` and `zovo-labs/job-assistant` → `ebenezer-isaac/llmconveyors-chrome-extension` across A1, A5, A6, A7, A8, A9, A10, A11 (sed-able)
   - A5 ProtocolMap: add 4 missing keys + reshape `HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR` envelopes + add inert handlers
   - B1: add `./profile` sub-entry + `zod` runtime dep
   - B2: delete `highlight-range.ts`, `IKeywordHighlighter` port, 5 JSDoc references; add `JobPostingData`, `PageIntent`, `FillPlanResult` types; add ATS-extension FieldType union members

2. **Tier 2 — adapter contract decision (~1h)**
   - Pick canonical `AtsAdapter` shape: name, members, `kind` field, factory pattern
   - Patch A8 + B7 + B8 + B9 to ship that shape
   - Update A8's `profile-reader.ts` to read `basics.*` + `profileVersion` instead of top-level + `updatedAt`

3. **Tier 3 — A6/A7/A9/A10 contract reconciliation (~1.5h)**
   - A6: rename `setTokens`/`getTokens` calls; switch `@webext-core/messaging` import to A5's instance; pick `AuthState` vs `AuthStatus` and propagate; preserve `clearAllTabState()` in `signOut`; add concurrent sign-in mutex
   - A7: add phone prefix + DOB inputs, fix React stale-state pattern, vitest per-project env
   - A9: delete `range-builder.ts`, rewrite `apply-handler.ts` to call `applyHighlights(document.body, terms)`, remove `HighlightRange`/`TextWalk` imports
   - A10: rename `INTENT_GET` → `INTENT_GET_FOR_TAB`, drop `HIGHLIGHT_STATUS`, fix `DetectedIntent` consumer code, add `disabled` prop to `HighlightToggle` and render in `SignedOut`, remove `HighlightToggle` from `OnApplicationForm`

4. **Tier 4 — Workday wizard scope (~30min)**
   - A8: remove "D3=a single-page" language; add wizard orchestration loop OR delegate to B9 + A9
   - A11: expand E2E checklist from 1 step to 4 steps with EEO consent gate verification

5. **Tier 5 — clerical (~30min)**
   - B9: fix 4 stale phase-directory paths in Required Reading
   - B4: add missing `Profile` fixture fields, fix `CONFIDENCE.ARIA_LABEL` value, fix dispatch.ts return shape
   - B7/B8: align exports map shape, sync vs async, add `adapter` named export

---

## Next action

**Recommended: (b) Fire corrective rewrites for ~9 phases before execution starts Apr 12.**

The 4-6 hours of architect remediation pays for itself: it prevents an estimated 10-20 hours of executor stall + retry across the parallel Day 2-6 execution window. If executors run as-is, A6/A7/A8/A9/A10 will all stall on contract drift simultaneously and the orchestrator's "verify and correct" loop will burn the entire Day 6 buffer.

The two phases ready to ship as-is are A2 and A3. They can execute Day 1 in parallel with the architect's remediation pass on the rest.

**Do NOT proceed to (a) Apr 12 execution without remediation.** The blocker count (40+) and the cluster pattern around A5/B1/B2/profile-shape make this a structural drift, not isolated polish.

---

**End of consolidated review. Source artifacts: `reviews/review-{A1..A11,B1..B9}.md`.**
