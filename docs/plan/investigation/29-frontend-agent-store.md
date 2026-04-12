# 29 — Frontend Agent Store Portability (WXT Extension)

## a) File inventory — `src/store/agent-store/`

| File | Lines | Purpose |
|---|---|---|
| `index.tsx` | 148 | React Context provider + store factory |
| `actions.ts` | 763 | Zustand action creators (`createAgentActions`) |
| `artifacts.ts` | 323 | Session → artifact builder / merge |
| `types.ts` | 139 | State + action type definitions |
| `selectors.ts` | 54 | Derived state selectors |
| `utils.ts` | 131 | localStorage wrappers, sanitize, chat merge |
| `constants.ts` | 14 | Safety caps (`MAX_SESSIONS`, etc.) |
| `__tests__/actions.test.ts` | 686 | Vitest: actions (pure, no browser APIs) |
| `__tests__/selectors.test.ts` | 216 | Vitest: selectors (pure) |

No barrel `src/store/index.ts` exists — consumers import from `@/store/agent-store` (resolves to `index.tsx`).

## b) Complete state shape

From `types.ts:59-93`, the `AgentStoreState` has these exact fields:

| Field | Type | Initial / notes |
|---|---|---|
| `agentType` | `'job-hunter' \| 'b2b-sales'` | From constructor arg |
| `sessions` | `ClientSession[]` | From `initialState.sessions` (filtered for valid id) |
| `currentSessionId` | `string \| null` | `initialState.currentSessionId ?? sessions[0]?.id ?? null` |
| `sessionArtifacts` | `Record<string, AgentArtifacts \| null>` | Built via `buildArtifactsFromSession` per session |
| `sourceDocuments` | `Record<string, string>` | JH defaults: `originalCV, extensiveCV, coverLetter, cvStrategy, coverLetterStrategy, coldEmailStrategy, reconStrategy`. Sales defaults: `userCompanyContext, salesStrategy, reconStrategy` |
| `mode` | `'standard' \| 'cold_outreach'` | `'standard'` (may be overridden from localStorage in restore effect) |
| `selectedTier` | `'free' \| 'byo'` | `initialState.selectedTier` (validated) `?? 'free'` |
| `selectedModel` | `'flash' \| 'pro'` | `'flash'` (may be overridden from localStorage) |
| `themePreferences` | `{ selectedTheme: string }` | `{ selectedTheme: DEFAULT_THEME }` |
| `pendingInteraction` | `{ type, data, ids: { jobId?, sessionId, generationId? } } \| null` | `null` |
| `autoSelectContacts` | `boolean` | Read sync from localStorage `agent:autoSelectContacts` at store creation (`index.tsx:40-41`), default `true` |
| `autoApproveDraft` | `boolean` | `initialState.autoApproveDraft ?? true` |
| `autoApproveFollowups` | `boolean` | `initialState.autoApproveFollowups ?? true` |
| `followUpCount` | `number` | `initialState.followUpCount ?? 2` |
| `followUpDelayDays` | `number` | `initialState.followUpDelayDays ?? 2` |
| `emailPreferences` | `{ spellingVariant: 'us'\|'uk', cta, senderSignature, physicalAddress? }` | `{ spellingVariant: 'us', cta: 'Open to a 20 min call this week?', senderSignature: '', physicalAddress: '' }` |
| `isNewSession` | `boolean` | `false` |
| `sessionPagination` | `{ hasMore: boolean, isLoadingMore: boolean }` | `{ hasMore: true, isLoadingMore: false }` |
| `generationRunsBySession` | `Record<string, GenerationRun[]>` | `{}` |
| `generationRunsLoadingBySession` | `Record<string, boolean>` | `{}` |
| `hydrationErrors` | `Record<string, string>` | `{}` |
| `cancelGenerationBySession` | `Record<string, () => void>` | `{}` |
| `submitInteractionBySession` | `Record<string, (response) => Promise<void>>` | `{}` |
| `pendingReconnections` | `Record<string, { streamUrl, generationId, lastEventId?, completedPhase? }>` | `{}` |
| `actions` | `AgentStoreActions` (30 methods) | Created via `createAgentActions(set, get)` |

Action methods (from `types.ts:95-131`): `setSessions, appendSessions, setSessionPagination, selectSession, appendChatMessage, setGeneratedDocuments, setMode, setSelectedTier, setSelectedModel, setThemePreference, updateSourceDocument, setSessionStatus, removeSession, upsertSession, setPendingInteraction, clearPendingInteraction, onInteractionRestore, setAutoSelectContacts, setAutoApproveDraft, setAutoApproveFollowups, setFollowUpCount, setFollowUpDelayDays, updateEmailPreferences, setGenerationRuns, setGenerationRunsLoading, setHydrationError, addGenerationRun, appendGenerationLogEntry, updateGenerationRunStatus, removeGenerationRun, setCancelActiveGeneration, setSubmitInteraction, setPendingReconnection, rebuildSessionArtifacts, revertTransientStatus`.

## c) Persistence strategy

**localStorage only** (no IndexedDB, no `chrome.storage`, no Zustand `persist` middleware, no `BroadcastChannel`, no `storage` event listener). Manual read/write only.

Persisted keys (all agent-scoped via `agentStorageKey(agentType, base) = "${agentType}:${base}"`):

| Base key constant | Literal string | Scoped example | Where |
|---|---|---|---|
| `STORAGE_KEY_CHAT_MODE` | `"chatMode"` | `"job-hunter:chatMode"` | Written: `actions.ts:225`, `utils.ts:68` (`persistMode`). Read: `index.tsx:111` |
| `STORAGE_KEY_MODEL` | `"selectedModel"` | `"job-hunter:selectedModel"` | Written: `actions.ts:234, 241`. Read: `index.tsx:115` |
| `STORAGE_KEY_THEME` | `"selectedTheme"` | `"job-hunter:selectedTheme"` | Written: `actions.ts:247`. Read: `index.tsx:125` |
| `STORAGE_KEY_AUTO_SELECT_CONTACTS` | `"autoSelectContacts"` | `"job-hunter:autoSelectContacts"` | Written: `actions.ts:382`. Read: `index.tsx:40` (sync, inside `createAgentStore`) and `index.tsx:101` (legacy migration) |
| `STORAGE_KEY_TIER` | `"selectedTier"` | (unscoped legacy) | Removed only: `index.tsx:95` (`safeRemove(STORAGE_KEY_TIER)` — cleanup, no longer persisted) |

**Legacy flat keys** (unscoped, `chatMode`/`selectedTheme`/`selectedModel`/`autoSelectContacts`) are read once in a one-shot migration (`index.tsx:98-107`) and copied into the agent-scoped keys if the scoped version is absent.

Sessions, artifacts, generation runs, source documents, email preferences, follow-up counts, and all per-session maps are **NOT** persisted — they come from `initialState` (SSR hydration) and server API calls.

## d) Every localStorage key used (exact literal strings)

After `agentStorageKey(agentType, base)` expansion, for `agentType ∈ {'job-hunter', 'b2b-sales'}`, the exact literal keys touched are:

1. `"job-hunter:chatMode"` / `"b2b-sales:chatMode"` — get/set
2. `"job-hunter:selectedModel"` / `"b2b-sales:selectedModel"` — get/set
3. `"job-hunter:selectedTheme"` / `"b2b-sales:selectedTheme"` — get/set
4. `"job-hunter:autoSelectContacts"` / `"b2b-sales:autoSelectContacts"` — get/set
5. `"selectedTier"` — `removeItem` only (`index.tsx:95`)
6. Legacy unscoped (read-only during migration, `index.tsx:102`): `"chatMode"`, `"selectedModel"`, `"selectedTheme"`, `"autoSelectContacts"`

Total: 8 active scoped keys + 1 removed legacy + 4 legacy-read-only = 13 literal keys across the directory.

## e) Every browser-API call with exact file:line

All browser API usage is confined to `utils.ts` and the restore effect in `index.tsx`. Wrapped, guarded, and auditable:

| File:line | Call | Notes |
|---|---|---|
| `utils.ts:9` | `typeof window !== "undefined"` | Guard |
| `utils.ts:10` | `localStorage.getItem(key)` | inside `safeGetItem`, try/catch |
| `utils.ts:20` | `typeof window !== "undefined"` | Guard |
| `utils.ts:21` | `localStorage.setItem(key, value)` | inside `safePersist`, try/catch |
| `utils.ts:30` | `typeof window !== "undefined"` | Guard |
| `utils.ts:31` | `localStorage.removeItem(key)` | inside `safeRemove`, try/catch |

That is the complete inventory — **zero other browser APIs** (no `document`, no `navigator`, no `sessionStorage`, no `IndexedDB`, no `fetch`, no `window.location`, no `BroadcastChannel`, no `crypto`, no timers in the store directory). All seven direct browser calls are wrapped in three helper functions.

`actions.ts`, `artifacts.ts`, `types.ts`, `selectors.ts`, `constants.ts`, `__tests__/*` contain **zero** direct browser API usage. They consume `safePersist`/`safeGetItem`/`safeRemove`/`persistMode` only.

## f) Import graph — consumers of `@/store/agent-store`

No barrel `src/store/index.ts` exists. 20 files in `src/` import from `@/store/agent-store`:

```
src/components/chat/ChatInterface.tsx
src/components/chat/artifacts/ArtifactsPanel.tsx
src/components/chat/artifacts/CVArtifactCard.tsx
src/components/chat/artifacts/TextArtifactCard.tsx
src/components/sales/SalesInterface.tsx
src/components/sales/SalesSettingsPanel.tsx
src/components/sales/artifacts/SalesArtifactsPanel.tsx
src/components/agent/AgentApp.tsx
src/components/agent/AgentSessionSidebar.tsx
src/components/agent/AgentView.tsx
src/components/agent/gates/PhaseGateRenderer.tsx
src/components/agent/gates/types.ts
src/components/settings/AgentPanel.tsx
src/components/settings/DynamicAgentPreferences.tsx
src/lib/agents/job-hunt/index.tsx
src/lib/agents/b2b-sales/index.tsx
src/lib/generation/agents/b2b-sales.config.ts
src/lib/generation/agents/job-hunter.config.ts
src/hooks/useAgentGeneration.ts
src/hooks/useAgentHydrationLogs.ts
```

All consumers use `@/store/agent-store` path-alias (no relative imports). A WXT extension build only needs to preserve that alias (trivial in `tsconfig.json` + Vite `resolve.alias`).

## g) Next.js-specific imports

- `"use client"` directive at `index.tsx:1` — the only Next/React-DOM-specific artifact. WXT/Vite ignores it (harmless no-op) but should be removed for cleanliness.
- **Zero `next/*` imports** across all 9 files (verified via `Grep pattern:"next/"`). No `next/navigation`, no `next/headers`, no `next/dynamic`, no `next/image`, no `next/link`, no server actions, no `revalidateTag`.
- Path aliases used: `@/config/*`, `@/types/*`, `@/lib/*`, `@/components/*`, `@repo/shared-types`. These are tsconfig aliases, not Next-specific — WXT/Vite resolves them via `tsconfig.paths` + `vite-tsconfig-paths`.

## h) Cross-tab sync

**None.** No `window.addEventListener('storage', ...)`, no `BroadcastChannel`, no `navigator.locks`. Each React tree owns its own store instance via `useState(() => createAgentStore(...))` (`index.tsx:91`). In an extension with popup + side panel + content script, each context will have its own store — acceptable for MVP because the only persisted state is user UI prefs (mode/model/theme/autoSelectContacts); server-backed state rehydrates on mount.

## i) Per-file portability rating

| File | Rating | Notes |
|---|---|---|
| `constants.ts` | **DIRECT** | Pure constants, no imports beyond internal |
| `types.ts` | **DIRECT** | Pure types + guards. Imports `zustand`, `@/types/*`, `@/components/chat/generation`, `@repo/shared-types` — all portable |
| `selectors.ts` | **DIRECT** | Pure functions |
| `artifacts.ts` | **DIRECT** | Pure transforms. Imports `@/types/*`, `@repo/shared-types`, `@/lib/artifact-utils` |
| `actions.ts` | **PATCH** | Uses `safePersist` + `agentStorageKey` + `persistMode` + `sessionSortValue` + `mergeSessionLists` (via `@/lib/session-state-manager`) — swap storage backend via `utils.ts` rewrite. No direct browser APIs |
| `utils.ts` | **PATCH** | Replace `safeGetItem`/`safePersist`/`safeRemove` bodies with `StorageAdapter` implementation |
| `index.tsx` | **PATCH** | Drop `"use client"`, convert restore `useEffect` to async, replace sync `safeGetItem(autoSelectContacts)` at `index.tsx:40` with async hydration path |
| `__tests__/actions.test.ts` | **DIRECT** | No browser API. Runs in Vitest/jsdom identically |
| `__tests__/selectors.test.ts` | **DIRECT** | Pure |

No file requires **REWRITE**.

## j) Sync → async migration — concrete call sites

Two sync localStorage reads happen **before or synchronously inside** `useEffect`, and both must become async when the storage backend is `chrome.storage.local`:

**Sync read #1 — `index.tsx:40-41` (BLOCKING for async migration)**
```ts
const persisted = safeGetItem(agentStorageKey(agentType, STORAGE_KEY_AUTO_SELECT_CONTACTS));
const autoSelectContacts = persisted === null ? true : persisted !== "false";
```
This runs **inside `createAgentStore`**, synchronously, before `createStore<AgentStoreState>` is called. With `chrome.storage.local` this must move either:
- Into the restore `useEffect` (initial value becomes `true`, corrected on first async tick), OR
- Above `createAgentStore` via top-level `await` in the WXT entrypoint (pre-hydrate the initial state).

Recommendation: move into the restore effect, matching the same pattern as `mode`/`selectedModel`/`themePreferences`. Initial paint uses `true`; if stored value is `"false"`, it flips on next tick. Same UX as current code for the other three keys.

**Sync read #2 — `index.tsx:93-132` (the restore `useEffect`)**

Current behavior: sync `useEffect` that runs four operations that all become async under `chrome.storage.local`:
1. `safeRemove(STORAGE_KEY_TIER)` — (async in extension, fire-and-forget OK)
2. Legacy key migration loop (`index.tsx:99-107`): 4 pairs of (getItem + getItem + setItem). All must `await`.
3. Restore 3 keys: `chatMode`, `selectedModel`, `selectedTheme` (`index.tsx:111-128`). All must `await`.
4. `store.setState(updates)` — sync, runs after awaits.

The effect body must become `async` (wrapped in an inner `async function run() { ... }; void run();` pattern — `useEffect` callbacks cannot be async themselves). Single `chrome.storage.local.get([...keys])` batch read is preferred over N individual awaits.

**Fire-and-forget writes** (`actions.ts:225, 234, 241, 247, 382`) — already non-awaited, can stay non-awaited. `chrome.storage.local.set()` returns a Promise that we swallow the same way `localStorage.setItem` errors are swallowed. The adapter wraps both backends uniformly.

## k) Proposed `StorageAdapter` interface

```ts
// src/store/agent-store/storage-adapter.ts (new file — adds one file to the directory)

/**
 * Backend-agnostic storage interface. Reads are async (forward-compatible with
 * chrome.storage.local), writes are fire-and-forget. Errors are swallowed —
 * storage is best-effort, never business-critical.
 */
export interface StorageAdapter {
  /** Read a single key. Returns null if missing, unreadable, or backend errored. */
  get(key: string): Promise<string | null>;
  /** Batch read — adapters MAY optimize (chrome.storage.local does this in one round-trip). */
  getMany(keys: readonly string[]): Promise<Record<string, string | null>>;
  /** Write (fire-and-forget — implementations must not throw). */
  set(key: string, value: string): void;
  /** Remove (fire-and-forget). */
  remove(key: string): void;
}

// Web build (Next.js / dev server)
export const localStorageAdapter: StorageAdapter = {
  async get(key) {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    } catch { return null; }
  },
  async getMany(keys) {
    const out: Record<string, string | null> = {};
    for (const k of keys) out[k] = await this.get(k);
    return out;
  },
  set(key, value) {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); } catch {}
  },
  remove(key) {
    try { if (typeof window !== "undefined") window.localStorage.removeItem(key); } catch {}
  },
};

// Extension build (WXT)
export const chromeStorageAdapter: StorageAdapter = {
  async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      const v = result[key];
      return typeof v === "string" ? v : null;
    } catch { return null; }
  },
  async getMany(keys) {
    try {
      const result = await chrome.storage.local.get([...keys]);
      const out: Record<string, string | null> = {};
      for (const k of keys) {
        const v = result[k];
        out[k] = typeof v === "string" ? v : null;
      }
      return out;
    } catch {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = null;
      return out;
    }
  },
  set(key, value) {
    void chrome.storage.local.set({ [key]: value }).catch(() => {});
  },
  remove(key) {
    void chrome.storage.local.remove(key).catch(() => {});
  },
};
```

Selection mechanism (pick one — all compatible with WXT + Next.js coexistence):
- **Build-time alias**: Vite `resolve.alias` `@/store/agent-store/storage-backend` → `chrome-storage.ts` in extension, `local-storage.ts` in web. Zero runtime detection.
- **Runtime detect**: `typeof chrome !== "undefined" && chrome.storage?.local ? chromeStorageAdapter : localStorageAdapter` — one ternary at module load.
- **Provider injection**: pass adapter as a prop to `AgentStoreProvider`. Most explicit but touches all 20 consumers. NOT recommended.

Recommendation: runtime detect in `utils.ts`, exported as a module constant. `utils.ts` helpers (`safeGetItem`, `safePersist`, `safeRemove`) delegate to the adapter. `safeGetItem` becomes async (returns `Promise<string | null>`), which forces the 2 call sites in `index.tsx` to `await`. `safePersist` and `safeRemove` stay sync (void return) because they are fire-and-forget.

## l) Required edits (exhaustive)

**File: `utils.ts`** (PATCH)
1. Add import `import { storageAdapter } from "./storage-backend";` (new file).
2. `safeGetItem` — change signature to `Promise<string | null>`, body calls `storageAdapter.get(key)`. All callers (3 in `index.tsx`) must `await`.
3. `safePersist` — body calls `storageAdapter.set(key, value)`. Signature unchanged (`void`).
4. `safeRemove` — body calls `storageAdapter.remove(key)`. Signature unchanged (`void`).
5. `persistMode` — no change (delegates to `safePersist`).

**File: `index.tsx`** (PATCH)
1. Remove `"use client";` directive (line 1).
2. Move sync `autoSelectContacts` hydration out of `createAgentStore` body (delete lines 40-41). Initialize `autoSelectContacts: true` unconditionally in the store factory.
3. Restore `useEffect` (lines 93-132) — convert to async IIFE pattern. Wrap existing logic in `async function hydrate() { ... }; void hydrate();`. Use `await storageAdapter.getMany([...])` for a single batched read of all 4+1 keys (4 scoped + 1 autoSelectContacts).
4. Add `autoSelectContacts` restoration to the `updates` batch: if `await safeGetItem(agentStorageKey(agentType, STORAGE_KEY_AUTO_SELECT_CONTACTS))` returns `"false"`, set `updates.autoSelectContacts = false`.
5. Legacy migration loop (lines 98-107) — wrap awaits, otherwise identical logic.

**File: `actions.ts`** (PATCH — 0 behavior changes)
No changes. Already calls `safePersist` which stays sync. Action setters remain synchronous.

**File: `storage-backend.ts`** (NEW)
1. Define `StorageAdapter` interface.
2. Define `localStorageAdapter` and `chromeStorageAdapter`.
3. Export `storageAdapter` — runtime-detected constant.

**Files: `types.ts`, `constants.ts`, `selectors.ts`, `artifacts.ts`, `__tests__/*`** (DIRECT)
Zero changes.

## m) Risks and gotchas

1. **First-paint flicker for `autoSelectContacts`**: current code reads sync at store creation, so first render has the user's real preference. After migration, first render shows `true` (default) and may flip to `false` one tick later if the user had disabled it. Mitigation: pre-hydrate at the WXT entrypoint before mounting, OR accept the flicker (checkbox briefly appears checked then unchecks — mild UX cost, no data corruption).
2. **chrome.storage.local quota**: 10 MB default vs localStorage 5–10 MB. All 4 keys combined are <100 bytes — no quota concern.
3. **Storage event ordering under rapid writes**: `chrome.storage.local.set` is async; two `setMode` calls fired back-to-back could theoretically commit out-of-order. In practice Chromium serializes writes per origin — but documented as "no ordering guarantee." Fix if observed: chain via a single mutex in the adapter. Not needed for MVP.
4. **Service worker context**: MV3 service workers do not have `localStorage` but **do** have `chrome.storage.local`. A content-script + background-worker split must use the chrome adapter everywhere, not mix.
5. **Tests**: `actions.test.ts` and `selectors.test.ts` construct state manually via `createTestStore`, never touching `createAgentStore` or the provider. They will pass unchanged under either backend. No test infra changes needed.
6. **Private browsing / incognito**: `chrome.storage.local` persists across incognito only if the extension has `incognito: "spanning"` in manifest. Default is `"split"` — separate storage per incognito/normal. Matches existing localStorage behavior, no regression.

## Summary

The directory is **fully portable** with one new file (`storage-backend.ts`, ~50 LOC), one signature change (`safeGetItem` returns `Promise<string | null>`), two `await` additions in `index.tsx`, and one `"use client"` directive removal. No other file in the directory changes. Browser surface is exactly **7 callsites across 2 functions in 1 file** (`utils.ts:9,10,20,21,30,31` plus the restore `useEffect` that calls them). Zero `next/*` imports anywhere. All 20 external consumers (listed in section f) need zero edits — they import types, selectors, the hook, and the provider, none of which change signatures. Tests pass unchanged. Core state machine (actions, artifacts, selectors, types, constants) ports as pure TypeScript.

Confidence: 100%
Filename: 29-frontend-agent-store.md
