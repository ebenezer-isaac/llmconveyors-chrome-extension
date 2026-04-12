# 20 - Job Hunter Request Schema

**Source:** `libs/shared-types/src/schemas/generate-form.schema.ts`
**Controller:** `api/src/modules/agents/job-hunter/job-hunter.controller.ts` (line 81, `POST /agents/job-hunter/generate`)
**Validation site:** `api/src/modules/agents/agent-orchestration.service.ts` line 317
**Manifest binding:** `api/src/modules/agents/job-hunter/manifest.ts` line 258 (`inputSchema: GenerateApiRequestSchema`)
**DTO re-export:** `api/src/modules/agents/job-hunter/dto/generate-request.dto.ts` line 12 (`GenerateApiRequestSchema = GenerateFormSchema`)

## a) Schema Name

**`GenerateFormSchema`** (`libs/shared-types/src/schemas/generate-form.schema.ts` line 104) — the canonical JH run request schema at the HTTP boundary.

- Type alias: `GenerateForm = z.infer<typeof GenerateFormSchema>` (line 192).
- Public subset: **`JhPublicRequestSchema`** (line 199) via `.pick()`, exposing only 8 fields (used for OpenAPI docs, not validation).
- Re-exported by the API as `GenerateApiRequestSchema` verbatim — no further refinement, wrapping, or extension.

## b) Full Field List

### Base — `BaseGenerateRequestSchema` (lines 48-88), 7 fields

| # | Field | Zod Type | Req | Constraints | Default | Preprocess |
|---|---|---|---|---|---|---|
| 1 | `sessionId` | `z.string()` | optional | `max(512)` | - | - |
| 2 | `generationId` | `z.string()` | optional | `max(512)` | - | - |
| 3 | `model` | `ModelPreferenceSchema` | optional | enum `'flash' \| 'pro'` | - | - |
| 4 | `autoApproveDraft` | `z.boolean()` | optional | - | - | - |
| 5 | `autoApproveFollowups` | `z.boolean()` | optional | - | - | - |
| 6 | `followUpCount` | `z.number().int()` | optional | `min(0).max(3)` | - | string → Number |
| 7 | `followUpDelayDays` | `z.number().int()` | optional | `min(1).max(14)` | - | string → Number |

### JH-specific (lines 104-186), 21 fields

| # | Field | Zod Type | Req | Constraints | Default | Preprocess |
|---|---|---|---|---|---|---|
| 1 | `jobDescription` | `z.string()` | has default | `max(51200)` | `''` | - |
| 2 | `originalCV` | `z.string()` | optional | `max(51200)` | - | - |
| 3 | `extensiveCV` | `z.string()` | optional | `max(51200)` | - | - |
| 4 | `cvStrategy` | `z.string()` | optional | `max(51200)` | - | - |
| 5 | `companyName` | `z.string()` | **REQUIRED** | `min(1).max(512)` | - | - |
| 6 | `jobTitle` | `z.string()` | **REQUIRED** | `min(1).max(512)` | - | - |
| 7 | `companyWebsite` | `z.string().url()` | **REQUIRED** | `max(2048)` | - | auto-prefix `https://` if missing scheme |
| 8 | `contactName` | `z.string()` | optional | `max(512)` | - | - |
| 9 | `contactTitle` | `z.string()` | optional | `max(512)` | - | - |
| 10 | `contactEmail` | `z.string().email().or(z.literal(''))` | optional | email format OR empty string | - | - |
| 11 | `genericEmail` | `z.string().email().or(z.literal(''))` | optional | email format OR empty string | - | - |
| 12 | `coverLetterStrategy` | `z.string()` | optional | `max(51200)` | - | - |
| 13 | `coldEmailStrategy` | `z.string()` | optional | `max(51200)` | - | - |
| 14 | `reconStrategy` | `z.string()` | optional | `max(51200)` | - | - |
| 15 | `companyProfile` | `z.string()` | optional | `max(51200)` | - | - |
| 16 | `jobSourceUrl` | `z.string().url().or(z.literal(''))` | optional | `max(2048)` OR empty string | - | - |
| 17 | `emailAddresses` | `z.string()` | optional | `max(51200)` | - | - |
| 18 | `mode` | `z.enum(['standard','cold_outreach'])` | has default | - | `'standard'` | - |
| 19 | `theme` | `z.enum(ALLOWED_THEMES)` | optional | enum (imported from `preferences.ts`) | - | - |
| 20 | `autoSelectContacts` | `z.boolean()` | optional | - | - | `'true'` → true, `'false'` → false |
| 21 | `skipResearchCache` | `z.boolean()` | optional | - | - | `'true'` → true, `'false'` → false |

**Total fields after `.extend()`: 28** (7 base + 21 JH).

### Constants (lines 17-23)
- `MAX_CONTENT_LENGTH = 50 * 1024` (51200 bytes) — applied to every long-text field
- `MAX_SHORT_TEXT = 512` — applied to `sessionId`, `generationId`, `companyName`, `jobTitle`, `contactName`, `contactTitle`
- `MAX_URL_LENGTH = 2048` — applied to `companyWebsite`, `jobSourceUrl`

## c) Inheritance Split
- **Base (7 fields):** `sessionId`, `generationId`, `model`, `autoApproveDraft`, `autoApproveFollowups`, `followUpCount`, `followUpDelayDays`
- **JH-specific (21 fields):** everything else in the table above

## d) Discriminator
**None.** `GenerateFormSchema` is a plain `.extend()` of `BaseGenerateRequestSchema` — no discriminator field. Agent type (`job-hunter`) is routed by URL path (`POST /agents/job-hunter/generate`), not by a schema field. `mode` differentiates output artifacts (CV + cover letter vs CV + cold email) but is not a Zod discriminated union.

## e) Strict / Strip / Passthrough

**`.strip()` (Zod default).** The schema is built as `z.object({...}).extend({...})` without `.strict()` or `.passthrough()`. Consequences:

- Unknown fields are **silently dropped** during `.safeParse()` — no 400 error for extras.
- This is load-bearing for the Chrome extension: the extension can safely include scraper metadata (e.g. `url`, `scrapedAt`, `domain`, `scrapeSource`) in the POST body and the server will discard them without complaint.
- `FormValidationSchema` (`api/src/modules/agents/job-hunter/validators/form.validator.ts` line 19) is a `.superRefine()` wrapper with mode-specific rules (requires `jobDescription` non-empty for standard mode). **This wrapper is NOT used at the HTTP boundary** — it is for the settings-page frontend only. The boundary uses raw `GenerateFormSchema` via `manifest.inputSchema.safeParse(rawBody)`.

## f) Strategy Fields
All four strategy fields are **OPTIONAL** at the HTTP boundary:
- `cvStrategy` (line 122)
- `coverLetterStrategy` (line 158)
- `coldEmailStrategy` (line 159)
- `reconStrategy` (line 160)

Docstrings (lines 99-103, 124, 158-160) confirm: "auto-loaded from sourceDocuments" by backend post-validation. The orchestration service enriches `parsedData` with user's stored strategies, master resume, and source docs before handing off to the pipeline. Clients should omit these; extension should never send them.

## g) Lean-Client Minimal Required Fields

Only **3 fields** are strictly required to pass `GenerateFormSchema.safeParse()`:
1. `companyName` — `min(1)`
2. `jobTitle` — `min(1)`
3. `companyWebsite` — must parse as URL after auto-prefix

`jobDescription` has `.default('')` so omitting it **does** pass Zod validation at the boundary (no 400). However:
- Orchestration logs & downstream pipeline steps assume non-empty JD.
- The MVP extension should always scrape and send `jobDescription` to avoid degraded output.
- Lean-client contract for the extension MVP: send **4 fields** (`companyName`, `jobTitle`, `companyWebsite`, `jobDescription`).

All other context (`originalCV`, strategies, `extensiveCV`, `companyProfile`) auto-loads from `sourceDocuments`/master-resume per docstrings (lines 99-103).

## h) Controller Input Path (verified against source)

```
POST /agents/job-hunter/generate
  ↓
JobHunterController.generate()                         [job-hunter.controller.ts:81]
  @Body() rawBody: Record<string, unknown>              ← NO ZodValidationPipe at controller level
  ↓
orchestrationService.orchestrateGenerate(
  'job-hunter', user, rawBody)                         [agent-orchestration.service.ts:308]
  ↓
manifest.inputSchema.safeParse(rawBody)                [line 317]
  where manifest.inputSchema === GenerateApiRequestSchema
                              === GenerateFormSchema   [job-hunter/manifest.ts:258]
  ↓
On failure → 400 BadRequestException {code:'VALIDATION_ERROR', details: flatten()}
On success → parsedData used for context loading, JD pre-processing, job enqueue
```

**Key implications for the extension:**
1. The controller does **not** apply `ZodValidationPipe` to the body — validation is deferred to the orchestration service, giving a uniform 400 payload shape.
2. Extra fields are stripped (not rejected) — `.strip()` default.
3. `jobDescription` omitted → `''` default → passes Zod but leads to poor pipeline output.
4. Auto-loading of master resume (`originalCV`) happens AFTER parse (lines 338-353) — extension must not send the user's CV.
5. JD pre-processing (lines 355+) may overwrite `companyName`, `jobTitle`, `companyWebsite`, `jobDescription` with values extracted from the JD text — the extension's scraped values are authoritative only when JD extraction yields nothing.

## TypeScript Interfaces (extension contract)

```typescript
// Minimal lean-client contract — what the extension should always send
interface JhRunRequestMinimal {
  companyName: string;        // required, 1-512 chars
  jobTitle: string;           // required, 1-512 chars
  companyWebsite: string;     // required, URL (backend auto-prefixes https://)
  jobDescription: string;     // technically optional (default ''), but send it
}

// Full type (for reference — extension should send only the minimal set)
interface JhRunRequestFull extends JhRunRequestMinimal {
  // Base (inherited, all optional)
  sessionId?: string;
  generationId?: string;
  model?: 'flash' | 'pro';
  autoApproveDraft?: boolean;
  autoApproveFollowups?: boolean;
  followUpCount?: number;       // 0-3
  followUpDelayDays?: number;   // 1-14
  // JH context (backend auto-loads from sourceDocuments -- DO NOT send)
  originalCV?: string;
  extensiveCV?: string;
  cvStrategy?: string;
  coverLetterStrategy?: string;
  coldEmailStrategy?: string;
  reconStrategy?: string;
  companyProfile?: string;
  // Contact info
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string | '';   // empty literal allowed
  genericEmail?: string | '';   // empty literal allowed
  // Source / config
  jobSourceUrl?: string | '';   // empty literal allowed
  emailAddresses?: string;      // comma-separated
  mode?: 'standard' | 'cold_outreach';  // default 'standard'
  theme?: typeof ALLOWED_THEMES[number];
  autoSelectContacts?: boolean;
  skipResearchCache?: boolean;
}
```

## Public Subset (`JhPublicRequestSchema`, line 199)
Derived via `.pick()` — exposes only: `companyName`, `jobTitle`, `jobDescription`, `companyWebsite`, `contactName`, `contactEmail`, `mode`, `theme`. Strategies, IDs, CV fields, `genericEmail`, `jobSourceUrl`, `emailAddresses`, `theme` control toggles are excluded. Used for OpenAPI / SDK surface, NOT at the validation boundary.

## Fields ADDED Post-Parse (not client-facing)

The orchestration service adds these after `safeParse` succeeds — the extension must never send them:
- `rawJobInput` — set to the original `jobDescription` text when JD pre-processing rewrites the description (line 374)
- `originalCV` — auto-injected from master-resume query when omitted (lines 340-348)
- `companyWebsite`, `companyName`, `jobTitle`, `jobDescription` — may be rewritten by JD pre-processing when `manifest.supportsJdPreProcessing` is true (lines 367-378)

Because the schema uses `.strip()`, sending `rawJobInput` or any other unknown key is harmless (dropped) but wasteful.
