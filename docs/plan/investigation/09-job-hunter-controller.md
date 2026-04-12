# 09 — Job Hunter Controller + DTOs

Source: `api/src/modules/agents/job-hunter/job-hunter.controller.ts` (193 lines, fully re-read)
Cross-refs read: `libs/shared-types/src/schemas/generate-form.schema.ts`, `libs/shared-types/src/schemas/agent-api.schema.ts`, `libs/shared-types/src/schemas/resume-api.schema.ts`, `libs/shared-types/src/schemas/api-response.schema.ts`, `api/src/common/dto/openapi-dtos.ts`, `api/src/common/dto/response-schemas.dto.ts`, `api/src/common/dto/index.ts`, `api/src/main.ts`, `api/src/modules/agents/agent-orchestration.service.ts` (orchestrateGenerate signature).

## a) Start Job Hunter run — HTTP method + path

- **`POST /api/v1/agents/job-hunter/generate`** (DEFINITIVE)
- Controller prefix `@Controller('agents/job-hunter')` at line 47.
- Method `@Post('generate')` at line 69.
- Global prefix `api/v1` set via `app.setGlobalPrefix(NESTJS_GLOBAL_PREFIX, { exclude: ['/metrics'] })` at `api/src/main.ts:87-89`. `NESTJS_GLOBAL_PREFIX = 'api/v1'` (imported from `@repo/shared-types`).
- `@HttpCode(HttpStatus.ACCEPTED)` (202) at line 70 — DEFINITIVE: success returns HTTP **202 Accepted**.

## b) Guards (order of application)

Class-level (line 48): `@UseGuards(AuthGuard, ScopeGuard)`
Method-level (line 71): `@UseGuards(ApiKeyCreditGuard, UsageRateLimitGuard, ConcurrentGenerationGuard)`

Effective order on `POST generate`: `AuthGuard` -> `ScopeGuard` -> `ApiKeyCreditGuard` -> `UsageRateLimitGuard` -> `ConcurrentGenerationGuard`.

## c) Required scope

`@RequireScope('jobs:write')` at line 72.

## d) Request DTO

- DTO class: `JHGenerateRequestDto` (`api/src/common/dto/openapi-dtos.ts:68`), wraps `GenerateFormSchema` via `createZodDto`.
- Zod schema: `GenerateFormSchema` at `libs/shared-types/src/schemas/generate-form.schema.ts:104`, extends `BaseGenerateRequestSchema` (line 48).

Required fields (no default, not optional):
- `companyName` string, 1..512 (line 128)
- `jobTitle` string, 1..512 (line 133)
- `companyWebsite` string URL, <=2048, auto-prefixes `https://` (line 138)

Defaulted (effectively optional on wire):
- `jobDescription` string <=50KB, default `''` (line 106)
- `mode` enum `standard|cold_outreach`, default `standard` (line 170)

Optional (Base, line 48-88):
- `sessionId` string <=512
- `generationId` string <=512
- `model` (`ModelPreferenceSchema`: flash|pro)
- `autoApproveDraft` boolean
- `autoApproveFollowups` boolean
- `followUpCount` int 0..3 (string coerced)
- `followUpDelayDays` int 1..14 (string coerced)

Optional (JH-specific, lines 112-185):
- `originalCV`, `extensiveCV`, `cvStrategy`, `coverLetterStrategy`, `coldEmailStrategy`, `reconStrategy`, `companyProfile`, `emailAddresses` — all strings <=50KB
- `contactName`, `contactTitle` strings <=512
- `contactEmail`, `genericEmail` email or empty literal
- `jobSourceUrl` URL or empty literal
- `theme` enum from `ALLOWED_THEMES`
- `autoSelectContacts` boolean (string coerced)
- `skipResearchCache` boolean (string coerced)

Note: controller receives `@Body() rawBody: Record<string, unknown>` (line 83) — validation is NOT applied via `ZodValidationPipe` on this route; `orchestrationService.orchestrateGenerate` validates internally. The DTO is attached via `@ApiBody({ type: JHGenerateRequestDto })` (line 74) for OpenAPI only.

## e) Response DTO

- `GenerateResponseDto` wraps `GenerateResponseSchema` at `libs/shared-types/src/schemas/agent-api.schema.ts:21-26`.
- Registered via `createZodDto` at `api/src/common/dto/response-schemas.dto.ts:107`.
- Return type annotation on controller method: `Promise<GenerateResponse>` (line 85, type imported from `@repo/shared-types` at line 18).
- **Raw controller return shape (inside response envelope):**
  ```
  {
    jobId: string,        // same value as generationId — SSOT field is generationId
    generationId: string, // used for SSE + status + interact
    sessionId: string,
    streamUrl: string     // min length 1 — SSE stream URL (relative path or absolute)
  }
  ```
- **Wire response shape** (global envelope applied by `ApiExceptionFilter` / response interceptor per `main.ts:192-204`):
  ```
  {
    success: true,
    data: { jobId, generationId, sessionId, streamUrl },
    requestId: string,
    timestamp: string  // ISO-8601
  }
  ```
- Declared HTTP status **202** (line 75: `@ApiResponse({ status: 202, ... })`) + enforced via `@HttpCode(HttpStatus.ACCEPTED)` (line 70).

## f) Separate "generate CV" endpoint

**YES — `POST /api/v1/agents/job-hunter/generate-cv`** (DEFINITIVE, declared at line 111).

**Guards (effective order):** `AuthGuard` -> `ScopeGuard` (class-level, line 48). NO method-level `ApiKeyCreditGuard`, `UsageRateLimitGuard`, or `ConcurrentGenerationGuard` (those are only on `generate`). Billing is handled IN-LINE via `billingService.reserveCredits` / `confirmReservation` / `releaseReservation` at lines 130-171.

**Scope:** `@RequireScope('jobs:write')` (line 112).

**Throttle:** none (no `@Throttle` decorator — subject only to the global default throttler).

**HTTP status:**
- NO `@HttpCode(...)` decorator on `generateCv`.
- NestJS default for `@Post()` without `@HttpCode` is **HTTP 201 Created**.
- `@ApiResponse({ status: 200, ... })` at line 114 is **documentation drift** — Swagger says 200, runtime emits 201. (This is a pre-existing bug; flag only, out of scope for plan 100.)

**Request DTO:**
- `GenerateCvRequestDto` (openapi-dtos.ts:40) wrapping `GenerateCvRequestSchema` at `libs/shared-types/src/schemas/resume-api.schema.ts:6-8`.
- Strict Zod object (`.strict()`): `{ prompt: string, trimmed, min 1, max 50_000 }`. Unknown keys rejected.
- Validation: `@Body(new ZodValidationPipe(GenerateCvRequestSchema))` at line 121 — real-time synchronous validation (unlike `generate` which defers to the service).

**Response DTO:**
- `GenerateCvResponseDto` (response-schemas.dto.ts:153) wrapping `GenerateCvResponseSchema` at `libs/shared-types/src/schemas/api-response.schema.ts:123-128`:
  ```
  {
    resume: unknown,                  // the generated resume JSON
    usage?: Record<string, unknown>,  // optional token usage
    model: string,                    // e.g. "gemini-flash"
    warning?: string                  // optional warning from AI layer
  }
  ```
- Wrapped in the same `{ success, data, requestId, timestamp }` envelope at the wire.

**Execution:** synchronous — `ai.execute('cv-generation', body.prompt, ResumeAISchema, ...)` at line 138. No queue, no SSE.

## g) sessionId / generationId in body?

Accepted as optional body fields via `BaseGenerateRequestSchema` (lines 50, 56) — backend generates them when omitted. Doc comments line 47-59 confirm "auto-generated if omitted". The controller also reads `request._reservedGenerationId` from a prior middleware (line 86) for concurrency slot rollback on error (lines 90-99).

## h) Explicit error responses

**`POST /agents/job-hunter/generate`** — documented via `@ApiResponse` at lines 76-80:
| Status | Meaning | Source |
|--------|---------|--------|
| 400 | Validation error (bad request body) | `AgentOrchestrationService.orchestrateGenerate` line 317 (`manifest.inputSchema.safeParse(rawBody)`) — throws `BadRequestException` on failure. |
| 401 | Unauthorized (missing/invalid credentials) | `AuthGuard` |
| 402 | Insufficient credits | `ApiKeyCreditGuard` |
| 409 | Session already has a generation in progress | `ConcurrentGenerationGuard` |
| 429 | Rate limit exceeded | `@Throttle({ default: { ttl: 60000, limit: 10 } })` + `UsageRateLimitGuard` |

All errors flow through the global `ApiExceptionFilter` (`main.ts:92`) and are emitted in the standard `ErrorEnvelope` shape: `{ success: false, error: { code, message, hint?, details? }, requestId, timestamp, path }` (`main.ts:161-171`).

Controller itself does not `throw new HttpException(...)` directly — all throws originate in guards or `orchestrationService.orchestrateGenerate`. On catch (line 89-100) it emits `STREAM_RELEASE_CONCURRENCY_SLOT` (releasing the pre-reserved concurrency slot) ONLY when `user.tier !== 'byo'` AND `user.authSource !== 'api-key'`, then rethrows. The middleware that sets `request._reservedGenerationId` runs before `ConcurrentGenerationGuard`.

**`POST /agents/job-hunter/generate-cv`** — documented via `@ApiResponse` at lines 114-117:
| Status | Meaning |
|--------|---------|
| 200 (documented) / **201 runtime** | Success — see note in section (f) about doc drift |
| 400 | Missing or invalid `prompt` (ZodValidationPipe) |
| 401 | Unauthorized |
| 402 | Insufficient credits — thrown by `billingService.reserveCredits` when user has no balance (for non-byo tiers) |

No 409, no 429 explicitly documented for `generate-cv` (global throttler still applies by default).

## i) Rate limit override

`@Throttle({ default: { ttl: 60000, limit: 10 } })` on `generate` at line 68 — 10 req / 60s. No `@Throttle` on `generate-cv`.

## j) Filters

No `@UseFilters` on the controller or either method. Global exception filter applies.

## k) Enqueue model — sync vs 202/polling

- **`generate`** returns **HTTP 202 Accepted** (line 70, `@HttpCode(HttpStatus.ACCEPTED)`). The response body (inside the envelope) contains `{ jobId, generationId, sessionId, streamUrl }`. The client connects to `streamUrl` (SSE) for real-time progress — **no polling URL is returned**. Status can additionally be polled at `GET /api/v1/agents/:agentType/status/:jobId` (handled by `UnifiedAgentController`, not this controller). Actual enqueue is delegated to `AgentOrchestrationService.orchestrateGenerate` at line 88, which validates the body (line 317), persists the session/generation, and enqueues a BullMQ job.
- **`generate-cv`** is **synchronous** — executes `ai.execute('cv-generation', ...)` inline at line 138 and returns the resume JSON directly in the response body. No queue, no SSE, no status polling. HTTP code at runtime is **201 Created** (NestJS `@Post` default, no `@HttpCode` override) despite `@ApiResponse({ status: 200 })` documentation drift.

## Validation Pipeline Confirmation (resolved)

- **No global `ZodValidationPipe`** — `main.ts` calls `useGlobalFilters(new ApiExceptionFilter())` but does NOT call `useGlobalPipes(...)`. Validation is opt-in per-route.
- **`generate`** route: `@Body() rawBody: Record<string, unknown>` (line 83) — no pipe. Validation is enforced inside `AgentOrchestrationService.orchestrateGenerate` at line 317 via `manifest.inputSchema.safeParse(rawBody)`, where `manifest.inputSchema === GenerateFormSchema` for `job-hunter`. Failures become `BadRequestException` → 400.
- **`generate-cv`** route: `@Body(new ZodValidationPipe(GenerateCvRequestSchema)) body: GenerateCvRequest` (line 121) — synchronous validation at the pipe.

## Confidence: 100%

### Verified (end-to-end, line-by-line re-read)
- Exact route: `POST /api/v1/agents/job-hunter/generate` (controller.ts:47,69 + main.ts:87, NESTJS_GLOBAL_PREFIX='api/v1')
- Exact route: `POST /api/v1/agents/job-hunter/generate-cv` (controller.ts:47,111)
- HTTP success codes: 202 for `generate` (explicit `@HttpCode`), 201 for `generate-cv` (NestJS default, doc says 200)
- Guard chain for `generate`: AuthGuard -> ScopeGuard -> ApiKeyCreditGuard -> UsageRateLimitGuard -> ConcurrentGenerationGuard (class-level lines 48 + method-level line 71)
- Guard chain for `generate-cv`: AuthGuard -> ScopeGuard only (no method-level extras)
- Scope: `jobs:write` (both endpoints, lines 72 + 112)
- Request DTO `JHGenerateRequestDto` = `createZodDto(GenerateFormSchema)` at openapi-dtos.ts:68 — validated inside orchestrationService, not at the pipe
- Request DTO `GenerateCvRequestDto` = `createZodDto(GenerateCvRequestSchema)` at openapi-dtos.ts:40, strict `{ prompt: 1..50000 }`, validated via `ZodValidationPipe`
- `GenerateFormSchema` extends `BaseGenerateRequestSchema`: required = `companyName`, `jobTitle`, `companyWebsite`; defaulted = `jobDescription=''`, `mode='standard'`; all other fields optional
- Response DTO `GenerateResponseDto` = `createZodDto(GenerateResponseSchema)` → `{ jobId, generationId, sessionId, streamUrl }`
- Response DTO `GenerateCvResponseDto` = `createZodDto(GenerateCvResponseSchema)` → `{ resume: unknown, usage?, model: string, warning? }`
- All JSON responses wrapped by global envelope injection in main.ts:192-204 (`{ success, data, requestId, timestamp }`); errors use `ErrorEnvelope` shape
- Error responses: 400/401/402/409/429 for `generate`; 400/401/402 for `generate-cv`
- Throttle: `{ ttl: 60000, limit: 10 }` on `generate` only (line 68); global default on `generate-cv`
- No `@UseFilters` on controller/methods — global `ApiExceptionFilter` applies
- Orchestration delegation: `orchestrationService.orchestrateGenerate('job-hunter', user, rawBody)` at line 88, signature verified at agent-orchestration.service.ts:308-312
- Internal validation location verified: agent-orchestration.service.ts:317 uses `manifest.inputSchema.safeParse(rawBody)`
- `sessionId`/`generationId` optional in body, backend-generated — base-schema.ts:50,56 comments + field `.optional()`
- Concurrency slot release on error: skipped when `user.tier === 'byo' || user.authSource === 'api-key'` (line 90) — correct per design (api-key callers bypass per-user concurrency limits)
- Supplementary endpoints (status, interact) are NOT in this controller — they live in `UnifiedAgentController` at `/agents/:agentType/*` per class doc comment lines 36-43.
