# Tinker Harness

Interactive exercise surface for protocol messages and ATS adapters. Not part of the production build.

## Purpose

- Exercise every `ProtocolMap` handler with arbitrary payloads in a sandboxed iframe, with a fake `chrome.*` shim, without reloading the extension.
- Run any ATS adapter against any HTML fixture and inspect the resulting `FormModel` live.
- Used during A5 (protocol smoke), A8 (adapter smoke), A11 (full E2E). Also used during bug investigation: reproduce a live-page issue against a captured fixture.

## Usage

```
pnpm tinker
```

Opens a Vite dev server at `http://localhost:5174`.

Two pages:

- `/protocol-tinker.html` -- form with dropdown of 19 ProtocolMap keys + JSON payload editor + "Send" button. Response + side effects (log lines, storage writes) rendered live. Uses `@webext-core/fake-browser` to stub `chrome.*`.
- `/adapter-tinker.html` -- dropdown of ATS adapters (greenhouse / lever / workday / custom). File picker for HTML fixture. "Scan" button renders `FormModel` as a collapsible JSON tree. "Plan" button synthesizes a FillPlan from a canned Profile. "Fill" button runs the plan against the iframe and shows per-field results.

## Fixtures

Synthetic snapshots live under `tests/harness/fixtures/<vendor>/*.html`. Each is a captured DOM snapshot of a real ATS application form with PII scrubbed. Expected layout:

```
tests/harness/fixtures/
  greenhouse/
    airbnb-software-engineer.html
    airbnb-software-engineer.expected.json
  lever/
    stripe-payments-engineer.html
    stripe-payments-engineer.expected.json
  workday/
    deloitte-analyst.html
    deloitte-analyst.expected.json
```

`*.expected.json` contains the canonical `FormModel` the adapter should produce; used by both the tinker and contract tests.

A5 seeds the first fixture + tinker config. A8 and A11 add more fixtures as they are needed.

## Exclusion from publish

`tests/harness/**` is globally excluded from the Chrome Web Store zip and from any npm publish via the `files` whitelist in `package.json` (A1 configures). `.gitkeep` is present so the empty directory is tracked until A5 populates it.

## Implementation notes for A5

- Use `@webext-core/fake-browser` for the `chrome.*` shim; `jest-chrome` is an alternative but less complete.
- Route all `sendMessage` calls from the tinker UI through the real `onMessage` handler registered by the background module under test. The shim ensures the message loop behaves like production.
- Persist tinker session state in `sessionStorage` so page reloads preserve the last-used payload.

## NOT in scope

- Not a replacement for adversarial unit tests (D19 six categories still mandatory).
- Not a replacement for Playwright E2E against real ATS sites (A11).
- Not used in CI. Pure developer tool.
