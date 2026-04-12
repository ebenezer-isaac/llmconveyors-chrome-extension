# Review — Phase B3: Mozilla HeuristicsRegExp Port (MPL-2.0 sub-module)

**Reviewer**: Opus 4.6 (architect)
**Date**: 2026-04-11
**Plan file**: `phase_B3_mozilla_heuristics_port/plan.md` (1118 LoC)
**Grade**: **A-**

---

## 1. Scope sanity

| Metric | Plan claim | Assessment |
|---|---|---|
| Files touched | 7 new | Actually 9: 5 TS source + 1 README + 1 spec + 2 shell scripts + `UPSTREAM_SHA.txt` + 2 `.orig` files + `package.json` edits + `ci.yml` edits. **Minor**: §0 scope header undercounts. |
| Lines added | ~900 | Plausible (450 regexp + 250 field-heuristics + 180 adapter + 20 index + 220 spec + ~80 scripts + 40 README ≈ 1240). Plan's own line budgets in §6.3/§7.4/§8.7/§12.5 sum to 1140-1430. **Minor scope understatement.** |
| Confidence | 9/10 | Appropriate. |
| Estimated effort | 3 hours | Table in §18 sums to 220 min, not 180. **Inconsistency** but tolerable. |

---

## 2. Critical invariant checks

### 2.1 No DOM / chrome / HTMLElement references in ported code
**PASS.** Grep of B3 plan for `document`, `window`, `HTMLElement`, `chrome.` returns only prose mentions in:
- §0 and §2.5 decision memo quote (listing what is forbidden)
- §6.2 and §7.2 explicitly enumerating what is NOT ported (e.g. "DOM traversal (`node.closest`, `document.querySelector`, etc.)")
- §13.2/§13.3 CI enforcement described as post-build grep
- §5 strip list

Zero occurrences in any code skeleton. The `FieldDescriptor` interface in §8.2 is pure string fields — no DOM node references. The matching loop in §7.3 operates on plain strings. Invariant holds.

### 2.2 No skill-taxonomy references
**PASS.** Zero matches for `skill-taxonomy` anywhere in the plan.

### 2.3 No HighlightRange references
**PASS.** Zero matches. HighlightRange lives in B2's `src/core/types/highlight-range.ts` and is irrelevant to heuristics.

### 2.4 Location: `src/core/heuristics/mozilla/**`
**PASS.** §2 file tree places:
- `src/core/heuristics/mozilla/heuristics-regexp.ts` (MPL-2.0)
- `src/core/heuristics/mozilla/field-heuristics.ts` (MPL-2.0)
- `src/core/heuristics/mozilla/README.md` (MPL-2.0)
- `src/core/heuristics/adapter.ts` (MIT, outside mozilla/)
- `src/core/heuristics/index.ts` (MIT, outside mozilla/)

The MIT/MPL sub-module boundary is the `mozilla/` directory — correct per decision memo §2.4.

### 2.5 MPL-2.0 header compliance
**PASS with nuance.** §3 specifies:
- Exact 3-line MPL short-form notice (byte-exact, no reformat)
- Attribution block with upstream SHA, path, and modifications log
- §11 compliance checklist with "starts with the exact MPL-2.0 header from §3" items
- §13 CI script `verify:mozilla-clean` greps for forbidden Firefox-internal tokens
- Terser `format.comments` preserved via B1 precondition (§3 final bullet)

Attribution points at `https://searchfox.org/mozilla-central/raw/toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs` — correct upstream. Revision pinned in `UPSTREAM_SHA.txt`. `LICENSES/MPL-2.0.txt` referenced with a relative path `../../../../LICENSES/MPL-2.0.txt`.

**Verify**: path depth `src/core/heuristics/mozilla/heuristics-regexp.ts` → `LICENSES/MPL-2.0.txt` is 4 `..` segments (`mozilla` → `heuristics` → `core` → `src` → root). Correct.

**Attribution to Mozilla**: yes — file header credits `mozilla-central` path, and `mozilla/README.md` §10 documents origin under the Firefox upstream tree. MPL-2.0 §3.3 satisfied.

### 2.6 Pure string inputs (no DOM nodes)
**PASS.** `FieldDescriptor` in §8.2 has only `string | null | undefined` properties. `findMatchedFieldName` in §7.3 takes `input: string`. `normaliseSignal` takes `string | null | undefined`. No `HTMLElement`, no `Node`, no DOM anywhere.

### 2.7 Exposed via `./heuristics` export entry
**PASS.** §9 barrel re-exports `classifyViaMozillaHeuristics`, `FieldDescriptor`, `ClassifiedField` (B3-local), `CONFIDENCE_AUTOCOMPLETE`, `CONFIDENCE_PRIMARY`, `CONFIDENCE_LABEL`. §2 precondition lists `package.json#exports["./heuristics"]` as already set in B1. B4 imports `from '../heuristics'` (verified in `phase_B4_classifier_and_fill_rules/plan.md:793`). Consistent.

---

## 3. Contract checks — B3 against B2 and B4

### 3.1 B3 imports from B2
**PASS.** §8.2 imports `FieldType` from `../taxonomy/field-types` — matches B2's exported symbol at `src/core/taxonomy/field-types.ts:320`. §18.2 calls out B2 dependency explicitly with stub fallback protocol.

### 3.2 `MOZILLA_TO_ATS` value range is a subset of B2's `FieldType`
Cross-checked every value in §8.2 MOZILLA_TO_ATS against B2 `FieldType` union (`phase_B2_core_types_and_taxonomy/plan.md:320-488`):

| B3 value | B2 FieldType entry | OK? |
|---|---|---|
| `email` | present | ✓ |
| `tel` | present | ✓ |
| `tel-country-code` | present | ✓ |
| `tel-area-code` | present | ✓ |
| `tel-local` | present | ✓ |
| `tel-extension` | present | ✓ |
| `given-name`, `additional-name`, `family-name`, `name` | all present | ✓ |
| `current-company`, `current-title` (ATS remaps) | both present in B2 ATS-extension block | ✓ |
| `street-address`, `address-line1..3`, `address-level1..2`, `postal-code`, `country`, `country-name` | all present | ✓ |

**PASS.** Every remap target exists in B2's union.

**Minor note**: Mozilla's upstream has `tel-national` which B3 intentionally omits from `FieldTypeMozilla` (confirmed absent in §6.1 skeleton union). B2 however DOES define `'tel-national'`. Not a drift — `tel-national` in B2 is reserved for ATS-extension code paths (e.g. synonym matcher in B4), not the Mozilla adapter. Acceptable.

### 3.3 `ClassifiedField` name collision with B2
**WEAKNESS (not blocking).** B2 exports a `ClassifiedField` type from `src/core/types/classified-field.ts` with shape `{ descriptor, type, confidence, matchedOn }` where `matchedOn` is a much broader union. B3 defines a LOCAL type also named `ClassifiedField` in `adapter.ts` with shape `{ fieldType, mozillaType, confidence, matchedOn: 'autocomplete' | 'primary-rules' | 'label-rules' }`. They are NOT structurally compatible.

B4's pipeline (`phase_B4.../plan.md:872-899`) correctly translates the B3 adapter's output into a B2 `ClassifiedField`, so there is no runtime collision. However:

1. Two types with the same name and divergent shapes is a maintenance footgun. A future executor could accidentally import the wrong one.
2. B3 §9 barrel exports its local `ClassifiedField` from `./heuristics`. A consumer grepping for `ClassifiedField` will see two hits.
3. B3's spec file at §12 imports `ClassifiedField` from `'../../../src/core/heuristics'` — fine locally, but the name-shadowing is unclean.

**Recommendation**: rename B3's type to `MozillaClassification` or `HeuristicMatch`. The `classifyViaMozillaHeuristics` return type should be the renamed variant. This leaves B2's `ClassifiedField` as the single canonical public type.

**Severity**: Medium. Not grade-breaking (B4 correctly maps between them) but an obvious cleanup the architect should mandate before merge. The reviewer RECOMMENDS an amendment to B3 §8.2 + §9 + §12.

### 3.4 Confidence values B3 exports vs B4 consumes
B3 exports `CONFIDENCE_AUTOCOMPLETE = 1.0`, `CONFIDENCE_PRIMARY = 0.75`, `CONFIDENCE_LABEL = 0.55`.
B4 imports `CONFIDENCE`, `MIN_CONFIDENCE_THRESHOLD` from its OWN `./scoring` module (`phase_B4.../plan.md:797`) — NOT from B3. B4 does NOT re-use B3's confidence constants in its pipeline logic; instead it re-maps:
- `autocomplete` → `CONFIDENCE.AUTOCOMPLETE` (B4 scoring constant)
- `primary-rules` → `CONFIDENCE.NAME_OR_ID_EXACT`
- `label-rules` → `CONFIDENCE.LABEL_SYNONYM`

So B3's `CONFIDENCE_*` exports are DEAD CODE from B4's perspective. They may be consumed by B5+ or by downstream packages.

**WEAKNESS**: B3 §9 re-exports `CONFIDENCE_AUTOCOMPLETE`, `CONFIDENCE_PRIMARY`, `CONFIDENCE_LABEL` "for downstream classifiers (B4) that need to compare the Mozilla adapter's output against their own vote weights" — but B4 does NOT use them. Either (a) delete them from the public surface (they're only used internally by adapter.ts), or (b) document that they're available but B4 uses its own scoring. The plan should be honest about the duplication.

**Severity**: Low. Aesthetic. Grade impact: none beyond the note.

### 3.5 `matchedOn` enum values B3 emits vs B4 expects
B3 emits `'autocomplete' | 'primary-rules' | 'label-rules'`.
B4 pipeline switches on these three exact strings (`phase_B4.../plan.md:886-897`). **Contract exact.** ✓

### 3.6 `FieldDescriptor` shape B3 expects vs B4 passes
B3 §8.2: `{ id?, name?, autocomplete?, label?, placeholder?, ariaLabel?, type? }` — all optional string | null | undefined.
B4 call site (`phase_B4.../plan.md:872-880`) passes exactly these seven keys from `descriptor: FormFieldDescriptor`. **Contract exact.** ✓

---

## 4. Review checklists A-F

### Checklist A — Blueprint / source of truth
- [x] Decision memo §2.4, §2.5, §2.6 cited
- [x] Investigation 51 cited as primary source
- [x] Investigation 46 cited for FieldType union
- [x] Investigation 37 explicitly skipped (no Fathom ML / credit cards)
- [x] B1 preconditions enumerated (§2 bottom: LICENSES/, LICENSE, package.json license, tsconfig.core.json, exports map, B2 FieldType union)
- [x] STOP protocol if preconditions missing

### Checklist B — File plan and hex boundary
- [x] All new files inside `src/core/heuristics/**`, `tests/core/heuristics/**`, or `scripts/verify-mozilla-*.sh`
- [x] Zero edits to files outside B3's scope (§17 final bullet)
- [x] Sealed sub-module: §9 deliberately does NOT re-export from `./mozilla/`
- [x] MIT/MPL boundary enforced by file location AND by §11 checklist item that `index.ts` MUST NOT re-export from `./mozilla/` directly

### Checklist C — License compliance
- [x] §3 verbatim MPL header (3-line short-form notice)
- [x] §3 attribution block (upstream path, SHA, modifications list)
- [x] §4 upstream fetch procedure with searchfox raw URL
- [x] §4.2 `UPSTREAM_SHA.txt` pinning
- [x] §4.2 `.orig` files preserved in repo (NOT gitignored) for audit
- [x] §5 strip list for Firefox-internal APIs
- [x] §5.1 `verify:mozilla-clean` CI script with forbidden pattern list
- [x] §9 sub-module sealed from public re-export
- [x] §10 README documents the MPL-2.0 boundary and how to update
- [x] §11 22-item compliance checklist for executor
- [x] §13 `verify:mozilla-unchanged` drift detection via SHA256
- [x] §15 acceptance criteria re-verify checklist items
- [x] `package.json#license = "MIT AND MPL-2.0"` enforced as B1 precondition

**PASS.** Licensing story is thorough. **Minor**: §11 and §15 have overlapping checklists — some duplication but not harmful.

### Checklist D — Port fidelity
- [x] §5 strip list is comprehensive (16 patterns)
- [x] §6.2 conversion rules: header preservation, typed exports, no regex rewrites, cc-* skipped, Fathom stripped, locale comments preserved
- [x] §7.1 / §7.2 minimal trimmed port of `FormAutofillHeuristics.sys.mjs` (pure matching loop only)
- [x] §8 adapter is MIT, not MPL
- [x] §14 anti-pattern checks on the ported code (no `any`, no `console.log`, no mutation beyond memoization, no TODO without issue)

**Weakness**: §6.1 skeleton's `LABEL_RULES` is a placeholder `{ // <populate verbatim from upstream LABEL_RULES object> }`. The executor is told to populate verbatim but the plan does NOT provide a way to verify "verbatim" without fetching upstream at port time. Risk: executor fetches upstream, sees that `LABEL_RULES` has been restructured (mozilla has refactored this since investigation 51), and guesses. **Recommendation**: add an explicit instruction — "if `LABEL_RULES` in upstream does not exist as a top-level export, OR has been renamed, STOP and ask architect". Currently §6.2 rule 4 covers this for `RULES` but not for `LABEL_RULES`.

**Severity**: Medium. The architect should amend §6.1 and §6.2 to include an explicit `LABEL_RULES` contract validation step.

### Checklist E — Testing
- [x] §12.2.1 autocomplete fast path: 11 cases (email, given/family-name, tel, street-address, postal-code, country, org remap, title remap, case-insensitive, unknown-token-fallthrough)
- [x] §12.2.2 primary rules: 7 cases (email/given-name/family-name/tel via name/id/label/placeholder, ariaLabel inclusion, confidence value, matchedOn source)
- [x] §12.2.3 label-rules fallback: 2 cases (positive + negative)
- [x] §12.2.4 null/edge: 9 cases (empty, all-null, whitespace, non-matching, 10k-char, unicode, RTL, null byte, `__proto__`)
- [x] §12.2.5 type safety: 3 cases (compile-time Record exhaustiveness, value-in-FieldType, confidence range)
- [x] §12.4 `beforeEach` resets memoized caches
- [x] §12.6 coverage target: 100% statement on `adapter.ts`, 90% overall

**Adversarial coverage**: §12.2.4 includes the mandatory security cases from `.claude/rules/testing.md` §3 — null byte, prototype pollution, RTL, unicode, length bomb. **PASS.**

**Weakness**: No test explicitly for the `compile()` fallback path (line 356-361 of the skeleton) where `\p{L}` is rejected. §19 R2 identifies this as a risk but §12 has no test. **Recommendation**: add `test('compile fallback path returns case-insensitive regex when Unicode mode unsupported')` using a stubbed `RegExp` constructor or a cache-reset + environment manipulation. Not blocking — very-low-probability runtime path.

**Severity**: Low.

### Checklist F — CI and tooling
- [x] `pnpm verify:mozilla-clean` wired (§5.1 + §13)
- [x] `pnpm verify:mozilla-unchanged` wired (§13.1)
- [x] `tsconfig.core.json` exclude for `.orig` files (§4.3)
- [x] `tsc -p tsconfig.core.json --noEmit` as DOM-leak gate (§13.2)
- [x] `dist/core/heuristics/mozilla/` grep gate for unstripped tokens (§15 acceptance criteria)
- [x] `pnpm compliance` final gate (§15 last item)
- [x] Terser `format.comments` retention for MPL header is a B1 precondition (§3)

**PASS.** Zero gaps in CI coverage.

---

## 5. Additional findings

### 5.1 Rollback plan (§16)
**Excellent.** Three tiers:
1. Hard rollback: revert files (B4 blocked)
2. Soft rollback: ship stub adapter returning `null` except autocomplete fast path — unblocks B4 at degraded capacity
3. License rollback: STOP and ask — explicitly forbids moving Mozilla code into MIT files

This is exactly the right shape for a blocker phase. The soft-rollback path provides real risk mitigation without compromising the license boundary.

### 5.2 Bundler footgun for MPL comment preservation
§3 notes terser strips block comments that don't start with `/*!` or contain `@license`. It also notes B1 handles this via `format.comments: /@license|MPL/i`. **CRITICAL**: §3 says the executor MUST NOT add `@license` JSDoc tags. Fine. But if B1's terser config is wrong (e.g. `/!@license/`), the MPL header will be stripped from the minified bundle — license violation.

**Recommendation**: B3 plan §3 should add an acceptance criterion: "verify `pnpm build` produces `dist/core/heuristics/mozilla/heuristics-regexp.js` with the first 3 lines matching the MPL short-form notice byte-for-byte". Currently §15 has "produces dist/core/heuristics/index.{js,mjs,d.ts}" — doesn't check content. **Add a post-build head-of-file check.**

**Severity**: Medium. This is a real license-compliance gap. The architect SHOULD amend §15 before execution.

### 5.3 `UPSTREAM_SHA.txt` dual-line format
§13.1 defines the file format as two lines: (1) mozilla-central revision, (2) SHA-256 of concatenated `.orig` files. §4.2 only writes the FIRST line. §13.1 auto-populates the second line on first dry-run. This bootstrapping is fine but adds one non-obvious step — executor runs `pnpm verify:mozilla-unchanged` once with empty line 2, script appends the hash, commits. Plan should explicitly document this as step "4.3b: run `pnpm verify:mozilla-unchanged` to populate second line of UPSTREAM_SHA.txt before committing".

**Severity**: Low. Executor could puzzle over it but §13.1 comments explain it.

### 5.4 `current-company` / `current-title` remap has subtle semantic impact
§8.3 remaps Mozilla's `organization` → our `current-company` and `organization-title` → `current-title`. Rationale: "On a job application, 'organization' always means the applicant's current employer."

**PASS** but note: on a non-application form that happens to be on a career site (e.g. a "Contact us" form on a company's career page), this remap could misfire — treating a contact form's "Company" field as the applicant's current employer. Since B4 runs its ATS-specific rules FIRST, fields on non-application forms will not reach this adapter at all (scanner in B5 only returns fields from detected application forms). So the risk is bounded. Document this assumption in §8.3 as an explicit dependency: "assumes this adapter only runs on scanner-flagged application forms".

**Severity**: Low. Design assumption; not a bug.

### 5.5 Error handling in `compile()` fallback
§6.1 skeleton line 355-362: `compile()` catches a `RegExp` constructor throw and `console.warn`s + retries without Unicode flag. This is the only `try/catch` in the phase. Good defensive pattern.

**Observation**: The `catch (e)` block uses `e: unknown` implicitly (TS strict). The `console.warn('...', e)` call is fine. But the fallback RegExp is returned unconditionally — if the non-Unicode regex ALSO throws (e.g. malformed pattern, not Unicode-related), the function throws and crashes. Wrap in an outer try/catch with a `const NOOP_RE = /(?!)/` never-matching fallback, or throw a wrapped error. Currently a bug-level regex pattern would crash the classifier.

**Recommendation**: add inner try/catch, fall back to `/(?!)/` on total failure. **Severity**: Low.

### 5.6 Timing table discrepancy
§18 breakdown sums to 220 minutes (15+60+20+35+5+10+40+10+15+5+5) but §18's "Total" row says **180 min** and the header says "Estimated 3 hours". The header and total disagree with the line items. **Severity**: Trivial. Just update the total row to 220 min or trim the breakdown by 40 min.

---

## 6. Grep gate verification (required by phase prompt)

Grepping `phase_B3_mozilla_heuristics_port/plan.md` for forbidden patterns:

| Pattern | Count | Context |
|---|---|---|
| `document` | 3 | All prose (§2.5 decision memo quote, §7.2 what-NOT-to-port, §13.2 post-build gate) — NOT in any code skeleton |
| `window` | 1 | §13.2 post-build gate prose only |
| `HTMLElement` | 1 | §2.5 decision memo quote only |
| `chrome.` / `chrome\.` | 3 | §2.5 decision memo quote, §13.2 post-build gate — prose only |
| `skill-taxonomy` | 0 | clean |
| `HighlightRange` | 0 | clean |

**PASS.** Zero forbidden patterns in code skeletons; all mentions are in prose explaining what must NOT appear. The CI scripts §5.1 and §13.3 enforce this at build time.

---

## 7. Contract summary for B4 executor

The B3 plan guarantees to B4:
1. `./heuristics` sub-entry exports `classifyViaMozillaHeuristics(FieldDescriptor) → ClassifiedField | null` (B3-local type) — ✓
2. The `FieldType` inside the B3-local `ClassifiedField.fieldType` is a member of B2's `FieldType` union — ✓
3. Three `matchedOn` discriminant values: `'autocomplete' | 'primary-rules' | 'label-rules'` — ✓
4. Pure function, no I/O, no DOM, no globals beyond memoized caches — ✓
5. `CONFIDENCE_AUTOCOMPLETE = 1.0`, `CONFIDENCE_PRIMARY = 0.75`, `CONFIDENCE_LABEL = 0.55` exported — ✓

B4's pipeline (`phase_B4.../plan.md:872-899`) correctly consumes this contract. **Verified.**

---

## 8. Required amendments before execution

Ordered by severity:

1. **MEDIUM — Rename B3-local `ClassifiedField` to avoid shadowing B2's type.** §8.2, §9, §12 all need updating. Suggested name: `HeuristicMatch` or `MozillaClassification`. (§3.3 above)
2. **MEDIUM — Add post-build MPL-header preservation test.** §15 acceptance must include byte-exact verification that `dist/core/heuristics/mozilla/*.js` retains the MPL short-form notice as its first comment block. Currently tested at source level only. (§5.2 above)
3. **MEDIUM — LABEL_RULES contract validation.** §6.1 / §6.2 rule 4 should explicitly extend the "if upstream key does not exist, STOP" protocol to `LABEL_RULES` (not just `RULES`). (Checklist D above)
4. **LOW — Add test for `compile()` fallback path.** §12.2 missing coverage of the `\p{L}` rejection branch. (Checklist E above)
5. **LOW — Harden `compile()` with inner catch + never-match fallback.** §6.1 skeleton currently crashes if BOTH Unicode and non-Unicode regex compilation fail. (§5.5 above)
6. **LOW — §18 timing table total inconsistency.** 180 vs 220 minutes. Trivial.
7. **LOW — §13.1 bootstrap step.** Make the "first-run auto-populates second line" explicit in §4.3. (§5.3 above)
8. **LOW — §8.3 document the "application-form-only" assumption.** (§5.4 above)
9. **LOW — §9 CONFIDENCE_* re-export is dead code from B4's perspective.** Either retain with a note that it's for future consumers or drop from the barrel. (§3.4 above)

None of these are grade-breaking individually, but the combined cleanup is desirable before the executor starts.

---

## 9. Grade rationale

**A-.**

Positives:
- Decision memo + investigations 37/46/51 all correctly cited
- License compliance is thorough (verbatim header, attribution, sealed sub-module, CI drift check, dual verify scripts)
- Test suite covers happy path + adversarial + edge cases per `.claude/rules/testing.md`
- Rollback plan is tiered and license-safe
- B3→B4 contract surface matches exactly (call shape, `matchedOn` enum, `FieldType` range)
- Zero DOM/chrome/HighlightRange/skill-taxonomy leakage in any code skeleton
- Hex architecture invariant (§2.5 decision memo) respected byte-for-byte

Deducts:
- `ClassifiedField` name shadowing with B2 (medium) — could have been caught during B2+B3 co-design
- MPL header preservation in minified bundle not explicitly verified (medium) — license risk
- `LABEL_RULES` drift protocol weaker than `RULES` (medium) — executor could get stuck
- Minor inconsistencies (timing table, scope header count, dead-code re-exports)

None of the deducts block execution — they're amendable in 10-15 minutes of editing. The plan is otherwise ready for a Sonnet executor with 64k context.

**Recommendation**: apply amendments 1-3 before unblocking B3 execution. Amendments 4-9 can be rolled into the same edit pass or filed as follow-ups.
