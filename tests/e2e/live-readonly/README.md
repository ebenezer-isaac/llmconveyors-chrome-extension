<!-- SPDX-License-Identifier: MIT -->
# Live Read-Only E2E Tests

Real navigation to public ATS boards. Verifies the content script boots, intent detection classifies the host correctly, and the extension does NOT render its own fill UI inside a third-party page.

## Running

```
LIVE_E2E=true pnpm test:e2e:live
```

On Windows PowerShell:

```
$env:LIVE_E2E='true'; pnpm test:e2e:live
```

Without the flag, the `live-readonly/` directory is excluded from Playwright's `testIgnore` so the default `pnpm test:e2e` never touches real sites.

## Targets

| ATS        | URL                                                                  | Stability notes                         |
|------------|----------------------------------------------------------------------|-----------------------------------------|
| Greenhouse | https://boards.greenhouse.io/airbnb                                  | Public company board, stable path        |
| Lever      | https://jobs.lever.co/stripe                                         | Public company board, stable path        |
| Workday    | https://deloitte.wd103.myworkdayjobs.com/External                    | Public site-wide listing, occasionally moves |

If a URL drifts (company renames, pulls board, etc.) update this table AND the `TARGETS` array in `live-readonly.spec.ts`.

## Safety Invariants

Every scenario enforces:

1. No click on `[data-testid="fill-button"]` (extension UI would never be rendered in a real ATS anyway, but we assert count === 0)
2. No click on any `button[type="submit"]`
3. No FILL_REQUEST message dispatched to the content script
4. Backend routes are stubbed via `_lib/stub-backend.ts` -- no real network traffic leaves to `api.llmconveyors.com`

If you need to edit these tests, treat the safety assertions as contracts. Do NOT remove them to make a scenario "work."

## Failure Modes

- Third-party 5xx / timeout: scenario soft-skips with a descriptive message. Not a build-breaking failure.
- Extension intent mismatch: hard failure. The content script's detector has drifted from the live page structure.
- Unexpected fill-button render: hard failure. The extension is leaking UI into the host page -- security review required.

## Cadence

Scheduled nightly via `.github/workflows/live-e2e.yml`. Failures upload Playwright artifacts (trace, video, screenshot) and do not gate PRs.
