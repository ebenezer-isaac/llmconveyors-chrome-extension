# 54 — Chrome MV3 Extension Architecture (Context Responsibility Map)

**Scope**: definitive mapping of which logic runs in background service worker vs content script vs popup vs side panel, and how contexts message each other.

**Stack**: WXT + React + TypeScript, MV3, `@webext-core/messaging` for typed IPC, `@repo/llmconveyors-sdk` v0.4.0+ (SDK client instance lives in background only).

---

## 1. Context Capability Matrix

| Capability | BG (SW) | Content | Popup | Side Panel | Options |
|---|---|---|---|---|---|
| `chrome.identity` (launchWebAuthFlow) | yes | no | yes* | yes* | yes* |
| `chrome.storage.local` | yes | yes | yes | yes | yes |
| `fetch` (cross-origin w/ host_permissions) | yes | limited | yes | yes | yes |
| `document` / `window` / React DOM | no | page DOM only | yes | yes | yes |
| Page DOM access (live inputs) | no | yes | no | no | no |
| Persistent across tabs | yes (shared) | no (per-tab) | no | no | no |
| Killed on idle | yes (30s) | on navigation | on close | on close | on close |
| `chrome.action` (badge) | yes | no | no | no | no |
| `chrome.sidePanel.open` | yes | from user gesture | from user gesture | self | no |

*`chrome.identity.launchWebAuthFlow` technically works from popup/sidepanel, but we centralize it in BG so the SDK instance is the single token holder. Popup/sidepanel triggers it via message.

---

## 2. Feature → Context Assignment

| # | Feature | Primary | Secondary | Rationale |
|---|---|---|---|---|
| a | Auth / sign-in (launchWebAuthFlow) | **Background** | Popup (trigger button) | BG owns SDK client + token; single refresh mutex lives here. Popup sends `auth.signIn` message, awaits result. |
| b | Token storage + refresh | **Background** | — | Single in-flight refresh promise (per SDK 0.4.0 release notes) must be enforced in one context. BG is the only context alive across tabs. Tokens stored in `chrome.storage.local` under namespaced key `llmc.tokens.v1`. |
| c | Profile storage | **Background** (canonical writes) | Content/Popup/SidePanel (direct reads via `chrome.storage.local.get`) | Writes funneled through BG so a `profile.updated` broadcast event fans out. Reads are direct to avoid message round-trips on hot paths (autofill). |
| d | API calls (llmconveyors SDK) | **Background** | Any caller | BG holds one `LlmConveyorsClient` instance. Other contexts send typed `api.jobHunter.run` / `api.b2bSales.run` messages; BG streams SSE back as `api.stream.chunk` + `api.stream.done`. |
| e | Form detection | **Content script** | BG (state cache) | Requires live `document`. Registered on `https://*.greenhouse.io/*`, `*.lever.co/*`, `*.myworkdayjobs.com/*`, `*.ashbyhq.com/*`, `*.linkedin.com/jobs/*`. On detect, sends `form.detected { formModel }` → BG caches keyed by `tabId`. |
| f | Field classification | **Content script** | — | Classifier is pure TS, imported from `@repo/extension-core`. Keeps DOM-coupled logic local so no snapshot-serialize round-trip. BG has no reason to see raw DOM. |
| g | Form filling | **Content script** | BG (for API-enhanced fields) | Needs live DOM inputs + React `nativeInputValueSetter` trick. For fields requiring generation (cover letter snippet), sends `fill.requestAnswer { fieldId, jobCtx }` → BG → SDK. Applies via content-side native setter + `input`/`change` events. |
| h | Keyword highlighting | **Content script** | BG (keyword source) | DOM mutations only possible in content. Keywords either (1) extracted locally from the JD via Readability, or (2) fetched from BG cache of a prior generation (`highlights.get { tabId }`). |
| i | Page intent detection | **Content script** (detect) + **Background** (state) | — | Content runs Schema.org `JobPosting` extractor + URL pattern matcher on `DOMContentLoaded`. Sends `intent.detected { type, company, title, url }` → BG. BG updates `chrome.action.setBadgeText` for that tab + stores in per-tab map. |
| j | Popup UI | **Popup** | BG (all data) | React tree. Mount → `intent.getForTab` + `auth.getState` + `credits.get`. Shows CTA button → `api.jobHunter.run` or `sidePanel.open`. All state is derived from BG; popup itself holds only UI/input state. |
| k | Side panel UI | **Side panel** | BG (generation stream) | React tree. On open, subscribes to `generation.subscribe { generationId }`; BG pushes `generation.update` chunks. Renders artifact tabs (CV/cover letter/email). Copy buttons use `navigator.clipboard` locally. |
| l | Master resume upload | **Popup** or **Options** | BG (SDK call) | File picker + Blob live in popup/options (DOM required). On select → `resume.upload { bytes, filename, mime }` message → BG calls `sdk.upload.resume(blob)` → stores response in `chrome.storage.local` under `llmc.masterResume.v1`. |

---

## 3. State Ownership

| Owner | State |
|---|---|
| **Background** | auth tokens, refresh mutex, SDK client instance, profile (canonical), per-tab intent map (`Map<tabId, DetectedIntent>`), active generations (`Map<generationId, GenerationState>`), rate limiter buckets, event bus (`@webext-core/messaging` hub) |
| **Content script** | live DOM refs, current `FormModel`, highlight mark nodes, MutationObserver handles |
| **Popup** | React UI state (current view, form draft, modal open), nothing persisted — dies on close |
| **Side panel** | React UI state (selected artifact tab, scroll position), subscribed generationId |
| **Options** | React form state for settings edits prior to save |

`chrome.storage.local` acts as the durable spine: `llmc.tokens.v1`, `llmc.profile.v1`, `llmc.masterResume.v1`, `llmc.prefs.v1`, `llmc.intentCache.v1`. BG is the only writer to tokens/profile/prefs; any context reads freely.

---

## 4. Messaging Pattern

**Recommendation**: `@webext-core/messaging` (type-safe `ProtocolMap`). WXT project convention matches this; raw `chrome.runtime.sendMessage` loses types and makes the 40+ message surface unmaintainable. WXT's own `@wxt-dev/messaging` wraps the same shape.

### ProtocolMap sketch

```ts
// libs/extension-messaging/protocol.ts
import type {
  DetectedIntent, FormModel, FieldAnswer, Profile,
  MasterResumeUpload, AuthState, CreditsState,
  JobHunterRunInput, B2BSalesRunInput,
  GenerationEvent, GenerationId, ArtifactBundle,
} from '@repo/shared-types';

export interface ProtocolMap {
  // Auth
  'auth.signIn':        (data: void) => AuthState;
  'auth.signOut':       (data: void) => void;
  'auth.getState':      (data: void) => AuthState;

  // Profile
  'profile.get':        (data: void) => Profile;
  'profile.update':     (data: Partial<Profile>) => Profile;

  // Credits
  'credits.get':        (data: void) => CreditsState;

  // Resume
  'resume.upload':      (data: MasterResumeUpload) => { resumeId: string };
  'resume.getCurrent':  (data: void) => { resumeId: string; parsedAt: string } | null;

  // Intent (page detection)
  'intent.detected':    (data: DetectedIntent & { tabId: number }) => void;
  'intent.getForTab':   (data: { tabId: number }) => DetectedIntent | null;

  // Form detection & fill
  'form.detected':      (data: { tabId: number; form: FormModel }) => void;
  'fill.requestAnswer': (data: { fieldId: string; jobCtx: DetectedIntent }) => FieldAnswer;

  // Highlights
  'highlights.get':     (data: { tabId: number }) => string[];

  // Generation (agent runs)
  'api.jobHunter.run':  (data: JobHunterRunInput) => { generationId: GenerationId };
  'api.b2bSales.run':   (data: B2BSalesRunInput) => { generationId: GenerationId };
  'generation.subscribe':   (data: { generationId: GenerationId }) => ArtifactBundle;
  'generation.unsubscribe': (data: { generationId: GenerationId }) => void;

  // BG-initiated broadcasts (no response)
  'broadcast.profileUpdated':   (data: Profile) => void;
  'broadcast.generationEvent':  (data: GenerationEvent) => void;
  'broadcast.authChanged':      (data: AuthState) => void;
}
```

Request/response uses `sendMessage<K>(key, data)`. Broadcasts use a separate `onBroadcast`/`emit` channel (`@webext-core/messaging` supports this via `defineExtensionMessaging` + `defineCustomEventMessaging` pair).

### Streaming (SSE)
`api.jobHunter.run` returns `{ generationId }` immediately. BG consumes the SDK's async iterable and emits `broadcast.generationEvent` for each chunk. Side panel's `generation.subscribe` call both (a) resolves with current state snapshot and (b) registers interest so the BG filters broadcasts by subscribed generationId. BG tracks subscribers in `Map<generationId, Set<Port>>`; when last subscriber closes, keeps state cached 5 min then GCs.

---

## 5. Component Diagram + Primary Flows

```
+----------------------------------------------------------+
|                     CHROME BROWSER                       |
|                                                          |
|  +-------------+      +-----------------------------+    |
|  |   POPUP     |      |   SIDE PANEL                |    |
|  |   (React)   |      |   (React, artifact tabs)    |    |
|  +------+------+      +-------------+---------------+    |
|         | sendMessage                | subscribe         |
|         v                             v                  |
|  +====================================================+  |
|  |           BACKGROUND SERVICE WORKER                |  |
|  |  - SDK client (LlmConveyorsClient)                 |  |
|  |  - Auth/token manager + refresh mutex              |  |
|  |  - Per-tab intent cache                            |  |
|  |  - Generation state machine + subscriber map       |  |
|  |  - chrome.action badge updater                     |  |
|  +===+=================+==================+==========+  |
|      ^                 ^                  |             |
|      | form.detected   | intent.detected  | broadcast   |
|      | fill.request    |                  v             |
|  +---+-----------------+------------------+----------+  |
|  |            CONTENT SCRIPTS (per tab)              |  |
|  |  GH | Lever | Workday | Ashby | LinkedIn          |  |
|  |  - JobPosting extractor                           |  |
|  |  - FormModel builder + classifier                 |  |
|  |  - Field filler (native setter)                   |  |
|  |  - Highlight renderer                             |  |
|  +---------------------------------------------------+  |
|                     | DOM read/write                    |
|                     v                                    |
|              [ PAGE DOM (isolated world) ]               |
+----------------------------------------------------------+
```

### Flow 1: Sign-In
```
Popup click "Sign in"
  -> sendMessage('auth.signIn')
  -> BG: chrome.identity.launchWebAuthFlow(...)
  -> BG: receives tokens, sdk.setTokens(), chrome.storage.local.set
  -> BG: returns AuthState to popup + emit('broadcast.authChanged')
  -> Popup re-renders; any open SidePanel also reacts
```

### Flow 2: Generate (Job Hunter)
```
Popup "Generate" (current tab is a Greenhouse JD)
  -> sendMessage('intent.getForTab', {tabId})  -> DetectedIntent
  -> sendMessage('api.jobHunter.run', {...})   -> {generationId}
  -> BG: chrome.sidePanel.open({tabId})
  -> BG: sdk.jobHunter.run(...); for await chunk -> emit('broadcast.generationEvent')
  -> SidePanel mounts, calls 'generation.subscribe' -> snapshot
  -> SidePanel listens to broadcast, renders artifacts live
```

### Flow 3: Auto-Fill
```
Tab navigates to Lever apply page
  -> Content script DOMContentLoaded
  -> intent extractor -> 'intent.detected' to BG (BG sets badge)
  -> form builder -> FormModel -> 'form.detected' to BG (cache)
  -> User clicks "Autofill" in popup
  -> Popup sendMessage('fill.start', {tabId})
  -> BG -> tabs.sendMessage(tabId, 'fill.execute')   (BG->content)
  -> Content: read chrome.storage.local profile (direct)
  -> Content: for each enhanced field -> sendMessage('fill.requestAnswer')
     -> BG: sdk.jobHunter.generateFieldAnswer -> returns
  -> Content: nativeInputValueSetter.call(input, value); dispatch input/change
```

BG->content uses `chrome.tabs.sendMessage(tabId, ...)`; `@webext-core/messaging` exposes this via `sendMessage(key, data, tabId)`.

---

## 6. Invariants

1. **BG is the only SDK holder.** No other context imports the SDK client — only the message protocol types.
2. **BG is the only `chrome.identity` caller.** Single refresh mutex, single token record.
3. **Content scripts never call `fetch` to llmconveyors.** Cross-origin requests go through BG to keep `host_permissions` minimal and audit trail centralized.
4. **`chrome.storage.local` writes for tokens/profile/prefs are BG-only.** Reads are free. Keys are versioned (`.v1`) for migration.
5. **Per-tab state (intent, FormModel) lives in BG `Map<tabId, ...>`** and is cleared on `chrome.tabs.onRemoved`.
6. **Generation state survives SW restart** via `chrome.storage.session` snapshot write on every event; BG rehydrates on wake.
7. **Content script bundle excludes React** (bundled separately per entrypoint via WXT); popup/sidepanel/options share a React chunk.

---

Confidence: 88%
filename: 54-extension-architecture.md
