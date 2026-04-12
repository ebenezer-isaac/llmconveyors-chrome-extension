# Plan 100 — Chrome Extension POC + V1 (v2 restructured)

**Status**: Locked v2, 2026-04-11.
**Deadline**: 2026-04-17 (internal) / 2026-04-20 (Zovo demo call)
**Single source of truth**: [`00-decision-memo.md`](./00-decision-memo.md)
**Orchestration config**: [`config.json`](./config.json)

## Structure — TWO plans

### Plan A — Chrome Extension (11 phases, the deliverable)

The user-facing product. Ships to Chrome Web Store post-signing. Includes backend endpoint additions (A2/A3/A4) because the extension auth flow + keyword extraction depend on them.

| Phase | Repo | Purpose |
|---|---|---|
| A1 | `ebenezer-isaac/llmconveyors-chrome-extension` | WXT scaffold |
| A2 | `ebenezer-isaac/llmconveyors.com` (private) | Backend `POST /api/v1/auth/extension-token-exchange` |
| A3 | `ebenezer-isaac/llmconveyors.com` (private) | Backend `POST /api/v1/ats/extract-skills` |
| A4 | `ebenezer-isaac/llmconveyors.com` (private) | Frontend `/auth/extension-signin` page |
| A5 | chrome-extension | Background service worker + messaging + SDK factory + refresh manager |
| A6 | chrome-extension | Auth flow (launchWebAuthFlow + token storage) |
| A7 | chrome-extension | Profile storage + options page (JSON Resume upload) |
| A8 | chrome-extension | Content script: autofill (Greenhouse + Lever + Workday wizard) |
| A9 | chrome-extension | Content script: intent detection + keyword highlight |
| A10 | chrome-extension | Popup UI (React + Tailwind v4) |
| A11 | chrome-extension | Side panel + E2E smoke + demo recording |

### Plan B — Autofill Engine (9 phases, standalone OSS dependency)

Framework-agnostic form autofill library. Published to npm as `ats-autofill-engine`. Used by Plan A but usable by any consumer. Contains zero skill-taxonomy / keyword logic (those stay server-side via `POST /api/v1/ats/extract-skills`).

| Phase | Purpose |
|---|---|
| B1 | Engine scaffold (package, tsconfig, tsup, CI, licenses) |
| B2 | Core types + taxonomy + profile schema |
| B3 | Mozilla HeuristicsRegExp port (MPL-2.0 sub-module) |
| B4 | Classifier + fill rules + plan builder |
| B5 | DOM adapter: scanner + filler + file attacher + mutation watcher |
| B6 | DOM adapter: highlighter renderer + JD extractor + intent detector |
| B7 | Greenhouse ATS adapter (fork berellevy) |
| B8 | Lever ATS adapter (fork andrewmillercode) |
| B9 | Workday ATS adapter **(MULTI-STEP WIZARD)** + publish alpha |

## Directory layout

```
temp/impl/100-chrome-extension-mvp/
├── 00-decision-memo.md               ← FINAL decisions, read FIRST
├── config.json                        ← phase DAG, schedule, grep gates
├── README.md                          ← you are here
├── investigation/                     ← 62 research files, all ≥85% confidence
│   └── 01..62-*.md
├── phase_A1_wxt_scaffold/
├── phase_A2_backend_bridge_endpoint/
├── phase_A3_backend_keywords_endpoint/     ← NEW in v2
├── phase_A4_frontend_extension_signin/
├── phase_A5_background_and_messaging/
├── phase_A6_auth_flow/
├── phase_A7_profile_storage_and_options/
├── phase_A8_content_script_autofill/
├── phase_A9_content_script_highlight_and_intent/
├── phase_A10_popup_ui/
├── phase_A11_sidepanel_e2e_and_demo/
├── phase_B1_scaffold/
├── phase_B2_core_types_and_taxonomy/
├── phase_B3_mozilla_heuristics_port/
├── phase_B4_classifier_and_fill_rules/
├── phase_B5_dom_adapter_scanner_and_filler/
├── phase_B6_dom_adapter_highlighter_renderer/
├── phase_B7_greenhouse_adapter/
├── phase_B8_lever_adapter/
└── phase_B9_workday_adapter_and_publish/    ← rewrites needed for multi-step wizard
```

## Daily schedule (6 working days)

| Day | Date | Plan A | Plan B |
|---|---|---|---|
| 1 | Mon Apr 12 | A1, A2 | B1 |
| 2 | Tue Apr 13 | A3, A4, A5 | B2, B3 |
| 3 | Wed Apr 14 | A6 | B4, B5 |
| 4 | Thu Apr 15 | A7 | B6 |
| 5 | Fri Apr 16 | A8 | B7, B8, B9 (publish alpha) |
| 6 | Sat Apr 17 | A9, A10, A11 | — |

Day 5 morning: B7 + B8 + B9 parallel execution, finishing by mid-day. Afternoon: engine `0.1.0-alpha.1` published to npm. A8 consumes it.
Day 6 is hardest on the extension side — three A-phases in one day. Buffer tight. If Day 5 slips, Day 6 slips, Apr 20 demo still has 2 days polish remaining.

## Cross-plan dependencies

```
A2 (auth bridge)     ─┐
                      ├─→ A6 (extension auth flow)
A4 (signin page)     ─┘

A3 (skills endpoint) ─→ A9 (keyword highlight)

B7, B8, B9 (adapters published) ─→ A8 (content script autofill)
B6 (DOM highlighter published)  ─→ A9 (content script highlight)
```

## Invariants (CI-enforced)

1. **No `document`, `window`, or `HTMLElement` in `src/core/**`** of `ats-autofill-engine` (post-build grep + `tsconfig.core.json lib: ["ES2022"]`)
2. **No `skill-taxonomy` import anywhere in `ats-autofill-engine`** (grep gate — skill-taxonomy is the moat, lives only in llmconveyors backend)
3. **No `@repo/shared-types` imports in `ats-autofill-engine`** (engine is standalone, defines its own types)
4. **No `console.log`** — structured logging only
5. **No `any` types** — `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
6. **MPL-2.0 file headers preserved** on every file in `src/core/heuristics/mozilla/` and `src/ats/`
7. **Extension imports `llmconveyors@^0.4.0`** (callback auth) and `ats-autofill-engine@^0.1.0-alpha.1`
8. **Extension messaging uses `@webext-core/messaging`** with typed `ProtocolMap`
9. **Every phase ends with `pnpm test && pnpm build && pnpm typecheck`** passing in the touched repo
10. **Keyword extraction is online-only**. Popup highlight toggle disabled when signed out (graceful degradation, never a spinner).

## Non-goals

- Chrome Web Store submission (deferred to Month 1 post-acceptance)
- Firefox support (v1.1)
- LinkedIn Easy Apply (v2+)
- Ashby / BambooHR / Workable / Jobvite / SmartRecruiters (v1.1)
- Full profile form builder (D8 locks to JSON Resume upload)
- Offline keyword fallback corpus (D4 locks to online-only)
- SDK `client.ats.extractSkills()` method (V1 uses direct fetch; defer to `llmconveyors@0.5.0`)
- i18n (English only)
- Privacy policy drafting, screenshots, icons (Month 1)

## Michael comms plan (v2)

See decision memo §4. Today:

1. **Create `ebenezer-isaac/llmconveyors-chrome-extension` public repo** on GitHub
2. **Commit plan directory to `docs/plan/` in the new repo + minimal WXT scaffold** (Phase A1 done today as a preview)
3. **Send catch-up email** (template in memo §4.2) with the new repo link — NOT the private llmconveyors.com link
4. Silent default: no IP explanation unless asked

Daily through Apr 17: commits + Discord. Mid-POC Apr 15: status email. Apr 20: demo call.

## If something breaks

1. Check the phase's `## Rollback plan` section
2. If stuck, read the relevant investigation file(s) — cited in each phase plan
3. Do not re-plan — every architectural decision is in `00-decision-memo.md`. If a decision must change, escalate to the architect (Opus), do not silently deviate in a phase.
