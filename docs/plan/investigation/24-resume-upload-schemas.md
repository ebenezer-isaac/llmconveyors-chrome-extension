# 24 — Resume + Upload Schemas (shared-types)

Scope: `libs/shared-types/src/schemas/master-resume.schema.ts`, `upload.schema.ts`, `resume-api.schema.ts`, `docs/surfaces/upload.surface.ts`.

## a) MasterResumeUpsertSchema

`libs/shared-types/src/schemas/master-resume.schema.ts:3-7`

```ts
{
  label: z.string().trim().min(1).max(200),
  rawText: z.string().min(1).max(100_000),     // 100 KB text cap
  structuredData: z.record(z.unknown()).optional(),
}
```

- NOT `.strict()` — extra keys tolerated (flag: lacks mass-assignment guard).
- `structuredData` is a free-form record; no JSON Resume schema enforcement here.

## b) MasterResumeResponseSchema

`master-resume.schema.ts:11-18`

```ts
{
  userId: string,
  label: string,
  rawText: string,
  structuredData?: record,
  createdAt: string,        // ISO
  updatedAt: string,        // ISO
}
```

No `id` field — `userId` is effectively the PK (one master resume per user).

## c) Upload Resume request schema

**There is NO Zod schema for `POST /upload/resume`.** The endpoint is multipart/form-data only.

Evidence — `libs/shared-types/src/docs/surfaces/upload.surface.ts:15-22`:
```
method: POST, path: /upload/resume
description: 'Upload a resume file (multipart/form-data). Accepted formats: PDF, DOCX, DOC. Max size 10 MB.'
notes: 'Content-Type must be multipart/form-data. The file field name is "file".'
```

`UPLOAD_RESUME` EndpointDef has no `requestBody.schema` (compare `UPLOAD_JOB_TEXT` at `:24-31` which does).

**Implication for Chrome extension**: must send `multipart/form-data` with field name `"file"`, NOT base64 JSON. Max 10 MB. No client-side Zod available to pre-validate the body shape; file-type/size validation happens server-side via MIME magic-byte check.

Note: `resume.surface.ts:39` cites "Max size: 20 MB" — conflicts with upload.surface.ts "10 MB" (flag: blueprint drift, resolved below).

### RUNTIME TRUTH — Upload Resume Max File Size

**Enforced limit: 10 MB (10 * 1024 * 1024 = 10_485_760 bytes).**

Source of truth: `api/src/modules/upload/upload.controller.ts:16,35`:

```ts
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
...
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
async uploadResume(@UploadedFile() file: Express.Multer.File, ...)
```

Multer's `FileInterceptor` enforces this hard cap server-side; anything over 10 MB is rejected with `PayloadTooLargeError` BEFORE the handler runs. No request body validation, no service-level check — the ceiling is purely multer config.

**Drift verdict:**
- `upload.surface.ts:19` "Max size 10 MB" — CORRECT, matches runtime.
- `resume.surface.ts:39` "Max size 20 MB" — WRONG, must be corrected to 10 MB (blueprint drift, surface doc lies).
- No exported shared constant (`MAX_RESUME_UPLOAD_BYTES` or similar) — the `10 * 1024 * 1024` literal lives only in `upload.controller.ts`. Chrome extension client-side validation must hardcode the same literal until a shared-types constant is added.

**Additional runtime observations from upload.controller.ts:**
- Only `file` field name is accepted (`FileInterceptor('file', ...)`).
- Missing file → `BadRequestException('File is required')` (400).
- No MIME-type allowlist in the controller — format validation (PDF/DOCX/DOC) happens downstream in `uploadService.ingestResume` via magic-byte sniff, not here.
- No per-user rate limit visible on this controller; rate limiting relies on the global guards (`AuthGuard`, `ScopeGuard`, `ApiKeyAuditInterceptor`).
- Scope required: `upload:write`.

## d) ProcessJobTextSchema (POST /upload/job-text)

`libs/shared-types/src/schemas/upload.schema.ts:7-13`

```ts
z.object({
  text: z.string().max(50_000).optional(),     // 50 KB text cap
  url: z.string().url().max(2_048).optional(), // 2 KB URL cap
}).refine((d) => d.text || d.url, { message: 'Text or URL is required' })
```

- XOR-style: at least one of `text` / `url` required (both allowed too — not mutually exclusive).
- Not `.strict()` — extra keys silently accepted.
- No trim/sanitization on `text`; raw passthrough to parser.

## e) ResumeParseResponseSchema

`libs/shared-types/src/schemas/resume-api.schema.ts:49-52`

```ts
{
  resume: z.record(z.unknown()),     // parsed JSON Resume
  metadata: z.record(z.unknown()),   // extraction mode, confidence, etc.
}
```

Completely unstructured — consumers get `unknown` records and must re-validate against `ResumeSchema` (resume.schema.ts) themselves. Flag: docs quality issue — no typed contract exposed to clients.

Related request schemas in the same file:
- `GenerateCvRequestSchema` (`:6-8`): `{ prompt: string(1..50_000) }` .strict()
- `ResumeValidateRequestSchema` (`:12-14`): `{ resume: record }` .strict()
- `ResumeRenderRequestSchema` (`:18-22`): `{ resume, theme(1..50), format: 'pdf'|'html' default 'pdf' }` .strict()
- `ResumePreviewRequestSchema` (`:26-29`): `{ resume, theme(1..50) }` .strict()
- `ResumeImportRequestSchema` (`:33-35`): `{ data: record }` .strict() (RxResume import)
- `ResumeExportRequestSchema` (`:39-42`): `{ resume, designBlob? }` .strict()

Response schemas: `ResumeValidateResponse` (`:75-80`), `ResumeRenderPdfResponse` (base64 `pdf` string, `:85-91`), `ResumeRenderHtmlResponse` (`:96-99`), `ResumePreviewResponse` (`:113-115`), `ThemeListResponse` (`:130-131`), `ResumeImportResponse` (`:136-139`), `ResumeExportResponse` (`:144-146`).

## f) Exported size/length constants

**None.** All limits are inline literals:
- Master resume rawText: `100_000` chars (master-resume.schema.ts:5)
- Master resume label: `200` chars (:4)
- Job text: `50_000` chars (upload.schema.ts:8)
- Job URL: `2_048` chars (upload.schema.ts:9)
- CV prompt: `50_000` chars (resume-api.schema.ts:7)
- Theme name: `50` chars (resume-api.schema.ts:20, 28)
- Upload resume file size: `10 MB` — only in surface description string, NOT in any exported const.

Flag: file-size limit is not a shared constant — frontend/extension must hardcode `10_485_760` independently, risking drift with backend Multer config.

## Chrome Extension implications

1. `/upload/resume` = multipart only. Extension needs `FormData` + `fetch`, not base64 JSON.
2. `/upload/job-text` accepts JSON with `text` OR `url` — extension can scrape page and POST `{ text }` or `{ url: location.href }`.
3. `master-resume.upsert` accepts `{ label, rawText, structuredData? }` JSON — extension can re-upsert after parse.
4. Parse response is untyped record — extension should call `POST /upload/resume` then parse returned `resume` field as opaque JSON (or call `/resume/parse` separately if pre-signed).
5. No shared max-file-size const — extension should validate 10 MB client-side (`10 * 1024 * 1024` bytes) against a hardcoded constant with a TODO to export from shared-types. Fix `resume.surface.ts:39` as part of this plan (surface doc drift: 20 MB → 10 MB).
6. Field name for the multipart part MUST be `file` — `FileInterceptor('file', ...)` hardcodes it; any other field name returns 400 "File is required".
7. No client-visible MIME allowlist — extension should still pre-filter to `.pdf`/`.docx`/`.doc` by extension + `file.type` to avoid wasted roundtrips, but final authority is server-side magic-byte sniff inside `uploadService.ingestResume`.

Confidence: 100%
Filename: 24-resume-upload-schemas.md
