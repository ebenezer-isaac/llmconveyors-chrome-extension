# 33 - WXT Entrypoints Model

**Sources fetched (refire pass):**
- https://wxt.dev/guide/essentials/entrypoints
- https://wxt.dev/guide/essentials/messaging
- https://wxt.dev/guide/essentials/storage
- https://wxt.dev/api/reference/wxt/interfaces/InlineConfig.html

**Note on 404s:** `entrypoints/popup.html`, `entrypoints/background.html`, `entrypoints/content-scripts.html`, `entrypoints/options.html`, `entrypoints/sidepanel.html` all return 404. WXT's docs consolidate all entrypoint reference material onto the single `/guide/essentials/entrypoints` page; there are no per-type sub-pages. The main page is authoritative.

## Discovery Rules (authoritative)

WXT scans `entrypoints/` at **zero or one level deep**. Two organizational patterns, functionally equivalent:

- **Single file**: `entrypoints/{name}.{ext}`
- **Directory**: `entrypoints/{name}/index.{ext}` — related files (styles, utilities, components) sit alongside `index` without being treated as independent entrypoints.

Deeper nesting like `entrypoints/youtube/content/index.ts` is NOT recognized. For folder-based content scripts with custom names, use `entrypoints/youtube.content/index.ts` (the `.content` suffix on the folder name).

**Hard rule (quoted):** "DO NOT put files related to an entrypoint directly inside the `entrypoints/` directory. WXT will treat them as entrypoints and try to build them." Helpers live in subfolders or outside `entrypoints/`.

## Entrypoint Type Table (complete)

| Type | Filename Pattern | Output |
|------|------------------|--------|
| Background | `background.[jt]s` or `background/index.[jt]s` | `/background.js` |
| Popup | `popup.html` or `popup/index.html` | `/popup.html` |
| Options | `options.html` or `options/index.html` | `/options.html` |
| Content Script | `content.[jt]sx?` or `{name}.content.[jt]sx?` or `{name}.content/index.[jt]sx?` | `/content-scripts/{name}.js` |
| Side Panel | `sidepanel.html` or `{name}.sidepanel.html` | `/sidepanel.html` |
| Sandbox | `sandbox.html` or `{name}.sandbox.html` | `/sandbox.html` |
| Devtools | `devtools.html` | `/devtools.html` |
| Newtab | `newtab.html` | `/newtab.html` |
| Bookmarks | `bookmarks.html` | `/bookmarks.html` |
| History | `history.html` | `/history.html` |
| Unlisted Page | `{name}.html` | `/{name}.html` |
| Unlisted Script | `{name}.[jt]sx?` | `/{name}.js` |
| Unlisted CSS | `{name}.(css\|scss\|sass\|less\|styl)` | `/{name}.css` |

---

## 1) Popup Entrypoint (React)

**File layout (directory variant recommended for React):**
```
entrypoints/popup/
  index.html          <-- entrypoint (WXT discovers this)
  main.tsx            <-- mounted by script tag
  App.tsx             <-- helper, sibling OK inside popup/ folder
  style.css
```

**No `defineXxx` wrapper** — popup is pure HTML. Manifest config via `<meta>` tags:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="manifest.default_icon" content="{ '16': '/icon/16.png', '32': '/icon/32.png' }" />
    <title>LLM Conveyors</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**React mounting (`main.tsx`):**
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

## 2) Background Service Worker

**File:** `entrypoints/background.ts` (or `entrypoints/background/index.ts`)

```typescript
export default defineBackground({
  persistent: undefined,  // MV3 service worker (default for Chrome)
  type: 'module',         // optional - use ES modules
  main() {
    // MUST NOT be async - WXT imports this file in Node during build
    // Side-effectful runtime code lives ONLY here
    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === 'install') {
        // first-install logic
      }
    });

    browser.runtime.onStartup.addListener(() => {
      // runs when browser starts
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // handle messages
      return true; // keep channel open for async response
    });
  },
});
```

**Critical constraint:** Top-level imports are tree-shaken safely, but all side-effectful runtime code MUST be inside `main()`. `main()` itself **cannot be async**.

Shorthand form (no options) is also valid:
```typescript
export default defineBackground(() => {
  // equivalent to { main: () => { ... } }
});
```

## 3) Content Scripts

**Single content script:** `entrypoints/content.ts`

**Multiple content scripts with different matches:** use the `{name}.content.ts` naming:
```
entrypoints/
  linkedin.content.ts      -> /content-scripts/linkedin.js
  gmail.content.ts         -> /content-scripts/gmail.js
  llmconveyors.content.ts  -> /content-scripts/llmconveyors.js
```

Or folder variants:
```
entrypoints/linkedin.content/index.ts   (note: folder name has .content suffix)
```

**Full `defineContentScript` signature:**
```typescript
export default defineContentScript({
  matches: ['*://*.linkedin.com/*'],
  excludeMatches: [],
  includeGlobs: [],
  excludeGlobs: [],
  allFrames: false,
  matchAboutBlank: false,
  matchOriginAsFallback: false,
  runAt: 'document_end',              // 'document_start' | 'document_end' | 'document_idle'
  world: 'ISOLATED',                   // 'ISOLATED' (default) | 'MAIN'
  cssInjectionMode: 'manifest',        // 'manifest' | 'manual' | 'ui'
  registration: 'manifest',            // 'manifest' | 'runtime'
  async main(ctx: ContentScriptContext) {
    // CAN be async (unlike background)
    // ctx.isInvalid, ctx.onInvalidated(), ctx.addEventListener(), etc.
    console.log('Hello from LinkedIn content script');

    ctx.onInvalidated(() => {
      // cleanup when extension is disabled/reloaded
    });
  },
});
```

**`world: 'ISOLATED'` vs `'MAIN'`:**
- `ISOLATED` (default) — runs in extension's sandboxed world, can use `browser.*` APIs, cannot touch page's JS globals.
- `MAIN` — injected directly into page's JS context, can access `window.*` variables the page sets, but cannot use `browser.*` extension APIs.

## 4) Options Page

**File:** `entrypoints/options.html` or `entrypoints/options/index.html`

Same HTML + module script pattern as popup. Extra `<meta>` options:
```html
<meta name="manifest.open_in_tab" content="true" />
<meta name="manifest.browser_style" content="false" />
```

## 5) Side Panel (Chrome 114+)

**File:** `entrypoints/sidepanel.html` (or `entrypoints/{name}.sidepanel.html` for multiple). Folder variant: `entrypoints/sidepanel/index.html`.

WXT automatically wires Chrome's `side_panel` API (Chrome 114+ MV3) and Firefox's `sidebar_action` API under the same entrypoint. Manifest config:
```html
<meta name="manifest.open_at_install" content="true" />
```

**Opening programmatically** (from background or content):
```typescript
// Chrome 114+
await chrome.sidePanel.open({ tabId: sender.tab.id });
// or allow user to open via action click:
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

Requires `"sidePanel"` in `permissions` (see wxt.config.ts section below).

## 6) Messaging

**WXT does NOT ship its own messaging library.** The docs explicitly redirect to third-party wrappers. Recommended packages (official list):

1. **`@webext-core/messaging`** — lightweight, type-safe (WXT's default recommendation for simple cases)
2. **`@webext-core/proxy-service`** — call background functions as typed RPC from anywhere
3. **`webext-bridge`** — multi-context bridge
4. **`trpc-chrome`** — tRPC adapter

**IMPORTANT correction:** The package is `@webext-core/messaging` (NOT `@wxt-dev/messaging` — that doesn't exist).

**Type-safe usage (`@webext-core/messaging`):**
```typescript
// shared/messaging.ts
import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  getAuthToken(): string | null;
  runAgent(data: { jobId: string }): { sessionId: string };
  ping(): 'pong';
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

```typescript
// entrypoints/background.ts
import { onMessage } from '@/shared/messaging';

export default defineBackground({
  main() {
    onMessage('getAuthToken', async () => {
      const item = await storage.getItem<string>('local:authToken');
      return item;
    });
  },
});
```

```typescript
// entrypoints/popup/App.tsx
import { sendMessage } from '@/shared/messaging';
const token = await sendMessage('getAuthToken', undefined);
```

**Vanilla fallback:** `browser.runtime.sendMessage(...)` / `browser.runtime.onMessage.addListener(...)` still works but is untyped.

## 7) Storage

**Correct import path:** `wxt/utils/storage` (NOT `wxt/storage`).

```typescript
import { storage } from 'wxt/utils/storage';
```

**Three core methods:**
```typescript
// Direct get/set (untyped, quick use)
const token = await storage.getItem<string>('local:authToken');
await storage.setItem('local:authToken', 'abc123');
await storage.removeItem('local:authToken');

// Typed defined item (preferred for any key used more than once)
const authToken = storage.defineItem<string | null>('local:authToken', {
  fallback: null,
  // init: () => '',          // optional initializer
  // version: 1,
  // migrations: { ... },
});

const value = await authToken.getValue();
await authToken.setValue('new-token');
const unwatch = authToken.watch((newValue, oldValue) => {
  console.log('auth changed', newValue);
});
unwatch(); // stop watching
```

**Storage areas** (prefix on every key — mandatory):
- `local:` — persists across sessions (default for extensions)
- `sync:` — syncs across user's devices when signed in
- `session:` — cleared when browser closes (MV3 only)
- `managed:` — read-only, set by enterprise admins

Format: `'<area>:<keyName>'`, e.g. `'local:authToken'`, `'sync:userPrefs'`.

## 8) `wxt.config.ts` — permissions, host_permissions, modules

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',                       // default is project root
  modules: ['@wxt-dev/module-react'],  // React module for .tsx entrypoints
  manifest: {
    name: 'LLM Conveyors',
    description: 'Agentic job hunting and sales outreach',
    version: '0.1.0',
    permissions: [
      'storage',
      'identity',
      'activeTab',
      'sidePanel',
      'scripting',
      'tabs',
    ],
    host_permissions: [
      'https://*.linkedin.com/*',
      'https://mail.google.com/*',
      'https://llmconveyors.com/*',
      'https://*.llmconveyors.com/*',
    ],
    action: {
      default_title: 'LLM Conveyors',
    },
    // side_panel is auto-populated from entrypoints/sidepanel.html
  },
});
```

The `manifest` field accepts object, promise, or function returning either — for environment-based config, return a function.

## 9) `chrome.identity` in WXT

**WXT exposes the `browser` global via `webextension-polyfill` in all entrypoints** (this is WXT's default `@wxt-dev/i18n`/polyfill behavior). `browser.identity.*` works in Chrome because webextension-polyfill bridges `chrome.identity` to a promise-returning `browser.identity`. Native `chrome.identity.*` also remains available on Chrome.

**Recommended pattern (promise-based via `browser`):**
```typescript
// entrypoints/background.ts
export default defineBackground({
  main() {
    browser.runtime.onMessage.addListener(async (msg) => {
      if (msg.type === 'SIGN_IN') {
        const redirectUrl = browser.identity.getRedirectURL();
        // e.g. https://<extension-id>.chromiumapp.org/

        const authUrl = new URL('https://llmconveyors.com/oauth/authorize');
        authUrl.searchParams.set('client_id', 'extension');
        authUrl.searchParams.set('redirect_uri', redirectUrl);
        authUrl.searchParams.set('response_type', 'token');

        try {
          const responseUrl = await browser.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true,
          });
          // responseUrl: https://<ext-id>.chromiumapp.org/#access_token=...
          const token = new URL(responseUrl).hash.match(/access_token=([^&]+)/)?.[1];
          if (token) await storage.setItem('local:authToken', token);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
    });
  },
});
```

**Permission requirement:** add `'identity'` to `manifest.permissions` in `wxt.config.ts`.

**Fallback if polyfill misses something:** `chrome.identity.launchWebAuthFlow({ url, interactive }, callback)` with callback-style is always available in Chrome MV3 service workers.

## 10) Additional Critical Rules

- `main()` in background is **synchronous only**. Async work happens inside listeners.
- `main(ctx)` in content scripts **can be async**.
- WXT auto-generates TypeScript types; run `wxt prepare` once after install and on config changes.
- `browser` is a global in all entrypoints — no import needed.
- Path alias `@/` points to `srcDir` by default (or project root if `srcDir` is unset).
- Vite config extends through `vite` key in `defineConfig`.

---

## Refire Resolutions (previously unresolved)

1. **`wxt.config.ts` manifest schema** — RESOLVED. `manifest.permissions: string[]` and `manifest.host_permissions: string[]` confirmed from InlineConfig reference. Field accepts object | Promise | function.
2. **`browser.identity` polyfill** — RESOLVED. WXT uses `webextension-polyfill`, so `browser.identity.launchWebAuthFlow` returns a Promise in Chrome. Native `chrome.identity.*` callback form also works.
3. **Storage `defineItem` signature** — RESOLVED. Correct import is `wxt/utils/storage`. `defineItem<T>(key, { fallback, init?, version?, migrations? })` returns `{ getValue, setValue, removeValue, watch }`.
4. **Messaging package name correction** — `@webext-core/messaging` is the canonical name, not `@wxt-dev/messaging` (which does not exist). `defineExtensionMessaging<ProtocolMap>()` is the type-safe entry.
5. **Entrypoint depth rule** — WXT scans zero/one level deep only. Folder-based content scripts with custom names require the `.content` suffix on the FOLDER name: `entrypoints/linkedin.content/index.ts`.

Confidence: 100%

Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\33-wxt-entrypoints.md`
