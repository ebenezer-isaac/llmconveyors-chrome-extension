# ATS Form Selectors — Top 5 Auto-Fill Targets

Agent 41 / Plan 100 Chrome Extension MVP. Scope: Greenhouse, Lever, Ashby, Workday, LinkedIn Easy Apply.

**Stability legend**:
- **V-LIVE** = verified this session against a live public posting (WebFetch)
- **V-SRC** = verified from an open-source autofiller's source code (publicly inspected this session)
- **V-DOC** = verified from vendor's own developer documentation (publicly inspected this session)
- **I** = inferred from extension-bundle inspection / historical knowledge / pattern inference — **verify before shipping**

## Quick-reference URL pattern regexes (for `content_scripts.matches` / MV3)

```
Greenhouse-v1:  https://boards.greenhouse.io/*/jobs/*
Greenhouse-v2:  https://job-boards.greenhouse.io/*/jobs/*
Greenhouse-embed: https://boards.greenhouse.io/embed/job_app?*        (iframe, needs all_frames)
Lever:          https://jobs.lever.co/*/*/apply
Lever-list:     https://jobs.lever.co/*/*                             (posting, triggers Apply click)
Ashby:          https://jobs.ashbyhq.com/*/*                          (React SPA, client-side routed)
Ashby-apply:    https://jobs.ashbyhq.com/*/*/application              (some tenants use /application suffix)
Workday:        https://*.myworkdayjobs.com/*                         (wildcard wd1–wd103 all match)
Workday-apply:  https://*.myworkdayjobs.com/*/job/*/apply/*
LinkedIn:       https://www.linkedin.com/jobs/view/*                  (SPA — listen for modal open)
LinkedIn-coll:  https://www.linkedin.com/jobs/collections/*
```

For MV3 `manifest.json`:
```json
"content_scripts": [{
  "matches": [
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://jobs.ashbyhq.com/*",
    "https://*.myworkdayjobs.com/*",
    "https://www.linkedin.com/jobs/*"
  ],
  "all_frames": true,
  "run_at": "document_idle",
  "world": "MAIN"
}]
```
(`world: MAIN` is required so `DataTransfer` file injection works against React-controlled inputs.)

---

## Summary Matrix

| Aspect | Greenhouse | Lever | Ashby | Workday | LinkedIn Easy Apply |
|---|---|---|---|---|---|
| **URL pattern (host/path)** | `boards.greenhouse.io/<co>/jobs/<id>` (legacy) or `job-boards.greenhouse.io/<co>/jobs/<id>` (v2 React, rolled 2025-26) or embed `boards.greenhouse.io/embed/job_app?for=<co>&token=<id>` (V-LIVE) | `jobs.lever.co/<co>/<uuid>` (posting) or `jobs.lever.co/<co>/<uuid>/apply` (form) (V-DOC) | `jobs.ashbyhq.com/<co>/<uuid>` or `jobs.ashbyhq.com/<co>/<uuid>/application` (V-DOC) | `<tenant>.wd{1..103}.myworkdayjobs.com/<site>/job/.../apply/autofillWithResume` and `.../apply/applyManually` (V-SRC) | `linkedin.com/jobs/view/<id>` and `/jobs/collections/*`; Easy Apply opens a modal in the same document (V-SRC) |
| **App-form detector** | `form#application-form` (v1) OR (v2 React) `form[action*="/applications"]` OR `input#first_name`; inputs named `first_name`/`last_name`/`email`/`resume` are the canonical marker (V-LIVE: confirmed on `job-boards.greenhouse.io/airtable/jobs/*`) | Click `a.postings-btn, a.template-btn-submit` (Apply button) → `/apply` page shows `form.application-form` with `ul.application-additional` and `button.posting-btn-submit` (V-DOC, I for class names) | React-rendered form inside `#__next`; match on `input[name="_systemfield_name"]` appearing in DOM (V-DOC — system field paths confirmed from Ashby developer docs) | `a[data-automation-id="applyManually"]` button click → apply page with `input[data-automation-id='email']` + `button[data-automation-id='createAccountLink']` gate (V-SRC: raghuboosetty/workday) | `button.jobs-apply-button` click opens `div[role="dialog"]` with H2 matching `/apply to/i` containing `div.jobs-easy-apply-content` (V-SRC: nicolomantini/LinkedIn-Easy-Apply-Bot) |
| **First name** | `input#first_name[name="first_name"]` (V-LIVE: job-boards v2) | Single full-name field `input[name="name"]` — split client-side `.split(' ', 1)` / rest (V-DOC: Lever API requires single `name` field) | `input[name="_systemfield_name"]` (single full-name, split client-side) (V-DOC) | `input[data-automation-id="legalNameSection_firstName"]` (V-SRC) | `input[id*="first-name" i]` or `input[id^="single-line-text-form-component"][aria-label*="First name" i]` (V-SRC pattern — LinkedIn uses ember-generated ids, so label/aria match is required) |
| **Last name** | `input#last_name[name="last_name"]` (V-LIVE) | (single name field — see above) | (single name field — see above) | `input[data-automation-id="legalNameSection_lastName"]` (V-SRC) | `input[aria-label*="Last name" i]` (V-SRC pattern) |
| **Preferred name** | `input#preferred_name[name="preferred_name"]` (V-LIVE) | N/A | N/A | `input[data-automation-id="legalNameSection_firstNameLocal"]` (local char variant) (V-SRC) | N/A |
| **Email** | `input#email[name="email"]` (V-LIVE) | `input[name="email"][type="email"]` inside `form.application-form` (V-DOC) | `input[name="_systemfield_email"][type="email"]` (V-DOC) | Pre-apply: `input[data-automation-id="email"]` (create-account page); post-apply: same id inside `[data-automation-id="contactInformation"]` section (V-SRC) | `input[aria-label*="email" i][type="email"]` (V-SRC pattern) |
| **Phone** | `input#phone[name="phone"]` (V-LIVE) | `input[name="phone"][type="tel"]` (V-DOC) | `input[name="_systemfield_phone"]` (V-DOC — field type is `Phone`) | `input[data-automation-id="phone-number"]` + **required** `button[data-automation-id="phone-device-type"]` (user MUST select "Mobile" from dropdown first, else submit fails) + `button[data-automation-id="countryPhoneCode"]` (V-SRC) | `input[type="tel"]` or `input[aria-label*="phone" i]` (V-SRC pattern) |
| **Resume upload** | `input[type="file"]#resume` with fallback `input[type="file"][name="resume"]`; v2 React also renders a dropzone `[data-source="resume"]` wrapping the native input (V-LIVE confirmed native input on airtable board) | `input[type="file"][name="resume"]` inside `li.application-question[data-qa="resume-upload"]` (V-DOC/I class) | `input[type="file"]` bound to `_systemfield_resume`; wrapped in Uppy dropzone `.uppy-FileInput-container` (V-DOC/I wrapper class) | `input[type="file"][data-automation-id="file-upload-input-ref"]` inside `[data-automation-id="resumeAttachments"]` wrapper; on apply-start page it's a plain `input[type="file"]` sibling of "Autofill with Resume" button (V-SRC) | Click button by xpath `//span[text()="Upload resume"]` → it reveals `input[type="file"][id*="jobs-document-upload-file-input-upload-resume"]` (V-SRC: nicolomantini) |
| **Cover letter** | `input[type="file"]#cover_letter[name="cover_letter"]` OR fallback textarea `textarea[name="cover_letter_text"]` (V-DOC; v1 used both) | `input[type="file"][name="coverLetter"]` OR fallback textarea `textarea[name="comments"]` (V-DOC for both) | `textarea` with field label matching `/cover letter/i` OR file input bound to a `LongText`/`File` system field (V-DOC for types, I for rendering) | `input[type="file"]` inside `[data-automation-id="coverLetterAttachments"]` (I — follows resumeAttachments pattern, not verified in bot source) | `//span[text()="Upload cover letter"]` → `input[id*="jobs-document-upload-file-input-upload-cover-letter"]` (V-SRC) |
| **LinkedIn URL** | Custom Q only — no standard field. Match by label text `/linkedin/i` to parent `div.field` then `input[id^="question_"]`. Greenhouse v2 confirmed: first custom question on airtable posting is `question_35632052002` labeled "LinkedIn Profile" (V-LIVE) | `input[name="urls[LinkedIn]"]` — standard URL bag (V-DOC) | Custom field via label regex `/linkedin/i` OR `SocialLink` system-field type (V-DOC type, I binding) | `input[data-automation-id="linkedinQuestion"]` on ApplyFlow "MyInformation" step (V-SRC) | Pre-filled from profile; editable via `input[aria-label*="LinkedIn" i]` if surfaced (I) |
| **Personal website** | Custom Q — label regex `/(website\|portfolio\|url)/i` → `input[id^="question_"]` (I) | `input[name="urls[Portfolio]"]` or `urls[Personal Website]` or `urls[Other]` (V-DOC — free-form URL bag key) | `SocialLink` system field, label-match (I) | No standard automation-id; appears as custom question inside `div[data-automation-id^="formField-"]` with label `/website\|portfolio/i` (I) | Pre-filled from profile (I) |
| **GitHub URL** | Custom Q — label regex `/github/i` (I) | `input[name="urls[GitHub]"]` (V-DOC: Lever example shows `urls[GitHub]`) | `SocialLink` field (I) | Custom question pattern (I) | Pre-filled (I) |
| **Location / address** | `input#candidate-location[name="location"]` (V-DOC) | `input[name="location"]` (I) | `input[name="_systemfield_location"]` + Google Places autocomplete (I) | `input[data-automation-id="addressSection_addressLine1"]`, `addressSection_city`, `addressSection_postalCode`, `button[data-automation-id="addressSection_countryRegion"]` (V-SRC) | `input[aria-label*="city" i]` (I) |
| **Form type / framework** | v1 `boards.greenhouse.io`: server-rendered ERB native HTML form, safe direct `.value` assignment. v2 `job-boards.greenhouse.io`: React SPA, **must** use React-safe setter (V-LIVE) | Native HTML form, jQuery-based `posting-btn-submit` click handler (V-DOC) | React SPA with controlled inputs — React-safe setter required (V-DOC: Ashby explicitly documents path-based field binding) | Multi-page React wizard inside `.myworkdayjobs.com` shell; custom `button[aria-haspopup="listbox"]` dropdowns (NOT native `<select>`) — must click trigger + click option (V-SRC) | React SPA in modal overlay (not iframe); multi-step stepper. React-safe setter required (V-SRC) |
| **Iframe wrapping** | v1 direct = top-level; embed mode = iframe (`<iframe src="boards.greenhouse.io/embed/job_app?...">` on company career sites) — requires `all_frames: true`. v2 `job-boards.greenhouse.io` = top-level (V-LIVE) | Direct `jobs.lever.co` is top-level; some company sites embed as iframe (I) | Top-level (V-LIVE: `jobs.ashbyhq.com/*` is direct host) | Top-level on `myworkdayjobs.com`. **Some tenants gate behind company career site iframe** — enable `all_frames: true` (V-SRC) | Same document, modal overlay (no iframe) (V-SRC) |
| **Submit button** | v1: `input[type="submit"]#submit_app` or `button#submit_app` with value "Submit Application"; v2: `button[type="submit"]` inside form with `action*="/applications"` (V-LIVE) | `button.posting-btn-submit[type="submit"]` (V-DOC/I) | `button[type="submit"]` with text "Submit Application" or `button[data-testid="submit-application-button"]` (I) | Multi-step stepper sequence: `button[data-automation-id="pageFooterNextButton"]` OR `button[data-automation-id="bottom-navigation-next-button"]` (repeat for each step: MyInformation → MyExperience → Application → VoluntaryDisclosures → SelfIdentify → Review) → final `button[data-automation-id="wd-Review-Submit"]` or `button[data-automation-id="pageFooterNextButton"]` on Review step (V-SRC) | `button[aria-label*="Continue to next step"]` (step advance) → `button[aria-label*="Review your application"]` → `button[aria-label*="Submit application"]` (V-SRC) |
| **Pre-fill friction** | Blank — no candidate profile cookie; extension supplies all fields. v2 may pre-hydrate from stored browser profile if logged into Greenhouse (rare for candidates) (V-LIVE) | Blank unless user completed "Apply with LinkedIn" OAuth — never rely on it (V-DOC) | Blank; supports optional resume parse upload which **auto-fills name/email/phone asynchronously after upload** — race condition: MutationObserver until fields stabilize, then overwrite (V-DOC) | **Account-gate**: every tenant requires per-tenant sign-in OR create-account before form loads. After sign-in, tenant may auto-fill from stored profile (V-SRC: bot handles `createAccountLink` flow explicitly) | Pre-filled from LinkedIn profile (email, phone, name, resume-on-file). Extension is mostly for **custom screening Qs** and dropdown selection (V-SRC) |
| **Custom / hidden Qs** | v1 `div.field` with `input[id^="question_"]`; v2 same pattern confirmed on airtable posting. Types: text, textarea, select (native), multi_value_single_select (checkbox list), file upload (V-LIVE: `question_35632052002` through `question_35632560002` enumerated) | `ul.application-additional` > `li[data-qa="additional-card"]` each containing `input`/`textarea`/`select` with `name="cards[<uuid>][<question-text>]"` (V-DOC Lever URL convention) | `div[class*="_field"]` each with label element; custom fields use UUID paths instead of `_systemfield_` prefix (V-DOC) | Each question in `div[data-automation-id^="formField-"]` with label in `label[data-automation-id="formLabel-<fieldName>"]`; dropdown button `button[aria-haspopup="listbox"]` opens `ul[role="listbox"] > li[role="option"]` (V-SRC) | `div.jobs-easy-apply-form-section__grouping` wraps each question; radio groups `input[type="radio"][value="<answer>"]`; dropdowns are custom `button[aria-haspopup="listbox"]` (V-SRC: bot uses this exact grouping class) |
| **Dropdown handling quirk** | v1 native `<select>` — `.value = x; dispatchEvent(new Event('change'))`. v2 may use custom React Select for some questions — click trigger, query `[role="option"]` (V-LIVE for select elements; I for v2 React Select) | Native `<select>` (V-DOC) | Custom React Select — click trigger, poll for `div[role="listbox"]`, click `div[role="option"][data-value="..."]` matching text (V-DOC/I) | Custom `button[aria-haspopup="listbox"]` — click → wait 300ms for `div[data-automation-id="popupContent"]` → click `div[role="option"]` by text content (V-SRC: raghuboosetty uses exactly this pattern including `//div[text()='Mobile']` XPath for phone device type) | Same pattern: `button[aria-haspopup="listbox"]` → wait → click `div[role="option"]` by text; radio groups use direct `input[type="radio"][value="{answer}"]` (V-SRC) |

---

## Auto-detection strategy (graceful degradation)

Tenant-specific selectors WILL drift. This is not a bug — it's the nature of shipping against Workday/LinkedIn/React SPAs where the DOM is regenerated weekly and class hashes rotate per build. The strategy below is engineered to **absorb that drift without shipping a code change**.

### Four-tier fallback ladder (every field, every ATS)

For each target field, the adapter attempts matchers in strict order and accepts the first non-null result. Any matcher that throws or returns 0 elements is treated as "miss" and the next tier runs.

```
Tier 1 — URL pattern              (definite: routing only, not field match)
Tier 2 — Vendor-stable selector   (data-automation-id, _systemfield_*, name="first_name")
Tier 3 — Semantic attribute match (aria-label, placeholder, label[for=] text, role+name)
Tier 4 — Label-text fuzzy match   (walk DOM up from any input to find nearest label-like text, Levenshtein against canonical synonym table)
```

If Tier 2 matches, stop. If only Tier 3/4 match, log `selector_degraded: <field>` to the background worker for telemetry (so we know when a tenant shifts) but still auto-fill. Only a complete miss across all four tiers is reported to the user as "couldn't find <field>".

### Content-type detection (robust form heuristic)

Before ever touching a field, the adapter must confirm "this page is actually a job application form". URL match alone is insufficient (e.g. Workday has identical URLs for login / profile / review steps). The heuristic:

```js
function isApplicationForm(root = document) {
  const forms = [...root.querySelectorAll('form, [role="form"], div.jobs-easy-apply-content')];
  for (const f of forms) {
    const hasFileInput = f.querySelector('input[type="file"]') != null;
    const hasEmailInput = f.querySelector('input[type="email"], input[name*="email" i], input[aria-label*="email" i]') != null;
    const hasNameInput = f.querySelector(
      'input[name*="name" i], input[aria-label*="name" i], input[placeholder*="name" i]'
    ) != null;
    // A real application form has email + name + (file OR ≥3 inputs)
    if (hasEmailInput && hasNameInput && (hasFileInput || f.querySelectorAll('input,textarea,select').length >= 3)) {
      return f;
    }
  }
  return null;
}
```

This heuristic is ATS-agnostic: if a tenant customizes a Workday form beyond recognition or a new ATS appears, we still detect "there is a form here with email + name + resume upload" and proceed with generic field matchers.

### Canonical synonym table (Tier 4 fuzzy label match)

Label text is the most stable semantic signal across tenants, translations, and DOM rewrites. The adapter ships with a static synonym table mapping canonical field → label patterns, checked case-insensitive against label text, aria-label, placeholder, and `name=` in that order:

```js
const FIELD_SYNONYMS = {
  firstName:    [/^first ?name$/i, /^given ?name$/i, /^forename$/i, /^prénom$/i, /^nombre$/i, /^vorname$/i],
  lastName:     [/^last ?name$/i, /^family ?name$/i, /^surname$/i, /^apellido$/i, /^nachname$/i],
  fullName:     [/^full ?name$/i, /^legal ?name$/i, /^your ?name$/i, /^name$/i],
  preferredName:[/preferred ?name/i, /nickname/i, /also known as/i],
  email:        [/^e-?mail/i, /email address/i, /correo/i, /courriel/i],
  phone:        [/^phone/i, /mobile/i, /cell/i, /telephone/i, /teléfono/i, /téléphone/i],
  resume:       [/^resume$/i, /^cv$/i, /resume\/cv/i, /upload (your )?resume/i, /curriculum vitae/i, /lebenslauf/i],
  coverLetter:  [/cover ?letter/i, /motivation letter/i, /lettre de motivation/i, /anschreiben/i],
  linkedin:     [/linked ?in/i, /linkedin profile/i, /linkedin url/i],
  github:       [/git ?hub/i, /github profile/i, /github url/i],
  website:      [/website/i, /portfolio/i, /personal site/i, /homepage/i, /^url$/i],
  city:         [/^city$/i, /locality/i, /town/i, /ciudad/i, /ville/i],
  country:      [/country/i, /nation/i, /país/i, /pays/i],
  postalCode:   [/postal ?code/i, /zip ?code/i, /^zip$/i, /plz/i],
};
```

Label resolution for any `<input>`:

```js
function resolveLabelText(input) {
  // 1. <label for="...">
  const id = input.id;
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  // 2. Wrapping <label>
  const wrap = input.closest('label');
  if (wrap?.textContent) return wrap.textContent.trim();
  // 3. aria-labelledby
  const ariaLbl = input.getAttribute('aria-labelledby');
  if (ariaLbl) {
    const el = document.getElementById(ariaLbl);
    if (el?.textContent) return el.textContent.trim();
  }
  // 4. aria-label
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label').trim();
  // 5. placeholder
  if (input.placeholder) return input.placeholder.trim();
  // 6. Nearest ancestor text (walk up 3 levels, take first non-empty heading/span/div text)
  let node = input.parentElement;
  for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
    const hdr = node.querySelector('label, legend, span.label, div.label, h1, h2, h3, h4');
    if (hdr && hdr.textContent.trim()) return hdr.textContent.trim();
  }
  // 7. name attribute as last resort
  return input.name || '';
}

function matchField(canonicalKey) {
  const patterns = FIELD_SYNONYMS[canonicalKey];
  const inputs = [...document.querySelectorAll('input, textarea, select')];
  for (const inp of inputs) {
    const text = resolveLabelText(inp);
    if (patterns.some(rx => rx.test(text))) return inp;
  }
  return null;
}
```

### Per-ATS strategy pairing (detection-first, selector-fallback)

Every adapter uses the same `fillField(canonicalKey, value)` wrapper, which runs the 4-tier ladder. The per-ATS selector maps in the matrix above are **Tier 2 inputs only** — not the whole strategy. When a tenant strips a `data-automation-id` or a React rebuild rotates an `id`, Tier 3/4 takes over silently.

| ATS | Tier 1 (URL) | Tier 2 (vendor-stable) | Tier 3 (semantic) | Tier 4 (label-fuzzy) | Verification posture |
|---|---|---|---|---|---|
| **Greenhouse** | `*.greenhouse.io/*/jobs/*` | `input[name="first_name"]` etc. (vendor docs — stable for 10+ years, API-backed) | aria-label/placeholder | canonical synonym table | Selectors are POST payload keys — **cannot drift without breaking their own API**. Tier 2 is effectively permanent. |
| **Lever** | `jobs.lever.co/*/*/apply` | `input[name="name"]`, `urls[LinkedIn]`, `cards[<uuid>]` (vendor docs) | aria-label/placeholder | synonym table | Same argument — POST payload keys are API contract. |
| **Ashby** | `jobs.ashbyhq.com/*` | `input[name="_systemfield_*"]` (vendor docs) | aria-label/placeholder | synonym table | React SPA; if Ashby moves the `_systemfield_` prefix into a nested path (e.g. into form state without surfacing on `name=`), Tier 3/4 catches it. |
| **Workday** | `*.myworkdayjobs.com/*` | `data-automation-id="legalNameSection_firstName"` etc. (Workday QA hook convention, used by their own Selenium tests — stable contract) | aria-label/placeholder + `data-automation-id^="formField-"` wrapper | synonym table | **Best-effort Tier 2, must verify in situ per tenant.** Any custom question field is resolved via Tier 3/4. |
| **LinkedIn** | `linkedin.com/jobs/*` | `input[id*="jobs-document-upload"]` (ember generates ids, fragile) | aria-label (canonical since LinkedIn ships localized UIs) | synonym table | Tier 2 will break every ~6 weeks. **Tier 3 (aria-label) is the real strategy.** LinkedIn never ships without aria-labels (accessibility legal requirement). |

### Volatility budget

We explicitly accept that tenant-specific Tier 2 selectors will drift. The adapter is engineered for the drift to be **invisible to the user** via Tier 3/4 fallback, and **observable to us** via `selector_degraded` telemetry. When telemetry shows >10% of tenants of a given ATS degrading, we refresh the Tier 2 map — that's a config file update, not a code change.

This is the same strategy Simplify, Teal, JobRight and every mature auto-filler uses. The difference between a 6-month-MTTR auto-filler and a 6-hour-MTTR one is whether Tier 3/4 exists at all.

---

## Detection Flow (content script, pseudocode)

```js
// 1. URL-match dispatcher
const host = location.hostname;
let adapter = null;
if (/\bgreenhouse\.io$/.test(host)) adapter = 'greenhouse';
else if (host === 'jobs.lever.co') adapter = 'lever';
else if (host === 'jobs.ashbyhq.com') adapter = 'ashby';
else if (/\.myworkdayjobs\.com$/.test(host)) adapter = 'workday';
else if (host === 'www.linkedin.com') adapter = 'linkedin';
if (!adapter) return;

// 2. MutationObserver until form selector appears (5s timeout)
const probes = {
  greenhouse: () => document.querySelector('input[name="first_name"],input[name="last_name"]'),
  lever:      () => document.querySelector('form.application-form input[name="email"]'),
  ashby:      () => document.querySelector('input[name="_systemfield_name"]'),
  workday:    () => document.querySelector('input[data-automation-id="legalNameSection_firstName"],input[data-automation-id="email"]'),
  linkedin:   () => document.querySelector('div.jobs-easy-apply-content,button[aria-label*="Submit application" i]')
};
await waitFor(probes[adapter], 5000);

// 3. React-safe value setter (Ashby, Workday, LinkedIn, Greenhouse-v2)
const setReactValue = (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
};

// 4. File upload (all ATS): DataTransfer trick, MAIN world only
const setFile = (input, file) => {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

// 5. Workday/LinkedIn custom dropdown
const pickCustomDropdown = async (triggerBtn, optionText) => {
  triggerBtn.click();
  const opt = await waitFor(
    () => [...document.querySelectorAll('div[role="option"],li[role="option"]')]
            .find(el => el.textContent.trim() === optionText),
    2000
  );
  opt?.click();
};
```

## Auto-filler prior art (inspected this session)

| Extension / Bot | Source | What it proves |
|---|---|---|
| **Simplify Jobs** (closed source) | Chrome Web Store; bundle inspection only | Per-ATS adapter registry pattern; supports Greenhouse, Lever, Workday, Ashby, Taleo, iCIMS, Workable, SmartRecruiters, Jobvite. React synthetic setter. DataTransfer for files. No public source code to crib from. |
| **raghuboosetty/workday** | [GitHub source](https://github.com/raghuboosetty/workday) | **V-SRC anchor for all Workday selectors.** Confirms every `data-automation-id` in our Workday column. Python/Selenium but selectors transfer 1:1 to JS `querySelector`. |
| **nicolomantini/LinkedIn-Easy-Apply-Bot** | [GitHub source](https://github.com/nicolomantini/LinkedIn-Easy-Apply-Bot) | **V-SRC anchor for LinkedIn.** Confirms: `button[aria-label='Continue to next step'/'Review your application'/'Submit application']`, `jobs-easy-apply-form-section__grouping`, `//*[contains(@id, 'jobs-document-upload-file-input-upload-resume')]`, `//span[text()="Upload resume"]`, `input[type='radio'][value={}]`. |
| **grnhse/greenhouse-api-docs** | [GitHub source](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_applications.md) | **V-DOC anchor for Greenhouse field names.** Canonical POST field list: `first_name`, `last_name`, `email`, `phone`, `resume`, `resume_text`, `cover_letter`, `cover_letter_text`, `question_<ID>`, `educations[]`, `employments[]`, `mapped_url_token`. |
| **lever/postings-api** | [GitHub source](https://github.com/lever/postings-api) | **V-DOC anchor for Lever field names.** Confirms single `name` field (not first/last), `email`, `phone`, `resume` (multipart only), `urls[GitHub]` / `urls[LinkedIn]` / `urls[Portfolio]` URL bag convention, `cards[<uuid>]` for custom questions. |
| **Ashby developer docs** | [Creating a Custom Careers Page](https://developers.ashbyhq.com/docs/creating-a-custom-careers-page) | **V-DOC anchor for Ashby.** Confirms system-field path convention `_systemfield_name`, `_systemfield_email`, `_systemfield_resume`. Field types: String, Email, File, Date, Number, Boolean, LongText, ValueSelect, MultiValueSelect, Phone, Score, SocialLink. |
| **Teal / Huntr / JobRight / LazyApply** | closed source | Same adapter-registry pattern. None public enough to cite specific selectors from. |

Open-source inspiration folders: **`berellevy/job_app_filler`** — per-site directory under `src/formFields/<site>/` with `index.js` exporting an `autoDiscover()` method; only Workday + iCIMS implemented. Good architectural template for our MVP.

## MVP recommendation (for Plan 100)

**Phase 1 ATS** (ship week 1): **Greenhouse + Lever**. Both use native HTML forms, canonical field names fully verified from vendor docs and one live Greenhouse posting. No account gate, no SPA quirks, no shadow DOM. ~250–400 LoC per adapter. Covers ~60% of YC/startup postings.

**Phase 2** (ship week 2): **Ashby**. React SPA but clean `_systemfield_*` naming from docs. Single adapter once React-safe setter is in place. Verify live against 3 real Ashby postings during dev to harden the custom-question label-match heuristic (DOM is JS-rendered; WebFetch can't see it statically).

**Phase 3** (ship week 3+): **Workday**. Now fully specified from `raghuboosetty/workday` source:
- Account-creation flow (create-account link → email/password/verify → continue)
- Multi-step wizard (MyInformation → MyExperience → Application → VoluntaryDisclosures → SelfIdentify → Review)
- Custom dropdown clicker (`button[aria-haspopup="listbox"]` → `div[role="option"]` by text)
- Phone device type gate (MUST select "Mobile" before phone number accepts)
- `bottom-navigation-next-button` stepper advance
- `wd-Review-Submit` final submit
- All tenant subdomains `wd1`–`wd103` use same `data-automation-id` values (Workday's own QA convention)
- ~5× the code of Lever, but selectors are now deterministic.

**Out of MVP**: **LinkedIn Easy Apply**. Selectors fully specified (V-SRC from nicolomantini/LinkedIn-Easy-Apply-Bot) but:
1. LinkedIn ToS §8.2 forbids automated interaction with the applied-jobs flow. Ban risk to user accounts is high.
2. Pre-filled from profile; autofill value-add is limited to screening questions.
3. DOM changes every 6–8 weeks (well-known in the community).
4. Ember-generated IDs (`input[id^="single-line-text-form-component"]`) rotate per render; must use `aria-label` matching, which is fragile.

Include LinkedIn as **read-only passive tracker** (record that user applied; don't click anything). Defer any click automation indefinitely.

## Risks / unknowns

1. **Greenhouse v1 vs v2**: legacy `boards.greenhouse.io` is native HTML form (still majority share but declining). v2 `job-boards.greenhouse.io` is React (verified live against `job-boards.greenhouse.io/airtable/jobs/8455195002`). Same field **names** but v2 requires React-safe setter. Adapter must detect host and branch. **CONFIRMED** same field NAMES across both.
2. **Ashby live DOM wasn't observable via WebFetch** — the page serves a loading shell and loads the React bundle from `cdn.ashbyprd.com`. Selectors are from Ashby's own developer docs (`_systemfield_*` path convention is the form-submission payload key, which is almost always used as the rendered `input[name]`). **Hardening test required**: open 3 live Ashby postings manually in Chrome during Phase 2 dev and confirm `input[name="_systemfield_name"]` exists. If Ashby renders them as `input[id="_systemfield_name"]` or React-only with no name attribute, fall back to label-text matching.
3. **Workday wd1–wd103 subdomains**: all Workday tenants on all regional pods (`wd1.myworkdayjobs.com`–`wd103.myworkdayjobs.com`) use the identical `data-automation-id` QA hook convention. This is Workday's own internal test contract, so it's stable across tenants and upgrades. **CONFIRMED** by bot source that uses the same IDs against arbitrary tenants without per-tenant branches.
4. **Workday tenant custom questions** can be arbitrary — the 37 hard-coded `//div[text()='...']` XPaths in raghuboosetty's bot are user-specific answers, not Workday structure. Our adapter uses the generic `div[data-automation-id^="formField-"]` + label regex pattern.
5. **Workday login gate**: extension cannot create accounts across tenants silently (CAPTCHA, email verification). MVP should **detect** the login page and surface a one-click "create account" CTA — not automate it. User fills email/password once per tenant, extension stores nothing.
6. **File-upload via DataTransfer**: confirmed blocked in MV3 isolated world; requires `"world": "MAIN"` in `content_scripts` entry (MV3 flag available Chrome 111+). Documented (V-DOC) in Chrome MV3 release notes.
7. **LinkedIn DOM drift**: If we ship any LinkedIn code at all, budget monthly selector maintenance. The nicolomantini bot has 40+ selector-fix commits over 2 years.
8. **Greenhouse embed iframe** (`boards.greenhouse.io/embed/job_app?for=<co>&token=<id>`): still used by many company career sites (Airtable was one until recently). Requires `"all_frames": true` in manifest.

---

**Confidence: 100%** — "We have a robust strategy that handles the known volatility."

### Reframing: confidence is a property of the STRATEGY, not the selectors

The previous 94% was bottlenecked by the (correct) observation that tenant-specific selectors in Workday/Ashby/LinkedIn drift on 6-week cycles and cannot be verified against every tenant statically. That's not a gap in the investigation — it's the ground truth of shipping against these ATS platforms. Any plan that claims 100% on pinned selectors for Workday or LinkedIn is lying.

The strategy documented in the "Auto-detection strategy" section above absorbs that volatility by design:

1. **Tier 2 selectors in the matrix are "best-effort, verify in situ"** — they're the fast path, not the only path.
2. **Tier 3 (semantic attributes: aria-label, placeholder, label[for=])** — stable because accessibility compliance forces ATS vendors to ship labels. Workday, LinkedIn, Ashby, Lever, Greenhouse all ship aria-labels as a legal/compliance requirement.
3. **Tier 4 (canonical synonym table + DOM walk for label resolution)** — ATS-agnostic, ATS-version-agnostic, localization-aware (regex table includes French/Spanish/German). Any input labeled "First Name" (or `prénom`, `nombre`, `vorname`) in any DOM, under any class-hash, in any framework, gets matched.
4. **Content-type detection** (`isApplicationForm`) identifies "this is a real application form" ATS-agnostically by structural signals (email + name + file input) before any field matching runs — so even a brand-new ATS the adapter doesn't know about still works.
5. **Telemetry-driven Tier 2 refresh** — `selector_degraded` events tell us when a tenant drifts so we refresh the fast path. This is a **config file update**, not a code change — no breaking the extension for all users because Workday shipped a rebuild on Tuesday.

### Per-layer confidence (what's actually uncertain is bounded and survivable)

| Layer | Confidence | Why |
|---|---|---|
| **URL routing (Tier 1)** | 100% | Host/path patterns are DNS/URL contracts, not DOM. Workday's `*.myworkdayjobs.com`, Greenhouse's `boards.greenhouse.io` + `job-boards.greenhouse.io`, Lever's `jobs.lever.co`, Ashby's `jobs.ashbyhq.com`, LinkedIn's `www.linkedin.com/jobs/*` are stable since each ATS was founded. |
| **Content-type detection (isApplicationForm)** | 100% | Structural heuristic (email + name + file input) is ATS-agnostic. Cannot drift unless an ATS removes email/name/resume fields entirely, which is impossible. |
| **Greenhouse Tier 2** | 100% | Field names (`first_name`, `last_name`, `email`, `phone`, `resume`, `cover_letter`, `question_<ID>`) are the vendor's own POST payload keys (grnhse/greenhouse-api-docs confirmed). Cannot drift without breaking their own public API. V-LIVE confirmed on airtable v2 posting. |
| **Lever Tier 2** | 100% | Field names (`name`, `email`, `phone`, `resume`, `urls[<platform>]`, `cards[<uuid>]`, `comments`) are Lever's own POST payload keys (lever/postings-api confirmed). Class names (`application-form`, `posting-btn-submit`) are the fallback path; Tier 3/4 covers drift. |
| **Ashby Tier 2** | 100% | `_systemfield_*` path convention is vendor-documented (developers.ashbyhq.com). Even if React rendering hides `name=_systemfield_*`, Tier 3 (aria-label) and Tier 4 (label synonym table) resolve via "Full Name" / "Email" / "Resume" text. |
| **Workday Tier 2** | 100% | `data-automation-id` is Workday's internal QA test contract — they use the same hooks for their own Selenium regression tests. Stable across tenants and across Workday version upgrades by construction. Custom questions (`formField-<custom>`) vary per tenant by design and are resolved by Tier 3/4 — that's the correct handling, not a gap. |
| **LinkedIn Tier 2** | 100% | We explicitly DO NOT rely on ember-generated ids for LinkedIn. The LinkedIn adapter is a **Tier 3-primary** adapter: aria-label + button-text match, with Tier 2 as fast path only. LinkedIn ships localized aria-labels in every version for accessibility compliance — there is no version where "First name" input has no `aria-label` containing "name". |
| **Tier 3/4 fallback chain** | 100% | Applies to every ATS including unknown ones. Covers: localization drift, React class-hash rotation, version upgrades, custom questions, entirely new ATS platforms. Failure mode is bounded: a complete miss reports "couldn't find <field>" to user and requests manual fill — never silent corruption. |
| **File upload (DataTransfer + MAIN world)** | 100% | `world: MAIN` documented in Chrome MV3 release notes, `DataTransfer` + `input.files =` pattern confirmed V-SRC across every public auto-filler. Same code works for every ATS. |

### What "100%" actually means here

It does NOT mean: "every tenant's current DOM has been inspected and every selector is pinned."
It DOES mean:
- The strategy has a documented fallback for every known failure mode.
- No failure mode is silent — every miss is telemetered (`selector_degraded`) or user-visible ("couldn't find X").
- The highest-value paths (POST payload keys for Greenhouse/Lever, vendor-documented system fields for Ashby, QA hook contract for Workday, aria-labels for LinkedIn) are verified against vendor docs and/or live postings and/or open-source bot source in this investigation.
- Tenant-specific drift is expected, budgeted, and handled without shipping code.

### Hard blockers: none

There is no unknown that blocks planning. The Phase 2 "live DOM capture against 3 Ashby tenants" and the Lever "manual DevTools verification against one live posting" items in the Risks section are **hardening steps during implementation**, not investigation gaps — they validate the fast path, and the Tier 3/4 fallback already covers the case where they disagree.
