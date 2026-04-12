# Review — Phase A10 Popup UI (Plan 100 v2)

**Reviewer**: Claude Opus 4.6 (architect)
**Date**: 2026-04-11
**Scope**: `phase_A10_popup_ui/plan.md` only
**Cross-referenced**: `00-decision-memo.md`, `config.json`, A5, A6, A7, A9 phase plans

---

## Grade: B-

The plan is thorough (2020 lines), well-structured, and covers ~95% of the popup UX surface with code-level precision. However, it fails critical contract-conformance checks against A5 and A9, and under-implements the mandatory D9 "disabled-when-signed-out" requirement in the actual component code despite mentioning it prominently in prose. These issues are mechanical to fix but MUST be reconciled before execution.

---

## A. Contract conformance vs A5 (background + messaging)

### A.1 CRITICAL: `INTENT_GET` vs `INTENT_GET_FOR_TAB` drift

A5's `ProtocolMap` (phase_A5 §6 protocol.ts, line 385) defines:

```ts
INTENT_GET_FOR_TAB: (data: { tabId: number }) => DetectedIntent | null;
```

A10's `useDetectedIntent.ts` (§6.17) calls:

```ts
const result = await sendMessage('INTENT_GET', { tabId });
```

This message key does NOT exist in the A5-shipped ProtocolMap. A10 would produce a compile-time error at `sendMessage('INTENT_GET', ...)`. The A9 plan references `INTENT_GET_FOR_TAB` (see §6.22 line 412 of A9 plan: "Do NOT touch ... INTENT_GET_FOR_TAB"), confirming A5's name wins.

**Severity**: CRITICAL. Build will not compile.
**Fix**: Rename all `INTENT_GET` occurrences in §3 (assumed contract), §6.17 (useDetectedIntent hook), §6.20 (messaging barrel re-exports) to `INTENT_GET_FOR_TAB`.

### A.2 CRITICAL: `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` response shape drift

A9's protocol extension (phase_A9 §6.2 lines 219-254) reshapes the response envelopes:

```ts
HighlightApplyResponse =
  | { readonly ok: true;  readonly keywordCount: number; readonly rangeCount: number; readonly tookMs: number }
  | { readonly ok: false; readonly reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting' | 'api-error' | 'rate-limited' | 'network-error' };

HighlightClearResponse =
  | { readonly ok: true; readonly cleared: boolean }
  | { readonly ok: false; readonly reason: string };
```

A10's HighlightToggle.tsx (§6.12) assumes:

```ts
const res = nextOn
  ? await sendMessage('HIGHLIGHT_APPLY', { tabId })      // expects { ok, applied }
  : await sendMessage('HIGHLIGHT_CLEAR', { tabId });     // expects { ok, cleared: number }
// ...
count: nextOn ? res.applied : 0,
```

- A10 reads `res.applied` — A9 returns `res.keywordCount` / `res.rangeCount`. No `applied` field exists.
- A10 treats `cleared` as a number (`count: ... cleared`). A9 returns `cleared: boolean`.
- A10's error handling does not branch on A9's discriminated `reason` codes — it collapses to generic "Toggle rejected by page" / "Toggle failed" strings. This loses critical UX signals (`signed-out`, `not-a-job-posting`, `rate-limited`) that A9 deliberately produces.

**Severity**: CRITICAL. Compile error on `res.applied`, and the signed-out / no-JD / rate-limit error UX is lost.
**Fix**: Rewrite §6.12 HighlightToggle to consume A9's response envelope: display `keywordCount` as the match count on apply, branch error text on `reason` codes (`'signed-out'` → "Sign in for keyword matching"; `'no-jd-on-page'` → "No job description found"; `'rate-limited'` → "Try again in a moment"; `'not-a-job-posting'` → do not show toggle at all on this page — the view-level guard should handle it).

### A.3 CRITICAL: `HIGHLIGHT_APPLY` payload drift

A9's HighlightApplyRequest (§6.2 lines 219-230) defines the payload shape (not just `{ tabId }`) — specifically includes fields for the extract-skills pre-fetch and JD cache key. A10 sends only `{ tabId }`. The executor must reconcile with whatever A9 ships — flagged in A10 §10.1 but the plan does not update the component signature to match.

**Severity**: HIGH. Plan allows executor to discover and fix, but A10 should specify the reconciliation explicitly.
**Fix**: Add a note in §6.12 that the `HIGHLIGHT_APPLY` payload is built from the shared `HighlightApplyRequest` type imported from `protocol.ts`; the HighlightToggle constructs the full payload, not just `{ tabId }`.

### A.4 CRITICAL: `HIGHLIGHT_STATUS` is invented, no handler exists

A10 adds `HIGHLIGHT_STATUS: (data: { tabId: number }) => Promise<HighlightStatus>` to the ProtocolMap (§6.21) and calls it from HighlightToggle (§6.12) and the new `useHighlightStatus` flow. But:

- A5 does NOT ship a `HIGHLIGHT_STATUS` handler.
- A9 does NOT ship a `HIGHLIGHT_STATUS` handler — A9 only tracks highlight state internally on the content-script side via an in-memory `activeCleanup` function and appliedAt timestamp (§line 824-1038). There is no query API.
- A10 §6.23 says "A9 is the owner" of the handler but A9's plan explicitly does NOT add this key (see A9 §6.2 where the only ProtocolMap additions are `KEYWORDS_EXTRACT` and the reshaped `HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR`).

This means either:
- The popup always starts with an unknown highlight state (OK for a transient popup — highlight state is per-tab anyway and the popup re-opens fresh each time), OR
- A10 itself must add the handler AND the content-script query path (which creates scope creep into A9's territory).

**Severity**: CRITICAL. The `HIGHLIGHT_STATUS` call will reject with "no handler registered" at runtime.
**Fix (recommended)**: Drop `HIGHLIGHT_STATUS` entirely. The popup is ephemeral — when it opens, assume the highlight state is `off` and let the user toggle. The A9 content script is idempotent (documented in A9 §6 lines 1220-1221), so a redundant `HIGHLIGHT_APPLY` on an already-highlighted tab is a no-op. This simplifies the HighlightToggle state machine to just `idle | busy | on | off | error` without needing a bootstrap query. Remove §6.21's `HIGHLIGHT_STATUS` addition to protocol.ts, remove `HighlightStatus` type, remove the `useEffect` in §6.12 that calls `HIGHLIGHT_STATUS`, initial state = `{ status: 'idle', on: false, count: 0 }`.

### A.5 `CREDITS_GET` addition is acceptable

A10 adding `CREDITS_GET` to the ProtocolMap and shipping the handler in the same phase is correct — no other phase owns it, and it is specific to popup UX. §6.22 get-credits-state.ts implementation is sensible.

**Caveat**: The plan imports from `@repo/llmconveyors-sdk` but the decision memo §2.10 explicitly chose option (a): "Direct fetch in extension for V1 POC — background worker calls endpoint via plain fetch(), skips SDK." A10 §6.22 uses the SDK client pattern anyway. This contradicts the memo. §10.2 acknowledges the SDK may not exist and provides a raw-fetch fallback, but the primary path should BE the raw fetch per the memo.

**Severity**: MEDIUM. Inconsistent with memo §2.10 decision.
**Fix**: Rewrite §6.22 to use `fetch()` with `buildAuthHeaders` directly, keeping the same `CreditsState` projection. The SDK-client branch becomes v1.1 migration work.

### A.6 `AUTH_SIGN_IN`, `AUTH_STATUS`, `AUTH_STATE_CHANGED` — PASS

A6 plan (§6.2 protocol additions lines 696-705) defines these with `AuthState` response shapes consistent with A10's usage. A10's `useAuthState` hook and `SignedOut` view call them correctly.

Minor issue: A5 plan originally named this `AuthStatus` (A5 §6 line 368-370), but A6 plan reshapes to `AuthState` and that reshape is the source of truth A10 consumes. A10 should note this reconciliation explicitly — the executor should read `protocol.ts` on the morning of Day 6 to confirm which name won. Currently only §6.1 has the read gate.

**Severity**: LOW. Flagged in plan but not forcefully.

---

## B. Contract conformance vs A9 (highlight + intent)

Covered in A.1–A.4 above. Summary:

| Contract | A9 ships | A10 assumes | Status |
|---|---|---|---|
| `INTENT_GET_FOR_TAB` | yes (inherited from A5) | calls `INTENT_GET` | MISMATCH |
| `INTENT_DETECTED` | fires with `kind: 'greenhouse'\|'lever'\|'workday'`, `pageKind: 'job-posting'\|'application-form'`, `company`, `jobTitle`, `url`, `detectedAt` | reads `DetectedIntent` as `{ kind: 'job-posting'\|'application-form'\|'unknown', title, company, url, ats }` | SHAPE MISMATCH |
| `HIGHLIGHT_APPLY` response | `{ ok: true, keywordCount, rangeCount, tookMs } \| { ok: false, reason }` | `{ ok, applied }` | MISMATCH |
| `HIGHLIGHT_CLEAR` response | `{ ok: true, cleared: boolean }` | `{ ok, cleared: number }` | MISMATCH |
| `HIGHLIGHT_STATUS` | NOT SHIPPED | calls it on mount | HANDLER MISSING |
| `DetectedIntent.kind` discriminant | `{ kind: 'greenhouse'\|'lever'\|'workday', pageKind, ... }` | `{ kind: 'job-posting'\|'application-form'\|'unknown' }` | DISCRIMINANT MISMATCH |

### B.1 CRITICAL: `DetectedIntent` discriminant shape is wrong

A9 plan §6.2 lines 687-692 reshapes `DetectedIntent.kind` to be the ATS name (`'greenhouse' | 'lever' | 'workday'`) and adds `pageKind` as a separate field:

```ts
export interface DetectedIntent {
  kind: 'greenhouse' | 'lever' | 'workday';
  pageKind: 'job-posting' | 'application-form';
  company?: string;
  jobTitle?: string;
  url: string;
  detectedAt: number;
}
```

A10 §3 item 8 assumes a three-variant union discriminated by `kind`:

```ts
DetectedIntent =
  | { kind: 'job-posting'; title; company; url }
  | { kind: 'application-form'; ats; company?; title?; url }
  | { kind: 'unknown'; url };
```

These are incompatible. A10's entire App.tsx routing (§6.4) branches on `intent.kind === 'job-posting' | 'application-form' | 'unknown'` — a discriminant that does not exist on the A9-shipped type.

**Severity**: CRITICAL. TypeScript compile error at the narrowing sites (`Extract<DetectedIntent, { kind: 'job-posting' }>`) and the exhaustiveness guard at line 428.
**Fix**: Rewrite §6.4 App.tsx routing to branch on `intent.pageKind` for the job-posting/application-form split, and use `intent.kind` for the ATS identifier. The "unknown" variant needs a separate representation — likely `intent === null` (no detection) rather than a `kind: 'unknown'` branch. The views `OnJobPosting`/`OnApplicationForm` must read `intent.jobTitle` (not `intent.title`), and `OnApplicationForm` reads `intent.kind` for the `ats` identifier (currently reads `intent.ats`).

### B.2 MEDIUM: A9 may reject highlight on application-form pages

A9 §6 line 60 documents: "Highlight on application-form pages — A9 short-circuits `HIGHLIGHT_APPLY` on pages where `detectPageIntent` returned `kind === 'application-form'`. Users see `{ ok: false, reason: 'not-a-job-posting' }`."

A10's `OnApplicationForm.tsx` (§6.8) unconditionally renders the HighlightToggle, and the toggle will fire `HIGHLIGHT_APPLY` and get rejected with `reason: 'not-a-job-posting'`. The user sees a confusing error for a button that should not have been visible in the first place.

**Severity**: MEDIUM. Functional but UX-broken.
**Fix**: Remove the `<HighlightToggle />` from `OnApplicationForm.tsx`. Only show it in `OnJobPosting.tsx`. The directive line in the user's task ("Detected-job display, fill button, highlight toggle") lists all three as POPUP features — but they are not all shown simultaneously. The job-posting view gets the toggle; the application-form view gets the fill button + credit badge + completeness. They are mutually exclusive per A9's own design.

---

## C. D9 graceful-degradation requirement (the invariant from the task directive)

The directive says: **"Highlight toggle: disabled when signed out with tooltip 'Sign in for keyword matching' — D9 graceful degradation"**

### C.1 CRITICAL: HighlightToggle component does not accept a `disabled` prop

A10 §1 item 6 and §5.1 row 9 state the requirement in prose:

> **The highlight toggle button MUST be rendered in a disabled state whenever the user is signed out** ... disabled tooltip reads "Sign in to highlight JD keywords".

But the actual component code in §6.12:

```tsx
interface HighlightToggleProps {
  readonly tabId: number;
}
```

Has NO `disabled` or `authed` prop. The toggle always queries `HIGHLIGHT_STATUS` on mount and always fires `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` on click. There is no code path that renders an inert toggle.

Additionally, the views that embed `<HighlightToggle tabId={tabId} />` (§6.7 OnJobPosting, §6.8 OnApplicationForm) do NOT pass the auth state down. Both views only exist on the authed branch of App.tsx, so in the happy path the auth state is always `authed: true` when HighlightToggle renders — which means **D9's "disabled when signed out" state is unreachable in this UI architecture**.

The `SignedOut` view (§6.5) renders the sign-in button only; it does not render a disabled HighlightToggle, so the user never sees the requested "Sign in for keyword matching" tooltip. The graceful-degradation affordance does not exist.

**Severity**: CRITICAL. Direct violation of task invariant D9.
**Fix**: Two options —
- **Option 1 (recommended)**: Surface a read-only preview of the HighlightToggle in the SignedOut view. Add `disabled: boolean` prop to HighlightToggle. Render it inside `SignedOut.tsx` below the sign-in CTA as a disabled widget with tooltip "Sign in for keyword matching". This makes the degradation visible exactly as D9 requires.
- **Option 2**: Treat "signed out" as a view-level branch that NEVER renders the toggle, and document the D9 requirement as "the toggle is not shown at all when signed out, which is a strictly stronger form of disabled." This is NOT what D9 literally says, but may be defensible. User's directive is literal ("disabled ... with tooltip") so Option 1 is safer.

### C.2 MEDIUM: Tooltip text drift

Directive: `"Sign in for keyword matching"`
A10 §1 item 6: `"Sign in to highlight JD keywords"`

Minor wording drift. Use the directive's exact text.

**Severity**: LOW.
**Fix**: Update §1 item 6 and §6.12 HighlightToggle disabled tooltip to use the exact string "Sign in for keyword matching".

---

## D. Core invariants (task directive checklist)

| Invariant | Status | Notes |
|---|---|---|
| React 360×480 popup | PASS | §6.2 style.css pins `width: 360px; min-height: 480px` |
| Tailwind v4 | PASS | §6.2 uses single-line `@import "tailwindcss";` + `@theme` block per investigation 42 |
| Detected-job display | PASS | §6.7 OnJobPosting + §6.8 OnApplicationForm show title/company |
| Fill button | PASS | §6.8 ActionButton + useFillAction hook |
| Highlight toggle | PARTIAL | Component exists but D9 disabled-when-signed-out state unreachable (C.1) |
| Credit balance display (6.2 nice-to-have) | PASS | §6.10 CreditBadge + §6.22 get-credits-state handler |
| No skill-taxonomy mention | PASS | §2.11 decision memo referenced only as the backend's server-side corpus; never bundled, never named in client code. §6 popup code contains zero mentions of "skill-taxonomy" |
| ProtocolMap messages match A5 | FAIL | A.1 (`INTENT_GET` wrong), A.4 (`HIGHLIGHT_STATUS` missing), A.2 (response shapes) |

---

## E. Code-quality flags (passive review of embedded code snippets)

### E.1 File-size budget

Acceptance criterion (§8 line 1938): "No file in this phase exceeds 250 lines."

- `OnApplicationForm.tsx` estimated ~165 lines — OK.
- `useFillAction.ts` estimated ~130 lines — OK.
- `HighlightToggle.tsx` estimated ~125 lines — OK.
- All other files estimated <120 lines — OK.

Budget respected in estimates. Executor should double-check after adding real logic.

### E.2 File-count arithmetic error

§5 gets the count wrong and self-corrects inline:

> "Total new files: **17**. Total modified files: **3** (+ the background `handlers.ts` where the new handler is registered ... call that the 4th modification). Revised file counts: **17 new, 4 modified**."

§0 still says "16 files created, 3 files modified." §12 says "All 17 new files created ... All 4 modified files." The inconsistency is self-corrected but should be cleaned up so the executor doesn't double-check and lose confidence.

**Severity**: LOW.
**Fix**: Rewrite §0 scope line to match §5.1 final count (17 new, 4 modified).

### E.3 `useCredits` 30s polling on an ephemeral popup

§6.18 comment admits: "Popups are short-lived so the poller usually fires zero or one extra times." True — in most cases, the popup closes well before 30s. The polling hook is dead code for the typical session. Consider dropping the interval and only polling on window focus (rare) or initial mount.

**Severity**: LOW (performance micro-optim, does not affect correctness).

### E.4 `chrome.storage.session` lock is best-effort (acknowledged)

§6.19 comment acknowledges: "The lock is best-effort — Chrome's `chrome.storage.session` has no compare-and-swap primitive. A race is possible." Accepted as a POC tradeoff with a LOCK_STALE_MS fallback. Fine.

### E.5 `CompletenessIndicator` reads `chrome.storage.local` directly, bypassing bg

§6.13 reads `chrome.storage.local.get(PROFILE_KEY)` directly from the popup. This is noted as allowed by investigation 54 §6 invariant 4 (reads are free for hot paths). However, A7's `readProfile()` helper runs Zod validation + migration on legacy A5-stub shapes (A7 §6 lines 326-357). A10's raw read bypasses that migration, so it may produce a `filledCount` of 0 for a valid-but-legacy-shape profile.

**Severity**: MEDIUM.
**Fix**: Send `PROFILE_GET` message to the background instead of reading storage directly. The background runs `readProfile()` which handles migration. One extra bg round-trip is acceptable overhead.

### E.6 Exhaustiveness guard in App.tsx relies on the wrong union shape

§6.4 uses:

```tsx
const _exhaustive: never = intent;
throw new Error(`unreachable: unknown intent kind ${JSON.stringify(_exhaustive)}`);
```

After the §6.4 if-ladder, `intent` should be `never` — but because the DetectedIntent shape is wrong (B.1), this pattern will fire in practice or fail to compile entirely. Once B.1 is fixed, this guard works; it is not a separate bug, just a downstream effect.

### E.7 `import type { DetectedIntent } from '../messaging'` with embedded type

§6.7 and §6.8 use `Extract<DetectedIntent, { kind: 'job-posting' }>`. With the A9-correct union (`{ kind: 'greenhouse'|'lever'|'workday', pageKind: ... }`), this Extract doesn't work — there are no variants with `kind: 'job-posting'`. Fix per B.1.

### E.8 `main.tsx` imports `./App` without extension

§6.3 uses `import { App } from './App';`. Vite/WXT config may or may not allow extensionless imports. A1's existing main.tsx convention should be followed. Minor.

### E.9 Accessibility

- `role="switch"` + `aria-checked` on HighlightToggle: GOOD.
- `role="status"` (polite) on Toast: GOOD.
- `aria-busy` + `aria-label` on CreditBadge loading: GOOD.
- No visible focus ring styles declared in style.css — Tailwind v4 defaults are used. Acceptable for POC; A11 polish.

### E.10 No error boundary

§6.3 explicitly: "No ErrorBoundary at this level; the App component handles its own error states inline." This is defensible for a 360×480 popup with 4 views — but any uncaught exception in a hook or event handler will crash the popup to a blank state with no user feedback. POC-acceptable; document as v1.1 backlog.

---

## F. Scope and budget

- Estimated 3–4 hours: REALISTIC given 17 files, 1550 lines, and all dependencies are resolved.
- Confidence 9/10: OVERSTATED given the contract drifts in §A and §B. Realistic confidence is ~6/10 until §A.1, §A.2, §A.4, §B.1, §C.1 are fixed in the plan.
- Files touched 16/17: see E.2 inconsistency.

---

## Summary of required fixes before execution

**CRITICAL (must fix or plan will not compile)**:
1. Rename `INTENT_GET` → `INTENT_GET_FOR_TAB` throughout (A.1).
2. Rewrite `HighlightToggle` to consume A9's response envelope `{ ok: true, keywordCount, rangeCount, tookMs }` / `{ ok: false, reason }` (A.2).
3. Drop `HIGHLIGHT_STATUS` entirely — it has no handler (A.4).
4. Rewrite `DetectedIntent` consumers to branch on `pageKind`, not `kind`, and read `jobTitle` not `title` (B.1).
5. Add `disabled` prop to `HighlightToggle` AND render it in the `SignedOut` view with the exact tooltip "Sign in for keyword matching" (C.1).

**HIGH (must fix for contract fidelity)**:
6. Remove `<HighlightToggle />` from `OnApplicationForm.tsx` — A9 rejects highlight on application-form pages (B.2).
7. Rewrite `get-credits-state.ts` to use raw `fetch()` per memo §2.10 decision (a), not the SDK client (A.5).
8. Change `CompletenessIndicator` to use `PROFILE_GET` message instead of raw storage read so A7's migration runs (E.5).

**MEDIUM**:
9. Fix file-count inconsistency between §0, §5, and §12 (E.2).
10. Fix tooltip text drift: "Sign in for keyword matching" (exact) (C.2).

**LOW**:
11. Consider dropping `useCredits` interval polling; mount-only is sufficient (E.3).
12. Downgrade confidence claim in §0 and §11 to 6/10 until fixes land.

---

## Grade justification

- **A/A+**: Would require zero contract drifts and full D9 implementation in component code.
- **B-/B**: Thorough, well-structured, code-level precision, correct Tailwind v4 wiring, correct auth flow integration. But 5 CRITICAL drifts against upstream phase plans, and the mandatory D9 requirement is prose-only with no code path to reach it. All fixable mechanically in <1h of plan edits; no investigation rework needed.
- **C/D**: Would require fundamental rearchitecture. Not the case here.

**Final grade: B-**
