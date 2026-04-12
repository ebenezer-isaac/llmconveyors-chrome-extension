# 26 — npm Package Agents SDK Investigation

Scope: `E:\llmconveyors-npm-package` — LLMConveyors client class, HTTP, agents, streaming.

## a) LLMConveyors Client Constructor

`src/client.ts:35-64` — constructor takes `ClientOptions`:
- `apiKey` (required, MUST start with `llmc_` prefix — hard-enforced at `client.ts:36-37`)
- `baseUrl` (optional, default `DEFAULT_BASE_URL`)
- `maxRetries` (optional, default `DEFAULT_MAX_RETRIES`)
- `timeout` (optional, default `DEFAULT_TIMEOUT`)
- `debug` (optional, `(message: string) => void`)

NO custom `fetch` injection. NO `headers` option on the client (only per-request in `RequestOptions`). Uses global `fetch` directly (`http.ts:219`, `http.ts:276`).

14 resources exposed: `agents`, `stream`, `sessions`, `upload`, `resume`, `ats`, `settings`, `privacy`, `documents`, `logging`, `health`, `content`, `shares`, `referral`.

## b) Auth Header

`http.ts:222` and `http.ts:261` — the SDK sends `X-API-Key: <apiKey>`. NOT `Authorization: Bearer`. Also sends `User-Agent: llmconveyors-sdk/${VERSION}`.

## c) Cookie / SuperTokens Support

**NO.** API key only. The `llmc_` prefix check (`client.ts:37`) hard-rejects any other token. No `credentials: 'include'`, no cookie header passthrough, no `st-auth-mode` header. Only per-request `headers` override exists via `RequestOptions.headers` (`http.ts:24`), but the `X-API-Key` header is always set (`http.ts:260-264`) and cannot be removed (spread order places user headers AFTER the default `X-API-Key`, so user headers can technically override it, but `apiKey` is validated at construction).

For the Chrome extension: cookie-mode SuperTokens auth is NOT supported. Extension must use an API key OR the SDK needs a fork/extension to support `credentials: 'include'` + `st-auth-mode: cookie`.

## d) AgentsResource Methods

`src/resources/agents.ts` — 7 public methods + 1 internal wiring hook (`_setStreamResource`, `agents.ts:21-23`):

1. `generate<T extends AgentType>(agentType: T, body: AgentRequestMap[T]): Promise<GenerateResponse>` — POST `/agents/{agentType}/generate` (`agents.ts:25-33`). `GenerateResponse` = `{ jobId, generationId, sessionId, status: 'queued', streamUrl }` — all 5 required (`types/agents.ts:75-81`).
2. `generateCv(body: GenerateCvRequest): Promise<GenerateCvResponse>` — POST `/agents/job-hunter/generate-cv` (`agents.ts:35-40`). Request: `{ prompt: string }` (`types/agents.ts:88-90`). Response: `{ resume, model, usage?, warning? }` (`types/agents.ts:93-98`). Synchronous 200, not 202.
3. `getStatus(agentType: AgentType, jobId: string, options?: StatusOptions): Promise<JobStatusResponse>` — GET `/agents/{agentType}/status/{jobId}` with `?include=logs,artifacts` query (`agents.ts:42-55`). Response has 16 optional/required fields including `completedPhase`, `interactionType`, `interactionData`, `usage` (`types/agents.ts:112-130`).
4. `interact(agentType: PhasedAgentType, body: InteractRequest): Promise<InteractResponse>` — POST `/agents/{agentType}/interact` (`agents.ts:57-65`). `PhasedAgentType = AgentType` (alias, `types/agents.ts:191`). Request requires all 4 fields: `{ generationId, sessionId, interactionType, interactionData }` (`types/agents.ts:194-199`). Response: `{ success, jobId?, streamUrl?, generationId?, sessionId?, status?, phase? }` (`types/agents.ts:202-210`).
5. `getManifest(agentType: AgentType): Promise<ManifestResponse>` — GET `/agents/{agentType}/manifest` (`agents.ts:67-71`). Response includes `billing`, `capabilities`, `inputFields`, `interactionTypes`, `preferenceFields` (`types/agents.ts:172-184`).
6. `run<T extends AgentType>(agentType: T, body: AgentRequestMap[T], options?: RunOptions): Promise<RunResult>` — calls `generate()` then `streamToCompletion()` (`agents.ts:77-84`). `RunResult = { jobId, sessionId, generationId?, success, artifacts, warnings? }` (`types/agents.ts:240-247`).
7. `poll(agentType: AgentType, jobId: string, options?: PollOptions): Promise<JobStatusResponse>` — polls until terminal state `completed|failed|awaiting_input` (`agents.ts:90-109`). Defaults: `interval=2000ms`, `timeout=300_000ms` (`agents.ts:95-96`). Throws `POLL_TIMEOUT` or `ABORTED` via `LLMConveyorsError` (`agents.ts:101,108`).

Private helpers: `getStream()` (`agents.ts:111-116`) and `streamToCompletion()` (`agents.ts:118-179`) — the latter contains the entire phased-resumption loop.

## d.1) Exact Request Shape for `generate('job-hunter', ...)`

NOT the shared-types `GenerateFormSchema` — it is a **25-field superset** defined at `types/agents.ts:8-37` as `JobHunterGenerateRequest`:

**Required (3):** `companyName`, `jobTitle`, `jobDescription`, `companyWebsite` — note `companyWebsite` is also required despite not being in the "lean client" request shape from the backend-first rule.

Wait — re-reading `types/agents.ts:22`: `readonly companyWebsite: string;` is NOT `?` — it IS required in the SDK's type. So 4 required fields, not 3.

**Optional (22):** `sessionId`, `generationId`, `masterResumeId`, `tier` (`'free'|'byo'`), `model` (`'flash'|'pro'`), `webhookUrl`, `autoSelectContacts`, `skipResearchCache`, `mode` (`'standard'|'cold_outreach'`), `theme` (8-enum: `'even'|'stackoverflow'|'class'|'professional'|'elegant'|'macchiato'|'react'|'academic'`), `contactName`, `contactTitle`, `contactEmail`, `genericEmail`, `originalCV`, `extensiveCV`, `cvStrategy`, `coverLetterStrategy`, `coldEmailStrategy`, `reconStrategy`, `specificCore`, `companyProfile`, `jobSourceUrl`, `emailAddresses`.

⚠ [types/agents.ts:15] BLUEPRINT DRIFT: `tier?: 'free' | 'byo'` is still in the SDK type despite the "Tier/Model Decoupling" memory note saying tier should be removed. The SDK exposes it as an accepted public field.

⚠ [types/agents.ts:29-32] BLUEPRINT DRIFT: `cvStrategy`, `coverLetterStrategy`, `coldEmailStrategy`, `reconStrategy` are publicly exposed despite `feedback_strategies_are_internal.md` saying strategies should never be exposed to end users.

B2B shape: `B2BSalesGenerateRequest` (`types/agents.ts:40-62`) — required: `companyName`, `companyWebsite`; 16 optional fields including `autoSelectContacts`, `autoApproveDraft`, `autoApproveFollowups`, `followUpCount`, `followUpDelayDays`, `researchMode` (`'parallel'|'sequential'`).

## e) Unified vs Per-Agent

**Unified.** All methods take `agentType: AgentType` (`'job-hunter' | 'b2b-sales'`). No separate `jobHunter` / `b2bSales` sub-resources. Type-safe via `AgentRequestMap[T]` generic constraint (`agents.ts:25-28`). Only exception: `generateCv()` hard-codes `/agents/job-hunter/generate-cv` (`agents.ts:37`).

## f) Streaming — stream.generation()

`src/resources/streaming.ts:70-197` — `generation(generationId, options?)` is an **async generator**: `AsyncGenerator<SSEEvent, void, undefined>` (`streaming.ts:73`).

**StreamOptions** (`types/streaming.ts:98-105`):
```ts
{
  signal?: AbortSignal;
  includeHeartbeats?: boolean;    // default false (agents.ts:128)
  includeLogs?: boolean;          // default true (streaming.ts:77); agents.run sets !!onLog
  reconnect?: boolean;            // default true (streaming.ts:78)
  maxReconnectAttempts?: number;  // default 5 (streaming.ts:11, 79)
  lastEventId?: string;           // initial resume-from point (streaming.ts:80-85)
}
```

Mechanism: uses `http.fetchRaw()` (`streaming.ts:101`) → reads `response.body.getReader()` (`streaming.ts:131`) → `TextDecoder` (`streaming.ts:132`, `streaming.ts:177`) → feeds bytes to `SSEParser.feed()` (`streaming.ts:178`) → yields frames → parses each via `parseFrame()` (`streaming.ts:35-53`) → yields typed `SSEEvent`s.

**AsyncGenerator yield shape (STEP 3 Q6):** each yielded value is `{ event: string, data: object }` — a discriminated union `SSEEvent` = `ProgressEvent | ChunkEvent | CompleteEvent | SSEErrorEvent | LogEvent | HeartbeatEvent` (`types/streaming.ts:89-95`). Confirmed at `streaming.ts:52`: `return { event: eventType, data: eventData } as SSEEvent;`

Server payload format (`streaming.ts:46-49`): `data: {"event":"progress","data":{...}}` — event type is INSIDE the JSON, not the SSE `event:` line. The inner `.data` is the payload. Known events (`streaming.ts:15-17`): `progress`, `chunk`, `complete`, `error`, `log`, `heartbeat` — unknown event types silently dropped at `streaming.ts:51`.

Key behavior (`streaming.ts:256-264`): `complete` with `awaitingInput: true` is NOT terminal — `continue` keeps the stream loop open for phased resumption instead of returning `{ terminate: true }`.

## g) Reconnection / Last-Event-ID (STEP 3 Q7)

**YES — full last-event-id tracking and reconnect on both connection failure and read failure** (`streaming.ts:84-196`):
- Maintains `currentLastEventId` local variable (`streaming.ts:85`), seeded from `options.lastEventId` initial value (`streaming.ts:80`).
- Updated on every frame with an `id` field (`streaming.ts:156`, `streaming.ts:180`).
- Also falls back to `parser.getLastEventId()` from the SSE parser's internal state (`streaming.ts:96`).
- Sends `last-event-id` header on reconnect: `if (eventIdToSend) headers['last-event-id'] = eventIdToSend;` (`streaming.ts:96-97`).
- Exponential backoff with jitter on connect failure: `addJitter(min(1000 * 2^attempt, 30_000))` (`streaming.ts:19-21`, `streaming.ts:105`, `streaming.ts:143`, `streaming.ts:168`). `addJitter` adds up to 500ms random (`streaming.ts:19-21`).
- Per-error-code delays for SSE error events (`streaming.ts:23-33`, invoked at `streaming.ts:244`):
  - `SERVER_RESTARTING`: 5-10s uniform random
  - `STREAM_ERROR`: exponential backoff with jitter
  - `STREAM_NOT_FOUND` / `SESSION_DELETED`: `undefined` → no reconnect (terminal)
- `maxReconnectAttempts` default 5 (`streaming.ts:11`, `streaming.ts:79`)
- Resets `reconnectAttempt` to 0 on successful frame receipt (`streaming.ts:191`)
- Parser state reset via `parser.reset()` before each reconnect (`streaming.ts:108,145,163,170,187`)

## h) Error Class Hierarchy

`src/errors.ts` — `LLMConveyorsError` base (`errors.ts:54-83`) with 31 API codes + 6 client-side codes. 30+ subclasses including `ValidationError`, `UnauthorizedError`, `InsufficientCreditsError`, `ForbiddenError`, `InsufficientScopeError`, `NotFoundError`, `UnknownAgentError`, `ConflictError`, `RateLimitError` (with `retryAfter` and `retryAfterMs` fields, `errors.ts:142-162`), `ConcurrentGenerationLimitError`, `ExpiredError`, `MissingCvError`, `StreamNotFoundError`, `SessionDeletedError`, `AIQuotaExhaustedError`, `JobFailedError`, etc. Plus non-API: `NetworkError`, `TimeoutError` (`errors.ts:314-326`). Factory: `parseErrorResponse()` (`errors.ts:355-449`).

## i) React Hooks / UI Components

**NONE.** `src/index.ts:1-100` exports only: client class, types, error classes, webhook utilities, version constant, resource classes. Zero React dependencies, zero JSX, zero hook files. This is a pure TS SDK — Chrome extension UI must be built separately.

## j) HTTP Retry Logic (STEP 3 Q4 + Q5)

`http.ts:168-188` — `request()` loops `maxAttempts = maxRetries + 1` times (`http.ts:170`). `maxRetries` defaults to `DEFAULT_MAX_RETRIES = 3` (`types/common.ts:171`) → **4 total attempts** (1 initial + 3 retries). Retry decision via `getRetryDelayMs()` (`http.ts:98-115`):

**Retryable codes (9):** from `RETRYABLE_CODES` Set (`errors.ts:18-28`):
1. `RATE_LIMITED`
2. `CONCURRENT_GENERATION_LIMIT`
3. `SESSION_GENERATION_IN_PROGRESS`
4. `AI_PROVIDER_ERROR`
5. `GENERATION_TIMEOUT`
6. `SERVER_RESTARTING`
7. `STREAM_ERROR`
8. `SERVICE_UNAVAILABLE`
9. `AI_RATE_LIMITED`

**Note:** Retry decision is code-based, NOT HTTP-status-based. Raw `503`, `429` etc. only retry if the error envelope code matches. Non-envelope HTTP failures (non-JSON 5xx) get `INTERNAL_ERROR` which is NOT retryable (`http.ts:301-305`).

**Rate limit handling (Q5):** YES, the SDK reads both `Retry-After` header AND body `retryAfterMs` field:
- `parseRetryAfter()` reads `Retry-After` header as seconds (`http.ts:76-82`).
- `parseErrorResponse()` passes both `retryAfter` (header seconds) and body `error.retryAfterMs` to `RateLimitError` (`errors.ts:379-401`).
- `getRetryDelayMs` for `RATE_LIMITED` **prefers body `retryAfterMs` (ms)** over header `Retry-After` (s), both get `+ Math.random() * RETRY_JITTER_MAX_MS` (500ms max) jitter added (`http.ts:103-112`).
- Also parses `X-RateLimit-Limit`/`Remaining`/`Reset` headers into `RateLimitInfo` on the error (`http.ts:84-96`, attached via `errors.ts:148,160`).

**Other retry delays:**
- `CONCURRENT_GENERATION_LIMIT`: fixed 5000ms (`CONCURRENT_LIMIT_DELAY_MS`, `http.ts:30`, `http.ts:113`)
- All other retryable codes: `computeBackoffMs(attempt) = min(RETRY_BASE_DELAY_MS * 2^attempt + random(0..RETRY_JITTER_MAX_MS), RETRY_MAX_DELAY_MS)` (`http.ts:51-55`)
- Constants: `RETRY_BASE_DELAY_MS = 1_000`, `RETRY_MAX_DELAY_MS = 30_000`, `RETRY_JITTER_MAX_MS = 500` (`types/common.ts:177-179`)
- Backoff sequence: attempt 0 → 1000-1500ms, attempt 1 → 2000-2500ms, attempt 2 → 4000-4500ms, capped at 30_000ms.

**Per-request opt-out:** `noRetry: true` on `RequestOptions` forces `maxAttempts = 1` (`http.ts:170`, `http.ts:26`).
**Response envelope auto-unwrap:** `{success, data}` → returns `data` directly (`http.ts:316-321`).

## k) run() interactionHandler — Phased Resumption (STEP 3 Q3)

**Signature** (`types/agents.ts:222-225`):
```ts
interactionHandler?: (
  interactionType: string,
  interactionData: unknown,
) => Promise<Record<string, unknown>>;
```

The callback receives the server-provided `interactionType` string (e.g. `'contact_selection'`, `'draft_review'`) and the opaque `interactionData` payload from the `complete` SSE event, and MUST return a `Promise<Record<string, unknown>>` — that return value becomes the `interactionData` field of the subsequent `interact()` POST body (`agents.ts:146-155`).

**Full flow inside `streamToCompletion()`** (`agents.ts:141-158`):
1. Stream yields `{ event: 'complete', data: { awaitingInput: true, interactionType, interactionData, ... } }`.
2. If `awaitingInput && interactionHandler` present → invoke handler with `(interactionType, interactionData)`.
3. If `awaitingInput` but NO `interactionType` → throws `LLMConveyorsError('Server sent awaitingInput without interactionType', 0, 'MALFORMED_RESPONSE')` (`agents.ts:144`).
4. Await handler's returned object, then call `this.interact(agentType, { sessionId, generationId, interactionType, interactionData: interactionResult })` (`agents.ts:150-155`).
5. The `jobId` returned by `interact()` "doubles as generationId" per SDK comment (`agents.ts:156-157`) — if present, becomes the new `generationId` for the next streaming pass.
6. **Recursive tail call**: `return this.streamToCompletion(agentType, nextGenerationId, sessionId, options);` (`agents.ts:158`) — fully recursive, supports arbitrary-depth phased workflows (A→B→C→D→E for B2B).
7. If `awaitingInput` but NO handler → throws `LLMConveyorsError('Generation requires interaction but no interactionHandler provided', 0, 'INTERACTION_HANDLER_REQUIRED')` (`agents.ts:161`).

**Terminal states in `streamToCompletion()`:**
- `complete` with `awaitingInput: false` → returns `RunResult` (`agents.ts:163-170`)
- `error` event → throws `LLMConveyorsError(message, 0, code)` where `code` is the SSE error code cast to `ApiErrorCode` (`agents.ts:173`)
- Stream ends without `complete` → throws `LLMConveyorsError('Stream ended without complete event', 0, 'STREAM_INCOMPLETE')` (`agents.ts:178`)

**Other callbacks in RunOptions** (`types/agents.ts:217-229`):
- `onProgress?: (step, percent, message?) => void` — fires on `progress` events (`agents.ts:132-134`)
- `onChunk?: (chunk, index) => void` — fires on `chunk` events (`agents.ts:135-137`)
- `onLog?: (content, level) => void` — fires on `log` events; its presence also toggles `includeLogs` via `!!options?.onLog` (`agents.ts:129`, `agents.ts:138-140`)
- `streamOptions.includeHeartbeats?: boolean` — currently **not wired** into the `stream.generation()` call at `agents.ts:126-130` (only `signal`, hardcoded `includeHeartbeats: false`, and computed `includeLogs` are forwarded). ⚠ `RunOptions.streamOptions` is effectively dead.

## Key Chrome-Extension Implications

1. **Auth mismatch**: SDK is API-key-only (`X-API-Key`, `llmc_` prefix enforced). Extension MVP using SuperTokens browser session cookies CANNOT use this SDK as-is without patching `client.ts:37` and adding `credentials: 'include'` to `http.ts:276`.
2. **Fetch injection absent**: no way to inject a custom fetch (for MV3 service worker scenarios, global `fetch` works fine, but background/content script relay patterns would need wrapping).
3. **No UI layer**: extension must build its own popup UI; SDK only provides data/streaming primitives.
4. **Streaming works in MV3**: uses `ReadableStream` via `response.body.getReader()` — compatible with MV3 service workers (offscreen document not required for fetch streaming).
5. **`run()` helper** (`agents.ts:77-84`) is the one-call workflow the extension should use: generate + stream + auto-resume on `awaitingInput` via `interactionHandler` callback.

Confidence: 100%
Filename: `26-npm-package-agents-sdk.md`
