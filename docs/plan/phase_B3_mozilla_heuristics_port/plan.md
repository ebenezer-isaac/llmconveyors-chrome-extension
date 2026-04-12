# Phase B3 — Mozilla HeuristicsRegExp Port (MPL-2.0 sub-module)

**Plan**: 100-chrome-extension-mvp
**Phase**: B3
**Repo**: `e:/ats-autofill-engine` (the new `ebenezer-isaac/ats-autofill-engine` repo scaffolded in B1)
**Day**: 2 of 6 (2026-04-13), runs parallel with B2
**Depends on**: B1 (scaffold — exports map, tsconfig.core.json, LICENSES/ folder present)
**Blocks**: B4 (classifier uses `classifyViaMozillaHeuristics` as the first-pass matcher after the `autocomplete` attribute fast path)
**Estimated effort**: ~3 hours
**Confidence**: 9/10
**Scope**:
- Files touched: 7 new files (5 source + 1 README + 1 test)
- Lines changed: ~900 added, 0 removed

---

## 0. North star

Extract Firefox `HeuristicsRegExp.sys.mjs` (and a trimmed subset of `FormAutofillHeuristics.sys.mjs`) from mozilla-central into a sealed, MPL-2.0 sub-module at `src/core/heuristics/mozilla/`. Convert from `.sys.mjs` to TypeScript, preserve the MPL-2.0 file header verbatim, strip every Firefox-internal API, and wire up a thin MIT-licensed adapter (`src/core/heuristics/adapter.ts`) that maps Mozilla's field type strings onto our canonical `FieldType` union from B2.

The adapter is the only symbol B4 will consume. Everything inside `mozilla/` is an implementation detail that is never re-exported from the `./heuristics` sub-entry except through the adapter.

---

## 1. Blueprint / source of truth

- **Decision memo §2.4** — licensing split: core MIT, `src/core/heuristics/**` MPL-2.0 sub-module, `LICENSES/MPL-2.0.txt`, SPDX `MIT AND MPL-2.0` in package.json.
- **Decision memo §2.5** — hex architecture: `core/heuristics/` is a core module. MUST NOT import `document`, `window`, `HTMLElement`, `chrome.*`, `@nestjs/*`, `fs`, or any Node-only API. `tsconfig.core.json` has `lib: ["ES2022"]` with no DOM lib. CI greps `dist/core/**` for forbidden tokens.
- **Decision memo §2.6** — scope: field classifier = Mozilla HeuristicsRegExp port + ATS taxonomy extension. B3 delivers the Mozilla half; B4 delivers the ATS extension and the full classifier pipeline.
- **Investigation 51** — primary source. Enumerates: source files to port, MPL header text, Firefox-internal APIs to strip, pure data vs function split, port strategy, license compliance checklist, stub of first ~45 lines, risks.
- **Investigation 46** — target taxonomy. Section 3 defines `FieldType` union with 74 members. Section 4 defines detection priority (autocomplete → name → id → label → placeholder → aria → data-* → position). B2 publishes this union as `FieldType` from `src/core/taxonomy/field-types.ts`.
- **Investigation 37** — explicitly skipped: Fathom ML credit card ruleset. We do not autofill cc fields.

---

## 2. Files to create

All paths are relative to the `ats-autofill-engine` repo root.

```
src/core/heuristics/
├── mozilla/
│   ├── heuristics-regexp.ts      NEW  MPL-2.0  ~450 LoC
│   ├── field-heuristics.ts       NEW  MPL-2.0  ~250 LoC
│   └── README.md                 NEW  MPL-2.0  ~40 lines
├── adapter.ts                    NEW  MIT       ~180 LoC
└── index.ts                      NEW  MIT       ~20 LoC

tests/core/heuristics/
└── adapter.spec.ts               NEW  MIT      ~220 LoC
```

No edits to existing files in this phase. B1 already produced:
- `LICENSES/MPL-2.0.txt`
- `LICENSE` (MIT) with the split documented
- `package.json` with `"license": "MIT AND MPL-2.0"` and the `licenses` array
- `tsconfig.core.json` with `lib: ["ES2022"]`
- `package.json#exports["./heuristics"]` pointing at `./dist/core/heuristics/index.js`
- `src/core/taxonomy/field-types.ts` (B2, parallel) exporting the `FieldType` union from investigation 46 §3.

If ANY of those preconditions is missing when this phase starts, STOP and open an issue against B1 — do not work around them.

---

## 3. MPL-2.0 file header (preserve verbatim)

The executor MUST paste these exact 3 comment lines as the first 3 lines of BOTH `heuristics-regexp.ts` and `field-heuristics.ts`, with no modifications (not even whitespace). This is the only valid header for MPL-2.0 short-form notice:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
```

Immediately after that block, paste our attribution block (also verbatim, fill in the upstream SHA that B3 pins at port time):

```ts
// Ported from mozilla-central:
//   toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs
// Upstream revision: <PIN_SHA_AT_PORT_TIME>
// Modifications from upstream:
//   - Converted from .sys.mjs to .ts with explicit types.
//   - Removed ChromeUtils.defineESModuleGetters (no lazy loading needed).
//   - Removed Services.* references (no Firefox prefs; defaults hardcoded).
//   - Removed XPCOMUtils imports (no XPCOM in Node/browser).
//   - Removed resource:// URLs.
//   - Removed lazy.* proxies; resolved to direct imports.
//   - Replaced Cu.reportError with console.warn.
// This file remains MPL-2.0. See ../../../../LICENSES/MPL-2.0.txt.
```

For `field-heuristics.ts`, change the path comment to `FormAutofillHeuristics.sys.mjs` and update the relative path to `LICENSES/MPL-2.0.txt` to match its location (also `../../../../LICENSES/MPL-2.0.txt`).

**Do NOT**:
- Reformat, reflow, or reword the MPL header.
- Replace `https://` with `http://`.
- Remove or shorten the attribution block.
- Add an `@license` JSDoc tag (bundlers strip block comments that do not start with `/*!` or do not contain `@license` — but the MPL header is fine as-is and SHOULD be preserved even after minification via a terser `format.comments` config that B1 already set).

---

## 4. Upstream source fetch

### 4.1 Sources

- `HeuristicsRegExp.sys.mjs`: https://searchfox.org/mozilla-central/raw/toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs
- `FormAutofillHeuristics.sys.mjs`: https://searchfox.org/mozilla-central/raw/toolkit/components/formautofill/shared/FormAutofillHeuristics.sys.mjs

### 4.2 Fetch + pin procedure (executor runs this)

```bash
# From the ats-autofill-engine repo root
mkdir -p src/core/heuristics/mozilla
cd src/core/heuristics/mozilla

# Fetch upstream with curl (no authentication required)
curl -fsSL https://searchfox.org/mozilla-central/raw/toolkit/components/formautofill/shared/HeuristicsRegExp.sys.mjs \
  -o HeuristicsRegExp.sys.mjs.orig
curl -fsSL https://searchfox.org/mozilla-central/raw/toolkit/components/formautofill/shared/FormAutofillHeuristics.sys.mjs \
  -o FormAutofillHeuristics.sys.mjs.orig

# Record the mozilla-central revision at fetch time
curl -fsSL https://hg.mozilla.org/mozilla-central/json-rev/tip | \
  node -e "process.stdin.on('data', d => console.log(JSON.parse(d).node))" > UPSTREAM_SHA.txt

# The .orig files are kept in the repo (NOT deleted) under mozilla/ so the audit
# trail is permanent and `npm run verify:mozilla-unchanged` can rehash them.
cd ../../../..
```

The `.orig` files stay in the repo. They are NOT gitignored. They carry the MPL-2.0 header already (that is the source). They serve two purposes: license audit trail and drift detection. `npm run verify:mozilla-unchanged` (added in §9) hashes them and compares against a pinned SHA recorded in `src/core/heuristics/mozilla/UPSTREAM_SHA.txt`.

### 4.3 Add to tsconfig excludes

`.orig` files are NOT TypeScript. Add to `tsconfig.core.json#exclude`:

```json
"exclude": [
  "node_modules",
  "dist",
  "**/*.sys.mjs.orig"
]
```

B1 may have already set this. If not, the executor MUST add it as part of B3 (and note the drift in the PR description).

---

## 5. Firefox-internal APIs to strip

Investigation 51 §c enumerates the strip list. Executor MUST delete EVERY occurrence of the following patterns in the two ported files. If an occurrence cannot be safely deleted (because the code depends on it), STOP and flag the file for architect review.

| Pattern | Action | Replacement |
|---|---|---|
| `ChromeUtils.defineESModuleGetters(...)` | Delete entire call | Direct ES imports at top of file, or inline constants |
| `ChromeUtils.importESModule("...")` | Delete | Direct ES imports |
| `const lazy = {}` and `lazy.FOO` accesses | Delete `lazy` object; rewrite to bare identifiers | `FOO` directly |
| `Services.prefs.getBoolPref("...", default)` | Delete | Inline the `default` value |
| `Services.prefs.getStringPref("...", default)` | Delete | Inline the `default` value |
| `Services.prefs.getIntPref("...", default)` | Delete | Inline the `default` value |
| `Services.strings.*` | Delete | Hardcoded English strings where absolutely required; otherwise delete branch |
| `XPCOMUtils.defineLazyPreferenceGetter(...)` | Delete | `const X = <default_value>;` |
| `XPCOMUtils.defineLazyServiceGetter(...)` | Delete | Not replaceable — delete dependent code |
| `Cu.reportError(e)` | Replace | `console.warn('[ats-autofill-engine/heuristics]', e)` |
| `Cu.cloneInto(...)` | Replace | `structuredClone(...)` (ES2022, available in both Node 18+ and all target browsers) |
| `resource://autofill/...` strings | Delete | Not needed — everything is bundled |
| `resource://gre/...` strings | Delete | Not needed |
| `AppConstants.*` | Replace | Inline the constant value or delete dependent branch |
| `Components.classes`, `Components.interfaces`, `Ci`, `Cc`, `Cr` | Delete | XPCOM-only, not replaceable; delete dependent code |
| `Log.repository.getLogger(...)` | Delete | Use `console.warn/debug` if logging genuinely needed |

### 5.1 CI enforcement — grep check

Add to B1's `package.json#scripts` (if not present):

```json
{
  "scripts": {
    "verify:mozilla-clean": "bash scripts/verify-mozilla-clean.sh"
  }
}
```

Create `scripts/verify-mozilla-clean.sh`:

```bash
#!/usr/bin/env bash
# Fails CI if any Firefox-internal API token appears in the ported (non-.orig) files.
set -euo pipefail

TARGET="src/core/heuristics/mozilla"
FORBIDDEN_PATTERNS=(
  'ChromeUtils\.'
  'XPCOMUtils'
  'Services\.'
  'resource://'
  'lazy\.'
  'Cu\.reportError'
  'Cu\.cloneInto'
  'AppConstants'
  'Components\.classes'
  'Components\.interfaces'
)

FAIL=0
for pat in "${FORBIDDEN_PATTERNS[@]}"; do
  # Exclude .orig files from the search; they legitimately contain these tokens.
  if grep -rn --include='*.ts' -E "$pat" "$TARGET" 2>/dev/null; then
    echo "FAIL: forbidden pattern '$pat' found in $TARGET (not in .orig files)"
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "Mozilla sub-module contains Firefox-internal API references."
  echo "Strip them per phase B3 plan §5."
  exit 1
fi
echo "OK: Mozilla sub-module is clean of Firefox-internal APIs."
```

`chmod +x scripts/verify-mozilla-clean.sh`. Wire into B1's `ci.yml` after typecheck.

The `--include='*.ts'` glob deliberately excludes `*.sys.mjs.orig` from the scan. `.orig` files are the preserved upstream and will naturally contain these tokens; that is fine and required for audit.

---

## 6. `heuristics-regexp.ts` — port specification

### 6.1 File skeleton (executor must produce something structurally identical)

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
//   - Removed Services.* references (no Firefox prefs; defaults hardcoded).
//   - Removed XPCOMUtils imports (no XPCOM in Node/browser).
//   - Removed resource:// URLs.
//   - Removed lazy.* proxies; resolved to direct imports.
//   - Replaced Cu.reportError with console.warn.
// This file remains MPL-2.0. See ../../../../LICENSES/MPL-2.0.txt.

/**
 * Canonical field type strings emitted by the Mozilla rule set.
 * This union is derived verbatim from the keys of the upstream `RULES` object
 * in HeuristicsRegExp.sys.mjs. Do NOT add ATS-specific types here — those
 * belong on our `FieldType` union in src/core/taxonomy/field-types.ts.
 */
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

type RulePattern = string;
type RuleMap = Readonly<Record<FieldTypeMozilla, RulePattern>>;

/**
 * Pattern fragments pulled verbatim from HeuristicsRegExp.sys.mjs RULES object.
 * Kept as strings (not RegExp literals) so we can compile once with consistent
 * flags and memoise.
 *
 * Every key here MUST also appear in the FieldTypeMozilla union above; if the
 * executor adds a key, they MUST add it to the union.
 */
const RULES: RuleMap = {
  email:
    '(?:e.?mail|courriel|correo|メール|Электронная|[eE]-?[mM]ail|邮件|이메일)',
  tel:
    '(?:phone|mobile|telephone|^tel$|fax|téléphone|telefono|電話|Телефон|전화)',
  'tel-country-code': '(?:country.?code|dial.?code)',
  'tel-area-code': '(?:area.?code)',
  'tel-local': '(?:local.?number)',
  'tel-extension': '(?:ext|extension|poste)',
  'given-name':
    '(?:first.?name|given.?name|prénom|prenom|nombre|vorname|nome|имя|名|이름)',
  'additional-name':
    '(?:middle.?name|middle.?initial|mi|second.?name)',
  'family-name':
    '(?:last.?name|family.?name|surname|nom(?:\\s|$)|apellido|nachname|cognome|фамилия|姓)',
  name: '(?:full.?name|your.?name|name|nom.?complet|nombre.?completo)',
  organization:
    '(?:organization|organisation|company|employer|empresa|entreprise|unternehmen|azienda|organizzazione|会社|организация|회사)',
  'organization-title':
    '(?:job.?title|title|position|role|puesto|poste|berufsbezeichnung|titolo|職位|должность|직함)',
  'street-address':
    '(?:street.?address|address|address.?line|adresse|dirección|indirizzo|住所)',
  'address-line1':
    '(?:address.?line.?1|street.?line.?1|line.?1|addr1)',
  'address-line2':
    '(?:address.?line.?2|street.?line.?2|line.?2|addr2|apt|suite|unit)',
  'address-line3':
    '(?:address.?line.?3|street.?line.?3|line.?3|addr3)',
  'address-level1':
    '(?:state|province|region|county|département|estado|provincia|bundesland|都道府県|область|지역)',
  'address-level2':
    '(?:city|town|locality|ville|ciudad|località|città|stadt|市|город|도시)',
  'postal-code':
    '(?:zip(?:.?code)?|postal.?code|post.?code|plz|cp|cap|codice.?postale|郵便番号|почтовый.?индекс|우편번호)',
  country:
    '(?:country|pays|país|paese|land|国|страна|국가)',
  'country-name':
    '(?:country.?name|nom.?du.?pays|nombre.?del.?país)',
};

/**
 * LABEL_RULES — secondary patterns applied specifically against <label> text
 * when the primary RULES did not match on name/id/autocomplete. These are
 * typically looser than the primary set and exist because labels are more
 * linguistically natural than IDs.
 *
 * Ported verbatim from HeuristicsRegExp.sys.mjs LABEL_RULES. Add only keys
 * that already exist in the upstream source.
 */
const LABEL_RULES: Readonly<Partial<Record<FieldTypeMozilla, RulePattern>>> = {
  // <populate verbatim from upstream LABEL_RULES object>
};

/**
 * Memoised compiled RegExp cache. Cleared only by tests.
 */
let _primaryCache: Record<FieldTypeMozilla, RegExp> | null = null;
let _labelCache: Partial<Record<FieldTypeMozilla, RegExp>> | null = null;

/**
 * Compile a pattern with the flags Mozilla uses: case-insensitive, Unicode.
 * Mozilla's target is modern browsers; \p{L} and friends are assumed available.
 */
function compile(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'iu');
  } catch (e) {
    // Fall back to non-Unicode if the runtime rejects \p{L}. This should
    // never happen in our target environments (Node 18+, Chrome 114+).
    console.warn('[ats-autofill-engine/heuristics] RegExp compile failed for Unicode mode, falling back:', e);
    return new RegExp(pattern, 'i');
  }
}

/**
 * Public API: return all compiled primary rules. Memoised.
 */
export function getRules(): Readonly<Record<FieldTypeMozilla, RegExp>> {
  if (_primaryCache) return _primaryCache;
  const out = {} as Record<FieldTypeMozilla, RegExp>;
  for (const [key, pattern] of Object.entries(RULES) as [FieldTypeMozilla, RulePattern][]) {
    out[key] = compile(pattern);
  }
  _primaryCache = out;
  return out;
}

/**
 * Public API: return all compiled label-only rules. Memoised.
 */
export function getLabelRules(): Readonly<Partial<Record<FieldTypeMozilla, RegExp>>> {
  if (_labelCache) return _labelCache;
  const out: Partial<Record<FieldTypeMozilla, RegExp>> = {};
  for (const [key, pattern] of Object.entries(LABEL_RULES) as [FieldTypeMozilla, RulePattern][]) {
    out[key] = compile(pattern);
  }
  _labelCache = out;
  return out;
}

/**
 * Test-only: reset the compiled-rule cache. Exported for unit tests that
 * exercise the memoisation path. NOT part of the public API surface.
 * @internal
 */
export function _resetCacheForTests(): void {
  _primaryCache = null;
  _labelCache = null;
}
```

### 6.2 Conversion rules (applied to upstream `.sys.mjs`)

1. **Header** — paste the verbatim MPL header from §3 first, then our attribution block with the fetched SHA. Upstream already has an MPL header; the ported file must also have one.
2. **Exports** — upstream uses `export const HeuristicsRegExp = { ... }`. Our port splits into explicit `getRules()`, `getLabelRules()`, and internal `RULES` constant. No default export.
3. **Type annotations** — every exported symbol MUST have an explicit TypeScript type. `any` is banned (repo ESLint rule `@typescript-eslint/no-explicit-any` is `error`).
4. **Rule fragments** — pasted verbatim as JavaScript string literals. Do not rewrite regex patterns. Do not add new patterns. Do not remove patterns. If upstream has a key we do not list in `FieldTypeMozilla`, the executor STOPS and asks architect how to handle it (either add the key and expand the union, or explain in a comment why it is intentionally skipped).
5. **Cc-\*** field types — upstream includes credit-card patterns (`cc-number`, `cc-name`, `cc-exp-month`, etc.). Per decision memo §2.6 and investigation 51 §a, **we SKIP all cc-\* entries**. Executor deletes those keys entirely from `RULES` before pasting, and does NOT add them to `FieldTypeMozilla`. Document the omission in a single-line comment: `// cc-* field types omitted — we do not autofill credit cards.`
6. **Fathom ML references** — upstream may import `FormAutofillCCRuleset` or similar. Delete all such imports and any branches that reference them.
7. **Locale-specific comments** — preserve upstream comments that explain locale coverage. These are valuable audit trail for i18n work.
8. **Line length** — do not reflow long regex patterns. Keep them on one line as upstream has them. Our ESLint `max-len` rule has an override for lines starting with a string literal.

### 6.3 Line budget

Target 400-500 LoC. If under 300, the executor omitted rules — investigate. If over 700, the executor added commentary — trim to upstream level.

---

## 7. `field-heuristics.ts` — trimmed port

Upstream `FormAutofillHeuristics.sys.mjs` is ~1800 LoC and references `FormAutofill`, `FieldDetail`, `FieldScanner`, `FormAutofillUtils`, `LabelUtils`, `CreditCard`, `CreditCardRulesets`. Per investigation 51 §a and §c, we only port the **pure matching loop**, not the orchestration layer. The rest is reimplemented MIT-style in `adapter.ts`.

### 7.1 What to port

Only the `_findMatchedFieldName` function (or its current equivalent) and its direct pure helpers. Specifically:

- A single function that, given a string of concatenated field signals (id, name, autocomplete, placeholder, label text) and a compiled rule set, returns the first matching `FieldTypeMozilla` or `null`.
- Any pure normalisation helper it calls (lowercase, collapse whitespace, strip diacritics).

### 7.2 What to NOT port

- `FieldDetail` class
- `FieldScanner` class
- DOM traversal (`node.closest`, `document.querySelector`, etc.)
- Any reference to `Form`, `FormLike`, `HTMLInputElement`
- Preference lookups
- Credit card matching
- Address format reasoning
- Name splitting heuristics (FormAutofillNameUtils is a separate concern; defer to v1.1 if needed)

### 7.3 Shape

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Ported from mozilla-central:
//   toolkit/components/formautofill/shared/FormAutofillHeuristics.sys.mjs
// Upstream revision: <PIN_SHA_AT_PORT_TIME>
// Modifications from upstream:
//   - Only the pure _findMatchedFieldName matching function ported.
//   - All DOM traversal, FieldDetail/FieldScanner orchestration, credit card
//     handling, name splitting, and address format reasoning removed.
//   - Converted from .sys.mjs to .ts with explicit types.
//   - Removed ChromeUtils/Services/XPCOMUtils/lazy/resource:// imports.
// This file remains MPL-2.0. See ../../../../LICENSES/MPL-2.0.txt.

import type { FieldTypeMozilla } from './heuristics-regexp';

/**
 * Normalise a signal string for regex matching. Ported from upstream's
 * `_getNormalizedString` helper.
 */
export function normaliseSignal(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matching loop: iterate compiled rules in declaration order and return the
 * first key whose pattern matches the input string. Ported from upstream's
 * `_findMatchedFieldName`.
 */
export function findMatchedFieldName(
  input: string,
  rules: Readonly<Record<FieldTypeMozilla, RegExp>>,
): FieldTypeMozilla | null {
  if (!input) return null;
  for (const key of Object.keys(rules) as FieldTypeMozilla[]) {
    const re = rules[key];
    if (re.test(input)) return key;
  }
  return null;
}
```

### 7.4 Line budget

Target 150-250 LoC. This is a deliberately thin slice.

---

## 8. `adapter.ts` — MIT-licensed translation layer

This file is the ONLY public surface B4 (classifier) and the rest of the package will consume. It is MIT, not MPL. The `mozilla/` sub-directory is an implementation detail sealed behind this adapter.

### 8.1 Header

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac
//
// This file is NOT part of the Mozilla sub-module. It imports the MPL-2.0
// ported rules from ./mozilla/ and exposes a MIT-licensed adapter that maps
// Mozilla output types onto our canonical FieldType union. Per SPDX
// MIT AND MPL-2.0 semantics, importing MPL-2.0 code into an MIT file does
// NOT change the license of this file.
```

### 8.2 Public API

```ts
import type { FieldType } from '../taxonomy/field-types'; // from B2
import type { FieldTypeMozilla } from './mozilla/heuristics-regexp';
import { getRules, getLabelRules } from './mozilla/heuristics-regexp';
import { normaliseSignal, findMatchedFieldName } from './mozilla/field-heuristics';

/**
 * Minimal signals required to classify a form field. Parallels the
 * `FieldSignals` shape in investigation 51 §b.
 */
export interface FieldDescriptor {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly autocomplete?: string | null;
  readonly label?: string | null;
  readonly placeholder?: string | null;
  readonly ariaLabel?: string | null;
  readonly type?: string | null; // native HTML input type
}

/**
 * Output: resolved canonical field type plus the Mozilla type we matched on
 * and a confidence score the classifier in B4 can factor into its final vote.
 */
export interface ClassifiedField {
  readonly fieldType: FieldType;
  readonly mozillaType: FieldTypeMozilla;
  readonly confidence: number; // 0..1
  readonly matchedOn: 'autocomplete' | 'primary-rules' | 'label-rules';
}

/**
 * Mozilla → our FieldType union. Only the keys present in
 * FieldTypeMozilla appear here. Keys unknown to Mozilla (ATS-specific types
 * like resume-upload, linkedin-url, work-auth-us, eeo-*) are handled in B4
 * by a separate rule set that runs BEFORE this adapter.
 *
 * Every FieldTypeMozilla key MUST appear here. TypeScript's exhaustiveness
 * check enforces this via the Record type.
 */
const MOZILLA_TO_ATS: Readonly<Record<FieldTypeMozilla, FieldType>> = {
  'email':              'email',
  'tel':                'tel',
  'tel-country-code':   'tel-country-code',
  'tel-area-code':      'tel-area-code',
  'tel-local':          'tel-local',
  'tel-extension':      'tel-extension',
  'given-name':         'given-name',
  'additional-name':    'additional-name',
  'family-name':        'family-name',
  'name':               'name',
  'organization':       'current-company', // ATS-context mapping: when Mozilla says "organization" on an application form, it means the applicant's current employer
  'organization-title': 'current-title',
  'street-address':     'street-address',
  'address-line1':      'address-line1',
  'address-line2':      'address-line2',
  'address-line3':      'address-line3',
  'address-level1':     'address-level1',
  'address-level2':     'address-level2',
  'postal-code':        'postal-code',
  'country':            'country',
  'country-name':       'country-name',
};
```

### 8.3 Translation table rationale

The table is almost 1:1 with two ATS-context remappings:

| Mozilla type | Our FieldType | Rationale |
|---|---|---|
| `organization` | `current-company` | On a job application, "organization" always means the applicant's current employer. B2's taxonomy has `current-company` for this; there is no plain `organization` in the ATS context. |
| `organization-title` | `current-title` | Same reasoning. Upstream's `organization-title` = our `current-title`. |

Every other Mozilla key passes through identically. B4 layers its OWN rule set BEFORE calling this adapter to catch ATS-specific fields (`resume-upload`, `linkedin-url`, `work-auth-us`, `eeo-*`, `salary-expectation`, etc.) that have no Mozilla equivalent. The adapter is the FALLBACK after the ATS pass fails and the HTML `autocomplete` attribute fast-path fails.

### 8.4 `classifyViaMozillaHeuristics` — the exported function

```ts
/**
 * Classify a form field using the Mozilla heuristics port.
 *
 * Execution order within this function:
 *   1. If descriptor.autocomplete is a known token and maps to a
 *      FieldTypeMozilla, return it with confidence 1.0 and matchedOn
 *      'autocomplete'. This is the spec-compliant fast path.
 *   2. Concatenate id + name + placeholder + ariaLabel + label as a single
 *      normalised signal string and run findMatchedFieldName against the
 *      PRIMARY rules. Return with confidence 0.75 and matchedOn
 *      'primary-rules'.
 *   3. If still no match, run findMatchedFieldName against the LABEL rules
 *      using only the label field. Return with confidence 0.55 and
 *      matchedOn 'label-rules'.
 *   4. If nothing matches, return null. B4's classifier will then fall
 *      through to its own heuristics (input.type, position-based) or mark
 *      the field as 'unknown'.
 *
 * This function is PURE: no I/O, no DOM access, no globals beyond the
 * memoised rule cache.
 *
 * @param descriptor  Pre-scanned form field signals.
 * @returns ClassifiedField on match, null on total miss.
 */
export function classifyViaMozillaHeuristics(
  descriptor: FieldDescriptor,
): ClassifiedField | null {
  // Step 1: autocomplete fast path
  const ac = descriptor.autocomplete?.toLowerCase().trim();
  if (ac && ac in MOZILLA_TO_ATS) {
    const mozillaType = ac as FieldTypeMozilla;
    return {
      fieldType: MOZILLA_TO_ATS[mozillaType],
      mozillaType,
      confidence: 1.0,
      matchedOn: 'autocomplete',
    };
  }

  // Step 2: primary rules against concatenated signals
  const primarySignal = [
    descriptor.id,
    descriptor.name,
    descriptor.placeholder,
    descriptor.ariaLabel,
    descriptor.label,
  ]
    .map(normaliseSignal)
    .filter(Boolean)
    .join(' ');

  if (primarySignal) {
    const primaryMatch = findMatchedFieldName(primarySignal, getRules());
    if (primaryMatch) {
      return {
        fieldType: MOZILLA_TO_ATS[primaryMatch],
        mozillaType: primaryMatch,
        confidence: 0.75,
        matchedOn: 'primary-rules',
      };
    }
  }

  // Step 3: label-only rules
  const labelSignal = normaliseSignal(descriptor.label);
  if (labelSignal) {
    // Label rules return a partial record; we need a loop that only
    // considers keys actually present.
    const labelRules = getLabelRules();
    for (const [key, re] of Object.entries(labelRules) as [FieldTypeMozilla, RegExp][]) {
      if (re && re.test(labelSignal)) {
        return {
          fieldType: MOZILLA_TO_ATS[key],
          mozillaType: key,
          confidence: 0.55,
          matchedOn: 'label-rules',
        };
      }
    }
  }

  // Step 4: no match
  return null;
}
```

### 8.5 Confidence values

- `1.0` for `autocomplete` — HTML spec-compliant, deterministic, the browser agrees with us by definition.
- `0.75` for primary rules — stable ID/name regex match, high confidence but not definitive.
- `0.55` for label rules — looser match against natural language, below the 0.6 default threshold in B4 so these will be overridden if any other signal votes differently.

These numbers are exported as constants the executor MUST declare at file top:

```ts
const CONFIDENCE_AUTOCOMPLETE = 1.0;
const CONFIDENCE_PRIMARY = 0.75;
const CONFIDENCE_LABEL = 0.55;
```

B4 consumes these via `import { CONFIDENCE_AUTOCOMPLETE, ... }` if needed.

### 8.6 Null-safety

All optional fields on `FieldDescriptor` are handled with `?.` and `normaliseSignal` (which returns `''` for `null`/`undefined`/empty). The function never throws on bad input. An empty descriptor returns `null`.

### 8.7 Line budget

Target 150-200 LoC.

---

## 9. `index.ts` — barrel export (MIT)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebenezer Isaac

/**
 * Public entry for @ebenezer-isaac/ats-autofill-engine/heuristics sub-entry.
 *
 * Re-exports ONLY the MIT adapter surface. The Mozilla sub-module at
 * ./mozilla/ is an implementation detail and is not re-exported here.
 * Consumers MUST use the adapter functions and types below.
 */

export type { FieldDescriptor, ClassifiedField } from './adapter';
export { classifyViaMozillaHeuristics } from './adapter';
// Confidence constants exposed for downstream classifiers (B4) that need to
// compare the Mozilla adapter's output against their own vote weights.
export {
  CONFIDENCE_AUTOCOMPLETE,
  CONFIDENCE_PRIMARY,
  CONFIDENCE_LABEL,
} from './adapter';
```

**Deliberately NOT re-exported**: `FieldTypeMozilla`, `getRules`, `getLabelRules`, `findMatchedFieldName`, `normaliseSignal`, `_resetCacheForTests`. Keeping the sub-module sealed protects the MPL-2.0 boundary: if a consumer imports only from `@ebenezer-isaac/ats-autofill-engine/heuristics`, they never touch MPL code directly.

---

## 10. `mozilla/README.md`

```markdown
# Mozilla Form Autofill Heuristics — Ported Sub-module

This directory contains TypeScript ports of Firefox's form autofill heuristics,
originally under:

    toolkit/components/formautofill/shared/

Specifically:

- `heuristics-regexp.ts` — from `HeuristicsRegExp.sys.mjs`
- `field-heuristics.ts`  — from `FormAutofillHeuristics.sys.mjs` (trimmed to
  the pure matching loop only)

## License

Every file in this directory is licensed under the Mozilla Public License,
Version 2.0 (MPL-2.0). See `../../../../LICENSES/MPL-2.0.txt` for the full
text.

MPL-2.0 is FILE-LEVEL copyleft. Files in this sub-directory stay MPL-2.0. The
rest of the `ats-autofill-engine` package is MIT-licensed. Modifications to
files in this directory MUST be released under MPL-2.0 and this sub-directory
MUST remain clearly boundaried.

## Upstream revision

See `UPSTREAM_SHA.txt` for the mozilla-central revision these files were
ported from. Drift is detected by `npm run verify:mozilla-unchanged`, which
hashes the preserved `.sys.mjs.orig` files against a SHA pinned at port time.

## How to update from upstream

1. Re-fetch upstream files per phase B3 plan §4.
2. Update `UPSTREAM_SHA.txt`.
3. Diff the new `.orig` files against the old. Port any behavior changes.
4. Update the "Modifications from upstream" block in each file header.
5. Run the full test suite; add fixtures for any new rules.
6. Run `npm run verify:mozilla-clean` to confirm no Firefox internals leaked in.
7. Run `npm run verify:mozilla-unchanged` to refresh the hash.

## What is NOT ported (deliberate)

- Credit card heuristics (`CreditCardRuleset.sys.mjs`, Fathom ML weights) —
  we do not autofill credit card fields.
- Address format data (`AddressMetaData*.sys.mjs`) — not required for MVP;
  deferred to v1.1.
- Phone number parsing (`PhoneNumber*.sys.mjs`) — we rely on native `tel`
  detection.
- DOM orchestration (`FieldDetail`, `FieldScanner`, `LabelUtils`) — we
  reimplement the orchestration ourselves in the MIT adapter at
  `../adapter.ts`.
```

---

## 11. License compliance checklist (executor verifies all boxes before PR)

Per investigation 51 §f:

- [ ] `src/core/heuristics/mozilla/heuristics-regexp.ts` starts with the exact MPL-2.0 header from §3
- [ ] `src/core/heuristics/mozilla/field-heuristics.ts` starts with the exact MPL-2.0 header from §3
- [ ] Both files have the attribution block immediately after the MPL header
- [ ] Both files have `<PIN_SHA_AT_PORT_TIME>` replaced with the actual SHA from `UPSTREAM_SHA.txt`
- [ ] `src/core/heuristics/mozilla/README.md` exists and matches the template in §10
- [ ] `src/core/heuristics/mozilla/UPSTREAM_SHA.txt` exists with a single SHA on one line
- [ ] `src/core/heuristics/mozilla/HeuristicsRegExp.sys.mjs.orig` exists (NOT gitignored)
- [ ] `src/core/heuristics/mozilla/FormAutofillHeuristics.sys.mjs.orig` exists (NOT gitignored)
- [ ] `LICENSES/MPL-2.0.txt` exists at repo root with the full MPL-2.0 text (B1 precondition)
- [ ] Root `LICENSE` (MIT) documents the split and points at `LICENSES/MPL-2.0.txt` (B1 precondition)
- [ ] `package.json#license` is exactly `"MIT AND MPL-2.0"` (B1 precondition)
- [ ] `package.json#licenses` array has both entries (B1 precondition)
- [ ] `src/core/heuristics/adapter.ts` has an MIT SPDX header and a comment explaining it is NOT part of the Mozilla sub-module
- [ ] `src/core/heuristics/index.ts` has an MIT SPDX header
- [ ] `src/core/heuristics/index.ts` does NOT re-export anything from `./mozilla/` directly — only the adapter surface
- [ ] `npm run verify:mozilla-clean` passes (grep check from §5.1)
- [ ] No file under `src/core/heuristics/mozilla/*.ts` references any of the forbidden patterns (ChromeUtils, XPCOMUtils, Services., resource://, lazy., etc.)

---

## 12. Tests — `tests/core/heuristics/adapter.spec.ts`

### 12.1 Test framework

Vitest. Already configured in B1. `pnpm test` runs it.

### 12.2 Required test cases

The test file MUST contain AT LEAST the following cases, grouped into five `describe` blocks:

#### 12.2.1 `describe('classifyViaMozillaHeuristics — autocomplete fast path', ...)`

- `test('email autocomplete returns email with confidence 1.0')` — the canonical case specified by the phase prompt. Input: `{ name: 'email', id: 'email-2', autocomplete: 'email', label: 'Email' }`. Expected output: `{ fieldType: 'email', mozillaType: 'email', confidence: 1.0, matchedOn: 'autocomplete' }`.
- `test('given-name autocomplete returns given-name')` — `{ autocomplete: 'given-name' }` → `fieldType: 'given-name'`.
- `test('family-name autocomplete returns family-name')` — same pattern.
- `test('tel autocomplete returns tel')` — same pattern.
- `test('street-address autocomplete returns street-address')` — same pattern.
- `test('postal-code autocomplete returns postal-code')` — same pattern.
- `test('country autocomplete returns country')` — same pattern.
- `test('organization autocomplete returns current-company (ATS remap)')` — validates the ATS-context remap.
- `test('organization-title autocomplete returns current-title (ATS remap)')` — validates the ATS-context remap.
- `test('uppercase and mixed-case autocomplete tokens match')` — `{ autocomplete: 'EMAIL' }` and `{ autocomplete: ' Email ' }` both return `email` with confidence 1.0. (The adapter lowercases and trims.)
- `test('unknown autocomplete token does not short-circuit fast path')` — `{ autocomplete: 'bogus-token', name: 'email' }` must still fall through to primary rules and match on `name`. Expected `fieldType: 'email'`, `matchedOn: 'primary-rules'`.

#### 12.2.2 `describe('classifyViaMozillaHeuristics — primary rules', ...)`

- `test('name attribute containing "email" matches email')` — `{ name: 'user_email' }` → `email`.
- `test('id attribute containing "first_name" matches given-name')` — `{ id: 'first_name' }` → `given-name`.
- `test('label text containing "Last Name" matches family-name')` — `{ label: 'Last Name' }` → `family-name`.
- `test('placeholder containing "Phone number" matches tel')` — `{ placeholder: 'Phone number' }` → `tel`.
- `test('ariaLabel is included in primary signal')` — `{ ariaLabel: 'Email address' }` → `email`.
- `test('concatenated signals match on any component')` — `{ id: 'f1', name: 'q_87', placeholder: 'your email' }` → `email` (only placeholder carries the signal).
- `test('primary match returns confidence 0.75 and matchedOn primary-rules')`.

#### 12.2.3 `describe('classifyViaMozillaHeuristics — label rules fallback', ...)`

- `test('label rules only fire when primary signals miss')` — construct a descriptor where `id`, `name`, `placeholder`, `ariaLabel` are empty but `label` contains text matched by LABEL_RULES. Assert `matchedOn === 'label-rules'` and `confidence === 0.55`.
- `test('label rules do NOT fire if primary rules already matched')` — descriptor where `name` matches primary → assert `matchedOn === 'primary-rules'`.

#### 12.2.4 `describe('classifyViaMozillaHeuristics — null / edge cases', ...)`

- `test('empty descriptor returns null')` — `{}` → `null`.
- `test('all-null descriptor returns null')` — every field explicitly null.
- `test('whitespace-only signals return null')` — `{ name: '   ', label: '\t\n' }` → `null`.
- `test('non-matching signals return null')` — `{ name: 'totally_custom_xyz_123', label: 'Random' }` → `null`.
- `test('extremely long label does not crash')` — 10,000-char label string → returns `null` or a match, but does not throw.
- `test('unicode / emoji in signals does not crash')` — `{ label: '📧 email 🎉' }` → `email`.
- `test('RTL / Arabic text does not crash')` — `{ label: 'البريد الإلكتروني' }` → returns something or `null` but does NOT throw.
- `test('null byte in signal does not crash')` — `{ name: 'em\u0000ail' }` → returns `email` or `null`, no throw.
- `test('prototype pollution keys ignored')` — `{ name: '__proto__', label: '__proto__' }` → `null`, no throw, `Object.prototype` untouched.

#### 12.2.5 `describe('classifyViaMozillaHeuristics — type safety and invariants', ...)`

- `test('every FieldTypeMozilla key has a MOZILLA_TO_ATS entry')` — compile-time test using TypeScript's `Record<FieldTypeMozilla, FieldType>` exhaustiveness. Implemented as a type-only check: `const check: Record<FieldTypeMozilla, FieldType> = MOZILLA_TO_ATS;` in the test file, which fails the TS build if any key is missing. This test's runtime body is `expect(true).toBe(true)`; the value is in the type error it raises at compile time if the contract drifts.
- `test('returned fieldType is always a member of FieldType union')` — iterate over all MOZILLA_TO_ATS values, assert each is a valid FieldType (runtime check against an array of known types imported from B2's taxonomy barrel).
- `test('returned confidence is always in [0, 1]')` — iterate over 20 sample descriptors, for each result assert `confidence >= 0 && confidence <= 1`.

### 12.3 Fixture data

Embed fixtures inline in the spec file (no separate JSON). Rationale: fixtures are tightly coupled to expected outputs, co-locating makes drift detection trivial, and the file stays under 250 LoC.

### 12.4 Pre-test setup

Each test calls `_resetCacheForTests()` (imported via a test-only re-export path) in `beforeEach`. The adapter itself does not expose this — the test imports directly from `./mozilla/heuristics-regexp` (tests are allowed to reach into the sub-module because they are MIT-licensed test files that never ship).

Test file top:

```ts
// SPDX-License-Identifier: MIT
import { describe, test, expect, beforeEach } from 'vitest';
import {
  classifyViaMozillaHeuristics,
  type FieldDescriptor,
  type ClassifiedField,
} from '../../../src/core/heuristics';
import { _resetCacheForTests } from '../../../src/core/heuristics/mozilla/heuristics-regexp';

beforeEach(() => {
  _resetCacheForTests();
});
```

### 12.5 Line budget

Target 200-280 LoC for the spec file.

### 12.6 Coverage target

100% statement coverage of `src/core/heuristics/adapter.ts` (the MIT adapter). The `mozilla/` sub-module has lower coverage requirements because it is ported code — a single "smoke test" per exported function (`getRules`, `getLabelRules`, `findMatchedFieldName`, `normaliseSignal`) is sufficient; integration through the adapter tests covers the rest.

If overall coverage for `src/core/heuristics/**` falls below 90% line, the executor STOPS and adds more tests before opening the PR.

---

## 13. CI wiring

B1 already set up `ci.yml`. Phase B3 adds two new steps AFTER the existing typecheck step:

```yaml
      - name: Verify Mozilla sub-module is clean of Firefox-internal APIs
        run: pnpm verify:mozilla-clean

      - name: Verify Mozilla .orig files unchanged from pinned upstream
        run: pnpm verify:mozilla-unchanged
```

### 13.1 `verify:mozilla-unchanged` script

Create `scripts/verify-mozilla-unchanged.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DIR="src/core/heuristics/mozilla"
SHA_FILE="$DIR/UPSTREAM_SHA.txt"

if [ ! -f "$SHA_FILE" ]; then
  echo "FAIL: $SHA_FILE missing."
  exit 1
fi

PINNED_SHA=$(cat "$SHA_FILE" | tr -d '\n' | tr -d ' ')
if [ -z "$PINNED_SHA" ]; then
  echo "FAIL: $SHA_FILE is empty."
  exit 1
fi

# Hash the two .orig files deterministically.
HASH=$(cat "$DIR/HeuristicsRegExp.sys.mjs.orig" "$DIR/FormAutofillHeuristics.sys.mjs.orig" | sha256sum | awk '{print $1}')

# The pinned file records both the mozilla-central tip SHA and our local
# hash of the two files concatenated, on two lines. The first line is the
# mozilla-central revision; the second line is our SHB256. This script
# validates the second line matches what we currently have on disk.
EXPECTED_HASH=$(sed -n '2p' "$SHA_FILE" | tr -d '\n' | tr -d ' ')

if [ -z "$EXPECTED_HASH" ]; then
  echo "NOTE: second line of $SHA_FILE is empty; writing initial hash."
  echo "$HASH" >> "$SHA_FILE"
  echo "Wrote initial hash: $HASH"
  exit 0
fi

if [ "$HASH" != "$EXPECTED_HASH" ]; then
  echo "FAIL: $DIR/*.orig files have drifted from pinned SHA."
  echo "  Pinned:  $EXPECTED_HASH"
  echo "  Current: $HASH"
  echo "If this drift is intentional (upstream re-fetch), update the pinned"
  echo "hash in the second line of $SHA_FILE and re-commit."
  exit 1
fi

echo "OK: Mozilla sub-module .orig files match pinned hash."
```

Add to `package.json#scripts`:

```json
{
  "scripts": {
    "verify:mozilla-clean": "bash scripts/verify-mozilla-clean.sh",
    "verify:mozilla-unchanged": "bash scripts/verify-mozilla-unchanged.sh"
  }
}
```

The format of `UPSTREAM_SHA.txt` is:

```
<mozilla-central-revision-sha>
<sha256-of-both-orig-files-concatenated>
```

B3's executor writes both lines at port time. The second line is obtained from a dry-run of the script (it will auto-populate if empty).

### 13.2 `tsconfig.core.json` sanity

B1 already set `lib: ["ES2022"]`. The executor MUST verify, after porting, that no new file under `src/core/heuristics/**` imports `document`, `window`, `HTMLElement`, `navigator`, or any `chrome.*` API. The easiest verification is: `pnpm tsc -p tsconfig.core.json --noEmit` must pass. If it fails because a DOM type leaked in, the executor fixes the import, NOT the tsconfig.

### 13.3 Post-build token grep

B1's `scripts/verify-core-pure.sh` (or equivalent) already runs `grep -rE 'document|window|chrome\.|HTMLElement' dist/core/ && exit 1`. B3 does not modify this. If the grep fails after B3 produces output, the executor has leaked browser types into the port — fix the port.

---

## 14. Anti-pattern checks applied during implementation

Per `.claude/rules/code-review-on-read.md` — the executor flags (and fixes in the same PR) any of:

- `any` types in adapter.ts or the ported files (ESLint rule is error)
- `console.log` — banned. Only `console.warn` in the fallback compile path and in the `Cu.reportError` replacement.
- Mutable module state beyond the two memoisation caches (`_primaryCache`, `_labelCache`)
- Nested ternaries (use `if`/`else` for clarity)
- Functions over 50 lines (split the loop body)
- Files over 400 lines (`heuristics-regexp.ts` may approach 500 because of the rule table; that is fine — the rule table is data, not logic)
- Sequential `await`s that could be `Promise.all` (this phase has zero async code)
- `// TODO` comments without a linked issue
- `@ts-ignore` / `@ts-expect-error` (NEVER — if TS complains, fix the types)
- Fire-and-forget that loses critical side effects
- Missing input validation on public adapter entry (`classifyViaMozillaHeuristics` must accept any partial `FieldDescriptor`)
- Swallowed errors in `compile()` — the fallback path is the only place `catch` is used, and it logs via `console.warn` and returns a usable RegExp. No silent swallow.

---

## 15. Acceptance criteria (reviewer confirms each before merging)

- [ ] `src/core/heuristics/mozilla/heuristics-regexp.ts` exists, starts with the MPL-2.0 header from §3 (byte-exact match), exports `FieldTypeMozilla`, `getRules`, `getLabelRules`, `_resetCacheForTests`
- [ ] `src/core/heuristics/mozilla/field-heuristics.ts` exists, starts with the MPL-2.0 header, exports `normaliseSignal`, `findMatchedFieldName`
- [ ] `src/core/heuristics/mozilla/README.md` exists per §10
- [ ] `src/core/heuristics/mozilla/UPSTREAM_SHA.txt` exists with two non-empty lines
- [ ] `src/core/heuristics/mozilla/HeuristicsRegExp.sys.mjs.orig` and `FormAutofillHeuristics.sys.mjs.orig` exist, not gitignored
- [ ] `src/core/heuristics/adapter.ts` exists, MIT-headered, exports `classifyViaMozillaHeuristics`, `FieldDescriptor`, `ClassifiedField`, three `CONFIDENCE_*` constants
- [ ] `src/core/heuristics/index.ts` exists, MIT-headered, only re-exports the adapter surface (NOT the Mozilla sub-module)
- [ ] `tests/core/heuristics/adapter.spec.ts` exists, all 12.2.x tests pass
- [ ] `pnpm test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm verify:mozilla-clean` exits 0
- [ ] `pnpm verify:mozilla-unchanged` exits 0
- [ ] `pnpm build` produces `dist/core/heuristics/index.{js,mjs,d.ts}` and `dist/core/heuristics/adapter.{js,mjs,d.ts}`
- [ ] `grep -rE 'ChromeUtils|XPCOMUtils|Services\.|resource://|lazy\.' dist/core/heuristics/mozilla/` returns nothing (tokens must not leak into the built output)
- [ ] The canonical test `classify({name:'email', id:'email-2', autocomplete:'email', label:'Email'})` returns `{ fieldType: 'email', confidence: 1.0, matchedOn: 'autocomplete' }`
- [ ] `pnpm compliance` passes (this is the final gate — shared-types build, typecheck, lint, test, plus the two new verify scripts)

---

## 16. Rollback plan

If B3 cannot be completed in time (e.g. upstream fetch fails, MPL header formatting breaks bundler, ported regex table has syntax errors we cannot debug in the budget):

1. **Hard rollback**: revert all files created in this phase. B4 cannot proceed without B3 — B3 is a blocker.
2. **Soft rollback** (only if the Mozilla rule port itself fails but the adapter shape works): ship `adapter.ts` with a STUB implementation that returns `null` for everything except the `autocomplete` fast path. Leave the `mozilla/` directory empty. B4 is informed of the degradation. This unblocks B4 at ~60% capability (the autocomplete fast path alone covers most Workday and some Ashby fields; Greenhouse and Lever will miss most fields until the port lands). Recover by re-running B3 on day 3 or 4 between other phases.
3. **License rollback**: if the MPL-2.0 sub-module structure somehow breaks the build or license check, do NOT "fix" by moving Mozilla code into MIT files or by rewriting the regex rules from scratch — both are legal and process violations. STOP and ask architect.

---

## 17. Out of scope for B3

- Our ATS-specific rule set (`resume-upload`, `linkedin-url`, `work-auth-us`, `eeo-*`, `salary-expectation`, `visa-sponsorship-required`, `years-experience`, `notice-period`, `referral-*`, `consent-*`, `start-date`, etc.) — these belong to B4's classifier. B4 runs its own rule set BEFORE calling `classifyViaMozillaHeuristics`.
- Fathom ML credit card field handling — permanently skipped per decision memo §2.6 and investigation 51 §a.
- i18n regex additions beyond what Mozilla ships — deferred to v1.1 per investigation 46 §6.
- Multilingual label dictionaries beyond upstream's built-in coverage (en, es, fr, de, it, nl, pt, pl, tr, ru, ja, zh, ko) — Mozilla's upstream patterns already cover 13 locales; we add nothing in B3.
- Address format metadata (`AddressMetaData*.sys.mjs`) — deferred to v1.1.
- Phone number parsing (`PhoneNumber*.sys.mjs`) — we rely on native `tel` type detection plus the Mozilla `tel` regex.
- Name splitting (`FormAutofillNameUtils.sys.mjs`) — B2 provides `given-name`/`family-name`/`additional-name` as separate fields; the profile upload flow in A7 handles splitting the user's `name` at upload time. No runtime splitter needed in B3.
- `FieldDetail` / `FieldScanner` orchestration — replaced by our own scanner in B5 (DOM adapter).
- B3 does NOT touch files outside `src/core/heuristics/**`, `tests/core/heuristics/**`, `scripts/verify-mozilla-*.sh`, or `package.json#scripts`.

---

## 18. Timing and handoff

Estimated 3 hours of executor time, broken down (mirrors investigation 51 §i at 25% reduction because B1 already handled license plumbing):

| Task | Minutes |
|---|---|
| Fetch upstream, pin SHA, create `.orig` files | 15 |
| Port `heuristics-regexp.ts` (header, types, RULES, compile, getters) | 60 |
| Port `field-heuristics.ts` (header, normaliseSignal, findMatchedFieldName) | 20 |
| Write `adapter.ts` (descriptor types, MOZILLA_TO_ATS, classify function) | 35 |
| Write `index.ts` barrel export | 5 |
| Write `mozilla/README.md` | 10 |
| Write `adapter.spec.ts` (all 5 describe blocks, ~25 tests) | 40 |
| Wire up `verify:mozilla-clean` and `verify:mozilla-unchanged` scripts | 10 |
| Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, fix issues | 15 |
| Run `pnpm compliance`, confirm green | 5 |
| Commit + PR description | 5 |
| **Total** | **~180 min** |

### 18.1 Handoff to B4

B4's executor reads this plan and B4's own plan. B4 only needs to know:

- The `./heuristics` sub-entry exports `classifyViaMozillaHeuristics(descriptor) → ClassifiedField | null`
- It returns `null` when no rule fires
- Its confidence values are `1.0` (autocomplete), `0.75` (primary), `0.55` (label)
- It is PURE — no globals, no I/O, no DOM
- B4's classifier calls it AFTER its own ATS-specific rule set and AFTER the autocomplete fast path check (the adapter also does the fast path, so B4 can either skip it or let the adapter handle it redundantly — the latter is simpler and the redundancy is `O(1)`)
- The `FieldType` returned is guaranteed to be a member of the canonical `FieldType` union from B2

### 18.2 Integration with B2

B3 imports `FieldType` from `../taxonomy/field-types` (B2's deliverable). If B2 is not yet merged when B3 starts, the executor waits — they are parallel but B3 depends on B2's type. In the rare case B3 starts first and B2 slips, the executor can stub a local `type FieldType = string` with a `// TODO: replace with import from B2` and open a blocking issue. **This is the only acceptable stub in B3**, and it MUST be replaced before the PR can merge.

---

## 19. Confidence and risk

**Confidence: 9/10.**

The port strategy is derived directly from investigation 51 (88% confidence in the port plan itself, which the architect has reviewed and accepted). The remaining 1 point of uncertainty is:

- **R1** (P: low, I: medium) — upstream `HeuristicsRegExp.sys.mjs` may have gained new field types between investigation 51's research window and port time. Mitigation: executor manually diffs the fetched `.orig` against the type list in this plan's §6.1 and either adds the new keys to `FieldTypeMozilla` + `MOZILLA_TO_ATS` or deletes them. If unsure, STOP.
- **R2** (P: very low, I: low) — Unicode property escape (`\p{L}`) may fail in some bundler config. Mitigated by `compile()` fallback path and by B1 already setting `target: es2020`.
- **R3** (P: low, I: medium) — MPL-2.0 bundler gotcha: some terser configs strip block comments. Mitigated by B1's terser config `format.comments: /@license|MPL/i`. If B1 did not configure terser, B3 opens a blocker issue against B1.
- **R4** (P: very low, I: high) — architect catches a licensing mistake post-PR. Mitigated by the §11 compliance checklist which the executor MUST tick off in the PR description.

---

**End of phase B3 plan.**
