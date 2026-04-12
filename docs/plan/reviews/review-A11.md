# Review — Phase A11 (Side panel UI + E2E smoke test + demo recording)

**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A11_sidepanel_e2e_and_demo/plan.md`
**Reviewer**: Claude Opus 4.6
**Date**: 2026-04-11
**Scope**: single phase (A11) against decision memo v2, config.json, and contract neighbours A5/A10.

---

## 0. Summary grade

**Grade: C+**

The plan is thorough on the side-panel React artifact viewer (the "easy" half) and the background generation poll handler. It is **meaningfully under-spec'd on the E2E coverage the review brief explicitly demands**, and it carries **two hard contract violations** against the neighbouring phases it claims to integrate with. Several pieces of decision-memo scope are silently dropped. All of this is recoverable with a short corrective pass, but the file as it stands would let an executor ship a demo that misses the Workday multi-step wow-factor that D3 specifically flipped to (b) MULTI-STEP WIZARD on 2026-04-11 to create.

---

## 1. Hard contract violations (blocker class)

### 1.1 BLOCKER — A10 popup has NO "Open side panel" button; A11 assumes it does

**Severity**: blocker
**Where A11 says it**: §2 Blocks/depends (lines 62-66), §6.15 "Wire the popup's Open side panel button" (lines 1314-1329), §9 pre-demo checklist bullet "Side panel opens from the popup's Open side panel button".
**Where A10 contradicts it**: `phase_A10_popup_ui/plan.md` §1 explicitly lists four top-level views (`SignedOut`, `NotOnSupportedPage`, `OnJobPosting`, `OnApplicationForm`) and §1 Out of Scope (line 43) states "Side panel UI — A11." A grep of the entire A10 plan for `sidePanel | Open side panel | openSidePanel` returns zero matches. Neither `OnJobPosting.tsx` (line 566) nor `OnApplicationForm.tsx` (line 617) contains any side-panel trigger. There is no `handleOpenSidePanel` stub in A10 for A11 to "swap for a real call".

**Impact**: §6.15's instruction "Find the 'Open side panel' button handler. If it currently contains a stub, replace with..." will fail on execution because there is nothing to find. The fallback ("SKIP this step and document in scripts/e2e-smoke.md step 11 that the user opens the side panel manually via the Chrome menu") is worse than it reads — Chrome's side-panel menu only appears if the manifest already has `side_panel` populated and requires a user gesture from the extension action or a shortcut; it is not a one-liner.

**Correct fix**: A11 must define a new step (6.15a) that ADDS the button to A10's popup:
1. Extend `OnJobPosting.tsx` and `OnApplicationForm.tsx` with a secondary button labelled "Open side panel" rendered beneath the primary CTA (Fill form / highlight toggle).
2. Wire it via `chrome.sidePanel.open({ windowId: tab.windowId })`.
3. Note that `chrome.sidePanel.open` requires a user gesture and the popup is a user-gesture context, so it works — but the popup closes automatically when the side panel opens, so sequence matters.
4. Add a test case to `tests/entrypoints/popup/OnJobPosting.test.tsx` covering the new button.

The plan says "lines changed ~1400 across entrypoints/sidepanel/**" — adding the popup button is a ~30 LoC addition that should be rolled into this count and into §7 File inventory.

### 1.2 BLOCKER — A5 ProtocolMap does not ship `GENERATION_*` or `DETECTED_JOB_BROADCAST`; A11 mutates it

**Severity**: blocker (blueprint drift + ownership violation)
**Where A11 says it**: §6.3 lines 234-332 — "Extend the messaging protocol... add them to the existing ProtocolMap interface".
**Where A5 contradicts it**: `phase_A5_background_and_messaging/plan.md` §6.3 lines 366-393 lists the FINAL `ProtocolMap` (Auth, Profile, Preferences, `SDK_CALL`, `INTENT_DETECTED`, `INTENT_GET_FOR_TAB`, `FILL_REQUEST`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`). **It does NOT contain `GENERATION_START`, `GENERATION_UPDATE`, `GENERATION_CANCEL`, or `DETECTED_JOB_BROADCAST`.** A5 §5.5 explicitly states: *"A complete ProtocolMap from A5 means A8/A9/A10 can wire content-side and popup-side senders without touching protocol.ts again. One owner of the protocol (bg/messaging/protocol.ts) reduces drift."*

**Impact**: A11 is now the SECOND owner of `protocol.ts`, directly breaching the "one owner" invariant A5 declared. Worse, A5 already registered the dispatch table as `Record<keyof ProtocolMap, HandlerFor<K>>` which is an exhaustive mapped type — adding new keys there triggers a type error until every key has a handler registered. A11's §6.4 registers `handleStart` and `handleCancel` via `onMessage(...)` directly, bypassing the dispatch table A5 wired up in its `HANDLERS` object. This produces **silent drift**: the dispatch table will claim it covers `keyof ProtocolMap` but in fact A11's handlers live outside it, so anyone inspecting A5's `src/background/index.ts` HANDLERS loop will see no trace of generation handling.

**Correct fix**: Two options, both require corrective action:
- (preferred) Move the `GENERATION_*` and `DETECTED_JOB_BROADCAST` protocol keys into **phase A5's plan** as a pre-shipped contract surface. A11 consumes them, never mutates the protocol file.
- (acceptable) Keep A11 as the extender but REGISTER handlers in A5's dispatch table (`src/background/messaging/handlers.ts`), not via raw `onMessage` calls in `src/background/handlers/generation.ts`. A11 then becomes: (a) add 4 protocol keys, (b) add 4 handler entries to the HANDLERS `Record`, (c) implement the 4 handler functions in a new file imported by HANDLERS. Plan text currently does NONE of this — it uses the raw `onMessage` style and leaves the dispatch table out of date.

Either way, `GET_DETECTED_JOB` (used by `useDetectedJob` on line 730) is mentioned as "added to the protocol in A9 OR stubbed here if A9 deferred the bg cache" — A9 is NOT cited in §2 Blocks/depends and there is no guarantee A9 will ship this key. A11 cannot defer ownership of a message key that it depends on. Either define it in A11's protocol extension (step 6.3) or drop the feature and document the empty state.

---

## 2. Missing scope vs review brief (high severity)

### 2.1 HIGH — Workday 4-step wizard traversal is never tested

**Review brief explicitly requires**: *"Workday multi-step wizard (My Info → Experience → Voluntary Disclosures → Review)"* and *"EEO consent-gated voluntary disclosures"*.
**Decision memo §2.6 explicitly requires**: *"Multi-step wizard traversal (My Information → My Experience → Voluntary Disclosures → Review) — user clicks 'Save and Continue' between pages, extension detects new page and scans/fills. NEVER auto-advances."*
**Decision memo §6.1 April 17 deadline requires**: *"On a live Workday posting: multi-step wizard traversal — My Information page fills, user clicks Save-and-Continue, extension detects My Experience page, scans, user clicks Fill, experience fields populate, repeat for Voluntary Disclosures (EEO consent-gated), Review"*.

**What A11 actually ships**:
- §6.17 `scripts/e2e-smoke.md` step 7 "Workday autofill" (line 1470-1477): **tests only the My Information page**. Literally:
  > "Reach the 'My Information' page of the application wizard. Click extension icon → Click 'Fill form' → observe first name, last name, email, phone populated."
- No check of Save-and-Continue detection.
- No My Experience step.
- No Voluntary Disclosures step.
- Zero mention of EEO consent gating.
- §9 pre-demo checklist line 1752 only requires "Workday multi-step wizard fill traverses at least 2 steps (My Information + 1 subsequent step)" — this is weaker than the decision memo's 4-step target (My Info, My Experience, Voluntary Disclosures, Review) and says nothing about EEO consent.
- §6.19 `scripts/record-demo.md` line 1570 ("1:10-1:30 — Navigate to a Workday My Information page → click extension → fill") is single-page only.

**Impact**: The demo artifact produced by this plan will not demonstrate the D3 flip to (b) multi-step wizard that was the 2026-04-11 architectural bet. Michael Lip's March 21 email identified Workday as the hard target; a single-page Workday demo is indistinguishable from the (a) single-page adapter that was explicitly REJECTED on 2026-04-11 per decision memo D3 rationale ("single-page 'just looks like Greenhouse with different selectors'").

**Correct fix**: Add the following to both §6.17 e2e-smoke.md and §9 pre-demo checklist:
- Step 7.1 My Information: fill name/email/phone → click Save-and-Continue.
- Step 7.2 My Experience: wait for new page → extension detects page change → click Fill → experience entries (at least 1 row of work history) populated → click Save-and-Continue.
- Step 7.3 Voluntary Disclosures: wait for new page → extension detects EEO page → **if user has set `eeoConsent: true` in the profile**, fill demographics; if `eeoConsent: false`, skip filling and display a toast "EEO disclosures skipped (consent not granted)" → click Save-and-Continue.
- Step 7.4 Review: wait for summary page → extension does NOT auto-submit (decision memo §6.1 explicit guard) → user reads the summary manually.
- Add a pre-demo checklist item: "Workday Voluntary Disclosures page respects the `eeoConsent` profile flag."
- Add a test fixture under `tests/e2e-smoke/fixtures/` for each of the 4 Workday steps, not just `workday-sample-my-info.html`.

Also: the plan's §6.4 generation handler does not model the "detect new page" behaviour at all. The A8 `content_script_autofill` phase is presumably where the mutation-watcher lives, but A11's §2 Blocks/depends cites A8 only for `FILL_RESULT_BROADCAST`, not for page-transition detection. Either (a) A11 needs to verify A8's mutation-watcher covers Workday SPA page transitions, or (b) A11 needs to add a §6.3a step defining the contract it needs from A8/B9. As written, A11 silently assumes this works.

### 2.2 HIGH — Sign-in flow E2E coverage is shallow

**Review brief**: *"Sign-in flow end-to-end"*.
**What A11 ships**: §6.17 step 2 "Sign in" (lines 1425-1431) is 6 checkboxes:
1. Click Sign in in the popup.
2. OAuth tab opens.
3. Complete SuperTokens login.
4. OAuth tab auto-closes.
5. Popup returns to authed state.
6. Popup shows credit balance.

**Missing**:
- No adversarial test for the case where the `launchWebAuthFlow` redirect URI does NOT match the one registered in the backend bridge endpoint (A2). This is a Day-1 production failure mode per `investigation/26-supertokens-auth-flow.md` and is not covered.
- No test for the refresh flow (access-token expiry mid-session). Decision memo §2.7 step 8 explicitly spec'd this: *"on 401, background calls POST /auth/session/refresh, updates storage, SDK retries once. Single in-flight promise dedup in background module state."* A11 must verify this works at least once in the smoke test — otherwise the demo can succeed on first run and fail on the second run 24 hours later when the access token has expired.
- No test for sign-out (the opposite transition). A10 ships `AUTH_SIGN_OUT` per the protocol map. A11 should verify the side panel returns to the empty state after sign-out.

**Correct fix**: Expand §6.17 step 2 with three new bullets:
- [ ] Sign out from popup → side panel state clears → Generate CV button disabled or gated.
- [ ] Sign in again, wait 61 minutes (or manually clear the access token from `chrome.storage.session.llmc.accessToken`) → click Generate CV → verify refresh fires and generation proceeds without user intervention.
- [ ] Invalid redirect URI test: temporarily modify `wxt.config.ts` to change the extension ID → launchWebAuthFlow should fail gracefully with a toast, not crash the background.

### 2.3 HIGH — "Highlight disabled when signed out" is never verified in E2E

**Review brief**: *"Highlight disabled when signed out"*.
**Decision memo D9 + §2.8**: *"Button disabled when signed out (graceful degradation, not a spinner)"* and *"'Extension can never be a loading spinner when your backend is unreachable.'"*.
**What A11 ships**: §6.17 step 5 "Greenhouse highlight" tests the toggle works when signed in. §9 pre-demo checklist says "Highlight toggle works on at least 1 live posting". Neither tests the disabled-when-signed-out state, which is the Zovo-language-explicit UX contract.

**Correct fix**: Add to §6.17 as a new step 5.1:
- [ ] Sign out.
- [ ] Navigate to a Greenhouse JD page.
- [ ] Click extension icon.
- [ ] Observe "Highlight JD keywords" button renders with reduced opacity, is not clickable, and shows tooltip "Sign in for keyword matching".

This ties back to A10's §6.12 `HighlightToggle.tsx` which already implements the disabled state with `opacity-60` and `title` attribute. A11 just needs to verify it works in the end-to-end context, but as written it does not.

### 2.4 MEDIUM — Highlight toggle is not in the side panel (correct) but the test of it is conflated with popup testing

The plan correctly leaves the highlight toggle in the popup (per decision memo §2.11: *"highlighter toggle is on the popup, NOT the side panel"*). Good — no bug here. However the §6.17 manual checklist interleaves highlight steps with side-panel steps without labelling which surface is under test. Suggest a restructure where §6.17 splits cleanly:
- Steps 1-7: autofill + highlight (popup driven, A8/A9/A10 under test)
- Step 8: side panel + API flow (A11 under test)
The current ordering makes triage hard: "did step 5 Greenhouse highlight fail because of A9 or because A11 broke A10?"

### 2.5 MEDIUM — JSON Resume upload coverage is minimal

**Review brief**: *"JSON Resume upload"*.
**What A11 ships**: §6.17 step 3 "Profile upload" is 5 bullets: open options → upload fixture file → see preview → click Save → close. This tests the happy path only.

**Missing per CLAUDE.md testing rule** (2. Edge Cases PRIMARY):
- [ ] Upload an invalid JSON file (malformed syntax) → options page shows parse error, does not crash.
- [ ] Upload a valid JSON file that fails JSON Resume Zod validation → options page shows schema error with the offending field.
- [ ] Upload a 10MB file → handled within a reasonable time or rejected politely.
- [ ] Upload a file containing `<script>` tags in the summary → no XSS when rendered in the popup preview.
- [ ] Profile with missing EEO consent field → defaults to `false` (NOT silently true; otherwise Workday Voluntary Disclosures will auto-fill when it should not).

This is the hardening boundary per `coding-style.md`: *"Never trust external data. Schema-based at boundaries."* A JSON Resume file is external data. The current smoke test does not probe it adversarially.

---

## 3. Architecture / hex / blueprint drift

### 3.1 MED — SDK client construction pattern: OK, but chrome.alarms minimum period bug

**§6.4 lines 438-441**:
```typescript
chrome.alarms.create(ALARM_PREFIX + req.tabId, {
  periodInMinutes: POLL_INTERVAL_MS / 60000,
  when: Date.now() + POLL_INTERVAL_MS,
});
```

With `POLL_INTERVAL_MS = 2000`, `periodInMinutes = 2000/60000 = 0.0333...`. **Chrome enforces a minimum `periodInMinutes` of 0.5 (30 seconds) in release builds.** The Chrome docs state: *"If delayInMinutes or periodInMinutes is less than this value, the alarm will fire after the minimum period."* So the 2-second polling interval the plan requires is silently clamped to 30 seconds by Chrome in production.

§13 risk A11-R4 says "Polling uses chrome.alarms which is natively designed for SW wake cycles. Tested implicitly by §9 pre-demo checklist." This is wrong on two counts: (a) the 30s clamp means the Generation tab will appear to stall, updating only every 30s instead of every 2s; (b) the "tested implicitly" framing skips the adversarial read entirely.

**Correct fix**: Either
- Reduce expectations in the UI (2000ms was a design choice in §5.2; relaxing to 3000ms is fine but still under Chrome's 30s floor)
- OR use `setInterval` in the background for the duration of the poll loop (Chrome keeps the SW alive while a fetch is in flight and briefly after, so a 3s interval with an anchoring pending fetch-promise is reliable for the ~2min duration of a typical generation)
- OR use a hybrid: `setInterval` for the first 60 seconds (while SW is guaranteed alive after user gesture), then fall back to `chrome.alarms` at the 1-minute mark with period 0.5 (30s).

The decision memo does not prescribe one strategy; the plan silently assumed alarms work at 2s and they do not. Flag this as a blocker for the "real-time polling" UX promised in §5.2.

### 3.2 LOW — `react-markdown` bundle budget concern

§6.13 and §13 risk A11-R2 both acknowledge the bundle size risk. The fallback is "strip react-markdown and use a 30-line plain-text renderer". This is fine. No action required but note that `react-markdown@9` + `remark-parse` + `rehype-react` is ~60KB gzipped on the wire, not the 40KB quoted in §5.5. Recommend the executor measure empirically via `pnpm build` and consult `webpack-bundle-analyzer` or `pnpm dlx source-map-explorer` before shipping.

### 3.3 LOW — `extractArtifacts` has no schema validation

§6.12 lines 1117-1133 `extractArtifacts` uses best-effort key probing:
```typescript
cv: pickString(result, ['cv', 'cvMarkdown', 'resume']),
coverLetter: pickString(result, ['coverLetter', 'cover_letter', 'coverLetterMarkdown']),
coldEmail: pickString(result, ['coldEmail', 'cold_email', 'email']),
```

Per `CLAUDE.md` invariant 3 "Zod Single Source: All API contracts in @repo/shared-types", the `result` shape should be a schema import from `@repo/shared-types` (e.g. `JobHunterResultSchema`), not string-probing. If the shared-types package does not expose this, that is itself a blueprint gap to flag.

The plan's §5 rationale says: *"The backend returns artifacts as an opaque Record<string, unknown>[] per investigation 22 §f — there is NO schema-level guarantee on shape."* If true, that is a bug in the llmconveyors backend, not a reason to ship a best-effort probe in the extension. The corrective plan should EITHER:
- (a) Add a `job-hunter-result.schema.ts` to `libs/shared-types/src/schemas/` (this is a llmconveyors.com repo change, so it would need a new phase — arguably too late for April 17); or
- (b) Document this as a known issue in config.json `flaggedKnownIssues` and add a unit test verifying the probe handles at least 3 observed response shapes.

The plan does neither. Flag as a code-review-on-read drift.

### 3.4 LOW — `interactionType` branch displays string but discards all `interactionData`

§6.11 Generation.tsx line 1003-1006:
```tsx
{status.status === 'awaiting_input' && (
  <div className={styles.notice}>
    Phased gate open ({status.interactionType ?? 'unknown type'}). Continue in the web app.
  </div>
)}
```

The plan says "A11 does NOT implement phased interaction UI (deferred to Month 1)". Fine. But it should link to the web app: the user has to click somewhere, and "Continue in the web app" is a dead-end string. Add an `href={\`https://llmconveyors.com/dashboard/generations/${status.jobId}\`}` at minimum, and a button wrapper so it is clickable. Decision memo §6.2 April 20 nice-to-have does not explicitly ask for this, but "Continue in the web app" text without a link is a UX anti-pattern that Michael will notice.

---

## 4. Testing / hardening / edge cases

### 4.1 MED — Adversarial reading misses on §6.4 `handleStart`

Per `production-hardening.md` adversarial checklist:
- **external calls** — `sdk.agents.run()` returning `null`, `undefined`, throwing with malformed error — A11 handles `!jobId` but NOT the case where `agents.run` returns a promise that rejects with a non-Error value (e.g. `throw 'something'`). The catch block handles it (`err instanceof Error ? err.message : String(err)`) but does not surface the error to the UI beyond a returned `GenerationStartResponse` — the side panel's `DetectedJob.tsx` handleGenerate shows the error in a local `<div>` but does not clear it until the next click. If the user clicks twice, stale error from first click is shown.
- **state mutations** — `handleStart` mutates `activeGenerations.set(req.tabId, entry)` BEFORE awaiting `persistActiveGenerations()`. If persist fails, in-memory state and session storage diverge. Low likelihood but a leak.
- **race conditions** — `handleStart` calls `pollTick(req.tabId)` BEFORE creating the alarm. If pollTick finishes synchronously with a terminal status (e.g. cached 'completed'), it will clear the alarm via `chrome.alarms.clear(ALARM_PREFIX + tabId)` — but the alarm was not created yet, so the clear is a no-op and THEN `handleStart` creates the alarm, leaking it. The alarm would fire 2 seconds later on an entry that is already complete, and `pollTick` would re-poll an already-done job. Wasteful but not fatal. Suggest: move the `chrome.alarms.create` call BEFORE the first `pollTick` invocation.
- **re-entry** — if the user clicks "Generate CV" twice rapidly, `handleStart` runs twice, both overwrite `activeGenerations.get(req.tabId)` but the second `sdk.agents.run` call creates a second orphaned job in the backend that will burn credits with no UI attached. Add a guard: `if (activeGenerations.has(req.tabId)) return { ok: false, error: 'generation already in progress' }`.

### 4.2 MED — `useDetectedJob` hook return value bug in `useEffect`

§6.8 lines 702-755:

```typescript
useEffect(() => {
  let cancelled = false;

  (async () => {
    // ... setup ...
    const unsubscribe = onMessage('DETECTED_JOB_BROADCAST', ({ data }) => {
      // ...
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  })();

  return () => {
    cancelled = true;
  };
}, []);
```

The inner async IIFE's `return` value is never used — React's `useEffect` cleanup function is returned by the callback passed to `useEffect`, which is the OUTER sync function. The outer function's cleanup sets `cancelled = true` but **NEVER calls `unsubscribe()`**. The listener leaks on every side-panel mount/unmount cycle. `useGenerationStatus` has the identical bug at lines 782-809.

**Correct fix**:
```typescript
useEffect(() => {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    if (!tabId || cancelled) return;

    try {
      const cached = await sendMessage('GET_DETECTED_JOB', { tabId });
      if (!cancelled && cached) setJob(cached as DetectedJobBroadcast);
    } catch {
      /* no cache yet */
    }

    if (cancelled) return;
    unsubscribe = onMessage('DETECTED_JOB_BROADCAST', ({ data }) => {
      if (cancelled) return;
      if (data.tabId !== tabId) return;
      setJob(data);
    });
  })();

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}, []);
```

This is a clear bug, not a style nit. Flag as code-review-on-read issue BUG-A11-01.

### 4.3 LOW — `useEffect` dependency array is stale for tab switches

Both hooks use `useEffect(..., [])` — they query the active tab on mount only. If the user switches tabs in the same Chrome window while the side panel stays open (Chrome side panels are per-window, not per-tab), the hook continues to listen on the old `tabId` and shows stale data. At minimum, add a `chrome.tabs.onActivated` listener to re-query on tab changes. The decision memo §5.4 design rationale for per-tab generation state explicitly allows this ("user can close the side panel, let the run finish in the background, and re-open later to see the completed artifacts") but does NOT address in-session tab switching. Flag as an adversarial gap.

### 4.4 LOW — `tests/sidepanel/App.test.tsx` coverage is weak

§6.16 lists 6 test cases but the code block only shows 4, and none of them exercise the `GENERATION_UPDATE` broadcast path. Per `testing.md`: *"Test categories 2 Edge Cases PRIMARY — boundary values, null/undefined/NaN..."*. Missing:
- `GENERATION_UPDATE` with `status: 'processing'` → Generation tab shows spinner + progress bar at correct width.
- `GENERATION_UPDATE` with `status: 'completed'` → Artifacts tab becomes enabled + auto-switches? (probably not, but test current behaviour).
- `GENERATION_UPDATE` with `status: 'failed'` → failedReason is rendered.
- `GENERATION_UPDATE` with `progress: -1` or `progress: 200` → clamped to [0, 100] (the `Math.max(0, Math.min(100, status.progress))` guard in §6.11 is good, but untested).
- `GENERATION_UPDATE` with `usage.creditsUsed: 0` → displayed as "0" not hidden (the current code uses `!== undefined` so 0 is shown — test this explicitly).
- `Artifacts.tsx` `pickString` called with an object containing all-empty strings → falls back to "not generated" (the `v.length > 0` check handles this, untested).
- `downloadAsText` helper → not tested at all; it mutates DOM and the test would need to mock `URL.createObjectURL` and `document.createElement('a')`.

---

## 5. Scope / boundary issues

### 5.1 MED — Plan touches `src/background/index.ts` but §7 File inventory says "3 modified"

§7 lists modified files as: `src/background/messaging/protocol.ts`, `src/background/index.ts`, `entrypoints/popup/App.tsx`, `wxt.config.ts`. That is FOUR, not three. Minor, but the count header in §0 says "1 file modified". Header is stale with respect to §7.

### 5.2 LOW — §0 "Files modified in e:/llmconveyors.com: zero" conflicts with missing schema work

If 3.3 above is actionable (adding `JobHunterResultSchema`), the plan will touch `libs/shared-types/src/schemas/`. Current header declaration rules that out. Either accept the blueprint gap or amend the header.

### 5.3 LOW — `GET_DETECTED_JOB` ownership is orphaned

§6.8 line 730 sends `GET_DETECTED_JOB` which is not defined in A5's protocol, not in A11's §6.3 extension, not in A9 (per the A10 plan's §3 assumed-contract which lists `INTENT_GET`, not `GET_DETECTED_JOB`). The hook wraps the call in try/catch and silently swallows the error, which means **the "Detected Job" tab will always show the empty state until a broadcast fires**, which in practice means the first time the user opens the side panel after a fresh tab load, it will be blank even if A9's intent detector has already run. Poor UX for the demo.

**Correct fix**: Use A5's existing `INTENT_GET_FOR_TAB` (line 385 of A5 plan) which returns `DetectedIntent | null`, then adapt the shape to `DetectedJobBroadcast` in the hook. Alternatively, have the background cache the last `DETECTED_JOB_BROADCAST` per tab and expose a `GET_LAST_DETECTED_JOB` query — but that requires a new handler in A5, which A11 does not own. Use the existing `INTENT_GET_FOR_TAB` path.

---

## 6. Contract vs A10 (popup coordination)

Review brief asks for popup + sidepanel coordination.

| Contract surface | A10 ships | A11 assumes | Status |
|---|---|---|---|
| `FILL_REQUEST` | yes, dispatched from `OnApplicationForm.tsx` | not referenced | OK |
| `HIGHLIGHT_APPLY/CLEAR/STATUS` | yes, in `HighlightToggle.tsx` | not referenced (correct — sidepanel does not own highlight) | OK |
| `CREDITS_GET` | yes, in A10 §6.14 | A11 Generation tab uses `usage.creditsUsed` from the poll, not CREDITS_GET. Inconsistent data source but not broken. | Low-severity drift |
| "Open side panel" button | **NO** | yes | **BLOCKER** (see §1.1) |
| `useDetectedJob` shared hook | A10 has `useIntent` (reads from `llmc.intent.<tabId>.v1` storage key) | A11 builds a separate `useDetectedJob` hook from `DETECTED_JOB_BROADCAST` | Divergent sources |

On the last row: A10 reads intent state from **session storage**, A11 reads from a **broadcast**. These are two different sources of truth for the same information. The plan's §2 Blocks/depends line 94 says: *"The A10 popup has a `useDetectedJob` hook (or equivalent); A11 shares the implementation via `src/shared/hooks/useDetectedJob.ts` so both popup and side panel pull from the same broadcast subscription."* — but A10 actually uses `useIntent` reading from `llmc.intent.<tabId>.v1`, not a broadcast subscription. A11 should align with A10's chosen pattern (storage-backed read) rather than invent a parallel broadcast path.

**Correct fix**: A11 §6.8 `useDetectedJob.ts` should either (a) delegate to `useIntent` from A10's shared-hooks location, or (b) read `chrome.storage.session.get('llmc.intent.' + tabId + '.v1')` on mount and subscribe to `chrome.storage.onChanged` for updates — matching A10's pattern exactly. The `DETECTED_JOB_BROADCAST` key A11 introduces in §6.3 is net-new and duplicative.

---

## 7. Contract vs A5 (messaging)

Already covered in §1.2 (blocker). Additional concerns:

- A5 `ProtocolMap` is mounted on `defineExtensionMessaging<ProtocolMap>()` and exported as `{ sendMessage, onMessage }` from `src/background/messaging/protocol.ts`. A11's code imports `{ onMessage, sendMessage }` directly from `@webext-core/messaging` (line 370 of the plan):
  ```typescript
  import { onMessage, sendMessage } from '@webext-core/messaging';
  ```
  **This is a bug**: A5 §6.3 lines 398-404 explicitly say: *"Single defineExtensionMessaging instance bound to ProtocolMap. Every caller imports sendMessage / onMessage from this module. Callers MUST NOT construct their own defineExtensionMessaging — that would create a separate message namespace and drop messages silently."*

  A11's import bypasses the bound instance. The Sonnet executor will write code that compiles, passes tests with mocked messaging, but silently drops every message at runtime because it is using a different namespace.

  **Correct fix**: Every sidepanel/background file in A11 must import from `src/background/messaging/protocol.ts`:
  ```typescript
  import { onMessage, sendMessage } from '../../src/background/messaging/protocol';
  ```
  Verify this in §6.4, §6.8, §6.9, §6.10, §6.11 — all currently wrong.

This is BUG-A11-02 and is more severe than BUG-A11-01 because it makes the side panel entirely non-functional while appearing to compile cleanly.

---

## 8. Decision memo conformance check

| Decision memo requirement | A11 coverage | Status |
|---|---|---|
| §2.6 "Workday multi-step wizard traversal (My Information → My Experience → Voluntary Disclosures → Review)" | Tests only My Information | **VIOLATED** (§2.1) |
| §6.1 "repeat for Voluntary Disclosures (EEO consent-gated), Review" | Not covered | **VIOLATED** (§2.1) |
| §6.1 "Keyword highlight button disabled with tooltip when signed out" | Not tested in E2E | **VIOLATED** (§2.3) |
| §6.1 "Screen recording of full demo flow saved locally" | Covered in §6.19 | OK |
| §6.2 "Side panel displays a generated CV artifact" | Covered in §6.12 | OK |
| §6.2 "Credit balance displays in popup" | A10 territory, not A11. Plan does not duplicate. | OK (deferred) |
| §2.11 "Side panel: React artifact viewer (CV tab, cover letter tab, email tab)" | Covered in §6.12 — CV, coverLetter, coldEmail sub-tabs | OK |
| §2.8 "Popup toggle state: highlight on / off / signed-out-disabled" | Highlight lives in A10; A11's plan correctly does not duplicate. Signed-out E2E test missing. | Partial |
| §6.3 "Engine bundle size: core < 30KB gzipped, full < 100KB gzipped" | Not A11's concern (engine is Plan B). | OK |
| §4.1 "Apr 17: Internal deadline. Record demo video. Full E2E test." | Covered (§6.19 + §6.17) | OK (but see §2.1 depth concerns) |
| §4.2 Catch-up email template is in decision memo | A11 §10.1 has a NEW Apr 17 status email, decision memo §4.2 was the Apr 11 catch-up email. Both are needed on different days. | OK |

Summary: 3 explicit violations of the decision memo's April 17 must-have checklist, all in the Workday / highlight / E2E area.

---

## 9. Checklist A-F (reviewer protocol)

### A. Blueprint conformance (decision memo + config.json)

- [FAIL] Workday 4-step wizard traversal
- [FAIL] EEO consent gate
- [FAIL] Highlight disabled when signed out (E2E)
- [PASS] Side panel artifact viewer with CV / cover letter / email tabs
- [PASS] Demo recording script
- [PASS] JSON Resume upload (happy path only — see A.5 sub-note)

### B. Contract with neighbours (A5, A10, etc.)

- [FAIL] A10 "Open side panel" button does not exist (§1.1)
- [FAIL] A5 `ProtocolMap` mutation violates single-owner invariant (§1.2)
- [FAIL] A11 imports `@webext-core/messaging` directly instead of the shared bound instance (§7, BUG-A11-02)
- [FAIL] `useDetectedJob` diverges from A10's intent-reading pattern (§6)
- [DEFER] `GET_DETECTED_JOB` message key is orphaned (§5.3)

### C. Testing depth (happy path, edge, adversarial, stress, state machine, integration)

- [PASS] Happy path coverage exists (§6.16)
- [FAIL] Edge case coverage missing: progress clamping, interactionData, empty artifacts, credits=0, markdown XSS, hook leaks
- [FAIL] Adversarial coverage missing: invalid JSON Resume, sign-out during generation, refresh token expiry, rapid double-click on Generate CV, tab switch mid-generation
- [FAIL] Stress coverage missing: 2 concurrent generations on 2 tabs, side panel open on tab A while generation runs on tab B, SW suspend/wake mid-poll
- [PARTIAL] State machine coverage: handleCancel exists, but not tested; `chrome.alarms` clamp bug means the state machine never ticks at 2s in production
- [PARTIAL] Integration: manual checklist in §6.17 is the only integration test; automated harness in §6.18 is marked skippable
- [FAIL] Test file count: ~200 lines of tests for ~900 lines of production code is below the 80% coverage floor in `testing.md`

### D. Hexagonal / architectural boundaries

- [PASS] Side panel never calls SDK directly (§5.3)
- [PASS] Background owns auth + SDK instantiation
- [FAIL] `src/background/handlers/generation.ts` bypasses A5's `HANDLERS` dispatch table
- [PARTIAL] `result` shape handling is best-effort probe, not Zod-validated (§3.3)

### E. Code quality / dead code / stubs

- [FAIL] `useDetectedJob` and `useGenerationStatus` have clean-up bugs (BUG-A11-01)
- [FAIL] `chrome.alarms` clamp will silently break polling (§3.1)
- [FAIL] Race condition in `handleStart` alarm creation order (§4.1)
- [FAIL] No guard against double-click on Generate CV (§4.1)
- [PASS] No explicit `any`, no `@ts-ignore`, no `console.log`
- [PASS] Functions are all under 50 lines
- [PARTIAL] §1.2 introduces dead protocol keys in A5's perspective

### F. Scope / file count / blast radius

- [PASS] File count (~15 new, 3-4 modified) is consistent with "last polish phase" framing
- [FAIL] Plan claims 1 file modified in §0 header, actually modifies 4 (§5.1)
- [FAIL] Plan claims zero touch on `e:/llmconveyors.com` but the §3.3 schema gap argues otherwise
- [PASS] Target directory consistently `e:/job-assistant` (aligned with A5/A10)
- [NOTE] `e:/job-assistant` diverges from decision memo §2.1 which says the repo is `llmconveyors-chrome-extension` — this is a plan-wide issue, not A11-specific, flag separately.

---

## 10. Priority corrections needed for A11

Ranked by severity:

1. **BLOCKER (§7 / BUG-A11-02)** — Fix all sidepanel/background files to import `sendMessage`/`onMessage` from `src/background/messaging/protocol.ts`, not from `@webext-core/messaging`. Without this fix the side panel silently drops every message at runtime.

2. **BLOCKER (§1.1)** — Add an "Open side panel" button to A10's `OnJobPosting.tsx` and `OnApplicationForm.tsx`. Rolled into A11's file inventory (+2 files modified, +~60 LoC, +1 test).

3. **BLOCKER (§1.2)** — Move `GENERATION_*` and `DETECTED_JOB_BROADCAST` protocol keys into A5's plan (preferred) OR register A11's handlers in A5's `HANDLERS` dispatch table. Also drop `GET_DETECTED_JOB` in favour of the existing `INTENT_GET_FOR_TAB`.

4. **HIGH (§2.1)** — Expand §6.17 e2e-smoke.md step 7 to cover all 4 Workday wizard steps including EEO-consent-gated Voluntary Disclosures. Update §9 pre-demo checklist. Update §6.19 record-demo.md to show all 4 steps. Add test fixtures for each step.

5. **HIGH (§2.3)** — Add E2E step for highlight-disabled-when-signed-out. 3 extra checkboxes in §6.17.

6. **HIGH (§2.2)** — Add E2E for sign-out, refresh flow, and invalid redirect URI. 3 extra checkboxes in §6.17.

7. **HIGH (§3.1)** — Fix the `chrome.alarms` 2-second polling bug. Either switch to `setInterval` with SW-keepalive, or accept 30s poll cadence and adjust UX copy.

8. **HIGH (§4.2 / BUG-A11-01)** — Fix the `useEffect` cleanup leak in `useDetectedJob` and `useGenerationStatus`.

9. **MEDIUM (§4.1)** — Fix `handleStart` race conditions (alarm-before-tick, re-entry guard, persist ordering).

10. **MEDIUM (§2.5)** — Expand JSON Resume upload adversarial tests.

11. **MEDIUM (§6)** — Align `useDetectedJob` with A10's intent-reading pattern (session storage + onChanged, not broadcast subscription).

12. **MEDIUM (§4.4)** — Expand test file coverage to include `GENERATION_UPDATE` broadcast path, progress clamping, empty artifacts.

13. **LOW (§3.3)** — Decide on Zod-schematised `result` shape vs best-effort probe. Document in `flaggedKnownIssues`.

14. **LOW (§3.4)** — Make "Continue in web app" a real clickable link with `jobId` deep link.

15. **LOW (§5.1, §5.2)** — Fix file-count math in §0 header.

16. **LOW (§4.3)** — Handle `chrome.tabs.onActivated` for tab switches while side panel is open.

---

## 11. What is good about this plan

To be fair: the plan is extensive, internally consistent in its React/CSS/structure choices, and well-justified in §5 Design rationale. The three-tab side panel layout is correct. The polling-over-SSE call is correct (albeit with the alarms bug). The `react-markdown` choice is correct. The §12 Rollback plan is genuinely useful. §13 Risk register has 8 phase-local risks which is appropriate for the last phase before a hard deadline. The demo script in §6.20 is concise and narrative-first which is exactly what the Zovo call needs.

The architecture of the plan is fine. The execution of the contract work is where it falls short.

---

## 12. Grade justification

**Grade: C+**

Starts at A- for ambition, scope coverage of the side panel, and structural thoughtfulness. Deducts to **B-** for three hard contract violations that would cause the executor to write code that does not run (§1.1, §1.2, §7). Deducts to **C+** for the three high-severity scope gaps against the decision memo (§2.1, §2.2, §2.3), where the single most important feature of the April 17 deliverable — the Workday multi-step wizard demo — is smoke-tested on a single page and never verifies the EEO consent gate that was the reason to flip D3 to (b).

Recoverable with 4-6 hours of corrective planning. Not a rewrite; a targeted patch in the 16 items above. If those are addressed, the plan reaches a solid B+ / A-.
