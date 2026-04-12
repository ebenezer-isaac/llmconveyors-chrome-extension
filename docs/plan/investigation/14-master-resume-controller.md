# Agent 14 — Master Resume Controller Investigation

**Scope**: `api/src/modules/resume/master-resume.controller.ts` + DTOs + backing service

## Controller Shape

File: `api/src/modules/resume/master-resume.controller.ts:30-84`

- Base path: `resume/master` (`:27` — `@Controller('resume/master')`)
- Class-level guards: `AuthGuard`, `ScopeGuard` (`:28` — `@UseGuards(AuthGuard, ScopeGuard)`)
- Class-level interceptor: `ApiKeyAuditInterceptor` (`:29` — `@UseInterceptors(ApiKeyAuditInterceptor)`)
- Swagger tag: `Master Resume` (`:24`)
- Auth: `@ApiBearerAuth('bearer')` + `@ApiSecurity('api-key')` (`:25-26`) — accepts both SuperTokens session bearer and platform API key
- User injection: `@CurrentUser() user: UserContext` — all operations keyed by `user.uid` (one master resume per user)
- Logger: `new Logger(MasterResumeController.name)` (`:31`)

## (a) GET /resume/master

- `master-resume.controller.ts:35-46`
- Decorators: `@Get()`, `@RequireScope('resume:read')`
- No request body, no query params, no path params
- Response DTO: `MasterResumeResponseDto` (`api/src/common/dto/response-schemas.dto.ts:113` — `createZodDto(MasterResumeResponseSchema)`)
- TypeScript return type: `Promise<MasterResumeResponse>` from `@repo/shared-types`
- Response shape (`libs/shared-types/src/schemas/master-resume.schema.ts:11-18`):
  ```
  {
    userId: string,
    label: string,
    rawText: string,
    structuredData?: Record<string, unknown>,
    createdAt: string (ISO 8601),
    updatedAt: string (ISO 8601)
  }
  ```
- Statuses declared (controller `@ApiResponse` decorators): 200, 401, 404
- Service delegates to `MasterResumeService.get(user.uid)` (`services/master-resume.service.ts:23-35`) — `findOne({ userId }).lean().exec()`, throws `NotFoundException` with code `NOT_FOUND` if missing

## (b) PUT /resume/master

- `master-resume.controller.ts:48-70`
- Decorators: `@Put()`, `@RequireScope('resume:write')`
- Request DTO (Swagger only): `MasterResumeUpsertDto` (`api/src/common/dto/openapi-dtos.ts:54` — `createZodDto(MasterResumeUpsertSchema)`)
- Validation pattern: `@Body()` is typed as `Record<string, unknown>` (`:57`). Handler then calls `MasterResumeUpsertSchema.safeParse(rawBody)` (`:59`). This INTENTIONALLY bypasses Nest's global ValidationPipe — Zod is the sole source of truth.
- Request schema (`master-resume.schema.ts:3-9`):
  ```
  {
    label: string (z.string().trim().min(1).max(200)),
    rawText: string (z.string().min(1).max(100_000)),
    structuredData?: Record<string, unknown>  // z.record(z.unknown()).optional()
  }
  ```
  Note: `label` is trimmed server-side; `rawText` is NOT trimmed.
- Response: same `MasterResumeResponseDto` / `MasterResumeResponse` shape as GET
- Statuses declared: 200, 400, 401
- Upsert semantics (`services/master-resume.service.ts:54-79`):
  - `findOneAndUpdate({ userId }, { $set: { label, rawText, structuredData }, $setOnInsert: { userId } }, { upsert: true, new: true, lean: true })`
  - Returns the post-update document via `toResponse()`
  - If `structuredData` omitted from request, Mongoose `$set: { structuredData: undefined }` effectively clears it (no preservation of prior value)
  - Mongoose schema timestamps populate `createdAt`/`updatedAt`

## (c) DELETE /resume/master

- `master-resume.controller.ts:72-83`
- Decorators: `@Delete()`, `@RequireScope('resume:write')`
- Handler return type: `Promise<void>` — Nest emits empty body with HTTP 200 (the default for void returns on `@Delete()`; Nest does NOT auto-emit 204)
- Service: `MasterResumeService.delete(user.uid)` (`services/master-resume.service.ts:81-93`) — `deleteOne({ userId })`, throws `NotFoundException` with code `NOT_FOUND` if `deletedCount === 0`
- Statuses declared: 200, 401, 404

## (d) Field Constraints (exact)

| Field | Rule | Source |
|---|---|---|
| `label` | `z.string().trim().min(1).max(200)` — required, trimmed, 1-200 chars post-trim | `master-resume.schema.ts:4` |
| `rawText` | `z.string().min(1).max(100_000)` — required, 1-100000 chars, no trim | `master-resume.schema.ts:5` |
| `structuredData` | `z.record(z.unknown()).optional()` — free-form object, no inner validation, no max depth/key count enforced | `master-resume.schema.ts:6` |

Unknown top-level keys are STRIPPED by default (Zod `z.object()` default behavior — no `.strict()` modifier applied), so extra fields silently pass without 400.

## (e) rawText Preprocessing

NO preprocessing, parsing, or transformation. `MasterResumeService.upsert` (`services/master-resume.service.ts:54-79`) writes `input.rawText` verbatim into MongoDB via `$set: { rawText: input.rawText }`. Structured data is stored only if the client supplies it — the backend does NOT auto-parse PDF/DOCX binaries or derive `structuredData` from `rawText`.

For raw file upload + parse, a separate endpoint (`/upload/resume`) handles PDF/DOCX extraction. PUT `/resume/master` is store-as-is and the client is responsible for pre-parsing.

## (f) Errors

| Status | Code | Source | Trigger |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | controller `:61-66` | Zod `safeParse` failure. Body: `{ code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() }` via `BadRequestException` |
| 401 | — | `AuthGuard` | Missing/invalid Bearer token or API key |
| 403 | — | `ScopeGuard` | API key authenticated but lacks required scope (`resume:read` for GET, `resume:write` for PUT/DELETE). SuperTokens sessions have implicit full scope. |
| 404 | `NOT_FOUND` | service `:28-32` (GET), `:85-90` (DELETE) | No document for `userId`. Body: `{ code: 'NOT_FOUND', message: 'No master resume found' }` via `NotFoundException` |

PUT cannot return 404 — it always upserts (creates on missing).

## (g) toResponse Mapping

`services/master-resume.service.ts:95-112` — defensively coerces:
- `userId`, `label`, `rawText` via `String()`
- `createdAt`/`updatedAt`: if `Date`, `toISOString()`; else `String(... ?? '')` (empty string fallback if both missing — tolerable because Mongoose timestamps always populate them on upsert)
- `structuredData` passed through as-is (may be `undefined`)

## Drift Flags

- `master-resume.controller.ts:75`: DELETE Swagger declares `type: SimpleSuccessResponseDto`, but the handler returns `Promise<void>` and Nest emits an empty body on HTTP 200. Swagger contract does not match runtime response — extension clients parsing `{ success: true }` will get empty body.
- `master-resume.controller.ts:57`: `@Body() rawBody: Record<string, unknown>` bypasses Nest's DTO ValidationPipe; `MasterResumeUpsertSchema.safeParse` is the sole validator. Intentional Zod-first pattern, but means the `@ApiBody({ type: MasterResumeUpsertDto })` decorator is Swagger-only documentation, not runtime enforcement.
- `services/master-resume.service.ts:67`: Passing `structuredData: undefined` to `$set` will unset the field on Mongo if previously populated. Clients cannot do a partial update of only `label` + `rawText` while preserving existing `structuredData` — they must re-send it. PUT is full-replace, not merge.

---

Confidence: 100%
File: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\14-master-resume-controller.md`
