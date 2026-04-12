# Phase A2 — Backend bridge endpoint

## Phase metadata
- Code: A2
- Name: Backend bridge endpoint
- Day: 1 (2026-04-12)
- Repo: e:/llmconveyors.com
- Depends on: (none)
- Blocks: A6 (extension auth flow)
- Estimated effort: 2-3 hours
- Parallel-safe with: B1, A4 (only if A2 is done first), A1

## Required reading

Before touching any code, read these files in full:

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/00-decision-memo.md` lines 172-201 — Section 2.7 "Auth flow (locked per agent 53, Approach A)". This is the single source of truth for what endpoint to build. Decisions are locked — do not second-guess them.
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/53-supertokens-bridge-endpoint.md` lines 80-146 — the "Locked flow (Approach A)" section through the "Backend file-by-file brief". This is the spine of this phase.
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/01-supertokens-init.md` lines 1-68 — SuperTokens init context. Confirms `Session.init({...})` at `api/src/modules/auth/supertokens/supertokens.config.ts:81-92` with `exposeAccessTokenToFrontendInCookieBasedAuth: false`.
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/02-supertokens-cookies.md` lines 1-51 — cookie lifecycle, TTLs (1h access / 100d refresh), `getTokenTransferMethod` NOT overridden so `st-auth-mode: header` opt-in path is available.
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/04-auth-guard.md` lines 1-83 — AuthGuard resolution order. Critical: session users bypass `ScopeGuard`; `authSource` is `'supertokens'` for cookie callers and `'api-key'` for API-key callers.
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/18-error-envelope.md` lines 14-75 — error envelope shape. The bridge endpoint responses will flow through `ApiExceptionFilter` on failure and `ResponseTransformInterceptor` on success.

Then skim these files from the codebase (read in full — do not grep-and-guess):

- `e:/llmconveyors.com/api/src/modules/auth/auth.module.ts` — full module (lines 1-103). Currently has `controllers: []` (line 68).
- `e:/llmconveyors.com/api/src/modules/auth/adapters/supertokens-auth-verifier.adapter.ts` — lines 1-103. Shows the correct import pattern: `import Session from 'supertokens-node/recipe/session'`.
- `e:/llmconveyors.com/api/src/modules/auth/supertokens/supertokens.config.ts` lines 81-92 — confirms `Session.init` config.
- `e:/llmconveyors.com/api/src/modules/auth/guards/auth.guard.ts` lines 21-138 — for `UserContext` shape and the `(req as unknown as RequestWithUser).user = userContext` pattern.
- `e:/llmconveyors.com/api/src/modules/auth/dto/user-context.dto.ts` — `UserContext` interface (extends `AuthUserContext`, has `authSource: 'supertokens' | 'api-key'`).
- `e:/llmconveyors.com/api/src/modules/auth/decorators/current-user.decorator.ts` — the `@CurrentUser()` param decorator you will use on the handler.
- `e:/llmconveyors.com/api/src/modules/auth/blueprint.ts` lines 1-80 — blueprint structure; you will add a new endpoint entry.
- `e:/llmconveyors.com/api/src/modules/privacy/privacy.controller.ts` lines 1-140 — reference controller showing the idiomatic `@Controller`, `@UseGuards`, `@ApiBearerAuth`, `@CurrentUser()` pattern used elsewhere in this codebase.
- `e:/llmconveyors.com/api/src/modules/auth/__tests__/user-deletion.service.spec.ts` lines 1-80 — reference spec showing how SuperTokens is mocked via `jest.mock('supertokens-node/recipe/session', ...)`.
- `e:/llmconveyors.com/libs/shared-types/src/index.ts` lines 1-60 — barrel export file, you will add a new export line.
- `e:/llmconveyors.com/libs/shared-types/src/schemas/settings-api.schema.ts` lines 1-40 — reference Zod schema file showing the `z.object({...}).strict()` + `z.infer<typeof>` pattern used elsewhere.

Do NOT read the full blueprint.ts file more than once; it is long but you only need to know the shape to add one endpoint entry.

## Files to create

1. **`e:/llmconveyors.com/libs/shared-types/src/schemas/auth-api.schema.ts`** (new, ~30 lines) — Zod schema for `ExtensionTokenExchangeResponseSchema`.
2. **`e:/llmconveyors.com/api/src/modules/auth/auth.controller.ts`** (new, ~95 lines) — the NestJS controller exposing `POST /api/v1/auth/extension-token-exchange`.
3. **`e:/llmconveyors.com/api/src/modules/auth/__tests__/auth.controller.spec.ts`** (new, ~170 lines) — unit tests covering happy path, api-key rejection, header scrubbing, and error path.

## Files to modify

1. **`e:/llmconveyors.com/libs/shared-types/src/index.ts`** — add `export * from './schemas/auth-api.schema';` near the other schema re-exports (around line 27).
2. **`e:/llmconveyors.com/api/src/modules/auth/auth.module.ts`** — add `AuthController` to the `controllers: []` array at line 68 (change to `controllers: [AuthController]`) and add the matching import near the top.
3. **`e:/llmconveyors.com/api/src/modules/auth/blueprint.ts`** — append a new endpoint entry inside the `endpoints` array documenting `POST /api/v1/auth/extension-token-exchange`, plus add an invariant under the module that the bridge never invalidates the caller's existing session.

No other files are modified. `api/src/main.ts` is unchanged — CORS already allows `st-auth-mode`, `Authorization`, `fdi-version`, `rid` at `main.ts:49` (verified in investigation 53 lines 13, 100).

## Step-by-step implementation

1. **Verify baseline**: `cd e:/llmconveyors.com && git status` — should be clean. `pnpm -F @repo/shared-types build` to confirm shared-types builds green before we touch it. `pnpm typecheck:api` to confirm api typechecks green.

2. **Create the Zod schema** at `libs/shared-types/src/schemas/auth-api.schema.ts`. Define `ExtensionTokenExchangeResponseSchema` as a `z.object({...}).strict()` with four fields: `accessToken` (non-empty string), `refreshToken` (non-empty string), `frontToken` (non-empty string), `accessTokenExpiry` (positive int). Export both the schema and the inferred type. See the "Code snippets" section below for the exact content.

3. **Wire the schema into the shared-types barrel** by adding `export * from './schemas/auth-api.schema';` to `libs/shared-types/src/index.ts`. Place it directly under the `export * from './schemas/resume.schema';` line (current line 27 of `index.ts`) so related auth/api schemas live together visually. Do NOT remove any existing exports.

4. **Rebuild shared-types**: `pnpm -F @repo/shared-types build`. The API cannot consume the new schema until this succeeds. If it fails, fix it before proceeding — do not move to step 5 until the build is green.

5. **Create the controller file** at `api/src/modules/auth/auth.controller.ts`. Imports (all from existing modules, no new npm deps):
   - `{ Controller, Post, HttpCode, HttpStatus, UseGuards, Req, Res, ForbiddenException, InternalServerErrorException, Logger }` from `@nestjs/common`
   - `{ ApiTags, ApiBearerAuth, ApiSecurity, ApiOperation, ApiResponse }` from `@nestjs/swagger`
   - `Session` default from `supertokens-node/recipe/session` (matches line 3 of `supertokens-auth-verifier.adapter.ts`)
   - `type { Request, Response }` from `express`
   - `AuthGuard` from `./guards/auth.guard`
   - `CurrentUser` from `./decorators/current-user.decorator` (or `./decorators` via the barrel; check `decorators/index.ts` first — privacy controller line 21 uses the barrel)
   - `type { UserContext }` from `./dto/user-context.dto`
   - `type { ExtensionTokenExchangeResponse }` from `@repo/shared-types`

6. **Controller class shell**: annotate with `@ApiTags('Auth')`, `@ApiBearerAuth('bearer')`, `@ApiSecurity('api-key')`, `@Controller('auth')`, `@UseGuards(AuthGuard)`. Note: do NOT add `ScopeGuard` — the decision memo (line 178) and investigation 53 (lines 102, 110) both require session-only, no scope checks. Do NOT add `@UseInterceptors(ApiKeyAuditInterceptor)` either — this endpoint rejects api-key callers explicitly so the audit interceptor is pointless here. Construct a private `Logger` instance (`private readonly logger = new Logger(AuthController.name)`).

7. **Handler signature**: `@Post('extension-token-exchange') @HttpCode(HttpStatus.OK) async exchangeExtensionToken(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user: UserContext): Promise<ExtensionTokenExchangeResponse>`. `passthrough: true` is critical — it lets Nest serialize the returned body AFTER we have had our hands on the raw response to scrub headers. Verified: investigation 53 line 112.

8. **Api-key rejection guard (first line of handler body)**: `if (user.authSource !== 'supertokens') { throw new ForbiddenException('Extension token exchange requires a session user'); }`. This prevents an infinite loop where an extension call with its own Bearer token would try to mint yet another token. Source: investigation 53 lines 114-115. The `UserContext.authSource` field is set by `SuperTokensAuthVerifier` (`supertokens-auth-verifier.adapter.ts:74`) to `'supertokens'` and by `AuthGuard.authenticateApiKey` (`auth.guard.ts:122`) to `'api-key'`.

9. **Force header-mode transfer for the NEW session**: mutate the request headers BEFORE calling `createNewSession`. Write `(req.headers as Record<string, string>)['st-auth-mode'] = 'header';`. This is the key trick from investigation 53 lines 27-31 and locked by decision memo line 179. SuperTokens reads `req.headers['st-auth-mode']` via `getAuthModeFromHeader(req)` at session-create time, which is why we can override it server-side.

10. **Re-resolve the existing session** to extract `tenantId` and `recipeUserId` (these are not on `UserContext`). Call `const stUser = await Session.getSession(req, res, { sessionRequired: true });`. This is cheap (the session is already verified by `AuthGuard`) and it gives us access to `getTenantId()` and `getRecipeUserId()` on the session object. Wrap this in a `try/catch` — if `Session.getSession` throws, log it and rethrow as `InternalServerErrorException('Failed to resolve current session')` with structured logging (never leak SuperTokens internals). Verified: investigation 53 line 116.

11. **Mint the sibling session**: `const newSession = await Session.createNewSession(req, res, stUser.getTenantId(), stUser.getRecipeUserId(), {}, {}, {});`. Investigation 53 line 117. The three empty objects are: (a) access-token payload additions, (b) session data, (c) user context (all defaults for this endpoint). Wrap in `try/catch` — on throw, log with `this.logger.error('[AUTH:bridge] createNewSession failed', { uid: user.uid, error })`, then throw `InternalServerErrorException('Failed to mint extension session')`. Do NOT echo the inner SuperTokens message.

12. **Read the tokens from the response headers** before we scrub them. Use `res.getHeader('st-access-token')`, `res.getHeader('st-refresh-token')`, `res.getHeader('front-token')`. Each is a `string | number | string[] | undefined`. Cast each via `const access = String(res.getHeader('st-access-token') ?? '');` and assert non-empty afterward. If any of the three is empty, log `this.logger.error('[AUTH:bridge] Expected response headers missing after createNewSession', { uid: user.uid })` and throw `InternalServerErrorException('Failed to mint extension session')`. Verified: investigation 53 line 118.

13. **Decode `accessTokenExpiry` from `frontToken`**: `frontToken` is a base64url-encoded JSON payload of the form `{ uid, ate, up }` where `ate` is the access-token-expiry in ms since epoch. Use `Buffer.from(frontToken, 'base64url').toString('utf8')`, `JSON.parse(...)`, then `Number(parsed.ate)`. Wrap in `try/catch`; on failure, fall back to `Date.now() + 3600 * 1000` (1 hour — matches SuperTokens default access-token TTL from investigation 02 line 12) and log a warning. This `accessTokenExpiry` is a convenience for the extension SDK so it can preemptively refresh; if decoding fails, the extension will still work via the 401-then-refresh path.

14. **Scrub the response headers** so the browser does not accidentally adopt the new session. Iterate the exact list from investigation 53 line 119 and decision memo line 180:
    ```ts
    const headersToStrip = [
      'st-access-token',
      'st-refresh-token',
      'front-token',
      'anti-csrf',
      'access-control-expose-headers',
    ] as const;
    for (const h of headersToStrip) res.removeHeader(h);
    ```
    `anti-csrf` is included for defense-in-depth even though agent 02 section d verified `antiCsrf` is effectively `NONE` — if a future config change enables CSRF, this line will still be correct. `access-control-expose-headers` is scrubbed because SuperTokens may have appended `st-access-token, st-refresh-token, front-token` to it and we do not want the browser to observe them. Note lowercase — Express/Node normalize header names to lowercase.

15. **Return the response body** as `{ accessToken: access, refreshToken: refresh, frontToken, accessTokenExpiry }`. This matches the `ExtensionTokenExchangeResponse` type inferred from the Zod schema. `ResponseTransformInterceptor` (global, registered at `api/src/app.module.ts:109`) will wrap it as `{ success: true, data: { accessToken, ... }, requestId, timestamp }` automatically (verified investigation 18 lines 38-47). Do NOT wrap it yourself.

16. **Add happy-path debug log** at the end (before the return): `this.logger.debug('[AUTH:bridge] Minted extension session', { uid: user.uid })`. No token material in the log — only the user id. Investigation 18 line 113 confirms 4xx responses are not automatically logged, and investigation 18 line 105 warns that `HttpException` bodies are forwarded verbatim, so be precise in log content.

17. **Update `auth.module.ts`** at line 1 area to add `import { AuthController } from './auth.controller';`. Then change `controllers: [],` at line 68 to `controllers: [AuthController],`. No other changes in this file — no providers added, no exports added.

18. **Update `auth.module.ts` blueprint** at `api/src/modules/auth/blueprint.ts`. Inside the existing `endpoints: [...]` array (currently only contains the `GET /api/v1/auth/export` entry at lines 14-69), add a new entry for `POST /api/v1/auth/extension-token-exchange`. Required fields per the `ModuleBlueprint` type: `method`, `path`, `description`, `sourceRef`, `guards` (single `AuthGuard` entry with `checks: 'Validates SuperTokens session only. Rejects api-key callers with 403.'`, `rejectStatus: 401`), `requiresAuth: true`, a `successResponse` with invariants for the four body fields, and `errorResponses` for 401 (no session) and 403 (api-key caller). Reference the shape of the existing export endpoint for field ordering.

19. **Add a module-level invariant** to the `blueprint.ts` `invariants` array (scan the file for the existing array — it lives further down in the file). Add an invariant with `id: 'bridge-does-not-invalidate-caller-session'`, `description: 'POST /auth/extension-token-exchange mints an independent sibling SuperTokens session and never invalidates or rotates the caller's existing cookie session.'`, `severity: 'error'`. Verified: investigation 53 line 32 and decision memo line 179.

20. **Write the test file** at `api/src/modules/auth/__tests__/auth.controller.spec.ts`. Use the jest.mock pattern from `user-deletion.service.spec.ts` lines 25-42 to mock `supertokens-node/recipe/session`. Follow the six test cases listed in the "Tests to write" section below. All mocks should be pure jest — no real Express request. See the "Code snippets" section for the test scaffolding.

21. **Run shared-types build**: `pnpm -F @repo/shared-types build`. Must succeed.

22. **Run typecheck**: `pnpm typecheck:api`. Must be zero errors. If there are errors, read `logs/typecheck-api.log` to get the exact file:line and fix. Never use `any` or `@ts-ignore`.

23. **Run lint**: `pnpm lint`. Fix any lint errors — do not suppress. The controller must not have unused imports.

24. **Run the auth module tests**: `pnpm test:api:module auth`. All tests must pass, including the new `auth.controller.spec.ts`.

25. **Final sanity grep**: search for `extension-token-exchange` across the repo. Should have hits in: the controller, the test file, the blueprint entry, the shared-types schema (as a doc comment or implicitly). No unexpected matches.

## Code snippets (critical patterns)

### 1. `libs/shared-types/src/schemas/auth-api.schema.ts`

```typescript
import { z } from 'zod';

/**
 * POST /api/v1/auth/extension-token-exchange response body.
 *
 * Returned when a cookie-session user on llmconveyors.com asks the backend to
 * mint an independent SuperTokens header-mode session that the Chrome
 * extension can consume via `Authorization: Bearer <accessToken>`.
 *
 * Invariant: this endpoint MUST NOT invalidate the caller's existing cookie
 * session. The returned tokens belong to a brand new sibling session created
 * via `Session.createNewSession` with `st-auth-mode: header` forced by the
 * backend.
 */
export const ExtensionTokenExchangeResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    frontToken: z.string().min(1),
    accessTokenExpiry: z.number().int().positive(),
  })
  .strict();

export type ExtensionTokenExchangeResponse = z.infer<
  typeof ExtensionTokenExchangeResponseSchema
>;
```

### 2. Controller core — `createNewSession` + header scrubbing

This is the load-bearing sequence. Every line matters.

```typescript
// 1. Reject api-key callers
if (user.authSource !== 'supertokens') {
  throw new ForbiddenException(
    'Extension token exchange requires a session user',
  );
}

// 2. Force the NEW session to be emitted as response headers, not cookies.
//    SuperTokens reads req.headers['st-auth-mode'] inside createNewSession.
(req.headers as Record<string, string>)['st-auth-mode'] = 'header';

// 3. Re-resolve the current session to get tenantId + recipeUserId.
let stUser: Awaited<ReturnType<typeof Session.getSession>>;
try {
  stUser = await Session.getSession(req, res, { sessionRequired: true });
} catch (error) {
  this.logger.error('[AUTH:bridge] getSession failed', { uid: user.uid, error });
  throw new InternalServerErrorException('Failed to resolve current session');
}

// 4. Mint the independent sibling session. This does NOT invalidate the
//    existing cookie session — SuperTokens supports N sessions per user.
try {
  await Session.createNewSession(
    req,
    res,
    stUser.getTenantId(),
    stUser.getRecipeUserId(),
    {},
    {},
    {},
  );
} catch (error) {
  this.logger.error('[AUTH:bridge] createNewSession failed', {
    uid: user.uid,
    error,
  });
  throw new InternalServerErrorException('Failed to mint extension session');
}

// 5. Copy the tokens OUT of the response headers BEFORE we scrub them.
const accessToken = String(res.getHeader('st-access-token') ?? '');
const refreshToken = String(res.getHeader('st-refresh-token') ?? '');
const frontToken = String(res.getHeader('front-token') ?? '');

if (!accessToken || !refreshToken || !frontToken) {
  this.logger.error(
    '[AUTH:bridge] Expected response headers missing after createNewSession',
    { uid: user.uid },
  );
  throw new InternalServerErrorException('Failed to mint extension session');
}

// 6. Decode the accessTokenExpiry from frontToken (base64url JSON {uid, ate, up}).
const accessTokenExpiry = decodeFrontTokenExpiry(frontToken) ?? Date.now() + 3600_000;

// 7. Scrub the headers so the browser never sees them. The JSON body is our
//    only channel for returning these tokens.
const headersToStrip = [
  'st-access-token',
  'st-refresh-token',
  'front-token',
  'anti-csrf',
  'access-control-expose-headers',
] as const;
for (const h of headersToStrip) res.removeHeader(h);

this.logger.debug('[AUTH:bridge] Minted extension session', { uid: user.uid });

return { accessToken, refreshToken, frontToken, accessTokenExpiry };
```

And the helper (private method on the controller, or a local function above the class):

```typescript
/**
 * Decode frontToken (base64url JSON) and return the access-token expiry in
 * ms since epoch. Returns null if decoding fails so the caller can fall back.
 */
function decodeFrontTokenExpiry(frontToken: string): number | null {
  try {
    const json = Buffer.from(frontToken, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { ate?: unknown };
    const ate = Number(parsed.ate);
    return Number.isFinite(ate) && ate > 0 ? ate : null;
  } catch {
    return null;
  }
}
```

### 3. Test file scaffolding — `auth.controller.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

// Hoisted mock — jest.mock must appear before the import of the controller
jest.mock('supertokens-node/recipe/session', () => ({
  __esModule: true,
  default: {
    getSession: jest.fn(),
    createNewSession: jest.fn(),
  },
}));

import Session from 'supertokens-node/recipe/session';
import { AuthController } from '../auth.controller';
import type { UserContext } from '../dto/user-context.dto';

const mockGetSession = Session.getSession as jest.Mock;
const mockCreateNewSession = Session.createNewSession as jest.Mock;

function buildUser(overrides: Partial<UserContext> = {}): UserContext {
  return {
    uid: 'user-1',
    email: 'test@example.com',
    tier: 'free',
    credits: 100,
    byoKeyEnabled: false,
    authSource: 'supertokens',
    isAdmin: false,
    ...overrides,
  } as UserContext;
}

function buildMockReq(): { headers: Record<string, string> } {
  return { headers: {} };
}

function buildMockRes() {
  const headers = new Map<string, string>();
  return {
    getHeader: jest.fn((name: string) => headers.get(name.toLowerCase())),
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    removeHeader: jest.fn((name: string) => {
      headers.delete(name.toLowerCase());
    }),
    // Test-only helper — not part of Express Response
    __primeHeaders(values: Record<string, string>) {
      for (const [k, v] of Object.entries(values)) headers.set(k.toLowerCase(), v);
    },
  };
}

describe('AuthController.exchangeExtensionToken', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    }).compile();
    controller = module.get(AuthController);
  });

  it('happy path: returns tokens and scrubs response headers', async () => {
    mockGetSession.mockResolvedValue({
      getTenantId: () => 'public',
      getRecipeUserId: () => 'recipe-user-1',
    });
    // createNewSession would normally set headers on res — simulate it:
    const res = buildMockRes();
    mockCreateNewSession.mockImplementation(async (_req, r) => {
      (r as typeof res).__primeHeaders({
        'st-access-token': 'a.b.c',
        'st-refresh-token': 'r.r.r',
        // base64url JSON with ate=1234567890000
        'front-token': Buffer.from(
          JSON.stringify({ uid: 'user-1', ate: 1234567890000, up: {} }),
        ).toString('base64url'),
        'access-control-expose-headers':
          'front-token, st-access-token, st-refresh-token',
      });
    });

    const req = buildMockReq();
    // @ts-expect-error — casting mocks to controller signatures
    const result = await controller.exchangeExtensionToken(req, res, buildUser());

    expect(result).toEqual({
      accessToken: 'a.b.c',
      refreshToken: 'r.r.r',
      frontToken: expect.any(String),
      accessTokenExpiry: 1234567890000,
    });
    expect(res.removeHeader).toHaveBeenCalledWith('st-access-token');
    expect(res.removeHeader).toHaveBeenCalledWith('st-refresh-token');
    expect(res.removeHeader).toHaveBeenCalledWith('front-token');
    expect(res.removeHeader).toHaveBeenCalledWith('anti-csrf');
    expect(res.removeHeader).toHaveBeenCalledWith('access-control-expose-headers');
    // The st-auth-mode header was forced on the request
    expect(req.headers['st-auth-mode']).toBe('header');
  });

  it('rejects api-key callers with 403', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    // @ts-expect-error
    await expect(
      controller.exchangeExtensionToken(
        req,
        res,
        buildUser({ authSource: 'api-key' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockCreateNewSession).not.toHaveBeenCalled();
  });

  it('throws 500 if createNewSession rejects', async () => {
    mockGetSession.mockResolvedValue({
      getTenantId: () => 'public',
      getRecipeUserId: () => 'recipe-user-1',
    });
    mockCreateNewSession.mockRejectedValue(new Error('core unreachable'));

    const req = buildMockReq();
    const res = buildMockRes();
    // @ts-expect-error
    await expect(
      controller.exchangeExtensionToken(req, res, buildUser()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws 500 if SuperTokens did not set access/refresh/front headers', async () => {
    mockGetSession.mockResolvedValue({
      getTenantId: () => 'public',
      getRecipeUserId: () => 'recipe-user-1',
    });
    mockCreateNewSession.mockResolvedValue(undefined); // no headers primed

    const req = buildMockReq();
    const res = buildMockRes();
    // @ts-expect-error
    await expect(
      controller.exchangeExtensionToken(req, res, buildUser()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('falls back to 1h expiry if frontToken is malformed', async () => {
    mockGetSession.mockResolvedValue({
      getTenantId: () => 'public',
      getRecipeUserId: () => 'recipe-user-1',
    });
    const res = buildMockRes();
    mockCreateNewSession.mockImplementation(async (_req, r) => {
      (r as typeof res).__primeHeaders({
        'st-access-token': 'a.b.c',
        'st-refresh-token': 'r.r.r',
        'front-token': 'not-valid-base64url',
      });
    });
    const before = Date.now();
    // @ts-expect-error
    const result = await controller.exchangeExtensionToken(
      buildMockReq(),
      res,
      buildUser(),
    );
    // 1h fallback: between now and now+1h+a few seconds
    expect(result.accessTokenExpiry).toBeGreaterThanOrEqual(before + 3500_000);
    expect(result.accessTokenExpiry).toBeLessThanOrEqual(before + 3700_000);
  });

  it('throws 500 if getSession rejects (e.g. core unreachable)', async () => {
    mockGetSession.mockRejectedValue(new Error('core down'));
    const req = buildMockReq();
    const res = buildMockRes();
    // @ts-expect-error
    await expect(
      controller.exchangeExtensionToken(req, res, buildUser()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(mockCreateNewSession).not.toHaveBeenCalled();
  });
});
```

### 4. Blueprint endpoint entry (pattern to paste into `endpoints` array)

```typescript
{
  method: 'POST',
  path: '/api/v1/auth/extension-token-exchange',
  description:
    'Mints an independent SuperTokens header-mode session for a cookie-authed ' +
    'user so a Chrome extension can call the API via Authorization: Bearer. ' +
    'Caller\'s existing cookie session is unaffected.',
  sourceRef: 'auth.controller.ts:exchangeExtensionToken',
  guards: [
    {
      name: 'AuthGuard',
      sourceRef: 'guards/auth.guard.ts:22',
      checks:
        'Requires a valid SuperTokens session (cookie or Bearer). Rejects ' +
        'api-key callers at handler level with 403 to prevent infinite ' +
        'bridge loops. No @RequireScope — session users bypass ScopeGuard.',
      rejectStatus: 401,
      rejectBody: { message: 'Invalid or expired session' },
    },
  ],
  requiresAuth: true,
  successResponse: {
    status: 200,
    invariants: [
      { id: 'bridge-has-accessToken', description: 'accessToken is a non-empty string', severity: 'error', path: 'response.body.data.accessToken', check: { type: 'type', expected: 'string' } },
      { id: 'bridge-has-refreshToken', description: 'refreshToken is a non-empty string', severity: 'error', path: 'response.body.data.refreshToken', check: { type: 'type', expected: 'string' } },
      { id: 'bridge-has-frontToken', description: 'frontToken is a non-empty string', severity: 'error', path: 'response.body.data.frontToken', check: { type: 'type', expected: 'string' } },
      { id: 'bridge-has-expiry', description: 'accessTokenExpiry is a positive integer (ms since epoch)', severity: 'error', path: 'response.body.data.accessTokenExpiry', check: { type: 'type', expected: 'number' } },
    ],
  },
  errorResponses: [
    { condition: 'No valid session', status: 401, messagePattern: 'Invalid or expired session' },
    { condition: 'Caller authenticated with platform api-key', status: 403, messagePattern: 'Extension token exchange requires a session user' },
    { condition: 'SuperTokens createNewSession failed', status: 500, messagePattern: 'Failed to mint extension session' },
    { condition: 'SuperTokens core unreachable', status: 503, messagePattern: 'Authentication service temporarily unavailable' },
  ],
},
```

## Acceptance criteria

- [ ] `POST /api/v1/auth/extension-token-exchange` exists and is mapped through `AuthModule.controllers`.
- [ ] With a valid cookie session, the endpoint returns `200 OK` with a JSON body matching `ExtensionTokenExchangeResponseSchema` (wrapped by `ResponseTransformInterceptor` into `{ success: true, data: { accessToken, refreshToken, frontToken, accessTokenExpiry }, requestId, timestamp }`).
- [ ] With a platform api-key (`X-API-Key` header), the endpoint returns `403 Forbidden` with error code `FORBIDDEN` and never calls `Session.createNewSession` (unit test asserts zero calls).
- [ ] With no auth at all, the endpoint returns `401 Unauthorized` from `AuthGuard`.
- [ ] On success, the response has NO `st-access-token`, `st-refresh-token`, `front-token`, `anti-csrf`, or `access-control-expose-headers` response headers (stripped by the handler before Nest serializes).
- [ ] The caller's original cookie session is unaffected — unit test asserts `Session.createNewSession` was called but nothing invalidates the original session. `Session.revokeSession` is NEVER called in this handler.
- [ ] The new session is INDEPENDENT — `Session.createNewSession` is called with the SAME `recipeUserId` as the caller but with `st-auth-mode: header` forced server-side so the new tokens go to headers, not cookies.
- [ ] Unit tests cover: happy path, api-key rejection, createNewSession failure, missing response headers, malformed frontToken fallback, getSession failure. All pass.
- [ ] `libs/shared-types/src/index.ts` exports `ExtensionTokenExchangeResponseSchema` and `ExtensionTokenExchangeResponse`.
- [ ] `api/src/modules/auth/blueprint.ts` documents the new endpoint with full `guards`, `successResponse.invariants`, and `errorResponses` entries, plus a module-level invariant that the bridge does not invalidate the caller's session.
- [ ] `pnpm -F @repo/shared-types build` passes with zero errors.
- [ ] `pnpm typecheck:api` passes with zero errors (check `logs/typecheck-api.log`).
- [ ] `pnpm lint` passes with zero errors and zero warnings in the new files.
- [ ] `pnpm test:api:module auth` passes, including all six new test cases in `auth.controller.spec.ts`.

## Tests to write

Single file: `api/src/modules/auth/__tests__/auth.controller.spec.ts`.

Test cases (all REQUIRED, no skips):

1. **Happy path** — `authSource: 'supertokens'`, `Session.getSession` resolves with a stub that returns tenant `'public'` and recipe user `'recipe-user-1'`. `Session.createNewSession` sets `st-access-token`, `st-refresh-token`, `front-token`, and `access-control-expose-headers` on the mock response. Handler returns the expected body. Assert: returned body has all four fields; `req.headers['st-auth-mode']` was set to `'header'`; `res.removeHeader` was called for all five target header names.

2. **API-key rejection** — `authSource: 'api-key'`, no SuperTokens mock calls expected. Handler throws `ForbiddenException`. Assert: `Session.createNewSession` was NOT called (zero invocations).

3. **createNewSession failure** — `Session.getSession` resolves; `Session.createNewSession` rejects with `new Error('core unreachable')`. Handler throws `InternalServerErrorException` with message `'Failed to mint extension session'`. Assert: the underlying error message `'core unreachable'` does NOT appear in the thrown exception (log it, do not leak).

4. **Missing headers** — both SuperTokens calls resolve but `createNewSession` does not prime the response headers (simulates a SuperTokens SDK failure mode where the body comes back but the header write silently failed). Handler throws `InternalServerErrorException`.

5. **Malformed frontToken fallback** — happy path setup but `front-token` is set to `'not-valid-base64url'`. Handler still returns the other fields, and `accessTokenExpiry` is between `Date.now()+3500_000` and `Date.now()+3700_000` (1h fallback).

6. **getSession failure** — `Session.getSession` rejects. Handler throws `InternalServerErrorException` with message `'Failed to resolve current session'`. Assert: `Session.createNewSession` was NOT called.

Use the `jest.mock('supertokens-node/recipe/session', ...)` hoisted-mock pattern from `user-deletion.service.spec.ts` lines 33-42. Do NOT call `Test.createTestingModule` with the full `AuthModule` — only register the `AuthController`, no providers needed, since the controller has no DI-injected services beyond the (mocked) `Session` module-level import. No need to mock `AuthGuard` — unit tests exercise the handler directly.

## Rollback plan

If the phase fails mid-execution:

1. **Revert auth.module.ts** — `git checkout e:/llmconveyors.com/api/src/modules/auth/auth.module.ts`. This restores `controllers: []` and removes the `AuthController` import. The controller is now un-registered and routes will not exist.
2. **Delete the new controller file** — `rm e:/llmconveyors.com/api/src/modules/auth/auth.controller.ts`.
3. **Delete the new test file** — `rm e:/llmconveyors.com/api/src/modules/auth/__tests__/auth.controller.spec.ts`.
4. **Revert the blueprint** — `git checkout e:/llmconveyors.com/api/src/modules/auth/blueprint.ts`.
5. **Revert the shared-types barrel** — `git checkout e:/llmconveyors.com/libs/shared-types/src/index.ts`.
6. **Delete the new schema file** — `rm e:/llmconveyors.com/libs/shared-types/src/schemas/auth-api.schema.ts`.
7. **Rebuild shared-types** — `pnpm -F @repo/shared-types build` to clear the `dist/` stale types.
8. **Re-run** `pnpm typecheck:api` and `pnpm test:api:module auth` to confirm the repo is back to baseline.

None of the rolled-back files depend on other phases — A2 is the leaf of its dependency subgraph. Rollback is safe and complete.

## Out of scope (do NOT do in this phase)

- **Do NOT touch `api/src/main.ts`**. CORS already permits `st-auth-mode`, `Authorization`, `fdi-version`, `rid` at `main.ts:49` (verified investigation 53 line 100 and decision memo line 144). The same-origin `fetch` from the Next.js page in A4 doesn't need any CORS changes. Extension-side CORS for `api.llmconveyors.com` is out of scope for A2 — the extension's requests will be same-site to the API domain and use the Bearer header we mint here, not cookies.
- **Do NOT add a `@RequireScope('...')` decorator** to the handler. Session users bypass `ScopeGuard` entirely (investigation 04 section h; `scope.guard.ts:49-52`). Adding a scope is pointless and misleading.
- **Do NOT add `@UseInterceptors(ApiKeyAuditInterceptor)`**. The handler rejects api-key callers with 403 in its first line — the audit interceptor has nothing to audit.
- **Do NOT add a rate-limit override**. Session users get the session tier, which is adequate (investigation 53 line 36, decision memo D10). The extension will call this endpoint once per launch, not in a loop.
- **Do NOT add a custom Bearer-JWT path to `AuthGuard`**. SuperTokens' `Session.getSession` already transparently accepts `Authorization: Bearer <st-access-token>` (investigation 04 section c). The extension's subsequent API calls will flow through the existing guard unchanged.
- **Do NOT add Firefox support or `chrome-extension://*` CORS origin allowlist**. The bridge endpoint is called from the Next.js web page, not directly from the extension. Cross-origin extension support is out of scope for V1 and for this phase specifically.
- **Do NOT modify `SuperTokensAuthVerifier` or any other existing auth file**. A2 is purely additive at the controller level.
- **Do NOT add new npm dependencies**. Everything needed (`supertokens-node`, `zod`, `@nestjs/common`, `@nestjs/swagger`, `express` types) is already in `api/package.json` and `libs/shared-types/package.json`.
- **Do NOT add a GET variant of the endpoint**. POST only — semantically this is a token-minting side effect, not a read.
- **Do NOT return `antiCsrf`** in the response body. It's effectively `NONE` (investigation 02 section d) and the extension doesn't need it. If a future SuperTokens config enables anti-CSRF, that will be handled in a separate ticket.
- **Do NOT write a docs/*.mdx file for the new endpoint**. Docs are generated from `libs/shared-types/src/docs/` registries (per `e:/llmconveyors.com/.claude/rules/generated-content.md`). Bridge-endpoint doc coverage is explicitly deferred from this phase — it can be wired in a follow-up phase once the endpoint is stable.

## Compliance gates

Run ALL of these before marking the phase complete. All MUST pass with zero errors AND zero warnings in the newly added files.

```bash
# 1. Shared-types must build first (barrel export + new schema file)
pnpm -F @repo/shared-types build

# 2. API typecheck (tsc over api/src/**)
pnpm typecheck:api

# 3. Auth module unit tests (includes the new auth.controller.spec.ts)
pnpm test:api:module auth

# 4. Lint (API + shared-types)
pnpm lint
```

If any step fails, DO NOT continue. Read the failure, fix the root cause, re-run. Do not suppress errors with `any`, `@ts-ignore`, `.only`, or skip blocks. Do not commit.

When all four gates are green, the phase is complete. Do NOT run `pnpm compliance` in this phase — that is the full-repo gate run at the end of the plan, not per-phase. Do NOT commit yet — commits are handled at the plan level after Opus verification.
