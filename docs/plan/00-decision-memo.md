# Plan 100 — Chrome Extension POC + V1 Decision Memo (FINAL v2, LOCKED)

**Author**: Ebenezer (architect: Claude Opus 4.6)
**Date locked**: 2026-04-11 (v2 restructure same day)
**Supersedes**: v1 of this memo (pre-rename, pre-Workday-flip, pre-skill-taxonomy-endpoint)

---

## 1. Context and north star

### 1.1 The Zovo deal framing

Per the March 21 2026 email thread with Michael Lip (Zovo Labs):

- **POC period**: user builds V1 on own Claude Max sub through April 17-20, delivers a working local demo. No cost to Zovo.
- **Demo call on April 20**: if Michael accepts, the dedicated Claude seat and 3-month clock start.
- **Month 1 (post-acceptance)**: V1 extension live on Chrome Web Store under Zovo. DOM stack (form detection, autofill engine, keyword highlighting) must function as standalone features with graceful degradation when the API is unreachable. **"Extension can never be a loading spinner when your backend is unreachable."**
- **Flagship feature**: intelligent form autofill on Greenhouse, Lever, Workday with keyword highlighting.
- **Architecture commitment**: replica hex architecture of the llmconveyors backend for cross-domain scalability.

### 1.2 Current negotiation state

Michael has cooled since March 30. The user has been silent since April 3 and owes Michael (a) Discord activity, (b) a repo link, (c) a visible engineering artifact. **April 17 is "put up or shut up."**

### 1.3 Execution reality

- Today 2026-04-11. Claude Max billing cycle ends April 17 (6 days). POC demo April 20 (9 days).
- Planning done today → 6 days of Sonnet parallel execution (Apr 12-17) → 3 days polish.
- Target scope ~70-90 engineering hours with OSS reuse + parallel Sonnet execution.

---

## 2. Locked decisions

### 2.0 Decision matrix

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Repo topology for engine | **(a) Single package** with sub-entry exports map | Unscoped name; one pnpm publish per release; matches agent 44 |
| D2 | ATS adapters in POC | **(a) GH + Lever + Workday** | Matches Zovo deal email exactly |
| D3 | **Workday depth** | **(b) MULTI-STEP WIZARD** | Flipped 2026-04-11. Demo wow-factor required; single-page "just looks like Greenhouse with different selectors" |
| D4 | Keyword corpus | **Backend endpoint (Option Online-only)** | skill-taxonomy IS the moat; never leaves server. Extension calls `POST /api/v1/ats/extract-skills` when signed in |
| D5 | Adapter licensing | **(b) Core MIT + adapters MPL-2.0** | File-level copyleft protects ATS selector IP |
| D6 | DOM adapter packaging | **(a) Sub-entry `./dom`** | Follows D1 |
| D7 | Michael comms | **(c) Hybrid** — plan files today + daily commits + Monday status + completion email Apr 17 | Rebuild trust, show velocity |
| D8 | Profile UI | **(b) JSON Resume upload + inline overrides** | 3h vs 8h for full form; no backend coupling |
| D9 | Keyword highlighter trigger | **(b) Manual toggle** + online-only | Button disabled when signed out (graceful degradation, not a spinner) |
| D10 | SDK client lifecycle | **(b) On-demand per operation** | Service workers sleep/wake |

### 2.1 Package + repo names (locked)

**Engine (new, OSS, published to npm)**:
- npm: `ats-autofill-engine` (unscoped, confirmed 404 on registry = available)
- GitHub: `ebenezer-isaac/ats-autofill-engine` (confirmed available)
- Initial version: `0.1.0-alpha.1`

**Extension + plan hosting (new, public, under user namespace)**:
- GitHub: **`ebenezer-isaac/llmconveyors-chrome-extension`** (new public repo)
- Contents: plan files under `docs/plan/` + WXT scaffold + daily commits through Apr 17
- Transfer to `zovo-labs/llmconveyors-chrome-extension` post-contract signing

**Backend changes**: in existing private `ebenezer-isaac/llmconveyors.com` repo (NOT shared with Michael until post-signing)

### 2.2 Two-plan structure (NEW)

**Plan A = Chrome extension deliverable** (11 phases, the user-facing product)
**Plan B = Autofill engine dependency** (9 phases, the standalone OSS library)

Backend changes to llmconveyors.com are folded into Plan A (phases A2/A3/A4) because they're prerequisites for extension functionality. The llmconveyors.com backend/frontend work happens in the private repo but is orchestrated as part of Plan A.

### 2.3 Ownership and IP (silent default)

- **`ats-autofill-engine` publishes under `ebenezer-isaac` namespace**. Transfer to Zovo post-signing via `@zovo/ats-autofill-engine` alias.
- **`ebenezer-isaac/llmconveyors-chrome-extension` repo** under user namespace. Transfer to `zovo-labs` org via GitHub transfer (preserves stars, issues, URL redirects for 1+ year).
- **skill-taxonomy stays fully private.** Only accessible via the backend endpoint. Never bundled, never git-dep'd from the OSS engine.
- **Silent default messaging**: don't volunteer IP explanations unless Michael asks. If asked, truthful: *"Engine is under my namespace per our March 21 POC agreement. Extension repo and engine both transfer to Zovo on signing."*

### 2.4 Licensing

- **Engine core** (`src/core/**` except heuristics): MIT
- **Mozilla heuristics port** (`src/core/heuristics/mozilla/**`): MPL-2.0 file-level sub-module
- **ATS adapters** (`src/ats/**`): MPL-2.0 (protects selector IP)
- **DOM + chrome adapters**: MIT
- **LICENSE**: MIT root + `LICENSES/MPL-2.0.txt` for copyleft sub-modules

### 2.5 Hex architecture

```
ats-autofill-engine
├── core/                                 (pure TypeScript, zero DOM)
│   ├── types/              (FormModel, FillInstruction, Profile)
│   ├── taxonomy/           (FieldType enum + ATS-specific extensions)
│   ├── heuristics/mozilla/ (MPL-2.0 sub-module)
│   ├── classifier/
│   ├── fill-rules/
│   ├── plan-builder/
│   └── ports/              (type-only interfaces)
├── adapters/
│   ├── dom/                (browser-coupled: scanner, filler, file-attacher, highlighter-renderer, mutation-watcher)
│   └── chrome/             (chrome.* APIs: intent-detector, profile-provider)
└── ats/                    (MPL-2.0)
    ├── greenhouse/
    ├── lever/
    └── workday/            (multi-step wizard support)
```

**NOT in the engine**: keyword matching, skill taxonomy, keyword planning. Those are backend concerns (`POST /api/v1/ats/extract-skills`). The engine's DOM highlighter renderer is a pure "wrap these strings in `<mark>`" utility — it receives matches, it doesn't compute them.

**Dependency rule**: arrows point inward. `core` imports nothing external. `adapters/*` imports from `core/ports` (type-only). `ats/*` imports from `adapters/dom` and `core`. CI enforces via `tsconfig.core.json lib: ["ES2022"]` + grep for `document|window|chrome\.` in `dist/core/**`.

### 2.6 Scope

**Included in V1 POC**:

| Area | Scope |
|---|---|
| ATS adapters | GH + Lever + Workday |
| **Workday depth** | **Multi-step wizard traversal (My Information → My Experience → Voluntary Disclosures → Review)** — user clicks "Save and Continue" between pages, extension detects new page and scans/fills. NEVER auto-advances. |
| LinkedIn Easy Apply | NOT IN V1 (no OSS reference, TOS risk) |
| Ashby | NOT in V1, v1.1 backlog |
| JSON-LD JobPosting extraction | GH + Lever + Ashby detection |
| Content fallback | `@mozilla/readability` + `turndown` |
| Field classifier | Mozilla HeuristicsRegExp port + ATS taxonomy extension |
| **Keyword extraction** | **Online-only via `POST /api/v1/ats/extract-skills`** — server-side Aho-Corasick against private skill-taxonomy corpus |
| **Keyword highlighting UI** | **Full visual highlighting via `<mark>` wrapping**. Manual toggle in popup. Button disabled when signed out (graceful degradation). |
| Profile schema | JSON Resume base + 16 legal-auth flags + `willing_to_undergo_*` + DOB/EEO consent |
| React input filler | Native setter + events |
| File attacher | DataTransfer (GH/Lever), Workday drag-drop flagged as known-limitation |
| Side panel | Artifact viewing |
| Popup | Quick actions + credit display + highlight toggle |
| Profile onboarding | JSON Resume upload + inline overrides |

**Excluded from V1 POC**:
- Chrome Web Store listing assets
- Firefox support (v1.1)
- Ashby / BambooHR / Workable / Jobvite / SmartRecruiters
- i18n of extension UI
- Full profile form builder
- LinkedIn Easy Apply (v2+)
- Offline keyword fallback corpus (Option O means online-only; no ESCO bundle)

### 2.7 Auth flow (Plan A phases A2 + A4 + A6)

1. User clicks sign-in → background worker calls `chrome.identity.launchWebAuthFlow` → opens `https://llmconveyors.com/auth/extension-signin?redirect=<chrome.identity.getRedirectURL()>`
2. Frontend page (new, phase A4) uses `useSessionContext()` — if unauthed, redirects to existing SuperTokens login → back to self after success
3. Authed page POSTs to `/api/v1/auth/extension-token-exchange` (new backend endpoint, phase A2)
4. Backend controller mutates `req.headers['st-auth-mode']='header'`, calls `Session.createNewSession(...)`, reads response headers, scrubs them, returns JSON `{ accessToken, refreshToken, frontToken, accessTokenExpiry }`
5. Frontend builds fragment `#at=...&rt=...&ft=...&exp=...`, `window.location.replace(redirect + fragment)`
6. `launchWebAuthFlow` resolves, extension parses fragment, stores in `chrome.storage.session`
7. SDK client via `getAuthHeaders` callback reads from storage
8. Refresh flow: on 401, background calls `POST /auth/session/refresh`, updates storage, SDK retries once. Single in-flight promise dedup in background module state.

### 2.8 Keyword extraction flow (Plan A phase A3 + A9)

1. User signs in, lands on a detected JD page (GH/Lever/Workday job posting)
2. Content script (phase A9) extracts JD text via JSON-LD or readability fallback
3. Content script sends `KEYWORDS_EXTRACT` message to background with the JD text
4. Background worker calls SDK → `POST /api/v1/ats/extract-skills` with `{ text: <jd>, options?: { topK, categories } }`
5. Backend (phase A3) runs Aho-Corasick scan against private skill-taxonomy corpus (v3.0.1 SHA), returns `{ keywords: Array<{ term, category, score, occurrences }> }`
6. Background forwards response to content script
7. Content script calls engine's `applyHighlights(document.body, keywords)` (phase B6) — wraps matching text in `<mark data-ats-autofill>` spans with CSS
8. Popup toggle state: highlight on / off / signed-out-disabled

When **signed out**, the popup toggle is **disabled** with tooltip "Sign in for keyword matching" — graceful degradation per Zovo deal language.

### 2.9 Backend endpoint spec — `POST /api/v1/ats/extract-skills`

- Path: `POST /api/v1/ats/extract-skills` (matches existing `POST /api/v1/ats/score` naming convention)
- Guard: `@UseGuards(AuthGuard, ScopeGuard)`
- Scope: `@RequireScope('ats:write')` (matches existing `ats/score`)
- Rate limit: `@Throttle(60_000, 60)` — 60/min (generous, deterministic compute, no LLM call)
- Request schema (Zod): `{ text: string(1..50000), options?: { topK?: 1..100, categories?: Array<'hard'|'soft'|'tool'|'domain'>, includeMissing?: boolean, resumeText?: string(1..50000) } }`
- Response schema: `{ success: true, data: { keywords: Array<{ term: string, category: string, score: number(0..1), occurrences: number, canonicalForm: string }>, missing?: Array<{ term, category, score }>, tookMs: number } }`
- Implementation: thin wrapper around existing `skill-taxonomy` Aho-Corasick automaton (already used by `ats-score` service)
- New file: `api/src/modules/ats/controllers/extract-skills.controller.ts` (~40 LoC)
- New Zod schema: `libs/shared-types/src/schemas/ats-extract-skills.schema.ts`
- Test: `api/src/modules/ats/__tests__/extract-skills.controller.spec.ts`

### 2.10 SDK client (`llmconveyors@0.5.0` — optional)

Current `llmconveyors@0.4.0` has `getAuthHeaders` callback support but no `AtsResource.extractSkills` method. Two options:

- **(a) Direct fetch in extension** for V1 POC — background worker calls endpoint via plain `fetch()`, skips SDK. Fine for POC.
- **(b) Add method to SDK** — bump to `0.5.0`, add `client.ats.extractSkills(text, options)`, publish. Cleaner but adds ~1h to Plan A.

**Decision**: (a) for V1 POC. Extension background worker calls endpoint directly with `fetch` + Bearer token. Migrate to SDK method in v1.1 if we publish `llmconveyors@0.5.0` for other reasons.

### 2.11 Extension architecture

- **Background service worker**: auth, SDK client construction, profile storage, skills extraction API calls, tab state
- **Content scripts**: form scanner, classifier, filler, highlighter renderer, intent detector, JSON-LD extractor
- **Popup**: React 360×480, detected-job display, fill button, highlight toggle (disabled when offline)
- **Side panel**: React artifact viewer (CV tab, cover letter tab, email tab)
- **Options page**: React, JSON Resume upload + inline overrides + sign out
- **Messaging**: `@webext-core/messaging` with typed `ProtocolMap`
- **Storage**:
  - `chrome.storage.session`: tokens, per-tab intent state, per-tab keyword cache
  - `chrome.storage.local`: profile, extension preferences
  - `chrome.storage.sync`: cross-device user preferences

### 2.12 Profile UI (D8 = b)

- Options page: JSON Resume upload file input + inline overrides
- On upload: Zod validate → merge with defaults → store in `storage.local`
- No full-form builder in V1
- Inline overrides: name split, phone prefix, 16 legal-auth flags (4 jurisdictions × 4 flags), demographics (opt-in, hidden by default), consents
- Backend `GET /resume/master` NOT used in V1 profile flow (defer to v1.1)

---

## 3. Phase plan — 20 phases

### 3.1 Plan A — Chrome Extension (11 phases)

| Code | Phase | Repo affected | Est hrs |
|---|---|---|---|
| A1 | WXT scaffold | llmconveyors-chrome-extension (new) | 2-3 |
| A2 | Backend auth bridge endpoint | llmconveyors.com (existing private) | 2-3 |
| A3 | Backend skills-extraction endpoint | llmconveyors.com (existing private) | 2 |
| A4 | Frontend extension-signin page | llmconveyors.com (existing private) | 2-3 |
| A5 | Background + messaging + SDK client factory + refresh manager | llmconveyors-chrome-extension | 3-4 |
| A6 | Auth flow (launchWebAuthFlow + token storage) | llmconveyors-chrome-extension | 2-3 |
| A7 | Profile storage + options page UI (JSON Resume upload) | llmconveyors-chrome-extension | 3-4 |
| A8 | Content script autofill (Greenhouse + Lever + Workday wizard) | llmconveyors-chrome-extension | 3-4 |
| A9 | Content script intent detection + keyword highlight (calls `/ats/extract-skills`) | llmconveyors-chrome-extension | 2-3 |
| A10 | Popup UI (React + Tailwind v4 + highlight toggle) | llmconveyors-chrome-extension | 3-4 |
| A11 | Side panel UI + E2E smoke test + demo recording | llmconveyors-chrome-extension | 3-4 |

### 3.2 Plan B — Autofill Engine (9 phases, dropped keyword matcher)

| Code | Phase | Est hrs |
|---|---|---|
| B1 | Engine scaffold (package, tsconfig, tsup, CI, licenses) | 2 |
| B2 | Core types + taxonomy + profile schema | 3-4 |
| B3 | Mozilla heuristics port (MPL-2.0 sub-module) | 3 |
| B4 | Classifier + fill rules + plan builder | 3-4 |
| B5 | DOM adapter: scanner + filler + file attacher + mutation watcher | 4 |
| B6 | DOM adapter: highlighter renderer + JD extractor + intent detector | 3 |
| B7 | Greenhouse ATS adapter (fork berellevy) | 6-8 |
| B8 | Lever ATS adapter (fork andrewmillercode) | 4-5 |
| B9 | Workday ATS adapter (MULTI-STEP WIZARD) + publish alpha | 12-15 |

### 3.3 Dependency graph

```
A2 ┐                                  B1 ─→ B2 ─→ B3 ─→ B4 ─→ B5 ─→ B6 ─→ B7, B8, B9 (parallel)
    ├─→ A6 (auth needs bridge + signin)                                  ↓
A4 ┘                                                                  publish

A3 ─→ A9 (keyword highlight needs backend endpoint)

A1 ─→ A5 ─→ A6
            ↓
            A7 (profile storage)
            ↓
            A8 (content autofill, needs B7+B8+B9 published)
            ↓
            A9 (content highlight, needs B6 published)
            ↓
            A10 (popup, needs A5 + A6 + A7)
            ↓
            A11 (sidepanel + E2E, needs everything)
```

### 3.4 Daily schedule (6 working days, Apr 12-17)

| Day | Date | Plan A track | Plan B track |
|---|---|---|---|
| 1 | Apr 12 Mon | A1 scaffold, A2 auth bridge | B1 engine scaffold |
| 2 | Apr 13 Tue | A3 skills endpoint, A4 signin page, A5 background | B2 types, B3 Mozilla port |
| 3 | Apr 14 Wed | A6 auth flow | B4 classifier, B5 DOM scanner |
| 4 | Apr 15 Thu | A7 profile + options | B6 highlighter renderer |
| 5 | Apr 16 Fri | A8 content autofill | B7 Greenhouse, B8 Lever, B9 Workday wizard + publish alpha |
| 6 | Apr 17 Sat | A9 highlight, A10 popup, A11 sidepanel+E2E+demo | — |

Day 5 is heaviest on the engine side (3 adapters in parallel + publish). Day 6 is heaviest on the extension side (3 phases in one day). If either day slips, the April 20 demo has 2 days of buffer.

### 3.5 Per-phase spec

Each phase has `phase_<code>_<name>/plan.md` — self-contained for 64k-context Sonnet executor.

---

## 4. Michael communication plan (D7 = c)

### 4.1 Cadence

| Date | Action |
|---|---|
| **Apr 11 (TODAY)** | Create `ebenezer-isaac/llmconveyors-chrome-extension` public repo. Commit plan directory under `docs/plan/` + minimal WXT scaffold. Send Michael catch-up email with repo link. |
| Apr 12 | First real commits to both repos (engine scaffold + extension scaffold). Post Discord update. |
| Apr 13-16 | Daily commit cadence on both repos + 2-day Discord updates. |
| Apr 15 | Mid-POC status email: engine alpha published to npm, extension scaffold up, bridge endpoint merged. |
| Apr 17 | Internal deadline. Record demo video. Full E2E test. |
| Apr 18-19 | Demo script prep + fallback slides. |
| Apr 20 | Demo call. |

### 4.2 Catch-up email template (send today)

> Subject: POC progress + repo link
>
> Hey Michael,
>
> Apologies for the silence — heads-down architecting. Sharing where I am.
>
> Kicking off the POC build per our March 21 plan. Full phased implementation mapped out here:
> **https://github.com/ebenezer-isaac/llmconveyors-chrome-extension**
>
> Starting Monday, daily commits to this repo + engine repo (`ebenezer-isaac/ats-autofill-engine` — reusable OSS autofill library). Will hit:
> - April 17: working load-unpacked demo on live Greenhouse + Lever + Workday postings
> - April 20: demo call
>
> Will post 2-day progress updates to Discord starting Monday.
>
> One question: is the original offer still open, or has anything changed I should know about?
>
> Ebenezer

### 4.3 Silent defaults

- Do not mention IP structure
- Do not mention the `@ebenezer-isaac/ats-autofill-engine` split from the Zovo extension unless asked
- Do not re-open Jason discussion unless he does
- Do not apologize more than once

---

## 5. Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Michael ghosts through Apr 20 | M | H | Ship engine OSS regardless; independent value |
| R2 | **Workday multi-step wizard breaks on live tenant** | M | H | Test against 3+ real Workday tenants; single-page fallback ready; "also works on Greenhouse as primary demo" fallback talking point |
| R3 | Backend bridge endpoint SuperTokens subtlety missed | L | H | Agent 53 95% verified; mandatory test coverage in A2 |
| R4 | npm package name squatted between plan and publish | VL | M | Reserve on Day 1 with `0.1.0-alpha.0` placeholder publish |
| R5 | MPL-2.0 compliance breaks CI | L | M | Dedicated `LICENSES/` + file headers + README note |
| R6 | Cross-repo dependency (engine alpha → extension) circular | M | M | B9 publishes Day 5 morning; A8 integration Day 5 afternoon |
| R7 | Claude Max runs out before Day 6 | M | H | Sonnet execution is Apr 12-16; Day 6 is polish only |
| R8 | Live ATS DOM mutation between plan and execution | L | H | Multiple test postings; Mozilla heuristics fallback |
| R9 | **`/api/v1/ats/extract-skills` endpoint response time too slow** | L | M | Aho-Corasick is O(n), no LLM; target <100ms for 10KB JD; benchmark in A3 |
| R10 | **Keyword highlight disabled-when-offline UX confuses users** | L | M | Clear tooltip; popup explains "Sign in to enable"; accept as graceful degradation |

---

## 6. Success criteria

### 6.1 April 17 internal deadline (must-have)

- [ ] `ats-autofill-engine@0.1.0-alpha.1` published on npm
- [ ] `ebenezer-isaac/ats-autofill-engine` public with daily commits Apr 12-17
- [ ] `ebenezer-isaac/llmconveyors-chrome-extension` public with daily commits Apr 12-17
- [ ] `POST /api/v1/ats/extract-skills` endpoint deployed (or at least merged to main + testable locally)
- [ ] `POST /api/v1/auth/extension-token-exchange` endpoint deployed
- [ ] Extension builds via `pnpm build` without errors
- [ ] Extension installs load-unpacked in Chrome 114+
- [ ] Sign-in flow works end-to-end
- [ ] User can upload JSON Resume into options page
- [ ] **On a live Greenhouse posting**: fill works (8+ fields including resume file)
- [ ] **On a live Lever posting**: fill works
- [ ] **On a live Workday posting**: multi-step wizard traversal — My Information page fills, user clicks Save-and-Continue, extension detects My Experience page, scans, user clicks Fill, experience fields populate, repeat for Voluntary Disclosures (EEO consent-gated), Review
- [ ] Keyword highlight toggle works on any job posting page (GH/Lever/Workday JD)
- [ ] Keyword highlight button disabled with tooltip when signed out
- [ ] Screen recording of full demo flow saved locally

### 6.2 April 20 demo call (nice-to-have)

- [ ] Side panel displays a generated CV artifact from llmconveyors agent API
- [ ] Credit balance displays in popup
- [ ] Extension has minimal branding polish (even placeholder icons)

### 6.3 Non-functional

- [ ] All engine tests pass (50+ unit tests)
- [ ] No `document|window|chrome\.` in `dist/core/**` (CI enforced)
- [ ] Engine bundle size: core < 30KB gzipped, full < 100KB gzipped
- [ ] MIT + MPL-2.0 license split CI-enforced
- [ ] `POST /api/v1/ats/extract-skills` responds < 100ms for 10KB JD

---

## 7. Glossary

- **Plan A** — Chrome extension deliverable (11 phases, `ebenezer-isaac/llmconveyors-chrome-extension` + llmconveyors.com backend changes)
- **Plan B** — Autofill engine dependency (9 phases, `ebenezer-isaac/ats-autofill-engine`)
- **Bridge endpoint** — `POST /api/v1/auth/extension-token-exchange`, converts SuperTokens cookie session to Bearer token pair
- **Skills endpoint** — `POST /api/v1/ats/extract-skills`, server-side Aho-Corasick scan against private skill-taxonomy corpus
- **Silent default** — don't volunteer IP/ownership explanations unless asked
- **POC** — April 11-20 build before formal Zovo contract
- **V1** — Month-1 post-acceptance Chrome Web Store release
- **Moat** — the private skill-taxonomy corpus (v3.0.1) and Aho-Corasick automaton; never ships to clients

---

**End of decision memo. All 20 phase plan files execute against this document as the single source of truth.**
