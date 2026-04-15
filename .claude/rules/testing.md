# Testing (extension) -- Fault-Finding, Not Checkbox

Tests exist to BREAK code. A test that cannot fail is worthless. Test fails -> fix code immediately. Never adjust the assertion to make a failing test pass.

## Coverage floors (D24, CI-enforced via vitest thresholds)

| Area | Line | Branch |
|------|------|--------|
| `src/background/**` | 80 | 75 |
| `entrypoints/**` | 75 | 70 |
| `src/content/**` | 80 | 75 |
| UI (`src/popup/**`, `src/sidepanel/**`, `src/options/**`) | 70 | 65 |
| `src/core/**` (pure) | 90 | 85 |

Coverage below the floor fails CI. These numbers are floors, not targets; quality of tests still trumps quantity.

## Six adversarial categories (D19, MANDATORY per phase)

Every phase test plan MUST include all six:

1. **Null / undefined / NaN / Infinity at every parameter**. Example: `PROFILE_UPDATE` with `patch: null`, `patch: undefined`, `patch: { profileVersion: NaN }`.
2. **Empty collections + max-size collections (1000+ items)**. Example: a scanned `FormModel` with zero fields, and one with 1000 fields.
3. **Unicode edge cases**: RTL Arabic / Hebrew, combining characters, null bytes, surrogate pairs, zero-width joiners, normalization form mismatches (NFC vs NFD). Example: profile `fullName = "\u202Eadmin\u202C"` (RTL override).
4. **Injection**: `<script>` in string fields, `javascript:` in resume URL, path traversal in file names, prototype pollution (`__proto__` in JSON), SQL-style in query params. Example: profile `fullName = "<img src=x onerror=alert(1)>"`.
5. **Concurrent re-entry**: fire the same operation twice in parallel, verify serialization or idempotency. Example: two simultaneous `FILL_REQUEST` on the same tab.
6. **Adversarial state**: frozen `chrome.storage` shim, proxies with throwing getters, circular references in JSON payloads.

Reviewers REJECT any phase test plan that omits any of these categories.

## TDD (new code)

RED (test fails for the right reason) -> GREEN (minimal impl makes it pass) -> ADD edge-case tests -> verify they fail FIRST (before the fix) -> FIX code -> IMPROVE -> verify coverage floor.

## Test fails = found a bug

- Fix the code, NOT the test.
- Grep for the same pattern across the codebase -- the bug class often recurs.
- Never adjust expectations to make a failing test pass. The exception (rare) is if you discover the test assertion itself encoded a wrong belief; in that case fix the test AND update the blueprint that informed the wrong belief.

## Quality checklist

- Deterministic (no timing-based flakes, no randomness without seeding, no network).
- Isolated (no shared global state between tests; each test creates a fresh fixture).
- Specific assertions (assert the whole response shape, not just `.toBeTruthy()`).
- Error paths tested (every `if (err) throw ...` branch has a test that triggers it).
- Mock boundaries, not internals. For the extension, the boundaries are `chrome.*`, `fetch`, `document`, `chrome.storage.*`. Use `@webext-core/fake-browser` or `jest-chrome` for the first three; use an in-memory `chrome.storage` fake for the fourth.
- Descriptive names: `FILL_REQUEST rejects ats-mismatch when url does not match adapter`, not `test FILL_REQUEST`.

## Weak tests = refactor on sight

Only happy-path? Tautological assertions (`expect(x).toBe(x)`)? No error paths? -> Refactor before moving on. Gradual effort, one file at a time. Never leave a weak test file green.

## Anti-patterns (NEVER)

- Tests that cannot fail.
- Happy-path-only coverage.
- `any` type in tests.
- Swallowed errors in tests (`try { test(); } catch {}`).
- Testing implementation details (e.g. asserting private field values) instead of behavior.
- Heavy mocking that proves nothing (a test that mocks everything and asserts the mocks is not a test).
- Commented-out tests. Delete them or fix them.
