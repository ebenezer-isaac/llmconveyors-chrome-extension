# Agent 30: Frontend API Client + Auth (for WXT Extension)

Scope: `src/lib/api/**` and `src/lib/auth/**`.

## (a) File Inventory — Complete Exports, Imports, Signatures

### src/lib/api/

#### `authenticated-client.ts` (16L) — NOT PORTABLE (Next server-only)
- **Exports**: `getAuthenticatedClient(): Promise<ServerApiClient>`
- **Imports**: `requireServerAuthTokens` from `@/lib/auth`; `ServerApiClient` from `@/lib/api/server-client`
- **Env vars**: none directly (delegates to child modules)
- **Next-specific**: transitively via `requireServerAuthTokens` (reads `cookies()`)
- **Portability**: NO — replace entirely in extension with a factory that pulls the token from `chrome.cookies.get` then constructs `new ServerApiClient(token, EXT_BASE)`

#### `config.ts` (18L) — PARTIAL
- **Exports**: `getApiBaseUrl(): string`
- **Imports**: none
- **Env vars**: `process.env.API_INTERNAL_URL`, `process.env.NEXT_PUBLIC_API_URL` (fallback `http://localhost:4000`)
- **Next-specific**: none (pure logic)
- **Portability**: PARTIAL — logic is pure; must replace env reads with extension config constant (e.g. `import.meta.env.VITE_API_URL` in WXT, or a hardcoded `https://llmconveyors.com` + `/api/v1`)

#### `error-utils.ts` (15L) — PORTABLE
- **Exports**: `sanitizeErrorMessage(e: unknown, fallback: string): string`
- **Imports**: `ApiError` from `@/lib/api/server-client`
- **Env vars**: none
- **Next-specific**: none
- **Portability**: YES — lift verbatim; only depends on the portable `ApiError`

#### `fetch-with-retry.ts` (68L) — PORTABLE
- **Exports**: `isConnectionError(error: unknown): boolean`, `fetchWithRetry(url: string, init?: RequestInit): Promise<Response>`
- **Imports**: none (pure standards)
- **Env vars**: none
- **Constants**: `MAX_RETRIES=4`, `INITIAL_BACKOFF_MS=750` (5 total attempts: 0, 750, 1500, 3000, 6000ms)
- **Internal**: `abortAwareBackoff(ms, signal?)` — not exported
- **Next-specific**: none
- **Portability**: YES — lift verbatim. Uses `fetch`, `AbortSignal`, `DOMException`, `AggregateError`, `TypeError` — all available in MV3 service workers.

#### `proxy-error.ts` (148L) — PARTIAL (Next Response + one internal dep)
- **Exports**: `buildProxyErrorResponse(status: number, rawText: string): Response`, `sanitizeErrorMessage(error: unknown, fallback: string): string`
- **Imports**: `containsUnsafePattern` from `@/lib/unsafe-error-patterns`
- **Env vars**: none
- **Constants**: `MAX_ERROR_MESSAGE_LENGTH=200`, `SAFE_ERROR_CODES` (10 codes), `SECURITY_HEADERS`, `STATUS_MESSAGES` (10 codes)
- **Internal**: `tryParseJson`, `isSafeMessage`
- **Next-specific**: `Response.json()` (global Fetch API — actually available in MV3 service workers too, so OK)
- **Portability**: PARTIAL — depends on `unsafe-error-patterns.ts` (which is itself pure and portable). Lift both.

#### `proxy-handler.ts` (146L) — NOT PORTABLE (Next-only)
- **Exports**: `proxyGet(req, path)`, `proxyPost(req, path, body)`, `proxyDelete(req, path)` — all return `Promise<Response>`
- **Imports**: `NextRequest` from `next/server`; `getServerAuthTokens` from `@/lib/auth`; `getApiBaseUrl` from `@/lib/api/config`; `fetchWithRetry` from `@/lib/api/fetch-with-retry`; `buildProxyErrorResponse`, `sanitizeErrorMessage` from `@/lib/api/proxy-error`; `API_PREFIX` from `@repo/shared-types`; `createDebugLogger`, `REQUEST_ID_HEADER` from `@/lib/debug-logger`; `runWithRequestIdContext` from `@/lib/logging/request-id-context`
- **Env vars**: via `getApiBaseUrl()`
- **Constants**: `PROXY_TIMEOUT_MS=30_000`
- **Next-specific**: `NextRequest`, server `cookies()` (transitively)
- **Portability**: NO — extension has no proxy layer; it talks directly to NestJS

#### `server-client.ts` (378L) — PORTABLE (HEADLINE MODULE)
- **Exports**: `ApiError` (class with `status`, `statusText`, `data`), `ServerApiClient` (class)
- **Imports**: `ApiSessionResponse` (type) from `./transformers`; `UploadResumeResponse`, `ProcessJobResponse` from `./types`; `getApiBaseUrl` from `./config`; `fetchWithRetry` from `./fetch-with-retry`; `AgentManifestResponse`, `DocType`, `API_PREFIX`, plus type-only `ReferralStatsResponse`, `AtsScoreResult`, `ConsentRecord`, `ShareCardData` — all from `@repo/shared-types`
- **Env vars**: transitively via `getApiBaseUrl()` only for default baseUrl — constructor accepts override
- **Next-specific**: NONE — uses only global `fetch`, `Headers`, `FormData`, `Blob`, `File`
- **Constructor**: `new ServerApiClient(token: string, baseUrl?: string = getDefaultApiUrl())`
- **Private**: `apiFetch<T>(path, options)` — attaches Bearer, sets Content-Type, calls `fetchWithRetry`, handles 204 (throws), handles PDF/zip (returns Blob), unwraps `{success,data}` envelope
- **Public groups** (each a readonly object literal):
  - `sessions`: `create`, `delete`, `getInitData`
  - `upload`: `resume(file, filename?)`, `jobText(text, url?)`
  - `resume`: `render(resume, options?)`
  - `content`: `save`, `deleteGeneration`, `researchSender`
  - `settings`: `updatePreferences`, `getUsageSummary`, `getUsageLogs`, `createPlatformApiKey`, `listPlatformApiKeys`, `revokePlatformApiKey`, `getProviderKeyStatus`, `getSupportedProviders`, `setProviderKey`, `removeProviderKey`
  - `referral`: `getStats`, `getCode`, `setVanityCode`
  - `ats`: `score`
  - `agents`: `getManifest`
  - `privacy`: `getConsents`, `grantConsent`, `withdrawConsent`, `exportData`, `deleteAccount`
  - `shares`: `create`, `getPublic`
- **Portability**: YES — the whole class is portable. Only change: strip the `getDefaultApiUrl()` fallback to require `baseUrl` explicitly in the constructor (eliminates the `config.ts`/`process.env` coupling).

#### `sse-proxy.ts` (262L) — NOT PORTABLE (Next-only; pattern is reference)
- **Exports**: `createAgentProxy(backendPath: string)`, `createStreamProxy()` — both return Next route handlers
- **Imports**: `NextRequest` from `next/server`; `getServerAuthTokens` from `@/lib/auth`; `getApiBaseUrl` from `@/lib/api/config`; `createDebugLogger`, `REQUEST_ID_HEADER` from `@/lib/debug-logger`; `runWithRequestIdContext` from `@/lib/logging/request-id-context`; `buildProxyErrorResponse`, `sanitizeErrorMessage` from `@/lib/api/proxy-error`; `API_STREAM_PREFIX` from `@repo/shared-types`
- **Env vars**: via `getApiBaseUrl()`
- **Constants**: `SSE_STREAM_TIMEOUT_MS=75*60_000`, `MAX_REQUEST_BODY_SIZE=2*1024*1024`, `UUID_V4_REGEX`
- **Portability**: NO — but the extension should replicate the patterns (forward `Last-Event-ID`, UUID validation, 2MB body cap, 75min timeout) when it opens its OWN EventSource/fetch against NestJS directly.

#### `transformers.ts` (154L) — PORTABLE (pure)
- **Exports**: `ApiSessionResponse` (interface), `PaginatedSessionsResponse` (interface), `isPaginatedResponse(raw): raw is PaginatedSessionsResponse`, `isValidSessionPayload(value): value is ApiSessionResponse`, `SESSION_TITLE_FALLBACK` (const), `transformSession(record): SerializableSession`, `transformSessions(records): SerializableSession[]`
- **Imports**: type-only `SerializableSession`, `SerializableChatMessage`, `ChatMessageKind`, `SessionStatus` from `@/types/session`
- **Internal**: `isChatMessageKind`, `metadataString`, `deriveTitle`, `isValidTimestamp`, `capLength`, `isValidChatEntry`, `mapChatHistory`, `ApiChatEntry` (internal interface)
- **Constants**: `MAX_CHAT_CONTENT_LENGTH=100_000`, `VALID_CHAT_KINDS` (Set)
- **Next-specific**: none
- **Portability**: YES — pure transformation. The only coupling is type imports from `@/types/session`; either copy that file or inline the 4 types.

#### `types.ts` (33L) — PORTABLE
- **Exports**: `UploadResumeResponse` (interface), `ProcessJobResponse` (interface)
- **Imports**: none
- **Env vars**: none
- **Portability**: YES — pure type defs

#### `audit.issues.md` — not code

### src/lib/auth/

#### `index.ts` (88L) — PARTIAL (core logic portable, cookie source replaced)
- **Exports**: `AuthTokens` (interface: `{ token: string; decodedToken: { uid: string } }`), `getServerAuthTokens(): Promise<AuthTokens | null>`, `requireServerAuthTokens(): Promise<AuthTokens>`
- **Imports**: `cookies` from `next/headers`; `createDebugLogger` from `@/lib/debug-logger`; `SESSION_COOKIE_NAME`, `TOKEN_EXPIRY_GRACE_SECONDS` from `./config`
- **Internal**: `decodeTokenPayload(token)` — JWT payload decode via `Buffer.from(parts[1], 'base64url')`, sanitizes `sub` (strips `\x00-\x1f\x7f`, 128 char cap); `isTokenExpired(exp)` — nowSeconds > exp + grace
- **Constants**: `MAX_UID_LENGTH=128`
- **Env vars**: none
- **Next-specific**: `cookies()` from `next/headers`
- **Node-specific**: `Buffer` — MV3 service workers don't have Buffer; must replace with `atob(parts[1].replace(/-/g,'+').replace(/_/g,'/'))` or use `TextDecoder`
- **Portability**: PARTIAL — decode + expiry logic is portable with the Buffer→atob swap; cookie read must become `chrome.cookies.get({ url:'https://llmconveyors.com', name:'sAccessToken' })`

#### `config.ts` (132L) — PARTIAL
- **Exports**: `SESSION_COOKIE_NAME='sAccessToken'`, `TOKEN_EXPIRY_GRACE_SECONDS=30`, `SUPERTOKENS_API_BASE_PATH='/auth'`, `getSuperTokensWebsiteBasePath(): string`, `GOOGLE_CALLBACK_PATH='/auth/callback/google'`, `sanitizeRedirectPath(path, fallback?='/'): string`, `resolveAgentLoginPath(redirectPath): string`, `sanitizeAuthError(error, fallbackKey?): string`, `isPublicPagePath(pathname): boolean`, `isBypassPath(pathname): boolean`
- **Imports**: `PUBLIC_ROUTE_SEGMENTS`, `PUBLIC_MIDDLEWARE_BYPASS_REGEX` from `@/lib/auth/shared`; `AGENT_REGISTRY` from `@/config/agents`
- **Internal**: `normalizePath`, `NORMALIZED_PUBLIC_ROUTES` (Set)
- **Constants**: `MAX_REDIRECT_PATH_LENGTH=2048`, `PUBLIC_PATH_PREFIXES=['/share/', '/docs/']`
- **Env vars**: none
- **Next-specific**: uses `window.location` in `getSuperTokensWebsiteBasePath` (browser-only; extension popup has window)
- **Portability**: PARTIAL — lift the constants (`SESSION_COOKIE_NAME`, `TOKEN_EXPIRY_GRACE_SECONDS`, `SUPERTOKENS_API_BASE_PATH`), `sanitizeRedirectPath`, `sanitizeAuthError`. Skip the agent-registry-dependent helpers (`resolveAgentLoginPath`, `isPublicPagePath`, `isBypassPath`, `getSuperTokensWebsiteBasePath`) — extension doesn't need them.

#### `shared.ts` (33L) — PARTIAL (depends on agent registry)
- **Exports**: `DEFAULT_LOGIN_PATH` (const, derived from registry), `LOGIN_REDIRECT_PARAM_KEY='redirect'`, `LOGIN_STATUS_PARAM_KEY='loginStatus'`, `PUBLIC_ROUTE_SEGMENTS` (array), `PUBLIC_MIDDLEWARE_BYPASS_REGEX` (array of RegExp)
- **Imports**: `AGENT_IDS`, `AGENT_REGISTRY` from `@/config/agents`
- **Portability**: PARTIAL — extension doesn't need any of these. Skip entirely.

#### `supertokens.ts` (40L) — NOT PORTABLE (client-only SDK)
- **Exports**: `ensureSuperTokensInit(): void`
- **Imports**: `SuperTokens` from `supertokens-auth-react`; `ThirdParty`, `Google` from `supertokens-auth-react/recipe/thirdparty`; `Session` from `supertokens-auth-react/recipe/session`; `clientEnv` from `@/lib/env-client`; `SUPERTOKENS_API_BASE_PATH`, `getSuperTokensWebsiteBasePath` from `./config`; `crossSubdomainWindowHandler` from `./cross-subdomain-storage`
- **Directives**: `'use client'`
- **Portability**: NO — `supertokens-auth-react` is a React-DOM SDK. Extension cannot init SuperTokens itself; it MUST piggyback on the session cookie that the main web app already set on `.llmconveyors.com`.

#### `cross-subdomain-storage.ts` (247L) — NOT PORTABLE (DOM-specific)
- **Exports**: `OAUTH_STATE_KEY`, `AUTH_REDIRECT_KEY`, `AUTH_ORIGIN_KEY`, `getRootDomain()`, `isSameRootDomain(hostname)`, `getCrossSubdomainValue`, `setCrossSubdomainValue`, `removeCrossSubdomainValue`, `crossSubdomainWindowHandler(original)`
- **Imports**: `clientEnv` from `@/lib/env-client`
- **Directives**: `'use client'`
- **Portability**: NO — uses `document.cookie`, `window.location`; extension doesn't do OAuth itself

#### `README.md`, `audit.issues.md` — not code

#### Transitive dep: `src/lib/unsafe-error-patterns.ts` (39L) — PORTABLE
- **Exports**: `UNSAFE_ERROR_PATTERNS` (readonly array of 13 RegExp), `containsUnsafePattern(message: string): boolean`
- **Imports**: none
- **Portability**: YES — pure regex library. Lift verbatim.

## (b) Auth attachment

Two paths:
1. **Server → NestJS** (`ServerApiClient.apiFetch`, `server-client.ts:61-63`): explicit `Authorization: Bearer ${token}` header. Token is the raw `sAccessToken` JWT lifted from Next.js cookie store via `getServerAuthTokens` (`auth/index.ts:23-47`).
2. **Browser → Next.js proxy routes**: implicit — SuperTokens `Session.init({ tokenTransferMethod: 'cookie' })` (`supertokens.ts:31`) auto-attaches `sAccessToken` on same-origin/.subdomain fetch. Proxy handlers (`proxy-handler.ts:81-87`, `sse-proxy.ts:56-63`) read that cookie and re-emit a Bearer header to NestJS.

No frontend code sends a Bearer header itself; the SDK owns cookies, the server owns Bearer injection.

## (c) `fetchWithRetry`

`fetch-with-retry.ts:49-67`. Calls `fetch(url, init)` up to 5 times (`MAX_RETRIES+1`). Retries ONLY on `isConnectionError` (TypeError "fetch failed" with cause `ECONNREFUSED`/`ENOTFOUND`, including `AggregateError` unwrap). Backoff via abort-aware sleep. No header injection, no auth, no retry-after, no 5xx retry. Pure transport.

## (d) Retry

- File: `src/lib/api/fetch-with-retry.ts`
- Attempts: `MAX_RETRIES=4` + 1 = 5 total
- Backoff: 750, 1500, 3000, 6000 ms (exponential from `INITIAL_BACKOFF_MS=750`)
- Only transient connection errors retry. HTTP errors do not.
- Abort-aware — cancels mid-backoff immediately.

## (e) Error normalization

1. **`ApiError`** (`server-client.ts:23-42`): wraps non-ok responses. Flattens NestJS `{message: string[]}` validation errors with `.join('; ')`. Unwraps `{success:false, error:{...}}` envelope (`:86-87`). Exposes `status`, `statusText`, `data`.
2. **`buildProxyErrorResponse`** (`proxy-error.ts:96-137`): whitelist of 10 `SAFE_ERROR_CODES`, `STATUS_MESSAGES` fallback, 200-char cap, unsafe-pattern strip, sanitized `fieldErrors` passthrough for `VALIDATION_ERROR`. Shape: `{ code, message, details? }`.

Success envelope unwrapped at `server-client.ts:112-115`, mirrored in `proxy-handler.ts:129-131` and `sse-proxy.ts:145-148`.

## (f) MINIMAL file set for Chrome extension

Exact files to copy (9 files total):

### COPY VERBATIM (5)
1. `src/lib/api/fetch-with-retry.ts`
2. `src/lib/api/types.ts`
3. `src/lib/api/error-utils.ts`
4. `src/lib/unsafe-error-patterns.ts`
5. `src/lib/api/transformers.ts` (inline or copy the 4 types from `src/types/session.ts`)

### COPY WITH MINOR EDIT (3)
6. `src/lib/api/server-client.ts` — remove `getDefaultApiUrl` helper; make `baseUrl` REQUIRED in constructor: `constructor(private token: string, private baseUrl: string)`. Delete `import { getApiBaseUrl } from './config'` and `import { API_PREFIX } from '@repo/shared-types'` (or inline `API_PREFIX='/api/v1'`). Everything else — all 10 API groups, `ApiError`, envelope unwrap, Blob handling, 204 assertion — lifts unchanged.
7. `src/lib/api/proxy-error.ts` — keep only `SAFE_ERROR_CODES`, `STATUS_MESSAGES`, `tryParseJson`, `isSafeMessage`, `buildProxyErrorResponse` (returning plain object `{ code, message, details? }` instead of `Response.json`), and `sanitizeErrorMessage`. Keeps the `containsUnsafePattern` dep (file #4 above).
8. `src/lib/auth/config.ts` — lift ONLY: `SESSION_COOKIE_NAME`, `TOKEN_EXPIRY_GRACE_SECONDS`, `SUPERTOKENS_API_BASE_PATH`, `sanitizeRedirectPath`, `sanitizeAuthError`. Drop everything else (agent-registry coupled).

### REWRITE (1)
9. `src/lib/auth/index.ts` — port `decodeTokenPayload` + `isTokenExpired` as-is, BUT:
   - Replace `Buffer.from(parts[1], 'base64url').toString()` with a browser-safe base64url decode (`atob` with `-`/`_` normalization, then `decodeURIComponent(escape(...))` or `TextDecoder`).
   - Replace `cookies()` (from `next/headers`) with `chrome.cookies.get({ url: EXT_COOKIE_URL, name: SESSION_COOKIE_NAME })` where `EXT_COOKIE_URL='https://llmconveyors.com'`.
   - Drop the `@/lib/debug-logger` dependency (or shim to `console`).

### DO NOT COPY (6)
- `authenticated-client.ts` — Next server factory, thin wrapper
- `proxy-handler.ts` — NextRequest
- `sse-proxy.ts` — NextRequest (but mimic `createStreamProxy` semantics: forward `Last-Event-ID`, UUID v4 validation, 75min timeout, 2MB body cap)
- `config.ts` (api) — replace with extension-side constant
- `auth/supertokens.ts` — React SDK, client-only
- `auth/cross-subdomain-storage.ts` — DOM-only
- `auth/shared.ts` — agent-registry coupled, extension doesn't need it

## (g) Auth strategy for the extension — DEFINITIVE

**(b) `chrome.cookies.get` from `.llmconveyors.com`** — this is the correct approach.

Rationale: the main web app's SuperTokens config sets `sessionTokenFrontendDomain` to `.llmconveyors.com` (see `supertokens.ts:32`), so the `sAccessToken` cookie is already written on that parent domain by the browser-side SDK whenever a user is signed in on the web. A Chrome extension with `host_permissions: ["*://*.llmconveyors.com/*"]` and `permissions: ["cookies"]` in `manifest.json` can read that cookie via:

```
const c = await chrome.cookies.get({ url: 'https://llmconveyors.com', name: 'sAccessToken' });
const token = c?.value ?? null;
```

Why NOT the alternatives:
- **(a) Bearer from chrome.storage**: would require a separate sign-in flow inside the extension. Duplicates work, breaks the "single source of truth" principle. Token would go stale without a refresh mechanism.
- **(c) `st-auth-mode` header**: this is a SuperTokens backend config knob (header vs cookie transfer). Switching it would require reconfiguring the NestJS SuperTokens middleware AND the main web app. Out of scope for an MVP extension.

The extension flow is:
1. `chrome.cookies.get` → raw JWT string
2. `decodeTokenPayload` → check `sub` and `exp` (unverified, same as web app)
3. If expired/missing → show "Sign in to llmconveyors.com" button that opens `https://llmconveyors.com/login` in a new tab; user signs in, SuperTokens sets the cookie; extension polls or uses `chrome.cookies.onChanged` to detect the new cookie.
4. `new ServerApiClient(token, 'https://llmconveyors.com/api/v1')` — the port adjusts if dev uses `http://localhost:4000/api/v1`.
5. All API calls go direct to NestJS, bypassing the Next.js proxy layer entirely.

## (h) ServerApiClient portability — DEFINITIVE

`server-client.ts` is **PORTABLE STANDALONE**. It has zero Next.js coupling:

- No `next/*` imports. None.
- No `cookies()`, no `headers()`, no `NextRequest`/`NextResponse`.
- No `'use client'` / `'use server'` directive.
- No `process.env` access directly (the only env touch is indirect, via `getDefaultApiUrl()`'s call to `getApiBaseUrl()` in `config.ts`).
- Only globals used: `fetch`, `Headers`, `FormData`, `Blob`, `File`, `JSON`, `encodeURIComponent`, `Math` — all available in MV3 service workers and page contexts.
- Type deps: `@repo/shared-types` (7 type imports, all structural/compile-time — erase to plain interfaces at runtime).

The ONE edit needed is trivial: make `baseUrl` a required constructor arg and delete lines 1 (`getApiBaseUrl` import), 6 (`API_PREFIX` import), 16-18 (`getDefaultApiUrl` function), and change line 49 from:
```
baseUrl: string = getDefaultApiUrl(),
```
to:
```
baseUrl: string,
```

That unbinds it from `config.ts`. The rest of the 378 lines — all 10 API groups, `apiFetch`, `ApiError`, envelope unwrap, Blob passthrough for PDF/ZIP, 204 assertion, encodeURIComponent on 4 path params — all lifts as-is.

## Key security constants to preserve

- `ApiError.status === 204` is treated as a bug (`server-client.ts:101-103`) — keep the assertion.
- `PROXY_TIMEOUT_MS = 30_000` for REST (`proxy-handler.ts:13`); `SSE_STREAM_TIMEOUT_MS = 75*60_000` for streams (`sse-proxy.ts:15`). Adopt both client-side via `AbortSignal.timeout`.
- `MAX_REQUEST_BODY_SIZE = 2 MB` (`sse-proxy.ts:22`).
- `UUID_V4_REGEX` validated before opening a stream (`sse-proxy.ts:25,182-187`).
- Retry-After header forwarded only on 429 (`sse-proxy.ts:121-129`).
- `MAX_CHAT_CONTENT_LENGTH = 100_000` (`transformers.ts:4`).
- `MAX_UID_LENGTH = 128` for JWT sub sanitization (`auth/index.ts:59`).
- `UNSAFE_ERROR_PATTERNS` (13 regexes in `unsafe-error-patterns.ts`) — port verbatim for error sanitization in the extension UI.

## Dependency graph (what the extension ends up with)

```
ext/lib/api/server-client.ts
  ├── ext/lib/api/fetch-with-retry.ts   (pure)
  ├── ext/lib/api/types.ts               (pure)
  └── @repo/shared-types                 (type-only; inline or keep as workspace dep)

ext/lib/api/error-utils.ts
  └── ext/lib/api/server-client.ts (ApiError)

ext/lib/api/proxy-error.ts  (trimmed: no Response.json)
  └── ext/lib/unsafe-error-patterns.ts   (pure)

ext/lib/api/transformers.ts  (pure)
  └── ext/types/session.ts               (4 types, inline or copy)

ext/lib/auth/index.ts  (rewritten)
  ├── chrome.cookies API                 (MV3 built-in)
  └── ext/lib/auth/config.ts  (trimmed)
```

No Next.js imports anywhere. No React. No supertokens-auth-react. No DOM APIs required in the service worker path (`chrome.cookies.get` is worker-safe).

Confidence: 100%
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\30-frontend-api-client.md`
