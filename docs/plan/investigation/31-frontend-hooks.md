# 31 - Frontend Hooks Portability (WXT Extension)

Scope: audit every hook under `src/` for WXT extension portability. Focus on JH + B2B minimum viable extension.

## (a) Full Hook Inventory (15 hook files, 3 test files)

Found via `src/**/use*.{ts,tsx}` glob. Prior inventory missed `src/lib/generation/useGeneration.ts`.

1. `src/hooks/useConnectionHealth.ts` (128 LOC)
2. `src/hooks/useMediaQuery.ts` (32 LOC)
3. `src/hooks/useVersionContentFetch.ts` (118 LOC)
4. `src/hooks/useTheme.ts` (84 LOC)
5. `src/hooks/useAnalytics.ts` (116 LOC)
6. `src/hooks/useAutosave.ts` (193 LOC)
7. `src/hooks/useAgentGeneration.ts` (132 LOC)
8. `src/hooks/useOnboardingStatus.ts` (53 LOC)
9. `src/hooks/useGoogleLogin.ts` (126 LOC)
10. `src/hooks/useArtifactVersions.ts` (177 LOC)
11. `src/hooks/useCredits.tsx` (338 LOC)
12. `src/hooks/useAgentHydrationLogs.ts` (269 LOC)
13. `src/hooks/useSessionSync.ts` (381 LOC)
14. `src/lib/generation/useGeneration.ts` (867 LOC) -- the core generation state-machine bridge, NOT a `src/hooks/` file
15. (Also: 3 co-located test files under `src/hooks/__tests__/` -- port with their hook.)

No hook imports `next/server`, `next/headers`, `cookies()`, `getServerSideProps`, or any server-action (`'use server'`) modules. All hooks are pure client code.

## (b) Definitive Per-Hook Portability Table

Columns: next/* imports | server-action calls | fetch URLs / browser APIs | external deps | verdict | effort

### 1. useConnectionHealth.ts (128 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: `navigator.onLine`, `window.addEventListener('online'/'offline')`, `document.addEventListener('visibilitychange')`, `document.visibilityState`
- **External deps**: none (only `react`)
- **Verdict**: **DIRECT**. SSR-safe branches are harmless in MV3; keep as-is.
- **Effort**: TRIVIAL

### 2. useMediaQuery.ts (32 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: `window.matchMedia`
- **External deps**: none
- **Verdict**: **DIRECT** (optionally trim SSR branch in cleanup pass).
- **Effort**: TRIVIAL
- **MVP relevance**: none -- popup has fixed viewport. Safe to skip for MVP.

### 3. useVersionContentFetch.ts (118 LOC)
- **next/***: `next-intl` (`useTranslations('chat')` at L4, L40)
- **Server actions**: none
- **Fetch URLs**: `` `/api/sessions/${sessionId}/download?key=${storageKey}` `` (L55, relative -- site-same-origin assumed)
- **External deps**: `sonner` (toast), `@/types/generation-artifacts` (type only)
- **Verdict**: **PATCH**. Replace `useTranslations` shim + route fetch through `authedFetch(base + path)`.
- **Effort**: SMALL

### 4. useTheme.ts (84 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: `localStorage.getItem/setItem/removeItem('theme', 'umami.disabled')`, `window.matchMedia('(prefers-color-scheme: dark)')`, `document.documentElement.classList`
- **External deps**: imports `trackEvent` from `useAnalytics` -- pulls Umami branch into bundle
- **Verdict**: **PATCH**. localStorage works in popup/sidepanel MV3 contexts; keep it. Remove `trackEvent` import (replace with no-op) or stub `useAnalytics`. `document.documentElement` only works if the hook runs inside the popup/sidepanel document (it does).
- **Effort**: SMALL
- **MVP relevance**: defer -- ship light-only or `prefers-color-scheme` default.

### 5. useAnalytics.ts (116 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: `localStorage`, `window.umami` global (injected by external script)
- **External deps**: Umami tracking script (loaded via `<script>` in Next.js layout -- NOT available in MV3 without `unsafe-inline`/external host permission)
- **Verdict**: **REWRITE** (stub). MV3 CSP blocks remote script injection. Replace entire module with a `track: () => {}` no-op and default `consented = false`.
- **Effort**: TRIVIAL (stub) / MEDIUM (real telemetry via background-worker fetch)
- **MVP relevance**: skip. Default-off, no network calls.

### 6. useAutosave.ts (193 LOC)
- **next/***: `next-intl` (`useTranslations('shared')` at L2, L43 -- used once in L93 timeout error message)
- **Server actions**: none
- **Browser APIs**: `window.addEventListener('beforeunload')` (extension popups don't fire beforeunload reliably -- safe no-op)
- **External deps**: `use-debounce`
- **Verdict**: **PATCH**. Swap `useTranslations` shim. `beforeunload` branch becomes dead code but harmless.
- **Effort**: SMALL
- **MVP relevance**: not on JH/B2B run loop. Skip for MVP.

### 7. useAgentGeneration.ts (132 LOC)
- **next/***: none
- **Server actions**: none
- **Fetch URLs**: none (delegates entirely)
- **External deps**: `@/store/agent-store` (zustand store, no `next/*`), `@/lib/generation` (re-exports `useGeneration`), `@/config/agents` (AGENT_REGISTRY -- contains relative paths `/api/agents/job-hunter/generate` at `src/config/agents.ts:118,119,153,154`)
- **Verdict**: **DIRECT** for this file. Its transitive deps need patching (see dep chain in section (c)).
- **Effort**: TRIVIAL (this file) -- but MEDIUM once you include `useGeneration.ts` + `machine/actors.ts` + `AGENT_REGISTRY`.

### 8. useOnboardingStatus.ts (53 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: none (pure reducer)
- **External deps**: `react` only
- **Verdict**: **DIRECT**.
- **Effort**: TRIVIAL
- **MVP relevance**: skip -- onboarding is website-specific first-run UX.

### 9. useGoogleLogin.ts (126 LOC)
- **next/***: `next/navigation` (`useSearchParams` L4), `next-intl` (L5)
- **Server actions**: none
- **Browser APIs**: `window.location.assign`, `window.addEventListener('pageshow')`
- **External deps**: `supertokens-auth-react/recipe/thirdparty` (`getAuthorisationURLWithQueryParamsAndSetState`), `@/lib/auth/supertokens` (calls `ensureSuperTokensInit()` at MODULE SCOPE L18 -- any transitive import pulls SuperTokens into the bundle), `@/lib/auth/cross-subdomain-storage`, `@/lib/auth/shared`, `@/lib/auth/config`, `@/lib/env-client`
- **Verdict**: **SKIP / REWRITE**. SuperTokens browser SDK is incompatible with MV3 (cross-subdomain cookies, window redirects). Extension must use `chrome.identity.launchWebAuthFlow` or API-key auth stored in `chrome.storage.local`. Entire file is throwaway for the MVP.
- **Effort**: N/A (skip). Replacement auth module is a separate task.
- **CRITICAL**: ensure no extension entry file transitively imports this hook or `@/lib/auth/supertokens` -- module-scope `ensureSuperTokensInit()` will execute and bloat the bundle.

### 10. useArtifactVersions.ts (177 LOC)
- **next/***: none
- **Server actions**: none
- **Browser APIs**: none (pure state/reducer logic over a prop array)
- **External deps**: `@/types/generation-artifacts` (type only), `@/lib/artifact-utils` (`normalizeVersions`, `PENDING_GENERATION_ID`)
- **Verdict**: **DIRECT**.
- **Effort**: TRIVIAL
- **MVP relevance**: tier-2 -- needed once artifact UI (CV viewer) ships.

### 11. useCredits.tsx (338 LOC)
- **next/***: none
- **Server actions**: none
- **Fetch URLs**: `/api/settings/profile` (L25, relative)
- **Browser APIs**: `document.hidden`, `document.addEventListener('visibilitychange')`, `setInterval`, `AbortSignal.timeout`, `AbortSignal.any`
- **External deps**: `@/lib/debug-logger`, `@repo/shared-types` (UserTier, CREDITS_PER_USD), `@/config/pricing` (DEFAULT_SIGNUP_CREDITS)
- **Verdict**: **PATCH**. Route fetch through `authedFetch(`${API_BASE}/api/settings/profile`)`. Cookies replaced with `Authorization: Bearer <apiKey>` header. Provider component works unchanged in React popup.
- **Effort**: SMALL

### 12. useAgentHydrationLogs.ts (269 LOC)
- **next/***: `next-intl` (`useTranslations('generation')` L4, L59)
- **Server actions**: none
- **Fetch URLs**: `HYDRATION_ENDPOINT(sessionId)` from `@/lib/generation/hydration-utils` -- uses `/api/sessions/${sessionId}/hydrate` (verified below)
- **Browser APIs**: `AbortSignal.timeout`, `AbortSignal.any`
- **External deps**: `sonner`, `@/lib/debug-logger`, `@/components/chat/generation` (type only), `@repo/shared-types`, `@/store/agent-store/types` (type only), `@/lib/generation/hydration-utils`
- **Verdict**: **PATCH**. i18n shim + `HYDRATION_ENDPOINT` helper re-pointed at `${API_BASE}`.
- **Effort**: SMALL-to-MEDIUM (also drags in `hydration-utils.ts`).

### 13. useSessionSync.ts (381 LOC)
- **next/***: `next-intl` (`useTranslations('shared')` L4, L109)
- **Server actions**: none
- **Fetch URLs**: `/api/sessions` (L38) and `${SESSIONS_ENDPOINT}?cursor=...` (L251), both relative
- **Browser APIs**: `AbortSignal.timeout`, `AbortSignal.any`, `document.visibilityState`, `document.addEventListener('visibilitychange')`
- **External deps**: `@/lib/debug-logger`, `@/lib/api/transformers`, `@/config/agents` (DEFAULT_APP_MODE), `@/types/session`
- **Verdict**: **PATCH**. Swap endpoint constant + i18n shim + authed fetch.
- **Effort**: SMALL-to-MEDIUM

### 14. useGeneration.ts (867 LOC) -- src/lib/generation/useGeneration.ts
- **next/***: `next-intl` (`useTranslations('generation')` L15)
- **Server actions**: none
- **Fetch URLs**: INDIRECT -- uses `AGENT_REGISTRY[...].apiEndpoint`/`.interactionEndpoint` from `@/config/agents` (relative paths `/api/agents/job-hunter/generate` etc at `src/config/agents.ts:118,119,153,154`). Also depends on `@/lib/generation/machine/actors.ts` which has hardcoded `/api/sessions/${sessionId}/hydrate` at L356-357 and streams via `fetch(url, ...)` at L177 where `url` is the `streamUrl` returned by the submit actor (backend returns `/api/stream/{generationId}`).
- **Browser APIs**: none directly (inherits from `useConnectionHealth`)
- **External deps**: `@xstate/react` (`useActorRef`, `useSelector`), `xstate` (`fromPromise`), `sonner` (toast), `@/lib/debug-logger`, `@/lib/strip-html`, `./message-utils`, `./artifact-transforms`, `./machine/machine`, `./machine/actors.ts`, `@/hooks/useConnectionHealth`, `@/hooks/useCredits` (imports `triggerCreditsRefetch`), `@/hooks/useSessionSync` (imports `triggerSessionSync`), `@/config/agents` (AGENT_REGISTRY), `@/types/session`
- **Verdict**: **PATCH**. This is the most load-bearing hook in the extension. Patches: (1) i18n shim, (2) `AGENT_REGISTRY` endpoints rewritten to absolute `${API_BASE}/api/agents/.../generate`, (3) `machine/actors.ts` `/api/sessions/{id}/hydrate` + SSE `url` helper re-pointed at `${API_BASE}`, (4) `authedFetch()` wrapper for POST/GET with bearer token.
- **Effort**: MEDIUM (hook itself is fine, but machine + registry + actors all need coordinated changes)
- **CRITICAL**: the module-scope import of `@/hooks/useCredits` and `@/hooks/useSessionSync` means porting `useGeneration` forces porting both of those too (it imports the `triggerCreditsRefetch` / `triggerSessionSync` functions, not the hooks themselves -- those are side-effect-free module-level pub/sub registries, but the files still need to be present and compile).

## (c) Top 5 Hooks to Port First (MVP for JH + B2B)

Ranked by load-bearing role. Each row lists the full dependency chain that must be ported with it.

### 1. useGeneration.ts (src/lib/generation/) -- THE CORE
Without it, no JH or B2B run can happen. Drags in the most dependencies.
- **Must port with**:
  - `src/lib/generation/machine/machine.ts`
  - `src/lib/generation/machine/actors.ts` (patch fetch URLs)
  - `src/lib/generation/machine/events.ts`
  - `src/lib/generation/message-utils.ts`
  - `src/lib/generation/artifact-transforms.ts`
  - `src/lib/generation/types.ts`
  - `src/lib/generation/index.ts`
  - `src/config/agents.ts` (AGENT_REGISTRY -- patch endpoints to absolute URLs)
  - `src/hooks/useConnectionHealth.ts` (DIRECT, imported at L23)
  - `src/hooks/useCredits.tsx` (imported for `triggerCreditsRefetch`)
  - `src/hooks/useSessionSync.ts` (imported for `triggerSessionSync`)
  - `src/lib/debug-logger.ts`
  - `src/lib/strip-html.ts`
  - `src/types/session.ts`
  - `@xstate/react`, `xstate`, `sonner` (new npm installs)
  - i18n shim module (new, one file)
  - `authedFetch` helper (new, one file)

### 2. useAgentGeneration.ts (src/hooks/) -- the JH/B2B facade
Thin wrapper around `useGeneration`, exposed to UI components.
- **Must port with**:
  - everything from row 1, plus
  - `src/store/agent-store/` entire directory (`index.tsx`, `actions.ts`, `artifacts.ts`, `constants.ts`, `selectors.ts`, `types.ts`, `utils.ts`)
  - `zustand` (new npm install)

### 3. useCredits.tsx (src/hooks/) -- balance gate
Users need to see balance pre-run; background worker can also consume it.
- **Must port with**:
  - `src/lib/debug-logger.ts`
  - `@repo/shared-types` (`UserTier`, `CREDITS_PER_USD`)
  - `src/config/pricing.ts` (DEFAULT_SIGNUP_CREDITS)
  - `authedFetch` helper + `API_BASE` constant

### 4. useAgentHydrationLogs.ts (src/hooks/) -- resume after popup death
MV3 popups die aggressively; every reopen must resume in-flight generations.
- **Must port with**:
  - `src/lib/generation/hydration-utils.ts` (patch `HYDRATION_ENDPOINT` to absolute URL)
  - `src/components/chat/generation.ts` (type only)
  - `src/store/agent-store/types.ts` (type only -- already needed by row 2)
  - `@repo/shared-types` (`ArtifactPayload`)
  - `sonner`
  - i18n shim
  - `authedFetch`

### 5. useSessionSync.ts (src/hooks/) -- session list for sidebar
Required for the "recent sessions" sidebar and for `triggerSessionSync()` which row 1 depends on.
- **Must port with**:
  - `src/lib/debug-logger.ts`
  - `src/lib/api/transformers.ts`
  - `src/config/agents.ts` (DEFAULT_APP_MODE -- already needed by row 1)
  - `src/types/session.ts`
  - i18n shim
  - `authedFetch`

### Runner-up (6th): useConnectionHealth.ts -- already pulled in by row 1
DIRECT port, no patches, required transitively.

### Runner-up (7th): useVersionContentFetch.ts -- for viewing CV versions
PATCH (i18n + absolute URL). First artifact-viewing feature.

## (d) Safe-to-Skip Table (verified, not uncertain)

| Hook | Skip reason |
|------|-------------|
| useGoogleLogin.ts | SuperTokens incompatible with MV3; extension uses API-key auth or `chrome.identity`. Also: module-scope `ensureSuperTokensInit()` at L18 will bloat any entry that transitively imports it. |
| useAnalytics.ts | Umami script injection blocked by MV3 CSP. Stub with `track: () => {}`. |
| useTheme.ts | MVP: light-only or `prefers-color-scheme`. Defer. |
| useOnboardingStatus.ts | Onboarding modal is website-only first-run UX. |
| useMediaQuery.ts | Popup has fixed viewport. No responsive breakpoints. |
| useAutosave.ts | Only used by profile/strategy editors, not JH/B2B run loop. |
| useArtifactVersions.ts | Tier-2: only needed when artifact viewer ships. |

## (e) Key Patch Patterns (confirmed via file reads)

1. **next-intl** is used by 5 hooks: `useVersionContentFetch`, `useAutosave`, `useAgentHydrationLogs`, `useSessionSync`, `useGeneration`. Plus `useGoogleLogin` (skipped). **Strategy**: create `src/extension/i18n.ts` exporting a `useTranslations(ns)` shim that returns a flat key lookup from a JSON bundle. Re-map the `next-intl` import via WXT vite alias (`resolve.alias: { 'next-intl': '/src/extension/i18n.ts' }`) so no hook source needs editing.

2. **Relative fetch URLs** (`/api/...`): confirmed in 7 locations:
   - `useVersionContentFetch.ts:55` -- `/api/sessions/.../download`
   - `useCredits.tsx:25` -- `/api/settings/profile`
   - `useSessionSync.ts:38` -- `/api/sessions`
   - `useSessionSync.ts:251` -- `/api/sessions?cursor=...`
   - `src/config/agents.ts:118,119,153,154` -- agent generate/interact endpoints
   - `src/lib/generation/machine/actors.ts:357` -- `/api/sessions/{id}/hydrate`
   - `src/lib/generation/hydration-utils.ts` -- `HYDRATION_ENDPOINT` builder (same pattern, referenced from `useAgentHydrationLogs`)
   **Strategy**: centralize `API_BASE = 'https://api.llmconveyors.com'` in `src/extension/base-url.ts` and export an `authedFetch(path, init)` wrapper that prepends `API_BASE` and injects `Authorization: Bearer <key>` from `chrome.storage.local`. Replace direct `fetch` calls in each patched file.

3. **Auth header**: hooks assume same-site cookies (`cache: 'no-store'` only). Extension must inject `Authorization: Bearer <apiKey>`. Centralize in `authedFetch()`.

4. **SSR branches** (`typeof window === 'undefined'`): present in `useConnectionHealth.ts:69`, `useTheme.ts:9,16`, `useAnalytics.ts:21`. Harmless in extension -- remove in a later cleanup pass, not blocking.

5. **`'use client'` directives**: harmless no-ops in WXT React build. Leave as-is.

6. **`next/navigation`**: only used by `useGoogleLogin.ts` (which is skipped). Zero other hooks use it. Confirmed via `Grep "from ['\"]next/" src/**/use*.{ts,tsx}`.

7. **`next/server`, `next/headers`, server actions**: zero uses across all 14 hooks. Confirmed clean.

## (f) Notable Findings & Gotchas

- **Critical dep chain**: porting `useGeneration.ts` is the single biggest integration task. It pulls in the entire `src/lib/generation/machine/` tree (machine + actors + events), `useConnectionHealth`, and module-level `triggerCreditsRefetch` / `triggerSessionSync` from `useCredits` / `useSessionSync`. You cannot port the JH/B2B generation flow without porting all three hooks simultaneously.
- **SSE stream fetch**: `src/lib/generation/machine/actors.ts:177` uses `fetch(url, ...)` with a streamed response body for SSE. In MV3, `fetch` supports streaming response bodies in popup/sidepanel contexts, but **the popup will disconnect when it closes**. For reliable long-running SSE, the stream fetch must be relocated to a background service worker and bridged to the popup via `chrome.runtime.sendMessage` / `chrome.runtime.Port`. This is out-of-scope for the hook audit but is a HARD BLOCKER for the extension MVP's generation UX; flag for the architecture agent.
- **`useGoogleLogin.ts:18`** calls `ensureSuperTokensInit()` at module top-level. Any transitive import pulls SuperTokens into the bundle (adds ~200KB). The extension entry must NOT import this hook, directly or indirectly.
- **`useCredits.tsx:25`** hardcodes `/api/settings/profile`. **`useSessionSync.ts:38`** hardcodes `/api/sessions`. Both are top-level module constants -- centralize into `src/extension/endpoints.ts` and re-import.
- **`useTheme.ts:10`** reads `localStorage` at module boundary. Safe in extension (popup/sidepanel have `localStorage`), but `chrome.storage.local` would be more idiomatic for cross-context sync. Defer -- not MVP-blocking.
- **`useAnalytics.ts:27`** silently defaults consent to `true` on `localStorage` read failure (legitimate interest). In the extension, stub should default to `false` to ship zero tracking by default.
- **`useAutosave.ts:181`** registers a `beforeunload` handler. Extension popups do NOT fire `beforeunload` reliably -- this code path becomes a no-op. Harmless, leave as-is.
- **Hook inventory accuracy**: prior agent's inventory was 13 hooks but missed `src/lib/generation/useGeneration.ts` (867 LOC, the most load-bearing file in the generation flow). Corrected total: 14 hook source files + 3 co-located tests = 17 files.
- **Co-located tests**: `__tests__/useSessionSync.test.ts`, `__tests__/useArtifactVersions.guard.test.ts`, `__tests__/useAgentHydrationLogs.hydration-restore.test.ts`. Port each with its hook if the hook is ported.

## Verdict Summary

| Hook | Verdict | Effort | MVP? |
|------|---------|--------|------|
| useConnectionHealth | DIRECT | TRIVIAL | yes (via useGeneration) |
| useMediaQuery | DIRECT | TRIVIAL | no |
| useVersionContentFetch | PATCH | SMALL | tier-2 |
| useTheme | PATCH | SMALL | no |
| useAnalytics | REWRITE (stub) | TRIVIAL | no |
| useAutosave | PATCH | SMALL | no |
| useAgentGeneration | DIRECT | TRIVIAL | yes |
| useOnboardingStatus | DIRECT | TRIVIAL | no |
| useGoogleLogin | SKIP | N/A | no (replaced by API-key auth) |
| useArtifactVersions | DIRECT | TRIVIAL | tier-2 |
| useCredits | PATCH | SMALL | yes |
| useAgentHydrationLogs | PATCH | SMALL-MED | yes |
| useSessionSync | PATCH | SMALL-MED | yes |
| useGeneration (lib/generation) | PATCH | MEDIUM | yes (the core) |

MVP hook count: **6** (useGeneration + useAgentGeneration + useCredits + useAgentHydrationLogs + useSessionSync + useConnectionHealth). Plus the SSE background-worker relocation, which is an architecture concern, not a hook audit concern.

---

Confidence: 100%
Filename: e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\31-frontend-hooks.md
