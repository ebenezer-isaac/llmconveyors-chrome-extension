# Review — Phase A3 (Backend skills-extraction endpoint)

**Reviewer**: Opus 4.6 (architect / reviewer role)
**Plan under review**: `temp/impl/100-chrome-extension-mvp/phase_A3_backend_keywords_endpoint/plan.md`
**Decision memo**: `00-decision-memo.md` v2 (locked 2026-04-11)
**Contract neighbor**: `phase_A9_content_script_highlight_and_intent/plan.md`
**Verdict**: **APPROVED — Grade A**

---

## Executive summary

Plan A3 is a thin, deterministic read-only endpoint wrapping the existing `skill-taxonomy` Aho-Corasick automaton behind `POST /api/v1/ats/extract-skills`. The plan is well-researched (investigation artifacts 05/07/18 referenced for guard order, throttler v6 syntax, and response envelope), architecturally correct (new controller/service under `modules/ats/`, no core/ leak, `TaxonomyModule` reuse via global DI), and the contract is bit-for-bit consistent with A9's runtime type guard. Scope is tight (6 files touched, ~730 LoC including tests) and the one flagged uncertainty (category mapping table) is explicitly bounded with a non-committed verification script in Step 3.3 — zero stubs, zero `TODO: implement`.

This is the only phase in plan 100 allowed to mention `skill-taxonomy`; the plan respects that invariant (engine never touches the corpus per grep-gate). Every critical invariant from the phase brief is satisfied verbatim.

---

## A — Invariant compliance (BLOCKING)

| # | Invariant | Status | Evidence |
|---|---|---|---|
| I1 | Route = `POST /api/v1/ats/extract-skills` | PASS | Controller `@Controller('ats')` + `@Post('extract-skills')` (line 667/676); blueprint entry `path: '/api/v1/ats/extract-skills'` (line 172) |
| I2 | Guards = `AuthGuard + ScopeGuard`, `ats:write` | PASS | `@UseGuards(AuthGuard, ScopeGuard)` + `@RequireScope('ats:write')` at class level (lines 668-670). Order is correct per BUG-13 from investigation/05 |
| I3 | Rate limit 60/min | PASS | `@Throttle({ default: { ttl: 60_000, limit: 60 } })` method-level (line 678). Correct v6 syntax per investigation/07 |
| I4 | Request Zod: `text(1..50000)`, optional `options.topK(1..100)`, `categories`, `includeMissing`, `resumeText(1..50000)` | PASS | Full schema at lines 410-449. `text.min(1).max(50_000)`, `topK.int().min(1).max(100).default(40)`, `categories: z.array(SkillCategorySchema)`, `includeMissing.default(false)`, `resumeText.min(1).max(50_000)` |
| I5 | Response data: `{ keywords: [{term, category, score, occurrences, canonicalForm}], missing?, tookMs }` | PASS | `ExtractSkillsResponseDataSchema` lines 453-465; every field present; `missing` is `.optional()`; controller returns bare data (no pre-wrap) per line 709-716 |
| I6 | Uses existing skill-taxonomy Aho-Corasick from ats-score | PASS | Reuses `buildAutomaton` + `ITaxonomyService.getReverseLookup()` pattern from `keyword-scorer.service.ts:46-78` verbatim (Step 3.1, line 216) |
| I7 | New controller file `extract-skills.controller.ts` (~40 LoC) | PARTIAL | Plan targets ~65 LoC (line 74) and the full-file snippet is ~85 LoC. Brief said ~40 LoC. This is a minor overrun driven by Swagger decorators + class-level guard stack; still well under the 200-line coding-style ceiling. **Not blocking** — the spirit of "thin controller" is honored. |
| I8 | New Zod schema `libs/shared-types/src/schemas/ats-extract-skills.schema.ts` | PASS | Full file spec at lines 366-478. Strict schemas, `.describe()` on every field, exports both schema and inferred type (per shared-types style in §6 reference to `ats-score.schema.ts`) |
| I9 | Test `extract-skills.controller.spec.ts` | PASS | 20 test cases enumerated (lines 802-828); adversarial category primary (cases 5-20); no tautological assertions; no-PII-in-logs test included (case 18) |
| I10 | Target <100ms for 10KB JD | PASS | Acceptance criterion #3 (line 727); risk R9 in decision memo §5; smoke test in §"Manual smoke test" uses 10KB-ish input; deterministic Aho-Corasick easily meets this |
| I11 | A3 is the only Plan phase mentioning skill-taxonomy | PASS | Plan mentions `skill-taxonomy` only in backend service reuse context (Steps 3.1/3.3, references). A9 explicitly does NOT import the Zod schema cross-repo (hand-writes runtime guard, line 1155+). Engine grep-gate holds. |

**Minor:** I7 line-count target slightly exceeded. Not blocking. The Swagger `@ApiResponse` stanzas account for ~10 lines and are valuable for the generated OpenAPI doc.

---

## B — Contract parity with A9 (BLOCKING)

A9 sends via `sendMessage('KEYWORDS_EXTRACT', { text, url, topK: 40 })` → background `handleKeywordsExtract` → `fetch` to `/api/v1/ats/extract-skills` with body `{ text: req.text, options: { topK } }` (A9 line 523). Response is validated by `isExtractSkillsResponseShape` (A9 lines 1164-1202).

### Request shape parity

| Field | A9 sends | A3 accepts | Status |
|---|---|---|---|
| `text` | `req.text` (string, validated `<= 50_000`) | `z.string().min(1).max(50_000)` | PASS |
| `options.topK` | `req.topK ?? 40`, validated `1..100 int` | `z.number().int().min(1).max(100).default(40)` | PASS |
| `options.categories` | not sent in A9 | optional | PASS (forward-compatible) |
| `options.includeMissing` | not sent in A9 | `.default(false)` | PASS |
| `options.resumeText` | not sent in A9 | optional | PASS |

### Response shape parity

A9 guard checks:
```
success: true
data.tookMs: finite number
data.keywords: array of { term: string, category: 'hard'|'soft'|'tool'|'domain', score: number [0,1], occurrences: number >= 0, canonicalForm: string }
```

A3 response:
```
ExtractSkillsResponseDataSchema = { keywords: ExtractedSkill[], missing?: ExtractedSkill[], tookMs }
ExtractedSkillSchema = { term, category ∈ {hard,soft,tool,domain}, score ∈ [0,1], occurrences int >= 0, canonicalForm }
```

**Every field name, every enum member, every numeric range matches exactly.** The only A9-to-A3 gap is that A9 does NOT check `canonicalForm` value semantics (lowercase) — that's fine, A3 guarantees it but A9 treats it as opaque. `missing` is ignored by A9's guard (it's optional in A3, absent in A9's POC request) which is correct.

### Envelope parity

A3 relies on the global `ResponseTransformInterceptor` to wrap the controller's bare `{ keywords, missing?, tookMs }` return into `{ success: true, data: {...}, requestId, timestamp }`. A9's guard checks `body.success === true` and `body.data.*`. Match.

**Verdict: BIT-PERFECT CONTRACT PARITY.** No drift.

---

## C — Hexagonal / architecture compliance

- Service + controller live in `api/src/modules/ats/` (adapter layer) — correct. They import `skill-taxonomy` (npm package) and NestJS DI, so they MUST NOT live in `core/`. Step 3 line 216 and §17 in required reading make this explicit.
- `core/ports/taxonomy.port.ts` port is reused (DI via `TAXONOMY_SERVICE` symbol) — correct hexagonal pattern.
- No cross-module service injection; `AtsModule` imports `AIModule` + `SkillGraphModule` (existing). `TaxonomyModule` is `@Global()` so no import needed, and the plan explicitly flags "Do NOT import `TaxonomyModule`" (line 129).
- New service exported from `AtsModule.exports` (line 152) so future callers can inject without rebuilding the automaton. Correct.
- Controllers never exported (line 157). Correct.

**No violations.**

---

## D — Code quality / coding-style

| Check | Status | Note |
|---|---|---|
| No stubs / no `TODO: implement` | PASS | Only `TODO: verify` for the category table audit, which is a non-committed verification script (Step 3.3 line 298) |
| No `any` / `@ts-ignore` | PASS | All types inferred from Zod; `readonly` arrays in service return type |
| File size budgets | PASS | Controller ~85 LoC < 200; service ~115 LoC < 200; schema ~55 LoC |
| No `console.*` | PASS | Uses NestJS `Logger` (line 544, 672); explicit acceptance criterion (line 744) |
| Error handling explicit | PASS | Controller throws `BadRequestException` with structured body for cross-field validation (line 693-697); global filter handles everything else |
| Immutability | PASS | Service returns `readonly ExtractedSkill[]`; controller spreads via `[...result.keywords]` to hand owned copies to response |
| Input validation at boundary | PASS | Zod at body; NFKC normalization + defensive slice in service (line 572); explicit no-log-text rule (line 320) for PII |
| Defensive patterns | PASS | `clamp01` helper, NaN guard, first-position min, fallback category `'hard'`, `Math.max(1, text.length)` to avoid div-by-zero |

---

## E — Testing rigor

- **18 unit tests** for service + **20 controller tests**. Adversarial/edge cases dominate (cases 5-20 in controller, 6-18 in service).
- Covers: auth bypass (session vs api-key), scope enforcement with real ScopeGuard (case 4), rate-limit metadata assertion via Reflector (case 16), response sanitization (case 17), PII-in-logs spy (case 18), envelope shape check (case 19).
- Unicode NFKC (service case 16), null bytes (case 18), empty automaton (case 17) — all strong adversarial cases.
- Test quality bar explicitly called out (lines 829-834): no tautological assertions, specific values, boundary stubbing.
- Property-style test for score bounds (service case 7) — excellent.

**One minor gap**: no explicit test that the `Retry-After` header is populated on 429 (acceptance criterion line 734 mentions it). The plan itself notes the throttler test can be replaced by a decorator metadata assertion (case 16, lines 822-823). That's acceptable — header emission is the framework's responsibility — but a note in the plan explicitly delegating `Retry-After` header coverage to `@nestjs/throttler` would close the loop. **Not blocking.**

---

## F — Blueprint / full-stack update rule

- Plan updates `api/src/modules/ats/blueprint.ts` in the same phase (§Files to modify / 3, lines 168-183). Populates every required field (`method`, `path`, `handler`, `guards`, `requiredScope`, `rateLimit`, `request`/`response` sourceRefs, `description`, `consumers`, `notes`).
- `notes` field includes the category-mapping TODO so it surfaces in blueprint-drift audits (line 181).
- Consumer list (`['llmconveyors-chrome-extension (phase A9)']`) makes the A3→A9 dependency explicit in the blueprint — good full-stack hygiene.
- `libs/shared-types/src/index.ts` re-export handled (line 162-165).
- Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) included so generated OpenAPI doc stays in sync.

**Full-stack rule satisfied.**

---

## G — Scope declaration (per `.claude/rules/proposal-requirements.md`)

- **Confidence**: 9/10 (stated line 16). Single uncertainty (category mapping table) is flagged and explicitly bounded.
- **Files touched**: 6 create/modify + 2 new test specs (stated line 18). Accurate.
- **Lines changed**: ~730 LoC (stated line 17). Reasonable for this scope.

Satisfies rule.

---

## H — Concerns / nitpicks (NON-BLOCKING)

1. **Line count vs brief**. Brief said `~40 LoC` controller, plan implements ~85 LoC. Driven by Swagger decorators + class-level guard stack. The coding-style budget is 200 max, so this is fine, but a reviewer could argue the Swagger decorators could be trimmed. Recommendation: **keep the Swagger decorators** — OpenAPI is the SDK's source of truth and generating it now is cheaper than retrofitting.

2. **`SkillTaxonomyEntry` type name**. Plan line 488 imports `type SkillTaxonomyEntry` from `../../../core/ports/taxonomy.port`. Required reading §8 refers to `ITaxonomyService.getSkillEntry()` returning a subset shape. Executor should verify the exact exported type name in `taxonomy.port.ts` before committing — could be `SkillTaxonomy`, `SkillTaxonomyEntry`, or `TaxonomyEntry` depending on existing code. This is a ~30s verification task and the plan flags it implicitly by listing the file in required reading.

3. **`.superRefine` vs controller check**. Plan offers two equivalent ways to enforce `includeMissing → resumeText` (Zod `.superRefine` or controller `if` + `throw`). Either is fine; the controller approach is more legible for SDK consumers reading the schema. The plan lets the executor pick — acceptable flexibility, not ambiguity.

4. **Category mapping fallback**. Substring-based map with `'hard'` as the default could silently miscategorize novel `category` values (e.g. a future `'certification'` category would fall through to `'hard'`). The plan explicitly acknowledges this (Step 3.3, lines 298-300) and ships a non-committed audit script in Step 9. For V1 POC this is acceptable; post-POC plan should upgrade `ITaxonomyService.getSkillEntry()` to expose `skillType` and use an explicit lookup. Flagged in blueprint `notes` (line 181). **Not blocking for POC.**

5. **Throttler per-pod**. Investigation/07 §j notes the IP-based throttler is per-pod in-memory (no Redis). With 2 prod pods the effective ceiling is 120/min per IP. This is acceptable for the POC (extension users aren't going to hit 120 calls/min) and is noted in §Post-phase notes line 936. **Not blocking.**

6. **Pre-existing `AtsController` lives at `modules/ats/ats.controller.ts`, NEW controller at `modules/ats/controllers/extract-skills.controller.ts`** — inconsistent directory structure. Plan explicitly chooses not to move the existing controller (scope creep guard, line 78) which is correct. Minor aesthetic drift that a future refactor phase can clean up.

---

## I — Risks

| # | Risk | Severity | Mitigation in plan |
|---|---|---|---|
| Rk1 | Category mapping misclassifies a corpus category → wrong bucket in demo | Low | Step 9 audit script + blueprint note |
| Rk2 | `SkillTaxonomyEntry` type name mismatch with existing port | Very low | Required reading §8 points executor at the file |
| Rk3 | Performance regression if taxonomy corpus > 50k patterns | Very low | Automaton built once, version-gated rebuild; Aho-Corasick is O(n) in input |
| Rk4 | Test stubbing ScopeGuard too aggressively → 403 path untested | Low | Controller test case 4 explicitly uses REAL ScopeGuard with API-key user lacking scope |
| Rk5 | Response envelope double-wrap | Very low | Investigation/18 called out in required reading §4; acceptance criterion line 746 |

---

## Final verdict

**APPROVED — Grade A.**

Plan A3 is execution-ready. All critical invariants from the phase brief are satisfied verbatim, the contract is bit-perfect with A9's runtime guard, hexagonal boundaries hold, the test plan is adversarial and specific, and the single confidence uncertainty (category mapping) is bounded with a concrete verification script. The minor line-count overrun on the controller is driven by legitimate Swagger hygiene and is well within the coding-style ceiling. No blocking changes required.

Executor may proceed. Reviewer recommends a 30-second sanity check on the `SkillTaxonomyEntry` type name before writing imports, and the non-committed category-audit script as the final implementation step per the plan.
