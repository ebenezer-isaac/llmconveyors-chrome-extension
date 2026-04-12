# 15 — Settings Endpoints (profile, usage-summary, preferences, API keys, BYO/provider keys, webhook secret)

Source: `api/src/modules/settings/settings.controller.ts` (read in full, 342 lines)
Controller base path: `settings` (line 58). Global class-level guards `AuthGuard, ScopeGuard` + `ApiKeyAuditInterceptor` (lines 59-60). Every route inherits both guards — no `@Public()` or guard skip exists on any handler.

Response DTOs all resolve to Zod schemas via `createZodDto(...)` in `api/src/common/dto/response-schemas.dto.ts` (lines 69-167). The DTO class is only a Nest/Swagger shim — the authoritative shape is the Zod schema, referenced below.

## a) GET /settings/profile

- **Path**: `GET settings/profile` (line 171)
- **Guards**: `AuthGuard`, `ScopeGuard` (class-level)
- **Scope**: `settings:read` via `@RequireScope` (line 175)
- **Throttle**: Global throttle applies (NO `@SkipThrottle`, NO per-route `@Throttle`)
- **Query params**: none
- **Handler**: `getProfile(user)` -> `settingsService.getProfile(user.uid)` (lines 176-178)
- **Response DTO**: `UserProfileResponseDto` (line 173) -> `UserProfileResponseSchema` at `libs/shared-types/src/schemas/settings-api.schema.ts:125-129`:
  ```
  { credits: number, tier: string, byoKeyEnabled: boolean }
  ```
- NOTE: Schema does NOT include `uid`, `email`, `displayName`, or `photoURL`. Only credits + tier + BYO flag. Chrome extension must source identity fields from SuperTokens session / auth context separately, NOT from this endpoint.

## b) GET /settings/usage-summary

- **Path**: `GET settings/usage-summary` (line 149)
- **Guards**: `AuthGuard`, `ScopeGuard`
- **Scope**: `settings:read` (line 153)
- **Throttle**: Global throttle applies (NO `@SkipThrottle`)
- **Query params**: none
- **Handler**: `getUsageSummary(user)` -> `settingsService.getUsageSummary(user.uid)` (lines 154-156)
- **Response DTO**: `UsageSummaryResponseDto` (line 151) -> `UsageSummaryResponseSchema` at `settings-api.schema.ts:134-138`:
  ```
  {
    totalCreditsUsed: number,
    totalGenerations: number (int >= 0),
    averageCreditsPerGeneration: number
  }
  ```
- IMPORTANT: No `remaining`, no `period`, no `limit`. Purely aggregate totals. "Remaining balance" lives on `/settings/profile.credits`. Chrome extension needs BOTH endpoints to show "X used / Y remaining".

## b.1) GET /settings/usage-logs (paginated)

- **Path**: `GET settings/usage-logs` (line 158)
- **Guards**: `AuthGuard`, `ScopeGuard`
- **Scope**: `settings:read` (line 164)
- **Throttle**: Global throttle applies
- **Query params**: `limit?: string` (default 50, clamped to 1..200), `offset?: string` (default 0) — parsed via `parsePositiveInt` (lines 165-168)
- **Handler**: `getUsageLogs(user, limit, offset)` -> `settingsService.getUsageLogs(user.uid, limit, offset)`
- **Response DTO**: `UsageLogsResponseDto` -> `UsageLogsResponseSchema` at `settings-api.schema.ts:169-172`:
  ```
  { logs: UsageLogEntry[], total: number }
  ```
  where each entry is `{ id, timestamp, type, model, context, sessionId?, jobId?, tokens: {...} }`.
- Extension relevance: only needed for deep "history" view — MVP can skip.

## c) GET /settings/preferences

- **Path**: `GET settings/preferences` (line 180)
- **Guards**: `AuthGuard`, `ScopeGuard`
- **Scope**: `settings:read` (line 185)
- **Throttle**: Global throttle applies
- **Query params**: `agentType?: string` — optional filter (e.g. `"b2b-sales"`, `"job-hunter"`). Omit for all preferences. (lines 182, 188)
- **Handler**: `getPreferences(user, agentType)` -> `settingsService.getPreferences(user.uid, agentType)` (lines 186-191)
- **Response DTO**: `UserPreferencesResponseDto` (line 183) -> `UserPreferencesResponseSchema` at `libs/shared-types/src/schemas/api-response.schema.ts:167-169`: `z.record(z.unknown())` — fully permissive, no structural contract at response boundary.
- Underlying agent config shape (for write validation) comes from `UserPreferencesSchema` at `libs/shared-types/src/preferences.ts:89-100`:
  ```
  { theme: 'academic'|..., model: 'flash'|'pro', autoSelectContacts: boolean,
    spellingVariant, cta: string, senderSignature: string,
    autoApproveDraft: boolean, autoApproveFollowups: boolean,
    followUpCount: 0..3, followUpDelayDays: 1..14 }
  ```

## d) Update preferences — POST (NOT PATCH)

- **Path**: `POST settings/preferences` (line 193) — note: endpoint is POST, not PATCH as the investigation brief suggested
- **Guards**: `AuthGuard`, `ScopeGuard`
- **Scope**: `settings:write` (line 199)
- **HttpCode**: 200 (line 198)
- **Throttle**: Global throttle applies
- **Query param**: `agentType?: string` (line 204) — scopes update to a specific agent config
- **Request DTO**: `UpdatePreferencesDto` declared at `api/src/common/dto/openapi-dtos.ts:35` -> `createZodDto(UserPreferencesSchema)`. Partial update — only provided fields changed (line 200 body description).
- **Body binding**: `@Body() body: Record<string, unknown>` (line 203) — raw record, NO `ZodValidationPipe` applied at controller. Validation happens inside `settingsService.updatePreferences`.
- **Response DTO**: `UpdatePreferencesResponseDto` -> `UpdatePreferencesResponseSchema` at `settings-api.schema.ts:177-179`: `{ success: boolean }`
- WARNING: Body type is `Record<string, unknown>` without pipe validation at controller — strict Zod parse happens deeper in service layer. Extension should still send canonically-shaped payloads.

## e) UsageSummaryResponseDto fields

Confirmed at `settings-api.schema.ts:134-138`:
- `totalCreditsUsed: number`
- `totalGenerations: number` (integer, >= 0)
- `averageCreditsPerGeneration: number`

No remaining/period/limit fields.

## f) Throttle decorators across the whole controller

Exhaustive audit of every route in `settings.controller.ts`:

| Route | Method | Throttle decorator |
|-------|--------|--------------------|
| `providers` | GET | `@SkipThrottle()` (line 67) |
| `providers/supported` | GET | `@SkipThrottle()` (line 81) |
| `providers/:provider` | POST | none (global throttle) |
| `providers/:provider` | DELETE | none (global throttle) |
| `usage-summary` | GET | none (global throttle) |
| `usage-logs` | GET | none (global throttle) |
| `profile` | GET | none (global throttle) |
| `preferences` | GET | none (global throttle) |
| `preferences` | POST | none (global throttle) |
| `platform-api-keys` | POST | none (global throttle) |
| `platform-api-keys` | GET | none (global throttle) |
| `platform-api-keys/:hash/usage` | GET | none (global throttle) |
| `platform-api-keys/:hash/rotate` | POST | none (global throttle) |
| `platform-api-keys/:hash` | DELETE | none (global throttle) |
| `webhook-secret` | GET | none (global throttle) |
| `webhook-secret/rotate` | POST | `@Throttle({ default: { ttl: 3_600_000, limit: 5 } })` (line 329) — 5 rotations per hour |

So for the three extension-primary endpoints (`profile`, `usage-summary`, `preferences` GET/POST): global `ThrottlerGuard` applies. Chrome extension must debounce polls or handle 429.

## g) Scope enforcement (class-level `ScopeGuard` + `@RequireScope`)

Every handler except the bare `/providers/supported` capability map uses `@RequireScope(...)`. Complete map:

| Route | Scope |
|-------|-------|
| GET `providers` | `settings:read` |
| GET `providers/supported` | `settings:read` |
| POST `providers/:provider` | `settings:write` |
| DELETE `providers/:provider` | `settings:write` |
| GET `usage-summary` | `settings:read` |
| GET `usage-logs` | `settings:read` |
| GET `profile` | `settings:read` |
| GET `preferences` | `settings:read` |
| POST `preferences` | `settings:write` |
| POST `platform-api-keys` | `settings:write` |
| GET `platform-api-keys` | `settings:read` |
| GET `platform-api-keys/:hash/usage` | `settings:read` |
| POST `platform-api-keys/:hash/rotate` | `settings:write` |
| DELETE `platform-api-keys/:hash` | `settings:write` |
| GET `webhook-secret` | `webhook:read` |
| POST `webhook-secret/rotate` | `webhook:write` |

All valid scopes enumerated in `libs/shared-types/src/schemas/settings-api.schema.ts:58-74`:
`jobs:read, jobs:write, sales:read, sales:write, sessions:read, sessions:write, settings:read, settings:write, upload:write, resume:read, resume:write, ats:write, webhook:read, webhook:write, outreach:read, outreach:write, *`. An extension key with scope `*` (wildcard) satisfies all of the above.

## h) Platform API key management endpoints

All live at `settings/platform-api-keys` (NOT `settings/api-keys`). There is NO `settings/api-key` CRUD in this controller — the only `api-key` artifact is the `ApiKeyAuditInterceptor` on the class.

### h.1) POST /settings/platform-api-keys (create)

- Line 209, scope `settings:write`.
- Body validated via `new ZodValidationPipe(CreatePlatformApiKeySchema)` (line 218) — the ONLY handler in this controller with a real controller-level Zod pipe.
- **Request schema** `CreatePlatformApiKeySchema` (`settings-api.schema.ts:81-86`, `.strict()`):
  ```
  {
    label: string (trimmed, 1..100),
    scopes?: ApiKeyScope[] (max 20; enum of 17 values including '*'),
    expiresAt?: ISO 8601 datetime string,
    monthlyCreditsLimit?: int in [1, 1_000_000]
  }
  ```
- `expiresAt` additionally re-parsed into a `Date` (lines 220-226) — rejects `Invalid expiresAt date format` with 400.
- **Response DTO**: `PlatformApiKeyCreateResponseDto` -> `PlatformApiKeyCreateResponseSchema` (`settings-api.schema.ts:184-192`):
  ```
  {
    fullKey: string,            // shown only once
    keyPrefix: string,
    label: string,
    scopes: ApiKeyScope[],
    expiresAt?: ISO datetime | Date | null,
    monthlyCreditsLimit?: number | null,
    createdAt: ISO datetime | Date
  }
  ```
- Returned with 201 (Nest `@Post` default — no explicit `@HttpCode`).

### h.2) GET /settings/platform-api-keys (list)

- Line 246, scope `settings:read`.
- No query params.
- **Handler**: `listPlatformApiKeysWithUsage(user.uid)`.
- **Response DTO**: `[PlatformApiKeyListEntryDto]` (array) -> each entry is `PlatformApiKeyListEntrySchema` (`settings-api.schema.ts:197-213`):
  ```
  {
    keyHash: string,            // SHA-256, used as :hash path param
    keyPrefix: string,
    label: string,
    scopes: ApiKeyScope[],
    expiresAt?: ISO | Date | null,
    monthlyCreditsLimit?: number | null,
    createdAt: ISO | Date,
    lastUsedAt?: ISO | Date | null,
    isActive: boolean,
    currentMonthUsage: { creditsUsed: number, requestCount: int >= 0 }
  }
  ```
- `keyHash` is the stable identifier consumed by the three `:hash` routes below. It must be a hex string of at most 128 chars — validated by `validateKeyHash()` (lines 43-53) on all three routes; violations return `400 BadRequest`.

### h.3) GET /settings/platform-api-keys/:hash/usage

- Line 257, scope `settings:read`.
- Path param `:hash` (hex, `/^[a-f0-9]+$/i`, max 128 chars).
- **Response DTO**: `ApiKeyUsageStatsResponseDto` -> `ApiKeyUsageStatsResponseSchema` (`api-response.schema.ts:152-157`):
  ```
  { totalRequests: number, periodStart: string, periodEnd: string, breakdown?: Record<string, unknown> }
  ```
- 404 if hash not found.

### h.4) POST /settings/platform-api-keys/:hash/rotate

- Line 272, scope `settings:write`, `@HttpCode(200)`.
- Body: `{ gracePeriodHours?: number }` (NOT `ZodValidationPipe`-gated; uses manual check at lines 289-291). Default 24, must be finite and in `[0, 720]`, else 400. Hard-coded mirror of `RotatePlatformApiKeySchema` (`settings-api.schema.ts:90-92`) — the schema exists but is NOT wired into this route; the DTO import (`RotatePlatformApiKeyDto`) is only used for `@ApiBody` Swagger metadata (line 281).
- **Response DTO**: `ApiKeyRotateResponseDto` -> `ApiKeyRotateResponseSchema` (`api-response.schema.ts:160-164`):
  ```
  { newKeyPrefix: string, rotatedAt: string, gracePeriodEndsAt?: string }
  ```
- Note: the rotate response does NOT return a new `fullKey` by this Zod contract. The MCP tool description implies a new key is returned, but the Zod schema exposes only `newKeyPrefix`. This is a possible drift — flagged for extension client, which must not assume a full-key field on rotate.
- 404 if hash not found.

### h.5) DELETE /settings/platform-api-keys/:hash (revoke)

- Line 299, scope `settings:write`.
- Path param `:hash` (validated).
- **Response DTO**: `RevokePlatformApiKeyResponseDto` -> `RevokePlatformApiKeyResponseSchema` (`settings-api.schema.ts:222-224`): `{ success: boolean }`.
- 404 if not found.

## i) BYO / provider key endpoints (the only "BYO" surface)

There is NO `/settings/byo-*` route. "BYO keys" are exposed through the three `providers` routes (lines 66-147). The MCP `byo-key-get / byo-key-set / byo-key-remove` tools all map to these.

### i.1) GET /settings/providers (equivalent to `byo-key-get`)

- Line 66, scope `settings:read`, `@SkipThrottle()`.
- No query params, no body.
- **Handler**: `settingsService.getProviderKeyStatus(user.uid)`.
- **Response**: loose Swagger schema `{ type: 'array', items: { type: 'object' } }` (lines 70-73) — no Zod DTO. Returns an array of provider statuses (one per configured provider). Shape is service-internal; extension must treat it as `unknown[]`.

### i.2) GET /settings/providers/supported

- Line 80, scope `settings:read`, `@SkipThrottle()`.
- No params.
- **Handler**: inline (lines 90-105) — maps `settingsService.getSupportedProviders()` into `{ provider, displayName, capabilities: string[] }` using the `CAPABILITY_LABELS` dictionary.
- Response is the only surface that documents supported providers + feature capabilities (structuredOutput/nativeSearch/thinking/multimodal).

### i.3) POST /settings/providers/:provider (equivalent to `byo-key-set`)

- Line 107, scope `settings:write`, `@HttpCode(200)`.
- Path param `:provider` — free string (e.g. `google`, `fireworks`, `gemini`). NOT validated at controller against a provider enum — service layer validates and throws.
- Body `{ apiKey: string }`, min 1 / max 1024 (declared in `@ApiBody` schema at lines 110-118, but NOT bound via a `ZodValidationPipe`). Manual check at lines 129-131 rejects missing/non-string with `apiKey is required` (400).
- **Handler**: `settingsService.setProviderKey(user.uid, provider, body.apiKey)`.
- **Response DTO**: `SimpleSuccessResponseDto` -> `{ success: boolean }`.
- NO `baseUrl` parameter in the controller (despite the MCP `byo-key-set` schema exposing one) — baseUrl is NOT supported through this HTTP endpoint. Flagged as drift between MCP tool and REST API.

### i.4) DELETE /settings/providers/:provider (equivalent to `byo-key-remove`)

- Line 135, scope `settings:write`.
- Path param `:provider`.
- **Handler**: `settingsService.removeProviderKey(user.uid, provider)`.
- **Response DTO**: `SimpleSuccessResponseDto` -> `{ success: boolean }`.

## j) Webhook signing secret (out of scope for extension MVP but documented for completeness)

- `GET settings/webhook-secret` (line 319, scope `webhook:read`) -> `WebhookSecretResponseDto` -> `WebhookSecretResponseSchema` (`api-response.schema.ts:180-183`): `{ secret: string, createdAt: string }`.
- `POST settings/webhook-secret/rotate` (line 330, scope `webhook:write`, `@HttpCode(200)`, `@Throttle({ ttl: 3_600_000, limit: 5 })` — 5/hour, hard cap) -> same `WebhookSecretResponseSchema`.

## Key findings for Chrome extension MVP

1. **Profile endpoint lacks identity fields** (`uid/email/name/photo`). Extension must fetch user identity from the SuperTokens auth layer, not from `/settings/profile`.
2. **"Credits remaining" = `GET /settings/profile.credits`**. "Credits used/totals" = `GET /settings/usage-summary`. Two endpoints are required for a complete credits dashboard.
3. **Preferences UPDATE is `POST`, not `PATCH`**. Body is `Record<string, unknown>` with partial semantics and no controller-level `ZodValidationPipe`.
4. **`agentType` query param** on GET and POST preferences enables per-agent config (`job-hunter`, `b2b-sales`).
5. **Throttling**: `providers` GET routes are `@SkipThrottle`d; everything else uses the global `ThrottlerGuard`; `webhook-secret/rotate` has a hard 5/hour cap. Extension should debounce polls of profile/usage-summary.
6. **BYO keys use the `providers` routes**, not any `/byo/*` path. The REST endpoint does NOT accept a `baseUrl` field even though the MCP tool exposes one — drift to be aware of when replacing MCP calls with REST.
7. **Platform API key management** lives at `settings/platform-api-keys` with hex `:hash` identifiers validated by `validateKeyHash` (max 128 chars, `/^[a-f0-9]+$/i`). Creation uses `CreatePlatformApiKeySchema` with strict label/scopes/expiresAt/monthlyCreditsLimit validation. Rotate returns `{ newKeyPrefix, rotatedAt, gracePeriodEndsAt? }` — NOT a new full-key — per the current Zod schema; extension must refresh the key list (`fullKey` only shown once at creation).
8. **Scope requirements**: an extension API key with `settings:read` covers GET profile/usage-summary/usage-logs/preferences/providers/platform-api-keys; `settings:write` is required for POST preferences and any platform-api-key / provider mutation. Wildcard `*` satisfies all scopes.

Confidence: 100%
e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\15-settings-endpoints.md
