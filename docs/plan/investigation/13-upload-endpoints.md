# 13 - Upload Endpoints (Chrome Extension MVP)

Scope: `api/src/modules/upload/upload.controller.ts`, `api/src/modules/upload/upload.module.ts`, `api/src/modules/upload/dto/process-job-text.dto.ts`, `libs/shared-types/src/schemas/upload.schema.ts`, and the delegating service `api/src/modules/upload/upload.service.ts`.

## Controller-level config

- Base path: `@Controller('upload')` -- `upload.controller.ts:21`. With the global API prefix (`app.setGlobalPrefix('api/v1')` in `main.ts`), public paths are `/api/v1/upload/*`.
- Guards (applied to ALL routes): `@UseGuards(AuthGuard, ScopeGuard)` -- `upload.controller.ts:22`
- Interceptor: `ApiKeyAuditInterceptor` -- `upload.controller.ts:23`
- Required scope (all routes): `@RequireScope('upload:write')` -- `upload.controller.ts:24`
- Auth surfaces advertised: `ApiBearerAuth('bearer')` + `ApiSecurity('api-key')` -- `upload.controller.ts:19-20`
- Max file size constant: `const MAX_FILE_SIZE = 10 * 1024 * 1024;` = **10485760 bytes / 10 MiB** -- `upload.controller.ts:16`
- Module: `UploadModule` (`upload.module.ts`) imports only `AIModule`, declares `UploadController`, `UploadService`, and `UploadQueryListener`. **No `MulterModule.register(...)` anywhere** -- multer config is per-route only.

## Route inventory (complete)

The upload controller declares **exactly two routes**. Anything else a client might guess (`/upload/job-file`, `/upload/job-url`, base64 resume endpoint) does **NOT exist**.

| Method | Path | Handler | Content-Type |
|---|---|---|---|
| POST | `/upload/resume` | `uploadResume` (`:36`) | `multipart/form-data` |
| POST | `/upload/job-text` | `processJobText` (`:47`) | `application/json` |

## a) POST /upload/resume

- Method / path: `@Post('resume')` -- `upload.controller.ts:28`
- Content-Type: **multipart/form-data** -- `@ApiConsumes('multipart/form-data')` at `upload.controller.ts:30`; body schema `{ file: binary }` at `upload.controller.ts:31`
- Multer / FileInterceptor: `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))` -- `upload.controller.ts:35`. **Form field name is exactly `file`** (hardcoded string).
- Request DTO: none -- raw `Express.Multer.File` parameter via `@UploadedFile()` -- `upload.controller.ts:36`
- Response DTO: `ResumeParseResponseDto` -- `upload.controller.ts:32`, declared in `api/src/common/dto/response-schemas.dto.ts` (from `ResumeParseResponseSchema` via `createZodDto`)
- Response shape (from `upload.service.ts:119-124`):
  ```ts
  { ok: true, normalized: <JsonResume>, fileSize: number, metadata: { extractionMethod, passes, confidence, usage?, model? } }
  ```
- Null/empty check: `if (!file) throw new BadRequestException('File is required');` -- `upload.controller.ts:37`
- Delegates: `uploadService.ingestResume(user, file.buffer, file.mimetype, file.originalname)` -- `upload.controller.ts:38`

### Size limit (exact)

- `MAX_FILE_SIZE = 10 * 1024 * 1024 = 10485760 bytes` (10 MiB) -- `upload.controller.ts:16`
- Enforced via multer `limits.fileSize` at `upload.controller.ts:35`. Multer uses in-memory storage (default; confirmed because the service reads `file.buffer`). When a client uploads more than 10 MiB, multer throws `MulterError` `LIMIT_FILE_SIZE`, which Nest surfaces as HTTP 413 "Payload Too Large" (multer default) -- not documented in Swagger decorators on this controller.

### MIME allowlist (where enforcement actually lives)

- **No `fileFilter` on the multer config.** The controller-level interceptor at `upload.controller.ts:35` passes anything through.
- Real MIME / format validation lives in `upload.service.ts` `resolveFormat` (`upload.service.ts:156-176`), which uses **magic-byte detection first, MIME as fallback**:
  - **Magic bytes (primary)**:
    - PDF: `25 50 44 46` (`%PDF`) -> `pdf`
    - DOCX (OOXML, ZIP): `50 4B 03 04` (`PK`) -> `docx`
    - DOC (OLE compound): `D0 CF 11 E0` -> `docx` (legacy Word mapped onto docx path)
  - **MIME fallback (text only)**: `text/plain` -> `txt`
  - **Strict MIME check**: if MIME claims `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, or `application/msword` but magic bytes do not match, `resolveFormat` returns `null` (rejected as corrupted/spoofed).
- Effective allowlist (what the extension may send):

  | Format | MIME | Magic bytes |
  |---|---|---|
  | PDF | `application/pdf` | `25 50 44 46` |
  | DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `50 4B 03 04` |
  | DOC (legacy) | `application/msword` | `D0 CF 11 E0` |
  | TXT | `text/plain` | (no magic bytes -- MIME check) |

- On reject: `throw new BadRequestException('Unsupported file type: ${mimetype}. Supported: PDF, DOCX, TXT')` -- `upload.service.ts:50`.

## b) POST /upload/job-file -- NOT IMPLEMENTED

- **No such route exists.** Controller declares only `@Post('resume')` (`:28`) and `@Post('job-text')` (`:41`). No `@Post('job-file')`, no `FileInterceptor` other than the resume one.
- Chrome extension must parse PDF/DOCX job descriptions **client-side to text** and POST to `/upload/job-text`, or pass a URL via the same route's `url` field.

## c) POST /upload/job-text

- Method / path: `@Post('job-text')` -- `upload.controller.ts:41`
- Content-Type: **application/json** (no `ApiConsumes` override; default Nest JSON body parser)
- Request DTO: `ProcessJobTextDto` -- `upload.controller.ts:47-48`, defined in `api/src/modules/upload/dto/process-job-text.dto.ts:4` as `createZodDto(ProcessJobTextSchema)`
- Validation pipe: `new ZodValidationPipe(ProcessJobTextSchema)` (from `nestjs-zod`) applied inline on `@Body(...)` -- `upload.controller.ts:48`. Zod errors surface as HTTP 400 via `nestjs-zod`'s exception mapping.
- Response DTO: `JdTextProcessResponseDto` -- `upload.controller.ts:43`, declared in `api/src/common/dto/response-schemas.dto.ts`
- Body shape (from `libs/shared-types/src/schemas/upload.schema.ts:7-13`):
  ```ts
  {
    text?: string   // max 50_000 chars
    url?:  string   // .url() + max 2_048 chars
  }
  // refine: data.text || data.url  -- error: "Text or URL is required"
  ```
  Both fields are optional individually, but the refine guarantees **at least one** is present. Sending `{}` returns 400.
- Delegates: `uploadService.processJobText(user, body.text, body.url)` -- `upload.controller.ts:51`
- Service-side branching (`upload.service.ts:178-296`):
  - If `url` is present and `text` is empty or equals the URL -> Gemini grounded extraction via `extractJdFromUrl` (google_search tool reads the page).
  - Otherwise -> Gemini structured extraction on `text || url`, truncated to `MAX_JOB_TEXT_LENGTH = 20_000` chars (`upload.service.ts:9`). Note: Zod allows up to 50k chars but the service silently slices to 20k before sending to the model.
  - If neither -> `throw new BadRequestException('No text or URL provided for job processing')` (defensive; Zod refine already covers this).
- Response shape (from `upload.service.ts:254-270` / `:371-382` / `:402-414`):
  ```ts
  {
    jobDescription: string;
    companyName: string;
    jobTitle: string;
    companyWebsite?: string;
    wasUrl: boolean;
    jobUrl: string;
    emailAddresses: string[];  // always []
    metadata: { city?, country?, keywords?, isRemote?, groundedExtraction? };
    processed: boolean;
    degraded: boolean;         // true when AI extraction failed and fell back to raw content
  }
  ```

### Text length limits (authoritative)

- `text`: `.max(50_000)` at Zod boundary -- `upload.schema.ts:8`
- `url`: `.url().max(2_048)` at Zod boundary -- `upload.schema.ts:9`
- Service truncation for model input: 20,000 chars -- `upload.service.ts:9,223`

## d) POST /upload/job-url -- NOT A SEPARATE ROUTE

- URL fetching is folded into `/upload/job-text` via the optional `url` field (`upload.schema.ts:9`).
- When both `text` and `url` are absent, Zod's refine fails with `"Text or URL is required"` (400).
- When `url` is present alone (or `text === url`), the service calls `extractJdFromUrl` which invokes Gemini with `google_search` grounding and returns an extracted JD. On grounding failure / insufficient content, it falls back to `buildUrlPassthrough` (returns empty strings + the URL, `processed: false`, `degraded: false`).

## e) Guards + scopes (all routes)

- `AuthGuard` + `ScopeGuard` at controller level -- `upload.controller.ts:22`
- Required scope: `upload:write` -- `upload.controller.ts:24`
- Audit interceptor (logs API-key usage): `ApiKeyAuditInterceptor` -- `upload.controller.ts:23`
- Accepts both Bearer (cookie/session via SuperTokens) and API-key auth -- `upload.controller.ts:19-20`
- Billing: both routes reserve/confirm 1 credit (`ESTIMATED_PARSE_CREDITS = 1`, `ESTIMATED_EXTRACT_CREDITS = 1`) against the user's tier unless tier is `byo` (`upload.service.ts:34-35,57-69,199-212`).

## f) Error codes / statuses

### Declared via Swagger decorators

- `POST /upload/resume`:
  - **200** "Resume parsed successfully" -- `upload.controller.ts:32`
  - **400** "File is required or invalid format" -- `upload.controller.ts:33`
  - **401** "Unauthorized" -- `upload.controller.ts:34`
- `POST /upload/job-text`:
  - **200** "Job description processed successfully" -- `upload.controller.ts:43`
  - **400** "Invalid request body" -- `upload.controller.ts:44`
  - **401** "Unauthorized" -- `upload.controller.ts:45`

### Actually thrown at runtime (not in Swagger)

- **400 BadRequestException**:
  - `File is required` (`upload.controller.ts:37`)
  - `Unsupported file type: <mimetype>. Supported: PDF, DOCX, TXT` (`upload.service.ts:50`)
  - `Insufficient credits for resume parsing` (`upload.service.ts:67`)
  - `Insufficient credits for job extraction` (`upload.service.ts:210`)
  - `Failed to parse resume. Please try again later.` (`upload.service.ts:148`)
  - `No text or URL provided for job processing` (`upload.service.ts:191`, defensive)
  - Zod schema violations on `/upload/job-text` (handled by `ZodValidationPipe`)
- **401 Unauthorized**: from `AuthGuard` when no valid session / API key.
- **403 Forbidden**: implicit via `ScopeGuard` when the API key is missing `upload:write` (not declared in Swagger).
- **413 Payload Too Large**: multer `LIMIT_FILE_SIZE` on resumes > 10 MiB (not declared in Swagger; multer default response).
- **429 TOO_MANY_REQUESTS**: `HttpException` for `AIQuotaExhaustedError` on resume parse (`upload.service.ts:140`).
- **503 SERVICE_UNAVAILABLE**: `HttpException` for `AIRateLimitError` (`upload.service.ts:143`) and `AIConfigurationError` ("AI service temporarily unavailable. Please try again later.", `upload.service.ts:146`).
- Note: `/upload/job-text` errors are swallowed to a `degraded: true` response instead of throwing (`upload.service.ts:271-295`), so the client always gets 200 with a degraded flag if AI fails (outside of billing errors).

## g) FileInterceptor / multer config (exact)

Only one multer registration in the whole module:

```ts
// upload.controller.ts:35
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
```

- Field name: `'file'` (string literal; anything else is silently ignored and `file` param becomes `undefined`)
- `limits.fileSize`: `10485760` bytes (10 MiB)
- `fileFilter`: **not set** -- multer accepts any MIME/extension
- `storage`: **not set** -- multer default is in-memory (`multer.memoryStorage()`), which is why `file.buffer` is available in `upload.service.ts:38`
- `preservePath`: not set (default false)
- No `MulterModule.register(...)` in `upload.module.ts` or anywhere global -- no account-wide defaults

## h) Chrome extension -- how to send a resume

Use **multipart/form-data** with field name `file` (exact string -- `upload.controller.ts:35`):

```js
const fd = new FormData();
fd.append('file', resumeBlob, 'resume.pdf'); // Blob or File, <= 10485760 bytes

await fetch('https://api.llmconveyors.com/api/v1/upload/resume', {
  method: 'POST',
  headers: {
    // Do NOT set Content-Type -- let the browser add the multipart boundary
    'Authorization': `Bearer ${apiKey}`, // or session cookie
  },
  body: fd,
  credentials: 'include', // if using session cookies
});
```

Rules:
- Field name MUST be `file` (`FileInterceptor('file', ...)`). Any other name -> 400 "File is required".
- Max 10 MiB / 10485760 bytes (`MAX_FILE_SIZE`, `upload.controller.ts:16`). Larger -> 413.
- Allowed content (magic-byte verified): PDF (`%PDF`), DOCX (ZIP `PK`), DOC (OLE), TXT (via `text/plain` MIME). Mismatched MIME vs magic bytes -> 400.
- **No base64 JSON path** exists. Sending JSON with a base64 string will 400 ("File is required") because multer will not populate `file`.
- API key must carry the `upload:write` scope (`upload.controller.ts:24`). Missing scope -> 403.
- Caller must have >=1 credit OR be on `byo` tier (`upload.service.ts:57,67`). Out of credits -> 400 "Insufficient credits for resume parsing".

For job descriptions: parse to text in the extension and POST JSON to `/upload/job-text` with `{ text }` (<=50k chars, truncated to 20k before model) or `{ url }` (<=2048 chars). Either field alone is sufficient; at least one is required.

```js
await fetch('https://api.llmconveyors.com/api/v1/upload/job-text', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: jobDescriptionText }), // or { url: postingUrl }
});
```

Confidence: 100%
