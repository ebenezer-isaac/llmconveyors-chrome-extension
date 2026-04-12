# 45 - npm Scaffold: `@ebenezer-isaac/autofill-core`

## 1. Build tool decision: `tsup`

| Tool | Verdict |
|---|---|
| **tsup** | Chosen. llmconveyors SDK already uses it. esbuild-backed, zero-config dual ESM+CJS, multi-entry, `.d.ts` via rollup-plugin-dts. Tree-shakable out of the box. |
| tsdown | tsup v2 successor, rolldown-backed. Still pre-1.0 as of cutoff; adopt later. |
| rolldown | Raw bundler, no dts pipeline wrapper. Too low-level. |
| unbuild | Nuxt-owned; great for libs but smaller community, less multi-entry ergonomics. |
| Vite lib mode | Optimized for app dev, not multi-entry libs with dts; awkward CJS+ESM parity. |

`tsup` stays unless we hit a tree-shaking bug.

## 2. `package.json`

```json
{
  "name": "@ebenezer-isaac/autofill-core",
  "version": "0.1.0-alpha.1",
  "description": "Deterministic form autofill core for ATS job applications (Greenhouse, Lever, Workday, Ashby). Chrome MV3 and Node compatible.",
  "license": "MIT",
  "author": "Ebenezer Isaac <ebenezer@llmconveyors.com>",
  "homepage": "https://github.com/ebenezer-isaac/autofill-core#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ebenezer-isaac/autofill-core.git"
  },
  "bugs": { "url": "https://github.com/ebenezer-isaac/autofill-core/issues" },
  "keywords": [
    "autofill", "form-autofill", "ats", "greenhouse", "lever",
    "workday", "ashby", "job-application", "chrome-extension", "mv3",
    "form-filler", "react-controlled-input", "taxonomy"
  ],
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./dom": {
      "types": "./dist/adapters/dom/index.d.ts",
      "import": "./dist/adapters/dom/index.js",
      "require": "./dist/adapters/dom/index.cjs"
    },
    "./adapters/chrome": {
      "types": "./dist/adapters/chrome/index.d.ts",
      "import": "./dist/adapters/chrome/index.js",
      "require": "./dist/adapters/chrome/index.cjs"
    },
    "./taxonomy": {
      "types": "./dist/taxonomy/index.d.ts",
      "import": "./dist/taxonomy/index.js",
      "require": "./dist/taxonomy/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "LICENSE", "LICENSES", "README.md", "CHANGELOG.md"],
  "engines": { "node": ">=20.0.0" },
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.adapter.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:core": "vitest run --project core",
    "test:adapters": "vitest run --project adapters",
    "test:watch": "vitest",
    "publish:alpha": "pnpm run prepublishOnly && pnpm publish --access public --tag alpha --no-git-checks",
    "prepublishOnly": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/firefox-webext-browser": "^120.0.4",
    "@types/node": "^22.7.0",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "eslint": "^9.12.0",
    "happy-dom": "^15.7.4",
    "prettier": "^3.3.3",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Zero runtime `dependencies`. Core uses only `structuredClone` / built-ins; DOM adapter uses `globalThis` DOM types.

## 3. `tsconfig.json` (core)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
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
    "outDir": "dist",
    "rootDir": "src",
    "types": []
  },
  "include": ["src/core/**/*.ts", "src/taxonomy/**/*.ts", "src/index.ts"],
  "exclude": ["node_modules", "dist", "tests", "src/adapters/**"]
}
```

## 3b. `tsconfig.adapter.json` (DOM + chrome)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "firefox-webext-browser"]
  },
  "include": ["src/adapters/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Core files are guaranteed DOM-free because `lib` excludes `DOM` - any `document`/`window` reference fails `pnpm typecheck`.

## 4. `tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'taxonomy/index': 'src/taxonomy/index.ts',
    'adapters/dom/index': 'src/adapters/dom/index.ts',
    'adapters/chrome/index': 'src/adapters/chrome/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  platform: 'neutral',
  skipNodeModulesBundle: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  }
});
```

`platform: 'neutral'` + `sideEffects: false` = consumer bundlers drop unused adapters.

## 5. `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['tests/core/**/*.test.ts', 'tests/taxonomy/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'adapters',
          include: ['tests/adapters/**/*.test.ts'],
          environment: 'happy-dom'
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 }
    }
  }
});
```

## 6. `eslint.config.mjs` (flat)

```js
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: { project: './tsconfig.json' } },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  {
    files: ['src/adapters/**/*.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.adapter.json' } }
  },
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] }
];
```

## 7. License layout

```
LICENSE                 # MIT, root
LICENSES/
  MIT.txt               # copy of MIT for clarity
  MPL-2.0.txt           # verbatim MPL-2.0 text
src/taxonomy/mozilla/   # MPL-2.0 derived files, each with header:
  // This Source Code Form is subject to the terms of the Mozilla Public
  // License, v. 2.0. If a copy of the MPL was not distributed with this
  // file, You can obtain one at https://mozilla.org/MPL/2.0/.
  // Derived from: https://github.com/mozilla/libdialog/...
```

`README.md` License section states: "Package is MIT except files under `src/taxonomy/mozilla/` which are MPL-2.0. Redistribution of those files must retain the MPL-2.0 header." MPL-2.0 is file-scoped, compatible with MIT aggregation.

## 8. Repo layout

```
autofill-core/
  .github/workflows/ci.yml        # typecheck + lint + test + build matrix
  .github/workflows/release.yml   # npm publish on tag v*
  src/
    index.ts                      # core public API re-exports
    core/                         # pure TS, no DOM
      fields/ matchers/ normalize/ taxonomy-lookup/
    taxonomy/
      index.ts
      mozilla/                    # MPL-2.0 derived
    adapters/
      dom/index.ts                # DOM-coupled fill strategies
      dom/react-input.ts          # React controlled-input native setter
      dom/file-input.ts           # DataTransfer attach
      chrome/index.ts             # chrome.storage, chrome.runtime wrappers
  tests/
    core/ taxonomy/ adapters/
  docs/
    ARCHITECTURE.md USAGE.md LICENSING.md
  LICENSE LICENSES/ README.md CHANGELOG.md
  package.json tsconfig.json tsconfig.adapter.json
  tsup.config.ts vitest.config.ts eslint.config.mjs
  .gitignore .npmignore .prettierrc
```

## 9. `.gitignore` / `.npmignore`

```
# .gitignore
node_modules/
dist/
coverage/
*.log
.DS_Store
.env*
.vitest-cache/
```

```
# .npmignore
src/
tests/
docs/
coverage/
investigation/
.github/
tsconfig*.json
tsup.config.ts
vitest.config.ts
eslint.config.mjs
.prettierrc
*.log
```

## 10. Publish workflow

**Manual first release:**
```bash
pnpm install
pnpm build
pnpm test
pnpm publish --access public --tag alpha --no-git-checks
```
`prepublishOnly` script blocks accidental publish with broken code.

**CI (`.github/workflows/release.yml`, future):** trigger on `v*` tag, `pnpm install --frozen-lockfile`, `pnpm run prepublishOnly`, `pnpm publish --provenance --access public --tag ${TAG}` with `NPM_TOKEN` secret. `--provenance` enables Sigstore attestation (npm 9.5+).

## Tree-shake verification

Consumer importing `@ebenezer-isaac/autofill-core` pulls only `dist/index.js` (pure core). Importing `@ebenezer-isaac/autofill-core/dom` pulls DOM adapter. Node test runner can import root + taxonomy without ever touching DOM types. `sideEffects: false` + `splitting: true` + separate entries = zero dead-code leakage. Verify post-build with `pnpm dlx publint dist` and `pnpm dlx @arethetypeswrong/cli --pack`.

---

Confidence: 88%
45-npm-scaffold.md
