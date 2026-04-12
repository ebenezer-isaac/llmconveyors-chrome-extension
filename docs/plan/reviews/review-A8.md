# Review — Phase A8 (content script autofill)

**Reviewer**: Opus architect
**Scope**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`
**Plan size**: 2072 lines
**Phase claim**: 9/10 confidence, 3-4h, ~1350 LoC across ~10 files

---

## Grade: C-

A8 is structurally strong: hex-clean separation, good DI, thorough unit coverage of error branches, narrow content-script matches, correct rationale for module-scoped state and ISOLATED world, and the discriminated `FillResponse` shape is good. BUT it has **four separate contract mismatches with its declared dependencies** (B7, B8, B9, A7) that will make the first `pnpm typecheck` fail and will block the Apr 16 smoke test. Every single adapter import call + every profile read is wrong. These are not cosmetic — they block execution end-to-end.

The phase is recoverable (all four fixes are mechanical once the architect picks the canonical shape), but it cannot be executed as written.

---

## A. Contract vs B1 exports map

### A1. `./dom` sub-entry — NOT imported by A8
The A8 critical-invariants from the reviewer brief list `ats-autofill-engine/dom` as an import A8 should make. **A8 does NOT import `./dom` anywhere.** The plan only uses the three ATS sub-entries and the root `ats-autofill-engine` (for `buildPlan`). This is actually OK per the hex rule — the ATS adapters wrap `./dom` internally — but the reviewer-brief invariant mentions it explicitly, so flag: **A8 never reaches the DOM adapter directly, which is consistent with B5/B7/B8/B9 architecture.** Not a defect; documenting for the record.

### A2. Sub-entry resolution — OK in theory
B1 §File 1 package.json declares `./greenhouse`, `./lever`, `./workday` entries in the `exports` map. A8's `adapter-loader.ts` does `await import('ats-autofill-engine/greenhouse')` etc. Vite/tsup both resolve bare-specifier sub-entries via `package.json#exports` — this path will resolve at build time. **PASS.**

### A3. Root entry `buildPlan` export
A8 line 783: `import { buildPlan } from 'ats-autofill-engine'`. B1's root entry is `src/index.ts` (empty placeholder) and B4 is supposed to populate `buildPlan`. B4's plan not read here but schedule shows B4→B5→B7/8/9 chain, and A8 depends on B9 which depends on B5+B7+B8 — so by Day 5 end `buildPlan` should be exported. Verify B4 actually re-exports from the root barrel. **REQUIRES B4 VERIFICATION** (not blocking A8 review, flag to B4 reviewer).

---

## B. Contract vs B7 (Greenhouse) — ❌ BROKEN

### B1. Named-export mismatch (BLOCKING)
A8 `adapter-loader.ts` §6.7 line 613-614:
```ts
const mod = await import('ats-autofill-engine/greenhouse');
return mod.adapter;
```

B7 `src/ats/greenhouse/index.ts` (B7 plan line 1515) exports:
```ts
export const GreenhouseAdapter = Object.freeze({ ... });
```

**There is NO `adapter` named export on the Greenhouse sub-entry.** The export is `GreenhouseAdapter`. A8's `mod.adapter` is `undefined`, falls through to the adapter-null branch, returns `NO_ADAPTER` on every request. This breaks every smoke test in §7.2.

**Fix**: either (a) A8 reads `mod.GreenhouseAdapter` / `mod.LeverAdapter` / `mod.WorkdayAdapter` (switch by kind), or (b) B7/B8/B9 each add `export const adapter = GreenhouseAdapter` (alias), or (c) all three phases standardize on a single `adapter` convention and the other name is deleted.

Pick one. Update the ONE phase whose executor runs first — probably add the alias in B7/B8/B9 since they run in parallel and changing A8 is simpler.

### B2. `fillField` signature mismatch (BLOCKING)
A8 `types.ts` line 282:
```ts
readonly fillField: (instruction: FillInstruction) => FillResult;
```

B7 `Net surface` (phase B7 line 50):
```
GreenhouseAdapter.fillField(el, value, hints?): FillResult
```

B7 takes `(element, value, hints)` — three args, starting with an HTMLElement. A8 expects `(instruction)` — one arg, a `FillInstruction` object.

**A8's controller §6.9 line 1003 calls `adapter.fillField(instruction)`** — this will fail with a runtime error on B7 (the adapter will try to use the instruction object as an HTMLElement).

**Fix**: either A8's structural type widens to `(el: HTMLElement, value, hints?)` and the controller unpacks `instruction.selector → el = document.querySelector(selector)` before calling, OR B7/B8/B9 expose a unified `fillField(instruction: FillInstruction): FillResult` wrapper alongside their lower-level function. The latter is cleaner because the selector lookup belongs in the adapter (it already knows about React-props probes etc.).

Recommendation: add a thin "instruction-shaped" top-level `fillField` to each ATS adapter's namespace object that internally looks up the element. Update B7/B8/B9 plans to specify this.

### B3. `scanForm` signature — PARTIAL MATCH
A8 expects `scanForm: (root: Document) => FormModel`. B7 net surface: `scanForm(root?: Document | Element): FormModel`. Compatible (A8's narrower type). **PASS.**

### B4. `attachFile` signature mismatch (BLOCKING)
A8 `types.ts`:
```ts
readonly attachFile?: (instruction: FillInstruction) => Promise<FillResult>;
```

B7: `attachFile(input, file): AttachResult` — sync, takes element + file, returns `AttachResult` not `FillResult`. A8 awaits it (`await adapter.attachFile(instruction)`) which is harmless on a sync return, but:
- Wrong return type (`AttachResult` vs `FillResult`)
- Wrong arg list (instruction vs `(input, file)`)
- A8 has no way to resolve the resume File handle from the profile here — §6.9 doesn't show how the `FillInstruction` would carry a File (instructions carry `{kind: 'file', ...}` but what? a File object? a resume handle id?). The instruction value shape is never clarified.

**Fix**: this is deeper than a name alias. A8 must specify:
1. How the resume File is loaded (chrome.storage? Profile resumeHandleId → resolve via background?).
2. How the instruction's `value.kind === 'file'` is dispatched to `attachFile` with the actual `File` object.
3. The unified `AtsAdapter.attachFile` signature.

Currently §6.9 skips file instructions on adapters without `attachFile`, but for adapters WITH attachFile the call path is undefined.

### B5. Adapter `kind` field (BLOCKING)
A8 `types.ts` line 297: `readonly kind: AtsKind`. A8 reads `loaded.kind` to populate state and to cross-check against `request.ats`. B7's `GreenhouseAdapter = Object.freeze({...})` exports — but the B7 plan Net surface does NOT list a `kind` field on the adapter object. The phase specs a `matchesUrl`, `scanForm`, `fillField`, `attachFile`, `selectDropdown`, `extractJob`, `findFormRoot`. **No `kind`.**

**Fix**: B7/B8/B9 plans each need a line specifying `kind: 'greenhouse' | 'lever' | 'workday'` as a member of the exported adapter object. Add to all three.

---

## C. Contract vs B8 (Lever) — ❌ BROKEN

### C1. No unified namespace at all (BLOCKING)
B8 `src/ats/lever/index.ts` exports individual named functions (B8 plan line 594-614):
```ts
export { scanLeverForm, fillLeverField, attachLeverResume, extractLeverJobPosting, ... }
```

**There is no `LeverAdapter` namespace, no `adapter` object, no `kind` field.** A8's loader does `mod.adapter` — `undefined`.

Worse, the member names are different from B7 (`scanLeverForm` vs B7's `scanGreenhouseForm` in the function plus `GreenhouseAdapter.scanForm` on the namespace). B7 has a namespace AND flat exports. B8 only has flat exports. **B7 and B8 are structurally inconsistent with each other**, on top of neither matching A8.

**Fix**: B8 must be rewritten to export a `LeverAdapter` namespace AND add the `adapter` (or `LeverAdapter`) with the same member names as the unified A8 contract. Update B8 plan §Step 8 (line 581+) to match.

### C2. `fillField` signature (BLOCKING)
B8 line 457: `export function fillLeverField(el, instruction)` — two args: element + instruction. Different from B7's three-arg `(el, value, hints)`. Neither matches A8's `(instruction)`. **Triple mismatch.**

---

## D. Contract vs B9 (Workday) — ❌ BROKEN + WIZARD SEMANTICS WRONG

### D1. Namespace shape (BLOCKING)
B9 line 77: `WorkdayAdapter` namespace with members `{ urlPatterns, detectCurrentStep, watchForStepChange, scan, fill, extractJob }`. Not `scanForm`/`fillField`, but `scan`/`fill`. **All member names differ from A8.** No `adapter` named export. No `kind`.

**Fix**: update B9 to expose the same shape as B7/B8 under a unified contract. This is the biggest rewrite because B9's semantics are different (multi-step wizard state machine, not stateless scan→fill).

### D2. **A8 does NOT handle multi-step wizard at all — contradicts D3=b**
This is the most serious issue.

- Decision memo §2.6 D3=b: **MULTI-STEP WIZARD TRAVERSAL** across 4 Workday pages.
- A8 plan §5.7 line 175-176: *"for A8 we only care about the single-page Workday 'My Information' screen (decision memo §2.6 scope D3=a)"*.
- A8 plan §7.2 acceptance criterion 7: "At least 5 fields filled (the fields on the My Information single-page scope per decision memo §2.6 D3=a)".

**A8 is written against a stale D3=a single-page scope. The decision memo was flipped to D3=b on 2026-04-11 (the same day the plan was written).** A8 says D3=a in two places explicitly.

Multi-step wizard requires:
- `detectCurrentStep` call on FILL_REQUEST + on MutationObserver step change
- Per-step re-scan (My Information → My Experience → Voluntary Disclosures → Review)
- Step-change detection via MutationObserver on `data-automation-id` attribute changes
- EEO consent gate on Voluntary Disclosures (`profile.demographics.consent === true && profile.consents.privacyPolicy === true`)
- `INTENT_DETECTED` emission on step change so popup can refresh its UI
- Review step MUST NOT fill (read-only scan)
- NEVER auto-advance between steps

**None of this is in A8.** The AutofillController treats Workday identically to Greenhouse/Lever — one scan, one fill, one response. On a live Workday wizard, the user:
1. Clicks Fill — A8 fills My Information. Works.
2. Clicks Save and Continue → Workday renders My Experience page.
3. Clicks Fill again — A8 calls `scanForm(document)` and `fillField` in a tight loop, but there's no per-step adapter wiring, no repeating-section handler, no row-add-click loop. B9's `my-experience-filler.ts` is never reached because A8 calls the single `fillField` method.

**Fix**: this is a ~300-400 LoC addition to A8 + a B9 API redesign so the adapter exposes either (a) a stateful wizard controller or (b) enough introspection for A8's controller to call per-step methods. Options:

- **Option 1 (clean)**: B9's `WorkdayAdapter` exposes `currentStep()`, `scanStep(step)`, `fillStep(step, profile)` methods. A8's controller has a Workday-specific path that detects step, scans step, fills step, subscribes to step-change events.
- **Option 2 (opaque)**: B9 exposes a single `orchestrateFill(profile)` that internally handles step detection and emits progress events. A8 just delegates.
- **Option 3 (bridge)**: A9 (which handles `INTENT_DETECTED`) owns Workday step tracking, A8 just calls scan+fill and A9 re-triggers fill on each step. This couples A8 and A9 awkwardly.

Pick one — but note that Option 1 is the only one where B9's multi-step surface is actually exercised by A8.

### D3. Consent gate not checked in A8
A8's controller reads profile and calls `buildPlan(formModel, profile)`. The consent gate (`profile.demographics.consent === true`) is never checked anywhere in A8. Either (a) B9's voluntary-disclosures-filler enforces the gate internally (possible — B9 line 198-201 says "consent-gated fields never filled unless consent granted"), in which case A8 is fine IF and ONLY IF A8 wires through the right profile shape, OR (b) A8 needs its own gate check before dispatching to voluntary-disclosures.

Gate check is a correctness requirement (§D10 of the decision memo). **Verify path-through in final plan.**

### D4. `INTENT_DETECTED` for step changes
A8 explicitly defers intent detection to A9 (§1 non-goals line 48). But for Workday wizard, step-change detection IS an intent detection event — the user clicked Save and Continue, a new form is mounted, and the popup needs to know "fill is now available for the new step." This crosses the A8/A9 boundary.

Either A8 owns the step-change MutationObserver and emits a new message type (e.g., `WORKDAY_STEP_CHANGED`), or A9 does it but then A9 depends on A8's Workday adapter being loaded. Currently A8 says "A9 will add intent emission" but A9 is scheduled for Day 6 AFTER A8 is done. If the Apr 20 demo has to show the wizard working, step change MUST work at A8's completion — A9's later enhancements can add more.

**Fix**: move the Workday step-change detector into A8. Add `WORKDAY_STEP_CHANGED` to ProtocolMap as part of §6.12.

---

## E. Contract vs A7 (profile shape) — ❌ BROKEN

### E1. `ReadableProfile` shape is wrong (BLOCKING)
A8 `profile-reader.ts` §6.8 defines:
```ts
interface ReadableProfile {
  firstName?: string;   // top-level
  lastName?: string;
  email?: string;
  phone?: string;
  location?: {...};
  updatedAt: number;    // REQUIRED top-level
}
```

And in `readProfile()` line 710: `if (typeof r.updatedAt !== 'number') { return null; }`.

A7's persisted Profile (from `ats-autofill-engine/profile`, B2/A7 plan line 283+) is a full JSON-Resume-based Profile with:
- `profileVersion: '1.0'` at root
- `basics.firstName`, `basics.lastName`, `basics.email`, `basics.phone`, `basics.location.*`
- NO top-level `firstName`/`email`/`updatedAt`

A7 even shows the migration path at line 296-297: `typeof r.updatedAt === 'number' && !('profileVersion' in r)` — so updatedAt is a LEGACY (A5 stub) indicator. A7 wipes it out and replaces with `profileVersion`.

**A8 will return null for every real A7 profile.** Every FillResponse will be `NO_PROFILE`. The controller test "parses a minimal profile" (line 1758) passes because the test writes a stub matching A8's shape — but the shape doesn't match reality.

**Fix**: rewrite `ReadableProfile`, `readProfile`, `isEmptyProfile` to read the actual Profile shape:
```ts
interface ReadableProfile {
  profileVersion: string;
  basics: { firstName?, lastName?, email?, phone?, location?, ... };
  // ... whatever else buildPlan consumes
}
```
And use the proper gate (`profileVersion in record`). Ideally import `Profile` and `ProfileSchema` directly from `ats-autofill-engine/profile` and use `ProfileSchema.safeParse()` like A7 does. This removes the ad-hoc type guards entirely.

This also fixes the unsafe cast at line 943: `profile as unknown as Parameters<typeof buildPlan>[1]`. With the correct type the cast disappears.

### E2. `buildPlan` cast hides type drift
The cast `profile as unknown as Parameters<typeof buildPlan>[1]` explicitly admits "we don't know if this matches". This is a code smell the plan explicitly notes in the §Note after line 1075. With E1 fixed, the cast becomes `buildPlan(formModel, profile)` with full type inference. **Delete the cast.**

### E3. `isEmptyProfile` gate wrong for real shape
Line 744-747 checks top-level `p.firstName || p.lastName || p.email || p.phone`. With the correct shape it should check `p.basics?.firstName || p.basics?.email || ...`. Minor, but fix together with E1.

### E4. Profile resume file handle (CRITICAL if Workday attachFile path runs)
The A7 profile has `resumeHandleId` pointing to a stored File blob. A8 never loads the File from storage — the `FillInstruction.value.kind === 'file'` branch just calls `adapter.attachFile(instruction)` with whatever `instruction` contains. Who resolves the File? Two options:
- **buildPlan reads the file** — but buildPlan is pure core, no DOM/storage access. Can't.
- **A8 resolves it** before the instruction is built.

Neither is specified. The plan hand-waves file attachment. For the Apr 20 demo, resume upload on Greenhouse is a must-have (§7.2 bullet 5 line 1941: "first name, last name, email, phone, location, resume upload or similar"). **Fix**: A8 controller must, after receiving the plan, pre-resolve any `{kind:'file'}` instruction's value to a real `File` object via a separate `FileResolver` dep injected in `AutofillControllerDeps`. Add this to the plan.

---

## F. Contract vs A5 (ProtocolMap)

### F1. `FillRequest` breaking rewrite — INTENTIONAL but note scope creep
A5's `FillRequest` is `{tabId, fieldId, fieldLabel, intent}` — designed for per-field AI-enhanced-answer flow. A8 replaces with `{tabId, ats}` — whole-form fill. This is a legitimate pivot and A8's own §6.12 documents it as a protocol edit.

However: A5 likely has tests depending on the old shape. A8 §7.3 says "A5 background's AUTH_STATUS round-trip still returns correctly" but makes no mention of A5's `FILL_REQUEST` tests. A5 line 2240+ has FILL_REQUEST-related tests (it's a `NotImplementedError` thrown per the plan, so the test probably just asserts the throw — check). If A5's test expected the old request shape with `fieldLabel`, the rewrite will break compile in A5's tests.

**Fix**: add an explicit task to §8.2 to update A5's `FILL_REQUEST` test (if any) to the new shape. Also update A5's plan document so the source-of-truth `ProtocolMap` matches what A8 ships — otherwise a future reviewer reading A5 sees drift.

### F2. `FILL_RESULT_BROADCAST` not in A5
A5's `ProtocolMap` (A5 plan line 366-393) does NOT have `FILL_RESULT_BROADCAST`. A8 adds it in §6.12. This is a straightforward extension and is documented. **PASS**, but note: adding handler to A5's dispatch table is also needed — §6.13 handles this. OK.

### F3. `INTENT_DETECTED` — out of scope, pass
A8 explicitly defers to A9. A5 already has the handler stub. **PASS.**

### F4. `sendMessage` from content script for `FILL_RESULT_BROADCAST`
§6.9 line 1047: `void sendMessage('FILL_RESULT_BROADCAST', {...})`. `@webext-core/messaging`'s `sendMessage` from content script to background works, but the default overload is `sendMessage(key, data)` — no tabId. The content script's messages go to the background automatically. **OK.** But A8 calls `sendMessage('FILL_REQUEST', msg.data, tabId)` in the BG handler (line 1350) — that overload is needed to forward to a specific content tab. A5 must have exposed that overload. Verify A5 ships `sendMessage` with the 3-arg overload. Investigation 33 says `@webext-core/messaging` supports it natively. **PASS** subject to A5 not hiding it.

### F5. `msg.sender?.tab?.id`
§6.13 line 1359: `const tabId = msg.sender?.tab?.id`. A5 plan §2420 warns that `sender` "does not always surface cleanly with full typing". A8's use is defensive (`?.` + null check + warn-log + return). **PASS.**

---

## G. Other findings (ARF — Adversarial Reading Findings)

### G1. Controller race on concurrent `executeFill`
§5.5 claims "Safe to call concurrently — the second caller gets the cached value on the next microtask". §6.9 `ensureAdapter` line 819-830:
```ts
async ensureAdapter(url: string) {
  if (this.adapter) { return this.adapter; }
  const loaded = await this.deps.loadAdapter(url);
  ...
}
```

Two concurrent calls with `this.adapter === null` BOTH pass the `if` guard, BOTH invoke `loadAdapter`, and the second one overwrites the first's assignment. Not harmful (adapters are idempotent) but the claim of "second caller gets cached value on next microtask" is wrong — both callers run the full load. Fix: store a `this.loadingPromise` and await it if in-flight:
```ts
if (this.adapter) return this.adapter;
if (this.loadingPromise) return this.loadingPromise;
this.loadingPromise = this.deps.loadAdapter(url).then(...);
return this.loadingPromise;
```
Minor. Fix or clarify.

### G2. `setAdapterKind` is never read externally but is called by controller
§6.6 state.ts exports `setAdapterKind`/`getAdapterKind`. Only `recordResult` etc. are read. The adapterKind state is dead data — the controller already holds `this.adapter.kind`. Either delete from `state.ts` or document a consumer. Dead code per `.claude/rules/code-quality.md`. Delete.

### G3. `recordScan(formModel)` stores mutable FormModel
State records `{formModel, scannedAt}` with a direct reference. If `scanForm` returns a live reference (not a frozen copy) and the adapter later mutates it, state drifts. A8 assumes adapters return immutable FormModels. Verify B5/B7 contract: does `scan(...)` return `readonly` and `Object.freeze`d? If not, the state module should `structuredClone(formModel)` or the FormModel type should have `readonly` modifiers throughout. **Flag for B5 spec check.**

### G4. `skipped` never increments for `value.kind === 'skip'`
§6.9 line 984-996: when `value.kind === 'skip'`, a `FillResult` with `error: 'unknown-error'` is pushed and `skipped += 1`. OK, but the error code is wrong — `'unknown-error'` is for catastrophic failures. A 'skip' should be its own category. The FillResultEntry discriminated union in §6.12 line 1243-1250 doesn't have a 'skipped' error variant. The result is that the popup (A10) sees "3 unknown errors" when the reality is "3 fields deliberately skipped because profile has no data for them". UX bug.

**Fix**: add `'skipped-no-value'` to the `FillResultEntry.error` union, or split `FillResultEntry` into `ok | skipped | failed` three-way discriminant.

### G5. Host substring matcher false positive risk
`host.includes('greenhouse.io')` matches `notgreenhouse.io.evil.com`. Substring matching on hosts is a classic homograph/phishing weakness. Convert to suffix match:
```ts
host === 'greenhouse.io' || host.endsWith('.greenhouse.io')
```
for each matcher. Security issue per `.claude/rules/security.md`. **Fix.**

### G6. `window.location.href` read in content script is fine but capture ONCE
§6.11 line 1101: `const url = window.location.href` inside the FILL_REQUEST handler. On SPA pushState, this URL may have changed since bootstrap. A8 doesn't re-resolve the adapter on pushState. For Greenhouse React SPA + job-boards.greenhouse.io, a navigation from /jobs/1 to /jobs/2 within the same SPA wouldn't re-instantiate the script — so `this.adapter` is stale. Not a bug for POC (user triggers fill on a posting, adapter kind doesn't change between Greenhouse jobs). **Document as known limitation** for A9/A11 E2E.

### G7. `FILL_RESULT_BROADCAST` emission after success — but also on failure?
§6.9 only emits the broadcast on the "happy path" after `return { ok: true }`. Every early-return failure branch (NO_ADAPTER, NO_PROFILE, NO_FORM, SCAN_FAILED, PLAN_FAILED, ATS_MISMATCH) does NOT emit a broadcast. The background's per-tab Map therefore has no record of "fill attempted but failed" for popup to display. A10 popup status showing "last fill: never" when the user has tried 5 times is wrong UX.

**Fix**: broadcast ALWAYS, with the failure reason in the payload. Upgrade `FillResultBroadcast` to include `status: 'success' | 'failed'` + `error?: string`.

### G8. `ctx.onInvalidated` called after bootstrap returns
§6.11 line 1175: `ctx.onInvalidated(() => { ... resetState() })`. This resets module state but does NOT unregister the `onMessage('FILL_REQUEST', ...)` listener. On extension reload, two listeners accumulate (old + new). `@webext-core/messaging` docs (investigation 33) — does it auto-unregister on ctx invalidation? Likely yes via the context hook, but not verified. Add an explicit `ctx.onInvalidated(unregisterFillListener)` OR document that `onMessage` handles it. **Verify and document.**

### G9. `CONTENT_DEBUG` feature flag hard-codes to `MODE !== 'production'`
§6.5 line 380-382: relies on `import.meta.env.MODE`. WXT/Vite does set this, so it works — but debug logs will appear in dev builds even on users' machines if they load-unpack a dev build. For the Apr 17 demo recording, ensure the build is a production build (`pnpm build`, not `pnpm dev`). **Document in demo recording checklist** (§7.2 or §12).

### G10. No test for dynamic import failure
Unit tests cover `resolveAtsKind` branches and controller error paths. No test for `loadAdapter` — the actual dynamic import. Happy-dom + vitest CAN mock dynamic imports via `vi.mock`, and a failure test (network error → null) would be a 15-line addition. Line 640-645 says "failures logged and return null" but there's no test. **Add a test.**

### G11. `profile-reader.ts` in `entrypoints/` directory
The reader lives at `entrypoints/ats.content/profile-reader.ts` — in the content-script entrypoint folder. WXT treats `entrypoints/` as the scan root for entry files (investigation 33 §Discovery). The `profile-reader.ts` file sitting next to `index.ts` — does WXT try to compile it as a separate content script? WXT discovers files by naming convention (`.content.ts`, `ats.content/index.ts` etc.), not every file in the folder. Should be fine, but verify against WXT docs. The ats-autofill-engine equivalent pattern uses `src/` subdirs. Consider moving auxiliary files to `src/content/autofill/` (as §0 file-count estimate actually lists) and re-export. The plan §6.2 directory layout puts everything in `entrypoints/ats.content/` which clashes with §0 claim. Inconsistency — pick one.

### G12. TypeScript strict mode + `document` in deps
§6.11 line 1163: `document` passed as a constructor arg. In the content-script global scope `document` is `Document`. Fine. But in the test file (`tests/content/controller.spec.ts` line 1574: `document: document`) — happy-dom provides `document`. OK. **PASS.**

### G13. ESLint `no-console` exception coverage
§6.5 `/* eslint-disable no-console */` + re-enable at bottom. But inside the re-enable block, any FUTURE addition below the re-enable line would trigger again. Since the file ends at the `}` of the last function (re-enable line 428 is the last line), OK. But Prettier may re-order — document "keep eslint-enable as the final line". Minor.

### G14. `__peekState` / `__ATS_MATCHERS` / `__PROFILE_KEY` / `__getAtsKindFromAdapter` — internal test APIs
Four files export test-only symbols prefixed with `__`. Convention is fine but these MUST not be in the production bundle. Tsup tree-shakes unreachable exports IF consumers don't import them. Because they're barrel-exported, they land in `dist/`. For a content script bundle size matters less, but verify the bundle size budget §7.1 < 120 KB still holds. Probably fine. **Note.**

### G15. `buildPlan` throw handling — log wrong context
§6.9 line 944-958 catches `buildPlan` throws and returns `PLAN_FAILED`. Good. But the `err` is logged via `log.error('buildPlan threw', { err })` — losing the `err.stack`. Structured logging should preserve `{ message: err.message, stack: err.stack, name: err.name }` not a raw `err` object that may serialize differently across bundlers. Standardize error serialization in `logger.ts`. **Minor.**

### G16. B5's `scan` vs B7's `scanForm` — terminology drift
B5 exports `scan` (B5 plan reference). B7's namespace exposes `scanForm`. A8 calls `adapter.scanForm`. OK for A8 → adapter, but the internal adapter → DOM adapter call is `scan` (different name). Document the aliasing in B7/B8/B9 plans so new readers don't think there are two separate implementations. **Minor plan clarity fix.**

### G17. File count mismatch §0 vs §8.1
§0 says "~10 files created, 0 files modified" + targets `entrypoints/ats.content/`, `src/content/autofill/`, and `tests/content/`. §8.1 lists 12 created + 5 modified and puts everything in `entrypoints/ats.content/` (no `src/content/autofill/`). §0 is wrong. **Fix the number / directory to match §8.1.**

### G18. `tests/content/controller.spec.ts` imports `document` as global
Line 1574: `document: document`. In happy-dom + vitest the `document` global exists. But the test relies on `vi.mock('../../src/background/messaging/protocol', ...)` at line 1505. Mocking a barrel with partial shape using `orig<typeof ...>()` returns a typed mock. A5's `protocol.ts` uses `defineExtensionMessaging` which initializes global listeners on import — the partial mock overrides `sendMessage` but not `onMessage`, so `onMessage('FILL_REQUEST', ...)` in `messaging.ts` would still attempt to register. Since tests in `controller.spec.ts` don't import `messaging.ts`, no concern. **PASS.**

### G19. Confidence score inflation
A8 claims 9/10 confidence. Given the four contract mismatches above (B7/B8/B9/A7), real confidence is 4/10 on "will typecheck pass without changes" and 2/10 on "will smoke test pass". The 9/10 is overstated because the plan did not cross-reference the actual exported surface of its dependencies — it guessed at `{ adapter }` without checking. **Revise confidence and add a "Cross-reference verified" checklist at the top.**

### G20. §6.13 edit to `handlers.ts` — import path wrong?
§6.13 line 1347: `return sendMessage('FILL_REQUEST', msg.data, tabId)`. `sendMessage` is imported from `./protocol.js` — but which file is this? §6.13 says "In `src/background/messaging/handlers.ts`". handlers.ts already has `onMessage` imported from A5 line 1216 (`./protocol.js`). OK. But `sendMessage` may not be imported in A5's handlers.ts. **Flag**: add "import sendMessage" to the list of edits in §8.2 diff.

### G21. `browser.storage.session` used in `recordFillSnapshot`
§6.13 line 1395 uses `browser.storage.session.set`. Chrome MV3 `storage.session` has a 10 MB cap and is wiped on SW restart. For per-tab snapshots that's fine. But also: `browser.storage.session` requires permission `"storage"` in the manifest (not `"sessionStorage"`). A1 has `"storage"` permission per the §3 repo context reference. **PASS.**

### G22. `chrome.tabs.onRemoved` listener in background
§6.13 adds a listener that reads + rewrites `'llmc.tab-fill-snapshots.v1'` on every tab close. On a user with 50 open tabs closing one, this runs a read-modify-write to session storage. Not hot-path, but if multiple tabs close simultaneously there's a race (read A → modify A → write A; read B → modify B → write B; last write wins, leak of stale tabId). Use a mutex or switch to a Map-per-tabId key pattern. **Minor.**

### G23. Commit message §12 line 2066: `feat(z5): ...`
`z5` is not one of the Plan 100 codes (should be `a8`). Typo. **Fix.**

---

## H. Summary checklist

| # | Category | Severity | Item |
|---|----------|----------|------|
| A2 | Contract-B1 | pass | Sub-entry resolution OK |
| A3 | Contract-B4 | flag | Verify B4 exports `buildPlan` from root barrel |
| B1 | Contract-B7 | **BLOCKER** | `adapter` named export does not exist; B7 exports `GreenhouseAdapter` |
| B2 | Contract-B7 | **BLOCKER** | `fillField(instruction)` vs B7's `fillField(el, value, hints)` |
| B4 | Contract-B7 | **BLOCKER** | `attachFile` signature + return type + file resolution undefined |
| B5 | Contract-B7 | **BLOCKER** | No `kind` field on exported adapter object |
| C1 | Contract-B8 | **BLOCKER** | B8 only exports flat functions, no namespace, no `adapter`, no `kind` |
| C2 | Contract-B8 | **BLOCKER** | `fillLeverField(el, instruction)` signature mismatch |
| D1 | Contract-B9 | **BLOCKER** | B9's `WorkdayAdapter` uses `scan`/`fill` names, no `adapter`, no `kind` |
| D2 | Decision-memo | **BLOCKER** | A8 implements single-page Workday (D3=a), memo says multi-step wizard (D3=b) |
| D3 | Consent gate | flag | Verify consent gate enforcement path |
| D4 | Step changes | major | Workday wizard step-change detection not in A8, not deferred properly to A9 |
| E1 | Contract-A7 | **BLOCKER** | `ReadableProfile` shape mismatches A7 actual shape; `readProfile` always returns null |
| E2 | Contract-A7 | major | `buildPlan` type cast hides drift; fix when E1 fixed |
| E3 | Contract-A7 | major | `isEmptyProfile` gate wrong shape |
| E4 | Contract-A7 | major | File/resume resolution for `attachFile` is unspecified |
| F1 | Contract-A5 | major | `FillRequest` breaking rewrite — need to update A5 test fixtures |
| F2 | Contract-A5 | pass | `FILL_RESULT_BROADCAST` extension is clean |
| G1 | Correctness | minor | Concurrent `ensureAdapter` race — both callers run full load |
| G2 | Code-quality | minor | `setAdapterKind`/`getAdapterKind` are dead code |
| G3 | Correctness | flag | `FormModel` mutability across state.ts |
| G4 | UX | major | Skipped instructions reported as `unknown-error` |
| G5 | Security | major | Substring host match = homograph / phishing weakness |
| G6 | Known-lim | note | SPA pushState may leave stale adapter reference |
| G7 | UX | major | `FILL_RESULT_BROADCAST` never fires on failure paths |
| G8 | Lifecycle | flag | Listener unregistration on `ctx.onInvalidated` not verified |
| G9 | Build | note | CONTENT_DEBUG in dev build — reminder for demo recording |
| G10 | Tests | minor | No test for `loadAdapter` dynamic import failure |
| G11 | Structure | minor | §0 vs §8.1 directory layout inconsistent |
| G12 | Types | pass | `document` passed to deps is fine |
| G13 | Lint | note | Keep eslint-enable as final line |
| G14 | Bundle | note | `__test` APIs in production bundle |
| G15 | Logging | minor | Error serialization in logger should preserve stack |
| G16 | Terminology | minor | `scan` vs `scanForm` aliasing in B7/B8/B9 |
| G17 | Metadata | minor | §0 file count wrong (~10 vs 17 actual) |
| G18 | Tests | pass | controller.spec.ts mock strategy OK |
| G19 | Confidence | major | 9/10 confidence overstated; real confidence 4/10 pre-fix |
| G20 | Imports | minor | `sendMessage` import in handlers.ts not listed in §8.2 |
| G21 | Permissions | pass | `storage.session` permission OK |
| G22 | Race | minor | `chrome.tabs.onRemoved` RMW race on snapshot map |
| G23 | Commit | minor | Commit message prefix `z5` should be `a8` |

---

## Recommendation

**Return to architect for a unified adapter-surface decision before executing.** The phase cannot be executed as written — every `import()` in `adapter-loader.ts` will fail to find `mod.adapter`, every `readProfile()` will return null, and the Workday wizard scope is silently reverted to the pre-flip D3=a shape.

Minimum corrective plan:

1. **Pick ONE adapter contract** and propagate to A8 + B7 + B8 + B9:
   - Exported object name: `adapter` (short) or `GreenhouseAdapter`/`LeverAdapter`/`WorkdayAdapter` (namespaced)
   - Required members: `{ kind: AtsKind, scanForm, fillField, attachFile?, ... }`
   - `fillField` signature: pick ONE of `(instruction: FillInstruction)` or `(el: HTMLElement, value, hints)`
   - `attachFile` signature: `(instruction: FillInstruction, file: File)` or equivalent, with explicit File resolution path

2. **Workday multi-step**: flip A8 from D3=a to D3=b. Add per-step scan/fill methods to `WorkdayAdapter`. Add `WORKDAY_STEP_CHANGED` to ProtocolMap. Ensure MutationObserver setup happens at A8 bootstrap for Workday URLs. Update §7.2 Workday acceptance criterion to cover the full wizard flow (per decision memo success criteria line 360).

3. **Profile shape**: rewrite `profile-reader.ts` to read the A7 `Profile` shape. Import `Profile` and `ProfileSchema` from `ats-autofill-engine/profile`. Use `ProfileSchema.safeParse()`. Delete the hand-rolled type guards. Delete the `buildPlan` cast.

4. **File resolution**: add `FileResolver` to `AutofillControllerDeps`. Specify where `resumeHandleId → File` happens. Document how `attachFile` receives the File.

5. **Broadcast on all paths**: move `FILL_RESULT_BROADCAST` before every return. Extend payload to include success/failure/error.

6. **Security**: swap substring host match for suffix match.

7. **Dead code + minor fixes**: delete `setAdapterKind`/`getAdapterKind` from state.ts, fix concurrent `ensureAdapter`, fix skip error code, fix commit prefix, reconcile §0/§8.1 file counts.

Post-fix re-review gate: A8 should import-test against a local stub of `ats-autofill-engine` that matches the unified contract, before executor runs. A 30-minute typecheck dry-run on a stub would catch all four BLOCKERs instantly.

---

**End of review — A8**
