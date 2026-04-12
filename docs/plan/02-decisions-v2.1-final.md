# Plan 100 v2.1 — Final Decision Memo (post-review remediation, LOCKED)

**Date**: 2026-04-11
**Supersedes**: `01-architect-decisions-post-review.md`
**Status**: LOCKED, all corrective plans execute against this document as single source of truth
**Authority**: architect decisions D1-D4 from Ebenezer; derivative decisions D5-D25 chosen for scalability + maintainability
**Companion**: `03-keystone-contracts.md` contains the verbatim type/interface definitions this memo references

---

## 1. Architect decisions (D1-D4) — LOCKED by Ebenezer on 2026-04-11

### D1 — Canonical `AtsAdapter` export shape = option (a)

```ts
// src/ats/<vendor>/index.ts — every vendor adapter ships this exact shape
export const adapter: AtsAdapter = Object.freeze(createXAdapter());
```

where `createXAdapter()` is a factory function that closes over vendor-local state (Lever variant, Workday wizard step, etc.) and returns:

```ts
interface AtsAdapter {
  readonly kind: AtsKind;                                              // 'greenhouse' | 'lever' | 'workday'
  readonly matchesUrl: (url: string) => boolean;
  readonly scanForm: (root: Document) => FormModel;                    // sync, returns immutable FormModel
  readonly fillField: (instruction: FillInstruction) => FillResult;    // sync, element resolved internally via instruction.selector
  readonly attachFile?: (instruction: FillInstruction, file: File) => Promise<FillResult>;
  readonly extractJob?: (doc: Document) => JobPostingData | null;
  readonly detectCurrentStep?: (doc: Document) => WorkdayWizardStep | null;  // Workday only
  readonly watchForStepChange?: (doc: Document, onChange: (step: WorkdayWizardStep) => void) => () => void;  // Workday only
}
```

**Propagation scope**: A8, B7, B8, B9. Full contract lives in `03-keystone-contracts.md §2`.

### D2 — A5 is the single owner of `ProtocolMap`

A5 ships the complete 13-key protocol plus derivative keys (`GENERATION_*`, `DETECTED_JOB_BROADCAST`, `CREDITS_GET`, `HIGHLIGHT_STATUS`) before any downstream phase runs. No other phase edits `src/background/messaging/protocol.ts`. Downstream phases consume A5's exports only; if A5 is missing a key, that is an A5 bug and blocks the orchestrator until A5 is amended.

**Full ProtocolMap + value types** live in `03-keystone-contracts.md §1`.

### D3 — Profile storage shape: A7 writes, A8 adapts

A7 writes B2's full `Profile` (nested `basics.*` + `profileVersion: '1.0'`) to `chrome.storage.local['llmc.profile.v1']`. A8's `profile-reader.ts` is rewritten to consume that exact shape via `ProfileSchema.safeParse()` imported from `ats-autofill-engine` root barrel. A8's old top-level-field ReadableProfile is deleted entirely.

### D4 — Repo identity

- **Absolute working dir**: `e:/llmconveyors-chrome-extension`
- **GitHub remote**: `ebenezer-isaac/llmconveyors-chrome-extension`
- **package.json name**: `llmconveyors-chrome-extension`
- **Manifest display name**: `LLM Conveyors Job Assistant`
- **LICENSE copyright holder**: `Ebenezer Isaac`, year `2026`
- **Console/log prefix** (if any): `llmc-ext`

Transfer to `zovo-labs` org happens post-contract signing. Silent default holds: do NOT volunteer IP structure in code, comments, README, or commit messages. The catch-up email to Michael on 2026-04-11 references `ebenezer-isaac/llmconveyors-chrome-extension` — any deviation from this path breaks the email.

---

## 2. Derivative decisions (D5-D25) — chosen for scalability + maintainability

Scalability bias means: accept more code now in exchange for type safety, runtime validation, testability, and drift prevention. Accept longer implementation paths when they prevent future rework. Accept more files when they enforce clearer boundaries. Reject shortcuts that create hidden coupling.

### D5 — B2 addendum scope: inline into B2 plan file

B2 gains new types (`JobPostingData`, `PageIntent`, `FillPlanResult`, `AtsAdapter`, `AtsKind`, `SkipReason`, `AttachFailureReason`, `FormModel.sourceATS` optional, ATS-extension `FieldType` keys) as additions to the existing `core/types` files. No separate B2.1 phase. B2 plan file is rewritten as a single authoritative spec.

### D6 — Workday wizard orchestration: A8 owns the loop, B9 exposes primitives

B9's `WorkdayAdapter` exposes **stateless** primitives: `detectCurrentStep`, `watchForStepChange`, `scanStep(step)`, `fillStep(step, profile)`. A8's content-script controller mounts `watchForStepChange` on boot, holds `currentStep` in closure, re-runs scan on step change, and dispatches `fillStep` when the user clicks Fill. This keeps the engine free of Chrome-specific plumbing. The wizard loop adds ~180 LoC to A8's controller.

A11 E2E expands from 1 step to the full 4-step traversal with EEO consent gate verification.

### D7 — `FillPlanResult` type (new B2 type)

```ts
interface FillPlanResult {
  readonly planId: string;
  readonly executedAt: string;         // ISO-8601
  readonly filled: ReadonlyArray<FillResult & { ok: true }>;
  readonly skipped: ReadonlyArray<{ instruction: FillInstruction; reason: SkipReason }>;
  readonly failed: ReadonlyArray<FillResult & { ok: false }>;
  readonly aborted: boolean;
  readonly abortReason?: AbortReason;
}

type SkipReason =
  | 'profile-field-empty'
  | 'consent-not-granted'
  | 'consent-denied-field-type'   // EEO/DOB path
  | 'htmlTypeGuard-rejected'
  | 'value-out-of-allowed-options'
  | 'skipped-by-user'
  | 'out-of-scope-for-v1';

type AbortReason =
  | 'profile-missing'
  | 'form-not-detected'
  | 'adapter-load-failed'
  | 'scan-threw'
  | 'plan-builder-threw'
  | 'wizard-not-ready';
```

Defined in `core/types/fill-plan-result.ts`, re-exported from `core/types/index.ts`.

### D8 — `SkipReason` distinct from `FillError`

Two orthogonal concepts. `SkipReason` = reasons NOT to fill (decided before touching DOM). `FillError` = reasons fill FAILED (decided after touching DOM). B5 owns `FillError` (existing 6 values), B2 owns `SkipReason` (new type D7). No union between them.

### D9 — `AtsKind` canonical type

```ts
type AtsKind = 'greenhouse' | 'lever' | 'workday';
```

Single source of truth in `core/types/ats-kind.ts` (renamed from B2's existing `AtsVendor` for consistency with file naming). Every consumer imports this type. Adding a new vendor in v1.1 means updating one file.

### D10 — React options-page stale-state fix: force remount via composite key

Each section receives a composite `key` prop: `<BasicsSection key={`${profile.profileVersion}-${profile.updatedAtMs}`} ... />`. On profile reload, the key changes and React fully remounts the section with fresh state. Simpler and more reliable than `useEffect` resync for a POC with 5 sections. Each section's local buffer is explicitly controlled-from-props on mount only.

A7 adds `updatedAtMs: number` to the persisted record as a top-level sibling of `profileVersion` (Zod passthrough permitted for this one field, documented as "storage metadata not part of the semantic profile").

### D11 — Structured logger for the extension (no `console.*`)

A5 ships `src/background/log.ts`:

```ts
interface LogContext { readonly tabId?: number; readonly requestId?: string; readonly [k: string]: unknown }
interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}
export const log: Logger;                              // singleton for module-level use
export function createLogger(scope: string): Logger;    // scoped factory
```

Under the hood routes to `globalThis.console.*` with prefix `[llmc-ext:${scope}]` and a JSON-stringified context object. Debug is gated on `import.meta.env.MODE !== 'production'`.

Every extension phase (A1 scaffold onward) uses `createLogger('<scope>')` instead of `console.*`. Enforced via CI grep: `grep -rE '\bconsole\.(log|info|warn|error|debug)' entrypoints/ src/background/ src/content/` returns zero matches (tests exempted via `!tests/**/*` exclusion).

### D12 — npm publish: dry-run + provenance + 2FA + `.npmignore` verification

B9 publish step (and B1 reservation publish) require:

```bash
# 1. Verify tarball contents BEFORE publish
pnpm pack --dry-run > /tmp/pack.log
grep -q "tests/"        /tmp/pack.log && { echo "tests leaked"; exit 1; }
grep -q "investigation/" /tmp/pack.log && { echo "investigation leaked"; exit 1; }
grep -q ".orig"         /tmp/pack.log && { echo ".orig leaked"; exit 1; }
grep -q "LICENSES/MPL-2.0.txt" /tmp/pack.log || { echo "MPL license missing"; exit 1; }

# 2. Dry-run publish to verify registry accepts
pnpm publish --dry-run --access public --tag alpha

# 3. Real publish with provenance (requires GH Actions workflow identity)
pnpm publish --access public --tag alpha --provenance

# 4. Verify on registry
sleep 5 && npm view "ats-autofill-engine@${VERSION}" version
```

2FA OTP is a manual step; documented as a pre-flight check in the plan's acceptance criteria.

### D13 — npm version trajectory

- B1 publishes `0.1.0-alpha.1` directly (no `alpha.0` placeholder). B1 reserves the name by publishing a scaffold with only the build output stub + license files.
- B9 bumps to `0.1.0-alpha.2` as the "three adapters added" release.
- Decision memo §6.3 bundle-size gates apply to `alpha.2`, not `alpha.1`.
- v1.0.0 happens post-Zovo-signing with real adapters + stable API surface.

### D14 — Anti-drift enforcement mechanisms (MANDATORY in every corrected plan)

Every phase acceptance criterion MUST include these five gates:

1. **Forbidden token grep** (phase-specific forbidden list):
   ```bash
   # Engine core phases (B2, B3, B4):
   grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core/ && exit 1
   # All engine phases:
   grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/ && exit 1
   # All extension phases:
   grep -rE '\b(console\.(log|info|warn|error|debug))' entrypoints/ src/background/ src/content/ && exit 1
   # All plan files + all source files:
   grep -rE '—' . && exit 1   # em-dash rule per D15
   ```

2. **Type-level protocol contract assertion** (A5 + every consumer of A5):
   ```ts
   // tests/background/messaging/protocol-contract.type-test.ts
   import type { ProtocolMap } from '@/background/messaging/protocol';
   type RequiredKeys =
     | 'AUTH_SIGN_IN' | 'AUTH_SIGN_OUT' | 'AUTH_STATUS' | 'AUTH_STATE_CHANGED'
     | 'PROFILE_GET' | 'PROFILE_UPDATE' | 'PROFILE_UPLOAD_JSON_RESUME'
     | 'KEYWORDS_EXTRACT' | 'INTENT_DETECTED' | 'INTENT_GET'
     | 'FILL_REQUEST' | 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR'
     | 'GENERATION_START' | 'GENERATION_UPDATE' | 'GENERATION_CANCEL'
     | 'DETECTED_JOB_BROADCAST' | 'CREDITS_GET' | 'HIGHLIGHT_STATUS';
   type _Assertion = RequiredKeys extends keyof ProtocolMap ? true : never;
   const _check: _Assertion = true;   // compile error if A5 drops a key
   ```

3. **Exports-map resolution test** (B1 + every engine consumer):
   ```bash
   # scripts/verify-exports-map.mjs runs in CI
   node -e "import('ats-autofill-engine').then(m => console.log(Object.keys(m)))"
   node -e "import('ats-autofill-engine/profile').then(m => console.log(Object.keys(m)))"
   node -e "import('ats-autofill-engine/greenhouse').then(m => console.log('has adapter:', 'adapter' in m))"
   node -e "import('ats-autofill-engine/lever').then(m => console.log('has adapter:', 'adapter' in m))"
   node -e "import('ats-autofill-engine/workday').then(m => console.log('has adapter:', 'adapter' in m))"
   node -e "import('ats-autofill-engine/dom').then(m => console.log('has applyHighlights:', 'applyHighlights' in m))"
   ```

4. **Cross-phase contract snapshot** (each phase writes a `.contract.json` fingerprint):
   ```
   src/<phase-area>/.contract.json = {
     exports: ['scanForm', 'fillField', ...],
     typeSignatures: { scanForm: '(root: Document) => FormModel', ... },
     version: '2.1'
   }
   ```
   CI runs `scripts/check-contract-drift.mjs` which parses every consumer's imports and verifies each symbol resolves against the producer's `.contract.json`. Fail on drift.

5. **Zod schema round-trip test** (every Zod-validated boundary):
   ```ts
   // Fuzz: generate 100 random valid profiles, assert Schema.parse(obj) === obj (mod ref equality on arrays)
   // Invert: generate 100 invalid profiles, assert Schema.safeParse(obj).success === false
   ```

### D15 — Em-dash rule enforced mechanically

Added to CI: `grep -rl '—' --include='*.ts' --include='*.md' --include='*.json' --include='*.tsx' src/ entrypoints/ tests/ temp/impl/100-chrome-extension-mvp/` returns zero. Plan files also scrubbed. All em-dashes replaced with ASCII `-` or `--`.

Pre-commit hook installs from B1 scaffold, rejecting staged files containing U+2014.

### D16 — Branded types at every ID boundary

To prevent "tabId vs generationId vs sessionId" mix-ups at compile time, B2 defines branded primitives:

```ts
// core/types/brands.ts
type Brand<T, B> = T & { readonly __brand: B };
export type TabId = Brand<number, 'TabId'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type PlanId = Brand<string, 'PlanId'>;

export const TabId = (n: number): TabId => n as TabId;
export const GenerationId = (s: string): GenerationId => s as GenerationId;
// etc.
```

Every `FillInstruction.planId`, A5's `INTENT_GET({ tabId })`, A11's `GENERATION_UPDATE({ generationId })` uses the branded type. Catches "passed wrong id to wrong function" at compile time.

### D17 — Factory pattern for stateful adapters

B7 is stateless (Greenhouse has no per-form variant state), so `createGreenhouseAdapter()` returns `Object.freeze({ ... })` with all methods pure.

B8 closes over Lever form variant:
```ts
export function createLeverAdapter(): AtsAdapter {
  let lastVariant: LeverFormVariant = 'unknown';
  let lastFormRoot: WeakRef<Element> | null = null;
  return Object.freeze({
    kind: 'lever',
    matchesUrl,
    scanForm(doc) { const r = scanLeverForm(doc); lastVariant = r.variant; lastFormRoot = new WeakRef(r.formRoot); return r.formModel; },
    fillField(instruction) { return fillLeverField(instruction, { variant: lastVariant, formRoot: lastFormRoot?.deref() }); },
    attachFile: async (instruction, file) => attachLeverResume(instruction, file, { formRoot: lastFormRoot?.deref() }),
  });
}
export const adapter: AtsAdapter = createLeverAdapter();
```

B9 closes over wizard step pointer. `detectCurrentStep` reads from DOM each call (stateless observation), but `scanStep`/`fillStep` are step-parameterized. The "loop" lives in A8; B9 is stateless-observation + per-step operations.

### D18 — Contract test matrix (new test category)

Every vendor phase ships `tests/ats/<vendor>/adapter-contract.spec.ts`:

```ts
import { adapter } from '@/ats/<vendor>';
import type { AtsAdapter } from '@/core/types';

// Type-level assertion: the exported object satisfies AtsAdapter structurally
const _typeCheck: AtsAdapter = adapter;

describe('<vendor> adapter contract', () => {
  test('kind is locked', () => expect(adapter.kind).toBe('<vendor>'));
  test('matchesUrl is a function', () => expect(typeof adapter.matchesUrl).toBe('function'));
  test('scanForm returns a FormModel shape', () => {
    const m = adapter.scanForm(document);
    expect(m).toMatchObject({ url: expect.any(String), title: expect.any(String), scannedAt: expect.any(String), fields: expect.any(Array) });
  });
  test('fillField returns discriminated union', () => {
    const r = adapter.fillField(makeInstruction());
    expect(r).toHaveProperty('ok');
    if (r.ok) expect(r).toHaveProperty('selector');
    else { expect(r).toHaveProperty('selector'); expect(r).toHaveProperty('error'); }
  });
  test('frozen adapter rejects mutation', () => {
    expect(() => { (adapter as any).kind = 'other'; }).toThrow();
  });
});
```

Identical shape across B7/B8/B9 (with vendor-specific `makeInstruction`).

### D19 — Adversarial test categories (MANDATORY per plan)

Every phase test plan lists at least these 6 adversarial categories:

1. **Null/undefined/NaN/Infinity at every parameter**
2. **Empty collections + max-size collections** (1000+ items)
3. **Unicode edge cases**: RTL, combining chars, null bytes, surrogate pairs, normalization forms
4. **Injection**: script tags in string values, SQL-style in query params, path traversal in file names
5. **Concurrent re-entry**: fire the same operation 2x in parallel, verify serialization or idempotency
6. **Adversarial state**: frozen objects, proxies with throwing getters, circular references

Reviewers reject any phase test plan that lacks these categories.

### D20 — DI for every cross-module dependency in the extension

No module-level singleton imports across module boundaries in the extension. A8's controller takes a `Deps` object at construction:

```ts
interface AutofillControllerDeps {
  readonly loadAdapter: (url: string) => Promise<AtsAdapter | null>;
  readonly readProfile: () => Promise<Profile | null>;
  readonly resolveFile: (handleId: ResumeHandleId) => Promise<File | null>;
  readonly broadcast: <K extends keyof ProtocolMap>(key: K, data: Parameters<ProtocolMap[K]>[0]) => void;
  readonly logger: Logger;
  readonly now: () => number;   // testable time
  readonly document: Document;  // testable DOM
}
```

Every A-phase that would otherwise reach for a global (chrome.*, document, Date.now, fetch) goes through a Deps object. Tests pass fakes; production passes the real implementations.

### D21 — Zod at every runtime boundary

Every message handler in A5's background validates its input payload with a Zod schema before running business logic. Every storage read (`chrome.storage.local.get`) validates with Zod before returning. Every `fetch` response is parsed through a Zod schema. Zero trust in shape.

Schemas live alongside types: `core/types/fill-instruction.schema.ts` next to `core/types/fill-instruction.ts`. A5 imports both for its ProtocolMap handler validation.

### D22 — Blueprint drift watchdog as CI gate

Every phase creates/updates a `blueprint.contract.ts` file under its area:

```ts
// src/ats/greenhouse/blueprint.contract.ts
export const GREENHOUSE_BLUEPRINT = {
  phase: 'B7',
  version: '2.1',
  publicExports: ['adapter'] as const,
  adapterShape: {
    kind: 'greenhouse',
    members: ['matchesUrl', 'scanForm', 'fillField', 'attachFile', 'extractJob'],
  },
  forbiddenImports: ['src/ats/lever/*', 'src/ats/workday/*', 'src/adapters/chrome/*'],
  requiredCoverage: 85,
} as const;
```

CI script reads every blueprint.contract.ts and verifies:
- Declared publicExports match actual exports
- Forbidden imports are absent
- Coverage threshold is met
- Adapter shape matches the AtsAdapter type at runtime (import, check instanceof/keys)

Fails the build on any mismatch. Zero tolerance.

### D23 — Every phase plan ships a rollback script (not prose)

Current plans have rollback-as-bullet-list. v2.1 requires `scripts/rollback-phase-<code>.sh` (or `.ps1` for windows-first phases) that mechanically reverts the phase:

```bash
#!/bin/bash
# scripts/rollback-phase-B7.sh
set -euo pipefail
rm -rf src/ats/greenhouse/
git checkout HEAD -- src/ats/index.ts
git checkout HEAD -- package.json
git checkout HEAD -- tsup.config.ts
pnpm typecheck   # must pass in rolled-back state
echo "Phase B7 rolled back cleanly"
```

Rollback scripts are themselves committed and tested in CI on a throwaway branch weekly.

### D24 — Test coverage floors (CI-enforced)

- Engine core (`src/core/**`): 90% line, 85% branch
- Engine adapters (`src/adapters/**`, `src/ats/**`): 85% line, 80% branch
- Extension background (`src/background/**`): 80% line, 75% branch
- Extension content (`entrypoints/**`): 75% line, 70% branch
- Extension UI (options, popup, sidepanel): 70% line (visual coverage is harder; complemented by Playwright smoke)

Vitest `coverage.thresholds` enforced in `vitest.config.ts`. CI fails if any threshold drops.

### D25 — Multi-tenant Workday fixture requirement

B9 must capture HTML fixtures from 3 distinct Workday tenants (memo §5 R2 requirement honored):
- `https://workday.wd5.myworkdayjobs.com/External` (generic Workday demo tenant)
- `https://deloitte.wd5.myworkdayjobs.com/*`
- `https://accenture.wd103.myworkdayjobs.com/*`

Each tenant captured at all 4 wizard steps = 12 fixture files. Test suite runs per-tenant to catch tenant-specific DOM variations. Adapter must pass on all 3 tenants.

---

## 3. Per-phase corrective scope summary

Each phase below gets a full plan rewrite that applies the relevant decisions. A2 and A3 already graded A; they receive a LIGHT touch for em-dash cleanup + D14 anti-drift gates only.

| Phase | Current grade | Corrective type | Decisions applied |
|---|---|---|---|
| A1 | D | Full rewrite | D4, D11, D14, D15, D23 + ESLint/tsconfig fixes |
| A2 | A | Light polish | D14, D15 |
| A3 | A | Light polish | D14, D15 |
| A4 | A- | Targeted fixes | D14, D15 + 6 reviewer findings |
| A5 | C- | Full rewrite | D2, D11, D14, D15, D16, D20, D21, D22 |
| A6 | C+ | Full rewrite | D2 consumer, D4, D14, D15, D20 + 6 reviewer findings |
| A7 | C+ | Full rewrite | D3 writer, D10, D14, D15, D20 + phone/DOB/stale-state fixes |
| A8 | C- | Full rewrite | D1 consumer, D3 reader, D6 wizard loop, D14, D15, D20 + substring host fix + FillResult skip category |
| A9 | F | Full rewrite | D2 consumer, D14, D15, D20 + delete HighlightRange fiction |
| A10 | B- | Full rewrite | D2 consumer, D14, D15, D20 + D9 tooltip fix + contract rewrites |
| A11 | C+ | Full rewrite | D2 consumer, D6 E2E wizard, D14, D15, D20 + chrome.alarms fix |
| B1 | C | Full rewrite | D13 version, D14, D15, D23 + `./profile` entry + zod dep |
| B2 | C+ | Full rewrite | D5 type catalogue, D7, D8, D9, D16, D14, D15 + delete HighlightRange + JSDoc scrub |
| B3 | A- | Targeted fixes | D14, D15 + ClassifiedField rename + MPL header post-build check |
| B4 | B- | Full rewrite | D14, D15 + 5 compile fixes + adversarial test additions |
| B5 | A- | Targeted fixes | D14, D15 + FillResult.selector + offsetParent fix |
| B6 | A- | Targeted fixes | D14, D15 |
| B7 | C | Full rewrite | D1, D9, D12, D14, D15, D17, D18, D22 + B5 signature + JobPostingData |
| B8 | D | Full rewrite | D1, D9, D14, D15, D17, D18, D22 + full rewrite of field-filler + factory |
| B9 | A- | Full rewrite | D1, D6 primitives, D12 publish, D13 version, D14, D15, D17, D22, D25 + 4 clerical blockers |

---

## 4. Execution wave plan (for the orchestrator)

**Wave 0** (2026-04-11 EOD, architect time): Write this memo + `03-keystone-contracts.md`. Land in plan directory.

**Wave 1** (2026-04-11 EOD, parallel sub-agent rewrites): Fire 20 parallel correction agents, one per phase. Each agent reads (a) this memo, (b) keystone contracts, (c) their target phase plan, (d) their review file, (e) 2-4 neighbour plans. Produces a full rewrite of the target phase plan file in place.

**Wave 2** (2026-04-11 EOD, drift validator): Fire 1 validator agent that reads all 20 rewritten plans + the keystone contracts + this memo and produces `reviews/01-post-v2.1-drift-check.md` with PASS/FAIL per phase and a list of any residual drift.

**Wave 3** (2026-04-12 AM, if needed): Fix any residual drift the validator found. Re-run validator.

**Wave 4** (2026-04-12 Day 1 execution): Sonnet executors pick up corrected phase plans and ship A1/A2/A3/B1 on Day 1 per the original 6-day schedule.

---

**End of decision memo v2.1. Corrective plans execute against this document and `03-keystone-contracts.md` as the single source of truth.**
