# Review — Phase B4 (Classifier + Fill Rules + Plan Builder)

**Reviewer**: Claude Opus 4.6 (1M)
**Date**: 2026-04-11
**Plan file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B4_classifier_and_fill_rules/plan.md` (2954 lines)
**Phase scope**: 17 new files (~1,450 LoC), pure-TS core, zero DOM

---

## Grade: B-

B4 is substantially correct on hex-boundary and scope — zero DOM refs, zero skill-taxonomy, zero HighlightRange, consumes B2/B3 correctly, emits FillInstruction for downstream B5/A8. The classifier pipeline design is sound and follows investigation 46 ladder + investigation 51 §h integration order. BUT there are three **compile-blocking** contract mismatches against B2 plus one **TS type-union violation** that will prevent the phase from landing as written. Also some doc inconsistencies and minor schema gaps. These are fixable in a ~30-minute revision pass but MUST be fixed before execution or the executor will burn cycles chasing type errors.

---

## Checklist A — Hard boundary (hex core purity)

- PASS: grep for `document|window|HTMLElement|HTMLInputElement|chrome\.|Node|Element` in source code blocks — zero direct refs. All mentions are in comments, acceptance-criteria grep commands, or narrative prose.
- PASS: grep for `from.*adapters|from.*ats/` — zero imports into core. All imports from `../types`, `../taxonomy`, `../profile`, `../heuristics`.
- PASS: grep for `skill-taxonomy` — zero matches. B4 does not touch the moat corpus.
- PASS: grep for `HighlightRange` — zero matches. B4 does not import or consume this type (it exists in B2 for B6).
- PASS: every exported function has explicit return type.
- PASS: no `any` in public signatures. One `as unknown as { dateOfBirth?: string }` cast in `bday` branch — ugly but not leaking to API surface.
- PASS: `src/core/` only; no files under `adapters/` or `ats/`.
- PASS: acceptance criteria explicitly greps for DOM + adapter imports and requires zero.

## Checklist B — Contract vs B2 (types, taxonomy, profile)

- PASS: `FormFieldDescriptor` consumed with all 12 fields from B2.
- PASS: `ClassifiedField` construction matches B2 interface (`descriptor`, `type`, `confidence`, `matchedOn`).
- PASS: `matchedOn` literal values used (`'name'`, `'autocomplete'`, `'label'`, `'label-synonym'`, `'placeholder'`, `'aria-label'`, `'position'`, `'none'`) — all are in B2's union.
- PASS: `FillInstruction` construction matches B2 (`selector`, `field`, `value`, `priority`).
- PASS: `FillPlan` construction matches B2 (`planId`, `createdAt`, `formUrl`, `instructions`, `skipped`).
- PASS: `FillValue` discriminated union used correctly (`{ kind: 'text' | 'boolean' | 'choice' | 'file' | 'skip' }`).
- PASS: `isEeoField`, `isConsentField`, `isDobField` imported from `../taxonomy/ats-extensions` — matches B2 exports.
- PASS: `SYNONYMS` imported from `../taxonomy/synonyms` — matches B2 export.
- PASS: `FieldType` union — dispatch.ts has exhaustive switch with `const _exhaustive: never = type` check that TS will enforce against B2's 74-entry union.

### BUG-1 [BLOCKER] — `ClassificationConfidence` literal-union violation
**Severity**: high (compile error)
**Location**: `src/core/classifier/scoring.ts` lines ~207-214
**Issue**: B4 defines `CONFIDENCE.ARIA_LABEL = 0.4 as ClassificationConfidence`. But B2 (phase_B2/plan.md:166-174) declares `ClassificationConfidence` as the literal union `1.0 | 0.9 | 0.8 | 0.7 | 0.6 | 0.5 | 0.3 | 0.0`. The value `0.4` is NOT a member. The `as ClassificationConfidence` cast will only hold inside scoring.ts but will fail at every call site where a `ClassifiedField.confidence` is constructed from `CONFIDENCE.ARIA_LABEL` — TS narrows the widened-const output back to the union and finds 0.4 doesn't fit.
**Fix**: Either
  (a) change B2's union to include `0.4` (update B2 blueprint + phase B2 plan), OR
  (b) snap ARIA_LABEL to `0.5` (which is in the union, reserved for "section heading match") or `0.3` (sharing the POSITIONAL slot).
The plan's own scoring.ts doc comment says "(0.7 — we collapse to single 0.7 because both carry equivalent weight)" but then declares 0.6 and 0.4 — the comment and code contradict each other. Recommend: **ARIA_LABEL = 0.5, PLACEHOLDER = 0.6** (both exist in B2 union), drop the "collapse to 0.7" prose.

### BUG-2 [BLOCKER] — Test fixture missing required `JobPreferences` fields
**Severity**: high (compile error in tests)
**Location**: `tests/core/fill-rules/dispatch.spec.ts` `makeProfile()` (lines ~2304-2385) and `tests/core/plan-builder/builder.spec.ts` `makeProfile()` (lines ~2730-2773)
**Issue**: B2 (phase_B2/plan.md:966-980) defines `JobPreferences` with REQUIRED fields `willingToCompleteAssessments: boolean`, `willingToUndergoDrugTests: boolean`, `willingToUndergoBackgroundChecks: boolean`. B4's test fixtures supply only `workAuthorization`, `salaryExpectation`, `availabilityDate`, `willingToRelocate`, `remotePreference`. Every `JobPreferences` literal in the tests will fail TS compile.
**Fix**: add the three missing boolean fields to both fixtures (`willingToCompleteAssessments: true, willingToUndergoDrugTests: false, willingToUndergoBackgroundChecks: true`). One-line each.

### BUG-3 [BLOCKER] — Test fixture missing required `JurisdictionAuthorization` fields
**Severity**: high (compile error in tests)
**Location**: same two `makeProfile()` helpers.
**Issue**: B2 (phase_B2/plan.md:945-956) defines `JurisdictionAuthorization` with FOUR required flags: `authorized`, `requiresVisa`, `requiresSponsorship`, `legallyAllowed`. B4 fixtures supply only `authorized` and `requiresSponsorship`.
**Fix**: add `requiresVisa: true, legallyAllowed: false` (and equivalents for the `GB` / `US` entries) to every `workAuthorization` literal.

### BUG-4 [BLOCKER] — Test fixture missing required `Consents` fields
**Severity**: high (compile error in tests)
**Location**: same fixtures plus `tests/core/plan-builder/builder.spec.ts`.
**Issue**: B2 (phase_B2/plan.md:1024-1033) defines `Consents` with FOUR required booleans: `privacyPolicy`, `marketing`, `allowEeoAutofill`, `allowDobAutofill`. B4 fixtures use `{ privacyPolicy: false, marketing: false }`.
**Fix**: add `allowEeoAutofill: false, allowDobAutofill: false`.

### BUG-5 [BLOCKER] — `dispatch.ts` switch branches return `FillValue` instead of `FillRuleResult`
**Severity**: high (compile error in source)
**Location**: `src/core/fill-rules/dispatch.ts` — 12 branches at lines ~1351, 1353, 1389, 1393, 1407, 1440, 1455, 1485, 1491, 1508, 1516, 1525
**Issue**: The dispatch function signature is `: FillRuleResult`. The helper `skip(reason)` returns bare `FillValue`:
```ts
function skip(reason: SkipReason): FillValue { return { kind: 'skip', reason }; }
```
But twelve `case` branches do `return skip('profile-field-empty');` directly — this returns `FillValue`, not `FillRuleResult`. TS will reject every one. The other helpers (`textOrSkip`, `booleanOrSkip`, `choiceOrSkip`) all wrap into `{ value, skipReason }` correctly. The gating early return also wraps. The `resume-upload` / `cover-letter-upload` branches wrap on the skip path.
**Fix**: wrap each bare `return skip(...)` as `return { value: skip('profile-field-empty'), skipReason: 'profile-field-empty' };`. Alternatively, rename the helper to return `FillRuleResult` directly and rework the single call site that genuinely wants bare `FillValue` (the `skip` calls nested inside object literals like `{ value: skip('...'), skipReason: '...' }` — there are only three of those and they can inline the literal).

### Finding-6 [minor] — `SkipReason` string type vs B2's `FillValue` free-form string
**Severity**: low
**Location**: B4 defines `SkipReason` as a specific string-literal union in `gating.ts`. B2's `FillValue` has `{ kind: 'skip'; reason: string }` (free string). B4 narrows. That's fine — `SkipReason extends string`. No issue.

## Checklist C — Contract vs B3 (Mozilla heuristics consumer API)

- PASS: B4 imports `classifyViaMozillaHeuristics` from `../heuristics` (B3's sealed barrel).
- PASS: B4 passes a `FieldDescriptor` with all 7 optional fields (`id`, `name`, `autocomplete`, `label`, `placeholder`, `ariaLabel`, `type`) — matches B3 phase_B3/plan.md:526-534.
- PASS: B4 consumes B3's output `ClassifiedField { fieldType, mozillaType, confidence, matchedOn }` — reads `moz.fieldType` and `moz.matchedOn` correctly.
- PASS: B4 correctly treats `null` return as "Mozilla did not match" and falls through.
- NOTE: B4 rescales Mozilla's confidence (0.75 primary → 0.9, 0.55 label → 0.8) instead of passing through. This is **intentional** and documented in the pipeline comment. Not a bug but worth flagging: if B3 or B4 confidence semantics ever diverge from investigation 46 §4, this rescaling will need a sync.

### Finding-7 [minor] — B4's `CONFIDENCE_*` re-export from B3 is unused
B4's plan "Step 1 Verify preconditions" says to verify that `src/core/heuristics` exports `CONFIDENCE_AUTOCOMPLETE`, `CONFIDENCE_PRIMARY`, `CONFIDENCE_LABEL`, but the pipeline never imports them — it uses its OWN `CONFIDENCE` constants from scoring.ts. The precondition check is harmless but misleading. Minor.

## Checklist D — Contract vs B5 (FillInstruction consumer)

- PASS: B4 emits `FillInstruction[]` whose `selector`, `field`, `value`, `priority` shape matches B2's interface exactly.
- NOTE: B5's `fillField(el, value: string | boolean)` does NOT take `FillInstruction` directly — it takes raw `string | boolean`. The glue (A8 content script) is responsible for unwrapping `instruction.value.kind` and dispatching to `fillField` (text/boolean), `attachFile` (file kind), or a skip recorder. B4's FillInstruction shape is therefore only transitively bound to B5 via B2's types, not directly. B4 is consistent with B2. OK.
- PASS: `FillValue.kind === 'skip'` branch in builder correctly routes to `skipped[]` and not to `instructions[]` — B5's filler will never see a skip because it won't be in the instruction list.
- NOTE: `FillInstruction.priority` default in B2 is "100" (per comment). B4's plan-builder always sets an explicit priority from `FIELD_TYPE_PRIORITY[type] ?? DEFAULT_PRIORITY (90)` — so the default is effectively 90, not 100. Minor doc drift; not a bug.

## Checklist E — Test plan quality

- PASS: 82+ tests budgeted (30 pipeline + 15 ats-matchers + 25 dispatch + 12 builder).
- PASS: Test categories cover happy-path, edge cases (empty descriptors, 10KB labels, diacritics, null fields), gating (EEO opt-in/out, consent-never, DOB opt-out), determinism (byte-equal output).
- PASS: Snapshot test for realistic Greenhouse form.
- PASS: Pure-function determinism test (`JSON.stringify(p1) === JSON.stringify(p2)`).
- PASS: Ordering tests verify resume-first, identity-before-employment, domIndex tiebreaker.
- WEAK: "adversarial" category is thin. No tests for:
  - injection-style signals (e.g. label containing `<script>`, unicode direction marks, RTL text)
  - huge `options[]` arrays (1000+ entries stressing `snapToSelectOption`)
  - pathological regex input (ReDoS — the regexes in ats-matchers.ts use `.?` quantifiers which are NOT ReDoS-vulnerable but a stress test would confirm)
  - duplicate FieldType votes from multiple passes (what if ATS matches AND Mozilla matches different types?)
  - profile with `Object.freeze`d nested objects (immutability contract holds?)
  - mass-assignment: ensure `classify` does not mutate its `descriptor` input
- WEAK: No state-machine / concurrency tests — but B4 is pure-TS, single-threaded, no async, no shared state. Acceptable omission.
- FAIR: The `'classifies email via name regex when autocomplete is missing'` test asserts `r.source === 'mozilla'`, but if B3's Mozilla port were to misfire, the test would fail for the wrong reason (mozilla miss would fall through to synonym match, which also produces `email`). The assertion is tight; test might become flaky across B3 revisions. Suggest asserting only `r.type === 'email'` and testing `source` in a separate targeted case.

### Finding-8 [low] — Test `'does NOT classify resume-upload when type is text'`
**Location**: pipeline.spec.ts ~line 2012-2017
**Issue**: Test uses `{ label: 'Resume', type: 'text' }` and asserts `r.type !== 'resume-upload'`. But the label "Resume" normalizes to "resume", which (a) fails the htmlTypeGuard in ATS_RULES so ATS pass misses, (b) hits Mozilla primary rules as... probably nothing (Mozilla doesn't know "resume"), (c) hits SYNONYMS if `resume-upload` synonyms contain "resume" — which they do per B2 phase_B2/plan.md (lookup in taxonomy/synonyms.ts). So Pass 4 synonym match would still return `resume-upload` via label synonym match, with confidence 0.8, which is >= threshold 0.5, so test would **fail**. The test's intent is valid — guarding htmlTypeGuard — but it doesn't account for the synonym fallback path. Fix: either (a) remove `'resume-upload'` from the SYNONYMS map entirely (since ats-matchers owns it), or (b) add htmlTypeGuard-equivalent filtering to the synonym pass for types that are file-only, or (c) weaken the test to only assert that `r.source !== 'ats-ext'`.

## Checklist F — Scope, drift, risks

- PASS: 2,954-line plan is self-contained for 64k executor — code is verbatim, no "refer to agent N for boilerplate" dodges.
- PASS: "Files NOT to touch" explicitly lists B2/B3-owned directories.
- PASS: "Out of scope" section covers keyword matching, DOM scanner, Workday, i18n, ML ranking, LLM fallback.
- PASS: Rollback plan is clean: delete three directories + revert barrel.
- RISK: the 74-entry FieldType union dispatch is hand-maintained. If B2's taxonomy adds a type without B4 adding a case branch, TS will flag via the `never` check — good. But if B2 renames or removes a type, B4's hard-coded string literals in ATS_RULES regex `type` fields will silently fail at runtime. The 45+ `AtsRule.type` assignments are a drift hazard. Mitigation: the `type: 'resume-upload'` style IS type-checked against `FieldType` at compile, so renames will surface. Acceptable.
- RISK: no canary for `FIELD_TYPE_PRIORITY` completeness. The table is typed as `Readonly<Record<FieldType, number>>`, so TS enforces every FieldType has a priority. Good.
- DRIFT: dispatch's `nickname` branch reads `profile.basics.preferredName ?? ''`. B2's `Basics.preferredName` is optional — OK. But `'nickname'` FieldType also corresponds to HTML autocomplete "nickname" — and `splitFullName` is used for `given-name`/`family-name` which is correct.
- DRIFT: `'country'` and `'country-name'` both route through `choiceOrSkip` with `countryCode` — but `country-name` semantically wants a spelled-out country ("United States"), not the ISO2 code. Minor semantic gap; acceptable as MVP limitation (and `snapToSelectOption` will fall back to code comparison).
- DRIFT: `'language'` branch reads `profile.languages[0]?.language ?? ''` — a raw language string like "English", then `textOrSkip`. But `language` is often a select with options like "en"/"en-US" or "English"/"English (US)". Should route through `choiceOrSkip(... classified.descriptor.options)` to benefit from `snapToSelectOption`. Minor but affects correctness on real forms.
- DRIFT: `'phonePrefix'` field in B2 (`basics.phonePrefix`) is never used in dispatch. `tel-country-code` case instead derives prefix from raw `phone` via regex. If the user populated `phonePrefix` but phone is in non-E.164 format, the derived code is wrong. Use `profile.basics.phonePrefix ?? deriveCountryCode(profile.basics.phone)`. Minor.
- PASS: Confidence score 9/10 in plan is realistic — the issues above are fixable, not fundamental.

## Checklist G — Invariants (from review brief)

- PASS: Classifier + fill rules + plan builder — pure TS core (no DOM, no I/O, no globals).
- PASS: NO DOM refs (`document`, `window`, `HTMLElement`, `chrome.`) all zero in source blocks.
- PASS: NO skill-taxonomy anywhere.
- PASS: NO HighlightRange consumed or imported.
- PASS: Consumes B2 types + B3 heuristics via documented barrel imports.
- PASS: Plan builder produces `FillInstruction[]` in shape consumed by B5 filler (via A8 content script glue).

---

## Required fixes before execution (executor-actionable)

1. **BUG-1 (BLOCKER)**: Snap `CONFIDENCE.ARIA_LABEL` to `0.5` (or add `0.4` to B2's `ClassificationConfidence` union via B2 revision). Delete the self-contradicting "collapse to 0.7" doc comment in scoring.ts.
2. **BUG-2 (BLOCKER)**: Add `willingToCompleteAssessments`, `willingToUndergoDrugTests`, `willingToUndergoBackgroundChecks` to both `makeProfile()` test fixtures.
3. **BUG-3 (BLOCKER)**: Add `requiresVisa`, `legallyAllowed` to every `JurisdictionAuthorization` literal in test fixtures.
4. **BUG-4 (BLOCKER)**: Add `allowEeoAutofill: false`, `allowDobAutofill: false` to every `Consents` literal in test fixtures.
5. **BUG-5 (BLOCKER)**: Fix 12 `return skip(...)` branches in dispatch.ts switch — wrap each as `return { value: skip('...'), skipReason: '...' }`.
6. **Finding-8 (HIGH)**: Reconcile the `'does NOT classify resume-upload when type is text'` test with the synonym fallback path — either strengthen htmlTypeGuard coverage in the synonym pass or weaken the test's assertion.

## Recommended improvements (non-blocking, should land this phase)

7. Route `'language'` through `choiceOrSkip(..., classified.descriptor.options)` instead of `textOrSkip`.
8. Use `profile.basics.phonePrefix` in the `'tel-country-code'` dispatch branch, falling back to `deriveCountryCode(phone)`.
9. Strengthen test coverage: add adversarial cases for script-injection labels, frozen profiles, 1000-option select stress, mutation-safety of classify().
10. Loosen the `'source'` assertion in the Mozilla-fallback test from `'mozilla'` to `'mozilla' | 'synonym'` or split into two cases.
11. Remove the misleading CONFIDENCE_* precondition check in Step 1 — B4 doesn't use those constants.

## Summary

- **Architecture**: correct. Pure core, consumes B2/B3 via proper barrels, emits plan for B5 via B2's `FillInstruction` contract.
- **Invariants**: all six critical invariants pass.
- **Contracts**: B2 type consumption has 4 blocker-class mismatches in test fixtures + 1 blocker in source dispatch + 1 blocker in confidence union. All mechanical; executor can fix in one pass.
- **Tests**: coverage is adequate (82+) but adversarial category is thin.
- **Minor drift**: three dispatch branches (`language`, `tel-country-code`, `country-name`) have suboptimal profile lookups but none are incorrect in the happy path.

**Grade: B-** (would be A- with BUGS 1-5 fixed; the test fixture gaps are the kind of thing that burns 30 minutes when the executor hits them cold on Day 3 with Workday + Greenhouse + Lever also due that week).
