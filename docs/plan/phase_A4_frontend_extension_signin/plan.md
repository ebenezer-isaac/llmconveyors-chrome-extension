# Phase A4 - Frontend extension-signin page

## Phase metadata

- **Plan**: 100 - Chrome Extension MVP POC + V1
- **Phase**: A4 - Frontend extension-signin page
- **Repo**: `e:/llmconveyors.com` (existing Next.js frontend)
- **Day**: 2 (2026-04-13)
- **Depends on**: A2 - Backend bridge endpoint (`POST /api/v1/auth/extension-token-exchange`) must be merged before this page can exchange tokens end-to-end
- **Blocks**: A6 - Extension auth flow (`zovo-labs/job-assistant` calls `launchWebAuthFlow` against this page)
- **Estimated effort**: 2-3 hours
- **Confidence**: 9/10 - existing patterns in `src/app/[locale]/auth/callback/google/page.tsx` give a near-exact template; only net-new concern is the redirect-origin validation regex
- **Executor**: third-party AI (Sonnet-class), 64k context window, reads only this file
- **Architect mode**: Opus writes this plan; executor writes code; Opus verifies against plan + blueprint

## Scope declaration

- **Files created**: 2
  - `src/app/[locale]/auth/extension-signin/page.tsx` (~180 lines including JSDoc + error UI)
  - `src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx` (~220 lines, 7 test cases)
- **Files modified**: 0 (this page is purely additive - no router, middleware, or sitemap changes in this phase)
- **Lines added (approx)**: ~400
- **Lines removed**: 0

## Goal

Ship a client-side Next.js page at `src/app/[locale]/auth/extension-signin/page.tsx` that serves as the browser-side half of the Chrome extension authentication handshake. The page:

1. Reads a `?redirect=<url>` query parameter and validates it matches `^https://[a-z]{32}\.chromiumapp\.org/?.*$` - the exact shape that `chrome.identity.getRedirectURL()` produces, preventing open-redirect abuse.
2. Uses `useSessionContext()` from `supertokens-auth-react/recipe/session` to determine whether the user already has a live SuperTokens cookie session on `.llmconveyors.com`.
3. If **not** authed - redirects to the existing SuperTokens login flow with `?redirectToPath=<current-url-including-redirect-param>` so the user comes back to this page after signing in.
4. If authed - POSTs to `/api/v1/auth/extension-token-exchange` with `credentials: 'include'`, receives `{ accessToken, refreshToken, frontToken, accessTokenExpiry }`.
5. Constructs a URL fragment `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` and performs `window.location.replace(redirect + fragment)` so Chrome intercepts the navigation and resolves the extension's `launchWebAuthFlow` Promise with the fragment intact.
6. Renders an error UI with a retry button if any step fails (invalid redirect param, fetch error, validation error, network failure).

This phase ships **one page component + one test file**. No routing changes, no shared-type changes (Zod schema for the response lives in shared-types already via A2), no i18n additions (per out-of-scope).

## Required reading (executor MUST read before writing any code)

Order matters - read top to bottom. Do not skim.

### From the plan directory
1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/00-decision-memo.md` - sections 2.7 (auth flow) and 2.9 (extension architecture)
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/53-supertokens-bridge-endpoint.md` - sections "Locked flow (Approach A)" and "Frontend file-by-file brief"
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/34-launch-web-auth-flow.md` - sections b (redirect URI format), g (runnable typescript), k (SuperTokens redirect page shape)
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/30-frontend-api-client.md` - to understand that the extension eventually reads these fragment tokens via `chrome.identity.launchWebAuthFlow`, stores in `chrome.storage.session`, and uses `Authorization: Bearer` for API calls

### From the codebase (line-by-line, NOT skim)
5. `e:/llmconveyors.com/src/app/[locale]/auth/callback/google/page.tsx` - the exact pattern for a client component that uses the SuperTokens SDK, handles errors via `sanitizeAuthError`, and shows an error UI. **Use this as the style template.**
6. `e:/llmconveyors.com/src/app/[locale]/auth/signout/page.tsx` - the exact pattern for a client component that reads query params, does its work in a `useEffect`, and guards against double execution with a `didRun` ref
7. `e:/llmconveyors.com/src/lib/auth/supertokens.ts` - the `ensureSuperTokensInit()` bootstrap that MUST be called at module top-level (see line 17 of `callback/google/page.tsx`)
8. `e:/llmconveyors.com/src/lib/auth/config.ts` lines 60-87 - `sanitizeRedirectPath` (for sanitizing query params) and `sanitizeAuthError` (for mapping thrown errors to i18n keys - we reuse it even though we hard-code strings; the mapping is still useful for consistent error classification)
9. `e:/llmconveyors.com/src/components/auth/__tests__/UserMenu.test.tsx` - the exact Vitest/Testing Library pattern used in this repo, including the `next-intl` mock. **Use this as the test template.**
10. `e:/llmconveyors.com/src/lib/auth/shared.ts` - note `DEFAULT_LOGIN_PATH` - this is the fallback when the user has no agent context
11. `e:/llmconveyors.com/node_modules/supertokens-auth-react/lib/build/recipe/session/types.d.ts` - to understand the `SessionContextType = LoadedSessionContext | { loading: true }` shape that `useSessionContext()` returns
12. `e:/llmconveyors.com/package.json` - to confirm `"supertokens-auth-react": "^0.51.2"` is present (it is)

### Blueprint reference
13. There is no existing `blueprint.ts` for the frontend auth directory (the frontend is not under the hex-architecture blueprint rule, which only applies to `api/src/modules/**`). However, this page MUST be documented in the README or a comment at the top of the file so future agents know it exists.

## Files to create

### File 1: `src/app/[locale]/auth/extension-signin/page.tsx`

- **Purpose**: client component that bridges a SuperTokens cookie session into a URL-fragment-encoded token pair for the Chrome extension
- **Type**: React client component (`'use client'` directive required)
- **Imports**:
  - React: `useEffect`, `useRef`, `useState`
  - `useSessionContext` from `supertokens-auth-react/recipe/session`
  - `ensureSuperTokensInit` from `@/lib/auth/supertokens`
  - `sanitizeRedirectPath` from `@/lib/auth/config` (used only for the `redirectToPath` value we build when unauth'd, NOT for the extension redirect URL which has its own validator)
- **Module-level side effect**: call `ensureSuperTokensInit()` at the top of the module, mirroring `callback/google/page.tsx:17`. This MUST run before any `useSessionContext()` call or the SDK's event bus is not initialized.
- **Default export**: `ExtensionSignInPage` (named function)
- **Length target**: 180 lines max
- **No i18n**: strings are hard-coded English per decision memo section 2.6 "i18n of the extension UI itself - English only for POC"
- **No logging**: do not import `createDebugLogger`. Errors surface in the UI; that is sufficient for the POC phase.

### File 2: `src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx`

- **Purpose**: Vitest + React Testing Library coverage of the page component
- **Type**: test file (`.test.tsx`)
- **Imports**:
  - `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` from `vitest`
  - `render`, `screen`, `waitFor` from `@testing-library/react`
  - `userEvent` from `@testing-library/user-event` (for the retry button test)
- **Mocks**:
  - `@/lib/auth/supertokens` (`ensureSuperTokensInit` → noop)
  - `supertokens-auth-react/recipe/session` (mock `useSessionContext` return value per test)
  - `global.fetch` via `vi.stubGlobal('fetch', ...)`
  - `window.location` via `Object.defineProperty(window, 'location', { writable: true, value: ... })`
- **Test cases**: 7 (listed in "Tests to write" section below)
- **Length target**: 220 lines max

## Files to modify

**None.** This page is purely additive. No router file, no middleware, no shared-types export, no README, no messages/en.json.

Verification: grep `extension-signin` across the repo after creating the files - it should appear ONLY in the two new files and NOT in any other file. If it appears elsewhere, something has drifted.

## Step-by-step implementation

### Step 1: Create the directory

```bash
mkdir -p "src/app/[locale]/auth/extension-signin/__tests__"
```

### Step 2: Create `page.tsx` with the `'use client'` directive and imports

The file MUST start with `'use client';` as line 1 (no blank line before). Then the imports block. Then the `ensureSuperTokensInit()` call at module level. This mirrors `src/app/[locale]/auth/callback/google/page.tsx` exactly.

### Step 3: Declare the module-level constants

- `CHROMIUMAPP_REDIRECT_REGEX`: a `RegExp` literal matching `^https:\/\/[a-z]{32}\.chromiumapp\.org(\/.*)?$` (see "Code snippets" section below for the exact form and rationale)
- `BRIDGE_ENDPOINT_URL`: the exact string `'/api/v1/auth/extension-token-exchange'` (relative path, since we're on the same origin)
- `FALLBACK_LOGIN_PATH`: the exact string `'/login'` - the generic SuperTokens login page. We do NOT use `resolveAgentLoginPath` because the extension-signin page has no agent context and the generic login page routes users to the correct agent after login.

### Step 4: Write the `validateExtensionRedirect(raw: string | null)` pure helper

Signature: `function validateExtensionRedirect(raw: string | null | undefined): string | null`

Logic:
1. If `raw` is null, undefined, or empty string → return `null`
2. If `raw.length > 2048` → return `null` (upper bound prevents storage overflow; `chromiumapp.org` URLs are always short)
3. Try `new URL(raw)` - if it throws → return `null`
4. Test the parsed `.href` against `CHROMIUMAPP_REDIRECT_REGEX` - if no match → return `null`
5. Return the original `raw` string (NOT `parsed.href` - we want to preserve the exact serialization the extension sent)

This is a pure function with no side effects. Testable in isolation. Do NOT use `sanitizeRedirectPath` here - that utility validates path-only strings starting with `/`, which is the opposite of what we need. The chromiumapp.org URL starts with `https://`, is cross-origin to `llmconveyors.com`, and is INTENTIONALLY not what `sanitizeRedirectPath` accepts.

### Step 5: Write the `buildFragment(tokens)` pure helper

Signature: 
```ts
function buildFragment(tokens: {
  accessToken: string;
  refreshToken: string;
  frontToken: string;
  accessTokenExpiry: number;
}): string
```

Returns a string of the form `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` where each token is `encodeURIComponent`'d. Exp is stringified via `String(tokens.accessTokenExpiry)`.

Use `URLSearchParams` internally for encoding, then prepend `#`:
```ts
const params = new URLSearchParams({
  at: tokens.accessToken,
  rt: tokens.refreshToken,
  ft: tokens.frontToken,
  exp: String(tokens.accessTokenExpiry),
});
return `#${params.toString()}`;
```

### Step 6: Write the `ExtensionSignInPage` component skeleton

- `'use client'` already at file top.
- `export default function ExtensionSignInPage()`:
  - Call `const sessionContext = useSessionContext();` at the top of the component body
  - Declare `const [status, setStatus] = useState<'validating' | 'awaiting-session' | 'exchanging' | 'redirecting' | 'error'>('validating');`
  - Declare `const [errorMessage, setErrorMessage] = useState<string | null>(null);`
  - Declare `const didRun = useRef(false);` - mirrors `signout/page.tsx:39` to prevent double-execution across React strict-mode double-renders
  - Declare `const [redirect, setRedirect] = useState<string | null>(null);` - populated on first render from `window.location.search`

### Step 7: Read and validate the `redirect` query param inside `useEffect`

Use a single top-level `useEffect` with no dependency array (runs once on mount). Inside:

1. Guard with `if (didRun.current) return; didRun.current = true;`
2. `const params = new URLSearchParams(window.location.search);`
3. `const rawRedirect = params.get('redirect');`
4. `const validRedirect = validateExtensionRedirect(rawRedirect);`
5. If `validRedirect === null`:
   - `setErrorMessage('Invalid or missing redirect parameter. This page must be opened by the LLM Conveyors Chrome extension.');`
   - `setStatus('error');`
   - `return;`
6. Else: `setRedirect(validRedirect);`

Note: the `setRedirect` state is used by the retry button to reconstruct the full page URL. Without it, retrying would lose the redirect.

### Step 8: Write a SECOND `useEffect` that reacts to `sessionContext` changes

Dependency array: `[sessionContext, redirect]`. This effect runs whenever either changes.

Guard clauses at the top:
1. If `sessionContext.loading === true` → return (still waiting for the SDK to check the cookie)
2. If `redirect === null` → return (first effect hasn't populated it yet, OR validation failed and we're in error state)
3. If `status === 'error'` → return (don't re-run on state updates after an error)
4. If `status === 'redirecting'` → return (avoid duplicate fetches mid-flight)

After guards, branch on auth:
- If `sessionContext.doesSessionExist === false`:
  - Set `status` to `'awaiting-session'`
  - Build the `redirectToPath` query value: the current page's path + query, re-encoded. Specifically: `window.location.pathname + window.location.search`. Sanitize it via `sanitizeRedirectPath` - this ensures no control chars leak into the URL.
  - Redirect: `window.location.href = \`${FALLBACK_LOGIN_PATH}?redirectToPath=${encodeURIComponent(sanitizedPath)}\`;`
  - Return.
- If `sessionContext.doesSessionExist === true`:
  - Set `status` to `'exchanging'`
  - Call `exchangeTokens(redirect)` - defined as an inner async function (see step 9)

### Step 9: Write the `exchangeTokens(redirect: string)` inner async function

Full body:
```ts
async function exchangeTokens(targetRedirect: string) {
  try {
    const response = await fetch(BRIDGE_ENDPOINT_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (!response.ok) {
      // 401 -> session expired between useSessionContext and our fetch; fall through to re-auth
      if (response.status === 401) {
        const redirectToPath = sanitizeRedirectPath(
          window.location.pathname + window.location.search,
        );
        window.location.href = `${FALLBACK_LOGIN_PATH}?redirectToPath=${encodeURIComponent(redirectToPath)}`;
        return;
      }
      throw new Error(`Bridge endpoint returned HTTP ${response.status}`);
    }

    const raw = await response.json();
    const data = raw?.data ?? raw; // tolerate both { success, data } envelope and raw body
    if (
      !data ||
      typeof data.accessToken !== 'string' ||
      typeof data.refreshToken !== 'string' ||
      typeof data.frontToken !== 'string' ||
      typeof data.accessTokenExpiry !== 'number'
    ) {
      throw new Error('Malformed response from bridge endpoint');
    }

    const fragment = buildFragment({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      frontToken: data.frontToken,
      accessTokenExpiry: data.accessTokenExpiry,
    });

    setStatus('redirecting');
    window.location.replace(targetRedirect + fragment);
  } catch (err) {
    const message =
      err instanceof TypeError
        ? 'Network error. Check your connection and retry.'
        : err instanceof Error && err.message
          ? err.message
          : 'Failed to sign in to the extension.';
    setErrorMessage(message);
    setStatus('error');
  }
}
```

Why tolerate both `{ success, data }` envelope and raw body: backend Zod validator may or may not wrap the response in the project's standard API envelope. Per decision memo section 2.7 the response is `{ accessToken, refreshToken, frontToken, accessTokenExpiry }` directly - but the global response interceptor may wrap it. Belt-and-braces.

Why fall through to re-auth on 401: the session cookie may have expired between the `useSessionContext` check and the POST. This is rare but possible. Redirecting to login is the graceful recovery.

### Step 10: Write the `handleRetry` callback

```ts
const handleRetry = () => {
  setErrorMessage(null);
  setStatus('validating');
  didRun.current = false;
  // Force a re-render; the useEffects will re-run from the top.
  // (Calling setRedirect(null) is sufficient because the second useEffect depends on redirect.)
  setRedirect(null);
};
```

### Step 11: Render the status-driven UI

Three branches inside the JSX return:

**Branch A - error**: `if (status === 'error')` → render an error card with:
- Heading: `"Extension sign-in failed"`
- Body: `{errorMessage ?? 'An unexpected error occurred.'}`
- A "Retry" button that calls `handleRetry` - only show if `redirect !== null` (don't offer retry if the redirect param itself was invalid, because retry won't help)
- A "Back to app" link that goes to `/` (the homepage) - always show

**Branch B - redirecting**: `if (status === 'redirecting')` → render a small "Redirecting to extension..." message. This branch is briefly visible before `window.location.replace` takes effect; in most cases it's invisible.

**Branch C - default (validating / awaiting-session / exchanging)**: render a spinner + status message. Use the same markup structure as `src/app/[locale]/auth/callback/google/page.tsx:122-129`:
```tsx
<div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950" role="status" aria-live="polite">
  <div className="flex flex-col items-center gap-3">
    <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-900 dark:border-t-zinc-100" aria-hidden="true" />
    <p className="text-sm text-zinc-500 dark:text-zinc-400">{statusMessage}</p>
  </div>
</div>
```

Where `statusMessage` is a derived string based on `status`:
- `'validating'` → `'Checking sign-in request...'`
- `'awaiting-session'` → `'Redirecting to sign-in...'`
- `'exchanging'` → `'Signing in to extension...'`

### Step 12: Add a top-of-file JSDoc block

```ts
/**
 * Extension sign-in bridge page.
 *
 * Used exclusively by the LLM Conveyors Chrome extension via
 * chrome.identity.launchWebAuthFlow. Converts an existing SuperTokens
 * cookie session (already set on .llmconveyors.com by the main web app)
 * into a URL-fragment-encoded token pair that Chrome resolves back to
 * the extension's service worker.
 *
 * Flow:
 *   1. extension calls launchWebAuthFlow(url: /auth/extension-signin?redirect=<chromiumapp-url>)
 *   2. this page validates the redirect param, checks SuperTokens session
 *   3. if unauth'd: redirects to /login?redirectToPath=<self>
 *   4. if authed: POST /api/v1/auth/extension-token-exchange with credentials
 *   5. build #at=<at>&rt=<rt>&ft=<ft>&exp=<exp> fragment
 *   6. window.location.replace(redirect + fragment)
 *   7. Chrome intercepts, resolves launchWebAuthFlow Promise in the extension
 *
 * See: temp/impl/100-chrome-extension-mvp/investigation/53-supertokens-bridge-endpoint.md
 * See: temp/impl/100-chrome-extension-mvp/00-decision-memo.md section 2.7
 */
```

Place this above the `export default function ExtensionSignInPage()` declaration.

### Step 13: Create the test file with imports and mocks

Mirror `src/components/auth/__tests__/UserMenu.test.tsx` for imports and mocking style. Specifically:
- Use `vi.mock('@/lib/auth/supertokens', () => ({ ensureSuperTokensInit: vi.fn() }))` at module top
- Use `vi.mock('supertokens-auth-react/recipe/session', () => ({ default: { useSessionContext: ... } }))` - but note the actual import path in the page file is `useSessionContext` as a named export from `supertokens-auth-react/recipe/session`, so the mock must match. Verify the exact export shape in the runnable file per step 14.

### Step 14: Determine the exact import shape for `useSessionContext`

Per the types in `node_modules/supertokens-auth-react/lib/build/recipe/session/useSessionContext.d.ts`, the hook is a default export of the module `supertokens-auth-react/lib/build/recipe/session/useSessionContext`. However, it is ALSO re-exported from `supertokens-auth-react/recipe/session` as a named export `useSessionContext`. The page should import it as:

```ts
import { useSessionContext } from 'supertokens-auth-react/recipe/session';
```

If this named export path fails at runtime (check via `pnpm typecheck:web` after writing the page), fall back to:

```ts
import useSessionContext from 'supertokens-auth-react/recipe/session/useSessionContext';
```

The executor MUST verify the path compiles with `pnpm typecheck:web` before committing.

### Step 15: Write 7 Vitest test cases

See "Tests to write" section below for the full list. Each test gets its own `it(...)` block.

### Step 16: Verify mocks do not leak between tests

Use `beforeEach(() => { vi.clearAllMocks(); })` and stub `window.location` via `Object.defineProperty` with `configurable: true` to allow re-stubbing per test.

### Step 17: Run `pnpm typecheck:web`

After the page and test file are written, run:
```bash
pnpm typecheck:web 2>&1 | tee logs/typecheck-web.log
```

Zero errors required. If any error appears, read `logs/typecheck-web.log` and fix incrementally.

### Step 18: Run `pnpm test:web -- extension-signin`

Run only the new test file:
```bash
pnpm test:web -- extension-signin 2>&1 | tee logs/test-web-extension-signin.log
```

All 7 tests must pass.

### Step 19: Run lint

```bash
pnpm lint 2>&1 | tee logs/lint.log
```

Zero errors, zero warnings. Fix any ESLint issues.

### Step 20: Manual smoke test (optional but recommended)

With `pnpm dev:web` running AND A2 merged AND a live SuperTokens cookie session on `.llmconveyors.com`, open:
```
http://localhost:3000/en/auth/extension-signin?redirect=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb
```

(The 32-char `a` is a fake extension ID - the regex validates shape, not existence; Chrome is the only thing that cares about the real ID, and we don't have Chrome in this smoke test.)

Expected: the page loads, shows "Signing in to extension...", then the browser tries to navigate to `https://aaaa...chromiumapp.org/cb#at=...` and fails because that domain does not resolve. That failure is EXPECTED and correct - it proves the fragment is built and `window.location.replace` is called. In a real extension context, Chrome intercepts the navigation and resolves the Promise.

### Step 21: Commit

Commit message:
```
feat(100-chrome-extension-mvp): add extension-signin bridge page

Client-side Next.js page that converts a SuperTokens cookie session into
a URL-fragment-encoded token pair for chrome.identity.launchWebAuthFlow
consumption. Paired with the A2 backend bridge endpoint.

- src/app/[locale]/auth/extension-signin/page.tsx
- src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx
```

Do NOT commit unless the user explicitly asks. This step is documentation only.

## Code snippets (critical patterns)

### 1. The redirect validation regex

```ts
/**
 * Matches exactly the URL shape that chrome.identity.getRedirectURL() produces.
 *
 * Chrome extension IDs are 32 lowercase letters a-p (derived from
 * sha256(DER(public_key))[:16] mapped hex -> a-p, per Chrome docs).
 * The authoritative format for launchWebAuthFlow redirect URIs is:
 *
 *   https://<32-lowercase-a-p>.chromiumapp.org[/optional-path]
 *
 * This regex is intentionally restrictive because the redirect param
 * is a trust boundary - whatever value we accept here is where we will
 * send the user's newly minted access/refresh tokens via URL fragment.
 * An open-redirect flaw here = credential theft. We refuse any URL that
 * does not match the chromiumapp.org shape exactly:
 *
 *   - Must be https (Chrome refuses any other scheme for this API anyway)
 *   - Must be the chromiumapp.org apex under a 32-char subdomain
 *   - Must be exactly 32 lowercase letters a-p (Chrome's base16->a-p mapping)
 *   - Path is optional but anchored (no userinfo, no port, no query allowed
 *     in the validator since the extension never produces them here)
 */
const CHROMIUMAPP_REDIRECT_REGEX = /^https:\/\/[a-p]{32}\.chromiumapp\.org(\/[^\s]*)?$/;
```

**Note on the character class `[a-p]` vs the spec in investigation 53 (`[a-z]`)**: agent 34 section c documents that extension IDs use the base16-to-a-p mapping (hex digits 0-9a-f are mapped to letters a-p), so `[a-p]` is strictly correct and tighter than `[a-z]`. Both would work; `[a-p]` is the correct belt-and-braces choice. Document this deviation in the JSDoc.

**Note on path suffix**: we allow an optional path starting with `/` and containing any non-whitespace. We explicitly do NOT allow a query string (`?`) or fragment (`#`) in the incoming redirect, because we will be appending our own `#...` fragment; a pre-existing fragment would be overwritten and a pre-existing query is a smell that suggests someone is trying to smuggle state.

### 2. The `useSessionContext` branching logic

```tsx
const sessionContext = useSessionContext();

useEffect(() => {
  if (sessionContext.loading) return;
  if (redirect === null) return;
  if (status === 'error' || status === 'redirecting') return;

  if (!sessionContext.doesSessionExist) {
    setStatus('awaiting-session');
    const selfPath = sanitizeRedirectPath(
      window.location.pathname + window.location.search,
    );
    window.location.href = `${FALLBACK_LOGIN_PATH}?redirectToPath=${encodeURIComponent(selfPath)}`;
    return;
  }

  setStatus('exchanging');
  exchangeTokens(redirect);
}, [sessionContext, redirect, status]);
```

The `sessionContext.loading` check is critical. SuperTokens' `useSessionContext` returns `{ loading: true }` on the first render and then resolves to `{ loading: false, doesSessionExist, userId, ... }` asynchronously. If we branch on `doesSessionExist` while still loading, we will incorrectly treat every user as unauthed.

### 3. The fetch call with credentials

```ts
const response = await fetch('/api/v1/auth/extension-token-exchange', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
```

- `credentials: 'include'` is required to send the `sAccessToken` / `sRefreshToken` / `sFrontToken` cookies. Same-origin request to `/api/v1/*` (proxied through Next.js in dev, rewritten in prod) - the cookies are `.llmconveyors.com` domain cookies, set during the original Google OAuth login, and same-origin fetches include them automatically, but ONLY with `credentials: 'include'` when the page runs under `llmconveyors.com` (which it does).
- `method: 'POST'` matches the NestJS controller route from A2.
- Empty JSON body (`'{}'`) because the endpoint takes no parameters - the session cookie is the only input. Content-Type header is set so NestJS's `body-parser` does not choke.
- No `Authorization` header - sessions use cookies, not Bearer tokens for session auth.

### 4. The fragment construction

```ts
function buildFragment(tokens: {
  accessToken: string;
  refreshToken: string;
  frontToken: string;
  accessTokenExpiry: number;
}): string {
  const params = new URLSearchParams({
    at: tokens.accessToken,
    rt: tokens.refreshToken,
    ft: tokens.frontToken,
    exp: String(tokens.accessTokenExpiry),
  });
  return `#${params.toString()}`;
}
```

`URLSearchParams` encodes values per application/x-www-form-urlencoded, which is compatible with fragment parsing via `new URLSearchParams(new URL(url).hash.slice(1))` on the extension side (per investigation 34 section k). The short param names `at`/`rt`/`ft`/`exp` keep the URL under browser length limits even with long JWTs.

### 5. The redirect replace

```ts
setStatus('redirecting');
window.location.replace(targetRedirect + fragment);
```

Use `replace`, not `assign` or `href =`, so the extension-signin page does NOT appear in the back-stack of the popup window opened by `launchWebAuthFlow`. If the user hits back mid-flow they should NOT be able to replay the auth exchange.

### 6. A test fixture for the happy path

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ExtensionSignInPage from '../page';

vi.mock('@/lib/auth/supertokens', () => ({
  ensureSuperTokensInit: vi.fn(),
}));

const mockUseSessionContext = vi.fn();
vi.mock('supertokens-auth-react/recipe/session', () => ({
  useSessionContext: () => mockUseSessionContext(),
}));

describe('ExtensionSignInPage', () => {
  const VALID_REDIRECT =
    'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb';
  const FAKE_TOKENS = {
    accessToken: 'stub-access-token',
    refreshToken: 'stub-refresh-token',
    frontToken: 'stub-front-token',
    accessTokenExpiry: 1_900_000_000_000,
  };

  let originalLocation: Location;
  let replaceMock: ReturnType<typeof vi.fn>;
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    replaceMock = vi.fn();
    hrefSetter = vi.fn();

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        search: `?redirect=${encodeURIComponent(VALID_REDIRECT)}`,
        pathname: '/en/auth/extension-signin',
        href: '',
        origin: 'https://llmconveyors.com',
        replace: replaceMock,
        assign: vi.fn(),
      },
    });

    Object.defineProperty(window.location, 'href', {
      configurable: true,
      set: hrefSetter,
      get: () => '',
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('happy path: valid redirect + live session -> fetch + replace with fragment', async () => {
    mockUseSessionContext.mockReturnValue({
      loading: false,
      doesSessionExist: true,
      userId: 'user-123',
      accessTokenPayload: {},
      invalidClaims: [],
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FAKE_TOKENS,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ExtensionSignInPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/extension-token-exchange',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));

    const replacedUrl = replaceMock.mock.calls[0][0] as string;
    expect(replacedUrl.startsWith(VALID_REDIRECT + '#')).toBe(true);
    const fragment = new URLSearchParams(replacedUrl.split('#')[1]);
    expect(fragment.get('at')).toBe(FAKE_TOKENS.accessToken);
    expect(fragment.get('rt')).toBe(FAKE_TOKENS.refreshToken);
    expect(fragment.get('ft')).toBe(FAKE_TOKENS.frontToken);
    expect(fragment.get('exp')).toBe(String(FAKE_TOKENS.accessTokenExpiry));
  });
});
```

## Acceptance criteria

All must be green before the phase is marked complete:

- [ ] `src/app/[locale]/auth/extension-signin/page.tsx` exists and is a valid client component (`'use client'` directive on line 1)
- [ ] `src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx` exists
- [ ] `pnpm typecheck:web` returns 0 errors
- [ ] `pnpm lint` returns 0 errors and 0 warnings for the two new files
- [ ] `pnpm test:web -- extension-signin` passes all 7 tests
- [ ] The redirect regex is unit-tested against at least 10 positive and negative fixtures (see tests below)
- [ ] The fragment format is exactly `#at=<at>&rt=<rt>&ft=<ft>&exp=<exp>` (URL-encoded), verified in the happy-path test
- [ ] The page uses `useSessionContext()` from `supertokens-auth-react/recipe/session` AND handles `loading: true` correctly (asserts via a dedicated test)
- [ ] The page calls `ensureSuperTokensInit()` at module level (not inside the component) - verified by reading the file
- [ ] The page contains NO `console.log`, NO `any` types, NO swallowed errors
- [ ] The page contains NO emojis (per project convention)
- [ ] The page contains NO em-dashes (per MEMORY.md rule `feedback_no_em_dashes.md`)
- [ ] `grep -r extension-signin src/` returns exactly 2 files (page.tsx and page.test.tsx)
- [ ] `grep -r 'extension-token-exchange' src/` returns exactly 1 file (page.tsx)
- [ ] The page does NOT import `@/lib/debug-logger`, `next-intl`, `@repo/shared-types`, or any backend module
- [ ] The page does NOT modify any existing file, blueprint, README, sitemap, or i18n dictionary
- [ ] Manual smoke test (step 20) completed - navigating to `/en/auth/extension-signin?redirect=https://<32a>.chromiumapp.org/cb` as a signed-in user triggers the fetch and the subsequent `window.location.replace` (observable via DevTools network tab + nav failure to the fake domain)

## Tests to write

All in `src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx`. Total: 7 `it` blocks.

### Test 1: `validateExtensionRedirect` unit table

Use a `describe.each` table of 10 cases covering the pure validation function. Export the function from `page.tsx` (or better: extract to a local non-exported helper and re-export for tests via a test-only barrel, OR export it prefixed with `_` to signal internal-use).

**Simpler alternative**: duplicate the regex in the test file (it is 1 line) and test the behavior via the component rendering with different `?redirect=` query params. This avoids exporting internals.

Chosen approach: **duplicate the regex in the test file**. It is 1 line, the intent is clear, and it keeps `page.tsx` free of test-only exports.

Cases:

Positive (must be accepted):
1. `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/`
2. `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb`
3. `https://ppppppppppppppppppppppppppppppppp.chromiumapp.org/foo/bar` (wait - 33 letters, should be negative)

   Correct positive: `https://ppppppppppppppppppppppppppppppppp.chromiumapp.org/foo/bar` - count letters. 33. Use 32:
   `https://pppppppppppppppppppppppppppppppp.chromiumapp.org/foo/bar`
4. `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org` (no trailing slash)
5. `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/` (trailing slash only)

Negative (must be rejected):
6. `http://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb` (not https)
7. `https://evil.com/cb` (wrong domain)
8. `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org.evil.com/cb` (subdomain hijack attempt)
9. `https://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.chromiumapp.org/cb` (z is outside `[a-p]`)
10. `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb` (31 letters, too short)
11. `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/cb` (33 letters, too long)
12. `javascript:alert(1)` (wrong scheme)
13. `` (empty)
14. `null` (literal string)

Assert via `regex.test(input)` directly.

### Test 2: Happy path - valid redirect + live session -> fetch + replace

(See the code snippet in section 6 above for the exact fixture.)

Asserts:
- `fetch` called once with the correct URL and options
- `window.location.replace` called once with `targetRedirect + '#at=...&rt=...&ft=...&exp=...'`
- Fragment parameters match the stubbed token values

### Test 3: Invalid redirect param -> error UI, no fetch

```ts
it('rejects an invalid redirect param and shows error UI without fetching', async () => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...originalLocation,
      search: '?redirect=https://evil.com/cb',
      pathname: '/en/auth/extension-signin',
      href: '',
      replace: replaceMock,
      assign: vi.fn(),
    },
  });

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  mockUseSessionContext.mockReturnValue({
    loading: false,
    doesSessionExist: true,
    userId: 'user-123',
    accessTokenPayload: {},
    invalidClaims: [],
  });

  render(<ExtensionSignInPage />);

  await waitFor(() =>
    expect(screen.getByText(/invalid or missing redirect parameter/i)).toBeInTheDocument(),
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(replaceMock).not.toHaveBeenCalled();
});
```

### Test 4: Missing redirect param -> error UI, no retry button

```ts
it('shows error UI without a retry button when redirect param is missing', async () => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...originalLocation,
      search: '',
      pathname: '/en/auth/extension-signin',
      href: '',
      replace: replaceMock,
      assign: vi.fn(),
    },
  });

  mockUseSessionContext.mockReturnValue({ loading: true });
  render(<ExtensionSignInPage />);

  await waitFor(() =>
    expect(screen.getByText(/invalid or missing redirect parameter/i)).toBeInTheDocument(),
  );
  expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
});
```

### Test 5: Unauthed session -> redirects to login with redirectToPath

```ts
it('redirects unauth\'d users to /login with redirectToPath set', async () => {
  mockUseSessionContext.mockReturnValue({
    loading: false,
    doesSessionExist: false,
    userId: '',
    accessTokenPayload: {},
    invalidClaims: [],
  });

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  render(<ExtensionSignInPage />);

  await waitFor(() => expect(hrefSetter).toHaveBeenCalled());

  const target = hrefSetter.mock.calls[0][0] as string;
  expect(target).toMatch(/^\/login\?redirectToPath=/);
  const url = new URL(target, 'https://llmconveyors.com');
  const redirectToPath = url.searchParams.get('redirectToPath');
  expect(redirectToPath).toBe('/en/auth/extension-signin');
  expect(fetchMock).not.toHaveBeenCalled();
});
```

Note: `sanitizeRedirectPath` is called on `pathname + search`. The `search` is `?redirect=...` but that starts with `?` which passes sanitization. The concatenated string is `/en/auth/extension-signin?redirect=...`. `sanitizeRedirectPath` checks it starts with `/` (yes), no control chars (yes), not `//` (correct), length under 2048 (yes). Returns the concatenated string. The test above uses the simpler case of no query param in `window.location.search` for clarity - adjust per the actual stub.

Actually the stub above sets `search: '?redirect=...'` in test 2 but test 5 uses the default from `beforeEach`. Let me re-read. The `beforeEach` sets `search: \`?redirect=${encodeURIComponent(VALID_REDIRECT)}\``. Test 5 inherits that. So `redirectToPath` will be `/en/auth/extension-signin?redirect=https%253A%252F%252F...` (double-encoded because the fragment's `encodeURIComponent` wraps it again). Assert on `.startsWith('/en/auth/extension-signin')` instead of strict equality.

### Test 6: Fetch returns 500 -> error UI with retry button

```ts
it('shows error UI with retry button when bridge endpoint fails', async () => {
  mockUseSessionContext.mockReturnValue({
    loading: false,
    doesSessionExist: true,
    userId: 'user-123',
    accessTokenPayload: {},
    invalidClaims: [],
  });

  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ExtensionSignInPage />);

  await waitFor(() =>
    expect(screen.getByText(/extension sign-in failed/i)).toBeInTheDocument(),
  );
  expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  expect(replaceMock).not.toHaveBeenCalled();
});
```

### Test 7: Network error (TypeError) -> friendly error message

```ts
it('shows a friendly network error message when fetch throws TypeError', async () => {
  mockUseSessionContext.mockReturnValue({
    loading: false,
    doesSessionExist: true,
    userId: 'user-123',
    accessTokenPayload: {},
    invalidClaims: [],
  });

  const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);

  render(<ExtensionSignInPage />);

  await waitFor(() =>
    expect(screen.getByText(/network error/i)).toBeInTheDocument(),
  );
  expect(replaceMock).not.toHaveBeenCalled();
});
```

## Rollback plan

If the phase fails verification or introduces regressions, the rollback is trivial because the phase is purely additive:

1. Delete the directory `src/app/[locale]/auth/extension-signin/` (both the page and the `__tests__` subdirectory)
2. Run `pnpm typecheck:web` to confirm zero errors
3. Run `pnpm lint` to confirm zero errors
4. Run `pnpm test:web` to confirm the remaining tests still pass

No existing files were modified, so there is no revert to apply.

Phase A4 does not affect production users in any way - the page is at a brand-new URL that nothing links to except the extension, and the extension does not exist yet. Zero blast radius on the web app.

If the decision is to temporarily disable the page without deleting it (e.g., to keep the commit history), add a `return null;` at the top of the component body and ship that as a revert commit. The page will simply render nothing and the extension will see an empty response.

## Out of scope

Explicitly NOT part of this phase - do not add any of these:

- **New i18n strings**: all UI strings in this phase are hard-coded English per decision memo section 2.6 ("i18n of the extension UI itself - English only for POC"). If the reader feels the urge to add keys to `messages/en.json`, resist. The phase A4 constraint is English-only POC.
- **Adding the page to the sitemap**: `src/app/sitemap.ts` must not be touched. This page is a functional auth bridge, not indexable content. Search engines should never discover it.
- **SEO meta tags**: no `generateMetadata` export, no `<Head>` tags, no `robots` directives. The page is a redirect target, not content. The default `app/[locale]/layout.tsx` metadata is sufficient.
- **Analytics / tracking**: no PostHog, no Google Analytics, no custom event dispatch. Sign-in events should NOT be tracked at this layer; if they need to be tracked, that belongs in the A2 backend controller (out of scope here too).
- **Rate limiting**: the backend (A2) rate-limits the exchange endpoint. The page itself does not need a client-side throttle.
- **CSRF protection**: not applicable. The bridge endpoint is session-cookie-authenticated and SuperTokens' anti-CSRF is disabled per investigation 02. The backend enforces `authSource === 'supertokens'`.
- **Opening a new window**: the page is rendered inside the extension's popup window that Chrome opens via `launchWebAuthFlow`. We do not spawn additional windows or tabs.
- **Supporting Firefox extension identity API**: Firefox is deferred to v1.1 per decision memo section 2.6.
- **Handling i18n locale in the redirect**: the locale segment (`/en/`) is part of the page path but irrelevant to the auth flow. The extension can launch with `/auth/extension-signin` OR `/en/auth/extension-signin` - both will work if the locale middleware is tolerant of either. We assume the extension always passes the locale-scoped path.
- **Multi-tenant / workspace selection**: the page mints one session for the current user's default tenant. No UI for tenant picking. Deferred to v2+.
- **Progressive Web App manifest changes**: no changes to `public/manifest.json` or `icon.png` files.
- **Blueprint updates**: the frontend has no blueprint for the auth directory. The backend blueprint update for A2 covers the endpoint contract; no frontend blueprint exists.
- **Anti-phishing / origin confirmation UI**: we do not show a "Are you sure you want to authorize this extension?" confirmation screen. The act of the user having already signed in on `llmconveyors.com` + the regex-validated chromiumapp.org URL is the trust root. A confirmation UX can be added in a v1.1 polish pass.
- **Logging events to the backend**: no POST to `/api/v1/audit/*` or similar. Backend A2 logs the exchange server-side.

## Compliance gates

Before marking the phase complete, the executor MUST confirm:

- [ ] `pnpm typecheck:web` - 0 errors
- [ ] `pnpm lint` - 0 errors, 0 warnings
- [ ] `pnpm test:web -- extension-signin` - all 7 tests green
- [ ] `pnpm compliance` - full gauntlet passes (typecheck API + web, lint, test:web, test:api). Note: A2 backend changes may still be in flight; if `test:api` fails on A2-related changes, tag the failure as "A2-dependent" and do not block A4 on it. All OTHER checks must pass.
- [ ] Grep gate: `grep -r "extension-signin" src/` returns exactly 2 files
- [ ] Grep gate: `grep -r "extension-token-exchange" src/` returns exactly 1 file (the page)
- [ ] No `console.log`, `any`, `@ts-ignore`, `@ts-expect-error`, `TODO`, `FIXME`, or `HACK` in the new files
- [ ] No em-dashes in the new files (per `feedback_no_em_dashes.md`)
- [ ] No emojis in the new files
- [ ] File sizes: `page.tsx` under 200 lines, `page.test.tsx` under 250 lines
- [ ] The `CHROMIUMAPP_REDIRECT_REGEX` matches the 5 positive fixtures and rejects the 9 negative fixtures listed in Test 1

## Post-phase handoff

When this phase completes successfully, the executor should:

1. Append a row to `temp/impl/100-chrome-extension-mvp/README.md` under a "Phase status" section (create if missing) marking A4 as DONE with the commit SHA
2. Update `MEMORY.md` at the project root under the active issues section: "Plan 100 phase A4 - extension-signin page landed, unblocks A6"
3. Notify the next executor (A6 - extension auth flow) that the bridge URL is `https://llmconveyors.com/en/auth/extension-signin?redirect=<chrome.identity.getRedirectURL()>`. The `/en/` prefix is required (not `/auth/...`) because the Next.js app router's locale segment is NOT optional in this app.

## Open questions (must be resolved before executor starts)

**None.** All decisions are locked in the decision memo section 2.7 and investigation 53. If the executor encounters an ambiguity while implementing, STOP and ask the architect - do not guess.

## Confidence breakdown

- **Redirect regex correctness**: 10/10 - the chromiumapp.org format is documented by Chrome and verified in investigation 34
- **`useSessionContext` API shape**: 10/10 - verified against `node_modules/supertokens-auth-react/lib/build/recipe/session/types.d.ts`
- **Bridge endpoint contract**: 9/10 - defined in A2; one small risk is whether the response is wrapped in the `{ success, data }` envelope. The page tolerates both shapes.
- **Test fixtures for stubbing `window.location`**: 8/10 - JSDOM has historically been finicky about `window.location` mocks. The `Object.defineProperty(window, 'location', ...)` pattern works in the rest of this repo.
- **Same-origin cookie attachment on dev vs prod**: 9/10 - on prod the page is served from `llmconveyors.com` and fetches `/api/v1/*` same-origin. On dev, Next.js proxies to `localhost:4000`; cookies set on `.llmconveyors.com` are NOT attached on localhost, so the dev smoke test requires running through the prod-like domain (either via Cloudflare tunnel or `/etc/hosts` overlay). This is a known dev constraint, not a bug.
- **Overall phase**: 9/10

## Reference: the full expected file layout after this phase

```
src/app/[locale]/auth/
  callback/
    google/
      page.tsx               (existing - unchanged)
  extension-signin/          (NEW)
    page.tsx                 (NEW - the component)
    __tests__/
      page.test.tsx          (NEW - the vitest suite)
  signout/
    page.tsx                 (existing - unchanged)
```

Nothing else under `src/` changes. No modifications to routing, middleware, i18n, blueprints, or shared-types.

## End of plan

Executor: follow steps 1-21 in order. Do not skip the `pnpm typecheck:web` and `pnpm lint` gates. Commit ONLY if the user explicitly asks; otherwise leave the working tree dirty and report completion to the architect.
