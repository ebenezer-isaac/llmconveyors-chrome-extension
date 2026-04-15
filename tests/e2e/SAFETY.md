<!-- SPDX-License-Identifier: MIT -->
# E2E Safety Invariants

Live E2E tests navigate to real third-party ATS hosts. Real companies operate real hiring pipelines behind those URLs. This document is the contract for what our tests CAN and CANNOT do.

## Categories

| Suite                | Path                             | Live network? | Submits forms? | Env flag            |
|----------------------|----------------------------------|---------------|----------------|---------------------|
| Default E2E          | `tests/e2e/*.spec.ts`            | No (synthetic fixtures) | No | (none)              |
| Live read-only       | `tests/e2e/live-readonly/`       | Yes           | Never          | `LIVE_E2E=true`     |
| Captured autofill    | `tests/e2e/captured/`            | No (committed snapshots) | Yes (against snapshots) | `LIVE_E2E=true` |
| Workday demo         | `tests/e2e/workday-demo/`        | Yes (Workday public sandbox only) | Fills 2 steps, never submits | `WORKDAY_DEMO_E2E=true` |

## Hard Rules

1. **No live test submits any real company form.** Clicking a Submit / Save / Apply that reaches a hiring pipeline is a safety violation, independent of whether the form accepted the data.
2. **Live read-only tests NEVER dispatch `FILL_REQUEST`.** They exercise intent detection, highlight, and content-script boot. That is it.
3. **Workday demo is the single exception** to the no-submit rule, and the exception is bounded: we fill My Information + My Experience and terminate. The spec includes `assertNotOnReviewStep(page)` that throws if the Review / Submit UI ever renders.
4. **Backend stubs are always installed.** `installBackendStubs(context)` runs first in every live test. Production LLMC API calls are intercepted so live tests cannot pollute production analytics or credit ledgers.
5. **No rate-limit abuse.** Nightly-only cadence. Do not run live suites in a tight loop.
6. **URL table maintained.** All live URLs are enumerated in `live-readonly/README.md` and the spec's `TARGETS` array. No URL is derived at runtime from unbounded sources.

## Rationale -- Workday Demo Exception

Workday provides a public demo sandbox at `workday.wd5.myworkdayjobs.com/External` intended for dummy applicants. Submitting a form on that host does NOT contact a real employer. Even so, the spec stops at step 2 out of 4 -- we validate that the extension fills real Workday DOM, but never produce a "completed" application record even in the demo.

## Review Checklist -- New Live Test PR

Before approving any PR that adds or modifies a file under `tests/e2e/live-readonly/`, `tests/e2e/captured/`, or `tests/e2e/workday-demo/`:

- [ ] The test is gated behind the correct env flag (`LIVE_E2E` or `WORKDAY_DEMO_E2E`)
- [ ] The target URL is listed in `tests/e2e/live-readonly/README.md` (for read-only) or documented with a rationale (for captured / demo)
- [ ] No `click()` touches a Submit / Save / Apply button that could reach a real hiring pipeline
- [ ] No `FILL_REQUEST` is dispatched in a `live-readonly/` scenario
- [ ] `installBackendStubs(context)` runs before any navigation
- [ ] The test has a `finally` block that closes the context to avoid leaking Chromium processes
- [ ] Soft-skip (not hard-fail) on third-party transient outages -- real sites go down; our extension does not
- [ ] If adding a captured fixture, the PII-review checklist in `tests/e2e/captured/README.md` was completed

## Incident Response

If a live test accidentally submits a form or triggers spam filters on a real ATS:

1. Disable the nightly workflow immediately: `.github/workflows/live-e2e.yml` -> comment out the `schedule:` stanza and open a PR.
2. File an issue with the ATS vendor (if applicable) disclosing the test traffic.
3. Add a regression gate: extend the safety checklist and, where practical, add an automated assertion in the spec to catch the same class of violation.
4. Record the incident in `MEMORY.md` under "Active Issues" so future sessions inherit the context.
