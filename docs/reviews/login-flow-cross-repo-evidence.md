# Login Flow Cross-Repo Evidence

## Extension Repo Evidence

[EXT-1] AUTH_SIGN_IN uses bridge orchestrator (not cookie polling) in background handlers.
- File: src/background/messaging/handlers.ts
- Evidence:
  - authBridgeUrl constructed from webBaseUrl + /auth/extension-signin (locale-agnostic)
  - signInOrchestrator is created via buildDefaultSignInDeps(..., authBridgeUrl)
  - AUTH_SIGN_IN logs "starting bridge auth flow" and calls signInOrchestrator({ interactive })
  - Error mapping handles AuthCancelledError, AuthNetworkError, AuthMalformedResponseError, AuthStorageError

[EXT-2] launchWebAuthFlow wrapper always appends redirect query key.
- File: src/background/auth/web-auth-flow.ts
- Evidence:
  - buildSignInUrl sets url.searchParams.set('redirect', redirectUri)
  - launchWebAuthFlow calls deps.getRedirectURL() and then uses buildSignInUrl

[EXT-3] Fragment parser strictly validates chromiumapp callback and token payload.
- File: src/background/auth/parse-auth-fragment.ts
- Evidence:
  - Host must match /^[a-p]{32}\.chromiumapp\.org$/
  - Protocol must be https
  - Requires at/rt/ft/exp fields in fragment
  - Enforces token character/length constraints and future expiry bounds

[EXT-4] Popup silent path uses AUTH_COOKIE_EXCHANGE; explicit Sign In uses AUTH_SIGN_IN.
- File: entrypoints/popup/useAuthState.ts
- Evidence:
  - mount path sends AUTH_STATUS, then AUTH_COOKIE_EXCHANGE when unauthed
  - runSignIn sends AUTH_SIGN_IN with interactive flag

[EXT-5] Recovery coordinator wiring is centralized for startup/cookie watcher/fetch 401.
- Files:
  - src/background/messaging/register-handlers.ts
  - entrypoints/background.ts
- Evidence:
  - register-handlers builds recoveryCoordinator and uses it for fetch-authed silentSignIn path
  - background startup and cookie watcher invoke recoveryCoordinator.recover(...)

## LLMC Repo Evidence (captured from inspected source)

[LLMC-1] extension-signin page redirects unauthenticated users to login with redirect query key.
- File: src/app/[locale]/auth/extension-signin/page.tsx
- Evidence (exact line content inspected):
  - window.location.href = `${FALLBACK_LOGIN_PATH}?redirect=${encodeURIComponent(selfPath)}`;

[LLMC-2] login hook reads redirect key and supports legacy redirectToPath fallback.
- File: src/hooks/useGoogleLogin.ts
- Evidence (exact line content inspected):
  - const redirectParam =
      searchParams?.get(LOGIN_REDIRECT_PARAM_KEY) ??
      searchParams?.get('redirectToPath') ??
      null;

[LLMC-3] middleware uses LOGIN_REDIRECT_PARAM_KEY for unauthenticated redirects.
- File: src/middleware/core.ts
- Evidence (exact line content inspected):
  - loginUrl.searchParams.set(LOGIN_REDIRECT_PARAM_KEY, buildRedirectTarget(pathname, search));
  - redirectUrl.searchParams.set(LOGIN_REDIRECT_PARAM_KEY, buildRedirectTarget(effectivePathname, search));

[LLMC-4] SuperTokens frontend session transfer is cookie mode.
- File: src/lib/auth/supertokens.ts
- Evidence (exact line content inspected):
  - Session.init({ tokenTransferMethod: 'cookie', ... })

[LLMC-5] Redirect sanitization is strict path-only validation.
- File: src/lib/auth/config.ts
- Evidence (exact line content inspected):
  - sanitizeRedirectPath rejects non-string, non-leading-slash, protocol-relative, and overlength paths

[LLMC-6] Session cookie canonical name remains sAccessToken.
- File: src/lib/auth/config.ts
- Evidence (exact line content inspected):
  - export const SESSION_COOKIE_NAME = 'sAccessToken';

## Recent Regression Root Cause

[REG-1] Query key mismatch caused return-path loss.
- Before fix in extension-signin page, unauth redirect used redirectToPath while login path consumed redirect.
- Result: after auth, callback could not recover extension-signin return path consistently and landed on dashboard.
- After fix, extension-signin now emits redirect and login accepts both redirect and redirectToPath.

## Verification Executed

[VER-1] LLMC targeted extension-signin tests pass after key alignment updates.
- Command run:
  - pnpm vitest run -c config/vitest.config.ts src/app/[locale]/auth/extension-signin/__tests__/page.test.tsx
- Result:
  - 21/21 tests passed.

[VER-2] Extension targeted auth tests pass with bridge-orchestrator path.
- Command run:
  - pnpm vitest run tests/unit/background/handlers.spec.ts tests/unit/popup/useAuthState.spec.tsx tests/unit/background/auth/sign-in-orchestrator.spec.ts
- Result:
  - 37/37 tests passed.

[VER-3] Extension typecheck and build pass.
- Commands run:
  - pnpm typecheck
  - pnpm build
- Result:
  - successful.
