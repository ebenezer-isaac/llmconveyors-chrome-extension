# Plan 100 v2.1 — Keystone Contracts (verbatim source of truth)

**Date**: 2026-04-11
**Purpose**: Every type, interface, function signature, message shape, and exports-map entry that crosses a phase boundary lives in this file. Phase plans MUST copy verbatim from here. Any divergence is drift.
**Paired with**: `02-decisions-v2.1-final.md`

---

## 1. A5 ProtocolMap (single owner — no other phase edits this)

### 1.1 ProtocolMap keys (exactly 19, listed alphabetically within categories)

```ts
// src/background/messaging/protocol.ts (A5 owns)
import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Profile, FillInstruction, FillResult, FormModel, DetectedIntent, JobPostingData } from 'ats-autofill-engine';
import type { AuthState } from './auth-state';
import type { TabId, GenerationId } from 'ats-autofill-engine';

export interface ProtocolMap {
  // --- Auth (4) ---
  AUTH_SIGN_IN:              () => AuthState;
  AUTH_SIGN_OUT:             () => AuthState;
  AUTH_STATUS:               () => AuthState;
  AUTH_STATE_CHANGED:        (data: AuthState) => void;    // broadcast-only, bg handler is noop

  // --- Profile (3) ---
  PROFILE_GET:               () => Profile | null;
  PROFILE_UPDATE:            (data: { patch: DeepPartial<Profile> }) => ProfileUpdateResponse;
  PROFILE_UPLOAD_JSON_RESUME:(data: { raw: unknown }) => ProfileUploadResponse;

  // --- Intent (2) ---
  INTENT_DETECTED:           (data: DetectedIntentPayload) => void;         // content->bg, bg handler stores in per-tab map
  INTENT_GET:                (data: { tabId: TabId }) => DetectedIntent | null;

  // --- Fill (1) ---
  FILL_REQUEST:              (data: { tabId: TabId }) => FillRequestResponse; // bg forwards to content via chrome.tabs.sendMessage

  // --- Keywords (1) ---
  KEYWORDS_EXTRACT:          (data: KeywordsExtractRequest) => KeywordsExtractResponse;

  // --- Highlight (3) ---
  HIGHLIGHT_APPLY:           (data: { tabId: TabId }) => HighlightApplyResponse;
  HIGHLIGHT_CLEAR:           (data: { tabId: TabId }) => HighlightClearResponse;
  HIGHLIGHT_STATUS:          (data: { tabId: TabId }) => HighlightStatus;

  // --- Generation (3) ---
  GENERATION_START:          (data: GenerationStartRequest) => GenerationStartResponse;
  GENERATION_UPDATE:         (data: GenerationUpdateBroadcast) => void;     // broadcast-only
  GENERATION_CANCEL:         (data: { generationId: GenerationId }) => { ok: boolean };

  // --- Broadcast (1) ---
  DETECTED_JOB_BROADCAST:    (data: { tabId: TabId; intent: DetectedIntent }) => void;  // broadcast-only

  // --- Credits (1) ---
  CREDITS_GET:               () => CreditsState;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

### 1.2 Value types (A5 defines, consumers import)

```ts
// src/background/messaging/auth-state.ts
export type AuthState =
  | { readonly authed: true; readonly email: string | null; readonly accessTokenExpiry: number }
  | { readonly authed: false };

// src/background/messaging/protocol-types.ts
import type { ExtractedSkill } from 'ats-autofill-engine';

export interface ProfileUpdateResponse {
  readonly ok: boolean;
  readonly errors?: ReadonlyArray<{ path: string; message: string }>;
}

export type ProfileUploadResponse =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly errors: ReadonlyArray<{ path: string; message: string }> };

export interface DetectedIntentPayload {
  readonly tabId: TabId | -1;     // -1 sentinel means "use sender.tab.id" (bg handler substitutes)
  readonly url: string;
  readonly kind: AtsKind;
  readonly pageKind: 'job-posting' | 'application-form';
  readonly company?: string;
  readonly jobTitle?: string;
  readonly detectedAt: number;
}

export type FillRequestResponse =
  | { readonly ok: true; readonly filled: number; readonly skipped: number; readonly failed: number; readonly planId: PlanId }
  | { readonly ok: false; readonly reason: 'no-adapter' | 'no-profile' | 'no-form' | 'scan-failed' | 'plan-failed' | 'ats-mismatch' | 'wizard-not-ready' };

export interface KeywordsExtractRequest {
  readonly text: string;
  readonly url: string;
  readonly topK?: number;
}

export type KeywordsExtractResponse =
  | { readonly ok: true; readonly keywords: ReadonlyArray<ExtractedSkill>; readonly tookMs: number }
  | { readonly ok: false; readonly reason: 'signed-out' | 'empty-text' | 'api-error' | 'rate-limited' | 'network-error' };

export type HighlightApplyResponse =
  | { readonly ok: true; readonly keywordCount: number; readonly rangeCount: number; readonly tookMs: number }
  | { readonly ok: false; readonly reason: 'signed-out' | 'no-jd-on-page' | 'not-a-job-posting' | 'api-error' | 'rate-limited' | 'network-error' | 'no-tab' | 'render-error' };

export type HighlightClearResponse =
  | { readonly ok: true; readonly cleared: boolean }
  | { readonly ok: false; readonly reason: string };

export interface HighlightStatus {
  readonly on: boolean;
  readonly keywordCount: number;
  readonly appliedAt: number | null;
}

export interface GenerationStartRequest {
  readonly agent: 'job-hunter' | 'b2b-sales';
  readonly payload: unknown;    // validated by the agent's own schema downstream
}

export type GenerationStartResponse =
  | { readonly ok: true; readonly generationId: GenerationId; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: string };

export interface GenerationUpdateBroadcast {
  readonly generationId: GenerationId;
  readonly sessionId: SessionId;
  readonly phase: string;
  readonly status: 'running' | 'completed' | 'failed' | 'awaiting_input' | 'cancelled';
  readonly progress?: number;
  readonly interactionType?: string;
  readonly artifacts?: ReadonlyArray<GenerationArtifact>;
}

export interface GenerationArtifact {
  readonly kind: 'cv' | 'cover-letter' | 'email' | 'other';
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreditsState {
  readonly balance: number;
  readonly plan: string;
  readonly resetAt: number | null;
}
```

### 1.3 A5 bg handler requirements

A5's `src/background/messaging/handlers.ts` ships an exhaustive `HANDLERS: { [K in keyof ProtocolMap]: HandlerFor<K> }` record. Every key has a real or inert handler:

- **Real handlers (A5 owns)**: `AUTH_SIGN_IN`, `AUTH_SIGN_OUT`, `AUTH_STATUS`, `PROFILE_GET`, `PROFILE_UPDATE`, `PROFILE_UPLOAD_JSON_RESUME`, `KEYWORDS_EXTRACT` (direct fetch via `buildAuthHeaders`), `INTENT_DETECTED` (stores in per-tab Map, substitutes `sender.tab.id` when `tabId === -1`), `INTENT_GET`, `HIGHLIGHT_STATUS` (reads per-tab Map), `GENERATION_START`, `GENERATION_CANCEL`, `CREDITS_GET` (direct fetch), `FILL_REQUEST` (forwards to content via `chrome.tabs.sendMessage`).
- **Broadcast-only handlers (inert `async () => undefined`)**: `AUTH_STATE_CHANGED`, `GENERATION_UPDATE`, `DETECTED_JOB_BROADCAST`.
- **Content-script handlers (registered in entrypoints)**: `HIGHLIGHT_APPLY`, `HIGHLIGHT_CLEAR` (content script registers these via `onMessage`, bg never sees them).

A5's type-level assertion test (per D14.2):

```ts
// tests/background/messaging/protocol-contract.type-test.ts
import type { ProtocolMap } from '@/background/messaging/protocol';
type RequiredKeys =
  | 'AUTH_SIGN_IN' | 'AUTH_SIGN_OUT' | 'AUTH_STATUS' | 'AUTH_STATE_CHANGED'
  | 'PROFILE_GET' | 'PROFILE_UPDATE' | 'PROFILE_UPLOAD_JSON_RESUME'
  | 'KEYWORDS_EXTRACT' | 'INTENT_DETECTED' | 'INTENT_GET'
  | 'FILL_REQUEST' | 'HIGHLIGHT_APPLY' | 'HIGHLIGHT_CLEAR' | 'HIGHLIGHT_STATUS'
  | 'GENERATION_START' | 'GENERATION_UPDATE' | 'GENERATION_CANCEL'
  | 'DETECTED_JOB_BROADCAST' | 'CREDITS_GET';
type _RequiredPresent = RequiredKeys extends keyof ProtocolMap ? true : never;
type _NoExtras = Exclude<keyof ProtocolMap, RequiredKeys> extends never ? true : never;
const _check1: _RequiredPresent = true;  // fails compile if A5 drops a key
const _check2: _NoExtras = true;         // fails compile if A5 adds an undocumented key
```

### 1.4 Refresh manager + single-flight (D20 DI pattern)

A5 ships `src/background/auth/refresh-manager.ts` as a class, not module-scoped state, so tests can instantiate fresh:

```ts
export interface RefreshManagerDeps {
  readonly readTokens: () => Promise<StoredTokens | null>;
  readonly writeTokens: (t: StoredTokens) => Promise<void>;
  readonly clearTokens: () => Promise<void>;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly logger: Logger;
}
export class RefreshManager {
  constructor(private readonly deps: RefreshManagerDeps) {}
  refreshOnce(): Promise<StoredTokens>;   // single-flight, dedup in-flight
}
```

A5 wires a module-singleton `refreshManager = new RefreshManager({ ...deps })` and every consumer imports the singleton. Tests construct fresh instances with fake deps.

---

## 2. B2 core types (keystone)

### 2.1 File layout (B2 creates)

```
src/core/types/
├── brands.ts               (D16)
├── ats-kind.ts             (D9)
├── form-model.ts
├── fill-instruction.ts     (incl. FillResult, FillError, FillValue, FillInstruction, FillPlan)
├── fill-plan-result.ts     (D7, D8)
├── classified-field.ts
├── profile/                (moved out of types/ into profile/ per previous plan — see §3)
├── job-posting.ts          (NEW per D5)
├── page-intent.ts          (NEW per D5)
├── ats-adapter.ts          (NEW per D1, D17)
└── index.ts                (barrel re-export)
```

`HighlightRange` is DELETED. `IKeywordHighlighter` port is DELETED. Neither type ever existed in v2.

### 2.2 `brands.ts` (D16)

```ts
type Brand<T, B> = T & { readonly __brand: B };

export type TabId = Brand<number, 'TabId'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type ResumeHandleId = Brand<string, 'ResumeHandleId'>;

export const TabId = Object.assign((n: number): TabId => n as TabId, { unbrand: (id: TabId): number => id });
export const GenerationId = Object.assign((s: string): GenerationId => s as GenerationId, { unbrand: (id: GenerationId): string => id });
export const SessionId = Object.assign((s: string): SessionId => s as SessionId, { unbrand: (id: SessionId): string => id });
export const RequestId = Object.assign((s: string): RequestId => s as RequestId, { unbrand: (id: RequestId): string => id });
export const PlanId = Object.assign((s: string): PlanId => s as PlanId, { unbrand: (id: PlanId): string => id });
export const ResumeHandleId = Object.assign((s: string): ResumeHandleId => s as ResumeHandleId, { unbrand: (id: ResumeHandleId): string => id });
```

### 2.3 `ats-kind.ts` (D9)

```ts
export type AtsKind = 'greenhouse' | 'lever' | 'workday';
export const ATS_KINDS: ReadonlyArray<AtsKind> = ['greenhouse', 'lever', 'workday'] as const;
export function isAtsKind(x: unknown): x is AtsKind {
  return typeof x === 'string' && (ATS_KINDS as ReadonlyArray<string>).includes(x);
}
```

### 2.4 `form-model.ts`

```ts
import type { AtsKind } from './ats-kind';

export interface FormFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FormFieldDescriptor {
  readonly selector: string;
  readonly name: string | null;
  readonly id: string | null;
  readonly label: string | null;
  readonly placeholder: string | null;
  readonly ariaLabel: string | null;
  readonly autocomplete: string | null;
  readonly type: string;   // HTML input type or "select", "textarea", "combobox"
  readonly options: ReadonlyArray<FormFieldOption>;
  readonly required: boolean;
  readonly dataAttributes: Readonly<Record<string, string>>;
  readonly sectionHeading: string | null;
  readonly domIndex: number;
}

export interface FormModel {
  readonly url: string;
  readonly title: string;
  readonly scannedAt: string;
  readonly fields: ReadonlyArray<FormFieldDescriptor>;
  readonly sourceATS?: AtsKind;       // NEW per D5 - optional, set by vendor adapter
  readonly formRootSelector?: string; // NEW per D5 - optional, identifies the form root
}

export function freezeFormModel(m: FormModel): FormModel {
  return Object.freeze({
    ...m,
    fields: Object.freeze(m.fields.map(f => Object.freeze({ ...f, options: Object.freeze([...f.options]), dataAttributes: Object.freeze({ ...f.dataAttributes }) }))),
  });
}
```

### 2.5 `fill-instruction.ts`

```ts
import type { PlanId, ResumeHandleId } from './brands';
import type { FieldType } from '../taxonomy/field-types';

export type FillValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'choice'; readonly value: string }
  | { readonly kind: 'file'; readonly handleId: ResumeHandleId; readonly hint?: string }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

export type SkipReason =
  | 'profile-field-empty'
  | 'consent-not-granted'
  | 'consent-denied-field-type'
  | 'htmlTypeGuard-rejected'
  | 'value-out-of-allowed-options'
  | 'skipped-by-user'
  | 'out-of-scope-for-v1';

export interface FillInstruction {
  readonly selector: string;
  readonly field: FieldType;
  readonly value: FillValue;
  readonly priority: number;
  readonly planId: PlanId;
}

export interface FillPlan {
  readonly planId: PlanId;
  readonly createdAt: string;
  readonly formUrl: string;
  readonly instructions: ReadonlyArray<FillInstruction>;
  readonly skipped: ReadonlyArray<{ readonly instruction: FillInstruction; readonly reason: SkipReason }>;
}

export type FillError =
  | 'selector-not-found'
  | 'element-disabled'
  | 'element-not-visible'
  | 'value-rejected-by-page'
  | 'file-attach-failed'
  | 'wrong-entry-point-for-file'
  | 'unknown-error';

export type FillResult =
  | { readonly ok: true; readonly selector: string; readonly instructionPlanId: PlanId }
  | { readonly ok: false; readonly selector: string; readonly error: FillError; readonly instructionPlanId: PlanId };
```

### 2.6 `fill-plan-result.ts` (D7)

```ts
import type { FillResult, FillInstruction, SkipReason } from './fill-instruction';
import type { PlanId } from './brands';

export type AbortReason =
  | 'profile-missing'
  | 'form-not-detected'
  | 'adapter-load-failed'
  | 'scan-threw'
  | 'plan-builder-threw'
  | 'wizard-not-ready';

export interface FillPlanResult {
  readonly planId: PlanId;
  readonly executedAt: string;
  readonly filled: ReadonlyArray<Extract<FillResult, { ok: true }>>;
  readonly skipped: ReadonlyArray<{ readonly instruction: FillInstruction; readonly reason: SkipReason }>;
  readonly failed: ReadonlyArray<Extract<FillResult, { ok: false }>>;
  readonly aborted: boolean;
  readonly abortReason?: AbortReason;
}
```

### 2.7 `job-posting.ts` (NEW per D5)

```ts
export interface JobPostingData {
  readonly title: string;
  readonly description: string;
  readonly descriptionHtml?: string;
  readonly datePosted?: string;
  readonly validThrough?: string;
  readonly employmentType?: string;
  readonly hiringOrganization?: {
    readonly name: string;
    readonly logo?: string;
    readonly url?: string;
  };
  readonly jobLocation?: ReadonlyArray<{
    readonly addressLocality?: string;
    readonly addressRegion?: string;
    readonly addressCountry?: string;
    readonly postalCode?: string;
  }>;
  readonly baseSalary?: {
    readonly currency: string;
    readonly minValue?: number;
    readonly maxValue?: number;
    readonly unitText?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  };
  readonly applicantLocationRequirements?: ReadonlyArray<string>;
  readonly source: 'json-ld' | 'readability' | 'adapter-specific';
}
```

### 2.8 `page-intent.ts` (NEW per D5)

```ts
import type { AtsKind } from './ats-kind';
import type { JobPostingData } from './job-posting';

export type PageIntent =
  | { readonly kind: AtsKind; readonly pageKind: 'job-posting'; readonly url: string; readonly jobData?: JobPostingData }
  | { readonly kind: AtsKind; readonly pageKind: 'application-form'; readonly url: string }
  | { readonly kind: 'unknown'; readonly url: string };

export interface DetectedIntent {
  readonly kind: AtsKind | 'unknown';
  readonly pageKind: 'job-posting' | 'application-form' | null;
  readonly url: string;
  readonly jobTitle?: string;
  readonly company?: string;
  readonly detectedAt: number;
}
```

### 2.9 `ats-adapter.ts` (NEW per D1)

```ts
import type { AtsKind } from './ats-kind';
import type { FormModel } from './form-model';
import type { FillInstruction, FillResult } from './fill-instruction';
import type { JobPostingData } from './job-posting';

export type WorkdayWizardStep =
  | 'my-information'
  | 'my-experience'
  | 'voluntary-disclosures'
  | 'review'
  | 'unknown';

export interface AtsAdapter {
  readonly kind: AtsKind;
  readonly matchesUrl: (url: string) => boolean;
  readonly scanForm: (root: Document) => FormModel;
  readonly fillField: (instruction: FillInstruction) => FillResult;
  readonly attachFile?: (instruction: FillInstruction, file: File) => Promise<FillResult>;
  readonly extractJob?: (doc: Document) => JobPostingData | null;

  // Workday-only optional surface (B9):
  readonly detectCurrentStep?: (doc: Document) => WorkdayWizardStep;
  readonly watchForStepChange?: (doc: Document, onChange: (step: WorkdayWizardStep) => void) => () => void;
  readonly scanStep?: (doc: Document, step: WorkdayWizardStep) => FormModel;
  readonly fillStep?: (step: WorkdayWizardStep, profile: unknown) => Promise<ReadonlyArray<FillResult>>;
}
```

### 2.10 `ExtractedSkill` (new, for A3↔A9 contract — lives in B2 because A5 imports it)

```ts
// src/core/types/extracted-skill.ts
export interface ExtractedSkill {
  readonly term: string;
  readonly category: 'hard' | 'soft' | 'tool' | 'domain';
  readonly score: number;          // 0..1
  readonly occurrences: number;
  readonly canonicalForm: string;
}
```

### 2.11 Barrel export (`src/core/types/index.ts`)

```ts
export * from './brands';
export * from './ats-kind';
export * from './form-model';
export * from './fill-instruction';
export * from './fill-plan-result';
export * from './classified-field';
export * from './job-posting';
export * from './page-intent';
export * from './ats-adapter';
export * from './extracted-skill';
```

### 2.12 JSDoc grep-gate fix

B2's `src/core/ports/index.ts` JSDoc must NOT contain:
- `HTMLElement` → replace with `"the host's platform-native element type"`
- `chrome.storage` → replace with `"the host's platform-native storage"`
- `document` (as a noun referring to DOM) → replace with `"source element"` or `"scanned form"`
- "document" meaning a PDF file stays as "file" everywhere

---

## 3. B2 Profile schema (unchanged from existing B2 — documented here for reference)

Lives under `src/core/profile/` (NOT `src/core/types/profile/`):

```
src/core/profile/
├── schema.ts          (Zod)
├── types.ts           (inferred types)
├── defaults.ts        (createEmptyProfile, createPlaceholderProfile)
├── migrations.ts      (v1.0 is the only version for now)
├── index.ts           (barrel)
```

Key fields (unchanged per D3):
- `profileVersion: '1.0'` literal
- `basics: { firstName, lastName, name, preferredName?, pronouns?, email, phone?, phonePrefix?, dateOfBirth?, url?, summary?, label?, location: { ... }, profiles: SocialProfile[] }`
- `jobPreferences: { workAuthorization: JurisdictionAuthorization[4], salaryExpectation, availabilityDate, willingToRelocate, remotePreference, willingToCompleteAssessments, willingToUndergoDrugTests, willingToUndergoBackgroundChecks }`
- `work: WorkExperience[]`, `education: Education[]`, `skills: Skill[]`, `languages: Language[]`, `certificates: Certificate[]`, `projects: Project[]`, `volunteer: Volunteer[]`, `awards: Award[]`, `publications: Publication[]`, `references: Reference[]`
- `demographics: { gender?, race?, veteranStatus?, disabilityStatus? }` (all optional, all default to undefined)
- `consents: { privacyPolicy, marketing, allowEeoAutofill, allowDobAutofill }` (all booleans, default false)
- `documents: { resume?: ResumeHandle, coverLetter?: CoverLetterHandle }`
- `customAnswers: Readonly<Record<string, string>>`
- `updatedAtMs: number` (NEW per D10 - storage metadata, passthrough permitted, used as React key component)

`ProfileSchema` uses `.strict()` on every object. `createEmptyProfile()` returns a valid Profile with all required fields populated from safe defaults (empty strings, empty arrays, empty workAuth for 4 jurisdictions).

---

## 4. B1 exports map (keystone)

```json
{
  "name": "ats-autofill-engine",
  "version": "0.1.0-alpha.1",
  "type": "module",
  "main": "./dist/core/index.js",
  "types": "./dist/core/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/core/index.d.ts",
      "import": "./dist/core/index.js",
      "require": "./dist/core/index.cjs"
    },
    "./profile": {
      "types": "./dist/core/profile/index.d.ts",
      "import": "./dist/core/profile/index.js",
      "require": "./dist/core/profile/index.cjs"
    },
    "./ports": {
      "types": "./dist/core/ports/index.d.ts",
      "import": "./dist/core/ports/index.js",
      "require": "./dist/core/ports/index.cjs"
    },
    "./heuristics": {
      "types": "./dist/core/heuristics/index.d.ts",
      "import": "./dist/core/heuristics/index.js",
      "require": "./dist/core/heuristics/index.cjs"
    },
    "./dom": {
      "types": "./dist/adapters/dom/index.d.ts",
      "import": "./dist/adapters/dom/index.js",
      "require": "./dist/adapters/dom/index.cjs"
    },
    "./chrome": {
      "types": "./dist/adapters/chrome/index.d.ts",
      "import": "./dist/adapters/chrome/index.js",
      "require": "./dist/adapters/chrome/index.cjs"
    },
    "./greenhouse": {
      "types": "./dist/ats/greenhouse/index.d.ts",
      "import": "./dist/ats/greenhouse/index.js",
      "require": "./dist/ats/greenhouse/index.cjs"
    },
    "./lever": {
      "types": "./dist/ats/lever/index.d.ts",
      "import": "./dist/ats/lever/index.js",
      "require": "./dist/ats/lever/index.cjs"
    },
    "./workday": {
      "types": "./dist/ats/workday/index.d.ts",
      "import": "./dist/ats/workday/index.js",
      "require": "./dist/ats/workday/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "peerDependencies": {},
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "~5.6.3",
    "vitest": "^2.1.1",
    "happy-dom": "^15.7.4",
    "@vitest/coverage-v8": "^2.1.1",
    "@mozilla/readability": "^0.5.0",
    "turndown": "^7.2.0",
    "turndown-plugin-gfm": "^1.0.2",
    "@types/turndown": "^5.0.5",
    "eslint": "^9.12.0",
    "@eslint/js": "^9.12.0",
    "typescript-eslint": "^8.8.0",
    "publint": "^0.2.11",
    "@arethetypeswrong/cli": "^0.16.4"
  },
  "license": "MIT AND MPL-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ebenezer-isaac/ats-autofill-engine.git"
  }
}
```

9 sub-entries (`.`, `./profile`, `./ports`, `./heuristics`, `./dom`, `./chrome`, `./greenhouse`, `./lever`, `./workday`) plus `./package.json` escape hatch = 10 entries.

Tsup config entries match:

```ts
// tsup.config.ts
export default defineConfig({
  entry: {
    'core/index':             'src/core/index.ts',
    'core/profile/index':     'src/core/profile/index.ts',
    'core/ports/index':       'src/core/ports/index.ts',
    'core/heuristics/index':  'src/core/heuristics/index.ts',
    'adapters/dom/index':     'src/adapters/dom/index.ts',
    'adapters/chrome/index':  'src/adapters/chrome/index.ts',
    'ats/greenhouse/index':   'src/ats/greenhouse/index.ts',
    'ats/lever/index':        'src/ats/lever/index.ts',
    'ats/workday/index':      'src/ats/workday/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  terserOptions: {
    format: { comments: /@license|MPL|Mozilla Public/i },
  },
  target: 'es2022',
  platform: 'neutral',
});
```

---

## 5. B6 `applyHighlights` signature (unchanged, documented for A9 consumers)

```ts
// src/adapters/dom/highlighter/renderer.ts (B6)
export function applyHighlights(
  root: Element,
  keywords: readonly string[],
): () => void;
```

Returns a cleanup function. Internally: walks text nodes under `root`, finds ASCII word-boundary matches for each keyword (longest wins on overlap), wraps matches in `<mark data-ats-autofill="true">` spans, injects `<style>` tag (idempotent). Cleanup unwraps all marks and calls `parent.normalize()`.

Consumers (A9) call:

```ts
const keywords = response.keywords.map(k => k.term);
const cleanup = applyHighlights(document.body, keywords);
// later:
cleanup();
```

No `HighlightRange`. No range pre-computation. No `walkTextNodes` exposed to consumers (internal to renderer).

---

## 6. AtsAdapter factory pattern (D17)

Every vendor ships both a factory and a module-singleton:

```ts
// src/ats/greenhouse/index.ts (B7)
import type { AtsAdapter } from '../../core/types';
import { createGreenhouseAdapter } from './adapter';
export { createGreenhouseAdapter };
export const adapter: AtsAdapter = createGreenhouseAdapter();
export { GREENHOUSE_BLUEPRINT } from './blueprint.contract';

// src/ats/greenhouse/adapter.ts (B7)
export function createGreenhouseAdapter(): AtsAdapter {
  // stateless for Greenhouse - closure is empty
  return Object.freeze({
    kind: 'greenhouse' as const,
    matchesUrl: (url) => GREENHOUSE_URL_PATTERNS.some(re => re.test(url)),
    scanForm,
    fillField,
    attachFile,
    extractJob,
  });
}
```

```ts
// src/ats/lever/adapter.ts (B8) - stateful with variant
export function createLeverAdapter(): AtsAdapter {
  let lastVariant: LeverFormVariant = 'unknown';
  let lastFormRoot: WeakRef<Element> | null = null;
  return Object.freeze({
    kind: 'lever' as const,
    matchesUrl: (url) => LEVER_URL_PATTERNS.some(re => re.test(url)),
    scanForm: (doc) => {
      const result = scanLeverForm(doc);
      lastVariant = result.variant;
      lastFormRoot = result.formRoot ? new WeakRef(result.formRoot) : null;
      return result.formModel;
    },
    fillField: (instruction) => fillLeverField(instruction, { variant: lastVariant, formRoot: lastFormRoot?.deref() }),
    attachFile: async (instruction, file) => attachLeverResume(instruction, file, { formRoot: lastFormRoot?.deref() }),
    extractJob: extractLeverJob,
  });
}
export const adapter: AtsAdapter = createLeverAdapter();
```

```ts
// src/ats/workday/adapter.ts (B9) - stateless, with wizard primitives
export function createWorkdayAdapter(): AtsAdapter {
  return Object.freeze({
    kind: 'workday' as const,
    matchesUrl: (url) => WORKDAY_URL_PATTERNS.some(re => re.test(url)),
    scanForm: (doc) => scanStep(doc, detectCurrentStep(doc)),
    fillField: (instruction) => fillWorkdayField(instruction),
    attachFile: async (instruction, file) => attachWorkdayResume(instruction, file),
    extractJob: extractWorkdayJob,
    detectCurrentStep,
    watchForStepChange,
    scanStep,
    fillStep,
  });
}
export const adapter: AtsAdapter = createWorkdayAdapter();
```

---

## 7. A8 content-script wizard orchestration loop (D6)

A8's controller (in `entrypoints/ats.content/autofill-controller.ts`) handles Workday wizard state. Greenhouse and Lever get single-pass fill; Workday gets the loop:

```ts
class AutofillController {
  private currentStep: WorkdayWizardStep | null = null;
  private stepWatcherCleanup: (() => void) | null = null;

  async bootstrap(): Promise<void> {
    const adapter = await this.deps.loadAdapter(window.location.href);
    if (!adapter) return;
    this.deps.logger.info('adapter loaded', { kind: adapter.kind });

    if (adapter.kind === 'workday' && adapter.detectCurrentStep && adapter.watchForStepChange) {
      // Mount wizard loop
      this.currentStep = adapter.detectCurrentStep(this.deps.document);
      this.stepWatcherCleanup = adapter.watchForStepChange(this.deps.document, (newStep) => {
        const prev = this.currentStep;
        this.currentStep = newStep;
        this.deps.logger.info('workday step changed', { from: prev, to: newStep });
        this.deps.broadcast('INTENT_DETECTED', {
          tabId: -1 as TabId,
          url: this.deps.document.location.href,
          kind: 'workday',
          pageKind: newStep === 'review' ? 'application-form' : 'application-form',
          detectedAt: this.deps.now(),
        });
      });
    }
  }

  async executeFill(): Promise<FillRequestResponse> {
    const adapter = this.adapter;
    if (!adapter) return { ok: false, reason: 'no-adapter' };
    const profile = await this.deps.readProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };

    if (adapter.kind === 'workday' && adapter.scanStep && adapter.fillStep && this.currentStep) {
      if (this.currentStep === 'review' || this.currentStep === 'unknown') {
        return { ok: false, reason: 'wizard-not-ready' };
      }
      const formModel = adapter.scanStep(this.deps.document, this.currentStep);
      const fillResults = await adapter.fillStep(this.currentStep, profile);
      const planId = PlanId(crypto.randomUUID());
      const filled = fillResults.filter((r): r is Extract<FillResult, { ok: true }> => r.ok).length;
      const failed = fillResults.filter((r): r is Extract<FillResult, { ok: false }> => !r.ok).length;
      return { ok: true, filled, skipped: 0, failed, planId };
    }

    // Greenhouse / Lever single-pass
    const formModel = adapter.scanForm(this.deps.document);
    if (formModel.fields.length === 0) return { ok: false, reason: 'no-form' };
    const plan = buildPlan(formModel, profile);
    let filled = 0, skipped = plan.skipped.length, failed = 0;
    for (const instruction of plan.instructions) {
      const result = instruction.value.kind === 'file'
        ? (adapter.attachFile ? await adapter.attachFile(instruction, await this.deps.resolveFile(instruction.value.handleId)) : { ok: false as const, selector: instruction.selector, error: 'file-attach-failed' as const, instructionPlanId: instruction.planId })
        : adapter.fillField(instruction);
      if (result.ok) filled++; else failed++;
    }
    return { ok: true, filled, skipped, failed, planId: plan.planId };
  }

  teardown(): void {
    this.stepWatcherCleanup?.();
    this.stepWatcherCleanup = null;
  }
}
```

A8's `Deps` object carries `loadAdapter`, `readProfile`, `resolveFile`, `broadcast`, `logger`, `now`, `document`. Production wires real impls; tests wire fakes.

---

## 8. A3 backend contract (unchanged, documented for A9 + A5 consumers)

```
POST /api/v1/ats/extract-skills
Request:  { text: string(1..50000), options?: { topK?: 1..100, categories?: ..., includeMissing?, resumeText? } }
Response: { success: true, data: { keywords: ExtractedSkill[], missing?: ExtractedSkill[], tookMs: number } }
```

A5's `KEYWORDS_EXTRACT` bg handler calls this endpoint directly via `fetch` (not SDK, per memo §2.10 decision a). A9 content script sends `KEYWORDS_EXTRACT` via `sendMessage` to bg; bg fetches; bg returns response; A9 passes `keywords.map(k => k.term)` to `applyHighlights`.

---

## 9. Anti-drift validation scripts (D14, D22)

### 9.1 `scripts/check-core-leak.sh`

```bash
#!/bin/bash
set -e
HITS=$(grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core/ --include='*.ts' || true)
if [ -n "$HITS" ]; then echo "CORE LEAK:"; echo "$HITS"; exit 1; fi
HITS=$(grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/ --include='*.ts' || true)
if [ -n "$HITS" ]; then echo "V1 REMNANTS:"; echo "$HITS"; exit 1; fi
```

### 9.2 `scripts/check-no-console.sh`

```bash
#!/bin/bash
set -e
HITS=$(grep -rE '\bconsole\.(log|info|warn|error|debug)' entrypoints/ src/background/ src/content/ --include='*.ts' --include='*.tsx' --exclude-dir=__tests__ || true)
if [ -n "$HITS" ]; then echo "CONSOLE.* USAGE:"; echo "$HITS"; exit 1; fi
```

### 9.3 `scripts/check-no-em-dash.sh`

```bash
#!/bin/bash
set -e
HITS=$(grep -rl $'\u2014' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json' . || true)
if [ -n "$HITS" ]; then echo "EM DASH FILES:"; echo "$HITS"; exit 1; fi
```

### 9.4 `scripts/check-exports-resolution.mjs`

```js
#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const entries = ['.', './profile', './ports', './heuristics', './dom', './chrome', './greenhouse', './lever', './workday'];
for (const entry of entries) {
  try {
    const mod = await import(`ats-autofill-engine${entry === '.' ? '' : entry}`);
    console.log(`OK  ats-autofill-engine${entry === '.' ? '' : entry} -> ${Object.keys(mod).length} exports`);
  } catch (err) {
    console.error(`FAIL ats-autofill-engine${entry === '.' ? '' : entry}: ${err.message}`);
    process.exit(1);
  }
}

const requiredAdapterSymbols = ['adapter'];
for (const vendor of ['greenhouse', 'lever', 'workday']) {
  const mod = await import(`ats-autofill-engine/${vendor}`);
  for (const sym of requiredAdapterSymbols) {
    if (!(sym in mod)) { console.error(`FAIL ${vendor} missing export: ${sym}`); process.exit(1); }
  }
  if (mod.adapter.kind !== vendor) { console.error(`FAIL ${vendor} adapter.kind = ${mod.adapter.kind}`); process.exit(1); }
}
console.log('All exports resolve.');
```

### 9.5 `scripts/check-blueprint-contracts.mjs`

Reads every `**/blueprint.contract.ts`, verifies:
- Declared `publicExports` match actual exports from the area's index.ts
- `forbiddenImports` are absent
- `requiredCoverage` is met (reads `coverage-summary.json`)
- Adapter shapes match `AtsAdapter` at runtime

### 9.6 `.husky/pre-commit`

```bash
#!/usr/bin/env bash
. "$(dirname -- "$0")/_/husky.sh"
scripts/check-no-em-dash.sh
scripts/check-core-leak.sh
scripts/check-no-console.sh
```

### 9.7 CI workflow gate (added to B1's `.github/workflows/ci.yml`)

```yaml
- name: Anti-drift gates
  run: |
    scripts/check-no-em-dash.sh
    scripts/check-core-leak.sh
    scripts/check-no-console.sh
    pnpm build
    scripts/check-exports-resolution.mjs
    node scripts/check-blueprint-contracts.mjs
```

---

## 10. Summary — what every phase imports from where

| Phase | Imports from | Specific symbols |
|---|---|---|
| A1 | — | (scaffold only) |
| A2 | `supertokens-node` | `Session`, `SuperTokens` |
| A3 | `@repo/shared-types`, existing ats module | `ExtractSkillsRequestSchema`, `SkillTaxonomyService` |
| A4 | `supertokens-auth-react` | `useSessionContext` |
| A5 | `ats-autofill-engine`, `@webext-core/messaging` | `Profile`, `FillInstruction`, `FillResult`, `FormModel`, `DetectedIntent`, `ExtractedSkill`, `TabId`, `GenerationId`, `AtsKind`, `defineExtensionMessaging` |
| A5 | `ats-autofill-engine/profile` | `ProfileSchema` |
| A6 | `ats-autofill-engine`, A5's messaging barrel | Same branded types, `sendMessage`, `onMessage` |
| A7 | `ats-autofill-engine`, `ats-autofill-engine/profile` | `Profile`, `ProfileSchema`, `createEmptyProfile` |
| A8 | `ats-autofill-engine`, `ats-autofill-engine/greenhouse`, `ats-autofill-engine/lever`, `ats-autofill-engine/workday` | `Profile`, `ProfileSchema`, `FillInstruction`, `FillResult`, `FillPlanResult`, `AtsAdapter`, `AtsKind`, `buildPlan`, `WorkdayWizardStep`, per-vendor `adapter` |
| A9 | `ats-autofill-engine/dom`, A5 messaging | `applyHighlights`, `extractJobDescription`, `detectPageIntent`, `sendMessage` |
| A10 | `ats-autofill-engine`, A5 messaging | Branded types, `DetectedIntent`, `sendMessage`, `onMessage` |
| A11 | `ats-autofill-engine`, A5 messaging | `GenerationUpdateBroadcast`, `sendMessage`, `onMessage`, `WorkdayWizardStep` |
| B1 | `zod` | scaffold only |
| B2 | `zod` | defines everything |
| B3 | B2 | `FieldType`, port types |
| B4 | B2, B3 | `Profile`, `FillInstruction`, `FillPlan`, `FormModel`, `classifyViaMozillaHeuristics` |
| B5 | B2 | `FormModel`, `FillInstruction`, `FillResult`, `FillError` |
| B6 | B2, B5 | `Element`, `Document`, type-only |
| B7 | B2, B5 | `AtsAdapter`, `FormModel`, `FillInstruction`, `FillResult`, `JobPostingData`, DOM helpers |
| B8 | B2, B5 | Same as B7 + `LeverFormVariant` (local) |
| B9 | B2, B5 | Same as B7 + `WorkdayWizardStep`, wizard primitives |

---

**End of keystone contracts. Every shape above is verbatim and phase plans copy from here without modification.**
