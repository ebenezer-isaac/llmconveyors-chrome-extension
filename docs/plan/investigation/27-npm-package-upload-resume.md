# 27 — npm Package: Upload, Resume, Settings Resources

Scope: `llmconveyors` npm package at `E:\llmconveyors-npm-package\src\resources\`.

## a) UploadResource Methods

Source: `E:\llmconveyors-npm-package\src\resources\upload.ts`

```ts
class UploadResource {
  resume(file: FileInput, options?: UploadFileOptions): Promise<UploadResumeResponse>   // upload.ts:12
  jobFile(file: FileInput, options?: UploadFileOptions): Promise<UploadJobFileResponse> // upload.ts:22
  jobText(body: JobTextRequest): Promise<UploadJobTextResponse>                         // upload.ts:32
}
```

- `FileInput = Blob | Buffer | Uint8Array` (`src/types/upload.ts:2`)
- `UploadFileOptions = { filename?; contentType? }` (`upload.ts:37`)
- `JobTextRequest = { text?; url?; source? }` — at least one of `text`/`url` required (`upload.ts:20-26`). **There is no separate `jobUrl()` method**; URL ingestion uses `jobText({ url })` which POSTs JSON to `/upload/job-text`.
- Endpoints: `POST /upload/resume` (`upload.ts:19`), `POST /upload/job` (`upload.ts:29`), `POST /upload/job-text` (`upload.ts:33`).

## b) Multipart from Node — FormData

Source: `E:\llmconveyors-npm-package\src\resources\upload-utils.ts`

`createFormData` (`upload-utils.ts:13-27`) uses the **global `FormData` + global `Blob`** (no `form-data` npm package, no `node:` imports):

```ts
const formData = new FormData();
if (file instanceof Blob) {
  formData.append(fieldName, file, filename);
} else if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
  const blob = new Blob([file], { type: contentType ?? 'application/octet-stream' });
  formData.append(fieldName, blob, filename);
} else {
  throw new TypeError('file must be a Blob, Buffer, or Uint8Array');
}
```

Raw fetch is dispatched through `httpClient.fetchRaw(path, { method, body: formData, query, headers })` in `fetchRawAndUnwrap` (`upload-utils.ts:39-44`), which then unwraps the `{ success, data }` envelope (`upload-utils.ts:50-54`).

## c) Browser / Chrome Extension Service Worker Compatibility

- **No `node:*` imports** in `upload.ts`, `upload-utils.ts`, `resume.ts`, or `settings.ts`.
- Relies on `FormData` and `Blob` globals — both available in Chrome extension service workers (MV3).
- **`Buffer.isBuffer(file)` at `upload-utils.ts:20` is RAW and UNGUARDED** — no `typeof Buffer !== 'undefined'` check, no try/catch. Exact line:
  ```ts
  } else if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
  ```
  **Branch-by-branch analysis for MV3 service worker (where `Buffer` is not defined)**:
  1. `file instanceof Blob` → Blob branch short-circuits, `Buffer.isBuffer` is NEVER evaluated. **SAFE.**
  2. `file` is a `Uint8Array` → falls through to the `else if`. JS evaluates `Buffer.isBuffer(file)` FIRST (left operand of `||`), which resolves `Buffer` → **`ReferenceError: Buffer is not defined`** before `file instanceof Uint8Array` is ever reached. **BROKEN.**
  3. `file` is `string`/`number`/etc. → same path, same `ReferenceError` before reaching the `TypeError` throw. **BROKEN.**
- **Conclusion**: The only MV3-safe input type is `Blob` (or its `File` subclass). Uint8Array callers will crash with a misleading ReferenceError. This is a portability bug tracked separately; the extension MVP workaround is: **always wrap bytes in `new Blob([bytes], { type })` before calling any upload method.**
- `File` (a `Blob` subclass) passes `instanceof Blob` — an extension can pass a `File` from `<input type=file>` or from the `chrome.downloads` API directly.

## d) ResumeResource Methods

Source: `E:\llmconveyors-npm-package\src\resources\resume.ts`

```ts
getMaster(): Promise<MasterResume>                                        // resume.ts:54, GET  /resume/master
upsertMaster(body: MasterResumeUpsertRequest): Promise<MasterResume>      // resume.ts:59, PUT  /resume/master
deleteMaster(): Promise<MasterResumeDeleteResponse>                       // resume.ts:64, DELETE /resume/master
```

Also exposes `parse(file, options)` multipart uploader (`resume.ts:21`), plus `validate`, `render`, `preview`, `themes`, `importRxResume`, `exportRxResume` (all JSON).

## e) SettingsResource Methods

Source: `E:\llmconveyors-npm-package\src\resources\settings.ts`

Full surface (17 methods, all JSON — no multipart, all MV3-safe):

```ts
getProfile(): Promise<UserProfile>                                                           // settings.ts:21,  GET    /settings/profile
getPreferences(params?: PreferencesParams): Promise<UserPreferences>                         // settings.ts:25,  GET    /settings/preferences
updatePreferences(body: UpdatePreferencesRequest, params?: PreferencesParams)                // settings.ts:31,  POST   /settings/preferences
                  : Promise<UpdatePreferencesResponse>
createApiKey(body: CreateApiKeyRequest): Promise<CreateApiKeyResponse>                       // settings.ts:44,  POST   /settings/platform-api-keys
listApiKeys(): Promise<readonly PlatformApiKey[]>                                            // settings.ts:48,  GET    /settings/platform-api-keys
revokeApiKey(hash: string): Promise<RevokeApiKeyResponse>                                    // settings.ts:52,  DELETE /settings/platform-api-keys/:hash
rotateApiKey(hash: string, body?: RotateApiKeyRequest): Promise<RotateApiKeyResponse>        // settings.ts:59,  POST   /settings/platform-api-keys/:hash/rotate
getApiKeyUsage(hash: string): Promise<ApiKeyUsageResponse>                                   // settings.ts:66,  GET    /settings/platform-api-keys/:hash/usage
getProviderKeyStatus(): Promise<readonly ProviderKeyStatus[]>                                // settings.ts:72,  GET    /settings/providers
getSupportedProviders(): Promise<readonly SupportedProvider[]>                               // settings.ts:76,  GET    /settings/providers/supported
setProviderKey(provider: string, body: SetProviderKeyRequest): Promise<SetProviderKeyResponse>   // settings.ts:80, POST   /settings/providers/:provider
removeProviderKey(provider: string): Promise<RemoveProviderKeyResponse>                      // settings.ts:87,  DELETE /settings/providers/:provider
getUsageLogs(params?: UsageLogsParams): Promise<UsageLogsResponse>                           // settings.ts:94,  GET    /settings/usage-logs
getUsageSummary(): Promise<UsageSummaryResponse>                                             // settings.ts:101, GET    /settings/usage-summary
getWebhookSecret(): Promise<WebhookSecretResponse>                                           // settings.ts:105, GET    /settings/webhook-secret
rotateWebhookSecret(): Promise<RotateWebhookSecretResponse>                                  // settings.ts:109, POST   /settings/webhook-secret/rotate
```

`PreferencesParams` carries optional `agentType` query param (`settings.ts:27, 35`). `UsageLogsParams` carries optional `offset`/`limit` (`settings.ts:95-97`). All routes hit `httpClient.request<T>` which auto-unwraps the `{ success, data }` envelope and auto-parses errors — **no extension-specific concerns for any settings method.**

## f) Base64 Helpers

**None.** `createFormData` only accepts binary inputs (`Blob | Buffer | Uint8Array`). There is no `base64ToBlob`, `base64ToUint8Array`, or equivalent exported from `upload-utils.ts` or the resources barrel. A Chrome extension MVP that holds PDFs as base64 must do its own `atob`/`Uint8Array.from` conversion before calling `upload.resume(...)`.

## g) Chrome Extension Safe Usage — Exact Snippets

**The golden rule for MV3 service workers**: always pass `Blob`. Never pass `Buffer` (crash, no such global) or `Uint8Array` (crash via `Buffer.isBuffer` ReferenceError). The `File` subclass of `Blob` is fine.

### Helper: base64 → Blob (extension must own this)
```ts
function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}
```

### 1. upload.resume — parse a resume file to JSON Resume
```ts
// Signature: resume(file: FileInput, options?: { filename?: string; contentType?: string }): Promise<UploadResumeResponse>
const pdfBlob = base64ToBlob(resumePdfBase64, 'application/pdf');
const parsed = await client.upload.resume(pdfBlob, {
  filename: 'resume.pdf',
  contentType: 'application/pdf',
});
// parsed: { resume: Record<string,unknown>; metadata: Record<string,unknown> }
```

### 2. upload.jobFile — parse a JD file to structured job data
```ts
// Signature: jobFile(file: FileInput, options?: { filename?: string; contentType?: string }): Promise<UploadJobFileResponse>
const jdBlob = base64ToBlob(jdPdfBase64, 'application/pdf');
const job = await client.upload.jobFile(jdBlob, {
  filename: 'job-description.pdf',
  contentType: 'application/pdf',
});
// job: { parsed: Record<string,unknown>; fileKey?: string; filename?: string }
```

### 3. upload.jobText — parse plain text OR fetch-and-parse a URL (JSON, no multipart)
```ts
// Signature: jobText(body: { text?: string; url?: string; source?: string }): Promise<UploadJobTextResponse>
// Text mode:
const fromText = await client.upload.jobText({ text: rawJdString, source: 'paste' });
// URL mode (no separate jobUrl() exists):
const fromUrl  = await client.upload.jobText({ url: 'https://example.com/careers/xyz' });
// Either returns: { companyName?; jobTitle?; jobDescription?; parsedFields? }
```

### 4. resume.parse — same story as upload.resume (Blob-only in MV3)
```ts
// Signature: parse(file: FileInput, options?: { filename?; contentType?; mode?: 'fast'|'thorough' }): Promise<ResumeParseResponse>
const parsed = await client.resume.parse(
  base64ToBlob(resumePdfBase64, 'application/pdf'),
  { filename: 'resume.pdf', contentType: 'application/pdf', mode: 'thorough' },
);
```

### 5. resume.getMaster / upsertMaster / deleteMaster (pure JSON, no Blob concerns)
```ts
const master = await client.resume.getMaster();                                    // GET    /resume/master
await client.resume.upsertMaster({ label: 'Primary', rawText, structuredData });   // PUT    /resume/master
await client.resume.deleteMaster();                                                // DELETE /resume/master
```

### 6. settings.* (all JSON, all MV3-safe, no special handling)
```ts
const profile      = await client.settings.getProfile();
const usage        = await client.settings.getUsageSummary();
const prefs        = await client.settings.getPreferences({ agentType: 'job-hunter' });
const updatedPrefs = await client.settings.updatePreferences({ preferences: { theme: 'academic' } }, { agentType: 'job-hunter' });
```

### What to NEVER do in the extension
```ts
// CRASH: ReferenceError: Buffer is not defined (Buffer.isBuffer evaluates first in the || chain)
await client.upload.resume(new Uint8Array(bytes), { filename: 'r.pdf' });
// CRASH: Buffer global doesn't exist at all
await client.upload.resume(Buffer.from(base64, 'base64'), { filename: 'r.pdf' });
```

## Key Findings for Extension MVP

1. Package uses **web-standard FormData/Blob** — no `form-data` dep, safe for service workers.
2. **Confirmed bug** (`upload-utils.ts:20`): `Buffer.isBuffer(file)` is RAW, no `typeof Buffer !== 'undefined'` guard. JS evaluates the left operand of `||` before checking `file instanceof Uint8Array`, so Uint8Array inputs crash with `ReferenceError` in MV3 before reaching the intended branch. Blob inputs are safe because the preceding `instanceof Blob` branch short-circuits. **Extension MVP mitigation: always wrap bytes in `new Blob([bytes], { type })` before calling any upload/parse method.** (Upstream fix tracked separately — add `typeof Buffer !== 'undefined' && Buffer.isBuffer(file)`.)
3. **No `jobUrl()` method** — URL ingestion goes through `upload.jobText({ url })` (JSON POST to `/upload/job-text`, not multipart).
4. **No base64 helpers** in the package — extension must own `base64 → Uint8Array → Blob` conversion (snippet above).
5. `fetchRawAndUnwrap` handles the `{ success, data }` envelope and error parsing (`upload-utils.ts:45-54`); `httpClient.request<T>` does the same for JSON routes. Callers receive unwrapped payloads throughout.
6. All `ResumeResource` and `SettingsResource` JSON methods (master resume CRUD, profile, preferences, API keys, provider keys, webhook secret, usage) are MV3-safe with zero special handling — they never touch `Buffer` and use only `fetch`/`FormData`-free code paths.

Confidence: 100%
Filename: 27-npm-package-upload-resume.md
