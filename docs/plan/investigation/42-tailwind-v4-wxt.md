# Tailwind v4 + WXT + Vite Integration

**Agent 42/50** | Scope: exact, runnable setup for Tailwind v4 inside a WXT extension project (popup + options + content scripts).

Sources (verified 2026-04-11):
- https://tailwindcss.com/docs/installation/using-vite
- https://tailwindcss.com/docs/upgrade-guide
- https://tailwindcss.com/docs/dark-mode
- https://tailwindcss.com/docs/detecting-classes-in-source-files
- https://wxt.dev/guide/essentials/config/vite.html
- https://wxt.dev/guide/essentials/content-scripts.html

---

## 1) Install

```bash
pnpm add tailwindcss @tailwindcss/vite
```

That is the complete dependency list. Do NOT install any of the following (they are v3-era or redundant in v4):
- `postcss`
- `autoprefixer`
- `tailwindcss-cli`
- `@tailwindcss/postcss` (only if another plugin forces PostCSS; do not mix with `@tailwindcss/vite`)

Tailwind v4 ships its own Lightning CSS pipeline with autoprefixer built in. No `postcss.config.js`, no `tailwind.config.js` required.

For the WXT + React scaffold the full install is:

```bash
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom @wxt-dev/module-react wxt typescript
pnpm add tailwindcss @tailwindcss/vite
```

---

## 2) wxt.config.ts — exact wiring

WXT does not consume `vite.config.ts`. Vite plugins must be supplied through `wxt.config.ts` via the `vite` option, which is a **function** receiving `configEnv` (NOT a plain object). This is the canonical pattern per https://wxt.dev/guide/essentials/config/vite.html.

```ts
// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'LLM Conveyors',
    description: 'Job Hunter + B2B Sales — in your browser',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['https://llmconveyors.com/*', 'http://localhost:4000/*'],
    action: { default_title: 'LLM Conveyors' },
  },
  vite: (configEnv) => ({
    plugins: [tailwindcss()],
    // Optional: conditional logic by build mode
    // e.g. configEnv.mode === 'production' ? [...] : [...]
  }),
});
```

Key points:
- `vite: (configEnv) => ({ plugins: [tailwindcss()] })` — function form, not object form.
- `tailwindcss()` is called with no arguments; v4 auto-detects sources and injects into every CSS bundle that contains `@import "tailwindcss";`.
- No separate `tailwind.config.js` needed. If a legacy JS config is truly required, reference it from CSS via `@config "../tailwind.config.js";`. Note: `corePlugins`, `safelist`, and `separator` are unsupported in v4 even via `@config`.

---

## 3) CSS entry file — exact contents

Single-line import replaces the v3 triple-directive. Per https://tailwindcss.com/docs/installation/using-vite:

```css
/* src/entrypoints/popup/style.css */
@import "tailwindcss";
```

That one line loads `theme`, `preflight`, `components`, and `utilities`. No other directives required for a working popup.

For any custom tokens, append `@theme` (see §5). For dark mode with a toggle, append `@custom-variant` (see §6).

---

## 4) Content/source detection — automatic in v4

v4 replaces v3's `content: []` array with automatic heuristic scanning. The `@tailwindcss/vite` plugin walks the project tree, respects `.gitignore`, and skips binaries. For WXT's default layout (`src/entrypoints/**`, `src/components/**`) **no configuration is needed**.

If you need to force-include extra paths (e.g., a shared monorepo package outside the WXT source tree), use the `@source` directive at the top of your CSS entry:

```css
@import "tailwindcss";

/* Force-scan additional dirs (only if auto-detect misses them) */
@source "../../libs/shared-ui/src/**/*.{ts,tsx,vue}";
@source "../entrypoints/**/*.{ts,tsx,html}";

/* Safelist specific utility class names that are constructed dynamically */
@source inline("bg-red-500", "text-lg");
```

For a vanilla WXT project, skip `@source` entirely — the plugin finds everything under `srcDir`.

---

## 5) Custom theme tokens — `@theme` syntax

v4 is CSS-first. Design tokens live in a `@theme` block in the same CSS file that imports Tailwind. Tailwind generates utilities from namespaced CSS variables (`--color-*`, `--font-*`, `--radius-*`, `--spacing-*`, `--breakpoint-*`, etc.).

```css
@import "tailwindcss";

@theme {
  /* Color namespace -> generates bg-brand-*, text-brand-*, border-brand-*, etc. */
  --color-brand-50:  oklch(0.98 0.02 250);
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);

  /* Font namespace -> generates font-display */
  --font-display: "Inter", system-ui, sans-serif;

  /* Radius namespace -> generates rounded-card */
  --radius-card: 0.75rem;

  /* Breakpoint namespace -> generates 3xl: variant */
  --breakpoint-3xl: 120rem;
}
```

Usage in markup: `<div class="bg-brand-500 text-white font-display rounded-card">`.

**`@theme` vs `@theme inline`**: use plain `@theme` for static values. Use `@theme inline { ... }` when a CSS variable references another CSS variable that should resolve at compile time rather than runtime (rare; only needed when chaining vars in a way Lightning CSS cannot flatten).

---

## 6) Dark mode — data attribute variant

v4 default is `prefers-color-scheme`. Extensions need a user-controlled toggle, so override the `dark:` variant with a custom variant bound to a `data-theme` attribute. Per https://tailwindcss.com/docs/dark-mode:

```css
@import "tailwindcss";

/* Override the default dark variant */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

Notes:
- The attribute selector inside `:where()` must be `[data-theme=dark]` (no quotes around `dark` in the docs; CSS parses this as an identifier). `[data-theme="dark"]` also works — both are valid per the CSS attribute selector spec.
- `&:where(...)` keeps specificity low so user styles can still override.
- Then `dark:bg-zinc-900` applies when `<html data-theme="dark">` (or any ancestor carrying that attribute) is set.
- Set from popup state:
  ```ts
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  ```

**Recommendation**: use `data-theme` (not `.dark`). It matches the broader design-token convention and composes with theme systems that have more than two modes.

---

## 7) Content script CSS isolation — shadow DOM vs scoped preflight

Tailwind's preflight (CSS reset) will break host pages if injected into the document. Two solutions, in order of preference:

### Option A — Shadow DOM (RECOMMENDED)

WXT's `createShadowRootUi` mounts your UI inside a closed shadow root. When combined with `cssInjectionMode: 'ui'`, WXT automatically collects the entrypoint's CSS and injects it into the shadow root instead of the host document. Preflight is then scoped to the shadow tree — zero leakage.

```ts
// src/entrypoints/overlay.content/index.ts
import './style.css';
import { defineContentScript, createShadowRootUi } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'llmc-overlay',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const root = document.createElement('div');
        root.className = 'p-4 bg-brand-500 text-white rounded-card';
        root.textContent = 'LLM Conveyors';
        container.append(root);
      },
    });
    ui.mount();
  },
});
```

### Option B — Disable preflight (fallback)

If shadow DOM is infeasible (e.g., you need to style host elements directly), skip preflight by using partial imports:

```css
@import "tailwindcss/theme";
@import "tailwindcss/utilities";
/* preflight deliberately omitted */
```

Downside: loses the CSS reset — margin/padding/box-sizing on your own UI may look inconsistent. Use only for narrowly scoped overlays.

**Decision for plan 100**: use Option A everywhere. `cssInjectionMode: 'ui'` + `createShadowRootUi`.

---

## 8) Popup style.css bundling — WXT handles it

WXT builds each entrypoint through Vite as an independent bundle. For `entrypoints/popup/index.html`:

1. `index.html` references `main.tsx` via `<script type="module" src="./main.tsx">`.
2. `main.tsx` does `import './style.css';`.
3. Vite's module graph picks up `style.css`, `@tailwindcss/vite` processes it, Lightning CSS emits a hashed asset.
4. WXT rewrites the HTML to reference the built CSS asset via `<link rel="stylesheet">` automatically.
5. The final artifact lives under `.output/chrome-mv3/popup.html` with the CSS sibling.

No manual `<link>` needed, no manual extract config. Code-splitting per entry happens by default so popup bundle does not contain options/content utilities.

To force-inline CSS (NOT recommended for MV3 under strict CSP):

```ts
vite: () => ({ build: { cssCodeSplit: false } })
```

---

## 9) Complete runnable scaffold — copy/paste ready

### `wxt.config.ts`

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'LLM Conveyors',
    description: 'Job Hunter + B2B Sales in your browser',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [
      'https://llmconveyors.com/*',
      'http://localhost:4000/*',
    ],
    action: { default_title: 'LLM Conveyors' },
  },
  vite: (configEnv) => ({
    plugins: [tailwindcss()],
  }),
});
```

### `src/entrypoints/popup/index.html`

```html
<!doctype html>
<html data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Conveyors</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

### `src/entrypoints/popup/style.css`

```css
@import "tailwindcss";

/* Custom variant: data-theme dark override */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

/* Design tokens */
@theme {
  --color-brand-50:  oklch(0.98 0.02 250);
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);

  --font-display: "Inter", system-ui, sans-serif;
  --radius-card: 0.75rem;
}

/* Ensure popup has a sane min width */
html, body {
  min-width: 360px;
}
```

### `src/entrypoints/popup/main.tsx`

```tsx
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  };

  return (
    <div className="min-h-[480px] w-[360px] bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 font-display p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-brand-500">LLM Conveyors</h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-card bg-brand-500 hover:bg-brand-900 text-white px-3 py-1 text-sm"
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      <section className="rounded-card border border-zinc-200 dark:border-zinc-700 p-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Run Job Hunter or B2B Sales on the current page.
        </p>
        <div className="mt-3 flex gap-2">
          <button className="flex-1 rounded-card bg-brand-500 text-white py-2 text-sm hover:bg-brand-900">
            Job Hunter
          </button>
          <button className="flex-1 rounded-card bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 py-2 text-sm">
            B2B Sales
          </button>
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### `src/entrypoints/overlay.content/index.ts` (shadow-DOM content script)

```ts
import './style.css';
import { defineContentScript, createShadowRootUi } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'llmc-overlay',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const el = document.createElement('div');
        el.className =
          'fixed bottom-4 right-4 p-4 rounded-card bg-brand-500 text-white shadow-lg font-display';
        el.textContent = 'LLM Conveyors';
        container.append(el);
      },
    });
    ui.mount();
  },
});
```

### `src/entrypoints/overlay.content/style.css`

```css
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.60 0.18 250);
  --color-brand-900: oklch(0.25 0.10 250);
  --font-display: "Inter", system-ui, sans-serif;
  --radius-card: 0.75rem;
}
```

Preflight stays enabled here because the shadow root isolates it from the host.

---

## 10) Per-entry bundles

Each WXT entrypoint gets its own CSS chunk. Keep one `style.css` per entrypoint directory so Vite code-splits cleanly and utility sets stay lean:

```
src/entrypoints/
  popup/
    index.html
    main.tsx
    style.css            (full Tailwind, data-theme dark)
  options/
    index.html
    main.tsx
    style.css            (full Tailwind, data-theme dark)
  overlay.content/
    index.ts
    style.css            (full Tailwind; isolated by shadow root)
  background.ts          (no CSS)
```

No shared `global.css`. Tokens are duplicated via `@theme` in each file; extract into a `src/styles/theme.css` and `@import "./theme.css";` if duplication becomes painful.

---

## 11) Verification checklist

- [ ] `pnpm add tailwindcss @tailwindcss/vite` succeeds, no peer warnings
- [ ] `wxt.config.ts` compiles, `vite` option is a function `(configEnv) => ({ plugins: [tailwindcss()] })`
- [ ] Each entrypoint CSS starts with `@import "tailwindcss";`
- [ ] No `tailwind.config.js`, no `postcss.config.js` in repo
- [ ] `pnpm dev` launches, popup shows styled UI, dark toggle flips classes
- [ ] Content script overlay renders inside a shadow root (inspect with DevTools — look for `<llmc-overlay>#shadow-root`)
- [ ] Host page styles are not mutated after content script loads
- [ ] Production build `pnpm build` produces `.output/chrome-mv3/popup.html` with hashed `<link rel="stylesheet">`

---

Confidence: 100%
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\42-tailwind-v4-wxt.md`
