# 21 - B2B Sales Request Schema

## (a) Schema Name

- `B2BSalesRequestSchema` at `libs/shared-types/src/schemas/b2b-sales-request.schema.ts:12`
- Inferred type: `B2BSalesRequest` (`b2b-sales-request.schema.ts:87`)
- Extends `BaseGenerateRequestSchema` from `libs/shared-types/src/schemas/generate-form.schema.ts:48`
- Public subset via `.pick()`: `B2bSalesPublicRequestSchema` (`b2b-sales-request.schema.ts:93`) exposes only `{ companyName, companyWebsite, contactName, contactEmail }`
- Schema is NOT strict and NOT passthrough — unknown fields silently dropped (default Zod object stripping at `b2b-sales-request.schema.ts:12`, no `.strict()` / `.passthrough()` modifier)

## (b) Full Field List

### Inherited from `BaseGenerateRequestSchema` (`generate-form.schema.ts:48-88`)

| Field | Zod Type | Input Optional | Output Type | Constraints | Default | Source |
|---|---|---|---|---|---|---|
| `sessionId` | `z.string().max(512).optional()` | yes | `string \| undefined` | max 512 chars | backend-generated if omitted | `generate-form.schema.ts:50-53` |
| `generationId` | `z.string().max(512).optional()` | yes | `string \| undefined` | max 512 chars | backend-generated if omitted | `generate-form.schema.ts:56-59` |
| `model` | `ModelPreferenceSchema.optional()` | yes | `'flash' \| 'pro' \| undefined` | enum (`tier.ts` `ModelPreferenceSchema`) | tier default applied server-side | `generate-form.schema.ts:62-64` |
| `autoApproveDraft` | `z.boolean().optional()` | yes | `boolean \| undefined` | — | preferences default `true` (`preferences.ts:33`) | `generate-form.schema.ts:67-69` |
| `autoApproveFollowups` | `z.boolean().optional()` | yes | `boolean \| undefined` | — | preferences default `true` (`preferences.ts:35`) | `generate-form.schema.ts:71-73` |
| `followUpCount` | `z.preprocess(stringToNumber, z.number().int().min(0).max(3).optional())` | yes | `number \| undefined` | int, 0-3 | preferences default `2` (`preferences.ts:37`) | `generate-form.schema.ts:75-80` |
| `followUpDelayDays` | `z.preprocess(stringToNumber, z.number().int().min(1).max(14).optional())` | yes | `number \| undefined` | int, 1-14 (business days) | preferences default `2` (`preferences.ts:39`) | `generate-form.schema.ts:82-87` |

### B2B-specific fields (`b2b-sales-request.schema.ts:13-84`)

| Field | Zod Type | Input Optional | Output Type | Constraints | Default | Source |
|---|---|---|---|---|---|---|
| `companyName` | `z.string().min(1).max(200)` | **NO** | `string` | non-empty, max 200 | — | `b2b-sales-request.schema.ts:13-16` |
| `companyWebsite` | `z.preprocess(httpsPrefix, z.string().url().max(2048))` | **NO** | `string` | valid URL, max 2048; auto-prefixes `https://` if missing | — | `b2b-sales-request.schema.ts:18-29` |
| `userCompanyContext` | `z.string().max(20_000).default('')` | yes | `string` | max 20000 | `''` (zod default — appears in parsed output) | `b2b-sales-request.schema.ts:32-35` |
| `targetCompanyContext` | `z.string().max(10_000).optional()` | yes | `string \| undefined` | max 10000 | — | `b2b-sales-request.schema.ts:38-41` |
| `contactName` | `z.string().max(100).optional()` | yes | `string \| undefined` | max 100 | — | `b2b-sales-request.schema.ts:43` |
| `contactTitle` | `z.string().max(100).optional()` | yes | `string \| undefined` | max 100 | — | `b2b-sales-request.schema.ts:44` |
| `contactEmail` | `z.string().email().or(z.literal('')).optional()` | yes | `string \| undefined` | valid email or empty string `''` | — | `b2b-sales-request.schema.ts:45` |
| `salesStrategy` | `z.string().max(10_000).optional()` | yes | `string \| undefined` | max 10000 | auto-loaded from `sourceDocuments` if omitted | `b2b-sales-request.schema.ts:48-51` |
| `reconStrategy` | `z.string().max(10_000).optional()` | yes | `string \| undefined` | max 10000 | auto-loaded from `sourceDocuments` if omitted | `b2b-sales-request.schema.ts:54-57` |
| `companyResearch` | `z.string().max(50_000).optional()` | yes | `string \| undefined` | max 50000; skips research step when provided | — | `b2b-sales-request.schema.ts:60-63` |
| `researchMode` | `ResearchModeSchema.default(DEFAULT_RESEARCH_MODE)` | yes | `'parallel' \| 'sequential'` | enum from `libs/shared-types/src/research.ts` | `DEFAULT_RESEARCH_MODE` (applied at parse time) | `b2b-sales-request.schema.ts:65-67` |
| `skipResearchCache` | `z.preprocess(stringToBool, z.boolean().default(false))` | yes | `boolean` | — | `false` (applied at parse time) | `b2b-sales-request.schema.ts:69-72` |
| `senderName` | `z.string().max(100).optional()` | yes | `string \| undefined` | max 100 | auto-populated from `user.displayName` if omitted | `b2b-sales-request.schema.ts:75-78` |
| `autoSelectContacts` | `z.preprocess(stringToBool, z.boolean().optional())` | yes | `boolean \| undefined` | — | no schema default; API-key users auto-select server-side | `b2b-sales-request.schema.ts:81-84` |

## (c) Phased Gate Flags

- `autoSelectContacts` — `z.boolean().optional()` with string preprocess (`b2b-sales-request.schema.ts:81-84`). **No schema default**. API-key users auto-select server-side per comment at line 80.
- `autoApproveDraft` — `z.boolean().optional()` inherited (`generate-form.schema.ts:67-69`). No schema default; loaded from user preferences where `preferences.ts:33` defaults it to `true`.
- `autoApproveFollowups` — same shape (`generate-form.schema.ts:71-73`); preference default `true` (`preferences.ts:35`).

## (d) Follow-up Config

- `followUpCount` — int 0-3, optional at schema level, preprocessed from string, preference default `2` (`preferences.ts:37`, `generate-form.schema.ts:75-80`)
- `followUpDelayDays` — int 1-14 business days, optional, preprocessed from string, preference default `2` (`preferences.ts:39`, `generate-form.schema.ts:82-87`)

## (e) Strategy Fields

- `salesStrategy`: `z.string().max(10_000).optional()` (`b2b-sales-request.schema.ts:48-51`)
- `reconStrategy`: `z.string().max(10_000).optional()` (`b2b-sales-request.schema.ts:54-57`)
- Both auto-loaded from `sourceDocuments` server-side when omitted.

## (f) researchMode Enum

- `researchMode: ResearchModeSchema.default(DEFAULT_RESEARCH_MODE)` (`b2b-sales-request.schema.ts:65-67`)
- Enum values: `'parallel' | 'sequential'` (from `libs/shared-types/src/research.ts` `ResearchModeSchema`/`DEFAULT_RESEARCH_MODE`)
- Because of `.default()`, the field is required on the inferred output type but optional on input.

## (g) Minimal Valid Request

Only `companyName` and `companyWebsite` are required at the Zod boundary. Everything else is optional, defaulted, or backend-enriched.

```json
{ "companyName": "Acme Inc", "companyWebsite": "acme.com" }
```

After parsing, defaulted fields materialize: `userCompanyContext: ''`, `researchMode: 'parallel'` (or whatever `DEFAULT_RESEARCH_MODE` resolves to), `skipResearchCache: false`.

## (h) Strict vs Passthrough

Neither. Schema is built with `BaseGenerateRequestSchema.extend({...})` (`b2b-sales-request.schema.ts:12`) using default Zod object stripping. Unknown fields are silently dropped. No `.strict()` or `.passthrough()` modifier on either the base or the B2B extension.

## (i) Input vs Output Type Semantics

Zod's `z.infer<>` produces the **output** type (post-parse). Fields with `.default(x)` are **optional on input** but **required on output**. This distinction matters for the Chrome extension:

- When **building** a request payload, treat defaulted fields as optional — omit them and let Zod fill them in.
- When **consuming** a parsed `B2BSalesRequest` (e.g. from `.parse()`), defaulted fields are always present.

## TypeScript Interface

Accurate representation of `z.infer<typeof B2BSalesRequestSchema>` (the **output** type — what you get after `.parse()`):

```ts
interface B2BSalesRequest {
  // ========== Inherited from BaseGenerateRequestSchema ==========
  /** Session ID — optional, backend generates if omitted. Max 512 chars. */
  sessionId?: string;

  /** Generation attempt ID — optional, backend generates if omitted. Max 512 chars. */
  generationId?: string;

  /** User-selected AI model preference. Omit to use tier default. */
  model?: 'flash' | 'pro';

  /** Auto-approve initial email draft without review gate. Preferences default: true. */
  autoApproveDraft?: boolean;

  /** Auto-approve follow-up emails without review gate. Preferences default: true. */
  autoApproveFollowups?: boolean;

  /** Number of follow-up emails per sequence. Int 0-3. Preferences default: 2. */
  followUpCount?: number;

  /** Business days between follow-up emails. Int 1-14. Preferences default: 2. */
  followUpDelayDays?: number;

  // ========== B2B-specific: REQUIRED ==========
  /** Target company name. Non-empty, max 200 chars. */
  companyName: string;

  /** Target company website. Valid URL, max 2048 chars. Auto-prefixes https:// if missing. */
  companyWebsite: string;

  // ========== B2B-specific: DEFAULTED (required on output type) ==========
  /** Background about the user's company for personalization. Max 20000 chars. Zod default: ''. */
  userCompanyContext: string;

  /** Research mode: 'parallel' (default, faster) or 'sequential'. Defaulted via DEFAULT_RESEARCH_MODE. */
  researchMode: 'parallel' | 'sequential';

  /** Bypass cached research and force fresh lookup. Zod default: false. */
  skipResearchCache: boolean;

  // ========== B2B-specific: OPTIONAL ==========
  /** Pre-fetched target company context to override research. Max 10000 chars. */
  targetCompanyContext?: string;

  /** Specific contact person to target. Max 100 chars. */
  contactName?: string;

  /** Job title of the target contact. Max 100 chars. */
  contactTitle?: string;

  /** Email of the target contact. Valid email or empty string ''. */
  contactEmail?: string;

  /** User instructions for the sales approach. Max 10000 chars. Auto-loaded from sourceDocuments if omitted. */
  salesStrategy?: string;

  /** User instructions for research focus areas. Max 10000 chars. Auto-loaded from sourceDocuments if omitted. */
  reconStrategy?: string;

  /** Pre-fetched research to bypass the research step. Max 50000 chars. */
  companyResearch?: string;

  /** Name used in cold email sign-off. Max 100 chars. Auto-populated from user.displayName if omitted. */
  senderName?: string;

  /** When true, auto-selects recommended contacts (skips contact selection gate). API-key users auto-select server-side. */
  autoSelectContacts?: boolean;
}
```

### Input Type (what the Chrome extension SENDS)

All three defaulted fields (`userCompanyContext`, `researchMode`, `skipResearchCache`) are **optional on input**:

```ts
interface B2BSalesRequestInput {
  // Required
  companyName: string;
  companyWebsite: string;

  // Optional base
  sessionId?: string;
  generationId?: string;
  model?: 'flash' | 'pro';
  autoApproveDraft?: boolean;
  autoApproveFollowups?: boolean;
  followUpCount?: number;
  followUpDelayDays?: number;

  // Optional B2B
  userCompanyContext?: string;
  targetCompanyContext?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  salesStrategy?: string;
  reconStrategy?: string;
  companyResearch?: string;
  researchMode?: 'parallel' | 'sequential';
  skipResearchCache?: boolean;
  senderName?: string;
  autoSelectContacts?: boolean;
}
```

## (j) Public Picked Schema

```ts
// B2bSalesPublicRequestSchema — b2b-sales-request.schema.ts:93-98
interface B2bSalesPublicRequest {
  companyName: string;      // REQUIRED
  companyWebsite: string;   // REQUIRED
  contactName?: string;
  contactEmail?: string;
}
```

Derived via `.pick()` so it stays in sync with `B2BSalesRequestSchema` automatically.

Confidence: 100%
Filename: 21-b2b-request-schema.md
