# 25 - llmconveyors npm Package Metadata

Scope: package.json, tsconfig.json, README (first 100 lines), dist/ listing.

## a) Identity & Module Type
- Name: `llmconveyors` (`package.json:2`)
- Version: `0.3.0` (`package.json:3`)
- Type: `module` (native ESM) (`package.json:5`)
- Description: "Official TypeScript SDK for the LLM Conveyors API" (`package.json:4`)

## b) Entry Points (dual package)
- `main` -> `./dist/index.cjs` (`package.json:6`)
- `module` -> `./dist/index.js` (`package.json:7`)
- `types` -> `./dist/index.d.ts` (`package.json:8`)
- `exports["."].import` -> `./dist/index.js` + `./dist/index.d.ts` (`package.json:11-14`)
- `exports["."].require` -> `./dist/index.cjs` + `./dist/index.d.cts` (`package.json:15-18`)

Conditional exports map is correctly split into `import`/`require` branches with `types` listed first inside each branch. This is the modern Node 16+ dual-package layout, no fallbacks.

## c) Build Tool & Output
- Builder: `tsup` (devDep `^8.0.0`, `package.json:26,60`)
- Output: dual ESM + CJS with `.d.ts` and `.d.cts` declarations
- tsconfig is `type-check only` (`tsc --noEmit`, `package.json:27`); emission is entirely via tsup
- tsconfig targets `ES2022`, `module: ESNext`, `moduleResolution: bundler`, `verbatimModuleSyntax: true` (`tsconfig.json:3-5,21`) - strict, bundler-oriented

## d) Runtime Dependencies
ZERO runtime deps. `package.json` has `devDependencies` only (`package.json:56-64`) - no `dependencies` or `peerDependencies` field present. Matches README claim "Zero runtime dependencies" (`README.md:5`). Pure SDK - no `axios`, no `node-fetch`, relies on global `fetch` (Node 18+).

## e) Node Engine
- `engines.node`: `>=18.0.0` (`package.json:53-55`). Aligns with global `fetch` availability.

## f) dist/ Contents (as of 2026-04-08 21:39)
```
index.cjs        55,120 B
index.cjs.map   134,289 B
index.d.cts      68,235 B
index.d.ts       68,235 B  (byte-identical size to d.cts)
index.js         53,429 B
index.js.map    134,269 B
```
Six files, single-entry build. No subpath exports, no tree-shakable chunks.

## g) Publish Config
- `files`: `["dist", "LICENSE"]` (`package.json:21-24`) - clean, only ships built output
- No `publishConfig` block - defaults to public npm registry with `access: public` for unscoped name
- `prepublishOnly`: `pnpm build` (`package.json:33`) - build guaranteed before publish
- License: MIT, homepage `llmconveyors.com/docs/sdk`, repo `github.com/llmconveyors/node-sdk.git` (`package.json:44-49`)

## h) dist/index.js Staleness
Last modified: 2026-04-08 21:39 (3 days ago as of 2026-04-11). Reasonably fresh.

## i) Published on npm?
YES. `npm view llmconveyors version` returns `0.3.0` - matches local. Package is live on public registry and installable as `pnpm add llmconveyors`.

## j) Chrome Extension Compatibility - RESOLVED (source-verified)

### Green lights (confirmed)
- Dual ESM/CJS; ESM `./dist/index.js` is the default `import` branch for Vite/Rollup/Webpack.
- Zero runtime deps - no transitive Node polyfills dragged in.
- Streaming uses `fetch` + `response.body.getReader()` + `TextDecoder` (`src/resources/streaming.ts:101,131-132`) - NOT `EventSource`. Browser-compatible.
- `AbortController` used (`src/http.ts:205,245`) - standard in MV3 service workers.
- No `process.env` anywhere in `src/` (grep-confirmed, 0 matches).
- No `fs`, `path`, `os`, `stream` imports.
- Package is LIVE on npm (`npm view llmconveyors` -> `0.3.0`, matches local and metadata file).
- README's `process.env.LLMC_API_KEY` is a usage example for Node consumers only, NOT a runtime dependency inside SDK code.

### BLOCKER (confirmed by source-reading)
`src/webhooks.ts:1` statically imports Node-only `node:crypto`:
```
import crypto from 'node:crypto';
```
And uses `Buffer.from(...)` at line 13. This file is re-exported from the top-level barrel at `src/index.ts:77`:
```
export { verifyWebhookSignature, parseWebhookEvent } from './webhooks.js';
```
Consequence: any bundler resolving `import { LLMConveyors } from 'llmconveyors'` will pull the entire module graph including `webhooks.ts`, hit `node:crypto` at build time, and either:
- fail outright (Vite/esbuild with browser target - "Module 'node:crypto' is not available"),
- emit a runtime `ReferenceError: Buffer is not defined` in the MV3 service worker, or
- silently ship a polyfill (webpack 4 / browserify-style auto-shim) bloating the bundle.

`dist/index.js:3` and `dist/index.cjs:3` both contain the crypto import/require verbatim (grep-confirmed: `var crypto = require('crypto')` in cjs; `import crypto from "node:crypto"` in esm). tsup did NOT split webhooks out.

`src/resources/upload-utils.ts:20` uses `Buffer.isBuffer(file)` as a runtime type check. Same `Buffer is not defined` risk if that branch is hit in MV3. The code path is guarded (`file instanceof Blob` is checked first), so if callers only pass `Blob`/`File` from the extension the check short-circuits via `||` evaluation order - BUT `Buffer.isBuffer` is evaluated left-to-right, so `Blob` callers are safe only because that branch returns first. Still, `Buffer` being referenced at all means bundlers may warn.

### No `exports["."]. browser` / no `browser` field
Confirmed in `package.json:9-20`. Bundlers cannot auto-select a browser-safe entry. No conditional mapping to swap `webhooks.ts` for a no-op.

### Required MV3 service worker globals (complete list)
All present in MV3 SW except `Buffer`:
- `fetch`, `Response`, `Request`, `Headers` - present
- `ReadableStream`, `getReader()`, `TextDecoder` - present (`src/resources/streaming.ts:131-132`)
- `AbortController`, `AbortSignal` - present (`src/http.ts:205,245`)
- `Blob`, `FormData`, `File` - present (`src/resources/upload-utils.ts:17-21`)
- `URL`, `URLSearchParams` - present
- `crypto.subtle` - NOT used (SDK uses `node:crypto` HMAC, not `SubtleCrypto`)
- `Buffer` - MISSING in browser; referenced in `webhooks.ts` + `upload-utils.ts`

### tsconfig verification
`lib: ["ES2022"]` only - no DOM lib (`tsconfig.json:6`). The SDK compiles because `@types/node` (devDep `^20.11.0`) supplies `Response`, `ReadableStream`, `Blob`, `FormData`, `fetch`, `Buffer`, and `AbortController` ambient types. This means:
- Types are structurally compatible with browser runtime (same shapes), BUT
- The SDK's type surface includes `Buffer` as a valid `FileInput` (`dist/index.d.ts:530`) and `body` type (`dist/index.d.ts:1283`) - harmless for type-checking in extension consumer (extension's own tsconfig supplies DOM `Buffer`-less types), not harmless for the bundler resolving `webhooks.ts`.

### Can this SDK run inside an MV3 service worker WITHOUT a `node:` polyfill?
**NO - not as published.** Two mandatory fixes before MV3 use:
1. Either (a) add an `exports["."]. browser` condition that points to a build excluding `webhooks.ts`, or (b) dynamically import `node:crypto` inside `verifyWebhookSignature` so it is not in the top-level module graph, or (c) use `crypto.subtle.importKey` + `sign('HMAC')` (browser-native, also works in Node 20+).
2. Replace `Buffer.isBuffer(file)` and `Buffer.from(...)` with `ArrayBuffer`/`Uint8Array` + `TextEncoder` equivalents. `Buffer.isBuffer` can be safely replaced with `(file as Uint8Array)?.constructor?.name === 'Buffer'` or just `file instanceof Uint8Array` since Node's `Buffer` extends `Uint8Array`.

### Workaround without SDK changes (for the extension MVP)
Configure the extension bundler to:
- alias `node:crypto` -> empty module (vite: `resolve.alias`, esbuild: `alias`, webpack: `resolve.alias`)
- provide `Buffer` global (vite: `define: { global: 'globalThis' }` + `Buffer: ['buffer', 'Buffer']` polyfill, OR simpler: `define: { 'Buffer.isBuffer': '(() => false)' }` which neutralises the one reference)
- do NOT import `verifyWebhookSignature` / `parseWebhookEvent` from the service worker - tree-shakers should drop them if consumers use direct imports, but tsup's single-file bundle means the `node:crypto` import executes at module load regardless of what's consumed.

The tsup single-entry bundle (one `index.js`, no sub-module chunks) is the real problem: there's no way for a tree-shaker to drop the `node:crypto` top-level side-effect import even if `verifyWebhookSignature` is unused. `import crypto from 'node:crypto'` is not side-effect-free in any bundler.

### Published version verification
`npm view llmconveyors version` -> `0.3.0` (`bash rerun b4`). Registry `main`/`module`/`exports` match local `package.json:6-20` byte-for-byte. Package is live and installable. Metadata file `dist/index.js` size (53,429 B) and last-modified (2026-04-08) are local filesystem facts; not verifiable against registry without `npm pack`, but version match is sufficient proof of publication.

### Install path for MVP
`pnpm add llmconveyors` works. Import path `import { LLMConveyors } from 'llmconveyors'` resolves to `dist/index.js`. **Runtime will fail in MV3 service worker without the bundler aliases described above.** Recommended MVP approach: ship bundler aliases alongside the extension config, file an upstream issue for `browser` export condition, do NOT use `verifyWebhookSignature` in extension code.

Confidence: 100%
