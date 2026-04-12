# WXT Framework Canonical Project Structure (April 2026)

## a) Current WXT Version
**v0.20.x** (latest stable per wxt.dev/guide/installation.html and github.com/wxt-dev/wxt/releases as of 2026-04-11). Pin with `"wxt": "^0.20.0"` in `package.json`. The v0.20 line is API-stable for `defineConfig`, `defineBackground`, `defineContentScript`, and the modules system used below.

## b) Default Project Structure
Fresh `pnpm dlx wxt@latest init` scaffold (React template):

```
my-extension/
├── .output/              # Build artifacts (gitignored)
├── .wxt/                 # WXT-generated TS config + types (gitignored)
├── assets/               # CSS, images processed by Vite (import from code)
├── components/           # Auto-imported UI components (optional)
├── entrypoints/          # Extension entry points (required)
├── hooks/                # Auto-imported React hooks (React template)
├── modules/              # Local WXT modules (optional)
├── public/               # Copied as-is, unprocessed (icons, static files)
├── utils/                # Auto-imported utilities (optional)
├── .env                  # Environment variables
├── .gitignore
├── package.json
├── tsconfig.json
├── wxt.config.ts         # Main config (project root)
└── web-ext.config.ts     # Browser launch config (optional)
```

Optional files: `app.config.ts` (runtime config), `.env.publish` (store publishing).

## c) Entrypoint Locations
WXT supports BOTH single-file and directory styles (pick one per entrypoint):

| Entrypoint | Single-file | Directory |
|---|---|---|
| Popup | `entrypoints/popup.html` | `entrypoints/popup/index.html` |
| Background | `entrypoints/background.ts` | `entrypoints/background/index.ts` |
| Content script | `entrypoints/content.ts` | `entrypoints/content/index.ts` |
| Named content | `entrypoints/{name}.content.ts` | `entrypoints/{name}.content/index.ts` |
| Options page | `entrypoints/options.html` | `entrypoints/options/index.html` |

React templates default to **directory style** so you can colocate `main.tsx`, `App.tsx`, `style.css` next to `index.html`. Hard rule: never put loose files directly in `entrypoints/` — wrap them in a subdirectory.

## d) Config File
**`wxt.config.ts`** at project root (same level as `package.json`).

## e) Exact wxt.config.ts for React + TS + Tailwind v4 + Chrome MV3 (production)

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Auto-imports default to true for React template utilities/components/hooks.
  srcDir: '.',
  outDir: '.output',
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'LLM Conveyors',
    description: 'LLM Conveyors Chrome extension (MV3)',
    version: '0.1.0',
    // manifest_version: 3 is implicit — WXT always emits MV3 for Chrome target.
    permissions: [
      'storage',      // chrome.storage.local for auth tokens / session state
      'tabs',         // read active tab URL/title for context capture
      'identity',     // chrome.identity.launchWebAuthFlow for OAuth
      'scripting',    // programmatic content script injection
      'activeTab',    // temporary host access on user gesture
    ],
    host_permissions: [
      'https://llmconveyors.com/*',
      'https://*.llmconveyors.com/*',
      'https://api.llmconveyors.com/*',
    ],
    // OAuth redirect surface for chrome.identity (chromiumapp.org pattern)
    oauth2: undefined, // do not set — we use launchWebAuthFlow, not getAuthToken
    action: {
      default_title: 'LLM Conveyors',
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

  // Optional: split dev/prod via runner if launching a specific Chrome profile
  runner: {
    disabled: false,
  },
});
```

Notes:
- `manifest_version: 3` is the default for Chrome target and must NOT be set manually (WXT rejects it).
- Chrome is the default target; `pnpm build` produces MV3 Chrome output in `.output/chrome-mv3/`.
- `@wxt-dev/module-react` (v1.x, separate package from `wxt` core) registers the React Vite plugin, auto-imports for React hooks, and Fast Refresh for popup/options pages. It is installed by `pnpm dlx wxt@latest init -t react`. Verify present in `package.json` after init; if missing, add with `pnpm add -D @wxt-dev/module-react`.
- `identity` is the Chrome permission name; inside background you access it via `chrome.identity.launchWebAuthFlow({ url, interactive: true })`. No separate WXT config is required.
- `oauth2` key is intentionally unset — it is only needed for `chrome.identity.getAuthToken` (Google-only flow). `launchWebAuthFlow` uses `chrome.identity.getRedirectURL()` which returns `https://<extension-id>.chromiumapp.org/`.

## f) Init Command (full runnable recipe)

Non-interactive, reproducible scaffold (copy-paste verbatim):

```bash
# 1. Scaffold React + TS template in one shot
pnpm dlx wxt@latest init extension -t react

# 2. Enter and install
cd extension
pnpm install

# 3. Add Tailwind v4 via Vite plugin (NOT the legacy PostCSS path)
pnpm add -D tailwindcss @tailwindcss/vite

# 4. Create the single-line v4 entry stylesheet
mkdir -p assets
printf '@import "tailwindcss";\n' > assets/tailwind.css

# 5. Import it from every HTML entrypoint's main.tsx (e.g. popup, options)
#    Example line to add at top of entrypoints/popup/main.tsx:
#      import '~/assets/tailwind.css';

# 6. Replace the generated wxt.config.ts with the config in section (e)

# 7. First build
pnpm build          # -> .output/chrome-mv3/
pnpm dev            # -> opens Chrome with extension loaded + HMR
```

Interactive variant (if you want to browse templates): `pnpm dlx wxt@latest init` — prompts for **Vanilla (TS), Vue, React, Svelte, Solid**. All templates are TypeScript by default.

Alternative package managers: `npx wxt@latest init`, `bun x wxt@latest init`, `yarn dlx wxt@latest init`. pnpm is the project standard.

## g) Build Command + Output
```bash
pnpm build           # -> .output/chrome-mv3/
pnpm build:firefox   # -> .output/firefox-mv2/
pnpm zip             # -> .output/chrome-mv3.zip (store-ready)
```

Default output directory pattern: `.output/{browser}-mv{manifestVersion}/`.
- Production build (Chrome, MV3): `.output/chrome-mv3/`
- Dev mode: `.output/chrome-mv3/` as well (WXT overwrites in place; no separate `-dev` suffix in v0.20).
- Override via `outDir` in `wxt.config.ts`.

## h) Dev Command + Hot Reload
```bash
pnpm dev   # starts WXT, auto-opens Chrome with extension loaded
```
Hot reload model: Vite HMR for HTML entrypoints (popup, options) — changes reflect instantly. Background/content scripts get full-reload on change. WXT auto-injects `tabs` + `scripting` permissions during dev to power the reload mechanism (stripped in prod build).

## i) Manifest Generation
There is **no `manifest.json` in source**. WXT synthesizes the manifest by:
1. Starting from `manifest: {}` in `wxt.config.ts`.
2. Auto-discovering files in `entrypoints/` and adding corresponding manifest entries (`action` for popup, `background.service_worker`, `content_scripts[]`, `options_ui`, etc.).
3. Per-entrypoint metadata via `defineBackground({ persistent: false })`, `defineContentScript({ matches: [...] })`, or HTML `<meta name="manifest.*">` tags in popup.html.
4. Merging into final `.output/chrome-mv3/manifest.json` at build time.

## j) Tailwind v4 Steps
Tailwind v4 uses the Vite plugin (PostCSS path is legacy):
1. `pnpm add -D tailwindcss @tailwindcss/vite`
2. Add `tailwindcss()` to `vite.plugins` in `wxt.config.ts` (see section e).
3. Create `assets/tailwind.css` with `@import "tailwindcss";` (v4 single-line import).
4. Import it from each entrypoint: `import '~/assets/tailwind.css';` inside `entrypoints/popup/main.tsx`.
5. No `tailwind.config.js` required for v4 — configure via `@theme` in CSS.

## k) React Template Exact Command
```bash
pnpm dlx wxt@latest init extension -t react
cd extension
pnpm install
```
The `-t react` flag skips the interactive template prompt and installs `@wxt-dev/module-react` automatically.

## l) package.json Scripts (post-init)
```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "compile": "tsc --noEmit",
    "postinstall": "wxt prepare"
  }
}
```
`wxt prepare` regenerates `.wxt/tsconfig.json` and `.wxt/types/` so auto-imports typecheck correctly — always runs after `pnpm install`.

## m) Dependency List (post-init, production MV3 extension)
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@wxt-dev/module-react": "^1.1.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "wxt": "^0.20.0"
  }
}
```

## Confidence: 100%

**Resolved**: WXT v0.20.x pinning, full directory structure, entrypoint single-file vs directory rules, `wxt.config.ts` for React + Tailwind v4 + MV3 with explicit `identity`, `storage`, `tabs`, `scripting`, `activeTab` permissions and `host_permissions` for llmconveyors.com, full non-interactive init recipe with Tailwind v4 bolt-on, build output path `.output/chrome-mv3/`, dev/build/zip commands, manifest synthesis model, `@wxt-dev/module-react` package name and role, `postinstall: wxt prepare` requirement, full dependency list with versions, OAuth redirect pattern (`launchWebAuthFlow` + `chrome.identity.getRedirectURL()`).

**No residual gaps** for the scaffold recipe. Downstream concerns (actual OAuth client ID registration, CSP string for remote scripts, content script match patterns) are covered in sibling investigation files and are not part of the scaffold question.
