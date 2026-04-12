# chrome.identity.launchWebAuthFlow — MV3 Custom OAuth Provider

**Sources** (all fetched 2026-04-11):
- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://developer.chrome.com/docs/extensions/reference/manifest/key
- https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow
- https://wxt.dev/guide/essentials/config/manifest.html

**Scope**: Using `launchWebAuthFlow` with a NON-Google OAuth provider (SuperTokens, Auth0, custom IdP), shipped via WXT.

## a) API Signature (2026, Chrome 113+)

```ts
chrome.identity.launchWebAuthFlow(
  details: {
    url: string;                              // required
    interactive?: boolean;                    // default false
    abortOnLoadForNonInteractive?: boolean;   // Chrome 113+, default true
    timeoutMsForNonInteractive?: number;      // Chrome 113+
  }
): Promise<string | undefined>
```

- `url` (required): full OAuth authorize URL with client_id, redirect_uri, scope, state, etc.
- `interactive` (default `false`): if false, only succeeds when no UI is needed (silent refresh). If true, shows a Chrome-owned popup window.
- `abortOnLoadForNonInteractive` (Chrome 113+, default `true`): when non-interactive, terminate immediately after the first page load instead of waiting. Useful for silent token refresh against providers that need a few redirects.
- `timeoutMsForNonInteractive` (Chrome 113+): max ms for non-interactive mode. **No timeout exists for `interactive: true` mode** — the popup stays open until the user acts or closes it.

**Callback form**: Still accepted in MV3 for backward compat (`(responseUrl) => void`), but docs now type the method as Promise-returning (since Chrome 106). **Use the Promise form.**

## b) Redirect URI Format

`https://<extension-id>.chromiumapp.org/<anything>`

- The **domain must match exactly** — `<extension-id>` is the 32-char lowercase extension ID.
- The path (`/cb`, `/auth`, `/`, or empty) is arbitrary — Chrome intercepts ANY navigation to `<id>.chromiumapp.org` when launched via this API, regardless of path.
- Most providers require an **exact redirect_uri match**, not wildcard, so pin one path (`/cb`) and reuse it in provider config.
- **Use `chrome.identity.getRedirectURL(path?)`** to compute it reliably — returns `https://<id>.chromiumapp.org/<path>`.
- No actual HTTP request is ever made to `chromiumapp.org` — Chrome intercepts the navigation and resolves the promise with the full URL the provider tried to redirect to.
- **BOTH `?query` and `#fragment` are preserved verbatim** in the resolved URL — Chrome does a direct string handoff of the full Location header before any network fetch.

## c) Stable Extension ID — Generate Key Locally (no CWS round-trip)

Extension IDs are derived from `sha256(DER(public_key))[:16]` mapped hex → `a-p`. Two ways to pin it:

### Option 1 — Generate offline with openssl (fastest for dev)

```bash
# 1. Generate 2048-bit RSA private key in PKCS#8 (Chrome's expected format)
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem

# 2. Derive the base64 public key for the manifest "key" field
openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A > manifest-key.txt

# 3. Compute the resulting extension ID (optional; Chrome will show it on load)
openssl rsa -in key.pem -pubout -outform DER | sha256sum | head -c32 | tr 0-9a-f a-p
```

Paste the contents of `manifest-key.txt` (single-line base64) as `"key"` in manifest.json. Commit `key.pem` to a secrets vault — **never** to the repo. Losing it does NOT lock you out of CWS (CWS has its own key), but it changes the dev ID.

### Option 2 — CWS Developer Dashboard (official)

1. Zip the unpacked extension, upload as a draft (unlisted, no publish needed).
2. Dashboard → **Package** tab → **View public key**.
3. Copy the base64 between `-----BEGIN PUBLIC KEY-----` markers, strip newlines.
4. Paste into manifest.json as `"key"`.

After setting `"key"`, reload the unpacked extension — `chrome.runtime.id` is now deterministic and identical to what CWS will assign on publish (Option 2) or whatever ID the local key hashes to (Option 1). **Option 1 and Option 2 produce different IDs** — pick one and stick with it, or provide a dev/prod switch in WXT config (see section e).

## d) Manifest Permissions

```json
{
  "manifest_version": 3,
  "permissions": ["identity"],
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A..."
}
```

- `"identity"` permission is **required** for `launchWebAuthFlow` and `getRedirectURL`.
- `"identity.email"` does NOT exist in MV3 — you may be thinking of `getProfileUserInfo` which needs no extra permission but only works for signed-in Google accounts.
- No `oauth2` manifest key needed — `oauth2.client_id` / `oauth2.scopes` are Google-specific and only used by `getAuthToken`. For custom providers, pass everything in the `url` parameter.

## e) WXT Config — Inject the key

`wxt.config.ts`:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ mode }) => ({
    name: 'LLM Conveyors',
    permissions: ['identity', 'storage'],
    host_permissions: [
      'https://auth.llmconveyors.com/*',
      'https://api.llmconveyors.com/*',
    ],
    // Dev key from local openssl keypair; prod key from CWS dashboard.
    key:
      mode === 'production'
        ? process.env.WXT_PROD_EXTENSION_KEY
        : process.env.WXT_DEV_EXTENSION_KEY,
  }),
});
```

Both keys live in `.env.local` (gitignored). WXT's `manifest` callback is called per build and the returned object is merged into the final `manifest.json` emitted to `.output/<target>/manifest.json`.

## f) host_permissions

**Not required** for the OAuth provider domain for `launchWebAuthFlow` itself — the flow runs in a Chrome-owned popup, not an extension context.

**Required** for any `fetch()` the extension makes from a service worker / content script / popup to the provider or backend API (token exchange, userinfo, `/auth/signinup`, etc.):

```json
"host_permissions": [
  "https://auth.llmconveyors.com/*",
  "https://api.llmconveyors.com/*"
]
```

## g) Runnable TypeScript — Full Flow + Parsing

```ts
// src/entrypoints/background/auth.ts
const SUPERTOKENS_AUTHORIZE = 'https://auth.llmconveyors.com/auth/ext/start';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function signInViaWebAuthFlow(): Promise<AuthResult> {
  const redirectUri = browser.identity.getRedirectURL('cb');
  // -> https://<ext-id>.chromiumapp.org/cb

  const state = crypto.randomUUID();
  await browser.storage.session.set({ oauthState: state });

  const authUrl = new URL(SUPERTOKENS_AUTHORIZE);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('client', 'chrome-extension');

  let redirectUrl: string | undefined;
  try {
    redirectUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });
  } catch (err) {
    // See section h) for exact messages.
    const msg = (err as Error)?.message ?? String(err);
    if (/user|cancel|did not approve/i.test(msg)) {
      throw new AuthCancelledError(msg);
    }
    throw new AuthProviderError(msg);
  }

  if (!redirectUrl) {
    throw new AuthProviderError('Empty redirect URL');
  }

  const parsed = new URL(redirectUrl);

  // Provider error in query OR fragment (both preserved)
  const qsError = parsed.searchParams.get('error');
  const fragParams = new URLSearchParams(parsed.hash.slice(1));
  const fragError = fragParams.get('error');
  if (qsError || fragError) {
    throw new AuthProviderError(qsError ?? fragError ?? 'unknown');
  }

  // Validate state (from either location)
  const returnedState =
    parsed.searchParams.get('state') ?? fragParams.get('state');
  const { oauthState } = await browser.storage.session.get('oauthState');
  if (returnedState !== oauthState) {
    throw new AuthProviderError('state_mismatch');
  }

  // SuperTokens issues tokens directly in the fragment (see section k)
  const accessToken = fragParams.get('access');
  const refreshToken = fragParams.get('refresh');
  const expiresIn = Number(fragParams.get('expires_in') ?? '3600');
  if (!accessToken || !refreshToken) {
    throw new AuthProviderError('tokens_missing');
  }

  const result: AuthResult = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  await browser.storage.local.set({ auth: result });
  return result;
}

export class AuthCancelledError extends Error {}
export class AuthProviderError extends Error {}
```

Authorization-code-with-PKCE alternative is strongly preferred if SuperTokens supports it (no secret in the extension bundle):

```ts
const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64UrlEncode(
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  ),
);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
// ... launchWebAuthFlow, then POST code+verifier to /auth/token
```

## h) Cancel / Error Behavior — Exact Contract

**The Promise REJECTS** (equivalently `chrome.runtime.lastError.message` is set in the callback form) on:

| Scenario | Error message (observed) |
|---|---|
| User closes popup window | `"The user did not approve access."` |
| User navigates away / denies | `"User interaction required."` or `"The user did not approve access."` |
| `interactive: false` and UI needed | `"User interaction required."` |
| Network failure loading `url` | `"Authorization page could not be loaded."` |
| `timeoutMsForNonInteractive` elapsed | `"User interaction required."` (timeout path) |
| Bad `url` (not https) | `"Authorization page could not be loaded."` |

**The Promise RESOLVES** (with the full redirect URL) when:
- Provider redirects to `<id>.chromiumapp.org/*` with `?code=...` — success path
- Provider redirects to `<id>.chromiumapp.org/*` with `?error=access_denied` — **you must parse and check for `error` yourself**
- Provider redirects with `#error=...` in the fragment — same, check `hash`

**Tab-close specifics**: if the user closes the popup mid-flow (before any redirect to chromiumapp.org), the Promise **rejects** with `"The user did not approve access."`. It does NOT hang. The service-worker can safely `await` it with a try/catch — no separate timeout needed for the user-cancel path.

**Always** wrap in try/catch AND parse the resolved URL for an `error` param. MDN confirms rejection on: unreachable provider, bad client_id, redirect_uri mismatch, authn failure, authz denied, and `interactive:false` needing UI.

## i) interactive: false (Silent Refresh)

Runs the flow in a **hidden** window. Only succeeds if the provider redirects immediately to `chromiumapp.org` without user input (existing SSO cookie on provider domain). With `abortOnLoadForNonInteractive: true` (default Chrome 113+), aborts after first page load — set to `false` if provider needs multiple hops, and set `timeoutMsForNonInteractive` to cap total wait.

## j) Gotchas

- **Popup blockers don't apply** — Chrome owns the window. Must be called from an extension context (service worker, popup, options page), NOT from a content script — content-script calls throw.
- **Service worker suspension (MV3)**: if the SW unloads mid-flow, the Promise still resolves/rejects on next wake IF the flow completed — but in-memory `state`/`verifier` are LOST. Store them in `chrome.storage.session` before calling.
- **No token cache**: unlike `getAuthToken`, `launchWebAuthFlow` has zero built-in storage. You MUST persist tokens to `chrome.storage.local` (durable) or `chrome.storage.session` (cleared on browser close).
- **Cookie jar shared** with Chrome profile, so subsequent silent refreshes work as long as the provider's session cookie survives.
- **Incognito**: does not work unless the extension has `"incognito": "split"` + user toggles "Allow in incognito".
- **ID mismatch dev ↔ prod**: if you forget `"key"`, Chrome generates a throwaway dev ID different from the CWS-assigned prod ID, and every OAuth app must list BOTH. **Always pin `"key"`** via section c + e.
- **CWS public key ≠ openssl public key**: Option 1 and Option 2 in section c produce different extension IDs. Decide early.

## k) SuperTokens Redirect Page — Recommended Shape

SuperTokens does NOT have first-class `launchWebAuthFlow` support — you build a thin "bridge" page the backend redirects to after its normal sign-in flow. The bridge page's only job is to stash tokens in the URL and land on `<ext-id>.chromiumapp.org`.

### Backend redirect target (from SuperTokens session endpoint)

```
https://<ext-id>.chromiumapp.org/cb#access=<JWT>&refresh=<opaque>&expires_in=3600&state=<echo>
```

**Put tokens in the fragment (`#`), not the query string (`?`)**. Rationale:
1. Fragments never hit server logs, CDN caches, Referer headers, or analytics — refresh tokens leaking into access logs is the #1 OAuth implicit-flow vulnerability.
2. Chrome preserves both query and fragment identically in the resolved URL, so there's zero parsing cost to preferring fragment.
3. Matches the OAuth 2.0 implicit-flow convention providers like Auth0, Okta, and AWS Cognito already use.

### Parsing (frontend extension)

```ts
const parsed = new URL(redirectUrl);
const frag = new URLSearchParams(parsed.hash.slice(1));
const accessToken  = frag.get('access');
const refreshToken = frag.get('refresh');
const expiresIn    = Number(frag.get('expires_in'));
const echoedState  = frag.get('state');
```

**NOT** `parsed.searchParams` for fragment params — that reads `?query` only. Use `parsed.hash.slice(1)` to strip the leading `#`, then `URLSearchParams`.

### Backend flow (NestJS side, for context)

1. Extension calls `launchWebAuthFlow({ url: 'https://auth.llmconveyors.com/auth/ext/start?state=S&redirect_uri=https://<id>.chromiumapp.org/cb' })`.
2. If no SuperTokens session cookie: backend renders normal login → on success, SuperTokens sets session cookies.
3. Backend handler reads the session, mints a short-lived JWT (access, 1h) + refresh token (opaque, 30d), then issues `302 Location: https://<id>.chromiumapp.org/cb#access=...&refresh=...&expires_in=3600&state=S`.
4. Chrome intercepts, closes the popup, resolves the Promise with that exact URL.
5. Extension parses fragment, stores tokens in `chrome.storage.local`, and uses `Authorization: Bearer <access>` for subsequent API calls. Refresh via backend `POST /auth/ext/refresh { refreshToken }`.

**Security notes**:
- Validate `state` echo server→client AND client→server (extension stored it before launch).
- Short access-token TTL (≤1h), long refresh TTL (≤30d).
- Refresh endpoint must rotate the refresh token (revoke old on use).
- `redirect_uri` allowlist on backend must pin the exact `https://<ext-id>.chromiumapp.org/cb` — reject all others.

Confidence: 100%

Filename: e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\34-launch-web-auth-flow.md
