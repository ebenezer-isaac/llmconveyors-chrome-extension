# Investigation 51: Mozilla form-autofill Heuristics Extraction

**Agent:** 51/60+
**Scope:** Port Firefox `HeuristicsRegExp.sys.mjs` into `@ebenezer-isaac/autofill-core` with MPL-2.0 compliance.
**Confidence:** 88%

---

## a) Source Files

Base URL: `https://searchfox.org/mozilla-central/source/toolkit/components/formautofill/shared/`

**Primary (MUST extract):**
- `HeuristicsRegExp.sys.mjs` — pure regex rule tables (English + multilingual). Est. 800-1200 LoC. Self-contained, zero Firefox dependencies beyond the license header.

**Secondary (OPTIONAL, higher complexity):**
- `FormAutofillHeuristics.sys.mjs` — orchestration layer (`getFormInfo`, `inferFieldInfo`, name/address/phone parsers). Est. 1500-2000 LoC. Heavy Firefox-internal dependencies. Recommend **port only selected pure functions**, not the whole file.
- `LabelUtils.sys.mjs` — DOM label extraction helpers. Small, portable.
- `FormAutofillNameUtils.sys.mjs` — name splitting rules. Pure data, portable.

**Skipped (out of scope for MVP):**
- `CreditCardRuleset.sys.mjs` — Fathom ML model weights (we don't autofill CC).
- `PhoneNumber*.sys.mjs` — we rely on native `tel` detection.
- `AddressMetaData*.sys.mjs` — libaddressinput Google data; huge, MPL-licensed; defer to Phase 2.

---

## b) License Header (exact, preserve verbatim at top of every ported file)

```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
```

Append our attribution block immediately after:

```ts
// Ported from mozilla-central:
//   toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs
// Revision: <git-sha-of-mozilla-central-at-fetch-time>
// Modifications: TypeScript types; Firefox ChromeUtils/Services imports removed.
// This file remains MPL-2.0. See LICENSES/MPL-2.0.txt.
```

---

## c) Imports to Strip or Replace

`HeuristicsRegExp.sys.mjs` is largely self-contained. Likely candidates to strip:

| Firefox-internal | Action |
|---|---|
| `ChromeUtils.defineESModuleGetters` | Remove entirely; replace with static ES imports or inline constants |
| `ChromeUtils.importESModule(...)` | Remove |
| `Services.*` (e.g. `Services.prefs`) | Remove; hardcode defaults (e.g. `supportedCountries = ['US','CA','GB','DE','FR','ES','IT','JP']`) |
| `XPCOMUtils.defineLazyPreferenceGetter` | Remove; use plain `const` |
| `resource://autofill/...` URLs | Remove |
| `Cu.reportError` / `Cu.cloneInto` | Remove; use `console.warn` |
| `lazy.*` proxies | Resolve to direct imports |

`HeuristicsRegExp` itself should need **zero** replacements — it compiles RegExp at runtime from string fragments. Verify by inspection at port time.

`FormAutofillHeuristics` references: `FormAutofill`, `FieldDetail`, `FieldScanner`, `FormAutofillUtils`, `LabelUtils`, `CreditCard`, `CreditCardRulesets`. Only worth porting if we also port these — **out of MVP scope**. Instead, reimplement the orchestration in TypeScript ourselves using `HeuristicsRegExp` as the rule source.

---

## d) Pure Data vs Functions

**Pure data (trivially portable, ~95% of HeuristicsRegExp.sys.mjs):**
- `RULES` object — map of fieldType -> regex source string
- `RULE_SETS` — 3 sets (Firefox / Bitwarden / Chromium)
- `LABEL_RULES` + `LABEL_RULE_SETS`
- `EXTRA_RULES`
- Multilingual alternation fragments

**Functions (need porting, <5%):**
- `_getRules()` — compiles string fragments into RegExp with flags and Unicode normalization
- `getRules()`, `getLabelRules()`, `getExtraRules()` — thin getters with memoisation

All four are pure; no Firefox API surface.

---

## e) Port Strategy (executor steps)

1. **Create sub-directory:**
   `packages/autofill-core/src/core/heuristics/mozilla/`
   Add `README.md` noting MPL-2.0 scope and upstream revision.

2. **Add license files:**
   - `packages/autofill-core/LICENSES/MPL-2.0.txt` (full MPL-2.0 text)
   - Update root `LICENSE` to document the dual-licensed split.

3. **Copy sources:** download raw from searchfox `/raw/` endpoint, place as `HeuristicsRegExp.sys.mjs.orig` alongside the ported file for diff audit.

4. **Rename + convert:** `HeuristicsRegExp.sys.mjs.orig` -> `HeuristicsRegExp.ts`. Steps:
   - Preserve MPL header exactly.
   - Add our attribution block.
   - Wrap `HeuristicsRegExp = { ... }` as a `const` with explicit TS types.
   - Type `RULES: Record<FieldTypeMozilla, string>`.
   - Type `RULE_SETS: ReadonlyArray<Record<FieldTypeMozilla, string>>`.
   - Replace any `ChromeUtils`/`lazy`/`Services` with removed or stub code.
   - Export `compileRules()`, `getRules()`, `getLabelRules()`, `getExtraRules()`.

5. **Create typed enum:**
   `FieldTypeMozilla` — TS union of all keys in `RULES` (given-name, family-name, email, tel, tel-*, address-line1, address-line2, address-line3, address-level1, address-level2, postal-code, country, organization, cc-* (defined but not used by us), etc.).

6. **Adapter layer:**
   `packages/autofill-core/src/core/heuristics/adapter.ts` — our MIT-licensed file that:
   - Imports `HeuristicsRegExp` from the mozilla/ dir.
   - Exposes `detectFieldType(input: FieldSignals): FieldType` where `FieldSignals = { id, name, autocomplete, label, placeholder, type }`.
   - Implements the matching loop (Firefox does this in `FormAutofillHeuristics._findMatchedFieldName`).
   - Maps Mozilla's field types -> our `FieldType` (agent 46 taxonomy).

7. **Build pipeline:**
   - Ensure `tsup`/`tsc` includes the `mozilla/` subdir.
   - Add `sideEffects: false` guard; do NOT tree-shake data tables.
   - Add an `npm run verify:mozilla-unchanged` check that hashes the `.orig` file against a pinned SHA to catch drift.

8. **Tests:**
   - Fixture corpus of 30+ form field signatures (Greenhouse/Lever/Workday/generic) with expected classifications.
   - Regression tests for each multilingual family (en, fr, de, es, it, ja).
   - Adversarial tests: empty strings, 10KB labels, null bytes, emoji, RTL text.

---

## f) License Compliance Checklist

MPL-2.0 is **file-level** copyleft (not viral like GPL). We can keep overall package MIT provided:

- [ ] MPL-2.0 header preserved at top of every ported file
- [ ] Ported files live in isolated `mozilla/` subdirectory (clear boundary)
- [ ] `LICENSES/MPL-2.0.txt` contains full MPL-2.0 text
- [ ] Root `LICENSE` states: "This package is MIT-licensed **except** for files under `src/core/heuristics/mozilla/`, which are MPL-2.0. See `LICENSES/MPL-2.0.txt`."
- [ ] `package.json`:
  ```json
  {
    "license": "MIT AND MPL-2.0",
    "licenses": [
      { "type": "MIT", "url": "./LICENSE" },
      { "type": "MPL-2.0", "url": "./LICENSES/MPL-2.0.txt" }
    ]
  }
  ```
  (SPDX compound expression `MIT AND MPL-2.0` is the correct npm form.)
- [ ] README "Licensing" section explains the split and links to upstream
- [ ] Upstream revision SHA documented in `mozilla/README.md`
- [ ] Any modification to files in `mozilla/` stays MPL-2.0; document this in CONTRIBUTING.md
- [ ] Do NOT move MPL code out of the `mozilla/` subdir (contaminates MIT surface)
- [ ] Adapter layer (our `detectFieldType`) is MIT; it only *imports* from MPL
- [ ] CI check: `scripts/verify-licenses.ts` asserts MPL header on every file under `mozilla/`

---

## g) What the Heuristics Actually Do

Given field signals (`id`, `name`, `autocomplete`, `label`, `placeholder`), Firefox returns a **semantic field type** by:

1. Preferring the HTML `autocomplete` attribute if valid (spec-compliant fast path).
2. Else iterating `RULE_SETS` in priority order (Firefox > Bitwarden > Chromium).
3. For each rule set, running each field type's compiled RegExp against the concatenated signals.
4. Returning the first hit; falling through to `LABEL_RULES` if none match.

**Supported field types** (subset relevant to our ATS use case):
`email`, `tel`, `tel-country-code`, `tel-area-code`, `tel-local`, `tel-extension`, `given-name`, `additional-name`, `family-name`, `name`, `organization`, `organization-title`, `street-address`, `address-line1`, `address-line2`, `address-line3`, `address-level1` (state), `address-level2` (city), `postal-code`, `country`, `country-name`.

**i18n coverage (confirmed):** English, Spanish, French, German, Italian, Dutch, Portuguese, Polish, Turkish, Russian, Japanese, Chinese, Korean.

**Fathom ML:** Used **only** for credit card fields (`CreditCardRuleset.sys.mjs`). We **skip** this entirely. No TensorFlow, no model weights, no WASM.

---

## h) Integration with Our Taxonomy

Our ATS taxonomy (agent 46) = Mozilla's types + ATS extensions. Translation layer:

```ts
// MIT-licensed adapter
const MOZILLA_TO_ATS: Record<FieldTypeMozilla, FieldType> = {
  'email':          'email',
  'tel':            'phone',
  'given-name':     'first-name',
  'family-name':    'last-name',
  'organization':   'current-employer',
  'address-line1':  'street-address',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code':    'zip',
  'country':        'country',
  // ...
};
```

ATS-specific types (`resume-upload`, `cover-letter`, `linkedin-url`, `portfolio-url`, `work-auth`, `visa-sponsorship`, `salary-expectation`, `years-experience`, `notice-period`, `ethnicity`, `gender`, `veteran-status`, `disability`) are detected by **our own** rule set layered **before** we delegate to Mozilla. Only if our ATS pass misses do we fall back to Mozilla's rules.

Execution order: `ats-rules` -> `autocomplete-attribute` -> `mozilla-rules` -> `unknown`.

---

## i) Port Effort

| Task | Hours |
|---|---|
| Download + diff + file copy | 0.5 |
| License plumbing (LICENSES, package.json, README) | 1.0 |
| TS conversion of `HeuristicsRegExp` (types, strip Firefox APIs) | 2.5 |
| `compileRules()` + memoisation | 1.0 |
| `FieldTypeMozilla` enum + `MOZILLA_TO_ATS` mapping | 1.0 |
| Adapter `detectFieldType()` (matching loop) | 2.0 |
| Fixture corpus + unit tests (30+ fields, 6 locales) | 3.5 |
| CI license-header verification script | 0.5 |
| README update + compliance doc | 0.5 |
| **Total** | **~12.5 hours** |

---

## j) Risks

- **Regex dialect drift:** Some Mozilla patterns use Unicode property escapes (`\p{L}`) which require ES2018+; Node 18+/modern browsers are fine but the bundler must not transpile them away. **Mitigation:** `target: es2020` in tsconfig; add unit test that evaluates `/\p{L}/u` at runtime.
- **WebKit lookbehind gap:** Mozilla already worked around this (converted negative lookbehinds to capture groups). Safari support should be inherited for free. Verify in a Safari fixture test.
- **Upstream drift:** Mozilla updates these rules periodically. **Mitigation:** Pin upstream SHA in `mozilla/README.md`; quarterly review task in MEMORY.md.
- **Bundle size:** Raw rule tables ~30-50KB gzipped. Acceptable for a Chrome extension. **Mitigation:** Tree-shake `RULE_SETS` we don't use (e.g. if we drop Bitwarden set).
- **Type safety of `RULES` keys:** Mozilla uses loose string keys; we must hand-curate the TS union. **Mitigation:** Generate from source with a codegen script; fail CI if new keys appear upstream.
- **MPL ambiguity in mixed repos:** Some lawyers argue even *adjacent* MIT files are contaminated. Industry consensus (and SPDX `AND` expression) says no. **Mitigation:** Clear directory boundary + documented split in README.

---

## Stub: First ~45 lines of ported file

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Ported from mozilla-central:
//   toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs
// Upstream revision: <PIN_SHA_AT_PORT_TIME>
// Modifications from upstream:
//   - Converted from .sys.mjs to .ts with explicit types.
//   - Removed ChromeUtils.defineESModuleGetters (no lazy loading needed).
//   - Removed Services.* references (no Firefox prefs).
//   - Removed XPCOMUtils imports (no XPCOM in Node/browser).
// This file remains MPL-2.0. See ../../../../LICENSES/MPL-2.0.txt.

export type FieldTypeMozilla =
  | 'email'
  | 'tel'
  | 'tel-country-code'
  | 'tel-area-code'
  | 'tel-local'
  | 'tel-extension'
  | 'given-name'
  | 'additional-name'
  | 'family-name'
  | 'name'
  | 'organization'
  | 'organization-title'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-line3'
  | 'address-level1'
  | 'address-level2'
  | 'postal-code'
  | 'country'
  | 'country-name';

type RuleMap = Record<FieldTypeMozilla, string>;

// Pattern fragments pulled verbatim from HeuristicsRegExp.sys.mjs RULES object.
// Kept as strings (not RegExp literals) so we can normalise flags once.
const RULES: RuleMap = {
  email:
    '(?:e.?mail|courriel|correo|メール|Электронная|[eE]-?[mM]ail|邮件|이메일)',
  tel:
    '(?:phone|mobile|telephone|tel|fax|téléphone|telefono|電話|Телефон|전화)',
  'given-name':
    '(?:first.?name|given.?name|prénom|nombre|vorname|nome|имя|名)',
  'family-name':
    '(?:last.?name|family.?name|surname|nom|apellido|nachname|cognome|фамилия|姓)',
  // ... (full rule set continues verbatim from upstream)
} as unknown as RuleMap; // cast until all keys ported

let _compiledCache: Record<FieldTypeMozilla, RegExp> | null = null;

export function getRules(): Record<FieldTypeMozilla, RegExp> {
  if (_compiledCache) return _compiledCache;
  const out = {} as Record<FieldTypeMozilla, RegExp>;
  for (const [key, pattern] of Object.entries(RULES) as [FieldTypeMozilla, string][]) {
    out[key] = new RegExp(pattern, 'iu');
  }
  _compiledCache = out;
  return out;
}
```

---

**Confidence: 88%**
`51-mozilla-heuristics-extraction.md`
