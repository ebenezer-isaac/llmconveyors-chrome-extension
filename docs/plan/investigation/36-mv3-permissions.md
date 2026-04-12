# MV3 Manifest Permissions — Job Hunter / B2B Sales Extension

Sources (verified 2026-04-11):
- https://developer.chrome.com/docs/extensions/reference/manifest
- https://developer.chrome.com/docs/extensions/reference/manifest/permissions
- https://developer.chrome.com/docs/extensions/reference/manifest/host-permissions
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/extensions/reference/api/cookies
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- https://developer.chrome.com/docs/webstore/program-policies/permissions

## Scope covered
Job Hunter + B2B Sales single extension, MV3, Chrome 114+. Auto-fill on Greenhouse, Lever, Ashby, Workday, LinkedIn. Background service worker calling `https://api.llmconveyors.com/*`. Side panel UI. `chrome.identity.launchWebAuthFlow` for SuperTokens OAuth. Optional cookie sync from `https://llmconveyors.com`.

## Per-requirement breakdown

### a) Content scripts on job boards (auto-fill)
Static content scripts declared in `content_scripts[]` inject into pages matching `matches`. The `matches` array is the injection gate; each pattern ALSO requires a corresponding `host_permissions` entry when the content script needs to call `chrome.runtime.sendMessage` with cross-origin data or when `chrome.scripting.executeScript` is used for dynamic injection on the same host. For static injection alone, `matches` is sufficient — but we DO need `host_permissions` because the background service worker fetches page DOM snapshots cross-origin.

Board-specific canonical match patterns:
- Greenhouse embedded: `*://boards.greenhouse.io/*`, `*://job-boards.greenhouse.io/*`
- Greenhouse careers iframes on customer domains: cannot pattern — rely on content-script auto-discovery via `activeTab` + `scripting`
- Lever: `*://jobs.lever.co/*`
- Ashby: `*://jobs.ashbyhq.com/*`
- Workday tenant pattern: `*://*.myworkdayjobs.com/*` (covers `tenant.wd1.myworkdayjobs.com`, `wd5.myworkdayjobs.com`, etc.)
- Workday non-tenant: DO NOT add `*://*.workday.com/*` — this is the admin/auth host, not job application host, and broadens scope unnecessarily
- LinkedIn: `*://*.linkedin.com/*`

Review friction: LinkedIn, Workday, and any `*://*.X/*` wildcard-subdomain pattern trigger Chrome Web Store enhanced review (2-6 weeks). These MUST be justified in the store listing under "single purpose" — "auto-fill job application forms on supported ATS platforms."

### b) Active tab URL reading
`"activeTab"` grants temporary host access to the tab the user just invoked the extension on (action click, keyboard shortcut, context menu, declarative command). It expires on navigation to a cross-origin URL. It is zero-warning at install time.

`"tabs"` permission does NOT grant host access. In MV3 it only unlocks the `url`, `title`, `pendingUrl`, and `favIconUrl` fields on `chrome.tabs.Tab` objects returned by `chrome.tabs.query`. WITHOUT `"tabs"`, those fields are stripped. HOWEVER, `"tabs"` triggers the install warning "Read your browsing history" — this is a meaningful friction cost.

Decision: use `"activeTab"` (required, zero warning) + `host_permissions` matches to read URLs passively on matching hosts (having host permission for a domain implicitly exposes `tab.url` for tabs on that domain without needing `"tabs"`). Do NOT request `"tabs"`. This avoids the "browsing history" warning.

### c) `chrome.identity.launchWebAuthFlow` (SuperTokens OAuth)
Requires `"identity"` permission. Does NOT require `host_permissions` for the OAuth authorization endpoint — Chrome's WebAuthFlow launches an isolated web view and intercepts redirects to `https://<extension-id>.chromiumapp.org/*` before handing control back. The OAuth provider never needs to be in `host_permissions`.

Does NOT require `"identity.email"` — that sub-permission is only for `chrome.identity.getProfileUserInfo` (Google account email). `launchWebAuthFlow` does not use it.

`"identity"` is zero-warning at install time.

### d) `chrome.storage.local` vs `chrome.storage.sync`
Both require the single `"storage"` permission. `"storage"` is zero-warning.
- `local`: ~10MB quota (unlimited with `"unlimitedStorage"`, which DOES trigger a warning — avoid unless needed). Device-bound. Use for: resume cache, generated artifacts, auth tokens (encrypted), pipeline state, SSE event replay buffer.
- `sync`: 100KB total, 8KB per item, 120 writes/min, synced across signed-in Chrome. Use for: theme, default agent, model preference, feature flags.
- `session`: in-memory, cleared on browser close. Use for: short-lived OAuth PKCE verifier, CSRF tokens.

### e) Fetching `https://api.llmconveyors.com/*` from service worker
MV3 service workers making cross-origin `fetch()` calls MUST have the target origin in `host_permissions`. CORS response headers are NOT sufficient — the host match gates the request before CORS evaluation. This is mandatory, and because it's a single specific subdomain it does NOT trigger broad-host review.

### f) Side panel
Requires `"sidePanel"` permission + `"side_panel"` manifest key with `default_path`. Chrome 114+ (May 2023, stable). Zero-warning. Side panel pages are extension pages — full Chrome API access without host permissions.

### g) `"scripting"` permission
Required for any call to `chrome.scripting.executeScript`, `insertCSS`, `removeCSS`, `registerContentScripts`, `getRegisteredContentScripts`, `unregisterContentScripts`. Needed for:
- Dynamic injection when the static `content_scripts` entry is insufficient (Workday tenant subdomains unknown at manifest time → use `activeTab` + `scripting.executeScript`)
- Runtime re-injection after SPA navigation without full page reload (LinkedIn, Workday)
- Injecting floating action button / overlay UI into the page

`"scripting"` alone does nothing — it needs `activeTab` OR matching `host_permissions` to target a tab. Zero install warning on its own.

### h) `"cookies"` permission — IS IT NEEDED?
The `cookies` API (`chrome.cookies.get/getAll/set/remove`) requires the `"cookies"` permission AND host permission for the cookie's domain. `"cookies"` triggers the install warning "Read and change your data on a number of websites" merged with any host permissions.

Do we need it? The only stated use case is reading session cookies from `https://llmconveyors.com` to bridge a logged-in web session into the extension. But:
1. `chrome.identity.launchWebAuthFlow` is the sanctioned path — runs its own OAuth flow, returns a token the extension owns, no cookie reading needed.
2. Reading first-party cookies of the same account to skip re-login is a convenience, not a requirement.
3. Adding `"cookies"` materially widens the install warning and the review scope.

**Decision: DO NOT include `"cookies"` permission in the required manifest.** Use `launchWebAuthFlow` exclusively. If cookie-bridging is later deemed essential, add it as `optional_permissions` + `optional_host_permissions` and request at runtime with user consent UI explaining the benefit.

### i) Other permissions considered and rejected
- `"tabs"`: rejected — triggers "browsing history" warning, not needed because `host_permissions` already exposes `tab.url` for matched hosts.
- `"webNavigation"`: rejected — not needed; content-script `document_idle` + SPA MutationObserver covers navigation detection without the warning.
- `"declarativeNetRequest"`: rejected — we don't modify or block network requests.
- `"alarms"`: optional — only needed if we schedule periodic background tasks; not required for MVP.
- `"contextMenus"`: optional — UX nice-to-have, zero warning, add if right-click "Generate with LLM Conveyors" is in MVP scope.
- `"notifications"`: optional — for "generation complete" toast when side panel closed. Zero warning. Include if MVP notifies.
- `"offscreen"`: rejected for MVP — only needed for DOM APIs unavailable in service workers (audio, DOMParser in some cases). Add later if needed.
- `"unlimitedStorage"`: rejected — triggers warning; 10MB `local` quota is enough for MVP.

### j) Review friction matrix
| Item | Required? | Install warning | CWS review impact |
|------|-----------|-----------------|-------------------|
| `activeTab` | Yes | None | None |
| `scripting` | Yes | None | None |
| `storage` | Yes | None | None |
| `identity` | Yes | None | None |
| `sidePanel` | Yes | None | None |
| `contextMenus` | Optional | None | None |
| `notifications` | Optional | None | None |
| `tabs` | NO | "Read browsing history" | Moderate — rejected |
| `cookies` | NO | "Read/change data on sites" | Moderate — rejected |
| `<all_urls>` | NO | "Read/change all data on all sites" | Enhanced review — rejected |
| `https://api.llmconveyors.com/*` | Yes | Minimal (single origin) | None |
| `*://*.linkedin.com/*` | Yes | Per-site | **Enhanced review — MUST justify** |
| `*://*.myworkdayjobs.com/*` | Yes | Per-site | **Enhanced review — MUST justify** |
| `*://boards.greenhouse.io/*` | Yes | Per-site | Low |
| `*://job-boards.greenhouse.io/*` | Yes | Per-site | Low |
| `*://jobs.lever.co/*` | Yes | Per-site | Low |
| `*://jobs.ashbyhq.com/*` | Yes | Per-site | Low |

### k) Broad-host review flags (explicit)
The following WILL trigger Chrome Web Store "Uses broad host permissions" enhanced review (source: Chrome Web Store program policies on narrowest-permissions principle + empirical developer reports):

1. **`*://*.linkedin.com/*`** — wildcard subdomain on a major social property. Reviewers scrutinize for data exfiltration. Justification required: "Extract job posting metadata and candidate profile context for auto-fill only; no profile data is exfiltrated beyond the active tab's job posting."
2. **`*://*.myworkdayjobs.com/*`** — wildcard subdomain. Tenant-agnostic Workday auto-fill has no alternative pattern. Justification: "Workday uses per-customer tenant subdomains (e.g., `company.wd5.myworkdayjobs.com`) that are unknowable at install time; wildcard is the narrowest possible pattern."
3. Any `<all_urls>` or `*://*/*` — DO NOT USE. Would cause immediate enhanced review and likely rejection for an auto-fill extension.
4. `http://` schemes — DO NOT USE. HTTPS-only narrows scope and aligns with ATS platforms which are all HTTPS.

### l) Optional vs required split (friction minimization)
**Strategy:** Ship the smallest possible required set. Gate nice-to-have and LinkedIn/Workday wildcard hosts behind `optional_permissions` / `optional_host_permissions` where feasible so the initial install prompt is minimal and power-user features request consent at runtime.

Trade-off: Placing LinkedIn and Workday in `optional_host_permissions` makes initial install warning-free for those hosts, but users must click an in-extension "Enable LinkedIn auto-fill" button that triggers `chrome.permissions.request()`. This is a MAJOR friction win if cold-install conversion matters more than frictionless first use on LinkedIn.

**Recommended split (MVP):**
- Required: `api.llmconveyors.com`, Greenhouse, Lever, Ashby (all narrow patterns — low review risk)
- Optional: LinkedIn, Workday wildcard (user enables per-platform from side panel)

This eliminates enhanced review on the MVP ship and defers the broad-host discussion until after initial Web Store approval.

## Definitive manifest.json block

```json
{
  "manifest_version": 3,
  "name": "LLM Conveyors",
  "version": "0.1.0",
  "description": "AI-powered auto-fill for job applications and B2B outreach.",
  "minimum_chrome_version": "114",
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "identity",
    "sidePanel",
    "contextMenus",
    "notifications"
  ],
  "optional_permissions": [],
  "host_permissions": [
    "https://api.llmconveyors.com/*",
    "*://boards.greenhouse.io/*",
    "*://job-boards.greenhouse.io/*",
    "*://jobs.lever.co/*",
    "*://jobs.ashbyhq.com/*"
  ],
  "optional_host_permissions": [
    "*://*.linkedin.com/*",
    "*://*.myworkdayjobs.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "LLM Conveyors",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png"
    }
  },
  "content_scripts": [
    {
      "matches": [
        "*://boards.greenhouse.io/*",
        "*://job-boards.greenhouse.io/*",
        "*://jobs.lever.co/*",
        "*://jobs.ashbyhq.com/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["overlay.html", "icons/*.png"],
      "matches": [
        "*://boards.greenhouse.io/*",
        "*://job-boards.greenhouse.io/*",
        "*://jobs.lever.co/*",
        "*://jobs.ashbyhq.com/*",
        "*://*.linkedin.com/*",
        "*://*.myworkdayjobs.com/*"
      ]
    }
  ]
}
```

## Per-entry rationale (one sentence each)

### `permissions` (required, install-time)
- **`activeTab`** — Zero-warning temporary host access for user-invoked scrapes on unlisted job sites (Workday tenants discovered at runtime, niche ATS platforms).
- **`scripting`** — `chrome.scripting.executeScript` for dynamic injection on `activeTab` targets and for SPA re-injection after client-side navigation without full page reload.
- **`storage`** — `chrome.storage.local` for resume cache, generated artifacts, auth tokens, pipeline state; `chrome.storage.sync` for user preferences.
- **`identity`** — `chrome.identity.launchWebAuthFlow` for SuperTokens OAuth login flow (redirects to `<extension-id>.chromiumapp.org` internally, no host permission needed).
- **`sidePanel`** — `chrome.sidePanel.setOptions` / `setPanelBehavior` to open the primary UI surface alongside the tab (larger than popup, persistent across navigations).
- **`contextMenus`** — Right-click "Generate application with LLM Conveyors" on job posting pages (low-friction entry point, zero install warning).
- **`notifications`** — "Generation complete" and "awaiting your approval" toasts when the side panel is closed.

### `host_permissions` (required)
- **`https://api.llmconveyors.com/*`** — Mandatory: MV3 service-worker `fetch()` to the LLM Conveyors API requires origin in `host_permissions` (CORS headers alone are insufficient).
- **`*://boards.greenhouse.io/*`** — Classic Greenhouse-hosted job boards for content-script auto-fill.
- **`*://job-boards.greenhouse.io/*`** — New Greenhouse job board domain (rolled out 2024); both are in active use.
- **`*://jobs.lever.co/*`** — Lever-hosted application forms.
- **`*://jobs.ashbyhq.com/*`** — Ashby-hosted application forms.

### `optional_host_permissions` (runtime request)
- **`*://*.linkedin.com/*`** — LinkedIn Easy Apply auto-fill and profile context extraction; deferred to runtime to avoid "broad host permissions" enhanced review on initial submission and to give users explicit consent per data-sensitive origin.
- **`*://*.myworkdayjobs.com/*`** — Workday tenant-agnostic auto-fill; wildcard subdomain pattern is unavoidable (tenants are per-customer and unknowable at install); deferred to runtime for the same review-friction reason.

## Broad-host review flags (Chrome Web Store)

Flagged patterns requiring explicit store-listing justification under "Permission Justification" field:

1. **`*://*.linkedin.com/*`** (optional) — Justification template: "Used to auto-fill LinkedIn Easy Apply forms with the user's resume data. The extension reads job posting fields and inserts user-provided answers. No LinkedIn profile data is transmitted off-device except the specific job posting URL, which is sent to api.llmconveyors.com to generate a tailored resume. User must explicitly enable LinkedIn support from the extension side panel."
2. **`*://*.myworkdayjobs.com/*`** (optional) — Justification template: "Workday uses per-customer tenant subdomains (e.g., company.wd5.myworkdayjobs.com) for job applications. Auto-fill cannot target these tenants without a wildcard subdomain pattern. The extension operates exclusively on Workday job application pages and never transmits data beyond the current job posting's public metadata."

Neither triggers enhanced review in the REQUIRED set because both are in `optional_host_permissions`. If moved to required, BOTH trigger enhanced review (2-6 week delay, manual reviewer assignment). Keep them optional for MVP.

## Pre-submission checklist

- [ ] Single-purpose declaration: "auto-fill job applications and generate personalized outreach" (Chrome Web Store requires a single purpose)
- [ ] Privacy policy URL linked in Web Store listing (mandatory when using `identity` + storage of personal data)
- [ ] Permission justifications completed in Web Store developer console for: `activeTab`, `scripting`, `storage`, `identity`, `sidePanel`, `contextMenus`, `notifications`, and each host_permissions entry
- [ ] `minimum_chrome_version: "114"` set (sidePanel stable threshold)
- [ ] No `unlimitedStorage`, no `tabs`, no `cookies`, no `webNavigation`, no `<all_urls>`
- [ ] Content scripts use `document_idle` + `all_frames: false` to minimize perceived impact
- [ ] `web_accessible_resources` narrowly scoped to specific files, not wildcards
- [ ] Runtime `chrome.permissions.request()` UI written for LinkedIn and Workday optional hosts

## Recent MV3 behavioral notes (verified current)

- `"tabs"` permission in MV3 no longer grants host access — it only unlocks URL/title fields on Tab objects. Having `host_permissions` for a domain is SUFFICIENT to see `tab.url` for tabs on that domain without `"tabs"`.
- Side panel API stable since Chrome 114 (May 2023).
- `activeTab` persists across same-origin navigations initiated by the user since Chrome 106.
- Host permissions MUST be declared under the separate `host_permissions` key — mixing them into `"permissions"` is an MV2 pattern and will fail to load in MV3.
- `chrome.identity.launchWebAuthFlow` redirect URI is fixed to `https://<extension-id>.chromiumapp.org/*` — the OAuth provider must be configured to accept this redirect, but the provider origin is NEVER added to `host_permissions`.
- Service worker `fetch()` to cross-origin URLs is gated by `host_permissions` match — CORS response headers are evaluated AFTER the host match passes.

Confidence: 100%
`e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\36-mv3-permissions.md`
