# Plan 100 v2 — Architect Decisions (post-review remediation)

**Date**: 2026-04-11
**Source**: consolidated review `reviews/00-consolidated-review.md`
**Decider**: Ebenezer
**Status**: LOCKED — corrective plans execute against this document

---

## Decision 1 — Canonical `AtsAdapter` export shape

**Chosen**: option (a)

```ts
// src/ats/<vendor>/index.ts
export const adapter: AtsAdapter = Object.freeze({
  kind,              // 'greenhouse' | 'lever' | 'workday'
  scanForm,          // (root: Document) => FormModel
  fillField,         // (instruction: FillInstruction) => FillResult
  attachFile,        // (instruction: FillInstruction) => Promise<FillResult>
});
```

**Implied sub-decisions (all locked)**:
- `fillField` signature is `(instruction: FillInstruction) => FillResult`. Vendors resolve element via `document.querySelector(instruction.selector)` internally. `(el, value, hints)` is NOT an engine-public surface.
- `attachFile` takes a `FillInstruction` (with `value.kind === 'file'`) and returns `Promise<FillResult>`. A8 pre-resolves the `File` handle from `profile.documents[...]` and attaches it to the instruction before calling.
- Stateful adapters use a factory pattern. B8 closes over `LeverFormVariant`; B9 closes over `WorkdayWizardStep`. Each vendor ships `createXAdapter()` internally and exports a module-singleton `adapter` constructed from it.
- A8 dynamic import reads `mod.adapter`. Every vendor phase ships a `tests/ats/<vendor>/adapter-export.spec.ts` test asserting the `AtsAdapter` contract.

**Propagation scope**: A8 (profile-reader, adapter-loader, controller types, tests), B7 (add adapter wrapper file + named export), B8 (full rewrite of field-filler + form-scanner + file-attacher around factory + add adapter wrapper), B9 (add adapter wrapper that composes the wizard primitives), and B2 must expose the `AtsAdapter` interface type in `core/types`.

---

## Decision 2 — A5 is the single owner of ProtocolMap

**Chosen**: A5 is amended to ship the complete 13-key protocol with correct shapes BEFORE any downstream phase runs. No other phase edits `src/background/messaging/protocol.ts`.

**A5 must add (before Day 1)**:
- `AUTH_STATE_CHANGED: (data: AuthState) => void`
- `PROFILE_UPLOAD_JSON_RESUME: (data: { raw: unknown }) => ProfileUploadResponse`
- `KEYWORDS_EXTRACT: (data: KeywordsExtractRequest) => KeywordsExtractResponse`
- `GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void`
- `GENERATION_START` + `GENERATION_CANCEL` + `DETECTED_JOB_BROADCAST` (A11 use)
- `CREDITS_GET` (A10 use)
- Rename `AuthStatus` → `AuthState` as a discriminated union (A6's shape):
  ```ts
  type AuthState =
    | { authed: true; email: string | null; accessTokenExpiry: number }
    | { authed: false };
  ```

**A5 must reshape**:
- `HIGHLIGHT_APPLY: (data: { tabId: number }) => HighlightApplyResponse` where response is `{ ok: true; keywordCount; rangeCount; tookMs } | { ok: false; reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting' | 'api-error' | 'rate-limited' | 'network-error' }`. Drop the `keywords` field from the request — extraction is online-only, the content script fetches via `KEYWORDS_EXTRACT` then calls `applyHighlights` locally.
- `HIGHLIGHT_CLEAR: (data: { tabId: number }) => HighlightClearResponse` where response is `{ ok: true; cleared: boolean } | { ok: false; reason: string }`.
- Rename `INTENT_GET_FOR_TAB` → `INTENT_GET` (shorter; A10's convention wins).

**A5 must ship**:
- Bg-side handler for `KEYWORDS_EXTRACT` that calls `POST /api/v1/ats/extract-skills` via direct `fetch` + `buildAuthHeaders` (memo §2.10 decision a, direct fetch not SDK). This is A5's property because A5 owns the fetch + refresh-manager layer.
- Inert `async () => undefined` bg-side handlers for broadcast-only keys (`AUTH_STATE_CHANGED`, `GENERATION_UPDATE`, `DETECTED_JOB_BROADCAST`) so the `HANDLERS: Record<keyof ProtocolMap, HandlerFor<K>>` exhaustive type check passes.
- Replace `handleFillRequest` half-impl with `chrome.tabs.sendMessage(tabId, 'FILL_REQUEST', data)` forwarder (A8 replaces bg-side handler with the forwarder pattern, content script executes the real fill).

**Downstream phases (A6, A7, A9, A10, A11) may NOT touch `protocol.ts`.** They consume A5's exports only.

---

## Decision 3 — Profile storage shape: A7 writes, A8 adapts

**Chosen**: option (a). A7's write shape (B2 full `Profile` with nested `basics.*` + `profileVersion: '1.0'`) is canonical. A8's `profile-reader.ts` is rewritten to consume that shape via `ProfileSchema.safeParse()` from the engine.

**A8 rewrite scope**:
- Delete `interface ReadableProfile` with top-level fields.
- Import `Profile, ProfileSchema` from `ats-autofill-engine` (root barrel, not `/profile`).
- `readProfile()` reads `chrome.storage.local.get('llmc.profile.v1')`, runs `ProfileSchema.safeParse()`, returns `Profile | null`.
- `isEmptyProfile()` checks `basics.firstName` or `basics.email` instead of top-level.
- `location.country` → `location.countryCode` rename.
- Remove `profile as unknown as Parameters<typeof buildPlan>[1]` cast in controller.
- Update `controller.spec.ts` fixtures to use full `Profile` shape (15+ required fields via `createEmptyProfile()` helper).

**A7 unchanged** on profile-shape side (but still needs phone prefix + DOB inputs + stale-state fix per separate corrective).

---

## Decision 4 — Repo identity

**Chosen**: `ebenezer-isaac/llmconveyors-chrome-extension` (memo §2.1 + §2.3 + §4.1 wins). Silent default holds — transfer to `zovo-labs` org only post-contract signing.

**Cascade scope**:
- Absolute working-dir path: `e:/llmconveyors-chrome-extension` (config.json is already correct; A1+A5+A6+A7+A8+A9+A10+A11 plan files all need `s/e:\/job-assistant/e:\/llmconveyors-chrome-extension/g`)
- GitHub remote: `ebenezer-isaac/llmconveyors-chrome-extension` (A1 git-init step, A11 demo-recording step, A1 §6.15 first commit, A1 CI workflow artifact name)
- `package.json` name: `llmconveyors-chrome-extension` (A1 §6.2)
- `manifest.name`: user-facing display can remain `"LLM Conveyors Job Assistant"` or similar; the internal package name is what A5's `@webext-core/messaging` debug traces key on.
- LICENSE copyright holder: `Ebenezer Isaac` (not `Zovo Labs`), MIT header year `2026`
- README title + body: `LLM Conveyors Chrome Extension` (not `Zovo job application assistant`)
- Manifest `homepage_url`: `https://github.com/ebenezer-isaac/llmconveyors-chrome-extension`
- Console log prefix: `[llmconveyors-chrome-extension]` (if A1 ships a log prefix) or just drop the prefix since it was tied to the old repo name

**Bonus decision 4.1 — npm version**: B1 publishes `0.1.0-alpha.1` directly (matches memo §2.1). No placeholder `alpha.0`. B9 publishes a new alpha bump (`0.1.0-alpha.2`) as the "real adapter release" OR republishes `alpha.1` with a dist-tag move if nothing breaking changed — B9 plan must pick one. Recommended: B9 bumps to `0.1.0-alpha.2` because it adds three adapters that were empty in `alpha.1`.

---

## Deferred decisions (not blocking Day 1 execution)

### D5 — B2 addendum scope
B2 needs: `JobPostingData`, `PageIntent`, `FillPlanResult`, `FormModel.sourceATS` optional field, ATS-extension `FieldType` union members (18 camelCase keys used by B8), the `AtsAdapter` type from Decision 1, `AttachResult` (or decide attachResult === FillResult and kill the alias).

**Default (tentative)**: inline all additions into B2's existing plan file (no separate B2.1 phase). B2 is scheduled Day 2, so one edit pass on B2 suffices if architect lands corrections before Day 2 morning.

### D6 — Workday wizard orchestration home
B9 exposes per-step primitives (`detectCurrentStep`, `watchForStepChange`, `scanMyInformation`, `fillMyInformation`, etc.). Who calls them in a loop?

**Default (tentative)**: A8 owns the orchestration loop. B9 exports primitives only. A8 calls `watchForStepChange(document, onStepChange)` at content-script mount, maintains `currentStep` state, dispatches `fillX` on popup Fill click. A8 plan gains ~150 LoC for the wizard state machine. A11 E2E expands from 1 to 4 steps.

Alternative: B9 exposes a stateful `orchestrateFill(profile)` that handles the loop internally; A8 just delegates. Cleaner for A8 but couples B9 to chrome message bus assumptions.

Recommendation holds at A8-owns-the-loop unless you flip it. Confirm or override.

---

## Corrective plan queue (ready to fire)

Once this decision file is saved, the following corrective plans can be fired in parallel:

| # | Plan | Touches | Blocker dependency |
|---|---|---|---|
| R1 | `correction-01-repo-path-cascade.md` | A1, A5, A6, A7, A8, A9, A10, A11 | D4 |
| R2 | `correction-02-a5-protocol-complete.md` | A5 only | D2 |
| R3 | `correction-03-b1-exports-and-deps.md` | B1 only | — |
| R4 | `correction-04-b2-type-catalogue.md` | B2 only | D1, D5 |
| R5 | `correction-05-a6-a5-contract-alignment.md` | A6 only | R2 |
| R6 | `correction-06-a7-blueprint-drift.md` | A7 only (phone prefix, DOB, stale state, vitest env) | — |
| R7 | `correction-07-a8-adapter-and-wizard.md` | A8 only | D1, D3, D6, R2, R4 |
| R8 | `correction-08-a9-highlight-rewrite.md` | A9 only | R2 |
| R9 | `correction-09-a10-contract-fixes.md` | A10 only | R2 |
| R10 | `correction-10-a11-wizard-e2e.md` | A11 only | D6, R2 |
| R11 | `correction-11-b4-type-fixture-fixes.md` | B4 only | R4 |
| R12 | `correction-12-b7-contract-alignment.md` | B7 only | D1, R3, R4 |
| R13 | `correction-13-b8-full-rewrite.md` | B8 only | D1, R3, R4 |
| R14 | `correction-14-b9-clerical.md` | B9 only | R4 |

**Execution order**: R2+R3+R4 first (keystones), then R1 (can parallelize with R2-R4), then R5-R14 in parallel.

**Not corrected**: A2, A3, B3, B5, B6 ship as-is.

---

**End of decision memo. Corrective plans execute against this document as v2.1 of the source of truth.**
