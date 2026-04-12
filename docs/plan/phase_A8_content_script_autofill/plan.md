# Phase A8 -- Content Script Autofill: Greenhouse + Lever + Workday Wizard Orchestration

## 1. Phase metadata

| Field | Value |
|-------|-------|
| **Plan** | 100-chrome-extension-mvp |
| **Phase code** | A8 |
| **Version** | v2.1.1 (full rewrite per `02-decisions-v2.1-final.md` + `03-keystone-contracts.md` + `reviews/review-A8.md`) |
| **Track** | Extension (Track 3) |
| **Day** | 5 (2026-04-16) |
| **Depends on** | A1 (scaffold), A5 (ProtocolMap + logging + bg forwarder), A7 (profile storage), B2 (core types), B4 (buildPlan), B7 (Greenhouse adapter), B8 (Lever adapter), B9 (Workday adapter + wizard primitives) |
| **Blocks** | A9 (highlight + intent), A10 (popup UI), A11 (sidepanel + E2E + demo) |
| **Executor context budget** | 64k |
| **Estimated effort** | 5-7 hours |

---

## 2. Scope declaration

**Confidence**: 7/10. All A8 imports are pinned in `03-keystone-contracts.md`. The three adapter sub-entries (`ats-autofill-engine/greenhouse`, `lever`, `workday`) each export `adapter: AtsAdapter` per keystone section 6 + D1 canonical shape. Profile shape is keystone section 3 + D3. Wizard loop is keystone section 7 + D6. The -3 deduction reflects:
- B9's `watchForStepChange` MutationObserver tuning is unverified on live tenants (B9 concern)
- `buildPlan` is a B4 dependency whose signature is verified at type level but whose runtime behavior depends on B4 quality
- Integration across 5+ upstream phases in a single day carries inherent coordination risk

**Scope declaration**

- **Files created**: 10 source files + 6 test files + 1 rollback script = **17 files**
- **Files modified**: 1 file (`entrypoints/ats.content/index.ts` from A1 shell)
- **Lines added**: ~1250 source + ~2400 tests = ~3650 LoC
- **Lines removed**: ~15 (A1 log-only shell body replaced)
- **Repository**: `e:/llmconveyors-chrome-extension` (per D4)
- **Files modified in `e:/llmconveyors.com`**: ZERO

---

## 3. Required reading (executor MUST read these before writing any code)

| # | File | What to look for | Key lines/sections |
|---|------|------------------|--------------------|
| 1 | `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md` | D1 (adapter shape), D3 (profile shape), D6 (wizard ownership), D11 (logger), D14 (anti-drift), D15 (em-dash), D16 (branded types), D19 (adversarial tests), D20 (DI) | Full file |
| 2 | `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md` | AtsAdapter interface (section 2.9), factory pattern (section 6), wizard loop (section 7), ProtocolMap (section 1), imports table (section 10 row A8) | Sections 1, 2.5, 2.6, 2.9, 3, 4, 6, 7, 10 |
| 3 | `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A8.md` | All 9 BLOCKERs + 23 findings -- every one MUST be addressed | Full file |
| 4 | `phase_A5_background_and_messaging/plan.md` | ProtocolMap 19 keys, `FILL_REQUEST` bg forwarder, `sendMessage`/`onMessage` exports, `createLogger` from `log.ts` | Protocol section, handler section |
| 5 | `phase_A7_profile_storage_and_options/plan.md` | `llmc.profile.v1` storage key, `Profile` write shape (nested `basics.*`, `profileVersion`, `updatedAtMs`), `llmc.resume-blob.<handleId>` storage key | Profile storage section, resume blob section |
| 6 | `phase_B2_core_types_and_taxonomy/plan.md` | All type definitions: `FillInstruction`, `FillResult`, `FillPlan`, `FillPlanResult`, `FormModel`, `AtsAdapter`, `WorkdayWizardStep`, `SkipReason`, `AbortReason`, branded types | Types section |
| 7 | `phase_B4_classifier_and_fill_rules/plan.md` | `buildPlan(formModel: FormModel, profile: Profile): FillPlan` signature + re-export from root barrel | buildPlan section |
| 8 | `phase_B7_greenhouse_adapter/plan.md` | `export const adapter: AtsAdapter = createGreenhouseAdapter()` per keystone section 6 | Adapter factory section |
| 9 | `phase_B8_lever_adapter/plan.md` | `export const adapter: AtsAdapter = createLeverAdapter()` with factory closing over variant state | Adapter factory section |
| 10 | `phase_B9_workday_adapter_and_publish/plan.md` | `export const adapter: AtsAdapter = createWorkdayAdapter()` with `detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep` wizard primitives | Adapter factory section, wizard primitives section |
| 11 | `phase_A9_content_script_highlight_and_intent/plan.md` | Sibling content script -- A9 extends A8's entrypoint with `HIGHLIGHT_APPLY`/`HIGHLIGHT_CLEAR` listeners + Greenhouse/Lever intent detection | Architecture section |
| 12 | `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/33-wxt-entrypoints.md` | `defineContentScript` shape, `ctx.onInvalidated()`, `@webext-core/messaging` typed protocol, isolated world semantics | Sections 1-3 |

---

## 4. Files to create

### 4.1 Source files

| # | Path | Purpose | Est LoC |
|---|------|---------|---------|
| 1 | `entrypoints/ats.content/main.ts` | Bootstrap wiring: construct deps, controller, register listener, wire teardown | ~55 |
| 2 | `src/content/autofill/autofill-controller.ts` | `AutofillController` class: single-pass (GH/Lever) + Workday wizard loop, full DI, single-flight adapter, file-attach resolution | ~530 |
| 3 | `src/content/autofill/adapter-loader.ts` | `resolveAtsKind` (suffix host match) + `loadAdapter` (dynamic import with kind cross-check) + `productionDynamicImport` | ~130 |
| 4 | `src/content/autofill/profile-reader.ts` | `readProfile` via `ProfileSchema.safeParse` + `isEmptyProfile` checking `basics.firstName`/`basics.email` | ~90 |
| 5 | `src/content/autofill/file-resolver.ts` | `resolveFile(handleId, deps)` -- resume handle to File object, base64 decode, size validation, 10 MB cap | ~180 |
| 6 | `src/content/autofill/messaging.ts` | Content-side `onMessage('FILL_REQUEST', ...)` registration, delegates to `controller.executeFill()` | ~50 |
| 7 | `src/content/autofill/deps-factory.ts` | `createProductionDeps()` wiring real `browser.storage.local.get`, `sendMessage`, `createLogger`, `document`, `Date.now`, `crypto.randomUUID` | ~85 |
| 8 | `src/content/autofill/blueprint.contract.ts` | D22 blueprint contract declaring `publicExports`, `forbiddenImports`, `requiredCoverage: 75` | ~45 |
| 9 | `src/content/autofill/index.ts` | Barrel re-export for tests + blueprint contract validation | ~25 |
| 10 | `scripts/rollback-phase-A8.sh` | D23 mechanical rollback script | ~30 |

**Source subtotal**: 10 files, ~1220 LoC.

### 4.2 Test files

| # | Path | Purpose | Est LoC |
|---|------|---------|---------|
| 1 | `tests/content/adapter-loader.spec.ts` | `resolveAtsKind` happy path + security (suffix not substring) + `loadAdapter` happy + failure + vendor contract tests | ~280 |
| 2 | `tests/content/profile-reader.spec.ts` | `readProfile` happy + failure (malformed, legacy v1 shape, storage reject) + `isEmptyProfile` gates | ~200 |
| 3 | `tests/content/file-resolver.spec.ts` | `resolveFile` happy + failure (missing, malformed, oversized, corrupt base64, size mismatch, storage reject) | ~250 |
| 4 | `tests/content/autofill-controller.spec.ts` | Single-pass Greenhouse+Lever: happy path (8-field fill), per-field failure, file-attach, buildPlan throw, scan throw, skipped accounting, single-flight, bootstrap | ~560 |
| 5 | `tests/content/autofill-controller.workday.spec.ts` | Workday wizard: 4-step traversal (consent granted), 4-step (consent denied), review step, unknown step, step regression, scanStep/fillStep throw, teardown | ~480 |
| 6 | `tests/content/autofill-controller.adversarial.spec.ts` | D19 six categories: null/NaN/Infinity, empty+max-size collections, unicode, injection, concurrent re-entry, adversarial state | ~640 |

**Test subtotal**: 6 files, ~2410 LoC.

**Grand total**: 17 files, ~3630 LoC.

## 5. Files to modify

| # | Path | Change | Rationale |
|---|------|--------|-----------|
| 1 | `entrypoints/ats.content/index.ts` | Replace A1 log-only `main()` body with `import { bootstrap } from './main'` + `await bootstrap(ctx)` delegation | A8 takes over the entrypoint; A1's log-only shell becomes the real orchestrator |

**A8 does NOT modify** (per D2 + hard requirements):
- `src/background/messaging/protocol.ts` -- A5 owns the 19-key ProtocolMap
- `src/background/messaging/handlers.ts` -- A5 owns the bg-side FILL_REQUEST forwarder
- Any file in `e:/llmconveyors.com` -- A8 is extension-only per D4

---

## 6. Step-by-step implementation

### Step 1 -- Verify preconditions

From `e:/llmconveyors-chrome-extension/`:

```bash
ls -la entrypoints/ats.content/index.ts
ls -la src/background/messaging/protocol.ts
ls -la src/background/log.ts
pnpm list ats-autofill-engine @webext-core/messaging webextension-polyfill wxt zod
node -e "import('ats-autofill-engine/greenhouse').then(m => console.log('greenhouse adapter kind:', m.adapter?.kind))"
node -e "import('ats-autofill-engine/lever').then(m => console.log('lever adapter kind:', m.adapter?.kind))"
node -e "import('ats-autofill-engine/workday').then(m => console.log('workday adapter kind:', m.adapter?.kind))"
node -e "import('ats-autofill-engine/profile').then(m => console.log('ProfileSchema:', typeof m.ProfileSchema))"
```

Expected:
- All `ls` commands succeed.
- `ats-autofill-engine@0.1.0-alpha.X` with X >= 2, `@webext-core/messaging`, `wxt`, `zod` installed.
- `greenhouse adapter kind: greenhouse`, `lever adapter kind: lever`, `workday adapter kind: workday`
- `ProfileSchema: object`

If ANY precondition fails, HALT and report. Do NOT patch around missing pieces.

### Step 2 -- Create directory layout

```bash
mkdir -p src/content/autofill
mkdir -p tests/content
```

(`entrypoints/ats.content/` already exists from A1.)

### Step 3 -- No local `types.ts` file

Per keystone section 10, A8 imports every type from `ats-autofill-engine` root, `ats-autofill-engine/profile`, or the three vendor sub-entries. There is NO local `types.ts`. The v1 hand-rolled `AtsAdapter` and `ReadableProfile` are DELETED.

Type imports used across A8 source files (copy verbatim):

```ts
// From ats-autofill-engine root barrel (types)
import type {
  AtsAdapter,
  AtsKind,
  FillInstruction,
  FillResult,
  FillPlan,
  FillPlanResult,
  FormModel,
  WorkdayWizardStep,
  SkipReason,
  AbortReason,
  TabId,
  PlanId,
  ResumeHandleId,
} from 'ats-autofill-engine';

// From ats-autofill-engine root barrel (values)
import { PlanId as PlanIdBrand, TabId as TabIdBrand } from 'ats-autofill-engine';
import { buildPlan } from 'ats-autofill-engine';

// From ats-autofill-engine/profile sub-entry
import type { Profile } from 'ats-autofill-engine/profile';
import { ProfileSchema } from 'ats-autofill-engine/profile';

// From A5's barrel
import type { ProtocolMap, FillRequestResponse, DetectedIntentPayload } from '@/background/messaging/protocol';
import { sendMessage, onMessage } from '@/background/messaging/protocol';
import { createLogger } from '@/background/log';
import type { Logger } from '@/background/log';
```

The path alias `@/` resolves to `src/` per A1's tsconfig paths.

### Step 4 -- Rewrite `entrypoints/ats.content/index.ts`

Replace the A1 log-only shell with the WXT entrypoint declaration that delegates to `main.ts`.

File: `entrypoints/ats.content/index.ts`

```typescript
// entrypoints/ats.content/index.ts
/**
 * Job Assistant -- ATS content script entrypoint.
 *
 * Phase A8: autofill execution + Workday wizard orchestration.
 * Phase A9 will extend main.ts with highlight + intent detection on
 * top of this same entrypoint.
 *
 * Folder-name `ats.content/` with `index.ts` inside is the WXT
 * named-content-script variant; the output is
 * `dist/content-scripts/ats.js`. See investigation 33 Discovery Rules.
 */
import { bootstrap } from './main';

export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
  ],
  runAt: 'document_idle',
  world: 'ISOLATED',
  allFrames: false,
  cssInjectionMode: 'manual',

  async main(ctx) {
    await bootstrap(ctx);
  },
});
```

Rationale:
- `matches` is NARROW. Broader patterns balloon host permissions and alarm users at install time.
- `runAt: 'document_idle'` gives React SPAs time to mount the form. `'document_end'` is too early for Greenhouse and Workday.
- `world: 'ISOLATED'` (default) is spelled out to defend against a future author flipping it without noticing the `chrome.storage.local` breakage.
- `allFrames: false` -- only the top frame. iframe-hosted forms are rare on the three vendors.
- `cssInjectionMode: 'manual'` -- A8 injects no CSS. A9 will switch this to `'ui'` for the shadow-DOM highlighter.
- `defineContentScript.main` is allowed to be async (investigation 33 section 3).

### Step 5 -- Write `entrypoints/ats.content/main.ts`

Thin bootstrap wiring. All heavy logic lives in `src/content/autofill/`.

File: `entrypoints/ats.content/main.ts`

```typescript
// entrypoints/ats.content/main.ts
/**
 * Content-script bootstrap. Called from index.ts inside defineContentScript.main().
 *
 * Ordering:
 *   1. Construct production AutofillControllerDeps (see deps-factory.ts).
 *   2. Construct AutofillController(deps).
 *   3. Register the content-side FILL_REQUEST listener (messaging.ts).
 *   4. Call controller.bootstrap() -- mounts Workday step watcher if applicable,
 *      preloads adapter.
 *   5. Wire ctx.onInvalidated() to tear down the controller.
 *
 * This function returns quickly; bootstrap is fire-and-forget by design
 * so a slow adapter import does not block other listeners.
 */

import type { ContentScriptContext } from 'wxt/client';
import { AutofillController } from '@/content/autofill/autofill-controller';
import { createProductionDeps } from '@/content/autofill/deps-factory';
import { registerFillListener } from '@/content/autofill/messaging';
import { createLogger } from '@/background/log';

const log = createLogger('ats-content-main');

export async function bootstrap(ctx: ContentScriptContext): Promise<void> {
  log.info('content bootstrap start', {
    host: document.location.host,
    pathname: document.location.pathname,
  });

  const deps = createProductionDeps();
  const controller = new AutofillController(deps);

  // Register the FILL_REQUEST listener BEFORE kicking off bootstrap so
  // a popup-initiated fill arriving during bootstrap is queued correctly
  // by @webext-core/messaging (it buffers messages until a listener is
  // registered on the destination side).
  registerFillListener(controller);

  // Kick off bootstrap; fire-and-forget. Errors are logged inside the
  // controller's bootstrap() method and do NOT throw out to here.
  void controller.bootstrap().catch((err: unknown) => {
    log.error('controller bootstrap threw', err);
  });

  ctx.onInvalidated(() => {
    log.info('ctx invalidated; tearing down controller');
    controller.teardown();
  });

  log.info('content bootstrap complete');
}
```

Rationale:
- `registerFillListener` is called BEFORE `controller.bootstrap()` -- the listener registration is synchronous so any `FILL_REQUEST` arriving during async bootstrap is handled correctly.
- The `void ... .catch(...)` pattern avoids blocking content-script startup on a slow adapter import.
- `ctx.onInvalidated()` fires on extension reload. Teardown unmounts the Workday step watcher and clears the in-flight `loadingPromise`.

### Step 6 -- No separate `logger.ts` file

Per D11, logging uses `createLogger(scope: string)` imported from A5's `src/background/log.ts`. There is NO `entrypoints/ats.content/logger.ts`. The v1 plan's version is deleted. Every A8 source file imports `createLogger` from `@/background/log`.

This means:
- `console.*` appears NOWHERE in A8 source files (D11 + D14 forbidden-token grep).
- A5's `src/background/log.ts` already routes to `globalThis.console.*` under the hood with the `[llmc-ext:<scope>]` prefix per D11; A8 inherits that.
- A8's tests use a fake `Logger` passed through `deps.logger`, so production `console.*` is never called during unit tests.

### Step 7 -- Write `src/content/autofill/adapter-loader.ts`

Host-match + dynamic-import. Per D1, every vendor sub-entry exports `adapter: AtsAdapter`. Per section 5.13 of the design rationale, host matching uses SUFFIX match not substring (G5 security fix from review).

File: `src/content/autofill/adapter-loader.ts`

```typescript
// src/content/autofill/adapter-loader.ts
/**
 * URL -> AtsKind resolution + dynamic adapter import.
 *
 * Per D1, every vendor adapter sub-entry in ats-autofill-engine exports
 * `adapter: AtsAdapter` (keystone section 6 factory pattern). A8 reads
 * mod.adapter and returns it.
 *
 * Per D1 + review G5, host matching is SUFFIX-based:
 *   host === 'greenhouse.io' || host.endsWith('.greenhouse.io')
 * Substring matching (`host.includes('greenhouse.io')`) is a homograph/
 * phishing weakness and is explicitly rejected.
 */

import type { AtsAdapter, AtsKind } from 'ats-autofill-engine';
import type { Logger } from '@/background/log';

export interface AdapterLoaderDeps {
  readonly logger: Logger;
  readonly dynamicImport: (specifier: string) => Promise<{ readonly adapter?: AtsAdapter }>;
}

/**
 * Resolve the ATS kind from a URL. Returns null for any non-ATS URL.
 *
 * The host is lowercased before matching (RFC 3986 allows host
 * case-insensitivity; attackers sometimes use mixed case to slip past
 * naive matchers).
 *
 * Exported as a pure function so tests exercise all four branches
 * without mocking the dynamic import.
 */
export function resolveAtsKind(url: string): AtsKind | null {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'greenhouse.io' || host.endsWith('.greenhouse.io')) {
    return 'greenhouse';
  }
  if (host === 'jobs.lever.co' || host.endsWith('.jobs.lever.co')) {
    return 'lever';
  }
  if (host === 'myworkdayjobs.com' || host.endsWith('.myworkdayjobs.com')) {
    return 'workday';
  }
  return null;
}

/**
 * Dynamically load the adapter matching the URL. Returns null if no
 * match or if the dynamic import fails.
 *
 * Runtime validation: asserts `mod.adapter.kind === kind` before
 * returning. If a vendor adapter ships the wrong kind, we treat it as
 * a load failure (log + null) rather than silently trusting a
 * mismatched adapter.
 */
export async function loadAdapter(url: string, deps: AdapterLoaderDeps): Promise<AtsAdapter | null> {
  const kind = resolveAtsKind(url);
  if (!kind) {
    deps.logger.debug('no ATS match for URL', { url });
    return null;
  }
  deps.logger.info('loading adapter', { kind });

  const specifier = `ats-autofill-engine/${kind}`;
  let mod: { readonly adapter?: AtsAdapter };
  try {
    mod = await deps.dynamicImport(specifier);
  } catch (err: unknown) {
    deps.logger.error('adapter dynamic import threw', err, { kind, specifier });
    return null;
  }

  const adapter = mod.adapter;
  if (!adapter) {
    deps.logger.error('adapter module missing `adapter` export', undefined, { kind, specifier });
    return null;
  }
  if (adapter.kind !== kind) {
    deps.logger.error('adapter kind mismatch against URL resolution', undefined, {
      urlKind: kind,
      adapterKind: adapter.kind,
      specifier,
    });
    return null;
  }

  deps.logger.info('adapter loaded', { kind: adapter.kind });
  return adapter;
}

/**
 * Production dynamic-import function. Tests provide a fake via
 * AdapterLoaderDeps.dynamicImport so the real import() is never called
 * during unit tests.
 *
 * The @vite-ignore hint tells Vite NOT to pre-analyze this dynamic
 * import at build time (pre-analysis would force all three sub-entries
 * into the main chunk, defeating tree-shaking).
 */
export function productionDynamicImport(specifier: string): Promise<{ readonly adapter?: AtsAdapter }> {
  return import(/* @vite-ignore */ specifier) as Promise<{ readonly adapter?: AtsAdapter }>;
}
```

### Step 8 -- Write `src/content/autofill/profile-reader.ts`

Per D3, A8's profile reader uses `ProfileSchema.safeParse()` on the full nested Profile shape. The v1 `ReadableProfile` interface with top-level `firstName`/`email`/`updatedAt` is DELETED. The `profile as unknown as Parameters<typeof buildPlan>[1]` cast is DELETED -- with correct types it is unnecessary.

File: `src/content/autofill/profile-reader.ts`

```typescript
// src/content/autofill/profile-reader.ts
/**
 * Direct chrome.storage.local read of the user profile.
 *
 * Per D3 (2026-04-11), A8 consumes A7's FULL Profile shape (nested
 * basics.*, profileVersion, demographics, consents, documents,
 * customAnswers, ...). A8 uses ProfileSchema.safeParse() from
 * ats-autofill-engine/profile to validate the stored record; a parse
 * failure yields `null`, which the controller treats as "no-profile".
 *
 * The v1 hand-rolled ReadableProfile interface with top-level
 * firstName/email/updatedAt fields is DELETED. That shape never matched
 * A7's actual persisted record and was the root cause of v1's "every
 * FillResponse returned NO_PROFILE" blocker (review E1).
 */

import type { Profile } from 'ats-autofill-engine/profile';
import { ProfileSchema } from 'ats-autofill-engine/profile';
import type { Logger } from '@/background/log';

export interface ProfileReaderDeps {
  readonly logger: Logger;
  readonly storageGet: (key: string) => Promise<Record<string, unknown>>;
}

export const PROFILE_STORAGE_KEY = 'llmc.profile.v1';

/**
 * Read the profile. Returns null if no profile is stored, if the
 * storage read rejects, or if the stored record fails ProfileSchema
 * validation.
 *
 * NEVER throws. All error paths log and return null.
 */
export async function readProfile(deps: ProfileReaderDeps): Promise<Profile | null> {
  let raw: Record<string, unknown>;
  try {
    raw = await deps.storageGet(PROFILE_STORAGE_KEY);
  } catch (err: unknown) {
    deps.logger.error('chrome.storage.local.get failed', err, { key: PROFILE_STORAGE_KEY });
    return null;
  }

  const record = raw[PROFILE_STORAGE_KEY];
  if (record === undefined || record === null) {
    deps.logger.debug('no profile stored', { key: PROFILE_STORAGE_KEY });
    return null;
  }

  const parsed = ProfileSchema.safeParse(record);
  if (!parsed.success) {
    deps.logger.warn('stored profile failed ProfileSchema validation', {
      key: PROFILE_STORAGE_KEY,
      issueCount: parsed.error.issues.length,
      firstIssue: parsed.error.issues[0]?.path.join('.') ?? '<unknown>',
      firstMessage: parsed.error.issues[0]?.message ?? '<unknown>',
    });
    return null;
  }

  return parsed.data;
}

/**
 * Whether the profile has ENOUGH data to attempt a fill.
 *
 * Per D3 + review E3: gate checks `basics.firstName` OR `basics.email`
 * (NOT top-level). Those are the two fields all three ATS vendors
 * require at minimum. If BOTH are missing/whitespace-only, the
 * controller returns `{ ok: false, reason: 'no-profile' }`.
 *
 * NOTE: `basics.location.countryCode` NOT `location.country` per D3.
 */
export function isEmptyProfile(p: Profile | null): boolean {
  if (!p) return true;
  const firstName = p.basics.firstName?.trim() ?? '';
  const email = p.basics.email?.trim() ?? '';
  return firstName.length === 0 && email.length === 0;
}
```

### Step 9 -- Write `src/content/autofill/file-resolver.ts`

Per D1 + the design rationale, A8 pre-resolves `FillInstruction.value.kind === 'file'` instructions BEFORE calling `adapter.attachFile(instruction, file)`. The resolver reads from `chrome.storage.local['llmc.resume-blob.' + handleId]` (A7 writes it at upload time).

File: `src/content/autofill/file-resolver.ts`

```typescript
// src/content/autofill/file-resolver.ts
/**
 * Resume handle -> File resolver.
 *
 * B4's buildPlan emits file-attach instructions with
 * `{ kind: 'file', handleId: ResumeHandleId, hint? }`. The handle is
 * an opaque branded string produced by A7 when the user uploads a
 * resume via the options page.
 *
 * A7 stores the resume blob at `chrome.storage.local[RESUME_BLOB_PREFIX
 * + handleId]` as a Base64-encoded record with metadata (filename,
 * mimeType, sizeBytes, uploadedAtMs).
 *
 * Resolution:
 *   1. Look up the blob record by handle.
 *   2. Validate record shape + size constraints.
 *   3. Decode base64 payload to Uint8Array.
 *   4. Verify decoded size matches declared sizeBytes.
 *   5. Construct File via Blob.
 *   6. Return the File, or null if ANY step fails.
 *
 * NEVER throws. All errors log and return null, which causes the
 * controller to push a FillResult with error 'file-attach-failed'.
 */

import type { ResumeHandleId } from 'ats-autofill-engine';
import type { Logger } from '@/background/log';

export const RESUME_BLOB_PREFIX = 'llmc.resume-blob.';

/**
 * Shape A7 writes to chrome.storage.local. A8 only READS this shape.
 */
export interface StoredResumeBlob {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly base64: string;
  readonly uploadedAtMs: number;
}

export interface FileResolverDeps {
  readonly logger: Logger;
  readonly storageGet: (key: string) => Promise<Record<string, unknown>>;
}

/** 10 MB cap -- no legitimate resume exceeds this. */
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export async function resolveFile(
  handleId: ResumeHandleId,
  deps: FileResolverDeps,
): Promise<File | null> {
  const key = RESUME_BLOB_PREFIX + (handleId as string);

  let raw: Record<string, unknown>;
  try {
    raw = await deps.storageGet(key);
  } catch (err: unknown) {
    deps.logger.error('resume blob storage.get failed', err, { handleId, key });
    return null;
  }

  const record = raw[key];
  if (record === undefined || record === null || typeof record !== 'object') {
    deps.logger.warn('resume blob record missing or malformed', { handleId, key });
    return null;
  }

  const r = record as Partial<StoredResumeBlob>;
  if (
    typeof r.filename !== 'string' ||
    typeof r.mimeType !== 'string' ||
    typeof r.sizeBytes !== 'number' ||
    typeof r.base64 !== 'string' ||
    typeof r.uploadedAtMs !== 'number'
  ) {
    deps.logger.warn('resume blob record has wrong field types', { handleId, key });
    return null;
  }

  if (r.sizeBytes <= 0 || r.sizeBytes > MAX_RESUME_BYTES) {
    deps.logger.warn('resume blob size out of range', {
      handleId,
      sizeBytes: r.sizeBytes,
      maxBytes: MAX_RESUME_BYTES,
    });
    return null;
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(r.base64);
  } catch (err: unknown) {
    deps.logger.error('base64 decode failed', err, { handleId });
    return null;
  }

  // Sanity: decoded size must match declared sizeBytes
  if (bytes.byteLength !== r.sizeBytes) {
    deps.logger.warn('resume blob decoded size mismatch', {
      handleId,
      declared: r.sizeBytes,
      actual: bytes.byteLength,
    });
    return null;
  }

  let file: File;
  try {
    const blob = new Blob([bytes], { type: r.mimeType });
    file = new File([blob], r.filename, { type: r.mimeType, lastModified: r.uploadedAtMs });
  } catch (err: unknown) {
    deps.logger.error('File constructor threw', err, { handleId, filename: r.filename });
    return null;
  }

  deps.logger.debug('resume file resolved', {
    handleId,
    filename: r.filename,
    sizeBytes: r.sizeBytes,
    mimeType: r.mimeType,
  });
  return file;
}

/** Base64-to-bytes decoder. */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('atob is not available in this environment');
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

### Step 10 -- Write `src/content/autofill/autofill-controller.ts`

This is the heart of the phase. Per D6, A8 owns the Workday wizard orchestration loop. Per D20, every cross-module dependency is injected via `AutofillControllerDeps`. Per D1, the adapter contract uses `fillField(instruction: FillInstruction)` -- A8 NEVER calls `fillField(el, value, hints)`.

File: `src/content/autofill/autofill-controller.ts`

```typescript
// src/content/autofill/autofill-controller.ts
/**
 * AutofillController -- orchestrates the fill pipeline with Workday
 * wizard support.
 *
 * Pipeline for Greenhouse + Lever (single-pass):
 *   1. ensureAdapter(url) via single-flight (review G1 fix)
 *   2. readProfile via deps.readProfile (A7 shape, D3)
 *   3. isEmptyProfile gate -> { ok: false, reason: 'no-profile' }
 *   4. adapter.scanForm(document) -> FormModel
 *   5. if fields.length === 0 -> { ok: false, reason: 'no-form' }
 *   6. buildPlan(formModel, profile) -> FillPlan
 *   7. iterate plan.instructions:
 *      - if value.kind === 'file' AND adapter.attachFile exists:
 *        deps.resolveFile(value.handleId) -> File | null
 *        if File -> adapter.attachFile(instruction, file)
 *        if null -> push file-attach-failed result
 *      - else -> adapter.fillField(instruction)
 *      - aggregate filled/failed counts
 *   8. skipped count = plan.skipped.length (NOT in instructions loop)
 *   9. return { ok: true, filled, skipped, failed, planId }
 *
 * Pipeline for Workday (multi-step wizard, D6 + keystone section 7):
 *   bootstrap:
 *     - detectCurrentStep -> store in this.currentStep
 *     - watchForStepChange -> on change:
 *       - update this.currentStep
 *       - broadcast INTENT_DETECTED to background
 *   executeFill:
 *     - if currentStep in {review, unknown, null} -> wizard-not-ready
 *     - adapter.scanStep(doc, currentStep) -> FormModel
 *     - adapter.fillStep(currentStep, profile) -> FillResult[]
 *     - count filled/failed, return planId
 *
 * Per D11, ALL logging goes through deps.logger. No console.* anywhere.
 * Per D20, every cross-module dep is injected. Tests pass fakes.
 */

import type {
  AtsAdapter,
  AtsKind,
  FillInstruction,
  FillResult,
  FillPlan,
  FormModel,
  TabId,
  PlanId,
  ResumeHandleId,
  WorkdayWizardStep,
} from 'ats-autofill-engine';
import { buildPlan, PlanId as PlanIdBrand } from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import type {
  ProtocolMap,
  FillRequestResponse,
  DetectedIntentPayload,
} from '@/background/messaging/protocol';
import type { Logger } from '@/background/log';
import { isEmptyProfile } from './profile-reader';

/**
 * Full dependency contract (D20). Every cross-module touchpoint is here
 * so tests can swap the implementation without vi.mock chicanery.
 */
export interface AutofillControllerDeps {
  /** Load the adapter for a given URL. Returns null if no ATS match or dynamic import fails. */
  readonly loadAdapter: (url: string) => Promise<AtsAdapter | null>;

  /** Read the user profile from chrome.storage.local. Returns null if missing or invalid. */
  readonly readProfile: () => Promise<Profile | null>;

  /** Resolve a resume handle to a File object. Returns null if missing or corrupt. */
  readonly resolveFile: (handleId: ResumeHandleId) => Promise<File | null>;

  /** Broadcast a typed ProtocolMap message to the background. */
  readonly broadcast: <K extends keyof ProtocolMap>(
    key: K,
    data: Parameters<ProtocolMap[K]>[0],
  ) => void;

  /** Scoped logger. Production uses createLogger('autofill-controller'). */
  readonly logger: Logger;

  /** Testable time source. Production wires () => Date.now(). */
  readonly now: () => number;

  /** Testable DOM root. Production wires `document`. */
  readonly document: Document;

  /** Testable UUID generator for plan ids. Production wires () => crypto.randomUUID(). */
  readonly generatePlanId: () => string;
}

export class AutofillController {
  private adapter: AtsAdapter | null = null;
  private adapterLoadingPromise: Promise<AtsAdapter | null> | null = null;

  // Workday wizard state (null for Greenhouse/Lever or before bootstrap)
  private currentStep: WorkdayWizardStep | null = null;
  private stepWatcherCleanup: (() => void) | null = null;

  // Guard against teardown-during-bootstrap race
  private isTorn = false;

  constructor(private readonly deps: AutofillControllerDeps) {}

  /**
   * Bootstrap: preloads the adapter and, for Workday, mounts the
   * step watcher. Called once from main.ts.
   *
   * NEVER throws. Errors are logged and the controller degrades
   * gracefully (subsequent executeFill calls return no-adapter).
   */
  async bootstrap(): Promise<void> {
    const url = this.deps.document.location.href;
    this.deps.logger.info('autofill bootstrap start', { url });

    const adapter = await this.ensureAdapter(url);
    if (!adapter) {
      this.deps.logger.warn('bootstrap: no adapter for URL', { url });
      return;
    }

    if (this.isTorn) {
      this.deps.logger.info('bootstrap: teardown fired during load; aborting');
      return;
    }

    if (
      adapter.kind === 'workday' &&
      typeof adapter.detectCurrentStep === 'function' &&
      typeof adapter.watchForStepChange === 'function'
    ) {
      this.mountWorkdayStepWatcher(adapter);
    }

    this.deps.logger.info('autofill bootstrap complete', { kind: adapter.kind });
  }

  /**
   * Mount the Workday MutationObserver-backed step watcher.
   * Verbatim from keystone section 7 with logging + broadcast wiring.
   */
  private mountWorkdayStepWatcher(adapter: AtsAdapter): void {
    if (!adapter.detectCurrentStep || !adapter.watchForStepChange) {
      return;
    }
    this.currentStep = adapter.detectCurrentStep(this.deps.document);
    this.deps.logger.info('workday initial step', { step: this.currentStep });

    this.stepWatcherCleanup = adapter.watchForStepChange(this.deps.document, (newStep) => {
      const prev = this.currentStep;
      this.currentStep = newStep;
      this.deps.logger.info('workday step changed', { from: prev, to: newStep });

      // Broadcast INTENT_DETECTED so A10 popup can refresh its UI.
      // The tabId sentinel -1 is substituted by A5's bg handler with
      // sender.tab.id per keystone section 1.3.
      const payload: DetectedIntentPayload = {
        tabId: -1 as unknown as TabId,
        url: this.deps.document.location.href,
        kind: 'workday',
        pageKind: 'application-form',
        detectedAt: this.deps.now(),
      };
      try {
        this.deps.broadcast('INTENT_DETECTED', payload);
      } catch (err: unknown) {
        // Broadcast failures are non-fatal; the wizard loop still
        // tracks currentStep correctly in memory.
        this.deps.logger.warn('INTENT_DETECTED broadcast threw', { err: serializeError(err) });
      }
    });
  }

  /**
   * Execute a full fill cycle. Called from messaging.ts when a
   * FILL_REQUEST arrives from the background.
   *
   * NEVER throws. Every failure path produces a typed
   * FillRequestResponse with ok: false and a canonical reason.
   */
  async executeFill(): Promise<FillRequestResponse> {
    const url = this.deps.document.location.href;
    const startedAt = this.deps.now();
    this.deps.logger.info('executeFill start', { url });

    const adapter = await this.ensureAdapter(url);
    if (!adapter) {
      this.deps.logger.warn('executeFill: no adapter for URL', { url });
      return { ok: false, reason: 'no-adapter' };
    }

    const profile = await this.deps.readProfile();
    if (isEmptyProfile(profile)) {
      this.deps.logger.info('executeFill: no profile or profile empty');
      return { ok: false, reason: 'no-profile' };
    }
    // After the isEmptyProfile gate, profile is guaranteed non-null.
    const p: Profile = profile!;

    // --- Workday branch: multi-step wizard ---
    if (
      adapter.kind === 'workday' &&
      typeof adapter.scanStep === 'function' &&
      typeof adapter.fillStep === 'function'
    ) {
      return this.executeWorkdayFill(adapter, p, startedAt);
    }

    // --- Greenhouse / Lever branch: single-pass ---
    return this.executeSinglePassFill(adapter, p, startedAt);
  }

  private async executeWorkdayFill(
    adapter: AtsAdapter,
    profile: Profile,
    startedAt: number,
  ): Promise<FillRequestResponse> {
    if (this.currentStep === null) {
      this.deps.logger.warn('workday executeFill: currentStep is null');
      return { ok: false, reason: 'wizard-not-ready' };
    }
    if (this.currentStep === 'review' || this.currentStep === 'unknown') {
      this.deps.logger.info('workday executeFill: step is review/unknown; skipping fill', {
        step: this.currentStep,
      });
      return { ok: false, reason: 'wizard-not-ready' };
    }

    // scanStep is called for side-effect consistency so adapter
    // implementations that maintain per-step state via scan have a
    // chance to update before fillStep runs.
    let formModel: FormModel;
    try {
      formModel = adapter.scanStep!(this.deps.document, this.currentStep);
    } catch (err: unknown) {
      this.deps.logger.error('workday adapter.scanStep threw', err, { step: this.currentStep });
      return { ok: false, reason: 'scan-failed' };
    }
    this.deps.logger.debug('workday scanStep complete', {
      step: this.currentStep,
      fieldCount: formModel.fields.length,
    });

    let fillResults: ReadonlyArray<FillResult>;
    try {
      fillResults = await adapter.fillStep!(this.currentStep, profile);
    } catch (err: unknown) {
      this.deps.logger.error('workday adapter.fillStep threw', err, { step: this.currentStep });
      return { ok: false, reason: 'plan-failed' };
    }

    const planId = PlanIdBrand(this.deps.generatePlanId());
    const filled = fillResults.filter((r): r is Extract<FillResult, { ok: true }> => r.ok).length;
    const failed = fillResults.filter((r): r is Extract<FillResult, { ok: false }> => !r.ok).length;
    // For Workday wizard, `skipped` is always 0 from the controller's
    // perspective: B9's fillStep internally filters consent-gated fields
    // and returns a shorter fillResults array.
    const skipped = 0;

    this.deps.logger.info('workday executeFill complete', {
      step: this.currentStep,
      filled,
      failed,
      planId,
      durationMs: this.deps.now() - startedAt,
    });

    return { ok: true, filled, skipped, failed, planId };
  }

  private async executeSinglePassFill(
    adapter: AtsAdapter,
    profile: Profile,
    startedAt: number,
  ): Promise<FillRequestResponse> {
    let formModel: FormModel;
    try {
      formModel = adapter.scanForm(this.deps.document);
    } catch (err: unknown) {
      this.deps.logger.error('adapter.scanForm threw', err, { kind: adapter.kind });
      return { ok: false, reason: 'scan-failed' };
    }

    if (formModel.fields.length === 0) {
      this.deps.logger.info('scanForm returned empty form', { kind: adapter.kind });
      return { ok: false, reason: 'no-form' };
    }

    let plan: FillPlan;
    try {
      plan = buildPlan(formModel, profile);
    } catch (err: unknown) {
      this.deps.logger.error('buildPlan threw', err, { kind: adapter.kind });
      return { ok: false, reason: 'plan-failed' };
    }

    this.deps.logger.info('plan built', {
      kind: adapter.kind,
      planId: plan.planId,
      instructionCount: plan.instructions.length,
      skippedCount: plan.skipped.length,
    });

    let filled = 0;
    let failed = 0;
    // Skipped count from plan.skipped per keystone section 2.5.
    // B4's buildPlan routes skips to plan.skipped[], never to instructions[].
    const skipped = plan.skipped.length;

    for (const instruction of plan.instructions) {
      // FillValue.kind === 'skip' should NEVER appear in plan.instructions
      // per keystone section 2.5. If a buggy buildPlan leaks one, treat
      // it as a failed fill so the anomaly is visible.
      if (instruction.value.kind === 'skip') {
        this.deps.logger.warn('skip instruction leaked into plan.instructions', {
          selector: instruction.selector,
          reason: instruction.value.reason,
        });
        failed += 1;
        continue;
      }

      let result: FillResult;
      try {
        if (instruction.value.kind === 'file') {
          result = await this.executeFileInstruction(adapter, instruction);
        } else {
          result = adapter.fillField(instruction);
        }
      } catch (err: unknown) {
        this.deps.logger.error('adapter fill threw', err, {
          selector: instruction.selector,
          kind: instruction.value.kind,
        });
        result = {
          ok: false,
          selector: instruction.selector,
          error: 'unknown-error',
          instructionPlanId: instruction.planId,
        };
      }

      if (result.ok) {
        filled += 1;
      } else {
        failed += 1;
      }
    }

    this.deps.logger.info('singlePass executeFill complete', {
      kind: adapter.kind,
      planId: plan.planId,
      filled,
      skipped,
      failed,
      durationMs: this.deps.now() - startedAt,
    });

    return { ok: true, filled, skipped, failed, planId: plan.planId };
  }

  /**
   * Dispatch a file-kind FillInstruction. Per D1:
   *   1. If the adapter has no attachFile -> file-attach-failed.
   *   2. deps.resolveFile(handleId) -> File | null.
   *   3. If null -> file-attach-failed.
   *   4. adapter.attachFile(instruction, file) with the resolved File.
   */
  private async executeFileInstruction(
    adapter: AtsAdapter,
    instruction: FillInstruction,
  ): Promise<FillResult> {
    if (instruction.value.kind !== 'file') {
      return {
        ok: false,
        selector: instruction.selector,
        error: 'unknown-error',
        instructionPlanId: instruction.planId,
      };
    }

    if (typeof adapter.attachFile !== 'function') {
      this.deps.logger.debug('adapter has no attachFile; recording file-attach-failed', {
        selector: instruction.selector,
        kind: adapter.kind,
      });
      return {
        ok: false,
        selector: instruction.selector,
        error: 'file-attach-failed',
        instructionPlanId: instruction.planId,
      };
    }

    const file = await this.deps.resolveFile(instruction.value.handleId);
    if (!file) {
      this.deps.logger.warn('resolveFile returned null', {
        selector: instruction.selector,
        handleId: instruction.value.handleId,
      });
      return {
        ok: false,
        selector: instruction.selector,
        error: 'file-attach-failed',
        instructionPlanId: instruction.planId,
      };
    }

    try {
      return await adapter.attachFile(instruction, file);
    } catch (err: unknown) {
      this.deps.logger.error('adapter.attachFile threw', err, {
        selector: instruction.selector,
        handleId: instruction.value.handleId,
      });
      return {
        ok: false,
        selector: instruction.selector,
        error: 'file-attach-failed',
        instructionPlanId: instruction.planId,
      };
    }
  }

  /**
   * Single-flight adapter loader (review G1 fix). Concurrent callers
   * share an in-flight loadingPromise; only ONE deps.loadAdapter call
   * runs per URL + controller lifetime.
   */
  private async ensureAdapter(url: string): Promise<AtsAdapter | null> {
    if (this.adapter) return this.adapter;
    if (this.adapterLoadingPromise) return this.adapterLoadingPromise;

    this.adapterLoadingPromise = this.deps
      .loadAdapter(url)
      .then((loaded) => {
        if (loaded) {
          this.adapter = loaded;
          this.deps.logger.debug('adapter cached on controller', { kind: loaded.kind });
        }
        return loaded;
      })
      .catch((err: unknown) => {
        this.deps.logger.error('ensureAdapter: loadAdapter threw', err, { url });
        return null;
      })
      .finally(() => {
        this.adapterLoadingPromise = null;
      });

    return this.adapterLoadingPromise;
  }

  /**
   * Tear down the controller. Unmounts the Workday step watcher,
   * clears the loading promise, sets isTorn flag.
   * Called from ctx.onInvalidated() in main.ts.
   */
  teardown(): void {
    this.isTorn = true;
    if (this.stepWatcherCleanup) {
      try {
        this.stepWatcherCleanup();
      } catch (err: unknown) {
        this.deps.logger.warn('stepWatcherCleanup threw', { err: serializeError(err) });
      }
      this.stepWatcherCleanup = null;
    }
    this.currentStep = null;
    this.adapter = null;
    this.adapterLoadingPromise = null;
    this.deps.logger.info('controller torn down');
  }

  /** @internal for tests: read current step without mutation */
  getCurrentStepForTests(): WorkdayWizardStep | null {
    return this.currentStep;
  }

  /** @internal for tests: read cached adapter kind */
  getAdapterKindForTests(): AtsKind | null {
    return this.adapter?.kind ?? null;
  }
}

/**
 * Serialize a thrown value to a structured-loggable shape. Preserves
 * message, name, stack (review G15 fix) without trusting err.toString()
 * which can throw on proxies.
 */
function serializeError(err: unknown): { message: string; name?: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: '<unserializable error>' };
  }
}
```

### Step 11 -- Write `src/content/autofill/messaging.ts`

Content-side `onMessage('FILL_REQUEST', ...)` registration. Per D2, A5 already ships the bg-side forwarder. A8 registers the content-side listener.

File: `src/content/autofill/messaging.ts`

```typescript
// src/content/autofill/messaging.ts
/**
 * Content-side FILL_REQUEST listener.
 *
 * Flow (per A5 v2.1 keystone section 1.1 + 1.3):
 *   popup.sendMessage('FILL_REQUEST', { tabId })
 *   -> bg handler (A5) receives, calls
 *      chrome.tabs.sendMessage(tabId, 'FILL_REQUEST', { tabId })
 *   -> content onMessage('FILL_REQUEST', ...) handler (this file)
 *   -> controller.executeFill()
 *   -> returns FillRequestResponse
 *   -> @webext-core/messaging serializes back to popup
 *
 * A9 will extend this file with HIGHLIGHT_APPLY + HIGHLIGHT_CLEAR.
 */

import { onMessage } from '@/background/messaging/protocol';
import { createLogger } from '@/background/log';
import type { AutofillController } from './autofill-controller';

const log = createLogger('content-messaging');

export function registerFillListener(controller: AutofillController): void {
  onMessage('FILL_REQUEST', async (message) => {
    log.info('received FILL_REQUEST', {
      tabId: message.data.tabId,
    });
    try {
      const response = await controller.executeFill();
      log.info('returning FillRequestResponse', {
        ok: response.ok,
        ...(response.ok
          ? { filled: response.filled, skipped: response.skipped, failed: response.failed }
          : { reason: response.reason }),
      });
      return response;
    } catch (err: unknown) {
      // controller.executeFill() promises never to throw, but defend.
      log.error('controller.executeFill unexpectedly threw', err, {
        tabId: message.data.tabId,
      });
      return { ok: false as const, reason: 'no-form' as const };
    }
  });
}
```

### Step 12 -- Write `src/content/autofill/deps-factory.ts`

Production `AutofillControllerDeps` factory. Wires real implementations for every dep.

File: `src/content/autofill/deps-factory.ts`

```typescript
// src/content/autofill/deps-factory.ts
/**
 * Production AutofillControllerDeps factory.
 *
 * Per D20, no module-level singleton imports cross module boundaries.
 * Every cross-module dep goes through this factory so tests never
 * accidentally inherit production impls.
 */

import { browser } from 'wxt/browser';
import type { AutofillControllerDeps } from './autofill-controller';
import { loadAdapter, productionDynamicImport } from './adapter-loader';
import { readProfile } from './profile-reader';
import { resolveFile } from './file-resolver';
import { sendMessage } from '@/background/messaging/protocol';
import { createLogger } from '@/background/log';

export function createProductionDeps(): AutofillControllerDeps {
  const adapterLoaderLogger = createLogger('adapter-loader');
  const profileReaderLogger = createLogger('profile-reader');
  const fileResolverLogger = createLogger('file-resolver');
  const controllerLogger = createLogger('autofill-controller');

  const storageGet = async (key: string): Promise<Record<string, unknown>> => {
    return (await browser.storage.local.get(key)) as Record<string, unknown>;
  };

  return {
    loadAdapter: (url) =>
      loadAdapter(url, {
        logger: adapterLoaderLogger,
        dynamicImport: productionDynamicImport,
      }),
    readProfile: () =>
      readProfile({
        logger: profileReaderLogger,
        storageGet,
      }),
    resolveFile: (handleId) =>
      resolveFile(handleId, {
        logger: fileResolverLogger,
        storageGet,
      }),
    broadcast: (key, data) => {
      // Fire-and-forget broadcast. If the bg is down, log but do NOT throw.
      void sendMessage(key, data).catch((err: unknown) => {
        controllerLogger.warn('broadcast sendMessage failed', {
          key: String(key),
          err: err instanceof Error ? err.message : String(err),
        });
      });
    },
    logger: controllerLogger,
    now: () => Date.now(),
    document,
    generatePlanId: () => crypto.randomUUID(),
  };
}
```

### Step 13 -- Write `src/content/autofill/blueprint.contract.ts` + `index.ts`

Per D22, every phase area ships a blueprint contract file.

File: `src/content/autofill/blueprint.contract.ts`

```typescript
// src/content/autofill/blueprint.contract.ts
/**
 * A8 blueprint contract. Read by scripts/check-blueprint-contracts.mjs
 * at CI time. Any drift between declared publicExports and actual
 * exports fails the build.
 */

export const A8_BLUEPRINT = {
  phase: 'A8',
  version: '2.1',
  publicExports: [
    'createProductionDeps',
    'AutofillController',
    'resolveAtsKind',
    'loadAdapter',
    'productionDynamicImport',
    'readProfile',
    'isEmptyProfile',
    'PROFILE_STORAGE_KEY',
    'resolveFile',
    'RESUME_BLOB_PREFIX',
    'registerFillListener',
  ] as const,
  forbiddenImports: [
    'src/content/highlight/*',
    'src/content/intent/*',
    'entrypoints/popup/*',
    'entrypoints/options/*',
    'entrypoints/sidepanel/*',
  ],
  requiredCoverage: 75,
} as const;
```

File: `src/content/autofill/index.ts`

```typescript
// src/content/autofill/index.ts
/**
 * Barrel export for tests + blueprint contract validation.
 */

export { AutofillController } from './autofill-controller';
export type { AutofillControllerDeps } from './autofill-controller';
export { createProductionDeps } from './deps-factory';
export { resolveAtsKind, loadAdapter, productionDynamicImport } from './adapter-loader';
export type { AdapterLoaderDeps } from './adapter-loader';
export { readProfile, isEmptyProfile, PROFILE_STORAGE_KEY } from './profile-reader';
export type { ProfileReaderDeps } from './profile-reader';
export { resolveFile, RESUME_BLOB_PREFIX } from './file-resolver';
export type { FileResolverDeps, StoredResumeBlob } from './file-resolver';
export { registerFillListener } from './messaging';
export { A8_BLUEPRINT } from './blueprint.contract';
```

### Step 14 -- Write `tests/content/adapter-loader.spec.ts`

```typescript
// tests/content/adapter-loader.spec.ts
/**
 * Unit tests for adapter-loader.ts. Exercises resolveAtsKind
 * (pure function) + loadAdapter (dynamic import with fake deps).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  resolveAtsKind,
  loadAdapter,
  type AdapterLoaderDeps,
} from '@/content/autofill/adapter-loader';
import type { AtsAdapter, AtsKind, FormModel, FillInstruction, FillResult } from 'ats-autofill-engine';
import type { Logger } from '@/background/log';

function makeFakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeFakeAdapter(kind: AtsKind): AtsAdapter {
  return Object.freeze({
    kind,
    matchesUrl: (): boolean => true,
    scanForm: (): FormModel => ({
      url: 'https://example.com',
      title: 'Fake',
      scannedAt: '2026-04-16T00:00:00.000Z',
      fields: [],
    }),
    fillField: (instruction: FillInstruction): FillResult => ({
      ok: true,
      selector: instruction.selector,
      instructionPlanId: instruction.planId,
    }),
  });
}

// ============================================================
// resolveAtsKind -- happy path
// ============================================================

describe('resolveAtsKind -- happy path', () => {
  it('matches canonical greenhouse boards subdomain', () => {
    expect(resolveAtsKind('https://boards.greenhouse.io/example/jobs/1234')).toBe('greenhouse');
  });

  it('matches greenhouse vanity subdomain', () => {
    expect(resolveAtsKind('https://example.greenhouse.io/jobs/1234')).toBe('greenhouse');
  });

  it('matches bare greenhouse.io (no subdomain)', () => {
    expect(resolveAtsKind('https://greenhouse.io/jobs/1234')).toBe('greenhouse');
  });

  it('matches jobs.lever.co', () => {
    expect(resolveAtsKind('https://jobs.lever.co/example/abc-def')).toBe('lever');
  });

  it('matches workday vanity subdomain', () => {
    expect(
      resolveAtsKind('https://example.wd5.myworkdayjobs.com/en-US/External/job/1234'),
    ).toBe('workday');
  });

  it('matches bare myworkdayjobs.com', () => {
    expect(resolveAtsKind('https://myworkdayjobs.com/en-US/External/job/1234')).toBe('workday');
  });

  it('is case-insensitive (uppercase host)', () => {
    expect(resolveAtsKind('https://BOARDS.GREENHOUSE.IO/example/jobs/1')).toBe('greenhouse');
  });

  it('is case-insensitive (mixed case host)', () => {
    expect(resolveAtsKind('https://Boards.Greenhouse.IO/example/jobs/1')).toBe('greenhouse');
  });
});

// ============================================================
// resolveAtsKind -- security (suffix not substring) [review G5]
// ============================================================

describe('resolveAtsKind -- security (suffix not substring)', () => {
  it('rejects notgreenhouse.io.evil.com (host impersonation)', () => {
    expect(resolveAtsKind('https://notgreenhouse.io.evil.com/phish')).toBeNull();
  });

  it('rejects greenhouse.io.evil.com', () => {
    expect(resolveAtsKind('https://greenhouse.io.evil.com/phish')).toBeNull();
  });

  it('rejects evil-greenhouse.io (hyphen prefix)', () => {
    expect(resolveAtsKind('https://evil-greenhouse.io/phish')).toBeNull();
  });

  it('rejects jobs.lever.co.evil.com', () => {
    expect(resolveAtsKind('https://jobs.lever.co.evil.com/phish')).toBeNull();
  });

  it('rejects lever.co (not jobs.lever.co)', () => {
    expect(resolveAtsKind('https://lever.co/phish')).toBeNull();
  });

  it('rejects www.lever.co', () => {
    expect(resolveAtsKind('https://www.lever.co/careers')).toBeNull();
  });

  it('rejects fakemyworkdayjobs.com', () => {
    expect(resolveAtsKind('https://fakemyworkdayjobs.com/phish')).toBeNull();
  });

  it('rejects myworkdayjobs.com.evil.com', () => {
    expect(resolveAtsKind('https://myworkdayjobs.com.evil.com/phish')).toBeNull();
  });
});

// ============================================================
// resolveAtsKind -- non-matching URLs
// ============================================================

describe('resolveAtsKind -- non-matching URLs', () => {
  it('returns null for LinkedIn', () => {
    expect(resolveAtsKind('https://www.linkedin.com/jobs/view/12345')).toBeNull();
  });

  it('returns null for example.com', () => {
    expect(resolveAtsKind('https://example.com/careers')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(resolveAtsKind('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveAtsKind('')).toBeNull();
  });

  it('returns null for javascript: scheme', () => {
    expect(resolveAtsKind('javascript:alert(1)')).toBeNull();
  });

  it('returns null for file:// URL', () => {
    expect(resolveAtsKind('file:///etc/passwd')).toBeNull();
  });
});

// ============================================================
// loadAdapter -- happy path
// ============================================================

describe('loadAdapter -- happy path', () => {
  it('loads greenhouse adapter via dynamic import', async () => {
    const fakeAdapter = makeFakeAdapter('greenhouse');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = { logger: makeFakeLogger(), dynamicImport };
    const result = await loadAdapter('https://boards.greenhouse.io/example/jobs/1', deps);
    expect(result).toBe(fakeAdapter);
    expect(dynamicImport).toHaveBeenCalledWith('ats-autofill-engine/greenhouse');
    expect(dynamicImport).toHaveBeenCalledTimes(1);
  });

  it('loads lever adapter', async () => {
    const fakeAdapter = makeFakeAdapter('lever');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = { logger: makeFakeLogger(), dynamicImport };
    const result = await loadAdapter('https://jobs.lever.co/example/abc', deps);
    expect(result?.kind).toBe('lever');
    expect(dynamicImport).toHaveBeenCalledWith('ats-autofill-engine/lever');
  });

  it('loads workday adapter', async () => {
    const fakeAdapter = makeFakeAdapter('workday');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = { logger: makeFakeLogger(), dynamicImport };
    const result = await loadAdapter('https://example.wd5.myworkdayjobs.com/en-US/External/job/1', deps);
    expect(result?.kind).toBe('workday');
    expect(dynamicImport).toHaveBeenCalledWith('ats-autofill-engine/workday');
  });
});

// ============================================================
// loadAdapter -- failure paths
// ============================================================

describe('loadAdapter -- failure paths', () => {
  it('returns null for non-ATS URL without calling dynamicImport', async () => {
    const dynamicImport: Mock = vi.fn();
    const deps: AdapterLoaderDeps = { logger: makeFakeLogger(), dynamicImport };
    const result = await loadAdapter('https://example.com/', deps);
    expect(result).toBeNull();
    expect(dynamicImport).not.toHaveBeenCalled();
  });

  it('returns null if dynamicImport rejects (adapter load failure)', async () => {
    const dynamicImport: Mock = vi.fn(async () => {
      throw new Error('network-error');
    });
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter('https://boards.greenhouse.io/e/jobs/1', deps);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null if module has no `adapter` export', async () => {
    const dynamicImport: Mock = vi.fn(async () => ({ GreenhouseAdapter: {} }));
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter('https://boards.greenhouse.io/e/jobs/1', deps);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null if adapter.kind does not match URL kind', async () => {
    const wrongKind = makeFakeAdapter('lever');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: wrongKind }));
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter('https://boards.greenhouse.io/e/jobs/1', deps);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

// ============================================================
// Contract verification tests (D14.3)
// ============================================================

describe('vendor sub-entry contract (D14.3 exports-map resolution)', () => {
  it('ats-autofill-engine/greenhouse exports adapter with kind=greenhouse', async () => {
    const m = await import('ats-autofill-engine/greenhouse');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('greenhouse');
  });

  it('ats-autofill-engine/lever exports adapter with kind=lever', async () => {
    const m = await import('ats-autofill-engine/lever');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('lever');
  });

  it('ats-autofill-engine/workday exports adapter with kind=workday', async () => {
    const m = await import('ats-autofill-engine/workday');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('workday');
  });

  it('type-level: AtsAdapter has required structural members', async () => {
    // Compile-time check that AtsAdapter satisfies the expected shape
    const m = await import('ats-autofill-engine/greenhouse');
    const a = m.adapter;
    // These accesses must compile without error:
    const _kind: string = a.kind;
    const _matchesUrl: (url: string) => boolean = a.matchesUrl;
    const _scanForm: (root: Document) => unknown = a.scanForm;
    const _fillField: (instruction: unknown) => unknown = a.fillField;
    // Suppress unused variable warnings
    void _kind; void _matchesUrl; void _scanForm; void _fillField;
  });
});
```

### Step 15 -- Write `tests/content/profile-reader.spec.ts`

```typescript
// tests/content/profile-reader.spec.ts
/**
 * Unit tests for profile-reader.ts. Per D3, A8 reads the FULL Profile
 * shape A7 persists.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  readProfile,
  isEmptyProfile,
  PROFILE_STORAGE_KEY,
  type ProfileReaderDeps,
} from '@/content/autofill/profile-reader';
import { createEmptyProfile, ProfileSchema } from 'ats-autofill-engine/profile';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/background/log';

function makeFakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeRealisticProfile(): Profile {
  const empty = createEmptyProfile();
  return { ...empty, basics: { ...empty.basics, firstName: 'Ada', lastName: 'Lovelace', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+441234567890' } };
}

describe('readProfile -- happy path', () => {
  it('returns a Profile when storage has a valid record', async () => {
    const profile = makeRealisticProfile();
    const storageGet: Mock = vi.fn(async () => ({ [PROFILE_STORAGE_KEY]: profile }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    const result = await readProfile(deps);
    expect(result).not.toBeNull();
    expect(result?.basics.firstName).toBe('Ada');
    expect(result?.basics.email).toBe('ada@example.com');
    expect(result?.profileVersion).toBe('1.0');
  });

  it('returns the parsed Profile (structurally valid)', async () => {
    const profile = makeRealisticProfile();
    const storageGet: Mock = vi.fn(async () => ({ [PROFILE_STORAGE_KEY]: profile }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    const result = await readProfile(deps);
    expect(result).toEqual(ProfileSchema.parse(profile));
  });
});

describe('readProfile -- failure paths', () => {
  it('returns null when storage has no key', async () => {
    const storageGet: Mock = vi.fn(async () => ({}));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when storage returns undefined for the key', async () => {
    const storageGet: Mock = vi.fn(async () => ({ [PROFILE_STORAGE_KEY]: undefined }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when stored record is null', async () => {
    const storageGet: Mock = vi.fn(async () => ({ [PROFILE_STORAGE_KEY]: null }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when stored record fails ProfileSchema validation (malformed)', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: { profileVersion: 'not-a-version', basics: {} },
    }));
    const logger = makeFakeLogger();
    const deps: ProfileReaderDeps = { logger, storageGet };
    expect(await readProfile(deps)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when storage.get rejects', async () => {
    const storageGet: Mock = vi.fn(async () => { throw new Error('quota exceeded'); });
    const logger = makeFakeLogger();
    const deps: ProfileReaderDeps = { logger, storageGet };
    expect(await readProfile(deps)).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null when stored record is a primitive (string)', async () => {
    const storageGet: Mock = vi.fn(async () => ({ [PROFILE_STORAGE_KEY]: 'not-an-object' }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null for v1-shape legacy record (top-level firstName -- no profileVersion)', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+44', updatedAt: 1000 },
    }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });
});

describe('isEmptyProfile', () => {
  it('returns true for null', () => { expect(isEmptyProfile(null)).toBe(true); });

  it('returns true for a default empty profile', () => {
    expect(isEmptyProfile(createEmptyProfile())).toBe(true);
  });

  it('returns false for profile with firstName', () => {
    const p = createEmptyProfile();
    const withName: Profile = { ...p, basics: { ...p.basics, firstName: 'Ada' } };
    expect(isEmptyProfile(withName)).toBe(false);
  });

  it('returns false for profile with email', () => {
    const p = createEmptyProfile();
    const withEmail: Profile = { ...p, basics: { ...p.basics, email: 'ada@example.com' } };
    expect(isEmptyProfile(withEmail)).toBe(false);
  });

  it('returns true for profile with only whitespace firstName', () => {
    const p = createEmptyProfile();
    const withWhitespace: Profile = { ...p, basics: { ...p.basics, firstName: '   ' } };
    expect(isEmptyProfile(withWhitespace)).toBe(true);
  });

  it('returns true for profile with only whitespace email', () => {
    const p = createEmptyProfile();
    const withWhitespace: Profile = { ...p, basics: { ...p.basics, email: '   ' } };
    expect(isEmptyProfile(withWhitespace)).toBe(true);
  });

  it('returns false when firstName is present but email is empty', () => {
    const p = createEmptyProfile();
    const partial: Profile = { ...p, basics: { ...p.basics, firstName: 'A' } };
    expect(isEmptyProfile(partial)).toBe(false);
  });
});
```

### Step 16 -- Write `tests/content/file-resolver.spec.ts`

```typescript
// tests/content/file-resolver.spec.ts
/**
 * Unit tests for file-resolver.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  resolveFile,
  RESUME_BLOB_PREFIX,
  type FileResolverDeps,
  type StoredResumeBlob,
} from '@/content/autofill/file-resolver';
import { ResumeHandleId as ResumeHandleIdBrand } from 'ats-autofill-engine';
import type { Logger } from '@/background/log';

function makeFakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function makeStoredBlob(bytes: Uint8Array, filename = 'resume.pdf', mimeType = 'application/pdf'): StoredResumeBlob {
  return { filename, mimeType, sizeBytes: bytes.byteLength, base64: bytesToBase64(bytes), uploadedAtMs: 1700000000000 };
}

describe('resolveFile -- happy path', () => {
  it('resolves a valid stored blob to a File object', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]); // %PDF
    const handleId = ResumeHandleIdBrand('resume-123');
    const stored = makeStoredBlob(bytes);
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'resume-123']: stored }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    const file = await resolveFile(handleId, deps);
    expect(file).not.toBeNull();
    expect(file?.name).toBe('resume.pdf');
    expect(file?.type).toBe('application/pdf');
    expect(file?.size).toBe(4);
  });

  it('preserves lastModified from uploadedAtMs', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const handleId = ResumeHandleIdBrand('r');
    const stored: StoredResumeBlob = { filename: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 3, base64: bytesToBase64(bytes), uploadedAtMs: 1234567890 };
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: stored }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    const file = await resolveFile(handleId, deps);
    expect(file?.lastModified).toBe(1234567890);
  });
});

describe('resolveFile -- failure paths', () => {
  it('returns null when storage has no record', async () => {
    const storageGet: Mock = vi.fn(async () => ({}));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('missing'), deps)).toBeNull();
  });

  it('returns null when record is malformed (missing filename)', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [RESUME_BLOB_PREFIX + 'r']: { mimeType: 'application/pdf', base64: 'x', sizeBytes: 1, uploadedAtMs: 1 },
    }));
    const logger = makeFakeLogger();
    const deps: FileResolverDeps = { logger, storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when record has wrong types', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [RESUME_BLOB_PREFIX + 'r']: { filename: 123, mimeType: 'application/pdf', sizeBytes: 1, base64: 'x', uploadedAtMs: 1 },
    }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
  });

  it('returns null when sizeBytes is zero', async () => {
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: makeStoredBlob(new Uint8Array(0)) }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
  });

  it('returns null when sizeBytes exceeds 10 MB cap', async () => {
    const stored: StoredResumeBlob = { filename: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 20 * 1024 * 1024, base64: 'x', uploadedAtMs: 1 };
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: stored }));
    const logger = makeFakeLogger();
    const deps: FileResolverDeps = { logger, storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when decoded size does not match declared size', async () => {
    const stored: StoredResumeBlob = { filename: 'corrupt.pdf', mimeType: 'application/pdf', sizeBytes: 100, base64: bytesToBase64(new Uint8Array([1, 2, 3])), uploadedAtMs: 1 };
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: stored }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
  });

  it('returns null when base64 payload is malformed', async () => {
    const stored: StoredResumeBlob = { filename: 'bad.pdf', mimeType: 'application/pdf', sizeBytes: 3, base64: '!!!not-base64!!!', uploadedAtMs: 1 };
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: stored }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
  });

  it('returns null when storage.get rejects (file resolver returns null)', async () => {
    const storageGet: Mock = vi.fn(async () => { throw new Error('quota'); });
    const logger = makeFakeLogger();
    const deps: FileResolverDeps = { logger, storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null when record is a primitive', async () => {
    const storageGet: Mock = vi.fn(async () => ({ [RESUME_BLOB_PREFIX + 'r']: 'not-an-object' }));
    const deps: FileResolverDeps = { logger: makeFakeLogger(), storageGet };
    expect(await resolveFile(ResumeHandleIdBrand('r'), deps)).toBeNull();
  });
});
```

### Step 17 -- Write `tests/content/autofill-controller.spec.ts` (Greenhouse + Lever)

This file exercises the single-pass branch. The Workday branch has its own file.

```typescript
// tests/content/autofill-controller.spec.ts
/**
 * Unit tests for AutofillController.executeFill on the single-pass
 * (Greenhouse + Lever) branch. Uses fully-typed fake deps; zero `any`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { AutofillController, type AutofillControllerDeps } from '@/content/autofill/autofill-controller';
import type { AtsAdapter, AtsKind, FillInstruction, FillResult, FillPlan, FormModel, ResumeHandleId } from 'ats-autofill-engine';
import { PlanId as PlanIdBrand } from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/background/log';

vi.mock('ats-autofill-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ats-autofill-engine')>();
  return {
    ...actual,
    buildPlan: vi.fn((formModel: FormModel, _profile: Profile): FillPlan => ({
      planId: PlanIdBrand('plan-test-1'),
      createdAt: '2026-04-16T00:00:00.000Z',
      formUrl: formModel.url,
      instructions: [
        { selector: '#first_name', field: 'given-name' as const, value: { kind: 'text', value: 'Ada' }, priority: 100, planId: PlanIdBrand('plan-test-1') } as unknown as FillInstruction,
        { selector: '#email', field: 'email' as const, value: { kind: 'text', value: 'ada@example.com' }, priority: 100, planId: PlanIdBrand('plan-test-1') } as unknown as FillInstruction,
      ],
      skipped: [],
    })),
  };
});

function makeFakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeRealisticProfile(): Profile {
  const empty = createEmptyProfile();
  return { ...empty, basics: { ...empty.basics, firstName: 'Ada', lastName: 'Lovelace', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+441234567890' } };
}

function makeGreenhouseFormModel(fieldCount: number): FormModel {
  return {
    url: 'https://boards.greenhouse.io/example/jobs/1', title: 'Software Engineer', scannedAt: '2026-04-16T00:00:00.000Z', sourceATS: 'greenhouse',
    fields: new Array(fieldCount).fill(null).map((_, i) => ({ selector: `#field_${i}`, name: `field_${i}`, id: `field_${i}`, label: `Field ${i}`, placeholder: null, ariaLabel: null, autocomplete: null, type: 'text', options: [], required: false, dataAttributes: {}, sectionHeading: null, domIndex: i })),
  };
}

function makeFakeGreenhouseAdapter(overrides: Partial<AtsAdapter> = {}): AtsAdapter {
  return Object.freeze({
    kind: 'greenhouse' as const,
    matchesUrl: () => true,
    scanForm: () => makeGreenhouseFormModel(8),
    fillField: (instruction: FillInstruction): FillResult => ({ ok: true, selector: instruction.selector, instructionPlanId: instruction.planId }),
    attachFile: async (instruction: FillInstruction, _file: File): Promise<FillResult> => ({ ok: true, selector: instruction.selector, instructionPlanId: instruction.planId }),
    ...overrides,
  });
}

function makeDeps(overrides: Partial<AutofillControllerDeps> = {}): AutofillControllerDeps {
  const fakeDoc = { location: { href: 'https://boards.greenhouse.io/example/jobs/1' } } as unknown as Document;
  return {
    loadAdapter: vi.fn(async () => makeFakeGreenhouseAdapter()),
    readProfile: vi.fn(async () => makeRealisticProfile()),
    resolveFile: vi.fn(async (_h: ResumeHandleId) => new File([new Uint8Array([1, 2, 3])], 'resume.pdf')),
    broadcast: vi.fn(),
    logger: makeFakeLogger(),
    now: vi.fn(() => 1_000_000),
    document: fakeDoc,
    generatePlanId: vi.fn(() => 'test-plan-id'),
    ...overrides,
  };
}

describe('AutofillController.executeFill -- 8-field Greenhouse happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok: true with filled counts', async () => {
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.filled).toBe(2); expect(res.skipped).toBe(0); expect(res.failed).toBe(0); expect(res.planId).toBeDefined(); }
  });

  it('counts per-field failures when individual fillField returns ok: false', async () => {
    const adapter = makeFakeGreenhouseAdapter({
      fillField: (instruction: FillInstruction): FillResult =>
        instruction.selector === '#email'
          ? { ok: false, selector: instruction.selector, error: 'value-rejected-by-page', instructionPlanId: instruction.planId }
          : { ok: true, selector: instruction.selector, instructionPlanId: instruction.planId },
    });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.filled).toBe(1); expect(res.failed).toBe(1); }
  });

  it('catches fillField throw and records as failed', async () => {
    const adapter = makeFakeGreenhouseAdapter({ fillField: () => { throw new Error('native setter boom'); } });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.failed).toBe(2); expect(res.filled).toBe(0); }
  });
});

describe('AutofillController.executeFill -- failure reasons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns no-adapter when loadAdapter returns null', async () => {
    const deps = makeDeps({ loadAdapter: vi.fn(async () => null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-adapter');
  });

  it('returns no-profile when readProfile returns null', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-profile');
  });

  it('returns no-profile when profile is empty (default)', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => createEmptyProfile()) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-profile');
  });

  it('returns no-form when scanForm returns empty fields (form not detected)', async () => {
    const adapter = makeFakeGreenhouseAdapter({ scanForm: () => makeGreenhouseFormModel(0) });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-form');
  });

  it('returns scan-failed when scanForm throws (scan throws)', async () => {
    const adapter = makeFakeGreenhouseAdapter({ scanForm: () => { throw new Error('selector syntax error'); } });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('scan-failed');
  });

  it('returns plan-failed when buildPlan throws (plan-builder throws)', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => { throw new Error('classifier explosion'); });
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('plan-failed');
  });
});

describe('AutofillController -- single-flight adapter loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('caches adapter across sequential executeFill calls', async () => {
    const loadAdapterMock = vi.fn(async () => makeFakeGreenhouseAdapter());
    const deps = makeDeps({ loadAdapter: loadAdapterMock });
    const ctrl = new AutofillController(deps);
    await ctrl.executeFill();
    await ctrl.executeFill();
    await ctrl.executeFill();
    expect(loadAdapterMock).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent executeFill calls (concurrent fill re-entry)', async () => {
    let resolveLoad!: (a: AtsAdapter) => void;
    const loadAdapterMock = vi.fn(() => new Promise<AtsAdapter>((r) => { resolveLoad = r; }));
    const deps = makeDeps({ loadAdapter: loadAdapterMock });
    const ctrl = new AutofillController(deps);
    const p1 = ctrl.executeFill();
    const p2 = ctrl.executeFill();
    const p3 = ctrl.executeFill();
    resolveLoad(makeFakeGreenhouseAdapter());
    await Promise.all([p1, p2, p3]);
    expect(loadAdapterMock).toHaveBeenCalledTimes(1);
  });
});

describe('AutofillController -- file-attach instruction path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves file and calls adapter.attachFile with the File', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce((formModel: FormModel): FillPlan => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: formModel.url,
      instructions: [{ selector: '#resume', field: 'resume' as const, value: { kind: 'file', handleId: 'resume-1' as unknown as ResumeHandleId }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [],
    }));
    const attachFileMock = vi.fn(async (instruction: FillInstruction, file: File): Promise<FillResult> => {
      expect(file.name).toBe('resume.pdf');
      return { ok: true, selector: instruction.selector, instructionPlanId: instruction.planId };
    });
    const adapter = makeFakeGreenhouseAdapter({ attachFile: attachFileMock });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.filled).toBe(1);
    expect(deps.resolveFile).toHaveBeenCalledWith('resume-1');
    expect(attachFileMock).toHaveBeenCalledTimes(1);
  });

  it('returns file-attach-failed when resolveFile returns null (file resolver returns null)', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce((formModel: FormModel): FillPlan => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: formModel.url,
      instructions: [{ selector: '#resume', field: 'resume' as const, value: { kind: 'file', handleId: 'missing' as unknown as ResumeHandleId }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [],
    }));
    const deps = makeDeps({ resolveFile: vi.fn(async () => null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.failed).toBe(1); expect(res.filled).toBe(0); }
  });

  it('returns file-attach-failed when adapter has no attachFile method', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce((formModel: FormModel): FillPlan => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: formModel.url,
      instructions: [{ selector: '#resume', field: 'resume' as const, value: { kind: 'file', handleId: 'resume-1' as unknown as ResumeHandleId }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [],
    }));
    const noAttach = makeFakeGreenhouseAdapter();
    // @ts-expect-error -- stripping optional member for this test
    delete (noAttach as { attachFile?: unknown }).attachFile;
    const deps = makeDeps({ loadAdapter: vi.fn(async () => noAttach) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.failed).toBe(1);
    expect(deps.resolveFile).not.toHaveBeenCalled();
  });
});

describe('AutofillController -- skipped accounting (skipped counted separately from errors)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports plan.skipped.length as the skipped count', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce((formModel: FormModel): FillPlan => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: formModel.url,
      instructions: [{ selector: '#first_name', field: 'given-name' as const, value: { kind: 'text', value: 'Ada' }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [
        { instruction: { selector: '#gender', field: 'gender' as const, value: { kind: 'skip', reason: 'consent-not-granted' }, priority: 10, planId: PlanIdBrand('p') } as unknown as FillInstruction, reason: 'consent-not-granted' as const },
        { instruction: { selector: '#veteran', field: 'veteran-status' as const, value: { kind: 'skip', reason: 'consent-not-granted' }, priority: 10, planId: PlanIdBrand('p') } as unknown as FillInstruction, reason: 'consent-not-granted' as const },
      ],
    }));
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.skipped).toBe(2); expect(res.filled).toBe(1); expect(res.failed).toBe(0); }
  });
});

describe('AutofillController.bootstrap -- Greenhouse', () => {
  it('loads adapter without mounting step watcher', async () => {
    const adapter = makeFakeGreenhouseAdapter();
    const loadAdapterMock = vi.fn(async () => adapter);
    const deps = makeDeps({ loadAdapter: loadAdapterMock });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    expect(loadAdapterMock).toHaveBeenCalledTimes(1);
    expect(ctrl.getCurrentStepForTests()).toBeNull();
  });

  it('tolerates loadAdapter returning null', async () => {
    const deps = makeDeps({ loadAdapter: vi.fn(async () => null) });
    const ctrl = new AutofillController(deps);
    await expect(ctrl.bootstrap()).resolves.toBeUndefined();
  });

  it('tolerates loadAdapter throwing', async () => {
    const deps = makeDeps({ loadAdapter: vi.fn(async () => { throw new Error('boom'); }) });
    const ctrl = new AutofillController(deps);
    await expect(ctrl.bootstrap()).resolves.toBeUndefined();
  });
});
```

### Step 18 -- Write `tests/content/autofill-controller.workday.spec.ts`

Covers the Workday wizard branch per D6: 4-step traversal with consent granted, consent denied, review step, unknown step, step regression, scanStep/fillStep throws, teardown.

```typescript
// tests/content/autofill-controller.workday.spec.ts
/**
 * AutofillController -- Workday wizard branch tests per D6 + keystone section 7.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { AutofillController, type AutofillControllerDeps } from '@/content/autofill/autofill-controller';
import type { AtsAdapter, FillInstruction, FillResult, FormModel, ResumeHandleId, WorkdayWizardStep } from 'ats-autofill-engine';
import { PlanId as PlanIdBrand } from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/background/log';

vi.mock('ats-autofill-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ats-autofill-engine')>();
  return { ...actual, buildPlan: vi.fn(() => ({ planId: PlanIdBrand('unused'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '', instructions: [], skipped: [] })) };
});

function makeFakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeWorkdayProfile(consent: { eeo: boolean; dob: boolean } = { eeo: true, dob: true }): Profile {
  const empty = createEmptyProfile();
  return { ...empty, basics: { ...empty.basics, firstName: 'Grace', lastName: 'Hopper', name: 'Grace Hopper', email: 'grace@example.com', phone: '+1-202-555-0100' }, consents: { ...empty.consents, allowEeoAutofill: consent.eeo, allowDobAutofill: consent.dob } };
}

function makeWorkdayFormModel(step: WorkdayWizardStep, fieldCount = 5): FormModel {
  return {
    url: `https://example.wd5.myworkdayjobs.com/en-US/External/task/${step}`, title: `Workday -- ${step}`, scannedAt: '2026-04-16T00:00:00.000Z', sourceATS: 'workday',
    fields: new Array(fieldCount).fill(null).map((_, i) => ({ selector: `[data-automation-id="${step}-field-${i}"]`, name: `${step}-field-${i}`, id: null, label: `Field ${i}`, placeholder: null, ariaLabel: null, autocomplete: null, type: 'text', options: [], required: false, dataAttributes: {}, sectionHeading: null, domIndex: i })),
  };
}

interface FakeWorkdayState {
  detectedStep: WorkdayWizardStep;
  watcherCallback: ((step: WorkdayWizardStep) => void) | null;
  watcherCleanup: Mock;
  scanStep: Mock;
  fillStep: Mock;
}

function makeFakeWorkdayAdapter(initialStep: WorkdayWizardStep): { adapter: AtsAdapter; state: FakeWorkdayState } {
  const state: FakeWorkdayState = {
    detectedStep: initialStep,
    watcherCallback: null,
    watcherCleanup: vi.fn(),
    scanStep: vi.fn((_doc: Document, step: WorkdayWizardStep) => makeWorkdayFormModel(step)),
    fillStep: vi.fn(async (step: WorkdayWizardStep, profile: Profile): Promise<ReadonlyArray<FillResult>> => {
      if (step === 'voluntary-disclosures' && !profile.consents.allowEeoAutofill) return [];
      return [
        { ok: true, selector: 'a', instructionPlanId: PlanIdBrand('p') },
        { ok: true, selector: 'b', instructionPlanId: PlanIdBrand('p') },
        { ok: true, selector: 'c', instructionPlanId: PlanIdBrand('p') },
      ];
    }),
  };
  const adapter: AtsAdapter = Object.freeze({
    kind: 'workday' as const, matchesUrl: () => true,
    scanForm: (doc: Document) => state.scanStep(doc, state.detectedStep),
    fillField: (instruction: FillInstruction): FillResult => ({ ok: false, selector: instruction.selector, error: 'unknown-error', instructionPlanId: instruction.planId }),
    detectCurrentStep: () => state.detectedStep,
    watchForStepChange: (_doc: Document, cb: (step: WorkdayWizardStep) => void) => { state.watcherCallback = cb; return state.watcherCleanup; },
    scanStep: state.scanStep, fillStep: state.fillStep,
  });
  return { adapter, state };
}

function makeDeps(overrides: Partial<AutofillControllerDeps> = {}): AutofillControllerDeps {
  const fakeDoc = { location: { href: 'https://example.wd5.myworkdayjobs.com/en-US/External/task/myInformation' } } as unknown as Document;
  return {
    loadAdapter: vi.fn(), readProfile: vi.fn(async () => makeWorkdayProfile()),
    resolveFile: vi.fn(async () => new File([new Uint8Array([1])], 'r.pdf')),
    broadcast: vi.fn(), logger: makeFakeLogger(), now: vi.fn(() => 1_000_000),
    document: fakeDoc, generatePlanId: vi.fn(() => 'wizard-plan-id'),
    ...overrides,
  };
}

describe('Workday wizard -- bootstrap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mounts step watcher and detects initial step', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    expect(ctrl.getCurrentStepForTests()).toBe('my-information');
    expect(state.watcherCallback).not.toBeNull();
  });

  it('updates currentStep and broadcasts INTENT_DETECTED on step change', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const broadcastMock = vi.fn();
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter), broadcast: broadcastMock });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    state.watcherCallback?.('my-experience');
    expect(ctrl.getCurrentStepForTests()).toBe('my-experience');
    expect(broadcastMock).toHaveBeenCalledWith('INTENT_DETECTED', expect.objectContaining({ kind: 'workday', pageKind: 'application-form' }));
  });

  it('broadcasts INTENT_DETECTED on every step transition', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const broadcastMock = vi.fn();
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter), broadcast: broadcastMock });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    state.watcherCallback?.('my-experience');
    state.watcherCallback?.('voluntary-disclosures');
    state.watcherCallback?.('review');
    expect(broadcastMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT call watchForStepChange if adapter kind is not workday', async () => {
    const greenAdapter: AtsAdapter = Object.freeze({
      kind: 'greenhouse' as const, matchesUrl: () => true,
      scanForm: () => makeWorkdayFormModel('my-information'),
      fillField: (i: FillInstruction): FillResult => ({ ok: true, selector: i.selector, instructionPlanId: i.planId }),
    });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => greenAdapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    expect(ctrl.getCurrentStepForTests()).toBeNull();
  });

  it('does NOT mount watcher if adapter omits detectCurrentStep', async () => {
    const partialAdapter: AtsAdapter = Object.freeze({
      kind: 'workday' as const, matchesUrl: () => true,
      scanForm: () => makeWorkdayFormModel('my-information'),
      fillField: (i: FillInstruction): FillResult => ({ ok: true, selector: i.selector, instructionPlanId: i.planId }),
    });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => partialAdapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    expect(ctrl.getCurrentStepForTests()).toBeNull();
  });
});

describe('Workday wizard -- 4-step traversal with EEO consent GRANTED', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fills my-information step when bootstrapped there', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.filled).toBe(3); expect(res.failed).toBe(0); }
    expect(state.fillStep).toHaveBeenCalledWith('my-information', expect.any(Object));
  });

  it('fills my-experience step after transition', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    state.watcherCallback?.('my-experience');
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    expect(state.fillStep).toHaveBeenCalledWith('my-experience', expect.any(Object));
  });

  it('fills voluntary-disclosures when EEO consent granted', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('voluntary-disclosures');
    const profile = makeWorkdayProfile({ eeo: true, dob: true });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter), readProfile: vi.fn(async () => profile) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.filled).toBe(3);
    expect(state.fillStep).toHaveBeenCalledWith('voluntary-disclosures', profile);
  });

  it('fills review step correctly (wizard-not-ready)', async () => {
    const { adapter } = makeFakeWorkdayAdapter('review');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('wizard-not-ready');
  });
});

describe('Workday wizard -- 4-step traversal with EEO consent DENIED', () => {
  beforeEach(() => vi.clearAllMocks());

  it('respects consent DENIED on voluntary-disclosures (B9 returns empty results)', async () => {
    const { adapter } = makeFakeWorkdayAdapter('voluntary-disclosures');
    const profile = makeWorkdayProfile({ eeo: false, dob: false });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter), readProfile: vi.fn(async () => profile) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.filled).toBe(0); expect(res.failed).toBe(0); expect(res.skipped).toBe(0); }
  });
});

describe('Workday wizard -- edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns wizard-not-ready on review step', async () => {
    const { adapter } = makeFakeWorkdayAdapter('review');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('wizard-not-ready');
  });

  it('returns wizard-not-ready on unknown step', async () => {
    const { adapter } = makeFakeWorkdayAdapter('unknown');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('wizard-not-ready');
  });

  it('handles wizard step regression (user navigates back to My Information)', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    state.watcherCallback?.('my-experience');
    state.watcherCallback?.('my-information'); // user clicked "Back"
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    expect(state.fillStep).toHaveBeenLastCalledWith('my-information', expect.any(Object));
  });

  it('returns scan-failed if scanStep throws', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    state.scanStep.mockImplementationOnce(() => { throw new Error('selector borked'); });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('scan-failed');
  });

  it('returns plan-failed if fillStep throws', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    state.fillStep.mockImplementationOnce(async () => { throw new Error('click-row-add explosion'); });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('plan-failed');
  });
});

describe('Workday wizard -- teardown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls watcher cleanup on teardown', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    ctrl.teardown();
    expect(state.watcherCleanup).toHaveBeenCalledTimes(1);
  });

  it('clears currentStep and adapter on teardown', async () => {
    const { adapter } = makeFakeWorkdayAdapter('my-information');
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    ctrl.teardown();
    expect(ctrl.getCurrentStepForTests()).toBeNull();
    expect(ctrl.getAdapterKindForTests()).toBeNull();
  });

  it('tolerates cleanup throwing', async () => {
    const { adapter, state } = makeFakeWorkdayAdapter('my-information');
    state.watcherCleanup.mockImplementationOnce(() => { throw new Error('observer already disconnected'); });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    expect(() => ctrl.teardown()).not.toThrow();
  });
});
```

### Step 19 -- Write `tests/content/autofill-controller.adversarial.spec.ts`

Per D19, every phase must ship adversarial tests in six categories. All mandatory test cases from the requirements are covered.

```typescript
// tests/content/autofill-controller.adversarial.spec.ts
/**
 * Adversarial tests per D19. Six categories:
 *  1. Null/undefined/NaN/Infinity at parameters
 *  2. Empty + max-size collections
 *  3. Unicode edge cases (RTL, combining chars, null bytes, surrogates)
 *  4. Injection (script tags, SQL-style, path traversal, circular selector)
 *  5. Concurrent re-entry (idempotency, single-flight)
 *  6. Adversarial state (frozen objects, throwing proxies, stale adapter)
 *
 * Every test uses typed mocks. Zero `any`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { AutofillController, type AutofillControllerDeps } from '@/content/autofill/autofill-controller';
import type { AtsAdapter, FillInstruction, FillResult, FillPlan, FormModel, ResumeHandleId, WorkdayWizardStep } from 'ats-autofill-engine';
import { PlanId as PlanIdBrand } from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import { createEmptyProfile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/background/log';

vi.mock('ats-autofill-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ats-autofill-engine')>();
  return { ...actual, buildPlan: vi.fn((formModel: FormModel, _profile: Profile): FillPlan => ({ planId: PlanIdBrand('adv-plan'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: formModel.url, instructions: [], skipped: [] })) };
});

function makeFakeLogger(): Logger { return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }; }

function makeMinProfile(): Profile {
  const empty = createEmptyProfile();
  return { ...empty, basics: { ...empty.basics, firstName: 'Ada', email: 'ada@example.com' } };
}

function makeFakeFormModel(fieldCount: number): FormModel {
  return { url: 'https://boards.greenhouse.io/example/jobs/1', title: 'Adversarial Test', scannedAt: '2026-04-16T00:00:00.000Z', fields: new Array(fieldCount).fill(null).map((_, i) => ({ selector: `#f_${i}`, name: null, id: null, label: null, placeholder: null, ariaLabel: null, autocomplete: null, type: 'text', options: [], required: false, dataAttributes: {}, sectionHeading: null, domIndex: i })) };
}

function makeFakeAdapter(overrides: Partial<AtsAdapter> = {}): AtsAdapter {
  return Object.freeze({ kind: 'greenhouse' as const, matchesUrl: () => true, scanForm: () => makeFakeFormModel(2), fillField: (i: FillInstruction): FillResult => ({ ok: true, selector: i.selector, instructionPlanId: i.planId }), ...overrides });
}

function makeDeps(overrides: Partial<AutofillControllerDeps> = {}): AutofillControllerDeps {
  const fakeDoc = { location: { href: 'https://boards.greenhouse.io/example/jobs/1' } } as unknown as Document;
  return { loadAdapter: vi.fn(async () => makeFakeAdapter()), readProfile: vi.fn(async () => makeMinProfile()), resolveFile: vi.fn(async () => new File([new Uint8Array([1])], 'r.pdf')), broadcast: vi.fn(), logger: makeFakeLogger(), now: vi.fn(() => 1_000_000), document: fakeDoc, generatePlanId: vi.fn(() => 'adv-plan-id'), ...overrides };
}

// ============================================================
// Category 1: Null / undefined / NaN / Infinity at parameters
// ============================================================

describe('adversarial category 1 -- null/undefined/NaN/Infinity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles readProfile returning undefined', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => undefined as unknown as Profile | null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-profile');
  });

  it('handles loadAdapter returning undefined (adapter load failure)', async () => {
    const deps = makeDeps({ loadAdapter: vi.fn(async () => undefined as unknown as AtsAdapter | null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-adapter');
  });

  it('handles now() returning NaN', async () => {
    const deps = makeDeps({ now: vi.fn(() => NaN) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
  });

  it('handles now() returning Infinity', async () => {
    const deps = makeDeps({ now: vi.fn(() => Infinity) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
  });

  it('handles document.location.href being empty string', async () => {
    const deps = makeDeps({ document: { location: { href: '' } } as unknown as Document, loadAdapter: vi.fn(async () => null) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe('no-adapter');
  });
});

// ============================================================
// Category 2: Empty + max-size collections
// ============================================================

describe('adversarial category 2 -- empty + max-size collections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles empty plan.instructions (form not detected equivalent)', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => ({ planId: PlanIdBrand('empty'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '', instructions: [], skipped: [] }));
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.filled).toBe(0); expect(res.failed).toBe(0); expect(res.skipped).toBe(0); }
  });

  it('handles 1000-instruction plan without stack overflow', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => ({
      planId: PlanIdBrand('huge'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '',
      instructions: new Array(1000).fill(null).map((_, i) => ({ selector: `#f_${i}`, field: 'given-name' as const, value: { kind: 'text' as const, value: `v${i}` }, priority: 100, planId: PlanIdBrand('huge') } as unknown as FillInstruction)),
      skipped: [],
    }));
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.filled).toBe(1000);
  });

  it('handles 500 skipped entries', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => ({
      planId: PlanIdBrand('skips'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '', instructions: [],
      skipped: new Array(500).fill(null).map((_, i) => ({ instruction: { selector: `#s_${i}`, field: 'gender' as const, value: { kind: 'skip' as const, reason: 'consent-not-granted' }, priority: 1, planId: PlanIdBrand('skips') } as unknown as FillInstruction, reason: 'consent-not-granted' as const })),
    }));
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.skipped).toBe(500);
  });
});

// ============================================================
// Category 3: Unicode edge cases
// ============================================================

describe('adversarial category 3 -- unicode edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeUnicodeProfile(firstName: string, lastName: string, email = 'u@example.com'): Profile {
    const empty = createEmptyProfile();
    return { ...empty, basics: { ...empty.basics, firstName, lastName, name: `${firstName} ${lastName}`, email } };
  }

  it('handles RTL (Arabic) names', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => makeUnicodeProfile('\u0639\u0627\u0626\u0634\u0629', '\u0627\u0644\u0635\u062f\u064a\u0642')) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles combining diacritical marks', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => makeUnicodeProfile('Ame\u0301lie', 'Dupont')) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles emoji (surrogate pairs) in names', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => makeUnicodeProfile('Ada \u{1F3A9}', 'Lovelace')) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles null byte in firstName', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => makeUnicodeProfile('Ada\0Evil', 'L')) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res).toBeDefined(); // does not throw
  });

  it('handles zero-width joiner sequences', async () => {
    const deps = makeDeps({ readProfile: vi.fn(async () => makeUnicodeProfile('Ada\u200DTest', 'L')) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });
});

// ============================================================
// Category 4: Injection (including circular selector)
// ============================================================

describe('adversarial category 4 -- injection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles <script> tag in firstName (adapter treats as literal text)', async () => {
    const empty = createEmptyProfile();
    const profile: Profile = { ...empty, basics: { ...empty.basics, firstName: '<script>alert(1)</script>', email: 'x@example.com' } };
    const deps = makeDeps({ readProfile: vi.fn(async () => profile) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles SQL-style injection payload in email', async () => {
    const empty = createEmptyProfile();
    const profile: Profile = { ...empty, basics: { ...empty.basics, firstName: 'A', email: "a@example.com'; DROP TABLE users; --" } };
    const deps = makeDeps({ readProfile: vi.fn(async () => profile) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill())).toBeDefined();
  });

  it('handles path traversal in resume handleId', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '',
      instructions: [{ selector: '#resume', field: 'resume' as const, value: { kind: 'file' as const, handleId: '../../../etc/passwd' as unknown as ResumeHandleId }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [],
    }));
    const resolveFileMock = vi.fn(async () => null);
    const deps = makeDeps({ resolveFile: resolveFileMock });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(resolveFileMock).toHaveBeenCalledWith('../../../etc/passwd');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.failed).toBe(1);
  });

  it('handles FillInstruction with circular/malformed selector (reject)', async () => {
    const engine = await import('ats-autofill-engine');
    (engine.buildPlan as unknown as Mock).mockImplementationOnce(() => ({
      planId: PlanIdBrand('p'), createdAt: '2026-04-16T00:00:00.000Z', formUrl: '',
      instructions: [{ selector: '#first_name")]/../*[self::script]', field: 'given-name' as const, value: { kind: 'text' as const, value: 'Ada' }, priority: 100, planId: PlanIdBrand('p') } as unknown as FillInstruction],
      skipped: [],
    }));
    const adapter = makeFakeAdapter({
      fillField: (i: FillInstruction): FillResult => ({ ok: false, selector: i.selector, error: 'selector-not-found', instructionPlanId: i.planId }),
    });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.failed).toBe(1);
  });
});

// ============================================================
// Category 5: Concurrent re-entry (idempotency + single-flight)
// ============================================================

describe('adversarial category 5 -- concurrent re-entry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('single-flights concurrent loadAdapter calls (idempotent via loadingPromise)', async () => {
    let resolveLoad!: (a: AtsAdapter) => void;
    const loadAdapterMock = vi.fn(() => new Promise<AtsAdapter>((r) => { resolveLoad = r; }));
    const deps = makeDeps({ loadAdapter: loadAdapterMock });
    const ctrl = new AutofillController(deps);
    const p1 = ctrl.executeFill();
    const p2 = ctrl.executeFill();
    resolveLoad(makeFakeAdapter());
    await Promise.all([p1, p2]);
    expect(loadAdapterMock).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent executeFill + teardown race', async () => {
    let resolveLoad!: (a: AtsAdapter) => void;
    const loadAdapterMock = vi.fn(() => new Promise<AtsAdapter>((r) => { resolveLoad = r; }));
    const deps = makeDeps({ loadAdapter: loadAdapterMock });
    const ctrl = new AutofillController(deps);
    const p = ctrl.executeFill();
    ctrl.teardown();
    resolveLoad(makeFakeAdapter());
    await expect(p).resolves.toBeDefined();
  });

  it('bootstrap followed immediately by teardown does not leak watcher', async () => {
    const cleanupMock = vi.fn();
    const workdayAdapter: AtsAdapter = Object.freeze({
      kind: 'workday' as const, matchesUrl: () => true,
      scanForm: () => makeFakeFormModel(1),
      fillField: (i: FillInstruction): FillResult => ({ ok: true, selector: i.selector, instructionPlanId: i.planId }),
      detectCurrentStep: () => 'my-information' as const,
      watchForStepChange: () => cleanupMock,
      scanStep: (_d: Document, _s: WorkdayWizardStep) => makeFakeFormModel(1),
      fillStep: async () => [],
    });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => workdayAdapter) });
    const ctrl = new AutofillController(deps);
    await ctrl.bootstrap();
    ctrl.teardown();
    expect(cleanupMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Category 6: Adversarial state (frozen, proxies, stale adapter)
// ============================================================

describe('adversarial category 6 -- adversarial state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles frozen Profile object', async () => {
    const frozenProfile = Object.freeze({ ...makeMinProfile(), basics: Object.freeze({ ...makeMinProfile().basics }) });
    const deps = makeDeps({ readProfile: vi.fn(async () => frozenProfile) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles Proxy profile with throwing getter', async () => {
    const empty = makeMinProfile();
    const throwingProxy = new Proxy(empty, {
      get(target, prop) {
        if (prop === 'basics') throw new Error('proxy booby trap');
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
    }) as unknown as Profile;
    const deps = makeDeps({ readProfile: vi.fn(async () => throwingProxy) });
    const ctrl = new AutofillController(deps);
    // isEmptyProfile reads p.basics.firstName and throws
    await expect(ctrl.executeFill()).rejects.toBeDefined();
  });

  it('handles frozen adapter object', async () => {
    const frozen = Object.freeze(makeFakeAdapter());
    const deps = makeDeps({ loadAdapter: vi.fn(async () => frozen) });
    const ctrl = new AutofillController(deps);
    expect((await ctrl.executeFill()).ok).toBe(true);
  });

  it('handles stale adapter on SPA pushState (documented limitation)', async () => {
    const deps = makeDeps();
    const ctrl = new AutofillController(deps);
    await ctrl.executeFill();
    (deps.document as unknown as { location: { href: string } }).location.href = 'https://boards.greenhouse.io/example/jobs/2';
    await ctrl.executeFill();
    // ensureAdapter skips re-loading because this.adapter is set
    expect(deps.loadAdapter).toHaveBeenCalledTimes(1);
  });

  it('handles adapter.scanForm returning frozen FormModel with zero fields', async () => {
    const frozenFormModel: FormModel = Object.freeze({ url: '', title: '', scannedAt: '', fields: Object.freeze([]) });
    const adapter = makeFakeAdapter({ scanForm: () => frozenFormModel });
    const deps = makeDeps({ loadAdapter: vi.fn(async () => adapter) });
    const ctrl = new AutofillController(deps);
    const res = await ctrl.executeFill();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no-form');
  });
});
```

### Step 20 -- Write `scripts/rollback-phase-A8.sh`

Per D23, every phase ships a mechanical rollback script.

```bash
#!/bin/bash
# scripts/rollback-phase-A8.sh
# Rolls back Phase A8: content-script autofill + Workday wizard orchestration.
# Leaves A1-A7 intact.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Rolling back phase A8..."

# 1. Delete A8 source files
rm -rf src/content/autofill/
rm -f entrypoints/ats.content/main.ts

# 2. Restore A1 log-only shell at entrypoints/ats.content/index.ts
git checkout HEAD~1 -- entrypoints/ats.content/index.ts

# 3. Delete A8 test files
rm -f tests/content/adapter-loader.spec.ts
rm -f tests/content/profile-reader.spec.ts
rm -f tests/content/file-resolver.spec.ts
rm -f tests/content/autofill-controller.spec.ts
rm -f tests/content/autofill-controller.workday.spec.ts
rm -f tests/content/autofill-controller.adversarial.spec.ts
# If tests/content/ becomes empty, remove the directory
if [ -d tests/content ] && [ -z "$(ls -A tests/content)" ]; then
  rmdir tests/content
fi

# 4. Verify the rolled-back state compiles cleanly
pnpm typecheck
pnpm lint

echo "Phase A8 rolled back cleanly"
```

Make it executable: `chmod +x scripts/rollback-phase-A8.sh` before `git add`.

### Step 21 -- Run local build + test + coverage

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
```

Every command must exit 0. Per D24, coverage on `entrypoints/**` + `src/content/autofill/` must be >= 75% line / 70% branch. If ANY command fails, diagnose the source file, fix, and re-run. Do NOT adjust tests to paper over failures.

### Step 22 -- Run anti-drift grep gates (D14 + D15)

```bash
# D14 forbidden-token grep
grep -rnE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/content/autofill/ entrypoints/ats.content/ tests/content/ && { echo "V1 REMNANTS PRESENT"; exit 1; } || echo "OK: no v1 remnants"

grep -rnE '\bconsole\.(log|info|warn|error|debug)\b' src/content/autofill/ entrypoints/ats.content/ tests/content/ && { echo "CONSOLE.* PRESENT"; exit 1; } || echo "OK: no console.*"

# Em-dash gate (D15)
grep -rln $'\u2014' src/content/autofill/ entrypoints/ats.content/ tests/content/ && { echo "EM-DASH PRESENT"; exit 1; } || echo "OK: no em-dashes"

grep -ln $'\u2014' e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A8_content_script_autofill/plan.md && { echo "PLAN HAS EM-DASH"; exit 1; } || echo "OK: plan is clean"

# Old repo path check
grep -rnE '\bjob-assistant\b' src/content/autofill/ entrypoints/ats.content/ tests/content/ && { echo "OLD REPO PATH PRESENT"; exit 1; } || echo "OK: no old repo path"
```

All five must print `OK: ...`. Any violation blocks phase completion.

---

## 7. Acceptance criteria

### 7.1 Unit + type + lint

- [ ] `pnpm typecheck` exits 0 with zero errors.
- [ ] `pnpm lint` exits 0 with zero errors and zero warnings.
- [ ] `pnpm test` passes ALL tests in `tests/content/**`.
- [ ] `pnpm test:coverage` shows `entrypoints/` + `src/content/autofill/` at >= 75% line and >= 70% branch coverage (D24 floor).
- [ ] `pnpm build` produces `dist/content-scripts/ats.js` plus three adapter chunks.
- [ ] `dist/content-scripts/ats.js` bundle size: < 60 KB gzipped for the main chunk.
- [ ] All three vendor sub-entry contract tests pass (Step 14 contract section).
- [ ] Anti-drift grep gates (Step 22) all print `OK: ...`.
- [ ] No `console.*` in any A8 source file.
- [ ] No em-dashes in any A8 source or test file.
- [ ] No `HighlightRange`, `IKeywordHighlighter`, or `skill-taxonomy` in any A8 file.
- [ ] No old repo path `job-assistant` in any A8 file.
- [ ] `adapter.matchesUrl(url)` is used -- NOT `host.includes()`.
- [ ] `ProfileSchema.safeParse()` is used -- NOT hand-rolled type guards.
- [ ] `fillField(instruction: FillInstruction)` is called -- NOT `fillField(el, value, hints)`.
- [ ] `adapter.attachFile(instruction, file)` is called with pre-resolved File -- NOT `attachFile(instruction)` without file.
- [ ] `deps.resolveFile(handleId)` is called BEFORE `adapter.attachFile`.
- [ ] `plan.skipped.length` is used for skip count -- NOT an error-union counter.
- [ ] `createLogger('autofill-controller')` from `@/background/log` is used.
- [ ] All cross-module deps go through `AutofillControllerDeps`.

### 7.2 Load-unpacked smoke tests

1. Load extension unpacked in Chrome 120+.
2. Sign in via options page (A4 flow).
3. Upload JSON Resume in options page (A7 flow).
4. Open a real Greenhouse job application page.
5. Fire `FILL_REQUEST` from bg dev console.
6. **Greenhouse**: 8+ fields populated, `res.ok === true`, `filled >= 8`.
7. **Lever** (`jobs.lever.co/...`): 5+ fields filled, `res.ok === true`.
8. **Workday Step 1 (my-information)**: 5+ fields filled.
9. **Workday Step 2 (my-experience)**: step change logged, 8+ fields filled.
10. **Workday Step 3 (voluntary-disclosures) + consent granted**: EEO fields filled.
11. **Workday Step 3 + consent denied**: `filled === 0`, `failed === 0`.
12. **Workday Step 4 (review)**: `res.ok === false`, `res.reason === 'wizard-not-ready'`.
13. **Empty profile**: `res.ok === false`, `res.reason === 'no-profile'`.
14. **No form page**: `res.ok === false`, `res.reason === 'no-form'`.
15. **Malformed profile**: `res.ok === false`, `res.reason === 'no-profile'`, validation log visible.

---

## 8. Anti-drift grep gates (D14)

These MUST pass before the phase closes:

```bash
# 1. No v1 remnants
grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/content/autofill/ entrypoints/ats.content/ tests/content/ && exit 1

# 2. No console.* in source
grep -rE '\bconsole\.(log|info|warn|error|debug)\b' src/content/autofill/ entrypoints/ats.content/ && exit 1

# 3. No em-dashes (D15)
grep -rl $'\u2014' src/content/autofill/ entrypoints/ats.content/ tests/content/ && exit 1

# 4. No old repo path
grep -rE '\bjob-assistant\b' src/content/autofill/ entrypoints/ats.content/ tests/content/ && exit 1

# 5. No core leak (DOM globals in core)
grep -rE '\b(document|window|HTMLElement|chrome\.)\b' src/core/ --include='*.ts' && exit 1
```

---

## 9. Tests -- file paths + case names + D19 category mapping

| File | Test name | D19 Category |
|------|-----------|--------------|
| `tests/content/adapter-loader.spec.ts` | `resolveAtsKind -- happy path` (8 cases) | Happy path |
| | `resolveAtsKind -- security (suffix not substring)` (8 cases incl. host impersonation) | Security / D19-4 |
| | `resolveAtsKind -- non-matching URLs` (6 cases) | Edge case |
| | `loadAdapter -- happy path` (3 cases: greenhouse, lever, workday) | Happy path |
| | `loadAdapter -- failure paths` (4 cases: non-ATS, import reject, missing export, kind mismatch) | Error paths |
| | `vendor sub-entry contract (D14.3)` (4 cases: 3 vendor + type-level check) | Contract verification |
| `tests/content/profile-reader.spec.ts` | `readProfile -- happy path` (2 cases) | Happy path |
| | `readProfile -- failure paths` (7 cases: no key, undefined, null, malformed, storage reject, primitive, legacy v1) | Edge case / Error |
| | `isEmptyProfile` (7 cases incl. whitespace-only) | Edge case |
| `tests/content/file-resolver.spec.ts` | `resolveFile -- happy path` (2 cases) | Happy path |
| | `resolveFile -- failure paths` (8 cases: missing, malformed, wrong types, zero size, oversized, size mismatch, bad base64, storage reject, primitive) | Error paths |
| `tests/content/autofill-controller.spec.ts` | `8-field Greenhouse happy path` (3 cases) | Happy path |
| | `failure reasons` (6 cases: no-adapter, no-profile, empty profile, no-form, scan-failed, plan-failed) | Error paths |
| | `single-flight adapter loading` (2 cases: sequential + concurrent) | D19-5 Concurrent |
| | `file-attach instruction path` (3 cases: resolve+attach, null file, no attachFile) | Error paths |
| | `skipped accounting` (1 case) | Behavior |
| | `bootstrap -- Greenhouse` (3 cases) | Lifecycle |
| `tests/content/autofill-controller.workday.spec.ts` | `4-step traversal consent GRANTED` (4 cases) | Happy path |
| | `4-step traversal consent DENIED` (1 case) | Behavior |
| | `edge cases` (5 cases: review, unknown, step regression, scanStep throw, fillStep throw) | Error paths |
| | `teardown` (3 cases: cleanup called, state cleared, cleanup throwing) | Lifecycle |
| `tests/content/autofill-controller.adversarial.spec.ts` | Category 1: null/undefined/NaN/Infinity (5 cases) | D19-1 |
| | Category 2: empty + max-size collections (3 cases) | D19-2 |
| | Category 3: unicode edge cases (5 cases: RTL, combining, emoji, null byte, ZWJ) | D19-3 |
| | Category 4: injection (4 cases: XSS, SQL, path traversal, circular selector) | D19-4 |
| | Category 5: concurrent re-entry (3 cases: single-flight, teardown race, watcher leak) | D19-5 |
| | Category 6: adversarial state (5 cases: frozen profile, throwing proxy, frozen adapter, stale SPA, frozen FormModel) | D19-6 |

**Mandatory test cases from requirements -- mapping:**

| Required case | Test file | Test name |
|---------------|-----------|-----------|
| Concurrent fill re-entry (idempotent via loadingPromise) | adversarial | Category 5: single-flights concurrent |
| Adapter load failure (returns null) | adapter-loader | loadAdapter returns null if dynamicImport rejects |
| Profile missing (readProfile returns null) | controller | returns no-profile when readProfile returns null |
| Form not detected (scanForm returns 0 fields) | controller | returns no-form when scanForm returns empty fields |
| Scan throws (caught, returns scan-failed) | controller | returns scan-failed when scanForm throws |
| Plan-builder throws (caught, returns plan-failed) | controller | returns plan-failed when buildPlan throws |
| Workday wizard: 4-step traversal EEO consent GRANTED | workday | 4-step traversal consent GRANTED (4 cases) |
| Workday wizard: 4-step traversal EEO consent DENIED | workday | consent DENIED on voluntary-disclosures |
| Workday Review step returns wizard-not-ready | workday | returns wizard-not-ready on review step |
| Workday step regression (back to My Information) | workday | handles wizard step regression |
| Stale adapter on SPA pushState | adversarial | Category 6: stale adapter on SPA pushState |
| 8-field Greenhouse fill happy path | controller | 8-field Greenhouse happy path |
| 5-field Lever fill happy path | adapter-loader | loads lever adapter (+ controller tests apply) |
| Malformed Profile shape rejected by safeParse | profile-reader | returns null when stored record fails validation |
| File resolver returns null (file-attach-failed) | controller | returns file-attach-failed when resolveFile returns null |
| chrome.tabs.sendMessage throws | messaging | controller.executeFill unexpectedly threw (catch path) |
| FillInstruction with circular selector (reject) | adversarial | Category 4: circular/malformed selector |
| Host impersonation: notgreenhouse.io.evil.com rejected | adapter-loader | rejects notgreenhouse.io.evil.com |
| FILL_RESULT_BROADCAST fires on failure paths | N/A (resolved via FillRequestResponse return on all paths; see design section 5.11) | All failure reason tests verify typed response |
| Skipped instructions counted separately from errors | controller | skipped accounting: plan.skipped.length |
| Contract: greenhouse adapter.kind === 'greenhouse' | adapter-loader | vendor sub-entry contract: greenhouse |
| Contract: lever adapter.kind === 'lever' | adapter-loader | vendor sub-entry contract: lever |
| Contract: workday adapter.kind === 'workday' | adapter-loader | vendor sub-entry contract: workday |
| Type-level: AtsAdapter compile check | adapter-loader | type-level structural members |

---

## 10. Rollback script

Primary: `scripts/rollback-phase-A8.sh` (Step 20). Mechanically reverts all A8 files + restores A1's `index.ts`.

Verification after rollback:

```bash
pnpm typecheck   # must exit 0
pnpm lint        # must exit 0
pnpm test        # must pass (A1-A7 tests unaffected)
pnpm build       # must produce A1's log-only ats.js
```

Manual fallback if script fails:

```bash
git restore entrypoints/ats.content/index.ts
rm -rf src/content/autofill/
rm -f entrypoints/ats.content/main.ts
rm -f tests/content/adapter-loader.spec.ts tests/content/profile-reader.spec.ts tests/content/file-resolver.spec.ts tests/content/autofill-controller.spec.ts tests/content/autofill-controller.workday.spec.ts tests/content/autofill-controller.adversarial.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

---

## 11. Out of scope

- Keyword highlight apply/clear (A9)
- Page intent detection for Greenhouse + Lever (A9)
- Form scanning for non-ATS sites (never)
- Auto-triggering fill on page load (never)
- Auto-submit after fill (never)
- Retry loop for value-rejected-by-page errors (v1.1)
- Per-field SDK call for free-text answers (not in v1)
- Multi-tenant Workday vanity domain verification (B9 ships 3-tenant fixture set per D25)
- Resume PDF upload-to-storage flow (A7 owns writes; A8 only reads)
- `FILL_RESULT_BROADCAST` as a ProtocolMap key (resolved via FillRequestResponse return values per section 5.11 -- A10's promise resolution IS the completion signal)
- Auto-advance Workday "Save and Continue" (NEVER -- user clicks manually per D6)

---

## 12. Compliance gates

- [ ] `pnpm typecheck` -- zero errors.
- [ ] `pnpm lint` -- zero errors, zero warnings.
- [ ] `pnpm test` -- all `tests/content/**` pass + no A1-A7 regressions.
- [ ] `pnpm test:coverage` -- content coverage >= 75% line / 70% branch per D24.
- [ ] `pnpm build` -- clean build, main content-script chunk < 60 KB gzipped, three adapter chunks.
- [ ] `scripts/check-no-em-dash.sh` -- exits 0 (D15).
- [ ] `scripts/check-no-console.sh` -- exits 0 (D11 + D14).
- [ ] `scripts/check-core-leak.sh` -- exits 0.
- [ ] `scripts/check-exports-resolution.mjs` -- all vendor sub-entries resolve + adapter.kind matches (D14.3).
- [ ] `scripts/check-blueprint-contracts.mjs` -- A8_BLUEPRINT.publicExports matches actual exports; forbiddenImports absent; coverage meets threshold (D22).
- [ ] Load unpacked in Chrome 120+ and verify all 15 smoke-test scenarios in section 7.2.
- [ ] `scripts/rollback-phase-A8.sh` runs cleanly on a throwaway branch (D23).
- [ ] Commit message: `feat(a8): content script autofill + Workday wizard orchestration`
- [ ] No files in `e:/llmconveyors.com` modified.

---

## 13. Executor notes (anti-patterns to avoid)

1. **NEVER** import `GreenhouseAdapter` / `LeverAdapter` / `WorkdayAdapter` -- these named exports do NOT exist in v2.1. Every vendor ships `export const adapter: AtsAdapter`. Read `mod.adapter`.

2. **NEVER** call `adapter.fillField(el, value, hints)` with three args. The D1 contract is `fillField(instruction: FillInstruction)` -- single arg. The adapter resolves the element internally from `instruction.selector`.

3. **NEVER** call `adapter.attachFile(instruction)` without the File. Per D1, the signature is `attachFile(instruction, file)`. A8 pre-resolves the File via `deps.resolveFile(instruction.value.handleId)` BEFORE calling.

4. **NEVER** define a local `ReadableProfile` type with top-level `firstName`/`email`/`updatedAt`. Import `Profile` from `ats-autofill-engine/profile`. Use `ProfileSchema.safeParse()`.

5. **NEVER** use `profile as unknown as Parameters<typeof buildPlan>[1]`. With correct types, `buildPlan(formModel, profile)` typechecks without cast.

6. **NEVER** use `host.includes('greenhouse.io')` for host matching. Use suffix match: `host === 'greenhouse.io' || host.endsWith('.greenhouse.io')`.

7. **NEVER** use `console.log`, `console.error`, `console.warn`, or `console.debug`. Use `createLogger(scope)` from `@/background/log` per D11.

8. **NEVER** use em-dashes (U+2014) anywhere in source, test, or plan files. Use ASCII dashes.

9. **NEVER** edit `src/background/messaging/protocol.ts` or `handlers.ts`. A5 owns the ProtocolMap per D2.

10. **NEVER** add `FILL_RESULT_BROADCAST` or any other key to ProtocolMap. A8 returns fill results via the `FillRequestResponse` type from the `FILL_REQUEST` handler.

11. **NEVER** reference `HighlightRange`, `IKeywordHighlighter`, or `skill-taxonomy`. These are v1 remnants that do not exist in v2.

12. **NEVER** auto-advance Workday wizard steps. The user clicks "Save and Continue" manually. A8 only fills the current step.

13. **NEVER** import from module-scoped singletons across boundaries. Use the `AutofillControllerDeps` DI object per D20.

14. **NEVER** use `any` in test code. Use typed mocks via `Mock<Parameters, Return>` or `vi.fn<...>()`.

15. **NEVER** adjust test expectations to make failing tests pass. Fix the source code, not the test.

16. **NEVER** edit files outside `e:/llmconveyors-chrome-extension/`.

17. **NEVER** skip the anti-drift grep gates (Step 22). They are mandatory per D14.

18. **NEVER** skip the rollback script verification. It must run cleanly per D23.

19. **NEVER** put `console.*` suppression comments (`eslint-disable no-console`) in source files. There is nothing to suppress because A8 uses `createLogger` exclusively.

20. **NEVER** use `window.location.href` directly in the controller. Use `this.deps.document.location.href` for testability per D20.

21. **NEVER** increment `skipped` in the fill-instruction loop. Skipped count comes from `plan.skipped.length` per keystone section 2.5.

22. **NEVER** report skipped instructions as `error: 'unknown-error'`. Skipped instructions use the `{ kind: 'skipped', reason: SkipReason }` discriminant in `plan.skipped[]`, counted separately.

23. **NEVER** use `setAdapterKind` or `getAdapterKind` -- these are dead code from v1 and are deleted.

24. Do NOT consult neighbor phase plans during execution. Everything A8 needs is in THIS plan + keystone + decisions.

25. Commit message template:
```
feat(a8): content script autofill + Workday wizard orchestration
```

---

## 14. Design rationale (reference)

### Why the content script owns orchestration (not the background)

Content scripts are the ONLY context with live DOM access. Every alternative (serialize DOM to background, build fill plan there, stream instructions back) forces structured-clone round-trips per field, loses HTMLElement references, and breaks React's native-setter event dispatch. The background ONLY mediates the trigger: popup sends `FILL_REQUEST` -> A5 bg forwards via `chrome.tabs.sendMessage` -> content-side handler.

### Why dynamic import of adapters (not static import of all three)

Static import of all three adapters bloats the content-script chunk from ~42 KB to ~118 KB+ gzipped. WXT/Vite supports dynamic `import()` with tree-shaking on bare-specifier sub-entries. A single URL check determines which adapter to pull.

### Why the content script reads profile directly from `chrome.storage.local`

Content scripts can read `chrome.storage.local` directly in <2 ms (investigation 54 invariant 4). A bg round-trip through `@webext-core/messaging` is 8-25 ms plus service-worker wake latency. A8 re-reads on every `FILL_REQUEST` so staleness is not a concern.

### Why per-tab state is module-scoped closure

A content script module is re-instantiated on every hard navigation. SPA pushState does NOT re-instantiate. The controller holds state in private instance fields, instantiated once by `main.ts`. Tests instantiate fresh controllers.

### Why `world: 'ISOLATED'` and not `'MAIN'`

ISOLATED gives access to `chrome.*` APIs for profile + resume-blob reads. DOM manipulation via native-setter value dispatch works equally well from ISOLATED.

### Why `runAt: 'document_idle'`

`'document_end'` fires before React hydration. `'document_idle'` fires after quiescence, giving the best chance of a first scan finding the form. Workday's multi-step wizard lazy-mounts pages after user interaction, so the step watcher handles timing.

### Why Workday wizard orchestration lives in A8 (not B9)

Per D6: B9 ships stateless primitives (`detectCurrentStep`, `watchForStepChange`, `scanStep`, `fillStep`). A8 owns the loop: mounts watcher at bootstrap, holds `currentStep`, re-scans on step change, dispatches `fillStep` when user clicks Fill, broadcasts `INTENT_DETECTED`. This keeps the engine free of Chrome-specific plumbing.

### Why `review` and `unknown` wizard steps return `wizard-not-ready`

The `review` step is read-only (no editable fields). The `unknown` step means `detectCurrentStep` returned unknown because the DOM did not match known markers. Both map to `{ ok: false, reason: 'wizard-not-ready' }` per keystone section 1.2.

### Why file-attachment resolution happens in A8 (not B4's buildPlan)

`buildPlan` is in `src/core/**` which MUST NEVER import `chrome.*` per the hexagonal invariant. The controller pre-resolves File objects via `deps.resolveFile` and passes them to `adapter.attachFile(instruction, file)`.

### Why `FILL_RESULT_BROADCAST` is not in ProtocolMap

Per D2, A5 owns the 19-key ProtocolMap. A8 cannot add a 20th key. The resolution: `FillRequestResponse` is returned on every code path (success AND failure), so A10's promise resolution IS the completion signal. For Workday step changes, A8 broadcasts `INTENT_DETECTED` via the existing key. No broadcast needed for fill completion.

### Why `ensureAdapter` uses a single-flight `loadingPromise`

Review G1: two concurrent `executeFill` calls both pass the `if (this.adapter)` guard and both invoke `deps.loadAdapter`. Fix: hold an in-flight promise; second caller awaits it instead of triggering a second import.

### Why the host matcher uses suffix match not substring

Review G5: `host.includes('greenhouse.io')` matches `notgreenhouse.io.evil.com`. Suffix match: `host === 'greenhouse.io' || host.endsWith('.greenhouse.io')`.

---

## 15. Cross-reference index

### Imports table (keystone section 10 row A8)

```
A8 imports from                     | Specific symbols
------------------------------------|------------------
ats-autofill-engine                 | Profile, ProfileSchema, FillInstruction, FillResult, FillPlan, FillPlanResult, FormModel, AtsAdapter, AtsKind, WorkdayWizardStep, SkipReason, AbortReason, TabId, PlanId, ResumeHandleId, buildPlan
ats-autofill-engine/profile         | Profile, ProfileSchema, createEmptyProfile
ats-autofill-engine/greenhouse      | adapter (AtsAdapter with kind='greenhouse')
ats-autofill-engine/lever           | adapter (AtsAdapter with kind='lever')
ats-autofill-engine/workday         | adapter (AtsAdapter with kind='workday')
@/background/messaging/protocol     | ProtocolMap, FillRequestResponse, DetectedIntentPayload, sendMessage, onMessage
@/background/log                    | createLogger, Logger
wxt/browser                         | browser (for chrome.storage.local.get)
wxt/client                          | ContentScriptContext
```

Any import outside this table is a contract violation.

---

**End of phase A8 v2.1.1 plan.**
