# Integration Tests

Run against `@webext-core/fake-browser` and real message handlers. These tests verify that background + content + popup protocol round-trips are correct without spinning up a real Chromium instance.

## Structure

- `_lib/` -- shared helpers: `fake-chrome.ts`, `canonical-profile.ts`, `snapshot.ts`, `mock-backend.ts`
- `*.spec.ts` -- one file per protocol family or cross-cutting concern

## Unskip Ownership

| Suite | Owner phase | Unskip action |
|---|---|---|
| `AUTH round-trip` | A5 / A6 | Remove `describe.skip` -> `describe` |
| `PROFILE round-trip` | A5 / A7 | Same |
| `FILL round-trip` | A5 / A8 | Same |

Every phase that lands a real handler MUST flip its owned suite from `.skip` to `unskipped`. The acceptance criteria for A5/A6/A7/A8 each include a line: `pnpm test:integration -- <suite> passes with 0 skips in target`.

## Adding a New Integration Test

1. Decide which protocol family or cross-cutting concern it belongs to.
2. Add the `it` block inside the relevant `describe` (unskipped tests are ADDED unskipped).
3. Use helpers from `_lib/` for setup; do NOT reimplement storage seeding or backend mocking inline.
4. Ensure the test uses `beforeEach(createFakeChrome)` so state is isolated.

## Running Locally

```
pnpm test:integration
pnpm test:integration -- --grep 'AUTH_SIGN_IN'
```

## Coverage

Integration tests contribute to the `src/background/**` coverage floor (80% line per D24). Unit tests plus integration tests together must meet the threshold.
