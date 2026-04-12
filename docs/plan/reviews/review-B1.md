# Review — Phase B1 (ats-autofill-engine scaffold)

**Reviewer**: Claude Opus 4.6 (architect)
**Reviewed file**: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/plan.md`
**Review date**: 2026-04-11
**Scope**: B1 only, validated against `00-decision-memo.md`, `config.json`, and downstream phases B2-B9 + A7/A8/A9/A10

---

## Grade: C

Plan is scaffold-competent and reads verbatim-copyable, but ships with two load-bearing defects that break every downstream phase: (1) the `exports` map is missing the `./profile` sub-entry even though A7, A10, and B2 all import from `ats-autofill-engine/profile`; (2) `package.json` declares "zero runtime dependencies" while B2 requires `zod` installed during B1. These are not style nits — they are contract breakages that will force B2 and A7 to either patch B1's package.json mid-execution (forbidden by B2's own note at line 1958) or fail.

If both defects are fixed, the grade jumps to A- (see residual issues in section F).

---

## A. Decision memo conformance

| Check | Status | Note |
|---|---|---|
| Package name `ats-autofill-engine` (unscoped) | PASS | `package.json` line `"name": "ats-autofill-engine"` is correct and matches §2.1. |
| Version `0.1.0-alpha.1` as initial per §2.1 | FAIL (minor) | B1 publishes `0.1.0-alpha.0` as a name-reservation placeholder; B9 publishes `0.1.0-alpha.1`. Decision memo §2.1 says *"Initial version: `0.1.0-alpha.1`"* and §6.1 Success Criteria requires `ats-autofill-engine@0.1.0-alpha.1` on npm by Apr 17. The B1 plan rationalises this as a two-step (reserve with .0, real publish with .1), but the decision memo text does not document the placeholder. Either update the memo to sanction the placeholder, or change B1 to publish `.1` directly and make B9 a republish/update. Currently a documented drift. |
| Repo `ebenezer-isaac/ats-autofill-engine` (public, user namespace) | PASS | §2.3 conformance. |
| Dual licensing: MIT root + MPL-2.0 sub-modules | PASS | `LICENSE` + `LICENSES/MPL-2.0.txt` + file headers on `core/heuristics/`, `ats/greenhouse/`, `ats/lever/`, `ats/workday/`. Matches §2.4. |
| `tsconfig.core.json` with `lib: ["ES2022"]` (no DOM) | PASS | File 3, explicit invariant note. |
| CI grep for `document|window|chrome\.` in `dist/core/**` | PASS | CI workflow step 7 + local mirror `scripts/check-core-leak.mjs`. Matches §2.5 enforcement clause. |
| Skill-taxonomy never referenced | PASS | Zero hits in B1 plan (grep `skill-taxonomy` returns empty). |
| tsup config for build | PASS | File 5, 8 explicit entries, `platform: 'neutral'`, dts true, splitting true. |

Conformance score: 7/8 with one minor drift on version label.

---

## B. Exports map vs downstream imports (CRITICAL)

Grepped the full plan tree for `from ['"]ats-autofill-engine` and `from ['"]ats-autofill-engine/…`. Results below.

### Sub-entries declared in B1's `exports` map

`.`, `./ports`, `./heuristics`, `./dom`, `./chrome`, `./greenhouse`, `./lever`, `./workday`, `./package.json` — 8 + 1.

### Sub-entries actually imported by downstream phases

| Import path | Used in | Status vs B1 map |
|---|---|---|
| `ats-autofill-engine` (root) | A8 (types: `FormModel`, `FillInstruction`, `FillResult`, `FillPlan`; fn: `buildPlan`) | COVERED |
| `ats-autofill-engine/dom` | A9 (`detectPageIntent`, `extractJobDescription`, `walkTextNodes`, `PageIntent`, `HighlightRange`, `JobDescriptionResult`, `applyHighlights`) | COVERED |
| `ats-autofill-engine/greenhouse` | B9 (`GreenhouseAdapter`), A8 (dynamic import) | COVERED |
| `ats-autofill-engine/lever` | B9 (`LeverAdapter`), A8 (dynamic import) | COVERED |
| `ats-autofill-engine/workday` | B9 (`WorkdayAdapter`), A8 (dynamic import) | COVERED |
| `ats-autofill-engine/profile` | **A7 (lines 84, 142, 144, 190, 277, 278, 412, 413, 466, 467, 598, 711, 773, 1083, 1223, 1373, 1557, 1713); A10 (line 104); at least 18 import sites** | **NOT COVERED — CRITICAL BUG** |
| `ats-autofill-engine/ports` | no direct external imports found (internal-only in B2) | declared but unused by Plan A — acceptable (reserved for v1.1) |
| `ats-autofill-engine/heuristics` | no direct external imports found (internal-only in B3/B4) | declared but unused by Plan A — acceptable |
| `ats-autofill-engine/chrome` | no direct external imports found | declared but unused — acceptable |

### Finding B1-CRIT-01 — `./profile` sub-entry missing

**Severity**: CRITICAL (blocks A7, A10, and indirectly A5, A6, A11 through `ExtensionProfile` alias).

**Evidence**:
- Decision memo §2.5 lists the hex tree `core/types/`, `core/taxonomy/`, `core/heuristics/`, `core/classifier/`, `core/fill-rules/`, `core/plan-builder/`, `core/ports/` — **there is no explicit `profile` top-level, but there is also no `./profile` in the locked "8 sub-entries" wording in §2.2**.
- B2 creates `src/core/profile/` (files 12-16 in B2's plan) and exports it from `src/core/index.ts` at line 1452 (`export * from './profile';`). That means the Profile type IS reachable via the root entry `from 'ats-autofill-engine'`.
- BUT A7 imports exclusively from `ats-autofill-engine/profile` (18 sites) and A10 references the same path. Those imports will fail at TypeScript resolution time because B1's `exports` map has no `./profile` key.
- B2's plan explicitly defers exports-map ownership to B1: *"B1 locked the exports map. If B2 finds it missing entries, that is a bug in B1 and must be flagged back to the human operator (NOT silently patched in B2)."* (B2 line 1958). So B2 will refuse to fix this.

**Required fix** (to add in a corrective B1 plan):

1. Add `./profile` entry to the `package.json` `exports` map:
   ```json
   "./profile": {
     "types": "./dist/core/profile/index.d.ts",
     "import": "./dist/core/profile/index.js",
     "require": "./dist/core/profile/index.cjs"
   }
   ```
2. Add a matching tsup entry:
   ```ts
   'core/profile/index': 'src/core/profile/index.ts'
   ```
3. Create a placeholder `src/core/profile/index.ts` with `export {};` and the required empty placeholder test hook (consistent with the other 8 placeholders).
4. Update `README.md` Sub-entries table from 8 to 9 rows, adding `ats-autofill-engine/profile` with "Profile schema, Zod validator, defaults (JSON Resume + legal-auth flags)" / MIT.
5. Update `CHANGELOG.md` `[0.1.0-alpha.0]` Added entry from "8-entry `exports` map" to "9-entry `exports` map".
6. Update all acceptance criteria referencing "8 entries" to "9 entries" (at least 4 bullets: §Acceptance/package.json, §tsup config, §Source tree, §Tests-to-write item 5 which counts `8 entries × (.js+.cjs+.d.ts) = 24 output files`).
7. Update §Files-to-create from 25 to 26 files (add `src/core/profile/index.ts` placeholder).

**Alternative (worse) fix**: change A7 and A10 to import from the root `ats-autofill-engine` entry. This is worse because (a) it requires editing two downstream plans, (b) it defeats tree-shaking — the root entry will pull the full core taxonomy into the options page, and (c) decision memo §1.2 requires minimum bundle for the content script. Prefer the exports-map addition.

### Finding B1-CRIT-02 — `zod` missing from dependencies

**Severity**: CRITICAL (blocks B2).

**Evidence**:
- B1 `package.json` line: *"Zero runtime `dependencies`. The engine has no runtime deps by design."*
- B1 acceptance criteria line 952: `[ ] Zero runtime dependencies`.
- B2 line 87: *"`package.json` — B1 fixed the exports map; B2 needs no new deps beyond `zod` which B1 already installed"*.
- B2 line 91: *"If zod is NOT in package.json dependencies after B1, add this task to the top of step 1 below: `pnpm add zod@^3.23.8`. B1 should already have added it; double-check."*
- B2 line 99: *"Check package.json contains `"zod": "^3.23.8"` under dependencies. If missing, run `pnpm add zod@^3.23.8` from the package root."*

**Impact**: B2 creates `src/core/profile/zod.ts` which does `import { z } from 'zod'`. Without zod installed in B1, typecheck fails at the start of B2. The fallback clause in B2 ("If missing, run pnpm add…") contradicts B2 line 1958 which says dep changes must not be silently patched — this is an unresolved contradiction in B2 itself, but B1 is the root cause.

**Required fix**:

1. Add `"dependencies": { "zod": "^3.23.8" }` to B1 `package.json`.
2. Remove the "Zero runtime dependencies" note from B1 plan §Files 305 and acceptance §package.json line 952, OR replace with "Minimum runtime deps: only `zod` for schema validation; no browser, no DOM, no network deps".
3. Update `README.md` "The core entry has zero runtime dependencies" sentence to "The core entry has a single runtime dependency on `zod` for schema validation".
4. Update §Bundle size success criteria in decision memo §6.3 — zod adds ~12KB gzipped. Current target `core < 30KB gzipped` is already tight; adding zod may push it over. Either revise target to 40KB or flag this as a follow-up constraint for B2's bundle-size acceptance gate.

**Alternative (worse) fix**: push zod install into B2. Rejected because B2 line 1958 explicitly forbids it AND because every downstream B phase would have to re-check install-order invariants.

---

## C. Invariants checklist

| Invariant | Present | Evidence |
|---|---|---|
| Package name `ats-autofill-engine` unscoped | PASS | package.json line 180 |
| Version `0.1.0-alpha.1` matches memo §2.1 | PARTIAL FAIL | plan uses `0.1.0-alpha.0`; see section A |
| tsup config for build | PASS | File 5 |
| tsconfig.core.json `lib: ["ES2022"]` | PASS | File 3 |
| CI grep `document|window|chrome\.` in `dist/core/**` | PASS | CI workflow step 7 |
| LICENSE MIT root | PASS | File 12 |
| LICENSES/MPL-2.0.txt | PASS | File 13 |
| File-level MPL-2.0 headers | PASS | Files 20, 23, 24, 25 |
| `skill-taxonomy` absent from B1 | PASS | grep returns zero |
| Exports map covers downstream imports | **FAIL** | `./profile` missing; see B1-CRIT-01 |
| All downstream deps installed in correct phase | **FAIL** | `zod` missing; see B1-CRIT-02 |

Score: 9/11 invariants pass, 2 critical failures.

---

## D. Scaffold quality (non-blocking observations)

### D1. `packageManager` pin vs monorepo install

B1 pins `packageManager: "pnpm@9.12.0"` in a standalone repo (`e:/ats-autofill-engine/`). This is correct and reproducible, but `e:/job-assistant/` (extension repo from A1) uses `"ats-autofill-engine": "file:../ats-autofill-engine"` for Day-1 dev per A1 line 1319. Confirm the two pnpm versions match or that `corepack` is enabled on the executor's machine — if not, pnpm will emit a prompt and potentially fail CI. **Suggest**: B1 adds a README note "Developers consuming via `file:../ats-autofill-engine` must have pnpm 9.12.x installed or corepack enabled."

### D2. `tsconfig.json` rootDir conflicts with test files

B1 base config line 331: `"rootDir": "src"`. B2 will add `tests/core/profile/schema.spec.ts`. Because `tests/` is excluded from the base compile (`"exclude": [..., "tests"]`), this is fine for build output, but vitest will still typecheck test files using `tsconfig.json`. With `rootDir: "src"` and tests under `tests/`, `tsc --noEmit` on tests will error "File is not under rootDir". Vitest usually handles this via its own TS transform, so it may not surface — but running `tsc --noEmit tests/**` directly would fail. **Suggest**: B1 adds a `tsconfig.test.json` that extends base with `"include": ["src/**/*.ts", "tests/**/*.ts"]` and drops `rootDir`, or removes `rootDir` entirely from the base.

### D3. `prepublishOnly` runs `check:core-leak` before `build`?

B1 script: `"prepublishOnly": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build && pnpm run check:core-leak"`. Order is correct (build → check), good. No issue; flagging just to confirm.

### D4. `publint` and `arethetypeswrong` run against name-reservation publish

CI step 8 uses `pnpm dlx publint` and step 9 uses `pnpm dlx @arethetypeswrong/cli --pack .`. The `--pack .` flag runs against the LOCAL tarball — this is correct. `publint` without args runs against the current directory — also correct. Both will correctly catch the missing `./profile` sub-entry once it's added: publint validates every exports key resolves to a file on disk.

Good coverage; no issue.

### D5. Rollback plan npm-unpublish window

Rollback plan line 1044 notes "npm only allows unpublish within 72 hours". Correct as of 2026-04 per npm policy. Good awareness; no issue.

### D6. CI `publint` + `arethetypeswrong` are blocking?

CI step 9 ends with `|| true`, which silences failures. This is fine for the first-publish smoke, but the plan should make clear that these are advisory only on alpha.0 and MUST be blocking on alpha.1 (phase B9). **Suggest**: B9 plan should have a note to remove the `|| true` suffix. (Out of scope for B1 review, noted for completeness.)

---

## E. Grep-gate compliance

Ran `grep skill-taxonomy` on `phase_B1_scaffold/`: **zero hits**. PASS.

Ran `grep @ebenezer-isaac/` on B1 plan: one mention in §Confidence score at line 1097 as a fallback option ("fall back to `@ebenezer-isaac/ats-autofill-engine` (scoped)"). This is a documented escape hatch, NOT an instruction to publish under scope. **Marginal risk**: if executor reads the fallback and mis-interprets it, they may publish scoped. **Suggest**: B1 confidence section should explicitly say "DO NOT use this fallback without approval from architect; scoped publish requires updating all 8 import paths in A8/A9/B9 and violates decision memo §2.1". Acceptable minor risk.

Ran `grep -E "console\.(log|error|warn)" src` on B1 source stubs: zero hits (stubs are empty). PASS.

Ran `grep -E "document|window|chrome\."` on B1 source stubs: zero hits. PASS.

Ran `grep @repo/shared-types` on B1: zero hits. PASS (matches grep-gate `@repo/shared-types imported from ats-autofill-engine`).

---

## F. Residual issues after the two criticals are fixed

If B1-CRIT-01 and B1-CRIT-02 are corrected, these remain:

| # | Severity | Finding | Fix |
|---|---|---|---|
| B1-MIN-01 | Minor | Version `0.1.0-alpha.0` vs decision memo `0.1.0-alpha.1` drift | Update decision memo §2.1 to sanction the reservation placeholder, OR change B1 to publish `.1` directly (and drop the B9 republish step) |
| B1-MIN-02 | Minor | `tsconfig.json` `rootDir: "src"` may break direct `tsc` on tests | Add `tsconfig.test.json` or remove rootDir |
| B1-MIN-03 | Minor | Bundle-size target `core < 30KB gzipped` (decision memo §6.3) will be tight once zod is included | Raise target to 40KB or vendor a minimal Zod-like validator |
| B1-MIN-04 | Low | `scoped fallback` language in §Confidence section could mislead | Add explicit "do not use without architect approval" warning |
| B1-MIN-05 | Low | Decision memo §2.5 hex tree shows `core/types/`, `core/taxonomy/`, `core/heuristics/`, `core/classifier/`, `core/fill-rules/`, `core/plan-builder/`, `core/ports/` — no `core/profile/`. B2 adds `core/profile/` without updating the memo. | Update decision memo §2.5 tree to include `core/profile/` to preserve audit trail |

None of these five blocks execution; they are cleanup tasks for the corrective B1 plan.

---

## G. Summary

**Grade: C**

**Blocking bugs** (must fix before orchestrator launches B1):
1. **B1-CRIT-01** — Add `./profile` sub-entry to exports map, tsup config, README table, CHANGELOG, acceptance criteria, source tree.
2. **B1-CRIT-02** — Add `zod` to `dependencies` (not devDependencies), update README, update decision memo bundle-size target.

**Non-blocking** (should fix, but orchestrator can proceed without):
- 5 minor/low issues in section F.

**Verdict**: B1 as-written has solid scaffold hygiene (tsup, vitest projects, eslint flat, CI leak check, rollback plan, publint smoke, dual-license layout) but fails the central invariant "exports map must cover all downstream imports" because downstream A7/A10 use `ats-autofill-engine/profile` which isn't in the map. Combined with the zod-dep contradiction, B1 needs a corrective pass before it's safe to hand to an executor. After corrections, this becomes an A- plan.

---

**End of review.**
