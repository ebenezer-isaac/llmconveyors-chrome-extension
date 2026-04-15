# Adversarial Testing -- The Six Mandatory Categories

Every test plan for every phase that ships code MUST include tests from all six categories below. Reviewers reject plans that omit any. This is decision D19 from `02-decisions-v2.1-final.md` lines 314-325.

The categories matter because extensions run in adversarial environments: the page can inject into content scripts, users paste arbitrary data into profile fields, ATS vendors emit malformed HTML, and the service worker can be killed mid-promise. Tests must break code, not rubber-stamp it.

## 1. Null / undefined / NaN / Infinity at every parameter

Every function parameter is tested against `null`, `undefined`, `NaN`, `Infinity`, `-Infinity`. Extension-specific examples:

- `PROFILE_UPDATE({ patch: null })` -> expect `{ ok: false, errors: [...] }`.
- `PROFILE_UPDATE({ patch: undefined })` -> same.
- `FILL_REQUEST({ tabId: NaN })` -> expect `{ ok: false, reason: 'no-tab' }`.
- `KEYWORDS_EXTRACT({ text: '', url: 'x', topK: Infinity })` -> expect `{ ok: false, reason: 'empty-text' }`.
- Profile `yearsOfExperience: NaN` -> Zod rejects with path trace.

## 2. Max-size collections

- A scanned `FormModel` with 1000 fields (synthesized fixture). Autofill controller must complete without stack overflow, without blocking the main thread longer than 500ms, without memory spike > 50MB.
- Resume PDF at 10MB (allowed by Chrome Web Store). Upload handler must stream or reject cleanly.
- Profile with 1000 skills. Keyword extraction must deduplicate and rank in O(n log n), not O(n^2).

## 3. Unicode edge cases

- RTL strings in profile `fullName`: `"\u202Eadmin\u202C"` (RTL override) -- autofill must not visually corrupt the form.
- Combining characters: `"e\u0301"` (e + combining acute) vs `"\u00E9"` (precomposed). Equality must use NFC normalization.
- Null bytes: `"John\u0000Doe"` -- most browsers truncate at null; the autofill should reject or sanitize before writing.
- Surrogate pairs: `"\uD83D\uDE00"` (grinning face) -- valid, must pass through unchanged.
- Zero-width joiners in field labels: `"First\u200DName"` -- classifier must normalize before matching.

## 4. Injection

- `<script>alert(1)</script>` in profile `fullName` -- when echoed into a rendered UI or a DOM write, must be escaped.
- `javascript:alert(1)` in resume URL -- `chrome.tabs.create({ url })` must reject; URL validator MUST reject non-http(s) schemes.
- `../../../etc/passwd` in resume filename -- storage layer must reject path traversal.
- Prototype pollution: JSON payload `{ "__proto__": { "admin": true } }` in `PROFILE_UPLOAD_JSON_RESUME` -- Zod parse + an explicit `Object.hasOwn` check on merge.
- SQL-style: `"' OR 1=1--"` in any field -- should round-trip through storage unchanged (we don't build SQL, but it stresses escape handling).

## 5. Concurrent re-entry

- Two simultaneous `FILL_REQUEST` on the same `tabId`: the second MUST either queue behind the first or reject with `reason: 'wizard-not-ready'`. Both completing independently and racing DOM writes is a bug.
- `HIGHLIGHT_APPLY` while `HIGHLIGHT_CLEAR` is in flight: clear must win; apply either queues after or returns `reason: 'not-a-job-posting'` if the page changed.
- `AUTH_SIGN_IN` fired twice from different popups: only one token exchange happens; the second gets the token from storage.

## 6. Adversarial state

- Frozen `chrome.storage` shim: all writes throw. Handlers must catch and return structured errors, not crash the service worker.
- Proxies with throwing getters on Profile: `new Proxy(profile, { get: () => { throw new Error('boom'); } })`. Any code path that iterates profile fields must tolerate throws.
- Circular references in payloads (pre-Zod): `const obj = {}; obj.self = obj;` -- JSON.stringify throws; the handler must catch before logging.
- MV3 service-worker suspension mid-operation: simulate by aborting the handler promise and re-invoking. State in `chrome.storage` must be consistent (no half-written records).

## Enforcement

- Phase plans list the six categories as explicit acceptance bullets.
- Reviewer rejects if any category is missing.
- Vitest coverage thresholds (D24) plus this list together produce sufficient rigor for the "pitch perfect without live E2E" goal (see `04-quality-rigor-supplement.md` section 8).
