# Agent 11: Unified Agent Controller — Status + List Endpoints

Scope: `api/src/modules/agents/unified-agent.controller.ts` status + list endpoints only. Interact endpoint is out of scope (agent 12).

## a) Method + Path for "get job status"

- Method: `GET`
- Path (full): `/agents/:agentType/status/:jobId`
- Controller base: `@Controller('agents/:agentType')` at `api/src/modules/agents/unified-agent.controller.ts:44`
- Handler: `getStatus` decorated `@Get('status/:jobId')` at `unified-agent.controller.ts:60`
- Params:
  - `agentType` (enum of `AGENT_TYPES = ['job-hunter','b2b-sales']`) — `unified-agent.controller.ts:62`, enum source `libs/shared-types/src/schemas/agent-api.schema.ts:16`
  - `jobId` (BullMQ job ID, same as generationId) — `unified-agent.controller.ts:63`

## b) Query Params

Only one query param is declared:

- `include` (optional, string) — "Comma-separated fields to include (logs, artifacts)" — `unified-agent.controller.ts:64`, `unified-agent.controller.ts:73`
  - Supported values documented: `logs`, `artifacts` (comma-separated, e.g. `?include=logs,artifacts`)
  - Passed straight through to `orchestrationService.getJobStatus(agentType, jobId, user, include)` at `unified-agent.controller.ts:75` (parsing happens inside the service — out of scope for this agent).

No other query params accepted at the controller layer.

## c) Response DTO — `JobStatusResponseDto` / `JobStatusResponse`

- DTO class: `JobStatusResponseDto extends createZodDto(JobStatusResponseSchema)` — `api/src/common/dto/response-schemas.dto.ts:108`
- Zod source: `libs/shared-types/src/schemas/agent-api.schema.ts:32-56`

Full field list (from `JobStatusResponseSchema`):

| Field | Type | Required | Description |
|---|---|---|---|
| `jobId` | string | yes | Job identifier (same value as generationId) — `:33` |
| `generationId` | string | optional | Generation ID for SSE streaming — `:34` |
| `sessionId` | string | optional | Associated session ID — `:35` |
| `agentType` | string | optional | Agent that created the job — `:36` |
| `status` | enum | yes | Current job status (see d) — `:37-39` |
| `progress` | number (0–100) | optional | Completion percentage — `:40` |
| `currentStep` | string | optional | Currently executing workflow step — `:41` |
| `logs` | array<{content, level, timestamp}> | optional | Only when `include=logs` — `:42-46` |
| `artifacts` | array<record<unknown>> | optional | Only when `include=artifacts` — `:47` |
| `failedReason` | string (max 1000) | optional | Error description if `status === 'failed'` — `:48` |
| `interactionData` | record<unknown> | optional | Payload when `awaiting_input` — `:49` |
| `interactionType` | string | optional | e.g. `'contact_selection'`, when `awaiting_input` — `:50` |
| `completedPhase` | number (0-based) | optional | Last completed phase index, present when `awaiting_input` — `:51` |
| `result` | record<unknown> | optional | Final generation result data — `:52` |
| `createdAt` | string (ISO 8601) | yes | Job creation timestamp — `:53` |
| `completedAt` | string (ISO 8601) | optional | Completion timestamp — `:54` |
| `usage` | `UsageSchema` | optional | Tokens + credits; present when completed — `:55` |

`UsageSchema` fields (`libs/shared-types/src/schemas/usage.schema.ts:9-17`): `promptTokens`, `candidatesTokens`, `thoughtsTokens?`, `totalTokens`, `creditsUsed?`, `resolvedModel?`, `cachedTokens?`.

## d) Possible values of `status`

Enum literal in `agent-api.schema.ts:37-39`:

```
'queued' | 'processing' | 'completed' | 'failed' | 'awaiting_input'
```

Exactly 5 values. No `'running'`, `'success'`, or `'error'` aliases.

## e) Shape of `logs` array (when `include=logs`)

`agent-api.schema.ts:42-46`:

```ts
Array<{
  content: string;    // Log message content
  level: string;      // 'info' | 'warn' | 'error' (free-form string at schema level)
  timestamp: string;  // ISO 8601
}>
```

Schema does not constrain `level` to an enum.

## f) Shape of `artifacts` array (when `include=artifacts`)

`agent-api.schema.ts:47`:

```ts
Array<Record<string, unknown>>
```

Schema is fully opaque — each element is any JSON object. No per-artifact contract enforced at this layer.

## g) Shape of `interactionData` + `interactionType` (when `awaiting_input`)

`agent-api.schema.ts:49-51`:

- `interactionType`: `string` — discriminator, e.g. `'contact_selection'`
- `interactionData`: `Record<string, unknown>` — agent-specific payload keyed by field name
- `completedPhase`: `number` — zero-based index of the last completed phase

Concrete payload shapes (e.g. `B2BContactSelectionDataSchema` at `agent-api.schema.ts:93-95` with `selectedContactIds: string[]`) live in the same file but are not referenced from the status response — the wire schema stays generic.

## h) Guards + scope for status endpoint

Controller-level guards (apply to `getStatus`) — `unified-agent.controller.ts:45-47`:

- `AuthGuard` (SuperTokens + API key auth) — `:45`
- `ScopeGuard` — `:45`
- `ApiKeyAuditInterceptor` — `:46`
- `RateLimitExceptionFilter` — `:47`

The `getStatus` handler adds NO extra guards — notably no `ApiKeyCreditGuard` and no `UsageRateLimitGuard` (those are only on `interact` at `:105`). No explicit `@RequiredScopes(...)` decorator is visible on the handler in this file; scope is enforced by `ScopeGuard` based on metadata not present in the controller file itself.

`@CurrentUser() user: UserContext` is passed to the service (`:72`, `:75`) so ownership/authorization is delegated to `AgentOrchestrationService.getJobStatus`.

## i) List endpoints in this controller

None. This controller exposes only three routes:

1. `GET  /agents/:agentType/status/:jobId` — `:60`
2. `GET  /agents/:agentType/manifest` — `:84`
3. `POST /agents/:agentType/interact` — `:103` (out of scope)

There is NO `list generations`, NO `list sessions`, NO `list jobs` endpoint in `unified-agent.controller.ts`. Any such listing lives in a different controller (e.g. sessions module) — not in scope here.

## j) Rate limiting on status

- No `@Throttle(...)` decorator on `getStatus` (`:60-76`). Contrast with `interact` at `:102` which has `@Throttle({ default: { ttl: 60000, limit: 10 } })`.
- Global NestJS `ThrottlerGuard` is registered as APP_GUARD in `api/src/app.module.ts:113`, configured from `api/src/common/guards/throttle.config.ts:18-26`:
  - `name: 'default'`, `ttl: 60000` (1 minute), `limit: 300` (300 requests per minute per IP).
  - Documented as "DDoS safety net only" -- the per-IP budget is shared across ALL non-`@SkipThrottle()` routes for that IP, including SSR init, credits polling, status, etc.
- `UsageRateLimitGuard` is NOT applied to status (only to `interact` at `:105`).
- `RateLimitExceptionFilter` is registered at controller level (`:47`) to format any 429s that do occur.
- Response headers set automatically by `ThrottlerGuard` v6+: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429 (`api/src/common/guards/throttle.config.ts:38-55`). The extension can drive backoff directly from these.

**Polling-safe interval** (deterministic, per 300/min IP budget):
- Hard ceiling: 300 req/min == 5 req/sec per IP, shared with all other traffic from that IP.
- Recommended extension poll cadence: **2000ms** (30 req/min per job). Burns 10% of the IP budget, leaves 270 req/min for other tabs and SSE/credits polling.
- Safe for multiple concurrent jobs: poll at `2000ms * jobCount` or use a single coordinated timer. Do NOT go below 2000ms even for a single job.
- On 429: read `Retry-After` (seconds) and back off at least that long; fall back to exponential backoff (2s -> 5s -> 15s) if the header is missing.
- SSE streaming (`/sse`) is `@SkipThrottle()`-exempt, so prefer SSE for live progress and reserve polling for recovery/reconnect scenarios.

## k) Response for unknown jobId

Controller declares `@ApiResponse({ status: 404, description: 'Job not found' })` at `:68`. The handler itself does no lookup -- it calls `orchestrationService.getJobStatus(...)` at `:75` and returns the result directly.

Verified in `api/src/modules/agents/agent-orchestration.service.ts:707-744`:
1. BullMQ fetch (`queueService.getJobStatus('generation', jobId)`) is wrapped in try/catch. Any thrown error -> `NotFoundException({ code: 'NOT_FOUND', message: 'Job {jobId} not found' })` (`:721-728`).
2. If BullMQ returns falsy (`!jobStatus`) -> same `NotFoundException` (`:730-735`).
3. Ownership check: if `jobStatus.data.userId` is missing OR does not match `user.uid` -> `ForbiddenException({ code: 'FORBIDDEN', message: 'Access denied' })` (`:738-744`).

NestJS exception filter (`api/src/common/filters/api-exception.filter.ts`) formats these as standard error envelopes with the documented `code` + `message`. No empty-body, no `null`, no soft-fallback at any layer.

Wire behavior for each case:
- Unknown / expired / wrong-queue jobId -> `404 { code: 'NOT_FOUND', message: 'Job {jobId} not found' }`
- jobId exists but belongs to another user -> `403 { code: 'FORBIDDEN', message: 'Access denied' }` (deny-by-default, prevents IDOR)
- Missing/invalid auth -> `401`
- Happy path -> `200` with `JobStatusResponse`

Other documented error responses for status (`:66-68`):
- `401 Unauthorized` -- missing or invalid credentials
- `403 Forbidden` -- access denied (ownership mismatch)
- `404 Not Found` -- job not found

## Summary for Chrome extension wiring

- Poll URL: `GET /agents/{agentType}/status/{jobId}` with `agentType in {'job-hunter','b2b-sales'}`
- Include flags: append `?include=logs,artifacts` as needed (comma-separated, e.g. `?include=logs,artifacts`)
- Auth: Bearer token OR `api-key` header (both declared via `@ApiBearerAuth('bearer')` + `@ApiSecurity('api-key')` at `:42-43`)
- Terminal statuses: `completed`, `failed` (both final)
- Gate status: `awaiting_input` -- read `interactionType` + `interactionData` + `completedPhase` then call interact endpoint (agent 12)
- Active statuses: `queued`, `processing` -- continue polling
- Poll interval: **2000ms minimum** (global cap 300 req/min/IP, shared across all traffic). Prefer SSE for live updates; use polling only for reconnect/recovery.
- Backoff on 429: honor `Retry-After` header; fall back to 2s -> 5s -> 15s exponential.
- 404 handling: treat as unknown/expired job -- stop polling, do not retry. Error shape: `{ code: 'NOT_FOUND', message: 'Job {jobId} not found' }`.
- 403 handling: ownership mismatch (IDOR prevention) -- stop polling, do not retry. Error shape: `{ code: 'FORBIDDEN', message: 'Access denied' }`.
- List/search endpoints: NONE on unified agent controller. Any "list my jobs" feature must query the sessions module instead (out of scope for this agent).

---

Confidence: 100%
