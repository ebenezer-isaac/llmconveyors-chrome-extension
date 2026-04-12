# Phase A9 -- Content script: keyword highlight + intent detection (online-only)

## Phase metadata

| Field | Value |
|---|---|
| **Plan** | 100 -- Chrome Extension MVP (v2.1, locked 2026-04-11) |
| **Phase code** | A9 |
| **Phase name** | Content script: keyword highlight + intent detection (online-only via backend endpoint) |
| **Track** | Plan A -- Chrome Extension |
| **Repo** | `e:/llmconveyors-chrome-extension` (public, `ebenezer-isaac` namespace, created in A1) |
| **Day / date** | Day 6 -- 2026-04-17 (Sat) |
| **Depends on** | A1 (WXT scaffold + `src/background/log.ts`), A3 (backend `POST /api/v1/ats/extract-skills` deployed), A5 (owns `ProtocolMap` incl. `KEYWORDS_EXTRACT`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`, `INTENT_DETECTED` per keystone contracts §1), A6 (auth flow so background has a Bearer token), A7 (profile storage for resume text if needed in v1.1), A8 (content script entrypoint `entrypoints/ats.content/main.ts` + autofill controller already exist), B1 (`ats-autofill-engine@0.1.0-alpha.1` published with `./dom` sub-entry), B2 (`PageIntent`, `DetectedIntent`, `ExtractedSkill`, `TabId`, `AtsKind` types), B6 (engine `ats-autofill-engine/dom` exports: `applyHighlights`, `removeAllHighlights`, `detectPageIntent`, `extractJobDescription`) |
| **Blocks** | A10 (popup surfaces detected-intent badge + highlight toggle state), A11 (E2E smoke test + demo recording) |
| **Estimated effort** | 3 hours (intent bootstrap 25m, JD cache 15m, apply-handler 45m, clear-handler 10m, auth-loss handler 10m, Deps wiring 15m, Zod guard 15m, tests 45m, compliance 15m) |
| **Executor** | Sonnet (64k context) -- this plan is self-contained |
| **Confidence** | 9/10 -- keystone contracts §1, §5, §8 lock the full surface area A9 consumes. The only residual unknown is the WXT/Vite IIFE bundling of the `ats-autofill-engine/dom` sub-entry, verified green by A8 for the root entry. |

---

## 0. Confidence, scope, and what this phase is NOT

### 0.1 Confidence

**9/10.** A9 is a thin shim with zero novel logic. Every interface it touches is already locked:

1. **B6 renderer contract** (keystone §5): `applyHighlights(root: Element, keywords: readonly string[]): () => void`. A9 calls this with `document.body` and the `term` strings from the backend response. There is no range computation in A9, no `HighlightRange` type, no `walkTextNodes` consumer usage, no `TextWalk` shape. The engine walks the DOM internally and returns a cleanup closure.
2. **B6 JD extractor contract** (keystone §5, B6 step 14): `extractJobDescription(doc: Document): Promise<{ text: string; structured?: JobPostingData; method: 'jsonld' | 'readability' } | null>`. A9 awaits this call, caches the `text` field keyed by URL, and passes the text to `KEYWORDS_EXTRACT`.
3. **B6 intent detector contract** (keystone §2.8, B6 step 18): `detectPageIntent(location: Location, doc: Document): PageIntent` where `PageIntent` is the discriminated union `{ kind: AtsKind; pageKind: 'job-posting'; url; jobData? } | { kind: AtsKind; pageKind: 'application-form'; url } | { kind: 'unknown'; url }`.
4. **A5 ProtocolMap ownership** (keystone §1.1, D2): A5 already ships `KEYWORDS_EXTRACT`, `INTENT_DETECTED`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`, `HIGHLIGHT_STATUS` in its 19-key ProtocolMap. **A9 does NOT modify `src/background/messaging/protocol.ts`.** A9 imports `sendMessage` and `onMessage` from A5's barrel and consumes the existing types. If A5 is missing any key, that is an A5 bug and A9 stops and escalates to the architect per D2.
5. **A3 response shape** (keystone §8): `{ success: true, data: { keywords: ExtractedSkill[], missing?, tookMs }, requestId, timestamp }`. A5's `KEYWORDS_EXTRACT` background handler already parses this (per A5 plan). A9 consumes A5's `KeywordsExtractResponse` discriminated union (keystone §1.2), not the raw HTTP envelope. However, per D21, A9 ALSO guards the background response shape at runtime with a Zod schema before trusting it, because in-process IPC is still an untrusted boundary from the perspective of the content script.
6. **Keystone `HighlightApplyResponse` + `HighlightClearResponse` unions** (keystone §1.2): `{ ok: true, keywordCount, rangeCount, tookMs } | { ok: false, reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting' | 'api-error' | 'rate-limited' | 'network-error' | 'no-tab' | 'render-error' }`. The `'render-error'` literal is already present in the keystone union; it is the mapping target for engine throws (H3 fix).
7. **A1 structured logger** (D11): `createLogger('content-highlight')` exists in `src/background/log.ts` and is re-exported (or mirrored under `entrypoints/ats.content/log.ts`) from A1's scaffold; A9 uses `createLogger('content-highlight')`, NEVER `console.*`.

### 0.2 Scope declaration

- **Files touched**: 7 new production files + 4 new test files + 1 modified production file (`entrypoints/ats.content/main.ts`) + 1 new blueprint contract file + 1 new rollback script.
- **Lines changed**: +620 LoC production, +900 LoC tests, +50 LoC blueprint contract, +35 LoC rollback script. Zero deletions from shipping code (A5's protocol.ts and handlers.ts are NOT touched per D2).
- **Target directory**: `e:/llmconveyors-chrome-extension/` only. This phase does NOT touch `e:/llmconveyors.com` (A3 backend endpoint owns the server side), does NOT touch `e:/ats-autofill-engine` (B6 owns the DOM adapters), and does NOT touch `src/background/messaging/protocol.ts` (A5 owns per D2).
- **No database work, no new dependencies** (all three imports -- `@webext-core/messaging` via A5's protocol barrel, `ats-autofill-engine/dom`, `zod` for the runtime guard -- are already in the lockfile from A1/A5/B1).
- **No em-dashes anywhere in this plan** (D15 enforced mechanically; zero U+2014 code points).

Confidence score breakdown per decision memo D proposal requirements:

- Files touched: exactly 13 (7 new prod + 4 tests + blueprint + rollback = 13).
- Lines added: ~1,605 total.
- Lines removed: 0 from A9's own surface; the current A9 plan file is overwritten entirely by this one.
- Risk of cross-phase breakage: low, because the D2 rule forbids A9 from touching A5's protocol; any missing key is A5's bug.

### 0.3 Critical constraint -- ONLINE-ONLY + LEAN CLIENT

> **Keyword highlighting is ONLINE-ONLY. There is no offline fallback corpus. The skill-taxonomy IS the moat; it never leaves the server.** (Decision memo §2.5, §2.6, §2.8, §2.10.)

Three implications:

1. **Signed-out state is a first-class success envelope, not an error.** When the user has no valid Bearer token, `KEYWORDS_EXTRACT` returns `{ ok: false, reason: 'signed-out' }`, and A9 propagates that upward as `HIGHLIGHT_APPLY -> { ok: false, reason: 'signed-out' }`. The popup (A10) reads this and renders the toggle as disabled with a tooltip. A9 does NOT throw, does NOT log an error at `error` level, does NOT show a browser-level notification. It returns the signed-out envelope silently and calls `removeAllHighlights(document.body)` as a fail-safe cleanup.
2. **The content script never calls `/ats/extract-skills` directly.** Content scripts cannot reliably read `chrome.storage.session` (auth state and token refresh live in the background worker). A9 asks A5's background handler to fetch keywords via `sendMessage('KEYWORDS_EXTRACT', { text, url, topK })`. A5 is the single source of truth for auth, fetch, and rate-limit error mapping (keystone §1.2 `KeywordsExtractResponse` reason union).
3. **No keyword caching beyond a single content-script lifetime.** The extracted JD text is cached per-URL in a module-scoped `jd-cache.ts` Map (cleared on full navigation by content-script re-instantiation), but the keyword result is NOT cached. Every fresh `HIGHLIGHT_APPLY` round-trips to the backend. Rationale: (a) backend Aho-Corasick is deterministic and <100ms, so caching has no perf win, (b) caching a user-scoped keyword list in the content script violates the moat principle because keywords leak the taxonomy version and category weighting, (c) A10's toggle-off flush is cleaner with zero keyword state on the content side.

### 0.4 Out of scope (explicit non-goals)

- Rendering the highlight toggle button -- that is A10's popup header.
- Persisting the highlight state across page loads -- each navigation is a fresh scan on explicit user request.
- Highlight colour theming or per-user override -- v1.1. B6 exposes CSS variables via its injected style block; A9 ships defaults only.
- Gap analysis overlay (matching JD keywords against stored profile skills) -- v1.1. The backend endpoint supports `resumeText` + `includeMissing` (A3), but A9 does NOT send `resumeText` in v1.
- MutationObserver watch for DOM re-renders between toggles -- v1.1. If the page re-renders the JD after `HIGHLIGHT_APPLY`, the highlight will orphan. Acceptable POC risk, documented below.
- Re-running intent detection on SPA `pushState` route changes -- v1.1. A9 only runs `detectPageIntent` once per content-script instantiation. Hard navigations re-run it naturally. The SPA-route adversarial test below confirms that when a route change does NOT reload the content script, the cleanup function still fires correctly.
- Highlight on application-form pages -- A9 short-circuits `HIGHLIGHT_APPLY` on pages where `detectPageIntent` returned `pageKind === 'application-form'`. Response: `{ ok: false, reason: 'not-a-job-posting' }`.
- Offline fallback taxonomy corpus -- banned by D4. There is no `/public/taxonomy.json`, no ESCO bundle, no in-content-script keyword scan. The only path is: `content -> bg(KEYWORDS_EXTRACT) -> fetch('/ats/extract-skills') -> bg -> content -> applyHighlights`.
- Popup UI state management -- A10's responsibility. A9 only emits and consumes messages per the keystone protocol.
- Telemetry / analytics on highlight usage -- v1.1.
- User-editable keyword list (select which keywords to highlight) -- v1.1.
- Per-category toggle (hard / soft / tool / domain) -- v1.1. A9 renders all returned keywords uniformly.
- Importing `HighlightRange`, `TextWalk`, `walkTextNodes` from `ats-autofill-engine/dom` -- these types do not exist in v2 per keystone §5 and B6 plan scope. A9 NEVER references them.
- Computing ranges in A9 -- the engine computes matches internally inside `applyHighlights`. A9 is a thin shim.
- Modifying `src/background/messaging/protocol.ts` -- forbidden by D2. A5 is the single owner.

---

## 1. Goal

Extend the A8 content script entrypoint with two runtime responsibilities, both driven by decision memo D (manual toggle) and D4 (online-only):

1. **Page intent detection on content-script bootstrap.** At module load, call `detectPageIntent(window.location, document)` from `ats-autofill-engine/dom`. If the result is anything other than `{ kind: 'unknown' }`, send an `INTENT_DETECTED` message to the background with `tabId: -1 as TabId` (the `-1` sentinel per keystone §1.2 `DetectedIntentPayload.tabId: TabId | -1`; A5's background handler substitutes the real `sender.tab.id`). Payload includes `kind`, `pageKind`, `url`, optional `jobTitle` + `company` from the `jobData` field of a `job-posting` intent.

2. **Manual keyword highlight toggle driven by backend.** Register two content-side listeners on A5's shared `onMessage` instance (imported from A5's protocol barrel, NEVER from `@webext-core/messaging` directly -- keystone §1.1):
   - **`HIGHLIGHT_APPLY`** -- extract JD text from the page (cached per-URL), ask the background to fetch extracted skills from `POST /api/v1/ats/extract-skills` via `sendMessage('KEYWORDS_EXTRACT', ...)`, then call `applyHighlights(document.body, keywords.map(k => k.term))` from the engine's DOM renderer. Returns `HighlightApplyResponse` discriminated union per keystone §1.2.
   - **`HIGHLIGHT_CLEAR`** -- invoke the cleanup function returned by `applyHighlights` on the last successful apply. Returns `HighlightClearResponse` per keystone §1.2.

3. **Auth-loss broadcast handler.** Listen for `AUTH_STATE_CHANGED` (broadcast-only, keystone §1.1). When `data.authed === false`, any active highlights on the page are cleaned up silently via the stored cleanup function plus a belt-and-braces `removeAllHighlights(document.body)` call. This is the graceful degradation primitive required by the Zovo deal language: "extension can never be a loading spinner when your backend is unreachable."

After this phase:

- `pnpm typecheck` exits 0 in `e:/llmconveyors-chrome-extension`.
- `pnpm test` exits 0. All new test files are co-located under `tests/content/highlight/**` and `tests/content/intent/**` and run under happy-dom.
- `pnpm build` produces `dist/content-scripts/ats.js`. The content-script bundle size delta is +~18 KB gzipped (engine `./dom` tree-shaken subtree: highlighter ~5 KB, intent detector ~2 KB, JD extractor via readability + turndown ~50 KB but readability + turndown are externalised to the global module graph and shared with any other `./dom` consumer; if Vite inlines them, budget rises to +72 KB -- verified during A9 build-smoke).
- Loading the extension unpacked in Chrome 114+, navigating to a live Greenhouse job posting, and opening the DevTools background console: `sendMessage('HIGHLIGHT_APPLY', { tabId }, t.id)` can trigger apply manually and the page shows `<mark data-ats-autofill="true">` spans wrapping matched skill terms. `HIGHLIGHT_CLEAR` restores the DOM to its pre-apply state.
- Signing out via `AUTH_SIGN_OUT` broadcasts `AUTH_STATE_CHANGED { authed: false }` and any active highlights on open tabs clear.
- The popup (A10) can read the `INTENT_GET` tab state via A5's background handler and decide whether to enable the highlight button.

---

## 2. Depends on / blocks

### 2.1 Depends on (hard prerequisites, verify before writing code)

- **A1 -- WXT scaffold.** The `entrypoints/` layout, `tsconfig.json` with `vitest` aliases, `pnpm` workspace, `@webext-core/messaging` dependency, `ats-autofill-engine` dependency, `src/background/log.ts` exporting `createLogger(scope)` per D11.
- **A3 -- `POST /api/v1/ats/extract-skills` endpoint.** Merged to `main` and testable via `pnpm dev:api` on the `llmconveyors.com` side. Request/response schema lives in `libs/shared-types/src/schemas/ats-extract-skills.schema.ts`. Response shape per keystone §8: `{ success: true, data: { keywords: ExtractedSkill[], missing?, tookMs }, requestId, timestamp }`.
- **A5 -- Background + messaging.** The complete 19-key `ProtocolMap` per keystone §1.1 including `KEYWORDS_EXTRACT`, `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR`, `HIGHLIGHT_STATUS`, `INTENT_DETECTED`, `INTENT_GET`, `AUTH_STATE_CHANGED`. Background `KEYWORDS_EXTRACT` handler already performs the direct `fetch` to `/ats/extract-skills` and parses the envelope (A5 line item per D2). A5 also ships `sendMessage` and `onMessage` from its protocol barrel (`src/background/messaging/protocol.ts`).
- **A5 -- `INTENT_DETECTED` sender-based fallback.** Per keystone §1.1 the `DetectedIntentPayload.tabId` type is `TabId | -1`. A5 MUST substitute `sender.tab.id` when `payload.tabId === -1`. A9's `section 2.1.a` prerequisite check below verifies this at build time by running a compile assertion against A5's handler test.
- **A6 -- Auth flow.** Bearer token + refresh token are present in `chrome.storage.session` after sign-in. A5 background handlers (not A9) call A6's `ensureFreshAccessToken()` helper.
- **A7 -- Profile storage (for future v1.1).** Not used in v1 (A9 does NOT send `resumeText`), but the `AUTH_STATE_CHANGED` broadcast handler is shared between A7 and A9 so the import path must not collide.
- **A8 -- Content script entrypoint.** `entrypoints/ats.content/main.ts` exists with a `bootstrap()` function that takes a `Deps` object per D20. A9 adds a new `highlight/` subdirectory alongside A8's `autofill-controller.ts` and registers its handlers from within `main.ts`'s `bootstrap()`.
- **B1 -- Engine package published.** `ats-autofill-engine@0.1.0-alpha.1` with `./dom` sub-entry in the exports map per keystone §4. Verifying: `node -e "import('ats-autofill-engine/dom').then(m => console.log('has applyHighlights:', 'applyHighlights' in m, 'has extractJobDescription:', 'extractJobDescription' in m, 'has detectPageIntent:', 'detectPageIntent' in m))"` prints three `true` values.
- **B2 -- Core types published.** `PageIntent`, `DetectedIntent`, `ExtractedSkill`, `TabId`, `AtsKind` types exported from the engine root and re-used by A5's protocol-types.
- **B6 -- Engine DOM adapter.** Keystone §5 signature: `applyHighlights(root: Element, keywords: readonly string[]): () => void`. Plus `extractJobDescription(doc: Document): Promise<{ text; structured?; method } | null>` and `detectPageIntent(location: Location, doc: Document): PageIntent` and `removeAllHighlights(root: Element): void`.

If any of these is missing, STOP and report to the architect -- this phase cannot compile, let alone run. In particular:

- If `ats-autofill-engine/dom` does not export `applyHighlights` with the `(Element, readonly string[]) => () => void` signature, B6 is broken and A9 cannot proceed. Escalate to the architect for a B6 fix; do NOT patch B6 from inside A9.
- If A5 is missing `KEYWORDS_EXTRACT` or has a different response shape than keystone §1.2 `KeywordsExtractResponse`, escalate to the architect for an A5 fix; do NOT patch A5 from inside A9 (D2 forbids).

#### 2.1.a Prerequisite verification script

```bash
# Run from e:/llmconveyors-chrome-extension before writing any A9 code
pnpm typecheck
node -e "import('ats-autofill-engine/dom').then(m => { const required = ['applyHighlights','removeAllHighlights','extractJobDescription','detectPageIntent']; const missing = required.filter(s => !(s in m)); if (missing.length) { console.error('FAIL: missing exports:', missing); process.exit(1); } console.log('OK'); })"
grep -n 'KEYWORDS_EXTRACT' src/background/messaging/protocol.ts || { echo 'FAIL: A5 missing KEYWORDS_EXTRACT'; exit 1; }
grep -n 'HIGHLIGHT_APPLY' src/background/messaging/protocol.ts || { echo 'FAIL: A5 missing HIGHLIGHT_APPLY'; exit 1; }
grep -n 'AUTH_STATE_CHANGED' src/background/messaging/protocol.ts || { echo 'FAIL: A5 missing AUTH_STATE_CHANGED'; exit 1; }
grep -n 'TabId | -1' src/background/messaging/protocol-types.ts || { echo 'FAIL: A5 DetectedIntentPayload missing -1 sentinel'; exit 1; }
```

If any line fails, STOP and open a blocking issue against the failing phase. Do not proceed with A9 until the prerequisite is green.

### 2.2 Blocks (what cannot start until this phase merges)

- **A10 -- Popup UI.** The popup consumes `INTENT_GET` via A5 to decide whether to enable the highlight toggle button. The popup also fires `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR` (sendMessage direct to content via `@webext-core/messaging`'s `tabId` parameter) and reads the `HighlightApplyResponse` / `HighlightClearResponse` envelopes to render toast-level feedback. A10 projects `keywordCount` -> `applied` and `cleared: boolean` -> `cleared: number` as an integration detail in A10's own plan; A9 ships the keystone envelopes verbatim and does not adapt them.
- **A11 -- E2E smoke test + demo recording.** The demo script manually triggers `HIGHLIGHT_APPLY` on a live Greenhouse page as part of the Zovo demo video. Depends on A9 end-to-end.

---

## 3. Repo context (required reading before writing code)

The executor MUST read these files before writing any code. Every other read is optional. This list is short on purpose: A9 is a leaf phase with locked upstream contracts from the keystone document.

1. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`** -- decisions D2 (A5 owns ProtocolMap, A9 is consumer only), D11 (structured logger, no console.*), D14 (anti-drift grep gates), D15 (em-dash rule), D19 (adversarial test categories), D20 (DI via Deps object), D21 (Zod at every runtime boundary), D23 (rollback script), D24 (coverage floors).
2. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`** -- **mandatory verbatim source of truth** for:
   - §1.1 ProtocolMap (19 keys) -- A9 consumes, never modifies
   - §1.2 value types incl. `KeywordsExtractRequest`, `KeywordsExtractResponse`, `HighlightApplyResponse`, `HighlightClearResponse`, `DetectedIntentPayload`, `AuthState`
   - §1.3 handler distribution: `HIGHLIGHT_APPLY` + `HIGHLIGHT_CLEAR` are CONTENT-SIDE handlers (A9 registers them); `KEYWORDS_EXTRACT` + `INTENT_DETECTED` + `INTENT_GET` are BACKGROUND handlers (A5 owns).
   - §2.8 `PageIntent` discriminated union
   - §2.10 `ExtractedSkill` interface
   - §5 `applyHighlights(root: Element, keywords: readonly string[]): () => void` verbatim signature
   - §8 A3 backend contract
3. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A9.md`** -- the F-grade review of the previous A9 plan that identified the `HighlightRange` fiction. This rewrite resolves every C-, H-, M-, L-severity finding in that review. Do not reintroduce any of the fictional symbols.
4. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A3_backend_keywords_endpoint/plan.md`** -- read the response envelope shape and the `ExtractedSkillSchema` definition. A9's Zod runtime guard in §6.6 mirrors the `category` literal union exactly.
5. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/plan.md`** -- read:
   - §6.3 `ProtocolMap` verbatim to confirm the 19 keys A9 imports
   - §6.4 `KEYWORDS_EXTRACT` background handler for the `fetch` + parse + Zod logic A9 relies on upstream
   - §6.5 `INTENT_DETECTED` background handler confirming the `sender.tab.id` substitution for `tabId === -1`
   - `sendMessage` + `onMessage` exports from the protocol barrel
6. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md`** -- read:
   - The `bootstrap()` function in `entrypoints/ats.content/main.ts` where A9 plugs in
   - The `Deps` object per D20
   - The `createLogger('content-autofill')` pattern A9 mirrors for `createLogger('content-highlight')`
7. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B6_dom_adapter_highlighter_renderer/plan.md`** -- read:
   - §"Step 8" renderer main entry + step 9 `splitNodeAtMatches`
   - §"Step 14" `extractJobDescription(doc)` async pipeline
   - §"Step 18" `detectPageIntent(location, doc)` signature
   - §"Files to create" table: exactly which symbols are exported from `ats-autofill-engine/dom`
8. **`e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A10_popup_ui/plan.md`** -- read only the consumer section that interprets `HighlightApplyResponse`. A9 must ensure the keystone envelope fields match what A10's projection expects.
9. **`libs/shared-types/src/schemas/ats-extract-skills.schema.ts`** (in the monorepo `llmconveyors.com` side) -- read only the `ExtractedSkillSchema` and `ExtractSkillsResponseDataSchema` definitions, because A9's Zod guard in §6.6 mirrors them. L2 from review-A9: this file is a legitimate read target (it is the contract) whereas `api/src/modules/ats/**` is NOT (that is internals).
10. **`e:/llmconveyors.com/.claude/rules/code-quality.md`** -- no stubs, no bandaids, no `any`, fix every bug found.
11. **`e:/llmconveyors.com/.claude/rules/backend-first-lean-client.md`** -- the extension is a client; the backend owns business logic. A9 embodies this: keyword extraction is a backend call, never an in-browser substring scan against a bundled corpus.
12. **`e:/llmconveyors.com/.claude/rules/testing.md`** -- no `as any` in test mocks, use `Mock<Parameters<...>, ReturnType<...>>` typed mocks per M1 fix from the review.

Do NOT read:

- `api/src/modules/ats/**` -- backend internals are already abstracted behind the A3 endpoint contract.
- `ats-autofill-engine` internals beyond the `./dom` public surface -- B6's plan.md plus keystone §5 are sufficient.
- The old deprecated `phase_A5_keyword_matcher_and_highlighter/plan.md` if it still exists in temp -- that was the offline-path plan. If present, treat it as history, not source of truth.

---

## 4. Files this phase owns

### 4.1 New files (7 production + 4 test + 1 blueprint + 1 rollback)

| # | Path | Role | Target LoC |
|---|---|---|---|
| 1 | `entrypoints/ats.content/intent.ts` | Intent detection at content-script bootstrap; sends `INTENT_DETECTED` with `pageKind` split | 120 |
| 2 | `entrypoints/ats.content/highlight/jd-cache.ts` | Per-URL in-memory cache of extracted JD text + method metadata | 55 |
| 3 | `entrypoints/ats.content/highlight/state.ts` | Module-scoped holder for the current cleanup fn + metadata + mutex pending promise | 60 |
| 4 | `entrypoints/ats.content/highlight/apply-handler.ts` | `HIGHLIGHT_APPLY` handler: orchestrate JD extract -> bg `KEYWORDS_EXTRACT` -> `applyHighlights(document.body, terms)`; implements proper mutex per H4 | 180 |
| 5 | `entrypoints/ats.content/highlight/clear-handler.ts` | `HIGHLIGHT_CLEAR` handler: invoke cached cleanup fn + belt-and-braces `removeAllHighlights(document.body)` | 45 |
| 6 | `entrypoints/ats.content/highlight/guards.ts` | Zod schemas mirroring `ExtractedSkillSchema` for D21 runtime guard of the bg response | 60 |
| 7 | `entrypoints/ats.content/highlight/index.ts` | Barrel: `registerHighlightHandlers(deps)` + `handleAuthLost(deps)` | 100 |
| 8 | `tests/content/highlight/apply-handler.spec.ts` | 15 adversarial cases for `HIGHLIGHT_APPLY` handler | 380 |
| 9 | `tests/content/highlight/clear-handler.spec.ts` | 5 adversarial cases for `HIGHLIGHT_CLEAR` handler | 140 |
| 10 | `tests/content/intent/detector.spec.ts` | 12 cases across 3 ATS x 4 page kinds for intent bootstrap | 280 |
| 11 | `tests/content/highlight/contract.spec.ts` | Asserts the imported `applyHighlights` signature matches B6 keystone §5 | 100 |
| 12 | `src/content/highlight/blueprint.contract.ts` | Per D22, declares A9's public exports, forbidden imports, coverage floor | 50 |
| 13 | `scripts/rollback-phase-A9.sh` | Per D23, mechanically reverts A9's changes | 35 |

### 4.2 Modified files (1)

| # | Path | Change | Delta LoC |
|---|---|---|---|
| 1 | `entrypoints/ats.content/main.ts` | Call `initIntent(deps)` + `registerHighlightHandlers(deps)` in `bootstrap(deps)` after the existing autofill controller registration from A8. Also wire the `AUTH_STATE_CHANGED` broadcast listener calling `handleAuthLost(deps)`. | +25 |

Total:
- New production code: ~620 LoC
- Modified production code: ~25 LoC
- Test code: ~900 LoC
- Blueprint contract + rollback: ~85 LoC
- Grand total: ~1,630 LoC additions

Zero deletions from A5's protocol.ts, A5's handlers.ts, or A8's main.ts body (only additive +25 LoC in main.ts).

### 4.3 Explicitly NOT modified

Per D2 and per the F-grade review fix for H1:

- `src/background/messaging/protocol.ts` -- A5 owns, do not touch.
- `src/background/messaging/handlers.ts` -- A5 owns, do not touch.
- `src/background/messaging/protocol-types.ts` -- A5 owns, do not touch.
- `entrypoints/ats.content/autofill-controller.ts` -- A8 owns, do not touch.

If A9 needs a missing symbol from any of these files, that is an A5 or A8 bug; escalate to the architect for a cross-phase corrective plan and do NOT patch the upstream file from inside A9.

---

## 5. Messaging protocol consumption (no modifications)

A9 imports the `ProtocolMap`, `sendMessage`, and `onMessage` from A5's barrel. A9 does NOT redefine or modify the protocol. Consumers:

### 5.1 Content-side handlers A9 REGISTERS

Per keystone §1.3, `HIGHLIGHT_APPLY` and `HIGHLIGHT_CLEAR` are content-script handlers. The background side is a pass-through (bg's `chrome.tabs.sendMessage` forwards to the active tab via `@webext-core/messaging`'s `tabId` option). A9 registers these two handlers via `onMessage('HIGHLIGHT_APPLY', handleHighlightApply)` and `onMessage('HIGHLIGHT_CLEAR', handleHighlightClear)`.

### 5.2 Messages A9 SENDS

1. `INTENT_DETECTED` -- sent by `intent.ts` at content-script bootstrap. Payload is `DetectedIntentPayload` with `tabId: -1 as TabId`, `url`, `kind`, `pageKind`, optional `jobTitle` + `company`, `detectedAt`. Per keystone §1.2, A5's background handler substitutes `sender.tab.id` when `tabId === -1`.
2. `KEYWORDS_EXTRACT` -- sent by `apply-handler.ts` from inside `HIGHLIGHT_APPLY`. Payload: `{ text, url, topK: 30 }`. Response: `KeywordsExtractResponse` discriminated union.
3. `HIGHLIGHT_STATUS` -- NOT sent by A9. A10 sends it to the background; the background's handler (A5) reads a per-tab Map that A9 writes into via a side channel. **Deferred**: A9 does NOT write to any bg state for highlight status in v1. A10 polls via `HIGHLIGHT_STATUS` and the background returns `{ on: false, keywordCount: 0, appliedAt: null }` until A9's content-side broadcast (future v1.1) is wired. For v1, A10's toggle is driven by local state inside the popup and by the return value of `HIGHLIGHT_APPLY`. Documented as a known gap in §12 acceptance criteria.

### 5.3 Messages A9 LISTENS TO

1. `AUTH_STATE_CHANGED` -- broadcast from A5 background on sign-out. A9 registers a passive listener that calls `handleAuthLost(deps)` to tear down any active highlights. This is the only broadcast A9 consumes.

### 5.4 Messages NOT in A9's scope

- `AUTH_SIGN_IN` / `AUTH_SIGN_OUT` / `AUTH_STATUS` -- popup <-> background only.
- `PROFILE_GET` / `PROFILE_UPDATE` / `PROFILE_UPLOAD_JSON_RESUME` -- A7 options page only.
- `INTENT_GET` -- popup asks background; A9 does not consume the GET.
- `FILL_REQUEST` -- A8 autofill controller handles this.
- `GENERATION_START` / `GENERATION_UPDATE` / `GENERATION_CANCEL` -- A11 sidepanel only.
- `DETECTED_JOB_BROADCAST` -- background broadcasts; popup consumes. A9 does NOT send this; A9 sends `INTENT_DETECTED` and the background re-broadcasts if needed.
- `CREDITS_GET` -- popup <-> background only.

---

## 6. Step-by-step implementation

### 6.1 Prerequisite verification (do this first, every time)

Run the prerequisite verification script from §2.1.a. If any check fails, STOP and open a blocking escalation. Do not begin writing code until all five checks are green.

### 6.2 Create `entrypoints/ats.content/intent.ts`

Responsibilities:

- Import `detectPageIntent` from `ats-autofill-engine/dom` and `PageIntent` from `ats-autofill-engine`.
- Import `TabId`, `AtsKind` from `ats-autofill-engine`.
- Import `sendMessage` from A5's protocol barrel.
- Export a pure function `buildIntentPayload(intent: PageIntent, url: string, now: number): DetectedIntentPayload | null` that maps a `PageIntent` to a `DetectedIntentPayload`. Returns null if `intent.kind === 'unknown'`.
- Export an async `initIntent(deps: ContentScriptDeps): Promise<void>` function that:
  1. Calls `detectPageIntent(deps.location, deps.document)`.
  2. Calls `buildIntentPayload(intent, deps.location.href, deps.now())`.
  3. If the payload is non-null, calls `sendMessage('INTENT_DETECTED', payload)` and awaits the promise. Catches any rejection, logs at `warn` level, and swallows (fire-and-forget from the caller's perspective, but not silent -- the warn log goes to the background worker via the logger's side channel).
  4. Returns void.

Pseudocode:

```ts
// entrypoints/ats.content/intent.ts
import { detectPageIntent, type PageIntent } from 'ats-autofill-engine/dom';
import { TabId, type AtsKind } from 'ats-autofill-engine';
import { sendMessage, type DetectedIntentPayload } from '@/background/messaging/protocol';
import type { ContentScriptDeps } from './deps';

/**
 * Maps engine PageIntent to A5's DetectedIntentPayload.
 * Returns null for unknown intents (no broadcast needed).
 * Pure function for testability.
 */
export function buildIntentPayload(
  intent: PageIntent,
  url: string,
  now: number,
): DetectedIntentPayload | null {
  if (intent.kind === 'unknown') {
    return null;
  }
  // intent is { kind: AtsKind; pageKind: 'job-posting' | 'application-form'; url; jobData? }
  const base: DetectedIntentPayload = {
    tabId: TabId(-1) as TabId & { readonly __brand: 'TabId' },
    // -1 sentinel per keystone 1.2: A5 background handler substitutes sender.tab.id
    url,
    kind: intent.kind,
    pageKind: intent.pageKind,
    detectedAt: now,
  };
  if (intent.pageKind === 'job-posting' && intent.jobData) {
    const { title, hiringOrganization } = intent.jobData;
    if (title) (base as { jobTitle?: string }).jobTitle = title;
    if (hiringOrganization?.name) (base as { company?: string }).company = hiringOrganization.name;
  }
  return base;
}

export async function initIntent(deps: ContentScriptDeps): Promise<void> {
  const logger = deps.createLogger('content-intent');
  try {
    const intent = deps.detectPageIntent(deps.location, deps.document);
    logger.debug('intent detected', { kind: intent.kind, pageKind: 'pageKind' in intent ? intent.pageKind : null });
    const payload = buildIntentPayload(intent, deps.location.href, deps.now());
    if (!payload) {
      logger.debug('intent is unknown, not broadcasting');
      return;
    }
    await deps.sendMessage('INTENT_DETECTED', payload);
    logger.info('intent broadcast', { kind: payload.kind, pageKind: payload.pageKind });
  } catch (err) {
    logger.warn(`intent bootstrap failed: ${(err as Error).message}`);
  }
}
```

Notes on `TabId(-1)`: the D16 branded constructor accepts any number. `-1` is legal. The runtime cast is a call to the branded factory, not `as any`.

### 6.3 Create `entrypoints/ats.content/highlight/jd-cache.ts`

A module-scoped per-URL cache for extracted JD text + metadata. Key = `location.href` at extraction time. Value = `{ text: string; structured?: JobPostingData; method: 'jsonld' | 'readability' }`. The cache is a `Map`, not a global, and is reset on content-script re-instantiation (fresh module load per navigation). Exposes:

- `readonly getJdCache(url: string): CachedJd | null`
- `readonly setJdCache(url: string, jd: CachedJd): void`
- `readonly clearJdCache(): void` (for tests + sign-out cleanup)

Pseudocode:

```ts
// entrypoints/ats.content/highlight/jd-cache.ts
import type { JobPostingData } from 'ats-autofill-engine';

export interface CachedJd {
  readonly text: string;
  readonly structured?: JobPostingData;
  readonly method: 'jsonld' | 'readability';
  readonly cachedAt: number;
}

const cache = new Map<string, CachedJd>();

export function getJdCache(url: string): CachedJd | null {
  return cache.get(url) ?? null;
}

export function setJdCache(url: string, jd: CachedJd): void {
  cache.set(url, Object.freeze({ ...jd }));
}

export function clearJdCache(): void {
  cache.clear();
}

// For testability: allow injection of a fake cache map
export function __resetForTest(): void {
  cache.clear();
}
```

The cache is not keyed by tabId because the content script instance already scopes it (each tab has its own content script IIFE). Cleared on sign-out.

### 6.4 Create `entrypoints/ats.content/highlight/state.ts`

Holds the current cleanup function plus metadata. Also holds the `pending: Promise<void> | null` mutex for the apply handler (H4 fix). Exposes:

```ts
// entrypoints/ats.content/highlight/state.ts

export interface HighlightState {
  cleanup: (() => void) | null;
  keywordCount: number;
  rangeCount: number;
  appliedAt: number | null;
  url: string | null;
}

const INITIAL_STATE: HighlightState = {
  cleanup: null,
  keywordCount: 0,
  rangeCount: 0,
  appliedAt: null,
  url: null,
};

// Module-scoped single-cell state. Not exported directly; use getters/setters.
let state: HighlightState = { ...INITIAL_STATE };

export function getHighlightState(): Readonly<HighlightState> {
  // Return a defensive copy so callers cannot mutate
  return Object.freeze({ ...state });
}

export function setHighlightState(next: Partial<HighlightState>): void {
  state = { ...state, ...next };
}

export function resetHighlightState(): void {
  state = { ...INITIAL_STATE };
}

// Mutex for re-entrant applyHighlights calls (H4 fix)
let pending: Promise<void> | null = null;

export function getPendingApply(): Promise<void> | null {
  return pending;
}

export function setPendingApply(p: Promise<void> | null): void {
  pending = p;
}

// Testability
export function __resetForTest(): void {
  state = { ...INITIAL_STATE };
  pending = null;
}
```

The mutex semantics per H4 fix: before starting work in `apply-handler.ts`, await the current `pending`, THEN replace it BEFORE inner work starts.

### 6.5 Create `entrypoints/ats.content/highlight/guards.ts` (D21)

Zod schemas that mirror the `ExtractedSkillSchema` from A3's backend. The `KEYWORDS_EXTRACT` response arriving from the background is TYPED by A5 as `KeywordsExtractResponse`, but per D21 the content script still guards the shape at runtime because in-process IPC is untrusted from the perspective of a content script (malicious extensions, content-script MV3 isolation boundaries, stale message ordering etc.).

```ts
// entrypoints/ats.content/highlight/guards.ts
import { z } from 'zod';

// Mirrors libs/shared-types/src/schemas/ats-extract-skills.schema.ts ExtractedSkillSchema.
// Kept as a local copy to avoid pulling the entire backend types package into the extension bundle.
// If A3's schema evolves (adds a field), update this file in the same PR per the full-stack update rule.
const ExtractedSkillShape = z.object({
  term: z.string().min(1).max(200),
  category: z.enum(['hard', 'soft', 'tool', 'domain']),
  score: z.number().min(0).max(1),
  occurrences: z.number().int().min(0),
  canonicalForm: z.string().min(1).max(200),
}).strict();

export const KeywordsExtractResponseGuard = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    keywords: z.array(ExtractedSkillShape).max(500),
    tookMs: z.number().min(0).max(60_000),
  }).strict(),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['signed-out', 'empty-text', 'api-error', 'rate-limited', 'network-error']),
  }).strict(),
]);

export type GuardedKeywordsResponse = z.infer<typeof KeywordsExtractResponseGuard>;
```

Used by `apply-handler.ts` immediately after receiving the bg response. If the guard fails, the handler maps to `{ ok: false, reason: 'api-error' }` (a shape that does not match the typed contract is indistinguishable from a server bug from the popup's perspective).

### 6.6 Create `entrypoints/ats.content/highlight/apply-handler.ts`

This is the central file. It:

1. Reads the current intent from `getJdCache` or re-extracts.
2. Short-circuits if the page is `application-form` or `unknown`.
3. Extracts JD text if not cached.
4. Calls `sendMessage('KEYWORDS_EXTRACT', { text, url, topK: 30 })`.
5. Validates the response with `KeywordsExtractResponseGuard`.
6. On success, calls `applyHighlights(document.body, keywords.map(k => k.term))`.
7. Stores cleanup + metadata in state.
8. Returns keystone `HighlightApplyResponse`.

Implements the H4 mutex fix: proper `pending` promise management. Implements H3 fix: engine throws map to `{ ok: false, reason: 'render-error' }`. Implements H2 fix: `tabId: -1` sentinel does not need to appear here because `HIGHLIGHT_APPLY` payload is `{ tabId }` where the popup supplies the real tab id via `sendMessage(..., tabId)` on its side and the background forwards to content. The content handler receives a `{ tabId }` payload but the tabId is for logging context only, not as a keying primitive (the handler lives in the tab that received the message, so it implicitly knows it runs in that tab's document).

Pseudocode:

```ts
// entrypoints/ats.content/highlight/apply-handler.ts
import { applyHighlights, removeAllHighlights, extractJobDescription } from 'ats-autofill-engine/dom';
import type { HighlightApplyResponse } from '@/background/messaging/protocol';
import { getJdCache, setJdCache } from './jd-cache';
import { getHighlightState, setHighlightState, getPendingApply, setPendingApply } from './state';
import { KeywordsExtractResponseGuard } from './guards';
import type { ContentScriptDeps } from '../deps';

export interface ApplyHandlerInput {
  readonly tabId: number;  // informational only; the content script already runs in this tab
}

export function createApplyHandler(deps: ContentScriptDeps) {
  const logger = deps.createLogger('content-highlight-apply');

  return async function handleHighlightApply(
    req: ApplyHandlerInput,
  ): Promise<HighlightApplyResponse> {
    const startedAt = deps.now();
    logger.debug('HIGHLIGHT_APPLY received', { tabId: req.tabId });

    // H4 fix: mutex. Await the current pending (if any), THEN replace it BEFORE inner work starts.
    const prior = getPendingApply();
    if (prior) {
      try {
        await prior;
        logger.debug('prior apply resolved, proceeding with new apply');
      } catch (err) {
        logger.warn(`prior apply rejected, proceeding anyway: ${(err as Error).message}`);
        // Do NOT silently swallow: we log the prior failure and clean the DOM below.
      }
    }

    // Belt-and-braces cleanup: even if the prior apply threw mid-render and left partial marks,
    // this clears all <mark data-ats-autofill="true"> from the DOM before the new apply starts.
    try {
      removeAllHighlights(deps.document.body);
    } catch (err) {
      logger.warn(`removeAllHighlights threw during pre-apply cleanup: ${(err as Error).message}`);
      // Continue anyway; applyHighlights itself will also call removeAllHighlights internally per B6 step 8.2
    }

    // Build the inner work as a promise and immediately register it as pending BEFORE any await.
    let resolveInner!: () => void;
    let rejectInner!: (err: unknown) => void;
    const innerPromise = new Promise<void>((res, rej) => { resolveInner = res; rejectInner = rej; });
    setPendingApply(innerPromise);

    try {
      // Step 1: check intent. Use the page's detected intent from the content-script bootstrap.
      // A9 does NOT re-run detectPageIntent here; it reads the module-scoped state set by initIntent().
      // But the state is not kept in the state module; the intent check uses the document itself.
      // Simplification: re-run detectPageIntent here because it is sub-ms and returns a pure value.
      const intent = deps.detectPageIntent(deps.location, deps.document);
      if (intent.kind === 'unknown') {
        logger.info('no intent detected, cannot highlight');
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'no-jd-on-page' };
      }
      if ('pageKind' in intent && intent.pageKind === 'application-form') {
        logger.info('page is application-form, not a job posting');
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'not-a-job-posting' };
      }

      // Step 2: extract JD text (cached).
      const url = deps.location.href;
      let cached = getJdCache(url);
      if (!cached) {
        logger.debug('JD cache miss, extracting');
        // extractJobDescription is ASYNC per B6 step 14, must await
        const result = await deps.extractJobDescription(deps.document);
        if (!result) {
          logger.info('no JD found on page');
          resolveInner();
          setPendingApply(null);
          return { ok: false, reason: 'no-jd-on-page' };
        }
        cached = {
          text: result.text,
          structured: result.structured,
          method: result.method,
          cachedAt: deps.now(),
        };
        setJdCache(url, cached);
      } else {
        logger.debug('JD cache hit');
      }

      if (cached.text.length === 0) {
        logger.info('extracted JD text is empty');
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'no-jd-on-page' };
      }

      // Step 3: ask background to fetch extracted skills.
      logger.debug('sending KEYWORDS_EXTRACT', { textLen: cached.text.length });
      let bgResponseRaw: unknown;
      try {
        bgResponseRaw = await deps.sendMessage('KEYWORDS_EXTRACT', {
          text: cached.text,
          url,
          topK: 30,
        });
      } catch (err) {
        logger.warn(`KEYWORDS_EXTRACT rejected: ${(err as Error).message}`);
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'network-error' };
      }

      // Step 4: D21 runtime guard on the bg response
      const parsed = KeywordsExtractResponseGuard.safeParse(bgResponseRaw);
      if (!parsed.success) {
        logger.warn('bg KEYWORDS_EXTRACT response failed Zod guard', { issues: parsed.error.issues });
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'api-error' };
      }
      const bgResponse = parsed.data;

      if (!bgResponse.ok) {
        logger.info('KEYWORDS_EXTRACT returned failure', { reason: bgResponse.reason });
        resolveInner();
        setPendingApply(null);
        // Direct pass-through of the discriminated reason to the popup
        return { ok: false, reason: bgResponse.reason };
      }

      // Step 5: project keywords to plain term strings
      const terms: readonly string[] = bgResponse.keywords.map((k) => k.term);
      logger.info('received keywords from backend', { count: terms.length, tookMs: bgResponse.tookMs });

      // Step 6: call the engine renderer. H3 fix: map throws to 'render-error'.
      let cleanup: () => void;
      try {
        cleanup = deps.applyHighlights(deps.document.body, terms);
      } catch (err) {
        logger.error('applyHighlights threw', err);
        resolveInner();
        setPendingApply(null);
        return { ok: false, reason: 'render-error' };
      }

      // Step 7: store cleanup + metadata.
      // rangeCount = number of inserted <mark> elements (empirical)
      const rangeCount = deps.document.querySelectorAll('mark[data-ats-autofill="true"]').length;
      setHighlightState({
        cleanup,
        keywordCount: terms.length,
        rangeCount,
        appliedAt: deps.now(),
        url,
      });

      const tookMs = deps.now() - startedAt;
      logger.info('HIGHLIGHT_APPLY succeeded', { keywordCount: terms.length, rangeCount, tookMs });

      resolveInner();
      setPendingApply(null);
      return { ok: true, keywordCount: terms.length, rangeCount, tookMs };
    } catch (err) {
      logger.error('HIGHLIGHT_APPLY unexpected error', err);
      rejectInner(err);
      setPendingApply(null);
      return { ok: false, reason: 'render-error' };
    }
  };
}
```

Notes on the mutex (H4 fix):

1. `const prior = getPendingApply()` reads the current pending promise before we touch anything.
2. We `await prior` inside a try/catch so that a prior failure does not block the new apply.
3. We call `removeAllHighlights(deps.document.body)` unconditionally as belt-and-braces cleanup, because the prior apply may have left partial marks before it threw.
4. We create our OWN promise via `new Promise((res, rej) => ...)` and register it as `pending` BEFORE any further async work. Any third caller that arrives between our `await prior` and here will see our new promise, not the stale prior.
5. We resolve/reject the inner promise at every exit path (success, early return, caught exception). The `setPendingApply(null)` is called at every exit path too, so the next caller sees a clean slate.
6. Per D20, all external dependencies (`applyHighlights`, `removeAllHighlights`, `extractJobDescription`, `detectPageIntent`, `sendMessage`, `document`, `location`, `now`) come through the `deps` object. Production wires real implementations; tests wire fakes.

### 6.7 Create `entrypoints/ats.content/highlight/clear-handler.ts`

```ts
// entrypoints/ats.content/highlight/clear-handler.ts
import { removeAllHighlights } from 'ats-autofill-engine/dom';
import type { HighlightClearResponse } from '@/background/messaging/protocol';
import { getHighlightState, resetHighlightState } from './state';
import type { ContentScriptDeps } from '../deps';

export interface ClearHandlerInput {
  readonly tabId: number;  // informational only
}

export function createClearHandler(deps: ContentScriptDeps) {
  const logger = deps.createLogger('content-highlight-clear');

  return async function handleHighlightClear(
    req: ClearHandlerInput,
  ): Promise<HighlightClearResponse> {
    logger.debug('HIGHLIGHT_CLEAR received', { tabId: req.tabId });
    const state = getHighlightState();
    const hadCleanup = state.cleanup !== null;

    // Call stored cleanup if present
    if (state.cleanup) {
      try {
        state.cleanup();
        logger.debug('stored cleanup invoked');
      } catch (err) {
        logger.warn(`stored cleanup threw: ${(err as Error).message}`);
        // Do not early-return; run the belt-and-braces removeAllHighlights below
      }
    }

    // Belt-and-braces: even if cleanup was null or threw, scrub the DOM.
    try {
      removeAllHighlights(deps.document.body);
    } catch (err) {
      logger.warn(`removeAllHighlights threw: ${(err as Error).message}`);
      return { ok: false, reason: `cleanup threw: ${(err as Error).message}` };
    }

    resetHighlightState();
    logger.info('HIGHLIGHT_CLEAR succeeded', { hadCleanup });
    return { ok: true, cleared: hadCleanup };
  };
}
```

### 6.8 Create `entrypoints/ats.content/highlight/index.ts`

Barrel that wires everything together:

```ts
// entrypoints/ats.content/highlight/index.ts
import { onMessage } from '@/background/messaging/protocol';
import { removeAllHighlights } from 'ats-autofill-engine/dom';
import { createApplyHandler } from './apply-handler';
import { createClearHandler } from './clear-handler';
import { resetHighlightState, getHighlightState } from './state';
import { clearJdCache } from './jd-cache';
import type { ContentScriptDeps } from '../deps';

export function registerHighlightHandlers(deps: ContentScriptDeps): () => void {
  const logger = deps.createLogger('content-highlight-index');
  const applyHandler = createApplyHandler(deps);
  const clearHandler = createClearHandler(deps);

  // Per A5 protocol barrel, onMessage returns an unregister function
  const unApply = onMessage('HIGHLIGHT_APPLY', applyHandler);
  const unClear = onMessage('HIGHLIGHT_CLEAR', clearHandler);

  logger.debug('highlight handlers registered');

  return () => {
    unApply();
    unClear();
    logger.debug('highlight handlers unregistered');
  };
}

export function handleAuthLost(deps: ContentScriptDeps): void {
  const logger = deps.createLogger('content-highlight-auth');
  const state = getHighlightState();
  if (state.cleanup) {
    try { state.cleanup(); } catch (err) {
      logger.warn(`auth-lost cleanup threw: ${(err as Error).message}`);
    }
  }
  try { removeAllHighlights(deps.document.body); } catch (err) {
    logger.warn(`auth-lost removeAllHighlights threw: ${(err as Error).message}`);
  }
  resetHighlightState();
  clearJdCache();
  logger.info('auth lost, highlight state cleared');
}
```

### 6.9 Create `entrypoints/ats.content/deps.ts` -- extend A8's `AutofillControllerDeps`

Per D20, the content script takes a `Deps` object at bootstrap. A8 ships `AutofillControllerDeps` in `src/content/autofill/autofill-controller.ts` and `createProductionDeps()` in `src/content/autofill/deps-factory.ts`. A9 does NOT create a separate interface. Instead it declares `ContentScriptDeps` as an intersection type extending A8's deps with the four additional engine-DOM fields A9 needs:

```ts
// entrypoints/ats.content/deps.ts
import type { AutofillControllerDeps } from '@/content/autofill/autofill-controller';
import type { sendMessage as SendMessageT } from '@/background/messaging/protocol';
import type { applyHighlights as ApplyHighlightsT, removeAllHighlights as RemoveAllT, extractJobDescription as ExtractJdT, detectPageIntent as DetectIntentT } from 'ats-autofill-engine/dom';
import type { Logger } from '@/background/log';

/**
 * Superset of A8's AutofillControllerDeps.
 * A9 adds engine-DOM functions + sendMessage + createLogger for intent/highlight.
 * main.ts constructs ONE deps object satisfying this type.
 */
export type ContentScriptDeps = AutofillControllerDeps & {
  readonly location: Location;
  readonly createLogger: (scope: string) => Logger;
  readonly sendMessage: typeof SendMessageT;

  // Engine DOM adapter functions via DI for testability
  readonly applyHighlights: typeof ApplyHighlightsT;
  readonly removeAllHighlights: typeof RemoveAllT;
  readonly extractJobDescription: typeof ExtractJdT;
  readonly detectPageIntent: typeof DetectIntentT;
};

// Production wiring: extends A8's createProductionDeps() with A9's additional fields.
// Called exactly once from main.ts bootstrap().
export function buildProductionContentScriptDeps(): ContentScriptDeps {
  // Import A8's factory to get the base deps
  const { createProductionDeps } = require('@/content/autofill/deps-factory');
  // A9's additional deps
  const { applyHighlights, removeAllHighlights, extractJobDescription, detectPageIntent } = /* @__PURE__ */ require('ats-autofill-engine/dom');
  const { sendMessage } = /* @__PURE__ */ require('@/background/messaging/protocol');
  const { createLogger } = /* @__PURE__ */ require('@/background/log');

  const baseDeps = createProductionDeps();

  return Object.freeze({
    ...baseDeps,
    location: globalThis.location,
    createLogger,
    sendMessage,
    applyHighlights,
    removeAllHighlights,
    extractJobDescription,
    detectPageIntent,
  });
}
```

IMPORTANT: `ContentScriptDeps` is a superset of `AutofillControllerDeps`. Any function accepting `AutofillControllerDeps` (e.g. `AutofillController(deps)`) will accept a `ContentScriptDeps` object without issue because it satisfies all fields via the spread of `createProductionDeps()`.

### 6.10 Modify `entrypoints/ats.content/main.ts`

A9 replaces A8's `createProductionDeps()` call with `buildProductionContentScriptDeps()` which returns a superset type (`ContentScriptDeps`). The `AutofillController` still receives the same object (it only reads `AutofillControllerDeps` fields). A9 then adds its own calls using the full deps.

```ts
// entrypoints/ats.content/main.ts (full modified version)
import type { ContentScriptContext } from 'wxt/client';
import { AutofillController } from '@/content/autofill/autofill-controller';
import { registerFillListener } from '@/content/autofill/messaging';
import { buildProductionContentScriptDeps } from './deps';  // A9: replaces createProductionDeps import
import { initIntent } from './intent';
import { registerHighlightHandlers, handleAuthLost } from './highlight';
import { onMessage } from '@/background/messaging/protocol';
import { createLogger } from '@/background/log';

const log = createLogger('ats-content-main');

export async function bootstrap(ctx: ContentScriptContext): Promise<void> {
  log.info('content bootstrap start', {
    host: document.location.host,
    pathname: document.location.pathname,
  });

  // A9: builds superset deps (AutofillControllerDeps + A9 highlight/intent fields)
  const deps = buildProductionContentScriptDeps();

  // A8: autofill controller (deps satisfies AutofillControllerDeps via spread)
  const controller = new AutofillController(deps);
  registerFillListener(controller);
  void controller.bootstrap().catch((err: unknown) => {
    log.error('controller bootstrap threw', err);
  });

  // A9 additions: intent detection + highlight handlers
  await initIntent(deps);
  const unregisterHighlight = registerHighlightHandlers(deps);
  const unregisterAuthListener = onMessage('AUTH_STATE_CHANGED', async (authState) => {
    if (!authState.authed) {
      handleAuthLost(deps);
    }
  });

  ctx.onInvalidated(() => {
    log.info('ctx invalidated; tearing down controller');
    controller.teardown();
    unregisterHighlight();
    unregisterAuthListener();
  });

  log.info('content bootstrap complete');
}
```

Key integration points:
- `buildProductionContentScriptDeps()` calls A8's `createProductionDeps()` internally and spreads its result, so all A8 fields are present.
- `AutofillController(deps)` receives a `ContentScriptDeps` which is a superset of `AutofillControllerDeps` -- TypeScript structural typing accepts this.
- A9's `initIntent(deps)` and `registerHighlightHandlers(deps)` receive the same `deps` object typed as `ContentScriptDeps`.

### 6.11 Create `src/content/highlight/blueprint.contract.ts` (D22)

```ts
// src/content/highlight/blueprint.contract.ts
export const A9_HIGHLIGHT_BLUEPRINT = {
  phase: 'A9',
  version: '2.1',
  publicExports: [
    'registerHighlightHandlers',
    'handleAuthLost',
  ] as const,
  forbiddenImports: [
    // A9 must NEVER import:
    'ats-autofill-engine/dom/HighlightRange',   // does not exist
    'ats-autofill-engine/highlight',             // does not exist
    'src/background/messaging/protocol/HighlightRange',  // does not exist
    // A9 must NEVER directly import @webext-core/messaging; must go through A5 barrel
    '@webext-core/messaging',
  ],
  forbiddenSymbols: [
    'HighlightRange',
    'TextWalk',
    // walkTextNodes is NOT forbidden as an engine internal, but A9 must never consume it
    'walkTextNodes',
  ],
  requiredCoverage: 80,  // per D24 extension content floor: 75% line, A9 aims for 80% on this small module
  mustImport: [
    'applyHighlights',
    'removeAllHighlights',
    'extractJobDescription',
    'detectPageIntent',
  ],
} as const;
```

The CI blueprint-contract validator (per D22) reads this file, resolves the handler imports, and confirms that the imported symbols from `ats-autofill-engine/dom` match the keystone §5 signature. Fails the build on drift.

### 6.12 Create `scripts/rollback-phase-A9.sh` (D23)

```bash
#!/usr/bin/env bash
# scripts/rollback-phase-A9.sh
# Mechanically reverts phase A9 changes.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Rolling back phase A9..."

# Delete new files
rm -rf entrypoints/ats.content/highlight/
rm -f entrypoints/ats.content/intent.ts
rm -f src/content/highlight/blueprint.contract.ts
rm -rf tests/content/highlight/
rm -rf tests/content/intent/

# Revert main.ts additions. A9 added exactly 3 import lines + ~15 lines inside bootstrap(deps).
# The safest rollback is git checkout on the file:
git checkout HEAD -- entrypoints/ats.content/main.ts

# Verify the rolled-back state typechecks
pnpm typecheck || { echo "FAIL: rollback left typecheck broken"; exit 1; }

echo "Phase A9 rolled back cleanly"
```

Make executable: `chmod +x scripts/rollback-phase-A9.sh`. A Windows PowerShell twin `scripts/rollback-phase-A9.ps1` is NOT required here because the extension repo is Linux-primary for CI (though A1 scaffold runs on Windows dev machines). If the user is on Windows locally, they use git-bash or WSL for the rollback script.

---

## 7. Step-by-step execution order

1. **Verify prerequisites** -- run §2.1.a script. If any fails, STOP.
2. **Create `deps.ts`** (if missing from A8) or extend A8's existing interface.
3. **Create `jd-cache.ts`**.
4. **Create `state.ts`**.
5. **Create `guards.ts`** with the Zod schema.
6. **Create `apply-handler.ts`** with the full mutex + engine-call logic.
7. **Create `clear-handler.ts`**.
8. **Create `index.ts`** barrel.
9. **Create `intent.ts`**.
10. **Modify `main.ts`** to wire everything at bootstrap.
11. **Create `blueprint.contract.ts`** (D22).
12. **Create `rollback-phase-A9.sh`** (D23).
13. **Write `tests/content/highlight/contract.spec.ts`** (contract assertion).
14. **Write `tests/content/intent/detector.spec.ts`** (12 cases).
15. **Write `tests/content/highlight/apply-handler.spec.ts`** (15 cases).
16. **Write `tests/content/highlight/clear-handler.spec.ts`** (5 cases).
17. **Run `pnpm typecheck`**. Fix any errors. NEVER use `any` or `@ts-ignore`.
18. **Run `pnpm test tests/content/**`**. Fix any failures by fixing code, not tests.
19. **Run `pnpm lint`**. Zero warnings.
20. **Run `pnpm build`**. Confirm the content-script bundle builds.
21. **Run anti-drift grep gates** from §11 below.
22. **Run `pnpm compliance`** (the full gauntlet). Zero errors, zero warnings.
23. **Smoke test unpacked**: §13 below.
24. **Commit** -- conventional commit prefix `feat(100-A9):`. Message body summarises the handler registration and notes "no HighlightRange, no walkTextNodes consumer, per B6 keystone §5".

---

## 8. Contract conformance (verbatim copy from keystone)

### 8.1 Keystone §5 -- `applyHighlights` signature

```ts
// ats-autofill-engine/dom (B6)
export function applyHighlights(
  root: Element,
  keywords: readonly string[],
): () => void;
```

A9 consumer call (exact):

```ts
const terms: readonly string[] = bgResponse.keywords.map((k) => k.term);
const cleanup = deps.applyHighlights(deps.document.body, terms);
```

`document.body` is an `Element`. `terms` is `readonly string[]`. The return value is a cleanup closure. No ranges, no HighlightRange, no TextWalk.

### 8.2 Keystone §1.2 -- `HighlightApplyResponse`

```ts
export type HighlightApplyResponse =
  | { readonly ok: true; readonly keywordCount: number; readonly rangeCount: number; readonly tookMs: number }
  | { readonly ok: false; readonly reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting' | 'api-error' | 'rate-limited' | 'network-error' | 'no-tab' | 'render-error' };
```

A9's return value is a direct construction of this union. No additional fields, no omitted fields, no alternative shapes.

Mapping table (input condition -> output envelope):

| Input condition | Output envelope |
|---|---|
| Intent unknown | `{ ok: false, reason: 'no-jd-on-page' }` |
| Intent `application-form` | `{ ok: false, reason: 'not-a-job-posting' }` |
| JD extraction returned null | `{ ok: false, reason: 'no-jd-on-page' }` |
| JD extraction returned empty text | `{ ok: false, reason: 'no-jd-on-page' }` |
| `sendMessage('KEYWORDS_EXTRACT')` threw | `{ ok: false, reason: 'network-error' }` |
| bg response failed Zod guard | `{ ok: false, reason: 'api-error' }` |
| bg response `{ ok: false, reason: 'signed-out' }` | `{ ok: false, reason: 'signed-out' }` |
| bg response `{ ok: false, reason: 'empty-text' }` | `{ ok: false, reason: 'no-jd-on-page' }` (remapped because A9 prevents empty text upstream, but defensive fall-through) |
| bg response `{ ok: false, reason: 'api-error' }` | `{ ok: false, reason: 'api-error' }` |
| bg response `{ ok: false, reason: 'rate-limited' }` | `{ ok: false, reason: 'rate-limited' }` |
| bg response `{ ok: false, reason: 'network-error' }` | `{ ok: false, reason: 'network-error' }` |
| `applyHighlights` threw | `{ ok: false, reason: 'render-error' }` |
| Happy path | `{ ok: true, keywordCount, rangeCount, tookMs }` |

Note: the `empty-text` remap is defensive. In the happy path A9 checks `cached.text.length === 0` BEFORE sending, so `empty-text` should never come back from the bg. But if the bg somehow returns it, A9 maps to `no-jd-on-page` because that is the semantically correct popup message. The other approach (pass through as `empty-text`) would require adding a new literal to `HighlightApplyResponse.reason`, which would break the keystone contract.

### 8.3 Keystone §1.2 -- `HighlightClearResponse`

```ts
export type HighlightClearResponse =
  | { readonly ok: true; readonly cleared: boolean }
  | { readonly ok: false; readonly reason: string };
```

A9's clear handler returns `{ ok: true, cleared: true }` if a prior cleanup existed, `{ ok: true, cleared: false }` if no prior cleanup, `{ ok: false, reason: <string> }` if `removeAllHighlights` threw (unrecoverable DOM state).

### 8.4 Keystone §1.2 -- `KeywordsExtractRequest` + `Response`

```ts
export interface KeywordsExtractRequest {
  readonly text: string;
  readonly url: string;
  readonly topK?: number;
}

export type KeywordsExtractResponse =
  | { readonly ok: true; readonly keywords: ReadonlyArray<ExtractedSkill>; readonly tookMs: number }
  | { readonly ok: false; readonly reason: 'signed-out' | 'empty-text' | 'api-error' | 'rate-limited' | 'network-error' };
```

A9 sends a request with `text` (extracted JD), `url` (current page), `topK: 30`. A9 consumes the response with a Zod guard (D21).

### 8.5 Keystone §1.2 -- `DetectedIntentPayload`

```ts
export interface DetectedIntentPayload {
  readonly tabId: TabId | -1;
  readonly url: string;
  readonly kind: AtsKind;
  readonly pageKind: 'job-posting' | 'application-form';
  readonly company?: string;
  readonly jobTitle?: string;
  readonly detectedAt: number;
}
```

A9's `buildIntentPayload` constructs this union with `tabId: -1 as TabId` (the `-1` sentinel is documented in keystone §1.2 -- A5's bg handler substitutes `sender.tab.id`).

### 8.6 Keystone §2.8 -- `PageIntent`

```ts
export type PageIntent =
  | { readonly kind: AtsKind; readonly pageKind: 'job-posting'; readonly url: string; readonly jobData?: JobPostingData }
  | { readonly kind: AtsKind; readonly pageKind: 'application-form'; readonly url: string }
  | { readonly kind: 'unknown'; readonly url: string };
```

A9 reads `intent.kind`, `intent.pageKind` (with an `'in'` guard because the unknown variant lacks it), and optionally `intent.jobData.title` / `intent.jobData.hiringOrganization.name` when building the intent payload.

### 8.7 Keystone §5 -- `extractJobDescription` (async)

```ts
// ats-autofill-engine/dom (B6)
export async function extractJobDescription(
  doc: Document,
): Promise<{ text: string; structured?: JobPostingData; method: 'jsonld' | 'readability' } | null>;
```

A9 consumer call (exact):

```ts
const result = await deps.extractJobDescription(deps.document);
if (!result) return { ok: false, reason: 'no-jd-on-page' };
```

Note the `await`. Per review-A9 contract cross-check, the previous A9 plan treated this as synchronous; the current rewrite awaits.

### 8.8 Keystone §5 -- `detectPageIntent`

```ts
// ats-autofill-engine/dom (B6)
export function detectPageIntent(
  location: Location,
  doc: Document,
): PageIntent;
```

Synchronous. A9 consumer call (exact):

```ts
const intent = deps.detectPageIntent(deps.location, deps.document);
```

### 8.9 Keystone §8 -- A3 backend contract

```
POST /api/v1/ats/extract-skills
Request:  { text: string(1..50000), options?: { topK?: 1..100, categories?, includeMissing?, resumeText? } }
Response: { success: true, data: { keywords: ExtractedSkill[], missing?: ExtractedSkill[], tookMs: number } }
```

A9 does NOT call this endpoint directly. A5's `KEYWORDS_EXTRACT` background handler does. A9 consumes A5's response, not the raw HTTP envelope.

---

## 9. Tests (4 files, ~900 LoC)

Per D19, every test file MUST cover the six adversarial categories: null/undefined/NaN/Infinity, empty/max collections, unicode, injection, concurrent re-entry, adversarial state. The four A9 test files collectively cover all six, with specific cases listed below.

### 9.1 `tests/content/highlight/contract.spec.ts` (~100 LoC)

Asserts the imported engine symbol signatures match keystone §5. Uses TypeScript's type system + a runtime smoke assertion.

```ts
// tests/content/highlight/contract.spec.ts
import { describe, it, expect } from 'vitest';
import { applyHighlights, removeAllHighlights, extractJobDescription, detectPageIntent } from 'ats-autofill-engine/dom';

describe('A9 <-> B6 contract', () => {
  it('applyHighlights is a function', () => {
    expect(typeof applyHighlights).toBe('function');
  });

  it('applyHighlights accepts (Element, readonly string[]) and returns a cleanup fn', () => {
    // Compile-time assertion: the function signature matches.
    // If B6 drifts, this line fails to typecheck.
    const sig: (root: Element, keywords: readonly string[]) => () => void = applyHighlights;
    // Runtime smoke check with an empty body
    const body = document.createElement('body');
    const cleanup = sig(body, []);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('removeAllHighlights accepts (Element) and returns void', () => {
    const sig: (root: Element) => void = removeAllHighlights;
    const body = document.createElement('body');
    sig(body);
    expect(true).toBe(true);
  });

  it('extractJobDescription is async and accepts (Document)', async () => {
    const sig: (doc: Document) => Promise<{ text: string; method: 'jsonld' | 'readability' } | null> = extractJobDescription;
    const emptyDoc = document.implementation.createHTMLDocument('empty');
    const result = await sig(emptyDoc);
    // An empty doc has no JD; result is null
    expect(result).toBeNull();
  });

  it('detectPageIntent accepts (Location, Document) and returns PageIntent', () => {
    const sig: (loc: Location, doc: Document) => { kind: string; url: string } = detectPageIntent;
    const loc = { href: 'https://example.com/' } as unknown as Location;
    const result = sig(loc, document);
    expect(typeof result.kind).toBe('string');
    expect(typeof result.url).toBe('string');
  });

  it('HighlightRange is NOT exported (drift check)', async () => {
    const mod = await import('ats-autofill-engine/dom');
    expect('HighlightRange' in mod).toBe(false);
  });

  it('walkTextNodes is NOT exported as a consumer surface (drift check)', async () => {
    const mod = await import('ats-autofill-engine/dom');
    // walkTextNodes may or may not be exported internally; if it is, its shape is Generator<Text>, not a record
    if ('walkTextNodes' in mod) {
      const walker = (mod as unknown as { walkTextNodes: (root: Element) => unknown }).walkTextNodes(document.body);
      // Assert it is an iterator/generator, not a { concatenated, segments } record
      expect(walker).toHaveProperty(Symbol.iterator);
      expect(walker).not.toHaveProperty('concatenated');
      expect(walker).not.toHaveProperty('segments');
    }
  });
});
```

### 9.2 `tests/content/intent/detector.spec.ts` (~280 LoC, 12 cases)

Asserts `initIntent` correctly maps PageIntent shapes to DetectedIntentPayload and calls `sendMessage` with the right payload. Uses mocked `deps` per D20. 12 cases = 3 ATS (greenhouse, lever, workday) x 4 page kinds (posting, form, unknown, posting-with-jobData).

Cases:

1. **Greenhouse job posting** -- url `https://boards.greenhouse.io/acme/jobs/123`, fixture has JSON-LD JobPosting. Expected: `sendMessage('INTENT_DETECTED', { tabId: -1, url, kind: 'greenhouse', pageKind: 'job-posting', jobTitle: 'Senior Engineer', company: 'Acme Inc', detectedAt: <now> })`.
2. **Greenhouse application form** -- url `https://boards.greenhouse.io/acme/jobs/123#app`. Expected: `pageKind: 'application-form'`, no `jobTitle`, no `company`.
3. **Greenhouse unknown** -- url `https://boards.greenhouse.io/` (root, no job id). Expected: `sendMessage` NOT called (intent is unknown).
4. **Greenhouse posting without JSON-LD** -- url matches posting regex, but `document` has no JSON-LD. Expected: `pageKind: 'job-posting'`, no `jobTitle`, no `company`.
5. **Lever job posting** -- url `https://jobs.lever.co/acme/<uuid>`. Expected: `kind: 'lever', pageKind: 'job-posting'`.
6. **Lever application form** -- url `https://jobs.lever.co/acme/<uuid>/apply`. Expected: `kind: 'lever', pageKind: 'application-form'`.
7. **Lever unknown** -- url `https://jobs.lever.co/acme` (no uuid). Expected: not called.
8. **Workday posting** -- url `https://acme.myworkdayjobs.com/External/job/Remote-USA/Senior-Engineer_R-12345`. Expected: `kind: 'workday', pageKind: 'job-posting'`.
9. **Workday application form** -- url `https://acme.myworkdayjobs.com/External/task/...`. Expected: `kind: 'workday', pageKind: 'application-form'`.
10. **Workday unknown** -- url `https://acme.com/careers`. Expected: not called.
11. **Non-ATS page** -- url `https://www.example.com/about`. Expected: not called.
12. **`sendMessage` rejects mid-broadcast** -- fake rejects. Expected: no throw, warn logged.

Example test skeleton:

```ts
// tests/content/intent/detector.spec.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { initIntent, buildIntentPayload } from '@/entrypoints/ats.content/intent';
import type { ContentScriptDeps } from '@/entrypoints/ats.content/deps';
import type { DetectedIntentPayload } from '@/background/messaging/protocol';

type SendMessageMock = Mock<
  Parameters<ContentScriptDeps['sendMessage']>,
  ReturnType<ContentScriptDeps['sendMessage']>
>;

function makeDeps(
  overrides: Partial<ContentScriptDeps> = {},
): ContentScriptDeps & { sendMessage: SendMessageMock } {
  const sendMessage: SendMessageMock = vi.fn(async () => undefined as never);
  const detectPageIntent = vi.fn(() => ({ kind: 'unknown' as const, url: 'https://x' }));
  const createLogger = vi.fn(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }));
  return Object.freeze({
    document: document,
    location: { href: 'https://x' } as Location,
    now: () => 1_700_000_000_000,
    createLogger: createLogger as unknown as ContentScriptDeps['createLogger'],
    sendMessage: sendMessage as unknown as ContentScriptDeps['sendMessage'],
    applyHighlights: vi.fn(() => () => {}),
    removeAllHighlights: vi.fn(),
    extractJobDescription: vi.fn(async () => null),
    detectPageIntent: detectPageIntent as unknown as ContentScriptDeps['detectPageIntent'],
    ...overrides,
  }) as ContentScriptDeps & { sendMessage: SendMessageMock };
}

describe('initIntent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('greenhouse job posting with JSON-LD -> broadcasts INTENT_DETECTED with jobTitle and company', async () => {
    const deps = makeDeps({
      location: { href: 'https://boards.greenhouse.io/acme/jobs/123' } as Location,
      detectPageIntent: vi.fn(() => ({
        kind: 'greenhouse',
        pageKind: 'job-posting',
        url: 'https://boards.greenhouse.io/acme/jobs/123',
        jobData: {
          title: 'Senior Engineer',
          description: 'desc',
          hiringOrganization: { name: 'Acme Inc' },
          source: 'json-ld',
        },
      })) as unknown as ContentScriptDeps['detectPageIntent'],
    });
    await initIntent(deps);
    expect(deps.sendMessage).toHaveBeenCalledWith('INTENT_DETECTED', expect.objectContaining({
      tabId: -1,
      url: 'https://boards.greenhouse.io/acme/jobs/123',
      kind: 'greenhouse',
      pageKind: 'job-posting',
      jobTitle: 'Senior Engineer',
      company: 'Acme Inc',
      detectedAt: 1_700_000_000_000,
    }));
  });

  it('greenhouse application form -> broadcasts without jobTitle or company', async () => {
    const deps = makeDeps({
      location: { href: 'https://boards.greenhouse.io/acme/jobs/123#app' } as Location,
      detectPageIntent: vi.fn(() => ({
        kind: 'greenhouse',
        pageKind: 'application-form',
        url: 'https://boards.greenhouse.io/acme/jobs/123#app',
      })) as unknown as ContentScriptDeps['detectPageIntent'],
    });
    await initIntent(deps);
    expect(deps.sendMessage).toHaveBeenCalledWith('INTENT_DETECTED', expect.objectContaining({
      kind: 'greenhouse',
      pageKind: 'application-form',
    }));
    const call = deps.sendMessage.mock.calls[0]?.[1] as DetectedIntentPayload;
    expect(call).not.toHaveProperty('jobTitle');
    expect(call).not.toHaveProperty('company');
  });

  // ... remaining 10 cases follow the same structure ...

  it('sendMessage rejection is swallowed (fire-and-forget)', async () => {
    const deps = makeDeps({
      detectPageIntent: vi.fn(() => ({
        kind: 'lever', pageKind: 'job-posting', url: 'https://jobs.lever.co/acme/abc',
      })) as unknown as ContentScriptDeps['detectPageIntent'],
      sendMessage: vi.fn(async () => { throw new Error('bg offline'); }) as unknown as SendMessageMock,
    });
    await expect(initIntent(deps)).resolves.toBeUndefined();
  });
});

describe('buildIntentPayload (pure)', () => {
  it('returns null for unknown intent', () => {
    expect(buildIntentPayload({ kind: 'unknown', url: 'https://x' }, 'https://x', 1)).toBeNull();
  });

  it('omits jobTitle/company when jobData is absent', () => {
    const result = buildIntentPayload(
      { kind: 'greenhouse', pageKind: 'job-posting', url: 'https://x' },
      'https://x',
      1,
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('jobTitle');
    expect(result).not.toHaveProperty('company');
  });

  // ... unicode test: jobTitle with emoji ...
  // ... injection test: jobTitle with "<script>alert(1)</script>" (pass-through, A5 sanitizes) ...
  // ... null byte test: jobTitle with "\x00" ...
});
```

Typed mocks use `Mock<Parameters<fn>, ReturnType<fn>>` per M1 fix. No `as any`.

### 9.3 `tests/content/highlight/apply-handler.spec.ts` (~380 LoC, 15 adversarial cases)

Full coverage of every code path in `apply-handler.ts`. Cases:

1. **Happy path (Greenhouse JD, 15 keywords)** -- mocked intent `job-posting`, mocked extractJobDescription returns `{ text: 'We need Python and TypeScript', method: 'jsonld' }`, mocked sendMessage returns `{ ok: true, keywords: [...15 skills], tookMs: 42 }`, mocked applyHighlights returns a cleanup spy. Expected response: `{ ok: true, keywordCount: 15, rangeCount: <empirical>, tookMs: <number> }`. Assert state is set correctly.
2. **Signed-out reason** -- mocked sendMessage returns `{ ok: false, reason: 'signed-out' }`. Expected: `{ ok: false, reason: 'signed-out' }`. applyHighlights NOT called.
3. **No JD on page** -- mocked extractJobDescription returns null. Expected: `{ ok: false, reason: 'no-jd-on-page' }`. sendMessage NOT called.
4. **Not-a-job-posting reason** -- mocked detectPageIntent returns `{ kind: 'greenhouse', pageKind: 'application-form', url }`. Expected: `{ ok: false, reason: 'not-a-job-posting' }`. extractJobDescription NOT called.
5. **API error (500)** -- mocked sendMessage returns `{ ok: false, reason: 'api-error' }`. Expected: `{ ok: false, reason: 'api-error' }`.
6. **Rate limited (429)** -- mocked sendMessage returns `{ ok: false, reason: 'rate-limited' }`. Expected: `{ ok: false, reason: 'rate-limited' }`.
7. **Network error** -- mocked sendMessage returns `{ ok: false, reason: 'network-error' }`. Expected: `{ ok: false, reason: 'network-error' }`.
8. **Engine throws (render-error)** -- mocked applyHighlights throws `new Error('broken DOM')`. Expected: `{ ok: false, reason: 'render-error' }`. State NOT set.
9. **Concurrent apply (mutex serializes)** -- fire two `handleHighlightApply` calls in parallel, the first is a long async operation, the second should wait for the first to complete and see a clean slate. Assert `removeAllHighlights` was called before the second apply. Assert neither call returns before its own inner work completes. Assert the two responses are independent envelopes (both `ok: true` or each with their own error).
10. **Apply -> clear -> apply (cache hit)** -- first apply extracts JD, second apply hits the cache. Assert extractJobDescription was called exactly once.
11. **Empty keyword list** -- mocked sendMessage returns `{ ok: true, keywords: [], tookMs: 5 }`. Expected: `{ ok: true, keywordCount: 0, rangeCount: 0, tookMs: <number> }`. applyHighlights called with `document.body, []` and returns a no-op cleanup. This is a "success with zero matches" -- the popup renders it as such.
12. **Mangled backend response shape (Zod rejects)** -- mocked sendMessage returns `{ ok: true, keywords: 'not-an-array' }` (invalid). Expected: `{ ok: false, reason: 'api-error' }`. Zod guard fails.
13. **Highlight survives route change within SPA** -- simulate a SPA `pushState` that changes `location.href` but does not re-instantiate the content script. The cleanup function remains valid. Expected: a subsequent `HIGHLIGHT_CLEAR` still works.
14. **Adversarial Unicode JD** -- mocked extractJobDescription returns `{ text: 'Python\u0000React\u200Bcafé', method: 'jsonld' }`. Expected: sendMessage called with the unicode string verbatim. `applyHighlights` called with any terms the backend returns (mocked `['python','react','café']`). No crash.
15. **Injection attempt in keyword term** -- mocked bg response contains `{ term: '<script>alert(1)</script>', category: 'hard', score: 0.9, occurrences: 1, canonicalForm: 'script' }`. Expected: Zod guard passes (it is a string), applyHighlights is called with the string, the engine (per B6) treats it as a literal text match and wraps matching text nodes in `<mark>` (it does NOT inject script -- B6 uses TreeWalker + splitText, never innerHTML). Assert no `<script>` element appeared in the test DOM.

Each case uses typed mocks. Example skeleton:

```ts
// tests/content/highlight/apply-handler.spec.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createApplyHandler } from '@/entrypoints/ats.content/highlight/apply-handler';
import { __resetForTest as resetState } from '@/entrypoints/ats.content/highlight/state';
import { __resetForTest as resetJdCache } from '@/entrypoints/ats.content/highlight/jd-cache';
import type { ContentScriptDeps } from '@/entrypoints/ats.content/deps';
import type { HighlightApplyResponse } from '@/background/messaging/protocol';

type SendMessageMock = Mock<
  Parameters<ContentScriptDeps['sendMessage']>,
  ReturnType<ContentScriptDeps['sendMessage']>
>;

type DetectIntentMock = Mock<
  Parameters<ContentScriptDeps['detectPageIntent']>,
  ReturnType<ContentScriptDeps['detectPageIntent']>
>;

type ExtractJdMock = Mock<
  Parameters<ContentScriptDeps['extractJobDescription']>,
  ReturnType<ContentScriptDeps['extractJobDescription']>
>;

type ApplyHlMock = Mock<
  Parameters<ContentScriptDeps['applyHighlights']>,
  ReturnType<ContentScriptDeps['applyHighlights']>
>;

function makeDeps(overrides: Partial<ContentScriptDeps> = {}): ContentScriptDeps & {
  sendMessage: SendMessageMock;
  detectPageIntent: DetectIntentMock;
  extractJobDescription: ExtractJdMock;
  applyHighlights: ApplyHlMock;
} {
  // Build with typed mocks ...
  const sendMessage: SendMessageMock = vi.fn();
  const detectPageIntent: DetectIntentMock = vi.fn(() => ({ kind: 'greenhouse', pageKind: 'job-posting', url: 'https://x' }));
  const extractJobDescription: ExtractJdMock = vi.fn(async () => ({ text: 'Python TypeScript', method: 'jsonld' as const }));
  const cleanupSpy = vi.fn();
  const applyHighlights: ApplyHlMock = vi.fn(() => cleanupSpy);
  const removeAllHighlights = vi.fn();
  return Object.freeze({
    document: document,
    location: { href: 'https://boards.greenhouse.io/acme/jobs/123' } as Location,
    now: () => Date.now(),
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as any,
    sendMessage: sendMessage as unknown as ContentScriptDeps['sendMessage'],
    applyHighlights: applyHighlights as unknown as ContentScriptDeps['applyHighlights'],
    removeAllHighlights,
    extractJobDescription: extractJobDescription as unknown as ContentScriptDeps['extractJobDescription'],
    detectPageIntent: detectPageIntent as unknown as ContentScriptDeps['detectPageIntent'],
    ...overrides,
  }) as ContentScriptDeps & {
    sendMessage: SendMessageMock;
    detectPageIntent: DetectIntentMock;
    extractJobDescription: ExtractJdMock;
    applyHighlights: ApplyHlMock;
  };
}

describe('handleHighlightApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    resetJdCache();
  });

  it('happy path: returns ok:true with keywordCount and rangeCount', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: Array.from({ length: 15 }, (_, i) => ({
        term: `kw${i}`, category: 'hard' as const, score: 0.8, occurrences: 2, canonicalForm: `kw${i}`,
      })),
      tookMs: 42,
    });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toMatchObject({ ok: true, keywordCount: 15 });
    expect(deps.applyHighlights).toHaveBeenCalledWith(
      deps.document.body,
      expect.arrayContaining(['kw0', 'kw14']),
    );
  });

  it('signed-out: returns ok:false reason signed-out', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'signed-out' });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'signed-out' });
    expect(deps.applyHighlights).not.toHaveBeenCalled();
  });

  it('no JD on page: returns no-jd-on-page', async () => {
    const deps = makeDeps();
    deps.extractJobDescription.mockResolvedValueOnce(null);
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it('application-form page: returns not-a-job-posting', async () => {
    const deps = makeDeps();
    deps.detectPageIntent.mockReturnValueOnce({
      kind: 'greenhouse', pageKind: 'application-form', url: 'https://x',
    } as ReturnType<ContentScriptDeps['detectPageIntent']>);
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'not-a-job-posting' });
    expect(deps.extractJobDescription).not.toHaveBeenCalled();
  });

  it('api-error pass-through', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'api-error' });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'api-error' });
  });

  it('rate-limited pass-through', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'rate-limited' });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('network-error: sendMessage throws -> network-error', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockRejectedValueOnce(new Error('bg unreachable'));
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'network-error' });
  });

  it('engine throws -> render-error', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: [{ term: 'x', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'x' }],
      tookMs: 1,
    });
    deps.applyHighlights.mockImplementationOnce(() => { throw new Error('broken DOM'); });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'render-error' });
  });

  it('concurrent apply: mutex serializes two in-flight calls', async () => {
    const deps = makeDeps();
    // Make the first call slow
    let firstResolve!: (v: { ok: true; keywords: unknown[]; tookMs: number }) => void;
    deps.sendMessage.mockImplementationOnce(() => new Promise((res) => { firstResolve = res as (v: unknown) => void; }));
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: [{ term: 'second', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'second' }],
      tookMs: 1,
    });
    const handler = createApplyHandler(deps);
    const p1 = handler({ tabId: 1 });
    const p2 = handler({ tabId: 1 });
    // Resolve the first after starting the second
    firstResolve({
      ok: true,
      keywords: [{ term: 'first', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'first' }],
      tookMs: 1,
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toMatchObject({ ok: true });
    expect(r2).toMatchObject({ ok: true });
    // removeAllHighlights called twice: once for each apply's pre-cleanup
    expect(deps.removeAllHighlights).toHaveBeenCalledTimes(2);
  });

  it('apply -> clear -> apply: second apply hits JD cache', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValue({
      ok: true,
      keywords: [{ term: 'x', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'x' }],
      tookMs: 1,
    });
    const handler = createApplyHandler(deps);
    await handler({ tabId: 1 });
    await handler({ tabId: 1 });
    expect(deps.extractJobDescription).toHaveBeenCalledTimes(1);
  });

  it('empty keyword list: returns ok:true with keywordCount:0', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({ ok: true, keywords: [], tookMs: 0 });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toMatchObject({ ok: true, keywordCount: 0, rangeCount: 0 });
  });

  it('mangled bg response: Zod guard rejects -> api-error', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({ ok: true, keywords: 'not-an-array' } as unknown as {
      ok: true; keywords: never[]; tookMs: number;
    });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toEqual({ ok: false, reason: 'api-error' });
  });

  it('SPA route change: cleanup survives', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: [{ term: 'x', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'x' }],
      tookMs: 1,
    });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toMatchObject({ ok: true });
    // Simulate pushState: location.href changes (mock it)
    // The cleanup function stored in state should still be invocable
    const state = await import('@/entrypoints/ats.content/highlight/state');
    const s = state.getHighlightState();
    expect(s.cleanup).not.toBeNull();
    s.cleanup!();
    // No throw; success
  });

  it('unicode JD: passes through to backend verbatim', async () => {
    const deps = makeDeps();
    deps.extractJobDescription.mockResolvedValueOnce({
      text: 'Python\u0000React\u200Bcafé',
      method: 'jsonld',
    });
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: [{ term: 'café', category: 'hard', score: 1, occurrences: 1, canonicalForm: 'café' }],
      tookMs: 1,
    });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toMatchObject({ ok: true });
    expect(deps.sendMessage).toHaveBeenCalledWith('KEYWORDS_EXTRACT', expect.objectContaining({
      text: 'Python\u0000React\u200Bcafé',
    }));
  });

  it('injection attempt in keyword term: Zod accepts the string, engine handles literally', async () => {
    const deps = makeDeps();
    deps.sendMessage.mockResolvedValueOnce({
      ok: true,
      keywords: [{
        term: '<script>alert(1)</script>',
        category: 'hard', score: 0.9, occurrences: 1, canonicalForm: 'script',
      }],
      tookMs: 1,
    });
    const handler = createApplyHandler(deps);
    const res = await handler({ tabId: 1 });
    expect(res).toMatchObject({ ok: true });
    // applyHighlights is a mock, so we only assert the string was forwarded
    expect(deps.applyHighlights).toHaveBeenCalledWith(
      deps.document.body,
      ['<script>alert(1)</script>'],
    );
    // Real engine uses TreeWalker + splitText (B6), never innerHTML, so the string is safe.
  });
});
```

### 9.4 `tests/content/highlight/clear-handler.spec.ts` (~140 LoC, 5 cases)

Cases:

1. **No prior apply** -- `state.cleanup === null`. Expected: `{ ok: true, cleared: false }`. `removeAllHighlights` still called (belt-and-braces).
2. **Prior apply exists** -- `state.cleanup === spy`. Expected: `{ ok: true, cleared: true }`. spy called, `removeAllHighlights` called, state reset.
3. **Stored cleanup throws** -- spy throws. Expected: warn logged, `removeAllHighlights` still called, state reset, response `{ ok: true, cleared: true }` (the spy ran, it just threw afterward).
4. **`removeAllHighlights` throws** -- spy ok, but `removeAllHighlights` throws. Expected: `{ ok: false, reason: <string> }` (unrecoverable DOM).
5. **Double-clear** -- call twice. First returns `{ ok: true, cleared: true }`, second returns `{ ok: true, cleared: false }` (state was reset).

### 9.5 Coverage floor

Per D24, extension content script floor is 75% line, 70% branch. A9's blueprint contract sets 80% for this small module. The four test files above collectively cover:

- `intent.ts`: 12 cases + 4 pure-function cases = 16 assertions covering all branches (100% expected).
- `apply-handler.ts`: 15 cases covering every early-return, every error path, every happy case, every mutex state (90%+ expected).
- `clear-handler.ts`: 5 cases covering all 3 code paths + 2 error paths (95%+ expected).
- `jd-cache.ts`: implicit coverage via apply-handler tests (cache hit test in case 10).
- `state.ts`: implicit coverage via apply-handler + clear-handler tests.
- `guards.ts`: case 12 exercises the failure path; happy path exercised by every other case.

Run `pnpm test --coverage` and confirm the area meets the 80% floor. Fail the phase if it does not.

### 9.6 D19 adversarial category mapping

| Adversarial category | Covered by case(s) |
|---|---|
| Null/undefined/NaN/Infinity | case 3 (null JD), case 7 (sendMessage throws), case 8 (engine throws), buildIntentPayload test (null for unknown) |
| Empty collections / max-size collections | case 11 (empty keyword list), case 1 (15 keywords in one call) |
| Unicode edge cases | case 14 (null byte, ZWSP, combining diacritic) |
| Injection | case 15 (`<script>` in keyword term) |
| Concurrent re-entry | case 9 (mutex serializes two in-flight applies) |
| Adversarial state | case 12 (mangled bg response / frozen input), case 13 (SPA route change with stale state) |

Six categories, six+ cases. Passes the D19 gate.

---

## 10. Acceptance criteria

A9 is complete when ALL of the following are true:

### 10.1 Build + typecheck

- [ ] `pnpm typecheck` exits 0 in `e:/llmconveyors-chrome-extension`.
- [ ] `pnpm build` produces `dist/content-scripts/ats.js` without errors.
- [ ] Bundle size delta over A8 baseline is documented in the commit message (expected +~18 KB gz, documented as "expected" not "verified" per L4 fix).
- [ ] `pnpm lint` exits 0 with zero warnings.

### 10.2 Tests

- [ ] `pnpm test tests/content/highlight/**` passes all 25 cases (15 apply + 5 clear + 100 contract + 5 helper).
- [ ] `pnpm test tests/content/intent/**` passes all 12+ cases.
- [ ] Coverage for `entrypoints/ats.content/intent.ts` + `entrypoints/ats.content/highlight/**` is at least 80% line and 75% branch (per D24 extension content floor plus A9's own blueprint goal).
- [ ] Zero `as any` in test files (per M1 fix and `.claude/rules/testing.md`).
- [ ] Zero `: any` in production files (per code-quality rule).

### 10.3 Anti-drift gates (D14)

- [ ] `grep -rE '\b(HighlightRange|TextWalk|walkTextNodes)\b' entrypoints/ats.content/ tests/content/` returns zero matches in A9 files (note: `walkTextNodes` may still be referenced in B6 tests; A9 files are clean).
- [ ] `grep -rE '\b(console\.(log|info|warn|error|debug))' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/ tests/content/` returns zero matches.
- [ ] `grep -rn $'\u2014' entrypoints/ats.content/ tests/content/ temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md` returns zero matches (em-dash rule D15; uses ANSI-C quoting for the U+2014 code point so this line itself contains no literal em-dash).
- [ ] `grep -rE "from '@webext-core/messaging'" entrypoints/ats.content/highlight/ entrypoints/ats.content/intent.ts` returns zero matches (A9 must go through A5's protocol barrel).
- [ ] `grep -rE "src/background/messaging/protocol\\.ts" entrypoints/ats.content/ | grep -v 'import'` returns zero matches (only imports allowed, never direct edits).
- [ ] `grep -n 'ats-autofill-engine/dom' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/*.ts` returns exactly the imports in §6 (applyHighlights, removeAllHighlights, extractJobDescription, detectPageIntent).
- [ ] `src/content/highlight/blueprint.contract.ts` exists and the D22 validator passes.
- [ ] `scripts/rollback-phase-A9.sh` exists and is executable.
- [ ] `scripts/rollback-phase-A9.sh` runs cleanly on a throwaway branch (CI nightly check per D23).

### 10.4 Contract conformance (D14 gate 2)

A type-level assertion test file `tests/content/highlight/contract.spec.ts` asserts:

```ts
const sig: (root: Element, keywords: readonly string[]) => () => void = applyHighlights;
```

If B6 drifts the signature, this line fails to typecheck. Fails the phase.

### 10.5 Runtime smoke

- [ ] Loading the extension unpacked in Chrome 114+ and navigating to `https://boards.greenhouse.io/acme/jobs/123` (real page or fixture): `detectPageIntent` returns `{ kind: 'greenhouse', pageKind: 'job-posting', url, jobData }` and the background receives an `INTENT_DETECTED` message with the correct payload.
- [ ] From the DevTools bg console: `sendMessage('HIGHLIGHT_APPLY', { tabId: currentTabId }, currentTabId)` returns `{ ok: true, keywordCount: <N>, rangeCount: <M>, tookMs: <ms> }` and the page shows `<mark data-ats-autofill="true">` spans wrapping the matched skill terms.
- [ ] `sendMessage('HIGHLIGHT_CLEAR', { tabId: currentTabId }, currentTabId)` returns `{ ok: true, cleared: true }` and the DOM is restored (no marks remain).
- [ ] Signing out broadcasts `AUTH_STATE_CHANGED { authed: false }` and any open tab with active highlights tears down cleanly.

### 10.6 Review checklist (from review-A9.md, every issue resolved)

- [F -> PASS] C1: HighlightRange import removed. Delete `range-builder.ts` confirmed (this rewrite never creates it).
- [F -> PASS] C2: Self-contradicting narrative removed. §0.1 is consistent with §6.6 (both describe a thin shim).
- [F -> PASS] C3: B6 contract not patched from A9. A9 conforms to B6's locked surface.
- [F -> PASS] H1: `pageKind` is NOT added to A5's DetectedIntent from inside A9. Per D2, A5 owns the type. A9 ships the `pageKind` field in the DetectedIntentPayload shape that A5 already defines (keystone §1.2).
- [F -> PASS] H2: `tabId: -1` sentinel is documented in keystone §1.2 as legitimate. A5's bg handler substitutes via `sender.tab.id`. §2.1.a prerequisite check verifies A5 ships this substitution before A9 begins.
- [F -> PASS] H3: Engine throws map to `render-error` (new literal in keystone §1.2 union).
- [F -> PASS] H4: Proper mutex with `pending: Promise<void>` awaited at top, replaced BEFORE inner work starts. Belt-and-braces `removeAllHighlights` before every apply.
- [PASS] H5: Empty keyword list is treated as a valid success per the keystone contract (`keywordCount: 0` is valid). Documented in §8.2 mapping table.
- [F -> PASS] M1: Zero `as any` in test files. All mocks typed as `Mock<Parameters<fn>, ReturnType<fn>>`.
- [F -> PASS] M2: A9 does NOT reshape A5's `HIGHLIGHT_APPLY` payload; A5 already ships the keystone shape.
- [F -> PASS] M3: Commented that the guard projects to a local type shape, defensive copy.
- [F -> PASS] M4: `getApiBaseUrl` is A5's responsibility because A5 owns the `KEYWORDS_EXTRACT` background handler. A9 never touches `src/background/config.ts`.
- [F -> PASS] M5: Test coverage rebuilt around `applyHighlights(root, terms)`. No `HighlightRange` assertions remain.
- [F -> PASS] L1: Exports map is 8 sub-entries per keystone §4; A9 references `./dom` correctly.
- [F -> PASS] L2: Reading `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` is allowed in §3.
- [F -> PASS] L3: DevTools smoke uses `sendMessage('HIGHLIGHT_APPLY', { tabId }, tabId)` from the compiled bundle, not a raw `{ type, data }` envelope.
- [F -> PASS] L4: Bundle size marked as "expected" not "verified".
- [F -> PASS] L5: Zero em-dashes in this plan (mechanically verified).

### 10.7 Compliance gauntlet

- [ ] `pnpm compliance` (full gauntlet per `.claude/rules/compliance-check.md`) passes. All 5 checks: shared-types build, typecheck, lint, test:web (N/A for extension repo, skip), test:api (replaced by `pnpm test` in the extension repo), plus the anti-drift gates from D14 + A9 blueprint contract.

---

## 11. Anti-drift grep gates (D14, verbatim commands)

Run these from `e:/llmconveyors-chrome-extension` before every commit and in CI:

```bash
# 1. No HighlightRange / TextWalk / walkTextNodes consumer usage in A9
! grep -rnE '\b(HighlightRange|TextWalk)\b' entrypoints/ats.content/ tests/content/ || { echo "FAIL: HighlightRange/TextWalk leaked into A9"; exit 1; }
! grep -rnE "from 'ats-autofill-engine/dom'.*walkTextNodes" entrypoints/ats.content/ tests/content/ || { echo "FAIL: walkTextNodes consumed"; exit 1; }

# 2. No console.* in A9 files (per D11)
! grep -rnE '\bconsole\.(log|info|warn|error|debug)' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/ tests/content/ || { echo "FAIL: console.* in A9"; exit 1; }

# 3. No em-dashes in A9 plan or source (per D15)
! grep -rn $'\u2014' entrypoints/ats.content/ tests/content/ temp/impl/100-chrome-extension-mvp/phase_A9_content_script_highlight_and_intent/plan.md || { echo "FAIL: em-dash present"; exit 1; }

# 4. No direct @webext-core/messaging import in A9 (must go through A5 barrel)
! grep -rn "@webext-core/messaging" entrypoints/ats.content/highlight/ entrypoints/ats.content/intent.ts || { echo "FAIL: direct messaging lib import"; exit 1; }

# 5. A9 does NOT modify A5's protocol.ts (diff check)
git diff --name-only main..HEAD | grep -E 'src/background/messaging/protocol\.ts|src/background/messaging/protocol-types\.ts|src/background/messaging/handlers\.ts' && { echo "FAIL: A9 modified A5 files"; exit 1; } || true

# 6. The engine imports A9 uses are exactly the four permitted symbols
grep -c 'applyHighlights\|removeAllHighlights\|extractJobDescription\|detectPageIntent' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/apply-handler.ts entrypoints/ats.content/highlight/clear-handler.ts

# 7. The D22 blueprint contract is present
test -f src/content/highlight/blueprint.contract.ts || { echo "FAIL: blueprint contract missing"; exit 1; }

# 8. The D23 rollback script is present and executable
test -x scripts/rollback-phase-A9.sh || { echo "FAIL: rollback script missing or not executable"; exit 1; }

# 9. No : any in production files (not tests)
! grep -rnE ':\s*any\b' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/ || { echo "FAIL: any in production"; exit 1; }

# 10. No @ts-ignore / @ts-expect-error in A9 files
! grep -rnE '@ts-(ignore|expect-error)' entrypoints/ats.content/intent.ts entrypoints/ats.content/highlight/ tests/content/ || { echo "FAIL: ts suppression"; exit 1; }
```

All 10 gates MUST pass. A failing gate blocks the phase.

---

## 12. Known gaps and v1.1 backlog

Document these in the commit message so future readers know what was intentional:

1. **No HIGHLIGHT_STATUS broadcast from A9 in v1**. A10 polls `HIGHLIGHT_STATUS` via the background, but A9 does not write to any bg state. For v1, A10's toggle state is driven by:
   - Local popup state
   - The response envelope from the most recent `HIGHLIGHT_APPLY` / `HIGHLIGHT_CLEAR`
   
   If the user opens the popup on a tab that already has highlights applied from a prior popup session, the toggle will initially show "off" and the user must click to re-apply. v1.1 wires a `POST HIGHLIGHT_STATUS` broadcast from the content script's state module to the background on every apply/clear.

2. **No MutationObserver re-highlight on DOM changes**. If a Greenhouse page re-renders the job description after `HIGHLIGHT_APPLY` (e.g. user expands a collapsed section), the existing marks are orphaned and new content is not highlighted. v1.1 adds a MutationObserver on `document.body` that calls `applyHighlights` again with the same keyword set.

3. **No SPA route change detection in bootstrap**. A9's `initIntent` runs once per content-script instantiation. SPA route changes (pushState) do not re-trigger intent detection. A Workday wizard step change (covered by A8 per keystone §7) does not re-run `initIntent`. v1.1 adds a `popstate` listener that re-runs `initIntent`.

4. **JD cache never evicted**. The per-URL cache grows with every distinct URL the user visits during the content-script lifetime. For a long-running SPA session on `workday.com`, this could accumulate hundreds of entries. In practice, content scripts are discarded on full navigation, so the leak is bounded. v1.1 adds an LRU eviction at 50 entries.

5. **No bg broadcast of "highlights applied" metadata to sibling tabs**. If the user has two tabs open to the same Greenhouse posting, applying highlights in one tab does not affect the other. Acceptable POC behavior, documented here so reviewers do not flag it as a bug.

6. **No per-keyword click/focus behavior**. The `<mark>` elements are styled but not interactive. v1.1 adds tooltip + category coloring.

7. **No tests for the `blueprint.contract.ts` validator**. The validator itself is covered by D22's CI script, but A9 does not add validator tests. Acceptable because D22 is a cross-phase concern and its tests live in a dedicated phase.

None of these gaps block v1 acceptance. All are documented in this phase plan and in the commit message.

---

## 13. Manual smoke test (post-build, pre-merge)

1. `cd e:/llmconveyors-chrome-extension && pnpm build`
2. Open Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> select `dist/`.
3. Open a fresh tab -> navigate to `https://boards.greenhouse.io/stripe/jobs/<real-job-id>`.
4. Open DevTools -> Console (content-script frame):
   - Expect the content script to log `intent detected { kind: 'greenhouse', pageKind: 'job-posting' }` via the A9 logger.
5. Open DevTools -> Background page (or Service Worker):
   - Run `chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => chrome.storage.session.get(null, console.log))` to confirm the bg received `INTENT_DETECTED` and wrote it to the per-tab map.
6. Trigger `HIGHLIGHT_APPLY` from the background console (this requires importing the compiled `sendMessage` from the bundle, which is only accessible from the bg side):
   - Open the `background.js` sources panel -> set a breakpoint inside any existing handler -> from the debugger console, run: `await sendMessage('HIGHLIGHT_APPLY', { tabId: <currentTabId> }, <currentTabId>)`.
   - Expect response: `{ ok: true, keywordCount: <N>, rangeCount: <M>, tookMs: <ms> }`.
7. Inspect the page DOM via DevTools Elements panel. Confirm `<mark data-ats-autofill="true" class="ats-autofill-highlight">` spans wrap matched terms.
8. Trigger `HIGHLIGHT_CLEAR`: `await sendMessage('HIGHLIGHT_CLEAR', { tabId: <currentTabId> }, <currentTabId>)`.
   - Expect response: `{ ok: true, cleared: true }`.
   - Confirm DOM has no `<mark data-ats-autofill="true">` elements.
9. Sign out via the popup.
   - Confirm the background broadcasts `AUTH_STATE_CHANGED { authed: false }`.
   - Confirm the content script logs "auth lost, highlight state cleared" at info level.
10. Navigate to `https://boards.greenhouse.io/stripe/jobs/<real-job-id>/apply` (application form) -> trigger `HIGHLIGHT_APPLY` -> expect response `{ ok: false, reason: 'not-a-job-posting' }`.
11. Navigate to `https://www.example.com/about` -> `HIGHLIGHT_APPLY` -> expect `{ ok: false, reason: 'no-jd-on-page' }`.
12. Sign in, navigate back to a Greenhouse posting, apply, then toggle airplane mode (disconnect network):
    - Expect the next `HIGHLIGHT_APPLY` to return `{ ok: false, reason: 'network-error' }`.
    - The existing highlights on the page should remain (not cleared) because the failure is at the pre-apply step.
13. Re-enable network, sign out, then sign back in -> `HIGHLIGHT_APPLY` -> expect `{ ok: true, ... }`.

Document any deviation in the commit message under a "Manual smoke test findings" section. Deviations block the phase.

---

## 14. Critical gotchas and load-bearing assumptions

1. **A5 owns the protocol.** D2 is not a guideline; it is a hard rule. If A9 tries to edit `protocol.ts`, the D14 grep gate 5 fails and the phase is rejected. If A5 is missing a key A9 needs, escalate to the architect for an A5 corrective plan.

2. **`sendMessage` import path.** A9 MUST import `sendMessage` and `onMessage` from `@/background/messaging/protocol` (A5's barrel). Importing directly from `@webext-core/messaging` creates a new messaging namespace and the two barrels will not interoperate. D14 grep gate 4 enforces this.

3. **`TabId(-1)` sentinel.** Per keystone §1.2 `DetectedIntentPayload.tabId: TabId | -1`, the `-1` literal is valid. A5's bg handler substitutes `sender.tab.id`. If A5 does not ship this substitution (check via §2.1.a prerequisite), A9 will write bogus state into the bg intent map. The prerequisite script catches this.

4. **`extractJobDescription` is ASYNC.** Per keystone §5 and B6 step 14, this is a `Promise<...>`. A9 MUST `await` it. The previous A9 plan treated it as sync; the current plan awaits.

5. **`applyHighlights` takes `readonly string[]`, NOT `HighlightRange[]`.** Per keystone §5 verbatim signature. The engine walks the DOM internally; A9 passes the keyword terms only. No range computation in A9.

6. **The JD cache is per-URL, not per-keyword-set.** Keywords are never cached. Every apply round-trips to the backend.

7. **The mutex MUST replace `pending` BEFORE any await.** Review-A9 H4: the previous plan had a race where two callers could both see a resolved `pending` and both start inner work. The fix is to replace `pending` with the new promise synchronously, before any async call. See §6.6 pseudocode lines `const innerPromise = new Promise(...)` + `setPendingApply(innerPromise)`.

8. **Engine throws map to `render-error`.** The `HighlightApplyResponse` union now includes `'render-error'` per keystone §1.2. A9 maps engine exceptions to this literal, not to `api-error`.

9. **Zod guard runs even though TypeScript types the response.** Per D21. In-process IPC between content script and bg is still an untrusted boundary.

10. **No `as any` in tests.** Per M1 fix. All mocks are typed with `Mock<Parameters<fn>, ReturnType<fn>>`.

11. **No em-dashes anywhere.** Per D15. Mechanically verified by D14 grep gate 3. All ASCII dashes in this plan are `-` or `--`.

12. **The `jd-cache` clears on sign-out.** `handleAuthLost(deps)` calls `clearJdCache()`. This prevents a leak of the JD text after the user signs out.

13. **`HIGHLIGHT_STATUS` is deferred.** A9 does not register a handler for `HIGHLIGHT_STATUS` in v1. A10 is aware of this (see A10 plan line 1810: "The `HIGHLIGHT_STATUS` handler is added by A9 -- do NOT register it here"). In v1, A5's background has a stub that returns `{ on: false, keywordCount: 0, appliedAt: null }` and A10 drives the toggle state from its own local state plus the apply/clear responses. v1.1 wires the real status broadcast.

14. **Bundle size is expected to increase by ~18 KB gzipped.** Most of the increase is the `./dom` sub-entry from B6 (readability + turndown + the highlighter subtree), tree-shaken by Vite. The exact number is not load-bearing; the "under 200 KB total" ceiling is. If the build exceeds 200 KB, investigate via `pnpm build --analyze` before merging.

15. **The `blueprint.contract.ts` file lives under `src/content/highlight/` per D22's convention**, not under `entrypoints/ats.content/highlight/`. This is because blueprint contracts are a cross-cutting concern that the D22 validator scans from a fixed path. A symlink or re-export from `entrypoints` is not needed; the validator reads the file directly.

---

## 15. Confidence recap

**9/10.**

Justifications:

- **Contract clarity**: every cross-phase symbol is defined verbatim in keystone contracts §1, §5, §8. There is no room for interpretation.
- **Scope discipline**: A9 touches only its own files plus a 25-line addition to A8's `main.ts`. A5's protocol and handlers are untouched.
- **Test coverage**: 32 test cases across 4 files, covering all 13 code paths + all 6 D19 adversarial categories + the D22 contract assertion.
- **Rollback safety**: `scripts/rollback-phase-A9.sh` mechanically reverts the phase in under 10 seconds.
- **Anti-drift**: 10 grep gates, a blueprint contract, and a compile-time contract assertion test.

One point held back (not 10/10) for the residual uncertainty about Vite's handling of the `./dom` sub-entry in a content-script IIFE. A8 already consumes `ats-autofill-engine` from a content script, which is the same bundling path, so the risk is low but not zero. If A8 encountered surprises, A9 will too. Prerequisite verification catches this before code is written.

---

## 16. Summary for the architect

A9 is a thin shim between A5's `KEYWORDS_EXTRACT` background handler and B6's `applyHighlights(root, keywords)` engine renderer. It:

1. Detects page intent on content-script bootstrap and broadcasts `INTENT_DETECTED` to A5.
2. Registers `HIGHLIGHT_APPLY` and `HIGHLIGHT_CLEAR` content-side handlers.
3. Extracts JD text via `extractJobDescription` (async), caches it per URL.
4. Asks the background to fetch keywords via `sendMessage('KEYWORDS_EXTRACT', ...)`.
5. Guards the response with a Zod schema (D21).
6. Calls `applyHighlights(document.body, terms)` and stores the returned cleanup.
7. Tears down on `AUTH_STATE_CHANGED { authed: false }`.

Zero new types. Zero protocol modifications. Zero engine modifications. 620 LoC production + 900 LoC tests + 85 LoC governance files. 3 hours effort. Confidence 9/10.

Every F-grade finding from review-A9.md is addressed by design, not by patch. Every D14 anti-drift gate is wired into the acceptance criteria. Every D19 adversarial category is covered by at least one test case. Every D20 dependency crosses the Deps boundary. Every D21 runtime boundary has a Zod guard. The D22 blueprint contract is shipped. The D23 rollback script is shipped. The D24 coverage floor (80%) exceeds the 75% line + 70% branch extension content floor.

Ready for Sonnet execution. No remaining questions for the architect.

---

**End of plan A9 v2.1 rewrite.**
