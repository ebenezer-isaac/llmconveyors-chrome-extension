# E2E Tests (Playwright)

Loads the built extension into a real Chromium instance. Tests run against synthetic fixture pages served by a local Vite dev server on port 5174.

## Running

```
pnpm test:e2e              # headless
pnpm test:e2e:ui           # Playwright UI runner (local dev)
RECORD_VIDEO=true pnpm test:e2e   # records video (used by A11 for demo recording)
```

## Prerequisites

- `pnpm build` produces `.output/chrome-mv3/`. Playwright config runs this automatically before tests.
- `pnpm exec playwright install chromium` must have run once (CI caches).

## Owner Mapping

| Scenario | Owner phase | Unskip action |
|---|---|---|
| `popup renders` | A4 | `test.skip` -> `test` |
| `sign-in happy path` | A6 | same |
| `greenhouse autofill happy path` | A8 | same |

A9 (highlight), A10 (popup interactions), A11 (live ATS + demo recording) ADD new scenarios; they do not unskip existing ones.

## Fixtures

`tests/e2e/fixtures/` contains synthetic ATS pages. PII-scrubbed, realistic field sets, JSON-LD JobPosting schema where applicable. Each fixture is static HTML -- no JS runtime -- so results are deterministic.

## Backend Stubbing

`_lib/stub-backend.ts` intercepts every request to `https://api.llmconveyors.local/*` via Playwright's `context.route` API. Tests do NOT require a running NestJS backend.
