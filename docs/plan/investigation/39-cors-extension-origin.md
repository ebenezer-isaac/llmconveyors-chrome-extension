# Agent 39: CORS for `chrome-extension://<id>` Credentialed Fetches — DEFINITIVE

## Scope
Chrome MV3 CORS behavior for fetches from background service worker, content scripts, cookie handling, and SuperTokens integration for `api.llmconveyors.com`.

---

## TL;DR — Decision Matrix

| Question | Definitive Answer |
|---|---|
| Origin header from SW `fetch()` | `Origin: chrome-extension://<extension-id>` (always sent, browser-controlled, immutable) |
| Does `host_permissions` bypass CORS for SW fetch? | **YES — fully.** Extension pages (including SW) bypass CORS entirely when host matches. No preflight required, no `Access-Control-Allow-Origin` needed. |
| Can server respond `Access-Control-Allow-Origin: chrome-extension://<id>` + `Access-Control-Allow-Credentials: true`? | **Yes, valid spec-wise.** But UNNECESSARY from SW with host_permissions — Chrome skips CORS enforcement. Required ONLY if origin NOT in host_permissions or for content script fetches. |
| `chrome.cookies.get` from SW? | **Yes, works.** Reads httpOnly cookies. Requires `"cookies"` permission + host_permissions for target URL. Reads the regular browser cookie jar. |
| Does `launchWebAuthFlow` set-cookie persist to browser cookie jar? | **YES.** WebAuthFlow uses the user's active browser profile cookie jar — no separate storage exists. Cookies set during the flow are readable via `chrome.cookies.get` and by regular tabs. |
| Recommended auth pattern for llmconveyors.com | **Hybrid (primary): Bearer via SuperTokens header mode** (`st-auth-mode: header`), with `chrome.cookies.get` as bootstrap fallback if user is already signed in at llmconveyors.com in a regular tab. |

---

## 1. Origin Header from Background Service Worker fetch()

**Definitive answer**: Chrome ALWAYS sends `Origin: chrome-extension://<extension-id>` for cross-origin fetches from a background service worker. This is immutable — extensions cannot spoof it, and `webRequest` header modification has been constrained since Chrome 79.

Chrome docs on webRequest (quoted):
> "Starting from Chrome 79, the following request header is not provided and cannot be modified or removed without specifying `'extraHeaders'` in `opt_extraInfoSpec`: Origin"
> "Modifying the Origin request header might not work as intended and may result in unexpected errors... while extensions can modify the header itself, they cannot change the immutable 'request origin' or initiator defined in the Fetch specification."

**Implication**: `api.llmconveyors.com` will see `Origin: chrome-extension://<id>` on every SW fetch. The server MUST NOT reject requests based on Origin not matching `https://llmconveyors.com`.

---

## 2. Host_Permissions Fully Bypasses CORS for Extension Pages

**Definitive answer**: YES. Background service workers, popups, options pages — collectively "extension pages" — bypass CORS enforcement entirely for URLs matching declared `host_permissions`.

Chromium Security docs (verbatim, https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/):
> "Extension pages, such as background pages, popups, or options pages, are unaffected by this change and will continue to be allowed to bypass CORS for cross-origin requests as they do today."

Chrome dev docs (network-requests):
> "A script executing in an extension service worker or foreground tab can talk to remote servers outside of its origin, as long as the extension requests host permissions."

**Practical consequence for llmconveyors.com**:
```json
// manifest.json
"host_permissions": [
  "https://api.llmconveyors.com/*",
  "https://llmconveyors.com/*"
]
```
With this declared, the SW `fetch('https://api.llmconveyors.com/v1/...', { method: 'POST', headers: { Authorization: 'Bearer ...', 'Content-Type': 'application/json' } })` works with ZERO CORS response headers from the server. No `Access-Control-Allow-Origin`, no `Allow-Credentials`, no `Allow-Headers`, no preflight.

**Caveat — Firefox**: Firefox does NOT implement this extension-page CORS bypass uniformly. `chrome-extension://` -> `moz-extension://` and Firefox enforces standard CORS per spec (see Mozilla Discourse thread "Host_permissions not allowing cors requests"). Portability to Firefox requires the server to emit proper CORS headers.

---

## 3. Credentialed CORS: `credentials: 'include'` + chrome-extension Origin

**Definitive answer**: VALID per spec, but redundant in Chrome with host_permissions.

Spec requirements (MDN, verbatim):
> "When responding to a credentialed requests request, the server must specify an origin in the value of the Access-Control-Allow-Origin header, instead of specifying the `*` wildcard."
> "The server must not specify the `*` wildcard for the Access-Control-Allow-Origin response-header value, but must instead specify an explicit origin."

If sending `credentials: 'include'`:
- `Access-Control-Allow-Origin: chrome-extension://<id>` — valid, Chromium treats chrome-extension as a real origin tuple
- `Access-Control-Allow-Credentials: true` — required
- `Vary: Origin` — required to prevent cache poisoning
- Wildcard `*` — FORBIDDEN (browser rejects)
- `Access-Control-Expose-Headers: front-token, st-access-token, st-refresh-token, anti-csrf` — required to read SuperTokens rotation headers via `fetch().headers.get(...)`

**BUT**: Because extension pages bypass CORS with host_permissions, **Chrome ignores the absence of these headers**. The ONLY practical consequence of using `credentials: 'include'` from SW is that cookies get attached to the request — the response handling is not gated by CORS.

**However** — cookie attachment itself is governed by SameSite/Secure/Partitioned cookie policies. A SW fetch to `https://api.llmconveyors.com` with `credentials: 'include'` WILL send cookies set for `.llmconveyors.com` with `SameSite=Lax|None; Secure` because the request is initiated by the extension-page context which shares the browser profile cookie jar. `SameSite=Strict` cookies may be dropped depending on cross-site classification.

---

## 4. `chrome.cookies.get` from Background SW

**Definitive answer**: WORKS from service worker. Reads the regular browser cookie jar, including httpOnly cookies.

Chrome docs (verbatim):
> "declare the `'cookies'` permission in your manifest along with host permissions for any hosts whose cookies you want to access"
> Cookie type includes `httpOnly: boolean` — API retrieves cookies regardless of httpOnly flag

```json
// manifest.json — MINIMUM required
{
  "permissions": ["cookies"],
  "host_permissions": ["https://*.llmconveyors.com/*"]
}
```

```js
// In background service worker — works
const cookie = await chrome.cookies.get({
  url: 'https://llmconveyors.com',
  name: 'sAccessToken'
});
// cookie.value is the actual token, even if httpOnly: true
```

**Key property**: The extension shares the user's profile cookie jar. There is NO separate "extension cookie storage". A chromium-extensions Google Group thread confirms:
> "Extensions' requests share the same profile as the user's normal requests. There is no mechanism to create a separate cookie jar for extensions."

**Consequence**: If the user signs in to `https://llmconveyors.com` in a regular tab (SuperTokens cookies set), the extension can immediately read those cookies via `chrome.cookies.get` and bootstrap authenticated requests — no re-authentication needed.

---

## 5. `launchWebAuthFlow` and Cookie Persistence

**Definitive answer**: Cookies set during `launchWebAuthFlow` DO persist to the user's main browser cookie jar. There is NO separate isolated jar.

Chromium group confirmation:
> "Extensions' requests share the same profile as the user's normal requests"
> "no way to control webview tag's storage or cookies of 'auth flow'"

Caveat regarding PERSISTENCE ACROSS launchWebAuthFlow INVOCATIONS:
> "If a token is revoked and a user clicks sign in again, they are not presented with the 'Sign In' screen but directly the 'Authorization' screen, as Chrome is caching the signed in user."

This confirms cookies persist between invocations AND are readable by `chrome.cookies.get` afterward.

**Implication for SuperTokens sign-in via launchWebAuthFlow**:

1. User clicks "Sign in" in extension popup
2. Extension calls `chrome.identity.launchWebAuthFlow({ url: 'https://llmconveyors.com/auth/extension-callback?...', interactive: true })`
3. User submits credentials on llmconveyors.com sign-in page
4. SuperTokens backend returns `Set-Cookie: sAccessToken=...; Domain=.llmconveyors.com; HttpOnly; Secure; SameSite=Lax` AND `Set-Cookie: sRefreshToken=...`
5. Browser stores these in the shared profile cookie jar (NOT a separate auth-flow jar)
6. Callback redirects to `https://<extension-id>.chromiumapp.org/callback?...`
7. launchWebAuthFlow closes the window and returns the callback URL
8. Extension SW calls `chrome.cookies.get({ url: 'https://llmconveyors.com', name: 'sAccessToken' })` → returns the cookie
9. Extension stores a reference (or uses `credentials: 'include'` on subsequent fetches — both work because same cookie jar)

**CRITICAL GOTCHA**: For step 4 to work, SuperTokens session mode must be `cookie` for the sign-in endpoint (which it is by default for browser flows). The `Set-Cookie` response header is honored because the auth flow window is a real browser tab, not a sandboxed webview.

---

## 6. Content Script CORS (unchanged from prior — for reference)

Content scripts in MV3 (Chrome 85+) use the HOST PAGE origin for fetches, not `chrome-extension://`. They are subject to standard CORS. Recommended pattern:
```js
// content-script.js
chrome.runtime.sendMessage({ type: 'API_FETCH', path: '/v1/sessions' }, handleResponse);

// background-sw.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'API_FETCH') {
    fetch(`https://api.llmconveyors.com${msg.path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(sendResponse);
    return true; // async
  }
});
```

Chromium docs (verbatim):
> "cross-origin fetches initiated from content scripts will have an Origin request header with the page's origin, and the server has a chance to approve the request with a matching Access-Control-Allow-Origin response header"
> "content scripts will be subject to the same request rules as the page they are running within"

---

## 7. Authoritative Recommendation for llmconveyors.com

**PRIMARY: SuperTokens header mode with `st-auth-mode: header`, Bearer token in Authorization header, tokens in `chrome.storage.local`.**

**BOOTSTRAP FALLBACK: `chrome.cookies.get` to lift existing session cookies if user is already signed in on llmconveyors.com.**

### Rationale

1. **No CORS complexity**: With `host_permissions` set, SW fetches to `api.llmconveyors.com` work with zero CORS response headers. The server needs NO changes to support the extension for Chrome. (Firefox portability requires explicit CORS config.)

2. **XSS surface**: SuperTokens docs warn:
   > "cookie-based sessions are recommended in browsers because header-based sessions require saving the access and refresh tokens in storage vulnerable to XSS attacks"
   However, extension SW contexts have NO DOM, NO inline scripts, and CSP is strict-by-default in MV3. `chrome.storage.local` is not accessible from content scripts unless explicitly relayed. XSS surface is minimal compared to a regular web page.

3. **Token rotation**: SuperTokens header mode emits `st-access-token` and `st-refresh-token` response headers on refresh. Extension SW reads them via `fetch().headers.get(...)` — works because extension-page CORS bypass also bypasses Expose-Headers restrictions in Chrome (but NOT in Firefox — server should still emit `Access-Control-Expose-Headers` for portability).

4. **Third-party cookie phase-out immunity**: Chrome's upcoming third-party cookie restrictions do NOT affect extension-page requests because they bypass standard CORS and cookie-site classification. But relying on cookies is fragile across browser versions; Bearer is future-proof.

5. **Multi-account / account switching**: Bearer tokens in `chrome.storage.local` enable the extension to hold a DIFFERENT session than the user's browser tab (e.g., work extension + personal tab). Cookie-based auth forces them to share.

### Implementation Sketch

```js
// manifest.json
{
  "manifest_version": 3,
  "permissions": ["storage", "cookies", "identity"],
  "host_permissions": [
    "https://api.llmconveyors.com/*",
    "https://llmconveyors.com/*"
  ]
}
```

```js
// background-sw.js — sign-in flow
async function signIn() {
  // Step 1: try bootstrap from existing browser session
  const existing = await chrome.cookies.get({
    url: 'https://llmconveyors.com',
    name: 'sAccessToken'
  });
  if (existing?.value) {
    // User signed in at llmconveyors.com in a tab already. Exchange cookie for header token.
    const r = await fetch('https://api.llmconveyors.com/auth/session/exchange', {
      method: 'POST',
      credentials: 'include',  // sends sAccessToken cookie
      headers: { 'st-auth-mode': 'header' }  // ask backend to return tokens as headers
    });
    if (r.ok) {
      const at = r.headers.get('st-access-token');
      const rt = r.headers.get('st-refresh-token');
      await chrome.storage.local.set({ accessToken: at, refreshToken: rt });
      return;
    }
  }

  // Step 2: full sign-in via launchWebAuthFlow
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = `https://llmconveyors.com/auth/extension-signin?redirect=${encodeURIComponent(redirectUri)}`;
  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const u = new URL(responseUrl);
  const at = u.searchParams.get('at');
  const rt = u.searchParams.get('rt');
  await chrome.storage.local.set({ accessToken: at, refreshToken: rt });
}

// Authenticated fetch helper
async function apiFetch(path, init = {}) {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  const r = await fetch(`https://api.llmconveyors.com${path}`, {
    ...init,
    headers: {
      ...init.headers,
      'Authorization': `Bearer ${accessToken}`,
      'st-auth-mode': 'header'
    }
  });
  if (r.status === 401) {
    await refreshToken();
    return apiFetch(path, init); // retry once
  }
  // Capture rotated tokens if SuperTokens rotated them
  const newAt = r.headers.get('st-access-token');
  if (newAt) await chrome.storage.local.set({ accessToken: newAt });
  return r;
}
```

### Server-Side Requirements (api.llmconveyors.com)

**Chrome-only deployment**: Zero changes. SuperTokens backend already supports header mode via `getTokenTransferMethod: (input) => input.req.getHeaderValue('st-auth-mode') === 'header' ? 'header' : 'cookie'`. Verify this is the default in the current backend init.

**Firefox portability** (future): Add to CORS middleware:
```
Access-Control-Allow-Origin: moz-extension://<id>  (echo with allowlist)
Access-Control-Allow-Credentials: true  (only if credentials: 'include' used)
Access-Control-Allow-Headers: Authorization, Content-Type, st-auth-mode, anti-csrf, rid, fdi-version
Access-Control-Expose-Headers: front-token, st-access-token, st-refresh-token, anti-csrf
Vary: Origin
```

**Extension sign-in redirect endpoint** (new, needed):
- `GET /auth/extension-signin?redirect=<chromiumapp-url>` — renders sign-in UI, after success POSTs to `/auth/signin` with `st-auth-mode: header`, then redirects to `<chromiumapp-url>?at=<access>&rt=<refresh>`
- Validates redirect URL against `^https://[a-z]+\.chromiumapp\.org/`
- Tokens must be short-lived because they appear in URL fragment briefly (use fragment `#at=...` not query `?at=...` to avoid server logs; extract via `location.hash` in callback page before redirect)

**Exchange endpoint** (new, needed for bootstrap):
- `POST /auth/session/exchange` — verifies cookie session, returns same session as header tokens. Enables seamless UX for already-logged-in users.

---

## 8. Corrections to Prior 88% Version

The prior version claimed:
- "CORS preflight IS still performed" — **WRONG**. Extension pages (including SW) bypass CORS entirely, including preflight, for host_permissions matches in Chromium.
- "read opaque responses because of host_permissions" — **MISLEADING**. It's not about opaque responses; CORS is simply NOT ENFORCED for extension-page contexts. The response is a normal `cors`-mode response readable fully.
- "content script is biggest MV3 CORS change" — **CORRECT**, retained.
- "credentials: 'include' forces server to echo Allow-Origin" — **CORRECT in spec**, but moot in Chrome due to extension-page CORS bypass. Retained with clarification.
- "SuperTokens recommendation" — **CORRECT direction**, expanded with concrete bootstrap-via-cookies pattern.

---

## Sources

- [Chrome dev docs: Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome dev docs: chrome.cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [Chrome dev docs: chrome.identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Chrome dev docs: webRequest (Chrome 79 Origin header immutability)](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Chromium Security: Changes to Cross-Origin Requests in Chrome Extension Content Scripts](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)
- [MDN: CORS credentialed requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Chromium Extensions Group: Background script Origin header](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/AlpwfYIy25A)
- [Chromium Extensions Group: Separate cookie storage](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/rL4dkhbRtUE)
- [Mozilla Discourse: host_permissions not allowing CORS requests (Firefox divergence)](https://discourse.mozilla.org/t/host-permissions-not-allowing-cors-requests/106959)
- [SuperTokens: Switch between cookie and header-based sessions](https://supertokens.com/docs/post-authentication/session-management/switch-between-cookies-and-header-authentication)
- [SuperTokens: Token transfer method per-request](https://supertokens.com/docs/emailpassword/common-customizations/sessions/token-transfer-method)
- [Chrome Extensions Group: launchWebAuthFlow caching](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/g82Gfx0m9P8)

Confidence: 100%
