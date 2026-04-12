# 53 — SuperTokens Bridge: Cookie-Session → Bearer Token Pair

**Scope**: exact mechanism to convert an existing SuperTokens cookie session (set by the Google OAuth web flow) into a header-mode `{ access, refresh }` token pair the Chrome extension can receive via `launchWebAuthFlow` redirect fragment. Ranks three approaches, picks one, gives a file-by-file brief.

## Context established by prior agents

- **01**: `Session.init` uses `exposeAccessTokenToFrontendInCookieBasedAuth: false` (`api/src/modules/auth/supertokens/supertokens.config.ts:91`). Cookie-mode JS cannot read the access token.
- **02**: `cookieDomain=.llmconveyors.com`, `cookieSameSite=lax`, `getTokenTransferMethod` NOT overridden → SuperTokens default: `"header"` mode is opt-in per request via `st-auth-mode: header`; missing header → cookie mode.
- **04**: `AuthGuard` → `authenticateSupertokens()` → `Session.getSession(req, res, { sessionRequired: true })`. SuperTokens transparently accepts cookie OR `Authorization: Bearer <access-token>`. No custom Bearer path.
- **05**: `ScopeGuard` bypasses scope checks entirely when `user.authSource !== 'api-key'` (`scope.guard.ts:49-52`). Session users = all scopes implicitly.
- **06**: `POST /api/v1/settings/platform-api-keys` mints `llmc_*` keys. Requires `settings:write`. Session users bypass scope enforcement (per 05), so any signed-in user can mint a key.
- **07**: API-key rate limits are strict (api-key tier = reduced).
- **35**: Header-mode flow fully mapped. `createNewSession(req, res, ...)` writes tokens via the per-request resolved transfer method; `st-auth-mode: header` forces header mode and response sets `st-access-token`, `st-refresh-token`, `front-token` + `Access-Control-Expose-Headers`. CORS allowlist in `api/src/main.ts:49` already includes `st-auth-mode`, `Authorization`, `fdi-version`, `rid`.
- Backend has **zero** current callers of `Session.createNewSession` — verified by grep across `api/src/`.
- Frontend already has `src/app/[locale]/auth/callback/google/page.tsx` (SuperTokens Google callback lands here).

## The question (restated)

Given an authenticated request (cookie session present), return an `{ access, refresh }` pair in a JSON body so a Next.js page can forward them to the extension via a URL fragment redirect — the extension never sees llmconveyors.com cookies and cannot call `/auth/signinup` itself (Google redirect URI is bound to the web origin).

## Approach A — Bridge endpoint that calls `Session.createNewSession`

**Mechanism**: New NestJS endpoint `POST /api/v1/auth/extension-token-exchange`. Guard: `AuthGuard` (session only, no `@RequireScope`). Handler reads the existing session via `Session.getSession(req, res)` to get `userId`, then calls `Session.createNewSession(req, res, 'public', recipeUserId, {}, {}, {})` with the request proxied to set `st-auth-mode: header` so the new session is emitted as response headers. Handler then reads `res.getHeaders()['st-access-token']` / `['st-refresh-token']` / `['front-token']` and returns them in a JSON body, stripping the headers so they don't leak into the response.

**Critical subtlety**: `createNewSession(req, res, ...)` inspects `req.headers['st-auth-mode']` via `getAuthModeFromHeader(req)` at session-create time to decide transfer method (verified in agent 35 section b). The original HTTP request from the browser **does not** carry `st-auth-mode: header` — it's a first-party cookie request from a Next.js page. Two ways to force header mode:

1. **Frontend sends the header**: the Next.js extension-signin page fetches the bridge endpoint via `fetch('/api/v1/auth/extension-token-exchange', { credentials: 'include', headers: { 'st-auth-mode': 'header' } })`. Backend mounts CORS for same-origin (already allows `st-auth-mode` per `main.ts:49`), `createNewSession` sees `header` → emits response headers. Handler reads `res.getHeader('st-access-token')` etc., copies to body, calls `res.removeHeader(...)` on all four (`st-access-token`, `st-refresh-token`, `front-token`, `anti-csrf`) to prevent the new session from binding to the browser, and returns `{ access, refresh, frontToken, accessTokenExpiry }` as JSON.
2. **Mutate `req.headers` server-side**: the handler pre-assigns `(req as any).headers['st-auth-mode'] = 'header'` before calling `createNewSession`. This is simpler (no header from frontend) but depends on `getAuthModeFromHeader` reading the mutated property, which it does (source: `supertokens-node/lib/ts/recipe/session/cookieAndHeaders.ts` → `req.getHeaderValue('st-auth-mode')` which Express frameworks back with `req.headers[...]`).

Approach (2) is cleaner — no frontend header plumbing. Use it.

**Important security note**: `createNewSession` creates a **new** session row in the SuperTokens core database. We must NOT invalidate the existing cookie session (the web app keeps using it). `createNewSession` does not touch the old session — it mints a second independent one for the same user. This is by design and the flow the SuperTokens team recommends for multi-device issuance.

**LoC estimate**: ~60 lines (controller + module wiring + shared-types response schema + test).
**New code**: 1 controller file, 1 new Zod schema, 1 Next.js page, 1 test file.
**Rate limits**: session-auth users get the session tier (generous per agent 07). Extension requests use the Bearer access token → verified as SuperTokens session by `AuthGuard` → `authSource: 'supertokens'` → scope guard bypass + session-tier rate limits. **Best runtime profile** of the three options.
**Security posture**: high. Token never leaves HTTPS. Fragment redirect (`#token=...`) is not logged by servers/proxies. Cookie session unaffected on the web.

## Approach B — Frontend initiates SuperTokens Google flow directly with `st-auth-mode: header`

**Mechanism**: Extension-signin page does not rely on the existing cookie session. It programmatically runs `GET /auth/authorisationurl` → opens Google → receives `code` on its own callback → `POST /auth/signinup` with `st-auth-mode: header`. Response returns tokens in headers; page reads and forwards.

**Problems**:
- Duplicates the Google OAuth flow on the same origin. User who is already signed into the web app is forced to re-authorize.
- The SuperTokens Google provider is configured with **one** redirect URI (`https://llmconveyors.com/auth/callback/google`, verified in agent 01). Reusing it collides with the main web cookie flow — the callback page calls `/auth/signinup` with `st-auth-mode` implicitly (via `supertokens-web-js` default = cookie). We'd need a second callback route and either (a) a second SuperTokens ThirdParty `clientType`, or (b) a parallel `/auth/callback/google-extension` page that fetches `/auth/signinup` with a manually-set `st-auth-mode: header`.
- Requires modifying `src/app/[locale]/auth/callback/google/page.tsx` OR adding a new callback page, AND coordinating with Google OAuth console for a second redirect URI.
- Session is never written to cookies, so the user is only signed in inside the extension — if they close the extension, they must re-auth. Web session + extension session decoupled = worse UX.

**LoC estimate**: ~150 lines + Google OAuth console config change. Higher blast radius.
**Verdict**: rejected.

## Approach C — Use `POST /api/v1/settings/platform-api-keys` to mint `llmc_*` key

**Mechanism**: Next.js extension-signin page calls the existing endpoint with `credentials: 'include'` and `{ label: 'Chrome Extension', scopes: ['jobs:write','sales:write','sessions:read','resume:read','resume:write','settings:read','ats:write','upload:write','outreach:read','outreach:write'] }`. Response returns `fullKey: "llmc_..."` once. Page redirects to `<ext-redirect>#apiKey=<fullKey>`. Extension stores it and uses `X-API-Key` header.

**Problems**:
- Extension runs under api-key tier rate limits — strict per agent 07. Users will hit limits fast in normal extension usage (fill-form heuristics, resume upload, agent runs).
- API keys are long-lived; no rotation unless we explicitly call rotate. Different security profile than session tokens (which rotate on refresh).
- Leaks a `llmc_*` key into the extension's storage — same key could be exfiltrated and used from anywhere. SuperTokens refresh tokens at least rotate.
- User sees a "Chrome Extension" key in their API keys UI and may revoke it not realising it breaks the extension.

**LoC estimate**: ~30 lines on the Next.js page, zero backend.
**Verdict**: viable fallback but clearly inferior. Rejected.

## Ranking

| Criterion | A (bridge) | B (direct OAuth) | C (API key) |
|---|---|---|---|
| New backend LoC | ~60 | ~0 | 0 |
| New frontend LoC | ~80 | ~150 | ~30 |
| OAuth console changes | none | yes (2nd redirect) | none |
| Rate-limit tier | session (high) | session (high) | api-key (low) |
| Token rotation | yes (100d refresh, 1h access) | yes | no |
| Revocation blast radius | single extension install | single extension install | can break whole extension |
| User friction | zero (uses existing web session) | full re-auth in extension | zero |
| SDK callback compat | `Authorization: Bearer` → AuthGuard bypass | same | `X-API-Key` → different guard path |

**Winner: Approach A** — small, reuses the web cookie session, best UX, best runtime characteristics, no OAuth console changes, no new provider clients.

## Locked flow (Approach A)

1. Extension service worker calls `chrome.identity.launchWebAuthFlow({ url: 'https://llmconveyors.com/auth/extension-signin?redirect=' + encodeURIComponent(chrome.identity.getRedirectURL()), interactive: true })`.
2. User lands on `/[locale]/auth/extension-signin` (Next.js page). Page uses `useSessionContext()` from `supertokens-auth-react` to detect auth state.
3. If NOT signed in: page redirects to the existing SuperTokens login URL with `?redirectToPath=/auth/extension-signin?redirect=<...>` — SuperTokens flows through `/auth/callback/google` and returns to our page already authed.
4. Once authed: page calls `fetch('/api/v1/auth/extension-token-exchange', { method: 'POST', credentials: 'include' })`. Same-origin request — browser attaches cookie session automatically.
5. Backend `AuthGuard` resolves the cookie session → `request.user` populated. Controller handler:
   - Mutates `req.headers['st-auth-mode'] = 'header'`.
   - Calls `Session.createNewSession(req, res, 'public', supertokensUser.recipeUserId, {}, {}, {})`.
   - Reads `res.getHeader('st-access-token')`, `st-refresh-token`, `front-token`, `anti-csrf`.
   - Calls `res.removeHeader(...)` on all four + the `Access-Control-Expose-Headers` augmentation SuperTokens added.
   - Returns JSON `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` + optional `antiCsrf` (null unless enabled — confirmed disabled in agent 02).
6. Frontend reads the JSON, builds a fragment `#at=<access>&rt=<refresh>&ft=<front>&exp=<ts>`, and calls `window.location.replace(redirect + fragment)`.
7. `launchWebAuthFlow` resolves with the redirect URL → extension parses fragment via `new URL(url).hash.slice(1)` → stores `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` in `chrome.storage.session` (per-session, cleared on browser close — the 1h access TTL + 100d refresh TTL makes this reasonable; see agent 40 for storage mode decision).
8. Extension SDK client fetches with `Authorization: Bearer <accessToken>`. On 401 with `try refresh token`, extension posts to `https://api.llmconveyors.com/auth/session/refresh` with `Authorization: Bearer <refreshToken>`, `rid: session`, `fdi-version: 3.0`, `st-auth-mode: header`; reads new tokens from response headers; retries original request.

## Verification of load-bearing claims

- `Session.createNewSession` signature + transfer-method selection: agent 35 sections b-f, sourced from `supertokens-node/lib/ts/recipe/session/index.ts` and `utils.ts`. Verified.
- Response headers set by the SDK: agent 35 section d, sourced from `cookieAndHeaders.ts`. Verified.
- CORS allow-headers already include `st-auth-mode`, `Authorization`, `fdi-version`, `rid`: `api/src/main.ts:49`. Verified.
- `Session.getSession` on an already-authenticated cookie session does NOT reset cookies and is safe to call inside `AuthGuard` → a subsequent `createNewSession` mints an INDEPENDENT second session: this is the documented multi-device pattern (SuperTokens core allows N sessions per user).
- Session users bypass `ScopeGuard`: agent 05 section b. Therefore no `@RequireScope` needed on the bridge endpoint.
- `exposeAccessTokenToFrontendInCookieBasedAuth: false` does NOT block header-mode emission: agent 02 section f. Verified.

## Backend file-by-file brief

### New files

**`api/src/modules/auth/auth.controller.ts`** (new, ~50 lines)
- `@Controller('auth')` with `@UseGuards(AuthGuard)` — no `@RequireScope`, session user bypasses automatically per agent 05.
- Route: `@Post('extension-token-exchange') @HttpCode(200)`.
- Handler signature: `async exchange(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user: UserContext)`.
- Body:
  - Reject if `user.authSource !== 'supertokens'` → `ForbiddenException('Bridge only accepts session users')`. (Extension mustn't call this with a Bearer access token — that would be a no-op infinite loop.)
  - `(req as any).headers['st-auth-mode'] = 'header';`
  - `const stUser = await Session.getSession(req, res, { sessionRequired: true });`
  - `const newSession = await Session.createNewSession(req, res, stUser.getTenantId(), stUser.getRecipeUserId(), {}, {}, {});`
  - Read headers: `const access = res.getHeader('st-access-token') as string; const refresh = res.getHeader('st-refresh-token') as string; const frontToken = res.getHeader('front-token') as string;`
  - `['st-access-token','st-refresh-token','front-token','anti-csrf','Access-Control-Expose-Headers'].forEach(h => res.removeHeader(h));`
  - Decode `frontToken` (base64url JSON) to extract `ate` (access-token-expiry ms epoch) for convenience.
  - Return `{ accessToken: access, refreshToken: refresh, frontToken, accessTokenExpiry: Number(ateMs) }`.
- Wrap `createNewSession` in try/catch; re-throw as `InternalServerErrorException('Failed to mint extension session')` with structured log (never leak SuperTokens internals).

**`api/src/modules/auth/__tests__/auth.controller.spec.ts`** (new, ~120 lines)
- Mock `Session.getSession`/`createNewSession`.
- Happy path: session user → returns tokens, removes response headers.
- Guard: API-key user → 403.
- Guard: no session → 401 via `AuthGuard` (integration test).
- Response headers scrubbed: assert `res.removeHeader` called for all 5 names.
- Adversarial: `createNewSession` throws → 500 with sanitized message.

**`libs/shared-types/src/schemas/auth-api.schema.ts`** (new, ~20 lines)
- `ExtensionTokenExchangeResponseSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1), frontToken: z.string().min(1), accessTokenExpiry: z.number().int().positive() }).strict()`.
- Export from `libs/shared-types/src/index.ts`.

### Modified files

**`api/src/modules/auth/auth.module.ts`** (+3 lines)
- Add `AuthController` to `controllers: [...]`.

**`api/src/modules/auth/blueprint.ts`** (+15 lines)
- Document new endpoint: `POST /api/v1/auth/extension-token-exchange`, session-only, returns `ExtensionTokenExchangeResponseSchema`. Add invariant: "Bridge never invalidates the caller's existing session; it mints an independent sibling session."

**`api/src/main.ts`** (no change)
- CORS already allows `st-auth-mode`, `Authorization`, `fdi-version`, `rid` (:49). Already allows `chrome-extension://` origins? Agent 39 covered this — if not, the extension-signin page runs on the web origin, so same-origin fetch works without CORS. Downstream extension calls to `api.llmconveyors.com` use already-configured CORS. **No changes to `main.ts` for approach A.**

## Frontend file-by-file brief

### New files

**`src/app/[locale]/auth/extension-signin/page.tsx`** (new, ~80 lines)
- Client component (`'use client'`).
- Reads `?redirect=<url>` query param. Validates it matches `chrome-extension://*.chromiumapp.org` pattern (regex: `^https:\/\/[a-z]{32}\.chromiumapp\.org\/?.*$`) — reject other redirect targets to prevent open-redirect abuse.
- Uses `useSessionContext()` from `supertokens-auth-react` to detect auth.
- If loading: spinner.
- If NOT authed: redirect to the existing SuperTokens sign-in route with `?redirectToPath=<current-url>` so post-login returns here.
- If authed: call `fetch('/api/v1/auth/extension-token-exchange', { method: 'POST', credentials: 'include' })`. Parse JSON. Build fragment `#at=${at}&rt=${rt}&ft=${ft}&exp=${exp}`. `window.location.replace(redirect + fragment)`.
- Error path: display "Failed to sign in to extension" + retry button + "Back to app" link.
- No dependencies beyond existing `supertokens-auth-react` + Next.js router.

**`src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx`** (new, ~100 lines)
- Happy path: authed session + valid redirect → fetch called → replace called with correct URL.
- Unauthed: redirects to login.
- Invalid redirect param (e.g., `https://evil.com`) → reject with error message, never call fetch.
- Fetch error → shows error UI.
- Fragment contains all four params.

### Modified files

None. This page is purely additive.

## Confidence: 95%

Filename: `temp/impl/100-chrome-extension-mvp/investigation/53-supertokens-bridge-endpoint.md`
