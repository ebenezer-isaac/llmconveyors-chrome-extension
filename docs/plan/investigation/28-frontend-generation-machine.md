# 28 — Frontend Generation Machine & Transport (Portability Audit)

Scope: `src/lib/generation/machine/machine.ts`, `machine/events.ts`, `machine/actors.ts`, `transport.ts`, `index.ts`, `useGeneration.ts`.
Target: WXT Chrome extension (MV3 service worker + popup/side panel).

---

## a) State machine type

**XState v5**, authored with `setup({ ... }).createMachine({ ... })`. Evidence:

- `machine.ts:12` — `import { setup, assign } from 'xstate'`
- `machine.ts:35` — `setup({ types, actors, delays, guards, actions }).createMachine({ ... })`
- `actors.ts:13` — `import { fromPromise, fromCallback } from 'xstate'` (v5 actor factories)
- `useGeneration.ts:16` — `import { useActorRef, useSelector } from '@xstate/react'`
- `useGeneration.ts:17` — `import { fromPromise } from 'xstate'`
- `useGeneration.ts:117` — `generationMachine.provide({ actors, actions })` (v5 DI API)

Typed context / events / input via `types: { context, events, input }` literals — the v5 `setup()` shape.

---

## b) Full XState state diagram

### States (7 total + internal actor states)

Defined in `machine.ts:322-756`, `initial: 'idle'` (`machine.ts:324`).

#### 1. `idle` (`machine.ts:381-411`)
Entry actions: none.
Transitions:
- `START` → `submitting` (actions: `assignStartPayload`, `setGenerationActive`)
- `RECONNECT_FROM_HYDRATION` → `streaming` (actions: `assignHydrationReconnection`, `setGenerationActive`, `updateRunStatusInProgress`)
- `HYDRATE_AWAITING_INPUT` → `awaitingInput` (actions: `assignHydrateAwaitingInput`, `setGenerationActive`, `handleInteractionRequired`)
- `CANCEL` → no-op (explicit override of global CANCEL)

#### 2. `submitting` (`machine.ts:416-451`)
Invokes actor **`submitGenerationActor`** with input `{ processedInput, currentSessionId }`.
Transitions:
- `onDone` → `streaming` (actions: `assignBackendIds`, `setGenerationActive`, `updateRunStatusInProgress`)
- `onError` → `error` (actions: `setError`, `updateRunStatusFailed`, `toastError`, `clearCancelInStore`)
- `after: submittingTimeout (60_000ms)` → `error` (actions: assign errorMessage, `toastError`, `clearCancelInStore`)

#### 3. `streaming` (`machine.ts:457-544`)
Invokes actor **`sseStreamActor`** with input `{ generationId, lastEventId, streamUrl? }` (id: `sseStream`).
Entry: `setConnected`. Exit: `clearHydrationReconnection`.
Transitions:
- `STREAM.CONNECTED` → self (action: `setConnected`)
- `STREAM.RECONNECTING` → self (action: assign connectionState `{ status:'reconnecting', attempt, maxAttempts }`)
- `STREAM.PROGRESS` → self (action: `assignProgress`)
- `STREAM.LOG` → self (action: `processLogEntry`)
- `STREAM.ARTIFACT` → self (action: `processIncrementalArtifact`)
- `STREAM.COMPLETE` (guarded chain):
  1. guard `isAwaitingInput` → `awaitingInput` (actions: `logPhaseGateAwaitingInput`, `processStreamComplete`, `setSessionStatusFromStreamComplete`, `assignPendingInteraction`, `handleInteractionRequired`)
  2. guard `isReplayedPhaseAComplete` → self (action: `logPhaseGateReplayDiscarded`) — discard stale replayed Phase A event
  3. default → `complete` (actions: `logPhaseGateFinalComplete`, `processStreamComplete`, `setSessionStatusFromStreamComplete`)
- `STREAM.ERROR` → `recovering` (actions: `storeStreamErrorMessage`, `processStreamError`)
- `STREAM.RECONNECT_EXHAUSTED` → `recovering` (action: assign lastEventId from event)

#### 4. `recovering` (`machine.ts:549-618`)
Entry: `incrementRecoveryAttempts`.
Invokes actor **`checkRecoveryActor`** with input `{ sessionId, generationId }`.
Transitions (guarded onDone chain):
  1. guard `isRecoveryCompleted` → `complete` (actions: `setSessionStatusFromRecovery`, `processRecoveryCompleted`, `toastGenerationRecovered`, `resetRecoveryAttempts`)
  2. guard `isRecoveryAwaitingInput` → `awaitingInput` (actions: `setSessionStatusFromRecovery`, `assignRecoveryInteraction`, `processRecoveryAwaitingInput`, `handleRecoveryInteraction`, `resetRecoveryAttempts`)
  3. guard inline `isProcessing && recoveryAttempts<3` → `streaming` (circuit-breakered; actions: `setSessionStatusFromRecovery`, `updateRunStatusInProgress`)
  4. default → `error` (actions: `setError`, `updateRunStatusFailed`, `toastConnectionLost`)
- `onError` → `error` (same actions)
- `after: recoveringTimeout (30_000ms)` → `error` (actions: assign errorMessage, `updateRunStatusFailed`, `toastConnectionLost`)

#### 5. `awaitingInput` (`machine.ts:623-639`)
No invoke.
Transitions:
- `SUBMIT_INTERACTION` → `submittingInteraction`
- `after: awaitingInputTimeout (30 * 60 * 1000 = 1_800_000ms)` → `error` (actions: assign errorMessage, `clearStoreInteraction`, `toastInteractionTimeout`)

#### 6. `submittingInteraction` (`machine.ts:644-705`)
Invokes actor **`submitInteractionActor`** with input `{ response, sessionId, generationId }`.
Transitions (guarded onDone chain):
  1. guard `isInteractionTerminalComplete` → `complete` (actions: `processInteractionTerminal`, `clearPendingInteraction`, `clearStoreInteraction`)
  2. default → `streaming` (actions: inline `assign` of generationId + recoveryAttempts=0, `clearPendingInteraction`, `clearStoreInteraction`, `updateRunStatusInProgress`, `syncSessionAfterInteractionSubmit`, `injectPhaseResumedLog`, `toastInteractionSubmitted`)
- `onError` → `awaitingInput` (actions: `setError`, `toastError`)
- `after: submittingInteractionTimeout (30_000ms)` → `awaitingInput` (actions: assign errorMessage, `toastError`)

#### 7. `complete` (`machine.ts:710-724`) — terminal
Entry: `setConnected`, `clearCancelInStore`, `clearStoreInteraction`, `refetchCredits`.
Transitions:
- `START` → `submitting` (actions: `resetContext`, `assignStartPayload`, `setGenerationActive`) — re-run
- `CANCEL` → no-op (override)

#### 8. `error` (`machine.ts:729-754`) — terminal (recoverable)
Entry: `setConnected`, `clearCancelInStore`, `clearStoreInteraction`, `clearProgress`.
Transitions:
- `START` → `submitting` (actions: `resetContext`, `assignStartPayload`, `setGenerationActive`)
- `RECONNECT_FROM_HYDRATION` → `streaming` (BUG-E1 fix — page-reload recovery from error state; actions: `assignHydrationReconnection`, `setGenerationActive`, `updateRunStatusInProgress`)
- `CANCEL` → no-op (override)

### Global handlers (`machine.ts:344-375`, applied to every state unless overridden)
- `CANCEL` → `.idle` (actions: `resetContext`, `clearCancelInStore`, `clearStoreInteraction`) — overridden to no-op in `idle`, `complete`, `error`
- `EXTERNAL.SESSION_CHANGED`:
  - guarded `isSelfTransition` → stay (no-op)
  - default → `.idle` (actions: `resetContext`, `clearCancelInStore`, inline assign new sessionId)
- `NETWORK_OFFLINE` → self (action: `setOffline`)

### Guards (`machine.ts:56-132`)
| Name | Purpose |
|---|---|
| `isSelfTransition` | SESSION_CHANGED is same session — ignore |
| `isAwaitingInput` | STREAM.COMPLETE has `awaitingInput:true` AND is NOT a replayed Phase A event |
| `isReplayedPhaseAComplete` | STREAM.COMPLETE is a stale replay from an already-consumed phase |
| `isRecoveryCompleted` | recovery actor returned `{recovered:true, status:'completed'}` |
| `isRecoveryAwaitingInput` | recovery actor returned `{recovered:true, status:'awaiting_input'}` |
| `isRecoveryProcessing` | recovery actor returned `{recovered:true, status:'processing'}` (defined but unused; inline guard used instead at `machine.ts:581`) |
| `isInteractionTerminalComplete` | submitInteractionActor output `status === 'completed'` |
| `canRecover` | `recoveryAttempts < 3` (circuit breaker; defined but the inline guard at `machine.ts:584` is used) |

### Delays (`machine.ts:49-54`)
- `awaitingInputTimeout`: 30 min
- `submittingTimeout`: 60 s
- `recoveringTimeout`: 30 s
- `submittingInteractionTimeout`: 30 s

### Actors (4 total, registered at `machine.ts:42-47`)
| Actor | Factory | Input | Output | Defined |
|---|---|---|---|---|
| `submitGenerationActor` | `fromPromise` | `SubmitGenerationInput` | `SubmitGenerationOutput` | `actors.ts:31` (stub — injected via `useGeneration.ts:119`) |
| `sseStreamActor` | `fromCallback` | `SSEStreamActorInput` | — (streams events via sendBack) | `actors.ts:69` (concrete) |
| `checkRecoveryActor` | `fromPromise` | `CheckRecoveryInput` | `SessionRecoveryResult` | `actors.ts:349` (concrete, hits `/api/sessions/:id/hydrate`) |
| `submitInteractionActor` | `fromPromise` | `SubmitInteractionInput` | `{ generationId?, status?, sessionId?, phase? }` | `actors.ts:445` (stub — injected via `useGeneration.ts:217`) |

### Actions (pure + side-effect, `machine.ts:134-321`)
Pure context mutations (assign): `assignStartPayload`, `assignBackendIds`, `assignProgress`, `setConnected`, `setOffline`, `clearProgress`, `storeStreamErrorMessage`, `setError`, `assignHydrationReconnection`, `assignHydrateAwaitingInput`, `clearHydrationReconnection`, `incrementRecoveryAttempts`, `resetRecoveryAttempts`, `assignPendingInteraction`, `clearPendingInteraction`, `assignRecoveryInteraction`, `resetContext`.

Abstract side-effect actions (stubs, injected via `provide()`): `setSessionStatusFromStreamComplete`, `setSessionStatusFromRecovery`, `updateRunStatusInProgress`, `syncSessionAfterInteractionSubmit`, `processLogEntry`, `processIncrementalArtifact`, `processStreamComplete`, `logPhaseGateAwaitingInput`, `logPhaseGateReplayDiscarded`, `logPhaseGateFinalComplete`, `processStreamError`, `processRecoveryCompleted`, `processRecoveryAwaitingInput`, `processInteractionTerminal`, `updateRunStatusFailed`, `setGenerationActive`, `clearCancelInStore`, `clearStoreInteraction`, `handleInteractionRequired`, `handleRecoveryInteraction`, `refetchCredits`, `injectPhaseResumedLog`, `toastError`, `toastGenerationRecovered`, `toastConnectionLost`, `toastInteractionTimeout`, `toastInteractionSubmitted`.

---

## c) Full event list with payload types (from `events.ts:64-80`)

### Inbound events (dispatched to machine from React/hydration)
| Event | Payload | Source |
|---|---|---|
| `START` | `{ payload: unknown }` | `useGeneration.sendMessage` → `useGeneration.ts:821` |
| `CANCEL` | `{}` | user click or machine-provided cancel ref |
| `EXTERNAL.SESSION_CHANGED` | `{ sessionId: string \| null }` | `useGeneration.ts:711` (prop sync) |
| `RECONNECT_FROM_HYDRATION` | `{ streamUrl, generationId, sessionId, lastEventId?, completedPhase? }` | `useGeneration.ts:749` (page reload) |
| `HYDRATE_AWAITING_INPUT` | `{ sessionId, generationId, interactionType, interactionData }` | `useGeneration.ts:771` (page reload in awaiting) |
| `SUBMIT_INTERACTION` | `{ response: Record<string, unknown> }` | `useGeneration.submitInteractionResponse` → `useGeneration.ts:844` |
| `NETWORK_OFFLINE` | `{}` | `useGeneration.ts:721` (navigator.online) |

### SSE events (sent from `sseStreamActor` via `sendBack`)
| Event | Payload |
|---|---|
| `STREAM.CONNECTED` | `{}` |
| `STREAM.RECONNECTING` | `{ attempt: number, maxAttempts: number }` |
| `STREAM.PROGRESS` | `{ percent: number, message: string, step: string }` |
| `STREAM.ARTIFACT` | `{ artifact: ArtifactPayload, step: string }` |
| `STREAM.LOG` | `{ entry: StreamLogEntry }` where `StreamLogEntry = { generationId, content, level, timestamp, messageId? }` |
| `STREAM.COMPLETE` | `{ result: StreamCompleteResult }` — see below |
| `STREAM.ERROR` | `{ message: string, code?: string }` |
| `STREAM.RECONNECT_EXHAUSTED` | `{ lastEventId: string \| null }` |

`StreamCompleteResult` (`events.ts:92-105`):
```ts
{ success: boolean; artifacts: ArtifactPayload[]; error?: string;
  generationId?: string; sessionStatus?: string;
  awaitingInput?: boolean; interactionType?: string;
  interactionData?: Record<string, unknown>;
  completedPhase?: number; lastEventId?: string; }
```

### Machine does NOT emit external events
The machine only runs actions; cross-boundary side effects happen inside `provide()`-injected actions at the React hook layer. There is no `emit()` usage.

---

## d) Transport fetch URL construction

`transport.ts` does **NOT** construct the URL at all. It receives a pre-fetched `Response` object as its first argument (`transport.ts:77`: `createTransport(response: Response, callbacks: TransportCallbacks)`) and only reads `response.body.getReader()`. URL construction lives exclusively in `actors.ts:147-177`:

```ts
function connect() {
  if (aborted) return;
  const url = input.streamUrl || `/api/stream/${input.generationId}`;  // LINE 150
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (lastEventId) { headers['Last-Event-ID'] = lastEventId; }
  ...
  const controller = new AbortController();
  fetch(url, { headers, cache: 'no-store', signal: controller.signal })
    .then((response) => { ... createTransport(response, callbacks) ... })
}
```

**URL shape**: **relative** `/api/stream/{generationId}` — assumes same-origin Next.js proxy at `src/app/api/stream/[generationId]/route.ts`. The backend POST response includes an absolute `streamUrl` but `useGeneration.ts:242-245` explicitly discards it:

> `// NOTE: Backend also returns streamUrl but we intentionally discard it. The client must always use the relative proxy path /api/stream/{generationId} to route through the Next.js auth proxy. Using the backend's absolute URL would bypass auth and fail with 401.`

The only code path that uses an absolute `streamUrl` is `RECONNECT_FROM_HYDRATION` (see `machine.ts:464` — `streamUrl: context.hydrationReconnection?.streamUrl`) and even there, `useGeneration.ts:735` hard-gates the flow with `.startsWith('/api/')` — so in practice **every connection goes through `/api/stream/{id}` relative**.

A second relative URL is baked into `checkRecoveryActor` at `actors.ts:357`:
```ts
await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/hydrate`, ...)
```

No `Authorization` / `x-api-key` / `Cookie` is set explicitly anywhere — auth is implicit via browser cookies on the same-origin Next.js route.

---

## e) Full external import list per file

### `machine/machine.ts`
```ts
import { setup, assign } from 'xstate';
import { CONNECTED } from '@/hooks/useConnectionHealth';                  // value import
import type { ConnectionState } from '@/hooks/useConnectionHealth';       // type only
import type { GenerationMachineContext, GenerationMachineEvent,
              GenerationMachineInput, SubmitGenerationOutput,
              SessionRecoveryResult } from './events';                    // type only
import { submitGenerationActor, sseStreamActor, checkRecoveryActor,
         submitInteractionActor } from './actors';                        // value import
```
External runtime deps: `xstate`, `CONNECTED` constant, `./actors`.
**Value imports that pull infra**: `CONNECTED` from `@/hooks/useConnectionHealth` (React hook file; `CONNECTED` itself is a plain const object but the file is a React hook module).

### `machine/events.ts`
```ts
import type { GenerationProgress } from '../types';
import type { ConnectionState } from '@/hooks/useConnectionHealth';
import type { ArtifactPayload } from '@repo/shared-types';
```
All **type-only**. Zero runtime deps. Emits zero JS code after TS strip.

### `machine/actors.ts`
```ts
import { fromPromise, fromCallback } from 'xstate';
import { createDebugLogger } from '@/lib/debug-logger';
import { createTransport } from '../transport';
import type { TransportCallbacks } from '../transport';
import type { ArtifactPayload } from '@repo/shared-types';
import type { SubmitGenerationInput, SubmitGenerationOutput,
              CheckRecoveryInput, SessionRecoveryResult,
              SubmitInteractionInput, GenerationMachineEvent } from './events';
```
Runtime deps: `xstate`, `createDebugLogger`, `createTransport`.
`createDebugLogger` pulls `@/lib/logging/types` (types) and `@/lib/logging/redaction` (runtime) — 432 lines, must be shimmed or re-imported.

### `transport.ts`
```ts
import { createDebugLogger } from '@/lib/debug-logger';
import type { ArtifactPayload } from '@repo/shared-types';
```
Runtime deps: `createDebugLogger` only. Everything else (`fetch`, `Response`, `ReadableStreamDefaultReader`, `TextDecoder`, `DOMException`) is Web-standard and available in MV3 service workers, popups, content scripts, and side panels.

### `index.ts`
```ts
export { useGeneration } from './useGeneration';               // heavy
export { createTransport } from './transport';                 // clean
export { createMessageId, normalizeLogLevel } from './message-utils';
export { stampArtifacts } from './artifact-transforms';
export { isRecord, isRelativeUrl, mapHydrationLogs, safeResearchContent,
         sleep, coerceStatus, coerceTimestamp, coerceIndex,
         HYDRATION_ENDPOINT, HYDRATION_TOAST_DURATION_MS,
         MAX_LOG_ENTRY_CONTENT, MAX_RESEARCH_CONTENT_SIZE } from './hydration-utils';
export type { AgentConfig, GenerationStorePort, MachineStatus,
              GenerationProgress, UseGenerationReturn,
              ConcurrencyCheck } from './types';
```
Pulls `useGeneration` transitively — that's the problem. Also pulls `hydration-utils` which I haven't inspected but is a known helper.

### `useGeneration.ts`
```ts
'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useActorRef, useSelector } from '@xstate/react';
import { fromPromise } from 'xstate';
import { toast } from 'sonner';
import { createDebugLogger } from '@/lib/debug-logger';
import { stripHtmlTags } from '@/lib/strip-html';
import { createMessageId, normalizeLogLevel } from './message-utils';
import { stampArtifacts } from './artifact-transforms';
import { useConnectionHealth } from '@/hooks/useConnectionHealth';
import { AGENT_REGISTRY } from '@/config/agents';
import { triggerCreditsRefetch } from '@/hooks/useCredits';
import { triggerSessionSync } from '@/hooks/useSessionSync';
import { generationMachine } from './machine/machine';
import { isValidSessionStatus, type SessionStatus } from '@/types/session';
import type { AgentConfig, GenerationStorePort, MachineStatus,
              UseGenerationReturn, ConcurrencyCheck } from './types';
import type { SubmitGenerationOutput, SessionRecoveryResult } from './machine/events';
```
Heavy runtime deps: `react`, `next-intl`, `@xstate/react`, `sonner`, `AGENT_REGISTRY` (`@/config/agents`), `useConnectionHealth`, `useCredits`, `useSessionSync`, `@/lib/strip-html`, `@/lib/debug-logger`, `@/types/session`, `xstate/fromPromise`, plus local siblings. **Not portable** without a full rewrite.

---

## f) Portability verdict per file

| File | Verdict | What must ship alongside | Notes |
|---|---|---|---|
| `machine/machine.ts` | **DIRECT (with tiny shim)** | `xstate`, `./events` (types), `./actors`, a `CONNECTED` const from the same file or a local shim | Zero DOM/React usage. The single coupling is `CONNECTED` from `@/hooks/useConnectionHealth`; copy that 6-line const into a local `connection-state.ts` to break the import. |
| `machine/events.ts` | **DIRECT** | `@repo/shared-types` (`ArtifactPayload` type), local `../types` (`GenerationProgress` type), local `ConnectionState` type | Pure types — erases to zero JS. Drop `@/hooks/useConnectionHealth` import by defining `ConnectionState` locally. |
| `machine/actors.ts` | **DIRECT (with logger shim)** | `xstate`, local `./events` types, local `../transport`, debug-logger shim (`{ step, warn, error, ... }` no-op is fine) | Uses only `fetch` / `setTimeout` / `AbortController` / `TextDecoder` — all MV3-compatible. Hardcoded `/api/stream/` and `/api/sessions/.../hydrate` URLs MUST be parameterized. |
| `transport.ts` | **DIRECT (with logger shim)** | Web-standard APIs only + logger shim + `ArtifactPayload` type | Accepts `Response` as input, so it's transport-agnostic. Works as-is in MV3 service workers. |
| `index.ts` | **SPLIT** | Re-exports `useGeneration` — drag-in of all the React glue. For the extension, create `index.extension.ts` that only re-exports `createTransport`, `generationMachine`, types, and utility helpers. Leave the web `index.ts` alone. |
| `useGeneration.ts` | **REWRITE** | Not portable. Coupled to: `'use client'`, `react`, `next-intl`, `@xstate/react`, `sonner`, Zustand `GenerationStorePort`, `AGENT_REGISTRY`, connection/credits/session hooks, `/api/*` proxy paths. | Rewrite as `useGenerationExtension.ts` (or a framework-free `createGenerationActor()`) that wires the same `machine.provide()` actors/actions into: `chrome.storage.local` for state, static string map for i18n, `chrome.notifications` or DOM toasts for alerts, direct backend URLs with `Authorization: Bearer <apiKey>` headers. Pass the API base URL through a context/config object. |

---

## g) WXT modifications required in `transport.ts` and `actors.ts`

### The hardcoded relative URLs

Two hardcoded relative paths block direct-backend usage:
1. `actors.ts:150` — `const url = input.streamUrl || \`/api/stream/${input.generationId}\`;`
2. `actors.ts:357` — `await fetch(\`/api/sessions/${encodeURIComponent(input.sessionId)}/hydrate\`, ...)`

Neither is in `transport.ts` itself — so `transport.ts` as shipped is **already portable unchanged**. The fix belongs in `actors.ts` (or in a thin extension-side adapter that re-implements the two actors).

### How `transport.ts` must be modified

**It doesn't need modification** — it accepts a pre-constructed `Response`. The change is:

1. **`actors.ts` — parameterize URL + auth in `sseStreamActor`** (`actors.ts:147-180`):
   - Extend `SSEStreamActorInput` (`actors.ts:59-64`) with optional `apiBaseUrl: string` and `authHeaders: Record<string, string>`.
   - Replace `const url = input.streamUrl || \`/api/stream/${input.generationId}\`;` with:
     ```ts
     const url = input.streamUrl
       ?? (input.apiBaseUrl
             ? `${input.apiBaseUrl.replace(/\/$/, '')}/api/v1/generations/${input.generationId}/stream`
             : `/api/stream/${input.generationId}`);
     ```
     (exact backend path comes from the NestJS controller; the web app's Next.js proxy forwards to it).
   - Merge `input.authHeaders` into the `headers` object before the `fetch` call:
     ```ts
     const headers: Record<string, string> = {
       Accept: 'text/event-stream',
       ...(input.authHeaders ?? {}),
     };
     if (lastEventId) headers['Last-Event-ID'] = lastEventId;
     ```

2. **`actors.ts` — parameterize `checkRecoveryActor`** (`actors.ts:349-441`):
   - Extend `CheckRecoveryInput` with optional `apiBaseUrl`, `authHeaders`.
   - Replace the `fetch('/api/sessions/.../hydrate', ...)` call with a base-URL-aware variant and header merging.

3. **`machine.ts` — plumb the extension config through invoke input** (`machine.ts:458-466`, `machine.ts:551-557`):
   - Add `apiBaseUrl` and `authHeaders` to `GenerationMachineContext` (set from `GenerationMachineInput`).
   - Extend both invoke `input` mappers to pass them through.

4. **Extension-side `createGenerationActor(config: { apiBaseUrl, apiKey })`**:
   - Builds `authHeaders = { 'x-api-key': config.apiKey }` (or `Authorization: Bearer ...`, whichever the NestJS platform-api-key guard accepts — verify in `api/src/common/guards/platform-api-key.guard.ts`).
   - Calls `generationMachine.provide({ actors: { submitGenerationActor, submitInteractionActor }, actions: {...} })` where the two stub actors directly POST to `${apiBaseUrl}/api/v1/jobs/job-hunter/generate` (etc.) with the auth header, and the action set is rewritten to `chrome.storage.local` / `chrome.notifications` / no-op.

### Web app must remain working

Since the web app relies on same-origin cookies and must NOT pass `apiBaseUrl`/`authHeaders`, both additions should be **optional** and default to the current relative-path behavior. The fallback branch of the `??` expression preserves the legacy `/api/stream/{id}` path, so `useGeneration.ts` (which never sets those new fields) keeps working byte-identically.

---

## h) Required runtime env/context summary

Machine layer (`machine.ts`, `events.ts`, `actors.ts`, `transport.ts`):
- `xstate` v5, `@repo/shared-types` (`ArtifactPayload` type only — 0 bytes after strip)
- Web-standard APIs: `fetch`, `AbortController`, `TextDecoder`, `ReadableStream`, `setTimeout`, `DOMException`
- A tiny `debug-logger` shim (6 no-op methods: `step`, `warn`, `error`, plus a factory)
- An extension-provided `{ apiBaseUrl, authHeaders }` pair after the proposed `actors.ts` patch

Hook layer (`useGeneration.ts`) — NOT portable; must be replaced by extension-native provider that supplies:
- Static string table (replaces `useTranslations('generation')`)
- Agent endpoint table (replaces `AGENT_REGISTRY`)
- `chrome.storage.local`-backed `GenerationStorePort` (replaces Zustand)
- `chrome.notifications`-based toast stand-in (replaces `sonner`)
- Credits/session refetch triggers (either stubs or chrome-runtime messages)
- `navigator.onLine` + `chrome.runtime.onMessage` for `NETWORK_OFFLINE` events

---

## i) `@repo/shared-types` dependency surface
- `events.ts:11` — `ArtifactPayload` (type)
- `transport.ts:16` — `ArtifactPayload` (type)
- `actors.ts:17` — `ArtifactPayload` (type)

All **type-only** — zero JS output. The extension can either inline the type or depend on the workspace package at build time (WXT + pnpm workspace handles that fine).

---

## Key finding for WXT MVP

`machine.ts`, `events.ts`, and `transport.ts` are **already extension-ready**. `actors.ts` needs a surgical two-line change per actor to accept `apiBaseUrl` + `authHeaders` on input. `useGeneration.ts` is a full rewrite — every React/Next/Zustand integration point has to be replaced with an extension-native equivalent. The state machine itself is the single source of truth for the generation lifecycle and can be shared verbatim between the web app and the extension; only the `provide()` layer diverges.

**Recommended extension layout**:
```
extension/src/lib/generation/
  ├─ machine.ts          (copy of src/lib/generation/machine/machine.ts, 0 changes)
  ├─ events.ts           (copy, 0 changes)
  ├─ transport.ts        (copy, 0 changes)
  ├─ actors.ts           (patched: parameterized URL + authHeaders)
  ├─ connection-state.ts (6-line const shim for CONNECTED)
  ├─ debug-logger.ts     (no-op shim)
  └─ createExtensionActor.ts (replaces useGeneration.ts; framework-free, returns actorRef)
```

---

Confidence: 100%
Filename: e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\28-frontend-generation-machine.md
