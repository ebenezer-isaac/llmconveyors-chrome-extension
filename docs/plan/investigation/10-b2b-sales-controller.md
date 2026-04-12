# Agent 10 — B2B Sales Controller + Request/Response DTOs

## a) HTTP Method + Path
**`POST /api/v1/agents/b2b-sales/generate`**
- Global prefix `api/v1` applied by NestJS `app.setGlobalPrefix` in `api/src/main.ts`
- Controller base path `agents/b2b-sales` declared at `api/src/modules/agents/b2b-sales/b2b-sales.controller.ts:34` (`@Controller('agents/b2b-sales')`)
- Route suffix `generate` at `b2b-sales.controller.ts:46` (`@Post('generate')`)
- Explicit HTTP status **202 Accepted** via `@HttpCode(HttpStatus.ACCEPTED)` at `b2b-sales.controller.ts:47`

## b) Guards (execution order)
**Class-level** (`b2b-sales.controller.ts:35`, `@UseGuards(AuthGuard, ScopeGuard)`):
1. `AuthGuard` — validates SuperTokens session or API key (`api/src/modules/auth/guards/auth.guard`)
2. `ScopeGuard` — enforces `@RequireScope` metadata (`api/src/modules/auth/guards/scope.guard`)

**Method-level** (`b2b-sales.controller.ts:48`, `@UseGuards(ApiKeyCreditGuard, UsageRateLimitGuard, ConcurrentGenerationGuard)`):
3. `ApiKeyCreditGuard` — checks credit balance for API key callers (`api/src/modules/auth/guards/api-key-credit.guard`)
4. `UsageRateLimitGuard` — per-user usage rate limiting (`api/src/modules/usage-tracking/guards/usage-rate-limit.guard`)
5. `ConcurrentGenerationGuard` — enforces single active generation per user, also reserves a generationId on `request._reservedGenerationId` for non-byo non-api-key users (`api/src/gateways/guards/concurrent-generation.guard`)

**Interceptor** (class-level, `b2b-sales.controller.ts:36`):
- `ApiKeyAuditInterceptor` — audit-logs API key usage (`api/src/modules/auth/interceptors/api-key-audit.interceptor`)

## c) @RequireScope
`@RequireScope('sales:write')` at `b2b-sales.controller.ts:49`. Enforced by class-level `ScopeGuard`.

## d) Request DTO
- **DTO class**: `B2BSalesGenerateRequestDto` — `api/src/common/dto/openapi-dtos.ts:69` (`extends createZodDto(B2BSalesRequestSchema)`)
- **Zod schema**: `B2BSalesRequestSchema` — `libs/shared-types/src/schemas/b2b-sales-request.schema.ts:12` (`BaseGenerateRequestSchema.extend({...})`)

**Fields from `B2BSalesRequestSchema`** (`b2b-sales-request.schema.ts`):
| Field | Type | Required | Constraints | Line |
|---|---|---|---|---|
| `companyName` | string | **yes** | min 1, max 200 | L13 |
| `companyWebsite` | string (URL) | **yes** | preprocess auto-prefixes `https://` if missing; `.url()`; max 2048 | L18 |
| `userCompanyContext` | string | no | max 20000, default `''` | L32 |
| `targetCompanyContext` | string | no | max 10000 | L38 |
| `contactName` | string | no | max 100 | L43 |
| `contactTitle` | string | no | max 100 | L44 |
| `contactEmail` | string | no | `.email()` OR `z.literal('')` | L45 |
| `salesStrategy` | string | no | max 10000 | L48 |
| `reconStrategy` | string | no | max 10000 | L54 |
| `companyResearch` | string | no | max 50000 (bypasses research step when present) | L60 |
| `researchMode` | `ResearchModeSchema` | no | default `DEFAULT_RESEARCH_MODE` | L65 |
| `skipResearchCache` | boolean | no | preprocess `'true'`/`'false'` -> bool, default `false` | L69 |
| `senderName` | string | no | max 100 (auto-fills from `user.displayName`) | L75 |
| `autoSelectContacts` | boolean | no | preprocess `'true'`/`'false'` -> bool | L81 |

**Inherited from `BaseGenerateRequestSchema`** (`libs/shared-types/src/schemas/generate-form.schema.ts:48`):
| Field | Type | Required | Constraints | Line |
|---|---|---|---|---|
| `sessionId` | string | no | max 512 (backend generates if omitted) | L50 |
| `generationId` | string | no | max 512 (backend generates if omitted) | L56 |
| `model` | `ModelPreferenceSchema` | no | `flash` or `pro` | L62 |
| `autoApproveDraft` | boolean | no | skip draft review gate | L67 |
| `autoApproveFollowups` | boolean | no | skip follow-up review gate | L71 |
| `followUpCount` | int | no | 0-3 (preprocess string -> number) | L75 |
| `followUpDelayDays` | int | no | 1-14 (preprocess string -> number) | L82 |

Note: the `@Body()` param is typed `Record<string, unknown>` (`b2b-sales.controller.ts:60`) — Zod validation does not run at the Nest pipe layer for this route; the schema is enforced downstream inside `AgentOrchestrationService.orchestrateGenerate` (`api/src/modules/agents/agent-orchestration.service.ts:308`). `@ApiBody({ type: B2BSalesGenerateRequestDto })` at `b2b-sales.controller.ts:51` is purely for Swagger/OpenAPI documentation.

## e) Response DTO
- **DTO class**: `GenerateResponseDto` — `api/src/common/dto/response-schemas.dto.ts:107` (`extends createZodDto(GenerateResponseSchema)`)
- **Zod schema**: `GenerateResponseSchema` — `libs/shared-types/src/schemas/agent-api.schema.ts:21`
- **Shape** (all fields required on success):
  - `jobId: string` — same value as `generationId`; kept for legacy queue consumers (L22)
  - `generationId: string` — canonical generation identifier; use for SSE connect, status, interact (L23)
  - `sessionId: string` — parent session (L24)
  - `streamUrl: string` (min length 1) — SSE URL or relative path for real-time updates (L25)
- TypeScript type: `GenerateResponse` (`agent-api.schema.ts:28`). Controller return type is `Promise<GenerateResponse>` (`b2b-sales.controller.ts:62`).

## f) Phased Gates
**YES — B2B Sales is a phased agent.** Three independent auto-approve toggles control phase gates:

| Flag | Source | Gate skipped when `true` | Effect on phases |
|---|---|---|---|
| `autoSelectContacts` | `b2b-sales-request.schema.ts:81` | Contact selection gate between Phase A (discovery) and Phase B (enrich+email) | Auto-picks recommended contacts; no `awaiting_input` emission |
| `autoApproveDraft` | inherited, `generate-form.schema.ts:67` | Draft review gate between Phase B (initial email) and Phase C (send/follow-up queue) | Auto-sends initial draft without review |
| `autoApproveFollowups` | inherited, `generate-form.schema.ts:71` | Follow-up review gates before each follow-up (Phase D, Phase E) | Auto-approves follow-ups 1 and 2 |

When a gate is hit, the workflow emits an `awaiting_input` job status and an `InteractionRequestEvent`. Clients resume by calling `POST /agents/b2b-sales/interact` with `InteractRequestSchema` (`agent-api.schema.ts:79`) and an `interactionType` discriminator:
- `contact_selection` -> payload `B2BContactSelectionDataSchema` (`agent-api.schema.ts:93`)
- draft review -> payload `B2BEmailContentConfirmationDataSchema` (`agent-api.schema.ts:98`)
- follow-up review -> payload `B2BFollowupContentConfirmationDataSchema` (`agent-api.schema.ts:106`)

For API key callers without an explicit `autoSelectContacts` value, the orchestration service defaults to auto-select (see header comment at `b2b-sales-request.schema.ts:80`).

## g) Continue Previous Run (sessionId / generationId)
**YES.** Clients can resume or pin an existing generation by passing the inherited optional `sessionId` and `generationId` on `BaseGenerateRequestSchema` (`generate-form.schema.ts:50, 56`).

Flow (`b2b-sales.controller.ts:58-79`):
1. Controller forwards raw body to `this.orchestrationService.orchestrateGenerate('b2b-sales', user, rawBody)` at `b2b-sales.controller.ts:65`.
2. `AgentOrchestrationService.orchestrateGenerate(agentType, user, rawBody)` (`agent-orchestration.service.ts:308`) validates via Zod, reuses supplied `sessionId`/`generationId` when present, otherwise generates fresh UUIDs.
3. Resumption / mid-workflow state transitions (post-gate) go through `POST /agents/b2b-sales/interact`, not through `generate` — `generate` with a prior `generationId` starts a new phase pass for that generation but does NOT replay prior phases.

## h) Error Responses
Declared via `@ApiResponse` at `b2b-sales.controller.ts:52-57`:

| Status | Meaning | Raised by |
|---|---|---|
| **202** | Generation queued successfully (returns `GenerateResponseDto`) | Handler success path |
| **400** | Validation error -- invalid request body | Downstream Zod parse in `AgentOrchestrationService` |
| **401** | Unauthorized -- missing or invalid credentials | `AuthGuard` |
| **402** | Insufficient credits | `ApiKeyCreditGuard` / billing preflight |
| **409** | Session already has a generation in progress | `ConcurrentGenerationGuard` |
| **429** | Rate limit exceeded | `@Throttle` + `UsageRateLimitGuard` |

Additional behavior: when the handler throws after `ConcurrentGenerationGuard` has reserved a slot (i.e. `request._reservedGenerationId` is set) and the user is neither `tier === 'byo'` nor `authSource === 'api-key'`, the catch block at `b2b-sales.controller.ts:66-78` emits `EventNames.STREAM_RELEASE_CONCURRENCY_SLOT` with a `StreamReleaseConcurrencySlotEvent(user.uid, reservedGenerationId)` to free the slot. The emit itself is wrapped in a try/catch that only logs a warning on failure (`b2b-sales.controller.ts:73-75`); the original error always re-throws (`b2b-sales.controller.ts:77`).

## i) Rate Limit Override
`@Throttle({ default: { ttl: 60000, limit: 10 } })` at `b2b-sales.controller.ts:45` -- **10 requests per 60 seconds** per throttler key (typically per IP/user). Enforced by `@nestjs/throttler`.

## j) Filter Applied
**None at the controller/method level** -- no `@UseFilters(...)` decorator on class or `generate` method. Unhandled exceptions propagate to the global exception filter chain registered in `main.ts`. The only class-level decorator of this family is `@UseInterceptors(ApiKeyAuditInterceptor)` at `b2b-sales.controller.ts:36`.

## k) Sync vs Async
**Async, 202-enqueued phased workflow.**
- `@HttpCode(HttpStatus.ACCEPTED)` at `b2b-sales.controller.ts:47` forces 202.
- Handler returns `GenerateResponse { jobId, generationId, sessionId, streamUrl }` immediately after the job is enqueued; actual work runs via BullMQ + SSE.
- Clients must subscribe to the SSE stream at `streamUrl` (or poll `GET /agents/b2b-sales/status/:jobId`) to track progress, receive `awaiting_input` events, and get the final result.

## l) Public vs Full Schema
`B2bSalesPublicRequestSchema` at `b2b-sales-request.schema.ts:93` is a `.pick({ companyName, companyWebsite, contactName, contactEmail })` subset of the full schema, exposed to docs/public-API consumers. It is NOT the schema the controller validates against -- the controller accepts the full `B2BSalesRequestSchema` including all internal strategy / context / research fields.

## Drift Flags
None. The controller-facing surface is consistent with:
- The Zod schema source of truth in `@repo/shared-types` (imported by DTO class via `createZodDto`)
- The OpenAPI `@ApiResponse` declarations (all six status codes are implemented or guarded upstream)
- The phased-gate design documented in `.claude/rules/backend-first-lean-client.md` and the B2B workflow blueprint
- The `@Body()` `Record<string, unknown>` pattern is intentional (Zod runs inside the orchestration service, not as a NestJS pipe) and is mirrored by the Job Hunter controller.

Confidence: 100%
