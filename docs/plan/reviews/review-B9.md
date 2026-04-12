# Review — Phase B9 (Workday Adapter + Publish)

**Reviewer**: Architect (Opus 4.6, 1M context)
**Date**: 2026-04-11
**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B9_workday_adapter_and_publish/plan.md` (1311 lines)
**Scope**: single phase (B9 only)
**Phase budget**: 12-15 hours (largest phase in Plan B)

---

## Summary verdict

**Grade: A-**

B9 is the most rigorously specified phase of Plan 100. It correctly implements the hardest decision in the plan (D3=b multi-step wizard, flipped from single-page) and lays out a defensible, legally-aware, test-backed implementation path. The EEO consent gate is handled with exemplary care — the legal rationale is inlined, the short-circuit is before any DOM query, and the test matrix (7 cases) catches both the happy path and the adversarial "accidental leak" case via DOM-setter spies.

However, there are **four concrete defects** that an executor will hit, two of which are BLOCKERS for the plan as written (stale phase-directory paths in Required Reading, and a `FillPlanResult` type that B9 uses but B2/B5 never define), plus a cross-phase contract gap with A8 (which the reviewer for A8 also needs to know about) and a publish-step omission (2FA / dry-run / provenance not covered).

Fix the four items in §"Required fixes" and the phase is A+.

---

## Invariant checklist (per reviewer brief)

| # | Invariant | Status | Notes |
|---|---|---|---|
| 1 | D3=b multi-step wizard | PASS | Explicitly locked in line 49: "D3 is locked to (b) = multi-step wizard. Do not revert to single-page." |
| 2 | 4 wizard steps enumerated | PASS | My Information, My Experience, Voluntary Disclosures, Review enumerated in §Goal (lines 27-31), selector maps per step (files 7-10), scanners per step (files 12-15), fillers per step (files 16-18) |
| 3 | NEVER auto-advances Save-and-Continue | PASS | Line 35 "NEVER auto-advances"; line 183 JSDoc note on `saveAndContinueButton`: "NEVER click this programmatically. User action only"; line 1219 out-of-scope section reinforces it; critical note 2 (line 1284) re-asserts |
| 4 | Detects page transitions + re-scans + re-fills per step | PASS | `watchForStepChange` with MutationObserver on `data-automation-id` attribute changes + `popstate`/`hashchange` URL fallback + 50ms debounce (snippet 3, lines 506-559). Test list includes 6 transition cases. |
| 5 | EEO consent gate short-circuit | PASS | Snippet 5 (lines 623-680) shows both gates in-line with early return BEFORE any DOM query. Filler definition at step 23 (lines 255-259) restates the two gates. Critical note 4 (lines 1288-1291) reinforces it. |
| 6 | Consent-gate test | PASS | `voluntary-disclosures.spec.ts` with **7 tests** (lines 1161-1169) including Test 1 with `HTMLInputElement.prototype.value` setter spy + `HTMLElement.prototype.click` spy. Test 5 explicitly verifies work-auth fills even when demographics consent is false. Gold standard. |
| 7 | `src/ats/workday/**` MPL-2.0 | PASS | MPL-2.0 file header snippet (snippet 1, lines 446-454) includes berellevy BSD-3-Clause attribution line. Every new source file gets the 5-line block. |
| 8 | Workday drag-drop flagged as known limitation | PASS | File attacher (snippet 6) has dedicated `workday-drag-drop-rejected` branch with `userMessage` field + `upload-timeout` branch + try/catch for `InvalidStateError`. Known limitation is also documented in CHANGELOG (line 404) and README update (step 38). |
| 9 | Publishes `ats-autofill-engine@0.1.0-alpha.1` at end | PASS | Step 39: `pnpm publish --access public --tag alpha`. Version bump in package.json step 35. Tag `v0.1.0-alpha.1` pushed in step 40. |
| 10 | NO `skill-taxonomy` in B9 | PASS | Grep confirms zero matches for `skill-taxonomy` in the B9 plan. Correct: skills extraction is backend-only per decision memo §2.8. |
| 11 | NO `HighlightRange` in B9 | PASS | Grep confirms zero matches for `HighlightRange`. Highlighter renderer is B6's scope, not B9's. |

All 11 invariants PASS.

---

## Checklist A — Contract verification against other phases

### A.1 vs B1 (scaffold)

- B1 creates `src/ats/workday/index.ts` as MPL-2.0 empty placeholder (line 81, 872-880). B9 replaces it with the real barrel export. **PASS**.
- B1 `package.json` reserves the `./workday` sub-entry in the exports map (B1 line 252-255). B9 step 35 updates it to point at the built artefact. **PASS**.
- B1 `tsup.config.ts` has the `ats/workday/index` entry (B1 line 398). B9 step 35 says "add `src/ats/workday/index.ts` to `entry`" — **this is a contract mismatch**: if B1 already added it, B9's step 35 should say "verify already present" rather than "add". Minor wording issue, not a blocker, but worth fixing to avoid executor confusion.
- B1 MPL-2.0 header format: B1's `src/ats/workday/index.ts` uses a 3-line ats-autofill-engine comment (line 880) which differs from B9's 5-line MPL-2.0 + berellevy attribution block. **B9 wins** — the real source files need the full attribution. Executor should replace, not append.

### A.2 vs B2 (core types + taxonomy)

- B9 imports `Profile`, `FormModel`, `FillResult`, `FillPlanResult` from `core/types`.
- B2 defines: `FormModel`, `FormFieldDescriptor`, `FillInstruction`, `FillPlan`, `FillResult`, `FillError` (B2 line 42, 232, 297).
- **B2 defines `FillPlan`, NOT `FillPlanResult`**. B9 uses `FillPlanResult` as its filler return type in 8+ places (signatures at step 21, 23, 28; snippet 5). This type is never defined anywhere in the plan set.
- **BLOCKER**: Either (a) rename every `FillPlanResult` in B9 to `FillPlan` (if the existing B2 type covers the need) or (b) add a new `FillPlanResult` type to B2's required types list and update B2's code snippet. The B9 usage has fields (`filled`, `skipped`, `failed`, `aborted`, `reason`, `details`) that don't match B2's `FillPlan` shape (B2 line 232 has `instructions` + `skipped`, no counts). These are two different concepts: `FillPlan` is "what to do", `FillPlanResult` is "what was done". B9 needs the "what was done" aggregate type, and it must be defined somewhere.
- `Profile.demographics.consent` and `Profile.consents.privacyPolicy` are defined in B2 (B2 lines 783-1026, 1217, 1237, 1240, 1289-1293). **PASS**.
- B9 requires `profile.workAuthorization.*`, `profile.education[]`, `profile.workExperience[]` — confirmed present in B2's `Profile` schema (B2's required reading §Required fields). **PASS**.

### A.3 vs B5 (DOM adapter scanner + filler)

- B5 surface: `scan`, `fillField`, `attachFile`, `watchForm` plus `FillResult`, `ScanOptions`, `WatchOptions`, `FillFailureReason`, `AttachFailureReason` (B5 line 40).
- B5 does NOT export `IScanner`, `IFiller`, `IFileAttacher`, `IMutationWatcher` as interface names. B9's Required Reading §6 (line 64) says "DOM adapter surface: `IScanner`, `IFiller`, `IFileAttacher`, `IMutationWatcher`, `FormModel`, `FillResult`, `FillPlanResult` interfaces".
- **DRIFT**: B5 is function-based (exports `scan(root)`, `fillField(el, value)`, `attachFile(el, file)`, `watchForm(root, cb)`), not interface-based. B9's executor will look for `IScanner` in `src/adapters/dom/index.ts` and not find it. Either (a) correct B9's Required Reading to match B5's function-based surface, or (b) add interface type aliases in B5.
- B9 references `fillReactTextInput` helper from B5 (B9 step 27: "if B5 already exports these from `adapters/dom/react-internals.ts`, re-export from there instead of duplicating"). B5's plan does not appear to define `react-internals.ts` or `fillReactTextInput` in the excerpt I read (the B5 fillers are shown at lines 660-884). **VERIFY**: B9 should either confirm B5 exposes this or add it as an explicit dependency on B5, otherwise B9 silently duplicates the React setter hack.
- `waitForElement` is referenced by B9 (snippets 4 and 6) as imported from `../xpath` (local to workday) and from `./xpath` (relative to `file-attacher.ts`). Consistency check: B9 file #27 (`xpath.ts`) creates this as "forked from berellevy `shared/utils/getElements.ts`". B5 has its own `waitForElement` inside the mutation-watcher scope. **Acceptable** because Workday's XPath-driven discovery is legitimately different, but executor should note there are now two `waitForElement` implementations in the tree.

### A.4 vs B7 (Greenhouse) and B8 (Lever)

- Publish sub-phase precondition (line 384): "B7 (Greenhouse) and B8 (Lever) plans must have completed their steps and merged their code to the engine repo before this sub-phase runs."
- config.json dependency matches: `"B9": ["B5", "B7", "B8"]` (lines 64-66). Parallel-safe spec (line 81) says "A8 starts AFTER B7/B8/B9 publish mid-day". **PASS**.
- Publish publishes all three adapters together as one alpha.1 tarball. **PASS**.

### A.5 vs A8 (content script autofill)

- **CROSS-PHASE CONTRACT GAP**: A8's plan has a stale reference at line 176: "For A8 we only care about the single-page Workday 'My Information' screen (decision memo §2.6 scope D3=a)". D3=a is the flipped-FROM value, not the locked value. A8 is stale relative to the v2 restructure.
- B9's WorkdayAdapter surface exports `detectCurrentStep`, `watchForStepChange`, `scanMyInformation`, `scanMyExperience`, `scanVoluntaryDisclosures`, `scanReview`, `fillMyInformation`, `fillMyExperience`, `fillVoluntaryDisclosures`, `extractJob` (step 28, lines 288-304). This is 10 exported functions.
- A8 imports from `ats-autofill-engine/workday` at line 621 but the import is a single `mod` dynamic import, and A8 does not document which of the 10 functions it consumes, nor does it wire `watchForStepChange` into the content-script lifecycle.
- B9 defines the per-step fill primitives but NEVER specifies who orchestrates them. The plan says "The adapter re-scans + re-fills on each new step only when the extension user triggers fill (via the popup 'Fill' button)" (line 38), but the orchestrator that calls `watchForStepChange(doc, onChange)` and holds the current step in state is left undefined. This must live in A8 (content script), not in B9.
- **NOT a B9 blocker** — B9's scope is to produce the primitives. The gap is in A8's plan, which should be flagged by the A8 reviewer. But B9 should add one paragraph to §"Out of scope" saying "A8 owns the wizard orchestration loop; B9 provides the primitives (`detectCurrentStep`, `watchForStepChange`, per-step fillers) that A8 composes." This clarifies the contract for both executors.

### A.6 vs A11 (sidepanel + E2E + demo)

- A11's manual E2E checklist §7 "Workday autofill" (A11 lines 1469-1477) covers only My Information page — single-page demo. Line 1474: "Reach the 'My Information' page of the application wizard." No checklist for My Experience / Voluntary Disclosures / Review.
- A11 success criteria line 1752: "Workday multi-step wizard fill traverses at least 2 steps (My Information + 1 subsequent step) on at least 1 live posting per D3=b". **Contradiction**: the manual checklist says 1 step, the success criterion says 2 steps, and B9's smoke test (B9 line 1099-1111) says 4 steps. Three different numbers in three places.
- **NOT a B9 blocker** — B9 correctly specs the 4-step adapter. A11's reviewer should reconcile the numbers. But B9 should add a note in §"Acceptance criteria" that the full 4-step traversal is B9's acceptance target and that A11's lighter bar is an explicit demo-day de-risk, not a retraction of the 4-step scope.

---

## Checklist B — Grep gate

- `skill-taxonomy`: **0 matches** in B9 plan. PASS.
- `HighlightRange`: **0 matches** in B9 plan. PASS.
- `console.log`: **0 matches**. PASS.
- `@ebenezer-isaac/` scope: **0 matches** (uses unscoped `ats-autofill-engine`). PASS.
- `chrome-extension-guide` / `chrome-extension-toolkit`: **0 matches**. PASS.
- `TODO` / `FIXME`: **0 matches** in deliverables. PASS.
- `document|window|chrome\.` in `src/core/**`: N/A (B9 creates no core files). Build-time grep gate in step 37 enforces this, so future regressions will fail CI.

---

## Checklist C — Fixture specificity

**GOOD**:
- 4 explicit HTML fixtures listed with captured scope: `my-information.html`, `my-experience.html` (with 2 work rows + 1 education row), `voluntary-disclosures.html` (all EEO fields present), `review.html`.
- Step 29 specifies capture procedure: open real public Workday tenant (`https://workday.wd5.myworkdayjobs.com/External`), copy `body.outerHTML`, scrub tenant-identifying strings, KEEP all `data-automation-id` values intact.

**CONCERN**:
- Workday is the most volatile ATS (React SPA, customised per tenant, lazy-mounted sections). A single captured fixture may not represent multi-tenant variation. Plan should reference 2+ tenants or at minimum note that tenant-specific variation is a known test limitation. Line 34 of the B9 plan says "smoke test against a single live public Workday tenant" — that's weak for the highest-risk adapter.
- **Recommendation (non-blocking)**: upgrade fixture capture from 1 tenant to 2 tenants (pick `workday.wd5.myworkdayjobs.com` AND a second, e.g. `deloitte.wd5.myworkdayjobs.com` or `accenture.wd103.myworkdayjobs.com`). Test passes if adapter works on both. Risk R2 in decision memo §5 already says "Test against 3+ real Workday tenants" — B9 should honour that commitment (currently says "1 tenant").

**PASS with recommendation**: fixture specificity is adequate but not excellent. The captured HTML path is clear and the `data-automation-id` preservation rule is correct. The 1-tenant restriction is the only gap.

---

## Checklist D — Publish step

- `pnpm publish --access public --tag alpha` — **PASS**, correct command with correct `alpha` dist-tag (not `latest`).
- Version pin: `0.1.0-alpha.1` explicit in package.json step 35 and verified post-publish via `npm view ats-autofill-engine@0.1.0-alpha.1 version` (step 39). **PASS**.
- Git tag `v0.1.0-alpha.1` pushed in step 40. **PASS**.
- **MISSING: dry-run**. Should include `pnpm publish --dry-run` first to verify tarball contents before real publish. Critical for catching accidentally-included files (tests, fixtures, node_modules). Add: `pnpm pack && tar -tzf ats-autofill-engine-0.1.0-alpha.1.tgz | head -100` to inspect tarball.
- **MISSING: 2FA note**. npm requires 2FA for unscoped package publishes under many account policies. B9 should note "Ensure `npm login` is recent + OTP from authenticator ready" as a pre-step. If npm account has `--auth-type=webauthn` TOTP, CLI will prompt mid-publish — needs executor attention.
- **MISSING: provenance flag**. `pnpm publish --provenance` would sign the tarball with GitHub Actions workload identity. This is optional for alpha but is a free security win that demonstrates enterprise rigour to Michael (the demo audience). Non-blocking but worth adding.
- **MISSING: `.npmignore` verification**. B1 creates `.npmignore` excluding tests + configs + investigation. B9 publish step does not verify this. Add: `pnpm pack --dry-run` and grep output for `tests/` or `investigation/` — must be empty.
- `pnpm size-limit` gate is enforced (line 1257) with 30KB core / 150KB total gzipped budgets. **PASS**.
- Dist-core boundary grep is enforced twice (step 37 + step 39). **PASS**.

### Publish step summary
Functional but incomplete. Add dry-run + 2FA note + `.npmignore` verification for a safe first-ever publish. These are cheap additions (~10 min of executor time) that prevent the most common publish disasters.

---

## Checklist E — Code-review-on-read findings

Applying `.claude/rules/code-review-on-read.md` adversarial reading:

1. **Snippet 2 (`detectCurrentStep`)**: priority order check 1 uses `doc.querySelector('[data-automation-id="legalNameSection_firstName"]')`. If a Workday tenant renames the attribute or the element is lazy-mounted, fallback to URL works, but the h2 text fallback relies on English-only strings. Decision memo §6 glossary + out-of-scope (line 1223) correctly scopes this as "English-only selectors, v1.1 adds i18n". **ACCEPTABLE**.

2. **Snippet 2 URL fallback**: `doc.defaultView?.location?.href ?? ''`. Empty string is tested against regexes that all require a URL prefix, so no false positive. **PASS**.

3. **Snippet 3 (`watchForStepChange`)**: the observer is installed on `doc.body`, subtree+childList+attributes with attributeFilter. Workday SPA mutates the DOM aggressively — on a tenant with e.g. 5000+ DOM nodes, the observer may fire hundreds of times per second on initial render. Debounce is 50ms which is tight. **CONCERN**: consider raising the debounce to 150ms or using `requestIdleCallback` for the actual `detectCurrentStep` call. Not a blocker but a perf consideration for the live smoke test.

4. **Snippet 3 popstate/hashchange listeners**: Workday uses client-side SPA routing but may not emit `popstate` on internal task transitions (React Router v6 uses `history.pushState` without popstate). Relying on popstate is fragile — the DOM MutationObserver is the load-bearing detection mechanism, popstate is redundant best-effort. **Acceptable** but snippet 3 should include a comment that popstate is secondary, not primary.

5. **Snippet 4 (`fillWorkdayDropdown`)**: pointer event sequence is correct for React. `waitForElement` timeout is 2000ms; if Workday takes 2.5s to render the listbox on a slow network, the adapter reports `listbox-never-opened` falsely. **Minor**: raise to 3000ms or make it a config option.

6. **Snippet 5 (EEO consent gate)**: the iteration of `scanner.fields` at the end is a `for...of` loop that can throw if the widget registry is not yet populated. The `// ... (delegate to widget registry)` comment is a placeholder — step 23 is prose, not a concrete widget dispatch implementation. **CONCERN**: the filler body is under-specified below the consent gate. The consent gate is the load-bearing bit and it's correctly specified, but the "fill the fields" logic below should be concrete enough to test. Add a dispatch table mapping `fieldType` → widget function explicitly in snippet 5.

7. **Snippet 6 (file attacher)**: `UPLOAD_ACK_TIMEOUT_MS = 2000` + `UPLOAD_SHORT_WAIT_MS = 500`. Total budget is 2.5s. A slow Workday tenant on a bad connection may take 5s to process an upload. **Minor**: raise to 5000ms for the ack timeout. The test spec says "timeout (success icon never appears within 2s)" which matches — but 2s is aggressive for real-world Workday.

8. **Step 22 (my-experience filler)**: algorithm says "If `N > M`: click Add Another `N - M` times, awaiting a new row to appear". Loop iteration is correct, but each click triggers a React re-render that may lazy-mount the new row with a delay. `waitForElement` with a specific row-count observation is the right approach. **However**: step 22 does not specify what to do if the row-add button is disabled (Workday limits work history to e.g. 10 rows). Add: "If `addAnotherWorkHistoryButton` is disabled after N clicks, abort with `max-rows-reached`".

9. **Step 25 (file attacher)**: line 274 says "Catch block handles any `InvalidStateError` from the DataTransfer assignment". Snippet 6 `catch (err)` catches everything including network errors inside `waitForElement`. **Minor**: narrow the catch to `InvalidStateError` by name + rethrow the rest, otherwise you hide bugs in the waiter.

10. **Step 38 CHANGELOG**: formatted as Keep-a-Changelog. **PASS**. But the "Notes" section mentions "Workday file upload uses DataTransfer with failure detection; some tenants may require manual drag-drop." Good user-facing disclosure.

11. **Step 39 pre-publish gate**: runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `grep dist/core/`, then publishes. Order is correct. **PASS**.

12. **File #6 (`wizard/state.ts`)**: mentioned in the file list (line 80) as "internal state container: current step, last-seen fields per step, resume upload status" but never referenced in any subsequent step. It's listed but not implemented. **MINOR**: either add a step spec for it or delete from the file list. If it's truly internal and consumed only by the orchestrator (A8), then B9 should clarify its interface (read-only snapshot via `getState(): WorkdayState`) so A8 can consume it.

13. **Line 1095 bundle size**: "total `dist/` gzipped < 150KB (wizard logic permits a larger budget than the old single-page target of 100KB)". Decision memo §6.3 still says "full < 100KB gzipped". **DRIFT**: either update decision memo to 150KB or shrink B9 to 100KB. My recommendation: update decision memo, 150KB is realistic for 3 ATS adapters + wizard logic + Mozilla heuristics. Flag this to the decision-memo maintainer.

14. **Line 1212 rollback clause 4**: "identify the offending import in the core module and move it to `adapters/dom/**`. Do NOT use a ts-ignore or eslint-disable escape hatch." **PASS**. Correct guidance.

15. **Lines 1219-1228 out-of-scope**: explicit and comprehensive. Named items include auto-advance, auto-submit, Save-for-later, account creation, multi-language, SSO subdomains, Workday Recruiting, Ashby/BambooHR/etc. **PASS** — well-bounded phase.

---

## Checklist F — Blueprint drift

- Decision memo §2.6 scope "Workday depth" row (lines 117-118): "Multi-step wizard traversal (My Information → My Experience → Voluntary Disclosures → Review) — user clicks 'Save and Continue' between pages, extension detects new page and scans/fills. NEVER auto-advances." B9 implements this verbatim. **PASS**.
- Decision memo §6.1 April 17 acceptance (line 360): "On a live Workday posting: multi-step wizard traversal — My Information page fills, user clicks Save-and-Continue, extension detects My Experience page, scans, user clicks Fill, experience fields populate, repeat for Voluntary Disclosures (EEO consent-gated), Review". B9 smoke test (lines 1099-1111) follows this exact sequence. **PASS**.
- Decision memo §2.4 licensing (lines 79-84): "ATS adapters (`src/ats/**`): MPL-2.0 (protects selector IP)". B9 enforces MPL-2.0 file headers on every file under `src/ats/workday/**` plus berellevy BSD-3-Clause attribution. **PASS**.
- Decision memo §5 Risk R2: "Test against 3+ real Workday tenants". B9 says "single live public Workday tenant". **DRIFT**: see Checklist C above. Update B9 or update the decision memo.
- Decision memo §6.3 non-functional: "Engine bundle size: core < 30KB gzipped, full < 100KB gzipped". B9 line 1095 says 150KB total. **DRIFT**: see #13 above. Update one or the other.

Three drift items total, all minor, none blockers.

---

## Required fixes (blocking)

These MUST be corrected before the executor picks up B9.

1. **Stale phase-directory paths in Required Reading**. Lines 64, 65, 67 reference directories that don't exist:
   - `phase_B5_dom_adapter_core/plan.md` → actual: `phase_B5_dom_adapter_scanner_and_filler/plan.md`
   - `phase_B4_classifier_and_fill_rules/plan.md` → **verify**, directory exists as `phase_B4_classifier_and_fill_rules/`, OK
   - `phase_B1_engine_scaffold/plan.md` → actual: `phase_B1_scaffold/plan.md`
   Executor with a fresh 64k context window will fail to open these files and either skip Required Reading or fail the phase. **BLOCKER**.

2. **Undefined type `FillPlanResult`**. B9 uses this type in step 21, 22, 23, 28, snippet 5, and the acceptance criteria. B2's plan defines `FillPlan`, `FillResult`, `FillInstruction`, `FillError` — **but not `FillPlanResult`**. B9 must either:
   - (a) add a task to B9 to define `FillPlanResult` in `src/core/types/fill-instruction.ts` (which B2 owns) — but this violates B2's scope boundary and means B9 is mutating core types after B2 has shipped
   - (b) add a task to B2 (out of B9's scope, file corrective plan) to add `FillPlanResult = { filled, skipped, failed, aborted?, reason?, details: FillResult[] }`
   - (c) redefine the filler return type to use B2's existing `FillPlan` — but `FillPlan` is `{ instructions, skipped }`, which is pre-execution, not post-execution
   The cleanest fix is (b): file a corrective plan for B2 that adds the `FillPlanResult` alias. B9 should NOT proceed as-is because the executor will stall at step 21 when `FillPlanResult` fails to import. **BLOCKER**.

3. **Missing contract with B5's actual surface**. B9 Required Reading §6 says B5 exports `IScanner`, `IFiller`, `IFileAttacher`, `IMutationWatcher` interfaces. B5's actual surface is function-based: `scan`, `fillField`, `attachFile`, `watchForm`. B9 must update its reference to match the function-based surface, OR B5 must add interface type aliases. **BLOCKER** because executor will search for non-existent `IScanner` type and fail the import.

4. **Missing `fillReactTextInput` provenance**. B9 step 27 says "if B5 already exports these from `adapters/dom/react-internals.ts`, re-export from there instead of duplicating". B5 plan does not document a `react-internals.ts` file or a `fillReactTextInput` helper (from the sections I read). B9 must either confirm via a B5 re-read that this helper exists, or add a concrete fork instruction: "copy berellevy's `fillReactTextInput` into `src/ats/workday/react-props.ts` with attribution". As written, the executor cannot proceed because the source is ambiguous. **BLOCKER**.

---

## Recommended fixes (non-blocking)

1. **Multi-tenant fixture capture** (Checklist C). Upgrade from 1 tenant to 2 tenants to honour decision memo §5 R2 "3+ tenants" commitment.

2. **Publish dry-run + 2FA note + `.npmignore` verification** (Checklist D). Cheap additions that prevent disaster on first-ever publish.

3. **Bundle size budget reconciliation** (Checklist F #13). 150KB vs 100KB contradiction between B9 and decision memo. Pick one.

4. **Debounce and timeout tuning** (Checklist E #3, #5, #7). 50ms debounce, 2000ms listbox wait, 2000ms upload timeout are all on the aggressive side. Raise to 150ms / 3000ms / 5000ms for real-world Workday tenants.

5. **Clarify A8-B9 orchestration contract** (Checklist A.5). Add a paragraph in B9's §Out of scope section: "A8 owns the wizard orchestration loop; B9 provides the primitives. A8 calls `watchForStepChange(doc, onStepChange)` at content-script mount, holds `currentStep` state, dispatches the corresponding `fillX` function when the user clicks the popup Fill button." This gives the A8 executor a concrete consumption contract.

6. **File #6 (`wizard/state.ts`) scope clarity** (Checklist E #12). Either specify what it exports or delete from file list.

7. **Snippet 5 widget dispatch table** (Checklist E #6). The `// ... (delegate to widget registry)` placeholder is the only under-specified code in the plan. Replace with a concrete switch or dispatch table.

8. **Row-add max limit handling** (Checklist E #8). Step 22 should handle the case where Workday disables Add Another after N rows.

9. **Raise `catch (err)` specificity in snippet 6** (Checklist E #9). Narrow to `InvalidStateError` + rethrow the rest.

10. **Reconcile 4-step-vs-2-step-vs-1-step numbers across A11 and B9** (Checklist A.6). B9 is the source of truth (4 steps); A11 needs update. Flag to A11 reviewer.

---

## What B9 gets right (keep doing this)

- **Legal rigour on EEO**: two-gate short-circuit, DOM-setter spies in test, JSDoc with GDPR Art. 9 + ADA citations, README documentation, CHANGELOG disclosure. This is the highest-quality legally-sensitive code spec in the entire Plan 100.
- **Rollback plan has 5 distinct branches** (line 1203-1213) covering technical, partial-wizard, publish, bundle-boundary, and demo-day scenarios. Each is actionable.
- **Out-of-scope section is explicit** (11 named items, line 1219-1228). Prevents scope creep.
- **Compliance gate runs twice** (step 37 + step 39). Catches late regressions.
- **Executor time budget is itemised** (lines 1271-1280) with 10 sub-categories summing to 15h. Executor can track velocity.
- **Tests are 7-deep on the most sensitive file** (`voluntary-disclosures.spec.ts`). Each case is distinct and adversarial.
- **berellevy attribution is preserved** (snippet 1) and explicitly called out in critical note 3 as non-negotiable.
- **Critical executor notes are numbered and concrete** (12 items, line 1268-1307). Every item is actionable.
- **No em dashes** per user instruction (line 1301).
- **Publish sub-phase is sequential** (critical note 10, line 1303) — prevents partial adapter ship.

---

## Final grade: A-

**Rationale**: B9 is a near-perfect specification of the hardest phase in Plan 100. The invariants are all honoured, the legal gate is rigorous, the tests are adversarial, the fixtures are captured not invented, and the rollback is comprehensive. The four blockers in Required Fixes are all clerical (stale paths, undefined type, stale surface reference, ambiguous helper source) — none are architectural or design flaws. Fix the blockers and this is A+.

The A- grade reflects: 4 blockers (clerical but will stall the executor), 3 drift items vs decision memo (minor), 10 non-blocking recommendations (nice-to-have). No architecture bugs, no invariant violations, no missing invariants.

**Recommendation to orchestrator**: address blockers 1-4 via a quick edit pass on B9's plan file (no corrective plan needed — the fixes are typo-level edits), then dispatch to executor with confidence. Blocker 2 (`FillPlanResult`) requires touching B2, so file that as a tiny corrective plan for B2 before B9 runs. Total fix time: ~30 minutes of architect time.
