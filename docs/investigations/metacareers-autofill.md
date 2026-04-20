# Meta Careers Autofill Investigation

**Date:** 2026-04-20  
**URL tested:** https://www.metacareers.com/profile/create_application/1436181490732782  
**Session:** Live DOM inspection via Playwright MCP

---

## 1. Form Structure

Meta Careers is a pure React SPA with no `<form>` element (formCount: 0). All inputs use obfuscated atomic CSS class names with NO semantic attributes (no id, name, placeholder, aria-label, autocomplete). Labels are sibling `<div>` elements, not `<label>` elements.

Input inventory:
- 1 `input[type="file"]` -- hidden via `display: none`, `accept` includes pdf/doc
- 5 `input[type="text"]` -- first name, last name, email, phone number, website
- 15 `input[type="checkbox"]` -- location selection
- 18 `input[type="radio"]` -- gender, race/ethnicity, veteran status, disability, account type
- 2 `input[type="password"]` -- account creation (optional section)
- 1 `select`/combobox for phone country code

---

## 2. Resume Upload -- WORKS

**Finding:** The DataTransfer + change event approach successfully uploads a file on Meta Careers.

**Mechanism:**
```
input.files = dt.files          // direct assignment works
input.dispatchEvent(new Event('change', { bubbles: true }))
// React's event delegation at root picks this up -- confirmed by UI showing filename
```

**React internals observed:**
- `__reactProps` present on the input
- `onChange` handler present (not `onInput`)
- `input.files = dt.files` assignment: `assignmentWorked: true, filesAfterAssign: 1`
- After dispatching `change`, the UI showed "test-resume.pdf" with an X button

**Detection path in `attachResumeToAnyFileInput`:**
- `acceptSignal`: `accept` includes `"application/pdf"` and `"application/msword"` -- matches
- `labelSignal`: parent div contains "Upload resume" -- matches `upload` keyword
- Either signal is sufficient; both fire here

**Conclusion:** Resume upload works without a dedicated metacareers adapter. The only blocker was Bug 1 below (profile validation failure).

---

## 3. Bug 1 -- Education startDate validation (FIXED)

**Root cause:** `structuredDataToProfile` (rx-resume-to-profile.ts) was passing education entries without a `startDate` through to `ProfileSchema`, which requires `startDate`. This caused `ProfileSchema.parse()` to throw, setting `profile = null`, aborting the fill before reaching any form logic.

**Fix location:** `src/content/autofill/rx-resume-to-profile.ts:341-354` -- filter out education entries missing a valid `startDate` rather than passing them through.

---

## 4. Bug 2 -- Phone number not split (UPSTREAM -- ats-autofill-engine)

**Symptom:** Phone field shows `447501053232` in the number input; country code combobox stuck at `+1`.

### 4a. No paired-field concept

`build-fill-plan.ts` generates exactly one `FillInstruction` per classified field. There is no logic to detect that a `select[label="Code"]` and an `input[label="Phone number"]` are a pair representing a single phone value.

### 4b. Country code combobox not classified

The combobox has label `"Code"`. The `PHONE_LABEL` regex in `ats-autofill-engine/src/core/heuristics/mozilla/rules/contact.ts` matches:
```
/(?:\bphone(?:[\s._-]*number)?\b|\btelephone\b|\bmobile(?:[\s._-]*number)?\b|...)/iu
```
`"Code"` matches none of these -- classified as `unknown`, never filled, stays at `"+1"` default.

### 4c. Phone value not split

`formatPhone()` in `ats-autofill-engine/src/core/fill-rules/format-fill-value.ts`:
```typescript
const hasPlus = source.trimStart().startsWith('+');
const digits = source.replace(/\D/g, '');
return hasPlus ? `+${digits}` : digits;
```

Profile stores `"447501053232"` (no `+` prefix). `formatPhone` returns `"447501053232"` verbatim -- the `44` country code is not stripped from the local number.

### Fix scope

Both sub-problems are in `ats-autofill-engine`, not in this extension repo:
1. Add paired-field detection: recognize `select` with label matching `/\bcode\b|\bcountry.*code\b|\bdial.*code\b/i` preceding a phone text input
2. Add country-code splitting: given a full international number, parse the country code prefix and fill the select with the matching option, fill the text input with the local number
3. Add `+` prefix normalization in profile storage or formatPhone so `+44` numbers are stored/handled correctly

---

## 5. Bug 3 -- Website field not filled (UPSTREAM -- ats-autofill-engine)

**Symptom:** "Website (Examples: Linkedin, Github, portfolio)" field left empty.

### 5a. Label is extracted correctly

`findLabel.ts` uses `findPrecedingText()` which walks up to 6 preceding sibling nodes, extracting `.textContent` from div elements. The label `"Website (Examples: Linkedin, Github, portfolio)"` IS captured correctly.

### 5b. No Mozilla heuristic rule for website

Searched all files in `ats-autofill-engine/src/core/heuristics/mozilla/rules/` -- there is NO rule file for `website`/`url` field types. The ONLY mapping is:
```typescript
// classifier.ts line 93
'url': 'website',
```
This fires only when the input has `autocomplete="url"`. Meta's input has no `autocomplete` attribute.

**Result:** Label extracted as `"Website (Examples: Linkedin, Github, portfolio)"`, no rule fires, classified as `unknown`, skipped.

### Fix scope

In `ats-autofill-engine/src/core/heuristics/mozilla/rules/` -- add a new rule (or extend contact.ts) matching:
```
/\bwebsite\b|\bportfolio\b|\bpersonal.*site\b|\bhomepage\b/iu
```
Also consider matching `\blinkedin\b` on this field type (the Meta label explicitly names LinkedIn as an example).

---

## 6. What works vs what needs upstream fixes

| Field | Status | Notes |
|-------|--------|-------|
| Resume upload | Works | DataTransfer + change event; labelSignal detects "Upload resume" |
| First name | Works | Label "First name" matches FIRST_NAME_LABEL |
| Last name | Works | Label "Last name" matches LAST_NAME_LABEL |
| Email | Works | `type="email"` -- tier 0.9 classification |
| Phone number (text) | Partial | Fills but puts full international digits including country code |
| Phone code (combobox) | Not filled | "Code" label does not match any rule; no paired-field logic |
| Website | Not filled | No Mozilla rule for website/url; autocomplete="url" not present |
| Current location | Not filled | Custom combobox (not a native select); no text input to type into |
| EEO fields | Skipped | Intentional -- EEO fields should not be auto-filled |

---

## 7. Generic fill path for unrecognized sites

Meta Careers has no dedicated adapter (adapter-loader returns null). The execution path is:

```
executeGenericFill()
  -> scanGenericForm(document)  // scans whole document, no <form> element
  -> buildFillPlan()            // classifies via Mozilla heuristics
  -> executeFillPlan()          // fills matched fields
  -> attachResumeFromPlanSkips()  // resume upload from plan skipped entries
     -> attachResumeToAnyFileInput()  // fallback: find any file input
```

The generic path is correct by design. No dedicated metacareers adapter is needed.
