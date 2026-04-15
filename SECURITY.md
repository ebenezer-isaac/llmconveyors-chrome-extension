<!-- SPDX-License-Identifier: MIT -->
# Security Notes - LLM Conveyors Chrome Extension

## Reporting
Responsible disclosure: `ebnezr.isaac@gmail.com`. Please do not open public
issues for suspected vulnerabilities.

## Token storage model
- Session JWT + refresh token live only in `chrome.storage.local`, which is
  scoped to the extension and unreadable from web content-script context.
- Content scripts never import the session store; they communicate with the
  background service worker via `runtime.sendMessage`.
- Refresh flow uses a single-flight mutex and wipes storage on rejection.

## launchWebAuthFlow redirect lock-down
- `CHROMIUMAPP_REDIRECT_REGEX = /^https:\/\/[a-p]{32}\.chromiumapp\.org(\/[^\s?#]*)?$/`
- Enforces the Chrome `getRedirectURL()` shape exactly. Uppercase, Unicode
  homoglyphs, extra query/fragment, and alternate TLDs are refused.

## Manifest posture
- `permissions`: `activeTab`, `storage`, `identity`, `scripting`,
  `sidePanel`, `notifications`. Each justified by user-visible feature.
- `host_permissions`: Greenhouse, Lever, Workday, the production API, the
  production website. `http://localhost:5174/*` is added only when
  `NODE_ENV !== 'production'` so dev leaks cannot ship.
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; base-uri 'self'`.
  No `unsafe-eval`, no `unsafe-inline`, no remote script sources.

## API calls
- All fetch calls go over HTTPS to `api.llmconveyors.com` using
  `Authorization: Bearer <accessToken>`. No cookies, no `credentials:include`.
- CORS allow-list on the API is explicit; the extension origin
  (`chrome-extension://<id>`) is never added to the CORS origin list, and
  the extension therefore cannot trigger browser-enforced credential sharing.

## Known non-issues
- Content scripts run in the page's isolated world and have no access to
  the token store. `runtime.sendMessage` is filtered by schema on the
  background side (Zod validation on every message).

## Remaining items
- Chrome Web Store review (permissions rationale documented in README).
- Public bug bounty (not yet posted).
