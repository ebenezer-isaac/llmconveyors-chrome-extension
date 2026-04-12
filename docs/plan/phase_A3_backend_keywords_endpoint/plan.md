# Phase A3 — Backend skills-extraction endpoint

## Phase metadata

| Field | Value |
|---|---|
| **Plan** | 100 — Chrome Extension MVP + V1 Decision Memo (v2, locked 2026-04-11) |
| **Phase code** | A3 |
| **Phase name** | Backend skills-extraction endpoint (`POST /api/v1/ats/extract-skills`) |
| **Repo** | `e:/llmconveyors.com` (existing private NestJS backend, `ebenezer-isaac/llmconveyors.com`) |
| **Day / date** | Day 2 — 2026-04-13 (Tue) |
| **Runs in parallel with** | A4 (frontend extension-signin page), A5 (extension background + messaging), B2 (engine core types), B3 (Mozilla heuristics port) |
| **Depends on** | Nothing. Taxonomy service already loaded at boot via `TaxonomyModule` (global). No schema migration, no queue wiring, no new external deps. |
| **Blocks** | A9 (content script intent detection + keyword highlight calls this endpoint via the background worker) |
| **Estimated effort** | 2 hours (controller 20m, service 45m, tests 45m, blueprint + exports + compliance 10m) |
| **Confidence** | 9/10. Single uncertainty flagged under "Step-by-step implementation — step 3" below: the `category` enum mapping from `skill-taxonomy@v3.0.1`'s rich `SkillEntry.category` (freeform, e.g. `'programming-language'`, `'clinical'`, `'cad-tool'`) to the 4-value plan enum (`'hard'\|'soft'\|'tool'\|'domain'`). Mapping is specified deterministically in §Step 3 but the executor should verify the exhaustive list of `SkillEntry.skillType`/`category` values present in the bundled `skill-taxonomy.json` match the mapping table. |
| **Scope** | 3 source files created, 3 files modified, 2 test specs created. ~420 LoC source + ~280 LoC test + ~30 LoC blueprint additions = ~730 LoC net additions. |
| **Files touched** | 6 (3 create, 3 modify) + 2 new test specs |

---

## Required reading

Executor MUST read these files before writing any code. They are all short. Skipping any of them will cause architectural drift.

### Context / decision source of truth
1. **`temp/impl/100-chrome-extension-mvp/00-decision-memo.md`** — the locked v2 decision memo for plan 100.
   - §2.8 "Keyword extraction flow" (lines 154-164) — describes end-to-end flow from content-script detection through highlight rendering. This phase implements step 5 (backend runs Aho-Corasick scan against private skill-taxonomy corpus, returns keywords).
   - §2.9 "Backend endpoint spec" (lines 166-178) — the ENDPOINT CONTRACT. Path, guards, scope, rate limit, Zod shapes all pinned. This phase ships exactly that contract.
   - §6.3 "Non-functional" (line 377) — acceptance criterion: `POST /api/v1/ats/extract-skills` responds < 100ms for 10KB JD.

### Investigation artifacts (read these for WHY each pattern is mandatory)
2. **`temp/impl/100-chrome-extension-mvp/investigation/05-scope-guard.md`** — full audit of `ScopeGuard`. Critical facts:
   - SuperTokens session auth (`authSource !== 'api-key'`) **bypasses all scope checks** (line 13-19). The extension's eventual SuperTokens-via-Bearer flow from A2 produces `authSource === 'supertokens'` → scope is effectively ignored for session calls.
   - API-key callers need `ats:write` scope, wildcard `*` grants all, missing `@RequireScope` allows any authenticated caller.
   - `ScopeGuard` MUST be listed AFTER `AuthGuard` in `@UseGuards(...)` (BUG-13 fail-fast at `scope.guard.ts:43-47`).
3. **`temp/impl/100-chrome-extension-mvp/investigation/07-rate-limits.md`** — full audit of throttling. Critical facts:
   - `ThrottlerModule` is registered globally, in-memory (per-pod state, no Redis coordination). Per-pod counters reset on deploy.
   - `@Throttle()` v6 syntax is `@Throttle({ default: { ttl: <ms>, limit: <n> } })` (see line 41 `content.controller.ts` cited at investigation/07 row 1 of §c).
   - Default tracker is IP-based (`req.ips[0] ?? req.ip`). NAT/CGNAT risk noted in §j, but for a 60/min bucket on a deterministic-compute endpoint that risk is negligible.
   - There is NO `UsageRateLimitGuard` on `/ats/*` endpoints — credit metering is only on agent-generate paths. This new endpoint does NOT consume credits and does NOT need `UsageRateLimitGuard`.
4. **`temp/impl/100-chrome-extension-mvp/investigation/18-error-envelope.md`** — full audit of `ApiExceptionFilter` + `ResponseTransformInterceptor`. Critical facts:
   - Global `ApiExceptionFilter` wraps ALL errors into `{ success: false, error: { code, message, hint?, details? }, requestId, timestamp, path }`. Controllers just throw `HttpException` subclasses — do NOT hand-build error bodies.
   - Global `ResponseTransformInterceptor` wraps successful JSON returns into `{ success: true, data: <handlerReturn>, requestId, timestamp }`. **Handler MUST return the inner `data` shape, NOT pre-wrap it.** If the handler returns `{ success: true, data: {...} }`, the interceptor double-wraps to `{ success: true, data: { success: true, data: {...} }, requestId, timestamp }`. This is a recurring drift bug; mirror `AtsController.score()` which returns the bare result.
   - Zod `ZodValidationPipe` errors become 400 with `error.code === 'VALIDATION_ERROR'` and `error.details = ZodError.flatten()`. No additional error mapping needed.

### Backend source files to read in full
5. **`api/src/modules/ats/ats.module.ts`** — 29 lines. Add new controller + service to `controllers` and `providers` arrays. Do NOT import `TaxonomyModule` — it is `@Global()` (`api/src/modules/taxonomy/taxonomy.module.ts:14`), so `TAXONOMY_SERVICE` is already in the DI container.
6. **`api/src/modules/ats/ats.controller.ts`** — 71 lines. This is the template for the new controller: same guards stack (`AuthGuard, ScopeGuard`), same audit interceptor (`ApiKeyAuditInterceptor`), same `@RequireScope('ats:write')`, same Zod pipe pattern (`@Body(new ZodValidationPipe(Schema))`), same `@CurrentUser()` injection. Copy the decorator stack verbatim.
7. **`api/src/modules/ats/services/keyword-scorer.service.ts` lines 1-80** — shows the EXISTING skill-taxonomy injection pattern that MUST be reused. Key lines:
   - Line 33: `import { TAXONOMY_SERVICE, type ITaxonomyService, type SkillTaxonomy } from '../../../core/ports/taxonomy.port';`
   - Line 34: `import { AhoCorasickAutomaton, buildAutomaton } from 'skill-taxonomy';`
   - Lines 46-62: taxonomy service injected, automaton built once in constructor, version cached for staleness check.
   - Lines 69-78: `ensureAutomatonCurrent()` rebuilds automaton when dynamic skills are loaded. **The new service MUST call the same helper or replicate the same version-check pattern.**
8. **`api/src/core/ports/taxonomy.port.ts`** — 101 lines. Port interface for `ITaxonomyService`. The new service injects via `TAXONOMY_SERVICE` symbol and calls: `getTaxonomy()`, `getReverseLookup()`, `getCanonicalSkills()`, `getVersion()`, `getSkillEntry(canonical)`. Do NOT call `recordLowConfidence()` — this endpoint is a fast read-only path, not a miss-tracking path.
9. **`api/src/modules/ats/blueprint.ts`** — 94 lines. The ATS module blueprint. Append a new endpoint entry to the `endpoints: []` array (currently empty). Preserve all existing invariants.
10. **`libs/shared-types/src/index.ts` lines 25-50** — shows where schema modules are re-exported. Add `export * from './schemas/ats-extract-skills.schema';` next to the existing `ats-score` re-export (line 33).
11. **`libs/shared-types/src/schemas/ats-score.schema.ts` lines 1-50** — reference for Zod style (use `.describe()` on every field, `.strict()` on objects, `z.infer` for TS types, export both the schema and the type).
12. **`api/src/common/filters/api-exception.filter.ts`** and **`api/src/common/interceptors/response-transform.interceptor.ts`** — do NOT edit. Read the envelope behavior described in investigation/18 to understand what to return and what NOT to return (never pre-wrap).

### Skill-taxonomy package type reference (read, don't edit)
13. **`node_modules/.pnpm/skill-taxonomy@git+.../node_modules/skill-taxonomy/dist/types/taxonomy.types.d.ts`** — the `SkillEntry` interface shape (`aliases`, `category`, `skillType`, `description`, `broaderTerms`, ...). Used indirectly via `ITaxonomyService.getSkillEntry()` which returns a subset (`canonical, aliases, broaderTerms, relatedSkills, complementarySkills, alternativeSkills, ecosystem, category`).
14. **`node_modules/.pnpm/skill-taxonomy@git+.../node_modules/skill-taxonomy/dist/aho-corasick.d.ts`** — `AhoCorasickAutomaton` interface. Methods used: `search(text)` returns `AhoCorasickMatch[]` (each with `pattern, canonical, position, length`), `extractSkills(text)` returns `Set<canonical>`, `countOccurrences(text)` returns `Map<canonical, count>`.

### Rules files (read for correctness)
15. **`.claude/rules/code-quality.md`** — no stubs, no bandaids, no dead code. If something is unclear STOP and ask (via a `TODO: verify` comment in the file, NOT a runtime stub).
16. **`.claude/rules/blueprint-driven-development.md`** — blueprint MUST be updated in the same phase as the new endpoint.
17. **`api/CLAUDE.md`** — NestJS hexagonal architecture rules. This service is an adapter (it depends on the npm package `skill-taxonomy` and on the NestJS DI) so it lives in `api/src/modules/ats/services/`, NEVER in `api/src/core/`.

---

## Files to create

### 1. `api/src/modules/ats/controllers/extract-skills.controller.ts` — NEW (~65 LoC)

New controller, separate from existing `ats.controller.ts` (which lives in `api/src/modules/ats/ats.controller.ts`). Keeping them separate matches the pattern of the `content` module (`content.controller.ts` + `content-source.controller.ts`) and keeps each controller file under the coding-style 200-line budget.

**Location**: a new `controllers/` sub-directory under `api/src/modules/ats/`. The existing `ats.controller.ts` stays where it is (do NOT move it — moving it would be an unrelated refactor and violate the single-phase-single-goal rule).

**Responsibilities**:
- Receive POST requests on `/ats/extract-skills`
- Guard stack: `@UseGuards(AuthGuard, ScopeGuard)` (same as existing ats controller)
- Interceptor: `@UseInterceptors(ApiKeyAuditInterceptor)` (same as existing ats controller — ensures API-key calls are audited)
- Validation: `ZodValidationPipe(ExtractSkillsRequestSchema)` on body
- Scope: `@RequireScope('ats:write')` (same as existing `/ats/score`)
- Rate limit: `@Throttle({ default: { ttl: 60_000, limit: 60 } })` — 60/min per IP (deterministic compute, no LLM, no external API call)
- HTTP code: `@HttpCode(HttpStatus.OK)` (200 not 201, since we're returning computed data not creating a resource)
- Swagger: `@ApiTags('ATS Scoring')`, `@ApiBearerAuth('bearer')`, `@ApiSecurity('api-key')`, `@ApiOperation`, `@ApiResponse(200/400/401/403/429)`

### 2. `api/src/modules/ats/services/skills-extractor.service.ts` — NEW (~115 LoC)

Thin service wrapping `ITaxonomyService`. Owns no state except a cached `AhoCorasickAutomaton` + version number, mirroring `KeywordScorerService` lines 46-78.

**Responsibilities**:
- Inject `TAXONOMY_SERVICE` via its symbol
- Build automaton once in constructor via `buildAutomaton(taxonomyService.getReverseLookup())`
- Rebuild when `taxonomyService.getVersion()` advances (copy the `ensureAutomatonCurrent()` private method pattern)
- Public method `extract(text, options, context)` returns `{ keywords: ExtractedSkill[]; missing: ExtractedSkill[] }`
- Per-skill scoring: deterministic weighted formula documented in Step 3
- Category mapping: deterministic `SkillEntry.category`/`SkillEntry.skillType` → `'hard'|'soft'|'tool'|'domain'` via a const table

### 3. `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` — NEW (~55 LoC)

Zod schemas + inferred types. Exported from `libs/shared-types/src/index.ts`.

Contents (verbatim — see "Code snippets" § below for the full file):
- `ExtractSkillsRequestSchema` — strict object, `text` bounded 1..50_000, `options` optional with `topK` (default 40), `categories` (optional enum array), `includeMissing` (default false), `resumeText` (optional, used only when `includeMissing=true`)
- `ExtractSkillsRequest` type alias
- `ExtractedSkillSchema` — strict object, `term`, `category` enum, `score` 0..1, `occurrences`, `canonicalForm`
- `ExtractedSkill` type alias
- `ExtractSkillsResponseSchema` — strict object, `success: true` literal, nested `data: { keywords, missing?, tookMs }`
- `ExtractSkillsResponse` type alias

### 4. `api/src/modules/ats/__tests__/extract-skills.controller.spec.ts` — NEW (~170 LoC)

End-to-end controller test using `Test.createTestingModule()`. Mocks `ITaxonomyService` with a minimal fake automaton. Covers happy path + adversarial cases (see §Tests to write for the full list).

### 5. `api/src/modules/ats/__tests__/skills-extractor.service.spec.ts` — NEW (~140 LoC)

Unit test for the extractor service. Provides a fake `ITaxonomyService` with a hand-built 6-skill taxonomy and runs the service directly. Covers the scoring formula, category mapping, version-bump rebuild, and the `includeMissing` branch.

---

## Files to modify

### 1. `api/src/modules/ats/ats.module.ts` — MODIFY (+4 lines)

Add the new controller and service to the NestJS `@Module()` decorator. Do NOT add an import for `TaxonomyModule` (it's already `@Global()` from `app.module.ts:90`).

Diff-in-spirit:
```diff
 import { HybridAtsScorerAdapter } from './adapters/hybrid-ats-scorer.adapter';
+import { ExtractSkillsController } from './controllers/extract-skills.controller';
+import { SkillsExtractorService } from './services/skills-extractor.service';
 import { ATS_SCORER } from '../../core/ports/ats-scorer.port';

 @Module({
   imports: [AIModule, SkillGraphModule],
-  controllers: [AtsController],
+  controllers: [AtsController, ExtractSkillsController],
   providers: [
     KeywordScorerService,
     TraceSynthesisService,
     ExperienceParserService,
     JdRequirementsParserService,
     VerbImpactAnalyzerService,
     RecencyWeighterService,
+    SkillsExtractorService,
     { provide: ATS_SCORER, useClass: HybridAtsScorerAdapter },
   ],
-  exports: [ATS_SCORER, KeywordScorerService, TraceSynthesisService],
+  exports: [ATS_SCORER, KeywordScorerService, TraceSynthesisService, SkillsExtractorService],
 })
 export class AtsModule {}
```

`SkillsExtractorService` is exported so future callers (tinker-ats debug controller, keyword-planner v1.1) can inject it directly without re-instantiating the automaton. Controllers are never exported — they're registered, not injected.

### 2. `libs/shared-types/src/index.ts` — MODIFY (+1 line)

Add a re-export next to the existing `ats-score` line (currently line 33):
```diff
 // ATS scoring
 export * from './schemas/ats-score.schema';
+export * from './schemas/ats-extract-skills.schema';
```

### 3. `api/src/modules/ats/blueprint.ts` — MODIFY (+ ~30 lines into `endpoints: []`)

Append a new endpoint entry. Keep all existing invariants untouched. The endpoint object follows the `ModuleBlueprint` type shape (see other modules' blueprints for examples, e.g. `api/src/modules/auth/blueprint.ts`, `api/src/modules/content/blueprint.ts`). Populate:
- `method: 'POST'`
- `path: '/api/v1/ats/extract-skills'`
- `handler: 'modules/ats/controllers/extract-skills.controller.ts:ExtractSkillsController.extractSkills'`
- `guards: ['AuthGuard', 'ScopeGuard']`
- `requiredScope: 'ats:write'`
- `rateLimit: { ttlMs: 60_000, limit: 60 }`
- `request`: path to `ExtractSkillsRequestSchema` via sourceRef
- `response`: path to `ExtractSkillsResponseSchema` via sourceRef
- `description`: "Deterministic Aho-Corasick skill extraction from free-text job description. Thin read-only wrapper around the skill-taxonomy corpus used by /ats/score. No LLM call, no DB write, no credit deduction. Consumed by the Chrome extension keyword-highlight feature."
- `consumers`: `['llmconveyors-chrome-extension (phase A9)']`
- `notes`: `['Session auth bypasses scope check (standard ScopeGuard behavior)', 'Response time target: <100ms for 10KB input']`

If the executor is uncertain about exact field names in `ModuleBlueprint` type, grep `libs/shared-types/src/blueprint.ts` (or wherever the type lives — grep for `export interface ModuleBlueprint` across `libs/shared-types/src/`) and mirror an existing populated entry.

---

## Step-by-step implementation

### Step 0 — sanity check the environment

Before writing anything:
1. Confirm `skill-taxonomy` is on `v3.0.1` in `api/package.json`: grep for `"skill-taxonomy"` — expect `"github:ebenezer-isaac/skill-taxonomy#v3.0.1"` or a pnpm lockfile pin to that SHA.
2. Confirm `TaxonomyModule` is globally imported in `api/src/app.module.ts` (line 90 per investigation).
3. Confirm `pnpm typecheck:api` is green on a clean checkout — if it's red, STOP and fix the pre-existing error before starting this phase (code-quality rule: fix all bugs in blast radius).
4. Confirm `pnpm test:api:module ats` is green on a clean checkout.

### Step 1 — create the Zod schemas in shared-types

Create `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` with the full contents in §"Code snippets / 1 (full file)" below.

Then:
```bash
pnpm -F @repo/shared-types build
```
This must succeed before anything in `api/src` can reference the new types (shared-types is built-first per workspace rule).

### Step 2 — export from shared-types barrel

Edit `libs/shared-types/src/index.ts`: add the single-line re-export after the existing `ats-score` re-export. Re-run `pnpm -F @repo/shared-types build` to verify the new types are present in `dist/`.

### Step 3 — implement the service

Create `api/src/modules/ats/services/skills-extractor.service.ts`. Full contents in §"Code snippets / 2 (full file)" below. The non-obvious design points:

#### 3.1 — automaton lifecycle
Copy the constructor + `ensureAutomatonCurrent()` pattern from `keyword-scorer.service.ts:51-78` verbatim. DI token is `TAXONOMY_SERVICE`, accessor methods are `getReverseLookup()` and `getVersion()`, automaton builder is `buildAutomaton(reverseLookup)` from `'skill-taxonomy'`. This is the mandated reuse path — do NOT call `buildReverseLookup()` or re-read the corpus from disk. There is only one automaton instance per process per taxonomy version, shared implicitly through `TaxonomyService` (not literally shared — each service instance builds its own, but both services invalidate on the same `getVersion()` bump, so the rebuild cost is paid at most once per service per dynamic-skill reload event).

#### 3.2 — scoring formula
Given a match `m = { pattern, canonical, position, length }` and the full match list from `automaton.search(text)`:

```
occurrences[canonical] = countOccurrences(text).get(canonical) ?? 0
firstPosition[canonical] = min(m.position for matches of canonical)
relativePosition[canonical] = 1 - (firstPosition[canonical] / text.length)   // earlier = higher
frequencyScore[canonical] = min(1, log2(1 + occurrences[canonical]) / 3)      // diminishing returns, caps at occurrences ≥ 7
categoryWeight[canonical] = CATEGORY_WEIGHT[mappedCategory]                   // see 3.3
score[canonical] = clamp01(
  0.55 * frequencyScore[canonical] +
  0.25 * relativePosition[canonical] +
  0.20 * categoryWeight[canonical]
)
```

Constants:
```ts
const CATEGORY_WEIGHT: Record<'hard' | 'soft' | 'tool' | 'domain', number> = {
  hard: 1.0,     // hard technical skills — primary match signal
  tool: 0.9,     // tools / frameworks — strong signal
  domain: 0.75,  // domain knowledge — medium signal
  soft: 0.5,     // soft skills — weakest signal (frequently boilerplate)
};
```

Ranking: sort descending by `score`, tiebreak by `occurrences` desc, then `term` asc. Apply `topK` clamp after sort. If `options.categories` is set, filter BEFORE topK clamp.

**Output term**: use the original surface form from the first match position (`text.slice(firstPos, firstPos + length)`) — preserves user casing. `canonicalForm` is the lowercased canonical from the reverse lookup.

#### 3.3 — category mapping (the 1 uncertainty)

The plan enum is `'hard' | 'soft' | 'tool' | 'domain'`. The `skill-taxonomy@v3.0.1` package exposes two category-adjacent fields on `SkillEntry`:
- `category: string` — freeform best-fit category, e.g. `'programming-language'`, `'cad-tool'`, `'clinical'`, `'soft-skill'`, `'database'`
- `skillType: string` — classification, e.g. `'tool'`, `'framework'`, `'language'`, `'methodology'`, `'certification'`

Map via a two-pass deterministic table. `ITaxonomyService.getSkillEntry(canonical)` returns only a subset (no `skillType` — see `taxonomy.port.ts:41-50`), so the mapping uses `category` plus `ecosystem` as a tiebreaker:

```ts
function mapCategory(category: string, ecosystem: string): 'hard' | 'soft' | 'tool' | 'domain' {
  const lower = (category ?? '').toLowerCase();
  if (!lower) return 'hard';  // default fallback: treat unmapped as hard skill

  // Explicit soft-skill markers
  if (lower.includes('soft') || lower.includes('interpersonal') || lower.includes('communication')) {
    return 'soft';
  }

  // Tools / frameworks / platforms
  if (
    lower.includes('tool') ||
    lower.includes('framework') ||
    lower.includes('platform') ||
    lower.includes('ide') ||
    lower.includes('library') ||
    lower.includes('software')
  ) {
    return 'tool';
  }

  // Domain knowledge: industry / methodology / practice
  if (
    lower.includes('domain') ||
    lower.includes('industry') ||
    lower.includes('methodology') ||
    lower.includes('practice') ||
    lower.includes('clinical') ||
    lower.includes('finance') ||
    lower.includes('legal') ||
    lower.includes('healthcare') ||
    lower.includes('manufacturing')
  ) {
    return 'domain';
  }

  // Hard technical skills (default for programming languages, databases, etc.)
  return 'hard';
}
```

**TODO: verify mapping table coverage.** The executor should, as the final step of implementing the service, run a one-off node script against the bundled `skill-taxonomy.json` (`node_modules/.pnpm/skill-taxonomy@.../dist/skill-taxonomy.json`) to enumerate the distinct `category` values present in the corpus and confirm the substring table routes every one of them into a valid bucket. If any `category` value routes to the fallback (`'hard'`) unintentionally, add it to an explicit branch. Do NOT commit the one-off enumeration script; it's a verification aid, not production code.

This is the single confidence-below-10 uncertainty in the plan. The substring table above is defensible for V1 POC (the extension is shown to Michael on April 20 against a handful of real JDs, and a small number of mislabeled skills is not demo-breaking — all four categories get returned, they're just imperfect). For post-POC hardening, the backend team will likely migrate to an explicit exhaustive `category → bucket` lookup or add `skillType` to `ITaxonomyService.getSkillEntry()`. Flag in blueprint `notes`.

#### 3.4 — entry resolution
For each unique canonical from `automaton.extractSkills(text)`:
1. `const entry = this.taxonomyService.getSkillEntry(canonical);`
2. If `entry === null` (dynamic skill, no rich metadata): default category to `'hard'`, canonicalForm = canonical, term = first matched surface form.
3. If `entry !== null`: call `mapCategory(entry.category, entry.ecosystem)`, canonicalForm = `entry.canonical`, term = first matched surface form.

#### 3.5 — includeMissing branch
If `options.includeMissing === true`:
- `options.resumeText` MUST be present. If absent, the CONTROLLER (not the service) throws `BadRequestException({ code: 'VALIDATION_ERROR', message: 'resumeText is required when includeMissing=true' })`. This is a controller-level semantic check that Zod can't express cleanly (conditional on another field) — see Step 4.
- The service runs a second `automaton.extractSkills(resumeText)` pass, produces the set of canonicals present in the resume.
- `missing = keywords.filter(k => !resumeCanonicals.has(k.canonicalForm))` — same scoring, same sort, same topK clamp.

If `options.includeMissing === false` (the default), the service returns `missing: []` unconditionally, and the controller omits the `missing` field from the response body.

#### 3.6 — input safety
- Text is already bounded 1..50_000 by Zod; no further length check needed.
- Normalize: `const normalized = text.normalize('NFKC').slice(0, 50_000);` — defensive slice in case of Unicode expansion past the Zod byte count (realistically impossible after Zod, but `String.normalize` can change length).
- Lowercase happens inside the automaton; do NOT pre-lowercase the input text (we need original casing for the returned `term`).
- Never log the full text body (PII risk from pasted JDs — JDs can include internal hiring-manager notes). Log only `{ textLength, topK, categoriesFilter, userUid, tookMs }`.

### Step 4 — implement the controller

Create `api/src/modules/ats/controllers/extract-skills.controller.ts`. Full contents in §"Code snippets / 3 (full file)" below. Notable points:

1. **Import path for `ZodValidationPipe`**: same as existing ats controller — `import { ZodValidationPipe } from 'nestjs-zod';`
2. **Guards order**: `@UseGuards(AuthGuard, ScopeGuard)` — AuthGuard MUST come first (ScopeGuard reads `request.user`, BUG-13 fail-fast).
3. **Controller-level `@RequireScope('ats:write')`**: matches the existing `ats.controller.ts:31` pattern. Applied at controller class level; no need to repeat on the method.
4. **API-key audit interceptor**: `@UseInterceptors(ApiKeyAuditInterceptor)` at class level — same as existing ats controller, ensures API-key calls to `/ats/*` are audited for post-incident review.
5. **Rate limit decorator**: `@Throttle({ default: { ttl: 60_000, limit: 60 } })` at the method level. Do NOT put it at class level (would apply to every future method in the file). Uses the global `default` throttler name to avoid needing a new throttler config entry.
6. **HTTP status**: `@HttpCode(HttpStatus.OK)` — 200 not 201, this is a compute operation not a resource creation.
7. **Zod validation pipe**: `@Body(new ZodValidationPipe(ExtractSkillsRequestSchema))` — 400s with `error.code === 'VALIDATION_ERROR'` + `error.details = flatten()` are handled entirely by the global filter.
8. **Conditional `includeMissing` check**: after Zod passes, if `body.options?.includeMissing === true && !body.options?.resumeText`, throw `new BadRequestException({ code: 'VALIDATION_ERROR', message: 'resumeText is required when includeMissing=true' })`. This is a cross-field constraint Zod can express via `.refine()` but keeping it in the controller makes the shared-types schema readable without a conditional refinement (easier for external SDK consumers to understand).

   Alternative: use a Zod `.superRefine()` on the outer schema. Either approach is fine; the executor should prefer `.superRefine()` in the schema file if they can express it cleanly in under 10 lines. If the refinement complicates the schema beyond ~10 lines, keep it in the controller for readability. Both are equivalent from a behavior standpoint.
9. **Return shape**: return `{ keywords, missing?: ... | undefined, tookMs }` — the BARE data object, NOT pre-wrapped in `{ success, data, ... }`. The global `ResponseTransformInterceptor` wraps it. (Investigation/18 is explicit: pre-wrapping causes double-wrap bugs.)
10. **Timing**: measure `const start = Date.now(); ... const tookMs = Date.now() - start;` around the service call. Include in the response.
11. **Logger**: `private readonly logger = new Logger(ExtractSkillsController.name);` — log each call at `log` level with `userUid`, `textLength`, `topK`, and `tookMs`. Never log the text body.

### Step 5 — wire into the module

Edit `api/src/modules/ats/ats.module.ts` per the diff in §"Files to modify / 1".

### Step 6 — update the blueprint

Edit `api/src/modules/ats/blueprint.ts`. Append the new endpoint entry to the `endpoints: []` array per §"Files to modify / 3". Verify the blueprint compiles (`pnpm -F @repo/shared-types build` picks up any Zod type change, then `pnpm typecheck:api`).

### Step 7 — write the tests

Create both test files per §"Tests to write" below.

### Step 8 — run the compliance gates

See §"Compliance gates" at the bottom of this plan.

### Step 9 — one-off category-mapping audit (non-committed)

After the service is implemented, run the one-off node script described in Step 3.3 to verify the category-substring table covers all `category` values in the bundled `skill-taxonomy.json`. If a significant number of skills fall through to the `'hard'` fallback unexpectedly, add explicit substrings. Do NOT commit the script.

---

## Code snippets (critical patterns)

### 1. `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` (FULL FILE)

```ts
import { z } from 'zod';

/**
 * Plan 100 phase A3 — schemas for POST /api/v1/ats/extract-skills.
 *
 * Thin deterministic Aho-Corasick skill extraction from free-text job descriptions.
 * Consumed by the Chrome extension keyword-highlight feature. No LLM call, no credit
 * deduction, no side effects.
 */

/** Allowed skill category buckets returned by the extractor. */
export const SkillCategorySchema = z
  .enum(['hard', 'soft', 'tool', 'domain'])
  .describe(
    "Coarse skill bucket. 'hard' = technical (languages, databases), 'tool' = tools/frameworks/IDEs, 'domain' = industry/methodology (clinical, finance), 'soft' = interpersonal",
  );
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/** Single extracted skill row in the response. */
export const ExtractedSkillSchema = z
  .object({
    term: z
      .string()
      .describe('Original surface form as it appeared in the input text (preserves user casing)'),
    category: SkillCategorySchema,
    score: z
      .number()
      .min(0)
      .max(1)
      .describe('Composite relevance score: 0.55*frequency + 0.25*position + 0.20*categoryWeight'),
    occurrences: z
      .number()
      .int()
      .nonnegative()
      .describe('Exact occurrence count of this canonical in the input text'),
    canonicalForm: z
      .string()
      .describe('Lowercased canonical skill name from the private skill-taxonomy corpus'),
  })
  .strict();
export type ExtractedSkill = z.infer<typeof ExtractedSkillSchema>;

/** Request body schema. */
export const ExtractSkillsRequestSchema = z
  .object({
    text: z
      .string()
      .min(1, 'text must not be empty')
      .max(50_000, 'text must not exceed 50_000 characters')
      .describe('Job description free text to extract skills from'),
    options: z
      .object({
        topK: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(40)
          .describe('Maximum number of skills to return, ranked by score'),
        categories: z
          .array(SkillCategorySchema)
          .optional()
          .describe('If set, only return skills whose mapped category is in this list'),
        includeMissing: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, also return skills extracted from text but NOT present in resumeText. Requires resumeText to be set.',
          ),
        resumeText: z
          .string()
          .min(1)
          .max(50_000)
          .optional()
          .describe('Candidate resume text, used only when includeMissing=true'),
      })
      .strict()
      .optional()
      .default({}),
  })
  .strict();
export type ExtractSkillsRequest = z.infer<typeof ExtractSkillsRequestSchema>;

/** Response envelope. Wrapped by ResponseTransformInterceptor; handler returns only `data`. */
export const ExtractSkillsResponseDataSchema = z
  .object({
    keywords: z.array(ExtractedSkillSchema).describe('Extracted skills ranked by score descending'),
    missing: z
      .array(ExtractedSkillSchema)
      .optional()
      .describe('Skills present in text but absent from resumeText (only when includeMissing=true)'),
    tookMs: z
      .number()
      .nonnegative()
      .describe('Server-measured wall-clock time spent inside the extractor, in milliseconds'),
  })
  .strict();
export type ExtractSkillsResponseData = z.infer<typeof ExtractSkillsResponseDataSchema>;

/** Full envelope shape for SDK clients. Handler returns `data`; filter wraps it. */
export const ExtractSkillsResponseSchema = z
  .object({
    success: z.literal(true),
    data: ExtractSkillsResponseDataSchema,
    requestId: z.string().describe('Request correlation id from AsyncLocalStorage context'),
    timestamp: z.string().describe('ISO 8601 response timestamp from the global interceptor'),
  })
  .strict();
export type ExtractSkillsResponse = z.infer<typeof ExtractSkillsResponseSchema>;
```

### 2. `api/src/modules/ats/services/skills-extractor.service.ts` (FULL FILE, ~115 LoC)

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AhoCorasickAutomaton, buildAutomaton } from 'skill-taxonomy';
import {
  TAXONOMY_SERVICE,
  type ITaxonomyService,
  type SkillTaxonomyEntry,
} from '../../../core/ports/taxonomy.port';
import type {
  ExtractedSkill,
  ExtractSkillsRequest,
  SkillCategory,
} from '@repo/shared-types';

const CATEGORY_WEIGHT: Record<SkillCategory, number> = {
  hard: 1.0,
  tool: 0.9,
  domain: 0.75,
  soft: 0.5,
};

function mapCategory(category: string, _ecosystem: string): SkillCategory {
  const lower = (category ?? '').toLowerCase();
  if (!lower) return 'hard';
  if (lower.includes('soft') || lower.includes('interpersonal') || lower.includes('communication')) {
    return 'soft';
  }
  if (
    lower.includes('tool') ||
    lower.includes('framework') ||
    lower.includes('platform') ||
    lower.includes('ide') ||
    lower.includes('library') ||
    lower.includes('software')
  ) {
    return 'tool';
  }
  if (
    lower.includes('domain') ||
    lower.includes('industry') ||
    lower.includes('methodology') ||
    lower.includes('practice') ||
    lower.includes('clinical') ||
    lower.includes('finance') ||
    lower.includes('legal') ||
    lower.includes('healthcare') ||
    lower.includes('manufacturing')
  ) {
    return 'domain';
  }
  return 'hard';
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

@Injectable()
export class SkillsExtractorService {
  private readonly logger = new Logger(SkillsExtractorService.name);
  private automaton: AhoCorasickAutomaton;
  private taxonomyVersion: number;

  constructor(
    @Inject(TAXONOMY_SERVICE) private readonly taxonomyService: ITaxonomyService,
  ) {
    this.automaton = buildAutomaton(this.taxonomyService.getReverseLookup());
    this.taxonomyVersion = this.taxonomyService.getVersion();
    this.logger.log(`Aho-Corasick automaton built: ${this.automaton.size} patterns`);
  }

  private ensureAutomatonCurrent(): void {
    const currentVersion = this.taxonomyService.getVersion();
    if (currentVersion === this.taxonomyVersion) return;
    this.automaton = buildAutomaton(this.taxonomyService.getReverseLookup());
    this.taxonomyVersion = currentVersion;
    this.logger.log(
      `Aho-Corasick automaton rebuilt (v${currentVersion}): ${this.automaton.size} patterns`,
    );
  }

  extract(
    rawText: string,
    options: ExtractSkillsRequest['options'] = {},
  ): { keywords: readonly ExtractedSkill[]; missing: readonly ExtractedSkill[] } {
    this.ensureAutomatonCurrent();

    const text = rawText.normalize('NFKC').slice(0, 50_000);
    const matches = this.automaton.search(text);
    const counts = this.automaton.countOccurrences(text);

    // First-position map by canonical
    const firstPosition = new Map<string, number>();
    const firstSurface = new Map<string, string>();
    for (const m of matches) {
      if (!firstPosition.has(m.canonical)) {
        firstPosition.set(m.canonical, m.position);
        firstSurface.set(m.canonical, text.slice(m.position, m.position + m.length));
      }
    }

    const textLen = Math.max(1, text.length);
    const rows: ExtractedSkill[] = [];
    for (const [canonical, occ] of counts.entries()) {
      const entry: SkillTaxonomyEntry | null = this.taxonomyService.getSkillEntry(canonical);
      const category: SkillCategory = entry ? mapCategory(entry.category, entry.ecosystem) : 'hard';

      const freqScore = Math.min(1, Math.log2(1 + occ) / 3);
      const pos = firstPosition.get(canonical) ?? 0;
      const posScore = 1 - pos / textLen;
      const catWeight = CATEGORY_WEIGHT[category];
      const score = clamp01(0.55 * freqScore + 0.25 * posScore + 0.20 * catWeight);

      rows.push({
        term: firstSurface.get(canonical) ?? canonical,
        category,
        score,
        occurrences: occ,
        canonicalForm: entry?.canonical ?? canonical,
      });
    }

    const filtered = options?.categories?.length
      ? rows.filter((r) => options.categories!.includes(r.category))
      : rows;

    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.term.localeCompare(b.term);
    });

    const topK = options?.topK ?? 40;
    const keywords = filtered.slice(0, topK);

    let missing: ExtractedSkill[] = [];
    if (options?.includeMissing && options?.resumeText) {
      const resumeCanonicals = this.automaton.extractSkills(
        options.resumeText.normalize('NFKC').slice(0, 50_000),
      );
      missing = keywords.filter((k) => !resumeCanonicals.has(k.canonicalForm));
    }

    return { keywords, missing };
  }
}
```

### 3. `api/src/modules/ats/controllers/extract-skills.controller.ts` (FULL FILE, ~85 LoC)

```ts
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  ExtractSkillsRequestSchema,
  type ExtractSkillsRequest,
  type ExtractSkillsResponseData,
} from '@repo/shared-types';

import { SkillsExtractorService } from '../services/skills-extractor.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { ScopeGuard } from '../../auth/guards/scope.guard';
import { ApiKeyAuditInterceptor } from '../../auth/interceptors/api-key-audit.interceptor';
import { RequireScope } from '../../auth/decorators/require-scope.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { UserContext } from '../../auth/dto/user-context.dto';

@ApiTags('ATS Scoring')
@ApiBearerAuth('bearer')
@ApiSecurity('api-key')
@Controller('ats')
@UseGuards(AuthGuard, ScopeGuard)
@UseInterceptors(ApiKeyAuditInterceptor)
@RequireScope('ats:write')
export class ExtractSkillsController {
  private readonly logger = new Logger(ExtractSkillsController.name);

  constructor(private readonly extractor: SkillsExtractorService) {}

  @Post('extract-skills')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Extract skills from a job description via deterministic Aho-Corasick matching',
    description:
      'Thin read-only wrapper around the private skill-taxonomy corpus. No LLM call, no credit deduction. Target response time <100ms for 10KB input.',
  })
  @ApiResponse({ status: 200, description: 'Extracted skills ranked by relevance score' })
  @ApiResponse({ status: 400, description: 'Validation error — invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid credentials' })
  @ApiResponse({ status: 403, description: 'Forbidden — API key missing ats:write scope' })
  @ApiResponse({ status: 429, description: 'Rate limited — 60 requests per minute per IP' })
  async extractSkills(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(ExtractSkillsRequestSchema)) body: ExtractSkillsRequest,
  ): Promise<ExtractSkillsResponseData> {
    if (body.options?.includeMissing && !body.options?.resumeText) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'resumeText is required when includeMissing=true',
      });
    }

    const start = Date.now();
    const result = this.extractor.extract(body.text, body.options);
    const tookMs = Date.now() - start;

    this.logger.log(
      `extract-skills user=${user.uid} textLen=${body.text.length} ` +
        `topK=${body.options?.topK ?? 40} returned=${result.keywords.length} tookMs=${tookMs}`,
    );

    const data: ExtractSkillsResponseData = {
      keywords: [...result.keywords],
      tookMs,
    };
    if (body.options?.includeMissing) {
      data.missing = [...result.missing];
    }
    return data;
  }
}
```

---

## Acceptance criteria

- [ ] `POST /api/v1/ats/extract-skills` returns HTTP 200 with body `{ success: true, data: { keywords: [...], tookMs: <number> }, requestId, timestamp }` for a valid 10KB JD input.
- [ ] Response `data.keywords[*]` conform to `ExtractedSkillSchema`: each entry has `term`, `category ∈ {hard, soft, tool, domain}`, `score ∈ [0,1]`, `occurrences ≥ 0`, `canonicalForm`.
- [ ] `data.tookMs < 100` in the happy-path test against a realistic 10KB JD on the developer's machine. (P95 in production under load is not a phase A3 gate; single-run local bench is.)
- [ ] Empty `text` → 400 with `error.code === 'VALIDATION_ERROR'`.
- [ ] `text.length > 50_000` → 400 with `error.code === 'VALIDATION_ERROR'`.
- [ ] `text.length === 0` → 400 with `error.code === 'VALIDATION_ERROR'` (redundant with empty, but explicit).
- [ ] Unauthenticated request → 401 with `error.code === 'UNAUTHORIZED'`.
- [ ] API-key user whose key lacks `ats:write` scope → 403 with `error.code === 'FORBIDDEN'`.
- [ ] SuperTokens session user → 200 regardless of scope metadata (session bypasses scope per investigation/05).
- [ ] 61st request from the same IP within 60s → 429 with `Retry-After` header in seconds.
- [ ] `options.includeMissing === true` without `options.resumeText` → 400 with `error.message === 'resumeText is required when includeMissing=true'`.
- [ ] `options.categories` with an unknown category value → 400 validation error (Zod enum).
- [ ] `options.topK === 0` or `options.topK > 100` → 400 validation error (Zod int range).
- [ ] When `options.includeMissing === true` with valid `resumeText`, response includes `data.missing` array.
- [ ] When `options.includeMissing !== true`, response OMITS the `data.missing` key entirely (not an empty array — absent).
- [ ] Blueprint `api/src/modules/ats/blueprint.ts` has a new `endpoints[]` entry documenting the endpoint with guards, scope, rate limit, request/response sourceRefs.
- [ ] `libs/shared-types/src/index.ts` re-exports the new schema module.
- [ ] New service `SkillsExtractorService` is exported from `ats.module.ts` so other backend modules can inject it without re-building the automaton.
- [ ] No new runtime dependency added to `api/package.json`. Only existing `skill-taxonomy`, `nestjs-zod`, `@nestjs/throttler`, `@nestjs/swagger`, `@nestjs/common` are imported.
- [ ] Zero `console.log` / `console.error` / `console.warn` in new code. Uses NestJS `Logger`.
- [ ] All new files < 200 LoC. `extract-skills.controller.ts` stays in the controller-file budget; `skills-extractor.service.ts` stays in the service-file budget.
- [ ] No pre-wrapped `{ success: true, data }` response in the controller return — the global interceptor wraps.
- [ ] Compliance gates (below) all green.

---

## Tests to write

### `api/src/modules/ats/__tests__/skills-extractor.service.spec.ts` — unit tests (~140 LoC)

Fake `ITaxonomyService` with a hand-built 6-skill corpus:

```ts
const FAKE_REVERSE_LOOKUP = new Map<string, string>([
  ['python', 'python'],
  ['py', 'python'],
  ['react', 'react'],
  ['reactjs', 'react'],
  ['react.js', 'react'],
  ['docker', 'docker'],
  ['kubernetes', 'kubernetes'],
  ['k8s', 'kubernetes'],
  ['leadership', 'leadership'],
  ['communication', 'communication'],
]);

const FAKE_ENTRIES: Record<string, SkillTaxonomyEntry> = {
  python:       { canonical: 'python',       aliases: ['py'],           broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: 'python',     category: 'programming-language' },
  react:        { canonical: 'react',        aliases: ['reactjs'],      broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: 'javascript', category: 'frontend-framework' },
  docker:       { canonical: 'docker',       aliases: [],               broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: 'devops',     category: 'devops-tool' },
  kubernetes:   { canonical: 'kubernetes',   aliases: ['k8s'],          broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: 'devops',     category: 'orchestration-platform' },
  leadership:   { canonical: 'leadership',   aliases: [],               broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: '',           category: 'soft-skill' },
  communication:{ canonical: 'communication',aliases: [],               broaderTerms: [], relatedSkills: [], complementarySkills: [], alternativeSkills: [], ecosystem: '',           category: 'soft-skill' },
};
```

Test cases (all MUST have specific assertions — no loose `.toBeDefined()`):

1. **Happy path**: "We need a senior Python engineer with React and Docker experience. Leadership skills required. Kubernetes nice to have." → returns keywords containing python, react, docker, leadership, kubernetes. Python should rank higher than leadership (hard vs soft category weight). Each entry has correct category.
2. **Aliases map to canonical**: "Use py and reactjs and k8s" → returns canonicals `python`, `react`, `kubernetes` (not `py`, `reactjs`, `k8s`). `term` preserves original casing.
3. **Category mapping — hard**: `programming-language` → `'hard'`.
4. **Category mapping — tool**: `devops-tool` → `'tool'`. `frontend-framework` → `'tool'` (because "framework" substring). `orchestration-platform` → `'tool'` (because "platform" substring).
5. **Category mapping — soft**: `soft-skill` → `'soft'`.
6. **Category mapping — fallback**: empty string → `'hard'`. `null` (via `getSkillEntry` returning null) → defaults to `'hard'`.
7. **Score bounds**: for any input, every returned `score ∈ [0, 1]`. (Property test: generate 10 random strings, all scores in range.)
8. **Frequency scoring**: "python python python python python" → single python entry, `occurrences === 5`, higher score than "python" alone.
9. **Position scoring**: "python" at start ranks higher than "python" at end of a 1000-char filler string.
10. **TopK clamping**: with `topK: 2`, returns at most 2 keywords.
11. **Category filter**: `categories: ['hard']` → only python appears (not leadership, react, docker, k8s). `categories: ['soft']` → only leadership/communication.
12. **Sort tiebreaker**: two skills with identical scores sort by occurrences desc, then term asc.
13. **includeMissing + resumeText present**: text has python, react, docker; resumeText has python only → `missing` contains react and docker, NOT python.
14. **includeMissing + resumeText empty** (NOT empty string — the controller rejects empty; the service test uses `undefined`): service returns `missing: []`.
15. **Version bump rebuild**: fake `ITaxonomyService.getVersion()` returns 1 initially, then 2 after a mutation. First `.extract()` builds the automaton; mutate getVersion to return 2; second `.extract()` should trigger `ensureAutomatonCurrent()` rebuild (verify via a spy on `buildAutomaton` import OR by mutating the reverseLookup and asserting new skills are found).
16. **Unicode NFKC normalization**: input with half-width Latin "ｐｙｔｈｏｎ" → matches canonical `python` after NFKC (unless the underlying automaton is strict-ASCII — if so, test the defensive slice instead: feed a 50001-char string composed of ASCII and verify no crash, result is truncated).
17. **Empty automaton**: empty reverseLookup → automaton is built, `extract("python react")` returns `keywords: []`, no crash.
18. **Null bytes**: input with `\x00` bytes in the middle — service does not crash; matches around the null are still extracted (Aho-Corasick word boundary treats \x00 as a boundary per package docs).

### `api/src/modules/ats/__tests__/extract-skills.controller.spec.ts` — controller/integration tests (~170 LoC)

Use `Test.createTestingModule()` with mocked `AuthGuard`, `ScopeGuard`, `ApiKeyAuditInterceptor`, and a stub `SkillsExtractorService`. Reference existing controller test patterns in `api/src/modules/ats/adapters/__tests__/` and `api/src/modules/auth/__tests__/` for override boilerplate.

Test cases:

1. **Happy path (session user)**: stub AuthGuard to set `request.user = { uid: 'u1', authSource: 'supertokens', tier: 'free', isAdmin: false, ... }`. POST valid body. Expect 200, `body.data.keywords` is an array, `body.data.tookMs` is a non-negative number.
2. **Happy path (API-key user with ats:write)**: `request.user.authSource === 'api-key'`, `apiKeyMeta.scopes === ['ats:write']`. Expect 200.
3. **API-key user with wildcard**: `apiKeyMeta.scopes === ['*']`. Expect 200.
4. **API-key user without ats:write**: `apiKeyMeta.scopes === ['jobs:read']`. Expect 403 with `error.code === 'FORBIDDEN'`. (This requires the REAL `ScopeGuard` to run — prefer `overrideGuard` selectively to only stub AuthGuard and keep ScopeGuard real; or assert by directly instantiating ScopeGuard against a fake reflector.)
5. **Unauthenticated**: no `request.user`. AuthGuard throws `UnauthorizedException`. Expect 401.
6. **Empty text**: `{ text: '' }` → 400 with `error.code === 'VALIDATION_ERROR'` and `error.details.fieldErrors.text` populated.
7. **Text too long**: `{ text: 'x'.repeat(50_001) }` → 400 with `error.code === 'VALIDATION_ERROR'`.
8. **Unknown category**: `{ text: 'ok', options: { categories: ['magic'] } }` → 400.
9. **topK = 0**: → 400.
10. **topK = 101**: → 400.
11. **topK = 100**: → 200 (boundary test, inclusive).
12. **topK = 1**: → 200, keywords array length ≤ 1.
13. **includeMissing without resumeText**: `{ text: 'python', options: { includeMissing: true } }` → 400 with `error.message === 'resumeText is required when includeMissing=true'`.
14. **includeMissing with resumeText**: `{ text: 'python react', options: { includeMissing: true, resumeText: 'python' } }` → 200, `data.missing` is defined (stubbed to a fixed value from the fake service).
15. **includeMissing=false**: response has NO `data.missing` key.
16. **Rate limit**: 60 calls pass, 61st returns 429 with `Retry-After` header. If the test environment's ThrottlerModule is hard to exercise in-spec, mock it out at the guard level and instead write a DEDICATED rate-limit unit test asserting the `@Throttle` decorator metadata equals `{ default: { ttl: 60_000, limit: 60 } }` via Reflector — the decorator + global guard wiring is covered by the main ThrottlerGuard tests already.
17. **Internal service error sanitization**: stub `SkillsExtractorService.extract()` to throw `new Error('internal automaton corruption: <secret>')`. Expect 500 response body to NOT contain the string "internal automaton corruption" (ApiExceptionFilter forces message to `'Internal server error'` for non-HttpException 500s per investigation/18 §f).
18. **No PII in logs**: spy on `Logger.log`. After a successful call with a text containing the string `SECRET_TOKEN_ABC`, assert the logged message does NOT contain `SECRET_TOKEN_ABC`. Only `textLength`, `topK`, `tookMs`, `userUid` should be logged.
19. **Envelope shape**: successful 200 response has `body.success === true`, `body.data` (not `body.result`, not `body.response`), `body.requestId` is a string, `body.timestamp` is ISO 8601 parseable.
20. **Response does NOT contain `path` key on success** (only errors have `path` per investigation/18 §c).

### Test quality bar (per testing.md)
- **No tautological assertions**. `expect(response).toBeDefined()` is banned.
- **Every test has a SPECIFIC assertion** naming the expected value.
- **Edge cases primary**: cases 5-20 above are the primary category; cases 1-4 are baseline only.
- **Adversarial cases 17-18** cover investigation/18 leak-surface risk.
- **No heavy mocking that proves nothing**: stub only at guard/service boundaries, not internal service methods.

---

## Rollback plan

This phase is additive-only. Full rollback is a clean revert with no data migration:

1. Delete `api/src/modules/ats/controllers/extract-skills.controller.ts`.
2. Delete `api/src/modules/ats/services/skills-extractor.service.ts`.
3. Delete `libs/shared-types/src/schemas/ats-extract-skills.schema.ts`.
4. Delete `api/src/modules/ats/__tests__/extract-skills.controller.spec.ts`.
5. Delete `api/src/modules/ats/__tests__/skills-extractor.service.spec.ts`.
6. Revert `api/src/modules/ats/ats.module.ts` (remove controller registration + service provider + export).
7. Revert `libs/shared-types/src/index.ts` (remove the re-export line).
8. Revert `api/src/modules/ats/blueprint.ts` (remove the new endpoints[] entry).
9. Re-run `pnpm -F @repo/shared-types build && pnpm typecheck:api && pnpm lint && pnpm test:api:module ats` to confirm the revert is clean.

No database changes. No migrations. No queue wiring. No environment variables. No CI changes. No new npm deps. No schema version bump.

If rollback is partial (e.g. service kept, controller removed), ensure `ats.module.ts` no longer references the removed symbol or the module fails to load at startup.

---

## Out of scope

Explicitly NOT in phase A3. Any of these attempted in this phase MUST be rejected by the reviewer as scope creep.

1. **SDK method `client.ats.extractSkills()` in `llmconveyors@0.5.0`**. Per decision memo §2.10, the V1 POC extension calls the endpoint via direct `fetch()` from the background worker. Adding an SDK method is v1.1 work.
2. **Response caching**. The taxonomy + automaton is already in-memory from `TaxonomyService` startup. Per-request result caching (e.g. Redis-backed text-hash → keywords) is v1.1+ and not needed for the POC (deterministic compute, <100ms target).
3. **Batch endpoint** (extract from N JDs in one request). Single-JD-per-request is enough for V1 POC. If the extension ever needs batching, add a separate `/ats/extract-skills/batch` endpoint in a future plan.
4. **Multi-language taxonomy**. The skill-taxonomy corpus is English-only at v3.0.1. Multi-language is a v2+ effort requiring a different corpus source (e.g. ESCO multilingual).
5. **Hybrid LLM enhancement** (enrich the deterministic extraction with Gemini to catch skills missing from the corpus). That path already exists in `/ats/score` (the premium endpoint with credit deduction). This endpoint stays purely deterministic. Mixing LLM into the fast path would break the <100ms target and the "no credit deduction" contract.
6. **Refactoring `AtsController` to share state with `ExtractSkillsController`**. Each controller has its own dependency set and its own responsibilities. Forcing them into one class would push the file past the 200 LoC budget.
7. **Adding `UsageRateLimitGuard`** (the per-user credit-based throttler). This endpoint is not credit-metered. Adding usage-tracking would be wrong: it's a deterministic compute path, not an AI generation path.
8. **Modifying `TaxonomyService`** or the `ITaxonomyService` port. Reuse only. If the category mapping requires `skillType`, that's a separate phase — flag as TODO in the blueprint, do NOT expand the port here.
9. **Modifying `ResponseTransformInterceptor` / `ApiExceptionFilter`** to special-case this endpoint. The global envelope contract is correct for this response shape; no special-case needed.
10. **Frontend changes to llmconveyors.com**. No Next.js changes in this phase. The endpoint is consumed exclusively by the Chrome extension.
11. **Chrome extension changes**. A9 (extension content script highlight) consumes this endpoint in a later phase. This phase is backend-only.
12. **Adding a Swagger example body**. `@ApiBody` examples are nice but not required for the POC. Defer to v1.1 doc polish.
13. **Exhaustive category-mapping rewrite**. The substring-based `mapCategory` function in Step 3.3 is a POC-quality deterministic map. A full explicit lookup against the `skill-taxonomy.json` corpus is post-POC hardening. Flag as a `notes` entry in the blueprint.
14. **Observability metrics** (Prometheus counter for `/ats/extract-skills` calls). The global HTTP metrics interceptor already covers this endpoint. No per-endpoint counter needed.

---

## Compliance gates

All gates MUST be green before this phase is considered complete. Run in order:

```bash
# 1. Build shared-types first — the api typecheck depends on the new schema exports
pnpm -F @repo/shared-types build

# 2. API typecheck — must have zero errors, zero any, zero @ts-ignore
pnpm typecheck:api

# 3. Lint — enforces the no-console-log rule and coding-style rules
pnpm lint

# 4. Module tests — runs both new spec files + the existing ATS module tests for regression
pnpm test:api:module ats
```

Expected output:
- Gate 1 (`pnpm -F @repo/shared-types build`): new schema module compiles to `libs/shared-types/dist/schemas/ats-extract-skills.schema.js` + `.d.ts`.
- Gate 2 (`pnpm typecheck:api`): 0 errors, 0 warnings. Check `logs/typecheck-api.log` if non-interactive.
- Gate 3 (`pnpm lint`): 0 errors, 0 warnings.
- Gate 4 (`pnpm test:api:module ats`): new `skills-extractor.service.spec.ts` + `extract-skills.controller.spec.ts` pass, plus all pre-existing ATS module tests remain green.

### Full compliance (optional in-phase, mandatory pre-merge)

```bash
pnpm compliance
```
This runs shared-types build → frontend/API typecheck → lint → `pnpm test:web` + `pnpm test:api` in parallel. Phase A3 is API-only so `test:web` is unaffected; running this gate is still the final merge gate per `.claude/rules/compliance-check.md`.

### Manual smoke test (optional, recommended)

After compliance passes, a 2-minute smoke test against a running local API:

```bash
# Start API
pnpm dev:api &

# Wait for boot, then call the endpoint as an admin session user (or with a seeded api-key)
curl -sS -X POST http://localhost:4000/api/v1/ats/extract-skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-local-api-key>" \
  -d '{
    "text": "We need a senior Python engineer with React, Docker, and Kubernetes experience. Leadership skills required. Nice-to-have: Rust.",
    "options": { "topK": 10 }
  }' | jq
```

Expected: 200 response, `data.keywords` includes Python, React, Docker, Kubernetes, Leadership (and possibly Rust), `data.tookMs < 100`.

---

## Post-phase notes

- A9 (content script highlight + intent detection) is blocked on this phase. The extension background worker calls `POST /api/v1/ats/extract-skills` via `fetch` (no SDK method until v1.1). The request body is `{ text: <jd>, options: { topK: 40 } }`; the extension does not use `includeMissing` or `resumeText` in the POC keyword-highlight flow.
- The blueprint `notes` field should flag the category-mapping TODO so it surfaces in blueprint drift audits.
- If production 429 error rates spike after the extension launches, revisit the 60/min limit — the default IP-based throttler is per-pod and the production deployment runs 2 pods, giving an effective ceiling of 120/min per IP. A shared NAT with 20 extension users would hit this at roughly 1 request per 10 seconds per user, which is far above any reasonable keyword-highlight refresh rate. The risk is low but documented in investigation/07 §j for future reference.
