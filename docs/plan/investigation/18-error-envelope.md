# Agent 18 — Global Exception Filter & Error Envelope

## a) Filter Class & Registration
- **Primary (global)**: `ApiExceptionFilter` — `@Catch()` (catches ALL exceptions, no type filter) at `api/src/common/filters/api-exception.filter.ts:41-42`
  - Registered globally in `api/src/main.ts:92` via `app.useGlobalFilters(new ApiExceptionFilter())` (import `main.ts:12`)
  - Instantiated directly (not via DI) — no constructor dependencies, purely stateless except for its `Logger` instance
- **Secondary (scoped)**: `RateLimitExceptionFilter` — `@Catch(HttpException)` at `api/src/common/filters/rate-limit-exception.filter.ts:16-17`
  - NOT global. Applied per-controller via `@UseFilters(RateLimitExceptionFilter)` — only consumer is `api/src/modules/agents/unified-agent.controller.ts:47`
  - Purpose: extracts `retryAfterMs` from the thrown 429 body and converts to `Retry-After` header (seconds). Does NOT shape envelope — passes `body` through verbatim (`:31`)
  - **IMPORTANT**: Because NestJS runs controller-scoped filters BEFORE global filters, 429 responses from `UnifiedAgentController` bypass `ApiExceptionFilter` entirely → they are NOT wrapped in the `{success, error, requestId, timestamp, path}` envelope. The response body is whatever the guard/service threw (raw object), with only `Retry-After` header added. This is a known inconsistency for the extension client consuming agent endpoints.
- **Success-path wrapper**: `ResponseTransformInterceptor` (global) at `api/src/common/interceptors/response-transform.interceptor.ts:30`
  - Registered in `api/src/app.module.ts:109` as `APP_INTERCEPTOR`
  - Wraps successful responses in `{success: true, data, requestId, timestamp}` — see §c

## b) Full Error Envelope Shape
Built at `api-exception.filter.ts:116-122`:
```ts
{
  success: false,            // literal false
  error: {                   // nested object
    code: string,            // machine-readable, e.g. 'INSUFFICIENT_CREDITS'
    message: string,         // human-readable
    hint?: string,           // dev-friendly remediation (see getHint switch :150-192)
    details?: unknown,       // 400 ONLY: Zod flatten() or responseObj.errors/details
    // plus forwarded domain fields (usedCredits, monthlyLimit, resetsAt, retryAfter, etc.)
    // — any keys on the thrown HttpException body NOT in ENVELOPE_FIELDS set
  },
  requestId: string,         // RequestContext.currentRequestId() (AsyncLocalStorage)
  timestamp: string,         // ISO 8601 (new Date().toISOString())
  path: string,              // request.url.split('?')[0] — querystring stripped
}
```
`ENVELOPE_FIELDS` blocklist (`:33-35`): `statusCode, error, message, code, errors, details` — these are NOT forwarded as domain fields.

## c) Full Success Envelope Shape (`{success, data, error}` Question)
**Partial uniformity, with well-defined exclusions.** The `data` field is ONLY on success responses; error responses have no `data` key.

Success envelope at `response-transform.interceptor.ts:62-67`:
```ts
{
  success: true,             // literal true
  data: <original handler return>,
  requestId: string,         // RequestContext.currentRequestId()
  timestamp: string,         // ISO 8601
  // NOTE: no `path` on success (only on errors)
}
```

**Success envelope applied to ALL JSON responses EXCEPT**:
1. **SSE endpoints** — detected via `@Sse()` metadata key `__sse__` (`:17, :35-38`). Entire `/agents/:agentType/stream` and similar stream through untouched.
2. **`/metrics` endpoint** — Prometheus expects raw `text/plain` (`:42-45`)
3. **`StreamableFile`** — binary file downloads pass through (`:50-52`)
4. **`Buffer`** — raw binary passes through (`:53-55`)
5. **`null` / `undefined`** — `@HttpCode(204)` or `void` handlers return bare (`:57-60`)
6. **429 from `UnifiedAgentController`** — intercepted by `RateLimitExceptionFilter` before global filter, bypasses BOTH envelopes (see §a)

**Swagger declares these envelopes formally** in `main.ts:150-171`:
- `components.schemas.ErrorDetail` — `{code, message, hint?, details?}`
- `components.schemas.ErrorEnvelope` — `{success, error, requestId, timestamp, path}` (all required)
- Success response schemas are post-processed at `main.ts:192-204` to wrap `innerSchema` as `{success, data, requestId, timestamp}` (all required, no `path`). Confirms divergence.

## d) Standard Error Fields
| Field | Present | Location | Notes |
|-------|---------|----------|-------|
| `error.code` | always | `:81-84` | `responseObj.code ?? STATUS_TO_CODE[status] ?? 'UNKNOWN_ERROR'` |
| `error.message` | always | `:74-79` | String / `responseObj.message` / `'Internal server error'` / `'Validation failed'` for Zod |
| `error.hint` | conditional | `:93-96`, hints from `:145-193` | Only 400/401/403/404/429 match specific substrings |
| `error.details` | 400 only | `:99-105` | `ZodError.flatten()` OR `responseObj.errors ?? responseObj.details` |
| `error.<domain>` | conditional | `:108-114` | Forwards all non-`ENVELOPE_FIELDS` keys from HttpException body flat into `error` |
| `requestId` | always | `:119` | **Envelope root, NOT inside `error`** |
| `timestamp` | always | `:120` | **Envelope root, NOT inside `error`** |
| `path` | always | `:121` | **Envelope root, NOT inside `error`** (errors only — success omits) |

**Client rule**: read `requestId`/`timestamp`/`path` from envelope root; `code`/`message`/`hint`/`details`/domain-fields from `error.*`. Never reach for `error.requestId` — it won't exist.

## e) HTTP Status Determination (`:57-62`)
Precedence:
1. `exception instanceof HttpException` → `exception.getStatus()`
2. `exception instanceof ZodError` OR `(exception instanceof Error && exception.name === 'ZodError')` → `400 BAD_REQUEST`
3. Everything else → `500 INTERNAL_SERVER_ERROR`

**`STATUS_TO_CODE` map** (`:18-30`, fallback when `responseObj.code` absent):
| Status | Default `error.code` |
|--------|----------------------|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 402 | `INSUFFICIENT_CREDITS` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 410 | `EXPIRED` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |
| (unmapped) | `UNKNOWN_ERROR` fallback |

**NOTE**: Status codes outside this map (e.g. 402, 405, 408, 413, 422, 502, 504) will fall through to the literal `'UNKNOWN_ERROR'` code unless the thrower supplies `code` on the exception body. 402 is listed but behaviorally the codebase issues `INSUFFICIENT_CREDITS` as 402.

## f) Production Stripping of Internal Detail
**Implicit stripping, no explicit `NODE_ENV` branch.** Behavior:
- **Stack traces**: NEVER written to the response body. Logged server-side only at `:126-131` via `this.logger.error(msg, exception.stack)` — and only for `status >= 500`.
- **Non-HttpException 500s**: message forced to `'Internal server error'` (`:79`) because `responseObj` is null — internal exception text does not reach client.
- **Zod errors**: message forced to `'Validation failed'` (`:75-76`); full details on `error.details` via `exception.flatten()` (safe — field names + messages only).
- **HttpException passthrough risk**: if any service throws `new HttpException({ message: 'DB query failed: ' + sqlString, ... }, 500)`, the filter forwards `responseObj.message` verbatim with **no sanitization**. The 500 → `'Internal server error'` fallback only triggers when `responseObj?.message` is falsy. Audit: any service constructing HttpException messages with user input or internal state leaks it.
- **Domain field forwarding**: `:108-114` copies EVERY non-envelope key from the thrown object into `error.*`. If a thrower accidentally passes `{ code, message, stack, internalCtx, ... }`, `stack`/`internalCtx` would leak. `ENVELOPE_FIELDS` only blocks `statusCode, error, message, code, errors, details` — it does NOT block `stack`, `cause`, `context`, etc.

**No `NODE_ENV === 'production'` conditional exists** in the filter or interceptor. Same response shape in dev and prod.

## g) Telemetry Emission
| Channel | Status | Location | Notes |
|---------|--------|----------|-------|
| Logging (NestJS `Logger` → Pino) | 5xx ONLY | `:125-132` | Format: `[${requestId}] ${method} ${url} → ${status}: ${message}` + stack |
| Prometheus metrics | NONE | — | No counter/histogram increment from the filter. HTTP metrics come from a separate interceptor, not the error filter. |
| OpenTelemetry traces | NONE | — | No `span.recordException()`, no `span.setStatus(ERROR)` in filter. Traces rely on the instrumented HTTP layer. |
| `Retry-After` header | 429 fallback | `:137-140` | If header not already set, reads `responseObj.retryAfter ?? responseObj['Retry-After'] ?? 60` (seconds). `ThrottlerGuard` v6 sets this natively — fallback only for custom guards. |
| Request ID correlation | always | `:50, :119` | Pulled from `RequestContext.currentRequestId()` (AsyncLocalStorage), exposed via `X-Request-Id` response header (listed in `main.ts:51` CORS `exposedHeaders`) |

**Observability gap**: client errors (400/401/403/404/409/429) are NOT logged AT ALL by this filter and NO per-status metric is incremented. The only 4xx visibility is via the global HTTP interceptor metrics (outside this filter's scope).

## h) Known Error Codes Surfaced (cross-referenced)
Sampled via grep across codebase:

**Generic (from `STATUS_TO_CODE` fallback)**: `VALIDATION_ERROR`, `UNAUTHORIZED`, `INSUFFICIENT_CREDITS`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `EXPIRED`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `UNKNOWN_ERROR`.

**Domain-specific (thrown explicitly with `code`)**:
| Code | Source |
|------|--------|
| `MISSING_CV` | `agents/job-hunter/manifest.ts:310` |
| `INSUFFICIENT_CREDITS` | `auth/guards/api-key-credit.guard.ts:57` |
| `RATE_LIMITED` | `usage-tracking/guards/usage-rate-limit.guard.ts:90` |
| `UNKNOWN_AGENT` | `agents/guards/agent-type-validation.guard.ts:24` |
| `CONCURRENT_GENERATION_LIMIT` | filter spec:248 (409) |
| `UNRECOVERABLE_ERROR` | queue processors |
| `JOB_FAILED` | queue processors |
| `GEMINI_CLI_RATE_LIMIT` | `agents/b2b-sales/workflow` |
| `AI_QUOTA_EXHAUSTED` | `upload/blueprint.ts:96` |
| `PHASE_BOUNDS_EXCEEDED` | agents orchestration spec |
| `INSUFFICIENT_SCOPE` | `referral/blueprint.ts:34,84,136` |

**Forwarded domain fields** (observed on `error.*` alongside `code`): `usedCredits`, `monthlyLimit`, `resetsAt`, `retryAfter`, `retryAfterMs`, `generationId` (for `CONCURRENT_GENERATION_LIMIT`).

## i) Chrome Extension Client Implications
1. **Always switch on `error.code`** — stable and enum-like. `error.message` is i18n-prone and subject to refactor. `error.hint` is dev-aid text and may change freely.
2. **Read `requestId` from envelope root** — `body.requestId`, NOT `body.error.requestId`. Use in support tickets for server-side log correlation.
3. **Envelope divergence checklist** — extension JSON fetch layer must handle these non-envelope cases:
   - SSE streams (`text/event-stream`) — no envelope, parse as event stream
   - File downloads (`application/octet-stream`, `application/pdf`, etc.) — raw bytes
   - 204 No Content — empty body
   - 429 from `/agents/*/...` — raw unknown shape; treat as opaque but honor `Retry-After` header
4. **`Retry-After` header**: present on all 429s (native from `ThrottlerGuard` OR fallback at `:137-140`). Value is seconds, not ms. Prefer header over `error.retryAfter` body field if both present.
5. **`error.details` shape on 400**:
   - Zod origin: `ZodError.flatten()` output — `{ formErrors: string[], fieldErrors: Record<string, string[]> }`
   - non-Zod 400: arbitrary `responseObj.errors ?? responseObj.details` (usually `string[]` from NestJS ValidationPipe or `ZodError.flatten()` output)
   - Treat as `unknown` and feature-detect before rendering.
6. **No `data` key on errors**; no `error` key on success; no `path` key on success. Discriminate on `success: boolean` literal, never on presence/absence of sub-keys.
7. **Unmapped statuses fall to `UNKNOWN_ERROR`**: if the extension encounters `error.code === 'UNKNOWN_ERROR'`, log the raw HTTP status separately — the code alone is insufficient for routing.
8. **Domain fields are flat on `error`, not namespaced**: e.g. `error.usedCredits` / `error.monthlyLimit` for 402. Defensive parsing required — don't assume presence.

## j) Source References
- `api/src/common/filters/api-exception.filter.ts` (194 lines, full file)
- `api/src/common/filters/rate-limit-exception.filter.ts` (33 lines, full file)
- `api/src/common/interceptors/response-transform.interceptor.ts` (71 lines, full file)
- `api/src/main.ts:12, :92` (global filter registration), `:103, :150-234` (Swagger envelope schemas)
- `api/src/app.module.ts:11, :109` (`ResponseTransformInterceptor` global registration as `APP_INTERCEPTOR`)
- `api/src/modules/agents/unified-agent.controller.ts:15, :47` (sole `RateLimitExceptionFilter` consumer)

## k) Open Risks (flagged for extension PR)
- **BLUEPRINT DRIFT**: `RateLimitExceptionFilter` producing unwrapped 429 bodies on agent endpoints contradicts the unified error envelope contract declared in `main.ts:103` Swagger description. Either filter should be rewritten to emit the full envelope, OR removed in favor of having throwers set `retryAfter` on the body (which `ApiExceptionFilter` already handles at `:137-140`). Extension must handle both shapes until resolved.
- **Leak surface**: filter forwards arbitrary non-blocklisted keys from HttpException body into `error.*`. Any thrower passing `stack`, `cause`, `sql`, or internal context fields leaks them to client in production. Recommend allowlist instead of blocklist.
- **No 4xx telemetry**: no metric/log on client errors blocks debugging of extension authentication failures. Extension should log `requestId` + `code` locally for support workflows.
