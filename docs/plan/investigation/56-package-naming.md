# 56 — Package Naming Investigation

**Agent**: 56 of 60+
**Scope**: npm + GitHub availability for autofill core library under `ebenezer-isaac` namespace
**Date**: 2026-04-11

## Availability Matrix

### npm (registry.npmjs.org probe, 404 = available)

| Package | Status | Evidence |
|---|---|---|
| `@ebenezer-isaac/autofill-core` | AVAILABLE | 404 |
| `@ebenezer-isaac/form-autofill` | AVAILABLE | 404 |
| `@ebenezer-isaac/job-autofill` | AVAILABLE | 404 |
| `@ebenezer-isaac/ats-autofill` | AVAILABLE | 404 |
| `@ebenezer-isaac/autofill-engine` | AVAILABLE | 404 |
| `autofill-core` (unscoped) | AVAILABLE | 404 |
| `form-autofill-core` (unscoped) | AVAILABLE | 404 |
| `job-autofill-core` (unscoped) | AVAILABLE | 404 |
| `ats-autofill-core` (unscoped) | AVAILABLE | 404 |
| `form-autofill` (unscoped) | TAKEN | owned by alexdiliberto, v0.2.0 (Aug 2015, abandoned) |

npm user page `~ebenezer-isaac` returned 403 (bot protection / Cloudflare challenge). Scope `@ebenezer-isaac` is presumed valid since the user already publishes other packages (see MEMORY.md: `reference_npm_auth.md`). Scoped publishing requires only that the user owns the org/username, which they do.

### GitHub (github.com/ebenezer-isaac/<repo>, 404 = available)

| Repo | Status |
|---|---|
| `ebenezer-isaac/autofill-core` | AVAILABLE (404) |
| `ebenezer-isaac/form-autofill-core` | AVAILABLE (404) |
| `ebenezer-isaac/ats-autofill` | AVAILABLE (404) |
| `ebenezer-isaac/job-autofill` | AVAILABLE (404) |

## Scoring

| Name | SEO (1-5) | Memorability (1-5) | Clarity | Notes |
|---|---|---|---|---|
| `@ebenezer-isaac/autofill-core` | 4 | 5 | High | Generic, framework-agnostic, clean |
| `autofill-core` (unscoped) | 5 | 5 | High | Max SEO; global uniqueness confirmed |
| `form-autofill-core` | 4 | 4 | Very High | Explicit domain, slightly longer |
| `@ebenezer-isaac/autofill-engine` | 3 | 4 | High | "engine" implies heavier framework |
| `@ebenezer-isaac/form-autofill` | 3 | 4 | High | Collides semantically with stale 2015 pkg |
| `@ebenezer-isaac/ats-autofill` | 2 | 4 | Narrow | Over-claims ATS scope; adapters belong on top |
| `@ebenezer-isaac/job-autofill` | 2 | 3 | Narrow | Ties core to job-hunter use-case |

## Decision

### PRIMARY PICK: `@ebenezer-isaac/autofill-core`

**GitHub repo**: `ebenezer-isaac/autofill-core`
**npm package**: `@ebenezer-isaac/autofill-core`

**Justification**:
1. Scoped under `ebenezer-isaac` satisfies the hard namespace constraint.
2. `autofill-core` communicates exactly what it is: the generic autofill engine, framework-agnostic, with adapters layered on top (`@ebenezer-isaac/autofill-adapter-greenhouse`, etc.).
3. Does NOT claim ATS-specific scope — leaves room for ATS adapters, browser extension, mobile, Electron consumers.
4. `-core` suffix is an established convention (`@apollo/client-core`, `@sentry/core`, `@tanstack/query-core`, `lit-html-core`) signalling "runtime-only, no UI".
5. Scoped packages cannot collide — future-proof even if an unrelated `autofill-core` gets grabbed.
6. Short, memorable, typeable.

### BACKUPS

1. **`@ebenezer-isaac/autofill-engine`** — if `core` feels too library-ish and we want to signal runtime orchestration. "Engine" is common in the extraction space (`mlc-engine`, `scraper-engine`).
2. **`@ebenezer-isaac/form-autofill-core`** — most descriptive, highest clarity; fallback if "autofill" alone is deemed ambiguous (auto-fill vs auto-complete vs auto-fill-in).

### REJECTED

- Unscoped `autofill-core`: namespace constraint says "must be under ebenezer-isaac" — scoped form wins even though unscoped is technically available.
- `form-autofill` (any scope): namespace collision with stale 2015 package creates confusion in search results.
- `ats-autofill` / `job-autofill`: over-narrows a deliberately generic core. Those names are reserved for adapter or application-layer packages.

## Package Metadata

### Description (npm + GitHub, 1 sentence)
> Framework-agnostic form autofill engine: detect fields, map schemas, fill intelligently. Adapter-based, zero-dependency core, built for Chrome extensions, web apps, and automation tools.

### Keywords (package.json)
```json
["autofill", "form-autofill", "form-filler", "chrome-extension", "ats", "job-application", "form-detection", "field-mapping", "schema-mapping", "dom", "accessibility", "a11y", "framework-agnostic", "typescript", "zero-dependency"]
```

### License
- **Core** (`@ebenezer-isaac/autofill-core`): **MIT** — maximum adoption, permissive, standard for libraries aiming at ecosystem growth.
- **Sub-modules / proprietary adapters** (`@ebenezer-isaac/autofill-adapter-*` if they contain domain-specific heuristics worth protecting): **MPL-2.0** — file-level copyleft, forces upstream contribution of adapter improvements without contaminating consumer code.

### Repo Structure (monorepo hint)
```
ebenezer-isaac/autofill-core          # top-level repo
├── packages/
│   ├── core/                         # @ebenezer-isaac/autofill-core (MIT)
│   ├── adapter-greenhouse/           # @ebenezer-isaac/autofill-adapter-greenhouse (MPL-2.0)
│   ├── adapter-lever/                # @ebenezer-isaac/autofill-adapter-lever (MPL-2.0)
│   └── chrome-extension/             # consumer reference impl
```

## Gates
- [x] npm namespace available (all 5 scoped candidates 404)
- [x] GitHub repo name available (404)
- [x] No semantic collision with stale `form-autofill` (v0.2.0 2015) — we're using `autofill-core`, not `form-autofill`
- [x] Name matches architecture (generic core + adapters)
- [x] License stack chosen

**Confidence**: 92%

Uncertainty (8%): npm `~ebenezer-isaac` user page returned 403 (Cloudflare challenge, not a real signal). If the user has not yet claimed the npm username `ebenezer-isaac`, they must register it before first publish. MEMORY.md `reference_npm_auth.md` indicates the token exists, so this is likely already resolved.
