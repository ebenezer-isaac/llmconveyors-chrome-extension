# Agent 12 — Interact Endpoint Investigation

## a) Exact method + path
- `POST /agents/:agentType/interact`
  - Controller base path: `@Controller('agents/:agentType')` at `api/src/modules/agents/unified-agent.controller.ts:44`
  - Handler: `@Post('interact')` at `api/src/modules/agents/unified-agent.controller.ts:103`
  - HTTP status on success: `202 Accepted` — `@HttpCode(HttpStatus.ACCEPTED)` at `unified-agent.controller.ts:104`
  - Delegates to `orchestrationService.orchestrateInteract(agentType, user, rawBody)` at `unified-agent.controller.ts:122`

## b) Guards + scope
- Class-level: `@UseGuards(AuthGuard, ScopeGuard)` at `unified-agent.controller.ts:45`
- Method-level: `@UseGuards(ApiKeyCreditGuard, UsageRateLimitGuard)` at `unified-agent.controller.ts:105`
- Full chain: `AuthGuard` → `ScopeGuard` → `ApiKeyCreditGuard` → `UsageRateLimitGuard`
- Required scope: sales:write / jobs:write (agent-specific, enforced by `ScopeGuard` via manifest; not hardcoded per method)
- Agent type validated as one of `AGENT_TYPES` — `unified-agent.controller.ts:19, 107`

## c) InteractRequestSchema fields
Defined at `libs/shared-types/src/schemas/agent-api.schema.ts:79-86`:
- `generationId: z.string().min(1)` — Generation ID from Phase A (`agent-api.schema.ts:80`)
- `sessionId: z.string().min(1)` — Session ID from the original generation (`agent-api.schema.ts:81`)
- `interactionType: z.string().min(1)` — Discriminator identifying interaction type (`agent-api.schema.ts:83`)
- `interactionData: z.record(z.unknown())` — Agent-specific interaction data keyed by field name (`agent-api.schema.ts:85`)

## d) Known interactionType values (grepped)
Three values defined in the gate schema registry at `libs/shared-types/src/schemas/interaction.schema.ts:90-94` (`GATE_DATA_SCHEMAS`):
1. `contact_selection` — `interaction.schema.ts:91`
2. `email_content_confirmation` — `interaction.schema.ts:92`
3. `followup_content_confirmation` — `interaction.schema.ts:93`

Additional handling branch in orchestrator at `agent-orchestration.service.ts:998` (`interactionType === 'contact_selection'`). Frontend `actions.ts:361` and `actions.test.ts:387-462` reference `contact_selection`. No occurrences of `draft_approval` found in the codebase — use `email_content_confirmation` instead.

## e) Shape of interactionData for contact_selection
Two shapes depending on direction:

**Request (user submits) — `B2BContactSelectionDataSchema`** at `libs/shared-types/src/schemas/agent-api.schema.ts:93-95`:
- `selectedContactIds: z.array(z.string().min(1)).min(1).max(20)`

Also defined as `B2BSalesContactSelectionSchema` at `interaction.schema.ts:15-17` (same shape).

**Server-to-client (gate data) — `ContactSelectionGateDataSchema`** at `interaction.schema.ts:77-84`:
- `candidates: z.array(ContactCandidateSchema).min(1)`
- `recommendedTargetId: z.string().optional()`
- `recommendedCcId: z.string().optional()`
- `companyName: z.string().optional()`
- `jobTitle: z.string().optional()`
- `lockedTargetId: z.string().optional()`

Orchestrator extracts `userInput.selectedContactIds` and emits `CONTACT_SELECTED` event at `agent-orchestration.service.ts:998-1009`.

## f) Shape for draft_approval
No `draft_approval` type exists. Closest equivalents:

**`email_content_confirmation` (initial draft)** — `B2BEmailContentConfirmationDataSchema` at `agent-api.schema.ts:98-103`:
- `action: z.enum(['approve', 'regenerate'])`
- `subject: z.string().max(500).optional()`
- `body: z.string().max(50_000).optional()`
- `feedback: z.string().max(2000).optional()`

**`followup_content_confirmation` (follow-up)** — `B2BFollowupContentConfirmationDataSchema` at `agent-api.schema.ts:106-112`:
- `action: z.enum(['approve', 'regenerate'])`
- `subject: z.string().max(500).optional()`
- `body: z.string().max(50_000).optional()`
- `feedback: z.string().max(2000).optional()`
- `sequenceNumber: z.number().int().min(1).max(3)`

Near-duplicates also defined at `interaction.schema.ts:23-48` (`B2BSalesEmailConfirmationSchema` / `B2BSalesFollowupConfirmationSchema`) with `feedback.max(1000)` instead of 2000.

## g) InteractResponseSchema fields
Defined at `libs/shared-types/src/schemas/agent-api.schema.ts:62-70`:
- `success: z.boolean()` — whether the interaction was accepted (`agent-api.schema.ts:63`)
- `jobId: z.string().optional()` — new job ID for resumed phase, doubles as BullMQ job ID (`agent-api.schema.ts:64`)
- `streamUrl: z.string().min(1).optional()` — SSE stream URL for next phase (`agent-api.schema.ts:65`)
- `status: ...optional()` — (line 66-68, resolved status)
- `phase: z.number().int().min(0).optional()` — final phase index when status is `completed` (`agent-api.schema.ts:69`)

## h) Not in awaiting_input state
- Throws `ConflictException` with HTTP `409` — `agent-orchestration.service.ts:984-989`
- Body: `{ code: 'CONFLICT', message: 'Generation <id> is not awaiting input (status: <actual>)' }`
- Also declared in OpenAPI: `@ApiResponse({ status: 409, description: 'Generation not awaiting input or already resumed' })` at `unified-agent.controller.ts:114`

**Adjacent error shapes:**
- `404` — generation not found (`agent-orchestration.service.ts:962`, controller line 113)
- `403` — access denied (`agent-orchestration.service.ts:978-982`)
- `410 Gone` — `GoneException` if `phaseDoc.expiresAt < now` with code `EXPIRED` (`agent-orchestration.service.ts:991-995`; controller line 115)
- `402` — insufficient credits for Phase B (controller line 111)
- `400` — validation error (controller line 109)
- `401` — unauthorized (controller line 110)

## i) Rate limit override
- `@Throttle({ default: { ttl: 60000, limit: 10 } })` at `unified-agent.controller.ts:102`
- Effective limit: **10 requests per 60 seconds** (per authenticated identity)
- Additional per-user usage rate-limiting applied by `UsageRateLimitGuard` (`unified-agent.controller.ts:105`)

## j) Filter applied
`@UseFilters(RateLimitExceptionFilter)` IS applied at the class level at `unified-agent.controller.ts:47`, so it covers the `interact` method (and all other routes on this controller). Imported at line 15 from `../../common/filters/rate-limit-exception.filter`. This filter translates Nest throttler `ThrottlerException`s to a structured 429 response for rate-limit overruns on the `@Throttle({ default: { ttl: 60000, limit: 10 } })` decorator at line 102.

## k) Request/Response summary (definitive)

**Endpoint:** `POST /agents/:agentType/interact`
- `agentType` param must be one of `'job-hunter' | 'b2b-sales'` (`AGENT_TYPES` at `agent-api.schema.ts:16`).
- Success HTTP status: `202 Accepted` (`unified-agent.controller.ts:104`).
- Delegates to `AgentOrchestrationService.orchestrateInteract(agentType, user, rawBody)` (`unified-agent.controller.ts:122`).

**Request body (`InteractRequestSchema`, `agent-api.schema.ts:79-86`):**
```ts
{
  generationId: string (min 1),      // Generation ID from Phase A
  sessionId:    string (min 1),      // Session ID from the original generation
  interactionType: string (min 1),   // Discriminator (e.g., 'contact_selection')
  interactionData: Record<string, unknown>  // Shape depends on interactionType
}
```

**Response body (`InteractResponseSchema`, `agent-api.schema.ts:62-70`):**
```ts
{
  success:      boolean,                    // Whether the interaction was accepted
  jobId?:       string,                     // New BullMQ job ID for the resumed phase
  streamUrl?:   string (min 1),             // SSE stream URL for the next phase
  generationId?: string,                    // Present on terminal-completion responses
  sessionId?:   string,                     // Present on terminal-completion responses
  status?:      string,                     // e.g. 'completed' when no new phase was started
  phase?:       number (int, min 0)         // Final phase index when status='completed'
}
```

## l) interactionType values (definitive, grepped)

The gate registry `GATE_DATA_SCHEMAS` at `libs/shared-types/src/schemas/interaction.schema.ts:90-94` enumerates exactly three values. These are the canonical set — no `draft_approval` exists anywhere in the codebase.

| `interactionType`               | Direction      | Gate (when emitted)                          | Runtime handling                                        |
|---------------------------------|----------------|----------------------------------------------|---------------------------------------------------------|
| `contact_selection`             | Phase A -> B   | After discovery, before enrichment (B2B + JH cold-outreach) | Handled inline in `orchestrateInteract` at `agent-orchestration.service.ts:998-1021` (emits `CONTACT_SELECTED.<generationId>`) |
| `email_content_confirmation`    | Phase C gate   | After draft is generated, before send (B2B + JH cold-outreach) | Handled by workflow resume path (same `orchestrateInteract`, non-`contact_selection` branch) |
| `followup_content_confirmation` | Phase D/E gate | After each follow-up draft, before send (B2B) | Same workflow resume path; `sequenceNumber` disambiguates FU #1 vs FU #2 |

The `draft_approval` name used in some downstream plans is NOT a real interactionType — always use `email_content_confirmation` for initial draft review, `followup_content_confirmation` for follow-ups.

## m) Per-type `interactionData` shapes (request direction = user -> server)

**`contact_selection`** (`B2BContactSelectionDataSchema` at `agent-api.schema.ts:93-95`):
```ts
{ selectedContactIds: string[] (min 1, max 20) }
```
- First element becomes `targetContactId`; second (or first if length=1) becomes `ccContactId` (`agent-orchestration.service.ts:1004-1005`).

**`email_content_confirmation`** (`B2BEmailContentConfirmationDataSchema` at `agent-api.schema.ts:98-103`):
```ts
{
  action:    'approve' | 'regenerate',
  subject?:  string (max 500),
  body?:     string (max 50_000),
  feedback?: string (max 2000)
}
```

**`followup_content_confirmation`** (`B2BFollowupContentConfirmationDataSchema` at `agent-api.schema.ts:106-112`):
```ts
{
  action:         'approve' | 'regenerate',
  subject?:       string (max 500),
  body?:          string (max 50_000),
  feedback?:      string (max 2000),
  sequenceNumber: number (int, 1..3)   // REQUIRED
}
```

Near-duplicate schemas at `interaction.schema.ts:23-48` (`B2BSalesEmailConfirmationSchema` / `B2BSalesFollowupConfirmationSchema`) have `feedback.max(1000)` instead of 2000 — the `agent-api.schema.ts` versions are the ones consumed by the HTTP endpoint via `InteractRequestDto`, so use those bounds as the authoritative client-side limits.

## n) Error handling when NOT in `awaiting_input`

Exactly one ordered check inside `orchestrateInteract` produces the `409`. Source: `agent-orchestration.service.ts:984-989`:
```ts
if (phaseDoc.status !== 'awaiting_input') {
  throw new ConflictException({
    code: 'CONFLICT',
    message: `Generation ${generationId} is not awaiting input (status: ${phaseDoc.status})`,
  });
}
```
Nest maps `ConflictException` -> HTTP `409`. Response body:
```json
{ "statusCode": 409, "code": "CONFLICT", "message": "Generation <id> is not awaiting input (status: <actual>)" }
```
Declared in OpenAPI at `unified-agent.controller.ts:114`:
`@ApiResponse({ status: 409, description: 'Generation not awaiting input or already resumed' })`.

Adjacent error responses (declared on the controller, thrown in the orchestrator):
| HTTP | Exception            | Condition                                                | Source                                          |
|------|----------------------|----------------------------------------------------------|-------------------------------------------------|
| 400  | ZodValidationPipe    | Request body fails `InteractRequestSchema.parse`         | `unified-agent.controller.ts:109`               |
| 401  | AuthGuard            | Missing/invalid SuperTokens session or API key           | `unified-agent.controller.ts:110`               |
| 402  | ApiKeyCreditGuard    | Insufficient credits for Phase B                         | `unified-agent.controller.ts:111`               |
| 403  | ForbiddenException   | `phaseDoc.userId !== user.uid` (IDOR guard)              | `agent-orchestration.service.ts:977-982`        |
| 404  | NotFoundException    | `PhaseQueryGetEvent` returned no doc for `generationId`  | `agent-orchestration.service.ts:961-966`        |
| 409  | ConflictException    | `phaseDoc.status !== 'awaiting_input'`                   | `agent-orchestration.service.ts:984-989`        |
| 410  | GoneException        | `phaseDoc.expiresAt < now` (24h phased-resume window)    | `agent-orchestration.service.ts:991-995`        |
| 429  | ThrottlerException   | Rate-limit breach (translated by `RateLimitExceptionFilter`) | `unified-agent.controller.ts:47, 102`          |

## o) Rate limit (definitive)

- Decorator: `@Throttle({ default: { ttl: 60000, limit: 10 } })` at `unified-agent.controller.ts:102`.
- Effective: **10 requests / 60 000 ms = 10 per minute** per throttler-key identity (IP for anonymous, auth subject for authenticated — resolved by Nest throttler's default tracker using `req.ips[0] ?? req.ip`).
- Exception translation: `RateLimitExceptionFilter` at `unified-agent.controller.ts:47` emits a structured 429.
- Stacked ceiling: `UsageRateLimitGuard` (`unified-agent.controller.ts:105`) enforces per-user usage-plan limits on top of the throttle.

## Confidence
Confidence: 100%
Filename: e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\12-interact-endpoint.md
