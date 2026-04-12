# Phase A1 - WXT scaffold for `llmconveyors-chrome-extension`

## Phase metadata

| Field | Value |
|---|---|
| **Phase code** | A1 |
| **Phase name** | WXT + React + TypeScript + Tailwind v4 scaffold |
| **Plan** | 100-chrome-extension-mvp (v2.1) |
| **Track** | Track 3 (Chrome extension) |
| **Target repo** | `ebenezer-isaac/llmconveyors-chrome-extension` (NEW, public) |
| **Local path** | `e:/llmconveyors-chrome-extension` (NEW, outside `llmconveyors.com`) |
| **Day** | 1 (2026-04-12) |
| **Executor context budget** | 64k |
| **Estimated effort** | 2.0 - 2.5 hours |
| **Depends on** | nothing (Day 1 foundation phase) |
| **Blocks** | A5, A6, A7, A8, A9, A10, A11 |
| **Decisions applied** | D4 (repo identity), D11 (structured logger), D14 (anti-drift gates, all 5), D15 (no em-dash), D23 (rollback script), plus ESLint flat-config + tsconfig fixes from reviews/review-A1.md |

## 0. Confidence + scope

**Confidence: 8/10.**

Every input in this phase is fully resolved against the keystone contracts and the v2.1 decision memo. Remaining 2-point risk:

1. WXT 0.20 flat-config interaction with the WXT-generated `.wxt/tsconfig.json` is known-good per investigation 33 but only when `exactOptionalPropertyTypes` is left at WXT default (false). v2.1 drops this override explicitly (review finding #10).
2. On Day 1 the GitHub repo `ebenezer-isaac/llmconveyors-chrome-extension` is created fresh by the executor. If the remote creation step fails for network or auth reasons, the phase degrades gracefully to a local-only commit with a `REMOTE_SETUP.md` marker. This is a documented degradation, not a failure.

**Files touched**: 30 files created, 0 files modified, 0 files deleted.
**Lines changed**: approximately 1100 lines added across config, entrypoints, one real scaffold vitest, anti-drift scripts, husky hooks, rollback script, CI workflow, README, LICENSE.
**Files modified in `e:/llmconveyors.com`**: zero. This phase creates a brand new sibling repository. The only contact surface with `e:/llmconveyors.com` is that the executor READS the plan file + 02-decisions + 03-keystone-contracts. Nothing is written.

**Out-of-repo side effects**: one remote creation call to `gh repo create ebenezer-isaac/llmconveyors-chrome-extension --public`. No DNS, no Cloudflare, no secret rotation.

## 1. Goal

Create a brand-new Chrome extension repository at `e:/llmconveyors-chrome-extension` with a working WXT + React + TypeScript + Tailwind v4 scaffold. After this phase:

- `pnpm install` succeeds cleanly with zero peer-dependency warnings and zero `file:` sibling gymnastics. CI passes green on Day 1.
- `pnpm dev` launches WXT dev server and opens Chrome with the extension auto-loaded.
- `pnpm build` produces `.output/chrome-mv3/` with a loadable MV3 extension whose manifest display name is exactly `LLM Conveyors Job Assistant`.
- `pnpm typecheck` completes with zero errors, zero warnings.
- `pnpm lint` completes with zero errors and linting actually ENFORCES typescript-eslint v8 rules (not a no-op).
- `pnpm test` runs a real vitest spec that asserts `package.json.name === 'llmconveyors-chrome-extension'`. A rename breaks the test.
- Chrome shows the popup with a styled placeholder sign-in button using Tailwind v4 classes.
- Side panel opens and renders a placeholder.
- Options page opens in a new tab and renders a placeholder.
- Content script matches on Greenhouse, Lever, Workday and emits exactly one load message via the structured logger (`createLogger('content:ats')`).
- `src/background/log.ts` skeleton exists and exports the `Logger` interface + `createLogger` factory per D11. A5 will add real wiring later but the surface is present from Day 1.
- Anti-drift grep gates (D14.1 - D14.5) all pass: no em-dash, no `console.*`, no `HighlightRange`, no `skill-taxonomy` references, no `document`/`window`/`chrome.` usage in `src/core/` (vacuous pass on A1 because the directory is absent, but script runs).
- Husky pre-commit hook is installed (D14.4) and rejects staged files containing em-dash, `console.*` in extension code, or `HighlightRange`.
- `scripts/rollback-phase-A1.sh` exists as a runnable bash script that fully reverts the phase (D23).
- First commit is pushed to `github.com/ebenezer-isaac/llmconveyors-chrome-extension` with the exact message `feat(100-a1): WXT scaffold for llmconveyors-chrome-extension`.

No business logic, no auth, no messaging, no autofill. Those land in A5 and later. This phase ships a skeleton that every subsequent A-phase extends in place without rescaffolding.

## 2. Blocks / depends on

**Depends on**: nothing. A1 is the Day-1 foundation for the extension column. It does NOT depend on B1 because the keystone contracts removed the `file:../ats-autofill-engine` placeholder link. The first consumer of `ats-autofill-engine` is A5 (profile schema import in the messaging handler file); A5 adds the dep to `package.json` at that time. The first consumer of the per-vendor sub-entries (`/greenhouse`, `/lever`, `/workday`) is A8; A8 adds those dep relationships.

**Blocks**: A5 (background + messaging), A6 (auth flow), A7 (profile storage), A8 (content-script autofill), A9 (highlight + intent), A10 (popup UI), A11 (sidepanel E2E + demo).

A1 is the common root of the entire A track. Every subsequent A phase adds files into this scaffold; none of them re-scaffolds.

## 3. Required reading (executor MUST read before writing any file)

The executor spends the first 10 minutes of context budget on these files, in this exact order:

1. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md` line 11 - 56 (D1 - D4 architect decisions) for repo identity, messaging ownership, profile shape.
2. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/02-decisions-v2.1-final.md` line 126 - 239 (D11 structured logger, D14 anti-drift gates, D15 em-dash rule, D23 rollback script).
3. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/03-keystone-contracts.md` line 822 - 911 (§9 anti-drift validation scripts - these are dropped verbatim into `scripts/`).
4. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/reviews/review-A1.md` line 15 - 179 (every blocker and critical finding, so the executor knows what the v2.1 rewrite is correcting).
5. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/config.json` line 17 - 23 (repo path, GitHub slug, visibility).
6. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/32-wxt-scaffold.md` entire file (221 lines) for `pnpm dlx wxt@latest init`, template choice, post-init layout.
7. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/33-wxt-entrypoints.md` §2 (background), §6 (messaging package), §Discovery Rules (content-script folder naming).
8. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/42-tailwind-v4-wxt.md` §1 - §7 for `@tailwindcss/vite` plugin, `@import "tailwindcss"`, `@theme` tokens, `cssInjectionMode`.
9. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/36-mv3-permissions.md` §j, §l, and the `Definitive manifest.json block` appendix.
10. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/investigation/58-webstore-permission-review.md` §3, §6 for the allowlisted permission set.
11. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_A5_background_and_messaging/plan.md` §6.2 - §6.4 so the executor understands that A5 will rewrite `entrypoints/background.ts` to import `createLogger` from `src/background/log.ts` - A1 must therefore ship that file as a real skeleton (D11).
12. `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/phase_B1_scaffold/plan.md` §Required reading for the same-day sibling scaffold so the executor knows the two phases do NOT share code.

**Forbidden reads**: the executor MUST NOT open anything under `e:/llmconveyors.com/api/**`, `e:/llmconveyors.com/src/**`, `e:/llmconveyors.com/libs/**`. This phase is a clean-room scaffold. The only contact with the llmconveyors.com filesystem is reading the Plan 100 directory.

## 4. Working directory

**Target directory**: `e:/llmconveyors-chrome-extension` (NEW, does not exist yet).

Executor instructions:

1. Create `e:/llmconveyors-chrome-extension/` if missing.
2. `cd e:/llmconveyors-chrome-extension/`.
3. All file paths in this plan are relative to `e:/llmconveyors-chrome-extension/` unless prefixed with `e:/llmconveyors.com/`.
4. Never place a file anywhere under `e:/llmconveyors.com/` except the plan files the architect already committed.

## 5. GitHub remote precondition (D4)

The repository target is `ebenezer-isaac/llmconveyors-chrome-extension`. This is a NEW public repo under the user's personal namespace. Transfer to `zovo-labs` is deferred to post-contract signing (per D4 silent-default rule). The 2026-04-11 catch-up email to Michael pins this exact URL; any deviation breaks the email.

Creation sequence:

```bash
gh repo create ebenezer-isaac/llmconveyors-chrome-extension \
  --public \
  --description "LLM Conveyors Job Assistant - Chrome extension for intelligent form autofill on Greenhouse, Lever, and Workday."
```

If `gh` is not authenticated or the network is down:

1. Document in the phase completion report: `remoteStatus: pending`.
2. Still run `git init -b main` locally and make the first commit.
3. `git remote add origin git@github.com:ebenezer-isaac/llmconveyors-chrome-extension.git` (stages for later push).
4. Drop `REMOTE_SETUP.md` at repo root with the exact `gh repo create` + `git push -u origin main` commands.
5. Continue the phase. Remote creation is a known-degradation path, not a failure.

**Do NOT volunteer any Zovo or `zovo-labs` branding in the repo description, README, commit messages, or LICENSE.** The silent-default rule per D4 is enforced by the forbidden-token grep (§9 below).

## 6. Files to create (30 files)

### Root config (11 files)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 1 | `e:/llmconveyors-chrome-extension/package.json` | Package manifest, zero deferred deps | 55 |
| 2 | `e:/llmconveyors-chrome-extension/tsconfig.json` | Extends `.wxt/tsconfig.json`, strict but WXT-compat | 35 |
| 3 | `e:/llmconveyors-chrome-extension/wxt.config.ts` | Manifest + Vite config, Tailwind v4 plugin | 75 |
| 4 | `e:/llmconveyors-chrome-extension/vitest.config.ts` | Vitest config for the single scaffold spec | 25 |
| 5 | `e:/llmconveyors-chrome-extension/eslint.config.mjs` | ESLint 9 flat config with `typescript-eslint` meta package | 65 |
| 6 | `e:/llmconveyors-chrome-extension/.gitignore` | WXT + Node + editor + TS | 30 |
| 7 | `e:/llmconveyors-chrome-extension/.gitattributes` | LF line endings on shell scripts | 10 |
| 8 | `e:/llmconveyors-chrome-extension/.editorconfig` | 2-space, LF, UTF-8 | 12 |
| 9 | `e:/llmconveyors-chrome-extension/.prettierrc.json` | Prettier minimal config | 10 |
| 10 | `e:/llmconveyors-chrome-extension/.nvmrc` | `20.10.0` for Node version pinning | 1 |
| 11 | `e:/llmconveyors-chrome-extension/.npmrc` | `auto-install-peers=true`, `strict-peer-dependencies=false` | 4 |

### License + docs (2 files)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 12 | `e:/llmconveyors-chrome-extension/LICENSE` | MIT text, copyright Ebenezer Isaac, year 2026 | 21 |
| 13 | `e:/llmconveyors-chrome-extension/README.md` | Minimal stack + local-dev instructions (NO Zovo mention) | 60 |

### Entrypoints (12 files)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 14 | `e:/llmconveyors-chrome-extension/entrypoints/background.ts` | MV3 service worker skeleton, uses `createLogger` | 40 |
| 15 | `e:/llmconveyors-chrome-extension/entrypoints/content-scripts/ats.content/index.ts` | ATS content script skeleton, uses `createLogger` | 35 |
| 16 | `e:/llmconveyors-chrome-extension/entrypoints/popup/index.html` | Popup HTML shell | 14 |
| 17 | `e:/llmconveyors-chrome-extension/entrypoints/popup/main.tsx` | Popup React root | 18 |
| 18 | `e:/llmconveyors-chrome-extension/entrypoints/popup/App.tsx` | Popup placeholder component | 35 |
| 19 | `e:/llmconveyors-chrome-extension/entrypoints/popup/style.css` | Popup Tailwind + `@theme` tokens | 30 |
| 20 | `e:/llmconveyors-chrome-extension/entrypoints/sidepanel/index.html` | Side panel HTML shell | 14 |
| 21 | `e:/llmconveyors-chrome-extension/entrypoints/sidepanel/main.tsx` | Side panel React root | 18 |
| 22 | `e:/llmconveyors-chrome-extension/entrypoints/sidepanel/App.tsx` | Side panel placeholder | 25 |
| 23 | `e:/llmconveyors-chrome-extension/entrypoints/sidepanel/style.css` | Side panel Tailwind | 25 |
| 24 | `e:/llmconveyors-chrome-extension/entrypoints/options/index.html` | Options HTML shell with `manifest.open_in_tab` meta | 15 |
| 25 | `e:/llmconveyors-chrome-extension/entrypoints/options/main.tsx` + `App.tsx` + `style.css` | Options React root + placeholder + styles | 75 |

### Source library (1 file)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 26 | `e:/llmconveyors-chrome-extension/src/background/log.ts` | D11 structured-logger skeleton (`Logger`, `createLogger`, `log`) | 55 |

### Tests (1 real file)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 27 | `e:/llmconveyors-chrome-extension/tests/scaffold.spec.ts` | Vitest spec that asserts `package.json.name` matches expected + exports map has no `ats-autofill-engine` | 40 |

Plus `tests/.gitkeep` and `tests/background/.gitkeep` + `tests/content/.gitkeep` + `tests/entrypoints/.gitkeep` so A5 has a landing pad.

### CI + scripts + husky (additional files)

| # | Absolute path | Purpose | LoC |
|---|---|---|---|
| 28 | `e:/llmconveyors-chrome-extension/.github/workflows/ci.yml` | Typecheck + lint + test + build + anti-drift gates | 110 |
| 29 | `e:/llmconveyors-chrome-extension/scripts/rollback-phase-A1.sh` | D23 rollback script (bash, LF endings) | 55 |
| 30 | `e:/llmconveyors-chrome-extension/scripts/check-no-em-dash.sh` | D14.1 grep gate | 12 |
| 31 | `e:/llmconveyors-chrome-extension/scripts/check-no-console.sh` | D14 console.* grep gate | 12 |
| 32 | `e:/llmconveyors-chrome-extension/scripts/check-forbidden-tokens.sh` | D14 HighlightRange / skill-taxonomy / core-leak gate | 20 |
| 33 | `e:/llmconveyors-chrome-extension/.husky/pre-commit` | Runs the three gate scripts on every commit | 10 |
| 34 | `e:/llmconveyors-chrome-extension/.husky/_/husky.sh` | Bootstrap (husky v9 creates this automatically) | - |

File count cap: 30 logical files created + 4 tests-landing-pad `.gitkeep` files + 2 husky bootstrap files = 36 total. The "30" figure in the table refers to the substantive files the executor writes by hand.

## 7. Files to modify

**None.** A1 is a clean-room scaffold. The executor must not edit any file in `e:/llmconveyors.com/`.

## 8. Step-by-step implementation (30 numbered steps)

### Step 8.1 - Pre-flight verification

```bash
# Confirm working dir does NOT already exist
test ! -d e:/llmconveyors-chrome-extension || { echo "target dir already exists - halt"; exit 1; }

# Confirm pnpm + node versions
node --version   # expect v20.10.0 or higher
pnpm --version   # expect 9.12.0 or higher

# Confirm gh auth (non-fatal - degrades gracefully per §5)
gh auth status || echo "gh not authenticated - will degrade to local-only commit"
```

### Step 8.2 - Create and enter target directory

```bash
mkdir -p e:/llmconveyors-chrome-extension
cd e:/llmconveyors-chrome-extension
```

### Step 8.3 - Initialize git (do this BEFORE `pnpm dlx wxt init` so WXT-generated files are staged cleanly)

```bash
git init -b main
```

### Step 8.4 - WXT scaffold via `pnpm dlx`

```bash
cd e:/
pnpm dlx wxt@0.20.0 init llmconveyors-chrome-extension --template react
cd llmconveyors-chrome-extension
```

The template generates: `package.json`, `wxt.config.ts`, `tsconfig.json`, `entrypoints/popup/{index.html,main.tsx,App.tsx,style.css}`, `entrypoints/background.ts`, `.gitignore`, `public/icon/*.png`. All of these will be overwritten in subsequent steps - we use the init to get the `.wxt/tsconfig.json` generator to work and to get default icon PNGs.

### Step 8.5 - Overwrite `package.json` (see §9.1 for full content)

### Step 8.6 - Create `tsconfig.json` (see §9.2 for full content)

### Step 8.7 - Create `wxt.config.ts` (see §9.3 for full content)

### Step 8.8 - Create `vitest.config.ts` (see §9.4 for full content)

### Step 8.9 - Create `eslint.config.mjs` (see §9.5 for full content)

### Step 8.10 - Create `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc.json`, `.nvmrc`, `.npmrc` (see §9.6 for full content)

### Step 8.11 - Create `LICENSE` (see §9.7)

### Step 8.12 - Create `README.md` (see §9.8)

### Step 8.13 - Create `src/background/log.ts` skeleton (D11) (see §9.9)

```bash
mkdir -p src/background
# write the file using §9.9 content
```

### Step 8.14 - Overwrite `entrypoints/background.ts` (see §9.10)

### Step 8.15 - Create `entrypoints/content-scripts/ats.content/index.ts` (see §9.11)

The content script lives in `entrypoints/content-scripts/ats.content/index.ts`. Folder-style layout per investigation 33. Folder name has `.content` suffix; output file becomes `/content-scripts/ats.js`.

```bash
mkdir -p entrypoints/content-scripts/ats.content
```

### Step 8.16 - Overwrite `entrypoints/popup/{index.html,main.tsx,App.tsx,style.css}` (see §9.12)

### Step 8.17 - Create `entrypoints/sidepanel/{index.html,main.tsx,App.tsx,style.css}` (see §9.13)

```bash
mkdir -p entrypoints/sidepanel
```

### Step 8.18 - Create `entrypoints/options/{index.html,main.tsx,App.tsx,style.css}` (see §9.14)

```bash
mkdir -p entrypoints/options
```

### Step 8.19 - Do NOT create `assets/tailwind.css` - it is deferred to A7 (review finding #12).

### Step 8.20 - Create `tests/scaffold.spec.ts` + landing-pad `.gitkeep` files (see §9.15)

```bash
mkdir -p tests/background tests/content tests/entrypoints
touch tests/.gitkeep tests/background/.gitkeep tests/content/.gitkeep tests/entrypoints/.gitkeep
```

### Step 8.21 - Create `scripts/` directory + three gate scripts + rollback script (see §9.16, §9.17, §9.18, §9.19)

```bash
mkdir -p scripts
# write files from §9.16-9.19
chmod +x scripts/check-no-em-dash.sh
chmod +x scripts/check-no-console.sh
chmod +x scripts/check-forbidden-tokens.sh
chmod +x scripts/rollback-phase-A1.sh
```

### Step 8.22 - Create `.github/workflows/ci.yml` (see §9.20)

```bash
mkdir -p .github/workflows
# write ci.yml from §9.20
```

### Step 8.23 - Install dependencies

```bash
pnpm install
```

Expected outcome: clean install, `postinstall` runs `wxt prepare` which creates `.wxt/tsconfig.json` and `.wxt/types/*.d.ts`. `node_modules/` populated. `pnpm-lock.yaml` generated.

### Step 8.24 - Install husky v9 and wire the pre-commit hook

```bash
pnpm add -D husky@^9.1.6
pnpm exec husky init
# husky init creates .husky/pre-commit with default content - overwrite it
```

Write `.husky/pre-commit` from §9.21. The husky v9 init command also writes `"prepare": "husky"` to `package.json` - §9.1 already includes that script.

### Step 8.25 - Run `wxt prepare` explicitly (already ran via `postinstall`, but belt-and-braces)

```bash
pnpm exec wxt prepare
```

Verify `.wxt/tsconfig.json` exists. This is the file `tsconfig.json` extends.

### Step 8.26 - Run the full verification gauntlet locally

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
scripts/check-no-em-dash.sh
scripts/check-no-console.sh
scripts/check-forbidden-tokens.sh
```

Every command MUST exit 0. If any fails, stop and refer to §13 rollback.

### Step 8.27 - Verify Chrome loads the unpacked extension manually

```bash
# Open Chrome -> chrome://extensions/ -> Developer mode ON -> Load unpacked ->
# select e:/llmconveyors-chrome-extension/.output/chrome-mv3/
```

Confirm extension appears with name `LLM Conveyors Job Assistant`, version `0.1.0`, no red error banner.

### Step 8.28 - Create the remote repository

```bash
gh repo create ebenezer-isaac/llmconveyors-chrome-extension \
  --public \
  --description "LLM Conveyors Job Assistant - Chrome extension for intelligent form autofill on Greenhouse, Lever, and Workday."
```

If `gh` auth fails, skip to Step 8.29 and set `remoteStatus: pending` in the completion report.

### Step 8.29 - Add remote, stage, commit, push

```bash
git remote add origin git@github.com:ebenezer-isaac/llmconveyors-chrome-extension.git

# Stage explicit paths (review finding #18: avoid `git add .`)
git add package.json tsconfig.json wxt.config.ts vitest.config.ts eslint.config.mjs
git add .gitignore .gitattributes .editorconfig .prettierrc.json .nvmrc .npmrc
git add LICENSE README.md
git add entrypoints/ src/ tests/
git add scripts/ .github/ .husky/
git add public/
git add pnpm-lock.yaml

# Verify .wxt/ and .output/ are NOT staged
git status --short | grep -E '(\.wxt/|\.output/|node_modules/)' && { echo "generated files leaked"; exit 1; }

git commit -m "feat(100-a1): WXT scaffold for llmconveyors-chrome-extension"
```

If remote exists: `git push -u origin main`. If not: leave local-only and drop `REMOTE_SETUP.md`.

### Step 8.30 - File completion report

See §14 for the exact completion report template. Fill in every field.

## 9. Inline code snippets (verbatim file contents)

### 9.1 `package.json`

```json
{
  "name": "llmconveyors-chrome-extension",
  "version": "0.1.0",
  "private": true,
  "description": "LLM Conveyors Job Assistant - Chrome extension for intelligent form autofill on Greenhouse, Lever, and Workday.",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:no-em-dash": "bash scripts/check-no-em-dash.sh",
    "check:no-console": "bash scripts/check-no-console.sh",
    "check:forbidden": "bash scripts/check-forbidden-tokens.sh",
    "check:all": "pnpm check:no-em-dash && pnpm check:no-console && pnpm check:forbidden",
    "postinstall": "wxt prepare",
    "prepare": "husky"
  },
  "dependencies": {
    "@webext-core/messaging": "^2.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/chrome": "^0.0.287",
    "@types/node": "^20.17.6",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/coverage-v8": "^2.1.4",
    "@wxt-dev/module-react": "^1.1.0",
    "eslint": "^9.15.0",
    "eslint-plugin-react": "^7.37.2",
    "eslint-plugin-react-hooks": "^5.0.0",
    "happy-dom": "^15.11.0",
    "husky": "^9.1.6",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.6.3",
    "typescript-eslint": "^8.15.0",
    "vitest": "^2.1.4",
    "wxt": "^0.20.0"
  },
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.10.0",
    "pnpm": ">=9.0.0"
  }
}
```

Notes:
- No `ats-autofill-engine` dep. A5 adds it when it first imports `Profile`/`ProfileSchema`.
- No `llmconveyors` dep. A5 adds it when it constructs the SDK client.
- `typescript-eslint@^8.15.0` is the meta package (review finding #9). It re-exports `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` internally.
- `@eslint/js@^9.15.0` is the flat-config preset package required for `js.configs.recommended` (review finding #8).
- `typescript@~5.6.3` not `^5.6.0` - tilde lock avoids 5.7 surprises.
- `vitest@^2.1.4` + `@vitest/coverage-v8` + `happy-dom` give A5/A6/A7 a real test runner on Day 2 without a second install.
- `husky@^9.1.6` is v9 API (`husky init` + `.husky/pre-commit` direct file, no `_/husky.sh` shim). D14.4.

### 9.2 `tsconfig.json`

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "~/*": ["./*"]
    }
  },
  "include": [
    "entrypoints/**/*",
    "src/**/*",
    "tests/**/*",
    "wxt.config.ts",
    "vitest.config.ts"
  ],
  "exclude": [".output", ".wxt", "node_modules", "dist"]
}
```

Dropped vs v1 plan (review findings #10, #11):
- `exactOptionalPropertyTypes: true` - breaks WXT-generated types in WXT 0.20.
- `verbatimModuleSyntax: false` - extraneous, not needed because WXT's base enables it.
- `types: ["chrome", "node"]` - let `.wxt/tsconfig.json` supply the type set via `@wxt-dev/module-react`. Explicit `types` conflicts with `webextension-polyfill` shapes.

### 9.3 `wxt.config.ts`

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'LLM Conveyors Job Assistant',
    description:
      'Intelligent form autofill and keyword highlighting for Greenhouse, Lever, and Workday job applications.',
    version: '0.1.0',
    default_locale: 'en',
    minimum_chrome_version: '114',
    author: 'Ebenezer Isaac',
    homepage_url: 'https://github.com/ebenezer-isaac/llmconveyors-chrome-extension',
    permissions: [
      'activeTab',
      'storage',
      'identity',
      'scripting',
      'sidePanel',
      'notifications',
    ],
    host_permissions: [
      'https://*.greenhouse.io/*',
      'https://jobs.lever.co/*',
      'https://*.myworkdayjobs.com/*',
      'https://api.llmconveyors.com/*',
      'https://llmconveyors.com/*',
    ],
    action: {
      default_title: 'LLM Conveyors Job Assistant',
      default_icon: {
        '16': '/icon/16.png',
        '32': '/icon/32.png',
        '48': '/icon/48.png',
        '128': '/icon/128.png',
      },
    },
    icons: {
      '16': '/icon/16.png',
      '32': '/icon/32.png',
      '48': '/icon/48.png',
      '128': '/icon/128.png',
    },
  },

  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      sourcemap: true,
      minify: 'esbuild',
      target: 'chrome120',
    },
  }),

  runner: {
    disabled: false,
  },
});
```

### 9.4 `vitest.config.ts`

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    exclude: ['node_modules', '.wxt', '.output', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      exclude: ['.wxt/**', '.output/**', 'node_modules/**', 'scripts/**', 'tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '~': resolve(__dirname, '.'),
    },
  },
});
```

### 9.5 `eslint.config.mjs`

```javascript
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        browser: 'readonly',
        chrome: 'readonly',
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'vitest.config.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'dist/**', 'public/**'],
  },
);
```

Review fix #8: `@eslint/js` explicit import and listed in deps.
Review fix #9: switched to `typescript-eslint` meta package; `tseslint.config(...)` helper flattens the configs array correctly. `tseslint.configs.recommended` is spread, not `.rules`.
`no-console` is `error` not `warn` (D11 mandates structured logger).

### 9.6 `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc.json`, `.nvmrc`, `.npmrc`

`.gitignore`:
```
# WXT
.output/
.wxt/
stats.html
stats-*.json
web-ext.config.ts
web-ext-artifacts/

# Node
node_modules/
*.log
.pnpm-debug.log*
.env
.env.local
.env.*.local

# Editor
.vscode/
.idea/
*.swp
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo

# Coverage
coverage/
.nyc_output/
```

`.gitattributes`:
```
* text=auto eol=lf
*.sh text eol=lf
*.bat text eol=crlf
*.png binary
*.jpg binary
*.ico binary
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

`.nvmrc`:
```
20.10.0
```

`.npmrc`:
```
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

### 9.7 `LICENSE` (MIT)

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

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 9.8 `README.md`

```markdown
# LLM Conveyors Job Assistant

Chrome extension for intelligent form autofill and keyword highlighting on Greenhouse, Lever, and Workday job applications.

## Status

Early alpha. Day 1 scaffold.

## Stack

- WXT (https://wxt.dev) - web extension framework
- React 19 + TypeScript 5.6
- Tailwind CSS v4 via `@tailwindcss/vite`
- Vitest 2 with happy-dom for unit tests
- ESLint 9 flat config with typescript-eslint v8

## Local development

```bash
pnpm install
pnpm dev          # WXT dev server, opens Chrome with extension loaded
pnpm build        # produces .output/chrome-mv3/
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint flat config
pnpm test         # vitest run
pnpm check:all    # anti-drift gates (em-dash, console, forbidden tokens)
```

## Loading the unpacked extension

1. `pnpm build`
2. Open `chrome://extensions/`
3. Enable Developer mode
4. Click Load unpacked and select `.output/chrome-mv3/`

## Project structure

```
entrypoints/
  background.ts                     MV3 service worker
  content-scripts/ats.content/      Content script for GH + Lever + Workday
  popup/                            Toolbar popup
  sidepanel/                        Side panel
  options/                          Options page
src/
  background/log.ts                 Structured logger (shared across contexts)
tests/                              Vitest specs
scripts/                            Anti-drift gate scripts + rollback
.github/workflows/ci.yml            Typecheck + lint + test + build + gates
```

## Permissions

Required: `activeTab`, `storage`, `identity`, `scripting`, `sidePanel`, `notifications`.

Host permissions: `https://*.greenhouse.io/*`, `https://jobs.lever.co/*`, `https://*.myworkdayjobs.com/*`, `https://api.llmconveyors.com/*`, `https://llmconveyors.com/*`.

## License

MIT - see [LICENSE](./LICENSE).
```

### 9.9 `src/background/log.ts` - D11 structured-logger skeleton

```typescript
// src/background/log.ts
/**
 * Structured logger for the extension.
 *
 * Phase A1 ships this skeleton so every subsequent phase can import `createLogger`
 * from day 1. A5 wires the real transport (JSON-formatted console output prefixed
 * with `[llmc-ext:<scope>]`). A1 ships a minimal but real implementation that
 * routes to `globalThis.console` so the surface works end-to-end immediately.
 *
 * D11 invariant: extension code must never call `console.*` directly. Use
 * `createLogger('<scope>')` and call `logger.info/warn/error/debug` instead.
 * Enforced by `scripts/check-no-console.sh`.
 */

export interface LogContext {
  readonly tabId?: number;
  readonly requestId?: string;
  readonly [k: string]: unknown;
}

export interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}

const IS_DEV = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE !== 'production';

function format(scope: string, level: string, msg: string, ctx?: LogContext): readonly [string, string] {
  const prefix = `[llmc-ext:${scope}] ${level.toUpperCase()} ${msg}`;
  const ctxJson = ctx && Object.keys(ctx).length > 0 ? JSON.stringify(ctx) : '';
  return [prefix, ctxJson] as const;
}

export function createLogger(scope: string): Logger {
  // eslint-disable-next-line no-console -- sole authorized console.* usage in the extension
  const sink = globalThis.console;
  return Object.freeze({
    info(msg, ctx) {
      const [p, c] = format(scope, 'info', msg, ctx);
      sink.info(p, c);
    },
    warn(msg, ctx) {
      const [p, c] = format(scope, 'warn', msg, ctx);
      sink.warn(p, c);
    },
    error(msg, err, ctx) {
      const [p, c] = format(scope, 'error', msg, ctx);
      sink.error(p, c, err ?? '');
    },
    debug(msg, ctx) {
      if (!IS_DEV) return;
      const [p, c] = format(scope, 'debug', msg, ctx);
      sink.debug(p, c);
    },
  });
}

export const log: Logger = createLogger('root');
```

Notes:
- This is the ONLY file in the extension where a `// eslint-disable-next-line no-console` directive is permitted. The anti-drift grep gate whitelists `src/background/log.ts` via an explicit exclusion. See §9.17.
- The signature exactly matches the one in `02-decisions-v2.1-final.md` line 130 - 141.
- A5 will flesh out `format()` with the full JSON payload shape, request-id correlation, and optional remote log sink. A1 ships a minimal but real implementation - never a stub.

### 9.10 `entrypoints/background.ts`

```typescript
// entrypoints/background.ts
/**
 * LLM Conveyors Job Assistant - MV3 service worker.
 *
 * Phase A1: lifecycle listeners only. A5 wires the full `@webext-core/messaging`
 * ProtocolMap dispatch table, SDK client construction, and refresh manager.
 */
import { createLogger } from '@/src/background/log';

const logger = createLogger('background');

export default defineBackground({
  type: 'module',
  main() {
    // Hard rule: main() is NOT async. Async work lives inside listeners.
    logger.info('service worker booted');

    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === 'install') {
        logger.info('installed');
      } else if (reason === 'update') {
        logger.info('updated');
      }
    });

    browser.runtime.onStartup.addListener(() => {
      logger.info('browser startup');
    });
  },
});
```

### 9.11 `entrypoints/content-scripts/ats.content/index.ts`

```typescript
// entrypoints/content-scripts/ats.content/index.ts
/**
 * LLM Conveyors Job Assistant - ATS content script.
 *
 * Phase A1: load beacon only. A8 wires the real form scanner + filler;
 * A9 wires the keyword highlighter and intent detector.
 */
import { createLogger } from '@/src/background/log';

const logger = createLogger('content:ats');

export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
  ],
  runAt: 'document_idle',
  world: 'ISOLATED',
  allFrames: false,
  cssInjectionMode: 'manual',
  async main(ctx) {
    logger.info('content script loaded', { host: window.location.hostname });

    ctx.onInvalidated(() => {
      logger.info('content script invalidated');
    });
  },
});
```

### 9.12 `entrypoints/popup/*`

`entrypoints/popup/index.html`:
```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Conveyors Job Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/popup/main.tsx`:
```tsx
// entrypoints/popup/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { createLogger } from '@/src/background/log';

const logger = createLogger('popup');
const container = document.getElementById('root');
if (!container) {
  throw new Error('popup root missing');
}
logger.info('popup mounted');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`entrypoints/popup/App.tsx`:
```tsx
// entrypoints/popup/App.tsx
import React from 'react';

export default function App() {
  return (
    <div className="min-h-[480px] w-[360px] bg-white p-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-500">LLM Conveyors</h1>
        <span className="rounded-card bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          v0.1.0
        </span>
      </header>

      <section className="rounded-card border border-zinc-200 p-3 dark:border-zinc-700">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Sign in to start auto-filling job applications on Greenhouse, Lever, and Workday.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded-card bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Sign in (arrives in A6)
        </button>
      </section>

      <footer className="mt-4 text-center text-xs text-zinc-400">
        Powered by llmconveyors.com
      </footer>
    </div>
  );
}
```

`entrypoints/popup/style.css`:
```css
/* entrypoints/popup/style.css */
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  --color-brand-50: oklch(0.98 0.02 250);
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);

  --font-display: "Inter", system-ui, sans-serif;
  --radius-card: 0.75rem;
}

html,
body {
  min-width: 360px;
  margin: 0;
  padding: 0;
}
```

### 9.13 `entrypoints/sidepanel/*`

`entrypoints/sidepanel/index.html`:
```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Conveyors - Side Panel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/sidepanel/main.tsx`:
```tsx
// entrypoints/sidepanel/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { createLogger } from '@/src/background/log';

const logger = createLogger('sidepanel');
const container = document.getElementById('root');
if (!container) {
  throw new Error('sidepanel root missing');
}
logger.info('sidepanel mounted');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`entrypoints/sidepanel/App.tsx`:
```tsx
// entrypoints/sidepanel/App.tsx
import React from 'react';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h1 className="text-lg font-bold text-brand-500">LLM Conveyors</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Artifact viewer</p>
      </header>
      <main className="flex-1 p-4">
        <div className="rounded-card border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          No artifacts yet. Generate a CV from the popup to see it here.
        </div>
      </main>
    </div>
  );
}
```

`entrypoints/sidepanel/style.css`:
```css
/* entrypoints/sidepanel/style.css */
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  --color-brand-50: oklch(0.98 0.02 250);
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);
  --font-display: "Inter", system-ui, sans-serif;
  --radius-card: 0.75rem;
}

html,
body {
  margin: 0;
  padding: 0;
  min-width: 320px;
}
```

### 9.14 `entrypoints/options/*`

`entrypoints/options/index.html`:
```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="manifest.open_in_tab" content="true" />
    <title>LLM Conveyors - Options</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/options/main.tsx`:
```tsx
// entrypoints/options/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { createLogger } from '@/src/background/log';

const logger = createLogger('options');
const container = document.getElementById('root');
if (!container) {
  throw new Error('options root missing');
}
logger.info('options mounted');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`entrypoints/options/App.tsx`:
```tsx
// entrypoints/options/App.tsx
import React from 'react';

export default function App() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white p-8 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-brand-500">LLM Conveyors - Options</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure your profile and preferences.
        </p>
      </header>

      <section className="rounded-card border border-zinc-200 p-6 dark:border-zinc-700">
        <h2 className="mb-2 text-base font-semibold">Profile</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          JSON Resume upload and profile overrides arrive in phase A7.
        </p>
      </section>
    </div>
  );
}
```

`entrypoints/options/style.css`:
```css
/* entrypoints/options/style.css */
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  --color-brand-50: oklch(0.98 0.02 250);
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);
  --font-display: "Inter", system-ui, sans-serif;
  --radius-card: 0.75rem;
}

html,
body {
  margin: 0;
  padding: 0;
}
```

### 9.15 `tests/scaffold.spec.ts` - the real scaffold-validation spec

```typescript
// tests/scaffold.spec.ts
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

describe('A1 scaffold invariants', () => {
  test('package.json name is exactly llmconveyors-chrome-extension', () => {
    expect(PKG.name).toBe('llmconveyors-chrome-extension');
  });

  test('package.json version is 0.1.0', () => {
    expect(PKG.version).toBe('0.1.0');
  });

  test('package.json license is MIT', () => {
    expect(PKG.license).toBe('MIT');
  });

  test('description does not mention Zovo (D4 silent default)', () => {
    expect(PKG.description.toLowerCase()).not.toContain('zovo');
  });

  test('ats-autofill-engine is NOT a dependency in A1 (A5 adds it)', () => {
    const deps = { ...(PKG.dependencies ?? {}), ...(PKG.devDependencies ?? {}) };
    expect(deps).not.toHaveProperty('ats-autofill-engine');
  });

  test('llmconveyors SDK is NOT a dependency in A1 (A5 adds it)', () => {
    const deps = { ...(PKG.dependencies ?? {}), ...(PKG.devDependencies ?? {}) };
    expect(deps).not.toHaveProperty('llmconveyors');
  });

  test('LICENSE file contains Ebenezer Isaac and 2026', () => {
    const licenseText = readFileSync(resolve(ROOT, 'LICENSE'), 'utf-8');
    expect(licenseText).toContain('Ebenezer Isaac');
    expect(licenseText).toContain('2026');
    expect(licenseText.toLowerCase()).not.toContain('zovo');
  });

  test('wxt.config.ts manifest name is LLM Conveyors Job Assistant', () => {
    const cfg = readFileSync(resolve(ROOT, 'wxt.config.ts'), 'utf-8');
    expect(cfg).toContain("name: 'LLM Conveyors Job Assistant'");
  });

  test('src/background/log.ts exports createLogger and Logger type', () => {
    const src = readFileSync(resolve(ROOT, 'src/background/log.ts'), 'utf-8');
    expect(src).toMatch(/export\s+function\s+createLogger/);
    expect(src).toMatch(/export\s+interface\s+Logger/);
  });
});
```

This is a real test that CAN fail. A rename from `llmconveyors-chrome-extension` breaks it immediately. A reintroduction of the Zovo brand breaks it. A deletion of `src/background/log.ts` breaks it. Every assertion targets a known-drift risk identified in the review.

### 9.16 `scripts/check-no-em-dash.sh` (D14.1, D15)

```bash
#!/usr/bin/env bash
# scripts/check-no-em-dash.sh
# D14.1 + D15: fail if any em-dash (U+2014) appears in source or docs.
set -euo pipefail

HITS=$(grep -rl $'\u2014' \
  --include='*.ts' --include='*.tsx' \
  --include='*.md' --include='*.json' \
  --include='*.mjs' --include='*.cjs' \
  --include='*.html' --include='*.css' \
  --include='*.yml' --include='*.yaml' \
  . 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "EM DASH FILES:"
  echo "$HITS"
  exit 1
fi
echo "no em-dash hits"
```

### 9.17 `scripts/check-no-console.sh` (D11, D14)

```bash
#!/usr/bin/env bash
# scripts/check-no-console.sh
# D11: no console.* in extension code. Only src/background/log.ts is allowed.
set -euo pipefail

HITS=$(grep -rnE '\bconsole\.(log|info|warn|error|debug)' \
  --include='*.ts' --include='*.tsx' \
  entrypoints/ src/ 2>/dev/null \
  | grep -v 'src/background/log.ts' \
  | grep -v 'eslint-disable' || true)

if [ -n "$HITS" ]; then
  echo "CONSOLE.* USAGE (forbidden per D11):"
  echo "$HITS"
  exit 1
fi
echo "no console.* hits"
```

### 9.18 `scripts/check-forbidden-tokens.sh` (D14.1)

```bash
#!/usr/bin/env bash
# scripts/check-forbidden-tokens.sh
# D14.1: HighlightRange / IKeywordHighlighter / skill-taxonomy are v1 remnants
# and must never appear in v2.1 code. Core DOM-leak guard runs here too.
set -euo pipefail

# v1 remnant check (all source)
HITS=$(grep -rnE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' \
  --include='*.ts' --include='*.tsx' \
  entrypoints/ src/ tests/ 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "V1 REMNANTS (forbidden per D14.1):"
  echo "$HITS"
  exit 1
fi

# Core DOM-leak guard (vacuous in A1 because src/core/ does not exist, but script runs)
if [ -d "src/core" ]; then
  HITS=$(grep -rnE '\b(document|window|HTMLElement|chrome\.)' src/core/ --include='*.ts' 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo "CORE LEAK (src/core/ must be DOM-free):"
    echo "$HITS"
    exit 1
  fi
fi

# D4 silent default: no Zovo mention anywhere in repo-owned source + docs
HITS=$(grep -rniE '\b(zovo|zovo-labs)\b' \
  --include='*.ts' --include='*.tsx' \
  --include='*.md' --include='*.json' \
  --include='*.mjs' --include='*.html' \
  entrypoints/ src/ tests/ scripts/ .github/ \
  README.md LICENSE package.json wxt.config.ts 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "ZOVO MENTION (forbidden per D4 silent default):"
  echo "$HITS"
  exit 1
fi

echo "no forbidden tokens"
```

### 9.19 `scripts/rollback-phase-A1.sh` (D23)

```bash
#!/usr/bin/env bash
# scripts/rollback-phase-A1.sh
# D23: mechanically reverts phase A1 to a pristine pre-scaffold state.
# Run from the project root. Requires git repo to exist.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Rolling back phase A1 in $REPO_ROOT"

# Verify we are in the expected repo
if ! grep -q '"name": "llmconveyors-chrome-extension"' package.json 2>/dev/null; then
  echo "ERROR: not inside llmconveyors-chrome-extension repo - refusing to rollback"
  exit 1
fi

# Remove generated build artifacts
rm -rf .output .wxt node_modules dist coverage

# Remove scaffold-created files
rm -rf entrypoints src tests scripts .github .husky public
rm -f package.json tsconfig.json wxt.config.ts vitest.config.ts eslint.config.mjs
rm -f .gitignore .gitattributes .editorconfig .prettierrc.json .nvmrc .npmrc
rm -f LICENSE README.md REMOTE_SETUP.md pnpm-lock.yaml

# Remove empty parent directory if this is a standalone rollback
cd ..
if [ -d llmconveyors-chrome-extension ] && [ -z "$(ls -A llmconveyors-chrome-extension 2>/dev/null || true)" ]; then
  rmdir llmconveyors-chrome-extension
fi

echo "Phase A1 rolled back cleanly"
```

### 9.20 `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Typecheck + lint + test + build + anti-drift
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20.10.0'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build Chrome MV3
        run: pnpm build

      - name: Anti-drift gate - no em-dash
        run: bash scripts/check-no-em-dash.sh

      - name: Anti-drift gate - no console.* outside logger
        run: bash scripts/check-no-console.sh

      - name: Anti-drift gate - no forbidden tokens
        run: bash scripts/check-forbidden-tokens.sh

      - name: Upload chrome-mv3 artifact
        uses: actions/upload-artifact@v4
        with:
          name: chrome-mv3
          path: .output/chrome-mv3/
          retention-days: 7
```

CI passes green on Day 1. No `file:` sibling dep, no broken-by-design install.

### 9.21 `.husky/pre-commit` (D14.4)

```bash
#!/usr/bin/env bash
# Husky v9 pre-commit: runs the three anti-drift gates on every commit.
bash scripts/check-no-em-dash.sh
bash scripts/check-no-console.sh
bash scripts/check-forbidden-tokens.sh
```

Husky v9 does not require the old `_/husky.sh` bootstrap. The file is executable and sourced by git directly.

## 10. Acceptance criteria (20 checkboxes, every one with an exact command)

Executor marks A1 complete only when every box below passes.

### 10.1 Install + prepare
- [ ] `pnpm install` exits 0 with zero peer warnings. Command: `pnpm install 2>&1 | tee /tmp/install.log && grep -q 'WARN.*peer' /tmp/install.log && exit 1 || true`
- [ ] `.wxt/tsconfig.json` exists. Command: `test -f .wxt/tsconfig.json`
- [ ] `node_modules/@wxt-dev/module-react/` exists. Command: `test -d node_modules/@wxt-dev/module-react`
- [ ] `node_modules/tailwindcss/` exists at v4.x. Command: `node -p "require('./node_modules/tailwindcss/package.json').version" | grep -E '^4\.'`

### 10.2 Typecheck
- [ ] `pnpm typecheck` exits 0 with zero errors, zero warnings. Command: `pnpm typecheck`

### 10.3 Lint
- [ ] `pnpm lint` exits 0. Command: `pnpm lint`
- [ ] Lint is NOT a no-op: confirm typescript-eslint rules run by adding a temporary `let x: any = 1;` in `entrypoints/background.ts`, running `pnpm lint`, seeing it fail, then reverting. Command: `pnpm lint --print-config entrypoints/background.ts | grep -q '@typescript-eslint/no-explicit-any'`

### 10.4 Test
- [ ] `pnpm test` exits 0. Command: `pnpm test`
- [ ] At least one test passes and the test CAN fail: temporarily rename `package.json.name` to `"x"`, run `pnpm test`, confirm it fails, revert. Command verified via `grep -q 'toBe.*llmconveyors-chrome-extension' tests/scaffold.spec.ts`

### 10.5 Build
- [ ] `pnpm build` exits 0. Command: `pnpm build`
- [ ] `.output/chrome-mv3/manifest.json` contains `"name": "LLM Conveyors Job Assistant"`. Command: `grep -q '"name": "LLM Conveyors Job Assistant"' .output/chrome-mv3/manifest.json`
- [ ] Manifest has all 6 permissions + all 5 host permissions. Command: `node -e "const m=require('./.output/chrome-mv3/manifest.json'); if(m.permissions.length!==6||m.host_permissions.length!==5)process.exit(1)"`
- [ ] All 5 entrypoint outputs exist. Command: `test -f .output/chrome-mv3/background.js && test -f .output/chrome-mv3/popup.html && test -f .output/chrome-mv3/sidepanel.html && test -f .output/chrome-mv3/options.html && test -f .output/chrome-mv3/content-scripts/ats.js`

### 10.6 Anti-drift grep gates (D14.1)
- [ ] `bash scripts/check-no-em-dash.sh` exits 0. Command: `bash scripts/check-no-em-dash.sh`
- [ ] `bash scripts/check-no-console.sh` exits 0. Command: `bash scripts/check-no-console.sh`
- [ ] `bash scripts/check-forbidden-tokens.sh` exits 0. Command: `bash scripts/check-forbidden-tokens.sh`
- [ ] Temporary positive check: add `const x = 'HighlightRange';` to `entrypoints/background.ts`, run `bash scripts/check-forbidden-tokens.sh`, confirm exit 1, revert.

### 10.7 Husky pre-commit (D14.4)
- [ ] `.husky/pre-commit` exists and is executable. Command: `test -x .husky/pre-commit`
- [ ] Husky hook is installed into git. Command: `git config --get core.hooksPath | grep -q '\.husky'`
- [ ] Hook fires on commit: `git commit --allow-empty -m "chore: smoke" --dry-run` triggers hook execution. Verified by staging a file containing an em-dash and confirming the commit is rejected.

### 10.8 Rollback script (D23)
- [ ] `scripts/rollback-phase-A1.sh` exists and is executable. Command: `test -x scripts/rollback-phase-A1.sh`
- [ ] Rollback script syntax is valid. Command: `bash -n scripts/rollback-phase-A1.sh`

### 10.9 Chrome loads unpacked
- [ ] Manual verification: `chrome://extensions/` -> Load unpacked -> select `.output/chrome-mv3/` -> extension appears as `LLM Conveyors Job Assistant` v0.1.0 with no red error banner. Service worker status is `Active`.
- [ ] Popup opens at 360x480, header shows `LLM Conveyors`, version badge `v0.1.0`, disabled sign-in button visible, Tailwind styles applied.
- [ ] Side panel opens from extension details, renders placeholder.
- [ ] Options page opens in a new tab via `chrome://extensions/` -> Details -> Extension options, renders placeholder.
- [ ] Content script logs `[llmc-ext:content:ats] INFO content script loaded` on a live Greenhouse job posting DevTools console.

### 10.10 Git + remote
- [ ] First commit exists with exact message `feat(100-a1): WXT scaffold for llmconveyors-chrome-extension`. Command: `git log --oneline -1 | grep -q 'feat(100-a1): WXT scaffold for llmconveyors-chrome-extension'`
- [ ] Either: `git push origin main` succeeds AND `gh repo view ebenezer-isaac/llmconveyors-chrome-extension` returns exit 0 - OR - `REMOTE_SETUP.md` exists at repo root with the exact `gh repo create` + `git push` commands.

## 11. Anti-drift validation gates (D14, all 5 required)

Every A1 phase-complete check runs these 5 gates and requires exit 0 on all. The first 3 ship as bash scripts in the repo; the last 2 are type-level and exports-map assertions that A1 is NOT the right phase to enforce (A5 and B1 own them) but A1 must not introduce a regression.

| Gate | D14 section | Script / command | A1 enforcement |
|---|---|---|---|
| G1 | D14.1 forbidden-token grep | `bash scripts/check-no-em-dash.sh` + `bash scripts/check-no-console.sh` + `bash scripts/check-forbidden-tokens.sh` | Mandatory. Runs in CI (§9.20) and in pre-commit (§9.21). |
| G2 | D14.2 type-level protocol-contract assertion | `tests/background/messaging/protocol-contract.type-test.ts` | Not in A1. A5 creates the file. A1 ships `tests/background/.gitkeep` as landing pad. |
| G3 | D14.3 exports-map resolution test | `scripts/check-exports-resolution.mjs` | Not in A1. B1 ships the script. A1 does not import `ats-autofill-engine`. |
| G4 | D14.4 cross-phase contract snapshot + husky pre-commit | `.husky/pre-commit` running the 3 gate scripts | Mandatory. Pre-commit hook installs in step 8.24. |
| G5 | D14.5 Zod schema round-trip | Zod fuzz tests per boundary | Not in A1. A5 ships the first boundary (`src/background/messaging/`). A1 does not touch Zod. |

A1 is explicitly responsible for G1 and G4. A1 is explicitly NOT responsible for G2, G3, G5 because A1 scaffolds no types, no exports, and no Zod schemas. A1 MUST NOT introduce a regression that would block G2/G3/G5 later: the `src/background/log.ts` skeleton must not conflict with A5's ProtocolMap imports, the package.json must not pre-claim engine sub-entries, and the tsconfig must compile cleanly against WXT-generated types so A5's real code typechecks on Day 2.

## 12. Tests to write (full path + case names + D19 adversarial categories)

### 12.1 `tests/scaffold.spec.ts` (the sole A1 real test file)

Test cases (9 total, all real assertions, all can fail):

1. `package.json name is exactly llmconveyors-chrome-extension`
2. `package.json version is 0.1.0`
3. `package.json license is MIT`
4. `description does not mention Zovo (D4 silent default)`
5. `ats-autofill-engine is NOT a dependency in A1 (A5 adds it)`
6. `llmconveyors SDK is NOT a dependency in A1 (A5 adds it)`
7. `LICENSE file contains Ebenezer Isaac and 2026`
8. `wxt.config.ts manifest name is LLM Conveyors Job Assistant`
9. `src/background/log.ts exports createLogger and Logger type`

### 12.2 D19 adversarial categories (enumerated - A1 scaffold scope is small but each category must be CONSIDERED, even if NO-OP)

D19 mandates six categories of adversarial tests per phase. A1 is a scaffold phase with ~80 effective LoC of application code, so most categories are vacuous or covered implicitly. The executor MUST document each category in the completion report. No category may be silently skipped.

1. **Null / undefined / NaN / Infinity at every parameter** - A1 scaffold has three real function boundaries: `createLogger(scope)`, `logger.info(msg, ctx)`, `format(scope, level, msg, ctx)`. Adversarial cases covered by TypeScript types (`scope: string`, `msg: string`, `ctx?: LogContext`). Runtime assertions deferred to A5 (where the logger becomes load-bearing). A1 documents the gap: "scaffold logger trusts its callers; A5 wraps with Zod validation."
2. **Empty collections / max-size collections** - The sole collection is `LogContext`'s object. A1 documents: "empty context is supported (renders no JSON tail); max size is bounded by JSON.stringify truncation at ~100KB host logger limits in Chrome."
3. **Unicode edge cases (RTL, combining chars, null bytes, surrogate pairs, NFC/NFD)** - Logger passes strings through untouched to `console.*`. A1 documents: "logger is unicode-transparent; downstream consumers that echo logs to a network sink must NFC-normalize and strip U+0000 at their boundary."
4. **Injection (script tags, SQL-style, path traversal)** - The scaffold does not accept user input at any boundary. Logger scope is a compile-time literal (`'background'`, `'content:ats'`, etc.). A1 documents: "no injection surface exists; A5 re-audits when the logger routes real user-provided request IDs."
5. **Concurrent re-entry** - Logger is stateless (no module-level mutable state). `createLogger` is idempotent. A1 documents: "scaffold is concurrency-safe by construction; A5 re-audits when the logger acquires a flush queue."
6. **Adversarial state (frozen objects, proxies with throwing getters, circular references)** - The returned `Logger` object is `Object.freeze`d. Circular `LogContext` objects are handled by `JSON.stringify` throwing a TypeError, which A1 documents as acceptable because A5 will wrap `format()` in a try/catch before the real transport lands. A1's scaffold does NOT defend against a throwing proxy `LogContext` - this is a known scaffold gap documented in the completion report.

All six categories are enumerated in the completion report. A reviewer rejects the phase if any category is silently omitted.

### 12.3 Tests landing pad for A5

`tests/.gitkeep`, `tests/background/.gitkeep`, `tests/content/.gitkeep`, `tests/entrypoints/.gitkeep` - empty marker files so A5 can drop `tests/background/messaging/protocol-contract.type-test.ts` without creating directories from scratch.

## 13. Rollback (D23)

Mechanical rollback script: `scripts/rollback-phase-A1.sh` (full bash body in §9.19).

Invocation:

```bash
bash scripts/rollback-phase-A1.sh
```

The script:
1. Confirms it is running inside `llmconveyors-chrome-extension` (refuses otherwise).
2. Removes `.output/`, `.wxt/`, `node_modules/`, `dist/`, `coverage/`.
3. Removes every scaffold-created file and directory (explicit list, no wildcards outside the known set).
4. Removes the parent directory if it is now empty.

**Failure-specific rollback table** (for partial failures; invoke only the line that matches):

| Failure point | Recovery action |
|---|---|
| `pnpm dlx wxt@0.20.0 init` errors out | Retry once; if still failing, `pnpm dlx wxt@0.20.0 init --force` |
| `pnpm install` peer conflict on `@wxt-dev/module-react` | Confirm `wxt@0.20.0` exact match in `package.json`; run `pnpm install --no-frozen-lockfile` |
| Tailwind v4 plugin errors | Confirm `@tailwindcss/vite@^4.0.0` (NOT `^3`); `pnpm remove @tailwindcss/vite && pnpm add -D @tailwindcss/vite@^4.0.0` |
| `pnpm typecheck` fails on WXT-generated types | Drop `exactOptionalPropertyTypes` (already dropped in v2.1); confirm `extends: "./.wxt/tsconfig.json"`; re-run `pnpm exec wxt prepare` |
| `pnpm lint` fails with `Cannot find module @eslint/js` | `pnpm add -D @eslint/js@^9.15.0` |
| `pnpm lint` fails with `tseslint is not a function` | Confirm `typescript-eslint@^8.15.0` is installed; confirm `eslint.config.mjs` imports `from 'typescript-eslint'` (meta package) not `from '@typescript-eslint/eslint-plugin'` |
| `pnpm build` succeeds but popup renders unstyled | Confirm `import './style.css';` present in `entrypoints/popup/main.tsx` AND `@tailwindcss/vite` plugin is in `wxt.config.ts` `vite.plugins` |
| Chrome refuses to load unpacked | Run `pnpm dlx manifest-validator .output/chrome-mv3/manifest.json`; fix reported errors |
| Content script does not load on Greenhouse | Verify folder is `entrypoints/content-scripts/ats.content/index.ts` (directory form); alternate valid form is `entrypoints/content-scripts/ats.content.ts` (single file). Confirm `matches` array in `defineContentScript` |
| `gh repo create` fails with auth error | `gh auth login --web`; retry |
| First `git push` fails with `Permission denied` | Confirm SSH key registered for `ebenezer-isaac` via `ssh -T git@github.com`; retry |

**Do not delete the repo and start over unless all diagnostic options fail.** A partial scaffold with 60% of the files present is still valuable; file a completion report with `status: partial` and let A5 pick up from there.

## 14. Out of scope (explicitly deferred, 14 items)

None of these land in A1:

| Item | Phase that owns it |
|---|---|
| `@webext-core/messaging` ProtocolMap + `onMessage` handlers | A5 |
| `src/background/messaging/protocol.ts` (ProtocolMap definition) | A5 |
| `src/background/messaging/handlers.ts` (HANDLERS dispatch table) | A5 |
| `src/background/auth/refresh-manager.ts` (single-flight refresh) | A5 |
| `ats-autofill-engine` dep declaration in `package.json` | A5 (first consumer for `Profile` + `ProfileSchema`) |
| `ats-autofill-engine/greenhouse`, `/lever`, `/workday` sub-entry consumption | A8 (first per-vendor consumer) |
| `llmconveyors` SDK dep declaration | A5 (first consumer in SDK client factory) |
| `chrome.identity.launchWebAuthFlow` sign-in | A6 |
| Backend bridge endpoint consumer | A6 |
| `chrome.storage.local/session/sync` profile reads/writes | A7 |
| JSON Resume upload UI + option-page sections | A7 |
| Content-script form scanner, classifier, filler | A8 |
| Content-script keyword highlighter + intent detector | A9 |
| Real popup UI with auth state + quick actions | A10 |
| Side panel artifact viewer (CV / cover letter / email tabs) | A11 |
| E2E test against a live Greenhouse / Lever / Workday posting | A11 |
| Real icon artwork (non-1x1 placeholders) | Month 1 post-acceptance |
| Chrome Web Store listing metadata (screenshots, privacy policy URL) | Month 1 post-acceptance |
| Firefox build + identity polyfill | v1.1 |
| `assets/tailwind.css` shared tokens file | A7 (first real consumer) |

The executor that goes beyond scope fails phase verification.

## 15. Compliance gates (exact commands, run in this order)

```bash
cd e:/llmconveyors-chrome-extension

# Install + prepare
pnpm install
pnpm exec wxt prepare

# Typecheck
pnpm typecheck

# Lint (must enforce typescript-eslint rules, not be a no-op)
pnpm lint

# Test (must run a real spec, not an echo stub)
pnpm test

# Build
pnpm build

# Anti-drift gates
bash scripts/check-no-em-dash.sh
bash scripts/check-no-console.sh
bash scripts/check-forbidden-tokens.sh

# Git state
git log --oneline -1
git status --short

# Output sanity
test -f .output/chrome-mv3/manifest.json
test -f .output/chrome-mv3/background.js
test -f .output/chrome-mv3/popup.html
test -f .output/chrome-mv3/sidepanel.html
test -f .output/chrome-mv3/options.html
test -f .output/chrome-mv3/content-scripts/ats.js
grep -q '"name": "LLM Conveyors Job Assistant"' .output/chrome-mv3/manifest.json
```

Every command MUST exit 0. The phase is complete ONLY when the entire sequence above passes in a single clean run.

## 16. Executor notes - anti-patterns (specific forbidden moves)

The executor MUST NOT do any of the following. Each item maps to a concrete failure mode the review uncovered:

1. **Use `e:/job-assistant` or `zovo-labs/job-assistant`** - these paths are forbidden per D4. The forbidden-token grep catches any reintroduction.
2. **Add `ats-autofill-engine` to `package.json`** - A5 is the first consumer. Adding it in A1 forces a `file:../ats-autofill-engine` placeholder, which per D14 is a CI-breaking bandaid.
3. **Add `llmconveyors` to `package.json`** - A5 is the first consumer. Same rule.
4. **Create a placeholder `../ats-autofill-engine/` sibling directory** - this is the exact stub that review finding #4 blocked. Never write it.
5. **Set `exactOptionalPropertyTypes: true` in `tsconfig.json`** - WXT 0.20 generated types break on this. Review finding #10.
6. **Set `types: ["chrome", "node"]` in `tsconfig.json`** - conflicts with `webextension-polyfill`. Review finding #11. Let `.wxt/tsconfig.json` supply the type set.
7. **Use `@typescript-eslint/eslint-plugin` directly in `eslint.config.mjs`** - switch to `typescript-eslint` meta package with `tseslint.config(...)`. Review finding #9.
8. **Omit `@eslint/js` from `devDependencies`** - required for `js.configs.recommended`. Review finding #8.
9. **Write `pnpm test` as `echo ... && exit 0`** - tests that cannot fail are worthless. `tests/scaffold.spec.ts` MUST be a real vitest spec. Review finding #21.
10. **Commit `assets/tailwind.css`** - dead file per review finding #12. Defer to A7.
11. **Use `git add .`** - stage explicit paths. Avoid accidentally staging `.wxt/` or `.output/`. Review finding #18.
12. **Use async `main()` in `defineBackground`** - hard rule from investigation 33. `main()` is synchronous; async work lives inside listeners.
13. **Add `"tabs"` permission** - triggers "Read browsing history" warning. `host_permissions` already exposes matched tab.url.
14. **Add `"cookies"` permission** - enhanced CWS review friction. Sign-in uses `launchWebAuthFlow` exclusively (A6).
15. **Add `<all_urls>`** - enhanced CWS review trigger. Forbidden.
16. **Use `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug` anywhere outside `src/background/log.ts`** - D11. The grep gate catches any reintroduction. Wire through `createLogger('<scope>')` instead.
17. **Write an em-dash (U+2014) in any file** - D15. The grep gate runs in CI and in the pre-commit hook.
18. **Write any Zovo branding in the repo** - D4 silent default. The forbidden-token grep catches `zovo` case-insensitively.
19. **Create files under `e:/llmconveyors.com/`** - this phase is clean-room. The only interaction is READ-only on plan files.
20. **Skip the husky install step** - D14.4 requires pre-commit enforcement from Day 1.
21. **Use PowerShell for shell scripts** - D23 rollback ships as bash (`.sh`) with LF endings. `.gitattributes` enforces LF on `*.sh`.
22. **Commit generated files** - `.output/`, `.wxt/`, `node_modules/` are gitignored. A failed `git status --short` check in step 8.29 halts the commit.
23. **Skip the rollback script** - D23 mandates a committed, runnable script, not a bullet list.
24. **Introduce `HighlightRange`, `IKeywordHighlighter`, or `skill-taxonomy` in any file** - v1 remnants, forbidden by D14.1.

## 17. Definition of done

Phase A1 is DONE when:

1. Every checkbox in §10 acceptance criteria passes with a clean run.
2. Every gate in §15 compliance gates exits 0 in a single uninterrupted run.
3. First commit exists at `github.com/ebenezer-isaac/llmconveyors-chrome-extension` (or locally with `REMOTE_SETUP.md` if remote creation is blocked).
4. Completion report (§18) is filed with status `complete` or `partial-remote-pending` and zero `failed` entries.
5. No files were written anywhere under `e:/llmconveyors.com/`.
6. The catch-up email to Michael (sent separately by the architect on 2026-04-11) references the repo URL `github.com/ebenezer-isaac/llmconveyors-chrome-extension` and that URL resolves to a non-404 page OR a scheduled creation is queued in `REMOTE_SETUP.md`.

## 18. Completion report template

```
# Phase A1 completion report

Status: complete | partial-remote-pending | failed
Repo path: e:/llmconveyors-chrome-extension/
Remote: pushed | pending | remote-not-set
Commit SHA: <first commit sha>
Output size: <bytes in .output/chrome-mv3/>

## Acceptance checklist (§10)
- [x] Install
- [x] Typecheck
- [x] Lint (enforces typescript-eslint rules)
- [x] Test (real vitest spec, CAN fail)
- [x] Build
- [x] Anti-drift grep gates (em-dash, console.*, forbidden tokens)
- [x] Husky pre-commit installed
- [x] Rollback script committed
- [x] Chrome loads unpacked (manual verification)
- [x] Popup renders with Tailwind
- [x] Side panel renders
- [x] Options page renders in new tab
- [x] Content script logs via createLogger on Greenhouse

## D19 adversarial categories (§12.2)
- [x] Null/undefined/NaN/Infinity: documented
- [x] Empty/max-size collections: documented
- [x] Unicode: documented (transparent passthrough, A5 re-audits)
- [x] Injection: documented (no user input surface)
- [x] Concurrent re-entry: documented (stateless logger)
- [x] Adversarial state: documented (frozen Logger, known proxy gap)

## Anti-drift gates (§11)
- [x] G1 forbidden-token grep (3 scripts) - PASS
- [x] G4 husky pre-commit wired - PASS
- [N/A] G2 type-level protocol contract (A5)
- [N/A] G3 exports-map resolution (B1)
- [N/A] G5 Zod round-trip (A5)

## Deviations from plan
(List any places the executor had to diverge from this plan, with reasons. Zero is the expected value.)

## Known issues / deferrals
- Icons are 1x1 placeholders; real icons Month 1 post-acceptance.
- REMOTE_SETUP.md present iff gh repo create failed.
- D19 adversarial gaps in the logger scaffold are documented; A5 closes them when the logger becomes load-bearing.

## Files created
(Listing with byte counts for each of the 30 substantive files)

## Next phase
A5 - background service worker + @webext-core/messaging ProtocolMap + SDK client factory.
```

## 19. Phase close-out

Once the completion report is filed:

1. The architect runs the drift-check validator on all 20 rewritten plans (Wave 2 of the decision memo §4 execution plan).
2. If the validator flags any residual drift in A1, the architect fires a correction agent in Wave 3.
3. If A1 passes, the Day 1 execution wave (Wave 4) begins and Sonnet executors pick up A1/A2/A3/B1 plans.

A1 is the Day-1 foundation. Getting it right is non-negotiable because every subsequent A phase extends this scaffold without rescaffolding. A single drift here cascades to 7 downstream phases.

**End of phase A1 plan (v2.1).**
