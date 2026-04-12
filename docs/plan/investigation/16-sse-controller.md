# Agent 16 — SSE Controller Investigation

Scope: `api/src/gateways/sse.controller.ts` (HTTP layer only).

## a) Endpoint Path
- Controller base: `@Controller('stream')` at `sse.controller.ts:46`
- Route: `@Get('generation/:generationId')` at `sse.controller.ts:64`
- Global prefix `api/v1` set in `api/src/main.ts:87` via `app.setGlobalPrefix(NESTJS_GLOBAL_PREFIX, { exclude: ['/metrics'] })` — the prefix is `'api/v1'` (no leading slash per NestJS requirement), and `/stream/**` is NOT in the exclude list, so it IS prefixed.
- **Full path: `GET /api/v1/stream/generation/:generationId`**
- Also exposed: `GET /api/v1/stream/health` (`sse.controller.ts:136`) — unauthenticated health ping returning a single `health` event (same prefix applies).

## b) Path Parameters
- Single param: `:generationId` (`sse.controller.ts:79`). No `:sessionId` variant.
- Validation (`sse.controller.ts:83-85`):
  - Non-empty
  - `length <= 128` (`GENERATION_ID_MAX_LENGTH`)
  - Regex `^[a-zA-Z0-9_-]+$` (`GENERATION_ID_PATTERN`)
  - Rejects reserved keys `__proto__`, `constructor`, `prototype` (prototype-pollution guard, `sse.controller.ts:29`)
  - Invalid -> `BadRequestException` (HTTP 400)

## c) Guards + Scope
- `@UseGuards(AuthGuard, ScopeGuard)` (`sse.controller.ts:68`)
- `@UseInterceptors(ApiKeyAuditInterceptor)` (`sse.controller.ts:69`)
- `@RequireScope('sessions:read')` (`sse.controller.ts:70`)
- Swagger: `@ApiBearerAuth('bearer')` + `@ApiSecurity('api-key')` (`sse.controller.ts:66-67`) — accepts either SuperTokens bearer or platform API key.
- `CurrentUser` decorator injects `UserContext` with `uid` + `authSource` (`sse.controller.ts:80`, used at `:98-102`).
- The health endpoint (`sseHealth`) has **no guards** — publicly accessible.

## d) Response Content Type + Headers
- Uses NestJS `@Sse()` decorator (`sse.controller.ts:65`). NestJS's built-in SSE response handler (platform-express) sets the following headers automatically on the underlying `ServerResponse`:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **No explicit `@Header()` decorators** are attached to `streamGeneration` — verified by grep for `X-Accel-Buffering` / `Cache-Control` / `text/event-stream` across `api/src` (no matches in `sse.controller.ts` beyond the Swagger `@ApiResponse` declaration at `:74`).
- **`X-Accel-Buffering: no` is NOT set.** This is a gap for nginx/Cloudflare deployments — proxies may buffer SSE responses unless the header is present. Controller relies on `@Sse()` defaults and upstream proxy config (Cloudflare Tunnel + nginx are expected to respect `Content-Type: text/event-stream` but this is not belt-and-braces).
- Swagger declares `content: { 'text/event-stream': { schema: { type: 'string' } } }` (`sse.controller.ts:74`).
- Returns `Observable<MessageEvent>` (`sse.controller.ts:82`). Each emission is mapped to `{ data: JSON.stringify(seq.event), id: String(seq.id) }` (`sse.controller.ts:106-109`), so every SSE frame carries an `id:` line (prerequisite for client `Last-Event-ID` replay). **No `retry:` field is emitted** — clients fall back to the browser/EventSource default reconnect interval (~3s in Chrome).

## e) Last-Event-ID Header Support
- **Yes.** `@Headers('last-event-id') lastEventId?: string` (`sse.controller.ts:81`). Matches the standard SSE header name (case-insensitive per HTTP — NestJS / Node normalises request headers to lowercase, so the decorator key `'last-event-id'` reliably captures client-sent `Last-Event-ID` regardless of case).
- Parsing (`sse.controller.ts:90-92`), line-by-line:
  1. `const trimmedId = typeof lastEventId === 'string' ? lastEventId.trim() : undefined;` — defensive string-check + trim.
  2. `const parsedId = trimmedId && trimmedId.length > 0 ? Number(trimmedId) : undefined;` — empty/whitespace-only becomes `undefined` (BUG-25 guard — prevents `Number('')===0` false replay-from-zero). `Number()` is strict (rejects trailing non-numeric chars, BUG-15, unlike `parseInt`).
  3. `const validId = parsedId != null && Number.isInteger(parsedId) && parsedId >= 0 ? parsedId : undefined;` — accept only non-negative integers; `NaN` / floats / negatives fall through to `undefined`.
  - Resulting `validId` is passed to `generationStreamService.getStream(generationId, user.uid, validId)` (`sse.controller.ts:105`).
- **Native `EventSource` reconnection**: Chrome's native `EventSource` automatically sends `Last-Event-ID` header on reconnect with the last `id:` seen, enabling zero-config resume. Chrome extensions using `fetch` + manual SSE parsing must set the header themselves.

## f) Buffered Replay
- **Yes (delegated).** Controller forwards `validId` into `generationStreamService.getStream(...)`. The class doc-comment at `sse.controller.ts:41-42` states: "Supports Last-Event-ID header for mid-stream reconnection with automatic replay of missed events from the ring buffer." Implementation lives in `generation-stream.service.ts` (agent 17 scope — not read here).

## g) Keepalive / Heartbeat Interval
- Controller itself emits no heartbeats. Class doc-comment (`sse.controller.ts:37`) notes `Heartbeat events (keeps proxy connections alive)` are part of the event stream, but frequency/mechanics live in `GenerationStreamService` (agent 17).

## h) Disconnection Handling
- `finalize(() => this.logger.debug(...))` (`sse.controller.ts:127-129`) logs closure; no extra server-side cleanup in the controller — relies on RxJS teardown + service-level subscription management.
- `catchError` (`sse.controller.ts:110-126`) traps stream errors, classifies `not found` / `No stream` substrings into `STREAM_NOT_FOUND` vs generic `STREAM_ERROR`, and emits a single synthetic `error` MessageEvent with `{ jobId, sessionId: '', code, message }` before completing. The internal error text is logged but **not** leaked to the client (returns generic `"Stream not found"` / `"Stream error occurred"`).

## i) Reconnect to In-Flight Stream
- **Yes.** Controller doc-comment (`sse.controller.ts:56-59`): "Used for reconnection after page reload or connection drop. The initial POST endpoint (agent controller) uses the same underlying stream via GenerationLifecycleService." `hasStream` is checked at `:94` and logged. A Chrome extension can call `GET /api/v1/stream/generation/:generationId` with the known `generationId` + optional `Last-Event-ID` and resume mid-stream.
- **Reconnection semantics**:
  - Client-driven: server emits no `retry:` field, so reconnect cadence is client-dictated (native `EventSource` defaults to ~3s exponential backoff; `fetch`-based clients must implement their own).
  - Idempotent: repeated calls with the same `generationId` (no `Last-Event-ID`) replay the full ring buffer from event 0; with `Last-Event-ID: N` the service resumes from `N+1` (implementation in `generation-stream.service.ts`, agent 17 scope).
  - Auth revalidated on each reconnect: `AuthGuard` + `ScopeGuard` run on every new HTTP request, so a revoked API key or expired SuperTokens session will fail the reconnect with 401.
  - Ownership revalidated on each reconnect: `user.uid` is passed into `getStream(generationId, user.uid, validId)` at `:105` — service-layer ownership check runs per-connection.

## j) Skip Throttle
- **Yes.** Class-level `@SkipThrottle()` (`sse.controller.ts:45`) bypasses the global rate limiter — long-lived streams would otherwise trip per-IP quotas.

## k) CORS / Credentials / Auth Modes for Chrome Extension
- Controller declares no CORS metadata — relies on the global CORS config in `api/src/main.ts:45-62`.
- Global CORS config (verified):
  - `origin`: `[...FRONTEND_URL.split(','), ...API_CORS_ORIGINS.split(',')]` — dynamic allowlist. To accept a Chrome extension, the extension's `chrome-extension://<extension-id>` origin MUST be added to `API_CORS_ORIGINS` env var (or `FRONTEND_URL`).
  - `credentials: true` — allows cookie-based auth and exposes response headers to credentialed XHR.
  - `allowedHeaders`: includes `Authorization`, `X-API-Key`, `Content-Type`, `fdi-version`, `rid`, `st-auth-mode` — sufficient for both SuperTokens bearer and platform API key. **`Last-Event-ID` is NOT in the list** — this is benign for native `EventSource` (no preflight triggered since SSE is a simple GET with no custom headers from EventSource itself), but **if the extension uses `fetch()` and sets `Last-Event-ID` manually, the browser will issue a preflight and the server will reject it**. To support manual-fetch reconnection the CORS `allowedHeaders` must be expanded to include `Last-Event-ID`.
  - `methods` includes `GET`, `OPTIONS` — SSE + preflight both covered.

- **Three auth modes accepted by `AuthGuard`** (see `sse.controller.ts:66-70` + `@ApiBearerAuth`/`@ApiSecurity`/cookie support in `main.ts:105-107`):
  1. **Platform API key** (`X-API-Key: llmc_...` header) — preferred for Chrome extension MVP. No credentials/cookie complexity, no preflight for simple GET if only `X-API-Key` is the custom header (still triggers preflight since `X-API-Key` is non-safelisted; covered by `allowedHeaders`). Scope must include `sessions:read`.
  2. **SuperTokens bearer** (`Authorization: Bearer <token>`) — triggers preflight (non-safelisted `Authorization` header); covered by `allowedHeaders`. Works with `credentials: 'omit'` since the token is in the header, not a cookie.
  3. **SuperTokens cookie** (`Cookie: sAccessToken=...`) — native `EventSource` automatically sends cookies for same-site requests. For a Chrome extension (cross-origin `chrome-extension://` to `llmconveyors.com`), cookies will NOT be sent unless the extension has explicit `"host_permissions"` for the API host AND uses `EventSource` with `withCredentials: true` AND the extension's origin is in the CORS allowlist. **Fragile** — the MVP should prefer API key auth and avoid cookie auth.

- **Recommendation for extension MVP**: Use `X-API-Key` header + `fetch`+`ReadableStream` SSE parsing (since `EventSource` does not support custom headers — a well-known limitation). Use API key scoped to `sessions:read` minimum. CORS preflight will be triggered by the custom header and must be passed by adding the extension origin to `API_CORS_ORIGINS`. If reconnection with `Last-Event-ID` is required, also add `Last-Event-ID` to the global `allowedHeaders` list in `main.ts:49`.
- No extra controller-level headers set; no controller-level CORS overrides.

## Notable Observations
- No `:sessionId` streaming endpoint — extension must track `generationId` returned by the POST create/run endpoint.
- Validation regex intentionally excludes `.` — any Mongo ObjectId-based ID would still pass (24-char hex).
- `CurrentUser` is passed to `getStream` for ownership enforcement at the service layer (not checked in controller).

Confidence: 100%
Filename: 16-sse-controller.md
