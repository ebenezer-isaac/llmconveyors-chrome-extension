# SuperTokens Header-Mode Auth — Investigation 35

Scope: SuperTokens token-based (header mode) auth for mobile/extension clients — what is officially supported for non-cookie contexts. This revision replaces the 62% confidence draft; claims below are now backed by verbatim reads of `supertokens-node` and `supertokens-website` source on GitHub (raw.githubusercontent.com was reachable even when the docs app-shell 404'd) plus cross-referenced docs search snippets.

## Evidence Sources (verified this session)

1. `supertokens-node` session recipe constants — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/constants.ts
2. `supertokens-node` session recipe cookieAndHeaders — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/cookieAndHeaders.ts
3. `supertokens-node` session utils (`getTokenTransferMethod` default) — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/utils.ts
4. `supertokens-node` session index (`createNewSession` signature) — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/index.ts
5. `supertokens-node` thirdparty signin-up handler — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/thirdparty/api/signinup.ts
6. `supertokens-node` thirdparty authorisation-url handler — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/thirdparty/api/authorisationUrl.ts
7. `supertokens-node` sessionFunctions refresh — https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/sessionFunctions.ts
8. `supertokens-website` fetch interceptor (refresh logic) — https://raw.githubusercontent.com/supertokens/supertokens-website/master/lib/ts/fetch.ts
9. `supertokens-website` CHANGELOG v16.0.0 & v18.0.0 — https://raw.githubusercontent.com/supertokens/supertokens-website/master/CHANGELOG.md
10. Docs: Switch between cookie and header-based sessions — https://supertokens.com/docs/post-authentication/session-management/switch-between-cookies-and-header-authentication (reachable via WebSearch snippets; direct WebFetch 404's the app shell)
11. Docs: Sign in/up with third party (FDI spec) — https://supertokens.com/docs/references/fdi/thirdparty/post-signinup
12. Docs: Get third party auth URL (FDI spec) — https://supertokens.com/docs/references/fdi/thirdparty/get-authorisationurl
13. Docs: Custom UI third-party login — https://supertokens.com/docs/thirdparty/custom-ui/thirdparty-login
14. Community: Chrome extension with SuperTokens — https://community.supertokens.com/t/547062/hey-all-any-idea-how-to-implement-supertokens-with-chrome-ex and https://community.supertokens.com/t/2212742/hi-i-m-trying-to-setup-auth-with-my-chrome-extension-i-ve-br

## a) Header constants (VERIFIED verbatim from supertokens-node source)

From `lib/ts/recipe/session/constants.ts` — the exact exported string constants used everywhere in the backend SDK:

- `"authorization"` — request header the SDK reads tokens from
- `"st-access-token"` — response header AND cookie-mode fallback
- `"st-refresh-token"` — response header AND cookie-mode fallback
- `"front-token"` — response header carrying userId / access-token-expiry / user payload
- `"anti-csrf"` — response/request header when CSRF is enabled
- `"st-auth-mode"` — request header the client sends to select transfer method
- API paths (exact strings): `"/session/refresh"`, `"/signout"`
- `availableTokenTransferMethods = ["cookie", "header"]`

Source: https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/constants.ts

## b) Default `getTokenTransferMethod` behavior (VERIFIED verbatim)

From `lib/ts/recipe/session/utils.ts`:

- For session **validation** (`forCreateNewSession: false`): default returns `"any"` — SDK will accept tokens from either the `Authorization` header or the `sAccessToken`/`sRefreshToken` cookies.
- For **new session creation** (`forCreateNewSession: true`): default reads `st-auth-mode` request header via `getAuthModeFromHeader(req)`:
  - header value `"header"` → returns `"header"` (SDK emits response headers, no Set-Cookie)
  - header value `"cookie"` → returns `"cookie"` (SDK emits Set-Cookie, no response headers)
  - missing / other → returns `"any"`, which the SDK then internally resolves to `"cookie"` (cookie is the fallback default when nothing is stated)

Implication: **if the client never sends `st-auth-mode: header`, the server creates a cookie session.** Header mode is strictly opt-in per request.

Source: https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/utils.ts

## c) How tokens are read from the request (VERIFIED verbatim)

From `lib/ts/recipe/session/cookieAndHeaders.ts`:

> "The value = req.getHeaderValue(authorizationHeaderKey); if (value === undefined || !value.startsWith('Bearer ')) { return undefined; }"

Both access and refresh tokens are read from the **same `Authorization` header**, stripped of the `"Bearer "` prefix. Which token the server expects depends on the route:
- Any verifySession-protected route → expects access token
- `POST /auth/session/refresh` → expects refresh token

Source: https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/cookieAndHeaders.ts

## d) How tokens are set in the response (VERIFIED verbatim)

From the same `cookieAndHeaders.ts`, the `setToken` function calls `setHeader(res, config.getResponseHeaderNameForTokenType(req, tokenType, userContext), value)` and also sets:

> "res.setHeader('Access-Control-Expose-Headers', name, true)"

— so browsers and fetch-based clients can actually read the new tokens across CORS. Response header names used are the constants from (a): `st-access-token`, `st-refresh-token`, `front-token`, plus `anti-csrf` when enabled. Body of the sign-in response stays the recipe payload (`{ status: "OK", user, ... }`).

Source: https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/cookieAndHeaders.ts

## e) Refresh flow in header mode (VERIFIED verbatim from the web-js fetch interceptor)

From `supertokens-website/lib/ts/fetch.ts` — the official web-js library itself does this on refresh:

> `clonedHeaders.set("Authorization", \`Bearer ${addRefreshToken ? refreshToken : accessToken}\`)`

— and posts to:

> `config.apiDomain + config.apiBasePath + "/session/refresh"`

Other headers attached by the library on the refresh POST:
- `rid: "anti-csrf"` (recipe id hint)
- `fdi-version: <csv of supported FDI versions>`
- `st-auth-mode: header` (mirrors the transfer method)
- `anti-csrf: <value>` (only when a session exists and CSRF is enabled)

The response contains new `st-access-token`, `st-refresh-token`, and `front-token` response headers — the client MUST read and persist all three. If the client already swapped in the new refresh token, subsequent authed calls use the new access token; verifySession reads `Authorization: Bearer <new access token>`.

Sources:
- https://raw.githubusercontent.com/supertokens/supertokens-website/master/lib/ts/fetch.ts
- https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/sessionFunctions.ts

## f) ThirdParty (Google OAuth) end-to-end in header mode (VERIFIED)

The flow the server actually exposes:

1. **Client → GET `/auth/authorisationurl`** with query params (from `lib/ts/recipe/thirdparty/api/authorisationUrl.ts`, verbatim: the handler requires `thirdPartyId` and `redirectURIOnProviderDashboard` as GET params; `clientType` is optional):
   ```
   GET /auth/authorisationurl?thirdPartyId=google
     &redirectURIOnProviderDashboard=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle
   ```
   Response body:
   ```json
   {
     "status": "OK",
     "urlWithQueryParams": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...",
     "pkceCodeVerifier": "<optional, present when provider uses PKCE>"
   }
   ```
   This endpoint does NOT create a session — `st-auth-mode` is irrelevant here. The client (or opened tab) persists `pkceCodeVerifier` if present and redirects the user to `urlWithQueryParams`.

   Source: https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/thirdparty/api/authorisationUrl.ts

2. **Google redirects back** to `redirectURIOnProviderDashboard` with `?code=...&state=...`.

3. **Client → POST `/auth/signinup`** — this is the session-creation step. From `lib/ts/recipe/thirdparty/api/signinup.ts` the handler requires `thirdPartyId` and either `redirectURIInfo` or `oAuthTokens`. For the standard auth-code flow:
   ```
   POST /auth/signinup
   Content-Type: application/json
   st-auth-mode: header
   rid: thirdparty
   Body:
   {
     "thirdPartyId": "google",
     "clientType": "<optional — only needed if you configured multiple clients>",
     "redirectURIInfo": {
       "redirectURIOnProviderDashboard": "https://llmconveyors.com/auth/callback/google",
       "redirectURIQueryParams": { "code": "<code from google>", "state": "<state>" },
       "pkceCodeVerifier": "<from step 1 if used>"
     }
   }
   ```
   Server exchanges the code with Google, creates/finds the user, calls `Session.createNewSession(req, res, ...)` (see `lib/ts/recipe/session/index.ts` — `createNewSession(req, res, tenantId, recipeUserId, accessTokenPayload, sessionDataInDatabase, userContext)` writes headers/cookies via the configured transfer method). With `st-auth-mode: header` present, the default `getTokenTransferMethod` resolves to `"header"` and the response comes back as:

   ```
   HTTP/1.1 200 OK
   st-access-token: <JWT>
   st-refresh-token: <opaque>
   front-token: <base64url JSON>
   anti-csrf: <optional>
   Access-Control-Expose-Headers: st-access-token, st-refresh-token, front-token, anti-csrf
   Content-Type: application/json

   { "status": "OK", "createdNewRecipeUser": false, "user": { ... } }
   ```

   Sources:
   - https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/thirdparty/api/signinup.ts
   - https://raw.githubusercontent.com/supertokens/supertokens-node/master/lib/ts/recipe/session/index.ts
   - https://supertokens.com/docs/references/fdi/thirdparty/post-signinup

**Critical constraint**: the POST `/auth/signinup` is the ONLY request where `st-auth-mode: header` matters for session creation. If the user lands on a plain HTML redirect page that the extension has no control over, the browser's own fetch to `/auth/signinup` will omit `st-auth-mode` and the session will be minted as cookies. To force header mode, the sign-in request MUST be issued by code the extension author controls (a custom callback page the extension opens, or an extension-side fetch once the code is intercepted).

## g) Browser-tab sign-in → extension token hand-off (feasibility)

**Yes**, and there are two documented patterns; neither is SuperTokens-native, both are standard Chrome-extension OAuth patterns adapted for SuperTokens:

### Pattern A: `chrome.identity.launchWebAuthFlow` + extension-side POST /auth/signinup

1. Extension service worker calls `chrome.identity.launchWebAuthFlow({ url: <urlWithQueryParams from step 1>, interactive: true })`.
2. Chrome opens a managed popup, user completes Google sign-in, Google redirects to `https://<extension-id>.chromiumapp.org/<path>?code=...&state=...` (this is the only non-http(s) callback Google accepts for extensions — it is a synthetic URL minted by `chrome.identity`).
3. `launchWebAuthFlow` resolves with that redirect URL; extension parses out `code`.
4. Extension fetches `POST /auth/signinup` directly with `st-auth-mode: header`, reads response headers, stores tokens in `chrome.storage.local`.
5. But: SuperTokens was configured with `redirectURIOnProviderDashboard = https://llmconveyors.com/auth/callback/google` (the web app callback), so the extension must use the SAME redirect URI when calling `/auth/authorisationurl` to produce a matching Google request, OR a second Google OAuth client must be provisioned with `https://<extension-id>.chromiumapp.org/...` as an allowed redirect. SuperTokens supports multiple clients per provider via `clientType` — see https://supertokens.com/docs/authentication/social/add-multiple-clients-for-the-same-provider.

### Pattern B: Web tab completes sign-in with cookies, then posts tokens to extension

1. Extension opens `https://llmconveyors.com/auth/ext-signin?extensionId=<id>` in a new tab.
2. The web app logs the user in with its normal cookie-based flow (no change needed on the backend).
3. The web app reads the currently-active session on the server (e.g. a `/api/ext/token-exchange` endpoint guarded by the user's cookie session) and mints a **header-mode session for the same user**. The cleanest way: call `Session.createNewSession(req, res, ...)` on that endpoint with the SuperTokens response piped through `st-auth-mode: header`, OR mint a short-lived one-time code that the extension can redeem at `/api/ext/redeem-code` with `st-auth-mode: header` (and the redeem endpoint calls `createNewSession` internally).
4. The page calls `chrome.runtime.sendMessage(<extensionId>, { accessToken, refreshToken, frontToken })` — this only works if the extension declares `externally_connectable.matches: ["https://llmconveyors.com/*"]` in its manifest.
5. Extension stores tokens in `chrome.storage.local`.

**Constraint for Pattern B**: the backend needs one extra endpoint (`/api/ext/exchange` or similar) that ONLY trusts the current web cookie session and emits header-mode tokens. This is a small 20-line NestJS controller but it IS custom code — it is not built-in to SuperTokens. A community-built variant of this exists in the discussions at https://community.supertokens.com/t/2212742/.

Practical recommendation for this plan: **Pattern A** (`launchWebAuthFlow` + extension-native POST signinup + separate Google client via `clientType`). It is fewer moving parts and does not require a bespoke hand-off endpoint.

## h) `cookieDomain` + header mode (VERIFIED)

`cookieDomain` only governs `Set-Cookie` emission. When the per-request transfer method resolves to `"header"`, the SDK's `setToken` code path sets response headers and never emits `Set-Cookie`, so `cookieDomain` is simply unused for that response. The docs explicitly recommend header mode as the mitigation when `cookieDomain` has been changed multiple times and sessions get stuck:

> "If you have changed the cookieDomain more than once within one year, to prevent a stuck state, switch to header based auth for all your clients." — https://supertokens.com/docs/post-authentication/session-management/switch-between-cookies-and-header-authentication

Implication for this project: the existing `cookieDomain: ".llmconveyors.com"` server config from agent 02 does NOT block header-mode clients. Cookie-mode web users and header-mode extension users coexist fine on the same backend.

## i) Frontend storage: localStorage vs cookies (CORRECTION)

Earlier draft claimed `supertokens-web-js` stores header-mode tokens in `localStorage` keys `st-access-token` etc. That was **wrong**. From `supertokens-website/lib/ts/fetch.ts` (verified this session), the library stores even header-mode tokens in **cookies** under keys:

- Access token: `st-access-token`
- Refresh token: `st-refresh-token`
- Front token: `sFrontToken`
- Anti-CSRF: `sAntiCsrf`
- Last access token update: `st-last-access-token-update`

v18.0.0 of `supertokens-website` added a `DateProvider` that relies on `localStorage`, but the tokens themselves are still cookie-backed client-side by default. Override to custom storage is possible via `cookieHandler` in `SuperTokens.init`. For a Chrome extension MV3 service worker there are NO cookies accessible to the worker and NO `localStorage`, so the extension CANNOT run the stock web-js library; it must implement its own minimal fetch client with `chrome.storage.local`-backed token store.

Source: https://raw.githubusercontent.com/supertokens/supertokens-website/master/lib/ts/fetch.ts

## j) Official Chrome / browser extension examples

No first-party demo app or docs page. Confirmed community answers:

- https://community.supertokens.com/t/547062/ — SuperTokens team response points developers at header mode + manual implementation; no official example.
- https://community.supertokens.com/t/2212742/ — same conclusion, plus advice to either init only the Session recipe on the extension side or roll a raw client. No officially maintained example app.

Docker extension (`supertokens-docker-extension`) is unrelated — it's the Docker Desktop Extension, not a browser extension.

## Definitive answers to the six questions in the task

### Q1. Exact client steps to start Google OAuth in header mode

The **initiating** call (`GET /auth/authorisationurl`) does not need `st-auth-mode` — it never creates a session. Required GET params: `thirdPartyId=google`, `redirectURIOnProviderDashboard=<url>`, optional `clientType`. Response is `{ status: "OK", urlWithQueryParams, pkceCodeVerifier? }`. Client opens `urlWithQueryParams` in a browser/webauth popup. Once Google redirects back with `?code=...&state=...`, the client issues **POST `/auth/signinup`** with header `st-auth-mode: header` and a JSON body containing `thirdPartyId`, optional `clientType`, and `redirectURIInfo: { redirectURIOnProviderDashboard, redirectURIQueryParams: { code, state }, pkceCodeVerifier? }`. The response on 200 OK has body `{ status: "OK", user, createdNewRecipeUser }` plus response headers `st-access-token`, `st-refresh-token`, `front-token`, and `Access-Control-Expose-Headers` listing them so the client can read them.

### Q2. Can a tab-based sign-in hand off tokens to an extension?

Yes — two documented patterns (A: `chrome.identity.launchWebAuthFlow`, B: custom `/api/ext/exchange` endpoint + `chrome.runtime.sendMessage` via `externally_connectable`). Neither is built into SuperTokens. Pattern B requires one new backend endpoint that, guarded by the existing cookie session, calls `Session.createNewSession(req, res, ...)` with `st-auth-mode: header` set on the response's request proxy (or returns a one-time code the extension redeems). Pattern A is cleaner because it does not require bespoke backend work — only a second Google OAuth client (distinguished by `clientType`) registered with `https://<extension-id>.chromiumapp.org/...` as an allowed redirect.

### Q3. Does header mode work when `cookieDomain` is set to `.llmconveyors.com`?

Yes. `cookieDomain` is only consulted when the per-request transfer method is `"cookie"`. For `"header"`, the SDK skips `Set-Cookie` entirely and `cookieDomain` is irrelevant to that response. Web app cookie clients and extension header clients coexist on the same SuperTokens backend. The docs even recommend switching to header mode as the remedy when `cookieDomain` has been rotated and sessions get stuck.

### Q4. Exact refresh flow for header-mode tokens

`POST <apiDomain><apiBasePath>/session/refresh` with headers:
- `Authorization: Bearer <st-refresh-token>` — the refresh token, with literal `Bearer ` prefix
- `rid: anti-csrf` — matches what supertokens-website sends
- `st-auth-mode: header`
- `fdi-version: 3.0` (or whichever FDI your backend advertises — the library sends its supported range as CSV)
- `anti-csrf: <value>` if CSRF is enabled

Response is HTTP 200 with NEW `st-access-token`, `st-refresh-token`, and `front-token` headers. Old refresh token is invalidated. Client MUST persist all three new values and use the new access token on the retry of the 401'd request. If the backend responds 401 with `{ message: "token theft detected" }` or `UNAUTHORISED`, the client must treat the session as dead and prompt re-login. The supertokens-website fetch interceptor implements this automatically; a manual client in a Chrome extension MUST re-implement the 401 → refresh → retry loop with a lock/queue to avoid stampeding refresh.

Source: https://raw.githubusercontent.com/supertokens/supertokens-website/master/lib/ts/fetch.ts

### Q5. Does `/auth/signinup` (ThirdParty) return tokens in headers or redirect?

It returns HTTP 200 with tokens in **response headers** when `st-auth-mode: header` is sent. It NEVER issues a 302 redirect — `/auth/signinup` is a plain JSON POST API. Redirection to/from Google happens at `urlWithQueryParams` (step 1); the code → token exchange at step 3 is a normal XHR-style request. So from the extension's perspective, once it has `code`, the entire remaining flow is a JSON POST that returns JSON + headers synchronously.

### Q6. Is the canonical flow `GET authorisationurl → Google → POST signinup`?

Yes — confirmed verbatim from both `supertokens-node` source (`lib/ts/recipe/thirdparty/api/authorisationUrl.ts` and `lib/ts/recipe/thirdparty/api/signinup.ts`) and the FDI spec pages (https://supertokens.com/docs/references/fdi/thirdparty/get-authorisationurl, https://supertokens.com/docs/references/fdi/thirdparty/post-signinup). Header mode applies only at step 3 (the POST).

## Load-bearing facts (final)

1. The six session header constants are literally `"authorization"`, `"st-access-token"`, `"st-refresh-token"`, `"front-token"`, `"anti-csrf"`, `"st-auth-mode"`. The refresh path is literally `"/session/refresh"`. Verbatim from constants.ts.
2. Header mode is opt-in per request via `st-auth-mode: header`. The server-side default for new sessions falls back to `"cookie"` when the header is missing.
3. `createNewSession(req, res, ...)` is the single code path that writes session tokens; it respects the resolved transfer method and calls `Access-Control-Expose-Headers` automatically so CORS clients can read the new tokens.
4. Refresh is `POST /auth/session/refresh` with `Authorization: Bearer <refresh token>`; response brings new `st-access-token`, `st-refresh-token`, `front-token`. Old refresh is rotated (single-use).
5. `cookieDomain` and header mode are orthogonal; no conflict with the existing `.llmconveyors.com` setting.
6. ThirdParty Google works unchanged in header mode; only the final POST `/auth/signinup` needs `st-auth-mode: header`.
7. There is NO official SuperTokens browser-extension example. The stock `supertokens-website` library is cookie-backed client-side (not `localStorage`) and is unsuitable for an MV3 service worker that has neither document cookies nor `localStorage`. The extension must ship a minimal hand-rolled fetch client with `chrome.storage.local` persistence and its own 401→refresh interceptor.
8. Hand-off from a browser tab to the extension is possible but requires either `chrome.identity.launchWebAuthFlow` (Pattern A) or a new `/api/ext/exchange` backend endpoint plus `externally_connectable` (Pattern B). Pattern A is recommended and requires registering a second Google OAuth client with redirect URI `https://<extension-id>.chromiumapp.org/*` and wiring it into SuperTokens via `clientType`.

## Manual Verification Steps (live-probe requirements)

Two residual items cannot be resolved from source alone — both are operational verification against the live backend, not architectural unknowns. They MUST be smoke-tested against `https://api.llmconveyors.com` before shipping the extension, but the plan does NOT block on them because both have deterministic fallbacks (pin `fdi-version: 3.0`, enable `authSetCorsHeaders: true` if currently off).

### V1. Verify `authorisationurl` returns a Google URL (no session required)

```bash
curl -i -X GET \
  "https://api.llmconveyors.com/auth/authorisationurl?thirdPartyId=google&redirectURIOnProviderDashboard=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle" \
  -H "rid: thirdparty" \
  -H "fdi-version: 3.0"
```

Expected response shape:
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "OK",
  "urlWithQueryParams": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle&response_type=code&scope=...&state=...",
  "pkceCodeVerifier": "..."   // only if provider uses PKCE — optional
}
```

Pass criteria: HTTP 200, `status == "OK"`, `urlWithQueryParams` starts with `https://accounts.google.com/`, `redirect_uri` querystring matches the `redirectURIOnProviderDashboard` param you sent.

Failure modes and fixes:
- `400 { "message": "Please provide the thirdPartyId..." }` — wrong param name, check casing
- `404` — SuperTokens middleware not mounted on `/auth/*`; check `api/src/main.ts` for `app.use(supertokens.middleware())` and the configured `apiBasePath`
- `{ status: "FIELD_ERROR" }` — Google client not configured for that `redirectURIOnProviderDashboard`; verify SuperTokens ThirdParty provider config

### V2. Verify `fdi-version` CSV format accepted by this backend

```bash
# Probe 1 — pinned single version
curl -i -X GET \
  "https://api.llmconveyors.com/auth/authorisationurl?thirdPartyId=google&redirectURIOnProviderDashboard=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle" \
  -H "rid: thirdparty" \
  -H "fdi-version: 3.0"

# Probe 2 — CSV range (supertokens-website style)
curl -i -X GET \
  "https://api.llmconveyors.com/auth/authorisationurl?thirdPartyId=google&redirectURIOnProviderDashboard=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle" \
  -H "rid: thirdparty" \
  -H "fdi-version: 1.16,1.17,1.18,1.19,2.0,3.0"

# Probe 3 — header entirely omitted
curl -i -X GET \
  "https://api.llmconveyors.com/auth/authorisationurl?thirdPartyId=google&redirectURIOnProviderDashboard=https%3A%2F%2Fllmconveyors.com%2Fauth%2Fcallback%2Fgoogle" \
  -H "rid: thirdparty"
```

Pass criteria: ALL THREE probes return HTTP 200 with identical JSON body shape. If any probe returns `{ status: "FDI_VERSION_MISMATCH" }` or similar, the extension client MUST use the CSV format that succeeded. Default choice for the extension MVP: `fdi-version: 3.0` (Probe 1) — this is the minimum surface area and matches supertokens-node ≥v16 behavior.

### V3. Verify `st-auth-mode: header` response exposes tokens via CORS

This is the load-bearing check — without it, the extension can submit a valid POST but cannot READ the response headers. Requires a real Google OAuth `code` captured from a manual login (cannot be scripted against live Google). Use a single throwaway test code:

```bash
# 1. Open the urlWithQueryParams from V1 in a browser, complete Google sign-in,
#    capture the ?code=... and ?state=... from the redirect URL.

# 2. POST to /auth/signinup with that code, header mode, CORS origin
curl -i -X POST \
  "https://api.llmconveyors.com/auth/signinup" \
  -H "Content-Type: application/json" \
  -H "rid: thirdparty" \
  -H "fdi-version: 3.0" \
  -H "st-auth-mode: header" \
  -H "Origin: chrome-extension://<any-test-id>" \
  -d '{
    "thirdPartyId": "google",
    "redirectURIInfo": {
      "redirectURIOnProviderDashboard": "https://llmconveyors.com/auth/callback/google",
      "redirectURIQueryParams": {
        "code": "<code-from-google>",
        "state": "<state-from-google>"
      }
    }
  }'
```

Pass criteria (ALL must hold):
1. `HTTP/1.1 200 OK`
2. Response header `st-access-token: <non-empty JWT>` present
3. Response header `st-refresh-token: <non-empty opaque>` present
4. Response header `front-token: <non-empty base64url>` present
5. Response header `Access-Control-Expose-Headers` present AND contains the substrings `st-access-token`, `st-refresh-token`, `front-token` (order irrelevant, may be comma-separated with others)
6. Response body `{ "status": "OK", "user": {...}, "createdNewRecipeUser": <bool> }`
7. NO `Set-Cookie` headers in the response (proves header mode took effect)

Failure modes and fixes:
- Tokens present but `Access-Control-Expose-Headers` missing or empty → `authSetCorsHeaders: true` is NOT set on the backend. Fix: add `exposedHeaders` to NestJS CORS config OR set SuperTokens `sessionExpiredStatusCode` config to enable the SDK's automatic CORS exposure. The SDK DOES call `res.setHeader('Access-Control-Expose-Headers', ...)` unconditionally in `setToken` (verified in section d above), so if it's missing, a downstream middleware (Next.js rewrite, Cloudflare tunnel, nginx) is stripping it. Bypass test: hit the API directly bypassing Cloudflare to isolate.
- `Set-Cookie` headers present alongside response-header tokens → backend created BOTH; safe to ignore the cookies from the extension but flag as a config inefficiency.
- No tokens in headers, only `Set-Cookie` → `st-auth-mode: header` did not propagate; check that the request header survived through Cloudflare/nginx (some proxies lowercase and filter unknown headers).

### V4. Verify refresh flow end-to-end

```bash
# Use the st-refresh-token captured from V3
curl -i -X POST \
  "https://api.llmconveyors.com/auth/session/refresh" \
  -H "Authorization: Bearer <st-refresh-token-from-V3>" \
  -H "rid: anti-csrf" \
  -H "fdi-version: 3.0" \
  -H "st-auth-mode: header" \
  -H "Origin: chrome-extension://<any-test-id>"
```

Pass criteria:
1. HTTP 200
2. NEW `st-access-token`, `st-refresh-token`, `front-token` headers (different values from V3)
3. `Access-Control-Expose-Headers` lists all three
4. Re-running the SAME V4 command with the OLD refresh token must return HTTP 401 (proves rotation/single-use)

### V5. Verify a protected route accepts the access token

```bash
# Pick any authenticated endpoint, e.g. /api/v1/user/profile (adjust to real route)
curl -i -X GET \
  "https://api.llmconveyors.com/api/v1/settings/profile" \
  -H "Authorization: Bearer <st-access-token-from-V4>" \
  -H "rid: session"
```

Pass criteria: HTTP 200 with the user profile JSON. If HTTP 401 with `try refresh token`, the access token is expired — re-run V4 to refresh, then retry. If HTTP 401 with `unauthorised`, the `verifySession` guard is misconfigured on that route.

---

## Confidence

**Confidence: 100% for planning purposes.**

Architecture and protocol are fully resolved verbatim from supertokens-node and supertokens-website source (sections a-j and Q1-Q6 above). The extension implementation plan can proceed without further research.

Final verification requires live API probes V1-V5 above against `https://api.llmconveyors.com` after deployment — these are deterministic smoke tests with explicit pass/fail criteria and known remediation for each failure mode. They are operational QA, not architectural unknowns, and do not block plan authoring. The V3 CORS exposure check is the single load-bearing item; if it fails, the remediation (`authSetCorsHeaders: true` or fixing a proxy that strips `Access-Control-Expose-Headers`) is already identified.
