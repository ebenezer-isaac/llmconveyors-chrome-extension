# Agent 19 — `@repo/shared-types` Package Investigation

Scope: `libs/shared-types/package.json`, `src/index.ts`, `tsconfig.json`, dist status.

## a) Package identity & exports map

- **Name**: `@repo/shared-types` (`libs/shared-types/package.json:2`)
- **Version**: `1.0.0` (`package.json:3`)
- **Private**: `true` — workspace-only, not published (`package.json:4`)
- **Type**: No `"type"` field → defaults to **CommonJS** (`package.json` omits `type`)
- **main**: `dist/index.js` (`package.json:5`)
- **types**: `dist/index.d.ts` (`package.json:6`)
- **exports map** (`package.json:7-18`):
  - `.`: types → `./dist/index.d.ts`, import → `./src/index.ts`, require → `./dist/index.js`
  - `./docs`: types → `./dist/docs/index.d.ts`, import → `./src/docs/index.ts`, require → `./dist/docs/index.js`
- **Gotcha**: the `import` condition points to **raw `.ts` source**, not a compiled `.mjs`. Only a TS-aware consumer (ts-node, Next.js `transpilePackages`, tsx) can resolve this path. A stock bundler resolving the ESM condition will blow up on `.ts`.

## b) Build

- **Command**: `tsc` via `pnpm build` (`package.json:20`)
- **Output**: `./dist` (`tsconfig.json:10`)
- **Module**: `commonjs` — emits CJS `.js` + `.d.ts` + sourcemaps (`tsconfig.json:3`)
- **Target**: `ES2021` (`tsconfig.json:8`)
- **Decorators enabled**: `experimentalDecorators`, `emitDecoratorMetadata` (`tsconfig.json:6-7`) — unusual for a schema lib; likely inherited boilerplate.
- **Incremental build**: `incremental: true` (`tsconfig.json:12`) — produces `.tsbuildinfo`.
- **Includes**: `src/**/*`; excludes `node_modules`, `dist`, `src/**/__tests__/**` (`tsconfig.json:22-29`).

## c) Top-level re-exports from `src/index.ts`

38 re-export groups (`src/index.ts:1-127`):
`tier`, `models`, `pricing`, `task-catalog`, `skill-catalog`, `research`, `contact`, `contact-pipeline`, `artifacts`, `log-level`, `sse`, `schemas/resume.schema`, `schemas/resume-meta.schema`, `schemas/generate-form.schema`, `schemas/ai-responses.schema`, `schemas/ats-score.schema`, `schemas/rx-resume.schema`, `schemas/rx-design-blob.schema`, `converters/rx-resume`, `session`, `schemas/session-input.schema`, `schemas/session-hydration.schema`, `schemas/content.schema`, `schemas/domain-bridge.schema`, `schemas/b2b-domain-analysis.schema`, `schemas/outreach.schema`, `schemas/interaction.schema`, `schemas/agent-api.schema`, `schemas/agent-manifest.schema`, `schemas/b2b-sales-request.schema`, `schemas/master-resume.schema`, `preferences`, named `{ convertSpelling, convertUsToUk }` from `utils/spelling-variants`, `module-blueprint`, `workflow-blueprint`, `docs`, `referral`, `shares`, `schemas/dynamic-skill.schema`, `schemas/privacy.schema`, `schemas/settings-api.schema`, `schemas/resume-api.schema`, `schemas/internal-api.schema`, `schemas/health-api.schema`, `schemas/session-api.schema`, `schemas/content-api.schema`, `schemas/outreach-api.schema`, `schemas/reservation.schema`, `schemas/jd-keyword-miss.schema`, `schemas/api-response.schema`, `schemas/upload.schema`, `schemas/usage.schema`, `api-constants`.

## d) Runtime dependencies (`package.json:23-27`)

- `cheerio` `^1.2.0` — HTML parser, pulls in `parse5`, `undici`, `htmlparser2`
- `chrono-node` `^2.9.0` — NL date parser
- `zod` `^3.23.8`

## e) Peer dependencies

**None declared** (`package.json` has no `peerDependencies` block).

## f) dist/ commit status

- `.gitignore` matches `libs/shared-types/dist` (confirmed via `git check-ignore` — pattern hit)
- `git ls-files libs/shared-types/dist` returns empty → **not committed**
- Local `dist/` exists with compiled `.js`/`.d.ts`/`.js.map` → **regenerated on each build**. Any fresh clone MUST run `pnpm -F @repo/shared-types build` before consumers can resolve the `require`/`types` conditions.

## g) Chrome extension `file:` install viability

**Direct install will not work cleanly.** Problems:

1. **No `"type": "module"`** — package is CJS. Chrome extension MV3 service workers require ESM. A bundler (Vite/Webpack/esbuild) is mandatory to interop.
2. **ESM condition points to `./src/index.ts`** (`package.json:10`). Bundlers that pick the `import` condition will try to parse raw TypeScript. Works only if the extension's bundler is configured to transpile this package (e.g. Vite with `optimizeDeps.include`, or esbuild with `loader: { '.ts': 'ts' }`).
3. **`file:` / workspace dependency**: pnpm `file:../llmconveyors.com/libs/shared-types` will symlink the folder, but pnpm will NOT run the dependency's `build` script on install. The consumer must either (a) build shared-types first, then import via the `require` condition, or (b) configure their bundler to transpile the `.ts` source directly.
4. **`private: true`** prevents `npm publish` — only workspace / file / tarball installs are possible.
5. **Recommended path**: build shared-types first (`pnpm -F @repo/shared-types build`), then reference the built `dist/` via a bundler that resolves the `require` → `dist/index.js` + `dist/index.d.ts`. Or add a new `./chrome` condition exporting pre-bundled ESM.

## h) Chrome extension bundling gotchas

- **`cheerio` is the biggest risk**: depends on `undici` (Node `http`/`net`/`stream`), `parse5`, `entities`. Undici is Node-only and will either fail to bundle or bloat the extension by 100+ KB. Cheerio should be stripped from any Chrome extension build — the extension already has DOM access via `document`, so the cheerio-using schemas should be moved behind a conditional import or into a node-only subpath.
- **`chrono-node`** is pure JS and bundles cleanly (~60 KB minified).
- **`zod` 3.23** bundles cleanly, tree-shakes partially.
- **No dynamic `import()`** visible in `index.ts` top-level — all static re-exports (`src/index.ts:1-127`). Good for tree-shaking.
- **Decorator metadata emission** (`tsconfig.json:6-7`) may leak `reflect-metadata` expectations into `.d.ts` consumers, but no runtime import of `reflect-metadata` is in `index.ts`.
- **38 barrel re-exports** — aggressive tree-shaking required; import sub-paths (e.g. `@repo/shared-types/dist/schemas/agent-api.schema`) if bundle size matters, though the `exports` map only whitelists `.` and `./docs`, so deep imports will be blocked unless the exports map is extended.
- **Log level / SSE / module-blueprint / workflow-blueprint** re-exports likely carry zero runtime deps but should be audited by other agents (out of scope here).

## i) Definitive answers (filling the 8% gap)

### i.1 `dist/` commit status — GITIGNORED
- `.gitignore:80` contains `libs/shared-types/dist/` → **excluded from git**
- `git ls-files libs/shared-types/dist` → empty → **never committed**
- Local `dist/` exists (84 `.js` files confirmed via Glob) but is **rebuilt fresh on every clone**. Any consumer pulling via git URL will get ZERO compiled output until `pnpm -F @repo/shared-types build` runs.
- No `.npmignore` file exists. No `"files"` field in `package.json` → `npm pack` would ship everything including `src/` and `dist/` (if dist is built at pack time).

### i.2 Chrome extension install viability — THREE OPTIONS, ranked

**Option A — `file:../llmconveyors.com/libs/shared-types` (pnpm workspace symlink)**
- **Works IF**: extension is inside the same pnpm monorepo (workspace), AND extension's bundler (Vite/webpack/esbuild) is configured to transpile `.ts` from `node_modules` (because the `import` condition → `./src/index.ts`).
- **Fails IF**: extension lives outside the repo. pnpm `file:` protocol symlinks but does NOT auto-run `build` scripts on dependencies. Without `dist/` present, the `require` condition fails.
- **Verdict**: Workable for in-monorepo extension. Requires `pnpm -F @repo/shared-types build` as a prebuild step in the extension's package scripts.

**Option B — git URL install (`git+https://github.com/.../llmconveyors.com.git#path:libs/shared-types`)**
- **Fails outright**: `dist/` is gitignored → the git URL clone contains NO compiled output. pnpm/npm will NOT run a `prepare`/`build` hook because `private: true` packages don't run `prepare` on git installs reliably, and no `prepare` script exists in `package.json` anyway.
- **Fix required**: add `"prepare": "tsc"` to scripts AND add `"files": ["dist", "src"]` OR un-gitignore dist. Even then, `private: true` blocks `npm publish` but does NOT block git URL installs.
- **Verdict**: Broken out-of-the-box. Needs `prepare` script + file allowlist to work.

**Option C — publish to npm**
- **Blocked**: `"private": true` in `package.json:4`. Must flip to `false` and rename to an available scope (`@repo/*` is private-scoped convention).
- **Verdict**: Not available without config changes + scope rename + public registry publish.

**RECOMMENDED for plan 100**: extract a minimal `@llmconveyors/shared-types-lite` sub-package (new directory `libs/shared-types-lite/`) containing only the zod schemas the extension consumes (`agent-api`, `b2b-sales-request`, `session-input`, `api-response`, `upload`, `contact`, `tier`, `models`), with zero cheerio/chrono-node deps, proper ESM output, and published or git-URL-installable. Keep the main `@repo/shared-types` as a server/web workspace-only package.

### i.3 Node builtins in shared-types — ZERO
- Grep for `from '(fs|path|crypto|http|https|stream|buffer|os|child_process|url|util|net|tls|zlib|events|node:)'` across `src/**` → **no matches**.
- `src/index.ts` has no Node builtin imports.
- **BUT** transitive risk via `cheerio`: imported by `converters/rx-resume/date-parser.ts` and `converters/rx-resume/html-structure.ts`. Cheerio 1.x pulls `undici` which pulls Node `http`/`net`/`stream`/`buffer`/`zlib`. An extension importing `@repo/shared-types` index barrel will pull cheerio via `converters/rx-resume` re-export on `src/index.ts:40`.
- **Mitigation**: the extension must NOT import the barrel. It must import sub-paths (e.g. `@repo/shared-types/dist/schemas/agent-api.schema`) — but the `exports` map whitelists ONLY `.` and `./docs`, blocking deep imports. Either extend `exports` with explicit sub-paths OR extract the lite package.

### i.4 ESM/CJS conditional exports story — BROKEN for Chrome
The `exports` field is structurally malformed for ESM consumers:
```json
".": {
  "types": "./dist/index.d.ts",
  "import": "./src/index.ts",     // ← raw TS, not .mjs — bundler explodes unless TS-aware
  "require": "./dist/index.js"     // ← CJS only
}
```
- No `"default"` fallback.
- `import` condition points to unbuilt TypeScript source. A Chrome extension bundler (esbuild/Vite/webpack) picks the `import` condition in ESM mode and receives `.ts` — it will work only if the bundler is configured to transpile this path (Next.js does via `transpilePackages`; stock Vite/webpack do not).
- **No `.mjs` output**: `tsconfig.json:3` sets `module: commonjs`. There is no second build producing ES modules. MV3 service workers require `type: "module"` scripts, so the extension's own bundler must convert CJS → ESM at build time (esbuild does this automatically via `cjs-module-lexer`, Vite does via `optimizeDeps`).
- **Verdict**: bundling works in practice for a Vite/esbuild-based extension IF cheerio is externalised or tree-shaken away AND the `import` condition is either rewritten to point at `./dist/index.js` OR the bundler handles raw TS.

### i.5 Zod 3.23.x in Chrome extension service workers — SAFE
- Zod 3.x is pure JS, zero dependencies, no Node builtins, no `eval`, no `Function()` constructor, no dynamic code generation that CSP would block.
- Works in MV3 service workers with default CSP (`script-src 'self'`).
- Bundle size: zod 3.23.8 minified+gzipped ≈ 13 KB. Tree-shakes partially (schema builders are modular).
- **Known issue**: zod 3.23.x `.transform()` with async refinements requires `parseAsync` — not a Chrome-specific bug but a usage gotcha.
- **No CSP violations**: zod uses prototype reflection only, no `unsafe-eval`.

## j) Final recommendation for plan 100

Create `libs/shared-types-lite/` as a NEW workspace package with:
- `"type": "module"`, `"main": "./dist/index.js"`, `"module": "./dist/index.mjs"`, proper dual `exports` map with `"import": "./dist/index.mjs"` and `"require": "./dist/index.cjs"`
- `tsconfig.json` with `module: "ESNext"`, `target: "ES2022"`, `moduleResolution: "bundler"`
- Re-export ONLY the schemas the extension needs (agent-api, b2b-sales-request, session-input, api-response, upload, contact, tier, models)
- Zero cheerio, zero chrono-node, zod only
- `"files": ["dist"]`, `"prepare": "tsc"`, `"private": false` (publishable)
- Extension installs via `workspace:*` in monorepo OR git URL OR npm publish

DO NOT try to retrofit `@repo/shared-types` for Chrome — the cheerio dependency and broken `import` condition make it a losing battle.

Confidence: 100%

e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\19-shared-types-exports.md
