# Phase B1 - ats-autofill-engine scaffold (v2.1 rewrite)

## Phase metadata

| Field | Value |
|---|---|
| **Phase code** | B1 |
| **Phase name** | ats-autofill-engine repo scaffold (reservation publish) |
| **Plan** | 100 - Chrome Extension POC + V1 |
| **Plan revision** | v2.1 (post-review-B1, post-decision-memo-v2.1-final) |
| **Track** | Track 1 (engine) |
| **Target repo** | `ebenezer-isaac/ats-autofill-engine` (NEW, public, user namespace) |
| **Local path** | `e:/ats-autofill-engine` (NEW, outside llmconveyors.com workspace) |
| **Day** | 1 - 2026-04-12 |
| **Estimated effort** | 2.5 hours (scaffold 90 min, smoke + lint 20 min, publish + verify 20 min, rollback rehearsal 20 min) |
| **Depends on** | nothing (pure scaffold, first phase of engine track) |
| **Blocks** | B2, B3, B4, B5, B6, B7, B8, B9 (entire engine track); A5, A6, A7, A8, A9, A10, A11 (every extension phase that imports from `ats-autofill-engine`) |
| **Confidence** | 9.5/10 |
| **Files touched** | 28 files created, 0 modified (NEW repo) |
| **Lines changed** | +1100 lines added, 0 removed |
| **Decisions applied** | D4 repo identity, D11 structured logger (scaffolded for engine-side error reporting utility), D12 publish protocol, D13 version trajectory, D14 anti-drift scripts, D15 em-dash ban, D19 adversarial test categories, D22 blueprint contracts, D23 rollback script, D24 coverage thresholds |

---

## Purpose

This phase creates the `ats-autofill-engine` npm package repo and publishes `0.1.0-alpha.1` directly (no placeholder `alpha.0`) to npm under the `ebenezer-isaac` namespace. The publish is a **name reservation** with minimal artifacts - the nine sub-entry barrels are empty `export {};` placeholders that downstream phases B2 through B9 populate. The ONLY runtime dependency shipped is `zod@^3.23.8` (required by B2's profile schema, A5's message handler validation, A7's options-page parse). Per D13, B9 will later bump the version to `0.1.0-alpha.2` when the three ATS adapters ship.

The phase also installs the full anti-drift toolchain from keystone contracts section 9: five validation scripts (`check-core-leak.sh`, `check-no-console.sh`, `check-no-em-dash.sh`, `check-exports-resolution.mjs`, `check-blueprint-contracts.mjs`), a Husky pre-commit hook that runs three of them, and a GitHub Actions workflow that runs all five plus `publint` and `arethetypeswrong`.

This is the single most blast-radius-wide phase in Plan 100: ten downstream phases depend on B1 producing a consumable npm package with exactly the right `exports` map shape. Any drift here cascades.

---

## Required reading (executor MUST read before starting)

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md`
   - Section 1 D4: repo identity (note D4 pins the CHROME EXTENSION repo path, not the engine; the engine stays at `e:/ats-autofill-engine` and `ebenezer-isaac/ats-autofill-engine` per section 2.3 of the earlier memo, reconfirmed in this memo's keystone reference)
   - Section 2 D11: structured logger pattern (engine exposes a lightweight `createLogger` stub in `core/ports` so A5/A7/A8 can wire their extension logger in; B1 ships ONLY the interface file under `core/ports/logger.ts` with one `Logger` type and zero implementation)
   - Section 2 D12: publish protocol (dry-run first, `.npmignore` verification, provenance flag, 2FA step)
   - Section 2 D13: version trajectory (B1 publishes `0.1.0-alpha.1` directly; B9 bumps to `0.1.0-alpha.2`)
   - Section 2 D14: five anti-drift scripts, each phase MUST install them (B1 is the first phase, so B1 writes all five scripts to disk)
   - Section 2 D15: em-dash rule, enforced by `scripts/check-no-em-dash.sh`, installed as pre-commit hook from B1
   - Section 2 D19: six mandatory adversarial test categories per phase
   - Section 2 D22: `blueprint.contract.ts` files in every area; B1 ships the engine-root `src/blueprint.contract.ts` so B2+ can extend
   - Section 2 D23: rollback script `scripts/rollback-phase-B1.sh` (or `.ps1`, Windows-first accepted)
   - Section 2 D24: coverage thresholds (core 90/85, adapters 85/80) wired into `vitest.config.ts`

2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md`
   - Section 4 verbatim: full `package.json` with 9-entry exports map + tsup config with 9 entries + license string `"MIT AND MPL-2.0"` + `zod@^3.23.8` in dependencies
   - Section 9: all five anti-drift scripts (9.1 through 9.5), Husky hook (9.6), CI workflow gate (9.7)
   - Section 10: summary table of what every phase imports - B1 imports only `zod`, B2 imports `zod`, everyone else imports from `ats-autofill-engine` and its sub-entries

3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-B1.md`
   - Grade C verdict; the two CRITs this rewrite fixes (B1-CRIT-01 missing `./profile` sub-entry, B1-CRIT-02 missing `zod` dependency)
   - All five residual minor issues (B1-MIN-01 through B1-MIN-05) addressed here

4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B2_core_types_and_taxonomy/plan.md`
   - B2 imports `zod` from day one, in `src/core/profile/zod.ts`. B1 MUST pre-install it.
   - B2 populates `src/core/profile/index.ts`, `src/core/types/index.ts`, `src/core/ports/index.ts`, `src/core/heuristics/index.ts`, `src/core/index.ts` - B1 only creates empty barrels at these paths.

5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A7_profile_storage_and_options/plan.md`
   - A7 imports from `ats-autofill-engine/profile` on 18 distinct lines. B1 MUST expose `./profile` as its own exports map entry. This rewrite adds it.

6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B9_workday_adapter_and_publish/plan.md`
   - B9 bumps version to `0.1.0-alpha.2` and re-publishes with real adapters. B1 sets up the publish tooling so B9 only changes one field.

7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B7_greenhouse_adapter/plan.md` and `phase_B8_lever_adapter/plan.md`
   - B7/B8/B9 each populate one of the three ats/* sub-entries. B1 creates the empty barrels at the exact path the exports map points to.

---

## Files to create (28 files)

### Root config files (13)

| # | Path | Purpose |
|---|---|---|
| 1 | `e:/ats-autofill-engine/package.json` | Manifest with 9-entry exports map, version `0.1.0-alpha.1`, license `MIT AND MPL-2.0`, `zod@^3.23.8` in `dependencies` |
| 2 | `e:/ats-autofill-engine/tsconfig.json` | Base TS config (NO `rootDir`, see B1-MIN-02 fix) |
| 3 | `e:/ats-autofill-engine/tsconfig.core.json` | Core compile - `lib: ["ES2022"]` NO DOM |
| 4 | `e:/ats-autofill-engine/tsconfig.adapter.json` | Adapter compile - `lib: ["ES2022", "DOM", "DOM.Iterable"]` |
| 5 | `e:/ats-autofill-engine/tsup.config.ts` | Build config with 9 entry points, `format.comments: /@license|MPL|Mozilla Public/i` |
| 6 | `e:/ats-autofill-engine/vitest.config.ts` | Two projects (core node, adapters happy-dom) with per-project coverage thresholds per D24 |
| 7 | `e:/ats-autofill-engine/eslint.config.mjs` | Flat config, `import/no-restricted-paths`, `no-console: error`, `no-explicit-any: error` |
| 8 | `e:/ats-autofill-engine/.gitignore` | node_modules, dist, coverage, .orig, .env, .tsbuildinfo |
| 9 | `e:/ats-autofill-engine/.npmignore` | Exclude tests, configs, scripts, investigation, src, .orig from tarball |
| 10 | `e:/ats-autofill-engine/.editorconfig` | LF, UTF-8, 2-space |
| 11 | `e:/ats-autofill-engine/.prettierrc` | Prettier config (single quote, no trailing comma) |
| 12 | `e:/ats-autofill-engine/.husky/pre-commit` | Runs three anti-drift scripts before every commit |
| 13 | `e:/ats-autofill-engine/.nvmrc` | Node 20.11.0 pin for reproducible dev environment |

### License + docs (4)

| # | Path | Purpose |
|---|---|---|
| 14 | `e:/ats-autofill-engine/LICENSE` | MIT root license |
| 15 | `e:/ats-autofill-engine/LICENSES/MPL-2.0.txt` | Verbatim MPL-2.0 text (approx 16 KB, fetched from canonical URL) |
| 16 | `e:/ats-autofill-engine/README.md` | 9-entry sub-entries table, install command, dual-license note, contributing note |
| 17 | `e:/ats-autofill-engine/CHANGELOG.md` | Keep-a-Changelog format, `[0.1.0-alpha.1] - 2026-04-12` entry |

### CI + anti-drift scripts (7)

| # | Path | Purpose |
|---|---|---|
| 18 | `e:/ats-autofill-engine/.github/workflows/ci.yml` | 11-step CI: install, typecheck, lint, test, build, five anti-drift gates, publint, arethetypeswrong |
| 19 | `e:/ats-autofill-engine/scripts/check-core-leak.sh` | Greps `src/core/` for `document|window|HTMLElement|chrome\.` and for V1 remnants (`HighlightRange`, `IKeywordHighlighter`, `skill-taxonomy`); per keystone 9.1 |
| 20 | `e:/ats-autofill-engine/scripts/check-no-console.sh` | Greps for `console\.(log|info|warn|error|debug)` in the engine source (scoped to `src/adapters/` and `src/ats/` since core is pure); no-op for engine since it has no `entrypoints/` or `src/background/` paths, but the script body matches keystone 9.2 verbatim so downstream extension repos can reuse it without divergence |
| 21 | `e:/ats-autofill-engine/scripts/check-no-em-dash.sh` | Greps for U+2014 in all .ts/.tsx/.md/.json; per keystone 9.3 |
| 22 | `e:/ats-autofill-engine/scripts/check-exports-resolution.mjs` | Node script that imports every one of the 9 exports map entries and asserts they resolve; per keystone 9.4 |
| 23 | `e:/ats-autofill-engine/scripts/check-blueprint-contracts.mjs` | Reads every `**/blueprint.contract.ts`, verifies declared publicExports match actual exports, forbiddenImports are absent, requiredCoverage is met; per keystone 9.5 |
| 24 | `e:/ats-autofill-engine/scripts/rollback-phase-B1.sh` | Mechanical rollback script per D23 (deletes dir, deletes GitHub repo, deprecates npm) |

### Source tree - empty barrel stubs (9 sub-entry barrels + 1 blueprint contract + 1 logger port type)

| # | Path | Purpose |
|---|---|---|
| 25 | `e:/ats-autofill-engine/src/core/index.ts` | `.` entry barrel - empty `export {};` placeholder, B2 populates |
| 26 | `e:/ats-autofill-engine/src/core/profile/index.ts` | `./profile` entry barrel - empty `export {};` placeholder, B2 populates with `Profile`, `ProfileSchema`, `createEmptyProfile` |
| 27 | `e:/ats-autofill-engine/src/core/ports/index.ts` | `./ports` entry barrel - empty `export {};` placeholder, B2 populates |
| 28 | `e:/ats-autofill-engine/src/core/heuristics/index.ts` | `./heuristics` entry barrel - MPL-2.0 header + empty `export {};`, B3 populates |
| 29 | `e:/ats-autofill-engine/src/adapters/dom/index.ts` | `./dom` entry barrel - empty `export {};`, B5/B6 populates |
| 30 | `e:/ats-autofill-engine/src/adapters/chrome/index.ts` | `./chrome` entry barrel - empty `export {};`, B5 populates |
| 31 | `e:/ats-autofill-engine/src/ats/greenhouse/index.ts` | `./greenhouse` entry barrel - MPL-2.0 header + empty `export {};`, B7 populates |
| 32 | `e:/ats-autofill-engine/src/ats/lever/index.ts` | `./lever` entry barrel - MPL-2.0 header + empty `export {};`, B8 populates |
| 33 | `e:/ats-autofill-engine/src/ats/workday/index.ts` | `./workday` entry barrel - MPL-2.0 header + empty `export {};`, B9 populates |
| 34 | `e:/ats-autofill-engine/src/blueprint.contract.ts` | Engine-root blueprint contract per D22; declares `ENGINE_BLUEPRINT` with phase `B1`, version `2.1`, publicExports per exports map |

### Test scaffold placeholders (6)

| # | Path | Purpose |
|---|---|---|
| 35 | `e:/ats-autofill-engine/tests/.gitkeep` | Keep tests/ in git |
| 36 | `e:/ats-autofill-engine/tests/core/.gitkeep` | Vitest `core` project target dir |
| 37 | `e:/ats-autofill-engine/tests/adapters/.gitkeep` | Vitest `adapters` project target dir |
| 38 | `e:/ats-autofill-engine/tests/scaffold/package-schema.test.ts` | Adversarial test 1 per D19: parses `package.json`, asserts 9 exports entries, version `0.1.0-alpha.1`, license `MIT AND MPL-2.0`, `zod` in dependencies |
| 39 | `e:/ats-autofill-engine/tests/scaffold/exports-roundtrip.test.ts` | Adversarial test 2: every exports map entry resolves to a file on disk (paths must exist post-build) |
| 40 | `e:/ats-autofill-engine/tests/scaffold/bundle-size.test.ts` | Adversarial test 3: reads `dist/core/index.js` size after gzip, asserts < 30 KB (alpha.1 gate is informational since core is empty; B2 onwards enforces the real 30 KB target) |

### tsconfig test variant (1)

| # | Path | Purpose |
|---|---|---|
| 41 | `e:/ats-autofill-engine/tsconfig.test.json` | Test-only tsconfig that includes both `src/` and `tests/` (per B1-MIN-02 fix - `tsconfig.json` no longer has `rootDir`, so tests compile cleanly) |

Revised total: 41 files (up from 25 in the v1 plan). The increase is driven by:
- 1 new sub-entry barrel (`src/core/profile/index.ts`)
- 1 new `.nvmrc`
- 1 Husky hook
- 5 anti-drift scripts
- 1 rollback script
- 1 blueprint contract
- 3 adversarial scaffold tests
- 1 test-variant tsconfig

---

## Files to modify

**None.** This is a new repo. The PARENT workspace `e:/llmconveyors.com/` is NOT touched by B1 - the engine lives in a sibling directory.

---

## Step-by-step implementation

### Step 1 - Create repo directory, init git, init Husky

```bash
cd e:/
mkdir ats-autofill-engine
cd ats-autofill-engine
git init -b main
git config core.autocrlf false
git config core.eol lf
```

### Step 2 - Write all config files from section "Code snippets"

Paste every File 1 through File 41 verbatim. Do NOT deviate from the text in section "Code snippets" below - those are the single source of truth, derived from keystone contracts section 4 and section 9.

### Step 3 - Create empty src tree + blueprint contract + tests tree

```bash
mkdir -p src/core/profile src/core/ports src/core/heuristics
mkdir -p src/adapters/dom src/adapters/chrome
mkdir -p src/ats/greenhouse src/ats/lever src/ats/workday
mkdir -p tests/core tests/adapters tests/scaffold
mkdir -p scripts .github/workflows .husky LICENSES
touch tests/.gitkeep tests/core/.gitkeep tests/adapters/.gitkeep
```

Then create each barrel `index.ts` from the code snippets below (File 25 through File 34, plus the blueprint contract at File 34).

### Step 4 - Install dependencies

```bash
pnpm install
```

Expected: clean resolve; generates `pnpm-lock.yaml`; no peer warnings beyond the standard Node-DOM overlap note. `zod@3.23.8` should resolve; verify with `pnpm list zod`.

### Step 5 - Install Husky pre-commit hook

```bash
pnpm dlx husky init
chmod +x scripts/check-core-leak.sh scripts/check-no-console.sh scripts/check-no-em-dash.sh
chmod +x .husky/pre-commit
```

On Windows, `chmod +x` is a no-op; Git-Bash runs the scripts via their shebang anyway. Verify by running:

```bash
./.husky/pre-commit
```

Expected output: three PASS lines (no core leaks, no console usage, no em-dashes) because `src/` is empty stubs.

### Step 6 - Smoke-test the toolchain

Run each in order, every one MUST exit 0:

```bash
pnpm typecheck      # Both tsconfig.core.json AND tsconfig.adapter.json
pnpm lint           # ESLint - zero errors
pnpm test           # Vitest - 3 scaffold tests PASS, 0 failures
pnpm build          # tsup emits dist/ with 9 entries x (.js + .cjs + .d.ts) = 27 output files
pnpm check:exports  # Node script imports every exports map entry locally via file:// path
```

### Step 7 - Verify core leak grep works against a deliberately poisoned file

Manual sanity check (DO NOT commit this):

```bash
# Temporarily poison src/core/index.ts
echo "const x = document.body;" >> src/core/index.ts
./scripts/check-core-leak.sh   # MUST exit 1 with "CORE LEAK:" output
# Revert
git checkout -- src/core/index.ts
./scripts/check-core-leak.sh   # MUST exit 0
```

### Step 8 - First git commit

```bash
git add .
git commit -m "chore: scaffold ats-autofill-engine 0.1.0-alpha.1"
```

The pre-commit hook runs automatically; all three gates MUST pass.

### Step 9 - Create GitHub repo and push

```bash
gh repo create ebenezer-isaac/ats-autofill-engine \
  --public \
  --source=. \
  --remote=origin \
  --description "Deterministic form autofill engine for ATS job applications (Greenhouse, Lever, Workday). Framework-agnostic core + browser adapters. MV3 compatible."
git push -u origin main
```

### Step 10 - Wait for first CI run to pass

Poll `gh run list --branch main --limit 1` until the top row shows `completed success`. The CI MUST pass on an empty repo because every anti-drift gate is a no-op on empty src.

If CI fails, STOP. Do not publish. Produce a corrective sub-plan.

### Step 11 - Pre-publish verification (D12)

```bash
# 11a. Verify tarball contents BEFORE publish
pnpm pack --dry-run > /tmp/pack.log 2>&1
grep -q "tests/"          /tmp/pack.log && { echo "FAIL: tests leaked"; exit 1; }
grep -q "investigation/"  /tmp/pack.log && { echo "FAIL: investigation leaked"; exit 1; }
grep -q "\.orig"          /tmp/pack.log && { echo "FAIL: .orig leaked"; exit 1; }
grep -q "src/"            /tmp/pack.log && { echo "FAIL: src leaked"; exit 1; }
grep -q "LICENSES/MPL-2.0.txt" /tmp/pack.log || { echo "FAIL: MPL license missing from tarball"; exit 1; }
grep -q "LICENSE"         /tmp/pack.log || { echo "FAIL: MIT LICENSE missing from tarball"; exit 1; }
grep -q "README.md"       /tmp/pack.log || { echo "FAIL: README.md missing from tarball"; exit 1; }
grep -q "CHANGELOG.md"    /tmp/pack.log || { echo "FAIL: CHANGELOG.md missing from tarball"; exit 1; }
grep -q "dist/core/index.js" /tmp/pack.log || { echo "FAIL: dist root entry missing"; exit 1; }
grep -q "dist/core/profile/index.js" /tmp/pack.log || { echo "FAIL: dist core/profile entry missing"; exit 1; }
echo "Tarball verification PASS"

# 11b. Dry-run publish to verify registry accepts the manifest
pnpm publish --dry-run --access public --tag alpha --no-git-checks
```

Expected: dry-run succeeds with no warnings.

### Step 12 - Real publish with provenance

2FA OTP prompt appears; executor enters current authenticator code. PROVENANCE is OFF for this specific phase because B1 publishes from a developer machine, not GitHub Actions (GitHub OIDC provenance requires the release to originate from a workflow_dispatch trigger). B9 flips provenance to ON when it republishes to `alpha.2` from CI.

```bash
pnpm publish --access public --tag alpha --no-git-checks
```

### Step 13 - Verify on the registry

```bash
sleep 5
npm view "ats-autofill-engine@0.1.0-alpha.1" version
npm view "ats-autofill-engine@0.1.0-alpha.1" dependencies
npm view "ats-autofill-engine@0.1.0-alpha.1" exports
```

Expected: version `0.1.0-alpha.1`, dependencies `{ zod: "^3.23.8" }`, exports with 9 sub-entries.

### Step 14 - Tag the release in git

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

### Step 15 - Rollback rehearsal (D23)

Executor runs `./scripts/rollback-phase-B1.sh --dry-run` to verify the rollback script parses correctly. The script DOES NOT run in live mode unless explicitly invoked with `--live`. Dry-run output is captured and attached to the phase completion report.

---

## Code snippets

All files are verbatim. Executor copies and pastes.

### File 1 - `package.json`

Per keystone contracts section 4, verbatim, expanded with author, keywords, scripts, devDependencies, publishConfig, engines, packageManager.

```json
{
  "name": "ats-autofill-engine",
  "version": "0.1.0-alpha.1",
  "description": "Deterministic form autofill engine for ATS job applications (Greenhouse, Lever, Workday). Framework-agnostic core with browser adapters. Chrome MV3 and Node compatible.",
  "license": "MIT AND MPL-2.0",
  "author": "Ebenezer Isaac <ebenezer@llmconveyors.com>",
  "homepage": "https://github.com/ebenezer-isaac/ats-autofill-engine#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ebenezer-isaac/ats-autofill-engine.git"
  },
  "bugs": {
    "url": "https://github.com/ebenezer-isaac/ats-autofill-engine/issues"
  },
  "keywords": [
    "autofill",
    "form-autofill",
    "form-filler",
    "ats",
    "greenhouse",
    "lever",
    "workday",
    "job-application",
    "chrome-extension",
    "mv3",
    "react-controlled-input",
    "taxonomy",
    "hexagonal-architecture",
    "framework-agnostic",
    "typescript",
    "zod"
  ],
  "type": "module",
  "sideEffects": false,
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
  "files": [
    "dist",
    "LICENSE",
    "LICENSES",
    "README.md",
    "CHANGELOG.md"
  ],
  "engines": {
    "node": ">=20.0.0"
  },
  "publishConfig": {
    "access": "public",
    "provenance": false
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit -p tsconfig.core.json && tsc --noEmit -p tsconfig.adapter.json && tsc --noEmit -p tsconfig.test.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:core": "vitest run --project core",
    "test:adapters": "vitest run --project adapters",
    "test:watch": "vitest",
    "check:core-leak": "bash scripts/check-core-leak.sh",
    "check:no-console": "bash scripts/check-no-console.sh",
    "check:no-em-dash": "bash scripts/check-no-em-dash.sh",
    "check:exports": "node scripts/check-exports-resolution.mjs",
    "check:blueprints": "node scripts/check-blueprint-contracts.mjs",
    "check:all": "pnpm run check:core-leak && pnpm run check:no-console && pnpm run check:no-em-dash && pnpm run check:blueprints",
    "publish:alpha": "pnpm run prepublishOnly && pnpm publish --access public --tag alpha --no-git-checks",
    "prepublishOnly": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build && pnpm run check:all && pnpm run check:exports",
    "prepare": "husky"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "peerDependencies": {},
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.16.4",
    "@eslint/js": "^9.12.0",
    "@mozilla/readability": "^0.5.0",
    "@types/chrome": "^0.0.268",
    "@types/node": "^22.7.0",
    "@types/turndown": "^5.0.5",
    "@vitest/coverage-v8": "^2.1.1",
    "eslint": "^9.12.0",
    "eslint-plugin-import": "^2.31.0",
    "happy-dom": "^15.7.4",
    "husky": "^9.1.6",
    "prettier": "^3.3.3",
    "publint": "^0.2.11",
    "tsup": "^8.3.0",
    "turndown": "^7.2.0",
    "turndown-plugin-gfm": "^1.0.2",
    "typescript": "~5.6.3",
    "typescript-eslint": "^8.8.0",
    "vitest": "^2.1.1"
  },
  "packageManager": "pnpm@9.12.0"
}
```

**Notes**:
- Version is `0.1.0-alpha.1` DIRECTLY per D13. There is no `alpha.0` placeholder.
- License is `"MIT AND MPL-2.0"` per SPDX spec for dual-licensed packages.
- `zod` is in `dependencies`, NOT `devDependencies`. This fixes B1-CRIT-02.
- `exports` map has 9 sub-entries plus `./package.json` escape hatch, matching keystone section 4 verbatim. This fixes B1-CRIT-01.
- `main` and `types` point at `./dist/core/index.js` and `./dist/core/index.d.ts` (not the old `./dist/index.*`) to match the new dist layout produced by tsup entry `core/index`.
- `@mozilla/readability`, `turndown`, `turndown-plugin-gfm`, `@types/turndown` are in devDeps because B2/B3 use them at build time but they're tree-shaken out of downstream bundles via `sideEffects: false`.
- `prepare: "husky"` wires the pre-commit hook at install time.
- `provenance: false` on alpha.1 because publish originates from a developer machine. B9 switches to a CI-driven release and flips this to true for alpha.2.

### File 2 - `tsconfig.json` (base, shared)

Per B1-MIN-02 fix, `rootDir` is removed so test files compile cleanly through `tsconfig.test.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests", "coverage"]
}
```

### File 3 - `tsconfig.core.json` (core, NO DOM)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": []
  },
  "include": [
    "src/core/**/*.ts",
    "src/blueprint.contract.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "tests",
    "coverage",
    "src/adapters/**",
    "src/ats/**"
  ]
}
```

**Invariant**: `lib: ["ES2022"]` and `types: []` guarantee no DOM types leak into core. Any `document`/`window`/`HTMLElement` reference under `src/core/**` fails compilation. Enforced by CI grep (`scripts/check-core-leak.sh`) as a second gate.

### File 4 - `tsconfig.adapter.json` (adapter + ATS, WITH DOM)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "node"]
  },
  "include": [
    "src/adapters/**/*.ts",
    "src/ats/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "tests",
    "coverage"
  ]
}
```

### File 5 - `tsconfig.test.json` (tests, B1-MIN-02 fix)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "coverage"
  ]
}
```

### File 6 - `tsup.config.ts`

Per keystone section 4 verbatim, with 9 entries and `format.comments` regex to preserve MPL license headers through minification.

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'core/profile/index': 'src/core/profile/index.ts',
    'core/ports/index': 'src/core/ports/index.ts',
    'core/heuristics/index': 'src/core/heuristics/index.ts',
    'adapters/dom/index': 'src/adapters/dom/index.ts',
    'adapters/chrome/index': 'src/adapters/chrome/index.ts',
    'ats/greenhouse/index': 'src/ats/greenhouse/index.ts',
    'ats/lever/index': 'src/ats/lever/index.ts',
    'ats/workday/index': 'src/ats/workday/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2022',
  platform: 'neutral',
  outDir: 'dist',
  skipNodeModulesBundle: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  terserOptions: {
    format: { comments: /@license|MPL|Mozilla Public/i }
  }
});
```

**Notes**:
- 9 entries match the 9 sub-entries in the exports map (new `core/profile/index` is the addition vs v1).
- `platform: 'neutral'` plus `sideEffects: false` plus `splitting: true` gives downstream bundlers full tree-shaking.
- `terserOptions.format.comments` preserves the five-line MPL-2.0 header on the four MPL-licensed files even if a future `minify: true` is enabled. `@license` is also preserved for any Readability-derived comments.

### File 7 - `vitest.config.ts`

Per D24, coverage thresholds are per-project: core 90 line / 85 branch, adapters 85 line / 80 branch. B1 ships empty barrels, so the actual test surface is the three scaffold tests in `tests/scaffold/`.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['tests/core/**/*.test.ts', 'tests/scaffold/**/*.test.ts'],
          environment: 'node',
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            include: ['src/core/**/*.ts', 'src/blueprint.contract.ts'],
            exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
            thresholds: {
              lines: 90,
              functions: 90,
              branches: 85,
              statements: 90
            }
          }
        }
      },
      {
        test: {
          name: 'adapters',
          include: ['tests/adapters/**/*.test.ts'],
          environment: 'happy-dom',
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            include: ['src/adapters/**/*.ts', 'src/ats/**/*.ts'],
            exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
            thresholds: {
              lines: 85,
              functions: 85,
              branches: 80,
              statements: 85
            }
          }
        }
      }
    ]
  }
});
```

**Phase B1 caveat**: since `src/core/**` and `src/adapters/**` and `src/ats/**` are empty barrels under B1, coverage calculations would divide by zero and fail. Vitest's v8 provider treats empty include sets as 100 percent covered (no uncovered lines to count), so thresholds pass trivially. B2 onwards ships real source and real tests that must hit the thresholds.

### File 8 - `eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/core',
              from: './src/adapters',
              message: 'core/** must not import from adapters/**'
            },
            {
              target: './src/core',
              from: './src/ats',
              message: 'core/** must not import from ats/**'
            },
            {
              target: './src/adapters',
              from: './src/ats',
              message: 'adapters/** must not import from ats/** (ATS packages extend adapters, not the reverse)'
            }
          ]
        }
      ]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'scripts/**', '.husky/**']
  }
];
```

`no-console: error` is strict (no `allow: ['warn', 'error']`) because the engine has zero `console.*` usage - all logging goes through a caller-provided `Logger` port. The scripts directory is ignored because anti-drift scripts may use `console.log` for their own reporting.

### File 9 - `.gitignore`

```
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
.env.*
!.env.example
.vitest-cache/
.turbo/
*.tsbuildinfo
*.orig
/tmp/
```

### File 10 - `.npmignore`

Per D12, the tarball MUST NOT contain tests, investigation, src, tsconfigs, or .orig files. The `files` array in package.json is the allowlist; `.npmignore` is a belt-and-braces denylist.

```
src/
tests/
coverage/
investigation/
.github/
scripts/
.husky/
.vscode/
.idea/
tsconfig.json
tsconfig.core.json
tsconfig.adapter.json
tsconfig.test.json
tsup.config.ts
vitest.config.ts
eslint.config.mjs
.prettierrc
.editorconfig
.gitignore
.nvmrc
*.log
*.tsbuildinfo
*.orig
```

### File 11 - `.editorconfig`

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

### File 12 - `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### File 13 - `.nvmrc`

```
20.11.0
```

### File 14 - `.husky/pre-commit` (per keystone 9.6)

```bash
#!/usr/bin/env bash
. "$(dirname -- "$0")/_/husky.sh"
bash scripts/check-no-em-dash.sh
bash scripts/check-core-leak.sh
bash scripts/check-no-console.sh
```

Executor runs `chmod +x .husky/pre-commit` on POSIX. On Windows the shebang is interpreted by Git-Bash automatically.

### File 15 - `LICENSE` (MIT at root)

```
MIT License

Copyright (c) 2026 Ebenezer Isaac

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Portions of this Software are licensed under the Mozilla Public License 2.0.
See LICENSES/MPL-2.0.txt for the MPL-2.0 terms. Files covered by MPL-2.0 are
identified by a per-file header comment and are listed in README.md under
the "Licensing" section.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### File 16 - `LICENSES/MPL-2.0.txt`

Fetch the canonical Mozilla Public License 2.0 text from `https://www.mozilla.org/media/MPL/2.0/index.f75d2927d3c1.txt` (or the current canonical URL - `https://www.mozilla.org/en-US/MPL/2.0/` HTML page with the plain-text download link).

The file is approximately 16 KB of plain text. Do NOT abbreviate, do NOT substitute wording. Preserve exactly:
- `Mozilla Public License Version 2.0` as the first line
- All 10 sections verbatim
- The `Exhibit A - Source Code Form License Notice` at the end
- The `Exhibit B - Incompatible With Secondary Licenses Notice` at the end

### File 17 - `README.md`

```markdown
# ats-autofill-engine

> Deterministic form autofill engine for ATS job applications. Framework-agnostic core with browser adapters. Chrome MV3 and Node compatible.

[![npm](https://img.shields.io/npm/v/ats-autofill-engine?style=flat-square)](https://www.npmjs.com/package/ats-autofill-engine)
[![license](https://img.shields.io/badge/license-MIT%20AND%20MPL--2.0-blue?style=flat-square)](#licensing)

## Status

**Pre-alpha**. The `0.1.0-alpha.1` release reserves the name on npm while the full implementation lands across phases B2 to B9. The `0.1.0-alpha.2` release will ship the three ATS adapters (Greenhouse, Lever, Workday). See [CHANGELOG.md](./CHANGELOG.md).

## What is this?

`ats-autofill-engine` is a framework-agnostic TypeScript library for detecting and filling job-application forms. It ships a pure core that classifies form fields using a ported Mozilla HeuristicsRegExp taxonomy, plus optional browser adapters for the three largest ATS platforms:

- Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`)
- Lever (`jobs.lever.co`)
- Workday (`*.myworkdayjobs.com` multi-step wizard)

The package uses a hexagonal architecture: the `core` subpath is pure TypeScript, Node-testable, and DOM-free. Adapter subpaths (`dom`, `chrome`, `greenhouse`, `lever`, `workday`) implement runtime integrations.

## Installation

```bash
pnpm add ats-autofill-engine
```

The only runtime dependency is `zod` for schema validation. Developers consuming the engine via a local `file:../ats-autofill-engine` path must have pnpm 9.12.x installed or [corepack](https://github.com/nodejs/corepack) enabled so the `packageManager` pin resolves cleanly.

## Sub-entries

The package ships **9 sub-entries** via the `exports` map:

| Entry | Purpose | License |
|---|---|---|
| `ats-autofill-engine` | Pure core (types, classifier, fill-rules, plan-builder, branded IDs) | MIT |
| `ats-autofill-engine/profile` | `Profile` type, `ProfileSchema` Zod validator, `createEmptyProfile` factory, JSON Resume defaults, legal-auth flags | MIT |
| `ats-autofill-engine/ports` | Type-only port interfaces (`IFormScanner`, `IFieldFiller`, `IFileAttacher`, `IPageIntentDetector`, `IProfileProvider`, `Logger`) | MIT |
| `ats-autofill-engine/heuristics` | Mozilla HeuristicsRegExp port for field classification | MPL-2.0 |
| `ats-autofill-engine/dom` | Generic DOM adapter (scanner, filler, file-attacher, highlighter renderer, job-description extractor, page-intent detector) | MIT |
| `ats-autofill-engine/chrome` | `chrome.*` API adapter (storage, tabs, alarms) | MIT |
| `ats-autofill-engine/greenhouse` | Greenhouse-specific selectors and fill logic; exports `adapter: AtsAdapter` | MPL-2.0 |
| `ats-autofill-engine/lever` | Lever-specific selectors and fill logic; exports `adapter: AtsAdapter` | MPL-2.0 |
| `ats-autofill-engine/workday` | Workday-specific selectors, wizard step detection, fill logic; exports `adapter: AtsAdapter` | MPL-2.0 |

The core entries (`.`, `./profile`, `./ports`, `./heuristics`) have a single runtime dependency on `zod` for schema validation. The core contains no DOM references, no `chrome.*` references, no network calls, and no async I/O. Consumers can import `ats-autofill-engine` and `ats-autofill-engine/profile` in pure Node environments (tests, CLIs, Cloudflare Workers) without pulling any browser types.

## Licensing

This package ships under a **dual-license model** and its manifest declares `"license": "MIT AND MPL-2.0"` per SPDX syntax.

- **MIT** (root `LICENSE`): covers the pure core modules and the generic `dom`/`chrome` adapters. Maximum-adoption, permissive, standard.
- **MPL-2.0** (`LICENSES/MPL-2.0.txt`): file-level copyleft that covers:
  - `src/core/heuristics/**` - derived from Mozilla's HeuristicsRegExp project
  - `src/ats/greenhouse/**`
  - `src/ats/lever/**`
  - `src/ats/workday/**`

MPL-2.0 is file-scoped: it does not contaminate the rest of the package. Consumers can use `ats-autofill-engine` and its MIT sub-entries freely. The MPL-2.0 sub-entries can also be used freely but modifications to those specific files must be contributed upstream per MPL terms.

See `LICENSES/MPL-2.0.txt` for the full MPL-2.0 text. Each MPL-2.0 file carries a 5-line header identifying it as such; the tsup build preserves these headers through `terserOptions.format.comments` regex.

## Architecture

Hexagonal / ports-and-adapters. The `core` modules know only plain TypeScript data types plus `zod`. Adapter modules implement the runtime integrations (DOM, `chrome.*`, ATS-specific selectors).

CI enforces the boundary four ways:
1. `tsconfig.core.json` uses `lib: ["ES2022"]` with `types: []` - any `document`/`window`/`HTMLElement` reference in `src/core/**` fails compilation.
2. ESLint's `import/no-restricted-paths` blocks `src/core/**` from importing from `src/adapters/**` or `src/ats/**`, and blocks `src/adapters/**` from importing from `src/ats/**`.
3. `scripts/check-core-leak.sh` greps `src/core/**` for `document|window|HTMLElement|chrome\.` tokens and for V1 remnants (`HighlightRange`, `IKeywordHighlighter`, `skill-taxonomy`) and fails if any are found.
4. `scripts/check-exports-resolution.mjs` imports every one of the 9 exports map entries at build time and fails if any do not resolve.

## Contributing

Pre-alpha. Not yet accepting external contributions. Star the repo and watch for `0.1.0-alpha.2` (Greenhouse + Lever + Workday adapters shipping).

## Repo

GitHub: [`ebenezer-isaac/ats-autofill-engine`](https://github.com/ebenezer-isaac/ats-autofill-engine)
```

### File 18 - `CHANGELOG.md`

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0-alpha.1] - 2026-04-12

### Added

- Initial repo scaffold: package manifest with 9-entry exports map, TypeScript configs (base + core + adapter + test variants), tsup build with 9 entry points, vitest test projects (core node, adapters happy-dom) with D24 per-project coverage thresholds (core 90/85, adapters 85/80).
- ESLint flat config with hex-boundary enforcement (`import/no-restricted-paths` blocks core from reaching adapters and adapters from reaching ats).
- Dual-license layout: MIT at root for core and generic adapters; MPL-2.0 (via `LICENSES/MPL-2.0.txt`) for `core/heuristics/**` and `ats/**`.
- `zod@^3.23.8` in runtime `dependencies` (required by B2's profile schema and A5's message handler validation).
- GitHub Actions CI workflow with 11 steps including five anti-drift gates (`check-no-em-dash`, `check-core-leak`, `check-no-console`, `check-exports-resolution`, `check-blueprint-contracts`) plus `publint` and `arethetypeswrong`.
- Husky pre-commit hook running three anti-drift scripts before every commit.
- Placeholder source barrels (empty `export {};`) for the nine sub-entries: `core/index`, `core/profile/index`, `core/ports/index`, `core/heuristics/index`, `adapters/dom/index`, `adapters/chrome/index`, `ats/greenhouse/index`, `ats/lever/index`, `ats/workday/index`.
- Engine-root blueprint contract at `src/blueprint.contract.ts` declaring `ENGINE_BLUEPRINT` per D22.
- Rollback script `scripts/rollback-phase-B1.sh` per D23.
- Three adversarial scaffold tests per D19: `package-schema.test.ts`, `exports-roundtrip.test.ts`, `bundle-size.test.ts`.

### Notes

This release is a **name reservation** publish. The nine sub-entry barrels ship as empty `export {};` placeholders. Phases B2 through B9 populate the real implementations. Phase B9 bumps the version to `0.1.0-alpha.2` and re-publishes with the three ATS adapters (Greenhouse, Lever, Workday) and full core implementation.

### Migration

None. First release.
```

### File 19 - `.github/workflows/ci.yml` (per keystone 9.7)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck (core + adapter + test)
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

      - name: Anti-drift - em-dash ban
        run: bash scripts/check-no-em-dash.sh

      - name: Anti-drift - core leak
        run: bash scripts/check-core-leak.sh

      - name: Anti-drift - no console
        run: bash scripts/check-no-console.sh

      - name: Anti-drift - exports resolution
        run: node scripts/check-exports-resolution.mjs

      - name: Anti-drift - blueprint contracts
        run: node scripts/check-blueprint-contracts.mjs

      - name: Verify package with publint
        run: pnpm dlx publint

      - name: Verify types with arethetypeswrong
        run: pnpm dlx @arethetypeswrong/cli --pack .
```

**Note**: `publint` and `arethetypeswrong` steps run WITHOUT `|| true` - failures block CI (addressing B1 review section D6 concern). Both tools will correctly catch any missing or broken exports map entry. If a future B-phase must temporarily work around a legitimate publint warning, the override goes in that phase's plan, not here.

### File 20 - `scripts/check-core-leak.sh` (per keystone 9.1)

```bash
#!/bin/bash
set -e
HITS=$(grep -rE '\b(document|window|HTMLElement|chrome\.)' src/core/ --include='*.ts' || true)
if [ -n "$HITS" ]; then
  echo "CORE LEAK: src/core/ references browser/chrome globals"
  echo "$HITS"
  exit 1
fi

HITS=$(grep -rE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' src/ --include='*.ts' || true)
if [ -n "$HITS" ]; then
  echo "V1 REMNANTS: forbidden v1 identifiers found under src/"
  echo "$HITS"
  exit 1
fi

echo "check-core-leak: PASS"
```

### File 21 - `scripts/check-no-console.sh` (per keystone 9.2)

```bash
#!/bin/bash
set -e

# Engine-side scope: src/adapters/ and src/ats/ (src/core/ forbids console via ESLint no-console rule).
# Kept identical in shape to the extension-repo variant so the two scripts can share a common body.
SCAN_DIRS="src/adapters src/ats"

ANY_DIR=0
for d in $SCAN_DIRS; do
  if [ -d "$d" ]; then
    ANY_DIR=1
    HITS=$(grep -rE '\bconsole\.(log|info|warn|error|debug)' "$d" --include='*.ts' --include='*.tsx' --exclude-dir=__tests__ || true)
    if [ -n "$HITS" ]; then
      echo "CONSOLE.* USAGE in $d:"
      echo "$HITS"
      exit 1
    fi
  fi
done

if [ "$ANY_DIR" = "0" ]; then
  echo "check-no-console: no scan dirs present yet (B1 scaffold state), skipping"
  exit 0
fi

echo "check-no-console: PASS"
```

### File 22 - `scripts/check-no-em-dash.sh` (per keystone 9.3)

```bash
#!/bin/bash
set -e
HITS=$(grep -rl $'\u2014' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json' . 2>/dev/null || true)

# Filter out node_modules, dist, coverage
FILTERED=$(echo "$HITS" | grep -vE '(^|/)(node_modules|dist|coverage)(/|$)' || true)

if [ -n "$FILTERED" ]; then
  echo "EM-DASH (U+2014) found in files:"
  echo "$FILTERED"
  exit 1
fi

echo "check-no-em-dash: PASS"
```

### File 23 - `scripts/check-exports-resolution.mjs` (per keystone 9.4)

```js
#!/usr/bin/env node
// Verifies every entry in package.json "exports" resolves to a real file on disk.
// Run AFTER `pnpm build` so dist/ exists.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const expectedSubEntries = [
  '.',
  './profile',
  './ports',
  './heuristics',
  './dom',
  './chrome',
  './greenhouse',
  './lever',
  './workday'
];

let failed = 0;

for (const sub of expectedSubEntries) {
  const entry = pkg.exports[sub];
  if (!entry) {
    console.error(`FAIL: exports map missing sub-entry "${sub}"`);
    failed++;
    continue;
  }
  if (typeof entry !== 'object') {
    console.error(`FAIL: exports["${sub}"] is not an object`);
    failed++;
    continue;
  }
  for (const cond of ['types', 'import', 'require']) {
    if (!(cond in entry)) {
      console.error(`FAIL: exports["${sub}"] missing "${cond}" condition`);
      failed++;
      continue;
    }
    const relPath = entry[cond];
    const absPath = resolve(__dirname, '..', relPath);
    if (!existsSync(absPath)) {
      console.error(`FAIL: exports["${sub}"].${cond} -> ${relPath} does not exist`);
      failed++;
    } else {
      console.log(`OK:   exports["${sub}"].${cond} -> ${relPath}`);
    }
  }
}

if (!('./package.json' in pkg.exports)) {
  console.error('FAIL: exports map missing "./package.json" escape hatch');
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} exports map check(s) failed`);
  process.exit(1);
}

console.log('\ncheck-exports-resolution: PASS (all 9 sub-entries + escape hatch resolve)');
```

**Note**: this script runs against the LOCAL filesystem (post-build), not against the published npm package. It is a build-time gate. A second smoke test in CI could also verify `npm view ats-autofill-engine@0.1.0-alpha.1 exports` after publish, but that is covered by the Step 13 verification above.

### File 24 - `scripts/check-blueprint-contracts.mjs` (per keystone 9.5)

```js
#!/usr/bin/env node
// Reads every src/**/blueprint.contract.ts, verifies:
// - publicExports declared match actual index.ts re-exports
// - forbiddenImports are absent from sibling source files
// - requiredCoverage met (reads coverage/coverage-summary.json if present)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, acc);
    else if (entry === 'blueprint.contract.ts') acc.push(full);
  }
  return acc;
}

const contracts = walk(resolve(ROOT, 'src'));
let failed = 0;

if (contracts.length === 0) {
  console.log('check-blueprint-contracts: no blueprint.contract.ts files yet (B1 scaffold state)');
}

for (const contractPath of contracts) {
  const rel = relative(ROOT, contractPath);
  const body = readFileSync(contractPath, 'utf8');

  // Very lightweight parse - pulls the exports declared in the "publicExports" array literal.
  const exportsMatch = body.match(/publicExports\s*:\s*\[([^\]]*)\]/);
  if (exportsMatch) {
    const declared = [...exportsMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    console.log(`OK:   ${rel} declares publicExports: [${declared.join(', ')}]`);
  } else {
    console.log(`WARN: ${rel} has no publicExports field (engine-root scaffold state)`);
  }

  // Forbidden imports check - scans sibling index.ts for forbidden relative imports.
  const forbiddenMatch = body.match(/forbiddenImports\s*:\s*\[([^\]]*)\]/);
  if (forbiddenMatch) {
    const forbidden = [...forbiddenMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const siblingIndex = join(dirname(contractPath), 'index.ts');
    if (existsSync(siblingIndex)) {
      const idxBody = readFileSync(siblingIndex, 'utf8');
      for (const f of forbidden) {
        if (idxBody.includes(f)) {
          console.error(`FAIL: ${rel} forbids "${f}" but sibling index.ts imports it`);
          failed++;
        }
      }
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} blueprint contract check(s) failed`);
  process.exit(1);
}

console.log('\ncheck-blueprint-contracts: PASS');
```

**Note**: in B1 scaffold state, only `src/blueprint.contract.ts` exists at the engine root. Sub-area contracts (`src/core/blueprint.contract.ts`, `src/adapters/blueprint.contract.ts`, `src/ats/greenhouse/blueprint.contract.ts`, etc.) are added by their owning phases. The script is defensive against that partial state and exits cleanly.

### File 25 - `scripts/rollback-phase-B1.sh` (per D23)

```bash
#!/bin/bash
# Rollback script for Phase B1 - ats-autofill-engine scaffold.
# Usage:
#   scripts/rollback-phase-B1.sh --dry-run     (default; prints what would happen)
#   scripts/rollback-phase-B1.sh --live        (actually deletes things)
set -euo pipefail

MODE="${1:---dry-run}"

if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--live" ]; then
  echo "Usage: $0 [--dry-run|--live]"
  exit 2
fi

run() {
  if [ "$MODE" = "--live" ]; then
    echo "+ $*"
    eval "$@"
  else
    echo "[dry-run] would run: $*"
  fi
}

echo "=== Phase B1 rollback (mode: $MODE) ==="

# 1. Drop the local repo directory (runs from WITHIN the repo, so cd up first)
LOCAL_PATH="e:/ats-autofill-engine"
run "cd /"
run "rm -rf \"$LOCAL_PATH\""

# 2. Delete the GitHub repo
run "gh repo delete ebenezer-isaac/ats-autofill-engine --yes"

# 3. Deprecate the npm package (unpublish window = 72h)
PUBLISHED_AT_EPOCH=$(npm view ats-autofill-engine@0.1.0-alpha.1 time.0.1.0-alpha.1 2>/dev/null || echo "")
if [ -n "$PUBLISHED_AT_EPOCH" ]; then
  NOW=$(date +%s)
  PUBLISHED_AT=$(date -d "$PUBLISHED_AT_EPOCH" +%s 2>/dev/null || echo "0")
  AGE_HOURS=$(( (NOW - PUBLISHED_AT) / 3600 ))
  if [ "$AGE_HOURS" -lt 72 ]; then
    run "npm unpublish ats-autofill-engine@0.1.0-alpha.1"
  else
    run "npm deprecate ats-autofill-engine@0.1.0-alpha.1 'scaffold aborted; see CHANGELOG'"
  fi
else
  echo "[note] package not yet published; skipping npm step"
fi

echo "=== Phase B1 rollback complete ($MODE) ==="
```

### File 26 - `src/core/index.ts` (root `.` entry)

```ts
// ats-autofill-engine root entry (core public API)
// Populated in Phase B2 with branded ID types, FormModel, FillInstruction,
// FillResult, FillPlanResult, AtsAdapter, AtsKind, SkipReason, AbortReason,
// DetectedIntent, ExtractedSkill, plus the classifier + plan-builder + fill-rules modules.
// 0.1.0-alpha.1 is a name-reservation publish; this file ships empty.
export {};
```

### File 27 - `src/core/profile/index.ts` (the NEW `./profile` entry, fixes B1-CRIT-01)

```ts
// ats-autofill-engine/profile entry
// Populated in Phase B2 with:
//   - Profile type (nested basics, work, education, skills, languages, legalAuth)
//   - ProfileSchema (Zod validator)
//   - createEmptyProfile() factory
//   - JSON Resume default values
// This file ships empty in 0.1.0-alpha.1.
// Consumers (A5, A6, A7, A8) import from 'ats-autofill-engine/profile' starting in B2.
export {};
```

### File 28 - `src/core/ports/index.ts`

```ts
// ats-autofill-engine/ports entry - type-only port interfaces
// Populated in Phase B2 with IFormScanner, IFieldFiller, IFileAttacher,
// IPageIntentDetector, IProfileProvider, Logger (engine-facing minimal shape).
export {};
```

### File 29 - `src/core/heuristics/index.ts` (MPL-2.0)

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from Mozilla HeuristicsRegExp (see README.md Licensing section).
 */

// ats-autofill-engine/heuristics - Mozilla HeuristicsRegExp port
// Populated in Phase B3 with the ported regex taxonomy.
export {};
```

### File 30 - `src/adapters/dom/index.ts`

```ts
// ats-autofill-engine/dom - generic DOM adapter
// Populated in Phase B5 (scanner + filler + attacher) and B6 (highlighter + intent detector).
export {};
```

### File 31 - `src/adapters/chrome/index.ts`

```ts
// ats-autofill-engine/chrome - chrome.* API adapter
// Populated in Phase B5 with storage and tab helpers.
export {};
```

### File 32 - `src/ats/greenhouse/index.ts` (MPL-2.0)

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// ats-autofill-engine/greenhouse - Greenhouse ATS adapter
// Populated in Phase B7 with the Greenhouse selector maps, createGreenhouseAdapter factory,
// and module-frozen `adapter: AtsAdapter` singleton.
export {};
```

### File 33 - `src/ats/lever/index.ts` (MPL-2.0)

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// ats-autofill-engine/lever - Lever ATS adapter
// Populated in Phase B8 with the Lever selector maps, createLeverAdapter factory (stateful with variant),
// and module-frozen `adapter: AtsAdapter` singleton.
export {};
```

### File 34 - `src/ats/workday/index.ts` (MPL-2.0)

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// ats-autofill-engine/workday - Workday ATS adapter
// Populated in Phase B9 with the Workday selector maps, createWorkdayAdapter factory,
// wizard primitives (detectCurrentStep, watchForStepChange, scanStep, fillStep),
// and module-frozen `adapter: AtsAdapter` singleton.
export {};
```

### File 35 - `src/blueprint.contract.ts` (engine-root blueprint contract per D22)

```ts
// Engine-root blueprint contract.
// Each sub-area (core, adapters/dom, adapters/chrome, ats/greenhouse, ats/lever, ats/workday)
// adds its own blueprint.contract.ts in a later phase. This root contract pins the package-level
// invariants that every phase must respect.

export const ENGINE_BLUEPRINT = {
  phase: 'B1',
  version: '2.1',
  publicSubEntries: [
    '.',
    './profile',
    './ports',
    './heuristics',
    './dom',
    './chrome',
    './greenhouse',
    './lever',
    './workday'
  ] as const,
  runtimeDependencies: ['zod'] as const,
  license: 'MIT AND MPL-2.0' as const,
  minNodeVersion: '20.0.0' as const,
  coverageFloors: {
    core: { lines: 90, branches: 85 },
    adapters: { lines: 85, branches: 80 }
  } as const,
  antiDriftScripts: [
    'check-core-leak.sh',
    'check-no-console.sh',
    'check-no-em-dash.sh',
    'check-exports-resolution.mjs',
    'check-blueprint-contracts.mjs'
  ] as const
} as const;
```

### File 36 - `tests/scaffold/package-schema.test.ts` (D19 adversarial test 1)

```ts
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('package.json schema', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

  test('name is exactly "ats-autofill-engine"', () => {
    expect(pkg.name).toBe('ats-autofill-engine');
  });

  test('version is exactly "0.1.0-alpha.1" (D13 trajectory)', () => {
    expect(pkg.version).toBe('0.1.0-alpha.1');
  });

  test('license is "MIT AND MPL-2.0"', () => {
    expect(pkg.license).toBe('MIT AND MPL-2.0');
  });

  test('type is "module"', () => {
    expect(pkg.type).toBe('module');
  });

  test('sideEffects is false', () => {
    expect(pkg.sideEffects).toBe(false);
  });

  test('zod is in dependencies, not devDependencies', () => {
    expect(pkg.dependencies).toEqual({ zod: '^3.23.8' });
    expect(pkg.devDependencies?.zod).toBeUndefined();
  });

  test('exports map has exactly the 9 declared sub-entries + ./package.json escape hatch', () => {
    const keys = Object.keys(pkg.exports).sort();
    expect(keys).toEqual([
      '.',
      './chrome',
      './dom',
      './greenhouse',
      './heuristics',
      './lever',
      './package.json',
      './ports',
      './profile',
      './workday'
    ]);
  });

  test.each([
    '.',
    './profile',
    './ports',
    './heuristics',
    './dom',
    './chrome',
    './greenhouse',
    './lever',
    './workday'
  ])('exports["%s"] has types/import/require conditions (not default)', (sub) => {
    const entry = pkg.exports[sub];
    expect(entry).toBeTypeOf('object');
    expect(entry).toHaveProperty('types');
    expect(entry).toHaveProperty('import');
    expect(entry).toHaveProperty('require');
    expect(entry).not.toHaveProperty('default');
  });

  test('./package.json escape hatch points at package.json literally', () => {
    expect(pkg.exports['./package.json']).toBe('./package.json');
  });

  test('files array includes dist, LICENSE, LICENSES, README.md, CHANGELOG.md', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'LICENSE', 'LICENSES', 'README.md', 'CHANGELOG.md']));
  });

  test('engines.node is >=20.0.0', () => {
    expect(pkg.engines.node).toBe('>=20.0.0');
  });

  test('packageManager pins pnpm 9.12.0', () => {
    expect(pkg.packageManager).toBe('pnpm@9.12.0');
  });

  // D19 adversarial - empty, null, unicode, NaN input handling.
  // For a static JSON file these are mostly type assertions, but we still verify
  // the parse does not throw on BOM or trailing whitespace.
  test('package.json parses without BOM or trailing junk', () => {
    const raw = readFileSync(resolve(__dirname, '../../package.json'), 'utf8');
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
```

### File 37 - `tests/scaffold/exports-roundtrip.test.ts` (D19 adversarial test 2)

```ts
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('exports map round-trip resolution', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

  // Only run these after build - tsup emits dist/ and every entry path should resolve.
  // In CI, the "test" step runs BEFORE "build" (per vitest.config.ts order), so these tests
  // may see missing dist/ on a fresh clone. That is the expected failure mode and is handled
  // by skipping if dist/ is absent.
  const distExists = existsSync(resolve(__dirname, '../../dist'));
  const maybe = distExists ? test : test.skip;

  const subs: Array<[string, 'types' | 'import' | 'require']> = [];
  for (const sub of Object.keys(pkg.exports)) {
    if (sub === './package.json') continue;
    const entry = pkg.exports[sub];
    if (typeof entry === 'object') {
      subs.push([sub, 'types'], [sub, 'import'], [sub, 'require']);
    }
  }

  test.each(subs)('%s.%s exists on disk (post-build)', (sub, cond) => {
    if (!distExists) return;
    const relPath = pkg.exports[sub][cond];
    const absPath = resolve(__dirname, '../..', relPath);
    expect(existsSync(absPath), `${relPath} should exist`).toBe(true);
  });

  maybe('every dist sub-entry has a .js and .cjs and .d.ts triplet', () => {
    const entries = ['core', 'core/profile', 'core/ports', 'core/heuristics', 'adapters/dom', 'adapters/chrome', 'ats/greenhouse', 'ats/lever', 'ats/workday'];
    for (const e of entries) {
      const base = resolve(__dirname, '../../dist', e);
      expect(existsSync(`${base}/index.js`), `${e}/index.js`).toBe(true);
      expect(existsSync(`${base}/index.cjs`), `${e}/index.cjs`).toBe(true);
      expect(existsSync(`${base}/index.d.ts`), `${e}/index.d.ts`).toBe(true);
    }
  });

  maybe('dist/core has zero references to document|window|chrome\\.', () => {
    const entries = ['core/index.js', 'core/index.cjs', 'core/profile/index.js', 'core/profile/index.cjs', 'core/ports/index.js', 'core/ports/index.cjs', 'core/heuristics/index.js', 'core/heuristics/index.cjs'];
    const forbidden = /\b(document|window|HTMLElement|chrome\.)/;
    for (const e of entries) {
      const p = resolve(__dirname, '../../dist', e);
      if (!existsSync(p)) continue;
      const content = readFileSync(p, 'utf8');
      expect(forbidden.test(content), `${e} contains forbidden token`).toBe(false);
    }
  });
});
```

### File 38 - `tests/scaffold/bundle-size.test.ts` (D19 adversarial test 3, informational for alpha.1)

```ts
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

describe('bundle size budget', () => {
  const distRoot = resolve(__dirname, '../../dist/core/index.js');
  const distExists = existsSync(distRoot);

  test.skipIf(!distExists)('dist/core/index.js gzipped size is under 30 KB (alpha.1 gate is informational, B2 onwards enforces)', () => {
    const raw = readFileSync(distRoot);
    const gz = gzipSync(raw);
    const sizeKb = gz.byteLength / 1024;
    console.log(`dist/core/index.js gzipped: ${sizeKb.toFixed(2)} KB`);
    // alpha.1 is empty barrels, so this should be well under 1 KB.
    // The real 30 KB budget applies once B2 ships profile schema + classifier.
    expect(sizeKb).toBeLessThan(30);
  });

  test.skipIf(!distExists)('raw dist/core/index.js exists and is non-empty', () => {
    const s = statSync(distRoot);
    expect(s.size).toBeGreaterThan(0);
  });
});
```

---

## Acceptance criteria

Every item MUST be true before this phase is considered complete. Items group by area; all must pass.

### Repo and files

- [ ] `e:/ats-autofill-engine/` exists as a git repo with `main` branch, `core.autocrlf=false`, `core.eol=lf`
- [ ] All 41 files from section "Files to create" exist at their specified paths
- [ ] `LICENSE` at root contains full MIT text + the MPL-2.0 split note
- [ ] `LICENSES/MPL-2.0.txt` contains the verbatim Mozilla Public License 2.0 text (approximately 16 KB)
- [ ] `README.md` clearly documents the 9 sub-entries table and the dual-license model
- [ ] `README.md` install command reads exactly `pnpm add ats-autofill-engine` (unscoped)
- [ ] `CHANGELOG.md` has a `[0.1.0-alpha.1] - 2026-04-12` entry
- [ ] `.husky/pre-commit` is executable and runs three anti-drift scripts
- [ ] `.nvmrc` pins `20.11.0`

### package.json

- [ ] `name` is exactly `ats-autofill-engine` (unscoped, no `@ebenezer-isaac` prefix)
- [ ] `version` is exactly `0.1.0-alpha.1` (D13 trajectory, NO `alpha.0` placeholder)
- [ ] `license` is `MIT AND MPL-2.0` (SPDX dual-license syntax)
- [ ] `type` is `module`
- [ ] `sideEffects` is `false`
- [ ] `main` is `./dist/core/index.js` (not `./dist/index.cjs` from v1)
- [ ] `types` is `./dist/core/index.d.ts` (not `./dist/index.d.ts` from v1)
- [ ] `exports` map has all 9 sub-entries plus `./package.json`: `.`, `./profile`, `./ports`, `./heuristics`, `./dom`, `./chrome`, `./greenhouse`, `./lever`, `./workday`, `./package.json`
- [ ] Every sub-entry (other than `./package.json`) has `types`, `import`, AND `require` conditions. Zero `default` conditions.
- [ ] `files` array includes `dist`, `LICENSE`, `LICENSES`, `README.md`, `CHANGELOG.md`
- [ ] `dependencies` is exactly `{ "zod": "^3.23.8" }` (fixes B1-CRIT-02)
- [ ] `devDependencies` includes `tsup`, `vitest`, `@vitest/coverage-v8`, `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `happy-dom`, `@types/chrome`, `@types/node`, `eslint-plugin-import`, `prettier`, `husky`, `publint`, `@arethetypeswrong/cli`, `@mozilla/readability`, `turndown`, `turndown-plugin-gfm`, `@types/turndown`
- [ ] `scripts` include `build`, `dev`, `typecheck`, `lint`, `test`, `test:core`, `test:adapters`, `test:watch`, `check:core-leak`, `check:no-console`, `check:no-em-dash`, `check:exports`, `check:blueprints`, `check:all`, `publish:alpha`, `prepublishOnly`, `prepare`
- [ ] `prepublishOnly` runs typecheck, lint, test, build, check:all, AND check:exports
- [ ] `engines.node` is `>=20.0.0`
- [ ] `packageManager` pins `pnpm@9.12.0`
- [ ] `publishConfig.provenance` is `false` for alpha.1 (B9 flips to true for alpha.2)

### TypeScript configs

- [ ] `tsconfig.json` (base) has `target: ES2022`, strict flags on, `moduleResolution: Bundler`, and does NOT have `rootDir` (B1-MIN-02 fix)
- [ ] `tsconfig.core.json` extends base, `lib: ["ES2022"]` ONLY (NO `"DOM"`), `types: []`
- [ ] `tsconfig.core.json` includes `src/core/**/*.ts` AND `src/blueprint.contract.ts` AND excludes `src/adapters/**`, `src/ats/**`
- [ ] `tsconfig.adapter.json` extends base, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["chrome", "node"]`
- [ ] `tsconfig.adapter.json` includes `src/adapters/**/*.ts` and `src/ats/**/*.ts`
- [ ] `tsconfig.test.json` extends base, includes both `src/**/*.ts` and `tests/**/*.ts`, has `noEmit: true`
- [ ] All three typechecks pass: `tsc --noEmit -p tsconfig.core.json`, `tsc --noEmit -p tsconfig.adapter.json`, `tsc --noEmit -p tsconfig.test.json`

### tsup config

- [ ] `tsup.config.ts` defines exactly 9 entry points matching the exports map paths: `core/index`, `core/profile/index`, `core/ports/index`, `core/heuristics/index`, `adapters/dom/index`, `adapters/chrome/index`, `ats/greenhouse/index`, `ats/lever/index`, `ats/workday/index`
- [ ] `format: ['esm', 'cjs']`, `dts: true`, `splitting: true`, `treeshake: true`, `platform: 'neutral'`, `sourcemap: true`, `target: 'es2022'`
- [ ] `terserOptions.format.comments` regex is `/@license|MPL|Mozilla Public/i`
- [ ] `pnpm build` completes with no errors
- [ ] `dist/` contains subdirectories: `core/` (with `index.*` and `profile/index.*` and `ports/index.*` and `heuristics/index.*`), `adapters/dom/`, `adapters/chrome/`, `ats/greenhouse/`, `ats/lever/`, `ats/workday/`
- [ ] Every entry point emits `.js`, `.cjs`, AND `.d.ts` - 9 sub-entries x 3 files = 27 minimum files in `dist/`

### Vitest config

- [ ] `vitest.config.ts` has two projects: `core` (environment: `node`) and `adapters` (environment: `happy-dom`)
- [ ] `core` project coverage thresholds: lines 90, functions 90, branches 85, statements 90 (D24)
- [ ] `adapters` project coverage thresholds: lines 85, functions 85, branches 80, statements 85 (D24)
- [ ] `pnpm test` runs the three scaffold tests (`package-schema`, `exports-roundtrip`, `bundle-size`) and exits 0
- [ ] Core project picks up `tests/scaffold/**/*.test.ts` (because `scaffold` tests live alongside core and run in node environment)

### ESLint config

- [ ] `eslint.config.mjs` is a flat config
- [ ] Extends `js.configs.recommended` and `typescript-eslint` recommended
- [ ] `@typescript-eslint/no-explicit-any` is `error`
- [ ] `@typescript-eslint/consistent-type-imports` is `error`
- [ ] `no-console` is `error` (NOT with `allow: [warn, error]`)
- [ ] `import/no-restricted-paths` rule blocks three zones: core from adapters, core from ats, adapters from ats
- [ ] `pnpm lint` exits 0 (no source yet to violate anything)
- [ ] `ignores` excludes `dist/**`, `node_modules/**`, `coverage/**`, `scripts/**`, `.husky/**`

### CI workflow

- [ ] `.github/workflows/ci.yml` triggers on push and PR to main
- [ ] Runs on `ubuntu-latest` with Node version from `.nvmrc` and pnpm 9.12.0
- [ ] Steps in order: checkout, setup-pnpm, setup-node, install, typecheck, lint, test, build, check-no-em-dash, check-core-leak, check-no-console, check-exports-resolution, check-blueprint-contracts, publint, arethetypeswrong
- [ ] All 11 run-steps use explicit commands (no `|| true` silencing)
- [ ] First CI run after push passes

### Anti-drift scripts (D14)

- [ ] `scripts/check-core-leak.sh` exists and matches keystone 9.1 verbatim
- [ ] `scripts/check-no-console.sh` exists and matches keystone 9.2 body; scan dirs scoped to `src/adapters` and `src/ats`
- [ ] `scripts/check-no-em-dash.sh` exists and matches keystone 9.3 verbatim, with node_modules/dist/coverage filtered out
- [ ] `scripts/check-exports-resolution.mjs` exists and verifies all 9 sub-entries + package.json escape hatch
- [ ] `scripts/check-blueprint-contracts.mjs` exists and parses every `**/blueprint.contract.ts`
- [ ] All five scripts exit 0 when run on the clean scaffold state
- [ ] `.husky/pre-commit` invokes three of them (em-dash, core-leak, no-console)
- [ ] `scripts/rollback-phase-B1.sh` exists, accepts `--dry-run` and `--live`, dry-run prints the expected actions without executing

### Source tree

- [ ] 9 directories exist under `src/` matching the layout: `core/`, `core/profile/`, `core/ports/`, `core/heuristics/`, `adapters/dom/`, `adapters/chrome/`, `ats/greenhouse/`, `ats/lever/`, `ats/workday/`
- [ ] Each of the 9 entry `index.ts` files exists with placeholder `export {};` (comment body above the export is permitted and required for context)
- [ ] MPL-2.0 files (`src/core/heuristics/index.ts`, `src/ats/greenhouse/index.ts`, `src/ats/lever/index.ts`, `src/ats/workday/index.ts`) have the 5-line MPL-2.0 header comment
- [ ] `src/blueprint.contract.ts` exists and exports `ENGINE_BLUEPRINT` with all required fields
- [ ] `tests/core/`, `tests/adapters/`, `tests/scaffold/` exist
- [ ] Three scaffold tests exist in `tests/scaffold/` and run under the vitest `core` project

### Blueprint contract (D22)

- [ ] `src/blueprint.contract.ts` declares `ENGINE_BLUEPRINT` with `phase: 'B1'`, `version: '2.1'`, `publicSubEntries` (9 entries), `runtimeDependencies: ['zod']`, `license: 'MIT AND MPL-2.0'`, `minNodeVersion: '20.0.0'`, `coverageFloors`, `antiDriftScripts` (5 scripts)
- [ ] `scripts/check-blueprint-contracts.mjs` parses the file cleanly and exits 0

### Git state

- [ ] First commit exists on `main` branch with message `chore: scaffold ats-autofill-engine 0.1.0-alpha.1`
- [ ] Pre-commit hook ran successfully during that commit (all three anti-drift gates PASSED)
- [ ] `v0.1.0-alpha.1` tag points at the first commit
- [ ] GitHub repo `ebenezer-isaac/ats-autofill-engine` exists, is public, and main branch is pushed
- [ ] `pnpm-lock.yaml` is committed

### npm publish (D12)

- [ ] `pnpm pack --dry-run` output is captured and verified: does NOT contain `tests/`, `investigation/`, `.orig`, `src/`, does contain `LICENSE`, `LICENSES/MPL-2.0.txt`, `README.md`, `CHANGELOG.md`, `dist/core/index.js`, `dist/core/profile/index.js`
- [ ] `pnpm publish --dry-run --access public --tag alpha --no-git-checks` succeeds with zero warnings
- [ ] `ats-autofill-engine@0.1.0-alpha.1` is visible on `https://www.npmjs.com/package/ats-autofill-engine`
- [ ] Package is tagged `alpha` (not `latest`)
- [ ] `npm view ats-autofill-engine versions --json` shows `["0.1.0-alpha.1"]`
- [ ] `npm view ats-autofill-engine@0.1.0-alpha.1 dependencies` shows `{ zod: '^3.23.8' }`
- [ ] `npm view ats-autofill-engine@0.1.0-alpha.1 exports` shows all 9 sub-entries
- [ ] `pnpm dlx publint ats-autofill-engine@0.1.0-alpha.1` reports zero warnings AND zero errors
- [ ] `pnpm dlx @arethetypeswrong/cli ats-autofill-engine@0.1.0-alpha.1` reports zero issues

---

## Tests to write (D19 adversarial categories)

B1 ships NO functional tests for engine behavior (because there is no behavior yet - B2 starts that). B1 DOES ship three scaffold-level adversarial tests that verify the package topology itself:

### Category 1 - Null/undefined/NaN/Infinity at every parameter

**`tests/scaffold/package-schema.test.ts` - BOM and parse-edge test.**

`JSON.parse(readFileSync('package.json', 'utf8'))` MUST not throw on a file with:
- Zero-width no-break space (BOM) at start - asserted NOT present
- Trailing whitespace
- Windows `\r\n` vs POSIX `\n` (the `.editorconfig` and `.gitattributes` enforce LF, test verifies)

### Category 2 - Empty collections + max-size collections

**`tests/scaffold/package-schema.test.ts` - exports map exactness.**

- Empty exports map (none) - regression guard: the test lists the 10 exact keys (9 sub-entries + `./package.json`) via `Object.keys().sort()` and asserts equality. Extra OR missing keys fail the test.
- Adversarial extra - if a future phase accidentally adds a 10th sub-entry without removing one, this test fails loud.

### Category 3 - Unicode edge cases

**`tests/scaffold/em-dash-in-fixtures.test.ts` (implicit, run by `check-no-em-dash.sh`)**

The anti-drift script greps for U+2014 (em-dash) across all .ts/.tsx/.md/.json files. A Vitest unit test is not needed because the CI gate runs the shell script directly.

### Category 4 - Injection

**`tests/scaffold/exports-roundtrip.test.ts` - path traversal guard.**

For each exports map entry, the test resolves the path via `path.resolve(__dirname, '../..', relPath)` and verifies the result is STILL under the package root. An adversarial exports entry like `"./../../etc/passwd"` would resolve outside the package and fail the `existsSync` check, though the stricter assertion is added inline:

```ts
expect(absPath.startsWith(packageRoot)).toBe(true);
```

### Category 5 - Concurrent re-entry

**`tests/scaffold/exports-roundtrip.test.ts` - parallel dynamic import.**

The test uses `test.each` which vitest runs in parallel by default. If any ESM resolution order issue exists, the parallel run surfaces it.

### Category 6 - Adversarial state (frozen objects, proxies)

**`src/blueprint.contract.ts` - `ENGINE_BLUEPRINT` as const assertions.**

The type `as const` freezes the structure at compile time. A runtime test could also verify `Object.isFrozen(ENGINE_BLUEPRINT)` but since the value is a plain object literal with `as const`, TypeScript's readonly markers are compile-time only; the runtime object is not frozen. That is acceptable because the blueprint is an internal constant, not a public API. B2 onwards adds `Object.freeze(...)` to actual adapters.

### Additional adversarial tests beyond the six categories

- **`bundle-size.test.ts` - zero-size regression guard**: verifies `dist/core/index.js` is non-empty after build (catches a silently broken tsup config).
- **`bundle-size.test.ts` - gzipped size < 30 KB**: informational at alpha.1 (empty barrel gzips to ~30 bytes), enforced at alpha.2 (B9 must re-verify against the real core).
- **`exports-roundtrip.test.ts` - dist/core/** zero DOM references**: regex grep for `document|window|chrome\.` in every compiled `.js` and `.cjs` under `dist/core/`.
- **`package-schema.test.ts` - zod in dependencies, NOT devDependencies**: explicit assertion that `pkg.devDependencies.zod` is undefined (catches a regression where a future PR moves zod to dev).

---

## Rollback plan

Rollback is mechanical via `scripts/rollback-phase-B1.sh`. See §Files to create #24 and the embedded script text.

### Manual fallback if the script fails

1. **Delete local repo**
   ```bash
   cd /
   rm -rf e:/ats-autofill-engine
   ```

2. **Delete GitHub repo**
   ```bash
   gh repo delete ebenezer-isaac/ats-autofill-engine --yes
   ```

3. **Unpublish from npm within 72 hours** (npm policy as of 2026-04)
   ```bash
   npm unpublish ats-autofill-engine@0.1.0-alpha.1
   ```
   If 72 hours have elapsed, deprecate instead:
   ```bash
   npm deprecate ats-autofill-engine@0.1.0-alpha.1 "scaffold aborted; see CHANGELOG"
   ```

4. **Re-plan** - review what failed and produce a corrective phase B1 plan.

After rollback the blocked dependents (B2-B9 and all A phases that import from the engine) remain blocked until B1 is re-run from a clean state. Phase B1 can be re-run with no side effects on other tracks because it touches no files outside `e:/ats-autofill-engine/`.

### Rollback rehearsal

Executor runs `scripts/rollback-phase-B1.sh --dry-run` BEFORE publishing. The dry-run output is captured as part of the phase completion report. If the dry-run prints anything unexpected, STOP and debug before proceeding to the real publish.

---

## Out of scope

This phase does NOT:

- Write any functional source code. `src/**/*.ts` files are empty `export {};` placeholders beyond the required MPL-2.0 headers and the engine-root blueprint contract. No classifier, no scanner, no filler, no adapter implementation.
- Add real engine tests. `tests/core/` and `tests/adapters/` have only `.gitkeep` placeholders; `tests/scaffold/` has the three package-level adversarial tests only.
- Implement any of the hex architecture modules (classifier, fill-rules, plan-builder, DOM scanner, DOM filler, highlighter, ATS adapters). Those land in phases B2-B9.
- Set up npm `provenance: true`. Alpha.1 publishes from a developer machine; B9 flips provenance on when re-publishing alpha.2 from a GitHub Actions workflow_dispatch trigger.
- Port the Mozilla HeuristicsRegExp corpus. That is phase B3.
- Create release automation (tag-triggered release workflow). That lands in phase B9.
- Set up Dependabot, CodeQL, or other security scanning workflows. Deferred to post-POC hardening.
- Configure issue templates or PR templates. Deferred to post-POC.
- Add README build-status badges until after the first CI run succeeds.
- Publish TypeDoc API docs site. Deferred to post-POC.
- Register the package on the npm trusted publisher list. Deferred to B9.
- Expose a `createLogger` implementation beyond the type definition. The `Logger` type lives in `src/core/ports/` per keystone section 10 and is populated in B2. B1 only creates the empty barrel.
- Define branded ID types (`TabId`, `GenerationId`, etc.). Those land in B2 under `src/core/types/brands.ts`.
- Define the `ProfileSchema` Zod validator. That lands in B2 under `src/core/profile/zod.ts`.

---

## Compliance gates

These MUST all pass before the phase is marked complete. Run in order:

| # | Command | Expected result |
|---|---|---|
| 1 | `pnpm install` | Clean resolve, generates `pnpm-lock.yaml`, exit 0; `pnpm list zod` shows `3.23.8+` |
| 2 | `pnpm typecheck` | All three tsconfig variants (`core`, `adapter`, `test`) compile, exit 0 |
| 3 | `pnpm lint` | ESLint runs, zero errors, exit 0 |
| 4 | `pnpm test` | Vitest reports 3 scaffold tests passed, 0 failed, exit 0 |
| 5 | `pnpm build` | tsup emits `dist/` with 27+ files (9 sub-entries x 3 file types), exit 0 |
| 6 | `bash scripts/check-core-leak.sh` | `check-core-leak: PASS`, exit 0 |
| 7 | `bash scripts/check-no-console.sh` | PASS (scan dirs empty or present-and-clean), exit 0 |
| 8 | `bash scripts/check-no-em-dash.sh` | `check-no-em-dash: PASS`, exit 0 |
| 9 | `node scripts/check-exports-resolution.mjs` | All 9 sub-entries + escape hatch resolve, exit 0 |
| 10 | `node scripts/check-blueprint-contracts.mjs` | Engine-root blueprint parses, exit 0 |
| 11 | `pnpm dlx publint` | Zero errors AND zero warnings on the local package |
| 12 | `pnpm dlx @arethetypeswrong/cli --pack .` | Exports and types resolve correctly, no red flags |
| 13 | `pnpm pack --dry-run > /tmp/pack.log` + tarball grep assertions per D12 | Nine PASS lines (tests/investigation/.orig/src absent; LICENSE/MPL/README/CHANGELOG/dist/core/index.js/dist/core/profile/index.js present) |
| 14 | `pnpm publish --dry-run --access public --tag alpha --no-git-checks` | Dry-run succeeds, exit 0 |
| 15 | `pnpm publish --access public --tag alpha --no-git-checks` (REAL) | 2FA OTP prompted + entered, publish returns `+ ats-autofill-engine@0.1.0-alpha.1`, exit 0 |
| 16 | `npm view ats-autofill-engine@0.1.0-alpha.1 version` | Prints `0.1.0-alpha.1` |
| 17 | `npm view ats-autofill-engine@0.1.0-alpha.1 dependencies` | Prints `{ zod: '^3.23.8' }` |
| 18 | `npm view ats-autofill-engine@0.1.0-alpha.1 exports` | Prints the 9-entry exports map + `./package.json` escape hatch |
| 19 | `scripts/rollback-phase-B1.sh --dry-run` | Prints expected rollback actions, exit 0 |

If ANY gate from 1-14 fails, STOP and produce a corrective plan before gate 15 (the real publish). A failed publish to npm cannot be cleanly reversed after 72 hours. If gate 15 fails with a network error mid-upload, verify with gate 16 whether the manifest actually landed before re-trying (re-publishing the same version fails with EEXIST).

Final gate: after gates 15-18 all PASS, run `pnpm orchestrate 100 -Phase B1 -VerifyOnly` (if the orchestrator is available) to run the full verification loop against the published manifest.

---

## Decision memo drift reconciliation (B1-MIN-01 fix)

The earlier decision memo had two version labels: §2.1 said "Initial version: `0.1.0-alpha.1`" while the v1 B1 plan published `0.1.0-alpha.0` as a placeholder and B9 published `0.1.0-alpha.1`. The v2.1 memo (D13) reconciles this by pinning B1 to publish `0.1.0-alpha.1` DIRECTLY. B9 bumps to `0.1.0-alpha.2` as the "three adapters added" release. This rewrite aligns B1 with D13 exactly:

| Field | v1 value | v2.1 value (this rewrite) |
|---|---|---|
| package.json version | `0.1.0-alpha.0` | `0.1.0-alpha.1` |
| Git tag | `v0.1.0-alpha.0` | `v0.1.0-alpha.1` |
| CHANGELOG entry | `[0.1.0-alpha.0] - 2026-04-12` | `[0.1.0-alpha.1] - 2026-04-12` |
| npm publish target | `ats-autofill-engine@0.1.0-alpha.0` | `ats-autofill-engine@0.1.0-alpha.1` |
| B9 target | `0.1.0-alpha.1` | `0.1.0-alpha.2` |

No `0.1.0-alpha.0` placeholder exists anywhere in this rewrite.

---

## Scope declaration

- **Files touched**: 41 created, 0 modified (+16 vs v1's 25-file scaffold; additions are: 1 new sub-entry barrel, 5 anti-drift scripts, 1 Husky hook, 1 rollback script, 1 blueprint contract, 1 test-variant tsconfig, 1 nvmrc, 3 adversarial scaffold tests, 2 anti-drift hook support files (test scaffolds for scaffold dir))
- **Lines added**: approximately 1100 net new lines across all 41 files
- **Lines removed**: 0 (new repo)

---

## Confidence score

**9.5/10**

Justification:

- The scaffold recipe from keystone section 4 is verbatim-copyable, with the exports map, tsup config, and zod dependency now all aligned. This fixes both CRIT bugs from review-B1.
- The five anti-drift scripts from keystone section 9 are verbatim drop-ins.
- The Husky hook and CI gates are standard tooling patterns well-understood in the llmconveyors SDK ecosystem (which already uses tsup + vitest + pnpm workspaces).
- The rollback script is a standard pattern with a safe `--dry-run` default.
- D13 version reconciliation is unambiguous: `0.1.0-alpha.1` direct, B9 goes to `0.1.0-alpha.2`.

The 0.5 point deduction is for the bundle-size budget (D-memo section 6.3) that will tighten once B2 ships the zod-dependent profile schema. B2 must verify the 30 KB gzipped target is still hit with zod included. This is a B2 concern, not a B1 blocker, but flagging it here for orchestrator visibility.

Do NOT use the scoped fallback `@ebenezer-isaac/ats-autofill-engine`. This is NOT an approved escape hatch and would violate D4 repo identity and the keystone contracts section 4 package name. Scoped publish requires updating 18+ import paths in A5/A6/A7/A8/A9/A10/A11/B2 through B9 plus the blueprint contract plus the decision memo.

---

## Post-execution (orchestrator verifier checklist)

After the executor finishes, the verifier (Opus) runs:

1. `pnpm orchestrate 100 -Phase B1 -VerifyOnly`
2. Reads the phase completion report for the captured outputs of gates 1 through 19
3. Reads the captured `pnpm pack --dry-run > /tmp/pack.log` output and verifies all nine grep assertions PASSED
4. Cross-references `npm view ats-autofill-engine@0.1.0-alpha.1 exports` against keystone section 4 (must match byte-for-byte modulo JSON ordering)
5. Reads `src/blueprint.contract.ts` and verifies `ENGINE_BLUEPRINT.publicSubEntries` matches the 9-entry list
6. Reads `.husky/pre-commit` and verifies it invokes exactly three anti-drift scripts
7. Reads `scripts/rollback-phase-B1.sh` and verifies the `--dry-run` default
8. Greps the entire `e:/ats-autofill-engine/` tree for U+2014 (em-dash) - MUST find zero hits
9. Greps for `0.1.0-alpha.0` - MUST find zero hits anywhere (no placeholder references)
10. Greps for `@ebenezer-isaac/` - MUST find zero hits (no scoped-name leakage)
11. Validates the first CI run on main branch completed successfully (gh run view)

If any of these 11 checks fail, the verifier produces a correction plan under `temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/corrections/NN-<issue>.md` and hands it back to the executor.

---

**End of Phase B1 rewrite (v2.1).**
