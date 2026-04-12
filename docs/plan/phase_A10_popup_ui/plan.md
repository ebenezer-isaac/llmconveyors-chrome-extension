# Phase A10 -- Popup UI (React 360x480 + Tailwind v4)

**Plan**: 100-chrome-extension-mvp
**Phase code**: A10
**Plan version**: 2.1 (full rewrite after review grade B-)
**Track**: Extension (Track 3)
**Day**: 6 (2026-04-17)
**Executor context budget**: 64k
**Estimated effort**: 3-4 hours
**Confidence**: 8/10 (was 9/10 pre-review; downgraded because the popup is downstream of the five most-churned phases -- A5, A6, A7, A8, A9 -- and any residual drift in their exports is discovered by A10 on execution morning)

---

## 0. Confidence + scope

**Confidence**: 8/10. Every shape A10 consumes is pinned in the keystone contract `03-keystone-contracts.md` (authoritative) and cross-referenced against A5/A6/A7/A8/A9 plan rewrites. The remaining 2 points of uncertainty come from:

- Residual drift between the A5 plan file (which was written before v2.1 and still contains `INTENT_GET_FOR_TAB`) and the keystone (`INTENT_GET`). **Keystone wins**: the executor uses `INTENT_GET` exclusively.
- The A9 phase lands the `HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR` handlers on the content-script side. A10 assumes A9's content script is present on the target page; if a tab has no content script (non-ATS page), `chrome.tabs.sendMessage` rejects. A10's upstream branch ensures the toggle is only invoked where A9 has registered. Rate-limit errors and network errors are surfaced per A9's discriminated `reason` union.

**Files touched**: 26 files created (12 popup sources + 5 hooks + 1 background handler + 8 test specs), 3 source files modified.
**Lines changed**: approximately 2,150 lines added across popup views, components, hooks, wrappers, styles, and unit tests. No lines deleted outside of the A1 popup placeholder (main.tsx + style.css) and one small handler-registration append in A5's barrel.
**Files modified in `e:/llmconveyors.com`**: zero. This phase operates purely inside the `e:/llmconveyors-chrome-extension` repo.

The file-count count below is authoritative and internally consistent across §0, §5, and §12. Earlier plan versions had an off-by-one between "16 files" in §0 and "17 files" in §5; that defect is resolved by listing every new file in §5 across four sub-tables (§5.1 popup sources = 12; §5.3 hooks = 5; §5.4 bg handler = 1; §5.5 tests = 8; total = 26) and every modified file (main.tsx, style.css, handlers.ts registration -- protocol.ts is NOT modified per D2) in §5.6 with no secondary self-correction.

---

## 1. Goal

Replace the placeholder popup shell from A1 with the complete V1 popup user journey. After this phase, clicking the extension toolbar icon opens a 360 x 480 React popup that:

1. Reads auth state by sending `AUTH_STATUS` to the background (A6 handler). When unauthenticated, renders a single "Sign in with Zovo" button that dispatches `AUTH_SIGN_IN` to the background.
2. Subscribes to `AUTH_STATE_CHANGED` broadcasts (emitted by A6's `broadcaster.ts`) so the view re-renders the instant the background finishes the `launchWebAuthFlow` round-trip.
3. Reads the active tab via `chrome.tabs.query({ active: true, currentWindow: true })`, brands the result as `TabId`, and queries the per-tab `DetectedIntent` snapshot via `INTENT_GET` (A5 ships the bg handler, which reads from an in-memory per-tab Map populated by A9's `INTENT_DETECTED` fire-and-forget).
4. Branches between four top-level views based on `{ auth, intent }`:
   - `SignedOut` -- auth not established. **Crucially**, this view renders a disabled `HighlightToggle` below the sign-in CTA so D9 graceful degradation is reachable in the UI.
   - `NotOnSupportedPage` -- authed, but the active tab has no detected intent or `intent.kind === 'unknown'`.
   - `OnJobPosting` -- authed, `intent.pageKind === 'job-posting'`; shows title/company/ATS label + `HighlightToggle` (enabled).
   - `OnApplicationForm` -- authed, `intent.pageKind === 'application-form'`; shows credit badge, profile-completeness indicator, "Fill form" primary CTA, and fill-result toast. **No** `HighlightToggle` here -- A9 rejects `HIGHLIGHT_APPLY` on application-form pages with `reason: 'not-a-job-posting'`, so showing the toggle would be a UX trap per review §B.2.
5. Dispatches `FILL_REQUEST` (A5 bg handler forwards to A8 content script) with `{ tabId }` when the user clicks "Fill form", tracks a best-effort cross-tab lock in `chrome.storage.session` under `llmc.fillLock.v1`, renders inline toasts for success/partial/failure based on the typed `FillRequestResponse`, and re-enables the button on completion.
6. Dispatches `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` (A9 content-script handlers via A5 bg forwarder) when the user toggles keyword highlighting. On mount the toggle sends `HIGHLIGHT_STATUS` (A5 handler that reads the per-tab map) so it can bootstrap the on/off state when the popup is re-opened on an already-highlighted tab.
7. Per D9 graceful-degradation invariant, the `HighlightToggle` component accepts an explicit `disabled: boolean` prop. The `SignedOut` view renders it with `disabled={true}` and the exact tooltip text `Sign in for keyword matching`. Clicking the disabled toggle is a no-op (no message fires). The prop is wired from the same source of truth (`authed: false`) as the sign-in button, so D9 can never silently disappear.
8. Fetches `CREDITS_GET` (new background handler introduced in this phase) on mount and on `window.focus`. **No 30-second polling interval** -- the popup is transient; per review §E.3 the 30s interval was dead code for the typical session. Focus-driven refresh covers the "user re-focuses the popup after switching tabs" case.
9. Renders a settings cog in the header that opens the options page in a new tab via `chrome.runtime.openOptionsPage()`.
10. Every UI surface is styled via Tailwind v4 per investigation 42 (single-line `@import "tailwindcss";`, `@theme` block, `@custom-variant dark`). No inline styles, no CSS modules, no emojis anywhere.
11. Every diagnostic log in the popup (errors, warnings, non-happy-path info) goes through `createLogger('popup')` from `@/background/log` (D11). There are zero `console.*` calls in new code.
12. Every cross-module dependency is injected via an optional `deps` parameter on each hook (D20). Tests pass fakes; production wires defaults.

**Out of scope (explicitly not in this phase)**:

- Side panel UI -- A11.
- Options page UI -- A7 already owns that surface.
- Background refactors beyond the single `CREDITS_GET` handler wire-up in §6.18.
- Protocol map edits -- per D2, A5 is the single owner of `ProtocolMap`; A10 imports from A5 and mutates nothing.
- SDK client instantiation -- per memo §2.10 decision (a) the extension background worker uses direct `fetch` against `/api/v1/*` with `buildAuthHeaders` from A5. No `@repo/llmconveyors-sdk` imports in extension code.
- Real-time fill progress streaming -- A10 shows one spinner + one toast, not per-field progress.
- Animations beyond the default Tailwind `transition-*` utilities and the single `llmc-shimmer` keyframe used by the credit badge loading state.
- i18n / l10n -- English only for V1 per decision memo §2.6.
- Dark mode toggle in the UI (CSS is wired for `data-theme="dark"`; the toggle itself is A11 polish).

---

## 2. Blocks / depends on

**Depends on** (all must be complete before A10 executes):

- **A1** (WXT scaffold) -- provides `entrypoints/popup/index.html` + `entrypoints/popup/main.tsx` placeholder, Vite + Tailwind v4 wiring per investigation 42, WXT config, `tsconfig.json` path alias `@/*` -> `src/*`.
- **A5** (background + messaging) -- ships the canonical `src/background/messaging/protocol.ts` with all 19 `ProtocolMap` keys per keystone §1.1, the typed `sendMessage` / `onMessage` exports, the `createLogger('popup')` singleton, the `buildAuthHeaders` helper, and real bg handlers for `AUTH_STATUS`, `AUTH_STATE_CHANGED` (broadcast), `PROFILE_GET`, `INTENT_GET`, `HIGHLIGHT_STATUS`, `FILL_REQUEST` (forwarded to content), and `CREDITS_GET` (per the keystone §1.3 "Real handlers" list). A10 is a pure consumer of A5's exports.
- **A6** (auth flow) -- ships `AUTH_SIGN_IN`, `AUTH_SIGN_OUT`, `AUTH_STATE_CHANGED` broadcaster. A10's `useAuthState` hook is the primary consumer.
- **A7** (profile storage + options) -- persists `Profile` to `chrome.storage.local['llmc.profile.v1']` with the v2 nested-basics shape (D3) and ships the `PROFILE_GET` bg handler that runs `readProfile()` (Zod parse + A5-stub migration). A10's `CompletenessIndicator` calls `PROFILE_GET` rather than reading storage directly, so the migration path runs automatically (review §E.5).
- **A8** (content script autofill) -- ships the content-script `FILL_REQUEST` receiver and the `FILL_RESULT_BROADCAST` for post-fill signal. A10's `useFillAction` sends `FILL_REQUEST` to the bg, which forwards to A8's content-script handler and returns the projected `FillRequestResponse` per keystone §1.2.
- **A9** (content script highlight + intent) -- ships the `INTENT_DETECTED` fire-and-forget from content, the content-script handlers for `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR`, and the `detectPageIntent` call on bootstrap. A10 consumes the A5-side query-path (`INTENT_GET`, `HIGHLIGHT_STATUS`) and trusts A9's content-side idempotency.

**Blocks**:

- **A11** (side panel + E2E + demo) -- the end-to-end demo script drives the popup (user clicks "Fill form", watches fields populate, toggles highlight on the JD tab). Without A10, A11 has nothing to record.

**Does NOT block** any phase in the `ats-autofill-engine` or `llmconveyors.com` tracks. All parallel engine work is finished by the time Day 6 begins.

---

## 3. Repo context (read first)

The executor MUST read these files in this exact order before writing any code. All other reads are discouraged -- every decision lives here.

1. `temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - D2 (A5 single-owner protocol), D9 (disabled HighlightToggle), D11 (createLogger), D14 (anti-drift), D15 (em-dashes), D16 (branded TabId/GenerationId), D19 (adversarial tests), D20 (DI), D21 (Zod boundary), D24 (coverage).
2. `temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - §1 ProtocolMap (all 19 keys, value types, handler requirements).
   - §1.1 `INTENT_GET` message key (NOT `INTENT_GET_FOR_TAB` -- the v2.1 keystone shortens the name; if any upstream plan file still says `INTENT_GET_FOR_TAB`, the keystone wins and A10 uses `INTENT_GET`).
   - §1.2 `HighlightApplyResponse` / `HighlightClearResponse` / `HighlightStatus` / `CreditsState` / `FillRequestResponse` / `AuthState` shapes.
   - §2.8 `DetectedIntent` discriminant (`kind: AtsKind | 'unknown'`, `pageKind: 'job-posting' | 'application-form' | null`).
   - §10 per-phase import matrix (row A10).
3. `temp/impl/100-chrome-extension-mvp/reviews/review-A10.md`
   - Every finding A, B, C, D, E, F. Every CRITICAL / HIGH / MEDIUM item below is the corrective answer to a review finding.
4. `temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/plan.md`
   - §6.3 `protocol.ts` shape (post-v2.1 rewrite).
   - §6 `handlers.ts` real-handler table (confirms A5 ships `CREDITS_GET`, `HIGHLIGHT_STATUS`, `INTENT_GET`, `PROFILE_GET` -- A10 does not add these).
   - §log module `createLogger`.
5. `temp/impl/100-chrome-extension-mvp/phase_A6_auth_flow/plan.md`
   - `AUTH_SIGN_IN` / `AUTH_SIGN_OUT` / `AUTH_STATUS` responses.
   - `broadcastAuthStateChanged(state: AuthState)` emits `AUTH_STATE_CHANGED` via `sendMessage`.
6. `temp/impl/100-chrome-extension-mvp/phase_A7_profile_storage_and_options/plan.md`
   - `PROFILE_KEY = 'llmc.profile.v1'` constant (exported from `src/background/profile/storage.ts`).
   - `readProfile()` migrates A5-stub legacy shapes to the B2 `Profile`.
   - `PROFILE_GET` bg handler returns `Profile | null`.
7. `temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`
   - Content-script `FILL_REQUEST` receiver signature.
   - `FillRequestResponse` projection -- A10 reads this per keystone §1.2.
8. `temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md`
   - §6.2 reshaped `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` response envelopes (keystone already embeds the final shape).
   - §6 content-script idempotency (`applyHighlights` second call is a no-op; `HIGHLIGHT_CLEAR` on a tab with no active highlight returns `{ ok: true, cleared: false }`).

Do NOT read the llmconveyors backend source tree or `ats-autofill-engine` internals. Every cross-repo contract is frozen in the keystone.

---

## 4. Working directory

**Absolute repo path**: `e:/llmconveyors-chrome-extension` (per D4; NOT `e:/job-assistant`).

All file paths in this plan are relative to `e:/llmconveyors-chrome-extension` unless prefixed with `e:/llmconveyors.com/` (reference only -- nothing in llmconveyors.com is modified).

Before starting, run from the repo root:

```bash
pnpm install
pnpm wxt prepare
pnpm typecheck
pnpm test --run
```

Expected: clean exit. If any step fails, STOP -- one of A1/A5/A6/A7/A8/A9 left the baseline broken. File a corrective plan against whichever phase is broken; do not proceed with A10.

Verify the critical files from prior phases exist:

```bash
ls src/entrypoints/popup/index.html
ls src/entrypoints/popup/main.tsx
ls src/entrypoints/popup/style.css
ls src/background/messaging/protocol.ts
ls src/background/messaging/handlers.ts
ls src/background/messaging/auth-state.ts
ls src/background/auth/index.ts
ls src/background/auth/build-headers.ts
ls src/background/profile/storage.ts
ls src/background/log.ts
```

Expected: every path resolves. If any are missing, halt and flag the prior phase.

Verify the keystone protocol keys compile into `ProtocolMap`:

```bash
pnpm tsc --noEmit --project tsconfig.json 2>&1 | grep -i "protocolmap"
```

Expected: no output. If the `ProtocolMap` interface complains about missing keys or type errors, the A5 rewrite landed incomplete and must be corrected first.

---

## 5. File inventory (authoritative)

### 5.1 New files in `src/entrypoints/popup/` (12)

| # | File | Purpose | Approx lines |
|---|------|---------|--------------|
| 1 | `src/entrypoints/popup/App.tsx` | Root component; routes between five views (SignedOut, loading, NotOnSupportedPage, OnJobPosting, OnApplicationForm) based on `{auth, intent}` tuple | ~140 |
| 2 | `src/entrypoints/popup/messaging.ts` | Typed barrel re-exporting `sendMessage` / `onMessage` from `@/background/messaging/protocol`, plus value types used by popup views | ~65 |
| 3 | `src/entrypoints/popup/deps.ts` | Default `PopupDeps` factory that wires the chrome / sendMessage / logger singletons. Tests construct with fakes. | ~80 |
| 4 | `src/entrypoints/popup/views/SignedOut.tsx` | Unauthenticated landing -- sign-in CTA + disabled `HighlightToggle` preview for D9 graceful degradation | ~110 |
| 5 | `src/entrypoints/popup/views/NotOnSupportedPage.tsx` | Authed but intent is null or unknown; lists ATS examples | ~95 |
| 6 | `src/entrypoints/popup/views/OnJobPosting.tsx` | Authed + `pageKind === 'job-posting'`; title/company/ATS label + enabled `HighlightToggle` | ~120 |
| 7 | `src/entrypoints/popup/views/OnApplicationForm.tsx` | Authed + `pageKind === 'application-form'`; credit badge, completeness, fill button, toast (NO HighlightToggle per review §B.2) | ~170 |
| 8 | `src/entrypoints/popup/components/Header.tsx` | Brand mark + settings cog | ~100 |
| 9 | `src/entrypoints/popup/components/CreditBadge.tsx` | Credit balance pill (loading/ready/error) | ~95 |
| 10 | `src/entrypoints/popup/components/ActionButton.tsx` | Primary CTA with idle/busy/success/error states + inline SVG spinner | ~130 |
| 11 | `src/entrypoints/popup/components/HighlightToggle.tsx` | Bistate toggle; accepts `disabled` prop; consumes A9's response envelope on `keywordCount` + discriminated `reason` on error | ~200 |
| 12 | `src/entrypoints/popup/components/CompletenessIndicator.tsx` | Profile completeness bar via `PROFILE_GET` message (not direct storage read) | ~140 |

### 5.2 Toast handling note

Header, CreditBadge, ActionButton, HighlightToggle, and CompletenessIndicator are all counted in §5.1 rows 8-12. There is no separate `Toast.tsx` component: the toast is inlined into `OnApplicationForm.tsx` as a render-local block because it is used in exactly one view. Promoting it to a shared component is A11 work if the sidepanel needs it.

### 5.3 Hooks (5 new files)

| # | File | Purpose | Approx lines |
|---|------|---------|--------------|
| 13 | `src/entrypoints/popup/hooks/useAuthState.ts` | Primes from `AUTH_STATUS`, subscribes to `AUTH_STATE_CHANGED` broadcast; optional `deps: HookDeps` for DI | ~115 |
| 14 | `src/entrypoints/popup/hooks/useActiveTab.ts` | `chrome.tabs.query` + `chrome.tabs.onUpdated` wrapper; returns branded `TabId` | ~95 |
| 15 | `src/entrypoints/popup/hooks/useDetectedIntent.ts` | Sends `INTENT_GET` on mount, subscribes to refreshes via `chrome.runtime.onMessage` for `DETECTED_JOB_BROADCAST` | ~130 |
| 16 | `src/entrypoints/popup/hooks/useCredits.ts` | `CREDITS_GET` on mount + on `window.focus`; no interval polling | ~95 |
| 17 | `src/entrypoints/popup/hooks/useFillAction.ts` | Best-effort cross-tab lock + dispatch + FillResultBroadcast listener + projected result; stale-reply guard | ~180 |

### 5.4 Background handler (1 new file)

| # | File | Purpose | Approx lines |
|---|------|---------|--------------|
| 18 | `src/background/credits/get-credits-state.ts` | Real handler for `CREDITS_GET`: direct `fetch` to `/api/v1/settings/profile` and `/api/v1/settings/usage-summary` with `buildAuthHeaders` (NOT SDK per memo §2.10) | ~130 |

### 5.5 Test files in `tests/entrypoints/popup/` (8 new)

| # | File | Purpose | Approx lines |
|---|------|---------|--------------|
| 19 | `tests/entrypoints/popup/App.test.tsx` | Full routing matrix: signedOut, notSupported, jobPosting, applicationForm, loading | ~220 |
| 20 | `tests/entrypoints/popup/SignedOut.test.tsx` | Disabled HighlightToggle present with exact tooltip; sign-in dispatch path | ~120 |
| 21 | `tests/entrypoints/popup/CreditBadge.test.tsx` | States: loading, ready (number + k suffix), error | ~100 |
| 22 | `tests/entrypoints/popup/ActionButton.test.tsx` | Idle -> busy -> success/error flow; disabled prop | ~110 |
| 23 | `tests/entrypoints/popup/HighlightToggle.test.tsx` | Mount status bootstrap, apply/clear happy path (`keywordCount`), every `reason` branch, popup-closes-before-resolve stale guard, concurrent-click debounce | ~280 |
| 24 | `tests/entrypoints/popup/useFillAction.test.tsx` | Lock acquire/release, stale lock, lockedByOtherTab, projection of every `FillRequestResponse` reason | ~200 |
| 25 | `tests/entrypoints/popup/useAuthState.test.tsx` | Prime, broadcast update, cancel mid-flow, unsubscribe on unmount | ~130 |
| 26 | `tests/entrypoints/popup/useDetectedIntent.test.tsx` | INTENT_GET resolve, intent-change while open, null tabId branch | ~120 |

Test total: approximately 1,280 lines across 8 files. All use `happy-dom` + `@testing-library/react` which A1 installs.

### 5.6 Modified files (3)

| # | File | Change | Approx lines |
|---|------|--------|--------------|
| M1 | `src/entrypoints/popup/main.tsx` | Replace A1 placeholder `<App />` with the real root; preserve `createRoot` + `StrictMode`; import `./style.css` | +12 / -10 |
| M2 | `src/entrypoints/popup/style.css` | Replace A1 placeholder with final Tailwind v4 entry: `@import "tailwindcss";` + `@custom-variant dark` + `@theme` brand tokens + `html, body { width: 360px; min-height: 480px; }` + `.llmc-shimmer` keyframe | +70 / -12 |
| M3 | `src/background/messaging/handlers.ts` | Register the existing-in-protocol `CREDITS_GET` key with the `getCreditsState` impl. Per D2, `protocol.ts` is NOT modified -- A5 already declared `CREDITS_GET` in its ProtocolMap; A10 only supplies the handler body and wires it into the `HANDLERS` record. | +8 / -0 |

**Not touched**:
- `src/background/messaging/protocol.ts` -- D2 invariant, A5 is the single owner. Even `CREDITS_GET`, `HIGHLIGHT_STATUS`, `INTENT_GET` are declared by A5 per keystone §1.3.
- Any file under `entrypoints/options/` -- A7 owns that tree.
- Any file under `entrypoints/ats.content/` -- A8 / A9 own that tree.
- Any file under `src/background/auth/` -- A6 owns that tree; A10 consumes only the barrel exports.
- `wxt.config.ts` -- no new permissions or host permissions. A1 already declared `identity`, `storage`, `activeTab`, `scripting`, `tabs`.

---

## 6. Step-by-step execution

### 6.1 Prerequisite verification

Run from `e:/llmconveyors-chrome-extension`:

```bash
pnpm install
pnpm wxt prepare
pnpm typecheck
pnpm lint
pnpm test --run
```

Expected: all clean. If `pnpm test` has zero files (some prior phases may have lacked test discovery), that is fine -- A10 adds its own.

Confirm the A5 protocol exports compile:

```bash
pnpm tsc --noEmit 2>&1 | tee /tmp/typecheck.log
grep -i "INTENT_GET\b" src/background/messaging/protocol.ts
grep -i "HIGHLIGHT_STATUS\b" src/background/messaging/protocol.ts
grep -i "CREDITS_GET\b" src/background/messaging/protocol.ts
grep -i "DETECTED_JOB_BROADCAST\b" src/background/messaging/protocol.ts
```

Expected: every grep returns at least one match. If any returns zero, STOP -- A5 is drifting from the keystone. File a corrective plan against A5 before touching A10.

### 6.2 `src/entrypoints/popup/style.css` -- Tailwind v4 entry (modified)

Overwrite the file entirely. A1's placeholder has nothing worth preserving.

```css
/*
 * Popup stylesheet - loads the full Tailwind v4 utility set, defines the
 * Zovo-placeholder brand tokens, overrides the dark variant to a
 * data-theme selector per investigation 42 section 6, and pins the
 * popup viewport to 360 x 480.
 *
 * Reference: investigation/42-tailwind-v4-wxt.md sections 3, 5, 6, 9.
 */

@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  --color-brand-50:  oklch(0.975 0.013 265);
  --color-brand-100: oklch(0.95  0.025 265);
  --color-brand-200: oklch(0.9   0.05  265);
  --color-brand-400: oklch(0.7   0.15  265);
  --color-brand-500: oklch(0.62  0.18  265);
  --color-brand-600: oklch(0.55  0.2   265);
  --color-brand-700: oklch(0.48  0.17  265);
  --color-brand-900: oklch(0.3   0.1   265);

  --font-display: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius-card: 0.75rem;
  --radius-pill: 9999px;
}

html, body {
  width: 360px;
  min-height: 480px;
  margin: 0;
  padding: 0;
  background-color: white;
  color: oklch(0.25 0.02 265);
  font-family: var(--font-display);
  font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased;
}

html[data-theme="dark"],
html[data-theme="dark"] body {
  background-color: oklch(0.18 0.02 265);
  color: oklch(0.95 0.01 265);
}

.llmc-shimmer {
  background: linear-gradient(
    90deg,
    transparent,
    oklch(0.95 0.01 265 / 0.8),
    transparent
  );
  background-size: 200% 100%;
  animation: llmc-shimmer 1.4s ease-in-out infinite;
}

@keyframes llmc-shimmer {
  0%   { background-position: -150% 0; }
  100% { background-position: 150%  0; }
}
```

Rationale:
- Single-line `@import` per investigation 42 section 3. No triple-directive, no `tailwind.config.js`.
- `@theme` block exposes `--color-brand-*` so `bg-brand-600`, `text-brand-500`, etc. work at build time.
- `@custom-variant dark` binds `dark:` prefix to `data-theme="dark"`; no live dark mode toggle in V1, but the CSS is wired for A11.
- Pinning `width: 360px` + `min-height: 480px` on both `html` and `body` is the clean way to size a Chrome popup; Chrome computes the frame from the root element's computed size.
- `.llmc-shimmer` is the one custom class the popup needs -- credit badge loading state. Lives here because it needs a keyframe animation which Tailwind v4 does not generate for arbitrary gradient animations.

### 6.3 `src/entrypoints/popup/main.tsx` -- bootstrap (modified)

Replace the A1 placeholder entirely.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './style.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('popup root container missing');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Rationale: StrictMode stays on -- popup is trivial enough that double-invocation in dev does not surface any issues, and it catches effect-cleanup bugs. No ErrorBoundary at this level; review §E.10 accepts this as POC tradeoff.

### 6.4 `src/entrypoints/popup/messaging.ts` -- typed barrel (new)

Per D2 consumer pattern: popup imports `sendMessage` and `onMessage` from A5's `@/background/messaging/protocol` barrel. Does NOT re-implement the protocol.

```ts
/**
 * Typed messaging client for the popup.
 *
 * This is a thin re-export of @/background/messaging/protocol so every popup
 * view, component, and hook imports from '../messaging' instead of reaching
 * into the background tree. The value types (AuthState, DetectedIntent,
 * CreditsState, HighlightStatus, HighlightApplyResponse, HighlightClearResponse,
 * FillRequestResponse) are sourced from the same barrel to prevent drift.
 *
 * Per D2: A5 is the single owner of ProtocolMap. Do NOT add new keys here.
 * If a key is missing, the fix lives in A5 and blocks the orchestrator.
 */

export {
  sendMessage,
  onMessage,
} from '@/background/messaging/protocol';

export type {
  ProtocolMap,
  AuthState,
  DetectedIntent,
  DetectedIntentPayload,
  CreditsState,
  HighlightStatus,
  HighlightApplyResponse,
  HighlightClearResponse,
  FillRequestResponse,
  GenerationUpdateBroadcast,
} from '@/background/messaging/protocol';

// Branded IDs come from the engine core via the A5 re-export chain. They
// are nominal types, so the popup must use the branded constructors
// (TabId(rawNumber), GenerationId(rawString)) at the boundaries where we
// first receive a raw chrome.tabs.Tab.id or runtime-assigned string.
export { TabId, GenerationId } from 'ats-autofill-engine';
export type { TabId as TabIdType, GenerationId as GenerationIdType } from 'ats-autofill-engine';
```

Points:
- The re-export pattern keeps every popup file with a short, stable import path (`'../messaging'`).
- If A5's module layout changes, the executor edits this one file instead of every view.
- Branded types come from the engine barrel per keystone §10. The `TabId` and `GenerationId` factories are the only way to construct them safely in popup code.
- **There is no re-export of `PROFILE_KEY`** -- A10 never reads `chrome.storage.local` directly for the profile (review §E.5). Use `PROFILE_GET` message.

### 6.5 `src/entrypoints/popup/deps.ts` -- DI defaults (new)

Per D20, every hook accepts an optional `deps` parameter for testability. `deps.ts` exports the canonical production values plus a `PopupDeps` type.

```ts
/**
 * PopupDeps - dependency injection boundary for the popup layer.
 *
 * Every hook that would otherwise reach for chrome.*, window.*, or Date.now
 * receives these dependencies so tests can pass fakes. Production wires the
 * real globals here in one place.
 *
 * Per D20 (decision memo section 2, D20): no module-level singleton imports
 * across module boundaries in the extension. The hooks consume this struct
 * via an optional deps argument.
 */
import { createLogger, type Logger } from '@/background/log';
import { sendMessage, onMessage } from '@/background/messaging/protocol';

export interface PopupDeps {
  readonly sendMessage: typeof sendMessage;
  readonly onMessage: typeof onMessage;
  readonly chrome: typeof chrome;
  readonly now: () => number;
  readonly logger: Logger;
  readonly window: Window;
}

export function createDefaultPopupDeps(): PopupDeps {
  return {
    sendMessage,
    onMessage,
    chrome: globalThis.chrome,
    now: () => Date.now(),
    logger: createLogger('popup'),
    window: globalThis.window,
  };
}
```

Points:
- `chrome` is typed as `typeof chrome` from the `@types/chrome` package; tests inject a partial mock that `as unknown as typeof chrome` asserts down to the needed surface.
- `now` is separate so fake-timer tests can inject a monotonic fake clock.
- `logger` is scoped to `'popup'` so every log line carries the prefix `[llmc-ext:popup]` per D11.
- `window` is injected so test can pass a `happy-dom` window.

### 6.6 `src/entrypoints/popup/App.tsx` -- root routing (new)

Full implementation. Approximately 140 lines.

```tsx
/**
 * Popup root.
 *
 * Contract (from phase A10 plan section 1):
 *   - Reads auth state via useAuthState (primes from AUTH_STATUS, subscribes
 *     to AUTH_STATE_CHANGED).
 *   - Reads active tab and per-tab DetectedIntent via useActiveTab and
 *     useDetectedIntent.
 *   - Renders one of five views:
 *       loading             - hooks not yet resolved
 *       SignedOut           - authed === false
 *       NotOnSupportedPage  - authed === true and intent null or kind === 'unknown'
 *       OnJobPosting        - authed === true and intent.pageKind === 'job-posting'
 *       OnApplicationForm   - authed === true and intent.pageKind === 'application-form'
 *
 * The component holds zero durable state. Everything rendered comes from hooks.
 *
 * Per D20: App accepts optional `deps` for testability. Default wires
 * createDefaultPopupDeps() which is the production boundary.
 */
import React, { useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { SignedOut } from './views/SignedOut';
import { NotOnSupportedPage } from './views/NotOnSupportedPage';
import { OnJobPosting } from './views/OnJobPosting';
import { OnApplicationForm } from './views/OnApplicationForm';
import { useAuthState } from './hooks/useAuthState';
import { useActiveTab } from './hooks/useActiveTab';
import { useDetectedIntent } from './hooks/useDetectedIntent';
import { createDefaultPopupDeps, type PopupDeps } from './deps';
import type { TabIdType } from './messaging';

interface AppProps {
  readonly deps?: PopupDeps;
}

export function App({ deps: depsOverride }: AppProps = {}): React.ReactElement {
  const deps = useMemo(() => depsOverride ?? createDefaultPopupDeps(), [depsOverride]);
  const auth = useAuthState(deps);
  const tab = useActiveTab(deps);
  const intent = useDetectedIntent(tab.tabId, deps);

  const openOptions = useCallback(() => {
    deps.chrome.runtime.openOptionsPage();
  }, [deps]);

  // Loading: hooks have not resolved yet - render a minimal scaffold.
  if (auth.status === 'loading' || tab.status === 'loading') {
    return (
      <div className="flex h-[480px] w-[360px] flex-col">
        <Header authed={false} onOpenOptions={openOptions} />
        <div
          className="flex-1 flex items-center justify-center text-sm text-zinc-500"
          role="status"
          aria-live="polite"
        >
          Loading
        </div>
      </div>
    );
  }

  // Unauthenticated branch. SignedOut renders the sign-in CTA AND the
  // disabled HighlightToggle preview for D9 graceful degradation.
  if (!auth.authed) {
    return (
      <div className="flex h-[480px] w-[360px] flex-col">
        <Header authed={false} onOpenOptions={openOptions} />
        <SignedOut deps={deps} tabId={tab.tabId} />
      </div>
    );
  }

  // Authed from here onward.
  //
  // Intent routing per keystone section 2.8:
  //   - intent === null        -> NotOnSupportedPage (no A9 detection yet)
  //   - intent.kind === 'unknown' -> NotOnSupportedPage
  //   - intent.pageKind === 'job-posting'     -> OnJobPosting (highlight enabled)
  //   - intent.pageKind === 'application-form' -> OnApplicationForm (fill enabled)
  //   - (any other combination is 'unknown' by construction)
  if (intent === null || intent.kind === 'unknown') {
    return (
      <div className="flex h-[480px] w-[360px] flex-col">
        <Header authed onOpenOptions={openOptions} />
        <NotOnSupportedPage activeUrl={tab.url} />
      </div>
    );
  }

  if (intent.pageKind === 'job-posting') {
    return (
      <div className="flex h-[480px] w-[360px] flex-col">
        <Header authed onOpenOptions={openOptions} />
        <OnJobPosting intent={intent} tabId={tab.tabId} deps={deps} />
      </div>
    );
  }

  if (intent.pageKind === 'application-form') {
    return (
      <div className="flex h-[480px] w-[360px] flex-col">
        <Header authed onOpenOptions={openOptions} />
        <OnApplicationForm intent={intent} tabId={tab.tabId} deps={deps} />
      </div>
    );
  }

  // Fallback: intent is a recognized ATS kind but pageKind is null or an
  // unrecognized literal. Treat as "not yet ready" rather than error.
  return (
    <div className="flex h-[480px] w-[360px] flex-col">
      <Header authed onOpenOptions={openOptions} />
      <NotOnSupportedPage activeUrl={tab.url} />
    </div>
  );
}
```

Key points:
- **Zero React Router**. The "routing" is an if ladder driven by hook return values.
- **Branches on `intent.pageKind`, not `intent.kind`** (review §B.1 fix). `intent.kind` carries the ATS identifier (`'greenhouse'` / `'lever'` / `'workday'` / `'unknown'`); `intent.pageKind` carries the semantic distinction (`'job-posting'` / `'application-form'` / `null`).
- `intent === null` is a legitimate first-class state meaning "the content script never fired INTENT_DETECTED for this tab". It routes to `NotOnSupportedPage`, the same as `kind === 'unknown'`.
- The final fallback handles the logically-possible but empirically-rare case where `intent.kind` is an ATS value but `pageKind` is `null` -- A9's content script may write that during a brief transition when it detects the host is GH but has not yet classified the page. Defensive default: show `NotOnSupportedPage`.
- `deps` is threaded to every child that needs it (`SignedOut`, `OnJobPosting`, `OnApplicationForm`). Children that do not call hooks (`NotOnSupportedPage`) do not receive `deps`.
- `openOptions` is a stable callback via `useCallback` so `Header` does not re-render on every App render.
- **No exhaustiveness `_exhaustive: never` throw** -- the `DetectedIntent` discriminant per keystone §2.8 has multiple legitimate shapes (`pageKind` can be null, `kind` can be one of four values) so a true never-narrow is not reachable; the defensive default branch handles the fallthrough.

### 6.7 `src/entrypoints/popup/views/SignedOut.tsx` (new)

Per D9 graceful degradation: this view renders the sign-in CTA AND a disabled `HighlightToggle` with the exact tooltip `Sign in for keyword matching`. Approximately 110 lines.

```tsx
/**
 * SignedOut view.
 *
 * Shown when AUTH_STATUS returns { authed: false }.
 *
 * UI:
 *   1. Brand title
 *   2. Primary CTA "Sign in with Zovo" dispatching AUTH_SIGN_IN to the bg.
 *   3. Inline error if the sign-in rejected.
 *   4. D9 graceful-degradation affordance: a disabled HighlightToggle
 *      below the CTA with the EXACT tooltip "Sign in for keyword matching".
 *      Clicking it is a no-op (the toggle's internal handler early-returns
 *      when disabled). This keeps the D9 invariant visible in the UI and
 *      reachable by adversarial tests.
 */
import React, { useState, useCallback } from 'react';
import { HighlightToggle } from '../components/HighlightToggle';
import type { PopupDeps } from '../deps';
import type { TabIdType } from '../messaging';

interface SignedOutProps {
  readonly deps: PopupDeps;
  readonly tabId: TabIdType;
}

export function SignedOut({ deps, tabId }: SignedOutProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const state = await deps.sendMessage('AUTH_SIGN_IN', undefined);
      if (!state.authed) {
        // AuthState shape per keystone section 1.2: the unauthed variant
        // has no reason field. A6's rejection path throws instead, so a
        // returned authed:false without a thrown error is unusual; surface
        // a generic message.
        setError('Sign in did not complete');
      }
      // Success: AUTH_STATE_CHANGED broadcast drives the App re-render via
      // useAuthState. The popup will re-render into the authed branch.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      deps.logger.warn('sign-in dispatch failed', { message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [deps]);

  return (
    <div className="flex-1 flex flex-col items-center gap-4 px-6 pt-6 text-center">
      <h1 className="text-2xl font-semibold text-brand-600">LLM Conveyors</h1>
      <p className="text-sm text-zinc-600">
        Autofill Greenhouse, Lever, and Workday applications in one click.
      </p>
      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={busy}
        className="w-full rounded-pill bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Opening sign-in window' : 'Sign in with Zovo'}
      </button>
      {error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      {/*
        D9 graceful-degradation: the HighlightToggle is rendered disabled
        with the exact tooltip text "Sign in for keyword matching" per the
        task directive. The disabled state is both visually muted (opacity)
        and functionally inert (onClick early-returns). A dedicated
        adversarial test asserts presence and inertness.
      */}
      <div className="mt-2 w-full opacity-60" aria-hidden={false}>
        <HighlightToggle
          tabId={tabId}
          deps={deps}
          disabled={true}
          disabledTooltip="Sign in for keyword matching"
        />
      </div>
    </div>
  );
}
```

Points:
- The tooltip text is the exact string from the task directive / review §C.2: `Sign in for keyword matching`.
- The toggle is visually muted via the parent `div`'s `opacity-60` (Tailwind v4 utility) in addition to the toggle's own internal `disabled` styling. Double muting is intentional: the parent opacity signals "this whole region is not actionable right now" while the internal styling ensures screen readers announce the disabled state on the switch itself.
- `aria-hidden` is NOT set to true, because the toggle must be discoverable by assistive tech -- the tooltip is the only way a screen reader user learns that sign-in unlocks keyword highlighting. D9 is an accessibility feature, not a cosmetic one.
- The disabled-click contract is enforced inside `HighlightToggle` itself (§6.12 below): when `disabled === true`, the click handler early-returns before any `sendMessage` call. The parent does not need to wrap `onClick`.

### 6.8 `src/entrypoints/popup/views/NotOnSupportedPage.tsx` (new)

Authed but no supported intent. Approximately 95 lines.

```tsx
/**
 * NotOnSupportedPage view.
 *
 * Shown when authed === true and one of:
 *   - useDetectedIntent returns null (no INTENT_DETECTED fired for this tab)
 *   - intent.kind === 'unknown' (A9 content script ran detectPageIntent and
 *     the active tab did not match any ATS URL pattern)
 *
 * Pure presentational: lists supported ATS examples and shows the current
 * URL at the bottom for debug visibility.
 */
import React from 'react';

interface NotOnSupportedPageProps {
  readonly activeUrl: string;
}

const supportedExamples = [
  { label: 'Greenhouse', url: 'https://boards.greenhouse.io/...' },
  { label: 'Lever',      url: 'https://jobs.lever.co/...' },
  { label: 'Workday',    url: 'https://*.myworkdayjobs.com/...' },
];

export function NotOnSupportedPage({ activeUrl }: NotOnSupportedPageProps): React.ReactElement {
  return (
    <div className="flex-1 flex flex-col gap-3 px-5 py-4">
      <h2 className="text-base font-semibold text-zinc-900">
        No supported job site detected
      </h2>
      <p className="text-xs text-zinc-600">
        Open a job posting or application form on one of these sites to
        unlock autofill and keyword highlight:
      </p>
      <ul className="flex flex-col gap-2">
        {supportedExamples.map((ex) => (
          <li
            key={ex.label}
            className="rounded-card border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
          >
            <span className="font-medium text-zinc-900">{ex.label}</span>
            <span className="ml-2 text-zinc-500">{ex.url}</span>
          </li>
        ))}
      </ul>
      <p
        className="mt-auto truncate text-[10px] text-zinc-400"
        title={activeUrl}
      >
        Current: {activeUrl || '(no URL)'}
      </p>
    </div>
  );
}
```

Points:
- Pure presentational; no hooks, no side effects, no deps.
- The list is hardcoded. A9 is the source of truth for intent detection; the popup does not re-derive whether a URL is supported.
- The "Current:" line uses `title={activeUrl}` so hovering reveals the full URL even when truncated.

### 6.9 `src/entrypoints/popup/views/OnJobPosting.tsx` (new)

Authed and `intent.pageKind === 'job-posting'`. Shows the detected job info + enabled `HighlightToggle`. Approximately 120 lines.

```tsx
/**
 * OnJobPosting view.
 *
 * Authed + A9 detected a job-posting pageKind on the active tab.
 * Shows: detected title, company, ATS label, and an enabled HighlightToggle.
 * No Fill button on this view - application forms are mutually exclusive
 * with job postings per A9's classifier.
 */
import React from 'react';
import { HighlightToggle } from '../components/HighlightToggle';
import type { DetectedIntent } from '../messaging';
import type { TabIdType } from '../messaging';
import type { PopupDeps } from '../deps';

interface OnJobPostingProps {
  readonly intent: DetectedIntent;
  readonly tabId: TabIdType;
  readonly deps: PopupDeps;
}

export function OnJobPosting({ intent, tabId, deps }: OnJobPostingProps): React.ReactElement {
  // intent.kind is an AtsKind here because pageKind === 'job-posting'
  // narrows out the 'unknown' branch by the App.tsx router. Read the
  // ATS label from intent.kind defensively.
  const atsLabel = labelForAts(intent.kind);

  return (
    <div className="flex-1 flex flex-col gap-4 px-5 py-4">
      <section className="rounded-card border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-[10px] font-medium uppercase tracking-wider text-brand-600">
          {atsLabel} job posting
        </p>
        <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900">
          {intent.jobTitle ?? 'Untitled role'}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-600">
          {intent.company ?? 'Unknown company'}
        </p>
      </section>

      <HighlightToggle tabId={tabId} deps={deps} disabled={false} />

      <p className="mt-auto rounded-card bg-brand-50 px-3 py-2 text-xs text-brand-700">
        Click "Apply" on this page to unlock autofill on the application form.
      </p>
    </div>
  );
}

function labelForAts(kind: DetectedIntent['kind']): string {
  if (kind === 'greenhouse') return 'Greenhouse';
  if (kind === 'lever') return 'Lever';
  if (kind === 'workday') return 'Workday';
  return 'Supported site';
}
```

Points:
- Reads `intent.jobTitle` (per keystone §2.8) -- NOT `intent.title`. Review §E.7 fix.
- Reads `intent.kind` as the ATS identifier (per keystone §2.8). Review §E.7 fix.
- `HighlightToggle` receives `disabled={false}` explicitly so the prop is never ambiguous. No default arg -- the component requires callers to declare intent.
- No fill button here -- A8 only runs on application-form pages.

### 6.10 `src/entrypoints/popup/views/OnApplicationForm.tsx` (new)

Authed + `intent.pageKind === 'application-form'`. Shows credit badge, completeness, fill button, toast. **Does NOT render `HighlightToggle`** per review §B.2. Approximately 170 lines.

```tsx
/**
 * OnApplicationForm view - the primary V1 surface.
 *
 * Authed + A9 flagged the active tab as an ATS application form. User
 * actions:
 *
 *   1. See credit balance (CreditBadge).
 *   2. See profile completeness; optionally open the options page to fill gaps.
 *   3. Click "Fill form" - dispatches FILL_REQUEST, waits for FillRequestResponse,
 *      renders a toast.
 *
 * Per review section B.2: HighlightToggle is NOT rendered here because A9
 * rejects HIGHLIGHT_APPLY on application-form pages (reason: 'not-a-job-posting')
 * and showing a button that always errors is a UX trap.
 */
import React, { useCallback, useState, useEffect } from 'react';
import { CreditBadge } from '../components/CreditBadge';
import { ActionButton } from '../components/ActionButton';
import { CompletenessIndicator } from '../components/CompletenessIndicator';
import { useCredits } from '../hooks/useCredits';
import { useFillAction } from '../hooks/useFillAction';
import type { DetectedIntent, FillRequestResponse } from '../messaging';
import type { TabIdType } from '../messaging';
import type { PopupDeps } from '../deps';

interface OnApplicationFormProps {
  readonly intent: DetectedIntent;
  readonly tabId: TabIdType;
  readonly deps: PopupDeps;
}

interface ToastState {
  readonly level: 'success' | 'error' | 'info';
  readonly text: string;
}

const TOAST_AUTO_DISMISS_MS = 4000;

export function OnApplicationForm({
  intent,
  tabId,
  deps,
}: OnApplicationFormProps): React.ReactElement {
  const credits = useCredits(deps);
  const fill = useFillAction({ tabId, deps });
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = deps.window.setTimeout(() => setToast(null), TOAST_AUTO_DISMISS_MS);
    return () => deps.window.clearTimeout(timer);
  }, [toast, deps]);

  const handleFill = useCallback(async () => {
    const result = await fill.run();
    if (result.kind === 'ok') {
      setToast({
        level: 'success',
        text: `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}`,
      });
      return;
    }
    if (result.kind === 'partial') {
      setToast({
        level: 'info',
        text: `Filled ${result.filled}, ${result.failed} failed`,
      });
      return;
    }
    setToast({
      level: 'error',
      text: mapErrorToMessage(result.reason),
    });
  }, [fill]);

  return (
    <div className="flex-1 flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-brand-600">
          {labelForAts(intent.kind)} application
        </p>
        <CreditBadge state={credits} />
      </div>

      <section className="rounded-card border border-zinc-200 bg-white p-3 shadow-sm">
        <h2 className="line-clamp-2 text-sm font-semibold text-zinc-900">
          {intent.jobTitle ?? 'Application form'}
        </h2>
        {intent.company !== undefined && (
          <p className="mt-0.5 text-xs text-zinc-600">{intent.company}</p>
        )}
      </section>

      <CompletenessIndicator deps={deps} />

      <ActionButton
        label="Fill form"
        busyLabel="Filling"
        state={fill.state}
        onClick={() => void handleFill()}
        disabled={fill.state === 'busy' || fill.lockedByOtherTab}
      />

      {toast !== null && (
        <div
          role="status"
          className={
            toast.level === 'success'
              ? 'flex items-start gap-2 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 shadow-sm'
              : toast.level === 'error'
              ? 'flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm'
              : 'flex items-start gap-2 rounded-card border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700 shadow-sm'
          }
        >
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-[10px] opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            Close
          </button>
        </div>
      )}

      {fill.lockedByOtherTab && (
        <p className="mt-auto text-[10px] text-amber-700">
          Another fill is already running in a different tab.
        </p>
      )}
    </div>
  );
}

function labelForAts(kind: DetectedIntent['kind']): string {
  if (kind === 'greenhouse') return 'Greenhouse';
  if (kind === 'lever') return 'Lever';
  if (kind === 'workday') return 'Workday';
  return 'Application';
}

function mapErrorToMessage(reason: Extract<FillRequestResponse, { ok: false }>['reason']): string {
  switch (reason) {
    case 'no-adapter':        return 'ATS adapter failed to load. Reload and retry.';
    case 'no-profile':        return 'Upload a resume in Options first.';
    case 'no-form':           return 'No form found on this page.';
    case 'scan-failed':       return 'Form scan failed. Reload the page and try again.';
    case 'plan-failed':       return 'Could not plan a fill for this form.';
    case 'ats-mismatch':      return 'Page moved off the application form.';
    case 'wizard-not-ready':  return 'Workday wizard step not ready yet.';
    default:                  return 'Fill failed. Check the extension logs.';
  }
}
```

Points:
- **No `HighlightToggle`** (review §B.2 fix). The fill button, credit badge, and completeness indicator are the only actionable UI.
- `useFillAction({ tabId, deps })` returns `{ state, lockedByOtherTab, run }`. `run()` returns a projected result (`ok` / `partial` / `error`). See §6.17 for full hook implementation.
- `mapErrorToMessage` handles every `reason` from the `FillRequestResponse` discriminated union per keystone §1.2. The `default` branch is a defensive catch-all for future additions.
- Toast auto-dismiss is handled inline via a `useEffect` that sets a timer on the toast. The timer is cleared on toast change or unmount.
- `deps.window.setTimeout` is injected so tests can use fake timers (`vi.useFakeTimers()`) and control auto-dismiss without waiting 4 real seconds.

### 6.11 `src/entrypoints/popup/components/Header.tsx` (new)

Title, optional "signed in" indicator, settings cog. Approximately 100 lines.

```tsx
/**
 * Popup header.
 *
 * Left: brand mark + title.
 * Right: optional signed-in indicator + settings cog.
 *
 * The cog button is the only way to reach the options page from the popup.
 */
import React from 'react';

interface HeaderProps {
  readonly authed: boolean;
  readonly onOpenOptions: () => void;
}

export function Header({ authed, onOpenOptions }: HeaderProps): React.ReactElement {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-pill bg-brand-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-zinc-900">LLM Conveyors</span>
      </div>
      <div className="flex items-center gap-2">
        {authed && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-brand-100 text-[10px] font-semibold text-brand-700"
            title="Signed in"
            aria-label="Signed in"
          >
            Z
          </div>
        )}
        <button
          type="button"
          onClick={onOpenOptions}
          className="rounded-pill p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Open options"
          title="Settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
```

Points:
- The "Z" initial is a placeholder; the popup does not have the user's full name. Honest privacy-preserving placeholder.
- The cog SVG is inline -- no icon lib dependency.
- `aria-label="Open options"` is the accessible name for the button (since it contains only an SVG).

### 6.12 `src/entrypoints/popup/components/HighlightToggle.tsx` (new)

This is the single most-revised component after the review. It consumes A9's discriminated response shapes, exposes an explicit `disabled` prop for D9, bootstraps via `HIGHLIGHT_STATUS`, branches error UI on each `reason` discriminant, guards against stale replies when the popup closes mid-request, and debounces concurrent clicks. Approximately 200 lines.

```tsx
/**
 * HighlightToggle - bistate toggle for keyword highlighting.
 *
 * Contract (keystone section 1.1 and 1.2):
 *   - On mount, sends HIGHLIGHT_STATUS(tabId) to bg; bg reads per-tab map.
 *     Response: { on: boolean; keywordCount: number; appliedAt: number | null }.
 *     Bootstrapped state = { on, count: keywordCount }.
 *
 *   - Click -> if currently off, sends HIGHLIGHT_APPLY({ tabId }) (payload
 *     is tabId ONLY per keystone 1.1: extraction is online-only and the
 *     content script fetches JD text internally). Response:
 *       { ok: true, keywordCount, rangeCount, tookMs } |
 *       { ok: false, reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting'
 *                         | 'api-error' | 'rate-limited' | 'network-error'
 *                         | 'no-tab' | 'render-error' }.
 *     Reads res.keywordCount as match count. NOT res.applied (that field
 *     does not exist in the v2.1 keystone).
 *
 *   - Click -> if currently on, sends HIGHLIGHT_CLEAR({ tabId }). Response:
 *       { ok: true, cleared: boolean } | { ok: false, reason: string }.
 *     NB cleared is boolean, NOT a count.
 *
 *   - Props:
 *       disabled: boolean - hard disable; click is a no-op.
 *       disabledTooltip?: string - rendered via title attribute when disabled.
 *
 * D9 graceful-degradation: SignedOut renders with disabled=true and
 * disabledTooltip="Sign in for keyword matching". The internal click
 * handler early-returns when disabled so no messages fire.
 *
 * Stale-reply guard: the popup is ephemeral and may close before an async
 * await resolves. We set a ref to false in the effect cleanup; every
 * response check reads the ref and bails before setState. Tests assert
 * this path explicitly.
 *
 * Debounce: concurrent click while status === 'busy' is a no-op (no second
 * message fires). Tests assert exactly-one sendMessage under rapid clicks.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PopupDeps } from '../deps';
import type {
  TabIdType,
  HighlightApplyResponse,
  HighlightClearResponse,
  HighlightStatus,
} from '../messaging';

interface HighlightToggleProps {
  readonly tabId: TabIdType;
  readonly deps: PopupDeps;
  readonly disabled: boolean;
  readonly disabledTooltip?: string;
}

type ToggleState =
  | { readonly status: 'loading' }
  | { readonly status: 'idle'; readonly on: boolean; readonly count: number }
  | { readonly status: 'busy'; readonly on: boolean; readonly count: number }
  | { readonly status: 'error'; readonly on: boolean; readonly count: number; readonly message: string };

const INITIAL: ToggleState = { status: 'loading' };

export function HighlightToggle({
  tabId,
  deps,
  disabled,
  disabledTooltip,
}: HighlightToggleProps): React.ReactElement {
  const [state, setState] = useState<ToggleState>(INITIAL);
  const aliveRef = useRef(true);

  // Bootstrap from HIGHLIGHT_STATUS. Per keystone section 1.3, A5 ships the
  // bg handler that reads the per-tab Map populated by A9's content script.
  useEffect(() => {
    aliveRef.current = true;
    if (disabled) {
      // When disabled, we never query the content script - the bootstrap
      // would cause visible work for an inert button, and in the SignedOut
      // path the bg handler would return a stale state anyway. Render the
      // "off" visual directly.
      setState({ status: 'idle', on: false, count: 0 });
      return () => {
        aliveRef.current = false;
      };
    }

    (async () => {
      try {
        const res: HighlightStatus = await deps.sendMessage('HIGHLIGHT_STATUS', { tabId });
        if (!aliveRef.current) return;
        setState({ status: 'idle', on: res.on, count: res.keywordCount });
      } catch (err) {
        if (!aliveRef.current) return;
        const message = err instanceof Error ? err.message : 'Status failed';
        deps.logger.warn('HIGHLIGHT_STATUS failed', { message });
        setState({ status: 'error', on: false, count: 0, message });
      }
    })();

    return () => {
      aliveRef.current = false;
    };
  }, [tabId, disabled, deps]);

  const handleToggle = useCallback(async () => {
    if (disabled) return;
    if (state.status === 'loading' || state.status === 'busy') return;

    const nextOn = !state.on;
    setState({ status: 'busy', on: state.on, count: state.count });

    try {
      if (nextOn) {
        const res: HighlightApplyResponse = await deps.sendMessage('HIGHLIGHT_APPLY', { tabId });
        if (!aliveRef.current) return;
        if (!res.ok) {
          setState({
            status: 'error',
            on: state.on,
            count: state.count,
            message: messageForApplyReason(res.reason),
          });
          return;
        }
        setState({ status: 'idle', on: true, count: res.keywordCount });
      } else {
        const res: HighlightClearResponse = await deps.sendMessage('HIGHLIGHT_CLEAR', { tabId });
        if (!aliveRef.current) return;
        if (!res.ok) {
          setState({
            status: 'error',
            on: state.on,
            count: state.count,
            message: 'Clear failed',
          });
          return;
        }
        // cleared is a boolean per keystone section 1.2; discard it and
        // reset the local count to 0.
        setState({ status: 'idle', on: false, count: 0 });
      }
    } catch (err) {
      if (!aliveRef.current) return;
      const message = err instanceof Error ? err.message : 'Toggle failed';
      deps.logger.warn('HIGHLIGHT toggle failed', { message });
      setState({ status: 'error', on: state.on, count: state.count, message });
    }
  }, [disabled, state, deps, tabId]);

  const busy = state.status === 'loading' || state.status === 'busy';
  const on = state.status !== 'loading' ? state.on : false;
  const count = state.status !== 'loading' ? state.count : 0;

  return (
    <div
      className="rounded-card border border-zinc-200 bg-white p-3 shadow-sm"
      title={disabled ? disabledTooltip : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-900">Highlight JD keywords</p>
          {state.status === 'idle' && state.on && count > 0 && (
            <p className="text-[10px] text-zinc-500">{count} matches</p>
          )}
          {state.status === 'error' && (
            <p className="text-[10px] text-red-600">{state.message}</p>
          )}
          {disabled && disabledTooltip !== undefined && (
            <p className="text-[10px] text-zinc-500">{disabledTooltip}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={disabled ? (disabledTooltip ?? 'Disabled') : 'Toggle highlight'}
          disabled={disabled || busy}
          title={disabled ? disabledTooltip : undefined}
          onClick={() => void handleToggle()}
          className={
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition disabled:cursor-not-allowed disabled:opacity-60 ' +
            (on ? 'bg-brand-600' : 'bg-zinc-200')
          }
        >
          <span
            className={
              'inline-block h-5 w-5 transform rounded-pill bg-white shadow transition ' +
              (on ? 'translate-x-5' : 'translate-x-0.5')
            }
          />
        </button>
      </div>
    </div>
  );
}

function messageForApplyReason(reason: Extract<HighlightApplyResponse, { ok: false }>['reason']): string {
  switch (reason) {
    case 'signed-out':        return 'Sign in for keyword matching';
    case 'no-jd-on-page':     return 'No job description found';
    case 'not-a-job-posting': return 'Not a job posting';
    case 'rate-limited':      return 'Try again in a moment';
    case 'api-error':         return 'Highlight failed';
    case 'network-error':     return 'Highlight failed';
    case 'render-error':      return 'Highlight failed';
    case 'no-tab':            return 'Highlight failed';
    default:                  return 'Highlight failed';
  }
}
```

Key review fixes embedded here:
- **Review §A.1 fix**: all message keys are `HIGHLIGHT_STATUS`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`. There is no `HIGHLIGHT_STATUS` fiction; the keystone §1.3 confirms A5 ships the real handler.
- **Review §A.2 fix**: `HIGHLIGHT_APPLY` response is read as `res.keywordCount` (not `res.applied`). `HIGHLIGHT_CLEAR` response `cleared` is treated as boolean (not a count) per keystone.
- **Review §A.2 fix (reason branching)**: each error `reason` discriminant maps to the user-facing string dictated by the task directive. `'signed-out'` -> `Sign in for keyword matching`, `'no-jd-on-page'` -> `No job description found`, `'rate-limited'` -> `Try again in a moment`, and the render/api/network/no-tab errors all collapse to `Highlight failed`. `'not-a-job-posting'` is a defensive case: under normal flow the toggle is not shown on application-form pages per §B.2, so this branch is unreachable in production. The defensive branch returns a sensible string rather than throwing.
- **Review §A.3 fix**: `HIGHLIGHT_APPLY` payload is exactly `{ tabId }` per keystone §1.1 -- extraction is online-only and the content script fetches JD text internally. A10 does not build any `HighlightApplyRequest` payload envelope.
- **Review §A.4 fix**: `HIGHLIGHT_STATUS` handler is shipped by A5 per keystone §1.3, so the bootstrap call resolves rather than rejecting with "no handler registered".
- **Review §C.1 fix**: the component accepts `disabled: boolean` and `disabledTooltip?: string`. When `disabled === true`, the click handler early-returns and no messages fire. The `SignedOut` view sets both props.
- **Stale-reply guard** (new adversarial test surface per D19): `aliveRef` is set to false on unmount; every async continuation reads the ref and bails before `setState`. This prevents React warnings about setting state on an unmounted component and avoids UI flicker when the popup re-opens on a different tab.
- **Concurrent-click debounce**: the `state.status === 'busy'` guard at the top of `handleToggle` ensures a second click while the first is in flight is a no-op.

### 6.13 `src/entrypoints/popup/components/CreditBadge.tsx` (new)

Displays credit balance. ~95 lines.

```tsx
/**
 * CreditBadge - displays the user's remaining credit balance.
 *
 * States:
 *   loading: shimmer pill
 *   ready:   numeric value in a brand pill
 *   error:   dash character in a zinc pill, tooltip with error message
 *
 * Data source: CREDITS_GET message to background -> CreditsState per keystone
 * section 1.2: { readonly balance: number; readonly plan: string; readonly resetAt: number | null }.
 *
 * The popup wraps this in a local state union (loading | ready | error)
 * because the CREDITS_GET message itself only returns the "ready" shape;
 * the hook (useCredits) tracks loading and error externally.
 */
import React from 'react';
import type { CreditsState } from '../messaging';

export type CreditsUiState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly state: CreditsState }
  | { readonly status: 'error'; readonly message: string };

interface CreditBadgeProps {
  readonly state: CreditsUiState;
}

export function CreditBadge({ state }: CreditBadgeProps): React.ReactElement {
  if (state.status === 'loading') {
    return (
      <span
        className="llmc-shimmer inline-flex h-6 w-16 rounded-pill bg-zinc-100"
        aria-busy="true"
        aria-label="Loading credits"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-pill bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500"
        title={state.message}
        role="status"
      >
        - credits
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
      title={`Plan: ${state.state.plan}`}
      role="status"
    >
      {formatCredits(state.state.balance)} credits
    </span>
  );
}

function formatCredits(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
```

Points:
- `CreditsUiState` is the local wrapper; the `CreditsState` per keystone §1.2 is a plain readonly struct with `balance`, `plan`, `resetAt`.
- `formatCredits` guards against `NaN` / `Infinity` / negative -- adversarial input from a malformed backend response collapses to `'0'` rather than rendering garbage.
- The error state uses ASCII `-` (em-dash is forbidden per D15).

### 6.14 `src/entrypoints/popup/components/ActionButton.tsx` (new)

Primary CTA with idle/busy/success/error states. Approximately 130 lines. Identical in spirit to the pre-review version but expanded.

```tsx
/**
 * ActionButton - primary CTA with typed state and inline spinner.
 *
 * States:
 *   idle:    brand-600 background, clickable
 *   busy:    spinner + busyLabel, disabled
 *   success: emerald-600 background, disabled, auto-reverts to idle externally
 *   error:   red-600 background, disabled, auto-reverts to idle externally
 *
 * The parent owns `state` - this component is purely visual.
 */
import React from 'react';

type ActionButtonState = 'idle' | 'busy' | 'success' | 'error';

interface ActionButtonProps {
  readonly label: string;
  readonly busyLabel?: string;
  readonly state: ActionButtonState;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export function ActionButton({
  label,
  busyLabel,
  state,
  disabled,
  onClick,
}: ActionButtonProps): React.ReactElement {
  const isDisabled = disabled === true || state === 'busy';

  const bgClass =
    state === 'success' ? 'bg-emerald-600 hover:bg-emerald-700'
      : state === 'error' ? 'bg-red-600 hover:bg-red-700'
      : 'bg-brand-600 hover:bg-brand-700';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={
        'w-full inline-flex items-center justify-center gap-2 rounded-pill ' +
        bgClass +
        ' px-4 py-2.5 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {state === 'busy' && <Spinner />}
      <span>{state === 'busy' ? (busyLabel ?? 'Working') : label}</span>
    </button>
  );
}

function Spinner(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M12 2 a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
```

Points:
- `disabled === true` is an explicit comparison so `undefined` does not accidentally disable the button.
- Spinner uses SVG SMIL animation -- no JS-driven animation, no lib.
- `type="button"` is defensive; the popup has no forms but safer than `type="submit"` default.

### 6.15 `src/entrypoints/popup/components/CompletenessIndicator.tsx` (new)

**Critical review fix §E.5**: reads the profile via `PROFILE_GET` message (so A7's migration runs), NOT `chrome.storage.local.get` directly. Approximately 140 lines.

```tsx
/**
 * CompletenessIndicator.
 *
 * Data source: PROFILE_GET message to the background. The bg handler runs
 * readProfile() which validates and migrates legacy A5-stub shapes to the
 * B2 Profile schema per A7 section 6.3. Reading chrome.storage.local
 * directly (as in the pre-review plan) bypasses the migration and reports
 * 0 / 7 for a valid-but-legacy profile - review finding E.5.
 *
 * Core field set (minimum viable for a fill):
 *   1. basics.firstName (non-empty trimmed)
 *   2. basics.lastName  (non-empty trimmed)
 *   3. basics.email     (contains '@')
 *   4. basics.phone     (non-empty trimmed)
 *   5. basics.location.city        (non-empty trimmed)
 *   6. basics.location.countryCode (non-empty trimmed)
 *   7. at least one profiles entry OR a documents.resume handle
 */
import React, { useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';

interface CompletenessIndicatorProps {
  readonly deps: PopupDeps;
}

interface CompletenessState {
  readonly loading: boolean;
  readonly filledCount: number;
  readonly totalCount: number;
  readonly hasProfile: boolean;
}

const INITIAL: CompletenessState = {
  loading: true,
  filledCount: 0,
  totalCount: 7,
  hasProfile: false,
};

export function CompletenessIndicator({ deps }: CompletenessIndicatorProps): React.ReactElement {
  const [state, setState] = useState<CompletenessState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await deps.sendMessage('PROFILE_GET', undefined);
        if (cancelled) return;
        if (profile === null) {
          setState({ loading: false, filledCount: 0, totalCount: 7, hasProfile: false });
          return;
        }
        setState({
          loading: false,
          hasProfile: true,
          filledCount: countCoreFields(profile),
          totalCount: 7,
        });
      } catch (err) {
        if (!cancelled) {
          deps.logger.warn('PROFILE_GET failed', {
            message: err instanceof Error ? err.message : 'unknown',
          });
          setState({ loading: false, filledCount: 0, totalCount: 7, hasProfile: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deps]);

  if (state.loading) {
    return (
      <div
        className="llmc-shimmer h-10 rounded-card bg-zinc-100"
        aria-busy="true"
        aria-label="Loading profile"
      />
    );
  }

  const pct = Math.round((state.filledCount / state.totalCount) * 100);
  const complete = state.filledCount >= state.totalCount;

  return (
    <div className="rounded-card border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-700">
          Profile {state.filledCount} / {state.totalCount}
        </p>
        {!complete && (
          <button
            type="button"
            onClick={() => deps.chrome.runtime.openOptionsPage()}
            className="text-[10px] font-medium text-brand-600 hover:text-brand-700"
          >
            Open options
          </button>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-zinc-100">
        <div
          className={
            'h-full rounded-pill transition-all ' +
            (complete ? 'bg-emerald-500' : 'bg-brand-500')
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * countCoreFields operates on the B2 Profile shape (nested basics.*).
 * Uses typeof and trim checks to be tolerant of partial profiles.
 */
function countCoreFields(profile: unknown): number {
  if (profile === null || typeof profile !== 'object') return 0;
  const p = profile as {
    basics?: {
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      phone?: unknown;
      location?: { city?: unknown; countryCode?: unknown };
      profiles?: ReadonlyArray<unknown>;
    };
    documents?: { resume?: unknown };
  };

  const basics = p.basics ?? {};
  const location = basics.location ?? {};
  const profiles = basics.profiles ?? [];
  const hasResume = p.documents?.resume !== undefined && p.documents.resume !== null;

  let count = 0;
  if (typeof basics.firstName === 'string' && basics.firstName.trim() !== '') count++;
  if (typeof basics.lastName === 'string' && basics.lastName.trim() !== '') count++;
  if (typeof basics.email === 'string' && basics.email.includes('@')) count++;
  if (typeof basics.phone === 'string' && basics.phone.trim() !== '') count++;
  if (typeof location.city === 'string' && location.city.trim() !== '') count++;
  if (typeof location.countryCode === 'string' && location.countryCode.trim() !== '') count++;
  if (profiles.length > 0 || hasResume) count++;
  return count;
}
```

Points:
- `PROFILE_GET` returns `Profile | null` per keystone §1.1. The handler in A7 runs `readProfile()` which validates the Zod schema and migrates legacy shapes.
- `countCoreFields` is tolerant of partial profiles and never throws on malformed input -- adversarial test case.
- The style uses `style={{ width: `${pct}%` }}` because Tailwind v4 does not generate arbitrary-value utilities cleanly enough for a runtime percentage.

### 6.16 `src/entrypoints/popup/hooks/useAuthState.ts` (new)

Approximately 115 lines.

```ts
/**
 * useAuthState - returns the current AuthState, primed from AUTH_STATUS on
 * mount and updated via AUTH_STATE_CHANGED broadcasts from the background.
 *
 * Shape per keystone section 1.2 AuthState:
 *   { readonly authed: true; readonly email: string | null; readonly accessTokenExpiry: number }
 *   { readonly authed: false }
 *
 * Local wrapper adds a 'status' discriminant:
 *   { status: 'loading', authed: false }
 *   { status: 'ready', authed: true, email, accessTokenExpiry }
 *   { status: 'ready', authed: false }
 *
 * Per D20, accepts an optional deps argument for testability.
 */
import { useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';
import type { AuthState } from '../messaging';
import { createDefaultPopupDeps } from '../deps';

export type UseAuthState =
  | { readonly status: 'loading'; readonly authed: false }
  | ({ readonly status: 'ready' } & AuthState);

const DEFAULT_LOADING: UseAuthState = { status: 'loading', authed: false };

export function useAuthState(depsOverride?: PopupDeps): UseAuthState {
  const [state, setState] = useState<UseAuthState>(DEFAULT_LOADING);

  useEffect(() => {
    const deps = depsOverride ?? createDefaultPopupDeps();
    let cancelled = false;

    // Prime via AUTH_STATUS message. Per keystone section 1.1 this returns
    // AuthState.
    (async () => {
      try {
        const current: AuthState = await deps.sendMessage('AUTH_STATUS', undefined);
        if (!cancelled) {
          setState({ status: 'ready', ...current });
        }
      } catch (err) {
        if (!cancelled) {
          deps.logger.warn('AUTH_STATUS prime failed', {
            message: err instanceof Error ? err.message : 'unknown',
          });
          setState({ status: 'ready', authed: false });
        }
      }
    })();

    // Subscribe to AUTH_STATE_CHANGED broadcast. Per keystone section 1.1
    // this is a broadcast-only message; A5's bg handler is a noop, and the
    // popup consumes it via onMessage.
    const unsubscribe = deps.onMessage('AUTH_STATE_CHANGED', (msg) => {
      if (cancelled) return;
      setState({ status: 'ready', ...msg.data });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [depsOverride]);

  return state;
}
```

Points:
- Uses `deps.onMessage` from the A5 barrel to subscribe to broadcasts. The `@webext-core/messaging` contract is that a returned unsubscribe function removes the listener.
- The message handler body reads `msg.data` (not `msg` directly) because `@webext-core/messaging` wraps incoming broadcasts in a `{ data, sender }` envelope.
- `depsOverride` is optional; production calls `useAuthState()` and defaults kick in. Tests call `useAuthState(fakeDeps)`.

### 6.17 `src/entrypoints/popup/hooks/useActiveTab.ts` (new)

Wraps `chrome.tabs.query` and brands the tab id. Approximately 95 lines.

```ts
/**
 * useActiveTab - returns the active tab's branded TabId and URL.
 *
 * Re-queries on chrome.tabs.onUpdated (status === 'complete') so SPA route
 * changes inside the same tab update the popup. In practice the popup
 * closes on navigation, but the listener handles the edge case where the
 * user keeps the popup open while navigating (pinned popup).
 */
import { useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';
import { TabId, type TabIdType } from '../messaging';
import { createDefaultPopupDeps } from '../deps';

export type UseActiveTab =
  | { readonly status: 'loading'; readonly tabId: TabIdType; readonly url: '' }
  | { readonly status: 'ready'; readonly tabId: TabIdType; readonly url: string };

const LOADING_TAB_ID = TabId(-1);

const DEFAULT_LOADING: UseActiveTab = {
  status: 'loading',
  tabId: LOADING_TAB_ID,
  url: '',
};

export function useActiveTab(depsOverride?: PopupDeps): UseActiveTab {
  const [state, setState] = useState<UseActiveTab>(DEFAULT_LOADING);

  useEffect(() => {
    const deps = depsOverride ?? createDefaultPopupDeps();
    let cancelled = false;

    async function query(): Promise<void> {
      try {
        const tabs = await deps.chrome.tabs.query({ active: true, currentWindow: true });
        if (cancelled) return;
        const tab = tabs[0];
        if (tab === undefined || tab.id === undefined) {
          setState({ status: 'ready', tabId: LOADING_TAB_ID, url: '' });
          return;
        }
        setState({
          status: 'ready',
          tabId: TabId(tab.id),
          url: tab.url ?? '',
        });
      } catch (err) {
        deps.logger.warn('chrome.tabs.query failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    void query();

    const onUpdated = (
      _tabId: number,
      info: chrome.tabs.TabChangeInfo,
    ): void => {
      if (info.status === 'complete') void query();
    };
    deps.chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      cancelled = true;
      deps.chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [depsOverride]);

  return state;
}
```

Points:
- Returns branded `TabIdType` per D16. Consumers never see raw numbers.
- `LOADING_TAB_ID = TabId(-1)` is a sentinel for the loading phase; callers check `state.status === 'loading'` first, so the sentinel is never dereferenced as a real tab.
- Re-queries on any `onUpdated` event with `status === 'complete'`.

### 6.18 `src/entrypoints/popup/hooks/useDetectedIntent.ts` (new)

Sends `INTENT_GET` on mount and subscribes to `DETECTED_JOB_BROADCAST` for refreshes. Approximately 130 lines.

```ts
/**
 * useDetectedIntent - reads the DetectedIntent for the given tabId from
 * the background via INTENT_GET, and subscribes to DETECTED_JOB_BROADCAST
 * for updates while the popup is open.
 *
 * Per keystone section 1.1:
 *   INTENT_GET(data: { tabId: TabId }) => DetectedIntent | null
 *   DETECTED_JOB_BROADCAST(data: { tabId: TabId; intent: DetectedIntent }) => void
 *
 * Per keystone section 2.8, DetectedIntent shape:
 *   { kind: AtsKind | 'unknown', pageKind: 'job-posting' | 'application-form' | null,
 *     url, jobTitle?, company?, detectedAt }
 *
 * Returns null when:
 *   - tabId is the loading sentinel TabId(-1)
 *   - INTENT_GET returned null (no A9 detection for this tab)
 *   - the request threw
 */
import { useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';
import type { DetectedIntent, TabIdType } from '../messaging';
import { createDefaultPopupDeps, TabId as TabIdFactory } from '../deps';
import { TabId } from '../messaging';

const LOADING_SENTINEL = TabId(-1);

function isLoadingSentinel(t: TabIdType): boolean {
  // Branded types erase at runtime; compare unbranded.
  return (t as unknown as number) < 0;
}

export function useDetectedIntent(tabId: TabIdType, depsOverride?: PopupDeps): DetectedIntent | null {
  const [intent, setIntent] = useState<DetectedIntent | null>(null);

  useEffect(() => {
    if (isLoadingSentinel(tabId)) {
      setIntent(null);
      return undefined;
    }

    const deps = depsOverride ?? createDefaultPopupDeps();
    let cancelled = false;

    // Prime from the per-tab map via INTENT_GET.
    (async () => {
      try {
        const result = await deps.sendMessage('INTENT_GET', { tabId });
        if (!cancelled) setIntent(result);
      } catch (err) {
        if (!cancelled) {
          deps.logger.warn('INTENT_GET failed', {
            message: err instanceof Error ? err.message : 'unknown',
          });
          setIntent(null);
        }
      }
    })();

    // Subscribe to DETECTED_JOB_BROADCAST for live updates. A9's content
    // script may re-detect on SPA route changes and re-broadcast; the bg
    // forwards to any open popup.
    const unsubscribe = deps.onMessage('DETECTED_JOB_BROADCAST', (msg) => {
      if (cancelled) return;
      const payload = msg.data;
      // Only apply updates for our tab - the broadcast is tab-scoped but
      // the background fans out to every popup, so we filter client-side.
      if ((payload.tabId as unknown as number) !== (tabId as unknown as number)) return;
      setIntent(payload.intent);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tabId, depsOverride]);

  return intent;
}
```

Points:
- Uses `INTENT_GET` per keystone §1.1 (NOT `INTENT_GET_FOR_TAB`). Review §A.1 fix.
- Subscribes to `DETECTED_JOB_BROADCAST` per keystone §1.1 for live updates (review §D19 adversarial case: detected intent changes while popup open).
- Filters broadcasts by `tabId` on the client side; the bg emits to every popup, and the popup only cares about its own tab.
- Branded type comparison is an unsafe-cast dance because TypeScript's nominal brand is erased at runtime. The unbrand operation is encapsulated.

### 6.19 `src/entrypoints/popup/hooks/useCredits.ts` (new)

Fetches on mount and on `window.focus`. **No interval polling** (review §E.3). Approximately 95 lines.

```ts
/**
 * useCredits - fetches the current credit state on mount and on window focus.
 *
 * Per review E.3: the 30s polling interval in the pre-review plan was
 * dead code for the typical popup session (popups live < 30s). Dropped
 * entirely. Focus-driven refresh covers "user alt-tabs and comes back".
 *
 * Shape: local wrapper around the keystone CreditsState:
 *   CreditsUiState =
 *     | { status: 'loading' }
 *     | { status: 'ready', state: CreditsState }
 *     | { status: 'error', message: string }
 *
 * CreditsState itself (keystone section 1.2) is:
 *   { readonly balance: number; readonly plan: string; readonly resetAt: number | null }
 */
import { useCallback, useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';
import type { CreditsState } from '../messaging';
import { createDefaultPopupDeps } from '../deps';
import type { CreditsUiState } from '../components/CreditBadge';

const INITIAL: CreditsUiState = { status: 'loading' };

export function useCredits(depsOverride?: PopupDeps): CreditsUiState {
  const [state, setState] = useState<CreditsUiState>(INITIAL);

  const poll = useCallback(async (deps: PopupDeps, alive: () => boolean) => {
    try {
      const result: CreditsState = await deps.sendMessage('CREDITS_GET', undefined);
      if (!alive()) return;
      setState({ status: 'ready', state: result });
    } catch (err) {
      if (!alive()) return;
      deps.logger.warn('CREDITS_GET failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Credits unavailable',
      });
    }
  }, []);

  useEffect(() => {
    const deps = depsOverride ?? createDefaultPopupDeps();
    let cancelled = false;
    const alive = () => !cancelled;

    void poll(deps, alive);

    const onFocus = (): void => {
      void poll(deps, alive);
    };
    deps.window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      deps.window.removeEventListener('focus', onFocus);
    };
  }, [depsOverride, poll]);

  return state;
}
```

Points:
- Per review §E.3: no interval. Mount + focus only.
- Alive check is a closure to match the `cancelled` flag pattern so stale resolves after unmount do not call `setState`.

### 6.20 `src/entrypoints/popup/hooks/useFillAction.ts` (new)

Best-effort cross-tab lock + dispatch + projection. Approximately 180 lines.

```ts
/**
 * useFillAction - drives the Fill-form CTA.
 *
 * Behaviour:
 *   - Before dispatching FILL_REQUEST, best-effort write a lock to
 *     chrome.storage.session under llmc.fillLock.v1. The lock carries
 *     { tabId, startedAt }.
 *   - While another tab holds a fresh lock (< LOCK_STALE_MS), expose
 *     lockedByOtherTab=true so the view can show a warning.
 *   - After the dispatch resolves, release the lock in a finally block so
 *     a thrown error does not leave a permanent lock.
 *   - Project the FillRequestResponse per keystone section 1.2 into a local
 *     union: ok | partial | error.
 *
 * The lock is best-effort (chrome.storage has no CAS primitive). A9's
 * content-script idempotency and A5's forwarder's per-tab serialization
 * provide additional safety for the concurrent-tab case.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PopupDeps } from '../deps';
import type { FillRequestResponse, TabIdType } from '../messaging';
import { createDefaultPopupDeps } from '../deps';

const LOCK_KEY = 'llmc.fillLock.v1';
const LOCK_STALE_MS = 60_000;

type FillState = 'idle' | 'busy' | 'success' | 'error';

export type ProjectedFillResult =
  | { readonly kind: 'ok'; readonly filled: number }
  | { readonly kind: 'partial'; readonly filled: number; readonly failed: number }
  | {
      readonly kind: 'error';
      readonly reason: Extract<FillRequestResponse, { ok: false }>['reason'];
    };

interface UseFillAction {
  readonly state: FillState;
  readonly lockedByOtherTab: boolean;
  readonly run: () => Promise<ProjectedFillResult>;
}

interface UseFillActionInput {
  readonly tabId: TabIdType;
  readonly deps?: PopupDeps;
}

interface LockRecord {
  readonly tabId: number;
  readonly startedAt: number;
}

export function useFillAction({ tabId, deps: depsOverride }: UseFillActionInput): UseFillAction {
  const [state, setState] = useState<FillState>('idle');
  const [lockedByOtherTab, setLockedByOtherTab] = useState(false);

  useEffect(() => {
    const deps = depsOverride ?? createDefaultPopupDeps();
    let cancelled = false;

    async function checkLock(): Promise<void> {
      try {
        const result = await deps.chrome.storage.session.get(LOCK_KEY);
        if (cancelled) return;
        const lock = result[LOCK_KEY] as LockRecord | undefined;
        if (lock === undefined) {
          setLockedByOtherTab(false);
          return;
        }
        if (deps.now() - lock.startedAt > LOCK_STALE_MS) {
          setLockedByOtherTab(false);
          return;
        }
        setLockedByOtherTab(lock.tabId !== (tabId as unknown as number));
      } catch (err) {
        deps.logger.warn('fillLock read failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    void checkLock();

    const onChanged = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string,
    ): void => {
      if (areaName === 'session' && LOCK_KEY in changes) void checkLock();
    };
    deps.chrome.storage.onChanged.addListener(onChanged);

    return () => {
      cancelled = true;
      deps.chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [tabId, depsOverride]);

  const run = useCallback(async (): Promise<ProjectedFillResult> => {
    const deps = depsOverride ?? createDefaultPopupDeps();
    if (state === 'busy') {
      return { kind: 'error', reason: 'no-adapter' };
    }
    try {
      await deps.chrome.storage.session.set({
        [LOCK_KEY]: { tabId: tabId as unknown as number, startedAt: deps.now() },
      });
      setState('busy');

      const response: FillRequestResponse = await deps.sendMessage('FILL_REQUEST', { tabId });

      if (!response.ok) {
        setState('error');
        deps.window.setTimeout(() => setState('idle'), 2000);
        return { kind: 'error', reason: response.reason };
      }

      if (response.failed === 0) {
        setState('success');
        deps.window.setTimeout(() => setState('idle'), 2000);
        return { kind: 'ok', filled: response.filled };
      }

      setState('success');
      deps.window.setTimeout(() => setState('idle'), 2000);
      return { kind: 'partial', filled: response.filled, failed: response.failed };
    } catch (err) {
      setState('error');
      deps.window.setTimeout(() => setState('idle'), 2000);
      deps.logger.error('FILL_REQUEST dispatch failed', err);
      return { kind: 'error', reason: 'no-adapter' };
    } finally {
      try {
        await deps.chrome.storage.session.remove(LOCK_KEY);
      } catch (err) {
        deps.logger.warn('fillLock release failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }, [state, tabId, depsOverride]);

  return { state, lockedByOtherTab, run };
}
```

Points:
- Uses `FillRequestResponse` per keystone §1.2. The success variant has `filled`, `skipped`, `failed`, `planId` fields; the projection reads `filled` and `failed`.
- Lock release is in a `finally` block so even an uncaught throw from `sendMessage` does not leave a permanent lock.
- `run()` returns the projected result to the caller; the view reads `result.kind` and dispatches the toast accordingly.

### 6.21 `src/background/credits/get-credits-state.ts` (new)

**Critical review §A.5 fix**: uses direct `fetch` with `buildAuthHeaders`, NOT an SDK client, per memo §2.10 decision (a). Approximately 130 lines.

```ts
/**
 * Background handler for CREDITS_GET.
 *
 * Per memo section 2.10 decision (a) the extension background uses direct
 * fetch against the llmconveyors API, NOT the @repo/llmconveyors-sdk
 * client. The SDK is for server-to-server use; bundling it in an extension
 * service worker bloats the worker and forces a second auth abstraction.
 *
 * Endpoints (documented in investigation 15):
 *   GET /api/v1/settings/profile        -> { credits, tier, byoKeyEnabled }
 *   GET /api/v1/settings/usage-summary  -> { totalCreditsUsed, totalGenerations, averageCreditsPerGeneration }
 *
 * Per-keystone CreditsState shape (section 1.2):
 *   { readonly balance: number; readonly plan: string; readonly resetAt: number | null }
 *
 * The handler projects the two endpoints into a single CreditsState.
 */
import type { CreditsState } from '../messaging/protocol';
import { buildAuthHeaders } from '../auth/build-headers';
import { createLogger } from '../log';

const log = createLogger('credits');

const BASE_URL = 'https://llmconveyors.com/api/v1';

interface SettingsProfileResponse {
  readonly credits?: unknown;
  readonly tier?: unknown;
  readonly byoKeyEnabled?: unknown;
}

interface SettingsProfileResponseEnvelope {
  readonly success?: unknown;
  readonly data?: SettingsProfileResponse;
  readonly error?: unknown;
}

export async function getCreditsState(): Promise<CreditsState> {
  try {
    const headers = await buildAuthHeaders();
    const res = await fetch(`${BASE_URL}/settings/profile`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      log.warn('settings/profile non-ok', { status: res.status });
      return sentinelError();
    }

    const envelope = (await res.json()) as SettingsProfileResponseEnvelope;
    if (envelope.data === undefined) {
      log.warn('settings/profile missing data envelope');
      return sentinelError();
    }

    const balance = Number(envelope.data.credits);
    const plan = String(envelope.data.tier ?? 'unknown');

    if (!Number.isFinite(balance) || balance < 0) {
      log.warn('settings/profile returned invalid credits', { credits: envelope.data.credits });
      return sentinelError();
    }

    return {
      balance,
      plan,
      resetAt: null,
    };
  } catch (err) {
    log.warn('credits fetch failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return sentinelError();
  }
}

function sentinelError(): CreditsState {
  // CreditsState is a value-type (no error variant). The popup wraps it in
  // a local CreditsUiState with a separate 'error' status derived from the
  // fact that we reject vs resolve at the message layer. Since we must
  // resolve with a CreditsState, emit a zero-balance record and let the
  // popup's useCredits detect the 0 as "unavailable" via the plan string.
  //
  // Alternative: throw from the handler so useCredits catches and displays
  // an error UI. That is the cleaner contract - the handler throws, the
  // hook catches and renders CreditsUiState.error. Implement via a thrown
  // Error so the caller's sendMessage promise rejects.
  throw new Error('Credits unavailable');
}
```

Points:
- Per memo §2.10 decision (a): direct `fetch`, not SDK.
- `buildAuthHeaders()` returns `{ Authorization: 'Bearer <token>' }` from A5's helper.
- The handler throws on any failure so the popup's `useCredits` hook catches the rejection and renders the error badge state. This keeps the `CreditsState` wire type clean (no error variant) and puts the UI-loading-vs-error-vs-ready distinction in the local `CreditsUiState` wrapper where it belongs.

### 6.22 `src/background/messaging/handlers.ts` (modified)

**Do NOT touch `protocol.ts`** -- D2 invariant, A5 is the sole owner. The `CREDITS_GET` protocol key is already declared by A5 per keystone §1.3 ("Real handlers" list). A10 only adds the impl and wires it into the `HANDLERS` record.

Find the existing `HANDLERS` record A5 ships and add:

```ts
// Add at the top of handlers.ts:
import { getCreditsState } from '../credits/get-credits-state';

// Inside the HANDLERS object:
CREDITS_GET: async () => getCreditsState(),
```

If A5's `HANDLERS` record already has a `CREDITS_GET` entry (possibly a stub), REPLACE the stub body with the real impl. If A5 has not yet added the key, STOP and file a corrective plan against A5 -- per D2 the executor does not extend `protocol.ts` or `HANDLERS` outside A5's ownership boundary. A10 only replaces a stub body.

### 6.23 Build + manual smoke

After all files are in place:

```bash
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build
```

Expected: all four exit zero.

Manual smoke sequence (the executor runs this once at the end of the phase, before writing the phase summary):

1. Reload the extension in Chrome via `chrome://extensions` -> "Load unpacked" -> select `e:/llmconveyors-chrome-extension/.output/chrome-mv3`.
2. Open a new tab to `https://example.com`. Click the extension icon.
   - Expect: popup renders 360x480, SignedOut view visible with sign-in CTA + disabled HighlightToggle labeled "Sign in for keyword matching".
3. Click the settings cog. Expect: options page opens in a new tab.
4. Click "Sign in with Zovo". Expect: chrome.identity.launchWebAuthFlow opens the extension-signin bridge page; after auth, popup re-renders into NotOnSupportedPage (example.com is not an ATS).
5. Navigate to a live Greenhouse job posting. Click the icon.
   - Expect: OnJobPosting view, title+company visible, HighlightToggle enabled.
6. Click "Highlight JD keywords". Expect: toggle becomes on, count > 0, underlying page shows `<mark>` spans.
7. Click the toggle again. Expect: off, count hidden, marks removed.
8. Navigate to the "Apply" link. Expect: OnApplicationForm view, credit badge shows a number (or error), completeness bar visible, "Fill form" button enabled.
9. Click "Fill form". Expect: spinner, then success toast with "Filled N fields".
10. Open a second Greenhouse tab, open popup. Expect: "Another fill is already running" warning if the first fill is still in flight.

Record outcomes in the phase summary.

---

## 7. Tests

All tests live under `tests/entrypoints/popup/**` and use `happy-dom` + `@testing-library/react` + `vitest`. Total: 8 files, approximately 1,280 lines.

Per D19 (adversarial test categories) every file covers at least: null/undefined at every parameter, empty collections, concurrency re-entry, error state.

Per D24 (coverage floors): extension UI minimum 70% line. Target: 85% line for this phase to catch regressions aggressively.

### 7.1 `tests/entrypoints/popup/App.test.tsx` -- routing matrix

Mocks `useAuthState`, `useActiveTab`, `useDetectedIntent` via `vi.mock` on the hook modules.

| Case | auth | intent | Expected view |
|---|---|---|---|
| 1 | loading | (ignored) | "Loading" status region |
| 2 | ready, authed:false | (ignored) | `SignedOut` |
| 3 | ready, authed:true | null | `NotOnSupportedPage` |
| 4 | ready, authed:true | { kind: 'unknown', pageKind: null } | `NotOnSupportedPage` |
| 5 | ready, authed:true | { kind: 'greenhouse', pageKind: 'job-posting', jobTitle, company } | `OnJobPosting` |
| 6 | ready, authed:true | { kind: 'lever', pageKind: 'application-form', jobTitle } | `OnApplicationForm` |
| 7 | ready, authed:true | { kind: 'workday', pageKind: 'application-form' } | `OnApplicationForm` |
| 8 | ready, authed:true | { kind: 'greenhouse', pageKind: null } | `NotOnSupportedPage` (fallback) |

Additional cases:
- Active tab transitions from loading -> ready mid-render: view updates without remount.
- Signed-in state transition from `authed:false` -> `authed:true` via broadcast (simulated by updating the hook mock): view re-renders into `NotOnSupportedPage`.
- `openOptions` callback is stable across re-renders (deps object stable).

### 7.2 `tests/entrypoints/popup/SignedOut.test.tsx`

Covers D9 graceful-degradation reachability.

- Renders "Sign in with Zovo" button.
- Renders a `HighlightToggle` with `disabled={true}` and tooltip text exactly `Sign in for keyword matching`. Assert via:
  - `screen.getByRole('switch', { name: /sign in for keyword matching/i })`
  - `toggle.getAttribute('aria-checked') === 'false'`
  - `toggle.getAttribute('disabled') !== null`
  - The surrounding card's `title` attribute is exactly `Sign in for keyword matching`.
- Click on the disabled toggle fires zero `sendMessage` calls.
- Click on "Sign in with Zovo" dispatches `AUTH_SIGN_IN`. Resolves with `{ authed: true, email, accessTokenExpiry }`; the busy state resolves.
- Click dispatches `AUTH_SIGN_IN`, rejects with Error: the inline error rendering shows the message.
- Click dispatches; mid-flow the user clicks again: the second click is a no-op while busy.

### 7.3 `tests/entrypoints/popup/CreditBadge.test.tsx`

- `status: 'loading'` -> element has `aria-busy="true"` and `llmc-shimmer` class.
- `status: 'ready', state: { balance: 42, plan: 'pro', resetAt: null }` -> text is `42 credits`, title is `Plan: pro`.
- `status: 'ready', state: { balance: 12500, plan: 'enterprise', resetAt: null }` -> text is `12.5k credits`.
- `status: 'ready', state: { balance: 0, plan: 'free', resetAt: null }` -> text is `0 credits` (NOT dash).
- `status: 'ready', state: { balance: 999, plan: 'free', resetAt: null }` -> text is `999 credits` (no k suffix).
- `status: 'error', message: 'Offline'` -> text is `- credits`, title is `Offline`.
- Adversarial: `balance: NaN` -> formatCredits returns `'0'`.
- Adversarial: `balance: Infinity` -> formatCredits returns `'0'`.
- Adversarial: `balance: -5` -> formatCredits returns `'0'`.

### 7.4 `tests/entrypoints/popup/ActionButton.test.tsx`

- `state: 'idle'` -> text is `label`, button enabled, clicking calls onClick exactly once.
- `state: 'busy'` -> text is `busyLabel`, button disabled, spinner present (query via role=img or SVG element).
- `state: 'success'` -> button has `bg-emerald-600` class, disabled.
- `state: 'error'` -> button has `bg-red-600` class, disabled.
- `disabled: true` + `state: 'idle'` -> button disabled, click does NOT call onClick.
- `disabled: undefined` + `state: 'idle'` -> button enabled (regression: no accidental undefined-coerce-to-true).

### 7.5 `tests/entrypoints/popup/HighlightToggle.test.tsx`

This is the largest test file (~280 lines) because the component encodes the most review findings.

Mount state:
- Mount with `disabled: true`, `disabledTooltip: 'Sign in for keyword matching'`: no `HIGHLIGHT_STATUS` is sent, aria-label is exactly the tooltip, aria-checked is `false`, title attribute is the tooltip.
- Mount with `disabled: false`, `sendMessage('HIGHLIGHT_STATUS', ...)` resolves with `{ on: false, keywordCount: 0, appliedAt: null }`: toggle renders off, no matches label.
- Mount with `disabled: false`, `HIGHLIGHT_STATUS` resolves with `{ on: true, keywordCount: 7, appliedAt: 1234 }`: toggle renders on, label shows `7 matches`.
- Mount with `disabled: false`, `HIGHLIGHT_STATUS` rejects with Error: toggle renders error state.

Happy-path toggle:
- Click to turn on: dispatches `HIGHLIGHT_APPLY` with `{ tabId }` ONLY (no keywords). Assert the second arg of the mock call is exactly `{ tabId: <branded> }`.
- Response `{ ok: true, keywordCount: 12, rangeCount: 15, tookMs: 42 }`: toggle on, label shows `12 matches` (reads keywordCount, NOT applied).
- Second click to turn off: dispatches `HIGHLIGHT_CLEAR({ tabId })`. Response `{ ok: true, cleared: true }`: toggle off, label hidden (reads cleared as boolean, does not treat as count).
- Second click to turn off, response `{ ok: true, cleared: false }` (nothing to clear): toggle still transitions off.

Error-reason branching (every discriminant in review §A.2):
- `{ ok: false, reason: 'signed-out' }` -> error message is exactly `Sign in for keyword matching`.
- `{ ok: false, reason: 'no-jd-on-page' }` -> error message is `No job description found`.
- `{ ok: false, reason: 'rate-limited' }` -> error message is `Try again in a moment`.
- `{ ok: false, reason: 'api-error' }` -> error message is `Highlight failed`.
- `{ ok: false, reason: 'network-error' }` -> error message is `Highlight failed`.
- `{ ok: false, reason: 'render-error' }` -> error message is `Highlight failed`.
- `{ ok: false, reason: 'no-tab' }` -> error message is `Highlight failed`.
- `{ ok: false, reason: 'not-a-job-posting' }` -> error message is `Not a job posting`. (Defensive, normally unreachable in production because the toggle is not rendered on application-form pages.)

Stale-reply guard (adversarial per D19 item 5):
- Click toggle, HIGHLIGHT_APPLY promise is pending.
- Unmount the component.
- Resolve the promise with `{ ok: true, keywordCount: 5 }`.
- Assert no `setState` warning fires and no test runner complaint about "state update on unmounted component". The aliveRef guard makes this silent.

Concurrent-click debounce (adversarial per D19 item 5):
- Click toggle twice in rapid succession while `status === 'busy'`.
- Assert `sendMessage` was called exactly once.
- Resolve the first call.
- Subsequent clicks work normally.

Disabled invariant (D9):
- `disabled: true`: click is a no-op. Assert `sendMessage` was never called (not for HIGHLIGHT_STATUS mount, not for HIGHLIGHT_APPLY click).
- Transition `disabled` from `true` to `false` mid-mount: the effect re-runs, HIGHLIGHT_STATUS is queried.

### 7.6 `tests/entrypoints/popup/useFillAction.test.tsx`

Mocks `chrome.storage.session.get/set/remove`, `chrome.storage.onChanged`, and `sendMessage`. Uses fake timers.

- Lock acquired (`storage.set` called with `LOCK_KEY`) before `FILL_REQUEST` dispatches.
- Lock released (`storage.remove`) in the `finally` block when `sendMessage` resolves.
- Lock released in `finally` block when `sendMessage` rejects (critical safety net).
- Initial `checkLock` with no lock present: `lockedByOtherTab === false`.
- `checkLock` with a lock from another tab, `startedAt` within `LOCK_STALE_MS`: `lockedByOtherTab === true`.
- `checkLock` with a lock from another tab, `startedAt` older than `LOCK_STALE_MS`: `lockedByOtherTab === false`.
- `checkLock` with a lock from our own tab: `lockedByOtherTab === false`.
- `storage.onChanged` fires for the lock key: re-runs `checkLock`.
- `run()` while `state === 'busy'`: returns `{ kind: 'error', reason: 'no-adapter' }` without dispatching.
- Response `{ ok: true, filled: 10, skipped: 0, failed: 0, planId }`: projected as `{ kind: 'ok', filled: 10 }`, state transitions to `success` then back to `idle` via fake-advance-timer 2000.
- Response `{ ok: true, filled: 7, skipped: 1, failed: 2, planId }`: projected as `{ kind: 'partial', filled: 7, failed: 2 }`.
- Response `{ ok: false, reason: 'no-profile' }`: projected as `{ kind: 'error', reason: 'no-profile' }`, state transitions to `error` then back to `idle`.
- Every `FillRequestResponse` rejection reason from keystone §1.2 is covered: `no-adapter`, `no-profile`, `no-form`, `scan-failed`, `plan-failed`, `ats-mismatch`, `wizard-not-ready`.
- `sendMessage` throws: projected as `{ kind: 'error', reason: 'no-adapter' }` (the sentinel), state transitions to `error`, lock released.

### 7.7 `tests/entrypoints/popup/useAuthState.test.tsx`

- On mount: `AUTH_STATUS` dispatched, resolves with `{ authed: true, email: 'a@b.c', accessTokenExpiry: 999 }` -> hook state becomes `{ status: 'ready', authed: true, ... }`.
- On mount: `AUTH_STATUS` rejects -> hook state becomes `{ status: 'ready', authed: false }`.
- `AUTH_STATE_CHANGED` broadcast with `{ authed: false }`: hook updates.
- `AUTH_STATE_CHANGED` broadcast with `{ authed: true, email, accessTokenExpiry }`: hook updates.
- Unmount: the `onMessage` returned unsubscribe is called. Assert the mock's unsubscribe fn was invoked.
- Cancel mid-flow: mount the hook, unmount before the prime resolves, resolve: no setState warning.

### 7.8 `tests/entrypoints/popup/useDetectedIntent.test.tsx`

- Loading sentinel `TabId(-1)`: hook returns `null` without dispatching.
- Valid tabId: sends `INTENT_GET({ tabId })`, resolves with the intent -> hook returns it.
- Valid tabId: `INTENT_GET` rejects -> hook returns `null`.
- `DETECTED_JOB_BROADCAST` arrives for our tabId while popup open: hook updates.
- `DETECTED_JOB_BROADCAST` arrives for a different tabId: hook ignores.
- Unmount during pending `INTENT_GET`: no setState after unmount (cancelled flag).

---

## 8. Acceptance criteria

All of the following MUST pass. Any failure means a corrective plan is required before moving on to A11.

### 8.1 Mechanical gates

- [ ] `pnpm typecheck` returns zero errors.
- [ ] `pnpm lint` returns zero warnings.
- [ ] `pnpm test --run` passes all new tests under `tests/entrypoints/popup/**` with zero flake.
- [ ] `pnpm build` produces `.output/chrome-mv3/popup.html` with a hashed CSS asset.
- [ ] Coverage for `src/entrypoints/popup/**`: at least 70% lines (D24 floor), target 85%.

### 8.2 Anti-drift grep gates (D14)

Run each from the repo root; every command must exit zero matches:

```bash
# No INTENT_GET_FOR_TAB references (review A.1 fix - keystone ships INTENT_GET).
grep -rE '\bINTENT_GET_FOR_TAB\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No res.applied references (review A.2 fix - keystone ships keywordCount).
grep -rE '\bres\.applied\b|\bresponse\.applied\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No HighlightRange references (v1 remnant, deleted in keystone 2.1).
grep -rE '\bHighlightRange\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No IKeywordHighlighter references (v1 port, deleted).
grep -rE '\bIKeywordHighlighter\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No skill-taxonomy references (engine no longer owns this).
grep -rE '\bskill-taxonomy\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No console.* calls in new code (D11).
grep -rE '\bconsole\.(log|info|warn|error|debug)\b' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No em-dashes (D15).
grep -rl $'\u2014' entrypoints/popup/ src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No chrome.storage.local direct access for PROFILE_KEY (review E.5 fix).
grep -rE "chrome\.storage\.local\.get.*PROFILE_KEY|chrome\.storage\.local\.get.*llmc\.profile" src/entrypoints/popup/ 2>/dev/null | wc -l  # must be 0

# No SDK client import in extension code (memo section 2.10 decision a).
grep -rE '@repo/llmconveyors-sdk|new LLMConveyors\(' src/entrypoints/popup/ src/background/credits/ 2>/dev/null | wc -l  # must be 0

# protocol.ts is NOT modified by A10 (D2).
git diff --name-only main -- src/background/messaging/protocol.ts 2>/dev/null | wc -l  # must be 0 (unless A5 was updated in the same commit)
```

### 8.3 Type-level contract assertion (D14.2)

Add a type-test file under `tests/entrypoints/popup/protocol-contract.type-test.ts`:

```ts
import type { ProtocolMap } from '@/background/messaging/protocol';

// The popup depends on these keys existing. Drop any and tsc fails here.
type PopupRequiredKeys =
  | 'AUTH_SIGN_IN' | 'AUTH_STATUS' | 'AUTH_STATE_CHANGED'
  | 'PROFILE_GET'
  | 'INTENT_GET' | 'DETECTED_JOB_BROADCAST'
  | 'FILL_REQUEST'
  | 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR' | 'HIGHLIGHT_STATUS'
  | 'CREDITS_GET';

type _PopupKeysPresent = PopupRequiredKeys extends keyof ProtocolMap ? true : never;
const _popupCheck: _PopupKeysPresent = true;
```

This file compiles ONLY if every key the popup uses is present in A5's `ProtocolMap`. If A5 drops a key, the compile fails at A10's type test -- a clear signal for the orchestrator.

### 8.4 Smoke tests (manual)

- [ ] Unauthed: popup shows SignedOut view with a VISIBLE disabled HighlightToggle bearing the exact tooltip `Sign in for keyword matching`.
- [ ] Unsupported tab (authed): popup shows NotOnSupportedPage.
- [ ] Greenhouse JD page: popup shows OnJobPosting with title, company, and enabled HighlightToggle.
- [ ] Highlight click: toggles to on with a match count; page shows `<mark>` spans.
- [ ] Highlight click again: toggles off; marks removed.
- [ ] Greenhouse application form: popup shows OnApplicationForm with credit badge, completeness bar, Fill button. NO HighlightToggle visible.
- [ ] Fill click: spinner, then success toast.
- [ ] Concurrent fill from another tab: "Another fill is already running" warning appears.
- [ ] Settings cog: opens options page.

### 8.5 Code-quality gates

- [ ] No `any` type in any new file (inferred or explicit).
- [ ] No `@ts-ignore` / `@ts-expect-error` except inside adversarial tests with a comment explaining.
- [ ] Every hook accepts an optional `deps` parameter (D20).
- [ ] Every log call uses `deps.logger.*` (D11). No `console.*` anywhere.
- [ ] File-size budget: no new file exceeds 250 lines. Tests may exceed.
- [ ] Every message key reference is a literal string matching `ProtocolMap` keys (tsc catches misspellings).

---

## 9. Rollback plan

If the phase executor hits an unrecoverable blocker:

1. Do NOT commit partial work.
2. Save WIP: `git checkout -b a10-wip`, `git commit -am "WIP: A10 popup"`, `git push origin a10-wip`.
3. Return `main` to the A9 baseline: `git checkout main && git reset --hard <sha-of-A9-merge>`.
4. File `temp/impl/100-chrome-extension-mvp/phase_A10_popup_ui/corrective-plan.md` documenting:
   - What failed (exact error messages, line numbers).
   - Whether failure is in A10 (fixable here) or upstream (needs corrective plan in the relevant phase).
5. Escalate to Ebenezer -- Day 6 has no slack.

Per D23, also ship `scripts/rollback-phase-A10.sh`:

```bash
#!/bin/bash
set -euo pipefail
rm -rf src/entrypoints/popup/App.tsx
rm -rf src/entrypoints/popup/messaging.ts
rm -rf src/entrypoints/popup/deps.ts
rm -rf src/entrypoints/popup/views/
rm -rf src/entrypoints/popup/components/
rm -rf src/entrypoints/popup/hooks/
rm -rf src/background/credits/
rm -rf tests/entrypoints/popup/
git checkout HEAD -- src/entrypoints/popup/main.tsx
git checkout HEAD -- src/entrypoints/popup/style.css
git checkout HEAD -- src/background/messaging/handlers.ts
pnpm typecheck
echo "Phase A10 rolled back cleanly"
```

The one thing the executor MUST NOT do is "just disable a failing test". Tests exist to break code. A11 depends on A10 shipping a working popup.

---

## 10. Out-of-phase risks

### 10.1 A5 drift on `INTENT_GET` key name

A5's pre-v2.1 plan file uses `INTENT_GET_FOR_TAB`. The keystone v2.1 uses the short form `INTENT_GET`. If on execution morning A5's actual `protocol.ts` still has the long name, A10's grep gate fires and the corrective plan is against A5 (rename the key). A10 does NOT work around the drift by using the long name -- the keystone is the source of truth and A5 must conform.

### 10.2 A5 has not shipped `CREDITS_GET` / `HIGHLIGHT_STATUS` / `INTENT_GET` in `HANDLERS`

Per D2, A5 is the single owner. If A5 shipped the protocol key but left the handler body empty or missing from `HANDLERS`, the runtime dispatch rejects with "no handler registered". Mitigation:

- `CREDITS_GET`: A10 owns this handler's implementation under `src/background/credits/get-credits-state.ts`. The only thing A10 touches in `handlers.ts` is registering the import -- if A5 has not added the key to `HANDLERS`, A10 adds it (this is the one edge where A10 modifies the registration table, and only to plug in a key A5 has already declared in `protocol.ts`).
- `HIGHLIGHT_STATUS` and `INTENT_GET`: A5 owns both. If A5's rewrite did not land them, the corrective plan goes to A5 and A10 halts.

### 10.3 A9 not shipped on time

If A9 has not shipped on execution morning, `DETECTED_JOB_BROADCAST` and `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` content-script handlers do not exist. Degradation:

- `useDetectedIntent`: rejection -> `null` -> `NotOnSupportedPage`.
- `HighlightToggle`: `HIGHLIGHT_STATUS` bootstrap fails -> error state. Click -> `HIGHLIGHT_APPLY` fails -> error branch with `render-error` sentinel.
- Smoke tests 6, 7 skipped and documented as A9 gap.

The popup still loads, the fill flow still works (A8 dependency, not A9). POC is demonstrable without highlight.

### 10.4 A7 `PROFILE_GET` handler missing

If A7's `PROFILE_GET` handler is not yet registered, `CompletenessIndicator` shows "0 / 7". Not a blocker -- the Open options button still works. Corrective plan against A7.

### 10.5 Windows 150% display scaling

Some Windows machines default to 150% display scaling; Chrome popups honour it, so a 360px popup renders at 540 actual pixels. No correctness impact. If visual clipping appears, bump `min-height` from 480 to 520 in `style.css`.

---

## 11. Confidence breakdown

- **Popup routing logic (App.tsx, views)**: 9/10. Deterministic off the `{auth, intent}` tuple. The `pageKind: null` fallback branch is the only corner case, defensively handled.
- **Tailwind v4 wiring**: 10/10. Investigation 42 locked.
- **Auth integration**: 9/10. A6 plan pins every message and broadcast shape; only residual risk is the `AuthState` variant shape drift between A5's `auth-state.ts` file and the keystone §1.2 definition.
- **Fill integration**: 9/10. A8 and keystone `FillRequestResponse` locked; only residual risk is whether A5's `FILL_REQUEST` forwarder correctly passes the branded `TabId`.
- **Highlight integration**: 7/10. A9 plan was graded F before rewrite; even after the corrective rewrite, the content-script idempotency and stale-reply behaviour is the riskiest surface. Tests cover every reason branch to contain the risk.
- **Credits integration**: 8/10. Direct `fetch` path per memo §2.10 is simple; only risk is the `/api/v1/settings/profile` response envelope field naming (`credits` vs `balance`). Handler reads `envelope.data.credits` and maps to `CreditsState.balance`.
- **D9 graceful degradation**: 10/10. Component accepts explicit `disabled` prop with tests asserting the exact tooltip string.
- **DI / testability**: 9/10. Every hook takes an optional `deps`; tests pass fakes.
- **Overall**: 8/10.

---

## 12. Checklist (final gate before marking phase done)

- [ ] All 18 new source files created (12 popup sources + 5 hooks + 1 bg handler).
- [ ] All 8 test files created (total 26 new files).
- [ ] All 3 modified files updated without deleting any A1/A5/A6/A7/A8/A9 surface (main.tsx, style.css, handlers.ts registration only).
- [ ] `protocol.ts` was NOT modified (D2 invariant).
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test --run` + `pnpm build` all exit zero.
- [ ] Every anti-drift grep in §8.2 returns zero matches.
- [ ] Type-level contract assertion in §8.3 compiles.
- [ ] Every manual smoke test in §8.4 passed or has a documented upstream blocker.
- [ ] No `console.*`, no `any`, no `@ts-ignore`, no em-dashes.
- [ ] No file exceeds 250 lines (tests exempt).
- [ ] `scripts/rollback-phase-A10.sh` shipped and tested on a throwaway branch.
- [ ] D9 manual check: loading the built extension in Chrome with storage cleared, opening the popup, confirming the disabled HighlightToggle is visible with the exact tooltip `Sign in for keyword matching`.
- [ ] Phase summary written to `temp/impl/100-chrome-extension-mvp/phase_A10_popup_ui/phase-summary.md`.
- [ ] `MEMORY.md` updated with the one-line status: `Phase A10 complete: popup UI live, D9 reachable, all response shapes match keystone v2.1`.

---

**End of Phase A10 plan (v2.1 rewrite).**
