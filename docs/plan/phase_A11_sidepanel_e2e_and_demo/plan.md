# Phase A11 (v2.1 REWRITE) -- Side panel UI + full E2E smoke test + demo recording

**Plan**: 100-chrome-extension-mvp
**Phase code**: A11
**Track**: Extension (Track 3)
**Day**: 6 (2026-04-17) -- LAST PHASE, HARD DEADLINE
**Executor context budget**: 64k
**Estimated effort**: 4-5 hours
**Confidence**: 8/10
**Supersedes**: previous A11 plan.md graded C+ in `reviews/review-A11.md`

---

## 0. Confidence + scope

**Confidence**: 8/10. The residual risk is concentrated in the live 4-step Workday E2E (step 6.20), which depends on whichever Workday tenant the executor picks still lazy-mounting `myInformation`, `myExperience`, `voluntaryDisclosures`, `review` at the selectors B9 captured against the three fixture tenants. Every other deliverable is bounded: the side panel is a thin React shell consuming A5's already-declared `ProtocolMap` surface (no protocol mutation); the generation polling replaces the `NotImplementedError` stubs A5 registered under `GENERATION_*` and `DETECTED_JOB_BROADCAST` in `HANDLERS`; the demo recording is a tooling configuration step with no novel code.

**Files touched**:
- ~22 files created in `e:/llmconveyors-chrome-extension/`
- 5 files modified in `e:/llmconveyors-chrome-extension/` (A5 handlers wiring, A10 popup views, WXT config)
- 3 markdown scripts under `scripts/` + `docs/`
- Zero files modified in `e:/llmconveyors.com`

**Lines changed**: ~2400 lines added across `entrypoints/sidepanel/**`, `src/background/generation/**`, `tests/**`, and the three markdown scripts; ~120 lines modified in A10 popup views and A5 handlers barrel.

**Target directory**: `e:/llmconveyors-chrome-extension/` (per D4, exists from A1, extended by A5-A10).

---

## 1. Goal

Ship the final polish layer of the Chrome extension before the April 20 Zovo demo call. Three deliverables bundle into this phase because they all share the same acceptance gate (the pre-demo checklist in step 9) and run on Day 6:

1. **Side panel UI** (steps 6.5-6.14) -- a minimal React component with three tabs: "Detected Job", "Generation", "Artifacts". The side panel is the "API layer showcase" side of the extension -- it demonstrates the extension talks to the llmconveyors backend via the SDK, kicks off an async agent run, polls for status, and renders the final artifacts (CV, cover letter, cold email). Contrast with the popup (A10) which is the "offline autofill" showcase.

2. **Full E2E smoke test** (steps 6.15-6.21) -- a manual test script (`scripts/e2e-smoke.md`) walking the executor through every user journey on real Greenhouse + Lever + 4-step Workday pages, plus a Playwright-backed automated harness in `tests/e2e-smoke/` that boots the extension load-unpacked against the 12 captured Workday fixture files, 2 Greenhouse fixtures, 2 Lever fixtures. The manual script covers: sign-in (with adversarial cases), JSON Resume upload (with adversarial cases), Greenhouse autofill, Lever autofill, Workday 4-step wizard traversal with EEO consent gating, highlight toggle disabled-when-signed-out, highlight toggle signed-in, side panel artifact viewer with real generation.

3. **Demo recording** (steps 6.22-6.23) -- screen-capture setup, an OBS Studio scene file, `scripts/record-demo.md` checklist with precise timestamps (including all 4 Workday wizard steps), and a `docs/demo-script.md` talking-points document for the April 20 call.

After this phase:

- `pnpm build` in `e:/llmconveyors-chrome-extension/` produces `.output/chrome-mv3/` with zero errors and zero warnings.
- `pnpm typecheck` is clean (including the A5 ProtocolMap type-level contract assertion owned by A11 per D14.2).
- `pnpm test` passes the A5 handlers-consumer tests and the new tests under `tests/background/generation/**`, `tests/sidepanel/**`, and `tests/entrypoints/popup/**` (A11 adds tests for A10's new buttons).
- `pnpm test:e2e` passes the Playwright smoke harness against the 16 fixture files.
- The extension loaded unpacked in Chrome 114+ opens the side panel from A10's popup "Open side panel" button, renders all three tabs against live per-tab state, kicks off a real `job-hunter-run` against the llmconveyors backend, polls for completion via the hybrid setInterval+chrome.alarms scheduler (step 6.7), and renders the three artifacts.
- The pre-demo checklist in step 9 can be run end-to-end and every box ticked.
- A 2:30-3:00 screen recording exists at `e:/llmconveyors-chrome-extension/docs/demo.mp4` (excluded from git -- uploaded to Loom/Drive per step 6.23.5).
- The status email template to Michael Lip (step 10.1) is drafted in `docs/michael-apr17-email.txt` and ready to send after the checklist passes.

**Non-goals** (out of scope, explicitly deferred):

- Full side panel polish (rough V1 is fine -- this is a demo artifact, not a production UI)
- Artifact download as PDF (markdown `Blob` download only; PDF rendering is Month 1)
- Error recovery for half-failed generations (failed status + "Try again" button, no retry-with-modified-inputs)
- Internationalization (English only)
- SSE streaming of status updates (polling-only per investigation 22; SSE is Month 1)
- Cancel-in-flight against the backend (SDK 0.4.0 has no cancel endpoint; A11 emulates client-side, step 6.7)
- Keyboard navigation between tabs (aria-selected set but no ArrowLeft/Right shortcuts)
- Reading past generations from a session (current tab only; session history is Month 1)
- Accessibility audit (basic ARIA labels only; full audit Month 1)
- Phased interaction UI for awaiting_input (shows "Continue in the web app" deep-link only, step 6.13)

---

## 2. Blocks / depends on

**Depends on** (ALL must have executed cleanly before A11 runs):

- **A5** (background + messaging + refresh manager) -- per D2, A5 is the SINGLE OWNER of `src/background/messaging/protocol.ts`. A5 already ships `GENERATION_START`, `GENERATION_UPDATE`, `GENERATION_CANCEL`, `DETECTED_JOB_BROADCAST` in `ProtocolMap` (see keystone contract 1.1, lines 47-53). A5 registers stub handlers (`NotImplementedError`) for `GENERATION_START` and `GENERATION_CANCEL` in the exhaustive `HANDLERS: { [K in keyof ProtocolMap]: HandlerFor<K> }` dispatch table, plus inert `async () => undefined` for the broadcast-only keys `GENERATION_UPDATE` and `DETECTED_JOB_BROADCAST` (keystone contract 1.3). **A11 does NOT edit protocol.ts.** A11 replaces the stub handlers in `handlers.ts` (or imports real impls A11 owns in `src/background/generation/`) so the exhaustive dispatch table stays intact. Any attempt to call `onMessage(...)` directly bypasses A5's dispatch loop in `src/background/index.ts` and is a blueprint drift.
- **A6** (auth flow) -- SDK client construction via `createSdkClient()` (keystone contract 1.4 `RefreshManager`). A11's background generation module calls this factory for every `GENERATION_START` invocation. A11 never touches auth directly.
- **A7** (profile storage + options) -- `job-hunter-run` needs the user's profile (for `resumeText` if the saved master resume is used server-side). A11 reads profile via A5's `PROFILE_GET` handler, not directly from storage.
- **A8** (content script autofill) -- per D6, A8's `AutofillController` owns the Workday wizard loop: it holds `currentStep` in closure, calls `watchForStepChange` on boot, re-runs `scanStep` on step change, dispatches `fillStep` when the user clicks Fill. A11 does not re-implement this. A11's E2E test (step 6.20) exercises A8's loop end-to-end against all 4 wizard steps. A11's step 6.18 fixture capture script produces the fixtures A8's unit tests already reference.
- **A9** (content script highlight + intent) -- A9's intent detector emits `INTENT_DETECTED` to background. A5's `INTENT_GET` handler lets the side panel pull the cached intent. A11 uses `INTENT_GET` for the "Detected Job" tab on first mount (not a parallel `DETECTED_JOB_BROADCAST` pull -- that broadcast is wired as a live update channel, not an initial-read channel).
- **A10** (popup UI) -- A10 ships `OnJobPosting.tsx` and `OnApplicationForm.tsx`. Per review blocker 1.1, A10 does NOT currently include an "Open side panel" button. A11 EXTENDS both views with a secondary `OpenSidePanelButton` component (step 6.16) and adds the corresponding tests. This is a 2-file addition inside `src/entrypoints/popup/views/` plus a new `src/entrypoints/popup/components/OpenSidePanelButton.tsx`.
- **B7/B8/B9** (engine adapters) -- A11 does not import engine types directly, but the Playwright E2E harness in step 6.19 assumes the engine is published and the adapters are loaded by A8's `loadAdapter` factory.
- **B9** specifically -- per D25, B9 captures 12 HTML fixtures (3 tenants x 4 wizard steps). A11's Playwright harness consumes those fixtures by symlinking or copying them into `tests/e2e-smoke/fixtures/workday/`. If B9 has not captured all 12, A11 halts on step 6.19.1.

**Blocks**:

- The **April 20 Zovo demo call** -- without A11 the extension has no artifact-viewing path and no E2E validation.
- The **Apr 17 status email to Michael** (step 10.1) -- the email can only be sent after step 9 pre-demo checklist passes.
- The **`zovo-labs` transfer** -- post-contract signing, per D4, the repo transfers from `ebenezer-isaac/llmconveyors-chrome-extension` to `zovo-labs/llmconveyors-chrome-extension`. A11 is the last engineering step before that handoff.

---

## 3. Repo context (MANDATORY reading before writing any code)

The executor MUST read these files before writing any code. Every other read is optional.

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - D2 -- A5 is the single owner of `ProtocolMap`. A11 NEVER mutates `protocol.ts`.
   - D4 -- repo path is `e:/llmconveyors-chrome-extension/`, GitHub `ebenezer-isaac/llmconveyors-chrome-extension`, console prefix `llmc-ext`.
   - D6 -- Workday wizard orchestration: A8 owns the loop, B9 exposes primitives. A11 E2E expands from 1 step to 4 steps with EEO consent gate.
   - D11 -- structured logger via `createLogger('<scope>')`. No `console.*`.
   - D14 -- anti-drift gates: forbidden token grep, type-level protocol contract assertion, exports-map resolution, blueprint contract drift, Zod round-trip.
   - D14.2 -- A11 MUST ship a type-level assertion test that compiles only if A5's `ProtocolMap` includes the keys A11 depends on.
   - D15 -- zero em-dashes. CI grep enforced.
   - D16 -- branded types (`TabId`, `GenerationId`, `SessionId`, `RequestId`, `PlanId`, `ResumeHandleId`). A11 consumes.
   - D19 -- adversarial test categories (6 mandatory).
   - D20 -- DI for every cross-module dependency in the extension. A11's hooks and handlers accept `Deps` objects.
   - D21 -- Zod at every runtime boundary. A11 validates every `GENERATION_UPDATE` broadcast payload before rendering.
   - D22 -- blueprint contract file required per phase. A11 ships `src/sidepanel/blueprint.contract.ts` + `src/background/generation/blueprint.contract.ts`.
   - D23 -- rollback script required. A11 ships `scripts/rollback-phase-A11.sh`.
   - D25 -- 3 Workday tenants, 4 steps each = 12 fixtures.

2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - Contract 1 ProtocolMap (keystone) -- the verbatim 19-key table. A11 consumes `GENERATION_START`, `GENERATION_UPDATE`, `GENERATION_CANCEL`, `DETECTED_JOB_BROADCAST`, `INTENT_GET`, `PROFILE_GET`.
   - Contract 1.2 value types -- `GenerationStartRequest`, `GenerationStartResponse`, `GenerationUpdateBroadcast`, `GenerationArtifact`, `DetectedIntentPayload`, `CreditsState`, `AuthState`.
   - Contract 1.3 A5 bg handler requirements -- `GENERATION_START` / `GENERATION_CANCEL` are stubs throwing `NotImplementedError('A11 owns')`; A11 replaces them. `GENERATION_UPDATE` and `DETECTED_JOB_BROADCAST` are broadcast-only (inert `async () => undefined` in the dispatch table); A11 uses `sendMessage()` to fire them.
   - Contract 1.4 refresh manager / single-flight -- A11's poll loop never talks to the refresh manager directly. It calls `createSdkClient()` which closes over the refresh manager.
   - Contract 2.8 `page-intent.ts` -- `DetectedIntent` shape used by A9 -> A5 -> A11.
   - Contract 7 A8 wizard orchestration -- A11's E2E test asserts A8's `watchForStepChange` + `scanStep` + `fillStep` work end-to-end.
   - Contract 10 imports table -- A11 imports `GenerationUpdateBroadcast`, `sendMessage`, `onMessage`, `WorkdayWizardStep` from `ats-autofill-engine` and A5 messaging.

3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A11.md`
   - Blocker 1.1 -- A10 has no "Open side panel" button; A11 must add it.
   - Blocker 1.2 -- A11 must not mutate protocol.ts.
   - HIGH 2.1 -- Workday 4-step wizard traversal must be tested end-to-end.
   - HIGH 2.2 -- Sign-in flow must cover invalid redirect URI, refresh-on-401, and sign-out + re-sign-in.
   - HIGH 2.3 -- Highlight disabled-when-signed-out must be verified in E2E.
   - HIGH 2.5 -- JSON Resume upload must cover invalid JSON, schema-failing JSON, 10MB file, `<script>` in summary, missing EEO consent defaults to false.
   - MED 3.1 -- chrome.alarms clamp bug: use hybrid setInterval(3000)+chrome.alarms(0.5).
   - MED 3.3 -- `extractArtifacts` should use a Zod schema, not string probing.
   - LOW 3.4 -- `interactionType` must be a clickable deep link, not plain text.
   - MED 4.1 -- adversarial gaps in `handleStart` (race, re-entry, persist ordering).
   - MED 4.2 -- `useDetectedJob` / `useGenerationStatus` cleanup leak.
   - MED 7 -- direct `@webext-core/messaging` import bug.

4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/plan.md`
   - Step 6.3 `ProtocolMap` definition.
   - Step 6.12 `handlers.ts` dispatch table pattern.
   - Step 6.13 `src/background/index.ts` registration loop.
   - A5's `createLogger('<scope>')` pattern in `src/background/log.ts`.

5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A10_popup_ui/plan.md`
   - Step 6.7 `OnJobPosting.tsx` layout.
   - Step 6.8 `OnApplicationForm.tsx` layout.
   - Step 6.12 `HighlightToggle` disabled-when-signed-out implementation (`opacity-60`, `title="Sign in for keyword matching"`).

6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B9_workday_adapter_and_publish/plan.md`
   - Wizard primitive signatures: `detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep`.
   - Fixture file locations under `tests/ats/workday/fixtures/`.
   - EEO consent gate implementation in `voluntary-disclosures-filler.ts`.

7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`
   - `AutofillController` wizard loop.
   - `Deps` object shape (DI per D20).

8. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/00-decision-memo.md`
   - Success criteria 6.1 April 17 internal deadline checklist (every bullet maps to a box in step 9 pre-demo checklist below).
   - Success criteria 6.2 April 20 demo call nice-to-have.

9. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/22-status-enums.md`
   - Status enum mapping. Per D2 + keystone contract 1.2, the extension uses the 5-value `GenerationUpdateBroadcast.status` enum: `'running' | 'completed' | 'failed' | 'awaiting_input' | 'cancelled'`. Keystone wins over any legacy enum.

10. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B9_workday_adapter_and_publish/plan.md`
    - D25 multi-tenant fixture paths: 3 tenants (workday-wd5, deloitte-wd5, accenture-wd103) x 4 steps = 12 HTML fixture files.

11. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md`
    - Intent detection + INTENT_DETECTED broadcast.

12. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A6_auth_flow/plan.md`
    - Auth flow details for sign-in E2E.

**Do NOT read** the llmconveyors backend source beyond `investigation/22-status-enums.md`. A11 has zero backend touchpoints.

---

## 4. Working directory

**Target directory**: `e:/llmconveyors-chrome-extension/` (EXISTS from A1 per D4; extended by A5-A10).

Executor instructions:

1. `cd e:/llmconveyors-chrome-extension/`.
2. Confirm preconditions:
   ```bash
   # A5 artifacts
   ls -la src/background/messaging/protocol.ts
   ls -la src/background/messaging/handlers.ts
   ls -la src/background/log.ts
   ls -la src/background/index.ts

   # A6 artifacts
   ls -la src/background/auth/refresh-manager.ts
   ls -la src/background/auth/sdk-client.ts

   # A7 artifacts
   ls -la src/entrypoints/options/

   # A10 artifacts
   ls -la src/entrypoints/popup/views/OnJobPosting.tsx
   ls -la src/entrypoints/popup/views/OnApplicationForm.tsx
   ls -la src/entrypoints/popup/components/HighlightToggle.tsx

   # A10 popup MUST NOT already have OpenSidePanelButton (A11 adds it)
   test -f src/entrypoints/popup/components/OpenSidePanelButton.tsx && { echo "unexpected: OpenSidePanelButton already exists"; exit 1; }

   # B9 fixtures (required for E2E harness)
   test -d tests/ats/workday/fixtures && WORKDAY_FIXTURE_SOURCE=tests/ats/workday/fixtures
   test -d ../ats-autofill-engine/tests/ats/workday/fixtures && WORKDAY_FIXTURE_SOURCE=../ats-autofill-engine/tests/ats/workday/fixtures
   test -n "$WORKDAY_FIXTURE_SOURCE" || { echo "B9 drift: Workday fixtures not found"; exit 1; }
   count=$(ls "$WORKDAY_FIXTURE_SOURCE" | grep -cE '\.html$')
   test "$count" -ge 12 || { echo "B9 drift: expected 12 Workday fixtures, found $count"; exit 1; }

   # A5 contract (D14.2 will enforce at type-check time; this is a fast grep pre-check)
   grep -q "GENERATION_START" src/background/messaging/protocol.ts || { echo "A5 drift: missing GENERATION_START"; exit 1; }
   grep -q "GENERATION_UPDATE" src/background/messaging/protocol.ts || { echo "A5 drift: missing GENERATION_UPDATE"; exit 1; }
   grep -q "GENERATION_CANCEL" src/background/messaging/protocol.ts || { echo "A5 drift: missing GENERATION_CANCEL"; exit 1; }
   grep -q "DETECTED_JOB_BROADCAST" src/background/messaging/protocol.ts || { echo "A5 drift: missing DETECTED_JOB_BROADCAST"; exit 1; }

   # Deps
   pnpm list @llmconveyors/sdk ats-autofill-engine @webext-core/messaging react react-dom zod
   pnpm list react-markdown playwright @playwright/test 2>/dev/null || true

   # Package identity (D4)
   grep -q '"name": "llmconveyors-chrome-extension"' package.json || { echo "D4 drift: package name wrong"; exit 1; }
   ```
   Expected:
   - `src/background/messaging/protocol.ts` EXISTS and already contains `GENERATION_START`, `GENERATION_UPDATE`, `GENERATION_CANCEL`, `DETECTED_JOB_BROADCAST` (A5 owned).
   - `src/background/messaging/handlers.ts` EXISTS with `HANDLERS` dispatch table that references `handleGenerationStart`, `handleGenerationCancel` stubs throwing `NotImplementedError('GENERATION_START')` and `NotImplementedError('GENERATION_CANCEL')`.
   - `src/background/auth/sdk-client.ts` exports `createSdkClient()` (A6 owned).
   - `src/entrypoints/popup/views/OnJobPosting.tsx` and `OnApplicationForm.tsx` exist (A10 owned). Neither contains any "Open side panel" button -- A11 adds it in step 6.16.
   - B9's 12 Workday fixtures exist either in the extension repo's `tests/ats/workday/fixtures/` or in the engine repo at `../ats-autofill-engine/tests/ats/workday/fixtures/`.

3. If ANY precondition fails, halt and report. Do not write any files.

4. Read `src/background/messaging/protocol.ts` and confirm the following 4 keys are present:
   - `GENERATION_START:  (data: GenerationStartRequest) => GenerationStartResponse`
   - `GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void`
   - `GENERATION_CANCEL: (data: { generationId: GenerationId }) => { ok: boolean }`
   - `DETECTED_JOB_BROADCAST: (data: { tabId: TabId; intent: DetectedIntent }) => void`

   If ANY key is missing, halt and report as "A5 drift -- keystone contract violated". Do NOT add them in A11. This is an A5 bug that blocks A11 until A5 is amended.

All file paths in this plan are relative to `e:/llmconveyors-chrome-extension/` unless prefixed with `e:/llmconveyors.com/`.

---

## 5. Design rationale (read before coding)

### 5.1 Why three tabs, not one scrolling view

A single-column scrolling layout was considered and rejected. The side panel is 400-500px wide. Stacking "Detected Job" above "Generation" above "Artifacts" produces a ~2000px tall scroll area for any non-trivial generation. Users lose context: when a CV is running, the viewport is typically parked on "Detected Job" and the user has no idea the run is in progress unless they scroll. Three discrete tabs with an explicit status indicator in the tab header (spinner on "Generation" during `running`, green check when `completed`) makes the state legible at a glance.

### 5.2 Why polling with hybrid scheduler, not SSE

The llmconveyors backend exposes SSE on `/agents/stream/:generationId`, but the SDK 0.4.0 release notes mark the extension SSE flow as experimental. The client dies when the service worker sleeps (Chrome kills SW after 30s idle), so long-lived streams are unreliable. Polling is boring but correct.

Per review finding 3.1, the previous plan's `chrome.alarms.create({ periodInMinutes: 2000/60000 })` is silently clamped to Chrome's 30-second minimum period in release builds. Two seconds becomes 30 seconds. The Generation tab appears to stall.

A11 uses a hybrid scheduler:

- **Phase 1 (0-60s post-gesture)**: `setInterval(pollTick, 3000)` runs while the SW is guaranteed alive post-user-gesture. Chrome keeps the SW alive while outstanding fetches exist, so the poll loop anchors itself by always having a fetch in flight. 3000ms is chosen because lower intervals generate zero value (the backend's per-step work rarely completes in under 3s).
- **Phase 2 (60s onward)**: `setInterval` is cleared. `chrome.alarms.create(name, { periodInMinutes: 0.5 })` takes over, firing every 30s (the Chrome minimum). The SW wakes on each alarm, calls `pollTick`, and sleeps again.
- **Cancel**: `clearInterval` + `chrome.alarms.clear`.

This gives real-time feel for the first minute (when the user is watching) and correct SW-sleep behavior afterward (when the user has likely moved to another tab).

Polling cost: worst case 5-minute generation. First 60s = 20 polls (setInterval @ 3s). Next 240s = 8 polls (alarms @ 30s). Total 28 polls per generation at ~2KB per response = ~56KB. Negligible.

### 5.3 Why the side panel never calls the SDK directly

Per keystone contract 1 invariant and the decision memo 2.11, content scripts and UI contexts NEVER `fetch` llmconveyors. All SDK calls flow through the background worker. The side panel sends `GENERATION_START` via `sendMessage`; the background instantiates `createSdkClient()` (which internally uses A6's `RefreshManager`), starts the hybrid poll loop, and broadcasts updates via `GENERATION_UPDATE`. This keeps auth centralized (A6 owns the token store), lets Chrome suspend the side panel without killing the run, and prevents CORS surprises.

### 5.4 Why per-tab in-memory state with session-storage fallback

For each active generation the background keeps `Map<TabId, ActiveGeneration>`. When the side panel opens, `useGenerationStatus` rehydrates from `chrome.storage.session['llmc.lastGeneration.<tabId>']` first, then listens for live `GENERATION_UPDATE` broadcasts. This decouples the side panel lifetime from the generation lifetime. The user can close the side panel, let the run finish in the background, and re-open later to see completed artifacts.

On SW wake (e.g., after Chrome suspends the background), `rehydrate()` reads `chrome.storage.session['llmc.activeGenerations']`, restores the Map, and restarts any poll loops for non-terminal entries.

### 5.5 Why A11 does NOT own protocol.ts

Per D2, A5 is the single owner of `ProtocolMap`. A5 ships the 19-key protocol + exhaustive `HANDLERS` table. A11 consumes those keys. If A5 is missing a key, that is an A5 bug that blocks A11 until A5 is amended -- A11 never works around it by editing protocol.ts locally.

Concretely: A5 registers 4 stubs in its dispatch table: two `NotImplementedError` throwers for `GENERATION_START` and `GENERATION_CANCEL`, and two inert `async () => undefined` for the broadcast-only `GENERATION_UPDATE` and `DETECTED_JOB_BROADCAST`. A11 replaces the two `NotImplementedError` throwers with real implementations by editing `src/background/messaging/handlers.ts` imports (swapping the stub functions for the real handlers in `src/background/generation/handlers.ts`). The broadcast-only inert handlers stay inert -- A11 fires broadcasts via `sendMessage('GENERATION_UPDATE', ...)` directly from the poll loop.

This means A11's changes to A5's files are surgical: 2 import-line edits + 2 table-entry swaps in `handlers.ts`. Zero protocol.ts edits.

### 5.6 Why DI for hooks and handlers (D20)

Every A11 hook (`useDetectedJob`, `useGenerationStatus`) accepts a `Deps` object at construction so tests pass fakes. Same for the background generation module: `createGenerationOrchestrator(deps)` takes `{ createSdkClient, sendMessage, chromeAlarms, chromeStorage, logger, now, clock }`.

Production wires `createSdkClient` to A6's factory, `sendMessage` to A5's bound instance, `chromeAlarms` to `chrome.alarms`, `chromeStorage` to `chrome.storage.session`, `logger` to `createLogger('generation-poller')`, `now` to `() => Date.now()`, `clock` to `{ setInterval, clearInterval }`.

Tests wire fakes: in-memory storage, a fake timer `clock`, a fake `chromeAlarms` that records `create`/`clear` calls, a mock SDK client.

Catches testability regressions at compile time. A handler that imports `chrome.*` directly fails the D14 anti-drift grep.

### 5.7 Why a minimal Zod schema for GenerationUpdateBroadcast and artifacts

Per D21, every runtime boundary validates with Zod. The side panel subscribes to `GENERATION_UPDATE` broadcasts via `onMessage`, which passes through an untrusted serialization boundary (extension messaging). Before rendering, A11 parses the payload through `GenerationUpdateBroadcastSchema` (local to A11 since the keystone defines the type but not the schema -- A11 owns the schema).

For artifacts: per review finding 3.3, the previous plan's `extractArtifacts` uses string probing (`pickString(result, ['cv', 'cvMarkdown', 'resume'])`). This violates D21.

A11 ships a local `ArtifactsSchema` in `src/sidepanel/schemas/artifacts.ts`:

```ts
const ArtifactSchema = z.object({
  kind: z.enum(['cv', 'cover-letter', 'email', 'other']),
  content: z.string().min(1).max(1_000_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const ArtifactsArraySchema = z.array(ArtifactSchema);
```

This matches keystone contract 1.2 `GenerationArtifact`. A11 calls `ArtifactsArraySchema.parse(broadcast.artifacts ?? [])` and renders. If the backend returns an unexpected shape, the `safeParse` fails loudly, the side panel shows "Artifact payload rejected -- continue in the web app" with a deep link, and logs the full payload via `createLogger('sidepanel').error('artifact schema reject', { raw })`.

**Known issue flagged in `flaggedKnownIssues`**: the llmconveyors backend currently returns artifacts as `Record<string, unknown>[]` with no shared-types schema (investigation 22). A11's local schema is a temporary bridge. The correct fix is a new `JobHunterResultSchema` in `libs/shared-types/src/schemas/`, which is a llmconveyors.com repo change outside A11 scope. Tracked in `config.json` `flaggedKnownIssues` as `KI-A11-01`.

### 5.8 Why react-markdown stays

Artifacts come back as markdown (CV, cover letter) or plain text (cold email). `react-markdown@9` + `remark-parse` is ~60KB gzipped. Alternative (raw `innerHTML`) introduces XSS on a trusted-but-opaque shape we explicitly do not want to audit on Day 6. `react-markdown` is escape-safe by default.

If the bundle budget bites (step 6.25 `pnpm build` check), fall back to a 40-line plain-text renderer that escapes `<`/`>` and wraps paragraphs in `<pre>`. Documented as the fallback in step 13 risk A11-R2.

### 5.9 Why Playwright, not Puppeteer, for the automated harness

Playwright supports load-unpacked Chrome extensions via `browserContext.newContext({ args: ['--load-extension=...'] })` and has first-class `BrowserContext.serviceWorkers()` access for asserting SW behavior. Puppeteer's extension support is more brittle. Also, Playwright's `test.describe.parallel` + fixture files gives tenant-specific test matrices naturally (one spec file x 3 tenants x 4 steps = 12 cases).

Install: `pnpm add -D @playwright/test playwright`. Initial context setup in step 6.19.

### 5.10 Why manual E2E is PRIMARY and Playwright is SECONDARY

Live ATS DOM changes frequently. Greenhouse rotates class names, Lever reshuffles HTML per tenant, Workday is a React SPA. A Playwright-only suite against live sites requires constant babysitting and breaks the demo if any ATS shifts between plan and execution day.

The Playwright harness targets captured fixture HTML files only. These tests catch adapter-loader regressions + message contract drift. They are the safety net, not the gate.

The manual checklist (step 6.17) is the gate. A human-run 25-minute sequence on real GH/Lever/Workday pages catches what fixture-based tests cannot (live JS, real step transitions, real file upload targets).

### 5.11 Why `entrypoints/sidepanel/` and `src/sidepanel/`

WXT discovery rules: `entrypoints/sidepanel/index.html` auto-registers as `side_panel.default_path`. A11 keeps view React components, hooks, and entry HTML under `entrypoints/sidepanel/` (WXT convention) and keeps testable pure-logic modules (schemas, DI helpers, blueprint contracts) under `src/sidepanel/`. Test files mirror this split: `tests/entrypoints/sidepanel/` for React Testing Library tests, `tests/sidepanel/` for pure module tests.

### 5.12 Why popup OpenSidePanelButton is a shared component

Both `OnJobPosting.tsx` and `OnApplicationForm.tsx` get the button. Extracting it to `src/entrypoints/popup/components/OpenSidePanelButton.tsx` (next to `HighlightToggle.tsx`) keeps the button impl in one place. It handles:

- Reading the active tab's `windowId` via `chrome.tabs.query`
- Calling `chrome.sidePanel.open({ windowId })` (user-gesture required -- popup click is a valid gesture)
- Closing the popup via `window.close()` AFTER the `open` call resolves (sequence matters: popup closing too early kills the gesture context)
- Disabling itself when the signed-out state is detected (side panel is auth-gated for the Generate CV flow)

The button is rendered as a secondary CTA beneath the primary CTA (`HighlightToggle` on `OnJobPosting`, `Fill form` on `OnApplicationForm`).

### 5.13 Why A11 also touches `src/entrypoints/popup/views/` (not just sidepanel)

Review blocker 1.1 flagged that A10 ships neither the button nor a stub handler. Rather than force a corrective A10 phase, A11 owns the addition. The total LoC is small (~60 lines) and the button's only consumer is the side panel (which is A11's deliverable). Bundling the button with A11 keeps the change set cohesive.

### 5.14 Why the demo recording is documented but not automated

OBS Studio is already installed on the user's development machine. Automating "press record button" requires either a Chrome extension screen-capture API (needs user gesture every time) or native scripting (OS-specific, fragile). A human-run checklist in `scripts/record-demo.md` with precise timestamps per Workday wizard step is faster, produces higher-quality output, and fits within the Day 6 polish framing.

---

## 6. Step-by-step execution

### 6.1 Verify preconditions (no files written)

Execute the full precondition script from step 4.2 above. If any check fails, halt.

### 6.2 Install missing dev dependencies

```bash
pnpm list react-markdown 2>/dev/null | grep -q 'react-markdown' \
  || pnpm add react-markdown@^9.0.0

pnpm list @playwright/test 2>/dev/null | grep -q '@playwright/test' \
  || pnpm add -D @playwright/test@^1.47.0 playwright@^1.47.0

# Playwright browsers (chromium only; firefox/webkit unused)
pnpm exec playwright install chromium
```

`react-markdown` 9.x requires React 18+ (satisfied by A1). If A10 already added it, the add is a no-op.

Do NOT add any syntax-highlighting or math plugins -- plain markdown is enough for the demo.

### 6.3 Verify A5 ProtocolMap contract via a type-level assertion (D14.2)

**File**: `tests/background/messaging/protocol-contract-a11.type-test.ts` (NEW).

```ts
/**
 * Type-level assertion: A5's ProtocolMap must contain every key A11 consumes.
 *
 * This file is consumed by `pnpm typecheck`. No runtime assertions. The
 * _check const is a compile-time guard: if A11ConsumedKeys is not a
 * subset of keyof ProtocolMap, the ternary resolves to never and the
 * true literal fails to assign.
 *
 * This test is MANDATORY per D14.2 and is the tripwire that catches A5
 * drift before A11's runtime code references a missing key.
 */

import type { ProtocolMap } from '../../../src/background/messaging/protocol';

type A11ConsumedKeys =
  | 'GENERATION_START'
  | 'GENERATION_UPDATE'
  | 'GENERATION_CANCEL'
  | 'DETECTED_JOB_BROADCAST'
  | 'INTENT_GET'
  | 'PROFILE_GET'
  | 'CREDITS_GET'
  | 'AUTH_STATUS';

type _AllPresent = A11ConsumedKeys extends keyof ProtocolMap ? true : never;
const _check: _AllPresent = true;
void _check;

/**
 * Value-type assertions: a function parameter of each consumed key must
 * match the shape A11 depends on. If A5 narrows or widens a parameter
 * type A11 uses, the assignments below fail to compile.
 */

import type {
  GenerationStartRequest,
  GenerationStartResponse,
  GenerationUpdateBroadcast,
} from '../../../src/background/messaging/protocol-types';
import type { GenerationId } from 'ats-autofill-engine';

// GENERATION_START signature: (data: GenerationStartRequest) => GenerationStartResponse
type _StartFn = ProtocolMap['GENERATION_START'];
type _StartParam = Parameters<_StartFn>[0];
type _StartReturn = ReturnType<_StartFn>;
const _startParamCheck: GenerationStartRequest = {} as _StartParam;
const _startReturnCheck: GenerationStartResponse | Promise<GenerationStartResponse> = {} as _StartReturn;
void _startParamCheck;
void _startReturnCheck;

// GENERATION_UPDATE broadcast shape
type _UpdateFn = ProtocolMap['GENERATION_UPDATE'];
type _UpdateParam = Parameters<_UpdateFn>[0];
const _updateParamCheck: GenerationUpdateBroadcast = {} as _UpdateParam;
void _updateParamCheck;

// GENERATION_CANCEL must accept { generationId: GenerationId }
type _CancelFn = ProtocolMap['GENERATION_CANCEL'];
type _CancelParam = Parameters<_CancelFn>[0];
const _cancelParamCheck: { readonly generationId: GenerationId } = {} as _CancelParam;
void _cancelParamCheck;
```

### 6.4 Write local Zod schemas for A11 runtime validation (D21)

**File**: `src/sidepanel/schemas/generation.ts` (NEW).

```ts
/**
 * Zod schemas for A11 runtime-boundary validation (D21).
 *
 * These schemas parse inbound broadcasts from the background worker before
 * the React side panel renders them. The type-level contract is declared by
 * A5's ProtocolMap (keystone contract 1.2). These schemas are the RUNTIME twin --
 * A5's types say "this shape is what you get at compile time"; these
 * schemas say "this shape is what we will trust at runtime". Mismatch
 * between the two is a blueprint drift and a D14 anti-drift gate.
 *
 * Localized to A11 because keystone contract 1.2 defines the types but not the
 * schemas. A future phase may promote these to @repo/shared-types.
 */

import { z } from 'zod';

export const GenerationArtifactSchema = z.object({
  kind: z.enum(['cv', 'cover-letter', 'email', 'other']),
  content: z.string().min(1).max(1_000_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GenerationStatusEnum = z.enum([
  'running',
  'completed',
  'failed',
  'awaiting_input',
  'cancelled',
]);

export const GenerationUpdateBroadcastSchema = z.object({
  generationId: z.string().min(1),
  sessionId: z.string().min(1),
  phase: z.string(),
  status: GenerationStatusEnum,
  progress: z.number().min(0).max(100).optional(),
  interactionType: z.string().optional(),
  artifacts: z.array(GenerationArtifactSchema).optional(),
}).strict();

export type GenerationUpdateBroadcastParsed = z.infer<typeof GenerationUpdateBroadcastSchema>;

export const GenerationStartRequestSchema = z.object({
  agent: z.enum(['job-hunter', 'b2b-sales']),
  payload: z.unknown(),
}).strict();

export const GenerationStartResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), generationId: z.string().min(1), sessionId: z.string().min(1) }),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }),
]);
```

**File**: `src/sidepanel/schemas/artifacts.ts` (NEW).

```ts
/**
 * Artifact extraction schema + extractor function.
 *
 * The backend's job-hunter result is currently an untyped Record<string,
 * unknown>[] (KI-A11-01 in config.json flaggedKnownIssues). A11 owns a
 * local schema that maps the conventional shape to the three sub-tabs
 * (CV, cover letter, cold email). This is a temporary bridge; the
 * correct long-term fix is a shared schema in libs/shared-types/
 * (blocked on a llmconveyors.com repo change outside A11 scope).
 */

import { z } from 'zod';
import { GenerationArtifactSchema } from './generation';

export const ArtifactsArraySchema = z.array(GenerationArtifactSchema);

export type ParsedArtifacts = {
  readonly cv: string | null;
  readonly coverLetter: string | null;
  readonly coldEmail: string | null;
};

/**
 * Extract the three artifact strings from a validated artifacts array.
 *
 * Returns null for any artifact kind not present. Callers render the
 * "This artifact was not generated" fallback for null entries.
 *
 * Per D19, handles adversarial inputs: unicode, empty strings (rejected
 * by min(1) in the schema), max-length (capped by the schema at 1MB),
 * and missing entries.
 */
export function extractArtifacts(
  artifacts: ReadonlyArray<z.infer<typeof GenerationArtifactSchema>>,
): ParsedArtifacts {
  const byKind = new Map<string, string>();
  for (const a of artifacts) {
    if (!byKind.has(a.kind)) byKind.set(a.kind, a.content);
  }
  return {
    cv: byKind.get('cv') ?? null,
    coverLetter: byKind.get('cover-letter') ?? null,
    coldEmail: byKind.get('email') ?? null,
  };
}
```

### 6.5 Write the background generation module (replaces A5's NotImplementedError stubs)

**File**: `src/background/generation/types.ts` (NEW).

```ts
import type { GenerationId, TabId } from 'ats-autofill-engine';
import type { GenerationUpdateBroadcast } from '../messaging/protocol-types';

export interface ActiveGeneration {
  readonly tabId: TabId;
  readonly generationId: GenerationId;
  readonly sessionId: string;
  readonly agent: 'job-hunter' | 'b2b-sales';
  readonly startedAtMs: number;
  latestBroadcast?: GenerationUpdateBroadcast;
  phase: 'interval' | 'alarms' | 'terminal';
  intervalHandle: ReturnType<typeof setInterval> | null;
}

export interface PersistedActiveGeneration {
  readonly tabId: number;
  readonly generationId: string;
  readonly sessionId: string;
  readonly agent: 'job-hunter' | 'b2b-sales';
  readonly startedAtMs: number;
}

export const STORAGE_KEY_ACTIVE = 'llmc.activeGenerations';
export const STORAGE_KEY_LAST_PREFIX = 'llmc.lastGeneration.';
export const ALARM_PREFIX = 'llmc.generation.';
export const INTERVAL_POLL_MS = 3000;
export const INTERVAL_PHASE_DURATION_MS = 60_000;
export const ALARM_PERIOD_MINUTES = 0.5; // Chrome minimum
```

### 6.6 Write the generation orchestrator dependencies (D20)

**File**: `src/background/generation/deps.ts` (NEW).

```ts
/**
 * Dependency object for the generation orchestrator (D20).
 *
 * Every cross-module + platform touchpoint goes through this object.
 * Production wires real impls in src/background/index.ts. Tests in
 * tests/background/generation/*.spec.ts wire fakes.
 *
 * No direct imports of chrome.*, globalThis.fetch, or Date.now() are
 * allowed inside the orchestrator module -- enforced by the D14 anti-drift
 * grep (scripts/check-a11-drift.sh in step 6.24).
 */

import type { Logger } from '../log';
import type { Profile } from 'ats-autofill-engine';
import type { GenerationUpdateBroadcast, GenerationStartRequest, GenerationStartResponse } from '../messaging/protocol-types';
import type { GenerationId, TabId } from 'ats-autofill-engine';

export interface SdkClient {
  readonly agents: {
    readonly run: (input: {
      readonly agentType: 'job-hunter' | 'b2b-sales';
      readonly companyName: string;
      readonly jobTitle?: string;
      readonly jobDescription?: string;
      readonly companyWebsite?: string;
    }) => Promise<{ readonly jobId: string; readonly sessionId: string }>;
    readonly getStatus: (input: {
      readonly jobId: string;
      readonly include?: ReadonlyArray<'logs' | 'artifacts' | 'usage'>;
    }) => Promise<{
      readonly status: 'queued' | 'processing' | 'completed' | 'failed' | 'awaiting_input';
      readonly progress?: number;
      readonly currentStep?: string;
      readonly failedReason?: string;
      readonly interactionType?: string;
      readonly artifacts?: ReadonlyArray<{ readonly kind: string; readonly content: string; readonly metadata?: Record<string, unknown> }>;
      readonly usage?: {
        readonly promptTokens: number;
        readonly candidatesTokens: number;
        readonly totalTokens: number;
        readonly creditsUsed?: number;
        readonly resolvedModel?: string;
      };
      readonly createdAt: string;
      readonly completedAt?: string;
    }>;
  };
}

export interface ChromeAlarmsPort {
  readonly create: (name: string, opts: { readonly periodInMinutes: number; readonly when?: number }) => void;
  readonly clear: (name: string) => Promise<boolean>;
  readonly onAlarm: {
    readonly addListener: (fn: (alarm: { readonly name: string }) => void) => void;
  };
}

export interface ChromeStoragePort {
  readonly get: (key: string) => Promise<Record<string, unknown>>;
  readonly set: (patch: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

export interface ClockPort {
  readonly now: () => number;
  readonly setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  readonly clearInterval: (handle: ReturnType<typeof setInterval>) => void;
  readonly setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

export interface BroadcastPort {
  readonly sendGenerationUpdate: (payload: GenerationUpdateBroadcast) => Promise<void>;
}

export interface OrchestratorDeps {
  readonly createSdkClient: () => Promise<SdkClient>;
  readonly readProfile: () => Promise<Profile | null>;
  readonly chromeAlarms: ChromeAlarmsPort;
  readonly chromeStorage: ChromeStoragePort;
  readonly clock: ClockPort;
  readonly broadcast: BroadcastPort;
  readonly logger: Logger;
  readonly generateId: () => string;
}
```

### 6.7 Write the generation orchestrator (hybrid polling scheduler)

**File**: `src/background/generation/orchestrator.ts` (NEW).

This is the core of A11's background work. The executor implements the orchestrator based on the following design notes (this plan is self-contained -- there is no "previous revision" to reference):

- The orchestrator is created via `createGenerationOrchestrator(deps: OrchestratorDeps)` returning a `GenerationOrchestrator` interface.
- `start()` includes a re-entry guard: rejects if `active.has(req.tabId)` with a non-terminal phase.
- `start()` persists to `chromeStorage` BEFORE starting the scheduler (review finding 4.1 persist-ordering fix).
- `start()` creates `setInterval` FIRST, then schedules the phase-2 transition via `setTimeout(60_000)`.
- First `pollTick` fires from the interval, not inline from `start()` (review finding 4.1 alarm-before-tick fix).
- `pollTick()` maps SDK status (`queued`/`processing` -> `running`; others pass through) via an exhaustive switch with `never` guard.
- `normalizeArtifactKind()` maps SDK artifact kinds to keystone contract enum.
- `cancel()` emits a synthetic `cancelled` broadcast (SDK 0.4.0 has no cancel endpoint).
- `onAlarmTick()` filters by `ALARM_PREFIX` prefix.
- `rehydrate()` reads from session storage, always enters alarms phase (conservative).
- `clearScheduler()` cleans both interval and alarm for the entry.

The executor implements the orchestrator from the design notes above. The function signatures are: `createGenerationOrchestrator(deps: OrchestratorDeps)` returning `{ start, cancel, onAlarmTick, rehydrate }`. Internal state is a `Map<TabId, GenerationEntry>` where each entry tracks phase (interval vs alarm), timers, and last-known status. The `normalizeArtifactKind` function maps SDK artifact kinds (`'resume' | 'cover_letter' | 'answers'`) to the `GenerationArtifact['kind']` union from the keystone contract.

### 6.8 Write the generation handler exports (consumed by A5's HANDLERS table)

**File**: `src/background/generation/handlers.ts` (NEW).

```ts
/**
 * Handlers consumed by A5's exhaustive HANDLERS dispatch table.
 *
 * A11 does NOT register its own onMessage listeners. Per D2, A5 owns
 * the dispatch loop in src/background/index.ts. A11 provides the
 * implementations that A5's handlers.ts imports.
 *
 * The two exported handlers are swapped into HANDLERS in place of the
 * NotImplementedError stubs A5 registered.
 */

import type { ProtocolMap } from '../messaging/protocol';
import type { OrchestratorDeps } from './deps';
import { createGenerationOrchestrator, type GenerationOrchestrator } from './orchestrator';
import { GenerationStartRequestSchema } from '../../sidepanel/schemas/generation';

// HandlerFor is defined in A5's handlers.ts. A11's handlers are imported BY
// that file, so we define a local compatible type to avoid circular imports.
type HandlerFor<K extends keyof ProtocolMap> = (msg: {
  data: Parameters<ProtocolMap[K]>[0];
  sender: chrome.runtime.MessageSender;
}) => Promise<ReturnType<ProtocolMap[K]>>;

let orchestrator: GenerationOrchestrator | null = null;

export function initGenerationHandlers(deps: OrchestratorDeps): void {
  if (orchestrator) {
    deps.logger.warn('initGenerationHandlers called twice; ignoring');
    return;
  }
  orchestrator = createGenerationOrchestrator(deps);

  // Wire chrome.alarms listener via the DI port.
  deps.chromeAlarms.onAlarm.addListener((alarm) => {
    void orchestrator!.onAlarmTick(alarm.name);
  });

  // Rehydrate any pre-existing in-flight generations from a crashed SW.
  void orchestrator.rehydrate();

  deps.logger.info('generation handlers initialised');
}

export const handleGenerationStart: HandlerFor<'GENERATION_START'> = async ({ data, sender }) => {
  if (!orchestrator) {
    throw new Error('generation orchestrator not initialised -- background startup order bug');
  }
  const parsed = GenerationStartRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: `invalid-start-request:${parsed.error.issues.map(i => i.path.join('.')).join(',')}` };
  }
  // tabId from the standard WebExtension sender context
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    return { ok: false, reason: 'missing-tab-id' };
  }
  const { TabId } = await import('ats-autofill-engine');
  return orchestrator.start({
    ...parsed.data,
    tabId: TabId(tabId),
  });
};

export const handleGenerationCancel: HandlerFor<'GENERATION_CANCEL'> = async ({ data }) => {
  if (!orchestrator) {
    throw new Error('generation orchestrator not initialised');
  }
  if (!data.generationId || typeof data.generationId !== 'string') {
    return { ok: false };
  }
  return orchestrator.cancel({ generationId: data.generationId });
};
```

### 6.9 Wire A11's real handlers into A5's HANDLERS dispatch table

**File**: `src/background/messaging/handlers.ts` (MODIFY).

Surgical edit. Replace the two stub function declarations:

```ts
// OLD (delete these):
const handleGenerationStart: HandlerFor<'GENERATION_START'> = async () => {
  throw new NotImplementedError('GENERATION_START');
};
const handleGenerationCancel: HandlerFor<'GENERATION_CANCEL'> = async () => {
  throw new NotImplementedError('GENERATION_CANCEL');
};

// NEW (add import at top):
import {
  handleGenerationStart,
  handleGenerationCancel,
} from '../generation/handlers';
```

The `HANDLERS` object literal already references `handleGenerationStart` and `handleGenerationCancel` by identifier and requires no change.

**File**: `src/background/index.ts` (MODIFY).

Add the generation orchestrator initialization call before `registerHandlers()`. The `buildOrchestratorDeps()` function wires real implementations:

```ts
import { initGenerationHandlers } from './generation/handlers';
import type { OrchestratorDeps } from './generation/deps';
import { createSdkClient } from './auth/sdk-client';
import { readProfile } from './storage/profile';
import { sendMessage } from './messaging/protocol';
import { createLogger } from './log';

function buildOrchestratorDeps(): OrchestratorDeps {
  return {
    createSdkClient: () => createSdkClient(),
    readProfile: () => readProfile(),
    chromeAlarms: {
      create: (name, opts) => chrome.alarms.create(name, opts),
      clear: (name) => chrome.alarms.clear(name),
      onAlarm: { addListener: (fn) => chrome.alarms.onAlarm.addListener(fn) },
    },
    chromeStorage: {
      get: (key) => chrome.storage.session.get(key),
      set: (patch) => chrome.storage.session.set(patch),
      remove: (key) => chrome.storage.session.remove(key),
    },
    clock: {
      now: () => Date.now(),
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (handle) => globalThis.clearInterval(handle),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    },
    broadcast: {
      sendGenerationUpdate: async (payload) => {
        await sendMessage('GENERATION_UPDATE', payload);
      },
    },
    logger: createLogger('generation-poller'),
    generateId: () => crypto.randomUUID(),
  };
}

initGenerationHandlers(buildOrchestratorDeps());
```

The order matters: `initGenerationHandlers` runs BEFORE `registerHandlers()` so that by the time the exhaustive dispatch loop calls `HANDLERS.GENERATION_START`, the orchestrator singleton is initialized.

### 6.10 Write `entrypoints/sidepanel/index.html`

**File**: `entrypoints/sidepanel/index.html` (NEW).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM Conveyors Job Assistant</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

WXT discovery registers this automatically as `side_panel.default_path`.

### 6.11 Write `entrypoints/sidepanel/main.tsx`

**File**: `entrypoints/sidepanel/main.tsx` (NEW). Mounts the React root with `createLogger('sidepanel')`.

### 6.12 Write `entrypoints/sidepanel/App.tsx`

**File**: `entrypoints/sidepanel/App.tsx` (NEW). Three-tab layout (Detected Job / Generation / Artifacts) with `useDetectedJob` and `useGenerationStatus` hooks. TabButton component with status badge (spinner for running, check for done, cross for failed/cancelled). Artifacts tab disabled until completed.

### 6.13 Write `entrypoints/sidepanel/deps.ts` (sidepanel DI surface, D20)

**File**: `entrypoints/sidepanel/deps.ts` (NEW).

CRITICAL: `sendMessage` / `onMessage` are imported from A5's bound instance (`src/background/messaging/protocol.ts`), NOT from `@webext-core/messaging` directly (review finding 7 BUG-A11-02). Enforced by D14 anti-drift grep in step 6.24.

The `SidepanelDeps` interface includes: `sendMessage`, `onMessage`, `chromeTabs` (query + onActivated), `chromeStorage.session`, `clipboard`, `download`, `openUrl`, `logger`.

`createDefaultSidepanelDeps()` wires production implementations.

### 6.14 Write `entrypoints/sidepanel/hooks/useDetectedJob.ts`

**File**: `entrypoints/sidepanel/hooks/useDetectedJob.ts` (NEW).

Per review finding 4.2 BUG-A11-01, cleanup is fixed: `unsubscribe` is held as a mutable ref in the outer scope, and the cleanup function calls it. Per review finding 4.3, `chrome.tabs.onActivated` triggers a re-run counter.

Reads `INTENT_GET` on mount (matching A10's pattern) and subscribes to `DETECTED_JOB_BROADCAST` for live updates.

### 6.15 Write `entrypoints/sidepanel/hooks/useGenerationStatus.ts`

**File**: `entrypoints/sidepanel/hooks/useGenerationStatus.ts` (NEW).

Rehydrates from `chrome.storage.session['llmc.lastGeneration.<tabId>']` on mount, validates through `GenerationUpdateBroadcastSchema` per D21. Subscribes to live `GENERATION_UPDATE` broadcasts with Zod parse before setState. Same cleanup fix as useDetectedJob.

### 6.16 Write the side panel views (DetectedJob / Generation / Artifacts)

**File**: `entrypoints/sidepanel/views/DetectedJob.tsx` (NEW).

Shows company, title, source link from the detected intent. "Generate CV" button with re-entry guard at the UI level (complements the orchestrator guard). Error state clears on next click.

**File**: `entrypoints/sidepanel/views/Generation.tsx` (NEW).

Shows status pill, phase, progress bar (clamped to 0-100 via `Math.max(0, Math.min(100, status.progress))`). Failed/cancelled/awaiting_input states. Cancel button only on non-terminal states.

Per review finding 3.4, `awaiting_input` renders a clickable deep link:
```tsx
<a href={`https://llmconveyors.com/dashboard/generations/${encodeURIComponent(status.generationId)}`}
   onClick={(e) => { e.preventDefault(); deps.openUrl(deepLinkHref); }}
   rel="noreferrer">
  Continue in the web app
</a>
```

**File**: `entrypoints/sidepanel/views/Artifacts.tsx` (NEW).

Three sub-tabs (CV / Cover Letter / Cold Email). Validates artifacts through `ArtifactsArraySchema.safeParse()` per D21 before rendering. Schema rejection shows error with deep link to web app. Renders markdown via `ReactMarkdown`. Copy and Download buttons.

### 6.17 Write the CSS modules

All NEW: `App.module.css`, `styles.css`, `DetectedJob.module.css`, `Generation.module.css`, `Artifacts.module.css`. Minimal stylesheets, no design system, no animations beyond the spinner.

### 6.18 Verify the manifest permissions

**File**: `wxt.config.ts` (MODIFY IF NEEDED).

Confirm `manifest.permissions` includes `'sidePanel'` and `'alarms'`. If either is missing, add it.

### 6.19 Write A10 popup's OpenSidePanelButton component and wire it into views

**File**: `src/entrypoints/popup/components/OpenSidePanelButton.tsx` (NEW).

```tsx
import React, { useState } from 'react';
import { createLogger } from '../../../background/log';

const log = createLogger('popup-open-sidepanel');

interface Props {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export function OpenSidePanelButton({ disabled, disabledReason }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);

  async function handleClick(): Promise<void> {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.windowId) {
        log.warn('no active window; cannot open side panel');
        return;
      }
      await chrome.sidePanel.open({ windowId: tab.windowId });
      // Close the popup AFTER open resolves so the user gesture context
      // persists through the open call.
      window.close();
    } catch (err) {
      log.error('chrome.sidePanel.open failed', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      title={disabled ? disabledReason ?? 'Sign in to open the side panel' : 'Open side panel'}
      aria-label="Open side panel"
      className="mt-2 w-full rounded-card border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? 'Opening...' : 'Open side panel'}
    </button>
  );
}
```

**File**: `src/entrypoints/popup/views/OnJobPosting.tsx` (MODIFY).

After the `<HighlightToggle tabId={tabId} />` line, add:

```tsx
import { OpenSidePanelButton } from '../components/OpenSidePanelButton';

<OpenSidePanelButton
  disabled={!authed}
  disabledReason="Sign in to open the side panel"
/>
```

**File**: `src/entrypoints/popup/views/OnApplicationForm.tsx` (MODIFY). Same addition.

### 6.20 Write Vitest test specs for the generation orchestrator

**File**: `tests/background/generation/orchestrator.spec.ts` (NEW).

`makeFakeDeps()` helper creates a full fake dependency set with in-memory storage, alarm tracking, broadcast capture, and a fake clock.

Test cases (D19 adversarial compliance):

1. **Happy path**: starts a generation, polls, transitions to completed
2. **Re-entry guard**: double Generate CV click returns `generation-already-in-progress`
3. **SDK run throws**: returns `{ ok: false, reason: 'network down' }`
4. **SDK returns malformed result**: empty jobId -> `sdk-empty-result`
5. **Poll throws mid-generation**: emits synthetic failed broadcast, cleans scheduler
6. **Cancel during interval phase**: clears interval, emits cancelled broadcast
7. **Cancel during alarms phase**: clears alarm, emits cancelled broadcast
8. **Multi-tab isolation**: two concurrent generations on different tabs do not cross-talk
9. **Rehydrate**: restores persisted generations from storage into alarms phase
10. **Malformed rehydrate entry**: skipped without throwing
11. **Unknown alarm name**: `onAlarmTick` is a no-op
12. **Phase transition**: fires after `INTERVAL_PHASE_DURATION_MS`
13. **Generation timeout**: if no terminal status after 5 minutes, emits synthetic failed (NOT in previous version - NEW)
14. **Credits exhausted mid-generation**: SDK returns `{ status: 'failed', failedReason: 'credits-exhausted' }` -> broadcasts failed with reason (NEW)

**File**: `tests/background/generation/handlers.spec.ts` (NEW).

1. `handleGenerationStart` rejects invalid requests via Zod
2. `handleGenerationCancel` returns ok:false for unknown generationId

### 6.21 Write React Testing Library tests for the side panel

**File**: `tests/entrypoints/sidepanel/App.test.tsx` (NEW). 5 cases: default tab, artifacts disabled, tab switching, empty detected job, empty generation.

**File**: `tests/entrypoints/sidepanel/Generation.test.tsx` (NEW). 8 cases:
1. Shows failed label on failed status
2. Shows cancelled notice on cancelled status
3. Clamps progress below 0 to 0
4. Clamps progress above 100 to 100
5. Renders clickable deep link for awaiting_input (NEW emphasis: verify `href` contains `/dashboard/generations/`)
6. Cancel button only shown on non-terminal states
7. Empty artifact content renders correctly (NEW)
8. Markdown injection in artifact content is escaped by ReactMarkdown (NEW)

**File**: `tests/entrypoints/sidepanel/Artifacts.test.tsx` (NEW). 8 cases:
1. Shows empty state when not completed
2. Renders CV markdown when present
3. Disables cover-letter and cold-email tabs when only CV present
4. Rejects schema-failing payloads with error state
5. Handles unicode + RTL content
6. Handles empty artifacts array by rendering not-generated fallback
7. Handles artifact with `<script>` tag -- ReactMarkdown escapes it (NEW)
8. Credits=0 in usage does not hide the field (shown as "0") (NEW)

**File**: `tests/entrypoints/sidepanel/useDetectedJob.test.tsx` (NEW). 4 cases: mount empty, intent get, broadcast live update, cleanup on unmount.

**File**: `tests/entrypoints/sidepanel/useGenerationStatus.test.tsx` (NEW). 5 cases: rehydrate from storage, broadcast live, Zod reject malformed broadcast, tab-switch re-subscribe, cleanup on unmount.

**File**: `tests/entrypoints/popup/OnJobPosting.test.tsx` (NEW, A11 addition). 4 cases:
1. Renders the Open side panel button
2. Calls `chrome.sidePanel.open` with `windowId` on click
3. Button is disabled when signed out
4. Stale popup -> sidepanel handoff: popup closes before sidePanel.open resolves gracefully (NEW)

**File**: `tests/entrypoints/popup/OnApplicationForm.test.tsx` (NEW). 3 cases covering the same button integration.

**File**: `tests/entrypoints/popup/OpenSidePanelButton.test.tsx` (NEW). 5 cases:
1. Renders with correct label
2. Disabled state shows tooltip
3. Calls chrome.sidePanel.open on click
4. Calls window.close after open resolves
5. Handles chrome.sidePanel.open rejection gracefully (no crash)

### 6.22 Write the manual E2E smoke checklist

**File**: `scripts/e2e-smoke.md` (NEW).

This is the gate. Estimated time: 35 minutes end-to-end.

**Step 1**: Install + icon (4 checks)

**Step 2**: Sign in -- happy path (6 checks)

**Step 2.1**: Sign in -- invalid redirect URI (adversarial). Temporarily edit `wxt.config.ts` to change extension ID. Expected: `launchWebAuthFlow` fails, popup shows "Sign-in failed -- please try again", extension does NOT crash. Revert and rebuild.

**Step 2.2**: Sign in -- refresh on 401 (adversarial). Sign in normally, manually clear access token from `chrome.storage.session`. Click "Generate CV". Expected: RefreshManager fires refresh, generation proceeds without user intervention.

**Step 2.3**: Sign out + sign back in (adversarial). Sign out -> side panel clears -> sign back in -> generation works.

**Step 3**: JSON Resume upload -- happy path (5 checks)

**Step 3.1**: JSON Resume upload -- invalid JSON (malformed syntax -> parse error shown, no crash)

**Step 3.2**: JSON Resume upload -- schema-failing JSON (missing `basics.name` -> "Schema validation failed" with field path)

**Step 3.3**: JSON Resume upload -- 10MB file (accepted within 2s or rejected politely)

**Step 3.4**: JSON Resume upload -- XSS payload (`<script>alert(1)</script>` in summary -> no alerts, escaped safely)

**Step 3.5**: JSON Resume upload -- missing EEO consent defaults to false (NOT silently true)

**Step 4**: Greenhouse autofill (7 checks)

**Step 5**: Highlight toggle -- signed in (4 checks)

**Step 5.1**: Highlight toggle -- signed out disabled (adversarial). Sign out -> navigate to Greenhouse JD -> click extension icon -> toggle rendered with reduced opacity (opacity 0.6), NOT clickable, tooltip text "Sign in for keyword matching" (EXACT string). Click the button -> nothing happens.

**Step 6**: Lever autofill (5 checks)

**Step 7**: Workday 4-step wizard traversal (CRITICAL per decision memo success criteria 6.1)

Prerequisites: a Workday candidate account on one of: `workday.wd5.myworkdayjobs.com`, `deloitte.wd5.myworkdayjobs.com`, `accenture.wd103.myworkdayjobs.com`.

**Step 7.1 -- My Information**: Fill form -> first name, last name, email, phone populated. Click Workday's "Save and Continue".

**Step 7.2 -- My Experience**: A8's `watchForStepChange` detects step change. Click Fill -> at least 1 work history row populated. Click "Save and Continue".

**Step 7.3a -- Voluntary Disclosures with `allowEeoAutofill: true`**: Click Fill -> gender, race, ethnicity, veteran status, disability status populated.

**Step 7.3b -- Voluntary Disclosures with `allowEeoAutofill: false`**: NO demographic fields filled. Popup shows toast "EEO disclosures skipped (consent not granted)". bg log entry `voluntary disclosures short-circuit { reason: 'consent-not-granted' }`.

**Step 7.4 -- Review**: Click Fill -> popup shows "Review step cannot be filled -- read-only summary" OR `{ ok: false, reason: 'wizard-not-ready' }`. NO fields modified. Extension does NOT auto-submit.

Pre-demo checklist item: "Workday 4-step wizard traversal with EEO consent gate verified".

**Step 8**: Side panel + Generate CV (13 checks covering open from popup, detected job tab, generate, status transitions, artifacts tabs, copy, download)

**Step 8.1**: Concurrent generation rejection -- second click rejected with "generation already in progress"

**Step 8.2**: Multi-tab isolation -- two tabs running generation, no cross-talk

**Step 8.3**: Cancel mid-generation -- test in both interval phase (<60s) and alarms phase (>60s)

**Step 8.4**: Network failure mid-generation -- stop API, next poll emits synthetic failed, extension does not crash

**Step 8.5**: SW suspend/wake -- stop SW via `chrome://serviceworker-internals/`, wait 10s, re-open side panel, orchestrator rehydrates and resumes polling

**Step 9**: Pass criteria -- all boxes ticked. ANY failure blocks the demo.

### 6.23 Write the Playwright E2E harness

**File**: `tests/e2e-smoke/playwright.config.ts` (NEW). Workers: 1, headless: false, timeout: 60s.

**File**: `tests/e2e-smoke/fixtures/` -- copy 16 HTML fixtures (12 Workday + 2 Greenhouse + 2 Lever).

**File**: `tests/e2e-smoke/specs/extension-loads.spec.ts` (NEW). Service worker starts without errors.

**File**: `tests/e2e-smoke/specs/greenhouse-fill.spec.ts` (NEW). Fixture fill against 2 GH fixtures.

**File**: `tests/e2e-smoke/specs/lever-fill.spec.ts` (NEW). Fixture fill against 2 Lever fixtures.

**File**: `tests/e2e-smoke/specs/workday-wizard.spec.ts` (NEW). 3 tenants x 4 steps = 12 test cases per D25:

```ts
const TENANTS = ['workday-wd5', 'deloitte-wd5', 'accenture-wd103'] as const;
const STEPS = ['my-information', 'my-experience', 'voluntary-disclosures', 'review'] as const;

for (const tenant of TENANTS) {
  test.describe(`workday fixture ${tenant}`, () => {
    for (const step of STEPS) {
      test(`${step} fixture loads and step-detector identifies it`, async ({ browser }) => {
        // 1. Fixture file exists
        // 2. Launch extension
        // 3. Load fixture
        // 4. Send FILL_REQUEST via bg messaging
        // 5. For my-information, my-experience, voluntary-disclosures:
        //    expect FillRequestResponse.ok === true, filled > 0
        // 6. For review:
        //    expect FillRequestResponse.ok === false, reason === 'wizard-not-ready'
        // 7. For voluntary-disclosures: run twice
        //    Once with profile.consents.allowEeoAutofill === true (EEO fields filled)
        //    Once with false (EEO fields skipped, non-demographic fields still filled)
      });
    }
  });
}
```

### 6.24 Write the demo recording checklist

**File**: `scripts/record-demo.md` (NEW).

OBS Studio 30+ at 1920x1080 30fps. Recording script target 2:45 total:

- Scene 1 -- Greenhouse fill (0:00-0:35)
- Scene 2 -- Lever fill (0:35-0:55)
- Scene 3 -- Workday 4-step wizard (0:55-1:55) CRITICAL. All 4 steps with timestamps. Step 3 shows demographics populate. Step 4 shows "Review step cannot be filled" + extension did NOT auto-submit.
- Scene 4 -- Side panel + Generate CV (1:55-2:45). Open side panel from popup button. Generate CV. Status transitions. Artifacts tabs. Copy to clipboard.

### 6.25 Write the demo talking points document

**File**: `docs/demo-script.md` (NEW). Opener (45s) + Demo 1 GH (35s) + Demo 2 Lever (20s) + Demo 3 Workday 4-step (60s, KEY MOMENT) + Demo 4 Side Panel (50s) + Close (20s). Fallback: recorded video on Loom if live breaks.

### 6.26 Write the blueprint contract files (D22)

**File**: `src/sidepanel/blueprint.contract.ts` (NEW).

```ts
export const SIDEPANEL_BLUEPRINT = {
  phase: 'A11',
  version: '2.1',
  publicExports: [] as const,
  forbiddenImports: [
    '@webext-core/messaging',
    'chrome.*',
  ],
  requiredCoverage: 70,
} as const;
```

**File**: `src/background/generation/blueprint.contract.ts` (NEW).

```ts
export const GENERATION_BLUEPRINT = {
  phase: 'A11',
  version: '2.1',
  publicExports: ['handleGenerationStart', 'handleGenerationCancel', 'initGenerationHandlers'] as const,
  forbiddenImports: [
    'chrome.*',
    'globalThis.fetch',
    'Date.now',
  ],
  requiredCoverage: 85,
} as const;
```

### 6.27 Write the rollback script (D23)

**File**: `scripts/rollback-phase-A11.sh` (NEW).

```bash
#!/bin/bash
set -euo pipefail

echo "[rollback-A11] Removing side panel files"
rm -rf entrypoints/sidepanel
rm -rf src/sidepanel

echo "[rollback-A11] Removing generation orchestrator"
rm -rf src/background/generation

echo "[rollback-A11] Removing A11-added popup component"
rm -f src/entrypoints/popup/components/OpenSidePanelButton.tsx

echo "[rollback-A11] Reverting A10 popup views to HEAD"
git checkout HEAD -- src/entrypoints/popup/views/OnJobPosting.tsx
git checkout HEAD -- src/entrypoints/popup/views/OnApplicationForm.tsx

echo "[rollback-A11] Reverting A5 handlers dispatch table"
git checkout HEAD -- src/background/messaging/handlers.ts
git checkout HEAD -- src/background/index.ts

echo "[rollback-A11] Reverting manifest permissions"
git checkout HEAD -- wxt.config.ts

echo "[rollback-A11] Removing A11 tests"
rm -rf tests/background/generation
rm -rf tests/entrypoints/sidepanel
rm -f tests/entrypoints/popup/OnJobPosting.test.tsx
rm -f tests/entrypoints/popup/OnApplicationForm.test.tsx
rm -f tests/entrypoints/popup/OpenSidePanelButton.test.tsx
rm -f tests/background/messaging/protocol-contract-a11.type-test.ts

echo "[rollback-A11] Removing E2E harness"
rm -rf tests/e2e-smoke

echo "[rollback-A11] Removing A11 scripts and docs"
rm -f scripts/e2e-smoke.md
rm -f scripts/record-demo.md
rm -f scripts/rollback-phase-A11.sh
rm -f scripts/check-a11-drift.sh
rm -f docs/demo-script.md
rm -f docs/michael-apr17-email.txt
rm -f docs/demo.mp4 || true

echo "[rollback-A11] Verifying clean state"
pnpm typecheck
pnpm build

echo "[rollback-A11] Done. Phase A11 fully reverted."
```

### 6.28 Write the A11 anti-drift grep gate (D14)

**File**: `scripts/check-a11-drift.sh` (NEW).

5 checks:
1. No direct `@webext-core/messaging` imports from sidepanel or generation (BUG-A11-02)
2. No `chrome.*` direct calls inside `src/background/generation/orchestrator.ts` (D20)
3. No `console.*` in A11 areas (D11)
4. No em-dash in A11 files (D15)
5. `GENERATION_*` symbols only appear in A5-owned and A11-owned files

Add to `.husky/pre-commit` and `.github/workflows/ci.yml`.

### 6.29 Full compliance run

```bash
pnpm typecheck
pnpm lint
pnpm test
scripts/check-a11-drift.sh
pnpm build
pnpm exec playwright test tests/e2e-smoke/specs/ || echo "playwright may be skipped if browsers unavailable"
```

Expected: all checks clean, zero warnings. Sidepanel chunk target < 90KB gzipped.

---

## 7. File inventory

### New files (in `e:/llmconveyors-chrome-extension/`)

Sidepanel entry:
- `entrypoints/sidepanel/index.html`
- `entrypoints/sidepanel/main.tsx`
- `entrypoints/sidepanel/App.tsx`
- `entrypoints/sidepanel/App.module.css`
- `entrypoints/sidepanel/styles.css`
- `entrypoints/sidepanel/deps.ts`
- `entrypoints/sidepanel/views/DetectedJob.tsx`
- `entrypoints/sidepanel/views/DetectedJob.module.css`
- `entrypoints/sidepanel/views/Generation.tsx`
- `entrypoints/sidepanel/views/Generation.module.css`
- `entrypoints/sidepanel/views/Artifacts.tsx`
- `entrypoints/sidepanel/views/Artifacts.module.css`
- `entrypoints/sidepanel/hooks/useDetectedJob.ts`
- `entrypoints/sidepanel/hooks/useGenerationStatus.ts`

Sidepanel pure logic:
- `src/sidepanel/schemas/generation.ts`
- `src/sidepanel/schemas/artifacts.ts`
- `src/sidepanel/blueprint.contract.ts`

Background generation:
- `src/background/generation/types.ts`
- `src/background/generation/deps.ts`
- `src/background/generation/orchestrator.ts`
- `src/background/generation/handlers.ts`
- `src/background/generation/blueprint.contract.ts`

Popup (A11 addition to A10 territory):
- `src/entrypoints/popup/components/OpenSidePanelButton.tsx`

Tests:
- `tests/background/messaging/protocol-contract-a11.type-test.ts`
- `tests/background/generation/orchestrator.spec.ts`
- `tests/background/generation/handlers.spec.ts`
- `tests/entrypoints/sidepanel/App.test.tsx`
- `tests/entrypoints/sidepanel/Generation.test.tsx`
- `tests/entrypoints/sidepanel/Artifacts.test.tsx`
- `tests/entrypoints/sidepanel/useDetectedJob.test.tsx`
- `tests/entrypoints/sidepanel/useGenerationStatus.test.tsx`
- `tests/entrypoints/popup/OnJobPosting.test.tsx`
- `tests/entrypoints/popup/OnApplicationForm.test.tsx`
- `tests/entrypoints/popup/OpenSidePanelButton.test.tsx`

E2E harness:
- `tests/e2e-smoke/playwright.config.ts`
- `tests/e2e-smoke/specs/extension-loads.spec.ts`
- `tests/e2e-smoke/specs/greenhouse-fill.spec.ts`
- `tests/e2e-smoke/specs/lever-fill.spec.ts`
- `tests/e2e-smoke/specs/workday-wizard.spec.ts`
- `tests/e2e-smoke/fixtures/workday/*.html` (12 files, copied from B9)
- `tests/e2e-smoke/fixtures/greenhouse/*.html` (2 files)
- `tests/e2e-smoke/fixtures/lever/*.html` (2 files)

Scripts + docs:
- `scripts/e2e-smoke.md`
- `scripts/record-demo.md`
- `scripts/rollback-phase-A11.sh`
- `scripts/check-a11-drift.sh`
- `docs/demo-script.md`
- `docs/michael-apr17-email.txt` (template, see step 10.1)

### Modified files

- `src/background/messaging/handlers.ts` (swap stubs for real imports; 4 lines changed)
- `src/background/index.ts` (add orchestrator init + deps wiring; ~60 lines added)
- `src/entrypoints/popup/views/OnJobPosting.tsx` (add OpenSidePanelButton; ~5 lines)
- `src/entrypoints/popup/views/OnApplicationForm.tsx` (add OpenSidePanelButton; ~5 lines)
- `wxt.config.ts` (ensure `alarms` and `sidePanel` in permissions; ~2 lines)
- `.husky/pre-commit` (add `scripts/check-a11-drift.sh` line)
- `.github/workflows/ci.yml` (add the same)

Files modified in `e:/llmconveyors.com`: **zero** (confirmed).

Total: 43 new files, 7 modified files. ~2400 LoC added net across production + tests + scripts.

---

## 8. Acceptance criteria

### 8.1 Automated (`pnpm test`)

Must pass:
- `tests/background/messaging/protocol-contract-a11.type-test.ts` -- compile-time (participates in `pnpm typecheck`)
- `tests/background/generation/orchestrator.spec.ts` -- 14 cases: happy path + 13 adversarial (re-entry, sdk throw, malformed result, poll throw, cancel interval phase, cancel alarms phase, multi-tab, rehydrate, malformed rehydrate, unknown alarm, phase transition, generation timeout, credits exhausted)
- `tests/background/generation/handlers.spec.ts` -- 2 cases: Zod validation reject, unknown cancel
- `tests/entrypoints/sidepanel/App.test.tsx` -- 5 cases
- `tests/entrypoints/sidepanel/Generation.test.tsx` -- 8 cases (progress clamping x2, cancelled, awaiting_input deep link, cancel-button-terminal-hide, failed label, empty artifact content, markdown injection escaped)
- `tests/entrypoints/sidepanel/Artifacts.test.tsx` -- 8 cases (empty, CV markdown, disabled subtabs, schema reject, unicode, empty array, script-tag XSS safe, credits=0 display)
- `tests/entrypoints/sidepanel/useDetectedJob.test.tsx` -- 4 cases
- `tests/entrypoints/sidepanel/useGenerationStatus.test.tsx` -- 5 cases
- `tests/entrypoints/popup/OnJobPosting.test.tsx` -- 4 cases (button renders, open sidepanel call, disabled when signed out, stale popup handoff graceful)
- `tests/entrypoints/popup/OnApplicationForm.test.tsx` -- 3 cases
- `tests/entrypoints/popup/OpenSidePanelButton.test.tsx` -- 5 cases

Coverage floors (D24):
- `src/background/generation/**`: 85% line, 80% branch
- `entrypoints/sidepanel/**`: 70% line (complemented by Playwright smoke)

### 8.2 Type-check (`pnpm typecheck`)

- `tests/background/messaging/protocol-contract-a11.type-test.ts` compiles cleanly. If A5 drops any consumed key, this file fails.

### 8.3 Anti-drift (`scripts/check-a11-drift.sh`)

All 5 checks pass.

### 8.4 Playwright (`pnpm exec playwright test tests/e2e-smoke/specs/`)

- extension-loads.spec.ts: 1 case
- greenhouse-fill.spec.ts: 1-2 cases against 2 fixtures
- lever-fill.spec.ts: 1-2 cases against 2 fixtures
- workday-wizard.spec.ts: 12 cases (3 tenants x 4 steps)

Total Playwright cases: ~16-20.

### 8.5 Build (`pnpm build`)

- `.output/chrome-mv3/` exists
- `.output/chrome-mv3/sidepanel.html` exists
- `.output/chrome-mv3/manifest.json` has `permissions` including `sidePanel` and `alarms`
- Chrome loads the unpacked build with zero warnings
- Sidepanel JS chunk is < 120KB gzipped (ideally < 90KB)

### 8.6 Manual (`scripts/e2e-smoke.md`)

All 9 manual checklist sections (1 through 9) pass.

---

## 9. Pre-demo checklist (phase acceptance test)

This is the gate for declaring A11 complete and Plan 100 shipped.

- [ ] `pnpm build` produces `.output/chrome-mv3/` with zero errors
- [ ] Load unpacked in Chrome 114+, no manifest errors
- [ ] `ats-autofill-engine@0.1.0-alpha.2` is resolvable via `npm view`
- [ ] Sign-in happy path works on a fresh Chrome profile
- [ ] Sign-in invalid redirect URI gracefully fails (step 6.22 step 2.1)
- [ ] Sign-in refresh on 401 succeeds (step 6.22 step 2.2)
- [ ] Sign-out + sign-in again works (step 6.22 step 2.3)
- [ ] Profile upload happy path works
- [ ] Profile upload invalid JSON rejected
- [ ] Profile upload schema-failing rejected
- [ ] Profile upload 10MB handled or rejected
- [ ] Profile upload XSS payload safe
- [ ] Profile upload missing EEO defaults to false
- [ ] Greenhouse fill works on a live posting
- [ ] Highlight toggle works when signed in
- [ ] Highlight toggle disabled + tooltip "Sign in for keyword matching" when signed out
- [ ] Lever fill works on a live posting
- [ ] Workday step 1 My Information fills
- [ ] Workday step 2 My Experience detected and fills
- [ ] Workday step 3 Voluntary Disclosures fills with allowEeoAutofill=true
- [ ] Workday step 3 Voluntary Disclosures SKIPS with allowEeoAutofill=false + toast "EEO disclosures skipped (consent not granted)"
- [ ] Workday step 4 Review refuses to fill + no auto-submit
- [ ] Side panel opens from popup "Open side panel" button
- [ ] Generate CV streams updates + completes
- [ ] Artifacts tab renders CV + Cover Letter + Cold Email
- [ ] Concurrent generation rejection (second request blocked)
- [ ] Multi-tab isolation (two tabs, no cross-talk)
- [ ] Cancel mid-generation in both scheduler phases
- [ ] Network failure mid-generation handled
- [ ] SW suspend/wake rehydrates generation state
- [ ] Demo video recorded to `docs/demo.mp4`, uploaded to Loom/Drive
- [ ] Status email to Michael drafted in `docs/michael-apr17-email.txt`

If any box fails, A11 is NOT complete. The Workday 4-step traversal CANNOT be waived -- it is the Day-6 deliverable per D3 and the April 17 gate.

---

## 10. Related artifacts

### 10.1 Status email to Michael

**File**: `docs/michael-apr17-email.txt` (NEW, draft).

```
Subject: LLM Conveyors Job Assistant POC -- demo ready

Hey Michael,

Hitting the April 17 internal deadline. Three artifacts done:

1. ats-autofill-engine on npm
   https://www.npmjs.com/package/ats-autofill-engine (0.1.0-alpha.2)
   https://github.com/ebenezer-isaac/ats-autofill-engine

2. Backend endpoints merged to llmconveyors main:
   - POST /api/v1/auth/extension-token-exchange
   - POST /api/v1/ats/extract-skills

3. llmconveyors-chrome-extension (load-unpacked):
   https://github.com/ebenezer-isaac/llmconveyors-chrome-extension
   - Fills forms on Greenhouse, Lever, Workday (full 4-step wizard traversal)
   - Voluntary Disclosures respect the allowEeoAutofill consent flag
   - Review step is read-only (never auto-submits)
   - Keyword highlighting toggle (disabled graceful when signed out)
   - Side panel with API-driven CV + cover letter + cold email generation
   - JSON Resume profile upload

Demo video: <LOOM_LINK>

Ready for Monday. Will hold the time you suggested unless you want to push it.

Ebenezer
```

Send on April 17 after the step 9 checklist passes. Do NOT send if any box is red.

### 10.2 `docs/demo.mp4`

Not committed (excluded by `.gitignore`). Uploaded to Loom or Drive. Link tracked in both `docs/demo-script.md` and `docs/michael-apr17-email.txt`.

---

## 11. Out of scope (explicit)

- Full side panel polish -- rough V1 is fine
- Artifact download as PDF -- plain markdown/text Blob in V1, PDF in Month 1
- Error recovery for half-failed generations -- failed status + "Try again" button
- Internationalization -- English only
- Reading past generations (session history) -- current tab only
- Accessibility audit -- basic ARIA only
- SSE streaming -- polling only
- Cancel against backend -- client-side synthesis only
- Keyboard arrow navigation between tabs -- aria-selected set, no shortcuts
- Phased interaction UI (contact selection, draft approval) -- awaiting_input shows deep link only
- Artifact diff / version history -- first completed run only
- Chrome Web Store submission assets -- Month 1
- A full `JobHunterResultSchema` in `libs/shared-types` -- tracked as KI-A11-01; A11 ships local schema only
- Side panel per-tab UI (side panel is per-window -- tab switches re-query)

---

## 12. Rollback plan

If A11 fails verification and the corrective-plan loop cannot fix within 2 attempts:

1. Run `bash scripts/rollback-phase-A11.sh` (D23).
2. Verify `pnpm typecheck && pnpm test && pnpm build` pass in the rolled-back state.
3. Commit the rollback as a separate commit.
4. Demo only the Greenhouse/Lever/Workday fill flow. Skip the Generate CV path on the call.
5. Narrate the code walkthrough from `src/background/generation/orchestrator.ts` (in the pre-rollback commit SHA) as "wired but not demo-grade yet".

The offline autofill is the flagship per decision memo 1.1 ("once someone auto fills 10 applications, they never uninstall"). The API path is a bonus. Shipping the popup + content script alone is still a valid demo.

---

## 13. Risk register (phase-local)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| A11-R1 | Live ATS selector drift between plan and execution day | M | H | Manual checklist catches this 35 min into Day 6. Playwright fixture harness as safety net. B9 captured fixtures against 3 tenants per D25. |
| A11-R2 | react-markdown bundles larger than 90KB gzipped in sidepanel chunk | L | M | `pnpm build` check in step 6.29. If bundle > 120KB, fall back to 40-line plain-text renderer per step 5.8. |
| A11-R3 | chrome.sidePanel.open requires user gesture that the popup handler chain breaks | L | M | Test immediately after step 6.19. If broken, fall back to Chrome's native "Open side panel" menu. |
| A11-R4 | Generation polling stalls under the chrome.alarms 30s floor | L | M | Hybrid scheduler (step 5.2, step 6.7) uses setInterval for phase 1 (first 60s) and chrome.alarms @ 0.5 min for phase 2. Test `advance(60_001)` covers the transition. |
| A11-R5 | Backend artifact result shape diverges from A11's local schema | M | M | `ArtifactsArraySchema.safeParse` fails loudly. Side panel shows "Artifact payload rejected" with deep link. Known issue KI-A11-01. |
| A11-R6 | Demo recording overflows 3 minutes because generation takes too long | M | L | OBS edit cut in step 6.24 Scene 4 2:10. Target 2:45 total. |
| A11-R7 | Workday candidate account creation burns 10min of executor's day | M | M | Documented in step 6.22 Setup. Fallback: skip live Workday step, rely on Playwright fixture harness. Narrate on the call. |
| A11-R8 | Workday Voluntary Disclosures consent gate regression in A8 or B9 | L | H | Step 6.22 step 7.3b is the gate. Also unit-tested in B9 per D25. Also unit-tested in A8's controller. Three defensive layers. |
| A11-R9 | GENERATION_UPDATE Zod schema rejects valid backend broadcasts | L | M | Schema is permissive (most fields optional). Known issue KI-A11-01. |
| A11-R10 | Playwright chromium install fails on Windows | M | L | Playwright harness is SECONDARY per step 5.10. Skip and rely on manual checklist. |
| A11-R11 | OpenSidePanelButton addition to A10 files breaks A10 tests | L | M | Tests added for both popup views. A10's test suite re-runs in step 6.29. |
| A11-R12 | Rehydrated generation continues polling on a closed tab | L | L | Orchestrator still completes + persists to storage. No user harm. |

---

## 14. Executor notes

- This phase is the LAST. If you are the executor running A11, check that A5, A8, A9, A10, B9 all passed verification before you start. If any are red, STOP -- fix them first via the corrective-plan loop, then return to A11.
- Day 6 (April 17) is the HARD deadline. If you hit A11 with < 2 hours left, prioritize in this order:
  1. Side panel builds and loads (steps 6.1-6.18) -- 120 minutes
  2. OpenSidePanelButton wiring (step 6.19) -- 15 minutes
  3. Pre-demo checklist step 9 on Greenhouse + Workday 4-step only -- 35 minutes
  4. Demo recording step 6.24 on the same reduced flow -- 25 minutes
  5. Status email step 10.1 -- 10 minutes

  Everything else (Lever manual, Playwright automated, all JSON Resume adversarial cases) is deferred to Apr 18-19 polish days.

- NEVER auto-submit a form during E2E testing. The user must click Submit themselves.
- NEVER record real personal data in the demo video -- use fixture profile data only.
- NEVER edit `src/background/messaging/protocol.ts`. If a key is missing, that is an A5 bug.
- NEVER import `@webext-core/messaging` directly from sidepanel or generation code. Always go through `src/background/messaging/protocol.ts`.
- NEVER use `console.*` in any A11 file. Always `createLogger('<scope>')`.
- NEVER put em-dashes in any A11 file (D15 CI grep will reject).
- If react-markdown bundle bites, fall back to the 40-line plain-text renderer in `entrypoints/sidepanel/views/Artifacts.tsx` per step 5.8.
- The `DETECTED_JOB_BROADCAST` contract depends on A9 shipping the intent detector AND A5 shipping the broadcast-only inert handler. If either is missing, halt and report.
- The Workday 4-step E2E is the single most important Day-6 deliverable. Any shortcut on this step nullifies the April 17 gate. DO NOT defer.

---

## 15. Done criteria

A11 is DONE when:

- [ ] Every file in step 7 exists and is committed to `ebenezer-isaac/llmconveyors-chrome-extension`
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass with zero warnings
- [ ] `scripts/check-a11-drift.sh` passes (all 5 gates)
- [ ] `pnpm exec playwright test tests/e2e-smoke/specs/` passes (or is formally skipped per step 6.23 fallback)
- [ ] Step 9 pre-demo checklist is 100% green (zero waived boxes)
- [ ] `docs/demo.mp4` exists locally and is uploaded to Loom/Drive
- [ ] `docs/demo-script.md` has the Loom/Drive share link filled in
- [ ] `docs/michael-apr17-email.txt` is drafted with the Loom link
- [ ] `src/sidepanel/blueprint.contract.ts` and `src/background/generation/blueprint.contract.ts` exist
- [ ] `scripts/rollback-phase-A11.sh` exists and is executable
- [ ] `scripts/check-a11-drift.sh` is wired into `.husky/pre-commit` and `.github/workflows/ci.yml`
- [ ] The user has been told: "A11 done. Pre-demo checklist green. Status email drafted in docs/michael-apr17-email.txt -- review and hit send."

Plan 100 is DONE when A11 is done AND the user sends the status email AND the April 20 demo call is held.

---

## 16. Compliance

- [ ] Run `pnpm compliance` -- all checks must pass
- [ ] Zero em-dashes in entire plan file (D15) -- verified
- [ ] All D19 adversarial test categories covered: null/undefined, empty/max collections, unicode, injection, concurrent re-entry, adversarial state
- [ ] D14 anti-drift gates: forbidden token grep, type-level assertion, blueprint contract
- [ ] D20 DI: every hook and handler accepts Deps, tests wire fakes
- [ ] D21 Zod: every runtime boundary (GENERATION_UPDATE broadcast, artifact payload, GENERATION_START request) validated
- [ ] D22 blueprint contracts: `src/sidepanel/blueprint.contract.ts` + `src/background/generation/blueprint.contract.ts`
- [ ] D23 rollback: `scripts/rollback-phase-A11.sh` exists and tested
- [ ] D24 coverage floors met
- [ ] D25 multi-tenant: 12 Workday fixtures (3 tenants x 4 steps) consumed by Playwright harness

---

**End of Phase A11 v2.1 rewrite. Grade target: A-.**
