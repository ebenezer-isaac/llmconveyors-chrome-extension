<!-- SPDX-License-Identifier: MIT -->
# Captured Fixtures -- Offline Autofill E2E

Real-world ATS DOMs captured once, PII-scrubbed, committed as static HTML, and replayed against the extension's FILL_REQUEST path.

This replaces the never-shipped "live autofill" story. We get coverage against actual markup variations without risking spam on real companies' hiring pipelines.

## Directory Layout

```
tests/e2e/captured/
  greenhouse/
    airbnb-ios.html
    airbnb-ios.meta.json
    stripe-backend.html
    stripe-backend.meta.json
  lever/
    ...
  workday/
    ...
```

Each `<name>.html` has a sibling `<name>.meta.json` with capture timestamp, original URL, scrubber version, and size.

## Capturing a New Fixture

```
pnpm exec tsx scripts/capture-live-fixture.ts <vendor> <url> <name>
```

Example:

```
pnpm exec tsx scripts/capture-live-fixture.ts \
  greenhouse https://boards.greenhouse.io/airbnb/jobs/12345 airbnb-ios
```

The script:

1. Launches headless Chromium
2. Navigates to the URL, waits for network idle
3. Captures `document.documentElement.outerHTML`
4. Runs the PII scrubber
5. Writes `.html` + `.meta.json` into `tests/e2e/captured/<vendor>/`

Review the output before committing. The scrubber is conservative by design -- it will not remove every form of PII automatically.

## PII Scrubbing Rules (scripts/capture-live-fixture.ts)

| Pattern                 | Replacement              |
|-------------------------|--------------------------|
| Email-shaped            | `scrubbed@example.com`   |
| Phone-shaped (10-13 d)  | `+15555550000`           |
| SSN `NNN-NN-NNNN`       | `000-00-0000`            |
| DOB `MM/DD/YYYY`        | `01/01/1990`             |
| DOB `YYYY-MM-DD`        | `1990-01-01`             |
| Name input values       | `John` / `Doe`           |
| Street-address inputs   | `123 Main St`            |

## Pre-Commit Review Checklist

Before `git add`ing a new fixture:

- [ ] Open the `.html` in an editor and visually scan for unscrubbed emails, phones, names, addresses
- [ ] Search the file for company-internal IDs (employee numbers, internal URLs) -- these are not PII per se but may leak internals
- [ ] Confirm no JWT / session cookie fragments linger
- [ ] Verify the `.meta.json` records the capture URL accurately for future refresh

## Refresh Cadence

Quarterly. ATS vendors drift their markup every 3-6 months. Stale captures mask real adapter regressions.

When refreshing: delete the old `.html` + `.meta.json`, re-run the capture CLI with the same `<name>`, review, commit.

## Running Captured Tests

```
pnpm test:e2e:captured
```

If the directory is empty, Playwright skips with:
`no captured fixtures -- run scripts/capture-live-fixture.ts to seed`

Captured tests are excluded from default `pnpm test:e2e` via the `testIgnore` rule in `playwright.config.ts` gated on `LIVE_E2E=true`.
